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
 * | 헤더에 실을 수 없는 자격이다 | 2 | 보내기 **전에** 본다(아래 `assertSendableHeaders` — 스모크에서 재서 알았다) |
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
 *
 * # 자기 종류를 **모든 요청에** 싣는다 (P9-5 D1)
 *
 * `x-wb-client: cli|mcp`. 서버가 그 값으로 `revisions.actor_type`을 채운다(§7.4) —
 * **`wireb`도 실어야 `cli`가 채워진다.** 안 실으면 서버가 기본값을 쓰고, 그 기본값이
 * 무엇이든 *"헤더를 잊었다"*와 *"정말 그 종류다"*가 구별되지 않는다.
 *
 * **싣는 자리가 여기 하나인 것이 이 설계의 값이다** — MCP가 자기 HTTP 클라이언트를 안 갖고
 * 이 함수를 부르므로(P9-4 D3), 도구를 더해도 헤더를 빠뜨리는 경로가 없다.
 */
import { CliError, EXIT, configError, serverError, unreachableError } from './exit'
import type { HttpRequestInit, HttpResponse, Io } from './io'

/**
 * 프로세스 종류를 나르는 헤더.
 *
 * **`apps/api/src/auth/actor.ts`의 `CLIENT_KIND_HEADER`가 이것의 거울이다.** `apps/*`와
 * `packages/*`는 서로 의존하지 않으므로(`CLAUDE.md`) 손으로 맞추는 자리이고,
 * `apps/api/test/actor-census.test.ts`가 **두 소스에서 글자를 읽어 맞댄다** —
 * `ws/protocol.ts`의 프레임 이름을 `protocol-parity.test.ts`가 맞대는 것과 같은 자세다.
 */
export const CLIENT_KIND_HEADER = 'x-wb-client'

export interface ApiRequest {
  /**
   * **`PATCH`가 있다**(P9-5). 없던 것을 P9-2 이월 §1이 예고하고 P9-3 이월 §6이 옮겼다 —
   * §12.2의 `patch_page`가 `PATCH .../ops`를 부르는 자리에서 컴파일이 막혔을 것이다.
   */
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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

/** 본문을 날 바이트로 받은 응답. `wireb export`의 zip·pptx가 그것이다. */
export interface ApiBytesResponse {
  status: number
  bytes: Uint8Array
  /**
   * 서버가 `Content-Disposition`에 실어 준 파일 이름. 없으면 `null`.
   *
   * **CLI가 이름을 지어내지 않는다**(P8-4 D7 — *"사람이 읽는 이름은 `Content-Disposition`과
   * 미리보기의 `fileName`에만 있다"*). 지어내면 웹에서 내려받은 파일과 `wireb`가 쓴 파일의
   * 이름이 갈리고, 같은 설계서의 두 사본이 서로를 못 알아본다.
   *
   * **`wireb export --format html`은 이 값을 안 쓴다** — zip을 풀어 디렉터리에 넣으므로
   * 이름이 필요 없다. 쓰는 것은 pptx처럼 **파일 하나로 떨어지는** 형식이다.
   */
  fileName: string | null
}

/**
 * 요청 하나. **2xx가 아니면 던진다** — 상태 코드를 값으로 돌려주면 호출자마다 그것을
 * 문장으로 바꾸는 코드가 생긴다.
 */
export async function callApi(io: Io, server: string, request: ApiRequest): Promise<ApiResponse> {
  const { url, response } = await send(io, server, request)
  const text = await response.text()
  assertOk(response.status, text, request, url)
  return { status: response.status, text, setCookie: response.headers.getSetCookie() }
}

/**
 * 본문을 **날 바이트로** 받는다(P9-3 D9 — `GET .../export`가 zip을 낸다).
 *
 * **오류 응답은 여전히 글자로 읽는다.** 서버가 쓴 문장을 그대로 옮기는 것이 이 CLI의
 * 값이고(위 표), zip이 아닌 오류 봉투를 바이트로 받아 봐야 아무 말도 못 한다. 진짜
 * `Response`의 본문은 한 번만 읽히므로 **둘 중 하나만** 부른다.
 */
export async function callApiBytes(
  io: Io,
  server: string,
  request: ApiRequest,
): Promise<ApiBytesResponse> {
  const { url, response } = await send(io, server, request)
  if (response.status < 200 || response.status >= 300) {
    assertOk(response.status, await response.text(), request, url)
  }
  return {
    status: response.status,
    bytes: await response.bytes(),
    fileName: dispositionFileName(response.headers.get('content-disposition')),
  }
}

/**
 * `Content-Disposition`에서 파일 이름을 꺼낸다. 못 꺼내면 `null`.
 *
 * **`filename*`(RFC 5987)은 안 읽는다.** 우리 서버가 그것을 안 쓴다 — 이름이 슬러그에서
 * 나오고 슬러그는 소문자·숫자·하이픈뿐이라 퍼센트 인코딩이 필요한 글자가 애초에 못 들어간다
 * (`apps/api`의 `sendFile` 주석). 읽는 코드를 미리 두면 **안 쓰이는 갈래가 틀린 채로 남는다.**
 *
 * **경로 마디를 거른다.** 서버가 주는 이름이지만 이 값이 곧 **사용자의 파일 시스템에 쓰는
 * 경로**가 된다 — `readArchive`가 압축 안의 경로를 안 믿는 것과 같은 이유다.
 */
function dispositionFileName(header: string | null): string | null {
  if (header === null) return null
  const match = /filename="([^"]*)"/.exec(header) ?? /filename=([^;]+)/.exec(header)
  const raw = match?.[1]?.trim()
  if (raw === undefined || raw.length === 0) return null
  if (raw.includes('/') || raw.includes('\\') || raw === '.' || raw === '..') return null
  return raw
}

