// @vitest-environment jsdom
/**
 * **`mountExportDocument` — 번들 페이지의 목업을 그리는 진입**(`src/browser/mount.tsx`).
 *
 * 셸 없이 진입만 재는 자리다 — 셸과 함께 누르는 판은 `runtime-bundle.test.ts`. 여기서 재는 것:
 * 테마 뷰가 누른 뒤에도 서는가 · 마커 자리를 렌더러의 `markerPoint` 로 잡는가 · 뷰가 던진 노드를 가르는가 · 상태가 많아도 폭주하지
 * 않는가(옛 번들은 상태를 미리 그려 한도 512 를 넘으면 상호작용을 통째로 껐다).
 *
 * **jsdom 값이다** — 좌표는 전부 0 이라 마커는 `markerPoint` 를 부른 수와 인자로 잰다. 좌표 값은 실브라우저 판이 잰다
 * (`apps/web/build-test/export-bundle.test.ts`).
 */
import { markerPoint, NO_THEME } from '@wirebound/renderer'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { defineTheme, Root, view } from '@wirebound/theme-sdk'
import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mountExportDocument, type ExportMount, type ExportMountInput } from '../src/browser/mount'
import { EMPTY_MANIFEST, markedTheme } from '../test-support/fixtures'

vi.mock('@wirebound/renderer', async (original) => {
  const actual = await original<typeof import('@wirebound/renderer')>()
  return { ...actual, markerPoint: vi.fn((element: Element) => actual.markerPoint(element)) }
})

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let mounted: ExportMount | null = null
afterEach(() => {
  const mount = mounted
  mounted = null
  if (mount !== null) act(() => mount.unmount())
  document.body.innerHTML = ''
  vi.mocked(markerPoint).mockClear()
})

function mount(document_: PageDocument, overrides: Partial<ExportMountInput> = {}): { canvas: HTMLElement; status: HTMLElement } {
  const canvas = document.createElement('div')
  canvas.className = 'wb-export-canvas'
  const status = document.createElement('div')
  status.setAttribute('hidden', '')
  document.body.append(canvas, status)
  act(() => {
    mounted = mountExportDocument(canvas, {
      document: document_,
      theme: NO_THEME,
      tokens: {},
      window,
      hrefs: {},
      markers: [],
      status,
      ...overrides,
    })
  })
  return { canvas, status }
}

