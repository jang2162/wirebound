/**
 * **구조 트리 줄 위의 놓을 자리** — 포인터 밑 줄(`[data-tree-row]`)과 그 줄 안의 띠로 판정(`edit/structure-drop.ts`)에 묻는다. 트리 줄
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
import { structureDropTarget, type Placing, type StructureDrop } from '../edit/structure-drop'
import { dropBand, type DropBand } from '../tree/tree-drop'

/** 트리 줄의 판정 — 표시할 자리와, 놓는 순간 다시 물을 대상 · 띠. */
export interface TreeHint {
  hint: DropHint<StructureDrop>
  overId: string
  band: DropBand
}

export function structureTreeHint(
  tree: HTMLElement | null,
  document: PageDocument,
  placing: Placing,
  point: DragPoint,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): TreeHint | null {
  const row = elementAt(tree, '[data-tree-row]', point)
  const overId = row?.dataset['treeId']
  if (row === null || overId === undefined || overId === '') return null
  const box = row.getBoundingClientRect()
  const band = dropBand(point.y - box.top, box.height, acceptsChildren(findNodeSafely(document.root, overId)))
  const target = structureDropTarget(document, placing, overId, band, blockedBy)
  if (target === null) return null
  return {
    hint: {
      value: target,
      rect: { left: box.left, top: box.top, width: box.width, height: box.height },
      placement: target.placement,
    },
    overId,
    band,
  }
}
