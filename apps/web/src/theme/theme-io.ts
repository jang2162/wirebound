/**
 * 테마를 **JSON 한 벌로** 내보내고 가져온다(P4c-3 T1). §6.10의 마지막 줄이 이 파일이다 —
 * *"테마는 JSON 한 벌로 내보내고 가져온다. 회사 디자인 시스템을 한 번 테마로 만들면
 * 프로젝트마다 재사용한다."*
 *
 * **순수 함수다.** React도 DOM도 `fetch`도 모른다 — 파일을 내려받고 읽는 것은
 * `../files/file-io.ts`, 화면은 `theme-io-panel.tsx`다. 셋을 가른 이유는 **이 파일이 화면 없이
 * 단위 테스트되어야** 하기 때문이고(계획서 T1), 그 선이 지켜지는지는
 * `test/theme/theme-io.test.ts`가 DOM 없이 도는 것으로 확인된다.
 *
 * ---
 *
 * # 봉투를 둔다 (D1)
 *
 * ```jsonc
 * { "wireboundVersion": "1", "theme": { "meta": …, "tokens": …, … } }
 * ```
 *
 * §11.2가 **페이지 JSON**에 대해 이미 그 모양을 정했다(`wireboundVersion` + 내용 키들).
 * 날 `Theme`을 그대로 내보내면 ㉠ §13.1의 마이그레이션이 걸 자리가 없고 ㉡ 가져오기가
 * *"이게 테마 파일인가"*를 물을 방법이 없다 — 아래 `fromImport`가 그 물음을 세 갈래로
 * 가르는 것이 봉투가 있어서 가능하다.
 *
 * **키는 `theme` 하나다.** 페이지 쪽은 `page`·`schema`·`comments` 셋인데 테마는 문서
 * 하나이므로 없는 것을 흉내 내지 않는다(D1).
 *
 * ## 재라 #1의 답 — **같은 값이지만 같은 축이 아니다**
 *
 * 값 `"1"`은 §11.2와 **글자까지 같게** 둔다(D1이 그 모양을 그대로 쓰기로 했다).
 * **그러나 뜻이 같지 않다고 판정한다.** 근거 셋:
 *
 * 1. **§13.1의 마이그레이션 대상은 페이지 스키마다** — *"컴포넌트 props는 반드시 바뀐다 …
 *    `pages.schema_version`에 현재 버전을 기록한다"*. 테마 문서에는 그 컬럼도, 그것을 읽는
 *    코드도 없다(`packages/schema`의 `migrateDocument`는 `PageDocument`만 받는다).
 * 2. **테마 문서에는 이미 다른 버전 축이 있다** — `meta.version`. 그런데 그것은
 *    `spec/meta.ts`가 *"사람이 읽는 표시이지 해석 대상이 아니다"*라고 못박은 값이라
 *    **마이그레이션 진입점이 아니다.**
 * 3. 그러므로 페이지 문서 버전이 2로 올라가도 **테마 봉투가 따라 올라갈 이유가 없다.**
 *    두 값이 같이 움직인다고 적으면 그것이 낡는다.
 *
 * > **오늘 그 대조를 코드로 할 수 없다 — 정직하게 적는다.** `wireboundVersion`을 쓰는
 * > 코드는 이 파일이 **처음이다**(검산: `grep -rn "wireboundVersion" apps packages` →
 * > 이 파일과 그 케이스만 나온다. 페이지 쪽 봉투는 §11.2의 규격일 뿐 구현이 없다).
 * > 즉 위 판정은 **설계 문서 두 절의 대조**이고 실행으로 잰 것이 아니다.
 *
 * ---
 *
 * # 파생 테마는 파생 문서 그대로 나간다 (D2)
 *
 * `extends: "system:admin"`인 테마는 **합치지 않고** 그대로 내보낸다. §6.9·§6.10이
 * 파생을 권장 형태로 뒀으므로 합쳐서 내보내면 **받는 쪽에서 파생이 아니게 되어** 그
 * 권장이 깨진다.
 *
 * **대가는 받는 쪽의 시스템 테마가 다르면 같은 JSON이 다른 테마가 된다는 것이다.**
 * §4.5가 스냅샷에 대해 쓴 장치(*"참조 중인 테마 내용을 함께 저장한다"*)가 내보내기에는
 * **없다.**
 *
 * ## 재라 #2의 답 — **봉투에 base를 넣지 않는다. 화면이 말한다**
 *
 * 후보 셋을 놓고 골랐다.
 *
 * | 후보 | 판정 |
 * |---|---|
 * | 봉투에 base **전문**을 싣는다(§4.5의 스냅샷처럼) | **안 한다.** 받는 쪽이 그것으로 무엇을 할지 규격이 필요한데(덮어쓰나? 비교만 하나?) 오늘 없다. 읽지 않을 값을 실으면 파일만 커지고 *"이 파일은 자족적이다"*라는 거짓 약속이 된다 |
 * | 봉투에 base의 **id·version만** 적는다 | **안 한다.** id는 `theme.meta.extends`에 이미 있어 중복이고, version은 **받는 쪽이 자기 시스템 테마의 것을 안다** — 즉 비교는 받는 쪽이 언제든 할 수 있다. 오늘 그 비교를 하는 코드가 없다는 것이 사실이고, 없는 코드를 위해 봉투를 늘리지 않는다 |
 * | **화면이 말한다** | **이것이다.** 비용이 문장 하나이고, 손해가 실제로 나타나는 자리(내보내는 사람·가져오는 사람)에서 말한다. `theme-io-panel.tsx`가 파생일 때 그 줄을 그린다 |
 *
 * ---
 *
 * # `JSON.stringify`의 키 순서가 계약이다
 *
 * `compileTheme`의 계약이 **문서 키 순서가 곧 우선순위**다(`states`끼리, 그리고 한 스타일
 * 맵 안의 프로퍼티끼리). **P4a-3이 저장 쪽에서 그것을 지키려고 절 컬럼을 `jsonb`가 아니라
 * `json`으로 골랐다** — `jsonb`가 키를 (길이, 바이트)로 정규화해 `{"selected":1,
 * "disabled":2}`를 `{"disabled":2,"selected":1}`로 뒤집는 것을 **P4a-3이 컨테이너에서
 * 직접 쟀다**(PostgreSQL 16.14, `0006-themes.ts`의 머리말).
 *
 * **내보내기가 그 순서를 보존한다.** `JSON.stringify`는 객체의 키를 **삽입 순서대로** 쓰고,
 * 이 파일은 절을 다시 조립하지 않으므로(아래 `toExport`가 `theme`을 **그대로** 싣는다)
 * 순서가 손대지 않은 채 나간다. 케이스가 그것을 못박는다.
 *
 * > **다만 정수형 키는 JS가 먼저 오름차순으로 정규화한다** — `JSON.parse('{"500":1,"50":2}')`가
 * > 낸 객체를 다시 `stringify`하면 `{"50":2,"500":1}`이다(내가 쟀다). **이것은 이 파일이
 * > 만드는 손해가 아니다:** 서버도 클라이언트도 문서를 JS 객체로 만드는 순간 같은 일이
 * > 일어나므로 왕복은 여전히 안정적이고, **순서가 계약인 자리(`states`·`variants`·스타일
 * > 프로퍼티)의 키는 정수형이 아니다.** 정수형 키가 실제로 나오는 곳은 토큰 스케일
 * > (`palette.blue.500`)인데 그 층은 이름으로 찾는 표이지 순서가 뜻을 갖는 층이 아니다.
 */
