export const PACKAGE_NAME = '@wirebound/themes'

export type { ThemeMeta } from './spec/meta'
export { EXTENDS_PATTERN, MetaSchema, THEME_ID_PATTERN } from './spec/meta'

export type { ThemeAssets, ThemeFont } from './spec/assets'
export { AssetsSchema, ICON_SETS, PLACEHOLDER_STYLES } from './spec/assets'

export type { ThemeIssue, ThemeIssueCode } from './issue'
/**
 * `issue`는 **`themeIssue`라는 이름으로** 나간다. 바깥에서 `import { issue }`는 무엇의
 * 이슈인지 말하지 않는다 — 같은 봉투에 `schema`의 `ValidationIssue`도 실린다.
 *
 * 내는 이유: 테마 이슈를 만드는 자리가 이 패키지 밖에도 있다(`apps/api`의 저장 경계가
 * *"상속 대상이 코드에 없다"*를 낸다). 그 자리가 객체 리터럴을 쓰면 `severity`를 손으로
 * 박게 되고, 그러면 `THEME_ISSUE_SEVERITY`가 진실이 아니게 된다.
 */
export { THEME_ISSUE_SEVERITY, issue as themeIssue } from './issue'

export type { ThemeTokens } from './spec/tokens'
export { TokensSchema } from './spec/tokens'

export type { TokenNamespace, TokenTable } from './resolve/tokens'
export { SPACE_MAX, TOKEN_NAMESPACES, isTokenReference, resolveTokens } from './resolve/tokens'

// `STYLE_PROPERTIES_BEYOND_SPEC`은 설계서 「스타일 프로퍼티 화이트리스트」에 없는 어휘의
// 목록이다. `apps/web`의 케이스가 그중 `treeIndent`가 내는 이름과 `renderer`의
// `TREE_INDENT_VAR`를 대조한다 — 이 패키지는 `renderer`를 볼 수 없다(설계서 「각 패키지의
// 책임과 의존」).
export {
  STYLE_PROPERTIES,
  STYLE_PROPERTIES_BEYOND_SPEC,
  cssVarName,
  styleDeclarations,
} from './resolve/style'
export { resolveStyleValue } from './resolve/style'
// 스타일 값이 `primitives`를 가리키는 문법. `STYLE_PRIMITIVE_NAMESPACES`는
// `TOKEN_NAMESPACES`와 **표가 다른 두 문법**이라 갈라 두었다.
export type { PrimitiveTable } from './resolve/style'
export { STYLE_PRIMITIVE_NAMESPACES, isPrimitiveReference } from './resolve/style'

// 노드 손잡이 표. **`apps/web`의 대조 케이스가 이것을 렌더러의 구조 기본 CSS와 통째로
// 비교한다** — 이 패키지는 `renderer`를 볼 수 없다(「각 패키지의 책임과 의존」).
export type { NodeHandle } from './spec/handles'
export { NODE_HANDLES, coveredProperties, overwrittenHandles } from './spec/handles'

export type { ThemePrimitives } from './spec/primitives'
export { PrimitivesSchema, checkPrimitives } from './spec/primitives'

export type { ThemeComponent, ThemeLayer, ThemeStyleMap } from './spec/components'
export { ComponentSchema, ComponentsSchema, checkThemeComponents } from './spec/components'

export type { PatternNode, SlotType, ThemePattern } from './spec/patterns'
export {
  PATTERN_CATEGORIES,
  PatternNodeSchema,
  PatternSchema,
  PatternsSchema,
  SLOT_TYPES,
  checkPatterns,
} from './spec/patterns'

// 패턴 전개(설계서 「patterns — 테마가 소유한 구성 레시피」). 부르는 곳은 `apps/web`이다.
// **`apps/web`이 아니라 여기 두는 것은** 패턴 삽입이 에이전트가 할 일이기도 해서다
// (설계서 「LLM 연계 (P9)」) — CLI·MCP가 부르려면 패키지에 있어야 한다.
export type { ExpandedPattern } from './pattern/expand'
export { expandPattern } from './pattern/expand'

export type { Theme } from './spec/theme'
export { ThemeSchema } from './spec/theme'

export type { ThemePatch } from './resolve/merge'
export { ThemePatchSchema, mergeTheme } from './resolve/merge'

export type {
  CssDeclaration,
  ResolvedComponent,
  ResolvedLayer,
  ResolvedTheme,
} from './resolved'
export { resolveTheme } from './resolve/index'

// 테마가 고른 구조를 렌더러의 `RenderOptions.structures` 꼴로 낸다. 화면(`apps/web`)과
// 번들(`packages/exporter`)이 **같은 표**를 써야 한다 — 근거는 그 파일의 머리말에 있다.
export { themeStructures } from './resolve/structures'

export { compileTheme } from './emit/index'

export { SYSTEM_THEME_IDS, systemTheme } from './system/index'
export { ADMIN_THEME } from './system/admin'

// 설계서 「lint 규칙」의 테마 규칙과 **합치는 자리**. 규칙 구현은 소유자를 따라 갈라져
// 있고(설계서 규칙은 `schema`) 둘을 한 목록으로 내는 이름이 `lintProject`다. 그 판정의
// 근거는 `lint/project.ts`의 머리말에 있다 — 설계서 「lint 규칙」과 어긋나는 자리다.
export type { LintThemeEntry, LintThemePage, ThemeLintInput } from './lint/input'
export { lintThemes } from './lint/index'
export type { ProjectLintInput } from './lint/project'
export { lintProject } from './lint/project'

// 스냅샷 payload 규격과 lint 입력 변환. **패키지에 두는 이유:** api·CLI(`wireb pull`·
// `wireb lint`)·MCP가 같은 모양을 읽는다 — 패키지에 없으면 셋이 모양을 각자 선언한다.
export type {
  SnapshotComment,
  SnapshotLayout,
  SnapshotLayoutTheme,
  SnapshotMenuNode,
  SnapshotPage,
  SnapshotPayload,
} from './snapshot/payload'
export { SNAPSHOT_PAYLOAD_VERSION, SNAPSHOT_RESOURCES, SnapshotPayloadSchema } from './snapshot/payload'
export type { SnapshotLintNote, SnapshotLintNoteKind, SnapshotLintPlan } from './snapshot/lint-input'
export { snapshotToLintInput } from './snapshot/lint-input'
