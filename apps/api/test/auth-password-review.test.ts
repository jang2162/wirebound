/**
 * **C3 리뷰 — 비밀번호 바꾸기의 겹친 판 · 한도 키**(`docs/superpowers/plans/2026-09-30-c3-review.md` · 대응
 * `docs/superpowers/plans/2026-09-30-c3-fix-report.md`). 구현 쪽 케이스는 `auth-password.test.ts` 가 갖는다 — 여기는 리뷰가 세운 판이다.
 *
 * **잠금 차례.** 비밀번호 바꾸기(`src/routes/auth.ts` 의 `/password`)와 재설정 명령(`src/db/reset-password.ts`)은 «사용자 행(`UPDATE` —
 * `FOR NO KEY UPDATE`) → 같은 사람의 세션 `DELETE`» 로 잡는다. 관리자 쓰기의 재확인(`src/auth/admin.ts` 의 `recheckInstanceAdmin`)도
 * «사용자 행 `FOR SHARE` → 자격(세션 `KEY SHARE`)» 이라 둘이 사용자 행에서 줄을 선다. 그 재확인이 «자격 → 사용자 행» 이던 판에서는 같은
 * 관리자의 다른 세션(B)이 낸 업로드 · 숨김과 고리가 서서 한쪽이 40P01 로 죽었다 — «재확인 앞» 판이 그 값(바꾸기 500 · 명령이 던짐)으로
 * 죽는다. FK 검사의 `KEY SHARE`(코멘트 · 스냅샷 · 토큰 · 멤버 · 업로드의 `uploaded_by`)는 `FOR NO KEY UPDATE` 와 안 부딪힌다 — «FK
 * 삽입은 안 기다린다» 가 값으로 잰다.
 *
 * 판은 B 의 관리자 쓰기를 한 질의 앞에 붙잡고(`holdQuery`) 바꾸기 · 재설정을 보낸 뒤, 그것이 끝났는지 B 의 백엔드 뒤에 줄 섰는지
 * (`pg_blocking_pids` 사슬)를 본 뒤 놓는다 — 둘 다 아니면 던진다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOGIN_LIMIT } from '../src/auth/login-limit'
import { resetPassword } from '../src/db/reset-password'
import { isInstanceAdmin, setInstanceAdmin } from '../src/repos/users'
import { authCookie, createProject, getTestDb, resetRealData, signup, testConfig, withApi, withProxiedRealApi, type SignedUpUser, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'

const db = getTestDb()
const NEW_PASSWORD = 'newpassword5678'
const ADMIN_RECHECK = '"is_instance_admin" from "users" where "id" = $1 for share'
const SESSION_RECHECK = '"sessions" where "id" = $1 and "expires_at" > statement_timestamp() for key share'

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

/** `write` 가 끝나거나 `holder` 뒤에 줄 설 때까지 — 어느 쪽이었는지. */
async function settledOrQueued(write: Promise<unknown>, holder: number, withinMs = 5_000): Promise<'settled' | 'queued'> {
  let settled = false
  void write.then(
    () => (settled = true),
    () => (settled = true),
  )
  const until = Date.now() + withinMs
  while (Date.now() < until) {
    if (settled) return 'settled'
    if ((await queueBehind(holder)).length > 0) return 'queued'
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${withinMs}ms 안에 끝나지도 줄 서지도 않았다 — 판이 안 섰다`)
}

/** 끝난 뒤 같은 사람의 세션 수 · 비밀번호가 바뀌었는가. */
async function sessionCount(userId: string): Promise<number> {
  const row = await db.selectFrom('sessions').select((eb) => eb.fn.countAll<string>().as('n')).where('user_id', '=', userId).executeTakeFirstOrThrow()
  return Number(row.n)
}

describe('비밀번호 바꾸기 · 재설정 × 다른 세션의 관리자 쓰기 — 잠금 차례', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  type AdminWriteKind = 'upload' | 'hide'
  type UserRowWriter = 'password' | 'reset'

  /** 관리자 쓰기 — 업로드는 새 패키지를, 숨김은 앞서 올린 패키지(`hideme`)를 숨긴다. */
  function adminWrite(ctx: TestContext, kind: AdminWriteKind, cookie: { wb_session: string }) {
    if (kind === 'upload') return upload(ctx, cookie, 'raced')
    return ctx.app.inject({ method: 'PATCH', url: '/api/admin/theme-packages/hideme/1.0.0', cookies: cookie, payload: { hidden: true } })
  }

  /** 관리자 쓰기가 남긴 것 — 업로드는 그 행이 있는가, 숨김은 숨겨졌는가. */
  async function adminWriteLanded(kind: AdminWriteKind): Promise<boolean> {
    if (kind === 'upload') return (await db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'raced').executeTakeFirst()) !== undefined
    const row = await db.selectFrom('theme_packages').select('hidden_at').where('theme_id', '=', 'hideme').executeTakeFirstOrThrow()
    return row.hidden_at !== null
  }

  /** 사용자 행을 고치고 세션을 지우는 쓰기 — 웹의 바꾸기(A 세션만 남긴다) 또는 재설정 명령(전부 지운다). */
  async function userRowWrite(ctx: TestContext, writer: UserRowWriter, alice: SignedUpUser): Promise<number> {
    if (writer === 'password') return (await changePassword(ctx, alice.cookie, alice.password)).statusCode
    const outcome = await resetPassword(db, alice.user.email, NEW_PASSWORD, testConfig().passwordScryptN)
    return outcome.kind === 'updated' ? 204 : 404
  }

  async function standUp(ctx: TestContext, kind: AdminWriteKind): Promise<{ alice: SignedUpUser; second: { wb_session: string } }> {
    const alice = await adminOf(ctx)
    if (kind === 'hide') expect((await upload(ctx, alice.cookie, 'hideme')).statusCode).toBe(201)
    const second = await anotherSession(ctx, alice)
    return { alice, second }
  }

  const CASES: [AdminWriteKind, UserRowWriter][] = [
    ['upload', 'password'],
    ['hide', 'password'],
    ['upload', 'reset'],
    ['hide', 'reset'],
  ]

  /**
   * **재확인 앞 — 관리자 쓰기가 사용자 행 `FOR SHARE` 앞에 선 판**(리뷰가 R1 을 잰 자리). 관리자 재확인이 «자격 → 사용자 행» 이던
   * 판에서는 B 가 이 자리에서 제 세션을 쥐고 있어, 사용자 행을 쥔 바꾸기 · 재설정의 세션 `DELETE` 가 B 를 기다리고 B 는 사용자 행에서
   * 그것을 기다려 고리다(40P01 — 바꾸기 500 · 재설정 명령이 던짐). 차례가 «사용자 행 → 자격» 이면 B 는 여기서 아무 세션도 안 쥐어
   * 바꾸기는 기다리지 않고 204, B 는 지워진 세션을 재확인에서 보고 401 로 되돌아간다.
   */
  for (const [kind, writer] of CASES) {
    it(`${writer === 'password' ? '비밀번호 바꾸기' : '재설정 명령'} × 같은 관리자의 다른 세션이 ${kind === 'upload' ? '업로드' : '숨김'} 재확인 앞에 선 판 — 안 기다리고 204, 그 쓰기는 401 로 안 남는다`, async () => {
      await withProxiedRealApi(async (ctx) => {
        const { alice, second } = await standUp(ctx, kind)
        const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
        const write = adminWrite(ctx, kind, second)
        await hold.held
        const holder = await heldBackend()
        const change = userRowWrite(ctx, writer, alice)
        const waited = await settledOrQueued(change, holder)
        hold.release()
        const [changed, res] = await Promise.all([change.catch((error: unknown) => `threw: ${String(error)}`), write])
        console.log(`[order-before ${kind}/${writer}]`, changed, '| admin write', res.statusCode, '| waited', waited, '| sessions', await sessionCount(alice.user.id))
        expect(changed).toBe(204)
        expect(res.statusCode, res.body).toBe(401)
        expect(waited).toBe('settled')
        expect(await adminWriteLanded(kind)).toBe(false)
        expect(await sessionCount(alice.user.id)).toBe(writer === 'password' ? 1 : 0)
      })
    })
  }

  /**
   * **사용자 행을 쥔 뒤 — 관리자 쓰기가 사용자 행 `FOR SHARE` 를 잡고 세션 재확인(`… for key share`)에 선 판.** 고친 차례가 연 판이다:
   * 바꾸기 · 재설정의 `update "users"` 가 B 뒤에 줄 선다(사슬로 본다). 놓으면 B 가 제 세션을 잡고 커밋하고, 바꾸기 · 재설정이 그 뒤에
   * 사용자 행을 고치고 B 의 세션까지 지운다 — 고리가 없다. 옛 차례에서는 B 가 이 자리에서 사용자 행을 안 쥐어 판이 안 선다(«줄 서지
   * 않았다»로 던진다 — 판 카나리아).
   */
  for (const [kind, writer] of CASES) {
    it(`${writer === 'password' ? '비밀번호 바꾸기' : '재설정 명령'} × 같은 관리자의 다른 세션이 ${kind === 'upload' ? '업로드' : '숨김'} 의 사용자 행을 쥔 판 — 그 커밋을 기다리고 둘 다 끝난다`, async () => {
      await withProxiedRealApi(async (ctx) => {
        const { alice, second } = await standUp(ctx, kind)
        const hold = ctx.proxy.holdQuery(SESSION_RECHECK)
        const write = adminWrite(ctx, kind, second)
        await hold.held
        const holder = await heldBackend()
        const started = Date.now()
        const change = userRowWrite(ctx, writer, alice)
        await waitQueued(holder, 'update "users"')
        hold.release()
        const [changed, res] = await Promise.all([change.catch((error: unknown) => `threw: ${String(error)}`), write])
        console.log(`[order-after ${kind}/${writer}]`, changed, '| admin write', res.statusCode, '| took', Date.now() - started, 'ms | sessions', await sessionCount(alice.user.id))
        expect(changed).toBe(204)
        expect(res.statusCode, res.body).toBe(kind === 'upload' ? 201 : 200)
        expect(await adminWriteLanded(kind)).toBe(true)
        expect(await sessionCount(alice.user.id)).toBe(writer === 'password' ? 1 : 0)
      })
    })
  }


  /**
   * **고친 차례가 연 판의 나머지 쌍 — 사용자 행을 잡는 강등(`setInstanceAdmin` · 한 문장)과 세션 행을 지우는 로그아웃(한 문장).** 둘 다
   * 잠금 하나로 끝나 고리는 못 만든다 — 기다림의 모양만 잰다. 강등은 관리자 쓰기가 쥔 사용자 행 `FOR SHARE` 뒤에 줄 서고 그 커밋을
   * 기다린다(«여기가 먼저 잡으면 강등이 이 커밋을 기다린다» — `src/auth/admin.ts`). 로그아웃은 B 가 아직 제 세션을 안 쥐어 안 기다리고,
   * B 는 재확인에서 지워진 세션을 보고 401 이다.
   */
  it('강등 × 같은 관리자의 업로드가 사용자 행을 쥔 판 — 강등이 그 커밋을 기다리고 업로드 201 · 강등 뒤 관리자 아님', async () => {
    await withProxiedRealApi(async (ctx) => {
      const { alice, second } = await standUp(ctx, 'upload')
      const hold = ctx.proxy.holdQuery(SESSION_RECHECK)
      const write = adminWrite(ctx, 'upload', second)
      await hold.held
      const holder = await heldBackend()
      const revoke = setInstanceAdmin(db, alice.user.email, false)
      await waitQueued(holder, 'update "users"')
      hold.release()
      const [revoked, res] = await Promise.all([revoke, write])
      expect(res.statusCode, res.body).toBe(201)
      expect(revoked).toBe('changed')
      expect(await isInstanceAdmin(db, alice.user.id)).toBe(false)
    })
  })

  it('로그아웃 × 같은 관리자의 업로드가 사용자 행을 쥔 판 — 로그아웃은 안 기다리고 204, 업로드는 401 로 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const { second } = await standUp(ctx, 'upload')
      const hold = ctx.proxy.holdQuery(SESSION_RECHECK)
      const write = adminWrite(ctx, 'upload', second)
      await hold.held
      const holder = await heldBackend()
      const logout = ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: second })
      const waited = await settledOrQueued(logout, holder)
      hold.release()
      const [out, res] = await Promise.all([logout, write])
      expect(waited).toBe('settled')
      expect(out.statusCode).toBe(204)
      expect(res.statusCode, res.body).toBe(401)
      expect(await adminWriteLanded('upload')).toBe(false)
    })
  })
})

describe('비밀번호 바꾸기 × 다른 사람 · FK — 안 기다린다', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

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
 * **옛 비밀번호로 견준 로그인이 바꾸기 뒤에 남는가.** 로그인은 비밀번호를 견준 뒤(트랜잭션 밖) 세션 행을 넣는다. 세션 삽입이 «견준 해시가
 * 아직 그 해시일 때만»(`src/auth/session.ts` 의 `createLoginSession` — `INSERT … SELECT … FOR SHARE`)이면 그 사이 커밋된 바꾸기 ·
 * 재설정 뒤의 로그인은 0 행으로 401 이다. 판은 셋이다 — 바꾸기가 커밋된 뒤에 삽입이 도는 판, 바꾸기가 세션 `DELETE` 를 마치고 커밋
 * 앞에 선 동안 삽입이 도는 판(`FOR SHARE` 가 그 커밋을 기다려야 닫힌다 — `KEY SHARE` 면 지나 넣고 먼저 커밋해 남는다), 재설정 명령.
 */
describe('비밀번호 바꾸기 × 옛 비밀번호 로그인', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const LOGIN_INSERT = 'insert into "sessions"'

  function lateLoginOf(ctx: TestContext, who: SignedUpUser, password: string, remoteAddress = '10.0.8.8') {
    return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: who.user.email, password }, remoteAddress })
  }

  async function sessionOf(ctx: TestContext, res: { cookies: { name: string; value: string }[] }): Promise<number | null> {
    const cookie = res.cookies.find((c) => c.name === 'wb_session')?.value
    return cookie === undefined ? null : (await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: authCookie(cookie) })).statusCode
  }

  /** 붙잡힌 백엔드 가운데 `fragment` 를 마지막으로 돈 것 — 로그인도 제 트랜잭션을 열고 쉬므로 하나를 골라낸다. */
  async function idleBackendAfter(fragment: string): Promise<number> {
    const rows = await sql<{ pid: number; query: string }>`
      select pid, query from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid() and state = 'idle in transaction'
    `.execute(db)
    const matched = rows.rows.filter((row) => row.query.includes(fragment))
    if (matched.length !== 1) throw new Error(`'${fragment}' 뒤에 쉬는 백엔드가 하나가 아니다: ${matched.length}`)
    return matched[0]!.pid
  }

  it('옛 비밀번호로 견준 로그인이 세션 삽입 앞에 선 사이 바꾸기가 커밋되면 — 그 로그인은 틀린 비밀번호와 같은 401 이고 세션을 못 낸다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const wrong = await lateLoginOf(ctx, alice, '틀린비밀번호1234', '10.0.7.7')
      const hold = ctx.proxy.holdQuery(LOGIN_INSERT)
      const lateLogin = lateLoginOf(ctx, alice, alice.password)
      await hold.held
      const pw = await changePassword(ctx, alice.cookie, alice.password)
      expect(pw.statusCode, pw.body).toBe(204)
      hold.release()
      const res = await lateLogin
      const me = await sessionOf(ctx, res)
      console.log('[toctou] late login', res.statusCode, '| its /me', me, '| sessions', await sessionCount(alice.user.id))
      expect(me ?? 401, '옛 비밀번호로 낸 세션이 바꾸기 뒤에 산다').toBe(401)
      expect(res.statusCode, res.body).toBe(401)
      expect(res.body).toBe(wrong.body)
      expect(await sessionCount(alice.user.id)).toBe(1)
    })
  })

  it('바꾸기가 세션을 지우고 커밋 앞에 선 동안 옛 비밀번호 로그인의 삽입이 돌면 — 그 커밋을 기다리고 401', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const insertHold = ctx.proxy.holdQuery(LOGIN_INSERT)
      const lateLogin = lateLoginOf(ctx, alice, alice.password)
      await insertHold.held
      const commitHold = ctx.proxy.holdQuery('commit')
      const passwordChange = changePassword(ctx, alice.cookie, alice.password)
      await commitHold.held
      const changer = await idleBackendAfter('delete from "sessions"')
      insertHold.release()
      const waited = await settledOrQueued(lateLogin, changer)
      commitHold.release()
      const [pw, res] = await Promise.all([passwordChange, lateLogin])
      const me = await sessionOf(ctx, res)
      console.log('[toctou-window] late login', res.statusCode, '| waited', waited, '| its /me', me, '| sessions', await sessionCount(alice.user.id))
      expect(pw.statusCode, pw.body).toBe(204)
      expect(me ?? 401, '옛 비밀번호로 낸 세션이 바꾸기 뒤에 산다').toBe(401)
      expect(res.statusCode, res.body).toBe(401)
      expect(waited).toBe('queued')
      expect(await sessionCount(alice.user.id)).toBe(1)
    })
  })

  it('재설정 명령도 — 삽입 앞에 선 옛 비밀번호 로그인은 401 이고 세션이 하나도 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const hold = ctx.proxy.holdQuery(LOGIN_INSERT)
      const lateLogin = lateLoginOf(ctx, alice, alice.password)
      await hold.held
      expect((await resetPassword(db, alice.user.email, NEW_PASSWORD, testConfig().passwordScryptN)).kind).toBe('updated')
      hold.release()
      const res = await lateLogin
      expect(await sessionOf(ctx, res) ?? 401).toBe(401)
      expect(res.statusCode, res.body).toBe(401)
      expect(await sessionCount(alice.user.id)).toBe(0)
    })
  })

  /** **한도 — 이 판은 실패로 남는다.** 한도 − 1 번 틀린 뒤 이 판이 오면 한도가 차서 새 비밀번호의 로그인도 429 다. 성공으로 세면 200. */
  it('견준 뒤 해시가 바뀐 로그인은 한도에 실패로 센다 — 한도 − 1 번 틀린 뒤 그 판이면 새 비밀번호도 429', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      for (let i = 0; i < LOGIN_LIMIT.perAccount - 1; i++) {
        expect((await lateLoginOf(ctx, alice, '틀린비밀번호1234', `10.3.0.${i + 1}`)).statusCode).toBe(401)
      }
      const hold = ctx.proxy.holdQuery(LOGIN_INSERT)
      const lateLogin = lateLoginOf(ctx, alice, alice.password, '10.3.1.1')
      await hold.held
      expect((await resetPassword(db, alice.user.email, NEW_PASSWORD, testConfig().passwordScryptN)).kind).toBe('updated')
      hold.release()
      expect((await lateLogin).statusCode).toBe(401)
      const res = await lateLoginOf(ctx, alice, NEW_PASSWORD, '10.3.2.1')
      expect(res.statusCode, res.body).toBe(429)
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
