/**
 * **트리 줄 접기**(설계서 「설계서 화면 구조」 «트리 줄마다 접기») — 구조 트리 · 메뉴 트리의 펼침 단추 · «모두 접기» · «모두 펴기» · 저절로
 * 펴짐 · 보이는 차례(Shift 범위). 키보드 ← → 는 `test/edit/editor-keys.test.tsx`, 접힌 줄 위 끌기의 0.7s 펼침은 실브라우저
 * (`build-test/tree-fold.test.ts`)와 `test/drag/hover-open.test.ts` 가 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreeMenuNode } from '../../src/api/types'
import type { EditorStore } from '../../src/store/editor-store'
import { collapse, menuKey } from '../../src/tree/collapse'
import { HEAD_SEQ, OTHER_PAGE_ID, PAGE_ID, openPage, pageDoc, requireNode, structureTypes } from '../editor-harness'

const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

beforeEach(() => {
  createdStores.length = 0
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/**
 * ```
 * n-root Page
 * ├ n-a Text
 * ├ n-box Card
 * │ ├ n-b1 Button
 * │ └ n-inner Flex
 * │   └ n-deep Text
 * └ n-c Divider
 * ```
 */
const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-a', type: 'Text', props: { content: '머리' } },
    {
      id: 'n-box',
      type: 'Card',
      children: [
        { id: 'n-b1', type: 'Button' },
        { id: 'n-inner', type: 'Flex', children: [{ id: 'n-deep', type: 'Text', props: { content: '깊은 글' } }] },
      ],
    },
    { id: 'n-c', type: 'Divider' },
  ],
})

const ALL = ['Page', 'Text', 'Card', 'Button', 'Flex', 'Text', 'Divider']

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function menuRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

/** 구조 트리에서 그 노드의 줄 상자. */
function structureRow(nodeId: string): HTMLElement {
  const row = structureRegion().querySelector<HTMLElement>(`[data-tree-kind="node"][data-tree-id="${nodeId}"]`)
  if (row === null) throw new Error(`«${nodeId}» 줄이 없다`)
  return row
}

/** 줄 앞의 펼침 단추 — 포인터 몫이라 접근성 트리에 안 선다(`src/panels/tree-fold.tsx`). */
function toggleOf(row: HTMLElement): HTMLButtonElement {
  const toggle = row.querySelector<HTMLButtonElement>('[data-tree-toggle]')
  if (toggle === null) throw new Error('펼침 단추가 없다')
  return toggle
}

/** 줄 단추 — 줄 상자의 첫 자식이다. */
function rowButton(row: HTMLElement): HTMLElement {
  return row.firstElementChild as HTMLElement
}

