import type { ComponentDef, WbNode } from '@wirebound/schema'

/** 렌더러와 테마 사이의 전체 계약. 설계 문서 §6.11 */
export interface WbAttrs {
  'data-wb-id': string
  'data-wb-component': string
  'data-wb-structure': string
  'data-wb-variant'?: string
  'data-wb-state'?: string
}

/** 선언된 상태 중 같은 이름의 prop이 true인 것을 선언 순서대로 고른다. */
export function activeStates(def: ComponentDef, props: Record<string, unknown>): string[] {
  return def.states.filter((state) => props[state] === true)
}

export function nodeAttrs(
  node: WbNode,
  def: ComponentDef,
  structure: string,
  props: Record<string, unknown>,
): WbAttrs {
  const attrs: WbAttrs = {
    'data-wb-id': node.id,
    'data-wb-component': node.type,
    'data-wb-structure': structure,
  }

  const variant = variantOf(node, def, props)
  if (variant !== undefined) {
    attrs['data-wb-variant'] = variant
  }

  const states = activeStates(def, props)
  if (states.length > 0) {
    attrs['data-wb-state'] = states.join(' ')
  }

  return attrs
}

/**
 * `data-wb-variant`에 실을 값.
 *
 * **재라 #4 — `variantFrom`이 `node.variant`를 이긴다.** 근거는
 * `test/attrs.test.ts`의 같은 이름 케이스에 적었다. 요지 둘:
 * `variantFrom`이 있다는 것은 *"이 prop이 단일 진실"*이라는 선언이고, 지지 않으면
 * 같은 prop에서 파생된 것들끼리 어긋난다(`Text`는 `role`로 태그도 고른다).
 *
 * **prop 값이 문자열이 아니면 아무것도 내지 않는다.** 렌더러는 서버 검증 **전** 문서를
 * 받을 수 있으므로(§7.1) 값의 타입을 믿지 않는다 — 다른 자리(`readString`·`shapeError`)와
 * 같은 태도다.
 */
function variantOf(
  node: WbNode,
  def: ComponentDef,
  props: Record<string, unknown>,
): string | undefined {
  if (def.variantFrom !== undefined) {
    const derived = props[def.variantFrom]
    return typeof derived === 'string' ? derived : undefined
  }
  return node.variant
}

export function partAttrs(part: string): { 'data-wb-part': string } {
  return { 'data-wb-part': part }
}
