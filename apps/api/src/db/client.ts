import { Kysely, PostgresDialect, type PostgresPool, type PostgresPoolClient } from 'kysely'
import { Client, Pool, type PoolClient } from 'pg'
import { DbConnectionLostError, answeredByServer, classifyConnectFailure, classifyQueryFailure } from './connection-loss'
import type { Database } from './types'
import type { DbHandle } from './tx'

/**
 * **잃은 연결** — `db/connection-loss.ts`의 머리말 «경계»의 표지. 세우는 자가 둘이다:
 *
 * - `createPool`이 클라이언트마다 다는 듣는 자 — 그 연결이 `'error'`를 냈다(죽었다).
 * - `classifyingPool` — **그 연결의 거절을 «잃었다»로 갈랐다**(서버가 `08`·`57P`로 답했다 · COMMIT 에 서버의 답이 아닌
 *   거절이 왔다). 연결이 살아 있어도 세운다 — 뒤의 ROLLBACK 이 앞 COMMIT 의 «모름»을 이어받는다(머리말 (e)).
 *
 * 표지 선 클라이언트의 거절은 무엇이든 잃은 것이고, **풀에 돌려주지 않는다**(`classifyingPool`의 `release`).
 */
const lostClients = new WeakSet<object>()

/**
 * **Kysely 가 보내는 COMMIT 문장 그대로**(`PostgresDriver.commitTransaction` → `CompiledQuery.raw('commit')`). 이 저장소의
 * 트랜잭션은 전부 `db.transaction()`을 지난다(`db/tx.ts` — 안쪽은 SAVEPOINT 라 COMMIT 이 아니다). Kysely 가 이 글자를
 * 바꾸면 COMMIT 줄이 조용히 꺼지는데, 그것을 `test/db-connection-loss.test.ts`의 *"COMMIT 이 서버의 답 없이 …"*가
 * 진짜 트랜잭션으로 잰다 — 빨강으로 드러난다.
 */
const KYSELY_COMMIT = 'commit'

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
 *
 * # 클라이언트 쪽 시간 제한(`query_timeout`)은 받지 않는다 (2026-09-22 리뷰 (e))
 *
 * pg 는 접속 문자열의 검색 인자를 전부 설정으로 읽으므로(`?query_timeout=1500`) 누가 붙이는 순간 켜진다. 그 타이머는
 * **서버의 일을 멈추지 않고 답을 기다리지 않을 뿐이다** — 시간이 되면 `new Error('Query read timeout')`으로 거절하고
 * 그 질의는 서버에서 계속 돈다(잠금도 쥔 채). 잰 것(이 판 전 `ce4f6d7`):
 *
 * | 판 | 값 |
 * |---|---|
 * | COMMIT 이 서버 안에서 3s · `query_timeout=1500` · 코멘트 게시 | 봉투 **500** → 커밋됨 → 고쳐 달면 **두 행**(리뷰 (e) · api 스크립트로 다시 쟀다) |
 * | 1.5s 걸리는 INSERT · `query_timeout=400` · 풀 하나 | 뒤따른 ROLLBACK 이 **큐에서 빠진 채** 거절 → 그 연결이 열린 트랜잭션을 안고 풀로 → **다음 트랜잭션의 COMMIT 이 «실패로 답한» 행까지 커밋**(탐침) |
 *
 * 앞 줄은 COMMIT 줄(`db/connection-loss.ts`)이, 뒷줄은 «서버의 답이 아닌 거절을 낸 연결을 버린다»(`classifyingPool`)가
 * 막는다 — **그래도 거절한다.** 둘이 서도 남는 것이 있다: 트랜잭션 밖 한 문장(자동 커밋)이 타이머로 거절되면 커밋됐는지
 * 모르는데 규칙이 없고(`connection-loss.ts`는 그 자리를 «보내기 전 오류뿐»이라는 이 거절 위에 둔다), 타이머가 설 때마다
 * 연결을 하나씩 버리며, 끊긴 질의가 서버에서 잠금을 쥔 채 계속 돈다. **서버 쪽 `statement_timeout`**
 * (`?options=-c%20statement_timeout%3D…`)은 서버가 문장을 **멈추고** `57014`로 답하므로(연결이 살고 트랜잭션은 커밋되지
 * 않는다 — 확정 실패) 이 셋이 다 없다.
 *
 * **pg 가 읽는 그대로 본다** — 접속 문자열 · `pg.defaults`를 pg 가 합친 값(`Client`의 `connectionParameters`)이다. 그 자리가
 * 없으면(pg 가 바꾼 날) 판정하지 못했다고 던진다 — 조용히 지나가지 않는다. **만든 뒤 `pool.options`에 넣는 것은 막지
 * 않는다** — 그렇게 하는 자는 이 둘을 따로 재는 케이스뿐이다(`test/db-connection-loss.test.ts`).
 */
