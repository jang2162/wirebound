/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 잠금 프레임 무리 (설계서 「소프트 잠금」)
 *
 * 설계서가 정한 수명을 실행으로 잰다 — *"노드를 선택하면 그 서브트리에 잠금을 건다 · TTL 30초,
 * 편집 중 하트비트로 갱신 · **WS 연결 종료 시 즉시 해제**"*. TTL 자체는 시계를 밀어
 * `lock-store.test.ts`가 재고, 여기서는 **프레임이 오가는 것**과 **연결 종료**를 잰다.
 *
 * # 하나짜리로 재지 않는다
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 연결 둘 | 룸에 흘리는 대신 **낸 사람에게만** 답해도 안 죽는다 |
 * | 사용자 둘 | 소유자를 안 실어도 안 죽는다 |
 * | **같은 사용자의 탭 둘** | 잠금을 사람 단위로 저장해도 안 죽는다(수명은 연결이다) |
 * | 노드 여럿 | 어느 노드를 잠갔는지 안 실어도 안 죽는다 |
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type CreatedPage,
  type CreatedProject,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { hashSessionToken } from '../src/auth/session'
import type { DbHandle } from '../src/db/tx'
import { lockPageForEdit } from '../src/repos/pages'
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

describe('잠금은 룸 전체가 본다 — 배지가 그 위에 선다 (설계서 「소프트 잠금」)', () => {
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

  it('연결이 끊기면 즉시 해제된다 — 설계서 「소프트 잠금」이 수명을 연결에 맸다', async () => {
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

describe('연결 둘 · 사용자 둘 · 같은 사용자의 탭 둘', () => {
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
  it('viewer는 잠글 수 없다 — 설계서 「권한 모델」이 조회 전용으로 못박았다', async () => {
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
 * **서버가 획득을 거절한다**(`ws/lock.ts`의 표). 판정은 설계서 「소프트 잠금」의 «선택 = 서브트리 claim» 그대로이고 화면의 1차
 * 방어와 같은 함수다(`lock/check.ts`의 `selectionVerdict`).
 */
describe('획득 거절', () => {
  const denials = (probe: WsProbe): ServerFrame[] => probe.received.filter((frame) => frame.type === 'lock-denied')
  const held = (ctx: RealApiContext, projectId: string): string[] =>
    ctx.app.realtime.locks
      .liveIn(projectId)
      .map((lock) => `${lock.userName}:${lock.nodeId}`)
      .sort()

  /**
   * 혼자 죽는 변조: 거절을 룸 전체에 보낸다(«누구에게»). 획득 판정이 늘 `free`(거절하지 않는다)인 변조에는 이 파일의 거절
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
  it('같은 사람의 다른 탭은 막지 않는다 — 겹치는 자리를 둘 다 쥔다', async () => {
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
   *
   * **«문서는 행을 다시 잡지 않고 읽는다»도 이 케이스가 소유한다** — 둘이 페이지 행을 `KEY SHARE`로 함께 쥐는 판이라, `readSelectionRoot`가
   * 행을 `FOR UPDATE`로 다시 잡으면(`lockPageForEdit`) 서로 올리려다 교착(40P01)이고 진 쪽은 서지도 거절받지도 않는다.
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
 * **잠금 목록은 보내는 순간 짓는다**(`ws/broadcast.ts`의 `announceLocks`). 알림을 부른 뒤 첫 연결의 자격을 보는
 * 사이에 잠금이 바뀌면, 그 연결이 받는 목록은 바뀐 것이어야 한다 — 부른 순간의 목록을 실어 보내면, 그것이 뒤 알림을
 * 추월할 때 낡은 목록이 마지막 프레임으로 남는다. 혼자 죽는 변조: 목록을 부를 때 한 번 짓는다.
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

/**
 * **편집 커밋과 잠금 획득은 페이지 행 하나에 줄 선다**(`lock/check.ts`의 «판정은 페이지 행 안에서»). 보라가 쥔 `n_c`를 `n_b` 안으로
 * 옮기는 편집(들여쓰기)과 다혜의 `lock n_b`가 겹치는 판. 다혜의 `lock`은 같은 페이지에 보라의 잠금이 있어 **문서 조회 경로**다. 둘을
 * 함께 세우는 점이 없으면 편집이 판정을 지난 뒤 커밋 전에 다혜가 커밋 **전** 문서로 판정되어 서고, 커밋이 `n_c`를 그 안에 넣는다.
 * 문서가 필요 없는 획득(그 페이지에 남의 잠금이 없다)도 같은 행에 선다 — 셋째 케이스가 잰다.
 * 순서를 **DB 잠금으로** 세운다(고정 `sleep`이 아니다 — 줄에 선 것을 `pg_locks`로 본다).
 */
describe('편집 커밋과 잠금 획득은 페이지 행에 줄 선다', () => {
  const db = getTestDb()

  /** 잠금을 기다리는 트랜잭션(백엔드) 수 — `guard-in-lock.test.ts`의 `waitForLockWaiter`와 같은 질의를 센다. */
  async function lockWaiters(): Promise<number> {
    const result = await sql<{ n: number }>`
      select count(distinct l.pid)::int as n
        from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
       where not l.granted
         and a.datname = current_database()
    `.execute(db)
    return result.rows[0]?.n ?? 0
  }

  /** 조건이 설 때까지 — 안 서면 던진다(시나리오가 성립하지 않았다). */
  async function until(label: string, ready: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await ready()) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`${label} — 시나리오가 성립하지 않았습니다`)
  }

  /** 트랜잭션 하나를 열어 잠금을 쥐고, `release`까지 쥔 채 둔다. */
  function holdInTransaction(take: (trx: DbHandle) => Promise<unknown>): { acquired: Promise<void>; release: () => Promise<void> } {
    let acquire = (): void => {}
    let free = (): void => {}
    const acquired = new Promise<void>((resolve) => (acquire = resolve))
    const freed = new Promise<void>((resolve) => (free = resolve))
    const done = db.transaction().execute(async (trx) => {
      await take(trx)
      acquire()
      await freed
    })
    return {
      acquired,
      release: async () => {
        free()
        await done
      },
    }
  }

  const MOVE_C_INTO_B = [{ op: 'move', from: '/root/children/2', path: '/root/children/1/children/-' }]

  async function headSeq(pageId: string): Promise<number> {
    const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
    return Number(row.head_seq)
  }

  async function childrenOfB(pageId: string): Promise<string[]> {
    const row = await db.selectFrom('pages').select('schema').where('id', '=', pageId).executeTakeFirstOrThrow()
    const root = (row.schema as { root: { children: { id: string; children?: { id: string }[] }[] } }).root
    return (root.children.find((child) => child.id === 'n_b')?.children ?? []).map((child) => child.id)
  }

  async function arrange(ctx: RealApiContext) {
    const fx = await board(ctx)
    const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
    const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
    boraTab.send(lockFrame(fx.page.id, 'n_c'))
    await locksWith(dahyeTab, 'n_c')
    const dahyeSettled = (): boolean =>
      dahyeTab.received.some((frame) => frame.type === 'lock-denied') ||
      ctx.app.realtime.locks.liveIn(fx.project.id).some((lock) => lock.userId === fx.dahye.user.id)
    const moveCIntoB = async (): Promise<void> =>
      boraTab.send(
        JSON.stringify({ type: 'patch', pageId: fx.page.id, baseSeq: await headSeq(fx.page.id), ops: MOVE_C_INTO_B, clientOpId: 'op-indent' }),
      )
    const held = (): string[] =>
      ctx.app.realtime.locks
        .liveIn(fx.project.id)
        .map((lock) => `${lock.userName}:${lock.nodeId}`)
        .sort()
    return { fx, boraTab, dahyeTab, dahyeSettled, moveCIntoB, held }
  }

  /**
   * **선택 쪽 절반** — 문서 조회 경로의 `lock`은 편집이 쥔 페이지 행을 기다렸다가 **커밋된 머리 문서**로 판정한다. 편집을 판정 ·
   * 적용 뒤 커밋 직전(멤버 행 재확인)에 세워 두고 다혜가 `n_b`를 요청한다. 혼자 죽는 변조: `handleLockFrame`이 문서를 행을 잡기
   * **전에** 읽는다(`readSelectionRoot` → `lockPageShared` — 커밋 전 문서를 읽어 두고, 행을 얻은 뒤 그 문서로 판정해 선다).
   *
   * 멤버 행은 이 케이스가 **SQL 로 직접** 잡는다 — 편집을 커밋 직전에 세우는 문일 뿐 재는 대상이 아니다(재는 것은 페이지 행이다).
   */
  it('편집이 판정을 지나 커밋 전이면 `lock`은 그 커밋 뒤 문서로 판정된다 — 옮겨 들어온 서브트리를 겹쳐 잡지 못한다', async () => {
    await withRealApi(async (ctx) => {
      const { fx, boraTab, dahyeTab, dahyeSettled, moveCIntoB, held } = await arrange(ctx)
      const door = holdInTransaction((trx) =>
        sql`select 1 from project_members where project_id = ${fx.project.id} and user_id = ${fx.bora.user.id} for update`.execute(trx),
      )
      await door.acquired

      await moveCIntoB()
      await until('편집이 커밋 직전에 선다', async () => (await lockWaiters()) >= 1)
      dahyeTab.send(lockFrame(fx.page.id, 'n_b'))
      await until('다혜의 lock 이 줄에 서거나 끝난다', async () => dahyeSettled() || (await lockWaiters()) >= 2)
      await door.release()

      await boraTab.waitFor('patch-ack')
      expect(await childrenOfB(fx.page.id)).toEqual(['n_b1', 'n_b2', 'n_c'])
      await dahyeTab.waitFor('lock-denied')
      expect(held()).toEqual([`${fx.bora.user.name}:n_c`])
    })
  }, 30_000)

  /**
   * **편집 쪽 절반** — 편집의 2차 방어는 페이지 행을 **잡은 뒤** 판정한다. 페이지 행을 이 케이스가 쥐고, 다혜의 `lock`이 먼저 줄에
   * 서고 보라의 편집이 뒤에 선다. 행이 풀리면 다혜가 먼저 서고, 보라의 편집은 그것을 보고 423 이다. 혼자 죽는 변조: 편집이 행을
   * 잡기 **전에** 판정한다(`lockConflictError`가 `lockPageRow` 앞에서 판정 — 다혜가 서기 전에 판정을 지나 겹친 채 커밋한다).
   *
   * **`lock`이 행을 안 기다리는 코드에서는 이 줄 세우기가 안 선다** — 다혜가 곧장 서고 편집은 그것을 본다(그때 이 케이스는
   * «줄에 선다»를 기다리다 죽는다 — 겹침 단언이 아니라 시나리오가 성립하지 않아서다). 겹침을 재는 것은 선택 쪽이 행을 기다리고
   * 편집 쪽만 행 밖에서 판정하는 판이다(위 변조).
   */
  it('`lock`이 먼저 줄 선 행 뒤의 편집은 그 잠금을 보고 판정한다 — 겹치는 서브트리로 옮기면 423', async () => {
    await withRealApi(async (ctx) => {
      const { fx, boraTab, dahyeTab, dahyeSettled, moveCIntoB, held } = await arrange(ctx)
      const row = holdInTransaction((trx) => lockPageForEdit(trx, fx.project.id, fx.page.id))
      await row.acquired

      dahyeTab.send(lockFrame(fx.page.id, 'n_b'))
      await until('다혜의 lock 이 줄에 서거나 끝난다', async () => dahyeSettled() || (await lockWaiters()) >= 1)
      await moveCIntoB()
      await until('편집이 줄에 선다', async () => (await lockWaiters()) >= (dahyeSettled() ? 1 : 2))
      await row.release()

      const answered = (): ServerFrame | undefined =>
        boraTab.received.find((frame) => frame.type === 'patch-ack' || frame.type === 'patch-error')
      await until('보라의 편집이 답을 받는다', () => answered() !== undefined)
      const answer = answered()
      expect(answer?.type === 'patch-error' && answer.status).toBe(423)
      await until('다혜가 선다', () => dahyeSettled())
      expect(held()).toEqual([`${fx.bora.user.name}:n_c`, `${fx.dahye.user.name}:n_b`].sort())
      expect(await childrenOfB(fx.page.id)).toEqual(['n_b1', 'n_b2'])
    })
  }, 30_000)

  /**
   * **남의 잠금이 없는 페이지에서도** 획득은 행에 선다 — 문서를 안 읽어도 되는 판이다. 보라는 이 페이지에 잠금이 없고, 보라의 편집을
   * 판정 · 적용 뒤 커밋 직전(멤버 행 재확인)에 세워 둔 채 다혜가 그 편집이 고치는 노드를 요청한다. 행 없이 잡으면 다혜의 배지가 선 뒤
   * 보라의 편집이 그 노드를 바꾸며 커밋된다. 혼자 죽는 변조: `handleLockFrame`이 먼저 행 없이 묻고 `free`면 그대로 잡는다(문서가
   * 필요할 때만 트랜잭션을 연다).
   */
  it('남의 잠금이 없는 페이지에서도 판정을 지난 편집이 커밋되기 전에는 잠금이 서지 않는다 — 배지 뒤에 남의 편집이 커밋되지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const dahyeHeld = (): boolean =>
        ctx.app.realtime.locks.liveIn(fx.project.id).some((lock) => lock.userId === fx.dahye.user.id)
      const door = holdInTransaction((trx) =>
        sql`select 1 from project_members where project_id = ${fx.project.id} and user_id = ${fx.bora.user.id} for update`.execute(trx),
      )
      await door.acquired

      const editB1 = [{ op: 'replace', path: '/root/children/1/children/0/props', value: {} }]
      boraTab.send(JSON.stringify({ type: 'patch', pageId: fx.page.id, baseSeq: await headSeq(fx.page.id), ops: editB1, clientOpId: 'op-b1' }))
      await until('편집이 커밋 직전에 선다', async () => (await lockWaiters()) >= 1)
      dahyeTab.send(lockFrame(fx.page.id, 'n_b1'))
      await until('다혜의 lock 이 줄에 서거나 선다', async () => dahyeHeld() || (await lockWaiters()) >= 2)
      // 값을 잡고 문을 먼저 연다 — 단언이 먼저 죽으면 문이 멤버 행을 쥔 채 남아 뒤 케이스가 선다.
      const heldBeforeCommit = dahyeHeld()
      await door.release()
      expect(heldBeforeCommit).toBe(false)

      const ack = await boraTab.waitFor('patch-ack')
      await until('다혜가 선다', () => dahyeHeld())
      expect(await headSeq(fx.page.id)).toBe(ack.seq)
      expect(held()).toEqual([`${fx.dahye.user.name}:n_b1`])

      function held(): string[] {
        return ctx.app.realtime.locks.liveIn(fx.project.id).map((lock) => `${lock.userName}:${lock.nodeId}`)
      }
    })
  }, 30_000)
})

/**
 * **거절은 그 `lock` 프레임과 짝지어진다**(`ws/lock.ts`의 표 아래 절). 프레임이 `lockId`를 실어 오면 `lock-denied`가 그것을 되돌려준다 — 화면은
 * 마지막으로 보낸 것의 거절만 받는다(`apps/web`의 `lock-channel.ts`). 혼자 죽는 변조: 거절이 `lockId`를 안 싣는다.
 */
describe('거절의 짝 · 만료의 알림 · 닫힌 연결', () => {
  it('거절은 그 `lock`의 `lockId`를 되돌려준다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(lockFrame(fx.page.id, 'n_b'))
      await locksWith(dahyeTab, 'n_b')

      dahyeTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_b', lockId: 41 }))

      expect(await dahyeTab.waitFor('lock-denied')).toEqual({
        type: 'lock-denied',
        projectId: fx.project.id,
        pageId: fx.page.id,
        nodeId: 'n_b',
        lockId: 41,
      })
    })
  }, 30_000)

  /**
   * **만료는 그 방에 알린다**(`lock/store.ts`의 «걷은 것은 알린다»). 아무도 읽지 않는 조용한 방에서도 스위퍼가 걷고 목록을
   * 흘린다 — 조용히 걷으면 배지가 다음 알림까지 남는다. 혼자 죽는 변조: 스위퍼를 안 건다
   * (`ws/index.ts`). 걷는 자리가 알리는 축의 주인은 `lock-store.test.ts`다(이 케이스도 함께 죽는다).
   */
  it('TTL 을 넘긴 잠금은 읽는 자가 없어도 걷히고 방에 빈 목록이 흐른다', async () => {
    const realNow = Date.now.bind(Date)
    let skew = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
    try {
      await withRealApi(async (ctx) => {
        const fx = await board(ctx)
        const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
        const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
        boraTab.send(lockFrame(fx.page.id, 'n_b'))
        await locksWith(dahyeTab, 'n_b')
        // **참가 알림을 다 흘려보낸 뒤 시계를 민다.** 목록은 보내는 순간 지어지므로(`ws/broadcast.ts`) 늦게 닿은 참가 알림이 민 뒤에
        // 지어지면 빈 목록을 싣는다 — 그것은 만료의 알림이 아니다(그것을 재면 스위퍼를 떼어도 통과한다).
        await dahyeTab.quiet()
        expect(dahyeTab.received.filter((frame) => frame.type === 'locks').at(-1)).toMatchObject({ locks: [{ nodeId: 'n_b' }] })

        skew = LOCK_TTL_MS + 1
        expect(await locksEmpty(dahyeTab)).toEqual([])
      })
    } finally {
      clock.mockRestore()
    }
  }, 30_000)

  /**
   * **닫힌 연결의 `lock`은 서지 않는다**(`ws/lock.ts`의 표 — «룸에 없다» 줄). 자격을 보는 await 사이에 소켓이 닫히면 닫힘의 해제는 이미 지나갔다 — 그 뒤에
   * 잡으면 아무도 안 놓는 잠금이 TTL 까지 선다. 문을 자격 질의 뒤에 세우고 그 사이 닫는다. 혼자 죽는 변조: 잡기 전에 «룸에 있나»를
   * 안 본다.
   */
  it('자격을 보는 사이 닫힌 연결의 `lock`은 잡지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = WsProbe.open(ctx.port, fx.project.id, fx.bora.cookie.wb_session)
      await boraTab.waitFor('joined')
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const { broadcast, locks, rooms } = ctx.app.realtime
      const real = broadcast.stillAllowed
      let entered = (): void => {}
      let open = (): void => {}
      const atDoor = new Promise<void>((resolve) => (entered = resolve))
      const opened = new Promise<void>((resolve) => (open = resolve))
      broadcast.stillAllowed = async (connection, minRole) => {
        const allowed = await real(connection, minRole)
        if (connection.userId === fx.bora.user.id && minRole === 'editor') {
          entered()
          await opened
        }
        return allowed
      }

      boraTab.send(lockFrame(fx.page.id, 'n_a'))
      await atDoor
      boraTab.close()
      await boraTab.waitClosed()
      const deadline = Date.now() + 3_000
      while (rooms.membersOf(fx.project.id).some((member) => member.userId === fx.bora.user.id) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(rooms.membersOf(fx.project.id).map((member) => member.userId)).toEqual([fx.dahye.user.id])
      open()

      await watcher.quiet()
      expect(locks.liveIn(fx.project.id)).toEqual([])
    })
  }, 30_000)
})
