import { partitionIssues } from '@wirebound/schema'
import type { ThemeIssue } from '../issue'
import { issue } from '../issue'
import { own } from '../own'
import { rejectFunctions } from './functions'
import type { TokenTable } from './tokens'
import { TOKEN_NAMESPACES, isTokenReference } from './tokens'

/**
 * 설계서 「스타일 프로퍼티 화이트리스트」와 CSS 대응.
 *
 * **이 표가 그 절을 덮는지 `test/style.test.ts`가 그 절을 읽어 대조한다.** 절이 늘거나
 * 줄면 그 케이스가 죽는다 — 그래서 여기 개수를 적지 않는다.
 *
 * **그 절에 없는 이름을 더할 때는 `STYLE_PROPERTIES_BEYOND_SPEC`에도 등록한다.** 그 대조가
 * 양방향이라 등록하지 않으면 케이스가 죽는다.
 *
 * 값이 배열인 것은 **한 어휘가 CSS 선언 여럿으로 펼쳐지는 것**이다. `paddingX`를
 * 논리 프로퍼티(`padding-inline`)가 아니라 물리 프로퍼티 둘로 낸 이유: 논리 프로퍼티는
 * 쓰기 방향에 따라 뜻이 바뀌는데, 그 절의 `direction`은 flex 방향이라 이름이 겹치고
 * 설계 어디에도 RTL 이야기가 없다. 물리 프로퍼티는 뜻이 하나다.
 *
 * `typography`는 여기 있지만 값이 단일 토큰이 아니라 **스케일 항목 이름**이라
 * `TYPOGRAPHY_KEYS`가 따로 처리한다(「스타일 프로퍼티 화이트리스트」가 그 자리에 *"스케일 참조"*라고 적었다).
 */
export const STYLE_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  // 색/배경
  bg: ['background'],
  // 그라디언트와 이미지는 CSS에서 같은 프로퍼티다. 어휘를 둘로 나눈 것은 「스타일 프로퍼티 화이트리스트」이고,
  // 받는 값이 서로 다르다(FUNCTION_ALLOWLIST를 보라).
  bgGradient: ['background-image'],
  bgImage: ['background-image'],
  bgSize: ['background-size'],
  bgPosition: ['background-position'],
  fg: ['color'],

  // 간격
  padding: ['padding'],
  paddingX: ['padding-left', 'padding-right'],
  paddingY: ['padding-top', 'padding-bottom'],
  margin: ['margin'],
  marginX: ['margin-left', 'margin-right'],
  marginY: ['margin-top', 'margin-bottom'],
  gap: ['gap'],

  // 크기
  width: ['width'],
  height: ['height'],
  minWidth: ['min-width'],
  maxWidth: ['max-width'],
  minHeight: ['min-height'],
  aspectRatio: ['aspect-ratio'],

  // 배치
  display: ['display'],
  // **「스타일 프로퍼티 화이트리스트」에 없다.** 값이 단일 토큰이 아니라 **열 수**라
  // `gridColumnsDeclarations`가 따로 처리한다. 근거는 `STYLE_PROPERTIES_BEYOND_SPEC`에 있다.
  gridColumns: ['grid-template-columns'],
  direction: ['flex-direction'],
  align: ['align-items'],
  justify: ['justify-content'],
  wrap: ['flex-wrap'],
  position: ['position'],
  inset: ['inset'],
  zIndex: ['z-index'],

  // 테두리
  borderColor: ['border-color'],
  borderWidth: ['border-width'],
  borderStyle: ['border-style'],
  radius: ['border-radius'],

  // 타이포
  typography: [],
  // **「스타일 프로퍼티 화이트리스트」에 없다.** 근거는 `STYLE_PROPERTIES_BEYOND_SPEC`에 있다.
  fontFamily: ['font-family'],
  fontSize: ['font-size'],
  fontWeight: ['font-weight'],
  lineHeight: ['line-height'],
  letterSpacing: ['letter-spacing'],
  textAlign: ['text-align'],
  textTransform: ['text-transform'],
  textDecoration: ['text-decoration'],

  // 이미지
  objectFit: ['object-fit'],
  objectPosition: ['object-position'],

  // 구조 손잡이 — 구조 기본 CSS(`renderer`)가 읽는 커스텀 프로퍼티에 값을 넣는 별칭.
  // **「스타일 프로퍼티 화이트리스트」에 없다.** 근거와 소유 규칙은 `STYLE_PROPERTIES_BEYOND_SPEC`에 있다.
  treeIndent: ['--wb-tree-indent'],

  // 효과
  shadow: ['box-shadow'],
  opacity: ['opacity'],
  overflow: ['overflow'],
  transition: ['transition'],
}

