/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 멤버십이 바뀌면 그 사람의 켜 둔 화면에 알린다 (`ws/notify.ts`의 `notifyMembershipChanged`)
 *
 * 알리지 않으면 역할 변경 · 제거를 룸에 아무도 모른다 — 화면은 새로고침 전까지 옛 역할로 서고, 강등된 연결의 잠금은 그 연결이
 * 보내는 `unlock`이 editor 문턱에 걸려 TTL 까지 남고, 제거된 연결은 다음 프레임까지 열려 있다.
 *
 * # 하나짜리로 재지 않는다
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 바뀐 사람의 **탭 둘** | 그 사람의 연결 하나에만 보내도 안 죽는다 |
 * | 룸의 **다른 사람 둘**(owner · viewer) | 룸 전체에 흘려도 안 죽는다 |
 * | 잠금을 쥔 채 강등 · 잠금을 쥔 채 owner 로 | 역할과 무관하게 늘 놓아도(또는 늘 안 놓아도) 안 죽는다 |
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
import { WsProbe, joinRoom, locksEmpty, locksWith } from './ws-client'

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
  owner: SignedUpUser
  target: SignedUpUser
  onlooker: SignedUpUser
  project: CreatedProject
  page: CreatedPage
}

/** owner 하나 · 바뀔 사람(editor) · 곁에서 보는 viewer. 페이지 하나(잠글 자리). */
async function board(ctx: RealApiContext): Promise<Board> {
  const owner = await signup(ctx)
  const target = await signup(ctx)
  const onlooker = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, target.user.id, 'editor')
  await addMember(ctx, project.id, onlooker.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '역할이 바뀌는 페이지' })
  return { owner, target, onlooker, project, page }
}

async function setRole(ctx: RealApiContext, fx: Board, userId: string, role: string): Promise<number> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/members/${userId}`,
    cookies: fx.owner.cookie,
    payload: { role },
  })
  return res.statusCode
}

async function remove(ctx: RealApiContext, fx: Board, userId: string): Promise<number> {
  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/api/projects/${fx.project.id}/members/${userId}`,
    cookies: fx.owner.cookie,
  })
  return res.statusCode
}

const lockFrame = (pageId: string, nodeId: string): string => JSON.stringify({ type: 'lock', pageId, nodeId })

describe('membership-changed — 누구에게 가나', () => {
  it('역할이 바뀐 사람의 연결 전부가 받고, 룸의 다른 사람은 안 받는다 — 역할 값은 안 싣는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const tabA = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const tabB = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const viewerTab = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))

      expect(await setRole(ctx, fx, fx.target.user.id, 'viewer')).toBe(200)

      // **값이 이것뿐이다** — 역할의 출처는 웹의 `getProject` 하나로 남는다(`ws/protocol.ts`의 그 갈래).
      const want = { type: 'membership-changed', projectId: fx.project.id }
      expect(await tabA.waitFor('membership-changed')).toEqual(want)
      expect(await tabB.waitFor('membership-changed')).toEqual(want)
      const others = [...(await ownerTab.quiet()), ...ownerTab.received, ...viewerTab.received]
      expect(others.filter((frame) => frame.type === 'membership-changed')).toEqual([])
      // 강등된 연결은 **닫히지 않는다** — viewer 는 계속 받는다.
      expect(tabA.closeInfo).toBeNull()
      expect(tabB.closeInfo).toBeNull()
    })
  }, 30_000)

  it('거절된 변경(마지막 owner 강등 409)은 아무에게도 안 간다 — 알림은 커밋 뒤다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      expect(await setRole(ctx, fx, fx.owner.user.id, 'editor')).toBe(409)

      // **창 전체를 본다** — `quiet()`는 부른 **뒤에** 온 것만 돌려주는데, 거절 **앞에** 알렸으면 프레임은 이미 와 있다
      // (부른 뒤만 보면 «알림을 변경 앞으로» 변조가 산다).
      await ownerTab.quiet()
      expect(ownerTab.received.filter((frame) => frame.type === 'membership-changed')).toEqual([])
      // 대조: 같은 요청이 통과하면(둘째 owner 가 있으면) 받는다.
      expect(await setRole(ctx, fx, fx.target.user.id, 'owner')).toBe(200)
      expect(await setRole(ctx, fx, fx.owner.user.id, 'editor')).toBe(200)
      expect(await ownerTab.waitFor('membership-changed')).toEqual({ type: 'membership-changed', projectId: fx.project.id })
    })
  }, 30_000)
})

