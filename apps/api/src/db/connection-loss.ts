/**
 * **DB 가 그 질의에 답하지 않았다** — 연결이 끊겼거나 닿지 못했거나, **COMMIT 에 서버의 답이 아닌 거절이 왔다.** 그 질의가
 * (그리고 그 트랜잭션이) 커밋됐는지 **모른다.** `http/error-handler.ts`가 이것을 503 으로 낸다 — 봉투 있는 500(«그 요청은 커밋 전»)이 아니다.
 *
 * # 왜 갈라야 하는가
 *
 * 웹은 코멘트 게시의 **봉투 있는 500 을 «그 요청은 커밋 전 — 확정 안 달림»으로 읽는다**(`apps/web`의
 * `comment-panel.tsx`의 `knownRejection` 표). 그 전제가 틀리는 자리가 하나 있다 — **COMMIT 은 Postgres 에
 * 닿아 커밋됐는데 그 응답이 유실되는 판.** 그때 api 프로세스가 **죽으면**(pg `Client`의 `'error'`에 듣는
 * 자가 없으면) 봉투 없는 500 이 나가 웹이 «모름»으로 옳게 가지만 — *«전제는 우연히 산다»*.
 * api 가 안 죽으면(`db/client.ts`) 그 판이 **봉투 있는 500 → «확정 안 달림» → 고쳐 달면 두 행**이 된다.
 * 그래서 api 를 살리는 것과 **그 판을 «모름»으로 내는 것**은 한 짝이다.
 *
 * # 경계 — 값으로 가른다
 *
 * **서버의 답**은 pg 의 `DatabaseError` 중 **SQLSTATE 가 실린 것**이다(`answeredByServer`). pg 는 알 수 없는 메시지를
 * 받았을 때도 코드 없는 `DatabaseError`를 만든다(`pg-protocol` 파서의 «received invalid response») — 그것은 서버의 답이 아니다.
 *
 * | 무엇이 왔나 | 뜻 | 여기서 | 그 연결(`db/client.ts`) |
 * |---|---|---|---|
 * | 서버가 **답했다** · SQLSTATE 가 아래 두 부류 밖 | 그 문장은 실패했고 트랜잭션은 커밋되지 않는다 — **확정 실패** | 그대로 지나간다 | 풀로 돌아간다 |
 * | 서버가 답했는데 SQLSTATE 가 **`08`(연결 예외) · `57P`(운영자 개입 — 종료·재시작)** | 서버가 «이 연결은 끝났다»고 말한 것이다 — 그 앞 문장이 어디까지 갔는지 이 값으로는 모른다(`08007`은 이름부터 «트랜잭션 결과 모름»이다) | **잃었다** | **버린다** — 소켓 끝은 답보다 늦게 온다(아래 «곁») |
 * | **COMMIT** 에 서버의 답이 **아닌** 거절이 왔다 — 클라이언트 쪽 시간 제한 · 드라이버 오류 · 코드 없는 `DatabaseError` · **아직 모르는 무엇이든** | COMMIT 이 서버에서 어떻게 됐는지 모른다 | **잃었다** — **표지를 보지 않는다**(아래 «COMMIT 의 «확정 실패»는 서버의 답뿐이다») | 버린다 |
 * | 서버의 답 없이 **그 연결이 죽었다**(`'error'` 표지) · 또는 **그 연결의 앞 거절을 «잃었다»로 갈랐다**(표지 — COMMIT 뒤 Kysely 가 보내는 ROLLBACK 이 여기다) | 답을 못 받았다 · 앞 COMMIT 의 결과를 모른다 | **잃었다** | 버린다 |
 * | **트랜잭션 중간** 문장에 서버의 답이 아닌 거절이 왔다 | COMMIT 은 가지 않는다(아래) — **확정 실패** | 그대로 지나간다 | **버린다** — 이것이 «확정»을 참으로 만든다 |
 * | **연결을 얻지 못했다**(`ECONNREFUSED` · 서버 기동 중 `57P03` …) | 아무것도 안 보냈다 — 사실은 «확정 실패»다 | **잃었다**(아래) | — |
 *
 * **«연결이 죽었다»는 오류의 모양이 아니라 그 클라이언트가 `'error'`를 냈는가로 본다**(`db/client.ts`의 `lostClients`).
 * pg 는 연결이 죽으면 `'error'`를 **동기로** 내고 매달린 질의의 거절은 `nextTick`으로 미루므로
 * (`pg/lib/client.js`의 `_handleErrorEvent` → `_errorAllQueries`), 거절을 받는 순간 표지는 이미 서 있다.
 * **글자로 가르지 않는다** — pg 가 낸 연결 오류(`Connection terminated unexpectedly` · `…not queryable`)는
 * 코드가 없는 맨 `Error`라 문장을 대조해야 하는데, 그 문장은 pg 가 바꾸는 날 조용히 틀린다.
 *
 * ## COMMIT 의 «확정 실패»는 서버의 답뿐이다 — 표지에 기대지 않는다
 *
 * **«답을 못 받은 거절은 전부 `'error'`를 동반한다»**는 전제는 틀린다 — 그 전제 위에 표지 줄만 두면 이 판을 못 잡는다:
 * 접속 문자열에 `?query_timeout=1500`을 붙이고 COMMIT 이 서버 안에서 3s 걸리면 pg 가 **자기 타이머로**
 * `new Error('Query read timeout')`을 내고 연결은 그대로 둔다(`'error'` 없음 · 코드 없음) → 봉투 500 → 웹이 «확정 안
 * 달림» → **두 행**. 그래서 COMMIT 에서는 **무엇이 왔는지 열거하지 않고** «서버의 답인가»만 본다.
 *
 * - **그 뒤 ROLLBACK**: Kysely 는 COMMIT 이 실패하면 ROLLBACK 을 보내고 **그 오류가 앞의 것을 덮는다**
 *   (`Transaction.execute`의 `catch`). COMMIT 을 «잃었다»로 가른 순간 그 연결에 표지가 서므로(`db/client.ts`) 뒤의
 *   ROLLBACK 의 거절은 **무엇이든**(서버가 답한 것이어도) 잃은 것이다 — 서버가 ROLLBACK 에 답했다는 것은 COMMIT 의 결과를
 *   말해 주지 않는다. ROLLBACK 이 성공하면 COMMIT 의 오류가 그대로 던져진다.
 * - **COMMIT 을 알아보는 자**는 Kysely 가 보내는 문장 그대로다(`db/client.ts`의 `KYSELY_COMMIT`) — 이 저장소의
 *   트랜잭션은 전부 `db.transaction()`을 지나고(`db/tx.ts`) 손으로 쓴 `commit`은 없다.
 *
 * ## 트랜잭션 중간 문장 — 확정 실패로 둔다 (그 연결을 버리는 것이 조건이다)
 *
 * 트랜잭션은 COMMIT 으로만 커밋된다. Kysely 는 콜백이 **이행될 때만** COMMIT 을 보내므로, 오류 처리기까지 올라온 거절은
 * COMMIT 을 부르지 않았다 — **그 요청의 COMMIT 은 가지 않는다.** 남는 길은 하나다 — **그 연결이 열린 트랜잭션을 안은 채
 * 풀로 돌아가 다음 빌린 자의 COMMIT 에 실려 가는 것.** 잰 것이다(탐침 · 풀 하나 · `createPool`의 거절을 끄고
 * `query_timeout=400`): 1.5s 걸리는 INSERT 가 타이머로 거절되면 Kysely 의 ROLLBACK 이 **큐에서 빠진 채**(pg 는 시간이 된
 * 대기 질의를 보내지 않고 지운다) 거절되고, 그 요청은 맨 `Error`(«확정 실패»)로 끝나는데 연결을 풀에 돌려주면 **다음
 * 트랜잭션의 COMMIT 이 그 행까지 커밋한다** — `["first (실패로 답함)","second"]`. 그래서 **서버의 답이 아닌 거절을 낸 연결은 풀에 돌려주지
 * 않는다**(`db/client.ts`) — 연결이 닫히면 서버가 그 트랜잭션을 되돌린다. 이 둘이 서면 «커밋 전»은 거절의 출처를 열거하지
 * 않고도 참이다.
 *
 * «잃었다»로 넓히지 않은 이유: 넓혀도 안전하지만(거짓 «모름») 얻는 것이 없다 — 위 둘로 이미 참이고, 넓히면 보내기 전
 * 오류(값 직렬화 실패 — 버그다)가 «반영됐는지 모른다»로 읽혀 «다시 확인»이 같은 버그를 되풀이한다.
 *
 * **트랜잭션 밖 한 문장(자동 커밋)** 은 COMMIT 과 같은 자리지만 규칙을 두지 않는다 — `createPool`이 클라이언트 쪽 시간
 * 제한을 거절한 뒤(`db/client.ts`) 그 자리의 «서버 답 없는 거절»은 보내기 전 오류(아무것도 안 갔다)와 행 해석 오류(pg 의
 * 기본 해석기는 서버가 준 표준 형식에서 던지지 않는다)뿐이고, **봉투 500 을 «커밋 전»으로 읽는 자리(코멘트 게시)는
 * 트랜잭션이다**(COMMIT 줄이 막는다). 재지 않았다 — 코드 읽기.
 *
 * **모름 쪽으로 넓게 잡은 것.** 연결을 얻지 못한 판과, 트랜잭션 중간 문장에서 **연결이 죽은** 판(COMMIT 을 안 보냈다)은
 * 사실 «확정 실패»인데 «모름»으로 낸다. 거짓 «모름»의 값은 사용자가 «다시 확인»을 한 번 더 누르는 것이고 —
 * 코멘트 게시는 같은 키로 다시 보내 재생하거나 한 번 단다 — **거짓 «확정 실패»의 값은 두 행이다.** 방향이 같지 않다.
 *
 * ## 곁 — 서버가 FATAL 로 «답한» 연결을 버린다
 *
 * SQLSTATE 로 «잃었다»고 가른 거절(둘째 줄)은 서버의 답이 **먼저** 오고 소켓 끝이 **뒤에** 온다. 그 틈에 핸들러가 연결을
 * 돌려주면 `_queryable`이 아직 참이라 pg-pool 이 그것을 놀리고, 다음 요청이 집어 **멀쩡한 DB 에서 거짓 503** 이 난다(api
 * 스크립트 · 서버의 진짜 `FATAL 08P01` 직후의 `/auth/me`). 그래서 그 연결에도 표지가 서고 버려진다.
 *
 * # 잰 값 — Chrome
 *
 * 설치된 Chrome → Vite → api → **TCP 프록시**(COMMIT 은 Postgres 에 넘기고 그 답이 오는 순간 api 쪽 소켓을 끊는다) →
 * Postgres. 코멘트 게시 한 번:
 *
 * | 판 | 게시 | 화면 | DB |
 * |---|---|---|---|
 * | 변조 — pg `Client`의 `'error'`에 듣는 자 없음 | api **사망** → 500 `text/plain` 빈 본문 ×2 | «모름» + «다시 확인» · 상자 잠김 | 1행 |
 * | COMMIT 답만 잃음 | **503 봉투** → 웹이 곧바로 같은 키로 다시 보냄 → **200 재생**(풀은 새 연결) | 목록에 그 말 · 상자 비움 · «번호를 화면에 반영하지 못했습니다» | **1행** |
 * | 다시 보낸 것의 재생 질의도 잃음 | 503 · 503 → «모름» + «다시 확인» · 상자 잠김 → 누르면 **200 재생** | 목록에 그 말 · 상자 비움 | **1행** |
 * | 변조 — api 는 살고 503 대신 봉투 500 | 500 봉투 → «서버 오류가 발생했습니다» · **초안 열림** · 다시 보내지 않음 → 고쳐 달면 새 키 201 | 목록에 둘 | **2행** |
 *
 * 마지막 줄이 이 파일이 막는 판이다 — api 를 살리기만 하고 이것을 안 가르면 그렇게 된다.
 *
 * **COMMIT 이 서버 안에서 3s**(지연 제약 트리거) · 접속 문자열 `?query_timeout=1500` — 머리말 «COMMIT 의 «확정 실패»는
 * 서버의 답뿐이다». 프록시 없음:
 *
 * | 판 | 게시 | 화면 | DB |
 * |---|---|---|---|
 * | 변조 — COMMIT 줄도 `createPool`의 거절도 끈 판 | 3.1s **봉투 500** → «서버 오류가 발생했습니다» · 초안 열림 → 고쳐 달면 새 키 201 | 목록에 둘 | **2행** |
 * | 변조 — `createPool`의 거절만 끈 판(COMMIT 줄만 잰다) | 3.1s **503 봉투** → 웹이 곧바로 **같은 키**로 다시 보냄 → **200 재생** | 상자 비움 · 목록에 그 말 · «번호를 화면에 반영하지 못했습니다» · alert 없음 | **1행** |
 * | 그대로 | **api 가 뜨지 않는다** — `createPool`이 그 설정을 거절한다(`db/client.ts`) | — | — |
 *
 * # 여기에 없는 것
 *
 * - **서버가 답한 뒤에 도는 우리 코드의 오류**(응답 직렬화 · 커밋 뒤 방송)는 이것과 무관하다 — 커밋 뒤에 던지는
 *   자리가 게시 경로에 없다는 것은 `comment-panel.tsx`의 `knownRejection` 머리말이 코드로 봤다.
 * - **pg 가 질의를 보내기 전에 낸 오류**(값 직렬화 실패 등)는 **그대로 지나간다** — 500 이다(COMMIT 은 값이 없어 이 길이
 *   없다). 서버의 답이 아니므로 그 연결은 버린다(표 다섯째 줄과 같은 자리).
 */
