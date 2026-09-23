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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { hashSessionToken } from '../src/auth/session'
import { LOCK_TTL_MS, createLockStore } from '../src/lock/store'
import { createBroadcaster } from '../src/ws/broadcast'
import { WS_CLOSE, type ServerFrame } from '../src/ws/protocol'
import { InMemoryRoomRegistry } from '../src/ws/rooms'
import { WsProbe, joinRoom, locksEmpty, locksUntil, locksWith } from './ws-client'

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
      // **남은 목록을 흘려보낸다.** 목록은 보내는 순간 짓는다(`ws/broadcast.ts`) — 참가 알림이 늦게 닿으면 그것도 `n_b`를 실어
      // 위 줄이 거기서 풀리고, 잠금의 알림은 아직 오는 중일 수 있다.
      await watcher.quiet()

      boraTab.send(lockFrame(fx.page.id, 'n_b'))

      expect((await watcher.quiet()).filter((frame) => frame.type === 'locks')).toEqual([])
      // **대조:** 이 연결이 죽어 있어 조용한 것이 아니다.
      boraTab.send(lockFrame(fx.page.id, 'n_c'))
      expect((await locksWith(watcher, 'n_c')).map((lock) => lock.nodeId)).toEqual(['n_c'])
    })
  }, 30_000)
})


/**
 * **서버가 획득을 거절한다**(이월 5차 2회 LK — `ws/lock.ts`의 표). 판정은 §7.2의 «선택 = 서브트리 claim» 그대로이고 화면의 1차
 * 방어와 같은 함수다(`lock/check.ts`의 `selectionVerdict`).
 */