import { THEME_ID_PATTERN, type Theme } from '@wirebound/themes'

/**
 * 봉투의 버전. **§11.2의 페이지 봉투와 같은 문자열이고 같은 축이 아니다** — 머리말의
 * 재라 #1 참고.
 */
export const THEME_EXPORT_VERSION = '1'

/**
 * 내보낸 파일의 꼬리. **재라 #5의 답이다.**
 *
 * 1. **`.json`이 마지막이어야 한다.** OS와 편집기가 그것으로 파일 종류를 정한다 —
 *    `.wirebound-theme`으로 끝내면 사용자의 기계에서 열 도구가 없어진다.
 * 2. **중간 마디가 *"어느 wirebound JSON인가"*를 말한다.** §11.2의 페이지 JSON과 이
 *    봉투는 **다른 문서**이고, 둘 다 `.json`이라 이름 말고는 갈릴 것이 없다.
 *    `fromImport`가 페이지 JSON을 거절할 때 내는 문장과 짝이다.
 */
export const EXPORT_FILE_SUFFIX = '.wirebound-theme.json'

/** 파일 이름을 만들 수 없을 때 쓰는 이름. 아래 `exportFileName` 참고. */
const FALLBACK_FILE_STEM = 'theme'

/**
 * 내보낼 봉투. **`theme`은 초안 문서 그대로다** — 절을 다시 조립하지 않는 것이
 * 키 순서 계약을 지키는 방법이다(머리말).
 */
