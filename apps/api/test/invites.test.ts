/**
 * **초대 링크 · 가입**(`src/repos/invites.ts` · `src/routes/admin-invites.ts` · `src/routes/invite-signup.ts`). 겹친 가입은
 * `invite-signup-race.test.ts` 가 잰다.
 */
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { LOGIN_LIMIT } from '../src/auth/login-limit'
import { hashTokenValue } from '../src/auth/token-hash'
import { EMAIL_TAKEN, INVITE_UNUSABLE } from '../src/routes/invite-signup'
import { admin, adminOf, auditActions, cookieOf, joinWith, makeInvite, tableContains } from './accounts-fixtures'
import { signup, withApi, type TestContext } from './helpers'

function check(ctx: TestContext, token: string) {
  return ctx.app.inject({ method: 'GET', url: `/api/auth/invites/${token}` })
}

describe('만들기 · 목록', () => {
  it('만들기 201 이 원문을 내고, DB 에는 해시만 있다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { id, token } = await makeInvite(ctx, me.cookie, { name: '디자인팀', kind: 'multi' })
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(await tableContains(ctx.db, 'invites', token)).toBe(false)
      expect(await tableContains(ctx.db, 'invites', hashTokenValue(token))).toBe(true)
      const row = await ctx.db.selectFrom('invites').select(['name', 'kind', 'created_by']).where('id', '=', id).executeTakeFirstOrThrow()
      expect(row).toEqual({ name: '디자인팀', kind: 'multi', created_by: me.user.id })
      expect(await auditActions(ctx.db)).toEqual(['admin.grant', 'invite.create'])
    })
  })

  it('목록에는 원문도 해시도 없다 — 칸이 계약 그대로다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { token } = await makeInvite(ctx, me.cookie)
      const res = await admin(ctx, me.cookie, 'GET', '/invites')
      expect(res.statusCode).toBe(200)
      expect(res.body).not.toContain(token)
      expect(res.body).not.toContain(hashTokenValue(token))
      const [item] = res.json()
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'createdBy', 'expiresAt', 'id', 'kind', 'name', 'signups', 'state'])
      expect(item.createdBy).toEqual({ id: me.user.id, name: me.user.name })
      expect(item.state).toBe('usable')
    })
  })

  it('만료 기본 7 일 · 고른 일수 · 범위 밖(0 · 91) · 빈 이름은 400', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const days = async (body: Record<string, unknown>): Promise<number> => {
        const res = await admin(ctx, me.cookie, 'POST', '/invites', { name: '팀', kind: 'single', ...body })
        expect(res.statusCode, res.body).toBe(201)
        return Math.round((Date.parse(res.json().invite.expiresAt) - Date.now()) / 86_400_000)
      }
      expect(await days({})).toBe(7)
      expect(await days({ expiresInDays: 30 })).toBe(30)
      for (const body of [{ expiresInDays: 0 }, { expiresInDays: 91 }, { name: '  ' }, { kind: 'many' }]) {
        expect(
          (await admin(ctx, me.cookie, 'POST', '/invites', { name: '팀', kind: 'single', ...body })).statusCode,
          JSON.stringify(body),
        ).toBe(400)
      }
    })
  })

  it('관리자 아님 403 — 만들기 · 목록 · 거두기', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { id } = await makeInvite(ctx, me.cookie)
      const plain = await signup(ctx)
      expect((await admin(ctx, plain.cookie, 'POST', '/invites', { name: '팀', kind: 'single' })).statusCode).toBe(403)
      expect((await admin(ctx, plain.cookie, 'GET', '/invites')).statusCode).toBe(403)
      expect((await admin(ctx, plain.cookie, 'POST', `/invites/${id}/revoke`)).statusCode).toBe(403)
    })
  })
})

describe('못 쓰는 링크 넷 — 같은 404 · 같은 몸', () => {
  it('없음 · 만료 · 거둠 · 다 씀 이 확인 · 가입 모두에서 같은 404 몸이다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const expired = await makeInvite(ctx, me.cookie, { kind: 'multi' })
      await sql`update invites set expires_at = now() - interval '1 minute' where id = ${expired.id}`.execute(ctx.db)
      const revoked = await makeInvite(ctx, me.cookie, { kind: 'multi' })
      expect((await admin(ctx, me.cookie, 'POST', `/invites/${revoked.id}/revoke`)).statusCode).toBe(200)
      const usedUp = await makeInvite(ctx, me.cookie, { kind: 'single' })
      expect((await joinWith(ctx, usedUp.token)).statusCode).toBe(201)
      const tokens = { 없음: 'A'.repeat(43), 만료: expired.token, 거둠: revoked.token, '다 씀': usedUp.token }

      const bodies = new Set<string>()
      for (const [label, token] of Object.entries(tokens)) {
        const got = await check(ctx, token)
        const joined = await joinWith(ctx, token)
        expect([got.statusCode, joined.statusCode], label).toEqual([404, 404])
        bodies.add(got.body)
        bodies.add(joined.body)
      }
      expect([...bodies]).toEqual([JSON.stringify({ error: { code: 'not-found', message: INVITE_UNUSABLE } })])
      const states = (await admin(ctx, me.cookie, 'GET', '/invites')).json().map((item: { state: string }) => item.state)
      expect(states.sort()).toEqual(['expired', 'revoked', 'used-up'])
    })
  })
})

