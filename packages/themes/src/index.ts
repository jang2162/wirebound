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

export { STYLE_PROPERTIES, cssVarName, styleDeclarations } from './resolve/style'
export { resolveStyleValue } from './resolve/style'

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

export { compileTheme } from './emit/index'

export { SYSTEM_THEME_IDS, systemTheme } from './system/index'
export { ADMIN_THEME } from './system/admin'
