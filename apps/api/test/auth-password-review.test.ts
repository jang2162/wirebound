/**
 * **C3 리뷰 — 비밀번호 바꾸기의 겹친 판 · 한도 키**(`docs/superpowers/plans/2026-09-30-c3-review.md`). 구현 쪽 케이스는
 * `auth-password.test.ts` 가 갖는다 — 여기는 리뷰가 세운 판이다. **빨강 셋은 고치기 전 값 그대로 커밋했다**(관리자 쓰기와의 고리 둘 ·
 * 옛 비밀번호 로그인).
 *
 * **잠금 고리.** 비밀번호 바꾸기(`src/routes/auth.ts` 의 `/password`)는 «사용자 행(`UPDATE` — `FOR NO KEY UPDATE`) → 자기 세션
 * 재확인(`KEY SHARE`) → 같은 사람의 다른 세션 `DELETE`» 로 잡는다. 다른 세션(B)으로 들어온 쓰기가 «B 세션 `KEY SHARE`(커밋 직전
 * 재확인) → 사용자 행에 `FOR NO KEY UPDATE` 와 부딪히는 잠금» 차례를 가지면 고리다. 사용자 행을 그런 모드로 읽는 자리는 관리자 쓰기의
 * 재확인(`src/auth/admin.ts` 의 `recheckInstanceAdmin` — 자격 재확인 뒤 `users FOR SHARE`) 하나다. FK 검사의 `KEY SHARE`(코멘트 ·
 * 스냅샷 · 토큰 · 멤버 · 업로드의 `uploaded_by`)는 `FOR NO KEY UPDATE` 와 안 부딪힌다 — «FK 삽입은 안 기다린다» 가 값으로 잰다.
 *
 * 고리 판: B 의 관리자 쓰기를 `users … for share` 질의 앞에 붙잡는다(그때 B 는 제 세션 행을 `KEY SHARE` 로 쥐었다). 비밀번호 바꾸기를
 * 보내 그것이 B 의 백엔드 뒤에 줄 선 것(`pg_blocking_pids` 사슬)을 본 뒤 놓는다 — 줄이 안 서면 던진다. **재확인 차례를 고치면(사용자
 * 행 `FOR SHARE` 를 자격 재확인 앞으로) 이 자리에 선 B 는 세션 행을 아직 안 쥐어 판이 안 선다** — 그때는 붙잡을 질의를 세션 재확인
 * (`… for key share`)으로, 줄 선 질의를 `update "users"` 로 바꾼다(리뷰가 그 판으로 잰 값: 비밀번호 204 · 업로드 201 · 35ms).
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOGIN_LIMIT } from '../src/auth/login-limit'
import { setInstanceAdmin } from '../src/repos/users'
import { authCookie, createProject, getTestDb, resetRealData, signup, withApi, withProxiedRealApi, type SignedUpUser, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

const db = getTestDb()
const NEW_PASSWORD = 'newpassword5678'
const ADMIN_RECHECK = '"is_instance_admin" from "users" where "id" = $1 for share'

async function adminOf(ctx: TestContext): Promise<SignedUpUser> {
  const me = await signup(ctx)
  await setInstanceAdmin(ctx.db, me.user.email, true)
  return me
}

async function anotherSession(ctx: TestContext, who: SignedUpUser): Promise<{ wb_session: string }> {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: who.user.email, password: who.password }, remoteAddress: '10.0.9.9' })
  expect(res.statusCode, res.body).toBe(200)
  return authCookie(res.cookies.find((cookie) => cookie.name === 'wb_session')!.value)
}

function changePassword(ctx: TestContext, cookie: { wb_session: string }, currentPassword: string) {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/password', cookies: cookie, payload: { currentPassword, newPassword: NEW_PASSWORD } })
}

function upload(ctx: TestContext, cookie: { wb_session: string }, themeId: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/admin/theme-packages',
    headers: { 'content-type': 'application/zip' },
    cookies: cookie,
    payload: Buffer.from(packed(manifestOf(themeId, '1.0.0'))),
  })
}

/** 붙잡힌 요청의 백엔드 — 질의를 프록시에 맡긴 채 트랜잭션 안에서 논다. */
async function heldBackend(): Promise<number> {
  const rows = await sql<{ pid: number }>`
    select pid from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid() and state = 'idle in transaction'
  `.execute(db)
  if (rows.rows.length !== 1) throw new Error(`붙잡힌 백엔드가 하나가 아니다: ${rows.rows.length}`)
  return rows.rows[0]!.pid
}

