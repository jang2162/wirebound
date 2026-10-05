/**
 * `ApiClient`의 실제 구현. `fetch`를 부르는 곳은 이 파일 하나다.
 *
 * 서버와 같은 오리진으로 붙는다(개발 중에는 Vite 프록시가, 배포에서는
 * 정적 파일을 함께 서빙하는 서버가 그렇게 만든다). 그래서 절대 URL을 만들지 않고
 * `/api`로 시작하는 경로만 쓴다.
 */
import {
  ApiError,
  type ApiClient,
  type ApiErrorCode,
  type ApiErrorIssue,
  type MenuCascadeResult,
  type ReadOptions,
  type WriteOptions,
} from './client'
import { isSessionUserChanged, KNOWN_USER_HEADER, type KnownUserHolder } from './known-user'
import type {
  Comment,
  CommentCreated,
  ExportPreview,
  MarkerChange,
  MenuNode,
  MyApiToken,
  ProjectMember,
  PageDetail,
  PageImported,
  PatchResult,
  Preset,
  ProjectDetail,
  ProjectThemeView,
  ProjectView,
  RestoreResult,
  RevisionInverse,
  SessionUser,
  SnapshotSummary,
  ThemeImpact,
  ThemePackageSummary,
  ThemePackageUploaded,
  ThemePackageVersion,
  ThemeRef,
  TreeMenuNode,
} from './types'
import type { ThemeManifest } from '@wirebound/theme-sdk'

const API_PREFIX = '/api'

/** 응답을 읽지 못했을 때 쓰는 메시지. 서버가 준 문장이 아니므로 한 곳에만 둔다. */
const UNREADABLE = '서버 응답을 이해할 수 없습니다'

