import type { ComponentDef, WbNode } from '@wirebound/schema'
import type { SyntheticEvent } from 'react'

/** 렌더러와 테마 사이의 전체 계약. 설계서 「컴파일」 */
export interface WbAttrs {
  'data-wb-id': string
  'data-wb-component': string
  'data-wb-structure': string
  'data-wb-variant'?: string
  'data-wb-state'?: string
}

/**
 * 상호작용 런타임이 노드 루트에 얹는 이벤트 핸들러(설계서 「상호작용」의 「실행」).
 *
 * **「컴파일」의 속성 계약이 아니다 — 갈라 둔 이유가 그것이다.** 여섯 속성은 *"테마가 쓸 수
 * 있는 어휘"*이고 DOM에 `data-*`로 나가 셀렉터가 된다. 이쪽은 DOM 속성이 아니라 React의
 * 이벤트 prop이라 **셀렉터로 겨냥할 수 없고 테마가 볼 일이 없다.** 한 인터페이스에 섞으면
 * *"여섯이 전체 계약"*이라는 「컴파일」의 문장이 읽는 사람에게 거짓으로 보인다.
 *
 * **꺼져 있으면 키가 하나도 없다**(`render.tsx`의 `NO_HANDLERS`) — 상호작용을 켜지 않은
 * 렌더는 `nodeAttrs`가 낸 객체를 그대로 받는다.
 *
 * 이벤트 타입이 `SyntheticEvent`인 것은 이 객체가 `<div>`·`<form>`·`<section>` 등 **아무
 * 태그에나** 펼쳐지기 때문이다. 더 좁은 타입(`MouseEvent<HTMLDivElement>`)을 쓰면 그 태그로
 * 좁혀지고, 그것은 구조 구현체가 무엇을 그리는지에 렌더러가 매이는 것이다.
 */
export interface WbHandlers {
  onClick?: (event: SyntheticEvent) => void
  onChange?: (event: SyntheticEvent) => void
  onSubmit?: (event: SyntheticEvent) => void
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
 * **`variantFrom`이 `node.variant`를 이긴다.** 근거는 `test/attrs.test.ts`의
 * *"variantFrom이 있으면 node.variant보다 prop이 이긴다"* 케이스에 적었다. 요지 둘:
 * `variantFrom`이 있다는 것은 *"이 prop이 단일 진실"*이라는 선언이고, 지지 않으면
 * 같은 prop에서 파생된 것들끼리 어긋난다(`Text`는 `role`로 태그도 고른다).
 *
 * **prop 값이 문자열이 아니면 아무것도 내지 않는다.** 렌더러는 서버 검증 **전** 문서를
 * 받을 수 있으므로(「정방향 흐름」) 값의 타입을 믿지 않는다 — 다른 자리(`readString`·`shapeError`)와
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
