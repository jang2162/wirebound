/**
 * 좌측 하단의 구조 트리. 열린 페이지의 컴포넌트 트리를 그리고, 캔버스와 **같은 선택**을
 * 보여 준다(설계서 「설계서 화면 구조」).
 *
 * 캔버스 테스트와 같은 이유로 `<App />`을 라우트째로 렌더한다 — `../editor-harness` 머리말.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WbNode } from '@wirebound/schema'
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
import { HIDDEN_IN_STATE_LABEL } from '../../src/panels/structure-tree'
import { structureRowName, structureRowType } from './tree-row'

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

/** 구조 트리 자리. 편집 모드에서만 DOM에 있다. */
function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

/**
 * 노드 줄이 들어 있는 목록. **region이 아니라 이것으로 좁히는 것은 제목 줄의 뿌리 `+` 때문이다** —
 * 그 단추가 트리와 같은 region 안에 산다. 목록 안의 줄 `+` · `…`는 `nodeRows`가 거른다.
 *
 * 문서가 없으면 목록 자체가 없다(`열린 페이지가 없습니다`). 그때는 `null`이고, 아래
 * 헬퍼들이 빈 결과를 낸다 — 던지면 "줄이 없다"를 재는 케이스가 그 자리에서 깨진다.
 */
function structureList(): HTMLElement | null {
  return structureRegion().querySelector<HTMLElement>('.wb-shell-structure')
}

/** 구조 트리의 노드 줄. 순서는 화면에 그려진 순서 그대로다. */
/** 정보 통지 한 칸(`shell/info-notice.tsx`)의 글. */
function infoTexts(): string[] {
  return screen
    .queryAllByRole('status')
    .filter((element) => element.classList.contains('wb-shell-info-notice'))
    .map((element) => element.textContent ?? '')
}

function nodeRows(): HTMLElement[] {
  const list = structureList()
  // 줄 단추만 — 줄의 `+` · `…`(행동 메뉴 단추)는 줄이 아니다.
  return list === null
    ? []
    : within(list)
        .queryAllByRole('button')
        .filter((button) => button.getAttribute('aria-haspopup') !== 'menu')
}

/** 지금 구분 표시가 붙은 줄. `aria-current`가 표시의 단일 진실이다. */
function currentRows(): HTMLElement[] {
  const list = structureList()
  return list === null ? [] : within(list).queryAllByRole('button', { current: true })
}

function row(type: string): HTMLElement {
  const list = structureList()
  if (list === null) throw new Error('구조 트리 목록이 없습니다')
  return within(list).getByRole('button', { name: structureRowName(type) })
}

