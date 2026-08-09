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
 * **이 값이 화면의 분기를 가르지는 않는다.** `client.ts`의 `ApiError` 주석이
 * *"`status`는 로그·디버깅용으로만 싣는다"*로 같은 사실을 적고 있고, 두 경우를 실제로 가르는
 * 것은 `code`다(연결 실패 `internal` / 빈 본문 차단 `bad-request`). 앞 판은 근거를 *"로그에서
 * 서버가 0을 냈다고 읽힐 여지가 없다"*로 적었는데 그것은 **읽는 사람**에 기댄 잴 수 없는
 * 문장이었다.
 *
 * **여기 "읽는 자리가 몇이다"를 적지 않는다** — 그 부류가 이 파일에서 여러 번 낡았고, 수가
 * 필요하면 세는 것은 사람이 아니라 테스트여야 한다(`test/api-consumers.test.ts`의 머리말).
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
 * `projectId`가 둘 다 이 값을 주소에 넣는다(아래 `SHAPES.pageDetail`의 "주소가 되는 값" 표).
 *
 * **소비자가 넷이고 읽는 필드가 서로 다르다** — 이 검사는 그 합집합이 아니라 **오늘 읽는
 * 것의 상위집합**이다. `pageDetail`이 같은 형식의 표를 갖는 이유와 같다: 모양이 같은 것과
 * 읽는 필드가 같은 것은 다르고, 새 소비자가 붙을 때 표를 갱신하지 않는 것이 실제로 일어난다.
 *
 * **축이 둘이다 — 하중과 시점.** `pageDetail` 표가 못박은 것을 그대로 따른다: *"그 값이 주소가
 * 되는가(하중)와 그 경로가 지금 도달하는가(시점)"*.
 *
 * **시점은 이 주석이 들고 있지 않다 — `test/api-consumers.test.ts`가 센다.** 그 파일이 소스를
 * 훑어(주석을 걷고) 어느 메서드를 어디서 부르는지 표로 고정한다. 아래 "읽는 값" 열은 **그 값이
 * 무엇이 되는가**만 적는다 — 그것은 소비자가 생기든 말든 참이다.
 *
 * | 소비자 | 읽는 값과 그 값이 되는 것 | 어긋나면 |
 * |---|---|---|
 * | `listProjects` | `id`(목록 `<Link>`의 주소) · `name`(줄의 글자) · **`description`(줄의 `<p>` 자식)** | 빈 문자열이면 `/projects/`가 되고 화면이 통째로 빈다 |
 * | `getProject` | `id`(셸이 트리에 넘기는 `projectId`) · `name`(셸 제목) | 같은 부류 — `/projects/pages/pg1` |
 * | `createProject` | `id`가 **주소가 된다**(D7 — 만든 뒤 그리로 이동한다) | 201 성공 경로로 잘못된 주소가 만들어진다 |
 * | `updateProject` | (없음 — 성공 여부만 본다) | — |
 * | 넷 모두 | `role`은 **여기서 보지 않는다** | `projects/project-actions.ts`가 계약 밖 값을 닫는다 |
 *
 * > **왜 시점을 주석에서 뺐나.** 앞 판은 이 표에 *"아직 없다(호출부 0건)"* 열을 두고
 * > *"웨이브 2 Task 4 때 갱신하라"*고 적었다. **그 시점이 같은 브랜치 안에서 지나갔고 열은
 * > 안 고쳐졌다.** 같은 부류가 이 저장소에서 **네 번** 낡았다(그 목록은
 * > `test/api-consumers.test.ts` 머리말에 있다). **"다음에 갱신하라"로는 닫히지 않는다** —
 * > 실행으로 재면 낡지 않는다.
 *
 * **`createProject`가 이 검사를 그대로 지나는 것은 "모양이 같아서"가 아니다.** 그쪽 하중
 * `id`(주소)가 이 검사가 이미 보는 것의 **부분집합**이라서다 — 실측으로 네 응답의 키 집합이
 * `["description","id","name","role","slug"]`로 같다는 것도 함께 쟀다(`api/types.ts`의
 * `ProjectDetail` 표). 별도 shape를 두면 내용이 같은 둘이 생겨 한쪽만 고쳐지는 자리가 되고,
 * 더 약한 쪽이 같은 계약을 통과시키게 된다.
 *
 * **무엇을 막고 무엇을 통과시키는지는 "어겼을 때 화면이 통째로 비는가"로 가른다 — 재서 정했다**
 * (리뷰 W6). 검사 밖이던 셋을 진짜 `<App />`에 태워 보니 갈렸다:
 *
 * | 키 | 계약 밖 값이 닿는 곳 | 관측 | 판단 |
 * |---|---|---|---|
 * | `description` | 목록 줄의 `<p>` **자식** | `{}`·`{x:1}`·`[{x:1}]`·`[[{}]]`에서 **`<main>` 없음 · `innerHTML` 11자** | **막는다** |
 * | `slug` | 수정 폼의 `<input value>` | 폼이 열리고 화면이 산다(629자) | 둔다 |
 * | `role` | `projectAbilities`의 `!== 'owner'` 비교 | 버튼만 닫히고 화면이 산다(190자) | 둔다 |
 *
 * **`description`이 죽는 것은 "객체를 품었을 때"다** — `[1,2]`·`42`·`true`·키 없음은 살아남는다
 * (277~279자). 그래도 검사를 `문자열 | null`로 두는 것은 **계약이 그 둘뿐**이고, 통과시킬 이유가
 * 있는 값이 그 밖에 없기 때문이다.
 *
 * **`role`을 막지 않는 것이 특히 의도다.** `projects/project-actions.ts`가 계약 밖 값을 받아
 * 닫도록 만들어져 있으므로, 여기서 막으면 **그 프로젝트의 버튼이 닫히는 대신 목록 전체가
 * 막힌다** — 손해가 더 크다. 아래 `projectList` 문단의 *"보이고 복구되는 실패가 조용한 빈
 * 화면보다 낫다"*와 같은 저울이고, 여기서는 저울이 반대로 기운다.
 *
 * **다른 shape에도 같은 부류가 있는지 훑었다 — 없다**(같은 하네스로 쟀다).
 * `pageDetail.title`·`pageDetail.description`이 객체여도 셸이 살고(`.wb-shell` 있음),
 * `sessionUser.name`도 그렇다. 에디터 셸은 프로젝트의 `description`을 그리지 않는다.
 * 트리의 `title`들은 `isTreeMenuNode`·`isTreePage`가 이미 문자열로 막는다.
 * **즉 계약 밖 값이 화면을 통째로 비우는 자리는 오늘 이 하나다.**
 *
 * **`name`을 보는 것은 `createProject`에게는 넓다.** 그쪽은 오늘 `id`만 읽는다. 그래도 좁히지
 * 않는 것은 `name`이 계약이 항상 준다고 말하는 필드이고, 계약을 벗어난 응답을 **보이고
 * 복구되는 실패**로 만드는 편이 조용히 지나가는 것보다 낫기 때문이다(`projectList`가 항목
 * 하나 때문에 목록 전체를 막는 것과 같은 판단). **넓다는 사실 자체를 여기 적어 둔다** —
 * 다음 소비자가 무엇을 근거로 판단할지가 그것이다.
 */
