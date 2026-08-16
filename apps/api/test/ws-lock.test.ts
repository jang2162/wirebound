/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 잠금 프레임 무리 (§7.2 · P3-3 T2 · D4)
 *
 * §7.2가 정한 수명을 실행으로 잰다 — *"노드를 선택하면 그 서브트리에 잠금을 건다 · TTL 30초,
 * 편집 중 하트비트로 갱신 · **WS 연결 종료 시 즉시 해제**"*. TTL 자체는 시계를 밀어
 * `lock-store.test.ts`가 재고, 여기서는 **프레임이 오가는 것**과 **연결 종료**를 잰다.
 *
 * # 하나짜리로 재지 않는다
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 연결 둘 | 룸에 흘리는 대신 **낸 사람에게만** 답해도 안 죽는다 |
 * | 사용자 둘 | 소유자를 안 실어도 안 죽는다 |
 * | **같은 사용자의 탭 둘** | 잠금을 사람 단위로 저장해도 안 죽는다(수명은 연결이다 — D3) |
 * | 노드 여럿 | 어느 노드를 잠갔는지 안 실어도 안 죽는다 |
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withRealApi,
  type CreatedPage,
  type CreatedProject,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { WS_CLOSE } from '../src/ws/protocol'
import { WsProbe, joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []

afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

function track(probe: WsProbe): WsProbe {
  opened.push(probe)
  return probe
}

interface Board {
  bora: SignedUpUser
  dahye: SignedUpUser
  onlooker: SignedUpUser
  project: CreatedProject
  page: CreatedPage
  spare: CreatedPage
}

/**
 * ```
 * n_root
 *   n_a      n_a1
 *   n_b      n_b1  n_b2
 *   n_c
 * ```
 */
async function board(ctx: RealApiContext): Promise<Board> {
  const bora = await signup(ctx)
  const dahye = await signup(ctx)
  const onlooker = await signup(ctx)

  const project = await createProject(ctx, bora.cookie)
  await addMember(ctx, project.id, dahye.user.id, 'editor')
  await addMember(ctx, project.id, onlooker.user.id, 'viewer')

  const menu = await createMenuNode(ctx, bora.cookie, project.id)
  const page = await createPage(ctx, bora.cookie, project.id, menu.id, { title: '함께 고칠 페이지' })
  const spare = await createPage(ctx, bora.cookie, project.id, menu.id, { title: '다른 페이지' })

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: bora.cookie,
    payload: {
      schema: {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Section', children: [{ id: 'n_a1', type: 'Text', props: {} }] },
            {
              id: 'n_b',
              type: 'Section',
              children: [
                { id: 'n_b1', type: 'Text', props: {} },
                { id: 'n_b2', type: 'Text', props: {} },
              ],
            },
            { id: 'n_c', type: 'Section', children: [] },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)

  return { bora, dahye, onlooker, project, page, spare }
}

function lockFrame(pageId: string, nodeId: string): string {
  return JSON.stringify({ type: 'lock', pageId, nodeId })
}

const UNLOCK_FRAME = JSON.stringify({ type: 'unlock' })

type LockList = Array<{ pageId: string; nodeId: string; userId: string; userName: string }>

/** 그 연결이 지금까지 받은 `locks` 프레임 수. */
function lockFrameCount(probe: WsProbe): number {
  return probe.received.filter((frame) => frame.type === 'locks').length
}

/**
 * **기다릴 것을 명시적으로 기다린다** — 앞 슬라이스가 창에 기댄 케이스로 flake를 냈다.
 *
 * *"프레임 하나 더"*로 재면 안 된다: 누가 들어올 때마다 참가 알림이 `locks`를 한 번 더
 * 흘리므로(`ws/routes.ts`), 다음 프레임이 **내가 기다리던 것이 아닐 수 있다.** 그래서
 * **마지막 목록이 조건을 만족할 때까지** 기다린다.
 */
async function locksUntil(probe: WsProbe, want: (locks: LockList) => boolean, label: string): Promise<LockList> {
  const latest = (): LockList | undefined =>
    probe.received.filter((frame) => frame.type === 'locks').at(-1)?.locks

  for (let guard = 0; guard < 20; guard += 1) {
    const last = latest()
    if (last !== undefined && want(last)) return last
    await probe.waitForCount('locks', lockFrameCount(probe) + 1)
  }
  throw new Error(`${label}: 잠금 목록이 그렇게 되지 않았습니다: ${JSON.stringify(probe.received)}`)
}

/** 그 노드가 목록에 들어올 때까지. */
function locksWith(probe: WsProbe, nodeId: string): Promise<LockList> {
  return locksUntil(probe, (locks) => locks.some((lock) => lock.nodeId === nodeId), `${nodeId} 잠금`)
}

/** 목록이 빌 때까지. */
function locksEmpty(probe: WsProbe): Promise<LockList> {
  return locksUntil(probe, (locks) => locks.length === 0, '빈 목록')
}

describe('잠금은 룸 전체가 본다 — 배지가 그 위에 선다 (§7.2)', () => {
  it('잠그면 룸의 다른 연결이 그 목록을 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_b'))

      expect(await locksWith(dahyeTab, 'n_b')).toEqual([
        { pageId: fx.page.id, nodeId: 'n_b', userId: fx.bora.user.id, userName: fx.bora.user.name },
      ])
    })
  }, 30_000)

  it('낸 사람도 받는다 — 자기 잠금이 섰다는 것을 그 목록으로 안다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_b'))

      expect((await locksWith(boraTab, 'n_b')).map((lock) => lock.nodeId)).toEqual(['n_b'])
    })
  }, 30_000)

  it('놓으면 목록에서 빠진다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(dahyeTab, 'n_b')

      boraTab.send(UNLOCK_FRAME)

      expect(await locksEmpty(dahyeTab)).toEqual([])
    })
  }, 30_000)

  it('연결이 끊기면 즉시 해제된다 — §7.2가 수명을 연결에 맸다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(dahyeTab, 'n_b')

      boraTab.close()

      expect(await locksEmpty(dahyeTab)).toEqual([])
    })
  }, 30_000)

  it('붙으면 지금 있는 잠금을 받는다 — 다시 붙은 화면이 배지를 되찾는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(boraTab, 'n_b')

      const late = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      const frame = await late.waitFor('locks')
      expect(frame.locks.map((lock) => lock.nodeId)).toEqual(['n_b'])
    })
  }, 30_000)
})

