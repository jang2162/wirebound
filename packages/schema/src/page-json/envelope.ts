/**
 * **페이지 JSON 봉투**(설계 §11.2 — P7-3 D1·D2·D6). 페이지 하나를 파일 한 벌로 내보내고
 * 그 파일로 페이지를 만드는 형식이 여기 있다.
 *
 * **순수하다.** React도 DOM도 `fetch`도 SQL도 모른다 — 파일을 내려받고 읽는 것은
 * `apps/web/src/files/file-io.ts`, 가져오기의 리매핑은 `./import.ts`, 저장은 서버다.
 *
 * ---
 *
 * # 왜 `packages/schema`인가 (D1)
 *
 * 봉투가 참조하는 것은 `PageDocument`와 코멘트뿐이고 **테마를 모른다.** 스냅샷 payload가
 * `apps/api`로 간 것은 `Theme`를 참조했기 때문이지(P6-1 D2) 서버 것이라서가 아니다.
 * 그리고 §12의 `wireb pull`(P9)이 이 봉투를 쓴다 — 소비자가 서버·웹 말고 하나 더 보인다.
 *
 * ---
 *
 * # 버전 축이 셋이고 섞이지 않는다 (D2)
 *
 * | 축 | 어디 | 무엇 |
 * |---|---|---|
 * | `wireboundVersion` | 이 봉투 | **파일 형식** (§11.2 — 문자열 `"1"`) |
 * | `PageDocument.version` | `schema` 안 | 컴포넌트 props 규격 (§13.1) |
 * | `payloadVersion` | 스냅샷 | 스냅샷 payload 형식 (P6-1 D3) |
 *
 * **모르는 `wireboundVersion`은 거부하고 그 값을 말한다**(아래 `readPageJson`).
 * 문서 쪽은 `migrateDocument`가 올린다 — 그 호출은 **부르는 쪽**이 한다(이 파일은 던지지
 * 않는 층이고 `migrateDocument`는 던진다).
 *
 * ## §11.2의 예시와 갈리는 자리 둘 — 설계서를 고치지 않고 여기 적는다
 *
 * **㉠ `schema`가 노드가 아니라 문서 봉투(`{ version, root }`)다.**
 *
 * §11.2의 예시는 `"schema": { "id": "n_root", "type": "Page", … }`로 **root 노드**를 싣는다.
 * 그 모양에는 **문서 버전을 적을 자리가 없다.** 그런데 §13.1이 *"가져오기와 스냅샷 복원도
 * 같은 경로를 탄다"*고 못박았고 그 경로(`migrateDocument`)는 문서의 `version`을 읽는다.
 * 버전 없는 파일을 받으면 가져오기가 버전을 **지어내야** 하고, 지어낸 값은 반드시
 * *"지금 버전"*이 된다 — 즉 옛 버전으로 내보낸 파일이 마이그레이션 없이 최신 문서로
 * 취급된다. **§13.1이 존재하는 이유가 정확히 그 사고**이므로 그 모양을 쓸 수 없다.
 *
 * 봉투에 `documentVersion`을 따로 두는 판(예시의 `schema`는 그대로 두고 키를 하나 더)도
 * 놓고 봤는데, **D2의 표가 그 축의 집을 *"문서"*라고 적었다** — 봉투로 올리면 축이 섞인다.
 * 그리고 `PUT .../schema`의 본문이 이미 `{ schema: DocumentEnvelopeSchema }`라
 * 이 저장소에서 *"`schema` 키 = 문서 봉투"*가 이미 한 번 쓰인 뜻이다.
 *
 * **㉡ `comments[]`가 `marker`를 싣지 않는다** — 아래 D6 절.
 *
 * ---
 *
 * # D6 — 번호는 노드가 든다. 봉투의 `comments[].marker`는 받지 않는다
 *
 * §11.2의 예시는 `{ "marker": 1, "nodeId": …, "body": … }`인데 **P5-1 D1이 번호를 노드로
 * 옮겼다**(`repos/comments.ts` 머리말: *"번호(`marker`)는 여기 없다"*). 그래서 봉투가 그것을
 * 다시 실으면 **같은 값의 출처가 둘**이 되고, 파일의 둘이 어긋날 때 무엇을 믿을지 정하는
 * 규칙을 새로 지어야 한다 — 이 저장소 어디에도 없는 규칙이다.
 *
 * **`schema` 안의 노드가 이미 그 번호를 나른다**(`WbNodeSchema.marker`). 내보내기는 문서를
 * 그대로 싣고, 가져오기는 그 문서를 그대로 쓴다. 즉 번호는 **빠지지 않는다** — 자리가
 * 하나로 줄었을 뿐이다.
 *
 * **§11.2와 모순되지도 않는다.** `routes/comments.ts`의 D1이 이미 그 화해를 적어 뒀다:
 * *"§11.2의 `comments: [{ marker, nodeId, body }]`와 함께 참이려면 같은 노드의 코멘트가
 * 같은 번호를 공유해야 한다"* — 즉 예시의 `marker`는 **노드에서 파생된 값**이지 코멘트가
 * 스스로 든 값이 아니다. 파생 값을 파일에 겹쳐 적으면 그것이 낡는다.
 *
 * **조용히 버리지 않고 거부한다.** `strictObject`가 그 키를 400으로 끊고, 아래
 * `readPageJson`이 *"번호는 `schema`의 노드에 있다"*까지 말한다. 버리면 사용자가 적은 것이
 * 소리 없이 없어진다(P7-2 이월 §6이 `remapNodeIds`에서 같은 선을 그었다).
 *
 * ---
 *
 * # D4 — `layoutRef`는 받되 쓰지 않는다
 *
 * §11.2의 필드인데 **오늘 페이지가 레이아웃을 고르는 경로가 없다.** 재서 확인한 것 셋:
 * `pages` 테이블에 레이아웃 컬럼이 없고(`db/types.ts`의 `PagesTable`), 레이아웃은
 * 프로젝트당 기본 하나를 `projects.default_layout_id`로 가리키며(§4.2), `repos/layouts.ts`의
 * 유일한 갱신 함수는 `updateLayoutTheme`(테마 참조)이다.
 *
 * 그래서 **봉투는 이 필드를 받는다**(§11.2대로 쓴 파일이 거부당하지 않는다). **가져오기는
 * 쓰지 않고, 쓰지 않는다고 말한다** — 조용히 버리지 않는 것이 판정이다. **내보내기는 이
 * 필드를 만들지 않는다**(적을 값이 없다). 그러므로 왕복에서 이 필드는 살아남지 않는다.
 */
