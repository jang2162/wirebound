/**
 * **뷰 모드에서 상호작용이 실제로 도는가** (설계서 「실행」).
 *
 * **여기가 진짜 DOM 이벤트를 재는 유일한 자리다.** 렌더러 쪽 케이스
 * (`packages/renderer/test/interaction-runtime.test.tsx`)는 `unit` 프로젝트라 DOM이 없어
 * 핸들러를 **직접 불러** 확인한다. 이 파일은 jsdom에서 **누른다** — 버블링·`submit`·
 * `change`가 실제로 어떻게 도는지는 그렇게만 알 수 있다.
 *
 * **실브라우저로는 재지 않는다.** jsdom의 클릭과 실브라우저의 클릭이 갈리는 자리는 이
 * 파일이 못 본다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../../src/store/editor-store'
import '../../src/catalog-setup'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  PAGE_ID,
  canvasDocument,
  canvasSurface,
  nodeElement,
  openPage,
  pageDetail,
  pageDoc,
  requireNode,
} from '../editor-harness'

/** 셸이 만든 스토어를 쥔다. 근거는 `canvas.test.tsx`의 같은 장치 주석. */
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

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 스토어를 만들지 않았습니다')
  return store as EditorStore
}

/** 설계서 「자동 문장화」의 예를 그대로 옮긴 문서. *"① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다"* */
const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-search',
      type: 'Button',
      props: { label: '검색' },
      marker: 1,
      interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
    },
    { id: 'n-list', type: 'DataGrid', props: {}, marker: 2 },
  ],
})

function toView(): void {
  fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
}

function toEdit(): void {
  fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
}

/** 캔버스 문서 안에서 고른 것 전부. */
function canvasQueryAll(selector: string): Element[] {
  return Array.from(canvasDocument().querySelectorAll(selector))
}

/** 캔버스가 낸 런타임 알림 줄들. 없으면 빈 배열이다. */
function notices(): string[] {
  return [...document.body.querySelectorAll('.wb-shell-canvas-runtime-item')].map((item) => item.textContent ?? '')
}

describe('설계서 「실행」 — 편집 모드에서는 동작하지 않는다', () => {
  it('편집 모드에서 버튼을 눌러도 아무 상태도 바뀌지 않는다', async () => {
    await openPage(DOC)

    fireEvent.click(requireNode('n-search'))

    // 양성 대조는 아래 뷰 모드 케이스다 — 같은 클릭이 거기서는 상태를 바꾼다.
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()
  })

  it('편집 모드에서는 노드 선택이 우선이다 — 클릭이 선택을 옮긴다', async () => {
    await openPage(DOC)

    fireEvent.click(requireNode('n-search'))

    expect(shellStore().getState().selectedNodeId).toBe('n-search')
  })
})

