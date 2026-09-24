import { z } from 'zod'
import { AssetsSchema, type ThemeAssets } from './assets'
import { ComponentsSchema, type ThemeComponent } from './components'
import { MetaSchema, type ThemeMeta } from './meta'
import { PatternsSchema, type ThemePattern } from './patterns'
import { PrimitivesSchema, type ThemePrimitives } from './primitives'
import { TokensSchema, type ThemeTokens } from './tokens'

/**
 * 설계서 「테마 규격」의 여섯 절을 합친 테마 문서.
 *
 * **규격 합성이지 해석이 아니다.** 여기서 하는 일은 문서의 **모양**을 보는 것뿐이다 —
 * 절 이름이 맞는지, 각 절이 자기 규격을 지키는지. 토큰 참조를 풀고 카탈로그와 대조하고
 * 층 사이 규칙을 보는 것은 `resolveTheme`의 몫이고, 그것이 이 스키마를
 * 통과한 값을 받는다. 그래서 **없는 토큰을 가리키는 테마도 여기서는 통과한다**(케이스로 고정했다).
 *
 * 이 자리가 없으면 `"tokns": {...}` 같은 **문서 수준 오타를 막을 곳이 없다** — 조각 스키마는
 * 자기 절 안쪽만 보기 때문이다.
 *
 * **`meta`만 필수다.** 설계서 「상속과 병합」의 파생 테마가 *"`semantic` 색 몇 개와 `typography.family`만
 * 덮어쓴다"*이므로 나머지 다섯이 없는 문서가 정상이다. 반대로 `meta`가 없으면 그 문서는
 * 가리킬 이름도 상속 대상도 갖지 못한다.
 */
export interface Theme {
  meta: ThemeMeta
  tokens?: ThemeTokens
  primitives?: ThemePrimitives
  components?: Record<string, ThemeComponent>
  patterns?: Record<string, ThemePattern>
  assets?: ThemeAssets
}

export const ThemeSchema: z.ZodType<Theme> = z.strictObject({
  meta: MetaSchema,
  tokens: TokensSchema.optional(),
  primitives: PrimitivesSchema.optional(),
  components: ComponentsSchema.optional(),
  patterns: PatternsSchema.optional(),
  assets: AssetsSchema.optional(),
})