import { z } from 'zod'
import { DocumentEnvelopeSchema, NODE_ID_PATTERN } from '../envelope'
import type { PageDocument } from '../node'

/** 봉투의 버전. §11.2가 문자열 `"1"`로 적었다. */
export const WIREBOUND_PAGE_VERSION = '1'

/**
 * 내보낸 파일의 꼬리.
 *
 * 1. **`.json`이 마지막이어야 한다** — OS와 편집기가 그것으로 파일 종류를 정한다.
 * 2. **중간 마디가 *"어느 wirebound JSON인가"*를 말한다.** 테마 봉투
 *    (`.wirebound-theme.json`)와 이것은 다른 문서이고 둘 다 `.json`이라 이름 말고는 갈릴
 *    것이 없다. `theme-io.ts`의 `EXPORT_FILE_SUFFIX`가 같은 근거로 같은 모양이다.
 */
export const PAGE_JSON_FILE_SUFFIX = '.wirebound-page.json'

/** 제목으로 파일 이름을 만들지 못할 때 쓰는 이름. */
const FALLBACK_FILE_STEM = 'page'

/**
 * 코멘트 본문의 길이 경계. **`routes/comments.ts`의 `Body`가 이 상수를 가져다 쓴다** —
 * 값이 한 자리다.
 *
 * 상한을 봉투에도 거는 근거: 걸지 않으면 **가져오기가 `POST .../comments`로는 만들 수 없는
 * 행을 만든다.** 그 상한의 이유(요청 하나가 임의 크기의 텍스트를 싣지 못하게 하고, §4.5의
 * 스냅샷이 그 비용을 payload로 그대로 옮긴다 — P5-1 재라 #4)는 어느 경로로 들어오든 같다.
 * 하한이 1인 것도 같다 — 빈 코멘트는 코멘트가 아니다.
 *
 * > **이 문장은 처음 적었을 때 거짓이었다 — 리뷰가 잡았다.** 그때는 라우트가 `2000`을
 * > 그대로 박고 있어 값이 **두 자리**였고, 그래서 이 상수를 3000으로 바꿔도
 * > `comments.test.ts`가 전부 통과했다(리뷰가 재현했고 나도 다시 쟀다). **주석을 참으로
 * > 만드는 쪽으로 고쳤다** — 라우트가 실제로 import한다. 그리고 그 이음을 케이스가
 * > 지킨다: 경계 케이스가 숫자를 박지 않고 **이 상수에서 만든다**(`comments.test.ts`의
 * > *"빈 본문과 상한+1을 막고 상한은 받는다"*).
 * >
 * > **다만 죽는 변이는 그 변이가 아니다 — 방향이 반대다(델타 리뷰 (2)).** 이은 뒤
 * > *"이 상수를 3000으로"*는 **결함이 아니라 정상 설정 변경**이라 라우트와 케이스가 함께
 * > 움직여 통과하는 것이 맞는다. 죽는 것은 **둘을 갈라 놓는 변이**다: 라우트의 경계를
 * > 이 상수에서 한 칸 떼거나, 앞 판처럼 라우트에 값을 박고 이 상수만 옮기면 죽는다.
 */
