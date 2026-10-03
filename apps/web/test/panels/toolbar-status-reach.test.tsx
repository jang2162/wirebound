/**
 * **상태줄에 키보드로 닿는가 — 열두 상태 전부에서.**
 *
 * `./toolbar-status.test.ts`가 *"어느 상태에서 어느 문장이 나오는가"*를 갖는다면, 이
 * 파일은 그 다음 질문 하나를 갖는다: **그 문장이 나와 있을 때 키보드 사용자가 거기
 * 닿는가.**
 *
 * # 왜 이 파일이 있나 — 줄 행동의 항목은 탭 정지점이 아니다
 *
 * 두 트리의 조작은 줄의 `+` · `…`(`panels/tree-row-actions.tsx`)이고 그 항목은 행동 메뉴의 항목이다 — **Tab 이 아니라 화살표로
 * 옮긴다**(`shell/action-menu.tsx` — `menu` 역할의 약속). 항목이 상태줄을 설명으로 들어도(`aria-describedby`) 그 설명은 **포커스가
 * 항목에 닿을 때만** 읽히는데, 하필 **할 말이 가장 많은 상태들**에서 항목이 전부 꺼져(화살표가 건너뛴다) 닿을 항목이 없다:
 *
 * | 트리 | 상태 | 항목에 닿는가 |
 * |---|---|---|
 * | 구조 | 남이 잠갔다 | **아니다** — 줄 행동째 없다(잠긴 줄) · 뿌리 `+`의 셋도 꺼진다 |
 * | 구조 | 안 골랐다 · 문서에 없다 | 고른 줄이 없다 |
 * | 메뉴 | 보내는 중 | **아니다** — 항목이 전부 꺼진다 |
 * | 메뉴 | 안 골랐다 · 트리에 없다 | 고른 줄이 없다 |
 *
 * # 고른 길 — 상태줄 자체를 탭 정지점으로 둔다
 *
 * **할 말이 있으면 그 줄에 닿을 수 있다** — 어느 항목이 켜져 있는지를 보지 않으므로 열두 상태 전부에서 같은 이유로 성립하고,
 * 항목이 늘거나 줄어도 낡지 않는다. 값도 그 줄이 스스로 낸다 — 포커스가 닿으면 그 요소의 글이 곧 읽히는 것이라
 * `aria-describedby` 해석에 기대지 않는다.
 *
 * **`aria-describedby`는 그대로 둔다.** 그것이 하는 일은 *"조작을 하려는 그 순간"*에 이유를 붙여 주는 것이고(앱째로 잰다 —
 * `./menu-crud.test.tsx` «메뉴 트리 — 상태줄»), 이 `tabIndex`는 *"켠 항목이 하나도 없을 때"*의 바닥이다.
 *
 * **«패턴 넣기» · «프리셋»에는 설명을 걸지 않는다** — 선택이 없어도 되는 조작이라 *"트리에서 노드를 고르면 편집할 수 있습니다"*를
 * 그 항목의 설명으로 읽히게 하면 **없는 전제조건을 만든다**(`panels/tree-row-actions.tsx`의 `structureRowItems`).
 *
 * # 판정을 두 벌로 만들지 않는다 — `abilities`도 문안도 진짜를 지난다
 *
 * `./toolbar-status.test.ts`와 같은 이유다. 불리언을 손으로 채우면 **도달하지 않는 조합**을
 * 재게 되므로 문서와 트리를 짓고 `structureAbilities`·`treeAbilities`·`structureStatus`·
 * `menuStatus`를 그대로 지난다. 그래서 아래 열두 줄은 **진짜로 도달하는 열두 상태**다.
 *
 * # 상태줄만 떼어 렌더한다 — 여기서는 그것이 맞다
 *
 * **이 파일의 하중은 상태줄의 포커스 가능성 하나**이고, 열둘 중 둘(*"문서·트리에 없다"*)은
 * 화면 조작으로 도달시키기 어렵다 — 남이 지운 뒤 재조회 전까지의 창이다. 앱째로 재는 쪽은 `./structure-toolbar.test.tsx`(선택 해제)와
 * `./menu-crud.test.tsx`(`busy`)에 있다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, WbNode } from '@wirebound/schema'
import type { TreeMenuNode } from '../../src/api/types'
import { structureAbilities } from '../../src/edit/structure-actions'
import { treeAbilities, type TreeSelection } from '../../src/tree/tree-actions'
import type { TreeCommands } from '../../src/tree/use-tree-commands'
import { MenuStatusLine } from '../../src/panels/menu-tree'
import type { StructureCommands } from '../../src/panels/structure-toolbar'
import { StructureStatusLine } from '../../src/panels/structure-tree'
import { structureRowItems } from '../../src/panels/tree-row-actions'
import { menuStatus, structureStatus } from '../../src/panels/toolbar-status'
import '../../src/catalog-setup'

afterEach(cleanup)

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)      잎 — 자식을 담지 못한다
 * ├ n-box (Card)      가운데 컨테이너 — 들여·내어만 꺼진다(할 말이 없는 자리)
 * │  └ n-solo (Card)  외동 **컨테이너** — 순서 문장이 나오는 자리
 * └ n-c   (Divider)   막내
 * ```
 * 문안의 사다리를 재는 것은 `./toolbar-status.test.ts`이고, 여기서는 **여섯 문장이 실제로
 * 나오기만 하면 된다.** 그래서 픽스처가 그 파일보다 얕다 — *"일곱이 다 켜지는 자리"*는
 * 여기서 재지 않는다(빈 문자열의 대조는 `n-box`가 맡는다).
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
 * mn-1 관리자  pages: pg-1     하위가 있다
 * │ └ mn-1-1 회원              비었고 **외동**
 * mn-2 포털                    비었고 형제가 있다
 * mn-3 설정                    비었고 형제가 있다 — 할 말이 없는 자리
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

/** 마지막으로 연 구조 판의 명령 — `잠금이 판정을 끈다`가 그 판의 줄 행동 항목을 짓는다. */
let lastStructureCommands: StructureCommands | null = null