describe('설계서 「실행」 — 뷰 모드에서 실제로 동작한다', () => {
  it('버튼을 누르면 그리드가 로딩 상태가 된다', async () => {
    await openPage(DOC)
    toView()
    // 양성 대조: 누르기 전에는 그 상태가 없다.
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()

    fireEvent.click(requireNode('n-search'))

    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')
  })

  it('문서는 바뀌지 않는다 — 편집이 아니라 시연이다', async () => {
    await openPage(DOC)
    const before = JSON.stringify(shellStore().getState().document)
    toView()

    fireEvent.click(requireNode('n-search'))

    expect(JSON.stringify(shellStore().getState().document)).toBe(before)
    // 편집 큐도 undo 스택도 건드리지 않는다 — 서버로 나갈 것이 없다.
    expect(shellStore().getState().pending).toHaveLength(0)
    expect(shellStore().getState().undoStack).toHaveLength(0)
  })

  it('뷰 모드에서는 선택을 바꾸지 않는다', async () => {
    await openPage(DOC)
    fireEvent.click(requireNode('n-list'))
    expect(shellStore().getState().selectedNodeId).toBe('n-list')
    toView()

    fireEvent.click(requireNode('n-search'))

    // 상호작용은 돌았는데(위 케이스) 선택은 떠날 때 그대로다. 뷰 모드에서 선택은
    // 아무것도 그리지 않으므로 바뀌면 **조용히 바뀌는 화면 상태**가 된다.
    expect(shellStore().getState().selectedNodeId).toBe('n-list')
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')
  })

  it('자식 안쪽을 눌러도 규칙이 걸린 노드에서 돈다 — 버블링', async () => {
    await openPage(DOC)
    toView()

    // `Button`은 라벨을 조각(`<span data-wb-part="label">`)으로 그린다. 사용자가 실제로
    // 누르는 것은 그 글자다.
    const label = requireNode('n-search').querySelector('[data-wb-part="label"]')
    fireEvent.click(label as Element)

    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')
  })

  it('setVisible이 노드를 화면에서 없앤다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-toggle',
            type: 'Button',
            props: { label: '접기' },
            interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-card', value: false }] }],
          },
          {
            id: 'n-card',
            type: 'Card',
            props: { title: '기본정보' },
            children: [{ id: 'n-text', type: 'Text', props: { content: '안쪽' } }],
          },
        ],
      }),
    )
    toView()
    expect(nodeElement('n-card')).not.toBeNull()

    fireEvent.click(requireNode('n-toggle'))

    expect(nodeElement('n-card')).toBeNull()
    expect(nodeElement('n-text')).toBeNull()
  })

  it('switchTab이 활성 탭을 옮긴다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-go',
            type: 'Button',
            props: { label: '상세로' },
            interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: 'n-tab2' }] }],
          },
          {
            id: 'n-tabs',
            type: 'Tabs',
            props: { active: 0 },
            children: [
              { id: 'n-tab1', type: 'TabPanel', props: { label: '기본정보' } },
              { id: 'n-tab2', type: 'TabPanel', props: { label: '상세정보' } },
            ],
          },
        ],
      }),
    )
    toView()
    const selected = (): string | null => requireNode('n-tabs').querySelector('[aria-selected="true"]')?.textContent ?? null
    expect(selected()).toBe('기본정보')

    fireEvent.click(requireNode('n-go'))

    expect(selected()).toBe('상세정보')
  })
})

describe('트리거 4종이 실제로 닿는가 — 재서 적는다', () => {
  it('click과 select는 클릭으로 돈다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-tabs',
            type: 'Tabs',
            props: { active: 0 },
            children: [
              { id: 'n-tab1', type: 'TabPanel', props: { label: '기본정보' } },
              { id: 'n-tab2', type: 'TabPanel', props: { label: '상세정보' } },
            ],
            interactions: [{ on: 'select', actions: [{ type: 'setVisible', target: 'n-list', value: false }] }],
          },
          { id: 'n-list', type: 'DataGrid', props: {} },
        ],
      }),
    )
    toView()

    // 탭 하나를 누른다 — `Tabs`의 탭은 `<span>`이라 네이티브 select 이벤트가 없다.
    // 그 클릭이 노드 루트로 버블링해 `select` 규칙을 돌린다(렌더러의 판정).
    fireEvent.click(requireNode('n-tabs').querySelectorAll('[data-wb-part="tab"]')[1] as Element)

    expect(nodeElement('n-list')).toBeNull()
  })

  it('submit은 폼 제출로 돈다 — 다만 눌러서 제출할 버튼이 화면에 없다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-form',
            type: 'SearchForm',
            props: {},
            zones: { actions: [{ id: 'n-go', type: 'Button', props: { label: '검색' } }] },
            interactions: [{ on: 'submit', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
          },
          { id: 'n-list', type: 'DataGrid', props: {} },
        ],
      }),
    )
    toView()

    const form = requireNode('n-form')
    // **재서 적는 값**: 폼의 단추는 구역(`actions`) 안의 `Button` 노드이고 `<button type="submit">`이
    // 아니다(와이어프레임이므로). 즉 사용자 조작으로는 이 갈래에 닿을 수 없고, 프로그램적
    // 제출로만 돈다. 그 단추의 클릭이 제출이 **아니라는 것**을 음성 대조로 함께 잰다.
    expect(form.querySelectorAll('button[type="submit"]').length).toBe(0)
    fireEvent.click(requireNode('n-go'))
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()

    fireEvent.submit(form)

    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')
  })

  it('change는 닿지 않는다 — Field가 입력을 그리지 않는다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-field',
            type: 'Field',
            props: { label: '이름' },
            interactions: [{ on: 'change', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
          },
          { id: 'n-list', type: 'DataGrid', props: {} },
        ],
      }),
    )
    toView()

    const field = requireNode('n-field')
    // **재서 적는 값**: `Field`는 `<div data-wb-part="control">`에 placeholder 글자를 그린다.
    // `<input>`이 아니므로 React의 onChange 폴리필이 걸리지 않고, `fireEvent.change`도
    // 핸들러를 부르지 않는다. **트리거는 붙어 있는데 오늘 그것을 낼 수단이 화면에 없다.**
    expect(field.querySelectorAll('input, select, textarea').length).toBe(0)
    fireEvent.change(field)

    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()
  })
})