describe('구조 트리 — 줄마다 접기', () => {
  it('펼침 단추는 자식 줄이 있는 줄에만 선다 — 누르면 그 안이 숨고 줄 단추의 `aria-expanded` 가 바뀐다', async () => {
    await openPage(DOC)
    const toggles = structureRegion().querySelectorAll('[data-tree-toggle]')
    expect([...toggles].map((toggle) => toggle.closest<HTMLElement>('[data-tree-row]')?.dataset['treeId'])).toEqual([
      'n-root',
      'n-box',
      'n-inner',
    ])
    expect(rowButton(structureRow('n-box')).getAttribute('aria-expanded')).toBe('true')
    // 자식 줄이 없는 줄은 접고 펼 상태가 없다.
    expect(rowButton(structureRow('n-a')).hasAttribute('aria-expanded')).toBe(false)

    fireEvent.click(toggleOf(structureRow('n-box')))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])
    expect(rowButton(structureRow('n-box')).getAttribute('aria-expanded')).toBe('false')
    // 펼침 단추를 누르는 것은 고르기가 아니다.
    expect(shellStore().getState().selectedNodeId).toBe('n-root')

    fireEvent.click(toggleOf(structureRow('n-box')))
    expect(structureTypes()).toEqual(ALL)
  })

  it('«모두 접기»는 뿌리 아래 맨 위 갈래만 남기고 «모두 펴기»는 다 편다', async () => {
    await openPage(DOC)
    fireEvent.click(within(structureRegion()).getByRole('button', { name: '모두 접기' }))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])
    // 안의 Flex 도 접혔다 — Card 만 펴면 Flex 줄은 서고 그 안은 숨는다.
    fireEvent.click(toggleOf(structureRow('n-box')))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Button', 'Flex', 'Divider'])

    fireEvent.click(within(structureRegion()).getByRole('button', { name: '모두 펴기' }))
    expect(structureTypes()).toEqual(ALL)
  })

  it('캔버스에서 접힌 줄 안의 노드를 고르면 그 조상이 펴진다', async () => {
    await openPage(DOC)
    fireEvent.click(within(structureRegion()).getByRole('button', { name: '모두 접기' }))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])

    fireEvent.click(requireNode('n-deep'))
    expect(structureTypes()).toEqual(ALL)
    expect(rowButton(structureRow('n-deep')).getAttribute('aria-current')).toBe('true')
  })

  it('여럿 고르기(사각형 · 붙이기 · 복제가 지나는 선택 목록)도 고른 노드마다 조상을 편다 — 다른 접힘은 그대로', async () => {
    await openPage(DOC)
    fireEvent.click(within(structureRegion()).getByRole('button', { name: '모두 접기' }))

    act(() => {
      shellStore().selectMany(['n-b1', 'n-c'], 'replace')
    })
    // Card 는 펴졌고(n-b1 의 부모) Flex 는 접힌 채다 — 고른 노드를 가린 줄만 편다.
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Button', 'Flex', 'Divider'])
  })

  it('남의 편집이 고른 노드를 접힌 줄 안으로 옮기면 그 줄을 편다', async () => {
    await openPage(DOC)
    fireEvent.click(rowButton(structureRow('n-a')))
    fireEvent.click(toggleOf(structureRow('n-box')))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])

    act(() => {
      shellStore().applyRemoteChange(PAGE_ID, {
        seq: HEAD_SEQ + 1,
        ops: [{ op: 'move', from: '/root/children/0', path: '/root/children/0/children/0' }],
        warnings: [],
      })
    })
    expect(shellStore().getState().selectedNodeId).toBe('n-a')
    expect(structureTypes()).toEqual(['Page', 'Card', 'Text', 'Button', 'Flex', 'Text', 'Divider'])
  })

  it('고른 노드의 조상을 사람이 접으면 다시 펴지 않는다 — 남의 다른 편집이 와도', async () => {
    await openPage(DOC)
    fireEvent.click(rowButton(structureRow('n-b1')))
    fireEvent.click(toggleOf(structureRow('n-box')))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])

    act(() => {
      shellStore().applyRemoteChange(PAGE_ID, {
        seq: HEAD_SEQ + 1,
        ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n-new', type: 'Divider' } }],
        warnings: [],
      })
    })
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider', 'Divider'])
    expect(shellStore().getState().selectedNodeId).toBe('n-b1')
  })

  it('Shift 클릭 범위는 보이는 차례다 — 접힌 줄 안에 숨은 기준 노드는 범위에 안 든다', async () => {
    // 범위는 스토어가 바깥 것으로 묶는다(조상 · 자손 — `normalizeSelection`) — 접힌 줄 안의 줄은 그 줄이 범위에 들면 어차피 빠진다. 보이는
    // 차례가 갈리는 것은 기준 노드 자체가 숨은 판이다: 숨은 줄에서 시작하는 범위는 서지 않고 누른 줄 하나를 고른다.
    await openPage(DOC)
    fireEvent.click(rowButton(structureRow('n-deep')))
    fireEvent.click(rowButton(structureRow('n-c')), { shiftKey: true })
    expect(shellStore().getState().selectedNodeIds).toEqual(['n-deep', 'n-c'])

    fireEvent.click(rowButton(structureRow('n-deep')))
    fireEvent.click(toggleOf(structureRow('n-box')))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])
    fireEvent.click(rowButton(structureRow('n-c')), { shiftKey: true })
    expect(shellStore().getState().selectedNodeIds).toEqual(['n-c'])
  })

  it('접힘은 페이지마다 세션 동안 남는다 — 뷰 모드에서 돌아와도 · 다른 페이지는 따로', async () => {
    await openPage(DOC, { docs: { [OTHER_PAGE_ID]: DOC } })
    fireEvent.click(toggleOf(structureRow('n-box')))

    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])

    // 다른 페이지는 제 접힘이다(빈 집합) — 같은 id 의 노드라도.
    fireEvent.click(within(menuRegion()).getByRole('link', { name: '회원 상세' }))
    await waitFor(() => expect(shellStore().getState().openPageId).toBe(OTHER_PAGE_ID))
    await waitFor(() => expect(structureTypes()).toEqual(ALL))
    fireEvent.click(within(menuRegion()).getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider']))
  })
})