/**
 * **「스타일 프로퍼티 화이트리스트」의 목록에 없는데 `STYLE_PROPERTIES`에 있는 이름과 그 근거.**
 *
 * **설계서와 어긋난 자리를 여기 한 곳에 모은다.** `test/style.test.ts`의 `설계서 「스타일 프로퍼티 화이트리스트」 대조`가
 * 이 목록과 표의 차집합이 **정확히 같은지** 본다 — 몰래 늘리면 그 케이스가 죽고, 여기 이름만 적고 표에 안 넣어도 죽는다.
 *
 * **더하는 기준은 하나다: 다른 규격이 이미 요구하는데 어휘가 없어 닿지 않는 것.**
 * 그 절을 "웹 디자인이 가능한 수준"으로 넓히자는 취지대로 마음껏 늘리는 자리가 아니다.
 *
 * | 이름 | 무엇이 요구하는가 | 어휘가 없으면 |
 * |---|---|---|
 * | `fontFamily` | 「assets」의 `assets.fonts` · 「tokens — 3단 분리」의 `scale.typography.family` | 폰트를 선언하고 토큰까지 만들어도 **어느 테마도 컴포넌트에 걸 수 없다** |
 * | `gridColumns` | 「컴파일」 예시의 `List:cardGrid` | `display: grid`를 선언해도 **트랙이 없어 1열**이다. `List.columns`는 `visibleWhen:{structure:'table'}`인 **컬럼 이름 목록**이라 노드도 열 수를 못 정한다 |
 * | `treeIndent` | 구조 기본 CSS의 `--wb-tree-indent` | 렌더러가 손잡이를 남겼는데 **그 이름에 값을 넣을 길이 없어** 늘 기본값 `16px`이다 |
 *
 * ---
 *
 * **커스텀 프로퍼티 채널을 어떻게 여는가, 이름 목록을 누가 소유하는가.**
 *
 * **임의 커스텀 프로퍼티를 열지 않는다.** 열면 이 화이트리스트가 무의미해진다 — 무엇이든
 * `--x`로 내보낼 수 있고, 그 이름을 읽는 규칙이 구조 기본 CSS에 있으면 화이트리스트를 우회해
 * 임의 스타일을 거는 길이 된다. **손잡이마다 별칭 어휘 하나**를 여는 쪽이 그 제한을 지키고,
 * 값 규칙(토큰 참조·리터럴·함수 금지)도 새로 만들지 않고 그대로 쓴다.
 *
 * **소유는 갈라져 있다 — 그것이 설계서 「각 패키지의 책임과 의존」의 결과다.**
 *
 * | 무엇 | 소유 | 왜 |
 * |---|---|---|
 * | 어휘 이름(`treeIndent`)과 그것이 내는 CSS 이름 | **`themes`**(이 표) | 테마 문서를 검증하는 것이 이 패키지다 |
 * | 그 CSS 이름을 **읽는 규칙** | **`renderer`**(`TREE_INDENT_VAR`) | 손잡이는 구조 구현체의 것이다 |
 * | 두 문자열이 같은지 | **`apps/web`의 케이스** | `themes`는 `renderer`를 볼 수 없다 — 둘 다 보는 자리가 거기뿐이다 |
 *
 * **`schema`로 옮기지 않는다.** 둘 다 `schema`를 보므로 목록을 거기 두면 대조가 필요 없어지지만,
 * 설계서 「컴포넌트 정의 구조」의 `ComponentDef`에 손잡이 필드가 없어 **계약을 넓히는 일**이
 * 된다. 손잡이가 늘어 대조가 무거워지면 그때 다시 잰다.
 *
 * **이름 충돌은 없다 — 대조 케이스가 지킨다.** `--wb-tree-*`는 렌더러의 노드 변수
 * 접두어(`--wb-node-`)와 겹치지 않고, `cssVarName`이 만드는 이름과도 겹치지 않는다
 * (토큰 이름공간과 `primitives` 어디에도 `tree`가 없다).
 *
 * **`typography`(스케일 참조)로는 폰트를 걸 수 없다.** 그 어휘가 펼치는 것은
 * `fontSize`·`lineHeight`·`fontWeight`·`letterSpacing` 넷이고(`TYPOGRAPHY_KEYS`),
 * 「tokens — 3단 분리」의 `typography.family`는 그 넷 중 어느 것도 아니라 **항목으로 지목하면
 * `unknown-token`이 난다**(`test/style.test.ts`의 `타이포 항목이 아닌 이름은 이슈다`).
 * 즉 `fontFamily` 없이는 폰트 토큰을 만들어도 그것을 가리킬 프로퍼티가 없다.
 *
 * **여기 없는 것 — `Grid.props.gap`.** 설계서 「patterns — 테마가 소유한 구성 레시피」의 패턴 예시가
 * `{ type: 'Grid', props: { columns: 2, gap: 'space.10' } }`를 쓰는데 카탈로그에 그 prop이
 * 없어 **`bad-pattern-node`로 테마 전체가 해석되지 않는다**(실측). **예시가 틀린 것으로
 * 본다** — `gap`은 「스타일 프로퍼티 화이트리스트」가 이미 가진 **테마의** 어휘이고, 노드 props는 토큰 해석기를
 * 지나지 않으므로 `"space.10"`을 통과시켜도 CSS에서 무효값이 된다. 근거와 실측은
 * `packages/schema/test/component/catalog-vocabulary.test.ts`에 있다.
 */