describe('깨진 규칙을 조용히 지나가지 않는다', () => {
  it('끊긴 타겟을 만나면 그렇다고 말한다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-btn',
            type: 'Button',
            props: { label: '검색' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-gone', prop: 'loading', value: true }] }],
          },
        ],
      }),
    )
    toView()
    expect(notices()).toEqual([])

    fireEvent.click(requireNode('n-btn'))

    expect(notices()).toEqual(['setProp의 타겟 노드가 문서에 없습니다: n-gone'])
    // **실패가 아니다** — 저장은 이미 통과한 문서다(severity가 `warning`이라 이 문서는
    // 서버를 지나 저장된다). `alert`이 아니라 `status`여야 한다.
    const box = document.body.querySelector('.wb-shell-canvas-runtime')
    expect(box?.getAttribute('role')).toBe('status')
  })

  it('없는 prop도 말한다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-btn',
            type: 'Button',
            props: { label: '검색' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-list', prop: '없는속성', value: 1 }] }],
          },
          { id: 'n-list', type: 'DataGrid', props: {} },
        ],
      }),
    )
    toView()

    fireEvent.click(requireNode('n-btn'))

    expect(notices()).toEqual(['DataGrid에 없는 prop입니다: 없는속성'])
  })

  it('탭 패널이 아닌 노드를 열라고 하면 말한다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-btn',
            type: 'Button',
            props: { label: '검색' },
            interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: 'n-list' }] }],
          },
          { id: 'n-list', type: 'DataGrid', props: {} },
        ],
      }),
    )
    toView()

    fireEvent.click(requireNode('n-btn'))

    expect(notices()).toEqual(['switchTab의 타겟은 TabPanel이어야 합니다 (현재: DataGrid)'])
  })

  it('알림은 쌓이지 않는다 — 다음 클릭이 덮는다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-bad',
            type: 'Button',
            props: { label: '깨진' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-gone', prop: 'loading', value: true }] }],
          },
          {
            id: 'n-ok',
            type: 'Button',
            props: { label: '멀쩡한' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
          },
          { id: 'n-list', type: 'DataGrid', props: {} },
        ],
      }),
    )
    toView()
    fireEvent.click(requireNode('n-bad'))
    expect(notices()).toHaveLength(1)

    fireEvent.click(requireNode('n-ok'))

    expect(notices()).toEqual([])
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')
  })
})

describe('navigate는 알리고 움직이지 않는다', () => {
  const DOC_NAV = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-link',
        type: 'Button',
        props: { label: '상세' },
        interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] }],
      },
    ],
  })

  it('페이지를 옮기지 않고 그렇다고 말한다', async () => {
    await openPage(DOC_NAV)
    toView()

    fireEvent.click(requireNode('n-link'))

    expect(notices()).toEqual(['관리자/회원/상세 페이지 이동 규칙입니다. 이 화면에서는 페이지를 옮기지 않습니다.'])
    // 주소가 그대로다 — 옮겼다면 캔버스의 문서가 갈렸을 것이다.
    expect(shellStore().getState().openPageId).toBe(PAGE_ID)
  })
})