/** 내려받기 응답으로 받는 형식 — 서버의 `routes/export.ts`가 내는 둘(zip · pptx)이다(`downloadExport`). */
const EXPORT_FILE_TYPES = ['application/zip', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']

/** 테마 업로드가 싣는 형식 — 서버의 업로드 파서가 받는 둘 가운데 하나(spec 「업로드 검증」). */
const THEME_PACKAGE_TYPE = 'application/zip'

/** 요청이 서버에 닿지도 못했을 때 쓰는 메시지. 사용자에게 그대로 보여도 되는 문장이어야 한다. */
const UNREACHABLE = '서버에 연결하지 못했습니다'

/**
 * **일반 읽기의 시간 제한.** 시간 제한이 없으면 서버가 답을 안 줄 때 걸린 읽기가 끝없이 기다린다(Chrome · 그
 * 워크트리의 Postgres 컨테이너를 `pause` 해 재현한다 — 세션 조회까지 풀에서 기다린다). 그동안 화면은 이렇다:
 *
 * | 읽기 | 화면 |
 * |---|---|
 * | 세션 확인(`me` — 새로고침) | **빈 흰 화면**(문지기가 `pending`에서 아무것도 안 그린다) |
 * | 프로젝트 목록(`listProjects`) | «불러오는 중…» |
 * | 프로젝트 열기(`getProject` — 트리는 그 뒤라 안 나간다) | «불러오는 중…» |
 * | 페이지 옮기기(`getPage`) | «페이지를 불러오는 중…» |
 * | 코멘트 탭(`listComments`) | «코멘트를 불러오는 중…» |
 *
 * 컨테이너를 풀면 저절로 돌아오지만 분할이 풀리지 않으면(죽은 상대를 서버가 알아챌 때까지 수 시간) 끝이 없다.
 *
 * 시간 제한이 있으면(같은 절차 · 22초에 본 값): 다섯 다 12s 와 22s 사이에 «서버가 응답하지 않습니다 — 잠시 뒤
 * 새로고침하세요»(`alert`)를 그 화면의 실패 자리에 그린다 — 세션 확인은 «세션을 확인하지 못했습니다», 프로젝트 열기는
 * «설계서를 열지 못했습니다» 아래. 매달린 요청 0. **대가: 거절한 뒤에는 저절로 안 돌아온다** — 컨테이너를 풀어도 그
 * 문장이 남고 새로고침(또는 페이지·탭을 다시 여는 것)이 다시 읽는다. 끝없이 기다리면 풀리는 순간 돌아오지만, 안
 * 풀리면 영영 «불러오는 중»이다.
 *
 * **값: 10초 · 두 번.** 이 읽기들이 실제로 걸리는 시간(Vite 프록시 없이 api 직접 · 순차 50회 · 이 기계)은 p50
 * 4.0–6.2ms · 최대 9.2ms 다(`me` · 목록 · 프로젝트 · 트리 · 페이지 · 코멘트). 10초는 쓰기의 시간 제한과 같은
 * 값이고(`WRITE_DEADLINE_MS` — 그 근거 표) 본 최대의 천 배를 넘는다. 넘으면 끊고 **한 번 더 보낸다** — 읽기는
 * 되풀이해도 안전하고, 멈춘 것이 그 연결 하나(반쯤 죽은 프록시 연결 같은)면 새 요청이 산다. 둘째도 넘으면
 * «서버가 응답하지 않습니다»로 거절한다 — 부른 화면은 제 실패 문장을 그린다(끝없는 «불러오는 중»이 아니다).
 *
 * **안 거는 읽기:**
 *
 * - **받은 신호가 있는 읽기** — 판정용 다시 읽기다(`getPage`·`listComments`의 `ReadOptions.signal`). 장부가 제
 *   시간 제한으로 끊는다(`race`) — 여기서 한 번 더 걸면 두 시계가 한 요청을 다툰다.
 * - **PPTX 미리보기**(`getExportPreview`) — 서버가 페이지를 한 장씩 그린다(이 기계 2페이지 515ms · 페이지 수에 비례).
 *   HTML 미리보기(같은 절차 최대 21.5ms)도 같은 함수라 함께 뺀다 — 한 형식만 거는 갈래를 두지 않는다. **`cancel`은
 *   듣는다** — 떠나면(패널을 닫거나 다시 부르면) 끊고 다시 보내지 않는다. 안 끊으면 서버는 연결이 닫힐 때까지 그
 *   내보내기를 끝까지 돌아(`apps/api`의 `routes/export.ts` «요청이 끊기면 일을 버린다») 다음 미리보기가 그 뒤에 선다.
 * - **쓰기**(`GET` 이 아닌 것) — 우측 패널의 쓰기는 장부가 잰다. 그 밖의 쓰기(메뉴 · 스냅샷 …)에는 시간 제한이
 *   없다.
 *
 * **응답 머리까지만 잰다** — 본문을 읽는 동안은 재지 않는다. **이것이 큰 문서 × 느린 망에서 페이지를 여는가를
 * 가른다**(Chrome · CDP 스로틀 40KB/s · 400ms · 1MB 페이지): 머리 2.2s → 본문 끝 27.4s → 그려짐. 본문까지
 * 재면(`finally`의 `clearTimeout`을 빼는 한 줄) 같은 절차가 11.8s 에 끊겨 «서버 응답을 이해할 수
 * 없습니다»다. 케이스: `test/api/http-client.test.ts`의 *"머리가 시간 안에 오면 본문이 10초를 넘어도 …"*.
 *
 * **떠난 조회는 끊는다.** 조회 이펙트가 `ReadOptions.cancel`을 싣고 정리에서 끊는다 — 끊기면
 * 머리 앞이든 본문을 읽는 중이든 요청을 끊고 **다시 보내지 않는다**(`ABANDONED`). 이펙트의 정리가 응답을
 * 버리기만 하면(`alive = false`) 떠난 방문의 1MB 본문이 계속 내려받힌다. Chrome 은 HTTP/1.1 호스트당 연결이
 * **6개**라 버려진 본문 여섯이 여섯 연결을 쥐면 새 GET 이 **브라우저 안에서 줄을 서고**, 10초는 `fetch`를 부른
 * 순간부터 재므로 **줄 선 시간까지 «서버가 답이 없다»로 센다** — 같은 스로틀로 큰 페이지 ↔ 옆 페이지를 6번 오간 뒤
 * 세 번째 페이지로 가면 40.3s 에 «서버가 응답하지 않습니다»(api 의 최대 `responseTime` 87ms — 서버는 다 답했다).
 * 버려진 조회도 10초가 되면 다시 보내 줄을 더 길게 만든다. 끊으면(같은 절차): 떠날 때마다 큰
 * 페이지의 GET 이 `ERR_ABORTED` · 세 번째 페이지로 갈 때 매달린 요청 **0** · 그 GET 의 머리 0.4–0.5s · 거짓 통지 0(N=6 ·
 * N=7 둘 다). **받은 신호(`signal` — 판정용 다시 읽기)와는 다른
 * 키다** — 그쪽은 부른 쪽이 시간을 재고, 이쪽은 시간을 여기서 잰다(두 시계가 한 요청을 다투지 않는다).
 *
 * **끊는 자리 — 조회 이펙트 전부**: 페이지 · 설명 · 코멘트 · 프리셋 · 테마(`theme/project-theme.tsx` · 설정 페이지) · 되돌리기 이력 + **셸의
 * 프로젝트**(`routes/editor.tsx` — 첫 조회 · 역할 다시 읽기) · **트리**(`tree/use-tree-commands.tsx` — 마운트 · 복원 신호 · 조작 뒤)
 * · **세션 확인**(`session/session-context.tsx`의 `me`) · **편집 수습의 페이지**(`edit/use-edit-commit.tsx` — «떠남»은 스토어가 그
 * 페이지를 더는 열고 있지 않은 것). 끊지 않으면(Chrome · 조회를 4s 붙잡고 1s 에 목록으로) 프로젝트 · 트리 조회가 4.1s 에
 * 200 으로 끝나고, 끊으면 떠나는 순간 `ERR_ABORTED`다. **안 끊는 것**: 이름 변경 뒤의 트리 다시 받기(장부가 **지금 떠 있는**
 * 트리에 배달한다 — 낸 트리가 떠나도 받을 트리가 있을 수 있다) · 스냅샷 패널의 `getProject`(끊을 이유가 없어서가 아니라
 * `cancel`을 싣지 않은 자리다).
 *
 * **남는 성질 둘 — 재서 적고 고치지 않는다:**
 *
 * - **10초는 `fetch`를 부른 순간부터다 — 브라우저 안의 대기열 시간도 센다.** Chrome(HTTP/1.1 · 한 호스트 연결 6): 한 페이지 행을
 *   DB 에서 잠가 둔 채 그 행의 설명 쓰기 여섯을 raw `fetch`로 내 연결 여섯을 쥐게 하고 프로젝트를 열었다 → `getProject` 둘(10.1s ·
 *   20.1s 에 끊김) → **20.2s «서버가 응답하지 않습니다»**, api 로그에 그 `GET`은 **0건**(서버는 그 행을 안 보므로 곧바로 답할 수
 *   있었다). 앱의 조회는 떠나면 끊기므로 앱 스스로 연결을 쥐는 길은 좁다 — 남는 것은 끊을 수 없는 요청(쓰기 · 다른 도구)이
 *   연결을 쥔 판이다. 고치려면 «연결을 잡은 순간»부터 재야 하는데 `fetch`는 그 순간을 알려 주지 않는다.
 * - **시간 초과 뒤 저절로 안 돌아온다.** 같은 절차에서 잠금을 풀어(연결이 풀림) 6s 기다려도 «서버가 응답하지 않습니다» 그대로 · 에디터
 *   안 섬 — 새로고침(또는 그 화면을 다시 여는 것)이 다시 읽는다. 위 «대가»와 같은 말이다.
 */
export const READ_DEADLINE_MS = 10_000
/** 일반 읽기를 보내는 횟수 — 첫 번째와 다시 시도 한 번. */
const READ_ATTEMPTS = 2
/** 일반 읽기가 시간 제한을 다 넘겼을 때. 사용자에게 그대로 보인다. */
const READ_TIMEOUT = '서버가 응답하지 않습니다 — 잠시 뒤 새로고침하세요'
/**
 * 부른 쪽이 떠나 조회를 끊었을 때(`ReadOptions.cancel`). **아무에게도 안 보인다** — 끊은 이펙트는 이미 정리됐고
 * 거절을 `alive`로 버린다. 그래도 `ApiError`로 던지는 것은 이 층이 내는 거절이 전부 그 부류라서다.
 */
const ABANDONED = '떠난 화면의 조회를 끊었습니다'

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
 * 것은 `code`다(연결 실패 `internal` / 빈 본문 차단 `bad-request`). 근거를 *"로그에서
 * 서버가 0을 냈다고 읽힐 여지가 없다"*로 두지 않는다 — **읽는 사람**에 기댄 잴 수 없는
 * 문장이다.
 *
 * **여기 "읽는 자리가 몇이다"를 적지 않는다** — 그런 수는 호출부가 바뀌면 조용히 낡고, 수가
 * 필요하면 세는 것은 사람이 아니라 테스트여야 한다(`test/api-consumers.test.ts`의 머리말).
 */
const NO_RESPONSE = 0

/**
 * 계약에 있는 `code` 전부.
 *
 * **`Record<ApiErrorCode, true>`인 것이 요점이다** — 배열이면 이 목록과 `ApiErrorCode`
 * 유니온이 컴파일러로 이어지지 않아, 오타가 나거나 유니온에 코드를 더하고 여기 안 넣으면 그
 * 코드가 조용히 `internal`로 흡수된다(`toApiError`의 `: 'internal'`). 레코드로 두면
 * **빠뜨림과 오타가 양방향으로 컴파일 에러**가 된다. 편집 경로가 `conflict`(리베이스)·
 * `validation-failed`(서버 검증 실패)로 분기하므로 그 둘이 조용히 틀어지면 안 된다.
 */
const API_ERROR_CODES: Record<ApiErrorCode, true> = {
  'bad-request': true,
  unauthenticated: true,
  forbidden: true,
  'not-found': true,
  conflict: true,
  locked: true,
  'validation-failed': true,
  'rate-limited': true,
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
 * 트리의 CRUD 여섯도 여기를 지난다(생성·갱신 응답이 그대로 다음 조작의 입력이 된다).
 *
 * **왜 필요한가.** `!response.ok`와 JSON 파싱은 이미 막혀 있지만, 서버가 200과 함께 계약에
 * 없는 모양을 내면 그 값이 그대로 화면까지 간다. 실측(`test/api/response-shape.test.tsx`의
 * 표): 네 자리에서 **화면 전체가 사망**한다 — 트리는 `pages`를 전개하다,
 * 목록은 `.length`를 읽다, 셸은 `project.name`을 읽다, 캔버스는 `root.children`을 읽다
 * 렌더 도중 던지고, 그 예외를 잡는 오류 경계가 그 위에 없다.
 *
 * **얕게 본다.** 배열인가·객체인가·계약이 약속한 필드가 그 타입인가까지다. 문서 안쪽
 * (`schema.root`의 자식들)은 **일부러 보지 않는다** — 렌더러가 검증 실패 노드를 폴백으로
 * 그리고 `onNodeError`로 알리므로, 여기서 막으면 그릴 수 있는 문서를 못 그리게 된다.
 * 트리만 재귀로 내려가는데, `MenuItem`이 자식 메뉴를 같은 코드로 그려서 깊이와 상관없이
 * 같은 자리에서 죽기 때문이다.
 */
type Shape = (value: unknown) => boolean

/** 요청 하나에 얹는 선택 — 쓰기 · 읽기의 신호에 더해 이 파일 안에서만 쓰는 셋. */
type SendOptions = (WriteOptions | ReadOptions) & {
  readonly cache?: RequestCache
  /** `false`면 일반 읽기여도 시간 제한을 안 건다(`READ_DEADLINE_MS`의 «안 거는 읽기»). */
  readonly deadline?: false
  /** 복원의 id(`RESTORE_ID_HEADER`) — 받는 것은 `restoreSnapshot` 하나다. */
  readonly restoreId?: string
}

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
 * | `createProject` | `id`가 **주소가 된다**(만든 뒤 그리로 이동한다) | 201 성공 경로로 잘못된 주소가 만들어진다 |
 * | `updateProject` | (없음 — 성공 여부만 본다) | — |
 * | 넷 모두 | `role`은 **여기서 보지 않는다** | `projects/project-actions.ts`가 계약 밖 값을 닫는다 |
 *
 * > **왜 시점을 주석에 두지 않나.** 표에 *"아직 없다(호출부 0건)"* 열을 두고 *"다음
 * > 단계에서 갱신하라"*고 적어 두면, 그 시점이 지나가도 열은 안 고쳐진다. **"다음에
 * > 갱신하라"로는 닫히지 않는다** — 실행으로 재면 낡지 않는다(`test/api-consumers.test.ts`).
 *
 * **`createProject`가 이 검사를 그대로 지나는 것은 "모양이 같아서"가 아니다.** 그쪽 하중
 * `id`(주소)가 이 검사가 이미 보는 것의 **부분집합**이라서다 — 실측으로 네 응답의 키 집합이
 * `["description","id","name","role","slug"]`로 같다는 것도 함께 쟀다(`api/types.ts`의
 * `ProjectDetail` 표). 별도 shape를 두면 내용이 같은 둘이 생겨 한쪽만 고쳐지는 자리가 되고,
 * 더 약한 쪽이 같은 계약을 통과시키게 된다.
 *
 * **무엇을 막고 무엇을 통과시키는지는 "어겼을 때 화면이 통째로 비는가"로 가른다 — 재서 정했다.**
 * 검사 밖의 셋을 진짜 `<App />`에 태우면 갈린다:
 *
 * | 키 | 계약 밖 값이 닿는 곳 | 관측 | 판단 |
 * |---|---|---|---|
 * | `description` | 목록 줄의 `<p>` **자식** | `{}`·`{x:1}`·`[{x:1}]`·`[[{}]]`에서 **`<main>` 없음 · `innerHTML` 11자** | **막는다** |
 * | `slug` | 수정 폼의 `<input value>` | 폼이 열리고 화면이 산다(629자) | 둔다 |
 * | `role` | `projectAbilities`의 `!== 'owner'` 비교 | 버튼만 닫히고 화면이 산다(190자) | 둔다 |
 *
 * **죽는 것은 "React가 자식으로 그리지 못하는 객체가 닿을 때"다 — 부류를 재서 좁혔다.**
 * *"객체를 품었을 때"*로 적으면 틀린다 — **함수·Symbol·`Map`이 반례다.** 관문을 우회해
 * `<App />`까지 태우면 갈리는 축은 **이터러블인가**다:
 *
 * | 값 | 관측 |
 * |---|---|
 * | `{}` · `{x:1}` · `Date` · 정규식 · `Object.create(null)` — **이터러블이 아닌 객체** | **죽는다**(11자) |
 * | `[{x:1}]` · `new Set([{x:1}])` — 그런 객체를 **담은** 이터러블 | **죽는다**(11자) |
 * | `[1,2]` · `['a','b']` · `new Map([['a',1]])` · 제너레이터 · 빈 배열·`Map`·`Set` | 산다(277~279자) |
 * | **함수** · **Symbol** | 산다(277자) — React가 그리지 않고 지나간다 |
 * | `42` · `true` · `null` · 키 없음 · 문자열 | 산다 |
 *
 * **이터러블은 원소를 다시 같은 규칙으로 본다** — 그래서 배열이어도 안에 객체가 있으면 죽는다.
 *
 * 그래도 검사를 `문자열 | null`로 두는 것은 **계약이 그 둘뿐**이고, 통과시킬 이유가 있는 값이
 * 그 밖에 없기 때문이다.
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
/**
 * 페이지 하나. **`SHAPES.pageDetail`과 `SHAPES.pageImported`가 같이 쓴다** — 뒤엣것의
 * `page`가 서버의 같은 `toResponse`에서 나오므로, 검사를 베끼면 한쪽만 고쳐진다
 * (`isProjectDetail`이 목록·상세에 같이 쓰이는 것과 같은 자리).
 */
function isPageDetail(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['headSeq'] === 'number' &&
    isRecord(value['schema']) &&
    isRecord((value['schema'] as Record<string, unknown>)['root'])
  )
}

/** 멤버 한 줄. `userId` 는 역할 바꾸기 · 제외의 주소가 되므로 빈 문자열까지 막는다(`isMyApiToken` 의 `id` 와 같은 판단). */
function isProjectMember(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['userId'] === 'string' &&
    value['userId'] !== '' &&
    typeof value['email'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['role'] === 'string'
  )
}

function isMyApiToken(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['name'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    (typeof value['lastUsedAt'] === 'string' || value['lastUsedAt'] === null) &&
    typeof value['projectId'] === 'string' &&
    (typeof value['projectName'] === 'string' || value['projectName'] === null) &&
    typeof value['member'] === 'boolean'
  )
}

function isProjectDetail(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['name'] === 'string' &&
    // **`description`은 React 자식으로 그려진다** — 이터러블이 아닌 객체가 닿으면 목록이
    // 통째로 빈다(위 표).
    (typeof value['description'] === 'string' || value['description'] === null)
  )
}