export function createPool(databaseUrl: string, onError: PoolErrorSink = writeToStderr): Pool {
  refuseClientSideQueryTimeout(databaseUrl)
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

/** `createPool`의 머리말 «클라이언트 쪽 시간 제한은 받지 않는다». 연결은 열지 않는다 — `Client`는 만들기만 한다. */
function refuseClientSideQueryTimeout(databaseUrl: string): void {
  const resolved = (new Client({ connectionString: databaseUrl }) as unknown as { connectionParameters?: { query_timeout?: unknown } })
    .connectionParameters
  if (resolved === undefined) {
    throw new Error('DB 접속 설정의 query_timeout 을 판정하지 못했습니다 — pg 의 Client 에 connectionParameters 가 없습니다')
  }
  if (resolved.query_timeout) {
    throw new Error(
      `DB 접속 설정에 query_timeout(${String(resolved.query_timeout)})이 있습니다 — 클라이언트 쪽 시간 제한은 COMMIT 의 결과를 ` +
        '모르게 하고 끊긴 질의를 서버에 남깁니다. 서버 쪽 statement_timeout 을 쓰십시오(apps/api/src/db/client.ts 의 createPool)',
    )
  }
}

/**
 * 풀을 Kysely 에 넘기되 **거절을 가르는 층**을 끼운다 — 연결을 잃은 거절은 `DbConnectionLostError`로 감싼다
 * (`db/connection-loss.ts`). Kysely 는 풀에서 `connect`·`end`만, 클라이언트에서 `query`·`release`만 부르므로
 * (`PostgresPool`·`PostgresPoolClient`) 그 넷만 옮긴다. **스트리밍(커서)은 없다** — 이 저장소는 `cursor`를 넘기지
 * 않으므로 Kysely 가 그 길을 열지 않는다.
 *
 * **거절 하나를 보고 그 연결에 두 가지를 적는다**(`connection-loss.ts` 머리말의 표 넷째 칸):
 *
 * | 무엇 | 언제 | 왜 |
 * |---|---|---|
 * | 표지(`lostClients`) | «잃었다»로 갈랐을 때 | 뒤의 거절(COMMIT 뒤 Kysely 의 ROLLBACK)이 «모름»을 이어받는다 |
 * | **버린다**(`release(true)`) | **서버가 확정으로 답한 거절이 아닐 때** — «잃었다» 또는 서버의 답이 아님 | 그 연결의 상태를 모른다. 서버가 FATAL 로 답한 연결은 소켓 끝이 늦게 와 pg-pool 이 놀리고(곁), 타이머로 끊긴 연결은 열린 트랜잭션을 안고 돌아온다(`createPool`의 표) |
 *
 * 둘을 한 표지로 합치지 않은 까닭: 트랜잭션 중간의 «서버 답 없는 거절»은 **확정 실패로 두고**(`connection-loss.ts`) 연결만
 * 버린다 — 표지를 세우면 뒤의 ROLLBACK 거절이 «모름»으로 넓어진다.
 */
function classifyingPool(pool: Pool): PostgresPool {
  const wrapped = new WeakMap<PoolClient, PostgresPoolClient>()

  function wrap(client: PoolClient): PostgresPoolClient {
    const known = wrapped.get(client)
    if (known) return known
    /** 풀에 돌려주지 않는다 — 한 번 서면 그 클라이언트는 버려지므로 다시 내려갈 일이 없다. */
    let discard = false
    const query = async (sql: string, parameters: ReadonlyArray<unknown>) => {
      try {
        return await client.query(sql, [...parameters])
      } catch (error) {
        const failure = classifyQueryFailure(error, {
          connectionLost: lostClients.has(client),
          settlesCommit: sql === KYSELY_COMMIT,
        })
        if (failure instanceof DbConnectionLostError) lostClients.add(client)
        if (!(answeredByServer(error) && failure === error)) discard = true
        throw failure
      }
    }
    const facade: PostgresPoolClient = {
      // 커서를 받는 겹침(overload)은 옮기지 않는다 — 위 머리말(Kysely 가 그 길을 열지 않는다).
      query: query as unknown as PostgresPoolClient['query'],
      release: () => client.release(discard),
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