export const COMMENT_BODY_MIN_LENGTH = 1
export const COMMENT_BODY_MAX_LENGTH = 2000

/**
 * `pages.description`의 규격. **`routes/pages.ts`의 `Description`이 이것을 가져다 쓰고,
 * 화면의 입력(`panels/page-description.tsx`)이 같은 상수로 글자 수를 센다** — 값이 한 자리다.
 *
 * **`COMMENT_BODY_MAX_LENGTH`와 같은 근거로 여기 산다.** 봉투에도 걸지 않으면 가져오기가
 * `POST .../pages`·`PATCH .../pages/:id`로는 만들 수 없는 행을 만든다.
 *
 * **앞 판은 이 수가 두 자리였다** — 이 파일이 `2000`을 적고 `routes/pages.ts`도 `2000`을
 * 적었으며, 이 파일의 `PageSectionSchema` 주석은 *"길이는 `routes/pages.ts`의 것과 같다"*고
 * **라우트를 소유자로 가리키고 있었다.** 그 상태에서 한쪽만 고치면 갈렸고 아무 케이스도
 * 죽지 않았다(`COMMENT_BODY_MAX_LENGTH` 머리말이 코멘트에 대해 겪은 그 사고다). 이제
 * 소유자는 이 상수이고 주석의 화살표도 뒤집혔다.
 *
 * **`nullable`이 규격의 일부다.** `null`은 *"설명 없음"*이라는 값이고 빈 문자열(`''`)과
 * **다르다** — 서버는 `''`를 `''`로 저장한다(실측: `PATCH {description:''}` → 200,
 * 되읽으면 `""`). 그 둘을 여기서 합치지 않는 이유는 `projects.description`과 같다.
 *
 * **글자 수는 코드포인트가 아니라 UTF-16 코드 단위다**(zod가 `.length`를 본다). 한글은
 * 한 자가 한 단위라 한글 2001자도 400이다(실측). BMP 밖(이모지 등)은 한 자가 둘로 세이는데,
 * 그것이 이 상한의 뜻을 바꿀 만큼 흔한 입력이 아니라 그대로 둔다.
 */
export const PAGE_DESCRIPTION_MAX_LENGTH = 2000

/** `pages.description`이 받는 값. 상한과 `null` 허용이 여기 한 벌로 있다(위 머리말). */
export const PageDescriptionSchema = z
  .string()
  .max(PAGE_DESCRIPTION_MAX_LENGTH, `설명은 ${PAGE_DESCRIPTION_MAX_LENGTH}자 이하여야 합니다`)
  .nullable()

/** 봉투의 `comments[]` 한 줄. **`marker`가 없다** — 위 D6 절. */
export interface PageJsonComment {
  nodeId: string
  body: string
}

/** 봉투의 `page` 절. §11.2의 세 필드. */
export interface PageJsonPage {
  title: string
  /** §11.2의 필드. **읽기만 하고 쓰지 않는다** — 위 D4 절. */
  layoutRef?: string
  description?: string | null
}

/** 파일 한 벌. */
export interface PageJson {
  wireboundVersion: string
  page: PageJsonPage
  /** **문서 봉투다 — root 노드가 아니다**(위 ㉠). */
  schema: PageDocument
  comments: PageJsonComment[]
}

/**
 * 제목·설명의 길이는 **`pages` 테이블의 것과 같다**. 여기서 막지 않으면 가져오기가
 * `POST .../pages`로는 만들 수 없는 행을 만든다 — 코멘트 본문 상한과 같은 근거다.
 *
 * **설명은 소유자가 위의 `PageDescriptionSchema`다** — `routes/pages.ts`가 그것을 가져다
 * 쓰고 여기도 같은 것을 쓴다. **제목은 아직 두 자리다**(여기와 `routes/pages.ts`의 `Title`) —
 * 이 슬라이스가 만진 것은 설명뿐이라 그대로 두고 이월한다.
 */
