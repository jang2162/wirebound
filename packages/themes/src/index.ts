export const PACKAGE_NAME = '@wirebound/themes'

export type { ThemeMeta } from './spec/meta'
export { EXTENDS_PATTERN, MetaSchema, THEME_ID_PATTERN } from './spec/meta'

export type { ThemeAssets, ThemeFont } from './spec/assets'
export { AssetsSchema, ICON_SETS, PLACEHOLDER_STYLES } from './spec/assets'

export type { ThemeIssue, ThemeIssueCode } from './issue'

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