/**
 * 내보내기 미리보기. **배열들과 `fileName`이 실제로 그 모양인지 본다.**
 *
 * 화면이 배열을 전부 전개하고 `fileName`을 `<a download>`에 그대로 건다 — 배열이 아니면
 * 그 자리에서 던지고 이 화면을 감싸는 오류 경계가 없다(`apps/web`의 경계는 캔버스 하나다).
 * 항목의 속 내용까지 보지 않는 것은 `restoreResult`가 같은 자리에서 한 판단과 같다:
 * 빠진 필드는 문장에 `undefined`가 보일 뿐이고, **전개가 던지는 것과 손해의 등급이 다르다.**
 *
 * **`format`으로 먼저 가른다.** 응답의 두 갈래는 **다른 배열들**을 들고(`api/types.ts`의
 * 판별 유니온) 화면은 `format`을 보고 어느 쪽을 그릴지 정한다. 그래서 여기서 `format`을
 * 안 보면 *"`format: 'pptx'`인데 `screenFailures`가 없는"* 응답이 통과하고, 화면은 그것을
 * pptx로 그리다 `undefined.map`에서 죽는다 — **모르는 `format`도 막는다**(그 값이 오면
 * 화면의 두 갈래 어느 쪽도 안 그려 상자가 조용히 빈다).
 */
function isExportPreview(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!Array.isArray(value['pages'])) return false
  if (typeof value['fileName'] !== 'string' || value['fileName'] === '') return false

  if (value['format'] === 'pptx') {
    // `fontWarning`은 배열이 아니라 **문장 하나**다 — 없으면 `null`이고 화면은 그때
    // 아무것도 안 그린다. 전개하는 값이 아니라서 여기서 보지 않는다(`snapshot`의
    // `createdAt`과 같은 판단: *"가설적인 경로에 가드를 달지 않는다"*).
    return Array.isArray(value['screenless']) && Array.isArray(value['screenFailures'])
  }

  if (value['format'] === 'html') {
    return (
      Array.isArray(value['duplicateTargets']) &&
      Array.isArray(value['brokenLinks']) &&
      Array.isArray(value['errors'])
    )
  }

  return false
}