describe('구조 트리', () => {
  it('문서의 노드 트리를 그린다', async () => {
    await openPage(DOC)

    // 깊이 우선 전위 순회. 문서 순서 그대로여야 캔버스와 눈으로 대조할 수 있다.
    expect(nodeRows().map((node) => structureRowType(node))).toEqual(['Page', 'Flex', 'SearchForm', 'Field', 'List'])

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

  it('children 배열 안에 노드가 아닌 원소가 있어도 셸은 살아 있다', async () => {
    // **`<App />` 층의 자리다.** `structureAbilities`의 순회가 노드 아닌 원소를 견뎌도
    // 그것만으로는 모자란다 — 줄을 그리는 `StructureNode`가 원소마다 `isSelectable`을
    // 부르므로 거기서 `null`에 던질 수 있다. 여기는 오류 경계 밖이라 던지면 셸이 통째로 사라진다.
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [null as unknown as WbNode, { id: 'n-a', type: 'Text' }],
      }),
    )

    expect(screen.getByRole('region', { name: '구조 트리' })).toBeTruthy()
    // 노드가 아닌 원소는 줄로 그리지 않는다 — 그릴 이름도 고를 id도 없다.
    expect(nodeRows().map((node) => structureRowType(node))).toEqual(['Page', 'Text'])
  })

  /**
   * **지금 상태에서 숨은 노드도 줄로 선다 — 흐리게 · «이 상태에서 숨김» 표지 · 고를 수 있다**(설계 spec «C3»). 표지는 그 노드 자신의 보임으로
   * 숨은 줄에만 서고(조상이 숨어 함께 숨은 자손은 흐리기만) · 접근 이름이 아니라 설명(`aria-description`)에 든다.
   */
  it('지금 상태에서 숨은 노드는 흐리게 서고 표지를 단다 — 고를 수 있고, 상태를 바꾸면 걷힌다', async () => {
    await openPage({
      ...pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          { id: 'n-card', type: 'Card', visibility: { mode: 'only', states: ['s_admin'] }, children: [{ id: 'n-text', type: 'Text' }] },
          { id: 'n-btn', type: 'Button' },
        ],
      }),
      viewStates: [{ id: 's_admin', name: '관리자' }],
    })
    const dimmed = (): (string | null)[] =>
      nodeRows()
        .filter((node) => node.classList.contains('wb-shell-structure-node-hidden'))
        .map((node) => structureRowType(node))
    const marks = (): number => structureList()!.querySelectorAll('.wb-shell-structure-hidden').length

    expect(nodeRows().map((node) => structureRowType(node))).toEqual(['Page', 'Card', 'Text', 'Button'])
    expect(dimmed()).toEqual(['Card', 'Text'])
    expect(marks()).toBe(1)
    expect(row('Card').getAttribute('aria-description')).toBe(HIDDEN_IN_STATE_LABEL)

    fireEvent.click(row('Card'))
    expect(shellStore().getState().selectedNodeIds).toEqual(['n-card'])

    fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '관리자' }))
    await waitFor(() => expect(dimmed()).toEqual([]))
    expect(marks()).toBe(0)
  })

  /** 옛 판은 숨은 노드를 고른 채 상태를 바꾸면 선택에서 뺐다 — 지금은 숨은 노드도 고르고 고친다(노드는 하나다). */
  it('고른 노드가 상태를 바꿔 숨어도 고른 것은 그대로다 — 통지도 없다', async () => {
    await openPage({
      ...pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [{ id: 'n-btn', type: 'Button', visibility: { mode: 'except', states: ['s_admin'] } }],
      }),
      viewStates: [{ id: 's_admin', name: '관리자' }],
    })
    fireEvent.click(row('Button'))
    expect(shellStore().getState().selectedNodeIds).toEqual(['n-btn'])

    fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '관리자' }))
    await waitFor(() => expect(row('Button').classList.contains('wb-shell-structure-node-hidden')).toBe(true))

    expect(shellStore().getState().selectedNodeIds).toEqual(['n-btn'])
    expect(infoTexts()).toEqual([])
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

    expect(nodeRows().map((node) => structureRowType(node))).toEqual(['Page', 'Card', 'Text', 'Button'])
  })

  it('노드를 누르면 선택된다', async () => {
    await openPage(DOC)
    // 양성 대조: 열자마자 이미 `n-list`가 고른 것이면 아래가 무의미하다. **`null`이 아니라
    // 루트다** — 페이지를 열면 스토어가 루트를 고른 채로 시작한다(`store/editor-store.ts`의
    // `#selectionFor`).
    expect(shellStore().getState().selectedNodeId).toBe('n-root')

    fireEvent.click(row('List'))

    // **스토어를 직접 본다.** 표시만 보면 선택을 구조 트리의 로컬 state에 든 구현도
    // 통과하고, 그러면 캔버스·속성 패널과의 배선이 끊긴 채 지나간다.
    expect(shellStore().getState().selectedNodeId).toBe('n-list')
  })

  it('캔버스에서 선택하면 구조 트리에도 반영된다', async () => {
    await openPage(DOC)

    fireEvent.click(requireNode('n-search'))

    // 둘이 같은 스토어를 본다는 뜻이다. 각자 자기 상태를 들면 여기서 갈라진다.
    expect(currentRows().map((node) => structureRowType(node))).toEqual(['SearchForm'])
  })

  it('구조 트리에서 선택하면 캔버스에도 반영된다', async () => {
    await openPage(DOC)

    fireEvent.click(row('Field'))

    // 반대 방향도 이어져 있어야 한 곳에 모인 선택이라고 할 수 있다.
    expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-field')
  })

  it('선택된 노드만 구분 표시된다', async () => {
    await openPage(DOC)
    // 양성 대조: 고르기 전에는 **루트 한 줄에만** 표시가 있다(페이지를 열면 그것이 고른
    // 자리다). 이것이 없으면 모든 줄에 표시를 다는 구현도 "선택된 줄에 표시가 있다"를
    // 통과한다 — 세는 것이 0에서 1로 바뀌었을 뿐 가르는 힘은 그대로다.
    expect(currentRows().map((node) => structureRowType(node))).toEqual(['Page'])

    fireEvent.click(row('List'))

    expect(currentRows().map((node) => structureRowType(node))).toEqual(['List'])

    // 다른 줄을 고르면 표시가 옮겨 간다. 하나씩 늘어나는 구현을 가른다.
    fireEvent.click(row('Flex'))

    expect(currentRows().map((node) => structureRowType(node))).toEqual(['Flex'])
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
    expect(nodeRows().map((node) => structureRowType(node))).toEqual(['Page'])
  })

  it('type이 문자열이 아닌 노드가 있어도 셸은 살아 있다', async () => {
    // 렌더러가 폴백으로 흡수하는 값이다(`packages/renderer/src/render.tsx`의 `shapeError`).
    // 여기서 그대로 `{node.type}`을 그리면 React가 `Objects are not valid as a React child`로
    // 렌더 도중 던지는데, 이 패널은 캔버스와 달리 **오류 경계 밖**이라 그 예외는 캔버스만이
    // 아니라 셸 전체를 지운다. 편집의 낙관적 적용이 검증 전 문서를 스토어에 싣는 경로로 도달할 수 있다.
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [{ id: 'n-bad', type: { broken: true }, children: [] } as never],
      }),
    )

    // 셸이 남아 있다. 가드를 지우면 여기까지 오지 못하고 `.wb-shell`이 DOM에서 사라진다.
    screen.getByRole('heading', { name: PROJECT_NAME })
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()

    // 그 줄은 **대신 쓸 이름으로 남는다.** 줄째 지워 버리면 캔버스에는 폴백이 그려져 있는데
    // 트리에서만 사라져 무엇이 깨졌는지 더 알기 어렵다(id 없는 노드와 같은 판단이다).
    expect(nodeRows().map((node) => structureRowType(node))).toEqual(['Page', '(타입을 읽을 수 없는 노드)'])
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