import { DatabaseError } from 'pg'

/** SQLSTATE 부류 중 «이 연결은 끝났다»는 뜻인 것. 머리말의 표 둘째 줄. */
const CONNECTION_ENDED_SQLSTATE = ['08', '57P'] as const

export class DbConnectionLostError extends Error {
  constructor(cause: unknown) {
    super('데이터베이스와의 연결을 잃었습니다 — 그 질의가 반영됐는지 모릅니다', { cause })
    this.name = 'DbConnectionLostError'
  }
}

/** **서버가 SQLSTATE 를 실어 답했는가** — 머리말 «경계»의 첫머리. 코드 없는 `DatabaseError`는 서버의 답이 아니다. */
export function answeredByServer(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError && typeof error.code === 'string'
}

/** 서버가 «이 연결은 끝났다»고 답했는가 — 머리말의 표 둘째 줄. */
function saysConnectionEnded(error: unknown): boolean {
  return answeredByServer(error) && CONNECTION_ENDED_SQLSTATE.some((prefix) => error.code?.startsWith(prefix))
}

/** 거절을 가를 때 쓰는 그 질의의 자리 — `db/client.ts`가 채운다. */
export interface QueryFailureContext {
  /** **그 연결을 이미 잃었다** — `'error'`를 냈거나 앞 거절을 «잃었다»로 갈랐다(`db/client.ts`의 `lostClients`). */
  readonly connectionLost: boolean
  /** **그 문장이 COMMIT 이다** — 머리말 «COMMIT 의 «확정 실패»는 서버의 답뿐이다». */
  readonly settlesCommit: boolean
}

