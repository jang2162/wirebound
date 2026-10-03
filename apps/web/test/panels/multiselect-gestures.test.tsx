/**
 * **고르는 몸짓**(설계서 「설계서 화면 구조」의 «고르는 법» — 여러 노드 선택). 트리 · 캔버스의 Cmd(이 jsdom 은 mac 이 아니라 Ctrl) · Shift
 * 클릭, 고른 줄 강조, 캔버스 외곽선 여럿 · 손잡이, Cmd+A, 열린 줄 메뉴가 목록이 바뀌면 닫히는 것. 규칙 자체(조상 · 자손 · 루트 · 상한)는
 * `store/editor-store-selection.test.ts` 가 재고, 사각형은 `canvas/canvas-marquee.test.ts`(순수) · `build-test/multiselect.test.ts`(실브라우저)가
 * 잰다 — jsdom 에는 상자가 없다.
 *
 * jsdom 값이다 — 포인터 · 포커스 차례는 실브라우저가 재는 축이다.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../../src/store/editor-store'
import { canvasDocument, openPage, pageDoc, requireNode } from '../editor-harness'

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
 * n-root
 *   n-card   n-title
 *   n-a
 *   n-b
 * ```
 */
const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n-title', type: 'Text', props: { content: '제목' } }] },
    { id: 'n-a', type: 'Text', props: { content: '가' } },
    { id: 'n-b', type: 'Text', props: { content: '나' } },
  ],
})

const picked = (): { ids: readonly string[]; anchor: string | null } => ({
  ids: shellStore().getState().selectedNodeIds,
  anchor: shellStore().getState().selectedNodeId,
})

function treeList(): HTMLElement {
  const list = screen.getByRole('region', { name: '구조 트리' }).querySelector<HTMLElement>('.wb-shell-structure')
  if (list === null) throw new Error('구조 트리 목록이 없다')
  return list
}

/** 트리 줄 단추 — `data-tree-id`로 찾는다(타입 이름은 겹친다). */
function row(nodeId: string): HTMLElement {
  const box = treeList().querySelector<HTMLElement>(`[data-tree-id="${nodeId}"]`)
  const button = box?.querySelector<HTMLElement>('.wb-shell-structure-node') ?? null
  if (button === null) throw new Error(`${nodeId} 줄이 없다`)
  return button
}

describe('구조 트리', () => {
  it('Ctrl 클릭은 더하고 다시 누르면 뺀다 — 기준 노드는 마지막으로 더한 것', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-a'))
    fireEvent.click(row('n-b'), { ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-a', 'n-b'], anchor: 'n-b' })
    fireEvent.click(row('n-a'), { ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-b'], anchor: 'n-b' })
  })

  it('Shift 클릭은 기준 노드부터 보이는 차례로 — 가장 바깥 것들', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-title'))
    fireEvent.click(row('n-b'), { shiftKey: true })
    expect(picked()).toEqual({ ids: ['n-title', 'n-a', 'n-b'], anchor: 'n-b' })
    // 기준 노드가 이제 `n-b` 다 — 거기서 `n-card` 까지는 넷이고 `n-title` 은 `n-card` 안이라 빠진다.
    fireEvent.click(row('n-card'), { shiftKey: true })
    expect(picked()).toEqual({ ids: ['n-card', 'n-a', 'n-b'], anchor: 'n-card' })
  })

  it('수식 키 없는 클릭은 하나로 돌아간다', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-a'))
    fireEvent.click(row('n-b'), { ctrlKey: true })
    fireEvent.click(row('n-card'))
    expect(picked()).toEqual({ ids: ['n-card'], anchor: 'n-card' })
  })

  /** 혼자 죽는 변조: 기준 노드가 아닌 고른 줄에 강조 클래스를 안 단다. */
  it('고른 줄을 모두 강조한다 — 기준 노드는 `aria-current`, 나머지는 테두리', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-a'))
    fireEvent.click(row('n-b'), { ctrlKey: true })
    expect({
      current: row('n-b').getAttribute('aria-current'),
      member: row('n-a').classList.contains('wb-shell-structure-node-member'),
      anchorMember: row('n-b').classList.contains('wb-shell-structure-node-member'),
      other: row('n-card').classList.contains('wb-shell-structure-node-member'),
    }).toEqual({ current: 'true', member: true, anchorMember: false, other: false })
  })

  /**
   * **열린 줄 메뉴는 고른 목록이 바뀌면 닫힌다**(`TreeRowActions` 의 `selection`) — 기준 노드는 그대로인데 Ctrl+A 로 형제가 다 든 판.
   * 닫지 않으면 «삭제»가 연 때와 다른 목록을 지운다. 혼자 죽는 변조: `selection` 을 안 견준다(`picked` 만).
   */
  it('기준 노드 줄의 `…` 를 연 채 목록이 바뀌면(Ctrl+A) 메뉴가 닫힌다', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-a'))
    const more = within(treeList().querySelector<HTMLElement>('[data-tree-id="n-a"]')!).getByRole('button', { name: 'Text 더 보기' })
    fireEvent.click(more)
    expect(screen.queryAllByRole('menu')).toHaveLength(1)

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true }))
    })

    expect({ menus: screen.queryAllByRole('menu').length, ids: picked().ids }).toEqual({ menus: 0, ids: ['n-card', 'n-a', 'n-b'] })
  })

  it('다른 고른 줄의 `…` 를 열면 그 줄 하나로 고른다', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-a'))
    fireEvent.click(row('n-b'), { ctrlKey: true })
    fireEvent.click(within(treeList().querySelector<HTMLElement>('[data-tree-id="n-a"]')!).getByRole('button', { name: 'Text 더 보기' }))
    expect({ menus: screen.queryAllByRole('menu').length, ...picked() }).toEqual({ menus: 1, ids: ['n-a'], anchor: 'n-a' })
  })
})