function press(canvas: Element, nodeId: string): void {
  act(() => {
    canvas.querySelector(`[data-wb-id="${nodeId}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

const RETITLE: PageDocument = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '바꿈' },
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_card', prop: 'title', value: '바뀜' }] }],
      },
      { id: 'n_card', type: 'Card', props: { title: '처음' }, marker: 1 },
    ],
  } as WbNode,
}

describe('테마로 그린다', () => {
  /** 누른 뒤 다시 그릴 때도 받은 정의로 그린다 — 옛 번들의 «미리 그린 판도 넘긴 테마로» 의 자리. `markedTheme` 의 Card 는 `section.marked`. */
  it('누르기 전과 뒤가 모두 테마 뷰다', () => {
    const { canvas } = mount(RETITLE, { theme: markedTheme() })
    const card = (): Element | null => canvas.querySelector('[data-wb-id="n_card"]')
    expect([card()?.tagName, card()?.className, card()?.textContent]).toEqual(['SECTION', 'marked', '처음'])
    press(canvas, 'n_btn')
    expect([card()?.tagName, card()?.className, card()?.textContent]).toEqual(['SECTION', 'marked', '바뀜'])
  })
})

describe('마커', () => {
  /**
   * **자리는 렌더러의 `markerPoint(노드)` 다** — 에디터 캔버스 · PPTX 와 같은 함수. 배지는 그 점에서 캔버스의 안쪽 상자 기준으로
   * 선다(jsdom 은 상자가 전부 0 이라 배지 자리 = 돌려준 점).
   */
  it('마커마다 그 노드 요소로 markerPoint 를 부르고 그 점에 배지를 세운다', () => {
    vi.mocked(markerPoint).mockImplementation((element: Element) =>
      element.getAttribute('data-wb-id') === 'n_card' ? { x: 31, y: 7 } : { x: -1, y: -1 },
    )
    const { canvas } = mount(RETITLE, { markers: [{ nodeId: 'n_card', marker: '1' }] })
    const calls = vi.mocked(markerPoint).mock.calls.map(([element]) => element.getAttribute('data-wb-id'))
    // 카나리아 — 한 번이라도 불렸다. 그린 뒤 다시 잴 때마다 다시 부르므로 수는 1 이상이다.
    expect(calls.length).toBeGreaterThan(0)
    expect(new Set(calls)).toEqual(new Set(['n_card']))
    const badge = canvas.querySelector<HTMLElement>('.wb-export-marker')!
    expect([badge.getAttribute('data-wb-marker-for'), badge.textContent, badge.style.left, badge.style.top]).toEqual([
      'n_card',
      '1',
      '31px',
      '7px',
    ])
  })

  it('다시 재라면(remeasure) 다시 부른다', () => {
    const { canvas } = mount(RETITLE, { markers: [{ nodeId: 'n_card', marker: '1' }] })
    expect(canvas.querySelectorAll('.wb-export-marker')).toHaveLength(1)
    const before = vi.mocked(markerPoint).mock.calls.length
    act(() => mounted!.remeasure())
    expect(vi.mocked(markerPoint).mock.calls.length).toBeGreaterThan(before)
  })

  it('숨겨진 노드에는 markerPoint 를 부르지 않고 배지도 없다', () => {
    const hide: PageDocument = {
      version: 1,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          {
            id: 'n_btn',
            type: 'Button',
            props: { label: '숨김' },
            interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_card', value: false }] }],
          },
          { id: 'n_card', type: 'Card', props: { title: '회원' } },
        ],
      } as WbNode,
    }
    const { canvas } = mount(hide, { markers: [{ nodeId: 'n_card', marker: '1' }] })
    press(canvas, 'n_btn')
    vi.mocked(markerPoint).mockClear()
    act(() => mounted!.remeasure())
    expect(vi.mocked(markerPoint).mock.calls).toEqual([])
    expect(canvas.querySelectorAll('.wb-export-marker')).toHaveLength(0)
  })
})

describe('뷰가 던진 노드', () => {
  /** 뷰가 던진 노드는 렌더러가 폴백으로 가둔다(노드마다 경계) — 첫 커밋 뒤 그 노드를 `thrown` 으로 낸다. 구조 오류는 따로 센다. */
  it('테마 뷰가 던진 노드만 thrown 이고 구조 오류는 errors 다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing = defineTheme({
      manifest: { ...EMPTY_MANIFEST, id: 'throws' },
      views: {
        Card: view(() => {
          throw new Error('카드가 던짐')
        }),
        Button: view(({ props }) => createElement(Root, { as: 'button' }, String(props.label ?? ''))),
      },
    })
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          { id: 'n_card', type: 'Card', props: { title: '회원' } },
          { id: 'n_bad', type: '없는타입' },
          { id: 'n_btn', type: 'Button', props: { label: '멀쩡' } },
        ],
      } as WbNode,
    }
    mount(doc, { theme: throwing })
    expect(mounted!.thrown).toEqual(['n_card'])
    expect(mounted!.errors.map((error) => error.nodeId)).toEqual(['n_bad'])
    vi.restoreAllMocks()
  })
})

describe('상태가 많아도 폭주하지 않는다', () => {
  /**
   * 한 노드를 규칙 열둘이 서로 다른 prop 으로 겨눈다 — 옛 번들은 닿을 수 있는 상태(2^12)를 미리 그리다 한도 512 를 넘어 상호작용을
   * 통째로 껐다. 이제 겹layer를 상태로 두고 다시 그리므로 누를 때마다 한 번 그린다 — 열둘을 다 눌러도 열두 prop 이 다 남는다.
   */
  it('열두 규칙을 다 누르면 열두 쓰기가 다 남는다', () => {
    const props = ['title', 'subtitle']
    const buttons: WbNode[] = Array.from({ length: 12 }, (_, index) => ({
      id: `n_b${index}`,
      type: 'Button',
      props: { label: `b${index}` },
      // 앞 여섯은 카드마다 제목을, 뒤 여섯은 부제를 쓴다.
      interactions: [
        { on: 'click', actions: [{ type: 'setProp', target: `n_c${index % 6}`, prop: props[Math.floor(index / 6)]!, value: `v${index}` }] },
      ],
    }))
    const cards: WbNode[] = Array.from({ length: 6 }, (_, index) => ({ id: `n_c${index}`, type: 'Card', props: { title: `c${index}` } }))
    const doc: PageDocument = { version: 1, root: { id: 'n_root', type: 'Page', children: [...buttons, ...cards] } as WbNode }
    const { canvas, status } = mount(doc)
    for (let index = 0; index < 12; index += 1) press(canvas, `n_b${index}`)
    expect(cards.map((card) => canvas.querySelector(`[data-wb-id="${card.id}"]`)?.textContent)).toEqual(
      cards.map((_card, index) => `v${index}v${index + 6}`),
    )
    expect(status.hasAttribute('hidden')).toBe(true)
  })
})

describe('상태를 바꿔도 상호작용 겹은 남는다 — 에디터 캔버스와 같은 계약(L-121)', () => {
  /**
   * 겹layer(숨긴 노드 · 바꾼 prop)의 리셋 축은 모드 · 페이지 · 문서를 실은 횟수뿐이다(`apps/web/src/canvas/canvas.tsx` 의 `runtimeKey` — 화면 상태는 축이
   * 아니다). 번들이 같은 값을 지키는지 잰다 — **jsdom 값**이다(렌더러의 겹 처리이고 좌표 · 포커스가 없다). 기본에서만 보이는 버튼이 늘 보이는 제목을 숨기면
   * 다른 상태로 바꿔도 제목은 숨은 채고, 기본으로 돌아와도 그렇다. 상태 전환기가 그 겹을 지우게 바꾸면 에디터 캔버스도 함께 바꿔야 한다(결과가 어긋날
   * 수 없다 — 설계서 «내보내기»).
   */
  const STATED: PageDocument = {
    version: 2,
    viewStates: [{ id: 's_admin', name: '관리자' }],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_title', type: 'Text', props: { content: '제목' } },
        {
          id: 'n_hide',
          type: 'Button',
          props: { label: '숨김' },
          visibility: { mode: 'except', states: ['s_admin'] },
          interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_title', value: false }] }],
        },
        { id: 'n_adm', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } },
      ],
    } as WbNode,
  }

  it('기본에서 숨긴 제목은 다른 상태에서도 기본으로 돌아와도 숨은 채다', () => {
    const { canvas } = mount(STATED)
    const title = (): boolean => canvas.querySelector('[data-wb-id="n_title"]') !== null
    expect(title()).toBe(true)
    press(canvas, 'n_hide')
    expect(title()).toBe(false)
    act(() => mounted!.setViewState('s_admin'))
    // 판 카나리아 — 상태가 실제로 바뀌었다(관리자의 버튼이 서고 기본의 버튼은 없다).
    expect([canvas.querySelector('[data-wb-id="n_adm"]') !== null, canvas.querySelector('[data-wb-id="n_hide"]') !== null]).toEqual([
      true,
      false,
    ])
    expect(title()).toBe(false)
    act(() => mounted!.setViewState(null))
    expect(title()).toBe(false)
  })
})