const PageSectionSchema = z.strictObject({
  title: z.string().min(1, '제목을 입력하세요').max(200, '제목은 200자 이하여야 합니다'),
  // **길이만 본다.** 이 값이 무엇을 가리키는지는 이 봉투가 답할 수 없다(D4).
  layoutRef: z.string().min(1).max(200).optional(),
  description: PageDescriptionSchema.optional(),
})

/**
 * **`nodeId`에 `NODE_ID_PATTERN`을 건다.** 그 집합 밖의 값은 **어떤 wirebound 문서에서도**
 * 노드를 가리킬 수 없으므로(같은 패턴이 노드의 `id`를 막고 있다) *"남의 파일이라 끊겨 있다"*가
 * 아니라 **깨진 참조**다. 끊긴 참조(패턴은 맞는데 이 파일의 트리에 없는 id)는 정상 입력이고
 * `./import.ts`가 그것을 세어 말한다.
 */
const CommentSchema = z.strictObject({
  nodeId: z.string().regex(NODE_ID_PATTERN, '노드 id 형식이 아닙니다'),
  body: z
    .string()
    .min(COMMENT_BODY_MIN_LENGTH, '코멘트를 입력하세요')
    .max(COMMENT_BODY_MAX_LENGTH, `코멘트는 ${COMMENT_BODY_MAX_LENGTH}자 이하여야 합니다`),
})

/**
 * 봉투 전체. **`z.strictObject`라 선언되지 않은 키는 그 자체로 거부다**(이 저장소의 관례).
 * 가져오기는 남이 만든 파일을 받으므로 **그 거부가 살아 있어야 한다** — 조용히 버리면
 * 사용자가 적은 것이 소리 없이 없어진다(P7-2 이월 §6).
 *
 * **`comments`가 필수다.** §11.2가 네 키를 봉투의 규격으로 적었고 내보내기가 늘 넷을 쓴다 —
 * 없는 키를 `[]`로 대신 읽어 주면 *"이것이 페이지 JSON인가"*에 답하는 힘이 그만큼 준다.
 */
export const PageJsonSchema = z.strictObject({
  wireboundVersion: z.string(),
  page: PageSectionSchema,
  schema: DocumentEnvelopeSchema,
  comments: z.array(CommentSchema),
})

/**
 * 읽기가 실패한 이유. **넷을 가른다** — 사용자가 할 일이 넷 다 다르기 때문이다
 * (`theme/theme-io.ts`의 `ThemeImportFailure`가 같은 형식이고 근거도 같다).
 *
 * - `unreadable` — JSON이 아니다. 할 일: 파일을 확인한다.
 * - `not-envelope` — JSON은 맞는데 wirebound 봉투가 아니다. 할 일: **다른 파일을 고른다.**
 * - `unknown-version` — 봉투는 맞는데 이 wirebound가 모르는 버전이다. 할 일: **wirebound를
 *   올린다.** §13.1이 예고한 진입점이고 오늘 마이그레이션 함수는 없다.
 * - `bad-shape` — 봉투이고 아는 버전인데 내용이 규격이 아니다. 할 일: **파일의 그 자리를
 *   고친다** — 그래서 이 갈래만 `issues`가 비어 있지 않다.
 */
export type PageJsonFailure = 'unreadable' | 'not-envelope' | 'unknown-version' | 'bad-shape'

/**
 * 파일의 **어느 자리**가 문제인가. `validatePage`의 `ValidationIssue`와 같은 축(`path`)을
 * 갖는 것이 D8이다 — 가져오기가 실패할 때 사용자에게 남는 것은 파일뿐이므로, 두 단계
 * (봉투·카탈로그)가 **둘 다** 자리를 말해야 한다.
 */
export interface PageJsonIssue {
  path: string
  message: string
}

export type PageJsonResult =
  | { status: 'read'; file: PageJson }
  | { status: 'failed'; reason: PageJsonFailure; message: string; issues: PageJsonIssue[] }

const EMPTY_MESSAGE = '내용이 비어 있습니다.'
const NOT_ENVELOPE_MESSAGE =
  'wirebound가 내보낸 페이지 파일이 아닙니다 — 파일 이름이 .wirebound-page.json인지 확인하세요.'
