/**
 * **DB 연결을 잃었을 때 — api 가 살고, 결과를 모르는 실패는 «모름»으로 나간다**(2026-09-22 이월 W (ii)).
 *
 * 기전과 경계는 `src/db/connection-loss.ts`(무엇이 «잃었다»인가)와 `src/db/client.ts`(듣는 자 둘)가 소유한다.
 * 여기는 진짜 Postgres 에서 연결을 끊어 잰다 — 백엔드를 `pg_terminate_backend`로 죽이거나, api 와 Postgres 사이의
 * TCP 프록시(`pg-fault-proxy.ts`)가 원하는 순간에 소켓을 끊는다.
 *
 * **«프로세스가 산다»를 값으로 잰다** — 앞 판의 사망은 소켓 이벤트 안에서 던진 `'error'`였고, 그것은
 * `uncaughtException`으로 온다. 케이스마다 그 이벤트를 받아 적고 비었는지 본다. (vitest 는 이것을 저절로 실패로
 * 세지 않았다 — 고치기 전 탐침에서 `uncaughtException` 둘이 났는데 파일은 초록이었다.)
 *
 * **잰 변조**(api 프로젝트 전량 · 파일을 백업하고 한 줄을 바꾼 뒤 바이트 비교로 되돌렸다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `57P`를 연결 부류에서 뺀다 | *"쿼리 도중 …"* **혼자**(서버가 `57P01 FATAL`로 먼저 답한다 — 표지는 그 답 **뒤에** 선다) |
 * | 연결을 얻지 못한 실패를 그대로 둔다 | *"접속이 거절되면 …"* **혼자** |
 * | 클라이언트마다의 듣는 자를 뗀다(`createPool`의 `'connect'`) | 여기 셋(*"쿼리 도중 …"* · *"놀던 연결이 …"* · *"COMMIT 응답이 …"*) · `api-db-errors.test.ts` 넷 — 표지도 함께 사라진다. 축의 주인은 *"쿼리 도중 …"* |
 * | 풀의 듣는 자를 뗀다(`pool.on('error')`) | *"놀던 연결이 …"* · *"쿼리 도중 …"* — 뒤의 것도 죽는 까닭: pg 는 `57P01` 답 **뒤에** 소켓 끝(`'end'`)을 내는데 그때 그 클라이언트는 이미 풀로 돌아가 놀고 있다. 축의 주인은 *"놀던 연결이 …"* |
 * | «그 연결이 죽었다» 표지를 안 본다(`lostClients.has` → `false`) | *"COMMIT 응답이 …"* · `api-db-errors.test.ts` 넷 — 맨 `Error`(«not queryable» · «Connection terminated unexpectedly»)가 그대로 지나가 500. 축의 주인은 *"COMMIT 응답이 …"* |
 * | 가르는 층을 뗀다(`createDb`가 풀을 그대로 넘긴다) | 여기 셋(*"쿼리 도중 …"* · *"COMMIT 응답이 …"* · *"접속이 거절되면 …"*) · `api-db-errors.test.ts` 넷. 축의 주인은 *"COMMIT 응답이 …"* |
 * | 서버가 답한 오류까지 «잃었다»로 감싼다 | *"서버가 답한 오류는 …"* · 기존 열둘(유일 위반 → 409 · `withTransaction` 세이브포인트 · `session.test.ts`의 500 …) — 서버의 답을 값으로 읽는 자리가 저장소에 널려 있다. 축의 주인은 *"서버가 답한 오류는 …"* |
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { DatabaseError } from 'pg'
import { createDb, createPool } from '../src/db/client'
import { DbConnectionLostError } from '../src/db/connection-loss'
import { TEST_DATABASE_URL, getTestDb } from './helpers'
import { startFaultProxy } from './pg-fault-proxy'

/** 이 케이스 동안 난 `uncaughtException` — 앞 판에서 api 를 죽인 것이 이것이다. */
let uncaught: unknown[] = []
const record = (error: unknown): void => {
  uncaught.push(error)
}

beforeEach(() => {
  uncaught = []
  process.prependListener('uncaughtException', record)
})

afterEach(() => {
  process.removeListener('uncaughtException', record)
})

/** 소켓 이벤트가 다 돌 틈을 준다 — `'end'`는 오류 응답보다 늦게 온다. */
function settle(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('until: 시간 안에 조건이 서지 않았다')
    await settle(20)
  }
}

