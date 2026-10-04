/**
 * **꺼진 항목이 이유를 `title` · `aria-description`으로 드는가 — 열두 상태 전부에서. 그리고 키보드가 그 이유에 닿는가.**
 *
 * `./toolbar-status.test.ts`가 *"어느 상태의 어느 항목에 어느 문장이 붙는가"*를 갖는다면, 이 파일은 그 다음 두 물음을 갖는다: **그 문장이
 * 화면의 항목에 실려 있는가**(두 속성이 같은 문장으로), 그리고 **키보드 사용자가 그 문장에 닿는가.**
 *
 * # 키보드는 이유에 닿지 못한다 — 잃은 것을 값으로 적는다
 *
 * 줄 행동의 항목은 행동 메뉴의 항목이라 **Tab 이 아니라 화살표로 옮기고, 화살표는 꺼진 항목을 건너뛴다**(`shell/action-menu.tsx` —
 * `menu` 역할의 약속). 이유는 **꺼진 항목에만** 실린다(켜진 항목에는 붙일 «왜 회색인가»가 없다). 그래서 포커스가 설 수 있는 자리(켜진
 * 항목) 가운데 이유를 든 것이 **어느 상태에서도 없다** — 아래 표의 `reach`가 전부 0 이다. 트리 아래의 이유 줄(탭 정지점)이 그 바닥이었고,
 * 그 줄이 없는 지금 키보드로 이유를 읽는 길은 이 파일이 재는 범위에 없다(보조 기술의 읽기 모드가 꺼진 항목의 설명을 읽는지는 jsdom 이
 * 못 잰다). 닫는 길의 후보는 WAI-ARIA APG 처럼 꺼진 메뉴 항목에도 화살표가 서게 하는 것이다 — 그때 이 파일의 `reach`가 바뀐다.
 *
 * # 판정을 두 벌로 만들지 않는다 — `abilities`도 문안도 진짜를 지난다
 *
 * 불리언을 손으로 채우면 **도달하지 않는 조합**을 재게 되므로 문서와 트리를 짓고 `structureAbilities` · `treeAbilities` · `structureWhy` ·
 * `menuRowItems`를 그대로 지난다. 그래서 아래 열두 줄은 **진짜로 도달하는 열두 상태**다.
 *
 * # 줄 행동만 떼어 렌더한다
 *
 * 열둘 중 둘(*"문서 · 트리에 없다"*)은 화면 조작으로 도달시키기 어렵다 — 남이 지운 뒤 다시 받기 전의 창이다. 그리고 **«안 골랐다» 둘은
 * 앱에서 줄 행동으로는 닿지 않는다** — 줄의 `+` · `…`를 열면 그 줄을 먼저 고른다(`panels/tree-row-actions.tsx` 머리말 «누르면 먼저 그 줄을
 * 고른다»). 여기서는 그 상태의 명령으로 지은 항목을 그대로 그려 잰다. 앱째로 재는 쪽은 `./structure-toolbar.test.tsx` ·
 * `./menu-crud.test.tsx`(`busy`)에 있다.
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, WbNode } from '@wirebound/schema'
import type { TreeMenuNode } from '../../src/api/types'
import { findNodeSafely } from '../../src/edit/safe-walk'
import { structureAbilities } from '../../src/edit/structure-actions'
import type { ActionMenuItem } from '../../src/shell/action-menu'
import { treeAbilities, type TreeSelection } from '../../src/tree/tree-actions'
import type { TreeCommands } from '../../src/tree/use-tree-commands'
import type { StructureCommands } from '../../src/panels/structure-toolbar'
import {
  BUSY_REASON,
  lockedSelectionStatus,
  MISSING_IN_TREE_REASON,
  NOT_IN_DOCUMENT_STATUS,
  PICK_NODE_REASON,
  structureWhy,
} from '../../src/panels/toolbar-status'
import { MENU_WHY_DISABLED, menuRowItems, STRUCTURE_WHY_DISABLED, structureRowItems, TreeRowActions } from '../../src/panels/tree-row-actions'
import { reasonOf } from './tree-row'
import '../../src/catalog-setup'

afterEach(cleanup)

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)      잎 — 자식을 담지 못한다
 * ├ n-box (Card)      가운데 컨테이너
 * │  └ n-solo (Card)  외동 컨테이너
 * └ n-c   (Divider)   막내
 * ```
 */
function doc(): PageDocument {
  const root: WbNode = {
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-solo', type: 'Card' }] },
      { id: 'n-c', type: 'Divider' },
    ],
  }
  return { version: 1, root }
}