function structureToolbar(input: {
  selectedNodeId: string | null
  lock?: NodeLock | null
}): { toolbar: HTMLElement; status: string } {
  const document = doc()
  const { selectedNodeId } = input
  const lock = input.lock ?? null
  // **잠금을 판정에도 넘긴다** — 화면에서 그 둘은 같은 값을 지난다
  // (`panels/structure-toolbar.tsx`의 `useStructureCommands`). 상태줄에만 주면 도달하지
  // 않는 조합을 재게 된다.
  const abilities = structureAbilities(document, selectedNodeId, lock)
  const status = structureStatus({
    selectedNodeId,
    isRoot: selectedNodeId !== null && document.root.id === selectedNodeId,
    lock,
    // **아래 `presetLocked`와 같은 값을 쓴다** — 화면에서 그 둘은 한 값(`pageLock`)에서
    // 나온다. 갈리는 자리는 아래 주석이 가리키는 파일이 셸째로 잰다.
    pageLock: lock,
    abilities,
  })
  const commands: StructureCommands = {
    abilities,
    count: selectedNodeId === null ? 0 : 1,
    // **하네스의 `lock` 하나가 훅의 두 값을 대신한다.** 화면에서 `selectedLock`이 있으면
    // `pageLock`도 반드시 있고(루트가 모든 노드의 조상이다), 이 표가 태우는 상태에는
    // 그 둘이 갈리는 자리가 없다 — 갈리는 자리(선택 없음 + 페이지 잠금)는
    // `../lock/toolbar-abilities.test.tsx`가 셸째로 잰다.
    patternLocked: lock !== null,
    presetLocked: lock !== null,
    status,
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
  }
  // **상태줄만 렌더한다**(머리말 «상태줄만 떼어 렌더한다»). `commands`는 `잠금이 판정을 끈다`가 줄 행동의 항목을 짓는 데 쓴다.
  const view = render(<StructureStatusLine commands={commands} id="structure-status" />)
  lastStructureCommands = commands
  return { toolbar: view.container, status }
}

