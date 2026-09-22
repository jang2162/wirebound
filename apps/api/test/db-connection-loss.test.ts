/**
 * **DB 연결을 잃었을 때 — api 가 살고, 결과를 모르는 실패는 «모름»으로 나간다**(2026-09-22 이월 W (ii)).
 *
 * 기전과 경계는 `src/db/connection-loss.ts`(무엇이 «잃었다»인가)와 `src/db/client.ts`(듣는 자 둘 · 버리는 연결)가 소유한다.
 * 여기는 진짜 Postgres 에서 연결을 끊어 잰다 — 백엔드를 `pg_terminate_backend`로 죽이거나, api 와 Postgres 사이의
 * TCP 프록시(`pg-fault-proxy.ts`)가 원하는 순간에 소켓을 끊는다.
 *
 * **«프로세스가 산다»를 값으로 잰다** — 앞 판의 사망은 소켓 이벤트 안에서 던진 `'error'`였고, 그것은
 * `uncaughtException`으로 온다. 케이스마다 그 이벤트를 받아 적고 비었는지 본다. (vitest 는 이것을 저절로 실패로
 * 세지 않았다 — 고치기 전 탐침에서 `uncaughtException` 둘이 났는데 파일은 초록이었다.)
 *
 * **잰 변조**(api 프로젝트 전량 80 파일 · 1517 케이스 · 파일을 백업하고 한 자리를 바꾼 뒤 백업으로 되돌려 바이트 비교했다 ·
 * 2026-09-22 리뷰 (e) 후속 — 앞 판의 줄도 **이 판에서 다시 쟀다**. 연결을 버리게 된 뒤 값이 바뀐 줄이 있다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | COMMIT 줄을 뗀다(`connection-loss.ts`의 `settlesCommit && !answeredByServer`) | *"COMMIT 이 서버의 답 없이 …"* · *"그 COMMIT 뒤 … ROLLBACK 도 …"* · `api-db-errors.test.ts`의 *"게시의 COMMIT 이 클라이언트 쪽 시간 제한으로 …"* — **셋은 늘 함께 죽는다**(같은 길이다 — 뒤 둘은 앞의 판정 위에 선다). 축의 주인은 *"COMMIT 이 서버의 답 없이 …"* |
 * | «잃었다»로 가른 연결에 표지를 안 세운다(`db/client.ts`의 `lostClients.add`) | *"그 COMMIT 뒤 … ROLLBACK 도 …"* **혼자** |
 * | 버리기에서 SQLSTATE 로 가른 것을 뺀다(`answeredByServer(error)`만 본다) | *"서버가 FATAL 로 «답한» 연결은 …"* **혼자** |
 * | 버리기에서 서버의 답이 아닌 거절을 뺀다(`failure !== error`만 본다) | *"트랜잭션 중간 문장이 …"* **혼자** |
 * | 트랜잭션 중간도 «잃었다»로 넓힌다(`settlesCommit: true`) | *"트랜잭션 중간 문장이 …"* **혼자**(그 선택을 잰다) |
 * | `release`가 버리기를 무시한다 | *"서버가 FATAL 로 «답한» …"* · *"트랜잭션 중간 문장이 …"* — 위 두 줄이 각각 혼자 가른다 |
 * | `query_timeout` 거절을 뗀다(`createPool`) | *"접속 설정에 클라이언트 쪽 시간 제한 …"* **혼자** |
 * | `08`을 연결 부류에서 뺀다(`['57P']` — 리뷰의 M-08) | *"서버가 `FATAL 08P01` …"* **혼자** |
 * | `57P`를 연결 부류에서 뺀다 | *"쿼리 도중 …"* · *"서버가 FATAL 로 «답한» …"*(`57P01`로 잰다 — `08` 판과 축을 가르려고). 축의 주인은 *"쿼리 도중 …"* |
 * | 연결을 얻지 못한 실패를 그대로 둔다 | *"접속이 거절되면 …"* **혼자** |
 * | 클라이언트마다의 듣는 자를 뗀다(`createPool`의 `'connect'`) | *"놀던 연결이 …"* · *"COMMIT 응답이 …"* · `api-db-errors.test.ts` 넷. 축의 주인은 *"COMMIT 응답이 …"*(소켓 끝이 COMMIT 을 매단 채 와 `'error'`가 던져진다). **앞 판의 주인 *"쿼리 도중 …"*은 이제 안 죽는다** — 그 연결은 서버의 `57P01` 답에서 버려져 소켓 끝 전에 닫히고, pg 는 스스로 닫는 연결에 `'error'`를 내지 않는다 |
 * | 풀의 듣는 자를 뗀다(`pool.on('error')`) | *"놀던 연결이 …"* **혼자**(앞 판은 *"쿼리 도중 …"*도 죽었다 — 그 연결이 풀로 돌아가 놀다가 소켓 끝을 받았다. 이제 돌아가지 않는다) |
 * | «그 연결이 죽었다» 표지를 안 본다(`connectionLost: false`) | *"COMMIT 응답이 …"* · *"그 COMMIT 뒤 … ROLLBACK 도 …"* · `api-db-errors.test.ts` 넷. 축의 주인은 *"COMMIT 응답이 …"* |
 * | 가르는 층을 뗀다(`createDb`가 풀을 그대로 넘긴다) | 여기 여덟 · `api-db-errors.test.ts` 다섯. 축의 주인은 *"COMMIT 응답이 …"* |
 * | 서버가 답한 오류까지 «잃었다»로 감싼다 | *"서버가 답한 오류는 …"* · *"트랜잭션 중간 문장이 …"* · 기존 열둘(유일 위반 → 409 · `withTransaction` 세이브포인트 · `session.test.ts`의 500 …) — 서버의 답을 값으로 읽는 자리가 저장소에 널려 있다. 축의 주인은 *"서버가 답한 오류는 …"* |
 *
 * **재는 자가 없는 것**: `answeredByServer`의 SQLSTATE 확인(코드 없는 `DatabaseError`는 서버의 답이 아니다)을 떼도 **아무것도
 * 안 죽는다.** 그 판(pg 가 알 수 없는 메시지를 받음)에서는 그 연결에 `ReadyForQuery`가 다시 안 와 뒤따른 ROLLBACK 이 소켓 끝까지
 * 매달리고, 끝에서 표지로 «잃었다»가 된다 — COMMIT 에서는 이 확인이 없어도 결과가 같다(코드 읽기 · 재지 않았다).
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

/**
 * **COMMIT 이 서버 안에서 `seconds` 걸리는 표**를 만든다 — 행마다 지연 제약 트리거가 COMMIT 때 잔다(리뷰 (e)의 절차).
 * 커밋됐는지는 `committedRows`로 따로 본다(다른 연결).
 */
