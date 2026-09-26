import { Children, cloneElement, createElement, isValidElement, useContext, type ReactElement } from 'react'
import { NodeContext } from './context'
import type { MarkerSpec } from './types'

export function markerAttrs(marker: MarkerSpec | undefined): Record<string, string> {
  if (marker === undefined) return {}
  const out: Record<string, string> = { 'data-wb-marker': marker.placement ?? 'top-start' }
  if (marker.offset !== undefined) out['data-wb-marker-offset'] = `${marker.offset[0]},${marker.offset[1]}`
  return out
}

/** 뷰의 루트 요소. 노드 속성(`data-wb-*`)과 상호작용 핸들러를 붙인다 — 테마가 빠뜨릴 수 없게 여기서 편다. */
export function Root(props: { as?: string; marker?: MarkerSpec } & Record<string, unknown>): ReactElement {
  const binding = useContext(NodeContext)
  if (binding === null) throw new Error('Root 는 뷰 안에서만 쓸 수 있습니다')
  // 렌더 중에 불러도 된다 — `ViewHost` 의 ref 에 적기만 하고 상태를 바꾸지 않는다.
  binding.markRootRendered()
  const { as = 'div', marker, ...rest } = props
  // 노드 속성을 **뒤에** 편다 — 테마가 같은 이름을 넘겨도 노드 것이 이긴다.
  return createElement(as, { ...rest, ...markerAttrs(marker), ...binding.attrs })
}

/** 선택 외곽선이 감쌀 요소를 표시한다. 감싸는 요소를 두면 테마의 레이아웃이 바뀌므로 자식을 복제해 속성만 더한다. */
export function Focus(props: { children: ReactElement }): ReactElement {
  const only = Children.toArray(props.children)
  if (only.length !== 1 || !isValidElement(only[0])) throw new Error('Focus 는 엘리먼트 하나만 감쌉니다')
  return cloneElement(only[0] as ReactElement<Record<string, unknown>>, { 'data-wb-focus': '' })
}
