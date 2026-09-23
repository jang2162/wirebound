/**
 * **네트워크 분할 — 고아 백엔드를 서버가 끝내고, 풀이 다 차면 503 이다**(2026-09-23 이월 W′).
 *
 * 무엇을 걸었고 왜 그 값인가(잰 값)는 `src/db/client.ts`의 `createPool` 머리말 «네트워크 분할»이 소유한다. 여기는 그 셋이
 * **실제로 걸리는가**를 진짜 Postgres 에서 잰다 — 고아는 TCP 프록시(`pg-fault-proxy.ts`의 `halfCutOnQuery`)가 게시의 INSERT 를
 * 서버에 넘긴 뒤 api 쪽 소켓만 끊어 만든다. 시간 제한은 케이스가 짧게 준다(기본값 10s · 5s 를 기다리지 않으려고).
 *
 * **잰 변조**(이 파일만 · 백업 후 바이트 비교로 되돌렸다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `createPool`이 `idle_in_transaction_session_timeout`을 안 싣는다 | *"게시 도중 api 쪽만 끊겨 …"* · *"트랜잭션 안에서 시간 제한보다 …"* — 축의 주인은 *"게시 도중 …"*(고아를 끝내는 것이 이 설정의 몫이다) |
 * | `createPool`이 `connectionTimeoutMillis`를 안 싣는다 | *"풀이 다 차면 …"* **혼자** |
 * | `createPool`이 `keepAlive`를 안 싣는다 | *"DB 소켓에 TCP keepalive 를 …"* **혼자** |
 * | `config.ts`가 env 를 안 읽고 기본값을 둔다 | *"시간 제한 셋은 env 로 바꾼다 …"* **혼자** |
 * | 기본값 `idleInTransactionMs`를 0 으로 | *"시간 제한 셋은 env 로 바꾼다 …"* **혼자** |
 * | 접속 문자열의 `idle_in_transaction_session_timeout` 거절을 뗀다 | *"접속 문자열에 idle_in_transaction_session_timeout 이 …"* **혼자** |
 * | 연결의 `'error'`에 표지를 안 세운다(`createPool`의 `lostClients.add`) | *"게시 도중 …"*(첫 게시가 봉투 500) · *"트랜잭션 안에서 시간 제한보다 …"* — 그 축의 주인은 `db-connection-loss.test.ts`의 *"COMMIT 응답이 …"* |
 *
 * *"트랜잭션 안에서 시간 제한보다 …"*는 **혼자 죽는 변조가 없다** — 설정을 떼면 *"게시 도중 …"*과 함께, «잃었다»로 가르는
 * 길(끝낸 세션의 `FATAL 25P03`은 진행 중인 질의 없이 와서 `'error'`가 된다)을 떼면 `db-connection-loss.test.ts`의 축
 * (주인 *"COMMIT 응답이 …"*)과 함께 죽는다. 남긴 것은 **잘못 끊긴 정당한 트랜잭션이 503 쪽(«모름»)으로 가고 커밋이 0**이라는
 * 것을 COMMIT 까지 한 판으로 재기 때문이다 — 그 방향이 이 값(10s)을 짧게 잡아도 되는 근거다.
 *
 * `main.ts`·`migrate.ts`가 `config.dbTimeLimits`를 넘기는 자리는 케이스가 못 닿는다(그 파일은 부팅해야 돈다) — api 스크립트로
 * 쟀다: `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=300`으로 띄운 api 에서 내보내기가 루프를 멈추는 동안 편집 12/12 가 503 · 기본값으로는
 * 12/12 가 200.
 */
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'
import type { PoolClient } from 'pg'
import { buildApp } from '../src/app'
import { loadConfig } from '../src/config'
import { DEFAULT_DB_TIME_LIMITS, createDb, createPool, type DbTimeLimits } from '../src/db/client'
import { DbConnectionLostError } from '../src/db/connection-loss'
import {
  TEST_DATABASE_URL,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  testConfig,
  type TestContext,
} from './helpers'
import { startFaultProxy, type FaultProxy } from './pg-fault-proxy'