/**
 * **«팝업 열기» 는 연 화면 위에 덮개 + 가운데 상자로 띄운다**(정본 「상호작용」 「실행」). 대상 글자를 트리로 풀어 그 페이지를 읽고, 팝업
 * 페이지면 렌더러의 덮개 층이 캔버스 문서 안에 쌓는다. 하네스의 트리는 `회원관리` 밑에 `회원 목록`(이 페이지) · `회원 상세`(`pg-2`)다.
 * 좌표 · 덮개가 누름을 막는지 · 포커스 차례는 실브라우저 판(`build-test/popup-view-mode.test.ts`)이 잰다.
 */
describe('뷰 모드의 «팝업 열기» · «팝업 닫기»', () => {
  const OPEN_DETAIL = {
    id: 'n-open',
    type: 'Button',
    props: { label: '상세 보기' },
    interactions: [{ on: 'click' as const, actions: [{ type: 'openModal' as const, target: 'page:회원관리/회원 상세' }] }],
  }
  const POPUP = pageDoc({
    id: 'n-pop',
    type: 'Popup',
    props: { title: '회원 상세' },
    children: [{ id: 'n-pop-text', type: 'Text', props: { content: '팝업 안' } }],
    zones: {
      footer: [
        {
          id: 'n-pop-cancel',
          type: 'Button',
          props: { label: '취소' },
          interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }],
        },
      ],
    },
  })
  const layerBoxes = (): Element[] => Array.from(canvasQueryAll('[data-wb-popup-frame] > [data-wb-component="Popup"]'))

  it('팝업 페이지면 덮개 위에 그 문서를 그린다 — 알림 없이', async () => {
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [OPEN_DETAIL] }), { docs: { [OTHER_PAGE_ID]: POPUP } })
    toView()

    fireEvent.click(requireNode('n-open'))

    await waitFor(() => expect(layerBoxes()).toHaveLength(1))
    expect(layerBoxes()[0]!.getAttribute('aria-modal')).toBe('true')
    expect(requireNode('n-pop-text').textContent).toBe('팝업 안')
    expect(notices()).toEqual([])
    // 시연이다 — 연 페이지 · 문서가 그대로다.
    expect(shellStore().getState().openPageId).toBe(PAGE_ID)
  })

  it('«팝업 닫기» 규칙 · ✖ · Escape 가 맨 위를 닫는다', async () => {
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [OPEN_DETAIL] }), { docs: { [OTHER_PAGE_ID]: POPUP } })
    toView()
    const open = async (): Promise<void> => {
      fireEvent.click(requireNode('n-open'))
      await waitFor(() => expect(layerBoxes()).toHaveLength(1))
    }

    await open()
    fireEvent.click(requireNode('n-pop-cancel'))
    expect(layerBoxes()).toHaveLength(0)

    await open()
    fireEvent.click(layerBoxes()[0]!.querySelector('[data-wb-part="close"]')!)
    expect(layerBoxes()).toHaveLength(0)

    await open()
    fireEvent.keyDown(requireNode('n-pop-cancel'), { key: 'Escape' })
    expect(layerBoxes()).toHaveLength(0)
    expect(notices()).toEqual([])
  })

  it('화면 페이지는 열지 않고 그렇다고 말한다', async () => {
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [OPEN_DETAIL] }), {
      docs: { [OTHER_PAGE_ID]: pageDoc({ id: 'n-other', type: 'Page', children: [] }) },
    })
    toView()

    fireEvent.click(requireNode('n-open'))

    await waitFor(() =>
      expect(notices()).toEqual(['회원관리/회원 상세 페이지 팝업 열기 규칙입니다. 팝업 페이지가 아니라 이 화면에서는 열지 않습니다.']),
    )
    expect(layerBoxes()).toHaveLength(0)
  })

  it('없는 대상 · 읽기 실패는 한 줄로 말한다', async () => {
    const missing = {
      ...OPEN_DETAIL,
      id: 'n-missing',
      interactions: [{ on: 'click' as const, actions: [{ type: 'openModal' as const, target: 'page:없는/곳' }] }],
    }
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [missing, OPEN_DETAIL] }), {
      apiOverrides: {
        getPage: async (_projectId, pageId) => {
          if (pageId === PAGE_ID) return pageDetail(PAGE_ID, pageDoc({ id: 'n-root', type: 'Page', children: [missing, OPEN_DETAIL] }))
          throw new Error('망이 끊겼다')
        },
      },
    })
    toView()

    fireEvent.click(requireNode('n-missing'))
    await waitFor(() => expect(notices()).toEqual(['이 프로젝트에 없는 페이지입니다: page:없는/곳']))

    fireEvent.click(requireNode('n-open'))
    await waitFor(() => expect(notices()).toEqual(['팝업을 불러오지 못했습니다']))
    expect(layerBoxes()).toHaveLength(0)
  })

  it('열린 팝업이 없는 «팝업 닫기» 는 그렇다고 말한다 — 팝업 페이지를 바로 연 판의 ✖ 도', async () => {
    const closer = {
      id: 'n-close',
      type: 'Button',
      props: { label: '닫기' },
      interactions: [{ on: 'click' as const, actions: [{ type: 'closeModal' as const }] }],
    }
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [closer] }))
    toView()
    fireEvent.click(requireNode('n-close'))
    expect(notices()).toEqual(['열린 팝업이 없습니다'])
  })

  it('팝업 페이지를 바로 열면 상자만 그리고 ✖ · «팝업 닫기» 는 바로 연 판이라고 말한다', async () => {
    await openPage(POPUP)
    toView()
    fireEvent.click(requireNode('n-pop').querySelector('[data-wb-part="close"]')!)
    expect(notices()).toEqual(['열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다'])
    fireEvent.click(requireNode('n-pop-cancel'))
    expect(notices()).toEqual(['열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다'])
    // 바로 연 판은 모달이 아니다.
    expect(requireNode('n-pop').hasAttribute('aria-modal')).toBe(false)
  })

  it('편집 모드로 나가면 열린 팝업이 닫힌다', async () => {
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [OPEN_DETAIL] }), { docs: { [OTHER_PAGE_ID]: POPUP } })
    toView()
    fireEvent.click(requireNode('n-open'))
    await waitFor(() => expect(layerBoxes()).toHaveLength(1))

    toEdit()
    // 수로 견준다 — iframe 문서의 요소 목록을 그대로 견주면 실패 때 chai 가 다른 realm 의 요소를 찍다 던져 실패 값이 사라진다.
    expect(canvasQueryAll('[data-wb-popup-layer]').length).toBe(0)
    toView()
    expect(layerBoxes().length).toBe(0)
  })
})