export const STYLE_PROPERTIES_BEYOND_SPEC: readonly string[] = [
  'fontFamily',
  'gridColumns',
  'treeIndent',
]

/**
 * `typography: "h3"`이 펼쳐지는 CSS 선언. 스케일 항목에 없는 키는 **선언을 내지 않는다**
 * (「tokens — 3단 분리」의 `body`가 `letterSpacing`을 갖지 않는다).
 */
const TYPOGRAPHY_KEYS: readonly [string, string][] = [
  ['fontSize', 'font-size'],
  ['lineHeight', 'line-height'],
  ['fontWeight', 'font-weight'],
  ['letterSpacing', 'letter-spacing'],
]

/**
 * 함수를 받는 프로퍼티와 그 프로퍼티가 받는 함수 이름.
 *
 * 「스타일 프로퍼티 화이트리스트」는 *"`calc()`나 임의 함수는 받지 않는다"*로 끝나지만, **같은 절의 화이트리스트에
 * `bgGradient`·`bgImage`가 있다.** 그라디언트는 `linear-gradient(…)` 없이, 배경 이미지는
 * `url(…)` 없이 성립하지 않으므로 글자대로 적용하면 그 둘이 쓸 수 없는 어휘가 된다.
 * 그래서 금지의 대상을 **문법으로서의 함수**가 아니라 **검증할 수 없는 확장**으로 읽고,
 * 프로퍼티별로 좁게 연다. 그 절이 스스로 적은 제한의 이유(*"값을 검증할 수 있고 GUI 편집이
 * 가능하다"*·*"무제한 스타일 튜닝을 막는다"*)를 둘 다 지키는 선이다.
 *
 * **프로퍼티별 표인 이유**는 `bgGradient`가 `url()`을 받으면 안 되기 때문이다 — 함수 이름
 * 하나짜리 목록으로 합치면 그 구분이 사라진다.
 *
 * **검증하지 않는 것:** `url()`의 대상은 보지 않는다. 외부 호스트인지, `data:` URI인지,
 * 내보낸 번들(설계서 「HTML 정적 번들」)에서 어떻게 다뤄지는지, CSP가 무엇을 막는지 — 어느 것도 이 함수가
 * 확인하지 않는다. **이 값이 "검증을 지났다"고 믿으면 안 된다.**
 *
 * **토큰 층도 함수를 검사한다**(`resolveTokens`의 `TOKEN_FUNCTIONS`). 규칙이 다를 뿐이다 —
 * 토큰은 어느 프로퍼티든 `var()`로 가리킬 수 있어 프로퍼티별 표를 적용할 수 없으므로,
 * 그 층은 **표기 함수만** 받는다(`rgba`·`cubic-bezier` 등). 그래서 `url()`을 토큰에 넣고
 * `bgGradient`가 가리키는 길이 막힌다.
 */
