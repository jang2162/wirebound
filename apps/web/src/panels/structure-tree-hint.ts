/**
 * **구조 트리 줄 위의 놓을 자리** — 포인터 밑 줄(`[data-tree-row]`)과 그 줄 안의 띠로 판정(`edit/structure-drop.ts`)에 묻는다. 구역 줄
 * (`[data-tree-zone-row]`)이면 그 구역의 끝이다(띠 «안»). 트리 줄
 * 끌기(`panels/structure-tree.tsx`)와 경로 층(`drag/use-placement.ts` — 캔버스 손잡이 · 목록 카드가 트리 위를 지날 때)이 같은 이 함수를
 * 부른다. 경로 층이 트리 컴포넌트 파일을 읽으면 그 파일이 경로 층의 공급 훅을 읽어 고리가 되므로 따로 둔다.
 *
 * 띠는 줄의 세로 자리다 — 트리는 늘 위아래로 쌓인다(`tree/tree-drop.ts`의 `dropBand`: 받는 노드는 위 25% · 가운데 · 아래 25%, 안 받는
 * 노드는 반씩).
 */
import type { NodeLock, PageDocument, PatchOp } from '@wirebound/schema'
import { elementAt, type DragPoint, type DropHint } from '../drag/use-pointer-drag'
import { findNodeSafely } from '../edit/safe-walk'
import { acceptsChildren } from '../edit/structure-actions'
import { dropRefusal, structureDropTarget, zoneDropRefusal, zoneDropTarget, type Placing, type StructureDrop } from '../edit/structure-drop'
import { dropBand, type DropBand } from '../tree/tree-drop'

/** 트리 줄의 판정 — 표시할 자리와, 놓는 순간 다시 물을 대상(노드 + 띠 · 구역 줄 — 그 구역 끝). */
export interface TreeHint {
  hint: DropHint<StructureDrop>
  over: { overId: string; band: DropBand } | { zoneOf: string; zone: string }
}

/** 포인터 밑의 트리 대상 — 노드 줄과 그 띠, 또는 구역 줄(`panels/structure-tree.tsx` 의 `ZoneRow` — 띠 없이 «안», 그 구역 끝). */
type TreeOver =
  | { row: HTMLElement; over: { overId: string; band: DropBand } }
  | { row: HTMLElement; over: { zoneOf: string; zone: string } }

function treeOver(tree: HTMLElement | null, document: PageDocument, point: DragPoint): TreeOver | null {
  const row = elementAt(tree, '[data-tree-row]', point)
  const overId = row?.dataset['treeId']
  if (row !== null && overId !== undefined && overId !== '') {
    const box = row.getBoundingClientRect()
    return { row, over: { overId, band: dropBand(point.y - box.top, box.height, acceptsChildren(findNodeSafely(document.root, overId))) } }
  }
  const zoneRow = elementAt(tree, '[data-tree-zone-row]', point)
  const zoneOf = zoneRow?.dataset['treeZoneParent']
  const zone = zoneRow?.dataset['treeZoneName']
  if (zoneRow === null || zoneOf === undefined || zone === undefined) return null
  return { row: zoneRow, over: { zoneOf, zone } }
}

export function structureTreeHint(
  tree: HTMLElement | null,
  document: PageDocument,
  placing: Placing,
  point: DragPoint,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): TreeHint | null {
  const at = treeOver(tree, document, point)
  if (at === null) return null
  const { over } = at
  const target =
    'zoneOf' in over
      ? zoneDropTarget(document, placing, over.zoneOf, over.zone, blockedBy)
      : structureDropTarget(document, placing, over.overId, over.band, blockedBy)
  if (target === null) return null
  const box = at.row.getBoundingClientRect()
  return {
    hint: {
      value: target,
      rect: { left: box.left, top: box.top, width: box.width, height: box.height },
      placement: target.placement,
    },
    over,
  }
}

/** 포인터 밑 트리 줄에 못 놓는 까닭(받는 타입 · 설 자리 — `edit/structure-drop.ts` 의 `fitRefusal`). 없으면 `null`. */
export function structureTreeRefusal(tree: HTMLElement | null, document: PageDocument, placing: Placing, point: DragPoint): string | null {
  const at = treeOver(tree, document, point)
  if (at === null) return null
  const { over } = at
  return 'zoneOf' in over
    ? zoneDropRefusal(document, placing, over.zoneOf, over.zone)
    : dropRefusal(document, placing, over.overId, over.band)
}