const BAD_SHAPE_MESSAGE = '페이지 JSON의 모양이 규격과 다릅니다'
/** D6 — 이 한 갈래만 문장을 따로 짓는다. 그 값이 **갈 자리가 있기** 때문이다. */
const COMMENT_MARKER_MESSAGE =
  'comments[]에는 marker를 싣지 않습니다 — 번호는 schema 안의 노드가 듭니다(설계 §4.3).'

/**
 * 글자 한 벌에서 봉투를 읽는다. **던지지 않는다.**
 *
 * **가르는 순서가 *"무엇까지 알 수 있는가"*다.** 봉투가 아니면 버전을 물을 수 없고, 버전을
 * 모르면 나머지 키가 없는 것이 결함인지 그 버전의 정상인지 알 수 없다.
 *
 * 1. JSON인가 → 아니면 `unreadable`
 * 2. `wireboundVersion` 문자열을 든 객체인가 → 아니면 `not-envelope`
 * 3. 그 값이 `"1"`인가 → 아니면 `unknown-version`(**찾은 값을 문장에 싣는다**)
 * 4. 나머지가 규격인가 → 아니면 `bad-shape`(**자리를 싣는다**)
 *
 * **엔진의 `SyntaxError` 문장을 그대로 옮긴다** — 줄·칸을 우리가 다시 세면 엔진이 실을
 * 때와 어긋난다(`theme-io.ts`가 같은 판정을 적었다). 빈 글자만 예외다: 그때 엔진이 내는
 * *"Unexpected end of JSON input"*은 사용자가 방금 한 일을 설명하지 못한다.
 */
