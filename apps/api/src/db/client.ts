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
 *   거절이 왔다). 연결이 살아 있어도 세운다 — 뒤의 ROLLBACK 이 앞 COMMIT 의 «모름»을 이어받는다(`db/connection-loss.ts` 머리말 «COMMIT 의 «확정 실패»는 서버의 답뿐이다»).
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

/**
 * **풀과 연결에 거는 시간 제한** — `createPool`의 머리말 «네트워크 분할». 값은 env 로 바꾼다(`config.ts`의
 * `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` · `DB_POOL_WAIT_TIMEOUT_MS` · `DB_KEEPALIVE_IDLE_MS`). **0 은 싣지 않는다 — 서버·DB 설정을
 * 따른다**(idle 은 `ALTER DATABASE … SET` 부류가 있으면 그 값이 걸린다 · 풀 대기는 pg 기본인 끝없음 · keepalive 는 OS 기본).
 * 범위는 `config.ts`의 `dbTimeLimitEnv`.
 */
export interface DbTimeLimits {
  /** 서버 쪽 `idle_in_transaction_session_timeout`(ms) — 트랜잭션 안에서 다음 문장을 이만큼 안 받으면 서버가 그 세션을 끝낸다. */
  readonly idleInTransactionMs: number
  /** 풀 `connectionTimeoutMillis`(ms) — 연결을 이만큼 못 얻으면 거절한다(→ 503). */
  readonly poolWaitMs: number
  /** 클라이언트 소켓의 TCP keepalive 첫 탐침까지(ms). 탐침 간격·횟수는 OS 값이다(Node 가 못 바꾼다). */
  readonly keepAliveIdleMs: number
}

/** 기본값 — 근거는 `createPool`의 머리말 «네트워크 분할»의 표. env 가 비면 이것이다(`config.ts`). */
export const DEFAULT_DB_TIME_LIMITS: DbTimeLimits = { idleInTransactionMs: 10_000, poolWaitMs: 5_000, keepAliveIdleMs: 10_000 }

function writeToStderr(error: unknown): void {
  console.error('DB 연결 오류 — 그 연결을 버린다(프로세스는 계속 돈다):', error)
}