const SHAPES = {
  /** 본문을 읽지 않는 요청. 204에서는 아래 조기 반환에 걸려 이 검사에 닿지 않는다. */
  noBody: () => true,
  /** 메뉴 연쇄 삭제의 답 — 화면은 안전망의 `tag`를 통지 글자로 읽는다(`tree/use-tree-commands.tsx`). */
  menuCascade: (value) =>
    isRecord(value) &&
    isRecord(value['deleted']) &&
    typeof value['deleted']['menus'] === 'number' &&
    typeof value['deleted']['pages'] === 'number' &&
    isRecord(value['safetySnapshot']) &&
    typeof value['safetySnapshot']['id'] === 'string' &&
    typeof value['safetySnapshot']['tag'] === 'string',
  /**
   * «내 토큰» 목록(`account/tokens-section.tsx`). **`id`는 폐기 주소가 되므로 빈 문자열까지 막는다**(아래 `pageDetail`의 «주소가 되는
   * 값»과 같은 판단). 나머지는 줄의 글자로 그려지는 값이라 모양만 본다 — 객체가 React 자식으로 닿으면 목록이 통째로 빈다.
   */
  myTokens: (value) => isArrayOf(value, isMyApiToken),
  revokedCount: (value) => isRecord(value) && typeof value['revoked'] === 'number',
  /** 설정 페이지의 멤버 절(`settings/members-section.tsx`) — 줄의 글자 · 역할 고르개의 값 · 주소(`userId`)를 읽는다. */
  members: (value) => isArrayOf(value, isProjectMember),
  member: isProjectMember,
  sessionUser: (value) => isRecord(value) && typeof value['id'] === 'string',
  projectDetail: isProjectDetail,
  projectList: (value) => isArrayOf(value, isProjectDetail),
  /** `{ menu }` 봉투. 서버가 이 엔드포인트에서만 쓴다(README "트리 응답 형태"). */
  treeEnvelope: (value) => isRecord(value) && isArrayOf(value['menu'], isTreeMenuNode),
  /**
   * 메뉴 노드 하나(`POST`·`PATCH .../menu`).
   *
   * **이 응답의 필드를 읽는 자리는 없다.** `createMenu`·`updateMenu`를 부르는 자리는
   * `tree/use-tree-commands.tsx`에 있고 전부 응답을 `await`만 하고 버린다(성공하면 트리를
   * 다시 받는다) — `MenuNode`를 값으로 읽는 자리가 없다. 결론(얕게 둔다)을 떠받치는 것은 이
   * 절이다.
   *
   * **부르는 자리의 수를 여기 적지 않는다** — 그 수는 호출부가 바뀌면 낡고, 세는 명령을 적으면
   * 그 명령이 이 주석을 함께 센다. 지금 값이 필요하면 `test/api-consumers.test.ts`를 보거나 그
   * 파일을 열어 세라.
   *
   * > **소스 텍스트를 세는 주석은 자기 자신을 센다.** `rg` 히트 수를 적으면, 그 수를 고치며 쓴
   * > 문장이 심볼을 인용해 수가 하나 는다. 세는 범위를 한 파일로 좁혀도 그 파일 안에 그 문장이
   * > 있으면 같은 일이 난다. **닫는 방법은 둘이다 — 수를 안 적거나, 주석을 걷고 실행으로 세는 것**
   * > (`.role`은 `test/role-access.test.ts`가 그렇게 한다). 여기는 그 수가 계약을 떠받치지 않으므로
   * > 앞쪽을 골랐다.
   *
   * > **"오늘 0건"류 문장은 시간이 지나면 저절로 거짓이 된다** — 무엇이 그것을 갱신하게 만드는지까지
   * > 적지 않으면 아무도 갱신하지 않는다. 그래서 호출부는 `test/api-consumers.test.ts`가 실행으로 센다.
   *
   * **이 응답의 `sortOrder`는 위/아래 이동의 목적지 계산에 들어가지 않는다** — 목적지는
   * `node.sortOrder`가 아니라 `byOrder` 정렬 뒤의 `index`다(`tree/tree-actions.ts`의 `treeSpot`
   * 주석).
   *
   * **읽는 자리가 없는데도 검사를 두는 이유는 둘이다.**
   *
   * 1. `request`가 shape를 **필수로** 받는다(이 표의 설계). 자리를 비울 수 없으니 무엇을
   *    볼지는 정해야 하고, `id`·`sortOrder`는 이 리소스의 계약이 약속한 값이다.
   * 2. **새 소비자가 붙을 때 이 표를 갱신하지 않는 일이 생긴다.** 바로 아래
   *    `pageDetail`이 그 자리다 — `getPage`가 읽는 하중만 적혀 있으면 `createPage`가 붙을 때
   *    `id`가 빠진 채로 지나간다. 검사가 아예 없는 것보다 얕게라도 있는 편이 그 순간의 손해가
   *    작다.
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
   * | `getPage` | `headSeq` | 편집이 어느 revision 위에서 만들어졌는지가 조용히 틀어진다 |
   * | `getPage` | `schema.root` | 캔버스가 `root.children`을 읽다 렌더 도중 던진다 |
   * | `createPage` | `id` | 만든 페이지로 이동하는 주소에 그대로 들어간다 |
   * | `updatePage` | (없음 — 성공 여부만 본다) | — |
   *
   * **`id`를 보는 것은 `createPage`의 몫이다.** `createPage`가 이 shape에 붙을 때 표를
   * 갱신하지 않으면 `id` 키 없음·`42`·`null`이 전부 통과한다. **모양이 같은 것과 읽는
   * 필드가 같은 것은 다르다** — 세 엔드포인트가 서버의 `toResponse` 하나로 같은 여덟 키를
   * 내는 것은 참이지만, 그것이 "같은 검사로 충분하다"를 뜻하지 않는다.
   *
   * **실측(가짜 `fetch`로 `createPage` 응답을 망가뜨려 만든 뒤 이동하는 주소 조립에 태웠다** —
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
   * `app.tsx`에 `*` 라우트가 없어 `<Routes>`가 아무것도 그리지 않는다 — **"다른 라우트가
   * 받는다"가 아니다**(그렇게 적으면 손해를 실제보다 가볍게 적는 셈이다). 빈 화면은 `tree/tree-actions.ts` 머리말이 피하려는 바로 그 사고와 같은
   * 결과다.
   *
   * **어느 id를 빈 문자열까지 막는지는 "그 값이 주소가 되는가"로 가른다.** 주소를 만드는
   * 자리는 여럿이고 **그 목록을 여기 적지 않는다** — 적은 목록은 호출부가 늘면 조용히 낡는다.
   * 아래 표는 이 shape의 값이 주소가 되는 자리이고, `pageImported`·`createProject`의
   * 주소는 각자의 주석이 적는다. 페이지를 **지운 뒤** `/projects/:projectId`로 가는
   * `tree/use-tree-commands.tsx`의 `navigate`가 넣는 값도 `projectDetail.id`다(`routes/editor.tsx`가
   * **조회해 온** id를 트리에 넘기고 그 훅이 그대로 쓴다).
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
   * **`treeEnvelope`도 주소가 된다.** 실측: `TreePage.id: ''`가 관문을 통과하면 `PageLink`가
   * `/projects/p1/pages/`를 만들고, 그 주소가 위 표의 빈 화면이 된다. **`projectDetail`·
   * `projectList`도 같다** — `id: ''`면 각각 `/projects/pages/pg1`·`/projects/`가 되고 둘 다
   * innerHTML 0자·`.wb-shell` 없음이다.
   *
   * **읽는 축이 둘이라는 것이 요점이다** — 그 값이 주소가 되는가(하중)와 그 경로가 지금
   * 도달하는가(시점). 얕음을 일괄로 맞추지 않고 **이 표의 위 넷만** 깊게 한다.
   *
   * **`projectList`는 손해의 모양이 다르다 — 항목 하나가 걸리면 목록 전체가 막힌다.**
   * `isArrayOf`가 `every`라 한 항목의 `id`가 빈 문자열이면 배열째 `ApiError`가 되고,
   * 사용자는 멀쩡한 다른 프로젝트도 열지 못한다. **그래도 그 손해가 옳다:** 통과시키면
   * 그 줄의 링크가 `/projects/`가 되고, 그 주소는 `app.tsx`의 어느 라우트도 잡지 않아
   * **화면이 통째로 빈다**(위 실측 표). 목록 전체가 막히는 것은 이유가 화면에 남고
   * 새로고침으로 복구되지만, 빈 화면은 사용자가 무엇이 잘못됐는지 알 수도 되돌릴 수도 없다.
   * **보이고 복구되는 실패가 조용한 빈 화면보다 낫다.**
   */
  pageDetail: isPageDetail,
  /**
   * 가져오기 응답(설계서 「페이지 JSON」). **`page`에 같은 검사를 다시 건다** — 그 값이 `pageDetail`과
   * 같은 여덟 키이고(서버의 `toResponse` 하나가 만든다) **주소가 되는 값**(`page.id`)이
   * 여기서도 그대로 주소로 들어간다: 가져오기가 성공하면 화면이 그 페이지로 옮긴다.
   * 그래서 검사를 얕게 두면 `/projects/p1/pages/`로 옮겨 **화면이 통째로 빈다**(위
   * `pageDetail`의 실측 표).
   *
   * **`comments`의 두 수도 본다.** 화면이 *"코멘트 N개는 가리키던 노드가 없습니다"*를
   * 그리는 재료이고, 숫자가 아니면 `undefined`가 문장에 실려 나간다 — 그 문장은 사용자가
   * **되돌릴 수 없는 상태**(고아 코멘트를 이미 만들었다)를 설명하는 유일한 자리다.
   *
   * **`ignoredLayoutRef`는 보지 않는다.** 없는 것이 정상이고(파일이 그 값을 안 들면 키가
   * 없다), 이상한 값이 오면 문장에 이상한 글자가 보일 뿐이다 — 손해의 등급이 다르다
   * (`restoreResult`가 같은 자리에서 같은 판단).
   */
  pageImported: (value) =>
    isRecord(value) &&
    isPageDetail(value['page']) &&
    isRecord(value['comments']) &&
    typeof (value['comments'] as Record<string, unknown>)['inserted'] === 'number' &&
    typeof (value['comments'] as Record<string, unknown>)['dangling'] === 'number',
  /**
   * 편집 응답. **`seq`가 다음 요청의 `baseSeq`이고 `inverse`가 undo가 되보낼 ops다** —
   * 둘 다 값이 그대로 큐와 undo 스택에 실리므로, 계약을 어긴 값이 지나가면 `baseSeq`가
   * 조용히 어긋나거나 undo가 배열이 아닌 것을 `ops`로 보내다 죽는다.
   *
   * **`inverse` 안쪽은 보지 않는다.** 그것은 서버가 만든 `PatchOp[]`이고 그 안까지
   * 보는 것은 `@wirebound/schema`의 일이다 — `schema.root` 안쪽을 보지 않는 것과 같은
   * 경계다.
   */
  /**
   * revision 목록. **각 항목의 `inverse`가 배열인지까지 본다** — 그 값이 그대로 undo
   * 스택에 실리고, 배열이 아니면 undo가 그것을 `ops`로 보내다 죽는다. `inverse` **안쪽**은
   * 보지 않는다(`patchResult`와 같은 경계).
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
    Array.isArray(value['inverse']) &&
    // **`warnings`는 없을 수 있고, 있으면 배열이어야 한다**. 서버는 경고가 없으면 키를 만들지 않으므로 `undefined`를 통과시켜야 하고,
    // 배열이 아닌 것을 통과시키면 셸 머리의 통지가 `.map`을 부르다 던진다 — 그 자리는
    // 오류 경계 **밖**이라 셸 전체가 흰 화면이 된다(`shell/edit-warnings.tsx`).
    (value['warnings'] === undefined || Array.isArray(value['warnings'])),
  /**
   * 코멘트 하나. 넷을 본다.
   *
   * | 값 | 그 값이 되는 것 | 어긋나면 |
   * |---|---|---|
   * | `id`(빈 문자열 금지) | 수정·삭제 요청의 **경로** | `.../comments/`가 되어 그 요청이 다른 라우트(재번호는 POST라 안 걸린다)를 지나거나 404가 된다 |
   * | `nodeId` | **문서에서 노드를 찾는 키** — 그 노드의 `marker`가 이 코멘트의 번호다 | 묶기가 통째로 어긋나 모든 코멘트가 "사라진 노드"로 떨어진다 |
   * | `body` · `authorName` | 화면에 그대로 그려진다 | `React`가 객체를 그리다 렌더 도중 던진다(이 패널은 오류 경계 밖이다) |
   *
   * **`createdAt`은 보지 않는다.** 화면이 그것을 문자열로만 다루고(그대로 그린다) 어긋나도
   * 던지지 않는다 — *"가설적인 경로에 가드를 달고 살아 있는 경로를 열어 두지 않는다"*.
   */
  comment: isComment,
  commentList: (value) => isArrayOf(value, isComment),
  /**
   * 코멘트를 만든 결과. `comment` 하나에 **문서 변화 둘**이 더 붙는다.
   *
   * **`seq`와 `markerOps`가 `patchResult.seq`·`inverse`와 같은 하중이다** — 전자는 다음
   * 요청의 `baseSeq`가 되고 후자는 그대로 `applyOps`에 들어간다. 배열이 아닌 것을 넘기면
   * 스토어가 그 자리에서 던진다.
   */
  commentCreated: (value) =>
    isRecord(value) &&
    isComment(value['comment']) &&
    // `null`은 멱등 키의 재생에서 온다 — 노드나 번호가 그 사이 사라졌다(`CommentCreated`).
    (typeof value['marker'] === 'number' || value['marker'] === null) &&
    isMarkerChange(value),
  /** 삭제·재번호의 결과. 문서 변화만 온다. */
  markerChange: isMarkerChange,
  /**
   * 스냅샷 하나. **읽는 자리가 무엇을 하는지로 무엇을 볼지 정한다** —
   * `test/api-consumers.test.ts`가 그 자리를 실행으로 센다.
   *
   * | 필드 | 화면이 무엇을 하는가 | 어긋나면 |
   * |---|---|---|
   * | `id` | **React 목록의 `key`** | 중복·`undefined`면 목록이 뒤섞이거나 경고가 난다 |
   * | `tag` · `createdByName` | 그대로 그려진다 | React가 객체를 그리다 렌더 도중 던진다 |
   * | `description` | 그대로 그려진다(`null`이면 자리를 비운다) | 〃 |
   * | `payloadBytes` | **숫자 포맷을 지난다**(`toLocaleString`) | 문자열이 오면 그 메서드가 없어 던진다 |
   *
   * **`createdAt`은 보지 않는다** — 화면이 문자열로만 다루고(`toLocaleString`이 아니라
   * 그대로 그린다) 어긋나도 던지지 않는다. `comment`가 같은 자리에서 같은 판단을 했다:
   * *"가설적인 경로에 가드를 달고 살아 있는 경로를 열어 두지 않는다."*
   *
   * **`payload`를 보지 않는 것도 같은 이유다** — 목록 응답에는 애초에 없고,
   * 생성 응답에는 있지만 **이 화면이 읽지 않는다**(복원은 서버가 스냅샷 id로 한다 — `restoreSnapshot`).
   */
  snapshot: isSnapshot,
  snapshotList: (value) => isArrayOf(value, isSnapshot),
  /**
   * 프리셋 하나. **읽는 자리가 무엇을 하는지로 무엇을 볼지 정한다** —
   * `test/api-consumers.test.ts`가 그 자리를 실행으로 센다.
   *
   * | 필드 | 화면이 무엇을 하는가 | 어긋나면 |
   * |---|---|---|
   * | `id`(빈 문자열 금지) | **`<option>`의 값이자 React 목록의 `key`** | 빈 값이면 고른 것을 되찾지 못해 목록이 첫 항목으로 되돌아간다 |
   * | `name` | 그대로 그려진다 | React가 객체를 그리다 렌더 도중 던진다(고르개는 오류 경계 밖이다) |
   * | `nodes` | **`presetApply`에 그대로 들어간다** | 배열이 아니면 그 함수가 `[...nodes]`에서 던진다 |
   *
   * **`description`·`source`는 보지 않는다.** 둘 다 그리기만 하고(`null`이면 자리를
   * 비운다) 어긋나도 던지지 않는다 — `snapshot`·`comment`가 `createdAt`에 대해 같은
   * 판단을 했다: *"가설적인 경로에 가드를 달고 살아 있는 경로를 열어 두지 않는다."*
   */
  preset: isPreset,
  presetList: (value) => isArrayOf(value, isPreset),
  restoreResult: isRestoreResult,
  exportPreview: isExportPreview,
  /**
   * `GET /api/projects/:projectId` — 목록 · 생성 · 갱신과 같은 칸에 **`themeRev`** 가 붙는다. 셸의 다시 읽기가 그 수로 테마를 따라잡을지
   * 가른다 — 수가 아니면 `>` 비교가 늘 거짓이 되어 놓친 저장을 영영 못 따라잡는다.
   */
  projectView: (value) => isProjectDetail(value) && typeof (value as Record<string, unknown>)['themeRev'] === 'number',
  /**
   * 프로젝트의 테마 바인딩. **`manifest.tokens.items` 까지 본다** — 토큰 편집기 · 캔버스가 그 레코드를 순회한다. `rev` 는 다음 저장의
   * `rev` 가 되고 프레임 견주기의 기준이라 수여야 한다.
   */
  projectTheme: isProjectThemeView,
  /** 확인 창의 수. 셋과 페이지 줄의 배열 — 화면이 그대로 전개한다. */
  themeImpact: (value) =>
    isRecord(value) &&
    isRecord(value['tokens']) &&
    ['kept', 'dropped', 'defaulted'].every((key) => typeof (value['tokens'] as Record<string, unknown>)[key] === 'number') &&
    Array.isArray(value['variants']),
  /** 테마 목록. **`themeId` · 판의 `version` 은 빈 문자열까지 막는다** — `<option>` 의 값이고 manifest · 파일 주소가 된다. */
  themePackageList: (value) => isArrayOf(value, isThemePackageSummary),
  /** manifest 전문 — 고른 판으로 토큰을 이을 때 `tokens.items` 를 순회한다. */
  themeManifest: isThemeManifest,
  /** 업로드 결과 — 화면이 «id@판 을 올렸습니다» 로 그린다. */
  themeUploaded: (value) => isRecord(value) && typeof value['themeId'] === 'string' && typeof value['version'] === 'string',
  /** 숨김 · 되살림의 결과 — 줄의 단추가 `hidden` 으로 갈린다. */
  themePackageVersion: isThemePackageVersion,
} satisfies Record<string, Shape>

