/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 멤버십이 바뀌면 그 사람의 켜 둔 화면에 알린다 (이월 5차 — `ws/notify.ts`의 `notifyMembershipChanged`)
 *
 * 앞 판은 역할 변경 · 제거를 룸에 아무도 몰랐다 — 화면은 새로고침 전까지 옛 역할로 섰고, 강등된 연결의 잠금은 그 연결이
 * 보내는 `unlock`이 editor 문턱에 걸려 TTL 까지 남았고, 제거된 연결은 다음 프레임까지 열려 있었다.
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
      // (그렇게 적었다가 «알림을 변경 앞으로» 변조가 살았다).
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

      // viewer 로 내리면 놓는다 — 앞 판은 그 연결의 `unlock`이 editor 문턱에 걸려 TTL(30초)까지 남았다.
      expect(await setRole(ctx, fx, fx.target.user.id, 'viewer')).toBe(200)
      expect(await locksEmpty(ownerTab)).toEqual([])
      expect(targetTab.closeInfo).toBeNull()
    })
  }, 30_000)

  /**
   * 제거는 **알리고 잠금을 놓되 알림 자리에서 닫지 않는다** — 닫으면 잠금에 줄 선 WS `patch`의 404 답이 갈 길을 잃는다
   * (`guard-in-lock.test.ts`의 «멤버에서 빠지면 404»가 그것을 잰다 — 첫 판이 닫았다가 그 케이스가 죽었다). 닫는 것은 앞 판의
   * 회수다 — 잠금을 쥐었던 이 판에서는 **놓는 `locks` 방송이** 그 연결에 닿기 전에 자격을 보고 4403 으로 닫는다.
   */
  it('제거는 알리고 그 사람의 잠금을 놓는다 — 연결은 앞 판의 회수로 닫힌다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const targetTab = track(await joinRoom(ctx.port, fx.project.id, fx.target.cookie.wb_session))
      const ownerTab = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      targetTab.send(lockFrame(fx.page.id, 'n_card'))
      await locksWith(ownerTab, 'n_card')

      expect(await remove(ctx, fx, fx.target.user.id)).toBe(204)

      expect(await targetTab.waitFor('membership-changed')).toEqual({ type: 'membership-changed', projectId: fx.project.id })
      // 잠금은 알림 자리에서 놓인다 — 앞 판은 그 연결이 다음 프레임을 보낼 때까지 남의 선택을 막았다.
      expect(await locksEmpty(ownerTab)).toEqual([])
      // 닫힘은 앞 판의 회수다(놓는 방송이 자격을 본다).
      expect((await targetTab.waitClosed()).code).toBe(WS_CLOSE.revoked)
      expect(ownerTab.closeInfo).toBeNull()
    })
  }, 30_000)
})
