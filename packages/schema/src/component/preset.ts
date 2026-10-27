/**
 * 프리셋(`ComponentDef.presets`)을 노드로 — 템플릿에 id 를 지어 붙인다. 에디터의 새 노드(`apps/web/src/edit/create-node.ts`) · 설치 때의 검증
 * (`catalog/index.ts` 의 `installCatalog`) · 갤러리 표본이 같은 함수로 짓는다 — 짓는 법이 둘이면 팔레트가 넣는 노드와 검증 · 표본이 잰 노드가 갈린다.
 */
import { cloneJsonValue } from '../clone'
import type { WbNode } from '../node'
import type { ComponentPreset, NodeTemplate } from './define'
import { getComponent } from './registry'

/**
 * 템플릿 하나를 노드로 — 제 id 다음 몸통 → 구역(선언 차례) 차례로 id 를 짓는다. 구역의 `initial` 은 안 붙인다(템플릿이 내용 전부다).
 * props 는 깊게 베낀다 — 배열 · 객체 값을 나누면 넣은 노드를 고칠 때 카탈로그 템플릿이 함께 바뀐다.
 */
export function templateNode(template: NodeTemplate, nextId: () => string): WbNode {
  const node: WbNode = { id: nextId(), type: template.type }
  if (template.props !== undefined) node.props = cloneJsonValue(template.props)
  if (template.variant !== undefined) node.variant = template.variant
  if (template.children !== undefined) node.children = template.children.map((child) => templateNode(child, nextId))
  if (template.zones !== undefined) {
    node.zones = Object.fromEntries(
      Object.entries(template.zones).map(([zone, list]) => [zone, list.map((child) => templateNode(child, nextId))]),
    )
  }
  return node
}

/** 그 타입의 그 프리셋. 설치되지 않은 타입 · 없는 키면 `undefined`. */
export function presetOf(type: string, key: string): ComponentPreset | undefined {
  return getComponent(type)?.presets?.find((preset) => preset.key === key)
}
