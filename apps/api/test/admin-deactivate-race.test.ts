/**
 * **비활성화가 겹친 판**(`src/routes/admin-users.ts` 머리말 «잠금 차례» · `src/repos/users.ts` 의 `lockUserRows`).
 *
 * - **로그인** — 견준 뒤 · 넣기 전의 로그인과 비활성화(지침 «다른 세션을 끝낸다»는 그 쓰기의 커밋 뒤에 태어나는 세션을 센다). 세션 삽입이
 *   비활성 표시를 해시와 같은 `FOR SHARE` 문장에서 본다(`auth/session.ts` 의 `createLoginSession`).
 * - **비밀번호 바꾸기 · 그 사람이 낸 관리자 쓰기** — 두 차례(그쪽이 사용자 행을 먼저 쥔 판 · 비활성화가 먼저 쥔 판) 모두 교착 0.
 * - **그 사람이 제 링크를 거두는 중** — 거두기가 재확인을 쓰기 **앞**에 두어(«사용자 행 → 링크 행») 비활성화의 «사용자 행 → 링크 행» 과
 *   고리가 없다. 재확인을 쓰기 뒤로 옮기면 교착이다(변조로 잰다 — 보고 «혼자 죽는 변조»).
 *
 * 판은 한쪽을 한 질의 앞에 붙잡고(`holdQuery`) 다른 쪽을 보낸 뒤, 그것이 끝났는지 붙잡힌 백엔드 뒤에 줄 섰는지(`pg_blocking_pids` 사슬)를
 * 본 뒤 놓는다 — 둘 다 아니면 던진다. 교착은 `pg_stat_database.deadlocks` 의 앞뒤 차로 센다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { admin, adminOf, deadlockCount, heldBackend, makeInvite, settledOrQueued } from './accounts-fixtures'
import { getTestDb, resetRealData, signup, withProxiedRealApi, type SignedUpUser, type TestContext } from './helpers'

const db = getTestDb()
const LOGIN_INSERT = 'insert into "sessions"'
const ADMIN_RECHECK = '"is_instance_admin" from "users" where "id" = $1 for share'
const SESSION_RECHECK = '"sessions" where "id" = $1 and "expires_at" > statement_timestamp() for key share'
const INVITE_INSERT = 'insert into "invites"'

beforeEach(resetRealData)
afterEach(resetRealData)

const deactivate = (ctx: TestContext, cookie: SignedUpUser['cookie'], userId: string) =>
  admin(ctx, cookie, 'POST', `/users/${userId}/deactivate`)

function login(ctx: TestContext, who: SignedUpUser, password: string, remoteAddress: string) {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: who.user.email, password }, remoteAddress })
}

async function sessionCount(userId: string): Promise<number> {
  const row = await sql<{ n: string }>`select count(*)::text as n from sessions where user_id = ${userId}`.execute(db)
  return Number(row.rows[0]!.n)
}

async function isActive(userId: string): Promise<boolean> {
  const row = await db.selectFrom('users').select('deactivated_at').where('id', '=', userId).executeTakeFirstOrThrow()
  return row.deactivated_at === null
}

describe('견준 뒤 · 넣기 전의 로그인 × 비활성화', () => {
  it('로그인이 세션 삽입 앞에 선 사이 비활성화가 커밋되면 — 그 로그인은 틀린 비밀번호와 같은 401 이고 세션이 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const wrong = await login(ctx, bob, 'not-the-password', '10.5.0.1')
      const hold = ctx.proxy.holdQuery(LOGIN_INSERT)
      const late = login(ctx, bob, bob.password, '10.5.0.2')
      await hold.held
      const res = await deactivate(ctx, me.cookie, bob.user.id)
      expect(res.statusCode, res.body).toBe(200)
      hold.release()
      const got = await late
      console.log('[deactivate × late login]', got.statusCode, '| sessions', await sessionCount(bob.user.id))
      expect(got.statusCode).toBe(401)
      expect(got.body).toBe(wrong.body)
      expect(await sessionCount(bob.user.id)).toBe(0)
    })
  })

  it('비활성화가 세션을 지우고 커밋 앞에 선 동안 로그인의 삽입이 돌면 — 그 커밋을 기다리고 401', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const hold = ctx.proxy.holdQuery('insert into "admin_audit"')
      const write = deactivate(ctx, me.cookie, bob.user.id)
      await hold.held
      const holder = await heldBackend(db)
      const late = login(ctx, bob, bob.password, '10.5.0.3')
      const waited = await settledOrQueued(db, late, holder, LOGIN_INSERT)
      hold.release()
      const [res, got] = await Promise.all([write, late])
      expect(res.statusCode, res.body).toBe(200)
      expect(got.statusCode).toBe(401)
      expect(await sessionCount(bob.user.id)).toBe(0)
      expect(waited).toBe('queued')
    })
  })
})

describe('비활성화 × 그 사람의 비밀번호 바꾸기 — 두 차례 모두 교착 0', () => {
  function change(ctx: TestContext, bob: SignedUpUser) {
    return ctx.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      cookies: bob.cookie,
      payload: { currentPassword: bob.password, newPassword: 'brandnew5678' },
      remoteAddress: '10.5.1.1',
    })
  }

  it('바꾸기가 사용자 행을 쥔 판 — 비활성화가 그 행에서 줄을 서고, 바꾸기 204 · 비활성화 200 · 세션 0', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(SESSION_RECHECK)
      const changing = change(ctx, bob)
      await hold.held
      const holder = await heldBackend(db)
      const write = deactivate(ctx, me.cookie, bob.user.id)
      const waited = await settledOrQueued(db, write, holder, 'for no key update')
      hold.release()
      const [changed, res] = await Promise.all([changing, write])
      expect([changed.statusCode, res.statusCode]).toEqual([204, 200])
      expect(await isActive(bob.user.id)).toBe(false)
      expect(await sessionCount(bob.user.id)).toBe(0)
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(waited).toBe('queued')
    })
  })

  it('비활성화가 사용자 행을 쥔 판 — 바꾸기가 그 행에서 줄을 서고, 비활성화 200 · 바꾸기 401(제 세션이 지워졌다)', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const write = deactivate(ctx, me.cookie, bob.user.id)
      await hold.held
      const holder = await heldBackend(db)
      const changing = change(ctx, bob)
      const waited = await settledOrQueued(db, changing, holder, '"password_hash"')
      hold.release()
      const [res, changed] = await Promise.all([write, changing])
      expect([res.statusCode, changed.statusCode]).toEqual([200, 401])
      expect(await isActive(bob.user.id)).toBe(false)
      expect(await sessionCount(bob.user.id)).toBe(0)
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(waited).toBe('queued')
    })
  })
})

describe('비활성화 × 그 사람이 낸 관리자 쓰기 — 두 차례 모두 교착 0', () => {
  function invite(ctx: TestContext, bob: SignedUpUser) {
    return admin(ctx, bob.cookie, 'POST', '/invites', { name: '퇴사 직전', kind: 'multi' })
  }

  it('그 쓰기가 사용자 행 · 자격을 쥔 판 — 비활성화가 줄을 서고, 쓰기 201 뒤 비활성화가 그 링크까지 거둔다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await adminOf(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(INVITE_INSERT)
      const writing = invite(ctx, bob)
      await hold.held
      const holder = await heldBackend(db)
      const write = deactivate(ctx, me.cookie, bob.user.id)
      const waited = await settledOrQueued(db, write, holder, 'for no key update')
      hold.release()
      const [made, res] = await Promise.all([writing, write])
      expect([made.statusCode, res.statusCode]).toEqual([201, 200])
      expect(res.json().revokedLinks).toBe(1)
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(waited).toBe('queued')
    })
  })

  it('비활성화가 사용자 행을 쥔 판 — 그 쓰기의 재확인이 줄을 서고, 비활성화 200 · 쓰기는 401/403 으로 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await adminOf(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const write = deactivate(ctx, me.cookie, bob.user.id)
      await hold.held
      const holder = await heldBackend(db)
      const writing = invite(ctx, bob)
      const waited = await settledOrQueued(db, writing, holder, ADMIN_RECHECK)
      hold.release()
      const [res, made] = await Promise.all([write, writing])
      expect(res.statusCode, res.body).toBe(200)
      expect([401, 403]).toContain(made.statusCode)
      expect(await db.selectFrom('invites').select('id').execute()).toEqual([])
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(waited).toBe('queued')
    })
  })
})

describe('그 사람이 제 링크를 거두는 중 × 비활성화', () => {
  it('거두기가 재확인 앞에 선 사이 비활성화가 끝나고, 거두기는 401/403 · 교착 0', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await adminOf(ctx)
      const { id } = await makeInvite(ctx, bob.cookie, { kind: 'multi' })
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const revoking = admin(ctx, bob.cookie, 'POST', `/invites/${id}/revoke`)
      await hold.held
      const holder = await heldBackend(db)
      const write = deactivate(ctx, me.cookie, bob.user.id)
      const waited = await settledOrQueued(db, write, holder, '"invites"')
      hold.release()
      const [res, revoked] = await Promise.all([write, revoking])
      console.log(
        '[revoke × deactivate]',
        res.statusCode,
        revoked.statusCode,
        '| waited',
        waited,
        '| deadlocks',
        (await deadlockCount(db)) - before,
      )
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().revokedLinks).toBe(1)
      expect([401, 403]).toContain(revoked.statusCode)
      expect(waited).toBe('settled')
    })
  })
})