export function readPageJson(text: string): PageJsonResult {
  if (text.trim() === '') {
    return { status: 'failed', reason: 'unreadable', message: EMPTY_MESSAGE, issues: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (caught) {
    return {
      status: 'failed',
      reason: 'unreadable',
      message: caught instanceof Error ? caught.message : String(caught),
      issues: [],
    }
  }

  return parsePageJson(parsed)
}

/**
 * **이미 파싱된 값**에서 봉투를 읽는다. `readPageJson`의 2단계 뒤가 그대로 이 함수다.
 *
 * **자리가 둘인 것이 아니라 입구가 둘이다.** 웹은 파일에서 **글자**를 받고(`readPageJson`),
 * 서버는 요청 본문에서 이미 **객체**를 받는다 — 서버가 그것을 다시 `JSON.stringify`해서
 * 글자 입구로 넣으면 왕복 한 번이 공짜로 늘고, 그 왕복이 값을 바꾸는 날(예: `undefined`)
 * 두 입구의 판정이 갈린다. **규칙은 여기 하나다** — `unreadable`만 글자 입구의 것이다.
 */
export function parsePageJson(parsed: unknown): PageJsonResult {
  if (!isPlainObject(parsed) || typeof parsed.wireboundVersion !== 'string') {
    return { status: 'failed', reason: 'not-envelope', message: NOT_ENVELOPE_MESSAGE, issues: [] }
  }

  if (parsed.wireboundVersion !== WIREBOUND_PAGE_VERSION) {
    return {
      status: 'failed',
      reason: 'unknown-version',
      message: `이 wirebound가 모르는 버전입니다(wireboundVersion: ${parsed.wireboundVersion}). 아는 버전은 ${WIREBOUND_PAGE_VERSION}입니다.`,
      issues: [],
    }
  }

  const outcome = PageJsonSchema.safeParse(parsed)
  if (!outcome.success) {
    const issues = outcome.error.issues.flatMap(toIssues)
    return {
      status: 'failed',
      reason: 'bad-shape',
      message: hasCommentMarker(parsed) ? COMMENT_MARKER_MESSAGE : BAD_SHAPE_MESSAGE,
      issues,
    }
  }

  return { status: 'read', file: outcome.data }
}

/**
 * 봉투를 만든다. **문서와 코멘트를 복사하지도 정규화하지도 않는다** — `toExport`(테마)와
 * 같은 판단이다: 다시 조립하면 그 자리에서 값이 갈릴 수 있다.
 *
 * **`layoutRef`를 만들지 않는다**(D4). **`description`은 받은 그대로 싣는다** — `null`은
 * *"설명 없음"*이라는 값이고 키가 없는 것과 다르다(`updateMenu`의 `parentId: null`과 같은 자리).
 */
export function toPageJson(input: {
  page: PageJsonPage
  document: PageDocument
  comments: readonly PageJsonComment[]
}): PageJson {
  return {
    wireboundVersion: WIREBOUND_PAGE_VERSION,
    page: input.page,
    schema: input.document,
    comments: [...input.comments],
  }
}

/**
 * 내보낼 글자.
 *
 * **들여쓰기 2칸이다** — 내보낸 파일을 열어 고친 뒤 다시 가져오는 왕복에서 사람이 보는
 * 모양이 갈리지 않는다. **끝에 줄바꿈을 붙인다** — 텍스트 파일의 관례이고 `JSON.parse`가
 * 무시한다(케이스가 그 왕복을 확인한다). 둘 다 `theme-io.ts`의 `exportText`와 같다.
 */
export function pageJsonText(file: PageJson): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * 내보낼 파일의 이름. `<제목>.wirebound-page.json`이다.
 *
 * **제목을 쓰는 것은 테마와 갈리는 자리다.** 테마에는 `meta.id`(형식이 좁혀진 slug)가
 * 있지만 페이지에는 그런 값이 없다 — id는 uuid라 사람이 못 읽고, 제목은 사람이 아무거나
 * 적을 수 있다. 그래서 **막지 않고 이름만 바꾼다**(`exportFileName`과 같은 판정): 내보내기는
 * *"고칠 수 있게 밖으로 꺼내는 것"*이라 제목이 이상할수록 필요하다.
 *
 * 남기는 글자는 `NODE_ID_PATTERN`과 같은 부류로 좁힌다 — **경로 구분자(`/`·`\`)와 공백,
 * 따옴표를 배제하는 것이 요점이다.** 브라우저는 `<a download>`의 값을 경로로 읽는다.
 * 한글·한자처럼 ASCII 밖의 글자는 남긴다: 경로로 읽히지 않고, 지우면 대부분의 제목이
 * 통째로 사라져 기본 이름만 남는다.
 */
export function pageJsonFileName(title: string): string {
  const stem = title
    .trim()
    // 공백 무리는 하이픈 하나로. 파일 이름에 공백이 있으면 셸·URL에서 매번 따옴표가 필요하다.
    .replace(/\s+/g, '-')
    // 경로·따옴표·제어 문자를 뺀다. `.`도 뺀다 — 꼬리의 마디를 늘려 확장자를 흐린다.
    .replace(/[/\\:*?"'<>|.\u0000-\u001f]/g, '')
    // 위 치환이 만든 하이픈 무리와 양끝 하이픈을 정리한다.
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${stem === '' ? FALLBACK_FILE_STEM : stem}${PAGE_JSON_FILE_SUFFIX}`
}

/**
 * zod 이슈 하나를 **자리를 든 줄**로 옮긴다.
 *
 * **`unrecognized_keys`만 갈라 다룬다 — 재서 알았다.** 그 이슈의 `path`는 **빈 배열**이고
 * (거부당한 키가 아니라 그 키를 **든 객체**를 가리킨다) 키 이름은 `issue.keys`에 따로 실린다.
 * 그대로 옮기면 `path`가 `''`가 되어 *"파일의 어디를 고치나"*에 아무것도 답하지 못한다 —
 * 처음 그렇게 짰고 케이스가 그것을 잡았다. 그래서 **키마다 한 줄**로 편다.
 */
function toIssues(issue: z.core.$ZodIssue): PageJsonIssue[] {
  const base = issue.path.map(String)
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({ path: [...base, key].join('.'), message: issue.message }))
  }
  return [{ path: base.join('.'), message: issue.message }]
}

/**
 * 파일의 `comments[]` 중 하나라도 `marker`를 들었는가(D6의 문장을 고르는 자리).
 *
 * **`safeParse`가 실패한 뒤에 날것을 다시 보는 것이 요점이다.** zod의 `unrecognized_keys`
 * 이슈에서 키 이름을 꺼낼 수도 있지만 그 이슈의 모양은 zod의 계약이고, 여기서 물어야 하는
 * 것은 *"사용자가 §11.2의 예시대로 적었는가"* 하나뿐이라 날것을 보는 편이 좁다.
 */
function hasCommentMarker(parsed: Record<string, unknown>): boolean {
  const comments = parsed.comments
  return Array.isArray(comments) && comments.some((entry) => isPlainObject(entry) && 'marker' in entry)
}

/** 객체인가. **배열과 `null`을 뺀다** — 봉투는 키로 찾는 표다(`theme-io.ts`와 같은 함수). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
