/**
 * 서버를 부르는 한 자리. **HTTP 클라이언트를 들이지 않는다**(D10) — 전역 `fetch`를
 * `io`가 나른다.
 *
 * ---
 *
 * # 세 갈래를 여기서 가른다
 *
 * `wireb`의 값은 *"안 된다"*가 아니라 **왜 안 되는지**다(T6). 그 판정을 명령마다 다시
 * 짜면 갈리므로 여기 한 자리에 둔다.
 *
 * | 무엇 | 코드 | 어떻게 아는가 |
 * |---|---|---|
 * | 서버에 닿지 못했다 | 4 | `fetch`가 **던진다**(DNS·연결 거부·타임아웃) |
 * | 서버가 거절했다 | 3 | 응답이 왔고 2xx가 아니다. **서버가 쓴 문장을 그대로 옮긴다** |
 * | 됐다 | 0 | 2xx |
 *
 * **서버의 문장을 옮기는 것이 요점이다.** `apps/api`가 갈래마다 다른 문장을 쓰기로 한
 * 것(README의 *"두 409의 문장이 다르다"*)이 여기서 값을 낸다 — CLI가 자기 문장을 지어
 * 내면 그 노력이 버려진다.
 *
 * # 쿠키는 손으로 나른다 (재라 #4 — 쟀다)
 *
 * Node의 전역 `fetch`에는 **쿠키 저장소가 없다.** 실측: `Set-Cookie`를 받은 뒤 같은
 * 오리진으로 다시 요청해도 `Cookie` 헤더가 실리지 않고, `credentials: 'include'`를 줘도
 * 같으며, 리다이렉트 사이에서도 이어지지 않는다. 그래서 `login`이 응답에서 꺼내 다음
 * 요청에 직접 싣는다(`cookieHeader`).
 *
 * **쿠키 이름을 안 본다.** 서버의 `SESSION_COOKIE_NAME`이 설정값이라(`apps/api/src/config.ts`)
 * `wb_session`을 여기 적으면 그 설정을 바꾼 배포에서 조용히 로그인이 안 된다. 받은 것을
 * 전부 그대로 되돌려 보낸다.
 */
import { CliError, EXIT, serverError, unreachableError } from './exit'
import type { HttpRequestInit, Io } from './io'

export interface ApiRequest {
  method: 'GET' | 'POST' | 'DELETE'
  /** `/api/…`로 시작하는 경로. 서버 주소는 호출자가 준다. */
  path: string
  body?: unknown
  /** `Authorization: Bearer …`에 실을 토큰. */
  token?: string
  /** `Cookie` 헤더 전문. `login`이 세션을 손으로 나르는 자리다. */
  cookie?: string
}

export interface ApiResponse {
  status: number
  text: string
  /** 응답이 준 `Set-Cookie` 전부. */
  setCookie: string[]
}

/**
 * 요청 하나. **2xx가 아니면 던진다** — 상태 코드를 값으로 돌려주면 호출자마다 그것을
 * 문장으로 바꾸는 코드가 생긴다.
 */
export async function callApi(io: Io, server: string, request: ApiRequest): Promise<ApiResponse> {
  const url = `${server}${request.path}`
  const headers: Record<string, string> = {}
  if (request.body !== undefined) headers['content-type'] = 'application/json'
  if (request.token !== undefined) headers.authorization = `Bearer ${request.token}`
  if (request.cookie !== undefined) headers.cookie = request.cookie

  const init: HttpRequestInit = { method: request.method, headers }
  if (request.body !== undefined) init.body = JSON.stringify(request.body)

  let response
  try {
    response = await io.fetch(url, init)
  } catch (error) {
    // **닿지 못한 것과 거절당한 것을 가른다**(위 표). 원인 문장을 함께 싣는다 —
    // `ECONNREFUSED`와 `ENOTFOUND`는 사람이 볼 곳이 다르다.
    throw unreachableError(`서버에 연결할 수 없습니다: ${url} (${describe(error)})`)
  }

  const text = await response.text()
  if (response.status < 200 || response.status >= 300) {
    throw new CliError(EXIT.server, `${serverMessage(text, response.status)} (${request.method} ${url})`)
  }
  return { status: response.status, text, setCookie: response.headers.getSetCookie() }
}

/** 2xx 응답의 본문을 JSON으로. 형식이 아니면 그것도 서버 쪽 문제다. */
export function parseJson(response: ApiResponse, what: string): unknown {
  try {
    return JSON.parse(response.text)
  } catch {
    throw serverError(`${what} 응답을 읽을 수 없습니다: JSON 형식이 아닙니다`)
  }
}

/**
 * 오류 응답에서 **서버가 쓴 문장**을 꺼낸다. 봉투는 `apps/api`의 것이다:
 * `{ error: { code, message, issues? } }`.
 *
 * 봉투가 아니면(프록시가 만든 502 HTML 같은 것) 상태 코드만 말한다 — HTML 본문을
 * 그대로 터미널에 쏟지 않는다.
 */
function serverMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } }
    const message = parsed.error?.message
    if (typeof message === 'string' && message.length > 0) return `서버가 거절했습니다 (${status}): ${message}`
  } catch {
    // 아래로 떨어진다.
  }
  return `서버가 거절했습니다 (${status})`
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    // `fetch`는 원인을 `cause`에 담는다(`TypeError: fetch failed` 하나로는 아무것도 못 본다).
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof Error && cause.message.length > 0) return cause.message
    return error.message
  }
  return String(error)
}

/** `Set-Cookie` 여럿을 `Cookie` 헤더 한 줄로. 속성(`Path`·`HttpOnly`…)은 버린다. */
export function cookieHeader(setCookie: string[]): string {
  return setCookie
    .map((cookie) => cookie.split(';')[0]?.trim() ?? '')
    .filter((pair) => pair.length > 0)
    .join('; ')
}