const FUNCTION_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  bgGradient: ['linear-gradient', 'radial-gradient', 'conic-gradient'],
  bgImage: ['url'],
}

/**
 * 스타일 값이 가리킬 수 있는 **primitives 이름공간**(설계서 「primitives — 사이트 골격」).
 * **토큰 이름공간과 갈라 둔다.**
 *
 * **이 문법이 없으면 primitives 변수를 아무도 읽지 못한다.** `--wb-container-*`·
 * `--wb-grid-*`·`--wb-section-*`는 「컴파일」대로 `:root`에 나가는데, 스타일이 그것을
 * 가리킬 **문법이 없으면** `maxWidth: "container.maxWidth"`가 참조로 인식되지 않고
 * **리터럴로 통과해** 브라우저가 그 선언을 버린다(Chromium 151에서 쟀다).
 *
 * **`TOKEN_NAMESPACES`에 더하지 않은 이유는 표가 다르기 때문이다.** primitives는
 * `TokenTable`에 없다 — `isTokenReference`가 이 이름들에 참을 내면 토큰 해석기가 없는
 * 표를 뒤져 `unknown-token`을 낸다. 두 이름공간은 **해석하는 표가 다른 두 문법**이고,
 * 값이 `var(--wb-<경로>)`로 나가는 것만 같다(값을 인라인하지 않는다).
 *
 * **`breakpoints`는 없다.** 근거는 방출이다: `compileTheme`의 `:root`는
 * `tokens` + `primitives.values` 둘만 돌고, `checkPrimitives`는 브레이크포인트를 `values`가
 * 아니라 **수로 따로** 낸다. 즉 `--wb-breakpoints-md`라는 변수가 **존재하지 않으므로**
 * 열어 주면 `var()`가 빈 값으로 풀려 선언이 조용히 죽는다 — 위 결함과 같은 부류를
 * 새로 만드는 셈이다. 「primitives — 사이트 골격」이 그 값을 `@media` **조건**으로 쓰는 것도 같은 이야기다.
 */
export const STYLE_PRIMITIVE_NAMESPACES = ['container', 'grid', 'section'] as const

/** 값 통째가 primitives 참조인지 가르는 기준. `REFERENCE`(tokens.ts)와 같은 모양이다. */
const PRIMITIVE_REFERENCE = new RegExp(`^(${STYLE_PRIMITIVE_NAMESPACES.join('|')})\\.\\S+$`)

/**
 * 선언된 primitives 경로의 집합. 키는 `container.maxWidth`처럼 **문서 안의 경로에서
 * 이름공간 마디(`primitives.`)를 뗀 것**이고, `checkPrimitives`가 내는 `values`의 키와 같다.
 */
export type PrimitiveTable = ReadonlySet<string>

/**
 * 값 문자열 안에 섞여 있는 토큰 참조를 찾는다. 통째로 참조인 경우는 `isTokenReference`가 본다.
 *
 * **값 토큰 하나가 통째로 참조일 때만 잡는다.** 앞뒤를 공백·쉼표·괄호로 못박은 것은
 * `\b`가 `/`나 `-` 뒤에도 서기 때문이다 — `\b`로 두면 `url(/img/space.png)`의
 * `space.png`가 참조로 읽혀 **실제 URL이 거부된다**(`shadow.svg`·`typography.woff2`·
 * `motion.gif`·`my-palette.x`도 같은 이유로 거부되는 것을 쟀다). `bgImage`는 `url()`을
 * 담으라고 만든 어휘이므로 그 거부가 어휘를 못 쓰게 만든다.
 */
const EMBEDDED_REFERENCE = new RegExp(
  `(?<=^|[\\s,()])(?:${[...TOKEN_NAMESPACES, ...STYLE_PRIMITIVE_NAMESPACES].join('|')})` +
    `(?:\\.[A-Za-z0-9_-]+)+(?=$|[\\s,()])`,
  'g',
)