export interface ThemeExport {
  wireboundVersion: string
  theme: Theme
}

/** 문서를 봉투에 넣는다. **`theme`을 복사하지도 정규화하지도 않는다.** */
export function toExport(theme: Theme): ThemeExport {
  return { wireboundVersion: THEME_EXPORT_VERSION, theme }
}

/**
 * 내보낼 파일의 글자.
 *
 * **들여쓰기 2칸이다** — JSON 에디터가 화면에 그리는 것과 같은 꼴이라(`json-editor.tsx`의
 * `JSON.stringify(value, null, 2)`), 내보낸 파일을 열어 고친 뒤 다시 붙여 넣는 왕복에서
 * 사람이 보는 모양이 갈리지 않는다.
 *
 * **끝에 줄바꿈을 붙인다.** 텍스트 파일의 관례이고 `JSON.parse`가 무시하므로 왕복에
 * 영향이 없다(케이스가 그것을 확인한다).
 */
export function exportText(theme: Theme): string {
  return `${JSON.stringify(toExport(theme), null, 2)}\n`
}

/**
 * 내보낼 파일의 이름. `<meta.id>.wirebound-theme.json`이다.
 *
 * **`meta.id`를 쓰는 근거는 규격이 이미 적어 두었다** — `spec/meta.ts`의 `THEME_ID_PATTERN`
 * 머리말이 *"이 값이 `extends` 문자열과 **내보낸 번들의 파일 이름**에 그대로 실리므로
 * 공백·따옴표·경로 구분자(`/`)·`.`을 배제한다"*고 적는다. 즉 이 이름을 위해 이미
 * 좁혀 둔 값이다.
 *
 * **그럼에도 여기서 다시 본다.** 초안은 검증을 지나지 않은 문서를 담을 수 있고
 * (JSON 에디터가 모양을 안 보는 것이 D6의 계약이다), `id`에 `/`가 들어간 채 내려받으면
 * 브라우저가 그것을 경로로 읽는다. **막지 않고 이름만 바꾼다** — 내보내기는 *"고칠 수
 * 있게 밖으로 꺼내는 것"*이라 깨진 테마일수록 필요하다.
 */
export function exportFileName(theme: Theme): string {
  // 초안이 검증을 안 지났을 수 있으므로 `meta` 자체가 없을 수 있다. 타입은 있다고 하지만
  // 그것은 이 저장소가 일부러 통과시키는 거짓말이다(`json-editor.tsx`의 캐스트).
  const id: unknown = (theme as { meta?: { id?: unknown } }).meta?.id
  const stem = typeof id === 'string' && THEME_ID_PATTERN.test(id) ? id : FALLBACK_FILE_STEM
  return `${stem}${EXPORT_FILE_SUFFIX}`
}

/**
 * 읽기가 실패한 이유. **셋을 가른다**(계획서 T1) — 사용자가 할 일이 셋 다 다르기 때문이다.
 *
 * - `unreadable` — JSON이 아니다. 할 일: 파일을 확인한다.
 * - `not-envelope` — JSON은 맞는데 wirebound 테마 봉투가 아니다(예: 페이지 JSON, 날 테마
 *   문서). 할 일: **다른 파일을 고른다.**
 * - `unknown-version` — 봉투는 맞는데 이 wirebound가 모르는 버전이다. 할 일: **wirebound를
 *   올린다.** §13.1이 그 진입점을 예고한 자리이고 오늘 마이그레이션 함수는 없다.
 */
export type ThemeImportFailure = 'unreadable' | 'not-envelope' | 'unknown-version'

/**
 * 글자에서 테마를 읽은 결과.
 *
 * **`status`로 가르는 판별 유니온이다** — `routes/theme-editor.tsx`의 `LoadState`와 같은
 * 형식이고 근거도 같다(`null`로 실패를 판정하면 *"아직 안 읽었다"*와 *"못 읽었다"*가 같은
 * 값이 된다).
 */
export type ThemeImportResult =
  | { status: 'read'; theme: Theme }
  | { status: 'failed'; reason: ThemeImportFailure; message: string }

/** 읽지 못한 것이 무엇인지 사람이 읽는 문장. **엔진의 문장을 파싱하지 않는다**(아래). */
const EMPTY_MESSAGE = '내용이 비어 있습니다.'
const NOT_ENVELOPE_MESSAGE =
  'wirebound가 내보낸 테마 파일이 아닙니다 — 파일 이름이 .wirebound-theme.json인지 확인하세요.'