describe('획득 거절 (이월 5차 2회 LK)', () => {
  const denials = (probe: WsProbe): ServerFrame[] => probe.received.filter((frame) => frame.type === 'lock-denied')
  const held = (ctx: RealApiContext, projectId: string): string[] =>
    ctx.app.realtime.locks
      .liveIn(projectId)
      .map((lock) => `${lock.userName}:${lock.nodeId}`)
      .sort()

  /**
   * 혼자 죽는 변조: 거절을 룸 전체에 보낸다(«누구에게»). 획득 판정이 늘 `free`(앞 판 — 거절하지 않는다)인 변조에는 이 파일의 거절
   * 케이스가 함께 죽는다.
   */
  it('남이 쥔 자리의 `lock`은 받지 않는다 — 낸 연결에만 `lock-denied`, 목록은 쥔 사람 것 그대로', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(dahyeTab, 'n_b')

      dahyeTab.send(lockFrame(fx.page.id, 'n_b'))

      expect(await dahyeTab.waitFor('lock-denied')).toEqual({
        type: 'lock-denied',
        projectId: fx.project.id,
        pageId: fx.page.id,
        nodeId: 'n_b',
      })
      await watcher.quiet()
      expect(denials(boraTab)).toEqual([])
      expect(denials(watcher)).toEqual([])
      expect(held(ctx, fx.project.id)).toEqual([`${fx.bora.user.name}:n_b`])
    })
  }, 30_000)

  /** 혼자 죽는 변조: 판정이 서브트리가 아니라 노드 id 같음이다. */
  it('겹치는 서브트리도 거절한다 — 쥔 것의 자손 · 조상 둘 다. 형제는 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(dahyeTab, 'n_b')

      // 쥔 것의 자손
      dahyeTab.send(lockFrame(fx.page.id, 'n_b1'))
      expect((await dahyeTab.waitForCount('lock-denied', 1)).map((frame) => frame.nodeId)).toEqual(['n_b1'])

      // 쥔 것의 조상(루트)
      dahyeTab.send(lockFrame(fx.page.id, 'n_root'))
      expect((await dahyeTab.waitForCount('lock-denied', 2)).map((frame) => frame.nodeId)).toEqual(['n_b1', 'n_root'])

      // 형제 — 겹치지 않는다
      dahyeTab.send(lockFrame(fx.page.id, 'n_a'))
      await locksWith(boraTab, 'n_a')
      expect(held(ctx, fx.project.id)).toEqual([`${fx.bora.user.name}:n_b`, `${fx.dahye.user.name}:n_a`].sort())
      expect(denials(dahyeTab)).toHaveLength(2)
    })
  }, 30_000)

  /**
   * 혼자 죽는 변조: 획득 판정이 같은 사람의 **다른 자리**도 막는다(소유자를 연결처럼 본다 — 자기가 쥔 같은 자리만 뺀다). 같은 사람을
   * 통째로 막는 변조는 하트비트 케이스(«같은 노드를 다시 잡는 것은…»)와 함께 죽는다 — 같은 연결의 다시 보냄은 그 케이스가 소유한다.
   */
  it('같은 사람의 다른 탭은 막지 않는다 (D3) — 겹치는 자리를 둘 다 쥔다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const tabOne = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const tabTwo = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      tabOne.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(watcher, 'n_b')

      tabTwo.send(lockFrame(fx.page.id, 'n_b1'))

      const both = await locksWith(watcher, 'n_b1')
      expect(both.map((lock) => lock.nodeId).sort()).toEqual(['n_b', 'n_b1'])
      expect(denials(tabTwo)).toEqual([])
    })
  }, 30_000)

  /** 혼자 죽는 변조: 거절이 이 연결이 앞서 쥔 것을 안 놓는다. */
  it('거절된 연결은 앞서 쥔 것도 놓는다 — 새 자리를 달라는 것이 앞 자리를 놓는 것이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      boraTab.send(lockFrame(fx.page.id, 'n_a'))
      dahyeTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksUntil(watcher, (locks) => locks.length === 2, '둘 다 쥠')

      // 같은 노드로 잰다 — 서브트리 축은 위 «겹치는 서브트리» 케이스가 소유한다.
      boraTab.send(lockFrame(fx.page.id, 'n_b'))

      await boraTab.waitFor('lock-denied')
      const left = await locksUntil(watcher, (locks) => locks.length === 1, '보라가 놓은 뒤')
      expect(left.map((lock) => `${lock.userName}:${lock.nodeId}`)).toEqual([`${fx.dahye.user.name}:n_b`])
    })
  }, 30_000)

  /** TTL 축의 주인은 `lock-store.test.ts`다 — 이 케이스는 그 만료를 획득 판정이 따르는지(늘 그 파일과 함께 죽는다). */
  it('TTL 을 넘긴 남의 잠금은 막지 않는다', async () => {
    // 잠금 저장소는 만들 때 `Date.now`를 붙잡는다(`createLockStore`의 기본 인자) — 앱을 짓기 **전에** 갈아 둔다.
    const realNow = Date.now.bind(Date)
    let skew = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
    try {
      await ttlCase(() => (skew = LOCK_TTL_MS + 1))
    } finally {
      clock.mockRestore()
    }
  }, 30_000)

  async function ttlCase(expire: () => void): Promise<void> {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(dahyeTab, 'n_b')

      expire()
      dahyeTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksUntil(boraTab, (locks) => locks.length === 1 && locks[0]?.userId === fx.dahye.user.id, '다혜가 쥠')
      expect(denials(dahyeTab)).toEqual([])
    })
  }

  /**
   * **뒤에 온 것이 이긴다**(`ws/lock.ts`). 한 연결의 앞 프레임을 자격 확인의 문 앞에 세워 두고 뒤 프레임을 먼저 끝낸다.
   * 혼자 죽는 변조 둘: `lock`이 끝날 때 차례를 안 본다 · `unlock`이 차례를 안 본다.
   */
  it('한 연결의 `lock`·`unlock`은 받은 순서가 이긴다 — 늦게 끝난 앞 프레임은 아무것도 안 한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const { broadcast, locks } = ctx.app.realtime
      const real = broadcast.stillAllowed
      let gate: { entered: () => void; opened: Promise<void> } | null = null
      broadcast.stillAllowed = async (connection, minRole) => {
        const allowed = await real(connection, minRole)
        const armed = gate
        if (armed !== null && connection.userId === fx.bora.user.id && minRole === 'editor') {
          gate = null
          armed.entered()
          await armed.opened
        }
        return allowed
      }
      const arm = (): { entered: Promise<void>; open: () => void } => {
        let entered = (): void => {}
        let open = (): void => {}
        const enteredP = new Promise<void>((resolve) => (entered = resolve))
        const opened = new Promise<void>((resolve) => (open = resolve))
        gate = { entered, opened }
        return { entered: enteredP, open }
      }

      // `lock` 이 문 앞에 서 있는 동안 `unlock` 이 끝난다 → 문을 열어도 잡지 않는다.
      const first = arm()
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await first.entered
      boraTab.send(UNLOCK_FRAME)
      await watcher.quiet()
      first.open()
      await watcher.quiet()
      expect(locks.liveIn(fx.project.id)).toEqual([])

      // `unlock` 이 문 앞에 서 있는 동안 `lock` 이 선다 → 문을 열어도 놓지 않는다.
      const second = arm()
      boraTab.send(UNLOCK_FRAME)
      await second.entered
      boraTab.send(lockFrame(fx.page.id, 'n_c'))
      await locksWith(watcher, 'n_c')
      second.open()
      await watcher.quiet()
      expect(locks.liveIn(fx.project.id).map((lock) => lock.nodeId)).toEqual(['n_c'])
    })
  }, 30_000)

  /**
   * **판정과 잡기는 같은 틱이다**(`ws/lock.ts`). 셋째 사람의 잠금을 같은 페이지에 두어 두 요청이 모두 문서를 읽게 하고, 둘을 문
   * 앞에 세웠다가 함께 연다. 혼자 죽는 변조: 문서를 읽고 판정한 뒤 잡기 전에 await 가 하나 더 있다.
   */
  it('두 사람이 같은 자리를 함께 요청해도 하나만 선다 — 다른 쪽은 거절된다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const third = await signup(ctx)
      await addMember(ctx, fx.project.id, third.user.id, 'editor')
      const thirdTab = track(await joinRoom(ctx.port, fx.project.id, third.cookie.wb_session))
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      thirdTab.send(lockFrame(fx.page.id, 'n_c'))
      await locksWith(boraTab, 'n_c')

      const { broadcast } = ctx.app.realtime
      const real = broadcast.stillAllowed
      const racers = new Set([fx.bora.user.id, fx.dahye.user.id])
      let arrived = 0
      let release = (): void => {}
      const opened = new Promise<void>((resolve) => (release = resolve))
      broadcast.stillAllowed = async (connection, minRole) => {
        const allowed = await real(connection, minRole)
        if (minRole === 'editor' && racers.delete(connection.userId)) {
          arrived += 1
          if (arrived === 2) release()
          await opened
        }
        return allowed
      }

      // 같은 노드로 잰다 — 서브트리 축은 위 «겹치는 서브트리» 케이스가 소유한다.
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      dahyeTab.send(lockFrame(fx.page.id, 'n_b'))
      await opened
      await thirdTab.quiet()

      const onB = ctx.app.realtime.locks.liveIn(fx.project.id).filter((lock) => lock.nodeId !== 'n_c')
      expect(onB).toHaveLength(1)
      // 진 쪽은 거절을 받았다. (누구에게 가는지는 위 «남이 쥔 자리» 케이스가 소유한다 — 여기서는 진 쪽만 본다.)
      const loser = onB[0]?.userId === fx.bora.user.id ? dahyeTab : boraTab
      expect(denials(loser).map((frame) => frame.type === 'lock-denied' && frame.nodeId)).toEqual(['n_b'])
    })
  }, 30_000)
})