describe('가입', () => {
  it('201 — `/login` 과 같은 몸 · 세션 쿠키 · `/me` 200 · 사용자 행의 `invite_id` · 기록', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { id, token } = await makeInvite(ctx, me.cookie, { name: '디자인팀' })
      expect((await check(ctx, token)).json()).toEqual({ usable: true })
      const res = await joinWith(ctx, token, { email: 'New@Example.com', name: '새 사람' })
      expect(res.statusCode, res.body).toBe(201)
      const body = res.json()
      expect(body).toEqual({ id: body.id, email: 'new@example.com', name: '새 사람', isInstanceAdmin: false })
      const mine = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: cookieOf(res) })
      expect(mine.statusCode).toBe(200)
      expect(mine.json().email).toBe('new@example.com')
      const row = await ctx.db
        .selectFrom('users')
        .select(['invite_id', 'is_instance_admin'])
        .where('id', '=', body.id)
        .executeTakeFirstOrThrow()
      expect(row).toEqual({ invite_id: id, is_instance_admin: false })
      const audit = (await admin(ctx, me.cookie, 'GET', '/audit?action=invite.signup')).json().entries
      expect(audit).toHaveLength(1)
      expect(audit[0]).toMatchObject({
        actor: { kind: 'user', id: body.id },
        targetUser: { id: body.id, email: 'new@example.com' },
        invite: { id, name: '디자인팀' },
        detail: { inviteCreatedBy: me.user.id },
      })
      const listed = (await admin(ctx, me.cookie, 'GET', '/invites')).json()
      expect(listed[0]).toMatchObject({ id, signups: 1, state: 'usable' })
    })
  })

  it('`single` 은 둘째 가입이 404, `multi` 는 만료 전 여러 번', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const single = await makeInvite(ctx, me.cookie, { kind: 'single' })
      expect((await joinWith(ctx, single.token)).statusCode).toBe(201)
      expect((await joinWith(ctx, single.token)).statusCode).toBe(404)
      const multi = await makeInvite(ctx, me.cookie, { kind: 'multi' })
      for (let i = 0; i < 3; i += 1) expect((await joinWith(ctx, multi.token)).statusCode).toBe(201)
      const listed = (await admin(ctx, me.cookie, 'GET', '/invites')).json() as { kind: string; signups: number; state: string }[]
      expect(listed.map((item) => [item.kind, item.signups, item.state])).toEqual([
        ['multi', 3, 'usable'],
        ['single', 1, 'used-up'],
      ])
    })
  })

  it('이미 있는 이메일은 409 — 계정은 그대로이고 `single` 링크는 다 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const existing = await signup(ctx)
      const single = await makeInvite(ctx, me.cookie, { kind: 'single' })
      const res = await joinWith(ctx, single.token, { email: existing.user.email.toUpperCase() })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.message).toBe(EMAIL_TAKEN)
      expect(res.cookies).toEqual([])
      expect((await check(ctx, single.token)).statusCode).toBe(200)
    })
  })

  it('본문이 틀리면 400 — 비밀번호 8 자 미만 · 이름 없음 · 모르는 칸', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { token } = await makeInvite(ctx, me.cookie)
      for (const payload of [
        { email: 'a@example.com', name: '가', password: 'short12' },
        { email: 'a@example.com', name: '', password: 'password1234' },
        { email: 'a@example.com', name: '가', password: 'password1234', isInstanceAdmin: true },
      ]) {
        const res = await ctx.app.inject({ method: 'POST', url: `/api/auth/invites/${token}/signup`, payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(400)
      }
      expect((await check(ctx, token)).statusCode).toBe(200)
    })
  })

  it('로그인 한도에 센다 — 한 주소에서 못 쓰는 링크를 한도만큼 대면 다음은 429, 옳은 링크도', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { token } = await makeInvite(ctx, me.cookie)
      const address = '10.99.0.1'
      for (let i = 0; i < LOGIN_LIMIT.perAddress; i += 1) {
        expect((await joinWith(ctx, `bogus-${i}`, { email: `try${i}@example.com` }, address)).statusCode).toBe(404)
      }
      const limited = await joinWith(ctx, token, { email: 'late@example.com' }, address)
      expect(limited.statusCode).toBe(429)
      expect(limited.headers['retry-after']).toBeDefined()
      // 다른 주소는 그대로 받는다 — 막은 것은 그 주소다.
      expect((await joinWith(ctx, token, { email: 'late@example.com' }, '10.99.0.2')).statusCode).toBe(201)
    })
  })
})

describe('거두기', () => {
  it('200 · 상태 «거둠» · 기록 — 다시 거두면 409, 없는 링크 404', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { id } = await makeInvite(ctx, me.cookie, { name: '거둘 것' })
      const res = await admin(ctx, me.cookie, 'POST', `/invites/${id}/revoke`)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().invite).toMatchObject({ id, state: 'revoked' })
      expect((await admin(ctx, me.cookie, 'POST', `/invites/${id}/revoke`)).statusCode).toBe(409)
      expect((await admin(ctx, me.cookie, 'POST', `/invites/00000000-0000-4000-8000-000000000000/revoke`)).statusCode).toBe(404)
      expect(await auditActions(ctx.db)).toEqual(['admin.grant', 'invite.create', 'invite.revoke'])
    })
  })

  it('거둔 링크로 이미 만든 계정은 그대로다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { id, token } = await makeInvite(ctx, me.cookie)
      const joined = await joinWith(ctx, token)
      expect((await admin(ctx, me.cookie, 'POST', `/invites/${id}/revoke`)).statusCode).toBe(200)
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: cookieOf(joined) })).statusCode).toBe(200)
    })
  })
})