function isThemeManifest(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    isRecord(value['tokens']) &&
    isRecord((value['tokens'] as Record<string, unknown>)['items'])
  )
}

function isProjectThemeView(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['rev'] === 'number' &&
    isRecord(value['tokens']) &&
    (typeof value['themeId'] === 'string' || value['themeId'] === null) &&
    (typeof value['version'] === 'string' || value['version'] === null) &&
    (value['manifest'] === null || isThemeManifest(value['manifest'])) &&
    (typeof value['latest'] === 'string' || value['latest'] === null)
  )
}

function isThemePackageVersion(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['themeId'] === 'string' &&
    typeof value['version'] === 'string' &&
    value['version'] !== '' &&
    typeof value['hidden'] === 'boolean'
  )
}

function isThemePackageSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['themeId'] === 'string' &&
    value['themeId'] !== '' &&
    isArrayOf(value['versions'], isThemePackageVersion)
  )
}

/**
 * 코멘트 하나의 모양. 목록·생성·수정 셋이 같은 것을 쓴다 — 서버의 `toResponse` 하나가
 * 셋을 다 만들기 때문이다(api README). **같은 모양이 곧 같은 하중은 아니지만**, 여기서
 * 보는 넷은 세 자리 모두가 읽는 값이다.
 */
function isComment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['nodeId'] === 'string' &&
    typeof value['body'] === 'string' &&
    typeof value['authorName'] === 'string'
  )
}

/**
 * 복원 결과의 모양.
 *
 * **여기서 보는 것이 화면이 실제로 읽는 값이다.** 그 밖(자원별 세부 수)은
 * 보지 않는다 — 이 표의 관례대로 **오늘 읽는 것의 상위집합**만 본다.
 *
 * | 읽는 값 | 그 값이 되는 것 | 어겼을 때 |
 * |---|---|---|
 * | `summary.pages.schemaChanged`·`schemaUnchanged` | 결과 알림의 **숫자** | `undefined`가 문장에 그대로 그려진다 |
 * | `safetySnapshot.tag` | 결과 알림의 *"되돌리려면 …"* 문장 | 같은 부류 |
 *
 * **`summary.pages`가 객체가 아니면 결과 알림을 그리다 통째로 죽는다** — 그 안의 수를 읽으려고
 * 먼저 풀어 헤친다. `pageDetail`의 `schema.root`가 같은 부류다(*"캔버스가 `root.children`을 읽다 렌더 도중 던진다"*).
 *
 * **`safetySnapshot.id`는 빈 문자열까지 막지 않는다** — 이 화면은 그 값을 주소에 넣지
 * 않는다(태그만 글자로 그린다). 주소가 되는 값만 빈 문자열을 막는 것이 이 표의 규칙이다.
 */
function isRestoreResult(value: unknown): boolean {
  if (!isRecord(value)) return false
  const summary = value['summary']
  if (!isRecord(summary)) return false
  const pages = summary['pages']
  if (!isRecord(pages) || typeof pages['schemaChanged'] !== 'number' || typeof pages['schemaUnchanged'] !== 'number') {
    return false
  }
  const safety = value['safetySnapshot']
  return isRecord(safety) && typeof safety['tag'] === 'string'
}

/** 스냅샷 하나의 모양. 목록·생성이 같은 것을 쓴다 — 서버의 `toSummaryResponse` 하나가 둘을 만든다. */
function isSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['tag'] === 'string' &&
    (typeof value['description'] === 'string' || value['description'] === null) &&
    typeof value['createdByName'] === 'string' &&
    typeof value['payloadBytes'] === 'number'
  )
}

/** 프리셋 하나의 모양. 목록·생성이 같은 것을 쓴다 — 서버의 응답 두 벌이 같은 키를 낸다. */
function isPreset(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'] !== '' &&
    typeof value['name'] === 'string' &&
    Array.isArray(value['nodes'])
  )
}

/** 문서 변화 둘. `seq`는 다음 `baseSeq`가 되고 `markerOps`는 `applyOps`에 들어간다. */
function isMarkerChange(value: unknown): boolean {
  return isRecord(value) && typeof value['seq'] === 'number' && Array.isArray(value['markerOps'])
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

  // 봉투 옆의 `current` — 테마 저장의 409 가 서버의 지금 값을 싣는다(`ApiError.current`).
  return new ApiError(response.status, code, message, readIssues(envelope), true, (body as { current?: unknown }).current)
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
 * **서버 실측**(다시 재는 법: api 를 띄우고 두 경로에 빈 본문 `{}` 을 `PATCH` 한다):
 *
 * ```
 * PATCH /menu/:id  {} → 400 {"code":"bad-request","message":"요청을 처리할 수 없습니다",
 *                            "issues":[{"path":"","message":"변경할 값이 없습니다"}]}
 * PATCH /pages/:id {} → 400 (코드·문장 같음)
 * ```
 *
 * **그러므로 보내지 않는다.** 눌러 봐야 실패할 버튼을 활성으로 두지 않는 것과
 * 같은 판단을 이 층에 적용한 것이다. `code`를 `bad-request`로 두는 것은 서버가 같은 본문에
 * 내는 코드와 맞추기 위해서다 — 계약 밖의 코드를 새로 만들지 않는다는 이 파일의 규칙과도 맞다.
 *
 * **도달 경로는 `test/api-consumers.test.ts`가 센다** — 이 여섯을 부르는 자리가 어디인지
 * 그 표에 있다. **수와 자리를 주석에 두지 않는다** — 호출부가 바뀌면 조용히 낡는다.
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
 * 되고, *"한 곳만 고치고 다른 곳을 놓치는"* 결함이 정확히 거기서 난다 — 일부 자리만 고치면
 * 규칙이 둘로 갈린다. `patchOps`도 규칙이 같으므로 삼항으로 키 목록을 따로 적지 않고 여기를 지난다.
 *
 * **과도 차단을 쟀다.** 정상 본문 **48조합**(`createMenu` 6 · `updateMenu` 17 · `createPage` 6 ·
 * `updatePage` 11 · `patchOps` 8)과 살아 있는 호출부가 쓰는 본문 모양 **열**에서, 나가는 바이트가
 * `definedOnly`만 지난 본문과 **하나도 다르지 않다.** **다만 "바이트가 늘 같다"는 아니다** —
 * 나가는 키 순서가 아래 `BODY_KEYS`의 순서로 정규화되므로 **호출자가 역순으로 적은 본문은
 * 바이트가 달라진다**(`{sortOrder, title}`을 넘기면 `definedOnly`만으로는
 * `{"sortOrder":…,"title":…}`, 여기를 지나면 `{"title":…,"sortOrder":…}`). JSON 객체의 키 순서는 뜻을
 * 바꾸지 않고 서버의 zod도 보지 않는다 — **`나가는 키 순서는 …` 케이스가 그 동작을 고정한다.**
 *
 * **구분력 — 변이를 걸어 잰다**(`pnpm vitest run --project web`, 변이마다 복구한다):
 *
 * | 변이 | 사망 |
 * |---|---|
 * | 이 함수가 `keys`를 무시하고 `definedOnly(body)`를 내게 한다 | **6** |
 * | 자리별로 이 함수를 지운다 — `createProject`·`createMenu`·`updateMenu`·`createPage`·`patchOps` | 각 **1** |
 * | 같은 변이 — `updateProject`·`updatePage` | 각 **2** |
 * | 안쪽 `definedOnly`를 항등으로 바꾼다(`undefined`인 키가 남는다) | **0** |
 *
 * **일곱 자리를 다 재서 적는다** — 빠진 자리는 표에서 무방비로 읽힌다.
 *
 * **키를 고르는 쪽은 자리마다 닫혔고, `undefined` 필터는 여전히 닫히지 않는다.** 뒤쪽이 0인
 * 원인은 `definedOnly` 머리말이 적은 것과 같다 — 나가는 본문의 유일한 관찰 지점이
 * `JSON.stringify`가 만든 문자열이고 그것이 값이 `undefined`인 키를 지워 준다.
 * **`patchOps`는 다른 여섯과 위험의 모양이 다르다** — 응답을 되보내는 것을 타입이 이미
 * 막는다(응답에 `baseSeq`·`ops`가 없다). 그래서 그 자리만 겨누는 케이스가 없으면 0 사망이다.
 * 규칙을 한 벌로 두는 이상 그 자리도 닫는 케이스가 있어야 한다(표의 `patchOps` 1 사망).
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
 * 때문이다. **그 코드는 심어서 읽은 것이다** — 기억으로 적으면 `TS2739`로 틀리기 쉽다.)
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
  updateMenu: { title: true, parentId: true, sortOrder: true, base: true } satisfies Record<
    keyof Parameters<ApiClient['updateMenu']>[2],
    true
  >,
  createPage: { menuNodeId: true, title: true } satisfies Record<
    keyof Parameters<ApiClient['createPage']>[1],
    true
  >,
  // **이 줄이 `description` 키를 막을 수 있는 두 자리 중 하나다**(다른 하나는
  // `ApiClient['updatePage']`의 시그니처) — 서버는 그 키를 받는다.
  //
  // **여기서 빠지면 무엇이 나는지는 본문의 모양에 따라 갈린다**(둘 다 이 줄에서 그 키를 지우고 쟀다):
  //
  // | 본문 | 관측 |
  // |---|---|
  // | `{description}` 하나 — 새 패널이 보내는 모양이다 | `declaredOnly`가 `{}`로 만들고 **`updateBody`가 `바꿀 내용이 없습니다`로 던진다. 요청이 아예 안 나간다** |
  // | 다른 선언된 키가 함께 — 예: 트리 훅의 `{title, menuNodeId, sortOrder}`에 얹는 경우 | 요청은 나가고 그 키만 조용히 빠진다 — **200이 오는데 값이 안 바뀐다** |
  // `base`는 고치기 전 값이다(`api/page-meta.ts`).
  updatePage: { title: true, description: true, menuNodeId: true, sortOrder: true, base: true } satisfies Record<
    keyof Parameters<ApiClient['updatePage']>[2],
    true
  >,
  patchOps: { baseSeq: true, ops: true, clientOpId: true } satisfies Record<
    keyof Parameters<ApiClient['patchOps']>[2],
    true
  >,
  // 페이지 가져오기. 서버의 `ImportPageBody`가 `z.strictObject`라 선언되지 않은 키는
  // 그 자체로 400이다. **`title`이 없으면 키를 만들지 않는 것이 요점이다** — `undefined`를
  // 실은 키는 `JSON.stringify`가 지워 주지만 그 우연에 기대지 않는다(`patchOps`와 같은 자리).
  // **`file` 안쪽은 걸러지지 않는다** — 그것은 봉투 하나이고, 그 안의 초과 키를 거부하는
  // 것은 `parsePageJson`(양쪽이 같이 쓰는 함수)의 일이다.
  importPage: { menuNodeId: true, file: true, title: true } satisfies Record<
    keyof Parameters<ApiClient['importPage']>[1],
    true
  >,
  // 코멘트 쓰기 둘. 서버의 본문 스키마가 `z.strictObject`라 선언되지 않은 키는
  // 그 자체로 400이고, **`marker`가 그 자리다** — 번호를 정하는 것은 서버이므로
  // 코멘트 응답(`{ id, nodeId, body, authorId, authorName, … }`)을 그대로 되보내면
  // `id`·`authorId` 따위가 400을 부른다.
  createComment: { nodeId: true, body: true, idempotencyKey: true } satisfies Record<
    keyof Parameters<ApiClient['createComment']>[2],
    true
  >,
  updateComment: { body: true } satisfies Record<keyof Parameters<ApiClient['updateComment']>[3], true>,
  // 스냅샷 생성. 서버의 `SnapshotBody`가 `z.strictObject`라 선언되지 않은 키는 그
  // 자체로 400이고, **`payload`가 그 자리다** — 생성 응답에 그 키가 실려 오므로 응답 객체를
  // 그대로 되보내는 실수가 실제로 있을 법하다.
  createSnapshot: { tag: true, description: true } satisfies Record<
    keyof Parameters<ApiClient['createSnapshot']>[1],
    true
  >,
  // 프리셋 저장. 서버의 `PresetBody`가 `z.strictObject`라 선언되지 않은 키는 그
  // 자체로 400이고, **`id`·`source`·`nodes`가 그 자리다** — 목록 항목을 그대로 되보내는
  // 실수가 실제로 있을 법하다(`createSnapshot`이 같은 자리에서 같은 판단).
  createPreset: { name: true, description: true, schema: true } satisfies Record<
    keyof Parameters<ApiClient['createPreset']>[1],
    true
  >,
  // 테마 저장. 서버의 `ThemeBody` 가 `z.strictObject` 라 선언되지 않은 키는 그 자체로 400 이고, **`manifest` · `latest` 가 그 자리다** —
  // GET 응답(`ProjectThemeView`)을 고쳐 되보내는 실수가 실제로 있을 법하다.
  putProjectTheme: { themeId: true, version: true, tokens: true, rev: true } satisfies Record<
    keyof Parameters<ApiClient['putProjectTheme']>[1],
    true
  >,
}