/**
 * `url(…)`의 안쪽 범위. 그 안에서는 참조를 찾지 않는다.
 *
 * 토큰 경계만으로는 `url(space.png)`처럼 **괄호가 곧 경계인 상대 경로**가 남는다.
 * `url()`의 대상은 어차피 이 패키지가 검증하지 않는다고 적어 둔 자리이므로, 그 안을
 * 통째로 불투명하게 다루는 것이 규칙이 하나 더 늘지 않는 길이다.
 */
function urlSpans(value: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = []
  const opener = /url\(/gi
  let match: RegExpExecArray | null = opener.exec(value)
  while (match !== null) {
    const close = value.indexOf(')', match.index + match[0].length)
    spans.push([match.index, close === -1 ? value.length : close] as const)
    match = opener.exec(value)
  }
  return spans
}

/** 변수 이름은 `--wb-<경로>`이고 경로의 `.`이 `-`가 된다. */
export function cssVarName(tokenPath: string): string {
  return `--wb-${tokenPath.replace(/\./g, '-')}`
}

/**
 * 스타일 어휘 하나를 CSS 선언들로 바꾼다. **던지지 않는다** — 이슈를 모아서 낸다.
 *
 * **`error`가 하나라도 나오면 `css`는 비어 나간다.** 반쯤 옳은 선언을 내보내면 화면에서만
 * 드러나기 때문이다(해석과 방출을 가른 이유와 같다).
 *
 * **경고가 붙은 값은 `css`를 채운 채 나간다** — `suspicious-literal`이 값을 안 버리는
 * 것이 그 코드가 `error`가 아닌 이유다. 이 문단은 함수의 **계약**이라 읽는 사람이 그대로
 * 믿는다 — severity의 선이 움직이면 여기도 함께 고친다.
 *
 * `path`는 이슈에 실을 테마 문서 안의 자리다(생략하면 `prop`). 이슈가 어디서 났는지
 * 없이는 고칠 수 없다.
 *
 * `primitives`는 **이 자리에서 primitives 참조가 가리킬 수 있는 경로**다.
 * 생략하면 *"이 자리에서는 primitives를 가리킬 수 없다"*는 뜻이고 그런 값은 **이슈**가
 * 된다 — 리터럴로 통과시키는 갈래를 남기지 않는다(그 침묵이 `STYLE_PRIMITIVE_NAMESPACES`
 * 머리말의 결함이다).
 */
export function styleDeclarations(
  prop: string,
  value: unknown,
  tokens: TokenTable,
  path: string = prop,
  primitives?: PrimitiveTable,
): { css: Array<[string, string]>; issues: ThemeIssue[] } {
  const targets = own(STYLE_PROPERTIES, prop)
  if (targets === undefined) {
    return {
      css: [],
      issues: [issue('unknown-style-prop', path, `허용되지 않은 스타일 프로퍼티입니다: ${prop}`)],
    }
  }

  // `typography`를 수 갈래보다 **먼저** 가른다. 값이 단일 토큰이 아니라 스케일 항목
  // 이름이므로 `targets`가 빈 배열인데, 수 갈래를 먼저 돌면 `targets.map`이 빈 결과를 내
  // **선언도 이슈도 없이 사라진다**(`typography: 700`으로 재서 확인했다).
  if (prop === 'typography') {
    if (typeof value !== 'string') {
      return {
        css: [],
        issues: [
          issue('bad-style-value', path, `typography는 타이포 스케일 항목 이름이어야 합니다`),
        ],
      }
    }
    return typographyDeclarations(value, tokens, path)
  }

  // `typography`와 같은 이유로 수 갈래보다 **먼저** 가른다 — 그냥 두면 `gridColumns: 3`이
  // `grid-template-columns: 3`이라는 무효 선언이 되어 조용히 나간다.
  if (prop === 'gridColumns') return gridColumnsDeclarations(targets, value, path)

  if (typeof value === 'number') {
    return { css: targets.map((name) => [name, String(value)]), issues: [] }
  }
  if (typeof value !== 'string') {
    return {
      css: [],
      issues: [
        issue('bad-style-value', path, `스타일 값은 문자열이나 수여야 합니다: ${prop}`),
      ],
    }
  }

  const resolved = resolveStyleValue(
    value,
    tokens,
    path,
    own(FUNCTION_ALLOWLIST, prop) ?? [],
    prop,
    primitives,
  )
  if (resolved.value === null) return { css: [], issues: resolved.issues }
  return { css: targets.map((name) => [name, resolved.value!]), issues: resolved.issues }
}

/**
 * 값 하나를 CSS에 실을 문자열로 바꾼다. 참조를 풀고 함수를 검사한다.
 *
 * `primitives`(설계서 「primitives — 사이트 골격」)처럼 **CSS 프로퍼티 이름이 없는 자리**도
 * 같은 값 규칙을 받아야 해서 따로 뽑았다 — `container.gutter`가 `"space.6"`을 받는 것이 그
 * 절의 예시다.
 * 실패하면 `value`가 `null`이다.
 *
 * **`value`가 `null`이 아니어도 `issues`가 빌 필요는 없다**. 경고는 값을
 * 버리지 않는다 — `suspicious-literal`이 붙은 값은 적힌 그대로 CSS에 실린다.
 * 선을 긋는 것은 `severity`이고 그 판정은 `THEME_ISSUE_SEVERITY` 하나가 한다.
 */
export function resolveStyleValue(
  value: unknown,
  tokens: TokenTable,
  path: string,
  allowedFunctions: readonly string[] = [],
  label = path,
  primitives?: PrimitiveTable,
): { value: string | null; issues: ThemeIssue[] } {
  if (typeof value === 'number') return { value: String(value), issues: [] }
  if (typeof value !== 'string') {
    return {
      value: null,
      issues: [issue('bad-style-value', path, `값은 문자열이나 수여야 합니다: ${label}`)],
    }
  }

  const rejected = rejectFunctions(value, allowedFunctions, path, label)
  if (rejected.length > 0) return { value: null, issues: rejected }

  const resolved = resolveReferences(value, tokens, path, primitives)
  // **선을 긋는 것은 `partitionIssues` 하나다.** 여기서 `filter`를 다시 쓰면 `resolveTheme`이
  // 긋는 선과 이 자리의 선이 갈릴 수 있다 — 그 함수의 머리말이 *"이 선을 긋는 코드는
  // 이 함수 하나뿐이어야 한다"*고 못박아 두었고, `partitionIssues`가 제네릭인 이유가
  // 정확히 **테마 쪽도 그것을 부를 수 있게** 하려는 것이다. 손으로 그은 선은
  // severity가 셋이 되는 날(`info` 같은 것이 생기면) **여기만 안 고쳐진다.**
  if (partitionIssues(resolved.issues).errors.length > 0) {
    return { value: null, issues: resolved.issues }
  }
  return { value: resolved.value, issues: resolved.issues }
}

/**
 * `typography: "h3"`을 넷으로 펼친다.
 *
 * **값에 이름공간이 붙지 않는다** — 설계서 「components — 구조 + 스킨」의 `parts.title`이
 * `"h3"`이라고만 적었다. 다른 어느 예시도 이름공간을 생략하지 않으므로(그 절은 색을 늘
 * `"semantic.surface"`로 적는다) 생략은 일반 문법이 아니라 **이 프로퍼티에 한정된 것**이고,
 * 그 근거는 「스타일 프로퍼티 화이트리스트」가
 * 이 자리에 *"스케일 참조"*라고 못박아 이름공간을 프로퍼티 이름이 대신하기 때문이다.
 * 그래서 `"typography.h3"`은 항목 이름 `typography.h3`을 찾다가 이슈가 된다.
 */
function typographyDeclarations(
  entry: string,
  tokens: TokenTable,
  path: string,
): { css: Array<[string, string]>; issues: ThemeIssue[] } {
  const css: Array<[string, string]> = []
  for (const [key, cssName] of TYPOGRAPHY_KEYS) {
    const tokenPath = `typography.${entry}.${key}`
    if (tokens.has(tokenPath)) css.push([cssName, `var(${cssVarName(tokenPath)})`])
  }
  if (css.length === 0) {
    return {
      css: [],
      issues: [
        issue(
          'unknown-token',
          path,
          `타이포 스케일 항목이 아닙니다: ${entry} ` +
            `(${TYPOGRAPHY_KEYS.map(([key]) => key).join('·')} 중 하나도 없습니다)`,
        ),
      ],
    }
  }
  return { css, issues: [] }
}

/**
 * `gridColumns: 3`을 `repeat(3, 1fr)`로 펼친다.
 *
 * **토큰 참조를 받지 않는다.** 열 수는 길이도 색도 아니라 토큰 층에 대응하는 이름공간이
 * 없고(설계서 「tokens — 3단 분리」의 다섯 중 어느 것도 아니다), `primitives.grid.columns`는
 * **사이트 골격의 12칼럼**이지 컴포넌트의 열 수가 아니다.
 *
 * **상한을 두지 않는다.** `primitives.grid.columns`가 12라고 해서 컴포넌트의 열 수가
 * 12를 넘을 수 없다는 근거가 설계 어디에도 없다 — 절대값을 계약에 적지 않는다. 막는 것은
 * CSS `repeat()`이 받지 못하는 값뿐이다.
 */
function gridColumnsDeclarations(
  targets: readonly string[],
  value: unknown,
  path: string,
): { css: Array<[string, string]>; issues: ThemeIssue[] } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return {
      css: [],
      issues: [
        issue(
          'bad-style-value',
          path,
          `gridColumns는 1 이상의 정수여야 합니다 (받은 값: ${JSON.stringify(value)}) — ` +
            '트랙 문자열이 아니라 열 수를 적습니다',
        ),
      ],
    }
  }
  return { css: targets.map((name) => [name, `repeat(${value}, 1fr)`]), issues: [] }
}

