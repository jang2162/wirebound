import { createElement, useContext, type ReactElement } from 'react'
import { ViewNodeContext } from './context'

/**
 * 구역 하나의 자리. `view()` 가 내린 노드 문맥에서 그 구역을 그린 것(`ViewProps.zones[name]`)을 읽어, **비었으면 감싸는 요소째 안 그리고**
 * 있으면 `data-wb-zone="<이름>"` 을 단 요소로 감싼다 — `Root` 가 노드 속성을 펴는 것과 같은 자세다(뷰가 속성을 빠뜨리거나 잘못 적을 수 없다).
 * 에디터는 `data-wb-zone` 으로 캔버스의 구역 상자를 찾는다. 나머지 속성(`data-wb-part` 등 — 테마 CSS 가 겨냥하는 조각 이름)은 그대로 편다.
 */
export function Zone(props: { name: string; as?: string } & Record<string, unknown>): ReactElement | null {
  const node = useContext(ViewNodeContext)
  if (node === null) throw new Error('Zone 은 view() 로 만든 뷰 안에서만 쓸 수 있습니다')
  const { name, as = 'div', ...rest } = props
  const content = node.zones[name]
  if (content === null || content === undefined) return null
  return createElement(as, { ...rest, 'data-wb-zone': name }, content)
}
