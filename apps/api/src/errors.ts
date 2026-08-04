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
  | 'validation-failed'
  | 'internal'

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  'bad-request': 400,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'validation-failed': 422,
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
  nodeId?: string | null
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

export function unauthenticated(message = '로그인이 필요합니다'): ApiError {
  return new ApiError('unauthenticated', message)
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

export function validationFailed(message: string, issues: ApiErrorIssue[]): ApiError {
  return new ApiError('validation-failed', message, issues)
}

export function internal(message = '서버 오류가 발생했습니다'): ApiError {
  return new ApiError('internal', message)
}