/**
 * ```
 * mn-1 관리자  pages: pg-1     맏이 · 최상위
 * │ └ mn-1-1 회원              비었고 외동
 * mn-2 포털                    비었고 형제가 있다
 * mn-3 설정                    비었고 형제가 있다
 * ```
 * **메뉴가 둘 이상이어야** `reparent`가 열린다(하나면 옮길 곳이 없다).
 */
function tree(): TreeMenuNode[] {
  return [
    {
      id: 'mn-1',
      title: '관리자',
      sortOrder: 0,
      pages: [{ id: 'pg-1', title: '회원 목록', sortOrder: 0 }],
      children: [{ id: 'mn-1-1', title: '회원', sortOrder: 0, pages: [], children: [] }],
    },
    { id: 'mn-2', title: '포털', sortOrder: 1, pages: [], children: [] },
    { id: 'mn-3', title: '설정', sortOrder: 2, pages: [], children: [] },
  ]
}

const LOCK: NodeLock = { nodeId: 'n-a', userId: 'u-bora', userName: '보라' }

/** 부르면 케이스가 죽는 자리 — 이 파일은 조작을 재지 않는다. */
function unused(): never {
  throw new Error('이 파일은 조작을 재지 않습니다')
}

/** 그 상태의 구조 명령 — `useStructureCommands`가 짓는 것과 같은 함수(`structureWhy`)로 이유를 짓는다. */
function structureCommands(input: { selectedNodeId: string | null; lock?: NodeLock | null }): StructureCommands {
  const document = doc()
  const { selectedNodeId } = input
  const lock = input.lock ?? null
  // **잠금을 판정에도 넘긴다** — 화면에서 그 둘은 같은 값을 지난다(`useStructureCommands`). 하네스의 `lock` 하나가 훅의 두 값
  // (`selectedLock` · `pageLock`)을 대신한다 — 화면에서 `selectedLock`이 있으면 `pageLock`도 반드시 있다(루트가 모든 노드의 조상이다).
  const abilities = structureAbilities(document, selectedNodeId, lock)
  // 훅의 `aliasLocked`와 같은 조건 — 하나를 골랐고 · 문서에 있고 · 남이 안 잡았을 때만 켠다.
  const aliasLocked = lock !== null || selectedNodeId === null || findNodeSafely(document.root, selectedNodeId) === undefined
  return {
    abilities,
    patternLocked: lock !== null,
    presetLocked: lock !== null,
    why: structureWhy(
      {
        selectedNodeId,
        isRoot: selectedNodeId !== null && document.root.id === selectedNodeId,
        lock,
        pageLock: lock,
        abilities,
      },
      { patternLock: lock, presetLock: lock, aliasLocked },
    ),
    remove: unused,
    moveUp: unused,
    moveDown: unused,
    indent: unused,
    outdent: unused,
    openAdd: unused,
    adding: null,
    pick: unused,
    pickPattern: unused,
    applyPreset: unused,
    cancelAdd: unused,
    dropTo: unused,
    aliasLocked,
    renameAlias: unused,
  }
}

function menuCommands(selection: TreeSelection | null, busy = false): TreeCommands {
  const menu = tree()
  return {
    state: { status: 'ready', menu },
    selection,
    select: unused,
    abilities: treeAbilities(menu, selection),
    busy,
    failure: null,
    editing: null,
    openInput: unused,
    submitInput: unused,
    cancelInput: unused,
    confirmingRemove: false,
    removing: null,
    confirmCascade: unused,
    closeRemoving: unused,
    askRemove: unused,
    confirmRemove: unused,
    cancelRemove: unused,
    move: unused,
    indent: unused,
    outdent: unused,
    importing: null,
    openImport: unused,
    closeImport: unused,
    importJson: unused,
    importFailure: null,
    conflict: null,
    overwriteTitle: unused,
    discardTitle: unused,
    renameLock: { locked: false, phase: null, recheck: null, missed: null, dismiss: unused, run: unused },
    renameNotices: { checking: '', unknown: '', missedLead: '' },
    reparenting: null,
    openReparent: unused,
    reparentTo: unused,
    cancelReparent: unused,
    dropTo: unused,
  }
}

/** 그 줄 행동을 그린다 — 앱의 줄과 같은 부품(`TreeRowActions`)이다. */
function draw(items: { add?: readonly ActionMenuItem[]; more?: readonly ActionMenuItem[] }): HTMLElement {
  return render(<TreeRowActions name="줄" {...items} onOpen={() => {}} picked />).container
}

/** 화면에 그린 항목 하나 — 연 목록에서 읽은 것. */
interface Drawn {
  label: string
  off: boolean
  reason: string | null
}