function menuToolbar(input: { selection: TreeSelection | null; busy?: boolean }): {
  toolbar: HTMLElement
  status: string
} {
  const menu = tree()
  const { selection } = input
  const busy = input.busy ?? false
  const abilities = treeAbilities(menu, selection)
  const status = menuStatus({ selection, busy, abilities })
  const commands: TreeCommands = {
    state: { status: 'ready', menu },
    selection,
    select: unused,
    abilities,
    busy,
    failure: null,
    editing: null,
    openInput: unused,
    submitInput: unused,
    cancelInput: unused,
    confirmingRemove: false,
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
  // **메뉴 쪽은 상태줄만 렌더한다.** 툴바가 없다 — 조작은 줄의 `+` · `…`(`panels/tree-row-actions.tsx`)이고 그 항목은 탭 정지점이
  // 아니다(행동 메뉴의 항목은 화살표로 옮긴다 — `shell/action-menu.tsx`). 그래서 탭으로 이 문장에 닿는 길은 **줄 자신** 하나고,
  // 항목이 이 줄을 설명으로 드는 쪽은 앱째로 잰다(`./menu-crud.test.tsx` «메뉴 트리 — 상태줄»).
  const view = render(<MenuStatusLine commands={commands} id="menu-status" />)
  return { toolbar: view.container, status }
}

function statusLine(toolbar: HTMLElement): HTMLElement {
  const line = toolbar.querySelector<HTMLElement>('[class$="-status"]')
  if (line === null) throw new Error('상태줄이 없습니다')
  return line
}

/**
 * 렌더한 조각 안의 **탭 정지점을 순서대로.**
 *
 * 브라우저의 탭 순서는 (양수 `tabindex`가 없으면) 곧 DOM 순서다 — 양수가 있으면 이 함수가 거짓말을 하므로 아래
 * `양수 tabindex는 쓰지 않는다`가 그것을 값으로 막는다.
 */
function tabStops(toolbar: HTMLElement): HTMLElement[] {
  return [
    ...toolbar.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ]
}

/** 그 정지점에서 상태줄 문장이 읽히는가 — 자기가 그 줄이거나, 그 줄을 설명으로 든다. */
function reads(stop: HTMLElement, line: HTMLElement): boolean {
  return stop === line || stop.getAttribute('aria-describedby') === line.id
}

/** 문장에 닿는 첫 정지점의 자리. 어디서도 못 읽으면 `-1`이다. */
function firstStop(toolbar: HTMLElement): number {
  const line = statusLine(toolbar)
  return tabStops(toolbar).findIndex((stop) => reads(stop, line))
}

/**
 * **열두 상태 — 그 문장에 닿는 첫 정지점이 몇 번째인가.**
 *
 * `at`이 이 파일의 값이다. `-1`이면 **어디서도 못 읽는다** — 상태줄에 `tabIndex`가 없으면
 * 활성 버튼이 없는 여섯이 그렇게 된다(셋째 칸).
 *
 * | 상태 | `at` | 상태줄에 `tabIndex`가 없으면 | 첫 정지점이 무엇인가 |
 * |---|---|---|---|
 * | 구조 · 안 골랐다 | 0 | **-1** | **상태줄** |
 * | 구조 · 남이 잠갔다 | 0 | **-1** | **상태줄** — 줄 행동째 없고 뿌리 `+`도 꺼진다(아래) |
 * | 구조 · 루트다 | 0 | **-1** | **상태줄** |
 * | 구조 · 문서에 없다 | 0 | **-1** | **상태줄** |
 * | 구조 · 자식을 못 담는다 | 0 | **-1** | **상태줄** |
 * | 구조 · 형제가 없다 | 0 | **-1** | **상태줄** |
 * | 메뉴 · 보내는 중 | 0 | **-1** | **상태줄** |
 * | 메뉴 · 안 골랐다 | 0 | **-1** | **상태줄** |
 * | 메뉴 · 트리에 없다 | 0 | **-1** | **상태줄** |
 * | 메뉴 · 페이지다 | 0 | **-1** | **상태줄** |
 * | 메뉴 · 하위가 있다 | 0 | **-1** | **상태줄** |
 * | 메뉴 · 형제가 없다 | 0 | **-1** | **상태줄** |
 *
 * **메뉴 여섯은 상태줄만 렌더해 잰다**(`menuToolbar`의 주석) — 줄 행동의 항목은 탭 정지점이 아니라, 탭이 이 문장에 닿는 길은
 * 상태줄 자신뿐이다. 그래서 메뉴 쪽 셋째 칸이 전부 `-1`이다.
 *
 * **두 트리 다 상태줄만 렌더해 잰다**(`structureToolbar` · `menuToolbar`의 주석) — 셋째 칸이 전부 `-1`인 것이 이 파일의 요점이다:
 * 상태줄에 `tabIndex`가 없으면 탭으로는 그 문장에 영영 못 닿는다.
 */
const STATES: {
  name: string
  at: number
  open: () => { toolbar: HTMLElement; status: string }
}[] = [
  // 구조 여섯.
  { name: '구조 · 안 골랐다', at: 0, open: () => structureToolbar({ selectedNodeId: null }) },
  {
    name: '구조 · 남이 잠갔다',
    at: 0,
    open: () => structureToolbar({ selectedNodeId: 'n-root', lock: LOCK }),
  },
  { name: '구조 · 루트다', at: 0, open: () => structureToolbar({ selectedNodeId: 'n-root' }) },
  { name: '구조 · 문서에 없다', at: 0, open: () => structureToolbar({ selectedNodeId: 'n-gone' }) },
  {
    name: '구조 · 자식을 못 담는다',
    at: 0,
    open: () => structureToolbar({ selectedNodeId: 'n-a' }),
  },
  { name: '구조 · 형제가 없다', at: 0, open: () => structureToolbar({ selectedNodeId: 'n-solo' }) },
  // 메뉴 여섯.
  {
    name: '메뉴 · 보내는 중',
    at: 0,
    open: () => menuToolbar({ selection: { kind: 'menu', id: 'mn-3' }, busy: true }),
  },
  { name: '메뉴 · 안 골랐다', at: 0, open: () => menuToolbar({ selection: null }) },
  {
    name: '메뉴 · 트리에 없다',
    at: 0,
    open: () => menuToolbar({ selection: { kind: 'menu', id: 'mn-gone' } }),
  },
  {
    name: '메뉴 · 페이지다',
    at: 0,
    open: () => menuToolbar({ selection: { kind: 'page', id: 'pg-1' } }),
  },
  {
    name: '메뉴 · 하위가 있다',
    at: 0,
    open: () => menuToolbar({ selection: { kind: 'menu', id: 'mn-1' } }),
  },
  {
    name: '메뉴 · 형제가 없다',
    at: 0,
    open: () => menuToolbar({ selection: { kind: 'menu', id: 'mn-1-1' } }),
  },
]

describe('상태줄에 키보드로 닿는다 — 할 말이 있는 열두 상태 전부에서', () => {
  it.each(STATES)('$name — $at 번째 정지점', ({ at, open }) => {
    const { toolbar, status } = open()

    // 전제 둘. 이것이 거짓이면 이 줄은 *"할 말이 있는 상태"*를 재고 있지 않다.
    expect(status).not.toBe('')
    expect(statusLine(toolbar).textContent).toBe(status)

    // **이 파일의 단언.** `-1`이면 탭으로는 그 문장에 영영 못 닿는다는 뜻이다.
    expect(firstStop(toolbar)).toBe(at)
  })
})

/**
 * **잠금이 판정을 끈다** — `구조 · 남이 잠갔다`에서 키보드가 이유에 닿는 자리가 상태줄뿐인 까닭이다.
 *
 * **같은 노드를 잠금 없이 열어 대조한다.** 그러지 않으면 *"루트라 어차피 꺼진다"*와 구별되지 않는다 — 루트에서 켜져 있는 것은
 * `안에 추가` · `패턴 넣기`이고, 그것이 잠금으로 꺼지는 것이 여기서 재는 전부다.
 *
 * **판정 밖의 둘(`패턴 넣기` · `프리셋`)까지 꺼지는 것이 값이다.** 그 둘이 잠금으로 안 꺼지면 상태줄이 *"고를 수도 **바꿀 수도**
 * 없습니다"*라고 말한 직후 살아 있는 «바꾸는» 항목이 남는다 — 누르면 편집이 나가 423을 받는다(`panels/structure-toolbar.tsx`의
 * `patternLocked`·`presetLocked`에 실측이 있다). 이 상태가 왜 생기는지(잠금이 도착해도 선택은 그대로다)와 끄기로 한 근거는
 * `edit/structure-actions.ts`의 머리말이 갖는다.
 */
describe('잠금이 판정을 끈다', () => {
  function rootItems(): { label: string; off: boolean }[] {
    if (lastStructureCommands === null) throw new Error('구조 판을 열지 않았다')
    const { add } = structureRowItems(lastStructureCommands, 'structure-status')
    return add.map((item) => ({ label: item.label, off: item.disabled === true }))
  }

  it('잠기지 않은 루트에서는 `안에 추가` · `패턴 넣기`가 켜져 있다 — 대조', () => {
    expect(structureAbilities(doc(), 'n-root').addInside).toBe(true)

    structureToolbar({ selectedNodeId: 'n-root' })
    expect(rootItems()).toEqual([
      { label: '안에 추가', off: false },
      { label: '아래 추가', off: true },
      { label: '패턴 넣기', off: false },
    ])
    expect(lastStructureCommands?.presetLocked).toBe(false)
  })

  it('잠기면 판정 밖의 둘까지 다 꺼지고 상태줄만 정지점으로 남는다', () => {
    expect(structureAbilities(doc(), 'n-root', LOCK).addInside).toBe(false)

    const { toolbar } = structureToolbar({ selectedNodeId: 'n-root', lock: LOCK })
    expect(rootItems()).toEqual([
      { label: '안에 추가', off: true },
      { label: '아래 추가', off: true },
      { label: '패턴 넣기', off: true },
    ])
    expect(lastStructureCommands?.presetLocked).toBe(true)
    expect(tabStops(toolbar).map((stop) => stop.textContent)).toEqual([statusLine(toolbar).textContent])
  })
})

/**
 * **할 말이 없으면 정지점이 아니다.** 빈 줄에 탭이 서면 아무것도 읽히지 않는 정지점이 하나
 * 늘 뿐이다 — `aria-describedby`를 안 거는 것과 같은 판단이고(빈 요소를 가리키면 *"설명이
 * 있다"*는 관계만 남는다), 규칙을 하나로 유지한다: **자리는 지키되 닿지는 않는다.**
 */
describe('할 말이 없으면 그 줄은 탭 정지점이 아니다', () => {
  it('구조 — 들여·내어만 꺼진 자리', () => {
    const { toolbar, status } = structureToolbar({ selectedNodeId: 'n-box' })

    expect(status).toBe('')
    const line = statusLine(toolbar)
    expect(line.getAttribute('tabindex')).toBeNull()
    expect(tabStops(toolbar).some((stop) => reads(stop, line))).toBe(false)
    // 자리는 그대로 있다 — 사라지면 그 아래가 출렁인다.
    expect(toolbar.contains(line)).toBe(true)
  })

  it('메뉴 — 비었고 형제가 있는 메뉴', () => {
    const { toolbar, status } = menuToolbar({ selection: { kind: 'menu', id: 'mn-3' } })

    expect(status).toBe('')
    const line = statusLine(toolbar)
    expect(line.getAttribute('tabindex')).toBeNull()
    expect(tabStops(toolbar).some((stop) => reads(stop, line))).toBe(false)
    expect(toolbar.contains(line)).toBe(true)
  })
})

/**
 * **양수 `tabindex`는 쓰지 않는다.** 위 `tabStops`가 *"DOM 순서 = 탭 순서"*에 기대고 있으므로,
 * 양수가 하나라도 들어오면 이 파일의 수가 전부 거짓말이 된다. 그 전제를 값으로 못박는다.
 */
describe('탭 순서가 DOM 순서다 — 양수 `tabindex`가 없다', () => {
  it.each(STATES)('$name', ({ open }) => {
    const positives = [...open().toolbar.querySelectorAll('[tabindex]')].filter(
      (el) => Number(el.getAttribute('tabindex')) > 0,
    )

    expect(positives).toEqual([])
  })
})