async function createSlowCommitTable(seconds: number): Promise<void> {
  const admin = getTestDb()
  await sql`create table zz_slow_commit (v text)`.execute(admin)
  await sql
    .raw(
      `create function zz_slow_commit_sleep() returns trigger language plpgsql as $$ begin perform pg_sleep(${seconds}); return null; end $$`,
    )
    .execute(admin)
  await sql`create constraint trigger zz_slow_commit after insert on zz_slow_commit deferrable initially deferred for each row execute function zz_slow_commit_sleep()`.execute(
    admin,
  )
}

async function dropSlowCommitTable(): Promise<void> {
  await sql`drop table if exists zz_slow_commit`.execute(getTestDb())
  await sql`drop function if exists zz_slow_commit_sleep()`.execute(getTestDb())
}

async function committedRows(table: 'zz_slow_commit' | 'zz_mid_tx'): Promise<string[]> {
  const { rows } = await sql<{ v: string }>`select v from ${sql.table(table)} order by v`.execute(getTestDb())
  return rows.map((row) => row.v)
}

/** 트랜잭션 하나를 돌리고 결과(`'resolved'`) 또는 거절을 돌려준다. */
function settleTransaction(db: ReturnType<typeof createDb>, insert: (trx: ReturnType<typeof createDb>) => Promise<unknown>) {
  return db
    .transaction()
    .execute(async (trx) => {
      await insert(trx)
    })
    .then(
      () => 'resolved' as const,
      (error: unknown) => error,
    )
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
      // `logged`는 비어 있을 수 있다 — 그 연결은 **소켓 끝이 오기 전에 버려진다**(서버가 답한 `57P01`로 가른 순간 ·
      // `db/client.ts`의 `release(true)`). pg 는 스스로 닫는 연결의 끝에 `'error'`를 내지 않는다. 앞 판은 여기서 그 오류를
      // 적는 것을 쟀다 — 이제 적는 자는 요청의 오류 처리기다(503 갈래의 `request.log.error`).
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

  it('서버가 `FATAL 08P01`(프로토콜 위반)로 답하면 «잃었다»다 — 연결 예외 부류(`08`)', async () => {
    const proxy = await startFaultProxy(TEST_DATABASE_URL)
    // 소켓 끝을 늦춘다 — 판정이 표지(`'error'`)가 아니라 **서버가 답한 SQLSTATE** 로 서게.
    proxy.holdClientAfterServerClose(300)
    const db = createDb(createPool(proxy.url, () => undefined))
    try {
      proxy.corruptQuery('select 1 as zz_corrupt')
      const caught = await sql`select 1 as zz_corrupt`.execute(db).then(
        () => 'resolved',
        (error: unknown) => error,
      )

      expect(proxy.fired).toBe(true)
      expect(caught).toBeInstanceOf(DbConnectionLostError)
      expect(((caught as Error).cause as DatabaseError).code).toBe('08P01')
      expect(uncaught).toEqual([])
    } finally {
      await db.destroy()
      await proxy.close()
    }
  })

  it('서버가 FATAL 로 «답한» 연결은 풀에 돌려주지 않는다 — 소켓 끝이 늦게 와도 다음 질의는 새 연결이다(곁)', async () => {
    const proxy = await startFaultProxy(TEST_DATABASE_URL)
    // 서버의 답(`57P01`)과 소켓 끝 사이의 틈을 넓힌다 — 앞 판은 그 틈에 연결을 풀로 돌려줬고 다음 질의가 집었다.
    // `57P01`로 재는 것은 위 `08` 판과 축을 가르려는 것이다(그쪽 변조에서 이것이 함께 죽지 않게).
    proxy.holdClientAfterServerClose(500)
    const db = createDb(createPool(proxy.url, () => undefined))
    try {
      let reportPid!: (pid: number) => void
      const pidReady = new Promise<number>((resolve) => (reportPid = resolve))
      const outcome = db
        .connection()
        .execute(async (conn) => {
          const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(conn)
          reportPid(rows[0]!.pid)
          await sql`select pg_sleep(30)`.execute(conn)
        })
        .then(
          () => 'resolved',
          (error: unknown) => error,
        )
      const pid = await pidReady
      await sql`select pg_terminate_backend(${pid})`.execute(getTestDb())
      const caught = await outcome
      expect(caught).toBeInstanceOf(DbConnectionLostError)
      expect(((caught as Error).cause as DatabaseError).code).toBe('57P01')

      // 곧바로 — 소켓 끝(500ms 뒤)을 기다리지 않는다. 앞 판은 이것이 그 연결을 집어 500ms 뒤 «잃었다»로 실패했다.
      const next = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db).then(
        ({ rows }) => rows[0]!.pid,
        (error: unknown) => error,
      )
      expect(next).not.toBeInstanceOf(Error)
      expect(next).not.toBe(pid)
      expect(uncaught).toEqual([])
    } finally {
      await db.destroy()
      await proxy.close()
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

/**
 * **서버의 답이 아닌 거절 — 클라이언트 쪽 시간 제한으로 잰다**(리뷰 (e)). `createPool`은 `query_timeout`을 거절하므로
 * (아래 첫 케이스) **만든 뒤 `pool.options`에 넣는다** — pg-pool 은 새 연결마다 그 설정으로 `Client`를 만든다. 이것으로
 * `connection-loss.ts`의 COMMIT 줄과 «서버의 답이 아닌 거절을 낸 연결은 버린다»를 **거절과 따로** 잰다.
 */
describe('서버의 답이 아닌 거절 — COMMIT 이면 «모름», 트랜잭션 중간이면 확정 실패이고 그 연결은 버린다', () => {
  it('접속 설정에 클라이언트 쪽 시간 제한(`query_timeout`)이 있으면 풀을 만들지 않는다 — 서버 쪽 `statement_timeout`은 받는다', async () => {
    const clientSide = new URL(TEST_DATABASE_URL)
    clientSide.searchParams.set('query_timeout', '1500')
    expect(() => createPool(clientSide.toString())).toThrow(/query_timeout\(1500\)/)

    const serverSide = new URL(TEST_DATABASE_URL)
    serverSide.searchParams.set('options', '-c statement_timeout=1500')
    const pool = createPool(serverSide.toString())
    try {
      const { rows } = await pool.query<{ statement_timeout: string }>('show statement_timeout')
      expect(rows).toEqual([{ statement_timeout: '1500ms' }])
    } finally {
      await pool.end()
    }
  })

  it('COMMIT 이 서버의 답 없이 거절되면(클라이언트 쪽 시간 제한) «잃었다»다 — `\'error\'` 표지가 없어도 · 커밋은 됐다', async () => {
    // COMMIT 이 서버 안에서 1.3s — 타이머(1.0s)가 COMMIT 을 거절하고, 뒤따른 ROLLBACK 은 COMMIT 이 끝난 뒤(1.3s) 서버에 가서
    // 답을 받는다(그 타이머는 2.0s). 그래서 Kysely 가 던지는 것은 **COMMIT 의** 거절이다.
    await createSlowCommitTable(1.3)
    const logged: unknown[] = []
    const pool = createPool(TEST_DATABASE_URL, (error) => logged.push(error))
    pool.options.query_timeout = 1000
    const db = createDb(pool)
    try {
      const caught = await settleTransaction(db, (trx) => sql`insert into zz_slow_commit values (${'커밋된 줄'})`.execute(trx))

      expect(caught).toBeInstanceOf(DbConnectionLostError)
      expect(((caught as Error).cause as Error).message).toBe('Query read timeout')
      // 연결은 `'error'`를 내지 않았다 — 표지로 간 것이 아니다(앞 판은 여기서 맨 `Error`를 그대로 내보냈다).
      expect(logged).toEqual([])
      expect(uncaught).toEqual([])
      expect(await committedRows('zz_slow_commit')).toEqual(['커밋된 줄'])
    } finally {
      await db.destroy()
      await dropSlowCommitTable()
    }
  })

  it('그 COMMIT 뒤 Kysely 가 보내는 ROLLBACK 도 답을 못 받으면 — 덮는 그 거절도 «잃었다»다(COMMIT 의 «모름»을 이어받는다)', async () => {
    // COMMIT 이 서버 안에서 1.5s · 타이머 0.3s — COMMIT 이 0.3s 에 거절되고, 큐에 선 ROLLBACK 이 0.6s 에 **보내지지도 않고**
    // 거절된다. Kysely 는 그 ROLLBACK 의 거절을 던진다(`Transaction.execute`의 `catch`).
    await createSlowCommitTable(1.5)
    const pool = createPool(TEST_DATABASE_URL, () => undefined)
    pool.options.query_timeout = 300
    const db = createDb(pool)
    try {
      const caught = await settleTransaction(db, (trx) => sql`insert into zz_slow_commit values (${'커밋된 줄'})`.execute(trx))

      expect(caught).toBeInstanceOf(DbConnectionLostError)
      expect(uncaught).toEqual([])
      // 그 연결은 버려졌다(소켓을 닫았다) — 서버는 COMMIT 을 끝까지 돌려 커밋한다. 그래서 «모름»이 참이다.
      const deadline = Date.now() + 4000
      while ((await committedRows('zz_slow_commit')).length === 0 && Date.now() < deadline) await settle(100)
      expect(await committedRows('zz_slow_commit')).toEqual(['커밋된 줄'])
    } finally {
      await db.destroy()
      await dropSlowCommitTable()
    }
  })

  it('트랜잭션 중간 문장이 서버의 답 없이 거절되면 확정 실패로 두고 그 연결을 버린다 — 빠진 ROLLBACK 의 트랜잭션이 다음 트랜잭션의 COMMIT 에 실려 가지 않는다', async () => {
    await sql`create table zz_mid_tx (v text)`.execute(getTestDb())
    const pool = createPool(TEST_DATABASE_URL, () => undefined)
    pool.options.max = 1 // 다음 트랜잭션이 같은 연결을 빌리게 — 버리지 않으면 그렇게 된다
    pool.options.query_timeout = 300
    const db = createDb(pool)
    try {
      // INSERT 가 서버에서 1s — 타이머가 0.3s 에 거절하고, 큐에 선 ROLLBACK 은 0.6s 에 보내지지도 않고 거절된다.
      const first = await settleTransaction(db, (trx) =>
        sql`insert into zz_mid_tx select ${'실패로 답한 줄'} from pg_sleep(1)`.execute(trx),
      )
      // **확정 실패다** — 서버의 답은 아니지만 COMMIT 을 부르지 않았다(`connection-loss.ts` «트랜잭션 중간 문장»).
      expect(first).toBeInstanceOf(Error)
      expect(first).not.toBeInstanceOf(DbConnectionLostError)

      await settle(1200) // 앞 INSERT 가 서버에서 끝난 뒤(1s)에 빌린다 — 그 연결이 풀에 있었다면 «트랜잭션 안»이다
      expect(await settleTransaction(db, (trx) => sql`insert into zz_mid_tx values (${'다음 줄'})`.execute(trx))).toBe(
        'resolved',
      )
      expect(await committedRows('zz_mid_tx')).toEqual(['다음 줄'])
      expect(uncaught).toEqual([])
    } finally {
      await db.destroy()
      await sql`drop table if exists zz_mid_tx`.execute(getTestDb())
    }
  })
})