const NOT_THEME_MESSAGE =
  '테마가 없는 wirebound 파일입니다 — 페이지 JSON을 고르지 않았는지 확인하세요.'

/**
 * 글자 한 벌에서 테마 문서를 읽는다. **던지지 않는다.**
 *
 * ---
 *
 * **가르는 순서가 *"무엇까지 알 수 있는가"*다.** 봉투가 아니면 버전을 물을 수 없고,
 * 버전을 모르면 `theme` 키가 없는 것이 결함인지 그 버전의 정상인지 알 수 없다.
 *
 * 1. JSON인가 → 아니면 `unreadable`
 * 2. `wireboundVersion` 문자열을 든 객체인가 → 아니면 `not-envelope`
 * 3. 그 값이 `"1"`인가 → 아니면 `unknown-version`
 * 4. `theme` 객체가 있는가 → 아니면 `not-envelope`(**페이지 JSON이 여기서 걸린다**)
 *
 * ---
 *
 * **엔진의 문장을 그대로 옮긴다.** V8의 `SyntaxError`는 자리를 실을 때도 있고 아닐 때도
 * 있다 — **W2가 이 저장소의 Node 22.23.1에서 넷을 쟀다**(`json-editor.tsx`의 `parseMessage`
 * 머리말). 줄·칸을 우리가 다시 세면 엔진이 실을 때와 어긋나므로 **엔진이 아는 만큼만**
 * 옮긴다. 빈 글자만 예외다 — 그때 엔진이 내는 *"Unexpected end of JSON input"*은 사용자가
 * 방금 한 일(아무것도 안 넣었다)을 설명하지 못한다(W2가 같은 판정을 상자에서 내렸다).
 *
 * ---
 *
 * **`theme`의 모양을 여기서 보지 않는다 — `Theme`으로 캐스트하는 것이 판정이다.**
 *
 * `ThemeSchema.safeParse`로 걸러 되돌릴 수도 있었다. **안 한다:** 그러면 실패 문안이
 * *"규격이 아닙니다"* 하나로 뭉개져 **어디를 고쳐야 하는지가 사라진다.** 부르는 쪽이
 * `resolveDraft`를 지나게 하면 같은 문서에 대해 `bad-spec`이 **`path`를 달고** 나오고
 * (W2가 재서 확인했다: `resolveTheme`은 입력을 `unknown`으로 받아 던지지 않고 이슈를 낸다),
 * 그 이슈를 이미 있는 `ThemeIssueList`가 그린다. **판정 주체를 늘리지 않는 것**이
 * 이 저장소의 관례다(`theme-issues.tsx`의 `partitionIssues` 하나, `DeriveButton`이 slug
 * 형식을 다시 안 보는 것).
 */
export function fromImport(text: string): ThemeImportResult {
  if (text.trim() === '') return { status: 'failed', reason: 'unreadable', message: EMPTY_MESSAGE }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (caught) {
    return {
      status: 'failed',
      reason: 'unreadable',
      message: caught instanceof Error ? caught.message : String(caught),
    }
  }

  if (!isPlainObject(parsed) || typeof parsed.wireboundVersion !== 'string') {
    return { status: 'failed', reason: 'not-envelope', message: NOT_ENVELOPE_MESSAGE }
  }

  if (parsed.wireboundVersion !== THEME_EXPORT_VERSION) {
    return {
      status: 'failed',
      reason: 'unknown-version',
      // **찾은 값을 문장에 싣는다** — *"모르는 버전입니다"*만으로는 사용자가 파일을 열어
      // 확인해야 한다.
      message: `이 wirebound가 모르는 버전입니다(wireboundVersion: ${parsed.wireboundVersion}). 아는 버전은 ${THEME_EXPORT_VERSION}입니다.`,
    }
  }

  if (!isPlainObject(parsed.theme)) {
    return { status: 'failed', reason: 'not-envelope', message: NOT_THEME_MESSAGE }
  }

  return { status: 'read', theme: parsed.theme as unknown as Theme }
}

/**
 * 객체인가. **배열과 `null`을 뺀다** — `typeof null === 'object'`이고 배열도 객체다.
 * 봉투도 테마도 키로 찾는 표이므로 그 둘은 이 자리에서 봉투가 아닌 것이다.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
