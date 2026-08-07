/**
 * `ApiClient`의 실제 구현. `fetch`를 부르는 곳은 이 파일 하나다.
 *
 * 서버와 같은 오리진으로 붙는다(설계 D4 — 개발 중에는 Vite 프록시가, 배포에서는
 * 정적 파일을 함께 서빙하는 서버가 그렇게 만든다). 그래서 절대 URL을 만들지 않고
 * `/api`로 시작하는 경로만 쓴다.
 */
import { ApiError, type ApiClient, type ApiErrorCode, type ApiErrorIssue } from './client'
import type { PageDetail, PatchResult, ProjectDetail, SessionUser, TreeMenuNode } from './types'

const API_PREFIX = '/api'

/** 응답을 읽지 못했을 때 쓰는 메시지. 서버가 준 문장이 아니므로 한 곳에만 둔다. */
const UNREADABLE = '서버 응답을 이해할 수 없습니다'

/** 요청이 서버에 닿지도 못했을 때 쓰는 메시지. 사용자에게 그대로 보여도 되는 문장이어야 한다. */
const UNREACHABLE = '서버에 연결하지 못했습니다'

/**
 * 연결 자체가 실패한 `ApiError`의 `status`.
 *
 * **응답이 없었기 때문에 실을 상태 코드가 없다.** 0은 서버가 낼 수 있는 값이 아니므로
 * 실제 응답에서 온 상태 코드와 섞이지 않는다 — 로그에서 "서버가 0을 냈다"로 읽힐 여지가 없다.
 */
const NO_RESPONSE = 0

/**
 * 계약에 있는 `code` 전부.
 *
 * **`Record<ApiErrorCode, true>`인 것이 요점이다** — 배열이면 이 목록과 `ApiErrorCode`
 * 유니온이 컴파일러로 이어지지 않아, 오타가 나거나 유니온에 코드를 더하고 여기 안 넣으면 그
 * 코드가 조용히 `internal`로 흡수된다(`toApiError`의 `: 'internal'`). 레코드로 두면
 * **빠뜨림과 오타가 양방향으로 컴파일 에러**가 된다. P2b-2가 `conflict`(리베이스)·
 * `validation-failed`(서버 검증 실패)로 분기하므로 그 둘이 조용히 틀어지면 안 된다.
 */
const API_ERROR_CODES: Record<ApiErrorCode, true> = {
  'bad-request': true,
  unauthenticated: true,
  forbidden: true,
  'not-found': true,
  conflict: true,
  'validation-failed': true,
  internal: true,
}

/**
 * `in`이 아니라 `Object.hasOwn`인 것은 `in`이 프로토타입까지 보기 때문이다 —
 * `'toString' in {}`은 `true`다. 서버가 `code: "toString"`을 내면 그대로 실려 화면의
 * 분기가 닿지 않는 값을 받는다(`test/api/http-client.test.ts`가 그 문자열로 지킨다).
 */
function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(API_ERROR_CODES, value)
}

/**
 * **성공 응답의 얕은 형태 검사.** 조회 다섯 자리가 각자 보지 않고 여기 모은다 — 여섯 번째가
 * 생겨도 표에 한 줄을 더하면 되고, `request`가 이 인자를 **필수로** 받으므로 빠뜨리면
 * 컴파일 에러다(`API_ERROR_CODES`를 레코드로 둔 것과 같은 이유).
 *
 * **왜 필요한가.** `!response.ok`와 JSON 파싱은 이미 막혀 있지만, 서버가 200과 함께 계약에
 * 없는 모양을 내면 그 값이 그대로 화면까지 간다. 실측(`test/api/response-shape.test.tsx`의
 * 표): 네 자리에서 **화면 전체가 사망**한다 — 트리는 `pages`를 전개하다,
 * 목록은 `.length`를 읽다, 셸은 `project.name`을 읽다, 캔버스는 `root.children`을 읽다
 * 렌더 도중 던지고, 그 예외를 잡는 오류 경계가 그 위에 없다.
 *
 * **얕게 본다.** 배열인가·객체인가·계약이 약속한 필드가 그 타입인가까지다. 문서 안쪽
 * (`schema.root`의 자식들)은 **일부러 보지 않는다** — 렌더러가 검증 실패 노드를 폴백으로
 * 그리고 `onNodeError`로 알리므로(D8), 여기서 막으면 그릴 수 있는 문서를 못 그리게 된다.
 * 트리만 재귀로 내려가는데, `MenuItem`이 자식 메뉴를 같은 코드로 그려서 깊이와 상관없이
 * 같은 자리에서 죽기 때문이다.
 */
