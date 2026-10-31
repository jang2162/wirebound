/**
 * **비밀번호 재설정 링크**(`src/repos/password-resets.ts` · `src/routes/password-reset.ts` · 만들기는 `src/routes/admin-users.ts`).
 * 쓰기 몸통은 재설정 명령과 같은 함수다(`src/db/reset-password.ts` 의 `replacePassword`) — 아래 «한 벌» 이 호출자를 센다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashTokenValue } from '../src/auth/token-hash'
import { insertApiToken } from '../src/repos/api-tokens'
import { RESET_INACTIVE } from '../src/routes/admin-users'
import { RESET_UNUSABLE } from '../src/routes/password-reset'
import { WS_CLOSE } from '../src/ws/protocol'
import { admin, adminOf, auditActions, tableContains } from './accounts-fixtures'
import { createProject, resetRealData, signup, withApi, withRealApi, type SignedUpUser, type TestContext } from './helpers'
import { callSitesByFile } from './source-census'
import { joinRoom } from './ws-client'

const NEW_PASSWORD = 'brandnew5678'

async function makeReset(ctx: TestContext, cookie: SignedUpUser['cookie'], userId: string): Promise<string> {
  const res = await admin(ctx, cookie, 'POST', `/users/${userId}/reset-links`)
  expect(res.statusCode, res.body).toBe(201)
  return res.json().token
}

function useReset(ctx: TestContext, token: string, password = NEW_PASSWORD) {
  return ctx.app.inject({ method: 'POST', url: `/api/auth/resets/${token}`, payload: { password }, remoteAddress: '10.6.0.1' })
}

function login(ctx: TestContext, email: string, password: string) {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress: '10.6.0.2' })
}

describe('만들기', () => {
  it('201 이 원문 · 만료(24 시간)를 내고, DB 에는 해시만 있다 · 확인은 대상의 이름 · 이메일', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const res = await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/reset-links`)
      expect(res.statusCode).toBe(201)
      const { token, expiresAt } = res.json()
      expect(Object.keys(res.json()).sort()).toEqual(['expiresAt', 'token'])
      expect(Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000)).toBe(24)
      expect(await tableContains(ctx.db, 'password_resets', token)).toBe(false)
      expect(await tableContains(ctx.db, 'password_resets', hashTokenValue(token))).toBe(true)
      const target = await ctx.app.inject({ method: 'GET', url: `/api/auth/resets/${token}` })
      expect(target.json()).toEqual({ email: bob.user.email, name: bob.user.name })
    })
  })

  it('비활성 대상 409 · 관리자 아님 403 · 없는 사람 404', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      expect((await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/deactivate`)).statusCode).toBe(200)
      const off = await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/reset-links`)
      expect(off.statusCode).toBe(409)
      expect(off.json().error.message).toBe(RESET_INACTIVE)
      const plain = await signup(ctx)
      expect((await admin(ctx, plain.cookie, 'POST', `/users/${me.user.id}/reset-links`)).statusCode).toBe(403)
      expect((await admin(ctx, me.cookie, 'POST', '/users/00000000-0000-4000-8000-000000000000/reset-links')).statusCode).toBe(404)
    })
  })

  it('새 링크가 앞 링크를 막는다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const first = await makeReset(ctx, me.cookie, bob.user.id)
      const second = await makeReset(ctx, me.cookie, bob.user.id)
      expect((await useReset(ctx, first)).statusCode).toBe(404)
      expect((await useReset(ctx, second)).statusCode).toBe(204)
    })
  })
})

describe('쓰기', () => {
  it('204 — 새 비밀번호로 로그인 · 옛 비밀번호 401 · 그 사람의 세션 전부 401 · API 토큰은 그대로 · 기록 둘', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const apiToken = await insertApiToken(ctx.db, { projectId: project.id, userId: bob.user.id, name: 'cli' })
      const otherSession = (await login(ctx, bob.user.email, bob.password)).cookies.find((c) => c.name === 'wb_session')!.value
      const token = await makeReset(ctx, me.cookie, bob.user.id)

      expect((await useReset(ctx, token)).statusCode).toBe(204)
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })).statusCode).toBe(401)
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: otherSession } })).statusCode).toBe(401)
      expect((await login(ctx, bob.user.email, bob.password)).statusCode).toBe(401)
      expect((await login(ctx, bob.user.email, NEW_PASSWORD)).statusCode).toBe(200)
      const viaToken = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: { authorization: `Bearer ${apiToken.value}` },
      })
      expect(viaToken.statusCode).toBe(200)
      expect((await auditActions(ctx.db)).filter((action) => action.startsWith('reset.'))).toEqual(['reset.create', 'reset.use'])
    })
  })

  it('한 번 쓰면 끝 · 24 시간 뒤 404 · 같은 문장 · 8 자 미만 400(링크는 그대로)', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const once = await makeReset(ctx, me.cookie, bob.user.id)
      expect((await useReset(ctx, once, 'short12')).statusCode).toBe(400)
      expect((await useReset(ctx, once)).statusCode).toBe(204)
      const again = await useReset(ctx, once)
      const late = await makeReset(ctx, me.cookie, carol.user.id)
      await sql`update password_resets set expires_at = now() - interval '1 second' where token_hash = ${hashTokenValue(late)}`.execute(
        ctx.db,
      )
      const expired = await useReset(ctx, late)
      const bodies = new Set([again.body, expired.body, (await ctx.app.inject({ method: 'GET', url: `/api/auth/resets/${late}` })).body])
      expect([again.statusCode, expired.statusCode]).toEqual([404, 404])
      expect([...bodies]).toEqual([JSON.stringify({ error: { code: 'not-found', message: RESET_UNUSABLE } })])
    })
  })

  it('만든 관리자가 비활성화 · 해제되면 그 링크는 404', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const leaver = await adminOf(ctx)
      const demoted = await adminOf(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const fromLeaver = await makeReset(ctx, leaver.cookie, bob.user.id)
      const fromDemoted = await makeReset(ctx, demoted.cookie, carol.user.id)
      expect((await admin(ctx, me.cookie, 'POST', `/users/${leaver.user.id}/deactivate`)).statusCode).toBe(200)
      expect((await admin(ctx, me.cookie, 'DELETE', `/users/${demoted.user.id}/admin`)).statusCode).toBe(200)
      expect((await useReset(ctx, fromLeaver)).statusCode).toBe(404)
      expect((await useReset(ctx, fromDemoted)).statusCode).toBe(404)
    })
  })
})

describe('쓰기 — 열린 연결', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('그 사람의 열린 WS 가 `revoked` 로 닫힌다', async () => {
    await withRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const probe = await joinRoom(ctx.port, project.id, bob.cookie.wb_session)
      try {
        const token = await makeReset(ctx, me.cookie, bob.user.id)
        expect((await useReset(ctx, token)).statusCode).toBe(204)
        expect(await probe.waitClosed(2_000)).toMatchObject({ code: WS_CLOSE.revoked })
      } finally {
        probe.close()
      }
    })
  })
})

describe('한 벌', () => {
  it('비밀번호를 갈고 세션을 지우는 몸통(`replacePassword`)을 부르는 자는 재설정 명령과 재설정 링크 둘이다', () => {
    expect(Object.fromEntries(callSitesByFile('replacePassword'))).toEqual({ 'db/reset-password.ts': 1, 'routes/password-reset.ts': 1 })
  })
})
