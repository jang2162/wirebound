/**
 * **구조 트리 줄 `…` 의 상태 명령**(설계서 「설계서 화면 구조」 «화면 상태») — «상태별로 나누기» · «상태 나누기 풀기» · «이 상태 가지
 * 지우기(기본으로 돌아감)». 묶음은 schema 의 연산(`splitIntoStatesOps` · `unsplitStatesOps`)이 짓고, 여기는 할 수 없는 판의 까닭과 확인
 * 상자가 보일 것을 짓는다. 잠금은 판정하지 않는다 — 부르는 쪽(`panels/structure-toolbar.tsx`)이 고른 노드의 잠금과 `editBlockedBy` 로 끈다.
 *
 * 던지지 않는다 — 렌더 중에 불리고 검증 전 문서가 들어온다(`./structure-actions.ts` 머리말과 같은 계약).
 */
import {
  createNodeId,
  DEFAULT_CASE,
  nodeRowLabel,
  splitIntoStatesOps,
  unsplitStatesOps,
  viewStateName,
  walkNodes,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { findNodeSafely, walkSafely } from './safe-walk'

export const SPLIT_LABEL = '상태별로 나누기'
export const UNSPLIT_LABEL = '상태 나누기 풀기'
export const REMOVE_CASE_LABEL = '이 상태 가지 지우기(기본으로 돌아감)'

export const SPLIT_PICK_REASON = '나눌 노드를 고르세요'
export const SPLIT_ROOT_REASON = '페이지 루트는 나눌 수 없습니다'
export const SPLIT_CASE_REASON = '가지는 나눌 수 없습니다 — 가지 안의 노드를 고르세요'
export const SPLIT_SIBLINGS_REASON = '같은 부모의 이어진 형제만 한 영역으로 나눌 수 있습니다'

export type Plan<T extends object = object> = ({ ops: PatchOp[] } & T) | { reason: string }

function caseState(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null
  const record = node as { type?: unknown; props?: { state?: unknown } }
  return record.type === 'StateCase' && typeof record.props?.state === 'string' ? record.props.state : null
}

/** 고른 노드(들)를 상태 영역으로 감싸는 묶음 — 지금 상태가 기본이 아니면 그 상태의 가지도 기본 가지의 복사로 함께. */
export function splitPlan(
  doc: PageDocument,
  nodeIds: readonly string[],
  viewState: string | null,
  newId: () => string = createNodeId,
): Plan {
  if (nodeIds.length === 0) return { reason: SPLIT_PICK_REASON }
  const rootId: unknown = doc.root?.id
  if (nodeIds.some((id) => id === rootId)) return { reason: SPLIT_ROOT_REASON }
  if (nodeIds.some((id) => findNodeSafely(doc.root, id)?.type === 'StateCase')) return { reason: SPLIT_CASE_REASON }
  let ops: PatchOp[] | null
  try {
    ops = splitIntoStatesOps(doc, [...nodeIds], viewState, newId)
  } catch {
    ops = null
  }
  return ops === null ? { reason: SPLIT_SIBLINGS_REASON } : { ops }
}

/** 확인 상자가 보일 것 — 지워지는 가지(상태 이름)와 그 안 노드(가지 자신은 빼고). */
export interface UnsplitShown {
  switchId: string
  cases: { id: string; name: string }[]
  nodes: { id: string; label: string }[]
}

/** 풀기 확인의 견줄 열쇠 — 지워지는 가지 id 와 그 안 노드 id 전부를 정렬해 이은 글(`panels/structure-toolbar.tsx` 의 `UnsplitAsk`). */
export function unsplitKey(shown: UnsplitShown): string {
  return [...shown.cases.map((entry) => entry.id), ...shown.nodes.map((entry) => entry.id)].sort().join(',')
}

/** 상태 영역을 벗기는 묶음과, 지워지는 다른 가지. `null` 이면 그 노드는 영역이 아니다. */
export function unsplitPlan(doc: PageDocument, switchId: string): (Plan & { shown?: UnsplitShown }) | null {
  const node = findNodeSafely(doc.root, switchId)
  if (node === undefined || node.type !== 'StateSwitch') return null
  let ops: PatchOp[] | null
  try {
    ops = unsplitStatesOps(doc, switchId)
  } catch {
    ops = null
  }
  if (ops === null) return { reason: '기본 가지가 정확히 하나여야 풀 수 있습니다' }
  const children = Array.isArray(node.children) ? node.children : []
  const others = children.filter((child) => caseState(child) !== DEFAULT_CASE)
  const cases = others.map((child) => ({ id: child.id, name: viewStateName(doc.viewStates, caseState(child) ?? '') }))
  const nodes: { id: string; label: string }[] = []
  for (const other of others) {
    for (const visit of walkSafely(other)) {
      if (visit.node !== other) nodes.push({ id: visit.node.id, label: nodeRowLabel(visit.node, doc.viewStates) })
    }
  }
  return { ops, shown: { switchId, cases, nodes } }
}

/** 기본이 아닌 가지를 지우는 묶음 — 그 상태는 이 영역에서 기본 가지를 따라간다. `null` 이면 그 노드는 기본이 아닌 가지가 아니다. */
export function removeCasePlan(doc: PageDocument, caseId: string): Plan | null {
  try {
    for (const visit of walkNodes(doc.root)) {
      if (visit.node.id !== caseId) continue
      const state = caseState(visit.node)
      if (state === null || state === DEFAULT_CASE) return null
      return { ops: [{ op: 'remove', path: visit.path }] }
    }
  } catch {
    return null
  }
  return null
}

/** 고른 노드가 기본이 아닌 가지면 그 상태 id. */
export function nonDefaultCase(doc: PageDocument | null, nodeId: string | null): string | null {
  if (doc === null || nodeId === null) return null
  const node: WbNode | undefined = findNodeSafely(doc.root, nodeId)
  const state = caseState(node)
  return state === null || state === DEFAULT_CASE ? null : state
}