/**
 * 편집을 낸 클라이언트가 자기 WebSocket 연결을 가리키는 헤더.
 *
 * **서버가 이 연결을 브로드캐스트에서 뺀다** — 설계서 「정방향 흐름」의 *"[본인] ack / [타인] ops"*다.
 * REST로 나가는 요청은 서버가 그것이 어느 연결의 주인이 낸 것인지 달리 알
 * 방법이 없다. **안 실어도 동작한다**: 그때는 자기 편집이 한 번 더 돌아오고, 그 프레임이
 * HTTP 응답보다 먼저 도착하면 화면이 낡았다고 잘못 말한다.
 *
 * 이름은 `apps/api/src/ws/notify.ts`의 `CONNECTION_ID_HEADER`와 같아야 한다.
 */
const CONNECTION_ID_HEADER = 'x-wb-connection-id'

/** 복원 요청이 싣는 그 복원의 id(`RestoreOptions`). 이름은 `apps/api/src/ws/notify.ts`의 `RESTORE_ID_HEADER`와 같아야 한다. */
const RESTORE_ID_HEADER = 'x-wb-restore-id'

/**
 * `ApiClient`의 HTTP 구현을 만든다.
 *
 * @param fetchImpl 테스트가 가짜를 주입하는 자리. 기본값은 브라우저의 `fetch`다.
 * @param connectionId 지금 붙어 있는 WebSocket 연결의 id를 읽는 함수. 기본은 *"없다"*이고,
 *   그때는 헤더가 아예 붙지 않는다(위 상수 주석).
 * @param knownUser **이 탭이 아는 사용자**(`api/known-user.tsx`). 있으면 요청마다 그 id 를 머리에 싣고
 *   (`KNOWN_USER_HEADER`), 서버가 «쿠키의 사람이 다르다»(409 `session-user-changed`)로 답하면 `changed()`를 부른다 —
 *   **알아채는 자리는 여기 하나다**(어느 화면의 요청이든). 없으면 싣지도 듣지도 않는다.
 */
