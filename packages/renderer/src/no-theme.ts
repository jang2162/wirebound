import type { ThemeDefinition } from '@wirebound/theme-sdk'

/**
 * **테마 없음** — manifest 가 아무것도 선언하지 않고 뷰도 없어, 모든 노드를 SDK 기본 뷰로 그린다.
 *
 * 테마를 받지 않는 호출자(내보내기 — api 는 테마 코드를 싣지 않는다)가 넘기는 값이다. 선언한 variant 가 없으므로
 * 노드의 `variant` 는 그대로 `data-wb-variant` 에 실린다(`variant.ts` 의 `resolveVariant`).
 */
export const NO_THEME: ThemeDefinition = {
  manifest: { id: 'none', name: '테마 없음', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } },
  views: {},
}
