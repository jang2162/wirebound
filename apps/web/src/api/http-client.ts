/**
 * `ApiClient`의 실제 구현. `fetch`를 부르는 곳은 이 파일 하나다.
 *
 * 서버와 같은 오리진으로 붙는다(설계 D4 — 개발 중에는 Vite 프록시가, 배포에서는
 * 정적 파일을 함께 서빙하는 서버가 그렇게 만든다). 그래서 절대 URL을 만들지 않고
 * `/api`로 시작하는 경로만 쓴다.
 */
import { ApiError, type ApiClient, type ApiErrorCode, type ApiErrorIssue } from './client'
import type {
  MenuNode,
  PageDetail,
  PatchResult,
  ProjectDetail,
  RevisionSummary,
  SessionUser,
  TreeMenuNode,
} from './types'

const API_PREFIX = '/api'

/** 응답을 읽지 못했을 때 쓰는 메시지. 서버가 준 문장이 아니므로 한 곳에만 둔다. */
const UNREADABLE = '서버 응답을 이해할 수 없습니다'

/** 요청이 서버에 닿지도 못했을 때 쓰는 메시지. 사용자에게 그대로 보여도 되는 문장이어야 한다. */
const UNREACHABLE = '서버에 연결하지 못했습니다'

/**
 * 바꿀 값이 하나도 없는 갱신 요청을 막을 때 쓰는 메시지.
 *
 * **서버가 준 문장이 아니다** — 서버에 닿기 전에 막으므로 여기서 만든다. 서버는 같은
 * 본문에 `issues[0].message: '변경할 값이 없습니다'`를 낸다(아래 `updateBody`의 실측).
 */
const EMPTY_UPDATE = '바꿀 내용이 없습니다'

/**
 * **응답을 받지 못한** `ApiError`의 `status`. 두 경우에 쓴다 — 연결 자체가 실패했을 때와,
 * 아래 `updateBody`가 보내기 전에 막았을 때다.
 *
 * **응답이 없었기 때문에 실을 상태 코드가 없다.** 0은 HTTP 상태 코드가 아니므로 실제 응답에서
 * 온 값과 겹치지 않는다. **막힌 요청에 400을 싣지 않는 것도 같은 이유다:** 서버가 그 400을
 * 낸 적이 없다.
 *
 * **이 값을 무엇이 읽는지 세어 둔다.** `apps/web/src`에서 `ApiError.status`를 읽는 자리는
 * **0건**이고(`client.ts`의 `ApiError` 주석이 *"`status`는 로그·디버깅용으로만 싣는다"*로
 * 같은 사실을 적고 있다), 읽는 것은 테스트뿐이다(`test/api/` 두 파일). 즉 **지금 이 값의
 * 분간이 손해를 막고 있다는 증거는 없다** — 앞 판은 근거를 "로그에서 서버가 0을 냈다고
 * 읽힐 여지가 없다"로 적었는데 그것은 **읽는 사람**에 기댄 잴 수 없는 문장이었다. 두 경우를
 * 실제로 가르는 것은 `code`다(연결 실패 `internal` / 빈 본문 차단 `bad-request`).
 * 소비자가 생기면 그때 무엇을 읽는지 세어 이 주석을 갱신하라.
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
 * **성공 응답의 얕은 형태 검사.** 요청 자리가 각자 보지 않고 여기 모은다 — 자리가 늘어도
 * 표에 한 줄을 더하면 되고, `request`가 이 인자를 **필수로** 받으므로 빠뜨리면 컴파일
 * 에러다(`API_ERROR_CODES`를 레코드로 둔 것과 같은 이유). **조회만 지나는 관문이 아니다:**
 * P2b-4의 CRUD 여섯도 여기를 지난다(생성·갱신 응답이 그대로 다음 조작의 입력이 된다).
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

/**
 * 트리의 페이지 항목. **`id`가 빈 문자열이면 막는다** — `panels/menu-tree.tsx`의 `PageLink`가
 * 그 값을 주소에 그대로 넣는다(아래 `SHAPES`의 "주소가 되는 값" 표).
 */