/** `holder` 뒤에 사슬로 선 백엔드들의 질의. */
async function queueBehind(holder: number): Promise<string[]> {
  const result = await sql<{ query: string }>`
    with recursive chain(pid) as (
      select a.pid from pg_stat_activity a where ${holder}::int = any(pg_blocking_pids(a.pid))
      union
      select a.pid from pg_stat_activity a join chain c on c.pid = any(pg_blocking_pids(a.pid))
    )
    select a.query from pg_stat_activity a join chain c on c.pid = a.pid
  `.execute(db)
  return result.rows.map((row) => row.query)
}

async function waitQueued(holder: number, fragment: string, withinMs = 5_000): Promise<void> {
  const until = Date.now() + withinMs
  while (Date.now() < until) {
    if ((await queueBehind(holder)).some((query) => query.includes(fragment))) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`'${fragment}' 이 ${holder} 뒤에 ${withinMs}ms 안에 줄 서지 않았다 — 판이 안 섰다`)
}

/** 끝난 뒤 같은 사람의 세션 수 · 비밀번호가 바뀌었는가. */
async function sessionCount(userId: string): Promise<number> {
  const row = await db.selectFrom('sessions').select((eb) => eb.fn.countAll<string>().as('n')).where('user_id', '=', userId).executeTakeFirstOrThrow()
  return Number(row.n)
}

describe('비밀번호 바꾸기 × 다른 세션의 관리자 쓰기 — 잠금 고리', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  /**
   * **고리.** B: 제 세션 `KEY SHARE` → (붙잡힘) → 사용자 행 `FOR SHARE`. A: 사용자 행 `UPDATE` → A 세션 재확인 → B 세션 `DELETE`(B 를
   * 기다림). 놓으면 B 가 사용자 행에서 A 를 기다려 고리다 — `deadlock_timeout` 뒤 한쪽이 40P01 로 죽는다. 성질: 둘 다 5xx 가 아니다
   * (비밀번호는 바뀌고 B 쓰기는 커밋되거나 401 로 되돌아간다).
   */
  it('같은 관리자의 다른 세션이 업로드 재확인에 선 동안 비밀번호를 바꾸면 — 5xx(교착) 없이 둘 다 끝난다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await adminOf(ctx)
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const adminWrite = upload(ctx, second, 'raced')
      await hold.held
      const holder = await heldBackend()
      const started = Date.now()
      const passwordChange = changePassword(ctx, alice.cookie, alice.password)
      await waitQueued(holder, 'delete from "sessions"')
      hold.release()

      const [pw, up] = await Promise.all([passwordChange, adminWrite])
      const took = Date.now() - started
      console.log('[cycle] password', pw.statusCode, pw.body, '| upload', up.statusCode, up.body.slice(0, 200), '| took', took, 'ms | sessions', await sessionCount(alice.user.id))
      expect(pw.statusCode, pw.body).toBeLessThan(500)
      expect(up.statusCode, up.body).toBeLessThan(500)
    })
  })

  /** 숨김(`PATCH`)도 같은 재확인(`recheckInstanceAdmin`)을 지난다 — 같은 고리. 값은 이미 숨기지 않은 시스템 테마를 «숨기지 않음»으로. */
  it('같은 관리자의 다른 세션이 숨김 재확인에 선 동안 비밀번호를 바꾸면 — 5xx(교착) 없이 둘 다 끝난다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await adminOf(ctx)
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const adminWrite = ctx.app.inject({
        method: 'PATCH',
        url: `/api/admin/theme-packages/system-admin/${SYSTEM_ADMIN.version}`,
        cookies: second,
        payload: { hidden: false },
      })
      await hold.held
      const holder = await heldBackend()
      const passwordChange = changePassword(ctx, alice.cookie, alice.password)
      await waitQueued(holder, 'delete from "sessions"')
      hold.release()

      const [pw, hide] = await Promise.all([passwordChange, adminWrite])
      console.log('[cycle-hide] password', pw.statusCode, '| hide', hide.statusCode, '| sessions', await sessionCount(alice.user.id))
      expect(pw.statusCode, pw.body).toBeLessThan(500)
      expect(hide.statusCode, hide.body).toBeLessThan(500)
    })
  })

  /** **대조 — 다른 관리자(bob)의 세션.** bob 의 재확인은 bob 의 세션 · bob 의 사용자 행을 쥐어 alice 의 바꾸기와 안 부딪힌다. */
  it('대조 — 다른 관리자의 업로드가 같은 자리에 선 동안이면 비밀번호 바꾸기는 기다리지 않고 204', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await adminOf(ctx)
      const bob = await adminOf(ctx)
      await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const adminWrite = upload(ctx, bob.cookie, 'raced')
      await hold.held
      const holder = await heldBackend()
      const pw = await changePassword(ctx, alice.cookie, alice.password)
      expect(pw.statusCode, pw.body).toBe(204)
      expect(await queueBehind(holder)).toEqual([])
      hold.release()
      const up = await adminWrite
      expect(up.statusCode, up.body).toBe(201)
    })
  })

  /**
   * **FK 삽입은 안 막힌다** — 비밀번호 바꾸기가 사용자 행을 쥔 동안(재확인 질의에 붙잡음) 같은 사람의 다른 세션이 프로젝트를
   * 만든다(`project_members.user_id` FK 의 `KEY SHARE`). `UPDATE` 가 `FOR UPDATE` 로 잡았으면 여기서 선다.
   */
  it('비밀번호 바꾸기가 사용자 행을 쥔 동안 같은 사람의 FK 삽입(프로젝트 만들기)은 안 기다린다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery('"sessions" where "id" = $1 and "expires_at" > statement_timestamp() for key share')
      const passwordChange = changePassword(ctx, alice.cookie, alice.password)
      await hold.held
      const started = Date.now()
      const project = await createProject(ctx, second)
      const took = Date.now() - started
      console.log('[fk] create project took', took, 'ms')
      expect(project.id).toBeTruthy()
      hold.release()
      expect((await passwordChange).statusCode).toBe(204)
    })
  })
})