/**
 * `+` · `…`를 차례로 열어 항목을 읽는다. **`reach`는 연 뒤 포커스가 설 수 있는 항목(화살표가 서는 켜진 항목) 가운데 이유를 든 것의 수다** —
 * 열면 첫 켠 항목에 포커스가 서고 화살표가 켠 항목 사이를 돈다(`shell/action-menu.tsx`의 `enabledItems`).
 */
function readItems(container: HTMLElement): { items: Drawn[]; reach: number } {
  const items: Drawn[] = []
  let reach = 0
  for (const toggle of container.querySelectorAll<HTMLButtonElement>('[aria-haspopup="menu"]')) {
    fireEvent.click(toggle)
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    if (list === null) throw new Error('열었는데 목록이 없다')
    for (const item of within(list).getAllByRole('menuitem')) {
      const off = item.getAttribute('aria-disabled') === 'true'
      const reason = reasonOf(item)
      items.push({ label: item.textContent ?? '', off, reason })
      if (!off && reason !== null) reach += 1
    }
    // 연 뒤의 포커스가 켠 항목이거나(켠 것이 있으면) 단추다(다 꺼졌으면) — 어느 쪽도 이유를 들지 않는다.
    if (document.activeElement !== null && reasonOf(document.activeElement) !== null) reach += 1
    fireEvent.click(toggle)
  }
  return { items, reach }
}

/**
 * **열두 상태 — 그 상태를 가르는 항목 하나와 그 항목의 이유.** `reach`는 키보드가 이유에 닿는 자리의 수다.
 *
 * | 상태 | 대표 항목 | 이유 | `reach` | 이유 줄(탭 정지점)이 있던 판 |
 * |---|---|---|---|---|
 * | 구조 · 안 골랐다 | 안에 추가 | «트리에서 노드를 고르면 …» | **0** | 닿았다 — 그 줄이 첫 정지점 |
 * | 구조 · 남이 잠갔다 | 안에 추가 | «보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다» | **0** | 닿았다 |
 * | 구조 · 루트다 | 삭제 | «루트가 아닌 노드를 고르세요» | **0** | 닿았다(켠 «안에 추가»가 그 줄을 설명으로 들었다) |
 * | 구조 · 문서에 없다 | 삭제 | «고른 노드가 문서에 없습니다» | **0** | 닿았다 |
 * | 구조 · 자식을 못 담는다 | 안에 추가 | `STRUCTURE_WHY_DISABLED.addInside` | **0** | 닿았다 |
 * | 구조 · 형제가 없다 | 위로 | `STRUCTURE_WHY_DISABLED.moveUp` | **0** | 닿았다 |
 * | 메뉴 · 보내는 중 | 이름 변경 | «조작을 보내는 중입니다» | **0** | 닿았다 |
 * | 메뉴 · 안 골랐다 | 이름 변경 | `MENU_WHY_DISABLED.rename` | **0** | 닿았다 |
 * | 메뉴 · 트리에 없다 | 이름 변경 | «고른 것이 트리에 없습니다» | **0** | 닿았다 |
 * | 메뉴 · 페이지다 | 위로 | `MENU_WHY_DISABLED.moveUp` | **0** | 닿았다 |
 * | 메뉴 · 최상위 맏이다 | 내어쓰기 | `MENU_WHY_DISABLED.outdent` | **0** | 닿았다 |
 * | 메뉴 · 형제가 없다 | 위로 | `MENU_WHY_DISABLED.moveUp` | **0** | 닿았다 |
 *
 * «메뉴 · 최상위 맏이다»(`mn-1`)는 하위가 있는 메뉴다 — 그 «삭제»의 판정과 문장은 메뉴 연쇄 삭제가 갖으므로 «내어쓰기»로 잰다.
 */