function isTreePage(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['title'] === 'string' &&
    typeof value['sortOrder'] === 'number'
  )
}

/**
 * 프로젝트 하나. **`id`가 빈 문자열이면 막는다** — 목록의 `<Link>`와, 셸이 트리에 넘기는
 * `projectId`가 둘 다 이 값을 주소에 넣는다(같은 표).
 */
function isProjectDetail(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['name'] === 'string'
  )
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
   * 메뉴 노드 하나(`POST`·`PATCH .../menu`).
   *
   * **이 응답의 필드를 읽는 자리는 지금 0건이다**(실측: `rg`로 CRUD 여섯을 부르는 자리 0건,
   * `MenuNode`를 값으로 읽는 자리 0건 — 타입 참조와 `request<MenuNode>` 제네릭뿐이다).
   * **앞서 여기에 "그 `sortOrder`가 위/아래 이동의 목적지 계산에 들어간다"고 적었던 것은
   * 거짓이었다** — 계획서 Task 7 케이스 7과 `tree/tree-actions.ts`의 `treeSpot` 주석이
   * 정반대를 못박는다(목적지는 `node.sortOrder`가 아니라 `byOrder` 정렬 뒤의 `index`다).
   * 리뷰가 잡았고, 원인은 계획서 산문을 그대로 옮긴 것이다.
   *
   * **읽는 자리가 없는데도 검사를 두는 이유는 둘이다.**
   *
   * 1. `request`가 shape를 **필수로** 받는다(이 표의 설계). 자리를 비울 수 없으니 무엇을
   *    볼지는 정해야 하고, `id`·`sortOrder`는 이 리소스의 계약이 약속한 값이다.
   * 2. **새 소비자가 붙을 때 이 표를 갱신하지 않는 것이 실제로 일어난다.** 바로 아래
   *    `pageDetail`이 그 사례다 — `getPage`만 보던 시절의 하중만 적혀 있다가 `createPage`가
   *    붙으면서 `id`가 빠진 채로 지나갔다(리뷰가 잡았다). 검사가 아예 없는 것보다 얕게라도
   *    있는 편이 그 순간의 손해가 작다.
   *
   * **그러므로 "무엇을 지키는가"를 미래형으로 적지 않는다.** 읽는 자리가 생기면 그때
   * 무엇을 읽는지 세어 이 표에 줄을 더한다.
   */
  menuNode: (value) =>
    isRecord(value) && typeof value['id'] === 'string' && typeof value['sortOrder'] === 'number',
  /**
   * 페이지 하나. **소비자가 셋이고 읽는 필드가 서로 다르다** — 이 표는 그 합집합을 본다.
   *
   * | 소비자 | 읽는 값 | 어긋나면 |
   * |---|---|---|
   * | `getPage`(P2b-2) | `headSeq` | 편집이 어느 revision 위에서 만들어졌는지가 조용히 틀어진다 |
   * | `getPage`(P2b-2) | `schema.root` | 캔버스가 `root.children`을 읽다 렌더 도중 던진다 |
   * | `createPage`(P2b-4) | `id` | 만든 페이지로 이동하는 주소에 그대로 들어간다(D8) |
   * | `updatePage`(P2b-4) | (없음 — 성공 여부만 본다) | — |
   *
   * **`id`는 뒤늦게 더했다.** `createPage`가 이 shape에 붙을 때 표를 갱신하지 않아
   * `id` 키 없음·`42`·`null`이 전부 통과했고 리뷰가 잡았다(F2). **모양이 같은 것과 읽는
   * 필드가 같은 것은 다르다** — 세 엔드포인트가 서버의 `toResponse` 하나로 같은 여덟 키를
   * 내는 것은 참이지만, 그것이 "같은 검사로 충분하다"를 뜻하지 않는다.
   *
   * **실측(가짜 `fetch`로 `createPage` 응답을 망가뜨려 D8의 주소 조립에 태웠다** —
   * 조립 형태는 `panels/menu-tree.tsx`의 `PageLink`가 이미 쓰는
   * `` `/projects/${projectId}/pages/${page.id}` `` 그대로다**):**
   *
   * - `id` 키 없음 → `/projects/p1/pages/undefined`
   * - `id: 42` → `/projects/p1/pages/42`, `id: null` → `/projects/p1/pages/null`
   * - `id: ''` → `/projects/p1/pages/`
   *
   * **빈 문자열도 막는다 — 그 값만 화면을 통째로 지운다.** 진짜 `<App />`을 각 주소로
   * 렌더해 쟀다(`api`는 가짜, 세션 통과, 컨테이너에 `<App />`만 담았다):
   *
   * | 주소 | `container.innerHTML` | `.wb-shell` |
   * |---|---|---|
   * | `/projects/p1/pages/pg1` | 2752자 | 있음 |
   * | `/projects/p1/pages/` | **0자** | **없음** |
   * | `/projects/p1/pages` | **0자** | **없음** |
   * | `/projects/p1` | 1730자 | 있음 |
   * | `/projects/p1/pages/%20`(공백 한 칸) | 2752자 | 있음 |
   *
   * `app.tsx`에 `*` 라우트가 없어 `<Routes>`가 아무것도 그리지 않는다. **앞 판의 이 자리는
   * 그것을 "다른 라우트가 받는다"로 적었고 그것은 거짓이었다** — 손해를 실제보다 가볍게
   * 적은 셈이다. 빈 화면은 `tree/tree-actions.ts` 머리말이 피하려는 바로 그 사고와 같은
   * 결과다.
   *
   * **어느 id를 빈 문자열까지 막는지는 "그 값이 주소가 되는가"로 가른다.** 주소 조립 자리를
   * `rg`로 세니 `apps/web/src`에 **둘**이다 — `panels/menu-tree.tsx`의 `PageLink`와
   * `routes/project-list.tsx`의 `<Link>`. 거기 들어가는 shape 값을 표로 적는다.
   *
   * | shape의 값 | 주소가 되는 자리 | 오늘 도달 | 빈 문자열 |
   * |---|---|---|---|
   * | `pageDetail.id` | D8의 이동(Task 4) | **아직 없다**(`createPage` 호출 0건) | 막는다 |
   * | `treeEnvelope`의 `TreePage.id` | `PageLink` | **매 트리 렌더** | 막는다 |
   * | `projectDetail.id` | 셸이 트리에 넘기는 `projectId`(`routes/editor.tsx`가 **조회해 온** id를 준다) | **매 트리 렌더** | 막는다 |
   * | `projectList[].id` | 목록의 `<Link>` | **매 목록 렌더** | 막는다 |
   * | `treeEnvelope`의 `TreeMenuNode.id` | (없음 — React key와 판정 키뿐) | — | 둔다 |
   * | `sessionUser.id` · `menuNode.id` | (없음 — 읽는 자리 0건) | — | 둔다 |
   *
   * **앞 판은 이 규칙을 "`treeEnvelope`는 주소가 되지 않는다"로 적었고 거짓이었다.** 실측:
   * `TreePage.id: ''`가 관문을 통과해 `PageLink`가 `/projects/p1/pages/`를 만들고, 그 주소가
   * 위 표의 빈 화면이 된다. **`projectDetail`·`projectList`도 같다** — `id: ''`면 각각
   * `/projects/pages/pg1`·`/projects/`가 되고 둘 다 innerHTML 0자·`.wb-shell` 없음이었다.
   * 즉 앞 판은 **아직 도달하지 않는 자리를 막고 오늘 도달하는 셋을 열어 두었다.**
   *
   * **읽는 축이 둘이라는 것이 요점이다** — 그 값이 주소가 되는가(하중)와 그 경로가 지금
   * 도달하는가(시점). 얕음을 일괄로 맞추지 않고 **이 표의 위 넷만** 깊게 한다.
   */
  pageDetail: (value) =>
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
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
  /**
   * revision 목록. **각 항목의 `inverse`가 배열인지까지 본다** — 그 값이 그대로 undo
   * 스택에 실리고, 배열이 아니면 undo가 그것을 `ops`로 보내다 죽는다. `inverse` **안쪽**은
   * 보지 않는다(D11 — `patchResult`와 같은 경계).
   */
  revisionList: (value) =>
    isArrayOf(
      value,
      (item) =>
        isRecord(item) &&
        typeof item['id'] === 'string' &&
        typeof item['seq'] === 'number' &&
        Array.isArray(item['inverse']),
    ),
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
 * `undefined`인 키를 뺀 본문을 만든다. 갱신 요청(`PATCH .../menu`·`.../pages`)이 쓴다.
 *
 * **서버의 갱신 본문 스키마는 `z.strictObject`에 `.refine(빈 본문 금지)`까지 걸려 있다**
 * (`apps/api/src/routes/menu.ts`의 `UpdateMenuBody`·`pages.ts`의 `UpdatePageBody`).
 * `undefined`를 실은 키가 오늘 통과하는 것은 `JSON.stringify`가 그것을 지워 주는 우연이고,
 * `patchOps`가 `clientOpId`에 같은 이유로 키를 만들지 않는다 — 그쪽은 선택 키가 하나라
 * 삼항으로 끝나지만 여기는 셋이라 조합이 여덟이므로 한 곳으로 모은다.
 *
 * **거르는 것은 `undefined` 하나뿐이다.** 둘 다 서버가 유효하다고 선언한 값이다 —
 * `parentId`는 `z.uuid().nullable()`이라 `null`이 "루트로 옮긴다"이고, `sortOrder`는
 * `z.int().min(0)`이라 **`0`이 유효 범위의 하한**이다(`routes/menu.ts`·`pages.ts`).
 * falsy를 통째로 거르면 그 둘이 조용히 사라져 빈 본문이 되고 서버가 400을 낸다.
 * **실측: 이 필터를 `Boolean(value)`로 바꾸면 3 사망**(`parentId: null` 하나, `sortOrder: 0` 둘).
 *
 * **이 함수를 통째로 항등(`return body`)으로 바꾸면 0 사망이다 — 재고 적는다.** 나가는
 * 본문이 `JSON.stringify` 하나를 지나고 그것이 값이 `undefined`인 키를 지우므로, 바이트가
 * 같아진다. **닫는 케이스를 만들지 못했다**: 관찰 지점이 그 문자열 하나뿐이라 오늘의
 * 동작으로는 두 구현이 구별되지 않는다. 그래도 남기는 것은 위 문단의 필터 조건이 실제로
 * 구분되기 때문이고, 이 함수가 없으면 그 조건을 둘 자리도 없어진다.
 */