/**
 * Postgres 커넥션 풀을 만든다.
 *
 * 풀의 생명주기는 호출자가 소유한다 — 이 함수는 풀을 만들 뿐 닫지 않는다.
 * `main.ts`(운영)와 테스트 하네스가 각각 정확히 한 번씩 만들고 정확히 한 번씩 닫는다.
 *
 * # 연결이 죽어도 프로세스가 안 죽는다
 *
 * pg 는 연결이 끊기면(페일오버 · 네트워크 순단 · 백엔드 종료) 그 `Client`에 `'error'`를 낸다. **듣는 자가 없으면
 * Node 의 `EventEmitter`가 그 자리에서 던지고** 소켓 이벤트 안이라 잡는 자가 없다 — **api 가 통째로
 * 죽는다**(`Emitted 'error' event on Client instance`). 듣는 자가 둘 필요하다 — pg-pool 은
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
 * # 클라이언트 쪽 시간 제한(`query_timeout`)은 받지 않는다
 *
 * pg 는 접속 문자열의 검색 인자를 전부 설정으로 읽으므로(`?query_timeout=1500`) 누가 붙이는 순간 켜진다. 그 타이머는
 * **서버의 일을 멈추지 않고 답을 기다리지 않을 뿐이다** — 시간이 되면 `new Error('Query read timeout')`으로 거절하고
 * 그 질의는 서버에서 계속 돈다(잠금도 쥔 채). 이 거절이 없을 때 켜면 나는 것:
 *
 * | 판 | 값 |
 * |---|---|
 * | COMMIT 이 서버 안에서 3s · `query_timeout=1500` · 코멘트 게시 | 봉투 **500** → 커밋됨 → 고쳐 달면 **두 행**(api 스크립트로 잰다) |
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
 *
 * # 네트워크 분할 — 고아 백엔드와 풀 대기
 *
 * 트랜잭션 도중 api 쪽 연결만 끊기면(분할 · NAT 유휴 끊김) 서버의 백엔드는 **`idle in transaction`으로 잠금을 쥔 채**
 * 남는다. 같은 페이지 쓰기가 그 잠금에 줄을 서 풀을 다 먹고 **다른 사용자 · 다른 프로젝트의 요청과 세션 조회까지** 매달린다.
 * 서버 설정이 전부 0 이고 풀에 대기 시간 제한이 없으면 **고아를 누가 끝낼 때까지** 그렇다(수 시간 — 서버가 죽은
 * 상대를 알아챌 때까지). 잰 것(api 스크립트 · 프록시가 게시의 INSERT 를 서버에 넘기고 api 쪽만 끊는다 · 같은 페이지
 * 게시 13 · 2초마다 다른 사람의 `/auth/me` · 다른 프로젝트 GET):
 *
 * | 설정 | 고아 | 다른 사람의 요청 | 줄 선 게시 | DB |
 * |---|---|---|---|---|
 * | 시간 제한 없음(모두 0) | 30s 에 손으로 끊을 때까지 잠금 23 | 30s 내내 답 없음 | 30s 에 풀림 | — |
 * | 기본값(아래 표) | **10s 에 서버가 끝낸다**(`25P03`) | 5s 에 **503**(풀 대기) → 10s 뒤 200 | 풀을 못 얻은 셋 5s 에 503 · 나머지 10s 에 풀림(먼저 잠금을 얻은 하나 201 · 나머지 409) | 두 행 없음 |
 *
 * 무엇을 걸었고 왜 그 값인가:
 *
 * | 설정 | 값 | 근거(잰 값) |
 * |---|---|---|
 * | 서버 `idle_in_transaction_session_timeout` | **10s** | 고아를 끝내는 직접 수단이다. **이 api 가 트랜잭션 안에서 정당하게 쉬는 시간은 이벤트 루프가 멈춘 시간이다** — 트랜잭션이 기다리는 바깥 일이 없다. 큰 내보내기는 루프를 멈추지 않는다(조립 · 렌더 · 압축이 워커 스레드에서 돈다 — `services/export-worker.ts`): 보통 CPU · 500KB 페이지 36(18MB) HTML 내보내기 동안 옆 편집 트랜잭션의 쉼 최장 0.03s · `/health` 최장 33ms(재는 법은 아래 «정당한 일을 끊는 판» 표의 첫 줄). `pnpm test` api 전량 0.72s(케이스가 일부러 쥔 잠금). 10s 를 넘는 멈춤이면 그 사이 모든 요청이 웹의 기한(10s — `apps/web`의 `WRITE_DEADLINE_MS`·`READ_DEADLINE_MS`)을 이미 넘긴다. 잘못 끊겨도 **503**(«모름»)이다 — 서버는 쉬는 중에만 끝내므로 `FATAL 25P03`은 진행 중인 질의 없이 와서 `'error'` → 표지 → 다음 문장(또는 COMMIT)이 «not queryable»로 간다(`connection-loss.ts`의 표 넷째 줄 · `test/db-partition.test.ts`). 값 300ms 로 띄워 같은 판을 돌려도 옆 편집 124/124 가 200(쉼 최장 0.025s) |
 * | 풀 `connectionTimeoutMillis` | **5s** | 풀이 다 찼을 때 끝없이 기다리지 않고 503(«연결을 얻지 못함» — `connection-loss.ts`의 표 끝 줄). 정당한 대기: 동시 3000 요청 → 최대 3.0s · 503 0. 웹의 기한(10s)보다 짧아야 웹이 끊기 전에 답이 닿는다 |
 * | 클라이언트 TCP keepalive | 켠다 · 첫 탐침 **10s** | 진짜 분할(`iptables` DROP)에서는 api 쪽도 끊긴 줄을 모른다 — 답을 기다리는 질의가 **끝없이** 풀 칸을 쥔다(60s 까지 봤다). 켜면 소켓이 `ETIMEDOUT` → `'error'` → 503. 걸리는 시간은 첫 탐침 + OS 의 간격 × 횟수다(잰 판은 2s × 3 으로 줄인 컨테이너에서 15.6s. 리눅스 기본은 75s × 9 — 약 11분). 탐침은 상대가 살아 있으면 답하므로 긴 잠금 대기를 끊지 않는다 |
 * | 서버 `lock_timeout` · `statement_timeout` | **걸지 않는다** | 고아를 끝내지 못한다(3s 로 걸어도 고아는 10s 까지 산다) · **정당한 기다림을 끊는다** — 이 앱은 페이지 행 잠금에 일부러 줄을 선다. 20s 잠금 뒤의 게시·편집이 두 설정 다 5s 에 봉투 500(`55P03` · `57014` — 서버가 답했으니 확정 실패, 0행) · 안 걸면 19.5s 에 201 · 200. 분할 판에서는 줄 선 같은 페이지 게시 13 이 전부 500 이 되고 재전송도 500 이라 원문 0행 |
 * | 서버 TCP keepalive | 걸지 않는다 | 잠금을 쥔 고아는 위 첫 줄이 끝낸다(진짜 분할에서도 10s — 잰 것). 트랜잭션 밖 고아는 잠금이 없다 — 연결 칸 하나를 OS 기본(약 2시간)까지 쥔다 |
 *
 * **이 값들이 정당한 일을 끊는 판** — 끊지 않는 판은 그 까닭과 함께, 끊는 판은 고치지 않고 수를 둔다:
 *
 * | 판 | 값 |
 * |---|---|
 * | 느린 CPU 에서 큰 HTML 내보내기(idle 10s) | **끊지 않는다** — 조립 · 렌더 · 압축이 워커 스레드에서 돈다(`services/export-worker.ts`). 메인이 쥐는 것은 DB 읽기와 페이지 한 장씩의 복제다. `taskpolicy -b`로 CPU 를 늦춘 api · 36MB(500KB 페이지 72) HTML 내보내기 · 기계 load 13–17: 내보내기만 돌린 판 `/health` 최장 71–112ms · 옆 편집을 잇달아 건 판 0.43–0.68s(편집만 돌린 판 0.11–0.26s — 둘이 CPU 를 나눠 쓴 몫) · 옆 편집 200 × 125–134 · 503 0 · 트랜잭션 안 쉼 최장 0.67s. 같은 판을 같은 스레드에서 돌리면 루프가 내보내기 내내(9.2–10.7s) 서고 쉼이 9.57s 까지 간다(10s 를 넘으면 503 «모름» · 커밋 0 · `25P03`). **기계가 붐비면 이 수가 는다** — 워커가 메인과 CPU 를 다툰다(load 75 에서 내보내기만 돌린 판 1.7–3.5s · 편집만 돌린 판 1.0–1.1s). 재는 법: api 스크립트 — 프로젝트를 만들고 내보내기 1회 동안 같은 api 에 ops PATCH 를 잇달아 · `/health` 20ms 간격 · `pg_stat_activity` 20ms 표본(`idle in transaction` 구간의 최장) |
 * | 잠금 대기가 풀을 채우는 판(풀 대기 5s) | 76MB 스냅샷 복원(프로젝트 전체 잠금 13s) + 같은 프로젝트 편집 12 가 줄 섬 → 풀 10 칸 = 복원 1 + 줄 선 편집 9 · **줄을 못 선 편집 셋과 무관한 다른 프로젝트의 조회가 5s 에 503**. 풀 대기 0 이면 그 조회는 **8s 넘게 무응답** 뒤 200 — 대가는 «늦은 성공»(5–10s) 창이 503 이 되는 것이다. 동시 3000 요청 → 503 0 은 잠금을 쥐지 않는 가벼운 요청만 잰 값이다 |
 *
 * **클라이언트 쪽 `query_timeout`은 안 된다**(위 절). 서버 쪽 시간 제한의 오류는 서버가 SQLSTATE 로 답하므로
 * `connection-loss.ts`의 경계 표 그대로 간다 — 연결을 끝내는 것은 «잃었다 → 503», 문장만 멈추는 것은 확정 실패 → 500.
 */
