/**
 * **비활성화 · 다시 활성화**(`src/routes/admin-users.ts` · `src/repos/users.ts` 의 `deactivateUser`). 겹친 판(로그인 · 비밀번호 바꾸기 ·
 * 관리자 쓰기)은 `admin-deactivate-race.test.ts` 가 잰다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertApiToken } from '../src/repos/api-tokens'
import { INACTIVE_MEMBER } from '../src/routes/members'
import { SELF_DEACTIVATE } from '../src/routes/admin-users'
import { WS_CLOSE } from '../src/ws/protocol'
import { admin, adminOf, auditActions, joinWith, makeInvite } from './accounts-fixtures'
import { addMember, createProject, resetRealData, signup, withApi, withRealApi, type SignedUpUser, type TestContext } from './helpers'
import { WsProbe, joinRoom } from './ws-client'

function login(ctx: TestContext, email: string, password: string) {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress: '10.3.3.3' })
}

const deactivate = (ctx: TestContext, cookie: SignedUpUser['cookie'], userId: string) =>
  admin(ctx, cookie, 'POST', `/users/${userId}/deactivate`)
const activate = (ctx: TestContext, cookie: SignedUpUser['cookie'], userId: string) =>
  admin(ctx, cookie, 'POST', `/users/${userId}/activate`)

describe('비활성화 — 거절', () => {
  it('자기 자신 409 · 이미 비활성 409 · 관리자 아님 403 · 없는 사람 404', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const self = await deactivate(ctx, me.cookie, me.user.id)
      expect(self.statusCode).toBe(409)
      expect(self.json().error.message).toBe(SELF_DEACTIVATE)
      const bob = await signup(ctx)
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(409)
      const plain = await signup(ctx)
      expect((await deactivate(ctx, plain.cookie, me.user.id)).statusCode).toBe(403)
      expect((await deactivate(ctx, me.cookie, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
    })
  })
})

describe('비활성화 — 그 사람이 하던 것이 다 끊긴다', () => {
  it('로그인은 틀린 비밀번호와 같은 401 몸 · 쿠키 401 · API 토큰 401', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const token = await insertApiToken(ctx.db, { projectId: project.id, userId: bob.user.id, name: 'cli' })
      const viaToken = () =>
        ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: { authorization: `Bearer ${token.value}` } })
      expect((await viaToken()).statusCode).toBe(200)

      const res = await deactivate(ctx, me.cookie, bob.user.id)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().user).toMatchObject({ id: bob.user.id, active: false, isInstanceAdmin: false })

      const wrong = await login(ctx, bob.user.email, 'not-the-password')
      const right = await login(ctx, bob.user.email, bob.password)
      expect(right.statusCode).toBe(401)
      expect(right.body).toBe(wrong.body)
      expect(right.cookies).toEqual([])
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })).statusCode).toBe(401)
      expect((await viaToken()).statusCode).toBe(401)
      const left = await ctx.db.selectFrom('api_tokens').select('id').where('user_id', '=', bob.user.id).execute()
      expect(left).toEqual([])
    })
  })

  it('그 사람이 만든 쓸 수 있는 링크를 거둔다 — 초대로 가입 404 · 재설정 404 · 응답 `revokedLinks`', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const leaver = await adminOf(ctx)
      const multi = await makeInvite(ctx, leaver.cookie, { kind: 'multi' })
      const victim = await signup(ctx)
      const reset = await admin(ctx, leaver.cookie, 'POST', `/users/${victim.user.id}/reset-links`)
      expect(reset.statusCode).toBe(201)
      // 이미 다 쓴 링크는 셈에 안 든다.
      const used = await makeInvite(ctx, leaver.cookie, { kind: 'single' })
      expect((await joinWith(ctx, used.token)).statusCode).toBe(201)

      const res = await deactivate(ctx, me.cookie, leaver.user.id)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().revokedLinks).toBe(2)
      expect((await joinWith(ctx, multi.token)).statusCode).toBe(404)
      const useReset = await ctx.app.inject({
        method: 'POST',
        url: `/api/auth/resets/${reset.json().token}`,
        payload: { password: 'brandnew1234' },
      })
      expect(useReset.statusCode).toBe(404)
      const states = (await admin(ctx, me.cookie, 'GET', '/invites')).json().map((item: { state: string }) => item.state)
      expect(states.sort()).toEqual(['revoked', 'used-up'])
    })
  })

  it('관리자를 끄면 관리자 표시도 지운다 — 다시 켜도 일반 사용자다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const other = await adminOf(ctx)
      expect((await deactivate(ctx, me.cookie, other.user.id)).json().user.isInstanceAdmin).toBe(false)
      const back = await activate(ctx, me.cookie, other.user.id)
      expect(back.statusCode).toBe(200)
      expect(back.json().user).toMatchObject({ active: true, isInstanceAdmin: false })
    })
  })
})

describe('비활성화 — 열린 연결이 닫힌다(리뷰 초점 2)', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('비활성화 전에 연 WS 가 커밋 뒤 `revoked` 로 닫히고, 다시 붙으면 핸드셰이크가 거절된다', async () => {
    await withRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const probe = await joinRoom(ctx.port, project.id, bob.cookie.wb_session)
      try {
        expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)
        expect(await probe.waitClosed(2_000)).toMatchObject({ code: WS_CLOSE.revoked })
        const again = WsProbe.open(ctx.port, project.id, bob.cookie.wb_session)
        try {
          expect(await again.opened).toBe(false)
        } finally {
          again.close()
        }
      } finally {
        probe.close()
      }
    })
  })
})

describe('비활성 멤버', () => {
  it('멤버 «이메일로 추가» 는 비활성 사용자를 400 으로 거절하고, 이미 멤버인 행은 «비활성» 으로 남는다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const kept = await signup(ctx)
      const outsider = await signup(ctx)
      await addMember(ctx, project.id, kept.user.id, 'editor')
      for (const who of [kept, outsider]) expect((await deactivate(ctx, me.cookie, who.user.id)).statusCode).toBe(200)

      const added = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: outsider.user.email, role: 'viewer' },
      })
      expect(added.statusCode).toBe(400)
      expect(added.json().error.message).toBe(INACTIVE_MEMBER)
      const members = (await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/members`, cookies: owner.cookie })).json()
      // 롤백 하네스라 `invited_at` 이 다 같다 — 차례 말고 사람별로 견준다.
      expect(Object.fromEntries(members.map((m: { userId: string; active: boolean }) => [m.userId, m.active]))).toEqual({
        [owner.user.id]: true,
        [kept.user.id]: false,
      })
    })
  })

  it('마지막 활성 owner 를 끄면 막지 않고 `ownerlessProjects` 로 센다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      await createProject(ctx, bob.cookie)
      const shared = await createProject(ctx, bob.cookie)
      await addMember(ctx, shared.id, carol.user.id, 'owner')
      const res = await deactivate(ctx, me.cookie, bob.user.id)
      expect(res.statusCode).toBe(200)
      expect(res.json().ownerlessProjects).toBe(1)
    })
  })
})

describe('다시 활성화', () => {
  it('표시만 지운다 — 비밀번호 그대로 로그인 200 · 이미 활성 409 · 기록 둘', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      expect((await activate(ctx, me.cookie, bob.user.id)).statusCode).toBe(409)
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)
      const res = await activate(ctx, me.cookie, bob.user.id)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().user).toMatchObject({ id: bob.user.id, active: true })
      expect((await login(ctx, bob.user.email, bob.password)).statusCode).toBe(200)
      expect(await auditActions(ctx.db)).toEqual(['admin.grant', 'user.deactivate', 'user.activate'])
    })
  })
})