/**
 * 스타일 값이 가리킬 수 없는 이름공간.
 *
 * 설계서 「tokens — 3단 분리」가 의미 계층을 두는 이유를 스스로 적었다 — *"다크 테마와
 * 브랜드 교체 때문이다. `semantic`만 갈아끼우면 전체가 바뀐다."* 컴포넌트가 원시 팔레트를
 * 직접 집으면 그 성질이 깨진다.
 *
 * **설계서가 이것을 금지한다고 적지는 않았다.** 대신 설계서에서 `palette.`로 시작하는
 * 참조가 나오는 자리는 「tokens — 3단 분리」의 `semantic` 블록뿐이고, primitives·components·
 * patterns 절의 값 자리에는 없다. **그 대조를 `test/style.test.ts`가 문서를 읽어 다시 한다** — 설계가 스타일
 * 자리에 팔레트 참조를 쓰기 시작하면 그 케이스가 죽는다.
 *
 * 반대 방향(`semantic`이 `palette`를 가리키는 것)은 그대로 열려 있다 — 그것이 3단 분리다.
 */
const STYLE_FORBIDDEN_NAMESPACES: readonly string[] = ['palette']

function namespaceOf(reference: string): string {
  return reference.slice(0, reference.indexOf('.'))
}

/** 값 통째가 primitives 참조인가. `isTokenReference`와 **표가 다른 두 문법**이다. */
export function isPrimitiveReference(value: unknown): boolean {
  return typeof value === 'string' && PRIMITIVE_REFERENCE.test(value)
}

