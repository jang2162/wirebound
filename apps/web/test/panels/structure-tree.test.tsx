/**
 * 좌측 하단의 구조 트리. 열린 페이지의 컴포넌트 트리를 그리고, 캔버스와 **같은 선택**을
 * 보여 준다(설계 §9).
 *
 * 캔버스 테스트와 같은 이유로 `<App />`을 라우트째로 렌더한다 — `../editor-harness` 머리말.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../../src/store/editor-store'
import {
  PAGE_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  openPage,
  pageDoc,
  renderEditor,
  requireNode,
  selectionOutline,
  waitForNode,
} from '../editor-harness'

/**
 * 셸이 만든 `EditorStore`. 화면만 보는 단언으로는 "선택이 스토어에 들어간다"를 지킬 수
 * 없다 — 구조 트리가 선택을 자기 `useState`로 들어도 표시는 똑같이 움직인다. 장치의
 * 생김새와 이유는 `../routes/editor-shell.test.tsx` 머리말에 있다.
 */
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

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-flex',
      type: 'Flex',
      children: [
        {
          id: 'n-search',
          type: 'SearchForm',
          children: [{ id: 'n-field', type: 'Field', props: { label: '가입일' } }],
        },
        { id: 'n-list', type: 'List' },
      ],
    },
  ],
})

/** 구조 트리 자리. 편집 모드에서만 DOM에 있다(태스크 7). */
function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

/** 구조 트리의 노드 줄. 순서는 화면에 그려진 순서 그대로다. */
function nodeRows(): HTMLElement[] {
  return within(structureRegion()).queryAllByRole('button')
}

/** 지금 구분 표시가 붙은 줄. `aria-current`가 표시의 단일 진실이다. */
function currentRows(): HTMLElement[] {
  return within(structureRegion()).queryAllByRole('button', { current: true })
}

function row(type: string): HTMLElement {
  return within(structureRegion()).getByRole('button', { name: type })
}

describe('구조 트리', () => {
  it('문서의 노드 트리를 그린다', async () => {
    await openPage(DOC)

    // 깊이 우선 전위 순회. 문서 순서 그대로여야 캔버스와 눈으로 대조할 수 있다.
    expect(nodeRows().map((node) => node.textContent)).toEqual([
      'Page',
      'Flex',
      'SearchForm',
      'Field',
      'List',
    ])

    // 순서만으로는 평평한 목록도 통과한다. 중첩까지 본다.
    const search = row('SearchForm').closest('li')
    const field = row('Field').closest('li')
    const list = row('List').closest('li')
    if (search === null || field === null || list === null) {
      throw new Error('구조 트리의 줄이 목록 항목이 아닙니다')
    }
    expect(search.contains(field)).toBe(true)
    // 형제는 안에 들어 있지 않다. 이것이 없으면 모두를 한 줄 안에 넣은 구현도 통과한다.
    expect(search.contains(list)).toBe(false)
  })

  it('노드 타입을 보여준다', async () => {
    // 위 케이스와 다른 타입들로 연다. 타입이 문서에서 온다는 것을 못박는다 — 화면이
    // 무엇을 하드코딩해도 두 케이스를 함께 통과할 수는 없다.
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          { id: 'n-card', type: 'Card', children: [{ id: 'n-text', type: 'Text' }] },
          { id: 'n-button', type: 'Button' },
        ],
      }),
    )

    expect(nodeRows().map((node) => node.textContent)).toEqual([
      'Page',
      'Card',
      'Text',
      'Button',
    ])
  })

  it('노드를 누르면 선택된다', async () => {
    await openPage(DOC)
    // 양성 대조: 열자마자 고른 것이 있으면 아래가 무의미하다.
    expect(shellStore().getState().selectedNodeId).toBeNull()

    fireEvent.click(row('List'))

    // **스토어를 직접 본다.** 표시만 보면 선택을 구조 트리의 로컬 state에 든 구현도
    // 통과하고, 그러면 캔버스·속성 패널과의 배선이 끊긴 채 지나간다.
    expect(shellStore().getState().selectedNodeId).toBe('n-list')
  })

  it('캔버스에서 선택하면 구조 트리에도 반영된다', async () => {
    await openPage(DOC)

    fireEvent.click(requireNode('n-search'))

    // 둘이 같은 스토어를 본다는 뜻이다. 각자 자기 상태를 들면 여기서 갈라진다.
    expect(currentRows().map((node) => node.textContent)).toEqual(['SearchForm'])
  })

  it('구조 트리에서 선택하면 캔버스에도 반영된다', async () => {
    await openPage(DOC)

    fireEvent.click(row('Field'))

    // 반대 방향도 이어져 있어야 한 곳에 모인 선택이라고 할 수 있다.
    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-field')
  })

  it('선택된 노드만 구분 표시된다', async () => {
    await openPage(DOC)
    // 양성 대조: 고르기 전에는 표시가 하나도 없다. 이것이 없으면 모든 줄에 표시를 다는
    // 구현도 "선택된 줄에 표시가 있다"를 통과한다.
    expect(currentRows()).toHaveLength(0)

    fireEvent.click(row('List'))

    expect(currentRows().map((node) => node.textContent)).toEqual(['List'])

    // 다른 줄을 고르면 표시가 옮겨 간다. 하나씩 늘어나는 구현을 가른다.
    fireEvent.click(row('Flex'))

    expect(currentRows().map((node) => node.textContent)).toEqual(['Flex'])
  })

  it('id가 없는 노드는 고를 수 없는 줄이 된다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        // 렌더러의 모양 가드가 캔버스에서 폴백으로 흡수하는 값이다. 선택은 id 하나로
        // 오가므로 트리에서도 고를 수 있으면 안 된다.
        children: [{ type: 'Text' } as never],
      }),
    )

    // 줄 자체는 보인다 — 캔버스에는 폴백이 그려져 있는데 트리에서만 사라지면 더 알기
    // 어렵다.
    within(structureRegion()).getByText('Text')
    // 하지만 누를 수 있는 줄은 루트 하나뿐이다.
    expect(nodeRows().map((node) => node.textContent)).toEqual(['Page'])
  })

  it('문서가 없으면 비어 있다', async () => {
    renderEditor({ route: PROJECT_ROUTE, docs: { [PAGE_ID]: DOC } })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    expect(nodeRows()).toHaveLength(0)

    // 양성 대조: 페이지를 열면 같은 자리에 줄이 생긴다. 이것이 없으면 구조 트리를 아예
    // 그리지 못하는 구현도 위 단언을 통과한다.
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))

    await waitForNode('n-list')
    expect(nodeRows().length).toBeGreaterThan(0)
  })
})