describe('캔버스', () => {
  it('Ctrl 클릭은 더하고 · 빈 곳의 Ctrl 클릭은 고른 것을 지킨다', async () => {
    await openPage(DOC)
    fireEvent.click(requireNode('n-a'))
    fireEvent.click(requireNode('n-b'), { ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-a', 'n-b'], anchor: 'n-b' })
    fireEvent.click(canvasDocument().body, { ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-a', 'n-b'], anchor: 'n-b' })
    fireEvent.click(canvasDocument().body)
    expect(picked()).toEqual({ ids: [], anchor: null })
  })

  /** 혼자 죽는 변조: 외곽선을 기준 노드 하나만 그린다 · 손잡이가 여럿에서도 선다. */
  it('고른 것마다 외곽선 — 기준 노드는 진한 것 하나, 나머지는 옅은 것 · 손잡이는 하나 골랐을 때만', async () => {
    await openPage(DOC)
    fireEvent.click(requireNode('n-a'))
    expect(screen.queryByRole('button', { name: 'Text 옮기기' })).not.toBeNull()
    fireEvent.click(requireNode('n-card'), { ctrlKey: true })

    expect({
      anchor: document.body.querySelector('[data-wb-selected-id]')?.getAttribute('data-wb-selected-id'),
      members: [...document.body.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id')),
      handles: screen.queryAllByRole('button', { name: /옮기기$/ }).length,
    }).toEqual({ anchor: 'n-card', members: ['n-a'], handles: 0 })
  })
})

describe('Ctrl+A — 형제 모두', () => {
  it('기준 노드의 형제 모두를 고르고 기준 노드는 그대로다', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-a'))
    fireEvent.keyDown(row('n-a'), { key: 'a', code: 'KeyA', ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-card', 'n-a', 'n-b'], anchor: 'n-a' })
  })

  it('기준 노드가 자식이면 그 부모의 자식들 · 루트면 루트의 자식들', async () => {
    await openPage(DOC)
    fireEvent.click(row('n-title'))
    fireEvent.keyDown(row('n-title'), { key: 'a', code: 'KeyA', ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-title'], anchor: 'n-title' })
    fireEvent.click(row('n-root'))
    fireEvent.keyDown(row('n-root'), { key: 'a', code: 'KeyA', ctrlKey: true })
    expect(picked()).toEqual({ ids: ['n-card', 'n-a', 'n-b'], anchor: 'n-b' })
  })

  it('남이 잡은 형제는 빠진다', async () => {
    await openPage(DOC)
    act(() => {
      shellStore().setLocks([{ pageId: 'pg-1', nodeId: 'n-b', userId: 'u-bora', userName: '보라' }])
    })
    fireEvent.click(row('n-a'))
    fireEvent.keyDown(row('n-a'), { key: 'a', code: 'KeyA', ctrlKey: true })
    expect(picked().ids).toEqual(['n-card', 'n-a'])
  })
})
