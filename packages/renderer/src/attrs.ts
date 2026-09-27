import type { ComponentDef } from '@wirebound/schema'
import type { SyntheticEvent } from 'react'

/**
 * 렌더러가 노드 루트에 싣는 속성 — 뷰가 `Root`에 편다. `data-wb-structure`·`data-wb-part`는 여기 없다 — 기본 뷰의 마크업
 * 훅이라 `@wirebound/theme-sdk`의 기본 뷰가 스스로 단다.
 */
// **`interface`가 아니라 `type`이다** — 뷰에 넘기는 `NodeBinding.attrs`가 색인 시그니처(`Record`)라, 인터페이스는 그 자리에
// 들어가지 못한다(TS2322).
export type WbAttrs = {
  'data-wb-id': string
  'data-wb-component': string
  'data-wb-variant'?: string
  'data-wb-state'?: string
}

/**
 * 상호작용 런타임이 노드 루트에 얹는 이벤트 핸들러(설계서 「상호작용」의 「실행」).
 *
 * **속성 계약(`WbAttrs`)이 아니다 — 갈라 둔 이유가 그것이다.** `data-wb-*` 속성은 *"테마가 쓸 수
 * 있는 어휘"*이고 DOM에 나가 셀렉터가 된다. 이쪽은 DOM 속성이 아니라 React의
 * 이벤트 prop이라 **셀렉터로 겨냥할 수 없고 테마가 볼 일이 없다.** 한 인터페이스에 섞으면
 * 속성 계약을 읽는 사람이 핸들러까지 셀렉터 어휘로 읽는다.
 *
 * **꺼져 있으면 키가 하나도 없다**(`render.tsx`의 `NO_HANDLERS`) — 상호작용을 켜지 않은
 * 렌더는 속성 객체를 그대로 받는다.
 *
 * 이벤트 타입이 `SyntheticEvent`인 것은 이 객체가 `<div>`·`<form>`·`<section>` 등 **아무
 * 태그에나** 펼쳐지기 때문이다. 더 좁은 타입(`MouseEvent<HTMLDivElement>`)을 쓰면 그 태그로
 * 좁혀지고, 그것은 뷰가 무엇을 그리는지에 렌더러가 매이는 것이다.
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