describe('바뀌는 순간의 잠금과 연결', () => {
  it('강등이 그 사람의 잠금을 놓는다 — 잠금을 쥘 수 있는 역할(owner)로 바뀌면 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const targetTab = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      targetTab.send(lockFrame(fx.page.id, 'n_card'))
      await locksWith(ownerTab, 'n_card')

      // 대조 먼저: owner 로 올리면 잠금은 그대로다.
      expect(await setRole(ctx, fx, fx.target.user.id, 'owner')).toBe(200)
      await targetTab.waitFor('membership-changed')
      expect((await ownerTab.quiet()).filter((frame) => frame.type === 'locks')).toEqual([])

      // viewer 로 내리면 놓는다 — 안 놓으면 그 연결의 `unlock`이 editor 문턱에 걸려 TTL(30초)까지 남는다.
      expect(await setRole(ctx, fx, fx.target.user.id, 'viewer')).toBe(200)
      expect(await locksEmpty(ownerTab)).toEqual([])
      expect(targetTab.closeInfo).toBeNull()
    })
  }, 30_000)

  /**
   * 제거는 **알리고 잠금을 놓되 알림 자리에서 닫지 않는다** — 닫으면 잠금에 줄 선 WS `patch`의 404 답이 갈 길을 잃는다
   * (`guard-in-lock.test.ts`의 «멤버에서 빠지면 404»가 그것을 잰다 — 알림 자리에서 닫으면 그 케이스가 죽는다). 닫는 것은 방송
   * 때의 회수(확인 지점 2)다 — 잠금을 쥐었던 이 판에서는 **놓는 `locks` 방송이** 그 연결에 닿기 전에 자격을 보고 4403 으로 닫는다.
   */
  it('제거는 알리고 그 사람의 잠금을 놓는다 — 연결은 방송 때의 회수로 닫힌다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const targetTab = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      targetTab.send(lockFrame(fx.page.id, 'n_card'))
      await locksWith(ownerTab, 'n_card')

      expect(await remove(ctx, fx, fx.target.user.id)).toBe(204)

      expect(await targetTab.waitFor('membership-changed')).toEqual({ type: 'membership-changed', projectId: fx.project.id })
      // 잠금은 알림 자리에서 놓인다 — 거기서 안 놓으면 그 연결이 다음 프레임을 보낼 때까지 남의 선택을 막는다.
      expect(await locksEmpty(ownerTab)).toEqual([])
      // 닫힘은 방송 때의 회수다(놓는 방송이 자격을 본다).
      expect((await targetTab.waitClosed()).code).toBe(WS_CLOSE.revoked)
      expect(ownerTab.closeInfo).toBeNull()
    })
  }, 30_000)
})

/**
 * **자격을 본 뒤 `hold` 전에 강등이 끼는 창.** 프레임 경로는 «자격을 본다(DB 둘 — await)» → «`hold`» 순이라, 그
 * await 사이에 멤버 행이 커밋되고 `notifyMembershipChanged`가 먼저 놓으면(놓을 것이 아직 없다) 뒤이어 `hold`가 선다 — 그
 * 잠금은 **TTL 까지** 남고 viewer 가 된 주인은 놓을 수 없다(`unlock`이 editor 문턱에 걸린다).
 *
 * 창을 **문으로** 연다: 그 사람의 editor 자격 질의가 답을 낸 **뒤에** 문 앞에서 기다리게 하고(로컬 DB 에서는 지연 없이
 * 창이 안 열린다), 그 사이 강등을 커밋한다. 방송(`send`)의 자격 질의는 브로드캐스터 안의 같은 함수를 직접 부르므로
 * 문을 안 지난다.
 */
