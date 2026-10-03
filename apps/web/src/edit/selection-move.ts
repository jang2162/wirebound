/**
 * 화살표로 고를 다음 노드(설계서 「설계서 화면 구조」의 단축키 — `↑` · `↓` 이전 · 다음, `←` · `→` 부모 · 첫 자식).
 *
 * **순수하고 던지지 않는다** — 검증 전 문서도 받는다(`./safe-walk.ts`).
 *
 * **차례는 구조 트리의 줄 차례다.** 구조 트리는 접는 줄이 없어(`panels/structure-tree.tsx` 의 `StructureNode` 가 자식을 늘 그린다) 보이는
 * 차례가 문서의 전위 순회와 같다. 줄로 그리지 않는 것(노드가 아닌 원소)과 고를 수 없는 것(id 가 빈 노드)은 그 트리처럼 건너뛴다.
 *
 * **남이 잡아 고를 수 없는 노드는 건너뛴다**(`blocked` — 스토어의 `selectionBlockedBy`). `↑` · `↓` 는 그다음 고를 수 있는 줄로 가고,
 * `→` 는 고를 수 있는 첫 자식으로 간다. `←` 는 부모 하나만 본다 — 부모가 막혔으면 그 위도 막혀 있다(잠금은 서브트리를 덮고, 조상을
 * 고르는 것도 막는다 — `packages/schema/src/lock.ts` 의 선택 판정).
 */
import type { WbNode } from '@wirebound/schema'
import { findNodeSafely, walkSafely } from './safe-walk'

export type SelectionMove = 'selectPrev' | 'selectNext' | 'selectParent' | 'selectFirstChild'

function selectable(node: WbNode): boolean {
  return typeof node.id === 'string' && node.id !== ''
}

/** 구조 트리의 줄 차례(위 머리말) — 고를 수 있는 노드의 id. */
export function visibleNodeOrder(root: unknown): string[] {
  return [...walkSafely(root)].filter((visit) => selectable(visit.node)).map((visit) => visit.node.id)
}

/**
 * 다음에 고를 노드. 움직일 곳이 없으면 `null` — 부르는 쪽은 선택을 그대로 둔다.
 *
 * 고른 것이 없거나 문서에 없으면 `↓` 는 첫 줄, `↑` 는 마지막 줄에서 시작한다(고를 수 있는 것 가운데). `←` · `→` 는 기준이 없어 `null`.
 */
export function moveSelection(
  root: unknown,
  selectedId: string | null,
  move: SelectionMove,
  blocked: (nodeId: string) => boolean,
): string | null {
  const order = visibleNodeOrder(root)
  const at = selectedId === null ? -1 : order.indexOf(selectedId)

  if (move === 'selectNext' || move === 'selectPrev') {
    const step = move === 'selectNext' ? 1 : -1
    let index = at === -1 ? (step === 1 ? 0 : order.length - 1) : at + step
    for (; index >= 0 && index < order.length; index += step) {
      const id = order[index]!
      if (!blocked(id)) return id
    }
    return null
  }

  if (at === -1 || selectedId === null) return null

  if (move === 'selectParent') {
    for (const visit of walkSafely(root)) {
      if (visit.node.id !== selectedId) continue
      const parent = visit.parent
      if (parent === null || !selectable(parent) || blocked(parent.id)) return null
      return parent.id
    }
    return null
  }

  const node = findNodeSafely(root, selectedId)
  const children = Array.isArray(node?.children) ? node.children : []
  for (const child of children) {
    if (typeof child !== 'object' || child === null || Array.isArray(child)) continue
    if (selectable(child) && !blocked(child.id)) return child.id
  }
  return null
}

/**
 * **Cmd+A 가 고를 노드** — 기준 노드의 형제 모두(그 노드 포함 · 문서 차례). 기준 노드가 없거나 루트거나 문서에 없으면 루트의 자식 모두다
 * (설계서 「설계서 화면 구조」의 «고르는 법»). 남이 잡은 노드 · 상한은 스토어의 `selectMany`가 거른다. 노드가 아닌 원소 · 빈 id 는 뺀다.
 */
export function siblingIds(root: unknown, anchorId: string | null): string[] {
  let parent: WbNode | null = null
  for (const visit of walkSafely(root)) {
    if (visit.parent === null && (anchorId === null || visit.node.id === anchorId)) {
      parent = visit.node
      break
    }
    if (visit.node.id === anchorId) {
      parent = visit.parent
      break
    }
  }
  if (parent === null) {
    const first = walkSafely(root).next()
    parent = first.done === true ? null : first.value.node
  }
  const children = Array.isArray(parent?.children) ? parent.children : []
  return children.filter((child): child is WbNode => typeof child === 'object' && child !== null && !Array.isArray(child) && selectable(child)).map((child) => child.id)
}
