/**
 * 선택 목록의 규칙(설계서 「설계서 화면 구조」의 «선택» — 여러 노드 선택). **순수하고 던지지 않는다** — 검증 전 문서도 받는다
 * (`edit/safe-walk.ts`).
 *
 * 스토어의 선택은 목록(`selectedNodeIds`)과 기준 노드(`selectedNodeId` — 목록 안의 하나)다. 목록이 지키는 것:
 *
 * | 규칙 | 까닭 |
 * |---|---|
 * | 문서에 있는 노드만 | 지워진 노드(남의 편집 · 되돌리기)는 빠진다 — 그 위에서 지은 일괄 편집은 없는 경로를 건드린다 |
 * | **조상과 자손이 함께 없다** | 고른 노드마다 그 서브트리를 잠근다(설계서 「소프트 잠금」) — 조상이 이미 덮는다. 일괄 삭제가 지운 조상 안의 자손을 다시 지우려 하지 않는다 |
 * | 문서 차례(전위 순회) | 복사 봉투 · 일괄 편집이 이 차례로 짓는다 |
 * | 상한 `MAX_OPS_PER_EDIT` | 고른 것을 한 번에 지우는 묶음이 노드마다 연산 하나다 — 서버가 받는 묶음 상한(`apps/api/src/http/patch-ops.ts`)을 넘는 선택은 지우지도 못한다. 잠금 집합의 상한도 같은 수다(`apps/api/src/ws/protocol.ts`) |
 *
 * **조상 · 자손이 함께 오면 누가 남는가.** `prefer`가 가른다:
 *
 * - `'anchor'` — 새로 누른 노드(기준 노드)가 그것과 관련된 쪽(조상이든 자손이든)을 **대신한다**(Cmd+클릭). 루트를 누르면 루트 하나가
 *   된다(모두의 조상이다). 기준 노드와 무관한 것끼리는 아래 `'outer'`로 가른다.
 * - `'outer'` — 가장 바깥 것들이 남는다(Shift 범위 · 사각형 · 문서가 바뀐 뒤의 정리).
 *
 * 기준 노드가 목록에서 빠지면 **목록의 마지막**이 기준이 된다. 빈 목록이면 기준도 `null`이다.
 */
import { MAX_OPS_PER_EDIT } from '@wirebound/schema'
import { walkSafely } from '../edit/safe-walk'

export interface NormalizedSelection {
  /** 문서 차례 · 조상/자손 없음 · 상한 이하. */
  ids: readonly string[]
  /** `ids` 안의 하나이거나(비지 않았으면) `null`. */
  anchor: string | null
  /** 상한에 걸려 뺀 수 — 부르는 쪽이 «더 고르지 않았다»를 알린다. */
  capped: number
}

export function normalizeSelection(
  root: unknown,
  ids: readonly string[],
  anchor: string | null,
  prefer: 'anchor' | 'outer' = 'anchor',
  limit: number = MAX_OPS_PER_EDIT,
): NormalizedSelection {
  const order = new Map<string, number>()
  const parentOf = new Map<string, string | null>()
  for (const visit of walkSafely(root)) {
    const id = visit.node.id
    if (typeof id !== 'string' || id === '' || order.has(id)) continue
    order.set(id, order.size)
    parentOf.set(id, typeof visit.parent?.id === 'string' && visit.parent.id !== '' ? visit.parent.id : null)
  }
  /** 그 노드의 조상 — 가까운 것부터. */
  const ancestorsOf = (id: string): string[] => {
    const found: string[] = []
    for (let at = parentOf.get(id) ?? null; at !== null; at = parentOf.get(at) ?? null) found.push(at)
    return found
  }

  let kept = [...new Set(ids)].filter((id) => order.has(id))
  if (prefer === 'anchor' && anchor !== null && kept.includes(anchor)) {
    const above = new Set(ancestorsOf(anchor))
    kept = kept.filter((id) => id === anchor || (!above.has(id) && !ancestorsOf(id).includes(anchor)))
  }
  const chosen = new Set(kept)
  kept = kept.filter((id) => !ancestorsOf(id).some((ancestor) => chosen.has(ancestor)))
  kept.sort((a, b) => order.get(a)! - order.get(b)!)

  let capped = 0
  if (kept.length > limit) {
    capped = kept.length - limit
    const keepAnchor = anchor !== null && kept.includes(anchor) ? anchor : null
    const rest = kept.filter((id) => id !== keepAnchor).slice(0, keepAnchor === null ? limit : limit - 1)
    const allowed = new Set(keepAnchor === null ? rest : [...rest, keepAnchor])
    kept = kept.filter((id) => allowed.has(id))
  }

  const nextAnchor = anchor !== null && kept.includes(anchor) ? anchor : (kept[kept.length - 1] ?? null)
  return { ids: kept, anchor: nextAnchor, capped }
}

/** 두 목록이 같은가 — 차례까지. 스토어가 같은 목록을 새 배열로 갈아 끼우지 않으려고 쓴다(`#apply`는 참조로 견준다). */
export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}