export function createPool(
  databaseUrl: string,
  onError: PoolErrorSink = writeToStderr,
  limits: DbTimeLimits = DEFAULT_DB_TIME_LIMITS,
): Pool {
  refuseClientSideQueryTimeout(databaseUrl)
  refuseUrlLevelIdleTimeout(databaseUrl)
  const pool = new Pool({
    connectionString: databaseUrl,
    // pg 가 기동 메시지에 싣는다(`Client.getStartupConf`) — 서버가 그 세션에 건다. 0 이면 안 싣는다(서버 설정을 따른다).
    idle_in_transaction_session_timeout: limits.idleInTransactionMs,
    // pg-pool 이 대기 줄과 새 연결 맺기 둘 다에 쓴다. 0 이면 끝없이 기다린다(pg-pool 의 뜻).
    connectionTimeoutMillis: limits.poolWaitMs,
    keepAlive: limits.keepAliveIdleMs > 0,
    keepAliveInitialDelayMillis: limits.keepAliveIdleMs,
  })
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
 * **접속 문자열의 `idle_in_transaction_session_timeout`은 받지 않는다** — pg 는 접속 문자열의 검색 인자를 설정 **위에**
 * 얹으므로(`ConnectionParameters`의 `Object.assign(config, parse(connectionString))`) `?…=0` 한 줄이 env 값을 조용히 이긴다.
 * 값은 한 자리(`DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`)에서만 온다. `?options=-c …`는 막지 않는다 — 기동 인자가 그것보다 늦게 적용돼 이긴다.
 */
function refuseUrlLevelIdleTimeout(databaseUrl: string): void {
  const resolved = (new Client({ connectionString: databaseUrl }) as unknown as {
    connectionParameters?: { idle_in_transaction_session_timeout?: unknown }
  }).connectionParameters
  // pg 의 기본값은 `false`다(`pg/lib/defaults.js`) — 그것이 «안 줬다». `?…=0`은 문자열 `'0'`이라 걸린다.
  const fromUrl = resolved?.idle_in_transaction_session_timeout
  if (fromUrl !== undefined && fromUrl !== false) {
    throw new Error(
      `DB 접속 설정에 idle_in_transaction_session_timeout(${String(fromUrl)})이 있습니다 — ` +
        'env 의 DB_IDLE_IN_TRANSACTION_TIMEOUT_MS 로 주십시오(apps/api/src/db/client.ts 의 createPool)',
    )
  }
}

/**
 * **기동 때 한 번 — 실은 idle 시간 제한이 실제로 걸렸는가**. `main.ts`·`migrate.ts`가 풀을 만든
 * 직후, 첫 질의 전에 부른다.
 *
 * pg 는 `idle_in_transaction_session_timeout`을 **기동 메시지에** 싣는다(`Client.getStartupConf`). 서버 앞에 풀러가 있으면
 * 그 인자가 서버에 안 닿을 수 있다 — 흔한 앞단 pgbouncer 로 잰 값(모듈 스크립트 · `edoburu/pgbouncer` 1.25.2):
 *
 * | 앞단 | 이 함수가 없으면 | 이 함수 |
 * |---|---|---|
 * | 기본 설정 — 모르는 기동 인자를 **거절**(`FATAL 08P01 unsupported startup parameter: …`) | api·migrate 가 첫 질의에서 죽고 첫 줄은 «연결을 잃었습니다 — 반영됐는지 모릅니다»(거절은 `cause`에만) | **무엇이 거절됐고 무엇을 하라**를 첫 줄에 말하고 **던진다**(기동을 멈춘다) |
 * | `ignore_startup_parameters`에 넣음 — 인자를 **조용히 버림** | 뜨고 세션 값은 `0` — 고아를 끝내는 수단이 통째로 없는데 아무 말도 없다 | 세션의 값을 읽어 **실은 값과 다르면 `warn`**(기동은 계속) |
 *
 * **0 을 준 판은 재지 않는다** — 싣지 않았으니 서버·DB 설정을 따르는 것이 뜻이다(연결도 열지 않는다). **그 밖의 연결 실패는
 * 삼킨다** — DB 가 안 떠 있는 판을 말하는 자리는 따로 있다(`main.ts`의 빈 DB 안내 · 첫 질의의 경계 표). 여기서 던지면 그 말을
 * 가린다.
 */
export async function verifyDbTimeLimits(pool: Pool, limits: DbTimeLimits, warn: (message: string) => void): Promise<void> {
  if (limits.idleInTransactionMs === 0) return
  let client: PoolClient
  try {
    client = await pool.connect()
  } catch (error) {
    const rejected = rejectedStartupParameter(error)
    if (rejected !== undefined) throw new Error(describeStartupRejection(rejected), { cause: error })
    return
  }
  let applied: number
  try {
    // `SHOW`는 단위를 붙여 준다('10s') — `pg_settings.setting`은 ms 그대로다.
    const { rows } = await client.query<{ setting: string }>(
      `select setting from pg_settings where name = 'idle_in_transaction_session_timeout'`,
    )
    applied = Number(rows[0]?.setting)
  } catch {
    return
  } finally {
    client.release()
  }
  if (applied !== limits.idleInTransactionMs) {
    warn(
      `DB 세션의 idle_in_transaction_session_timeout 이 ${applied}ms 입니다 — 실은 값은 ${limits.idleInTransactionMs}ms ` +
        '(DB_IDLE_IN_TRANSACTION_TIMEOUT_MS). 앞단(풀러)이 기동 인자를 버렸을 수 있습니다(pgbouncer 의 ignore_startup_parameters). ' +
        '분할에 남은 고아 백엔드를 이 값대로 끝내지 못합니다 — 서버·DB 쪽(ALTER DATABASE … SET · postgresql.conf)에 거십시오',
    )
  }
}

/** 기동 인자 거절이면 그 인자 이름 — pgbouncer 의 `FATAL 08P01 unsupported startup parameter: <이름>`. */
function rejectedStartupParameter(error: unknown): string | undefined {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  if (code !== '08P01' || typeof message !== 'string') return undefined
  const matched = /unsupported startup parameter:\s*(\S+)/i.exec(message)
  return matched?.[1]
}

function describeStartupRejection(parameter: string): string {
  const head = `DB 앞단(풀러 — pgbouncer 부류)이 기동 인자 ${parameter} 을 거절했습니다(08P01 unsupported startup parameter). `
  if (parameter !== 'idle_in_transaction_session_timeout') {
    return head + `접속 문자열에서 그 인자를 빼거나 풀러의 ignore_startup_parameters 에 더하십시오`
  }
  return (
    head +
    '둘 중 하나를 하십시오: ① DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=0 — 이 값을 싣지 않고 서버·DB 설정을 따릅니다 ' +
    '② 풀러의 ignore_startup_parameters 에 idle_in_transaction_session_timeout 을 더한다 — 풀러가 그 값을 버리므로 ' +
    '서버·DB 쪽(ALTER DATABASE … SET)에 따로 거십시오(안 걸면 기동 때 경고가 납니다). 근거: apps/api/src/db/client.ts 의 verifyDbTimeLimits'
  )
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