/**
 * 질의의 거절을 가른다 — 머리말의 표. 잃었으면 `DbConnectionLostError`로 감싸고, 아니면 받은 것을 그대로 돌려준다.
 * **COMMIT 줄은 표지를 보지 않는다** — «서버의 답인가»만 본다(머리말 «COMMIT 의 «확정 실패»는 서버의 답뿐이다»).
 */
export function classifyQueryFailure(error: unknown, context: QueryFailureContext): unknown {
  if (error instanceof DbConnectionLostError) return error
  if (context.connectionLost || saysConnectionEnded(error)) return new DbConnectionLostError(error)
  if (context.settlesCommit && !answeredByServer(error)) return new DbConnectionLostError(error)
  return error
}

/**
 * 연결을 얻지 못한 실패를 가른다 — **서버가 답해 거절한 것**(인증 실패 `28P01` · DB 없음 `3D000` · 연결 수 초과
 * `53300`)은 설정의 문제라 그대로 두고, 그 밖(닿지 못함 · 서버가 «끝났다»고 답함)은 잃은 것이다. 머리말의 표 끝 줄.
 */
export function classifyConnectFailure(error: unknown): unknown {
  if (answeredByServer(error) && !saysConnectionEnded(error)) return error
  return error instanceof DbConnectionLostError ? error : new DbConnectionLostError(error)
}