/**
 * ```
 * 회원관리(mn-1)
 * ├ 회원 상세(pg-2)
 * └ 상세 관리(mn-2)
 *   └ 회원 목록(pg-1)
 * 주문관리(mn-3)
 * ```
 */
const NESTED: TreeMenuNode[] = [
  {
    id: 'mn-1',
    title: '회원관리',
    sortOrder: 1,
    pages: [{ id: OTHER_PAGE_ID, title: '회원 상세', sortOrder: 1 }],
    children: [{ id: 'mn-2', title: '상세 관리', sortOrder: 1, pages: [{ id: PAGE_ID, title: '회원 목록', sortOrder: 1 }], children: [] }],
  },
  { id: 'mn-3', title: '주문관리', sortOrder: 2, pages: [], children: [] },
]

function menuRow(menuId: string): HTMLElement {
  const row = menuRegion().querySelector<HTMLElement>(`[data-tree-kind="menu"][data-tree-id="${menuId}"]`)
  if (row === null) throw new Error(`«${menuId}» 메뉴 줄이 없다`)
  return row
}

/** 메뉴 트리에 지금 그려진 줄의 글 — 메뉴와 페이지, 그린 차례로. */
function menuTitles(): string[] {
  return [...menuRegion().querySelectorAll('[data-tree-row]')].map((row) => rowButton(row as HTMLElement).textContent ?? '')
}

describe('메뉴 트리 — 메뉴마다 접기', () => {
  it('페이지 · 하위 메뉴를 품은 메뉴에만 펼침 단추가 서고, 누르면 그 안이 숨는다', async () => {
    await openPage(DOC, { apiOverrides: { getTree: async () => NESTED } })
    await waitFor(() => expect(menuTitles()).toEqual(['회원관리', '회원 상세', '상세 관리', '회원 목록', '주문관리']))
    expect(menuRegion().querySelectorAll('[data-tree-toggle]')).toHaveLength(2)
    expect(rowButton(menuRow('mn-3')).hasAttribute('aria-expanded')).toBe(false)

    fireEvent.click(toggleOf(menuRow('mn-2')))
    expect(menuTitles()).toEqual(['회원관리', '회원 상세', '상세 관리', '주문관리'])
    expect(rowButton(menuRow('mn-2')).getAttribute('aria-expanded')).toBe('false')
    // 열린 페이지가 숨어도 주소는 그대로다 — 접기는 화면의 일이다.
    expect(shellStore().getState().openPageId).toBe(PAGE_ID)
  })

  it('«모두 접기» · «모두 펴기»는 메뉴 트리 머리에도 서고 뷰 모드에서도 선다', async () => {
    await openPage(DOC, { apiOverrides: { getTree: async () => NESTED } })
    await waitFor(() => expect(menuTitles()).toHaveLength(5))
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    fireEvent.click(within(menuRegion()).getByRole('button', { name: '모두 접기' }))
    expect(menuTitles()).toEqual(['회원관리', '주문관리'])
    fireEvent.click(within(menuRegion()).getByRole('button', { name: '모두 펴기' }))
    expect(menuTitles()).toEqual(['회원관리', '회원 상세', '상세 관리', '회원 목록', '주문관리'])
  })

  it('메뉴 줄의 ← 는 접고 → 는 편다 — 수식 키가 붙은 ← → 는 표의 계층 옮기기다', async () => {
    await openPage(DOC, { apiOverrides: { getTree: async () => NESTED } })
    await waitFor(() => expect(menuTitles()).toHaveLength(5))
    const menu = rowButton(menuRow('mn-1'))

    fireEvent.keyDown(menu, { key: 'ArrowLeft' })
    expect(menuTitles()).toEqual(['회원관리', '주문관리'])
    fireEvent.keyDown(menu, { key: 'ArrowRight' })
    expect(menuTitles()).toHaveLength(5)
    // 펼침이 없는 메뉴에서는 아무것도 안 한다.
    fireEvent.keyDown(rowButton(menuRow('mn-3')), { key: 'ArrowLeft' })
    expect(menuTitles()).toHaveLength(5)
  })

  it('열린 페이지가 접힌 메뉴 안이면 그 위 메뉴를 편다 — 주소로 들어온 판', async () => {
    collapse(menuKey('p-1'), ['mn-1', 'mn-2', 'mn-3'])
    await openPage(DOC, { apiOverrides: { getTree: async () => NESTED } })
    await waitFor(() => expect(menuTitles()).toEqual(['회원관리', '회원 상세', '상세 관리', '회원 목록', '주문관리']))
  })
})