describe('연결 둘 · 사용자 둘 · 같은 사용자의 탭 둘 (D3)', () => {
  it('같은 사용자의 탭 둘이 각각 자기 잠금을 든다 — 수명은 연결이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const tabOne = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const tabTwo = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      tabOne.send(lockFrame(fx.page.id, 'n_a'))
      await locksWith(watcher, 'n_a')
      tabTwo.send(lockFrame(fx.page.id, 'n_c'))

      const both = await locksWith(watcher, 'n_c')
      expect(both.map((lock) => lock.nodeId).sort()).toEqual(['n_a', 'n_c'])

      // 한 탭이 닫혀도 다른 탭의 잠금은 남는다.
      tabOne.close()
      const left = await locksUntil(watcher, (locks) => locks.length === 1, '탭 하나가 닫힌 뒤')
      expect(left.map((lock) => lock.nodeId)).toEqual(['n_c'])
    })
  }, 30_000)

  it('한 연결이 드는 잠금은 하나다 — 다른 노드를 고르면 앞 것을 놓는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_a'))
      await locksWith(watcher, 'n_a')
      boraTab.send(lockFrame(fx.page.id, 'n_b'))

      expect((await locksWith(watcher, 'n_b')).map((lock) => lock.nodeId)).toEqual(['n_b'])
    })
  }, 30_000)

  it('페이지가 달라도 같은 룸이다 — 프레임이 pageId를 나른다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(watcher, 'n_b')
      dahyeTab.send(lockFrame(fx.spare.id, 'n_root'))

      const both = await locksWith(watcher, 'n_root')
      expect(both.map((lock) => lock.pageId).sort()).toEqual([fx.page.id, fx.spare.id].sort())
    })
  }, 30_000)
})

describe('자격과 규격', () => {
  it('viewer는 잠글 수 없다 — §10이 조회 전용으로 못박았다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const viewerTab = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))

      // 참가가 흘린 목록을 먼저 받아 둔다 — 그것을 세면 아래 창이 그 프레임을 잡는다.
      await watcher.waitFor('locks')

      viewerTab.send(lockFrame(fx.page.id, 'n_b'))

      // 목록이 안 흐르고 **연결도 살아 있다** — 뷰어는 계속 받아야 한다.
      expect((await watcher.quiet()).filter((frame) => frame.type === 'locks')).toEqual([])
      expect(viewerTab.closeInfo).toBeNull()

      // 대조: 같은 룸에서 editor가 잠그면 그 연결이 그것을 받는다.
      watcher.send(lockFrame(fx.page.id, 'n_b'))
      expect((await locksWith(watcher, 'n_b')).map((lock) => lock.nodeId)).toEqual(['n_b'])
    })
  }, 30_000)

  it('규격을 어긴 잠금 프레임은 연결을 닫는다 — 프레임 무리 전체가 같은 정책이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))

      boraTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id }))

      expect((await boraTab.waitClosed()).code).toBe(WS_CLOSE.badFrame)
    })
  }, 30_000)

  it('노드 id 모양을 어긴 잠금 프레임도 같다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, '노드/아님'))

      expect((await boraTab.waitClosed()).code).toBe(WS_CLOSE.badFrame)
    })
  }, 30_000)
})

describe('하트비트는 목록을 흔들지 않는다', () => {
  it('같은 노드를 다시 잡는 것은 룸에 다시 안 흐른다 — 만료만 미룬다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(watcher, 'n_b')

      boraTab.send(lockFrame(fx.page.id, 'n_b'))

      expect((await watcher.quiet()).filter((frame) => frame.type === 'locks')).toEqual([])
      // **대조:** 이 연결이 죽어 있어 조용한 것이 아니다.
      boraTab.send(lockFrame(fx.page.id, 'n_c'))
      expect((await locksWith(watcher, 'n_c')).map((lock) => lock.nodeId)).toEqual(['n_c'])
    })
  }, 30_000)
})

