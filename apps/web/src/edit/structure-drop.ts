/**
 * **놓을 자리 판정** — 끄는 것(옮길 노드 · 넣을 새 타입)을 포인터 밑 노드의 어느 띠에 놓으면 어디로 가는가(spec
 * `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「놓을 자리 판정」). 구조 트리 줄 · 캔버스 손잡이 · 컴포넌트 목록 카드가
 * 끌기 장치(`drag/use-pointer-drag.ts`)의 `onOver`에서 같은 이 함수를 부른다 — 트리 줄은 `panels/structure-tree.tsx`, 나머지는 경로 층
 * `drag/use-placement.ts`를 지난다. 놓으면 같은 자리로 `dropOps`가 편집을 짓는다.
 *
 * **순수 함수이고 던지지 않는다** — `./structure-actions.ts`와 같은 층 · 같은 계약이다(순회가 `walkSafely`를 지난다).
 *
 * | 포인터 밑 | 띠 | 결과 |
 * |---|---|---|
 * | 자식을 받는 컴포넌트(카탈로그 `children: 'many'` · `acceptsChildren`) | 안 | 그 노드의 마지막 자식 |
 * | 자식을 안 받는 컴포넌트 | 안 | `null` |
 * | 부모가 자식을 안 받는 노드(검증 전 문서) | 앞 · 뒤 | `null` — 형제 자리는 그 부모 «안» 이다 |
 * | 뿌리 아닌 노드 | 앞 · 뒤 | 그 노드의 형제(그 앞 · 뒤) |
 * | 뿌리 | 앞 · 뒤 | `null` — 뿌리는 형제가 없다 |
 * | 끄는 노드 자신 · 그 자손 | 어느 띠든 | `null` |
 * | 끄는 노드가 뿌리 | — | `null` — 뿌리는 옮기지 않는다 |
 *
 * **«안»이 묻는 것은 대상이다** — 새 타입이 무엇이든 대상이 자식을 받는지만 본다. 카탈로그에 «이 부모에는 이 타입만» 같은 규칙이 없다.
 *
 * **돌려주는 `index`는 «옮긴 뒤 그 부모 안 차례»다** — `moveNodeOps`가 인덱스를 «값을 뺀 배열» 기준으로 읽기 때문이다(`./ops.ts`의
 * `moveNodeOps` 머리말). 메뉴 트리의 판정(`tree/tree-drop.ts`)과 같은 뜻이라 같은 부모 안에서 뒤로 옮기면 자기 몫을 하나 당긴다. 새
 * 타입은 문서에 아직 없어 당길 몫이 없고 «제자리»도 없다 — 끼울 자리가 곧 `insertNodeOps`의 인덱스다.
 *
 * **남이 잡은 자리면 `null`이다** — 놓았을 때 낼 편집(옮기기는 `moveNodeOps`, 넣기는 `insertNodeOps`)을 지어 그 편집이 부딪치는 잠금을
 * 묻는다(`blockedBy` — 스토어의 `editBlockedBy`). 편집으로 묻는 것이 요점이다: 서버가 2차 방어로 묻는 것이 바로 그 편집이고
 * (`@wirebound/schema`의 `lockConflictOfOps`), 노드 **고르기**의 판정(`lockedBy`)으로 물으면 놓을 부모 아래 아무 노드의 잠금에도
 * 막힌다. 끄는 노드가 잠긴 자리 안에 있으면 뽑는 자리(`move`의 `from`)가 부딪쳐 어디에도 못 놓는다. **물음은 하나다** — `move`의
 * `path`는 `from`을 뺀 **뒤**의 좌표인데, 그 판정이 연산마다 좌표를 맞춰 잠긴 자리를 따라가므로(앞쪽 노드를 뒤쪽 형제의 잠긴 서브트리로
 * 옮기는 판 · 잠긴 노드 **뒤** 형제 앞으로 옮기는 판 둘 다) 옮기기 전 좌표로 다시 물을 일이 없다. 넣기의 물음에 싣는 노드는 판정용
 * 표본(`PROBE_ID`)이다 — 잠금은 경로로 가르므로 id 가 답을 바꾸지 않는다. 놓을 때 보내는 노드는 부르는 쪽이 `createNode`로 짓는다.
 *
 * **제자리면 `null`이다** — 보낼 편집이 없다.
 */
import type { NodeLock, PageDocument, PatchOp, WbNode } from '@wirebound/schema'
import type { DropZone } from '../tree/tree-drop'
import { createNode } from './create-node'
import { insertNodeOps, moveNodeOps } from './ops'
import { walkSafely, type SafeVisit } from './safe-walk'
import { acceptsChildren } from './structure-actions'

/** 놓을 자리. `placement`는 표시가 설 띠다. */
export interface StructureDrop {
  parentId: string
  index: number
  placement: DropZone
}

/** 끄는 것 — 옮길 노드(구조 트리 줄 · 캔버스 손잡이) 또는 넣을 새 타입(컴포넌트 목록 카드). */
export type Placing = { kind: 'node'; id: string } | { kind: 'new'; type: string }

/** 넣기 판정에 싣는 노드의 id — 보내지 않는다(머리말 «남이 잡은 자리면»). */
const PROBE_ID = 'drop-probe'