/**
 * **옛 비밀번호로 막 로그인한 세션이 바꾸기 뒤에 남는가.** 로그인은 비밀번호를 견준 뒤(트랜잭션 밖) 세션 행을 넣는다. 그 사이에
 * 바꾸기가 커밋되면 바꾸기의 `DELETE` 는 아직 없는 행을 못 지우고, 로그인은 옛 비밀번호로 견준 결과로 세션을 낸다.
 */
describe('비밀번호 바꾸기 × 옛 비밀번호 로그인', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('옛 비밀번호로 견준 로그인이 세션 삽입 앞에 선 사이 바꾸기가 커밋되면 — 그 로그인은 세션을 못 낸다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const hold = ctx.proxy.holdQuery('insert into "sessions"')
      const lateLogin = ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: alice.user.email, password: alice.password }, remoteAddress: '10.0.8.8' })
      await hold.held
      const pw = await changePassword(ctx, alice.cookie, alice.password)
      expect(pw.statusCode, pw.body).toBe(204)
      hold.release()
      const res = await lateLogin
      const cookie = res.cookies.find((c) => c.name === 'wb_session')?.value
      const me = cookie === undefined ? null : await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: authCookie(cookie) })
      console.log('[toctou] late login', res.statusCode, '| its /me', me?.statusCode, '| sessions', await sessionCount(alice.user.id))
      expect(me?.statusCode ?? 401, '옛 비밀번호로 낸 세션이 바꾸기 뒤에 산다').toBe(401)
    })
  })
})

/**
 * **지운 세션이 쓰기를 들고 있던 판**(브리프 확인 3). 재확인(`recheckAtCommit` — 세션 `KEY SHARE` → 멤버 `FOR SHARE`)의 어디에 섰느냐로
 * 갈린다: 세션 행을 잡기 **전**이면 바꾸기는 안 기다리고, 그 쓰기는 재확인에서 지워진 세션을 보고 401 로 되돌아간다. 잡은 **뒤**면
 * 바꾸기의 `DELETE` 가 그 커밋을 기다린다(`src/auth/roles.ts` 의 `recheckAtCommit` 머리말 «재확인 뒤 커밋까지만») — 그 쓰기는 200 이고
 * 세션은 그 뒤에 지워진다.
 */
