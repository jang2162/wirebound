/**
 * **상태줄에 키보드로 닿는가 — 열두 상태 전부에서.**
 *
 * `./toolbar-status.test.ts`가 *"어느 상태에서 어느 문장이 나오는가"*를 갖는다면, 이
 * 파일은 그 다음 질문 하나를 갖는다: **그 문장이 나와 있을 때 키보드 사용자가 거기
 * 닿는가.**
 *
 * # 이 파일이 생긴 이유 — 앞 판의 주장이 절반만 참이었다
 *
 * 상태줄을 들인 커밋은 *"`aria-describedby`를 **활성** 버튼에 건 것이 요점이다 — 비활성
 * 버튼은 탭 순서에서 빠지므로 거기 건 설명은 키보드에 영영 안 닿는다"*고 적었다.
 * **리뷰가 브라우저로 재보니 성립하지 않는 상태가 있었다.** 그것들은 **활성 버튼이 하나도
 * 없는** 상태들이다:
 *
 * | 툴바 | 상태 | 고치기 전에 탭이 닿는 곳 |
 * |---|---|---|
 * | 구조 | 안 골랐다 · 문서에 없다 | `패턴 넣기`·`프리셋`뿐 — **설명이 없다** |
 * | 메뉴 | 보내는 중 · 안 골랐다 · 트리에 없다 | **없다** — 아홉이 전부 꺼진다 |
 *
 * 즉 *"활성 버튼에 걸었으니 됐다"*는 **활성 버튼이 있을 때만** 참이었고, 하필 **할 말이
 * 가장 많은 상태들**이 그 조건을 어긴다.
 *
 * **리뷰는 여섯으로 셌고 여기서 잰 것은 다섯이다** — 갈린 하나(`구조 · 남이 잠갔다`)의
 * 사연은 아래 `STATES` 표의 머리말에 있다.
 *
 * # 고른 길 — 상태줄 자체를 탭 정지점으로 둔다
 *
 * 세 갈래를 두고 골랐다.
 *
 * 1. **`패턴 넣기`·`프리셋`에도 `aria-describedby`를 건다.** 구조 둘은 닫히지만 **메뉴 셋은
 *    안 닫힌다** — 그쪽에는 판정 밖의 버튼이 아예 없어 `busy`면 아홉이 다 꺼진다. 그리고
 *    **그 둘 중 하나에서는 거짓말이 된다**: 그 버튼들은 **선택이 없어도 되는 조작**이라
 *    (`structure-toolbar.tsx` 머리말의 D5·P7-2 D3) 선택이 없을 때 *"트리에서 노드를 고르면
 *    편집할 수 있습니다"*를 그 버튼의 설명으로 읽히게 하면 **없는 전제조건을 만든다**
 *    (`구조 · 문서에 없다` 쪽은 그 노드를 겨냥하므로 그렇지 않다 — 그래서 조건부로 거는
 *    길이 남지만, 그것은 *"어느 문장이 어느 버튼에 맞나"*를 한 벌 더 판정하는 것이다).
 * 2. **`disabled`를 `aria-disabled`로 바꿔 꺼진 버튼도 탭에 남긴다.** 열둘이 다 닫히지만
 *    이 저장소에서 `disabled`·`:disabled`를 지나는 자리가 22개 파일 154군데다 — 이 슬라이스가
 *    감당할 범위가 아니고, 셸 전체의 의미를 바꾼다.
 * 3. **상태줄 자체에 `tabIndex`를 준다.** ← 고른 것.
 *
 * **3이 유일하게 상태에 안 매인 규칙이다:** *"할 말이 있으면 그 줄에 닿을 수 있다."*
 * 어느 버튼이 켜져 있는지를 보지 않으므로 **열두 상태 전부에서 같은 이유로 성립하고**,
 * 버튼이 늘거나 줄어도 낡지 않는다. 값도 그 줄이 스스로 낸다 — 포커스가 닿으면 그 요소의
 * 글이 곧 읽히는 것이라 `aria-describedby` 해석에 기대지 않는다.
 *
 * **`aria-describedby`는 그대로 둔다.** 그것이 하는 일은 *"조작을 하려는 그 순간"*에 이유를
 * 붙여 주는 것이고(원 커밋), 이 `tabIndex`는 *"활성 버튼이 하나도 없을 때"*의 바닥이다.
 * 둘은 겹치는 것이 아니라 순서가 다르다.
 *
 * **남는 것 — 구조 둘에서는 `패턴 넣기`·`프리셋`을 먼저 지난다.** 그 둘은 켜져 있고 설명이
 * 없으므로(위 1번의 이유로 걸지 않았다) 상태줄이 **세 번째 정지점**이다. 몇 번째인지를 그냥
 * 재서 표에 남긴다 — *"닿는다"*는 열둘이고 *"첫 정지점에서 닿는다"*는 열이다.
 *
 * # 판정을 두 벌로 만들지 않는다 — `abilities`도 문안도 진짜를 지난다
 *
 * `./toolbar-status.test.ts`와 같은 이유다. 불리언을 손으로 채우면 **도달하지 않는 조합**을
 * 재게 되므로 문서와 트리를 짓고 `structureAbilities`·`treeAbilities`·`structureStatus`·
 * `menuStatus`를 그대로 지난다. 그래서 아래 열두 줄은 **진짜로 도달하는 열두 상태**다.
 *
 * # 툴바만 떼어 렌더한다 — 여기서는 그것이 맞다
 *
 * `./structure-toolbar.test.tsx`가 `<App />`을 라우트째 렌더하는 것은 *"고른 노드가 스토어를
 * 지나는가"*·*"편집이 파이프라인을 지나는가"*가 그 파일의 하중이기 때문이다. **이 파일의
 * 하중은 툴바 안의 DOM 순서와 포커스 가능성 하나**이고, 열둘 중 둘(*"문서·트리에 없다"*)은
 * 화면 조작으로 도달시키기 어렵다 — 남이 지운 뒤 재조회 전까지의 창이다.
 *
 * **그래서 화면을 지나는 쪽을 따로 남긴다:** 실제로 깨져 있던 두 상태를 앱째로 재는 케이스가
 * `./structure-toolbar.test.tsx`(선택 해제)와 `./menu-crud.test.tsx`(`busy`)에 있다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, WbNode } from '@wirebound/schema'
import type { TreeMenuNode } from '../../src/api/types'
import { structureAbilities } from '../../src/edit/structure-actions'
import { treeAbilities, type TreeSelection } from '../../src/tree/tree-actions'
import type { TreeCommands } from '../../src/tree/use-tree-commands'
import { MenuToolbar } from '../../src/panels/menu-toolbar'
import { StructureToolbar, type StructureCommands } from '../../src/panels/structure-toolbar'
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

function structureToolbar(input: {
  selectedNodeId: string | null
  lock?: NodeLock | null
}): { toolbar: HTMLElement; status: string } {
  const document = doc()
  const { selectedNodeId } = input
  const lock = input.lock ?? null
  const abilities = structureAbilities(document, selectedNodeId)
  const status = structureStatus({
    selectedNodeId,
    isRoot: selectedNodeId !== null && document.root.id === selectedNodeId,
    lock,
    abilities,
  })
  const commands: StructureCommands = {
    abilities,
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
  }
  const view = render(
    <StructureToolbar
      commands={commands}
      projectId="pr-1"
      pageId="pg-1"
      currentNodes={document.root.children ?? null}
    />,
  )
  const toolbar = view.container.querySelector<HTMLElement>('.wb-shell-structure-toolbar')
  if (toolbar === null) throw new Error('구조 툴바가 없습니다')
  return { toolbar, status }
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
    importJson: unused,
    imported: null,
    reparenting: null,
    openReparent: unused,
    reparentTo: unused,
    cancelReparent: unused,
  }
  const view = render(<MenuToolbar commands={commands} />)
  const toolbar = view.container.querySelector<HTMLElement>('.wb-shell-menu-toolbar')
  if (toolbar === null) throw new Error('메뉴 툴바가 없습니다')
  return { toolbar, status }
}

function statusLine(toolbar: HTMLElement): HTMLElement {
  const line = toolbar.querySelector<HTMLElement>('[class$="-status"]')
  if (line === null) throw new Error('툴바에 상태줄이 없습니다')
  return line
}

/**
 * 이 툴바 안의 **탭 정지점을 순서대로.**
 *
 * 브라우저의 탭 순서는 (양수 `tabindex`가 없으면) 곧 DOM 순서이고, 이 두 툴바에는 양수가
 * 없다 — 있으면 이 함수가 거짓말을 하므로 아래 `양수 tabindex는 쓰지 않는다`가 그것을
 * 값으로 막는다. `disabled` 버튼이 빠지는 것이 이 파일이 재려는 바로 그 성질이다.
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
 * `at`이 이 파일의 값이다. `-1`이면 **어디서도 못 읽는다**(고치기 전의 다섯이 그랬다).
 *
 * | 상태 | 고치기 전 | 지금 | 첫 정지점이 무엇인가 |
 * |---|---|---|---|
 * | 구조 · 안 골랐다 | **-1** | 2 | `패턴 넣기`·`프리셋`을 지나 상태줄 |
 * | 구조 · 남이 잠갔다 | 0 | 0 | `안에 추가` — **판정은 잠금을 안 본다**(아래) |
 * | 구조 · 루트다 | 0 | 0 | `안에 추가` |
 * | 구조 · 문서에 없다 | **-1** | 2 | `패턴 넣기`·`프리셋`을 지나 상태줄 |
 * | 구조 · 자식을 못 담는다 | 0 | 0 | `아래 추가` |
 * | 구조 · 형제가 없다 | 0 | 0 | `안에 추가` |
 * | 메뉴 · 보내는 중 | **-1** | 0 | **상태줄** — 아홉이 다 꺼져 다른 정지점이 없다 |
 * | 메뉴 · 안 골랐다 | **-1** | 0 | **상태줄** |
 * | 메뉴 · 트리에 없다 | **-1** | 0 | **상태줄** |
 * | 메뉴 · 페이지다 | 0 | 0 | `이름 변경` |
 * | 메뉴 · 하위가 있다 | 0 | 0 | `하위 메뉴` |
 * | 메뉴 · 형제가 없다 | 0 | 0 | `하위 메뉴` |
 *
 * **리뷰가 센 것은 여섯이고 재 보니 다섯이다 — 갈린 하나가 `구조 · 남이 잠갔다`다.**
 * `structureAbilities`는 **잠금을 아예 보지 않으므로**(`edit/structure-actions.ts` — 인자가
 * 문서와 id뿐이다) 잠긴 노드를 고르고 있어도 버튼은 그대로 켜져 있다. 그래서 그 상태에는
 * 설명을 든 활성 버튼이 늘 있다. 사다리에서 잠금이 *"문서에 없다"*보다 위이므로 **둘이
 * 겹칠 때만**(잠겼는데 문서에도 없다) 일곱이 다 꺼지는데, 그것은 사다리의 한 칸이 아니라
 * 두 칸이 겹친 자리라 이 표의 행이 아니다. 아래 `잠금은 판정을 끄지 않는다`가 그 사실
 * 자체를 값으로 못박는다 — 이 표의 `0`이 우연이 아니라는 근거다.
 */