describe('알림은 "마지막 조작이 만든 것"이다', () => {
  /** 깨진 규칙 하나와 멀쩡한 규칙 하나, 그리고 **규칙이 없는 노드** 하나. */
  const DOC_MIX = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-bad',
        type: 'Button',
        props: { label: '깨진' },
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-gone', prop: 'x', value: 1 }] }],
      },
      { id: 'n-plain', type: 'Text', props: { content: '규칙 없는 글' } },
      { id: 'n-list', type: 'DataGrid', props: {} },
    ],
  })

  it('규칙이 없는 노드를 누르면 앞 알림이 사라진다', async () => {
    // **알림을 `onEvent`에서만 비우면 여기서 알림이 남는다**(`matched === 0`이라 `onEvent`가 안 불린다) —
    // 사용자는 방금 누른 것과 아무 상관 없는 말을 계속 본다.
    await openPage(DOC_MIX)
    toView()
    fireEvent.click(requireNode('n-bad'))
    expect(notices()).toHaveLength(1)

    fireEvent.click(requireNode('n-plain'))

    expect(notices()).toEqual([])
  })

  it('빈 자리를 눌러도 사라진다', async () => {
    await openPage(DOC_MIX)
    toView()
    fireEvent.click(requireNode('n-bad'))
    expect(notices()).toHaveLength(1)

    // 문서 밖(표면)을 누른다 — 노드 위가 아니다.
    fireEvent.click(canvasSurface())

    expect(notices()).toEqual([])
  })

  it('한 클릭에 트리거 둘이 걸리면 둘의 말이 다 남는다', async () => {
    // **트리거마다 알림을 새로 쓰면 뒤 트리거가 앞 것을 덮어** `click`의 이슈 문장이 사라진다.
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-both',
            type: 'Button',
            props: { label: '둘' },
            interactions: [
              { on: 'click', actions: [{ type: 'setProp', target: 'n-gone', prop: 'x', value: 1 }] },
              { on: 'select', actions: [{ type: 'switchTab', target: 'n-gone2' }] },
            ],
          },
        ],
      }),
    )
    toView()

    fireEvent.click(requireNode('n-both'))

    expect(notices()).toEqual(['setProp의 타겟 노드가 문서에 없습니다: n-gone', 'switchTab의 타겟 노드가 문서에 없습니다: n-gone2'])
  })

  it('두 번 누르면 쌓이지 않는다 — 조작마다 새로 시작한다', async () => {
    await openPage(DOC_MIX)
    toView()

    fireEvent.click(requireNode('n-bad'))
    fireEvent.click(requireNode('n-bad'))

    expect(notices()).toHaveLength(1)
  })
})