/**
 * 보내기까지. **세 갈래 중 앞의 둘**(헤더에 못 싣는 자격 · 닿지 못함)이 여기서 갈린다 —
 * 글자로 읽든 바이트로 읽든 같은 판정이어야 하므로 한 자리에 둔다.
 */
async function send(
  io: Io,
  server: string,
  request: ApiRequest,
): Promise<{ url: string; response: HttpResponse }> {
  const url = `${server}${request.path}`
  // **자기 종류를 언제나 싣는다**(위 머리말). 요청마다 고르게 두지 않는 것이 요점이다.
  const headers: Record<string, string> = { [CLIENT_KIND_HEADER]: io.client }
  if (request.body !== undefined) headers['content-type'] = 'application/json'
  if (request.token !== undefined) headers.authorization = `Bearer ${request.token}`
  if (request.cookie !== undefined) headers.cookie = request.cookie

  assertSendableHeaders(headers)

  const init: HttpRequestInit = { method: request.method, headers }
  if (request.body !== undefined) init.body = JSON.stringify(request.body)

  try {
    return { url, response: await io.fetch(url, init) }
  } catch (error) {
    // **닿지 못한 것과 거절당한 것을 가른다**(위 표). 원인 문장을 함께 싣는다 —
    // `ECONNREFUSED`와 `ENOTFOUND`는 사람이 볼 곳이 다르다.
    throw unreachableError(`서버에 연결할 수 없습니다: ${url} (${describe(error)})`)
  }
}

function assertOk(status: number, text: string, request: ApiRequest, url: string): void {
  if (status < 200 || status >= 300) {
    // **상태 코드를 값으로도 나른다**(`CliError.status`의 머리말 — P9-5 D3). 문장은 그대로다.
    throw new CliError(EXIT.server, `${serverMessage(text, status)} (${request.method} ${url})`, status)
  }
}

/**
 * **헤더에 실을 수 없는 값을 미리 잡는다 — 스모크에서 재서 알았다.**
 *
 * HTTP 헤더 값은 ByteString(코드 포인트 0~255)이라 `WIREB_TOKEN`에 한국어를 넣으면
 * `fetch`가 *"Cannot convert argument to a ByteString …"*으로 **던진다.** 그러면 아래
 * `catch`가 그것을 **"서버에 연결할 수 없습니다"**로 옮겨(코드 4) 사람이 네트워크와
 * 서버를 들여다보게 된다 — 원인은 자기 환경 변수 한 줄인데.
 *
 * 서버가 내는 토큰은 base64url이라 이 갈래에 닿지 않는다. 닿는 것은 **사람이 손으로 넣은
 * 값**이고, 그래서 코드는 *"설정을 고쳐라"*의 2다.
 */
function assertSendableHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    for (const char of value) {
      if (char.codePointAt(0)! > 0xff) {
        throw configError(`${name} 헤더에 보낼 수 없는 문자가 있습니다: ${JSON.stringify(char)}`)
      }
    }
  }
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