const STATES: {
  name: string
  at: number
  open: () => { toolbar: HTMLElement; status: string }
}[] = [
  // 구조 여섯.
  { name: '구조 · 안 골랐다', at: 2, open: () => structureToolbar({ selectedNodeId: null }) },
  {
    name: '구조 · 남이 잠갔다',
    at: 0,
    open: () => structureToolbar({ selectedNodeId: 'n-root', lock: LOCK }),
  },
  { name: '구조 · 루트다', at: 0, open: () => structureToolbar({ selectedNodeId: 'n-root' }) },
  { name: '구조 · 문서에 없다', at: 2, open: () => structureToolbar({ selectedNodeId: 'n-gone' }) },
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
 * **구조 셋에서 앞서는 둘이 무엇인지도 값으로 둔다.**
 *
 * 위 표의 `2`가 *"`패턴 넣기`·`프리셋`을 지난다"*는 뜻임을 못박는다 — 그 둘에 설명을 걸면
 * 이 수가 0이 되므로, **머리말 1번의 판단이 뒤집히면 이 케이스가 깨진다.** 그 둘에 걸지
 * 않은 이유는 **선택이 없어도 되는 조작**이라 *"트리에서 노드를 고르면 편집할 수 있습니다"*가
 * 없는 전제조건을 만들기 때문이다.
 */
describe('구조에서 앞서는 둘 — 판정 밖의 버튼이라 설명이 없다', () => {
  it.each(['구조 · 안 골랐다', '구조 · 문서에 없다'])('%s', (name) => {
    const state = STATES.find((s) => s.name === name)
    if (state === undefined) throw new Error(`${name} 상태가 없습니다`)
    const { toolbar } = state.open()

    const stops = tabStops(toolbar)
    expect(stops.slice(0, 2).map((el) => el.textContent)).toEqual(['패턴 넣기', '프리셋'])
    expect(stops.slice(0, 2).map((el) => el.getAttribute('aria-describedby'))).toEqual([null, null])
  })
})

/**
 * **잠금은 판정을 끄지 않는다** — 위 표에서 `구조 · 남이 잠갔다`가 `0`인 이유이고,
 * 리뷰가 센 여섯과 잰 다섯이 갈린 자리다. `structureAbilities`의 인자에 잠금이 아예
 * 없으므로(문서와 id뿐) 이 값은 잠금이 있든 없든 같다.
 *
 * **이것이 옳은지는 이 파일이 판단하지 않는다** — 잠긴 자리에 `안에 추가`가 켜져 있는 것이
 * 맞는지는 별개의 물음이고 이월에 적었다. 여기서는 표의 `0`이 **무엇 때문인지**만 고정한다.
 */
describe('잠금은 판정을 끄지 않는다 — 표의 `0`이 우연이 아니다', () => {
  it('잠긴 루트에서도 `안에 추가`는 켜져 있다', () => {
    const locked = structureAbilities(doc(), 'n-root')
    expect(locked.addInside).toBe(true)

    const { toolbar } = structureToolbar({ selectedNodeId: 'n-root', lock: LOCK })
    const first = tabStops(toolbar)[0]
    expect(first?.textContent).toBe('안에 추가')
    expect(first?.getAttribute('aria-describedby')).toBe(statusLine(toolbar).id)
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
    // 자리는 그대로 있다 — 사라지면 툴바 높이가 출렁인다.
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