describe('겹layer가 안 바뀐 조작도 자리를 다시 잰다', () => {
  it('알림 줄이 뜨면 마커를 다시 잰다', async () => {
    // **알림 줄은 문서 위에 그려져 문서를 아래로 민다.** 겹layer가 안 바뀐 조작
    // (`applied === 0`)에서는 참조가 그대로라, 의존성에 `notices`가 없으면 이 이펙트가
    // 안 돌고 **마커가 옛 자리에 남는다.**
    //
    // jsdom의 `getBoundingClientRect`는 전부 0이라 자리를 그대로는 잴 수 없다 —
    // **알림 줄이 있는지에 따라 다른 값을 내는 가짜 상자**를 심어 잰다.
    const rect = (top: number): DOMRect =>
      ({ top, left: 0, width: 10, height: 10, right: 10, bottom: top + 10, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this.classList.contains('wb-shell-canvas-surface')) return rect(0)
      // 알림 줄이 떠 있으면 문서가 밀려 내려간다.
      const pushed = document.body.querySelector('.wb-shell-canvas-runtime') !== null
      return rect(pushed ? 40 : 0)
    }

    try {
      await openPage(
        pageDoc({
          id: 'n-root',
          type: 'Page',
          children: [
            {
              id: 'n-bad',
              type: 'Button',
              props: { label: '깨진' },
              marker: 1,
              interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-gone', prop: 'x', value: 1 }] }],
            },
          ],
        }),
      )
      toView()
      const marker = (): string | undefined => document.body.querySelector<HTMLElement>('[data-wb-marker-for="n-bad"]')?.style.top
      expect(marker()).toBe('0px')

      fireEvent.click(requireNode('n-bad'))

      expect(notices()).toHaveLength(1)
      expect(marker()).toBe('40px')
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })
})

describe('런타임 상태는 언제 사라지는가', () => {
  it('모드를 나가면 사라진다', async () => {
    await openPage(DOC)
    toView()
    fireEvent.click(requireNode('n-search'))
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')

    toEdit()

    // 편집 모드에서는 그 상태가 없다(문서에 없으므로).
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()

    // **돌아와도 되살아나지 않는다.** 한 방향만 보면 "편집 모드에서만 감춘다"는 구현도
    // 위 단언을 통과한다 — 겹layer가 남아 있으면 여기서 다시 `loading`이 뜬다.
    toView()

    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()
  })

  it('알림도 함께 사라진다', async () => {
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-btn',
            type: 'Button',
            props: { label: '검색' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-gone', prop: 'x', value: 1 }] }],
          },
        ],
      }),
    )
    toView()
    fireEvent.click(requireNode('n-btn'))
    expect(notices()).toHaveLength(1)

    toEdit()
    toView()

    expect(notices()).toEqual([])
  })

  /**
   * **문서를 통째로 실으면 사라진다**(`canvas.tsx`의 `runtimeKey` — 스토어의 `documentLoads`). 복원은 같은 id 의 노드를
   * 되살리므로 페이지 축만으로는 옛 시연이 새 문서에 얹힌다(Chrome: 뷰 모드에서 글을 숨긴 뒤 복원하면 되살아난 글이 숨은
   * 채였다). 여기서는 복원 · 재연결 재조회가 부르는 `loadPage`를 곧바로 부른다.
   */
  it('같은 페이지의 문서를 통째로 다시 실으면 사라진다 — 복원이 같은 id 를 되살려도', async () => {
    await openPage(DOC)
    toView()
    fireEvent.click(requireNode('n-search'))
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')

    act(() => {
      shellStore().loadPage(PAGE_ID, DOC, HEAD_SEQ + 1)
    })

    expect(requireNode('n-list').getAttribute('data-wb-state')).toBeNull()
  })

  /**
   * **남의 편집은 시연을 버리지 않는다** — 문서를 고쳐 갈 뿐 판을 갈아 끼우지 않는다. 편집 하나로 버리면 남이 글자
   * 하나 고칠 때마다 보던 시연이 사라진다(위 케이스의 음성 대조 — 축이 «문서가 바뀌었다»가 아니라 «통째로 실었다»다).
   */
  it('남의 편집이 문서를 고쳐도 남는다', async () => {
    await openPage(DOC)
    toView()
    fireEvent.click(requireNode('n-search'))

    act(() => {
      shellStore().applyRemoteChange(PAGE_ID, {
        seq: HEAD_SEQ + 1,
        ops: [{ op: 'replace', path: '/root/children/0/props/label', value: '찾기' }],
        warnings: [],
      })
    })

    expect(requireNode('n-search').textContent).toContain('찾기')
    expect(requireNode('n-list').getAttribute('data-wb-state')).toBe('loading')
  })
})

