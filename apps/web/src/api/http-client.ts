/**
 * `ApiClient`의 실제 구현. `fetch`를 부르는 곳은 이 파일 하나다.
 *
 * 서버와 같은 오리진으로 붙는다(설계 D4 — 개발 중에는 Vite 프록시가, 배포에서는
 * 정적 파일을 함께 서빙하는 서버가 그렇게 만든다). 그래서 절대 URL을 만들지 않고
 * `/api`로 시작하는 경로만 쓴다.
 */
import { ApiError, type ApiClient, type ApiErrorCode, type ApiErrorIssue } from './client'
import type { PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from './types'

const API_PREFIX = '/api'

/** 응답을 읽지 못했을 때 쓰는 메시지. 서버가 준 문장이 아니므로 한 곳에만 둔다. */
const UNREADABLE = '서버 응답을 이해할 수 없습니다'

const API_ERROR_CODES: readonly string[] = [
  'bad-request',
  'unauthenticated',
  'forbidden',
  'not-found',
  'conflict',
  'validation-failed',
  'internal',
]

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.includes(value)
}

/**
 * 본문을 JSON으로 읽는다. **읽지 못하면 던지지 않고 `undefined`를 돌려준다** —
 * 리버스 프록시가 낸 HTML이나 잘린 본문에서 `SyntaxError`가 새어 나가면 화면이
 * 서버가 말한 이유 대신 "Unexpected token <"를 보여주게 된다.
 *
 * 본문이 리터럴 `null`인 경우와는 구분된다(그때는 `null`이 돌아온다).
 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function readIssues(error: Record<string, unknown>): ApiErrorIssue[] | undefined {
  return Array.isArray(error['issues']) ? (error['issues'] as ApiErrorIssue[]) : undefined
}

/**
 * 실패 응답을 `ApiError`로 바꾼다. 어떤 본문이 와도 던지지 않는다.
 *
 * 봉투가 아니거나 `code`가 계약에 없는 문자열이면 `internal`로 흡수한다. 화면이
 * `code`로 분기하므로, 모르는 문자열을 그대로 실으면 그 분기가 조용히 아무 데도
 * 걸리지 않는 값을 받게 된다.
 */
async function toApiError(response: Response): Promise<ApiError> {
  const body = await readJson(response)
  if (typeof body !== 'object' || body === null) {
    return new ApiError(response.status, 'internal', UNREADABLE)
  }

  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) {
    return new ApiError(response.status, 'internal', UNREADABLE)
  }

  const envelope = error as Record<string, unknown>
  const message = typeof envelope['message'] === 'string' ? envelope['message'] : UNREADABLE
  const code = isApiErrorCode(envelope['code']) ? envelope['code'] : 'internal'

  return new ApiError(response.status, code, message, readIssues(envelope))
}

/**
 * `ApiClient`의 HTTP 구현을 만든다.
 *
 * @param fetchImpl 테스트가 가짜를 주입하는 자리. 기본값은 브라우저의 `fetch`다.
 */
export function createHttpClient(fetchImpl: typeof fetch = globalThis.fetch): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      // 인증은 세션 쿠키(`wb_session`, httpOnly)로 한다 — 이 옵션이 없으면 쿠키가
      // 실리지 않아 모든 요청이 401이 된다. jsdom에서는 지워도 아무것도 깨지지
      // 않으므로 테스트가 이 `init` 객체를 직접 단언한다.
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    }

    const response = await fetchImpl(`${API_PREFIX}${path}`, init)

    if (!response.ok) throw await toApiError(response)

    // 204에는 본문이 없다. 파싱하면 실패하므로 아예 읽지 않는다.
    if (response.status === 204) return undefined as T

    const parsed = await readJson(response)
    // 성공 응답이라도 JSON이 아닐 수 있다(개발 중 프록시가 빠지면 Vite가 /api/*
    // 요청에 index.html을 200으로 낸다). 실패 경로와 같은 이유로 흡수한다.
    if (parsed === undefined) throw new ApiError(response.status, 'internal', UNREADABLE)

    // 서버가 봉투를 검증해서 보내므로 여기서 형태를 다시 검증하지 않는다.
    return parsed as T
  }

  const projectPath = (projectId: string): string => `/projects/${encodeURIComponent(projectId)}`

  return {
    login: (email, password) => request<SessionUser>('POST', '/auth/login', { email, password }),
    logout: () => request<void>('POST', '/auth/logout'),
    me: () => request<SessionUser>('GET', '/auth/me'),
    listProjects: () => request<ProjectDetail[]>('GET', '/projects'),
    getProject: (projectId) => request<ProjectDetail>('GET', projectPath(projectId)),
    // `{ menu }` 봉투를 벗기는 유일한 지점이다 — 그 관용구를 앱 안으로 들이지 않는다.
    getTree: async (projectId) => {
      const body = await request<{ menu: TreeMenuNode[] }>('GET', `${projectPath(projectId)}/tree`)
      return body.menu
    },
    getPage: (projectId, pageId) =>
      request<PageDetail>('GET', `${projectPath(projectId)}/pages/${encodeURIComponent(pageId)}`),
  }
}