function isProjectDetail(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['name'] === 'string' &&
    // **`description`은 React 자식으로 그려진다** — 객체를 품으면 목록이 통째로 빈다(위 표).
    (typeof value['description'] === 'string' || value['description'] === null)
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
   * **이 응답의 필드를 읽는 자리는 지금도 0건이다.** 근거 둘 중 **하나는 낡아서 갈아 끼웠다**
   * (P2b-5 웨이브 1 리뷰 F7 — 이 주석은 P2b-4 웨이브 1에 쓰였고 그 뒤 웨이브 2·3이 호출부를
   * 만들었다):
   *
   * - ~~`rg`로 CRUD 여섯을 부르는 자리 **0건**~~ → **부르는 자리가 생겼다.** 전부
   *   `tree/use-tree-commands.tsx` 한 파일에 있다. **수를 여기 적지 않는다** — 그 수는
   *   **같은 브랜치 안에서도** 낡고(아래), 세는 명령을 적으면 그 명령이 이 주석을 함께 센다.
   *   지금 값이 필요하면 그 파일을 열어 세라.
   * - **`MenuNode`를 값으로 읽는 자리 0건 — 이쪽은 여전히 참이다**(실측: 여섯 중 응답을 변수에
   *   받는 자리는 `createPage` 하나뿐이고 그것은 `PageDetail`이다. 나머지 열은 `await`만 하고
   *   버린다). 결론(얕게 둔다)을 떠받치는 것은 이 절이다.
   *
   * > **소스 텍스트를 세는 주석은 자기 자신을 센다.** 이 저장소에서 두 번 났다 — 처음에는
   * > *"`rg` 히트는 12"*라 적었고, 그 수를 고치며 쓴 *"열둘째는 인용이다"*라는 **문장이 심볼을
   * > 인용해 13이 됐다.** 그래서 *"세는 범위를 한 파일로 좁혀라"*로 처방했는데 **그것도
   * > 안 닫혔다**(리뷰 W3): 좁힌 파일 안에 그 문장이 있으면 같은 일이 난다.
   * > **닫는 방법은 둘이다 — 수를 안 적거나, 주석을 걷고 실행으로 세는 것**(D3의 `.role`은
   * > `test/role-access.test.ts`가 그렇게 한다). 여기는 그 수가 계약을 떠받치지 않으므로
   * > 앞쪽을 골랐다.
   *
   * > **"오늘 0건"류 문장은 시간이 지나면 저절로 거짓이 된다.** 이 자리가 그 사례다 — 무엇이
   * > 그것을 갱신하게 만드는지까지 적지 않으면 아무도 갱신하지 않는다. 위 `isProjectDetail`의
   * > "오늘 도달" 열에 갱신 시점(웨이브 2 Task 4)을 함께 적어 둔 것이 그 대응이다.
   *
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
   * **어느 id를 빈 문자열까지 막는지는 "그 값이 주소가 되는가"로 가른다.** 주소가 만들어지는
   * 자리를 `rg`로 다시 세니 `apps/web/src`에 **넷**이다:
   *
   * - `panels/menu-tree.tsx`의 `PageLink` — `/projects/:projectId/pages/:pageId`
   * - `routes/project-list.tsx`의 `<Link>` — `/projects/:projectId`
   * - `tree/use-tree-commands.tsx`의 `navigate` — 페이지를 **만든 뒤** 그리로 간다
   * - `tree/use-tree-commands.tsx`의 `navigate` — 페이지를 **지운 뒤** `/projects/:projectId`로 간다
   *
   * **뒤 둘은 P2b-4 웨이브 2가 만들었고 이 표는 그때 갱신되지 않았다**(P2b-5 리뷰 F7과 같은
   * 부류 — "오늘 0건"류 문장이 저절로 낡은 것이다). **앞 판의 이 문단은 "셋"이라 적었고 그것도
   * 틀렸다** — 지운 뒤의 `navigate`를 빠뜨렸다. 넷째가 주소에 넣는 값도 `projectDetail.id`다
   * (`routes/editor.tsx`가 **조회해 온** id를 트리에 넘기고 그 훅이 그대로 쓴다). 거기 들어가는
   * shape 값을 표로 적는다.
   *
   * | shape의 값 | 주소가 되는 자리 | 오늘 도달 | 빈 문자열 |
   * |---|---|---|---|
   * | `pageDetail.id` | **`use-tree-commands.tsx`의 `navigate`** — 만든 페이지의 `id`를 그대로 주소에 넣는다 | **페이지를 만들 때마다** | 막는다 |
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
   * **그 "아직 도달하지 않는 자리"가 이제 도달한다** — 위 표 첫 줄이 그것이고, 가드는 그때
   * 이미 있었으므로 손해는 없었다. **기록만 낡았다.**
   *
   * **읽는 축이 둘이라는 것이 요점이다** — 그 값이 주소가 되는가(하중)와 그 경로가 지금
   * 도달하는가(시점). 얕음을 일괄로 맞추지 않고 **이 표의 위 넷만** 깊게 한다.
   *
   * **`projectList`는 손해의 모양이 다르다 — 항목 하나가 걸리면 목록 전체가 막힌다.**
   * `isArrayOf`가 `every`라 한 항목의 `id`가 빈 문자열이면 배열째 `ApiError`가 되고,
   * 사용자는 멀쩡한 다른 프로젝트도 열지 못한다. **그래도 그 손해가 옳다:** 통과시키면
   * 그 줄의 링크가 `/projects/`가 되고, 그 주소는 `app.tsx`의 어느 라우트도 잡지 않아
   * **화면이 통째로 빈다**(웨이브 1 실측). 목록 전체가 막히는 것은 이유가 화면에 남고
   * 새로고침으로 복구되지만, 빈 화면은 사용자가 무엇이 잘못됐는지 알 수도 되돌릴 수도 없다.
   * **보이고 복구되는 실패가 조용한 빈 화면보다 낫다.**
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
 * **도달 경로는 `test/api-consumers.test.ts`가 센다** — 이 여섯을 부르는 자리가 어디인지
 * 그 표에 있다(오늘은 `tree/use-tree-commands.tsx` 한 파일이다). ~~앞 판은 여기에
 * *"오늘 0건"*이라 적었고~~ 그것도, 그것을 고쳐 적은 수도 낡았다 — **수를 주석에 두지 않는다.**
 * **그 자리들이 전부 리터럴로 키를 적어 넘기므로 빈 본문이 나가는 경로는 없다**(읽어서 봤다).
 * 실제 위험은 **계산된 값이 `undefined`가 되는 경로**다:
 * `previousMenuSibling`·`menuOutdentTarget`이 `null`을 낼 수 있고 호출부가 그것을 옵셔널
 * 체이닝으로 흘리면 키가 통째로 사라진다.
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
 * 본문에 **서버가 선언한 키만** 담는다. `definedOnly`가 그 뒤에서 값이 `undefined`인 것을 뺀다.
 *
 * **`definedOnly`만으로는 부족하다 — 그것이 이 함수가 있는 이유다.** `definedOnly`가 거르는
 * 것은 **값이 `undefined`인 키**뿐이고 **선언되지 않은 키는 하나도 거르지 않는다.** 반면 서버의
 * 본문 스키마는 전부 `z.strictObject`라 **선언되지 않은 키가 그 자체로 400**이다. 두 장치가
 * 막는 실패가 다르다.
 *
 * **위험한 입력은 "응답 객체를 그대로 되보내는 것"이다.** 서버의 응답에는 요청이 받지 않는
 * 키가 섞여 있다. 본문을 받는 자리를 전부 재서 적는다(api 하네스 — 응답을 그대로 본문으로 보냈다):
 *
 * | 자리 | 서버가 낸 것 |
 * |---|---|
 * | `POST`·`PATCH /projects` | `400` 인식할 수 없는 키: `"id"`, `"role"` |
 * | `POST /menu` | `400` 인식할 수 없는 키: `"id"`, `"projectId"`, `"sortOrder"` |
 * | `PATCH /menu/:id` | `400` 인식할 수 없는 키: `"id"`, `"projectId"` |
 * | `POST /pages` | `400` 인식할 수 없는 키: `"id"`, `"sortOrder"`, `"schemaVersion"`, `"schema"`, `"headSeq"` |
 * | `PATCH /pages/:id` | `400` 인식할 수 없는 키: `"id"`, `"schemaVersion"`, `"schema"`, `"headSeq"` |
 *
 * **같은 표의 반대편도 쟀다** — 선언된 키만 담은 본문은 그 다섯 자리 전부 200/201이다.
 * (`patchOps`는 표에 없다 — 응답에 `baseSeq`·`ops`가 없어 되보내는 것을 타입이 이미 막는다.)
 *
 * **타입이 그것을 막지 못한다**(`tsc` 프로브, 매번 `pnpm typecheck`):
 *
 * | 넘기는 모양 | typecheck |
 * |---|---|
 * | `updateProject(id, created)` · `updateMenu(pid, id, node)` — 변수 | **에러 없음** |
 * | `updateMenu(pid, id, { title, sortOrder, projectId })` — 키를 적은 리터럴 | `TS2353: … 'projectId' does not exist …` |
 * | `updateProject(id, { ...created })` · `updateMenu(pid, id, { ...node })` — **스프레드 리터럴** | **에러 없음** |
 *
 * 초과 속성 검사는 **리터럴에 직접 적은 키**에만 걸린다. **스프레드로 들어온 키는 리터럴이어도
 * 걸리지 않는다** — 그리고 그 모양(`{ ...page, title: 새제목 }`)이 폼이 쓰기 가장 쉬운 형태다.
 * 그래서 타입이 아니라 여기서 막는다.
 *
 * **본문을 싣는 자리는 여덟이고 일곱이 이 함수를 지난다**(실측: `request`에 넷째 인자를 넘기는
 * 줄 전수). 여덟째는 `login`인데 **인자가 문자열 둘이라 실을 객체가 애초에 없다** —
 * `{ email, password }`를 그 자리에서 만든다. 규칙이 닿지 않는 것이 아니라 위반할 수단이 없다.
 *
 * **한 함수로 일곱 자리를 덮는 이유.** 자리마다 함수를 두면 **같은 위험에 대한 규칙이 일곱 벌**이
 * 되고, 이 저장소가 반복해 겪은 *"한 곳만 고치고 다른 곳을 놓치는"* 결함이 정확히 거기서 난다
 * (P2b-5 웨이브 1은 프로젝트 셋만 고쳐 규칙을 둘로 갈라 놨었고, 그것이 이 커밋의 계기다).
 * `patchOps`는 원래 삼항으로 키 목록을 적고 있었다 — **규칙은 이미 같았고 표현만 달랐다.**
 *
 * **과도 차단을 쟀다.** 정상 본문 **48조합**(`createMenu` 6 · `updateMenu` 17 · `createPage` 6 ·
 * `updatePage` 11 · `patchOps` 8)에서 나가는 바이트가 옛 구현과 **하나도 다르지 않았고**, 살아
 * 있는 호출부가 쓰는 본문 모양 **열**도 전부 같았다. **다만 "바이트가 늘 같다"는 아니다** —
 * 나가는 키 순서가 아래 `BODY_KEYS`의 순서로 정규화되므로 **호출자가 역순으로 적은 본문은
 * 바이트가 달라진다**(재서 확인했다: `{sortOrder, title}`을 넘기면 옛 구현은
 * `{"sortOrder":…,"title":…}`, 지금은 `{"title":…,"sortOrder":…}`). JSON 객체의 키 순서는 뜻을
 * 바꾸지 않고 서버의 zod도 보지 않는다 — **`나가는 키 순서는 …` 케이스가 그 동작을 고정한다.**
 *
 * **구분력 — 변이를 걸어 쟀다**(`pnpm vitest run --project web`, 매번 복구했다):
 *
 * | 변이 | 사망 |
 * |---|---|
 * | 이 함수가 `keys`를 무시하고 `definedOnly(body)`를 내게 한다 | **6** |
 * | 자리별로 이 함수를 지운다 — `createProject`·`createMenu`·`updateMenu`·`createPage`·`patchOps` | 각 **1** |
 * | 같은 변이 — `updateProject`·`updatePage` | 각 **2** |
 * | 안쪽 `definedOnly`를 항등으로 바꾼다(`undefined`인 키가 남는다) | **0** |
 *
 * **일곱 자리를 다 재서 적는다.** 앞 판은 다섯만 적어 `createProject`·`updateProject`를
 * 빠뜨렸고, 첫 줄의 **5**는 `patchOps` 케이스를 더하기 전의 수였다(케이스가 늘어 6이 됐다).
 *
 * **키를 고르는 쪽은 자리마다 닫혔고, `undefined` 필터는 여전히 닫히지 않는다.** 뒤쪽이 0인
 * 원인은 `definedOnly` 머리말이 적은 것과 같다 — 나가는 본문의 유일한 관찰 지점이
 * `JSON.stringify`가 만든 문자열이고 그것이 값이 `undefined`인 키를 지워 준다.
 * **`patchOps`는 케이스를 더하기 전에 0 사망이었다** — 그 자리는 응답을 되보내는 것을 타입이
 * 이미 막아(응답에 `baseSeq`·`ops`가 없다) 다른 여섯과 위험의 모양이 다르기 때문이다.
 * 규칙을 한 벌로 두는 이상 그 자리도 닫는 케이스가 있어야 해서 하나 더했다.
 *
 * **키 목록을 `Record<keyof …, true>`로 두는 것이 요점이다** — 배열이면 목록과 타입이 컴파일러로
 * 이어지지 않아, `ApiClient`가 키를 하나 더 받게 됐을 때 그 키가 **조용히 안 나간다.** 레코드로
 * 두면 **빠뜨림과 오타가 양방향으로 컴파일 에러**다(이 파일의 `API_ERROR_CODES`와 같은 근거).
 * **세 방향을 다 심어서 관측했다:**
 *
 * | 심은 것 | `pnpm typecheck` |
 * |---|---|
 * | `ApiClient`의 본문 타입에 키를 더하고 아래 목록은 그대로 | `TS1360: … does not satisfy the expected type` |
 * | 아래 목록에서 키를 뺀다 | `TS1360`(같은 자리) |
 * | 아래 목록에 계약에 없는 키를 더한다 | `TS2353: … 'bogus' does not exist in type …` |
 *
 * (앞 둘이 `TS2739`가 아니라 `TS1360`인 것은 애너테이션이 아니라 `satisfies`로 검사하기
 * 때문이다. **그 코드는 심어서 읽은 것이다** — 처음엔 기억으로 `TS2739`를 적었고 틀렸다.)
 *
 * **키 목록을 `Parameters<ApiClient[…]>`에서 끌어오는 것도 요점이다.** 본문 타입을 여기 다시
 * 적으면 인터페이스와 어긋날 수 있고, 그 어긋남은 컴파일러가 못 잡는다.
 */
function declaredOnly<T extends object>(body: T, keys: Record<keyof T, true>): Partial<T> {
  const source = body as Record<string, unknown>
  return definedOnly(Object.fromEntries(Object.keys(keys).map((key) => [key, source[key]])) as T)
}

/**
 * 각 요청이 서버에 보낼 수 있는 키. **`ApiClient`의 시그니처에서 끌어온다** — 그래야 인터페이스가
 * 바뀌면 여기가 컴파일 에러로 알려 준다. 값은 `true`뿐이고 쓰이는 것은 키 이름이다.
 */
const BODY_KEYS = {
  createProject: { name: true, slug: true, description: true } satisfies Record<
    keyof Parameters<ApiClient['createProject']>[0],
    true
  >,
  updateProject: { name: true, slug: true, description: true } satisfies Record<
    keyof Parameters<ApiClient['updateProject']>[1],
    true
  >,
  createMenu: { parentId: true, title: true } satisfies Record<
    keyof Parameters<ApiClient['createMenu']>[1],
    true
  >,
  updateMenu: { title: true, parentId: true, sortOrder: true } satisfies Record<
    keyof Parameters<ApiClient['updateMenu']>[2],
    true
  >,
  createPage: { menuNodeId: true, title: true } satisfies Record<
    keyof Parameters<ApiClient['createPage']>[1],
    true
  >,
  updatePage: { title: true, menuNodeId: true, sortOrder: true } satisfies Record<
    keyof Parameters<ApiClient['updatePage']>[2],
    true
  >,
  patchOps: { baseSeq: true, ops: true, clientOpId: true } satisfies Record<
    keyof Parameters<ApiClient['patchOps']>[2],
    true
  >,
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
    // 아래 셋이 P2b-5의 프로젝트 CRUD다. **생성 응답은 `ProjectDetail`이다** — `role`까지
    // 실려 온다(`api/types.ts`의 실측 표). 그래서 `SHAPES.projectDetail`을 그대로 지나는데,
    // 그 근거는 "모양이 같다"가 아니라 **`createProject`의 하중 `id`가 그 검사가 이미 보는
    // 것의 부분집합**이라는 것이다(`isProjectDetail`의 소비자 표).
    createProject: (body) =>
      // **선언된 키만 담는다**(`declaredOnly`). `description`을 주지 않으면 그 키를 만들지 않고,
      // 응답 객체처럼 `id`·`role`이 섞인 것을 넘겨도 그 둘이 나가지 않는다 — 나가면 서버가
      // 400을 낸다(그 머리말의 표).
      request<ProjectDetail>(
        'POST',
        '/projects',
        SHAPES.projectDetail,
        declaredOnly(body, BODY_KEYS.createProject),
      ),
    // **`async`인 것이 요점이다** — `updateBody`가 빈 본문에서 던지는데, 동기 `throw`면
    // `await` 없이 `.catch`를 붙인 호출부가 잡지 못한다(`updateMenu`와 같은 자리).
    // **실측: `async`를 지우면 3 사망**(빈 본문 · undefined만 담긴 본문 · 동기 throw 케이스).
    //
    // **`declaredOnly`를 먼저 지난 뒤 `updateBody`가 센다.** 순서가 요점이다 — 미선언 키를
    // 먼저 떨어내지 않으면 `{id, role}`만 담긴 본문이 "빈 본문이 아니다"로 통과해 400이 된다.
    // **갱신 셋이 같은 순서이고, 셋 다 그 순서를 케이스가 지킨다**(자리마다 "선언되지 않은 키만
    // 담긴 갱신 본문" 케이스가 하나씩 있다 — 뒤집으면 각 1 사망이다). **앞 판은 여기에 "셋이
    // 전부 이 순서다"라고만 적었는데, 그때는 뒤집어도 죽는 것이 `updateProject` 하나뿐이었다** —
    // 나머지 둘은 설계가 달라서가 아니라 케이스가 없어서였다(리뷰 V5).
    updateProject: async (projectId, body) =>
      request<ProjectDetail>(
        'PATCH',
        projectPath(projectId),
        SHAPES.projectDetail,
        updateBody(declaredOnly(body, BODY_KEYS.updateProject)),
      ),
    deleteProject: (projectId) => request<void>('DELETE', projectPath(projectId), SHAPES.noBody),
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
      // `parentId`는 `null`이어도 그대로 싣는다 — `null`은 "루트에 만든다"는 값이다.
      // `declaredOnly` 안의 `definedOnly`가 거르는 것은 `undefined`뿐이라 그 값은 살아남는다
      // (`updateMenu`의 `parentId: null` 케이스가 같은 성질을 지킨다).
      request<MenuNode>(
        'POST',
        `${projectPath(projectId)}/menu`,
        SHAPES.menuNode,
        declaredOnly(body, BODY_KEYS.createMenu),
      ),
    // **`async`인 것이 요점이다** — `updateBody`가 빈 본문에서 던지는데, 동기 `throw`면
    // `await` 없이 `.catch`를 붙인 호출부가 잡지 못한다(`ApiClient`의 계약은 `Promise`다).
    updateMenu: async (projectId, nodeId, body) =>
      request<MenuNode>(
        'PATCH',
        menuPath(projectId, nodeId),
        SHAPES.menuNode,
        updateBody(declaredOnly(body, BODY_KEYS.updateMenu)),
      ),
    deleteMenu: (projectId, nodeId) =>
      request<void>('DELETE', menuPath(projectId, nodeId), SHAPES.noBody),
    createPage: (projectId, body) =>
      // 응답은 `GET .../pages/:pageId`와 같은 여덟 키다 — 서버의 `toResponse` 하나가
      // 조회·생성·갱신 셋을 다 만든다(`apps/api/src/routes/pages.ts`). **그래서 같은 shape를
      // 쓰지만, 같은 모양이 곧 같은 하중은 아니다** — 이 자리가 새 필드(`id`)를 읽으므로
      // `SHAPES.pageDetail`의 표에 그 줄을 더했다(F2의 원인이 정확히 그 구별을 놓친 것이다).
      request<PageDetail>(
        'POST',
        `${projectPath(projectId)}/pages`,
        SHAPES.pageDetail,
        declaredOnly(body, BODY_KEYS.createPage),
      ),
    // `updateMenu`와 같은 이유로 `async`다.
    updatePage: async (projectId, pageId, body) =>
      request<PageDetail>(
        'PATCH',
        pagePath(projectId, pageId),
        SHAPES.pageDetail,
        updateBody(declaredOnly(body, BODY_KEYS.updatePage)),
      ),
    deletePage: (projectId, pageId) =>
      request<void>('DELETE', pagePath(projectId, pageId), SHAPES.noBody),
    getPage: (projectId, pageId) =>
      request<PageDetail>('GET', pagePath(projectId, pageId), SHAPES.pageDetail),
    patchOps: (projectId, pageId, body) =>
      request<PatchResult>(
        'PATCH',
        `${pagePath(projectId, pageId)}/ops`,
        SHAPES.patchResult,
        // `clientOpId`가 없으면 **키를 만들지 않는다.** `undefined`를 실은 키는
        // `JSON.stringify`가 지워 주므로 오늘은 통과하지만 그 우연에 기대지 않는다.
        //
        // **앞서 여기에 삼항으로 키 목록을 적어 두었다.** `declaredOnly`가 같은 일을 하고
        // 목록이 `ApiClient`와 컴파일러로 이어지므로 그쪽으로 옮겼다 — **나가는 바이트가
        // 바뀌지 않는 것을 재고 옮겼다**(선택 키 유무 두 갈래 전부).
        declaredOnly(body, BODY_KEYS.patchOps),
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