describe('화면 상태를 바꿔도 시연은 남는다 — 번들과 같은 계약(L-121)', () => {
  /**
   * 리셋 축은 모드 · 페이지 · 문서를 실은 횟수뿐이다(`runtimeKey`) — **화면 상태는 축이 아니다.** 내보낸 번들도 같다(`packages/exporter/test/
   * browser-mount.test.tsx` 의 «상태를 바꿔도 상호작용 겹은 남는다» — 결과가 어긋날 수 없다). «기본» 가지의 버튼이 영역 밖 제목을 숨기면 «관리자» 로
   * 바꿔도 · 기본으로 돌아와도 제목은 숨은 채다. **jsdom 값이다**(머리 전환기 메뉴를 눌러 상태를 고른다). 바꾸려면 두 곳을 함께 바꾼다.
   */
  it('기본에서 숨긴 제목은 다른 상태에서도, 기본으로 돌아와도 숨은 채다', async () => {
    const doc = {
      ...pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          { id: 'n-title', type: 'Text', props: { content: '제목' } },
          {
            id: 'n-hide',
            type: 'Button',
            props: { label: '숨김' },
            visibility: { mode: 'except', states: ['s_admin'] },
            interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-title', value: false }] }],
          },
          { id: 'n-adm', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } },
        ],
      }),
      viewStates: [{ id: 's_admin', name: '관리자' }],
    }
    await openPage(doc)
    toView()
    const pick = async (name: string): Promise<void> => {
      fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
      fireEvent.click(await screen.findByRole('menuitemradio', { name }))
    }
    expect(nodeElement('n-title')).not.toBeNull()
    fireEvent.click(requireNode('n-hide'))
    expect(nodeElement('n-title')).toBeNull()

    await pick('관리자')
    // 판 카나리아 — 상태가 실제로 바뀌었다.
    await waitFor(() => expect(nodeElement('n-adm')).not.toBeNull())
    expect(nodeElement('n-hide')).toBeNull()
    expect(nodeElement('n-title')).toBeNull()

    await pick('기본')
    await waitFor(() => expect(nodeElement('n-hide')).not.toBeNull())
    expect(nodeElement('n-title')).toBeNull()
  })
})
