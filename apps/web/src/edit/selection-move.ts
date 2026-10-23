/**
 * 화살표로 고를 다음 노드(설계서 「설계서 화면 구조」의 단축키 — `↑` · `↓` 이전 · 다음, `←` · `→` 부모 · 첫 자식).
 *
 * **순수하고 던지지 않는다** — 검증 전 문서도 받는다(`./safe-walk.ts`).
 *
 * **차례는 구조 트리의 보이는 줄 차례다** — 문서의 전위 순회에서 접힌 줄(`tree/collapse.ts`) 안을 뺀 것. 접힌 줄 자체는 남는다. 줄로 그리지
 * 않는 것(노드가 아닌 원소)과 고를 수 없는 것(id 가 빈 노드)은 그 트리처럼 건너뛴다. 고른 노드가 접힌 줄 안에 숨었으면(접은 뒤 아직 안 고름)
 * 그 노드를 가리는 보이는 조상에서 움직인다.
 *
 * **← → 는 고르기 전에 접고 편다**(`foldStep` — 표준 트리): → 는 접혔으면 펴고 펴졌으면 첫 자식, ← 는 펴졌으면 접고 접혔으면 부모. 자식 줄이
 * 없는 노드는 접고 펼 것이 없어 곧바로 고른다.
 *
 * **남이 잡아 고를 수 없는 노드는 건너뛴다**(`blocked` — 스토어의 `selectionBlockedBy`). `↑` · `↓` 는 그다음 고를 수 있는 줄로 가고,
 * `→` 는 고를 수 있는 첫 자식으로 간다. `←` 는 부모 하나만 본다 — 부모가 막혔으면 그 위도 막혀 있다(잠금은 서브트리를 덮고, 조상을
 * 고르는 것도 막는다 — `packages/schema/src/lock.ts` 의 선택 판정).
 */
import { BODY_ZONE, childLists, zoneList, type WbNode } from '@wirebound/schema'
import { findNodeSafely, walkSafely } from './safe-walk'

export type SelectionMove = 'selectPrev' | 'selectNext' | 'selectParent' | 'selectFirstChild'

function selectable(node: WbNode): boolean {
  return typeof node.id === 'string' && node.id !== ''
}

const NONE: ReadonlySet<string> = new Set()

/** 구조 트리의 보이는 줄 차례(위 머리말) — 고를 수 있는 노드의 id. */
export function visibleNodeOrder(root: unknown, collapsed: ReadonlySet<string> = NONE): string[] {
  const order: string[] = []
  const hidden = new Set<WbNode>()
  for (const visit of walkSafely(root)) {
    const parent = visit.parent
    if (parent !== null && (hidden.has(parent) || (selectable(parent) && collapsed.has(parent.id)))) {
      hidden.add(visit.node)
      continue
    }
    if (selectable(visit.node)) order.push(visit.node.id)
  }
  return order
}

/** 루트부터 부모까지의 id — 문서에 없거나 루트면 빈 목록. 고른 노드를 가린 접힘을 풀 때 쓴다(`panels/structure-tree.tsx`). */
export function ancestorIds(root: unknown, nodeId: string): string[] {
  const parents = new Map<WbNode, WbNode | null>()
  for (const visit of walkSafely(root)) {
    parents.set(visit.node, visit.parent)
    if (visit.node.id !== nodeId) continue
    const out: string[] = []
    for (let parent = visit.parent; parent !== null; parent = parents.get(parent) ?? null) {
      if (selectable(parent)) out.unshift(parent.id)
    }
    return out
  }
  return []
}

/** 노드의 자식 전부 — 몸통 · 구역의 차례(`childLists`)로 이은 것. 검증 전 노드에서 던지지 않는다. */
function childrenOf(node: unknown): unknown[] {
  return childLists(node).flatMap((entry) => entry.list)
}

/** 고를 수 있는 자식 줄이 있는가 — 펼침 단추가 서는 줄이다. 구역 안 노드도 자식 줄이다. */
export function hasChildRows(node: WbNode | undefined): boolean {
  return childrenOf(node).some((child) => typeof child === 'object' && child !== null && !Array.isArray(child))
}

/**
 * ← → 가 고르기 전에 할 접기 · 펴기(위 머리말). 없으면 `null` — 부르는 쪽이 `moveSelection` 으로 고른다.
 */
export function foldStep(
  root: unknown,
  selectedId: string | null,
  move: SelectionMove,
  collapsed: ReadonlySet<string>,
): { fold: 'collapse' | 'expand'; id: string } | null {
  if (selectedId === null || (move !== 'selectParent' && move !== 'selectFirstChild')) return null
  if (!hasChildRows(findNodeSafely(root, selectedId))) return null
  const folded = collapsed.has(selectedId)
  if (move === 'selectFirstChild') return folded ? { fold: 'expand', id: selectedId } : null
  return folded ? null : { fold: 'collapse', id: selectedId }
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
  collapsed: ReadonlySet<string> = NONE,
): string | null {
  const order = visibleNodeOrder(root, collapsed)
  const at = selectedId === null ? -1 : visibleAt(root, order, selectedId)

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
  for (const item of childrenOf(node)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const child = item as WbNode
    if (selectable(child) && !blocked(child.id)) return child.id
  }
  return null
}

/** 보이는 차례에서 그 노드의 자리 — 숨었으면 가장 가까운 보이는 조상의 자리, 문서에 없으면 -1. */
function visibleAt(root: unknown, order: readonly string[], nodeId: string): number {
  const own = order.indexOf(nodeId)
  if (own !== -1) return own
  const ancestors = ancestorIds(root, nodeId)
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const at = order.indexOf(ancestors[index]!)
    if (at !== -1) return at
  }
  return -1
}

/**
 * **Cmd+A 가 고를 노드** — 기준 노드의 형제 모두(그 노드 포함 · 문서 차례 · 그 노드가 선 구역 안). 기준 노드가 없거나 루트거나 문서에 없으면 루트의 자식 모두다
 * (설계서 「설계서 화면 구조」의 «고르는 법»). 남이 잡은 노드 · 상한은 스토어의 `selectMany`가 거른다. 노드가 아닌 원소 · 빈 id 는 뺀다.
 */
export function siblingIds(root: unknown, anchorId: string | null): string[] {
  let parent: WbNode | null = null
  // 형제는 기준 노드가 선 구역 안의 것이다 — 루트 · 기준이 없으면 루트의 몸통.
  let zone = BODY_ZONE
  for (const visit of walkSafely(root)) {
    if (visit.parent === null && (anchorId === null || visit.node.id === anchorId)) {
      parent = visit.node
      break
    }
    if (visit.node.id === anchorId) {
      parent = visit.parent
      zone = visit.zone ?? BODY_ZONE
      break
    }
  }
  if (parent === null) {
    const first = walkSafely(root).next()
    parent = first.done === true ? null : first.value.node
  }
  const children = zoneList(parent, zone)
  return children
    .filter((child): child is WbNode => typeof child === 'object' && child !== null && !Array.isArray(child) && selectable(child as WbNode))
    .map((child) => child.id)
}
