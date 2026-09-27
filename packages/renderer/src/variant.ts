import type { ComponentDef, WbNode } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 뷰가 받는 variant — 판정은 여기 한 곳이다.
 *
 * - 카탈로그에 `variantFrom` 이 있으면 그 prop 값(문자열이 아니면 없음). manifest 는 보지 않는다.
 * - manifest 에 그 컴포넌트 선언이 있으면: `node.variant` 가 선언 안이면 그것, 없거나 밖이면 `defaultVariant`.
 *   페이지 데이터는 바꾸지 않는다 — 테마를 되돌리면 원래 variant 로 돌아온다.
 * - 선언이 없으면 `node.variant` 그대로.
 */
export function resolveVariant(
  def: ComponentDef,
  node: WbNode,
  props: Record<string, unknown>,
  manifest: ThemeManifest | undefined,
): string | undefined {
  if (def.variantFrom !== undefined) {
    const value = props[def.variantFrom]
    return typeof value === 'string' ? value : undefined
  }
  const declared = manifest?.components?.[def.type]
  if (declared === undefined) return node.variant
  return declared.variants.some((v) => v.id === node.variant) ? node.variant : declared.defaultVariant
}