/**
 * *"참조처럼 생겼다"*의 판정식 (`suspicious-literal`).
 *
 * **값 통째가 점으로 이어진 식별자 마디들일 때만** 참이다. `이름공간.이름`이 아닌 어느
 * 문자도(공백·쉼표·괄호·`/`·`#`·`%`) 있으면 거짓이다.
 *
 * **이름 쪽을 `\\S+`가 아니라 좁은 문자 집합으로 둔 것이 `REFERENCE`(tokens.ts)와
 * 반대 방향이다 — 그리고 그것이 의도다.** 그쪽 주석이 적었다: *"이름 쪽을 좁게 두면
 * 선언될 수 없는 이름을 가리키는 참조가 리터럴로 조용히 통과한다."* 그쪽은 **이름공간이 목록 안**
 * 이라 참조라는 것이 확실하므로 넓히는 것이 옳다. **여기는 목록 밖이라 멀쩡한 CSS
 * 리터럴일 수 있다** — 넓히면 거짓 양성이 곧바로 사용자에게 간다. 그래서 좁힌다.
 *
 * 이 좁힘으로 못 잡는 것: `layout.최대폭`처럼 **좁은 문자 집합 밖의 이름**과, 값 **안쪽**에
 * 섞인 오타(`'10px spce.4'`). 후자를 열지 않은 이유는 다중값 CSS가 정확히 점 찍힌 토큰이
 * 사는 자리이기 때문이다(그림자 `0 1px 2px rgba(15,23,42,.06)`·폰트 목록). 다시 재려면
 * 판정식을 두 형태로 바꿔 시스템 테마 다섯과 저장소의 테마 픽스처를 해석하고
 * `suspicious-literal` 수를 센다.
 */