const STATES: { name: string; open: () => HTMLElement; item: string; reason: string }[] = [
  { name: '구조 · 안 골랐다', open: () => draw(structureRowItems(structureCommands({ selectedNodeId: null }), unused)), item: '안에 추가', reason: PICK_NODE_REASON },
  {
    name: '구조 · 남이 잠갔다',
    open: () => draw(structureRowItems(structureCommands({ selectedNodeId: 'n-root', lock: LOCK }), unused)),
    item: '안에 추가',
    reason: lockedSelectionStatus('보라'),
  },
  { name: '구조 · 루트다', open: () => draw(structureRowItems(structureCommands({ selectedNodeId: 'n-root' }), unused)), item: '삭제', reason: STRUCTURE_WHY_DISABLED.remove },
  { name: '구조 · 문서에 없다', open: () => draw(structureRowItems(structureCommands({ selectedNodeId: 'n-gone' }), unused)), item: '삭제', reason: NOT_IN_DOCUMENT_STATUS },
  {
    name: '구조 · 자식을 못 담는다',
    open: () => draw(structureRowItems(structureCommands({ selectedNodeId: 'n-a' }), unused)),
    item: '안에 추가',
    reason: STRUCTURE_WHY_DISABLED.addInside,
  },
  { name: '구조 · 형제가 없다', open: () => draw(structureRowItems(structureCommands({ selectedNodeId: 'n-solo' }), unused)), item: '위로', reason: STRUCTURE_WHY_DISABLED.moveUp },
  { name: '메뉴 · 보내는 중', open: () => draw(menuRowItems(menuCommands({ kind: 'menu', id: 'mn-3' }, true), 'menu')), item: '이름 변경', reason: BUSY_REASON },
  { name: '메뉴 · 안 골랐다', open: () => draw(menuRowItems(menuCommands(null), 'menu')), item: '이름 변경', reason: MENU_WHY_DISABLED.rename },
  { name: '메뉴 · 트리에 없다', open: () => draw(menuRowItems(menuCommands({ kind: 'menu', id: 'mn-gone' }), 'menu')), item: '이름 변경', reason: MISSING_IN_TREE_REASON },
  { name: '메뉴 · 페이지다', open: () => draw(menuRowItems(menuCommands({ kind: 'page', id: 'pg-1' }), 'page')), item: '위로', reason: MENU_WHY_DISABLED.moveUp },
  { name: '메뉴 · 최상위 맏이다', open: () => draw(menuRowItems(menuCommands({ kind: 'menu', id: 'mn-1' }), 'menu')), item: '내어쓰기', reason: MENU_WHY_DISABLED.outdent },
  { name: '메뉴 · 형제가 없다', open: () => draw(menuRowItems(menuCommands({ kind: 'menu', id: 'mn-1-1' }), 'menu')), item: '위로', reason: MENU_WHY_DISABLED.moveUp },
]

describe('꺼진 항목이 이유를 `title` · `aria-description`으로 든다 — 열두 상태 전부에서', () => {
  it.each(STATES)('$name — «$item»', ({ open, item, reason }) => {
    const { items } = readItems(open())

    // 그 상태를 가르는 항목이 그 이유를 든다(두 속성이 같은 문장인지는 `reasonOf`가 던져 잰다).
    expect(items.find((drawn) => drawn.label === item)).toEqual({ label: item, off: true, reason })
    // **꺼진 항목은 전부 이유를 들고, 켜진 항목은 하나도 안 든다.**
    expect(items.filter((drawn) => drawn.off !== (drawn.reason !== null))).toEqual([])
    // 이유는 빈 글이 아니다.
    expect(items.filter((drawn) => drawn.reason === '')).toEqual([])
  })
})

describe('키보드가 이유에 닿지 못한다 — 열두 상태 전부에서(잃은 것)', () => {
  it.each(STATES)('$name — 포커스가 서는 자리 가운데 이유를 든 것 0', ({ open }) => {
    const { items, reach } = readItems(open())
    // 전제: 이 상태에 이유를 든 항목이 실제로 있다 — 없으면 «닿지 못한다»가 공허하다.
    expect(items.some((drawn) => drawn.reason !== null)).toBe(true)
    expect(reach).toBe(0)
  })
})

/**
 * **잠금이 판정을 끈다** — 같은 노드를 잠금 없이 열어 대조한다. 그러지 않으면 *"루트라 어차피 꺼진다"*와 구별되지 않는다 — 루트에서 켜져
 * 있는 것은 `안에 추가` · `패턴 넣기`이고, 그것이 잠금으로 꺼지고 **잠금을 말하는 것**이 여기서 재는 전부다.
 */
describe('잠금이 판정을 끈다', () => {
  it('잠기지 않은 루트에서는 `안에 추가` · `패턴 넣기`가 켜져 있고 이유가 없다 — 대조', () => {
    const { items } = readItems(draw(structureRowItems(structureCommands({ selectedNodeId: 'n-root' }), unused)))
    expect(items.filter((drawn) => ['안에 추가', '아래 추가', '패턴 넣기'].includes(drawn.label))).toEqual([
      { label: '안에 추가', off: false, reason: null },
      { label: '아래 추가', off: true, reason: STRUCTURE_WHY_DISABLED.addAfter },
      { label: '패턴 넣기', off: false, reason: null },
    ])
  })

  it('잠기면 판정 밖의 패턴 · 별칭까지 다 꺼지고 전부 잠근 사람을 말한다', () => {
    const { items } = readItems(draw(structureRowItems(structureCommands({ selectedNodeId: 'n-root', lock: LOCK }), unused)))
    expect(items.filter((drawn) => !drawn.off)).toEqual([])
    expect(items.filter((drawn) => !(drawn.reason ?? '').includes('보라'))).toEqual([])
  })
})
