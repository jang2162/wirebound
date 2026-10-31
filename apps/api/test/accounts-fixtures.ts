/**
 * 계정 트랙(초대 · 비활성화 · 재설정 · 지정 · owner 넘기기 · 기록) 케이스가 함께 쓰는 판. 관리자 만들기는 서버 명령과 같은 함수
 * (`setInstanceAdmin`)를 부른다 — 그 기록(«서버 명령»)도 남는다.
 */
import { sql } from 'kysely'
import { expect } from 'vitest'
import { setInstanceAdmin } from '../src/repos/users'
import type { DbHandle } from '../src/db/tx'
import { authCookie, signup, type SignedUpUser, type TestContext } from './helpers'

export async function adminOf(ctx: TestContext, overrides?: Parameters<typeof signup>[1]): Promise<SignedUpUser> {
  const me = await signup(ctx, overrides)
  expect(await setInstanceAdmin(ctx.db, me.user.email, true)).toBe('changed')
  return me
}

type Cookie = { wb_session: string }

/** 관리자 API 한 번. */
export function admin(
  ctx: TestContext,
  cookie: Cookie | undefined,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
) {
  return ctx.app.inject({
    method,
    url: `/api/admin${url}`,
    ...(cookie ? { cookies: cookie } : {}),
    ...(payload === undefined ? {} : { payload }),
  })
}

/** 초대 링크를 만들고 원문을 낸다. */
export async function makeInvite(
  ctx: TestContext,
  cookie: Cookie,
  body: { name?: string; kind?: 'single' | 'multi'; expiresInDays?: number } = {},
): Promise<{ id: string; token: string }> {
  const res = await admin(ctx, cookie, 'POST', '/invites', { name: body.name ?? '디자인팀', kind: body.kind ?? 'multi', ...body })
  expect(res.statusCode, res.body).toBe(201)
  const json = res.json()
  return { id: json.invite.id, token: json.token }
}

let joinCounter = 0

/** 링크로 가입한다 — 응답을 그대로 낸다. 주소는 판마다 달리 줘 로그인 한도의 주소 키가 케이스 사이에 쌓이지 않게 한다. */
export function joinWith(
  ctx: TestContext,
  token: string,
  body: Partial<{ email: string; name: string; password: string }> = {},
  remoteAddress?: string,
) {
  joinCounter += 1
  return ctx.app.inject({
    method: 'POST',
    url: `/api/auth/invites/${token}/signup`,
    payload: {
      email: body.email ?? `joined${joinCounter}@example.com`,
      name: body.name ?? `가입자${joinCounter}`,
      password: body.password ?? 'password1234',
    },
    remoteAddress: remoteAddress ?? `10.7.${Math.floor(joinCounter / 250)}.${joinCounter % 250}`,
  })
}

/** 응답의 세션 쿠키. */
export function cookieOf(res: { cookies: { name: string; value: string }[] }): Cookie {
  const token = res.cookies.find((cookie) => cookie.name === 'wb_session')?.value
  if (token === undefined) throw new Error('세션 쿠키가 없다')
  return authCookie(token)
}

/** 관리자 기록의 행동 이름들 — 오래된 것부터. */
export async function auditActions(db: DbHandle): Promise<string[]> {
  const rows = await sql<{ action: string }>`select action from admin_audit order by at, id`.execute(db)
  return rows.rows.map((row) => row.action)
}

/** 원문 글자가 그 표의 어느 칸에도 없는가 — 행 전체를 글로 읽어 찾는다. */
export async function tableContains(db: DbHandle, table: 'invites' | 'password_resets', needle: string): Promise<boolean> {
  const rows = await sql<{ row: string }>`select t::text as row from ${sql.table(table)} t`.execute(db)
  if (rows.rows.length === 0) throw new Error(`${table} 이 비었다 — 찾을 판이 없다`)
  return rows.rows.some((row) => row.row.includes(needle))
}

/**
 * 붙잡힌 요청의 백엔드 — 질의를 프록시에 맡긴 채 트랜잭션 안에서 논다(`auth-password-review.test.ts` 와 같은 꼴). 꼭 하나여야 한다.
 */
export async function heldBackend(db: DbHandle): Promise<number> {
  const rows = await sql<{ pid: number }>`
    select pid from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid() and state = 'idle in transaction'
  `.execute(db)
  if (rows.rows.length !== 1) throw new Error(`붙잡힌 백엔드가 하나가 아니다: ${rows.rows.length}`)
  return rows.rows[0]!.pid
}

/** `holder` 뒤에 사슬로 선 백엔드들의 질의(`pg_blocking_pids` 를 따라간다). */
export async function queueBehind(db: DbHandle, holder: number): Promise<string[]> {
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

/** `write` 가 끝나거나 `holder` 뒤에 `fragment` 를 든 질의로 줄 설 때까지 — 어느 쪽이었는지. 둘 다 아니면 던진다(판이 안 섰다). */
export async function settledOrQueued(
  db: DbHandle,
  write: Promise<unknown>,
  holder: number,
  fragment: string,
  withinMs = 5_000,
): Promise<'settled' | 'queued'> {
  let settled = false
  void write.then(
    () => (settled = true),
    () => (settled = true),
  )
  const until = Date.now() + withinMs
  while (Date.now() < until) {
    if (settled) return 'settled'
    if ((await queueBehind(db, holder)).some((query) => query.includes(fragment))) return 'queued'
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${withinMs}ms 안에 끝나지도 '${fragment}' 로 줄 서지도 않았다 — 판이 안 섰다`)
}

/** 교착(40P01) 누계 — 판 앞뒤로 재서 차를 본다. */
export async function deadlockCount(db: DbHandle): Promise<number> {
  const row = await sql<{ n: string }>`select deadlocks::text as n from pg_stat_database where datname = current_database()`.execute(db)
  return Number(row.rows[0]!.n)
}