export function createHttpClient(
  fetchImpl: typeof fetch = globalThis.fetch,
  connectionId: () => string | undefined = () => undefined,
  knownUser: Pick<KnownUserHolder, 'get' | 'changed'> | null = null,
): ApiClient {
  /**
   * 일반 읽기를 **시간 제한 안에서** 보낸다 — 넘으면 끊고 한 번 더, 그래도 넘으면 «서버가 응답하지 않습니다»다
   * (`READ_DEADLINE_MS`의 머리말). 시간 안에 온 연결 실패는 다시 보내지 않는다 — 시간 제한 없는 요청과 같은 `UNREACHABLE`이다.
   *
   * `cancel`이 끊기면 그 시도를 끊고 **다시 보내지 않는다**(`ABANDONED` — 머리말 «떠난 조회는 끊는다»). 다시 보낼지는
   * 시도의 머리 한 자리가 가른다 — 끊긴 시도는 연결 실패도 시간 초과도 아니게 그 자리로 돌아온다. **머리가 온 뒤에도
   * 끊는 줄을 남긴다** — 연결을 쥐는 것은 본문을 내려받는 동안이다(1MB 페이지는 머리 0.5s · 본문 25s). 시간 제한은
   * 머리에서 치운다(머리말 «응답 머리까지만 잰다»). 본문을 읽다 끊기면 거절은 `UNREADABLE`로 나간다 — 부른 쪽이
   * 버리므로 문장은 가르지 않는다.
   */
  async function fetchInTime(url: string, init: RequestInit, cancel: AbortSignal | undefined): Promise<Response> {
    // 함수로 읽는다 — `await` 너머에서 바뀌는 값이라 한 번 본 값으로 좁히면 안 된다.
    const gone = (): boolean => cancel?.aborted === true
    for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt += 1) {
      if (gone()) throw new ApiError(NO_RESPONSE, 'internal', ABANDONED)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), READ_DEADLINE_MS)
      const leave = (): void => controller.abort()
      cancel?.addEventListener('abort', leave, { once: true })
      try {
        return await fetchImpl(url, { ...init, signal: controller.signal })
      } catch {
        cancel?.removeEventListener('abort', leave)
        if (!controller.signal.aborted) throw new ApiError(NO_RESPONSE, 'internal', UNREACHABLE)
      } finally {
        clearTimeout(timer)
      }
    }
    throw new ApiError(NO_RESPONSE, 'internal', READ_TIMEOUT)
  }

  /**
   * **보내고 실패를 `ApiError`로 옮기기까지** — 머리 · 쿠키 · 시간 제한 · 끊기 · 사람 바뀜을 여기 한 자리가 한다. 본문을 읽는
   * 것은 부른 쪽이다(`request`는 JSON, `downloadExport`는 바이트).
   */
  async function send(
    method: string,
    path: string,
    body?: unknown,
    options?: SendOptions,
  ): Promise<Response> {
    return transmit(method, path, body === undefined ? undefined : { body: JSON.stringify(body), type: 'application/json' }, options)
  }

  /**
   * **JSON 이 아닌 본문을 보낸다** — 테마 업로드가 zip 바이트를 그대로 싣는다(spec 「업로드 검증」). `send` 는 본문을 늘 JSON 으로
   * 굳히므로 그 길을 안 넓히고 따로 둔다 — 머리 · 쿠키 · 실패 번역은 같은 `transmit` 를 지난다.
   */
  async function sendBody(method: string, path: string, body: Blob, contentType: string): Promise<Response> {
    return transmit(method, path, { body, type: contentType })
  }

  async function transmit(
    method: string,
    path: string,
    payload: { readonly body: BodyInit; readonly type: string } | undefined,
    options?: SendOptions,
  ): Promise<Response> {
    // **없으면 키를 만들지 않는다.** `undefined`를 실은 헤더가 통과하는 것은 우연이고,
    // 빈 문자열은 서버가 *"연결 id를 줬다"*로 읽는다(`broadcastOrigin`이 길이를 본다).
    // **쓰기가 낸 연결을 주면 그것이다**(`WriteOptions.connectionId`) — 없으면 지금 연결이다.
    const origin = options !== undefined && 'connectionId' in options ? options.connectionId : undefined
    const connection = origin ?? connectionId()
    // **이 탭이 아는 사용자** — 모르면 키를 만들지 않는다(위 `connection`과 같은 이유). 보내는 순간의 값이다.
    const known = knownUser?.get()
    const headers: Record<string, string> = {
      ...(payload === undefined ? {} : { 'content-type': payload.type }),
      ...(connection === undefined ? {} : { [CONNECTION_ID_HEADER]: connection }),
      ...(known === undefined ? {} : { [KNOWN_USER_HEADER]: known }),
      ...(options?.restoreId === undefined ? {} : { [RESTORE_ID_HEADER]: options.restoreId }),
    }

    const init: RequestInit = {
      method,
      // 인증은 세션 쿠키(`wb_session`, httpOnly)로 한다 — 이 옵션이 없으면 쿠키가
      // 실리지 않아 모든 요청이 401이 된다. jsdom에서는 지워도 아무것도 깨지지
      // 않으므로 테스트가 이 `init` 객체를 직접 단언한다.
      credentials: 'same-origin',
      // **헤더가 하나도 없으면 키를 만들지 않는다** — 기존 케이스가 `init` 객체를 그대로
      // 단언하므로(위 `credentials` 주석), 빈 `headers`를 늘 붙이면 그것들이 죽는다.
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
      ...(payload === undefined ? {} : { body: payload.body }),
      // **끊을 신호도 받았을 때만 키를 만든다** — 위 `headers`와 같은 이유다. 끊기면 `fetch`가
      // 거절하고 아래 `catch`가 연결 실패로 옮긴다. **끊은 쪽은 그것이 자기 신호인 줄 안다**
      // (`panels/write-ledger.tsx`) — 여기서 따로 가르지 않는다.
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      // **캐시 모드도 받았을 때만 키를 만든다** — 위 두 키와 같은 이유다. 받는 것은 `getPage` 하나다(그 주석).
      ...(options?.cache === undefined ? {} : { cache: options.cache }),
    }

    // `fetch`는 응답을 받지 못하면(네트워크 단절·DNS 실패·CORS 차단) 실패 응답이
    // 아니라 raw `TypeError`로 reject한다. **그것은 `ApiError`가 아니다.** 호출자는
    // `err instanceof ApiError`로 분기하므로, 번역하지 않으면 그 분기가 통째로 빗나가
    // 네트워크 오류만 다른 부류로 새어 나간다. `fetch`를 부르는 곳이 여기 하나이므로
    // 번역할 자리도 여기 하나다.
    // **일반 읽기에는 시간 제한을 건다**(`READ_DEADLINE_MS`) — 받은 신호가 있으면 부른 쪽이 시간을 잰다.
    const timed = method === 'GET' && options?.signal === undefined && options?.deadline !== false
    let response: Response
    const cancel = options !== undefined && 'cancel' in options ? options.cancel : undefined
    if (timed) {
      response = await fetchInTime(`${API_PREFIX}${path}`, init, cancel)
    } else {
      try {
        // 시간 제한이 없는 읽기(PPTX 미리보기)도 떠나면 끊는다 — 끊을 신호가 곧 `fetch`의 신호다.
        response = await fetchImpl(`${API_PREFIX}${path}`, cancel === undefined ? init : { ...init, signal: cancel })
      } catch {
        if (cancel?.aborted === true) throw new ApiError(NO_RESPONSE, 'internal', ABANDONED)
        // `code`는 `internal`이다 — 서버 에러 코드 집합(README "에러 형식")에 "연결 실패"가
        // 없고, 화면이 `switch`로 가르는 값이라 계약 밖의 코드를 새로 만들지 않는다.
        throw new ApiError(NO_RESPONSE, 'internal', UNREACHABLE)
      }
    }

    if (!response.ok) {
      const error = await toApiError(response)
      // **쿠키의 사람이 이 탭이 아는 사람과 다르다** — 세션이 쿠키의 사람을 다시 알아낸다. 실패는 그대로 던진다 —
      // 부른 화면은 제 실패 자리에 서버 문장(«다른 사람으로 로그인됐습니다 …»)을 그린다.
      if (isSessionUserChanged(error)) knownUser?.changed()
      throw error
    }
    return response
  }

  async function request<T>(
    method: string,
    path: string,
    shape: Shape,
    body?: unknown,
    options?: SendOptions,
  ): Promise<T> {
    return shaped<T>(await send(method, path, body, options), shape)
  }

  /** 받은 응답의 본문을 읽고 모양을 본다 — `request` 와 JSON 아닌 본문을 보낸 요청(`sendBody`)이 같이 쓴다. */
  async function shaped<T>(response: Response, shape: Shape): Promise<T> {
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

  const commentsPath = (projectId: string, pageId: string): string =>
    `${pagePath(projectId, pageId)}/comments`

  const packagePath = (ref: ThemeRef): string =>
    `/theme-packages/${encodeURIComponent(ref.themeId)}/${encodeURIComponent(ref.version)}`

  return {
    login: (email, password) =>
      request<SessionUser>('POST', '/auth/login', SHAPES.sessionUser, { email, password }),
    logout: () => request<void>('POST', '/auth/logout', SHAPES.noBody),
    me: (options) => request<SessionUser>('GET', '/auth/me', SHAPES.sessionUser, undefined, options),
    listProjects: () => request<ProjectDetail[]>('GET', '/projects', SHAPES.projectList),
    listMyTokens: () => request<MyApiToken[]>('GET', '/auth/tokens', SHAPES.myTokens),
    revokeMyToken: (tokenId) => request<void>('DELETE', `/auth/tokens/${encodeURIComponent(tokenId)}`, SHAPES.noBody),
    revokeAllMyTokens: () => request<{ revoked: number }>('DELETE', '/auth/tokens', SHAPES.revokedCount),
    changePassword: (currentPassword, newPassword) =>
      request<void>('POST', '/auth/password', SHAPES.noBody, { currentPassword, newPassword }),
    listMembers: (projectId, options) =>
      request<ProjectMember[]>('GET', `${projectPath(projectId)}/members`, SHAPES.members, undefined, options),
    addMember: (projectId, email, role) =>
      request<ProjectMember>('POST', `${projectPath(projectId)}/members`, SHAPES.member, { email, role }),
    updateMemberRole: (projectId, userId, role) =>
      request<ProjectMember>('PATCH', `${projectPath(projectId)}/members/${encodeURIComponent(userId)}`, SHAPES.member, { role }),
    removeMember: (projectId, userId) =>
      request<void>('DELETE', `${projectPath(projectId)}/members/${encodeURIComponent(userId)}`, SHAPES.noBody),
    getProject: (projectId, options) =>
      request<ProjectView>('GET', projectPath(projectId), SHAPES.projectView, undefined, options),
    // 아래 셋이 프로젝트 CRUD다. **생성 응답은 `ProjectDetail`이다** — `role`까지
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
    // 담긴 갱신 본문" 케이스가 하나씩 있다 — 뒤집으면 각 1 사망이다). 순서를 적어 두기만 하고
    // 케이스가 없으면 뒤집어도 아무것도 안 죽는다.
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
    // `body.menu`를 곧장 읽어도 던지지 않는다 — 검사 없이 읽으면 본문이 `null`일 때 raw
    // `TypeError`가 나고, 그것은 `ApiError`가 아니라 호출자의 분기를 빗나간다.
    getTree: async (projectId, options) => {
      const body = await request<{ menu: TreeMenuNode[] }>(
        'GET',
        `${projectPath(projectId)}/tree`,
        SHAPES.treeEnvelope,
        undefined,
        options,
      )
      return body.menu
    },
    // 아래 여섯이 트리의 CRUD다. **생성·갱신 응답을 트리에 꽂지 않는다** — `MenuNode`에는
    // `pages`·`children`이 없고(`api/types.ts`), 서버가 `sort_order`를 재번호하므로
    // 부르는 쪽은 성공하면 `getTree`를 다시 부른다. 그래서 여기서 응답을 가공하지 않는다.
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
    updateMenu: async (projectId, nodeId, body, options) =>
      request<MenuNode>(
        'PATCH',
        menuPath(projectId, nodeId),
        SHAPES.menuNode,
        updateBody(declaredOnly(body, BODY_KEYS.updateMenu)),
        options,
      ),
    deleteMenu: (projectId, nodeId) =>
      request<void>('DELETE', menuPath(projectId, nodeId), SHAPES.noBody),
    deleteMenuCascade: (projectId, nodeId, seen) =>
      request<MenuCascadeResult>('DELETE', menuPath(projectId, nodeId), SHAPES.menuCascade, {
        cascade: true,
        expect: { menuIds: [...seen.menuIds], pageIds: [...seen.pageIds] },
      }),
    createPage: (projectId, body) =>
      // 응답은 `GET .../pages/:pageId`와 같은 여덟 키다 — 서버의 `toResponse` 하나가
      // 조회·생성·갱신 셋을 다 만든다(`apps/api/src/routes/pages.ts`). **그래서 같은 shape를
      // 쓰지만, 같은 모양이 곧 같은 하중은 아니다** — 이 자리가 새 필드(`id`)를 읽으므로
      // `SHAPES.pageDetail`의 표에 그 줄이 있다 — 그 구별을 놓치면 `id`가 검사 없이 주소로 간다.
      request<PageDetail>(
        'POST',
        `${projectPath(projectId)}/pages`,
        SHAPES.pageDetail,
        declaredOnly(body, BODY_KEYS.createPage),
      ),
    // `updateMenu`와 같은 이유로 `async`다.
    updatePage: async (projectId, pageId, body, options) =>
      request<PageDetail>(
        'PATCH',
        pagePath(projectId, pageId),
        SHAPES.pageDetail,
        updateBody(declaredOnly(body, BODY_KEYS.updatePage)),
        options,
      ),
    deletePage: (projectId, pageId) =>
      request<void>('DELETE', pagePath(projectId, pageId), SHAPES.noBody),
    // `updateMenu`와 같은 이유로 `async`다.
    importPage: async (projectId, body) =>
      request<PageImported>(
        'POST',
        `${projectPath(projectId)}/pages/import`,
        SHAPES.pageImported,
        declaredOnly(body, BODY_KEYS.importPage),
      ),
    // **HTTP 캐시를 안 지난다**(`no-store`). 설명 저장(`PATCH`)과 **같은 URL** 이라, 저장이 서버에 매달린
    // 동안 이 GET 이 Chrome 의 HTTP 캐시 잠금에 선다 — 같은 브라우저의 **모든 탭**에서 그 페이지(캔버스의
    // 문서 · 설명)가 안 열린다. 잰 값(Chrome · 캐시 켬 · 서버 안 지연 · 그 URL 을 먼저 한 번 읽어
    // 둔 판): 기본 모드 GET **20016ms**(PATCH 60초 매달림 — 잠금의 상한이 약 20초다) · `no-store` **10ms**.
    // 앱에서는(서버 안 지연 12초) 기본 모드면 옆 탭의 설명 상자가 **9.8s** 뒤에 뜨고(쓰기의 10초 시간 제한이
    // PATCH 를 끊을 때까지) `no-store` 면 **0.0s**. 같은 탭 가 → 나 → 가도 기본 모드면 페이지 전체가 10초
    // «페이지를 불러오는 중…»이고 `no-store` 면 1.5s 에 꺼진 상자가 선다. 쓰기에 시간 제한이 없어도
    // 무한이 아니라 GET 하나에 약 20초다(위 값). 이 응답에는 캐시 헤더가 없어 기본 모드도 매번 서버에 묻는다 —
    // 잃는 것이 없다. **다른 읽기에는 안 준다**: 코멘트 목록
    // (`GET …/comments`)은 게시(`POST`)와 같은 URL 이지만 `POST`는 잠금을 안 건다(같은 절차 12ms).
    getPage: (projectId, pageId, options) =>
      request<PageDetail>('GET', pagePath(projectId, pageId), SHAPES.pageDetail, undefined, {
        ...options,
        cache: 'no-store',
      }),
    patchOps: (projectId, pageId, body) =>
      request<PatchResult>(
        'PATCH',
        `${pagePath(projectId, pageId)}/ops`,
        SHAPES.patchResult,
        // `clientOpId`가 없으면 **키를 만들지 않는다.** `undefined`를 실은 키는
        // `JSON.stringify`가 지워 주므로 오늘은 통과하지만 그 우연에 기대지 않는다.
        //
        // **삼항으로 키 목록을 따로 적지 않고 `declaredOnly`를 지난다** — 목록이 `ApiClient`와
        // 컴파일러로 이어지고, **나가는 바이트는 삼항으로 적은 것과 같다**(선택 키 유무 두 갈래 전부).
        declaredOnly(body, BODY_KEYS.patchOps),
      ),
    // 코멘트 다섯. **경로가 전부 `.../pages/:pageId/comments` 아래다** — 코멘트는
    // 프로젝트가 아니라 **페이지의 노드**에 붙는다(노드 id는 그 문서 안에서만 뜻이 있다).
    listComments: (projectId, pageId, options) =>
      request<Comment[]>('GET', commentsPath(projectId, pageId), SHAPES.commentList, undefined, options),
    createComment: (projectId, pageId, body, options) =>
      request<CommentCreated>(
        'POST',
        commentsPath(projectId, pageId),
        SHAPES.commentCreated,
        declaredOnly(body, BODY_KEYS.createComment),
        options,
      ),
    // **`updateBody`를 안 지난다.** 키가 `body` 하나뿐이라 *"바꿀 값이 하나도 없는 갱신"*이
    // 성립하지 않는다 — 그 키가 없는 것은 본문이 없는 것이고 서버가 봉투 위반 400을 낸다.
    updateComment: (projectId, pageId, commentId, body, options) =>
      request<Comment>(
        'PATCH',
        `${commentsPath(projectId, pageId)}/${encodeURIComponent(commentId)}`,
        SHAPES.comment,
        declaredOnly(body, BODY_KEYS.updateComment),
        options,
      ),
    // **`SHAPES.noBody`가 아니다** — 204가 아니라 200에 문서 변화가 실려 온다(서버 README).
    deleteComment: (projectId, pageId, commentId, options) =>
      request<MarkerChange>(
        'DELETE',
        `${commentsPath(projectId, pageId)}/${encodeURIComponent(commentId)}`,
        SHAPES.markerChange,
        undefined,
        options,
      ),
    // **`:commentId` 자리와 겹치지 않는다** — 그쪽에 오는 메서드는 `PATCH`·`DELETE`뿐이라
    // 같은 메서드로 두 패턴이 맞붙는 자리가 없다(서버가 정적 세그먼트를 먼저 잡기도 한다).
    renumberComments: (projectId, pageId, options) =>
      request<MarkerChange>(
        'POST',
        `${commentsPath(projectId, pageId)}/renumber`,
        SHAPES.markerChange,
        undefined,
        options,
      ),
    listPresets: (projectId, options) =>
      request<Preset[]>('GET', `${projectPath(projectId)}/presets`, SHAPES.presetList, undefined, options),
    createPreset: (projectId, body) =>
      request<Preset>(
        'POST',
        `${projectPath(projectId)}/presets`,
        SHAPES.preset,
        declaredOnly(body, BODY_KEYS.createPreset),
      ),
    listSnapshots: (projectId) =>
      request<SnapshotSummary[]>('GET', `${projectPath(projectId)}/snapshots`, SHAPES.snapshotList),
    // **응답이 더 넓다(`payload`가 붙는다).** `SHAPES.snapshot`은 그것을 보지 않고 통과시킨다 —
    // 이 화면이 payload를 읽지 않기 때문이다(`api/client.ts`의 `createSnapshot` 주석).
    createSnapshot: (projectId, body) =>
      request<SnapshotSummary>(
        'POST',
        `${projectPath(projectId)}/snapshots`,
        SHAPES.snapshot,
        declaredOnly(body, BODY_KEYS.createSnapshot),
      ),
    // **본문이 없다** — 되돌릴 대상은 주소가 다 말하고 안전망 태그는 서버가 짓는다.
    // 그래서 `declaredOnly`도 `BODY_KEYS`도 없다(`deleteProject` 같은 부류다).
    restoreSnapshot: (projectId, snapshotId, options) =>
      request<RestoreResult>(
        'POST',
        `${projectPath(projectId)}/snapshots/${snapshotId}/restore`,
        SHAPES.restoreResult,
        undefined,
        options?.clientRestoreId === undefined ? undefined : { restoreId: options.clientRestoreId },
      ),
    // **시간 제한을 안 건다** — PPTX 는 서버가 페이지를 한 장씩 그린다(`READ_DEADLINE_MS`의 «안 거는 읽기»).
    getExportPreview: (projectId, format, options) =>
      request<ExportPreview>(
        'GET',
        `${projectPath(projectId)}/export/preview?format=${format}`,
        SHAPES.exportPreview,
        undefined,
        { ...(options?.cancel === undefined ? {} : { cancel: options.cancel }), deadline: false },
      ),
    // **`html`에도 `?format=`을 붙인다.** 서버의 기본값이 `html`이라 생략해도 같은 것을
    // 받지만(`routes/export.ts`), 생략하는 가지를 두면 *"형식을 붙이는 길"*과 *"안 붙이는
    // 길"* 둘이 생기고 어느 쪽이 도는지는 주소를 눈으로 봐야 안다. 붙는 값은 `ExportFormat`
    // 이라 인코딩이 필요한 글자가 애초에 못 들어간다.
    //
    // **시간 제한을 안 건다** — 미리보기와 같은 이유다(pptx 는 페이지를 그린다). **받은 것의 형식을 본다** — 개발 중 프록시가
    // 빠지면 Vite 가 `/api/*`에 `index.html`을 200 으로 내고, 그것을 파일로 저장하면 사람은 열어 봐야 안다(`request`가 JSON 이
    // 아닌 200 을 막는 것과 같은 자리다).
    downloadExport: async (projectId, format, options) => {
      const response = await send('GET', `${projectPath(projectId)}/export?format=${format}`, undefined, {
        ...(options?.cancel === undefined ? {} : { cancel: options.cancel }),
        deadline: false,
      })
      // **소문자로 견준다** — MIME 의 타입 이름은 대소문자를 안 가린다(RFC 9110 「Media Type」). 앞단이 바꿔 실어도 받는다.
      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      if (!EXPORT_FILE_TYPES.some((expected) => type.startsWith(expected))) {
        throw new ApiError(response.status, 'internal', UNREADABLE)
      }
      try {
        return await response.blob()
      } catch {
        if (options?.cancel?.aborted === true) throw new ApiError(NO_RESPONSE, 'internal', ABANDONED)
        throw new ApiError(response.status, 'internal', UNREADABLE)
      }
    },
    listMyRevisions: (projectId, pageId, options) =>
      request<RevisionInverse[]>(
        'GET',
        // `mine=true`와 `fields=inverse`(`ops`를 안 싣는다 — `RevisionInverse`)뿐이다. 선언하지 않은 쿼리 키는 400이므로(README) 캐시 버스터도
        // 붙일 수 없고, `limit`은 기본값 50이 설계서 「개인 undo/redo」의 "최근 50개"와 같아 생략한다.
        `${pagePath(projectId, pageId)}/revisions?mine=true&fields=inverse`,
        SHAPES.revisionList,
        undefined,
        options,
      ),
    listRevisionsBefore: (projectId, pageId, range, options) =>
      request<RevisionInverse[]>(
        'GET',
        `${pagePath(projectId, pageId)}/revisions?beforeSeq=${range.beforeSeq}&limit=${range.limit}&fields=inverse`,
        SHAPES.revisionList,
        undefined,
        options,
      ),
    getProjectTheme: (projectId, options) =>
      request<ProjectThemeView>('GET', `${projectPath(projectId)}/theme`, SHAPES.projectTheme, undefined, options),
    putProjectTheme: (projectId, body) =>
      request<ProjectThemeView>(
        'PUT',
        `${projectPath(projectId)}/theme`,
        SHAPES.projectTheme,
        declaredOnly(body, BODY_KEYS.putProjectTheme),
      ),
    getThemeImpact: (projectId, ref, options) =>
      request<ThemeImpact>(
        'GET',
        `${projectPath(projectId)}/theme/impact?themeId=${encodeURIComponent(ref.themeId)}&version=${encodeURIComponent(ref.version)}`,
        SHAPES.themeImpact,
        undefined,
        options,
      ),
    listThemePackages: (options) =>
      request<ThemePackageSummary[]>('GET', '/theme-packages', SHAPES.themePackageList, undefined, options),
    getThemeManifest: (ref, options) =>
      request<ThemeManifest>('GET', `${packagePath(ref)}/manifest`, SHAPES.themeManifest, undefined, options),
    uploadThemePackage: async (file) =>
      shaped<ThemePackageUploaded>(await sendBody('POST', '/admin/theme-packages', file, THEME_PACKAGE_TYPE), SHAPES.themeUploaded),
    setThemePackageHidden: (ref, hidden) =>
      request<ThemePackageVersion>(
        'PATCH',
        `/admin/theme-packages/${encodeURIComponent(ref.themeId)}/${encodeURIComponent(ref.version)}`,
        SHAPES.themePackageVersion,
        { hidden },
      ),
    // `downloadExport` 와 같은 꼴 — 시간 제한을 안 걸고 받은 것의 형식을 본다(개발 프록시가 빠지면 `index.html` 이 200 으로 온다).
    downloadThemeTemplate: async (options) => {
      const response = await send('GET', '/admin/theme-template.zip', undefined, {
        ...(options?.cancel === undefined ? {} : { cancel: options.cancel }),
        deadline: false,
      })
      const type = (response.headers.get('content-type') ?? '').toLowerCase()
      if (!type.startsWith(THEME_PACKAGE_TYPE)) throw new ApiError(response.status, 'internal', UNREADABLE)
      try {
        return await response.blob()
      } catch {
        if (options?.cancel?.aborted === true) throw new ApiError(NO_RESPONSE, 'internal', ABANDONED)
        throw new ApiError(response.status, 'internal', UNREADABLE)
      }
    },
  }
}
