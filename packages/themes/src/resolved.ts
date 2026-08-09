import type { TokenTable } from './resolve/tokens'
import type { ThemeAssets } from './spec/assets'
import type { ThemeMeta } from './spec/meta'
import type { ThemePattern } from './spec/patterns'

/** CSS 선언 하나. `["background", "var(--wb-semantic-surface)"]` 같은 꼴이다. */
export type CssDeclaration = readonly [property: string, value: string]

export interface ResolvedLayer {
  base: readonly CssDeclaration[]
  parts: ReadonlyMap<string, readonly CssDeclaration[]>
}

export interface ResolvedComponent extends ResolvedLayer {
  /** 생략됐으면 `structures[0]`이 채워져 있다. */
  structure: string
  variants: ReadonlyMap<string, ResolvedLayer>
  states: ReadonlyMap<string, ResolvedLayer>
  responsive: ReadonlyMap<string, ResolvedLayer>
}

/**
 * 해석이 끝난 테마. **방출이 받는 유일한 입력이고, §4.5가 스냅샷에 저장하라고 한 것**
 * (*"상속 테마는 병합된 결과를 저장한다"*)이 이것이다.
 *
 * **여기에는 wirebound 토큰 참조가 남아 있지 않다**(D2). `"space.6"` 같은 문자열은 전부
 * 풀려서 `var(--wb-space-6)`이 되었거나 이슈가 되어 해석 자체가 `null`을 냈다. 그리고
 * 남은 `var(--wb-…)`은 **이 객체의 `tokens`·`primitives`가 반드시 갖고 있는 이름**이다 —
 * `test/resolve.test.ts`가 방출된 변수 이름을 모아 그 집합과 대조한다. 그 성질이 D2가
 * 해석과 방출을 가른 이유다: 검증을 지나지 않은 값이 `var()`로 CSS에 실리면 안 된다.
 *
 * `Map`을 쓰는 것은 **순서를 계약으로 삼기 위해서**다. 방출은 여기 담긴 순서대로 규칙을
 * 내고, CSS는 같은 특이도에서 나중에 온 것이 이긴다(§6.11의 `@media`가 마지막인 것도
 * 그 성질에 기댄다). 플레인 객체를 쓰면 순회 순서가 키 모양에 따라 갈린다.
 */
export interface ResolvedTheme {
  meta: ThemeMeta
  /** `semantic.primary`·`space.6` → 리터럴. `:root` 변수가 여기서 나온다. */
  tokens: TokenTable
  /** `container.maxWidth`·`grid.gap` → 리터럴. 브레이크포인트는 여기 없다. */
  primitives: ReadonlyMap<string, string>
  /** 이름 → 폭(px). §6.11이 이 값을 `@media` 조건에 직접 쓴다. */
  breakpoints: ReadonlyMap<string, number>
  components: ReadonlyMap<string, ResolvedComponent>
  /** 검증만 끝난 상태로 실린다 — 전개는 이 단계가 만들지 않는다(D7). 방출은 읽지 않는다. */
  patterns: ReadonlyMap<string, ThemePattern>
  assets?: ThemeAssets
}