const REFERENCE_SHAPED = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/

/**
 * 값 안의 참조를 `var(--wb-…)`로 바꾼다. 통째로 참조인 경우와 섞여 있는 경우를 함께 다룬다.
 *
 * **두 이름공간을 표로 가른다.** 토큰은 `tokens`에서, primitives는 `primitives`에서 찾는다 —
 * 한 표로 합치면 `unknown-token`이 primitives 오타에도 붙어 문장이 거짓이 된다.
 */
function resolveReferences(
  value: string,
  tokens: TokenTable,
  path: string,
  primitives: PrimitiveTable | undefined,
): { value: string; issues: ThemeIssue[] } {
  const issues: ThemeIssue[] = []

  const check = (reference: string): ThemeIssue | null => {
    if (isPrimitiveReference(reference)) {
      if (primitives === undefined) {
        // `checkPrimitives`가 자기 값을 풀 때가 여기다. **리터럴로 통과시키지 않는다** —
        // 그 침묵이 `STYLE_PRIMITIVE_NAMESPACES` 머리말의 결함 그 자체이고, 한 층 아래에
        // 같은 구멍을 다시 파는 셈이다.
        return issue(
          'bad-style-value',
          path,
          `여기서는 primitives를 가리킬 수 없습니다: ${reference} ` +
            '(primitives 값은 토큰이나 리터럴을 씁니다)',
        )
      }
      if (!primitives.has(reference)) {
        return issue(
          'unknown-primitive',
          path,
          `선언되지 않은 primitives 경로를 가리킵니다: ${reference}`,
        )
      }
      return null
    }
    if (STYLE_FORBIDDEN_NAMESPACES.includes(namespaceOf(reference))) {
      return issue(
        'bad-style-value',
        path,
        `스타일 값은 ${namespaceOf(reference)}를 직접 가리킬 수 없습니다: ${reference} ` +
          '(semantic 토큰을 쓰세요 — semantic만 갈아끼우면 다크 테마·브랜드 교체가 됩니다)',
      )
    }
    if (!tokens.has(reference)) {
      return issue('unknown-token', path, `없는 토큰을 가리킵니다: ${reference}`)
    }
    return null
  }

  if (isTokenReference(value) || isPrimitiveReference(value)) {
    const rejected = check(value)
    return rejected === null
      ? { value: `var(${cssVarName(value)})`, issues: [] }
      : { value, issues: [rejected] }
  }

  // **이름공간이 목록 밖인데 참조처럼 생겼다**. 값은 버리지 않고 경고만 낸다 —
  // `severity`가 `warning`이라 `resolveTheme`이 이것 때문에 `null`을 내지 않는다.
  if (REFERENCE_SHAPED.test(value)) {
    issues.push(
      issue(
        'suspicious-literal',
        path,
        `참조처럼 보이는데 이름공간이 목록 밖입니다: ${value} ` +
          `(쓸 수 있는 이름공간: ${[...TOKEN_NAMESPACES, ...STYLE_PRIMITIVE_NAMESPACES].join('·')}). ` +
          '리터럴로 의도한 것이면 그대로 두세요 — 값은 적힌 그대로 CSS에 실립니다',
      ),
    )
  }

  const opaque = urlSpans(value)
  const replaced = value.replace(EMBEDDED_REFERENCE, (reference, offset: number) => {
    if (opaque.some(([start, end]) => offset > start && offset < end)) return reference
    const rejected = check(reference)
    if (rejected !== null) {
      issues.push(rejected)
      return reference
    }
    return `var(${cssVarName(reference)})`
  })

  return { value: replaced, issues }
}