describe('비밀번호 바꾸기 × 지운 세션이 들고 있던 쓰기', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const SESSION_RECHECK = '"sessions" where "id" = $1 and "expires_at" > statement_timestamp() for key share'
  const MEMBER_RECHECK = 'from "project_members" where "project_id" = $1 and "user_id" = $2 for share'

  function rename(ctx: TestContext, cookie: { wb_session: string }, projectId: string, name: string) {
    return ctx.app.inject({ method: 'PATCH', url: `/api/projects/${projectId}`, cookies: cookie, payload: { name } })
  }

  async function projectName(projectId: string): Promise<string> {
    return (await db.selectFrom('projects').select('name').where('id', '=', projectId).executeTakeFirstOrThrow()).name
  }

  it('세션 재확인 앞에 선 쓰기 — 바꾸기는 안 기다리고 204, 그 쓰기는 401 이고 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie, { name: '처음 이름' })
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery(SESSION_RECHECK)
      const write = rename(ctx, second, project.id, '늦은 이름')
      await hold.held
      const pw = await changePassword(ctx, alice.cookie, alice.password)
      expect(pw.statusCode, pw.body).toBe(204)
      hold.release()
      const res = await write
      expect(res.statusCode, res.body).toBe(401)
      expect(await projectName(project.id)).toBe('처음 이름')
    })
  })

  it('세션을 잡은 뒤(멤버 재확인)에 선 쓰기 — 바꾸기가 그 커밋을 기다리고, 쓰기 200 · 바꾸기 204 · 그 세션은 끝난다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie, { name: '처음 이름' })
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery(MEMBER_RECHECK)
      const write = rename(ctx, second, project.id, '늦은 이름')
      await hold.held
      const holder = await heldBackend()
      const passwordChange = changePassword(ctx, alice.cookie, alice.password)
      await waitQueued(holder, 'delete from "sessions"')
      hold.release()
      const [res, pw] = await Promise.all([write, passwordChange])
      expect(res.statusCode, res.body).toBe(200)
      expect(pw.statusCode, pw.body).toBe(204)
      expect(await projectName(project.id)).toBe('늦은 이름')
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: second })).statusCode).toBe(401)
    })
  })
})

/**
 * **한도 키**(브리프 확인 2). 로그인은 본문 이메일을 `NormalizedEmail`(소문자 — ASCII 만 받는다)로 편 값을, 바꾸기는 세션의 사용자
 * 행 이메일(시딩이 같은 규칙으로 넣은 값)을 `limiter.begin` 에 넘긴다. 둘이 같은 키인지는 대문자로 친 로그인으로 잰다.
 */
describe('비밀번호 바꾸기 — 한도 키와 성공', () => {
  const WRONG = '틀린비밀번호1234'

  it('대문자로 친 이메일의 로그인 실패도 바꾸기와 같은 계정 키에 센다 — 옳은 지금 비밀번호가 429', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const shouted = alice.user.email.toUpperCase()
      expect(shouted).not.toBe(alice.user.email)
      for (let i = 0; i < LOGIN_LIMIT.perAccount; i++) {
        const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: shouted, password: WRONG }, remoteAddress: `10.1.0.${i + 1}` })
        expect(res.statusCode, `${i + 1}번째`).toBe(401)
      }
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/password',
        cookies: alice.cookie,
        payload: { currentPassword: alice.password, newPassword: NEW_PASSWORD },
        remoteAddress: '10.1.9.9',
      })
      expect(res.statusCode, res.body).toBe(429)
    })
  })

  it('바꾸기의 성공은 앞선 실패를 안 지운다 — 한도 − 1 번 틀린 뒤 성공해도 한 번 더 틀리면 막힌다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const send = (currentPassword: string, newPassword: string) =>
        ctx.app.inject({ method: 'POST', url: '/api/auth/password', cookies: alice.cookie, payload: { currentPassword, newPassword }, remoteAddress: '10.2.0.1' })
      for (let i = 0; i < LOGIN_LIMIT.perAccount - 1; i++) expect((await send(WRONG, NEW_PASSWORD)).statusCode).toBe(401)
      expect((await send(alice.password, NEW_PASSWORD)).statusCode).toBe(204)
      expect((await send(WRONG, 'anotherpassword1')).statusCode).toBe(401)
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: alice.user.email, password: NEW_PASSWORD }, remoteAddress: '10.2.0.2' })
      expect(res.statusCode, res.body).toBe(429)
    })
  })
})
