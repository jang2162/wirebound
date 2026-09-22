import { Kysely, PostgresDialect, type PostgresPool, type PostgresPoolClient } from 'kysely'
import { Pool, type PoolClient } from 'pg'
import { classifyConnectFailure, classifyQueryFailure } from './connection-loss'
import type { Database } from './types'
import type { DbHandle } from './tx'

/**
 * **`'error'`를 낸 적이 있는 클라이언트** — 그 연결은 죽었다. `createDb`가 질의의 거절을 가를 때 이것을 본다
 * (`db/connection-loss.ts`의 머리말 «경계»). 표지를 세우는 자는 `createPool`이 클라이언트마다 다는 듣는 자다.
 */
const lostClients = new WeakSet<object>()

/** 연결 오류를 적는 자리. 기본은 표준 오류 — `main.ts`는 Fastify 로거가 서기 전에 풀을 만든다. */
export type PoolErrorSink = (error: unknown) => void

function writeToStderr(error: unknown): void {
  console.error('DB 연결 오류 — 그 연결을 버린다(프로세스는 계속 돈다):', error)
}

/**
 * Postgres 커넥션 풀을 만든다.
 *
 * 풀의 생명주기는 호출자가 소유한다 — 이 함수는 풀을 만들 뿐 닫지 않는다.
 * `main.ts`(운영)와 테스트 하네스가 각각 정확히 한 번씩 만들고 정확히 한 번씩 닫는다.
 *
 * # 연결이 죽어도 프로세스가 안 죽는다 (2026-09-22 이월 W (ii))
 *
 * pg 는 연결이 끊기면(페일오버 · 네트워크 순단 · 백엔드 종료) 그 `Client`에 `'error'`를 낸다. **듣는 자가 없으면
 * Node 의 `EventEmitter`가 그 자리에서 던지고** 소켓 이벤트 안이라 잡는 자가 없다 — 앞 판은 그것으로 **api 가 통째로
 * 죽었다**(좁은 반증 3차 b-1: `Emitted 'error' event on Client instance`). 듣는 자가 둘 필요하다 — pg-pool 은
 * 놀던 클라이언트의 `'error'`만 풀로 넘기고(풀에 듣는 자가 없으면 **거기서** 던진다) 빌려 간 클라이언트에서는 그
 * 넘기는 자를 뗀다(`pg-pool`의 `_acquireClient`).
 *
 * | 듣는 자 | 언제 | 하는 일 |
 * |---|---|---|
 * | 클라이언트마다(`'connect'`에서 단다) | 빌려 간 중 · 놀던 중 모두 | 적는다 · **그 연결이 죽었다고 표지를 세운다**(`lostClients`) |
 * | 풀(`'error'`) | 놀던 클라이언트가 죽었을 때 — 위의 것과 **같은 오류**가 한 번 더 온다 | 아무것도 안 한다(위에서 적었다) — 있어야 풀이 안 던진다 |
 *
 * **죽은 연결을 풀이 다시 내주지 않는다** — pg-pool 이 돌려받을 때 `_queryable`이 꺼진 클라이언트를 버린다
 * (`_release`). 다음 질의는 새 연결로 간다. 잰 값은 `test/db-connection-loss.test.ts`가 갖는다.
 */
export function createPool(databaseUrl: string, onError: PoolErrorSink = writeToStderr): Pool {
  const pool = new Pool({ connectionString: databaseUrl })
  pool.on('connect', (client) => {
    client.on('error', (error) => {
      lostClients.add(client)
      onError(error)
    })
  })
  pool.on('error', () => undefined)
  return pool
}

/**
 * 풀을 Kysely 에 넘기되 **거절을 가르는 층**을 끼운다 — 연결을 잃은 거절은 `DbConnectionLostError`로 감싼다
 * (`db/connection-loss.ts`). Kysely 는 풀에서 `connect`·`end`만, 클라이언트에서 `query`·`release`만 부르므로
 * (`PostgresPool`·`PostgresPoolClient`) 그 넷만 옮긴다. **스트리밍(커서)은 없다** — 이 저장소는 `cursor`를 넘기지
 * 않으므로 Kysely 가 그 길을 열지 않는다.
 */
function classifyingPool(pool: Pool): PostgresPool {
  const wrapped = new WeakMap<PoolClient, PostgresPoolClient>()

  function wrap(client: PoolClient): PostgresPoolClient {
    const known = wrapped.get(client)
    if (known) return known
    const query = async (sql: string, parameters: ReadonlyArray<unknown>) => {
      try {
        return await client.query(sql, [...parameters])
      } catch (error) {
        throw classifyQueryFailure(error, lostClients.has(client))
      }
    }
    const facade: PostgresPoolClient = {
      // 커서를 받는 겹침(overload)은 옮기지 않는다 — 위 머리말(Kysely 가 그 길을 열지 않는다).
      query: query as unknown as PostgresPoolClient['query'],
      release: () => client.release(),
    }
    wrapped.set(client, facade)
    return facade
  }

  return {
    connect: async () => {
      try {
        return wrap(await pool.connect())
      } catch (error) {
        throw classifyConnectFailure(error)
      }
    },
    end: () => pool.end(),
  }
}

/**
 * 풀 위에 Kysely 인스턴스를 올린다.
 *
 * `createDb`가 반환한 `Kysely`에 `destroy()`를 부르면 안의 풀이 닫힌다 —
 * 풀 자체를 직접 `pool.end()`로 닫을 필요는 없고, 대신 `db.destroy()` 쪽만
 * 정확히 한 번 부르면 된다. 호출자(운영에서는 `main.ts`, 테스트에서는 하네스)가
 * 그 "한 번"을 책임진다. `buildApp`은 자신이 만들지 않은 이 자원을 닫지 않는다.
 *
 * **질의의 거절은 가른 뒤에 나온다**(`classifyingPool` · `db/connection-loss.ts`) — 연결을 잃은 것은
 * `DbConnectionLostError`, 서버가 답한 것은 pg 의 `DatabaseError` 그대로다.
 */
export function createDb(pool: Pool): DbHandle {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: classifyingPool(pool) }),
  })
}
