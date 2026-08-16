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
 * 박게 되고, 그러면 `THEME_ISSUE_SEVERITY`가 진실이 아니게 된다 — 실제로 그렇게 짰다가
 * 리뷰가 잡았다.
 */
export { THEME_ISSUE_SEVERITY, issue as themeIssue } from './issue'

export type { ThemeTokens } from './spec/tokens'
export { TokensSchema } from './spec/tokens'

export type { TokenNamespace, TokenTable } from './resolve/tokens'
export { SPACE_MAX, TOKEN_NAMESPACES, isTokenReference, resolveTokens } from './resolve/tokens'

// `STYLE_PROPERTIES_BEYOND_SPEC`은 §6.8에 없는 어휘의 목록이다(P4b-1). `apps/web`의
// 케이스가 그중 `treeIndent`가 내는 이름과 `renderer`의 `TREE_INDENT_VAR`를 대조한다 —
// 이 패키지는 `renderer`를 볼 수 없다(§3.3).
export {
  STYLE_PROPERTIES,
  STYLE_PROPERTIES_BEYOND_SPEC,
  cssVarName,
  styleDeclarations,
} from './resolve/style'
export { resolveStyleValue } from './resolve/style'
// P4c-1 T1 — 스타일 값이 `primitives`를 가리키는 문법. `STYLE_PRIMITIVE_NAMESPACES`는
// `TOKEN_NAMESPACES`와 **표가 다른 두 문법**이라 갈라 두었다.
export type { PrimitiveTable } from './resolve/style'
export { STYLE_PRIMITIVE_NAMESPACES, isPrimitiveReference } from './resolve/style'

// P4c-1 T4 — 노드 손잡이 표. **`apps/web`의 대조 케이스가 이것을 렌더러의 구조 기본
// CSS와 통째로 비교한다** — 이 패키지는 `renderer`를 볼 수 없다(§3.3).
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

// P7-1 T1 — 패턴 전개(§6.6). `spec/patterns.ts`가 *"전개는 만들지 않는다(D7)"*로 미뤄 둔
// 자리다. **`apps/web`뿐 아니라 P8(exporter)·P9(MCP)도 이 이름을 부른다** — 패턴 삽입은
// 에이전트가 할 일이기도 하다(§12).
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

// P8-1 — 테마가 고른 구조를 렌더러의 `RenderOptions.structures` 꼴로 낸다. **`apps/web`에
// 있던 것을 옮겼다**: 화면·번들(`packages/exporter`)·P8-3의 api 라우트가 같은 표를 써야
// 한다(P7-3 이월 §8.2 규칙 1). 근거는 그 파일의 머리말에 있다.
export { themeStructures } from './resolve/structures'

export { compileTheme } from './emit/index'

export { SYSTEM_THEME_IDS, systemTheme } from './system/index'
export { ADMIN_THEME } from './system/admin'

// P9-1 — §12.4의 테마 규칙과 **합치는 자리**. 규칙 구현은 소유자를 따라 갈라져 있고
// (설계서 규칙은 `schema`) 둘을 한 목록으로 내는 이름이 `lintProject`다. 그 판정의 근거는
// `lint/project.ts`의 머리말에 있다 — 설계서 §12.4와 어긋나는 자리다.
export type { LintThemeEntry, LintThemePage, ThemeLintInput } from './lint/input'
export { lintThemes } from './lint/index'
export type { ProjectLintInput } from './lint/project'
export { lintProject } from './lint/project'

// P9-3 T3 — 스냅샷 payload 규격과 lint 입력 변환. **`apps/api/src/services/snapshot-payload.ts`
// 에서 올라왔다**(D2). 그 파일이 *"P9의 `wireb pull`이 이 규격을 필요로 하면 그때 패키지로
// 올린다"*로 조건을 적어 뒀고, `wireb lint`가 그 조건이다 — 안 올리면 CLI가 모양을 다시
// 선언하고 P9-4의 MCP가 또 선언한다.
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