type Shape = (value: unknown) => boolean

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArrayOf(value: unknown, item: Shape): boolean {
  return Array.isArray(value) && value.every(item)
}

/** 트리 노드 하나. `pages`·`children`이 배열이 아니면 `panels/menu-tree.tsx`가 전개하다 죽는다. */
function isTreeMenuNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['sortOrder'] === 'number' &&
    isArrayOf(value['pages'], isTreePage) &&
    isArrayOf(value['children'], isTreeMenuNode)
  )
}

function isTreePage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['sortOrder'] === 'number'
  )
}

function isProjectDetail(value: unknown): boolean {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string'
}

const SHAPES = {
  /** 본문을 읽지 않는 요청. 204에서는 아래 조기 반환에 걸려 이 검사에 닿지 않는다. */
  noBody: () => true,
  sessionUser: (value) => isRecord(value) && typeof value['id'] === 'string',
  projectDetail: isProjectDetail,
  projectList: (value) => isArrayOf(value, isProjectDetail),
  /** `{ menu }` 봉투. 서버가 이 엔드포인트에서만 쓴다(README "트리 응답 형태"). */
  treeEnvelope: (value) => isRecord(value) && isArrayOf(value['menu'], isTreeMenuNode),
  /**
   * `headSeq`가 숫자인지까지 본다. 그것이 P2b-2의 `baseSeq`이고, 문자열이 실리면 편집
   * 요청이 어느 revision 위에서 만들어졌는지가 조용히 어긋난다.
   */
  pageDetail: (value) =>
    isRecord(value) &&
    typeof value['headSeq'] === 'number' &&
    isRecord(value['schema']) &&
    isRecord((value['schema'] as Record<string, unknown>)['root']),
  /**
   * 편집 응답. **`seq`가 다음 요청의 `baseSeq`이고 `inverse`가 undo가 되보낼 ops다** —
   * 둘 다 값이 그대로 큐와 undo 스택에 실리므로, 계약을 어긴 값이 지나가면 `baseSeq`가
   * 조용히 어긋나거나 undo가 배열이 아닌 것을 `ops`로 보내다 죽는다.
   *
   * **`inverse` 안쪽은 보지 않는다**(D11). 그것은 서버가 만든 `PatchOp[]`이고 그 안까지
   * 보는 것은 `@wirebound/schema`의 일이다 — `schema.root` 안쪽을 보지 않는 것과 같은
   * 경계다(D8).
   */
  patchResult: (value) =>
    isRecord(value) &&
    typeof value['seq'] === 'number' &&
    typeof value['revisionId'] === 'string' &&
    Array.isArray(value['inverse']),
} satisfies Record<string, Shape>

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
  async function request<T>(method: string, path: string, shape: Shape, body?: unknown): Promise<T> {
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

    // `fetch`는 응답을 받지 못하면(네트워크 단절·DNS 실패·CORS 차단) 실패 응답이
    // 아니라 raw `TypeError`로 reject한다. **그것은 `ApiError`가 아니다.** 호출자는
    // `err instanceof ApiError`로 분기하므로, 번역하지 않으면 그 분기가 통째로 빗나가
    // 네트워크 오류만 다른 부류로 새어 나간다. `fetch`를 부르는 곳이 여기 하나이므로
    // 번역할 자리도 여기 하나다.
    let response: Response
    try {
      response = await fetchImpl(`${API_PREFIX}${path}`, init)
    } catch {
      // `code`는 `internal`이다 — 서버 에러 코드 집합(README "에러 형식")에 "연결 실패"가
      // 없고, 화면이 `switch`로 가르는 값이라 계약 밖의 코드를 새로 만들지 않는다.
      throw new ApiError(NO_RESPONSE, 'internal', UNREACHABLE)
    }

    if (!response.ok) throw await toApiError(response)

    // 204에는 본문이 없다. 파싱하면 실패하므로 아예 읽지 않는다.
    if (response.status === 204) return undefined as T

    const parsed = await readJson(response)
    // 성공 응답이라도 JSON이 아닐 수 있다(개발 중 프록시가 빠지면 Vite가 /api/*
    // 요청에 index.html을 200으로 낸다). 실패 경로와 같은 이유로 흡수한다.
    if (parsed === undefined) throw new ApiError(response.status, 'internal', UNREADABLE)

    // **JSON이라는 것만으로는 부족하다.** 계약에 없는 모양이 여기를 지나면 화면이 렌더
    // 도중 던지고, 그 예외를 잡는 오류 경계가 위에 없다(위 `SHAPES` 주석의 실측 표).
    // `code`를 `internal`로 두는 것은 서버 에러 코드 집합(README "에러 형식")에 "계약
    // 위반"이 없고, 화면이 `switch`로 가르는 값이라 계약 밖의 코드를 새로 만들지 않기
    // 때문이다 — 연결 실패에 `internal`을 쓴 것과 같은 판단이다. **던지는 것이 요점이다:**
    // 호출자는 `err instanceof ApiError`로 분기하므로(`api/failure.tsx`), 그냥 두면 화면이
    // 자기 자리에서 raw `TypeError`를 만나거나 아예 죽는다.
    if (!shape(parsed)) throw new ApiError(response.status, 'internal', UNREADABLE)

    return parsed as T
  }

  const projectPath = (projectId: string): string => `/projects/${encodeURIComponent(projectId)}`

  const pagePath = (projectId: string, pageId: string): string =>
    `${projectPath(projectId)}/pages/${encodeURIComponent(pageId)}`

  return {
    login: (email, password) =>
      request<SessionUser>('POST', '/auth/login', SHAPES.sessionUser, { email, password }),
    logout: () => request<void>('POST', '/auth/logout', SHAPES.noBody),
    me: () => request<SessionUser>('GET', '/auth/me', SHAPES.sessionUser),
    listProjects: () => request<ProjectDetail[]>('GET', '/projects', SHAPES.projectList),
    getProject: (projectId) =>
      request<ProjectDetail>('GET', projectPath(projectId), SHAPES.projectDetail),
    // `{ menu }` 봉투를 벗기는 유일한 지점이다 — 그 관용구를 앱 안으로 들이지 않는다.
    // 봉투가 계약대로인 것은 `request`가 이미 확인했다(`SHAPES.treeEnvelope`). 그래서 여기서
    // `body.menu`를 곧장 읽어도 던지지 않는다 — 앞서는 이 줄이 본문이 `null`일 때 raw
    // `TypeError`를 냈고, 그것은 `ApiError`가 아니라 호출자의 분기를 빗나갔다.
    getTree: async (projectId) => {
      const body = await request<{ menu: TreeMenuNode[] }>(
        'GET',
        `${projectPath(projectId)}/tree`,
        SHAPES.treeEnvelope,
      )
      return body.menu
    },
    getPage: (projectId, pageId) =>
      request<PageDetail>('GET', pagePath(projectId, pageId), SHAPES.pageDetail),
    patchOps: (projectId, pageId, body) =>
      request<PatchResult>(
        'PATCH',
        `${pagePath(projectId, pageId)}/ops`,
        SHAPES.patchResult,
        // `clientOpId`가 없으면 **키를 만들지 않는다.** 서버의 본문 스키마는
        // `z.strictObject`라 선언되지 않은 키가 그 자체로 400인데, `undefined`를 실은 키는
        // `JSON.stringify`가 지워 주므로 오늘은 통과한다 — 그 우연에 기대지 않는다.
        body.clientOpId === undefined
          ? { baseSeq: body.baseSeq, ops: body.ops }
          : { baseSeq: body.baseSeq, ops: body.ops, clientOpId: body.clientOpId },
      ),
  }
}
