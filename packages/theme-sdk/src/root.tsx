import { Children, cloneElement, createElement, isValidElement, useContext, type ReactElement } from 'react'
import { NodeContext, ViewNodeContext } from './context'
import { WEIGHT_VAR } from './css-tools'
import { propMarks, stateAria } from './marks'
import type { MarkerSpec } from './types'

export function markerAttrs(marker: MarkerSpec | undefined): Record<string, string> {
  if (marker === undefined) return {}
  const out: Record<string, string> = { 'data-wb-marker': marker.placement ?? 'top-start' }
  if (marker.offset !== undefined) out['data-wb-marker-offset'] = `${marker.offset[0]},${marker.offset[1]}`
  return out
}

/**
 * 뷰의 루트 요소. 노드 속성(`data-wb-*`) · prop 표지 · 상태의 접근성 속성과 상호작용 핸들러를 붙인다 — 테마가 빠뜨릴 수 없게 여기서
 * 편다. 몫(`NodeBinding.weight`)이 있으면 뷰가 준 `style` 에 `--wb-node-weight` 를 **더한다** — 덮으면 뷰가 싣던 노드 변수(Grid 의 열 수 ·
 * Flex 의 방향)가 사라진다. 몫이 없으면 `style` 을 건드리지 않는다(몫 없는 문서의 DOM 이 한 글자도 안 바뀐다).
 */
export function Root(props: { as?: string; marker?: MarkerSpec } & Record<string, unknown>): ReactElement {
  const binding = useContext(NodeContext)
  if (binding === null) throw new Error('Root 는 뷰 안에서만 쓸 수 있습니다')
  const node = useContext(ViewNodeContext)
  // 렌더 중에 불러도 된다 — `ViewHost` 의 ref 에 적기만 하고 상태를 바꾸지 않는다.
  binding.markRootRendered()
  const { as = 'div', marker, ...rest } = props
  if (binding.weight !== undefined) rest.style = { ...(rest.style as object | undefined), [WEIGHT_VAR]: String(binding.weight) }
  const own = node !== null && node.nodeId === binding.attrs['data-wb-id'] ? node : null
  const aria = own === null ? {} : stateAria(own.states)
  // 뷰가 같은 이름을 넘기면 뷰 것이 이긴다 — 그 뜻을 안쪽 요소로 옮기는 뷰는 루트에 `undefined` 를 넘긴다.
  for (const name of Object.keys(aria)) if (name in rest) delete aria[name]
  const marks = own === null ? {} : propMarks(own.type, own.props)
  const { 'data-wb-state': state, ...attrs } = binding.attrs
  // 노드 속성 · 표지는 테마가 넘긴 같은 이름을 이긴다. **켜졌다 꺼지는 것(불리언 표지 · 상태 · 접근성 속성)을 늘 있는 것 뒤에 둔다** —
  // React 는 다시 그릴 때 새로 선 속성을 요소 끝에 붙여, 늘 있는 것(enum 표지) 앞에 두면 처음부터 켜고 그린 판과 속성 차례가 갈린다(내보낸
  // 번들과 웹 앱의 `outerHTML` 을 글자로 견주는 `packages/exporter/test/runtime-bundle.test.ts` 가 그 차이로 죽는다).
  const values = Object.fromEntries(Object.entries(marks).filter(([, value]) => value !== ''))
  const flags = Object.fromEntries(Object.entries(marks).filter(([, value]) => value === ''))
  return createElement(as, {
    ...rest,
    ...markerAttrs(marker),
    ...attrs,
    ...values,
    ...flags,
    'data-wb-state': state,
    ...aria,
  })
}

/** 선택 외곽선이 감쌀 요소를 표시한다. 감싸는 요소를 두면 테마의 레이아웃이 바뀌므로 자식을 복제해 속성만 더한다. */
export function Focus(props: { children: ReactElement }): ReactElement {
  const only = Children.toArray(props.children)
  if (only.length !== 1 || !isValidElement(only[0])) throw new Error('Focus 는 엘리먼트 하나만 감쌉니다')
  return cloneElement(only[0] as ReactElement<Record<string, unknown>>, { 'data-wb-focus': '' })
}
