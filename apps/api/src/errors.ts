/**
 * API 전역에서 쓰는 에러 코드. 상태 코드는 여기 하나(`ERROR_STATUS`)에만 매핑되어 있어,
 * 코드마다 상태 숫자가 흩어지지 않는다.
 */
export type ApiErrorCode =
  | 'bad-request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'locked'
  | 'validation-failed'
  | 'rate-limited'
  | 'internal'

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  'bad-request': 400,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  /**
   * 소프트 잠금 충돌(설계서 「소프트 잠금」의 2차 방어). **`409`로 내지 않는다** — 근거는
   * 클라이언트에 있다:
   *
   * `edit/use-edit-commit.tsx`의 조건부 재전송이 **`status === 409`**로 갈린다.
   * 잠금 충돌이 409면 그 조건 셋(409 · 큐의 머리가 그 편집 · `headSeq`가 움직였다)이 다
   * 참이 될 수 있고, 그러면 **한 번 더 보낸다.** 재전송이 성공하면(그 사이 잠금이 풀렸다면)
   * 사용자는 **자기가 막혔다는 것을 모른 채 남의 잠금 구역을 편집한 것**이 된다.
   *
   * **그 경로는 드물지 않다.** 두 편집 사이가 조금만 벌어져도 `page-changed`가 실패보다
   * 먼저 온다 — 사람 둘이 편집하는 판은 그쪽이 정상 경로다.
   *
   * 갈래 셋 중 이것을 고른 이유: 상태 코드가 실패의 성질을 나르는 것이 이 저장소의
   * 자세이고(`http/edit-outcome.ts`), 이 표가 **하나뿐이라 갈라지지 않는다.** 클라이언트가
   * 다시 판정하게 하는 갈래는 서버의 실패 분류와 두 벌이 된다.
   *
   * `423`은 RFC 4918의 `Locked`다 — *"대상 자원이 잠겨 있다"*가 글자 그대로 이 뜻이다.
   */
  locked: 423,
  'validation-failed': 422,
  /**
   * 로그인 시도 제한(`auth/login-limit.ts`). `Retry-After`(초)를 함께 싣는다 — 싣는 자리는 라우트다(`routes/auth.ts`). 401 과 갈라
   * 둔다: 401 은 «그 비밀번호가 틀렸다»이고 이것은 «견주지 않았다»다. 같은 숫자면 사람은 옳은 비밀번호를 틀린 줄 알고 바꾼다.
   */
  'rate-limited': 429,
  internal: 500,
}

/**
 * 응답 본문에 실을 개별 이슈. zod 내부 객체를 그대로 노출하지 않기 위한 최소 형태다.
 *
 * `code`·`nodeId`는 optional이다. `http/parse.ts`가 zod 이슈에서 만드는 이슈는
 * `path`·`message`만 채우고, `routes/pages.ts`의 `PUT .../schema`가
 * `@wirebound/schema`의 `ValidationIssue`(카탈로그 검증 실패)를 그대로 실을 때만
 * (`code`가 `ValidationCode` 리터럴이라 `string`의 부분집합이고, `nodeId`가
 * `string | null`이라 이 타입에 구조적으로 들어맞으므로 캐스트 없이) 두 필드가 채워진다.
 */
export interface ApiErrorIssue {
  path: string
  message: string
  code?: string
  /**
   * `'error'`(저장을 막았다) 또는 `'warning'`(막지 않았다). `@wirebound/schema`의
   * `ValidationIssue`가 이 필드를 갖는다.
   * **422 응답에는 경고까지 함께 싣는다** — 받는 쪽이 이 필드로 가른다.
   * `http/parse.ts`가 zod 이슈에서 만드는 이슈에는 없다(그 층은 severity를 모른다).
   */
  severity?: 'error' | 'warning'
  nodeId?: string | null
  /**
   * **그 칸의 지금 값** — 페이지 메타 충돌(이슈 코드 `page-meta-changed` — `routes/pages.ts`의 `PATCH`)에만
   * 실린다. 받는 쪽이 다시 읽지 않고 «다른 사람의 값»을 보이고, 그것을 새 바탕으로 덮을 수 있게.
   */
  current?: string | null
  /**
   * 메뉴 연쇄 삭제가 화면이 본 id 집합과 다를 때(이슈 코드 `menu-subtree-changed` — `routes/menu.ts`의 `DELETE`) 지금 목록. 화면이 이
   * 목록으로 상자를 다시 세운다.
   */
  subtree?: { title: string; menus: { id: string; title: string }[]; pages: { id: string; title: string }[] }
  /**
   * 테마 패키지 업로드의 manifest 이슈(`code: 'manifest'`)가 `validateManifest` 에서 받은 원래 코드 — 업로드 화면이 사유를 항목별로
   * 가른다(`routes/admin-themes.ts`).
   */
  manifestCode?: string
}

/**
 * 라우트 핸들러가 던지는 에러. `error-handler`가 이 클래스를 알아보고
 * `{ error: { code, message, issues? } }` 봉투로 직렬화한다.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly issues?: ApiErrorIssue[]

  constructor(code: ApiErrorCode, message: string, issues?: ApiErrorIssue[]) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.issues = issues
  }
}

export function badRequest(message: string, issues?: ApiErrorIssue[]): ApiError {
  return new ApiError('bad-request', message, issues)
}

export function unauthenticated(message = '로그인이 필요합니다', issues?: ApiErrorIssue[]): ApiError {
  return new ApiError('unauthenticated', message, issues)
}

export function forbidden(message = '권한이 없습니다'): ApiError {
  return new ApiError('forbidden', message)
}

export function notFound(message = '대상을 찾을 수 없습니다'): ApiError {
  return new ApiError('not-found', message)
}

export function conflict(message: string, issues?: ApiErrorIssue[]): ApiError {
  return new ApiError('conflict', message, issues)
}

/** 소프트 잠금 충돌(설계서 「소프트 잠금」). **409가 아닌 이유는 `ERROR_STATUS`의 `locked`에 있다.** */
export function locked(message: string): ApiError {
  return new ApiError('locked', message)
}

export function validationFailed(message: string, issues: ApiErrorIssue[]): ApiError {
  return new ApiError('validation-failed', message, issues)
}

export function rateLimited(message: string): ApiError {
  return new ApiError('rate-limited', message)
}

export function internal(message = '서버 오류가 발생했습니다'): ApiError {
  return new ApiError('internal', message)
}