describe('자격을 본 뒤 hold 전에 끼는 강등', () => {
  it('강등이 그 창에 끼면 `lock` 프레임은 잡지 않는다 — 대조: 끼지 않으면 잡는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const targetTab = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      const { broadcast, locks } = ctx.app.realtime
      const real = broadcast.stillAllowed
      let gate: { entered: () => void; opened: Promise<void> } | null = null
      broadcast.stillAllowed = async (connection, minRole) => {
        const allowed = await real(connection, minRole)
        const armed = gate
        if (armed !== null && connection.userId === fx.target.user.id && minRole === 'editor') {
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

      // 대조 먼저: 문을 지나도 그 사이 아무 일이 없으면 잡는다(문 자체가 잠금을 막지 않는다).
      const first = arm()
      targetTab.send(lockFrame(fx.page.id, 'n_card'))
      await first.entered
      first.open()
      await locksWith(ownerTab, 'n_card')
      targetTab.send(JSON.stringify({ type: 'unlock' }))
      expect(await locksEmpty(ownerTab)).toEqual([])

      // 그 창에 강등이 낀다 — 자격은 editor 로 읽혔다.
      const second = arm()
      targetTab.send(lockFrame(fx.page.id, 'n_btn'))
      await second.entered
      expect(await setRole(ctx, fx, fx.target.user.id, 'viewer')).toBe(200)
      await targetTab.waitFor('membership-changed')
      second.open()

      await ownerTab.quiet()
      expect(locks.liveIn(fx.project.id)).toEqual([])
      // 버린 자리는 목록에 한 번도 안 선다. («비어 있지 않은 목록이 하나»로 재면 안 된다 — 목록은 보내는 순간 지어지므로
      // (`ws/broadcast.ts`) 늦게 닿은 참가 알림도 대조 판의 `n_card`를 실어 그 수가 흔들린다.)
      expect(
        ownerTab.received.filter((frame) => frame.type === 'locks' && frame.locks.some((lock) => lock.nodeId === 'n_btn')),
      ).toEqual([])
      // **버린 것을 낸 쪽에 말한다** — 조용히 버리면 그 화면은 쥔 줄 안다. 대조 판(첫 `lock`)에는
      // 거절이 없다.
      expect(targetTab.received.filter((frame) => frame.type === 'lock-denied')).toEqual([
        { type: 'lock-denied', projectId: fx.project.id, pageId: fx.page.id, nodeId: 'n_btn' },
      ])
    })
  }, 30_000)

  /**
   * **편집 권한이 그대로인 변경은 그 창의 하트비트를 버리지 않는다**(`ws/notify.ts`의 `canHold`). 세대는 잠금을 쥘 수 없게 된 변경에만
   * 오른다 — 놓는 판정(`canHold`)과 같은 값이다. editor → owner 와 역할이 그대로인 PATCH(owner → owner) 둘 다, 쥔 자리의 하트비트가
   * 그 창에 끼어도 잠금은 그대로이고 거절이 없다. 혼자 죽는 변조: 세대를 모든 변경에 올린다.
   */
  it('editor → owner · 같은 역할의 PATCH 가 그 창에 끼어도 하트비트는 쥔 잠금을 놓지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const targetTab = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      targetTab.send(lockFrame(fx.page.id, 'n_card'))
      await locksWith(ownerTab, 'n_card')

      const { broadcast, locks } = ctx.app.realtime
      const real = broadcast.stillAllowed
      let gate: { entered: () => void; opened: Promise<void> } | null = null
      broadcast.stillAllowed = async (connection, minRole) => {
        const allowed = await real(connection, minRole)
        const armed = gate
        if (armed !== null && connection.userId === fx.target.user.id && minRole === 'editor') {
          gate = null
          armed.entered()
          await armed.opened
        }
        return allowed
      }
      const heartbeatAcross = async (role: string, changes: number): Promise<void> => {
        let entered = (): void => {}
        let open = (): void => {}
        const atDoor = new Promise<void>((resolve) => (entered = resolve))
        gate = { entered, opened: new Promise<void>((resolve) => (open = resolve)) }
        targetTab.send(lockFrame(fx.page.id, 'n_card'))
        await atDoor
        expect(await setRole(ctx, fx, fx.target.user.id, role)).toBe(200)
        await targetTab.waitForCount('membership-changed', changes)
        open()
        await ownerTab.quiet()
      }

      await heartbeatAcross('owner', 1)
      await heartbeatAcross('owner', 2)

      expect(locks.liveIn(fx.project.id).map((lock) => `${lock.userId}:${lock.nodeId}`)).toEqual([`${fx.target.user.id}:n_card`])
      expect(targetTab.received.filter((frame) => frame.type === 'lock-denied')).toEqual([])
    })
  }, 30_000)
})
