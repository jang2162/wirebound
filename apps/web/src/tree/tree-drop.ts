/**
 * 메뉴 트리의 **놓을 자리 판정** — 끄는 줄(`dragged`)을 포인터 밑 줄(`over`)의 어느 띠(`zone`)에 놓으면 어디로 가는가. 끌기 장치
 * (`drag/use-pointer-drag.ts`)의 `onOver` 가 이것을 부르고, 놓으면 `use-tree-commands.tsx` 의 `dropTo` 가 그 자리로 보낸다.
 *
 * **순수 함수이고 던지지 않는다** — `tree-actions.ts` 와 같은 계약이다(렌더 · 포인터 처리기에서 불리고 이 트리 위에 오류 경계가
 * 없다). 순회는 그 파일의 함수(`treeSpot` · `menuChildCount`)를 지난다.
 *
 * ## 돌려주는 `index` 는 «옮긴 뒤 그 부모 안 차례»다
 *
 * 서버는 부모가 바뀌면 `sortOrder` 를 새 형제 그룹에 끼울 자리로, 부모가 같으면 결과 배열의 자리로 읽는다 — 두 뜻이 같은 값이다
 * (`apps/api/test/tree-drop-order.test.ts`). 그래서 같은 부모 안에서 뒤로 옮기면 자기가 빠진 만큼 하나 당긴다.
 *
 * ## 무엇을 어디에 놓을 수 있나 — 지금 이동 판정과 같다
 *
 * | 끄는 것 | 포인터 밑 | 결과 |
 * |---|---|---|
 * | 메뉴 | 메뉴의 위 · 아래 | 그 메뉴의 형제 |
 * | 메뉴 | 메뉴 안 | 그 메뉴의 마지막 자식(들여쓰기와 같은 자리) |
 * | 메뉴 | 자기 · 자기 자손 | `null` — 서버도 400 이다(`repos/menu.ts` 의 `DescendantParentError`) |
 * | 메뉴 | 페이지 | `null` — 메뉴의 형제는 메뉴뿐이고 페이지는 자식을 안 갖는다 |
 * | 페이지 | 메뉴(어느 띠든) | 그 메뉴의 마지막 페이지 — 메뉴 줄의 위 · 아래 띠에 페이지의 자리가 없어, 띠를 버리고 안으로 읽는다 |
 * | 페이지 | 페이지의 위 · 아래 | 그 페이지의 메뉴 안 그 자리(다른 메뉴로 옮기기 포함) |
 *
 * **제자리면 `null` 이다** — 보낼 것이 없다. 표시도 안 선다(바로 뒤 형제의 위에 대면 선이 안 보이는 까닭).
 */
import type { TreeMenuNode } from '../api/types'
import { menuChildCount, treeSpot, type TreeSelection } from './tree-actions'

/** 줄의 띠 — 위 · 가운데 · 아래. */
export type DropZone = 'before' | 'after' | 'inside'

/** 놓을 자리. `parentId` 는 메뉴면 부모 메뉴(뿌리면 `null`), 페이지면 소속 메뉴다. `placement` 는 표시가 설 띠다. */
export interface MenuDrop {
  parentId: string | null
  index: number
  placement: DropZone
}

/**
 * 줄 안의 세로 자리(`offset` — 줄 위에서부터 px)를 띠로. 안을 받는 줄(메뉴)은 위 25% · 가운데 · 아래 25%, 안을 안 받는 줄(페이지)은
 * 반으로 가른다 — 페이지 줄 가운데가 죽은 띠가 되지 않게.
 */
export function dropZone(offset: number, height: number, acceptsInside: boolean): DropZone {
  if (!acceptsInside) return offset < height / 2 ? 'before' : 'after'
  if (offset < height * 0.25) return 'before'
  if (offset > height * 0.75) return 'after'
  return 'inside'
}

export function menuDropTarget(menu: TreeMenuNode[], dragged: TreeSelection, over: TreeSelection, zone: DropZone): MenuDrop | null {
  if (dragged.kind === over.kind && dragged.id === over.id) return null
  const from = treeSpot(menu, dragged)
  if (from === null) return null

  if (dragged.kind === 'menu') {
    if (over.kind !== 'menu' || isWithin(menu, dragged.id, over.id)) return null
    // 안의 끝 = 자식 수. 이미 그 메뉴의 자식이면 `settle` 이 자기 몫을 뺀다.
    if (zone === 'inside') return settle(from, over.id, menuChildCount(menu, over.id, 'menu'), 'inside')
    return besides(menu, from, over, zone)
  }

  if (over.kind === 'menu') return settle(from, over.id, menuChildCount(menu, over.id, 'page'), 'inside')
  if (zone === 'inside') return null
  return besides(menu, from, over, zone)
}

/**
 * **같은 자리인가** — 끌기 장치의 «놓는 답은 보인 답이다»(`drag/use-pointer-drag.ts` 의 `sameDrop`)에 주는 견줌. **부모만 본다** — 차례 · 띠는
 * 놓을 때 지금 트리로 다시 판정한 자리가 곧 놓는 자리다(구조 트리의 `edit/structure-drop.ts` 의 `sameDrop` 과 같은 뜻 — 두 트리가 한 규칙이다).
 * 끄는 사이 남이 줄을 밀어 포인터 밑에 다른 부모의 줄이 오면 뗀 좌표의 그 줄로 가지 않는다.
 */
export function sameMenuDrop(a: MenuDrop, b: MenuDrop): boolean {
  return a.parentId === b.parentId
}

/** 포인터 밑 줄의 앞 · 뒤 — 그 줄의 부모 안에서 그 줄의 자리(뒤면 하나 뒤). */
function besides(
  menu: TreeMenuNode[],
  from: { parentId: string | null; index: number },
  over: TreeSelection,
  zone: 'before' | 'after',
): MenuDrop | null {
  const at = treeSpot(menu, over)
  if (at === null) return null
  const insertAt = zone === 'before' ? at.index : at.index + 1
  return settle(from, at.parentId, insertAt, zone)
}

/**
 * 끼울 자리(`insertAt` — 끄는 것이 아직 있는 배열의 자리, 트리에 없으면 `null`)를 «옮긴 뒤 차례»로 바꾸고, 제자리면 `null`.
 */
function settle(
  from: { parentId: string | null; index: number },
  parentId: string | null,
  insertAt: number | null,
  placement: DropZone,
): MenuDrop | null {
  if (insertAt === null) return null
  const sameParent = from.parentId === parentId
  const index = sameParent && from.index < insertAt ? insertAt - 1 : insertAt
  if (sameParent && index === from.index) return null
  return { parentId, index, placement }
}

/** `id` 가 `ancestorId` 자신이거나 그 자손인가 — 부모 사슬을 거슬러 오른다. 만 걸음을 넘으면(순환 — `tree-actions.ts` 머리말 «순환 트리») 멈춘다. */
function isWithin(menu: TreeMenuNode[], ancestorId: string, id: string): boolean {
  let cursor: string | null = id
  for (let step = 0; cursor !== null && step < 10_000; step += 1) {
    if (cursor === ancestorId) return true
    cursor = treeSpot(menu, { kind: 'menu', id: cursor })?.parentId ?? null
  }
  return false
}
