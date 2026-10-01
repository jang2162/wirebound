/**
 * 구조 트리의 **놓을 자리 판정** — 끄는 노드를 포인터 밑 노드의 어느 띠에 놓으면 어디로 가는가(spec 「드래그로 옮기기」). 끌기 장치
 * (`drag/use-pointer-drag.ts`)의 `onOver`가 부르고, 놓으면 `useStructureCommands`의 `dropTo`가 같은 자리로 `moveNodeOps`를 낸다.
 *
 * **순수 함수이고 던지지 않는다** — `./structure-actions.ts`와 같은 층 · 같은 계약이다(순회가 `walkSafely`를 지난다).
 *
 * | 포인터 밑 | 띠 | 결과 |
 * |---|---|---|
 * | 자식을 받는 컴포넌트(카탈로그 `children: 'many'` · `acceptsChildren`) | 안 | 그 노드의 마지막 자식 |
 * | 자식을 안 받는 컴포넌트 | 안 | `null` |
 * | 뿌리 아닌 노드 | 앞 · 뒤 | 그 노드의 형제(그 앞 · 뒤) |
 * | 뿌리 | 앞 · 뒤 | `null` — 뿌리는 형제가 없다 |
 * | 끄는 노드 자신 · 그 자손 | 어느 띠든 | `null` |
 * | 끄는 노드가 뿌리 | — | `null` — 뿌리는 옮기지 않는다 |
 *
 * **돌려주는 `index`는 «옮긴 뒤 그 부모 안 차례»다** — `moveNodeOps`가 인덱스를 «값을 뺀 배열» 기준으로 읽기 때문이다(`./ops.ts`의
 * `moveNodeOps` 머리말). 메뉴 트리의 판정(`tree/tree-drop.ts`)과 같은 뜻이라 같은 부모 안에서 뒤로 옮기면 자기 몫을 하나 당긴다.
 *
 * **남이 잡은 자리면 `null`이다** — 놓았을 때 낼 편집(`moveNodeOps`)을 지어 그 편집이 부딪치는 잠금을 묻는다(`blockedBy` — 스토어의
 * `editBlockedBy`). 편집으로 묻는 것이 요점이다: 서버가 2차 방어로 묻는 것이 바로 그 편집이고(`@wirebound/schema`의
 * `lockConflictOfOps`), 노드 **고르기**의 판정(`lockedBy`)으로 물으면 놓을 부모 아래 아무 노드의 잠금에도 막힌다. 끄는 노드가 잠긴 자리
 * 안에 있으면 뽑는 자리(`move`의 `from`)가 부딪쳐 어디에도 못 놓는다. **물음은 하나다** — `move`의 `path`는 `from`을 뺀 **뒤**의
 * 좌표인데, 그 판정이 연산마다 좌표를 맞춰 잠긴 자리를 따라가므로(앞쪽 노드를 뒤쪽 형제의 잠긴 서브트리로 옮기는 판 · 잠긴 노드
 * **뒤** 형제 앞으로 옮기는 판 둘 다) 옮기기 전 좌표로 다시 물을 일이 없다.
 *
 * **제자리면 `null`이다** — 보낼 편집이 없다.
 */
import type { NodeLock, PageDocument, PatchOp, WbNode } from '@wirebound/schema'
import type { DropZone } from '../tree/tree-drop'
import { moveNodeOps } from './ops'
import { walkSafely, type SafeVisit } from './safe-walk'
import { acceptsChildren } from './structure-actions'

/** 놓을 자리. `placement`는 표시가 설 띠다. */
export interface StructureDrop {
  parentId: string
  index: number
  placement: DropZone
}

export function structureDropTarget(
  document: PageDocument,
  draggedId: string,
  overId: string,
  zone: DropZone,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): StructureDrop | null {
  if (draggedId === overId) return null
  const dragged = findVisit(document, draggedId)
  const over = findVisit(document, overId)
  if (dragged === null || over === null || dragged.parent === null) return null
  if (contains(dragged.node, overId)) return null

  const fromParentId = dragged.parent.id
  let parentId: unknown
  let insertAt: number
  if (zone === 'inside') {
    if (!acceptsChildren(over.node)) return null
    parentId = over.node.id
    insertAt = Array.isArray(over.node.children) ? over.node.children.length : 0
  } else {
    if (over.parent === null) return null
    parentId = over.parent.id
    insertAt = zone === 'before' ? over.index : over.index + 1
  }
  if (typeof parentId !== 'string') return null

  const sameParent = parentId === fromParentId
  const index = sameParent && dragged.index < insertAt ? insertAt - 1 : insertAt
  if (sameParent && index === dragged.index) return null

  const ops = moveNodeOps(document, draggedId, parentId, index)
  if (ops === null || blockedBy(ops) !== null) return null
  return { parentId, index, placement: zone }
}

function findVisit(document: PageDocument, nodeId: string): SafeVisit | null {
  for (const visit of walkSafely(document.root)) {
    if (visit.node.id === nodeId) return visit
  }
  return null
}

/** `node`의 서브트리(자기 포함)에 `nodeId`가 있나. */
function contains(node: WbNode, nodeId: string): boolean {
  for (const visit of walkSafely(node)) {
    if (visit.node.id === nodeId) return true
  }
  return false
}