function definedOnly<T extends object>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

/**
 * 갱신 요청의 본문을 만든다. `undefined`인 키를 빼고, **남은 것이 없으면 던진다.**
 *
 * **서버 실측**(api 하네스, 임시 파일을 두고 지웠다):
 *
 * ```
 * PATCH /menu/:id  {} → 400 {"code":"bad-request","message":"요청을 처리할 수 없습니다",
 *                            "issues":[{"path":"","message":"변경할 값이 없습니다"}]}
 * PATCH /pages/:id {} → 400 (코드·문장 같음)
 * ```
 *
 * **그러므로 보내지 않는다.** 눌러 봐야 실패할 버튼을 활성으로 두지 않는 것(D5·P2b-2 D7)과
 * 같은 판단을 이 층에 적용한 것이다. `code`를 `bad-request`로 두는 것은 서버가 같은 본문에
 * 내는 코드와 맞추기 위해서다 — 계약 밖의 코드를 새로 만들지 않는다는 이 파일의 규칙과도 맞다.
 *
 * **도달 경로를 재서 적는다.** 오늘 이 여섯을 부르는 자리는 **0건**이다(`rg` 실측). 계획서의
 * Task 5·7·9는 키 하나를, Task 8은 둘을 넘기므로 리터럴만 보면 빈 본문이 나오지 않는다
 * — **다만 그것은 계획서를 읽은 것이지 잰 것이 아니다.** 실제 위험은 **계산된 값이
 * `undefined`가 되는 경로**다: `previousMenuSibling`·`menuOutdentTarget`이 `null`을 낼 수 있고
 * 호출부가 그것을 옵셔널 체이닝으로 흘리면 키가 통째로 사라진다. 계획서 Task 8이 바로 그
 * 자리를 *"`previousMenuSibling`이 `null`인 경우를 막는 가드가 0 사망이면 진단까지 하라"*로
 * 짚고 있다.
 *
 * **조용히 삼키지 않는다.** 빈 본문이면 "성공한 척"하지 않고 던진다 — 그래야 호출부가 자기
 * 계산이 비었다는 것을 본다. 던지는 자리가 `async` 메서드 몸통인 것도 요점이다: 동기 `throw`면
 * `await` 없이 `.catch`를 붙인 호출부가 잡지 못한다.
 */
