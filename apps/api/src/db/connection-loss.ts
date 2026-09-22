/**
 * **DB 가 그 질의에 답하지 않았다** — 연결이 끊겼거나 닿지 못했다. 그 질의가(그리고 그 트랜잭션이) 커밋됐는지
 * **모른다.** `http/error-handler.ts`가 이것을 503 으로 낸다 — 봉투 있는 500(«그 요청은 커밋 전»)이 아니다.
 *
 * # 왜 갈라야 하는가 (2026-09-22 이월 W)
 *
 * 웹은 코멘트 게시의 **봉투 있는 500 을 «그 요청은 커밋 전 — 확정 안 달림»으로 읽는다**(`apps/web`의
 * `comment-panel.tsx`의 `knownRejection` 표). 그 전제가 틀리는 자리가 하나 있었다 — **COMMIT 은 Postgres 에
 * 닿아 커밋됐는데 그 응답이 유실되는 판.** 앞 판은 그때 api 프로세스가 **죽어서**(pg `Client`의 `'error'`에 듣는
 * 자가 없었다) 봉투 없는 500 이 나갔고 웹이 «모름»으로 옳게 갔다 — *«전제는 우연히 산다»*(좁은 반증 3차 b-1).
 * api 가 안 죽게 고치면(`db/client.ts`) 그 판이 **봉투 있는 500 → «확정 안 달림» → 고쳐 달면 두 행**이 된다.
 * 그래서 api 를 살리는 것과 **그 판을 «모름»으로 내는 것**이 한 수정이다.
 *
 * # 경계 — 값으로 가른다
 *
 * | 무엇이 왔나 | 뜻 | 여기서 |
 * |---|---|---|
 * | 서버가 **오류 응답으로 답했다**(pg `DatabaseError` · SQLSTATE 가 아래 두 부류 밖) | 그 문장은 실패했고 트랜잭션은 커밋되지 않는다 — **확정 실패** | 그대로 지나간다 |
 * | 서버가 답했는데 SQLSTATE 가 **`08`(연결 예외) · `57P`(운영자 개입 — 종료·재시작)** | 서버가 «이 연결은 끝났다»고 말한 것이다 — 그 앞 문장이 어디까지 갔는지 이 값으로는 모른다(`08007`은 이름부터 «트랜잭션 결과 모름»이다) | **잃었다** |
 * | 서버의 답 없이 **그 연결이 죽었다**(소켓 끊김 · `ECONNRESET` · 끊긴 뒤 보낸 질의의 «not queryable») | 답을 못 받았다 — **모른다** | **잃었다** |
 * | **연결을 얻지 못했다**(`ECONNREFUSED` · 서버 기동 중 `57P03` …) | 아무것도 안 보냈다 — 사실은 «확정 실패»다 | **잃었다**(아래) |
 *
 * «그 연결이 죽었다»는 오류의 모양이 아니라 **그 클라이언트가 `'error'`를 냈는가**로 본다(`db/client.ts`의
 * `lostClients`). pg 는 연결이 죽으면 `'error'`를 **동기로** 내고 매달린 질의의 거절은 `nextTick`으로 미루므로
 * (`pg/lib/client.js`의 `_handleErrorEvent` → `_errorAllQueries`), 거절을 받는 순간 표지는 이미 서 있다.
 * **글자로 가르지 않는다** — pg 가 낸 연결 오류(`Connection terminated unexpectedly` · `…not queryable`)는
 * 코드가 없는 맨 `Error`라 문장을 대조해야 하는데, 그 문장은 pg 가 바꾸는 날 조용히 틀린다.
 *
 * **모름 쪽으로 넓게 잡았다.** 연결을 얻지 못한 판과, 트랜잭션 중간 문장에서 연결이 죽은 판(COMMIT 을 안 보냈다)은
 * 사실 «확정 실패»인데 «모름»으로 낸다. 거짓 «모름»의 값은 사용자가 «다시 확인»을 한 번 더 누르는 것이고 —
 * 코멘트 게시는 같은 키로 다시 보내 재생하거나 한 번 단다 — **거짓 «확정 실패»의 값은 두 행이다.** 방향이 같지 않다.
 *
 * # 잰 값 — Chrome (2026-09-22)
 *
 * 설치된 Chrome → Vite → api → **TCP 프록시**(COMMIT 은 Postgres 에 넘기고 그 답이 오는 순간 api 쪽 소켓을 끊는다) →
 * Postgres. 코멘트 게시 한 번:
 *
 * | 판 | 게시 | 화면 | DB |
 * |---|---|---|---|
 * | 앞 판(좁은 반증 3차 b-1) | api **사망** → 500 `text/plain` 빈 본문 ×2 | «모름» + «다시 확인» · 상자 잠김 | 1행 |
 * | 이 판 — COMMIT 답만 잃음 | **503 봉투** → 웹이 곧바로 같은 키로 다시 보냄 → **200 재생**(풀은 새 연결) | 목록에 그 말 · 상자 비움 · «번호를 화면에 반영하지 못했습니다» | **1행** |
 * | 이 판 — 다시 보낸 것의 재생 질의도 잃음 | 503 · 503 → «모름» + «다시 확인» · 상자 잠김 → 누르면 **200 재생** | 목록에 그 말 · 상자 비움 | **1행** |
 * | 변조 — api 는 살고 503 대신 봉투 500 | 500 봉투 → «서버 오류가 발생했습니다» · **초안 열림** · 다시 보내지 않음 → 고쳐 달면 새 키 201 | 목록에 둘 | **2행** |
 *
 * 마지막 줄이 이 파일이 막는 판이다 — api 를 살리기만 하고 이것을 안 가르면 그렇게 된다.
 *
 * # 여기에 없는 것
 *
 * - **서버가 답한 뒤에 도는 우리 코드의 오류**(응답 직렬화 · 커밋 뒤 방송)는 이것과 무관하다 — 커밋 뒤에 던지는
 *   자리가 게시 경로에 없다는 것은 `comment-panel.tsx`의 `knownRejection` 머리말이 코드로 봤다.
 * - **pg 가 질의를 보내기 전에 낸 오류**(값 직렬화 실패 등)는 연결이 멀쩡하므로 **그대로 지나간다** — 500 이다.
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

/** 서버가 «이 연결은 끝났다»고 답했는가 — 머리말의 표 둘째 줄. */
function saysConnectionEnded(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    typeof error.code === 'string' &&
    CONNECTION_ENDED_SQLSTATE.some((prefix) => error.code?.startsWith(prefix))
  )
}

/**
 * 질의의 거절을 가른다. `connectionDied`는 **그 질의를 실은 연결이 `'error'`를 냈는가**다(`db/client.ts`).
 * 잃었으면 `DbConnectionLostError`로 감싸고, 아니면 받은 것을 그대로 돌려준다.
 */
export function classifyQueryFailure(error: unknown, connectionDied: boolean): unknown {
  if (error instanceof DbConnectionLostError) return error
  return connectionDied || saysConnectionEnded(error) ? new DbConnectionLostError(error) : error
}

/**
 * 연결을 얻지 못한 실패를 가른다 — **서버가 답해 거절한 것**(인증 실패 `28P01` · DB 없음 `3D000` · 연결 수 초과
 * `53300`)은 설정의 문제라 그대로 두고, 그 밖(닿지 못함 · 서버가 «끝났다»고 답함)은 잃은 것이다. 머리말의 표 넷째 줄.
 */
export function classifyConnectFailure(error: unknown): unknown {
  if (error instanceof DatabaseError && !saysConnectionEnded(error)) return error
  return error instanceof DbConnectionLostError ? error : new DbConnectionLostError(error)
}