/**
 * **잠금 목록은 보내는 순간 짓는다**(`ws/broadcast.ts`의 `announceLocks` — C 리뷰 2 N4). 알림을 부른 뒤 첫 연결의 자격을 보는
 * 사이에 잠금이 바뀌면, 그 연결이 받는 목록은 바뀐 것이어야 한다 — 앞 판은 부른 순간의 목록을 실어 보냈고, 그것이 뒤 알림을
 * 추월하면 낡은 목록이 마지막 프레임으로 남았다. 혼자 죽는 변조: 목록을 부를 때 한 번 짓는다(앞 판).
 */
describe('잠금 목록은 보내는 순간 짓는다', () => {
  it('알림이 자격을 보는 사이 선 잠금이 그 알림에 실린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const rooms = new InMemoryRoomRegistry()
      const store = createLockStore()
      const received: string[][] = []
      rooms.join({
        id: 'c-watch',
        projectId: fx.project.id,
        userId: fx.bora.user.id,
        userName: fx.bora.user.name,
        sessionId: hashSessionToken(fx.bora.cookie.wb_session),
        membershipEpoch: 0,
        send: (payload) => {
          const frame = JSON.parse(payload) as ServerFrame
          if (frame.type === 'locks') received.push(frame.locks.map((lock) => lock.nodeId))
        },
        close: () => {},
      })
      const broadcaster = createBroadcaster(ctx.db, rooms, store)

      const announced = broadcaster.announceLocks(fx.project.id)
      store.hold({
        projectId: fx.project.id,
        pageId: fx.page.id,
        nodeId: 'n_b',
        connectionId: 'c-other',
        userId: fx.dahye.user.id,
        userName: fx.dahye.user.name,
      })
      await announced

      expect(received).toEqual([['n_b']])
    })
  }, 30_000)
})