export function structureDropTarget(
  document: PageDocument,
  placing: Placing,
  overId: string,
  zone: DropZone,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): StructureDrop | null {
  const over = findVisit(document, overId)
  if (over === null) return null

  let parentId: unknown
  let insertAt: number
  if (zone === 'inside') {
    if (!acceptsChildren(over.node)) return null
    parentId = over.node.id
    insertAt = Array.isArray(over.node.children) ? over.node.children.length : 0
  } else {
    if (over.parent === null) return null
    // 형제 자리는 부모 «안» 이다 — 부모가 자식을 안 받으면(검증 전 문서 · 카탈로그가 바뀐 옛 문서) 못 놓는다.
    if (!acceptsChildren(over.parent)) return null
    parentId = over.parent.id
    insertAt = zone === 'before' ? over.index : over.index + 1
  }
  if (typeof parentId !== 'string') return null

  if (placing.kind === 'new') {
    const probe = createNode(placing.type, () => PROBE_ID)
    if (probe === null) return null
    const ops = insertNodeOps(document, parentId, insertAt, probe)
    if (ops === null || blockedBy(ops) !== null) return null
    return { parentId, index: insertAt, placement: zone }
  }

  const draggedId = placing.id
  if (draggedId === overId) return null
  const dragged = findVisit(document, draggedId)
  if (dragged === null || dragged.parent === null) return null
  // 가지는 끌어 옮기지 않는다 — 영역 밖은 `state-case-outside`, 영역 안 차례는 뜻이 없다(`structure-actions.ts` 의 `regionRules`).
  if (dragged.node.type === 'StateCase') return null
  if (contains(dragged.node, overId)) return null

  const sameParent = parentId === dragged.parent.id
  const index = sameParent && dragged.index < insertAt ? insertAt - 1 : insertAt
  if (sameParent && index === dragged.index) return null

  const ops = moveNodeOps(document, draggedId, parentId, index)
  if (ops === null || blockedBy(ops) !== null) return null
  return { parentId, index, placement: zone }
}

/**
 * **페이지 끝** — 뿌리의 마지막 자식 자리. 캔버스에서 노드가 없는 바탕에 놓을 때와(`canvas/canvas-drop.ts`의 `pageEnd`) 카드를 고른
 * 것 없이 눌렀을 때의 자리다. 뿌리 «안»과 같은 판정이다 — 뿌리가 잠겼으면 `null`, 뿌리의 마지막 자식을 옮기면 제자리라 `null`.
 */
export function pageEndTarget(
  document: PageDocument,
  placing: Placing,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): StructureDrop | null {
  const rootId: unknown = document.root?.id
  if (typeof rootId !== 'string') return null
  return structureDropTarget(document, placing, rootId, 'inside', blockedBy)
}

/**
 * **같은 자리인가** — 보인 자리와 다시 물은 자리를 견준다. 끌기 장치의 «놓는 답은 보인 답이다»(`drag/use-pointer-drag.ts` 의 `sameDrop`
 * — 구조 트리 줄 끌기 · 캔버스 손잡이)와 경로 층의 보인 자리 다시 판정(`drag/use-placement.ts` 의 `holds`)이 같은 이 함수다.
 *
 * **부모만 견준다.** 띠 · 차례는 안 본다 — 놓을 때 부르는 쪽이 지금 문서로 그 자리를 다시 판정하므로(`drag/use-placement.ts` 의 `onDrop`)
 * 차례는 **지금 문서를 따라간다**. 남이 형제를 넣거나 빼 차례가 밀려도 · 넣은 칸이 포인터 밑으로 밀려 와 «안» 이 «그 칸 뒤» 로 바뀌어도(같은
 * 그리드 끝) 같은 부모 안의 자리라 표시도 놓기도 새 자리를 따라가고, 부모가 다르면(포인터 밑에 다른 상자가 온 판 · 보인 노드가 다른 부모로
 * 옮겨진 판) 다른 자리다 — 보인 상자가 아닌 곳으로 놓지 않는다.
 *
 * **대가:** 같은 부모 안에서는 사람이 본 차례와 놓는 차례가 다를 수 있다 — 끄는 사이 남이 그 부모의 형제를 넣거나 빼면 놓는 자리는 «뗀
 * 좌표 밑의 지금 자리»다. 표시는 캔버스가 다시 잴 때(`refresh`) 그 새 자리로 옮겨 가므로(트리 줄은 문서가 바뀔 때 — `panels/structure-tree.tsx`)
 * 포인터가 멈춰 있으면 보인 자리가 곧 놓는 자리다.
 */
export function sameDrop(a: StructureDrop, b: StructureDrop): boolean {
  return a.parentId === b.parentId
}

/**
 * 판정이 준 자리(`drop`)로 낼 편집. 옮기기는 `moveNodeOps`, 넣기는 `insertNodeOps` 에 부르는 쪽이 지은 `node` 를 싣는다 — 그 id 가
 * 보낸 뒤 고를 노드다. 새 타입인데 노드가 없거나 타입이 다르면 `null`이다(판정한 것과 다른 것을 넣지 않는다).
 */
export function dropOps(document: PageDocument, placing: Placing, drop: StructureDrop, node?: WbNode): PatchOp[] | null {
  if (placing.kind === 'node') return moveNodeOps(document, placing.id, drop.parentId, drop.index)
  if (node === undefined || node.type !== placing.type) return null
  return insertNodeOps(document, drop.parentId, drop.index, node)
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