afterEach(async () => {
  await resetRealData()
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 시간 안에 끝나지 않으면 `'hung'` — 매달리는 판을 케이스가 끝없이 기다리지 않게 한다. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | 'hung'> {
  return Promise.race([promise, sleep(ms).then(() => 'hung' as const)])
}

interface ProxiedApi extends TestContext {
  proxy: FaultProxy
  /** 이 앱의 풀이 쓰는 `application_name` — 서버에서 이 풀의 백엔드만 가려 본다(다른 파일이 같은 DB 를 동시에 쓴다). */
  appName: string
}

/** 앱을 TCP 프록시 뒤의 풀 위에 세운다(`api-db-errors.test.ts`와 같은 꼴) — 시간 제한만 케이스가 준다. */
async function withProxiedApi(limits: Partial<DbTimeLimits>, fn: (ctx: ProxiedApi) => Promise<void>): Promise<void> {
  const proxy = await startFaultProxy(TEST_DATABASE_URL)
  const appName = `wb-partition-${process.pid}-${Date.now()}`
  const url = new URL(proxy.url)
  url.searchParams.set('application_name', appName)
  const db = createDb(createPool(url.toString(), () => undefined, { ...DEFAULT_DB_TIME_LIMITS, ...limits }))
  const app = await buildApp({ db, config: testConfig() })
  try {
    await fn({ app, db, proxy, appName })
  } finally {
    await app.close()
    await db.destroy()
    // 서버 쪽 소켓까지 닫는다 — 고아가 남았으면(변조 판) 서버가 EOF 를 보고 되돌린다.
    await proxy.close()
  }
}

async function pageWithRoot(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  return { owner, projectId: project.id, pageId: page.id, rootNodeId: (page.schema as { root: { id: string } }).root.id }
}

/** 그 풀의 백엔드 중 **트랜잭션 안에서 쉬는** 것 — 고아다. 프록시를 거치지 않는 관리 풀로 본다. */
async function idleInTransaction(appName: string): Promise<number> {
  const { rows } = await sql<{ n: string }>`
    select count(*) as n from pg_stat_activity where application_name = ${appName} and state like 'idle in transaction%'
  `.execute(getTestDb())
  return Number(rows[0]?.n)
}

async function until(condition: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline) return false
    await sleep(25)
  }
  return true
}

function envelope(body: string): { code: string } | undefined {
  try {
    return (JSON.parse(body) as { error?: { code: string } }).error
  } catch {
    return undefined
  }
}

describe('고아 백엔드 — 서버 쪽 idle_in_transaction_session_timeout', () => {
  it('게시 도중 api 쪽만 끊겨 남은 고아 백엔드를 서버가 idle 시간 제한으로 끝낸다 — 잠금이 풀리고 같은 페이지의 다음 게시가 선다', async () => {
    // 1.5s — 첫 게시의 503 을 받고 고아를 세기 전에 시간 제한이 지나지 않게(붐비는 전량에서도) 넉넉히 둔다.
    await withProxiedApi({ idleInTransactionMs: 1500 }, async (ctx) => {
      const fx = await pageWithRoot(ctx)
      const url = `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`

      ctx.proxy.halfCutOnQuery('insert into "comments"')
      const first = await ctx.app.inject({
        method: 'POST',
        url,
        cookies: fx.owner.cookie,
        payload: { nodeId: fx.rootNodeId, body: '고아의 말', idempotencyKey: 'partition-orphan' },
      })
      expect(ctx.proxy.fired).toBe(true)
      // api 는 곧바로 안다(소켓이 끊겼다) — 결과를 모른다.
      expect(first.statusCode, first.body).toBe(503)

      // 서버는 모른다 — 그 INSERT 를 마치고 페이지 행을 쥔 채 트랜잭션 안에서 쉰다. 그것을 서버가 끝낸다.
      expect(await idleInTransaction(ctx.appName)).toBe(1)
      expect(await until(async () => (await idleInTransaction(ctx.appName)) === 0, 5000)).toBe(true)

      // 잠금이 풀렸다 — 같은 페이지의 게시가 줄을 서지 않는다(고아가 살아 있으면 여기서 매달린다).
      const next = await within(
        ctx.app.inject({
          method: 'POST',
          url,
          cookies: fx.owner.cookie,
          payload: { nodeId: fx.rootNodeId, body: '다음 말', idempotencyKey: 'partition-next' },
        }),
        3000,
      )
      expect(next === 'hung' ? next : next.statusCode).toBe(201)
      // 고아의 INSERT 는 되돌려졌다 — 커밋된 것은 다음 말 하나다.
      const { rows } = await sql<{ body: string }>`select body from comments where page_id = ${fx.pageId}`.execute(getTestDb())
      expect(rows).toEqual([{ body: '다음 말' }])
    })
  })

  it('트랜잭션 안에서 시간 제한보다 오래 쉬면 서버가 그 세션을 끝낸다 — 그 거절은 «연결을 잃었다»(503 쪽)이고 커밋은 0 이다', async () => {
    const logged: unknown[] = []
    const db = createDb(createPool(TEST_DATABASE_URL, (error) => logged.push(error), { ...DEFAULT_DB_TIME_LIMITS, idleInTransactionMs: 300 }))
    const admin = getTestDb()
    await sql`create table zz_idle_kill (v text)`.execute(admin)
    try {
      const outcomes: unknown[] = []
      // 다음 문장이 늦는 판과, 쉰 뒤 곧바로 COMMIT 하는 판 — 둘 다 서버가 쉬는 중에 끝냈다.
      for (const [label, then] of [
        ['다음 문장', (trx: typeof db) => sql`select 1`.execute(trx)],
        ['COMMIT', async () => undefined],
      ] as const) {
        outcomes.push(
          await db
            .transaction()
            .execute(async (trx) => {
              await sql`insert into zz_idle_kill values (${label})`.execute(trx)
              await sleep(800)
              await then(trx)
            })
            .then(
              () => 'resolved',
              (error: unknown) => error,
            ),
        )
      }
      expect(outcomes.map((outcome) => outcome instanceof DbConnectionLostError)).toEqual([true, true])
      // 서버가 말한 것 — 쉬는 중이라 질의의 거절이 아니라 연결의 `'error'`로 왔다.
      expect(logged.map((error) => (error as { code?: string }).code)).toContain('25P03')
      const { rows } = await sql<{ v: string }>`select v from zz_idle_kill`.execute(admin)
      expect(rows).toEqual([])
    } finally {
      await db.destroy()
      await sql`drop table if exists zz_idle_kill`.execute(admin)
    }
  })
})