function updateBody<T extends object>(body: T): Partial<T> {
  const built = definedOnly(body)
  if (Object.keys(built).length === 0) {
    throw new ApiError(NO_RESPONSE, 'bad-request', EMPTY_UPDATE)
  }
  return built
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

  const menuPath = (projectId: string, nodeId: string): string =>
    `${projectPath(projectId)}/menu/${encodeURIComponent(nodeId)}`

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
    // 아래 여섯이 P2b-4의 CRUD다. **생성·갱신 응답을 트리에 꽂지 않는다** — `MenuNode`에는
    // `pages`·`children`이 없고(`api/types.ts`), 서버가 `sort_order`를 재번호하므로
    // 부르는 쪽은 성공하면 `getTree`를 다시 부른다(D1). 그래서 여기서 응답을 가공하지 않는다.
    createMenu: (projectId, body) =>
      // `parentId`는 `null`이어도 그대로 싣는다 — 타입이 필수라 `undefined`가 올 수 없고,
      // `null`은 "루트에 만든다"는 값이다. 그래서 `definedOnly`를 지나지 않는다.
      request<MenuNode>('POST', `${projectPath(projectId)}/menu`, SHAPES.menuNode, body),
    // **`async`인 것이 요점이다** — `updateBody`가 빈 본문에서 던지는데, 동기 `throw`면
    // `await` 없이 `.catch`를 붙인 호출부가 잡지 못한다(`ApiClient`의 계약은 `Promise`다).
    updateMenu: async (projectId, nodeId, body) =>
      request<MenuNode>('PATCH', menuPath(projectId, nodeId), SHAPES.menuNode, updateBody(body)),
    deleteMenu: (projectId, nodeId) =>
      request<void>('DELETE', menuPath(projectId, nodeId), SHAPES.noBody),
    createPage: (projectId, body) =>
      // 응답은 `GET .../pages/:pageId`와 같은 여덟 키다 — 서버의 `toResponse` 하나가
      // 조회·생성·갱신 셋을 다 만든다(`apps/api/src/routes/pages.ts`). **그래서 같은 shape를
      // 쓰지만, 같은 모양이 곧 같은 하중은 아니다** — 이 자리가 새 필드(`id`)를 읽으므로
      // `SHAPES.pageDetail`의 표에 그 줄을 더했다(F2의 원인이 정확히 그 구별을 놓친 것이다).
      request<PageDetail>('POST', `${projectPath(projectId)}/pages`, SHAPES.pageDetail, body),
    // `updateMenu`와 같은 이유로 `async`다.
    updatePage: async (projectId, pageId, body) =>
      request<PageDetail>('PATCH', pagePath(projectId, pageId), SHAPES.pageDetail, updateBody(body)),
    deletePage: (projectId, pageId) =>
      request<void>('DELETE', pagePath(projectId, pageId), SHAPES.noBody),
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
    listMyRevisions: (projectId, pageId) =>
      request<RevisionSummary[]>(
        'GET',
        // `mine=true` 하나뿐이다. 선언하지 않은 쿼리 키는 400이므로(README) 캐시 버스터도
        // 붙일 수 없고, `limit`은 기본값 50이 설계 §7.3의 "최근 50개"와 같아 생략한다.
        `${pagePath(projectId, pageId)}/revisions?mine=true`,
        SHAPES.revisionList,
      ),
  }
}
