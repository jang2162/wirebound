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

  if (node.variant !== undefined) {
    attrs['data-wb-variant'] = node.variant
  }

  const states = activeStates(def, props)
  if (states.length > 0) {
    attrs['data-wb-state'] = states.join(' ')
  }

  return attrs
}

export function partAttrs(part: string): { 'data-wb-part': string } {
  return { 'data-wb-part': part }
}