describe('풀 대기 — connectionTimeoutMillis', () => {
  it('풀이 다 차면 연결을 기다리다 시간 제한에 503 이다 — 끝없이 매달리지 않는다', async () => {
    const pool = createPool(TEST_DATABASE_URL, () => undefined, { ...DEFAULT_DB_TIME_LIMITS, poolWaitMs: 300 })
    const db = createDb(pool)
    const app = await buildApp({ db, config: testConfig() })
    const held: PoolClient[] = []
    try {
      const owner = await signup({ app, db })
      for (let i = 0; i < (pool.options.max ?? 10); i++) held.push(await pool.connect())

      const started = Date.now()
      const starved = await within(app.inject({ method: 'GET', url: '/api/auth/me', cookies: owner.cookie }), 3000)
      expect(starved === 'hung' ? starved : starved.statusCode).toBe(503)
      if (starved !== 'hung') expect(envelope(starved.body)?.code).toBe('internal')
      expect(Date.now() - started).toBeGreaterThanOrEqual(300)

      for (const client of held.splice(0)) client.release()
      const again = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: owner.cookie })
      expect(again.statusCode).toBe(200)
    } finally {
      for (const client of held) client.release()
      await app.close()
      await db.destroy()
    }
  })
})

describe('클라이언트 소켓 — TCP keepalive', () => {
  it('DB 소켓에 TCP keepalive 를 첫 탐침 시간과 함께 켠다 — 0 이면 켜지 않는다', async () => {
    // 진짜 분할(패킷이 사라짐)은 케이스가 못 만든다 — 루프백은 커널이 답한다. 그래서 pg 가 소켓에 거는 값을 잰다.
    const spy = vi.spyOn(net.Socket.prototype, 'setKeepAlive')
    try {
      const calls: unknown[][] = []
      for (const keepAliveIdleMs of [DEFAULT_DB_TIME_LIMITS.keepAliveIdleMs, 0]) {
        spy.mockClear()
        const pool = createPool(TEST_DATABASE_URL, () => undefined, { ...DEFAULT_DB_TIME_LIMITS, keepAliveIdleMs })
        const client = await pool.connect()
        client.release()
        await pool.end()
        calls.push(spy.mock.calls.filter(([enable]) => enable === true))
      }
      expect(calls).toEqual([[[true, DEFAULT_DB_TIME_LIMITS.keepAliveIdleMs]], []])
    } finally {
      spy.mockRestore()
    }
  })
})

describe('설정 — 값은 한 자리에서 온다', () => {
  it('시간 제한 셋은 env 로 바꾼다 — 비면 기본값이고 0 은 끈다', () => {
    const base = { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL }
    // 기본값은 셋 다 켜져 있다 — 0 이면 아무도 env 를 안 준 운영에서 이 수정이 통째로 꺼진다. 수 자체의 근거는 `createPool` 머리말.
    expect(Object.values(DEFAULT_DB_TIME_LIMITS).every((ms) => ms > 0)).toBe(true)
    expect(loadConfig(base).dbTimeLimits).toEqual(DEFAULT_DB_TIME_LIMITS)
    expect(
      loadConfig({
        ...base,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '1500',
        DB_POOL_WAIT_TIMEOUT_MS: '0',
        DB_KEEPALIVE_IDLE_MS: '7000',
      }).dbTimeLimits,
    ).toEqual({ idleInTransactionMs: 1500, poolWaitMs: 0, keepAliveIdleMs: 7000 })
    expect(() => loadConfig({ ...base, DB_POOL_WAIT_TIMEOUT_MS: '5s' })).toThrow(/DB_POOL_WAIT_TIMEOUT_MS/)
  })

  it('접속 문자열에 idle_in_transaction_session_timeout 이 있으면 풀을 만들지 않는다 — 그 값이 env 를 조용히 이긴다', () => {
    const url = new URL(TEST_DATABASE_URL)
    url.searchParams.set('idle_in_transaction_session_timeout', '0')
    expect(() => createPool(url.toString())).toThrow(/idle_in_transaction_session_timeout\(0\).*DB_IDLE_IN_TRANSACTION_TIMEOUT_MS/)
  })
})