describe('DB 연결을 잃으면 — api 는 살고, 그 질의는 «연결을 잃었다»로 실패한다', () => {
  it('쿼리 도중 백엔드가 끊겨도 프로세스는 산다 — 그 질의는 «연결을 잃었다»이고 풀은 다음 질의를 새 연결로 받는다', async () => {
    const logged: unknown[] = []
    const db = createDb(createPool(TEST_DATABASE_URL, (error) => logged.push(error)))
    try {
      let reportPid!: (pid: number) => void
      const pidReady = new Promise<number>((resolve) => (reportPid = resolve))
      const pending = db.connection().execute(async (conn) => {
        const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(conn)
        reportPid(rows[0]!.pid)
        await sql`select pg_sleep(30)`.execute(conn)
      })
      const outcome = pending.then(
        () => 'resolved',
        (error: unknown) => error,
      )

      await sql`select pg_terminate_backend(${await pidReady})`.execute(getTestDb())
      const caught = await outcome
      await settle()

      expect(caught).toBeInstanceOf(DbConnectionLostError)
      // 서버가 먼저 `57P01 FATAL`로 답하고 소켓을 닫는다 — 가른 것은 그 코드다.
      expect(((caught as Error).cause as DatabaseError).code).toBe('57P01')
      expect(uncaught).toEqual([])
      expect(logged.length).toBeGreaterThan(0)
      const { rows } = await sql<{ one: number }>`select 1 as one`.execute(db)
      expect(rows).toEqual([{ one: 1 }])
    } finally {
      await db.destroy()
    }
  })

  it('놀던 연결이 끊겨도 프로세스는 산다 — 풀은 그 연결을 버리고 다음 질의를 새 연결로 받는다', async () => {
    const logged: unknown[] = []
    const db = createDb(createPool(TEST_DATABASE_URL, (error) => logged.push(error)))
    try {
      // 질의가 끝나면 그 연결은 풀로 돌아가 논다.
      const { rows: before } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db)
      await sql`select pg_terminate_backend(${before[0]!.pid})`.execute(getTestDb())
      await until(() => logged.length > 0)
      await settle()

      expect(uncaught).toEqual([])
      const { rows: after } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db)
      expect(after[0]!.pid).not.toBe(before[0]!.pid)
    } finally {
      await db.destroy()
    }
  })

  it('트랜잭션의 COMMIT 응답이 유실되면 «연결을 잃었다»다 — 커밋은 됐다', async () => {
    const proxy = await startFaultProxy(TEST_DATABASE_URL)
    const db = createDb(createPool(proxy.url, () => undefined))
    try {
      await sql`create table if not exists zz_commit_loss (v text)`.execute(getTestDb())
      proxy.dropCommitReplyAfter('insert into zz_commit_loss')

      const caught = await db
        .transaction()
        .execute(async (trx) => {
          await sql`insert into zz_commit_loss values (${'커밋된 줄'})`.execute(trx)
        })
        .then(
          () => 'resolved',
          (error: unknown) => error,
        )
      await settle()

      expect(proxy.fired).toBe(true)
      // Kysely 가 COMMIT 실패 뒤 ROLLBACK 을 보내고 **그 오류가 앞의 것을 덮는다** — 맨 `Error`("…not queryable")다.
      // 그것을 가른 것이 «그 연결이 죽었다» 표지다(글자가 아니다).
      expect(caught).toBeInstanceOf(DbConnectionLostError)
      expect(uncaught).toEqual([])
      const { rows } = await sql<{ v: string }>`select v from zz_commit_loss`.execute(getTestDb())
      expect(rows).toEqual([{ v: '커밋된 줄' }])
    } finally {
      await sql`drop table if exists zz_commit_loss`.execute(getTestDb())
      await db.destroy()
      await proxy.close()
    }
  })

  it('접속이 거절되면 «연결을 잃었다»다 — 닿지 못한 것도 «모름» 쪽으로 넓게 잡는다', async () => {
    const url = new URL(TEST_DATABASE_URL)
    url.port = '1'
    const db = createDb(createPool(url.toString(), () => undefined))
    try {
      const caught = await sql`select 1`.execute(db).then(
        () => 'resolved',
        (error: unknown) => error,
      )
      expect(caught).toBeInstanceOf(DbConnectionLostError)
      expect(((caught as Error).cause as { code?: unknown }).code).toBe('ECONNREFUSED')
    } finally {
      await db.destroy()
    }
  })

  it('서버가 답한 오류는 그대로 지나간다 — 확정 실패다(연결은 산다)', async () => {
    const db = createDb(createPool(TEST_DATABASE_URL, () => undefined))
    try {
      const caught = await sql`select 1 / 0`.execute(db).then(
        () => 'resolved',
        (error: unknown) => error,
      )
      expect(caught).toBeInstanceOf(DatabaseError)
      expect(caught).not.toBeInstanceOf(DbConnectionLostError)
      expect((caught as DatabaseError).code).toBe('22012')
    } finally {
      await db.destroy()
    }
  })
})
