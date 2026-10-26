// @vitest-environment jsdom
/**
 * **번들의 팝업** — 페이지 데이터가 «팝업 열기» 로 닿는 팝업 문서를 싣고(팝업이 연 팝업까지 · 한 벌씩), 런타임이 그것을 덮개 위 상자로 쌓는다.
 * 실리지 않은 대상(화면 페이지)은 이동과 같은 길이다. 목차의 팝업 줄에는 표지가 선다. 좌표 · 덮개가 누름을 막는지 · 좁은 창은 실브라우저 판
 * (`apps/web/build-test/popup-layer.test.ts`)이 잰다.
 */
import { NO_THEME } from '@wirebound/renderer'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { exportBundle, type BundlePage } from '../src/bundle/index'
import { mountExportDocument, type ExportMount, type ExportMountInput } from '../src/browser/mount'
import { PAGE_DATA_ID, type ExportPageData } from '../src/page-data'

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
})

const opener = (id: string, target: string): WbNode => ({
  id,
  type: 'Button',
  props: { label: id },
  interactions: [{ on: 'click', actions: [{ type: 'openModal', target }] }],
})
const closer = (id: string): WbNode => ({
  id,
  type: 'Button',
  props: { label: '닫기' },
  interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }],
})
const popup = (id: string, title: string, children: WbNode[] = [], footer: WbNode[] = []): PageDocument => ({
  version: 5,
  root: { id, type: 'Popup', props: { title }, children, zones: { footer } },
})
const screen = (id: string, children: WbNode[]): PageDocument => ({ version: 5, root: { id, type: 'Page', children } })

/** 목록 → (팝업 A → 팝업 B), 화면 «상세», «이동» 으로만 가리키는 팝업 C. */
function pages(): BundlePage[] {
  return [
    {
      title: '목록',
      target: 'page:목록',
      document: screen('n_list', [
        opener('n_open_a', 'page:가'),
        opener('n_open_detail', 'page:상세'),
        {
          id: 'n_go_c',
          type: 'Button',
          props: { label: '다로' },
          interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:다' }] }],
        },
      ]),
    },
    { title: '가', target: 'page:가', document: popup('n_a', '가', [opener('n_open_b', 'page:나')], [closer('n_close_a')]) },
    { title: '나', target: 'page:나', document: popup('n_b', '나', [opener('n_open_a2', 'page:가')]) },
    { title: '상세', target: 'page:상세', document: screen('n_detail', []) },
    { title: '다', target: 'page:다', document: popup('n_c', '다') },
  ]
}

function pageData(path: string): ExportPageData {
  const bundle = exportBundle({ pages: pages(), runtimeJs: '' })
  const html = String(bundle.files.find((file) => file.path === path)!.content)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return JSON.parse(doc.getElementById(PAGE_DATA_ID)!.textContent!) as ExportPageData
}

describe('페이지 데이터의 팝업 문서', () => {
  it('«팝업 열기» 로 닿는 팝업만 — 팝업이 연 팝업까지 한 벌씩 · 화면 페이지 · «이동» 으로만 가리키는 팝업은 없다', () => {
    const data = pageData('pages/목록.html')
    expect(Object.keys(data.popups ?? {}).sort()).toEqual(['page:가', 'page:나'])
    expect(data.popups!['page:가']!.document.root.id).toBe('n_a')
    // 화면 페이지 대상은 이동의 길 그대로다.
    expect(data.hrefs['page:상세']).toBe(`${encodeURIComponent('상세')}.html`)
    // «이동» 으로 가리킨 팝업 페이지는 그 파일로 옮기는 길이다(lint `navigate-to-popup` 이 말한다).
    expect(data.hrefs['page:다']).toBe(`${encodeURIComponent('다')}.html`)
  })

  it('팝업이 없는 페이지는 키째 없다 — 그 번들의 바이트가 그대로다', () => {
    expect('popups' in pageData('pages/상세.html')).toBe(false)
  })

  it('목차의 팝업 줄은 표지와 « — 팝업» 이름을 단다 · 화면 줄은 그대로다', () => {
    const bundle = exportBundle({ pages: pages(), runtimeJs: '' })
    const doc = new DOMParser().parseFromString(String(bundle.files.find((file) => file.path === 'pages/목록.html')!.content), 'text/html')
    const links = [...doc.querySelectorAll('.wb-export-nav-link')]
    expect(links.map((link) => [link.textContent, link.querySelector('.wb-export-nav-kind') !== null])).toEqual([
      ['목록', false],
      ['팝업가 — 팝업', true],
      ['팝업나 — 팝업', true],
      ['상세', false],
      ['팝업다 — 팝업', true],
    ])
  })
})

function mount(input: Partial<ExportMountInput> & { document: PageDocument }): {
  canvas: HTMLElement
  status: HTMLElement
  navigated: string[]
} {
  const canvas = document.createElement('div')
  const status = document.createElement('div')
  document.body.append(canvas, status)
  const navigated: string[] = []
  act(() => {
    mounted = mountExportDocument(canvas, {
      theme: NO_THEME,
      tokens: {},
      window,
      hrefs: {},
      markers: [],
      status,
      navigate: (to) => navigated.push(to),
      ...input,
    })
  })
  return { canvas, status, navigated }
}

function click(element: Element | null): void {
  if (element === null) throw new Error('누를 것이 없다')
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

const byId = (root: ParentNode, id: string): Element | null => root.querySelector(`[data-wb-id="${id}"]`)
const lines = (status: HTMLElement): string[] =>
  [...status.querySelectorAll('.wb-export-status-line')].map((line) => line.textContent ?? '')

describe('런타임 — 덮개 위 팝업', () => {
  it('실린 팝업은 쌓고, 팝업 안 «팝업 닫기» · ✖ 가 맨 위를 닫는다 — 옮기지 않는다', () => {
    const data = pageData('pages/목록.html')
    const { canvas, navigated, status } = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })

    click(byId(canvas, 'n_open_a'))
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(1)
    click(byId(canvas, 'n_open_b'))
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(2)

    click(canvas.querySelector('[data-wb-popup-level="2"] [data-wb-part="close"]'))
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(1)
    click(byId(canvas.querySelector('[data-wb-popup-level="1"]')!, 'n_close_a'))
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(0)
    expect(navigated).toEqual([])
    expect(lines(status)).toEqual([])
  })

  it('실리지 않은 대상은 이동의 길이다 — 그 페이지 파일로 옮긴다', () => {
    const data = pageData('pages/목록.html')
    const { canvas, navigated } = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })
    click(byId(canvas, 'n_open_detail'))
    expect(navigated).toEqual([`${encodeURIComponent('상세')}.html`])
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(0)
  })

  it('팝업 페이지를 바로 연 판의 ✖ · «팝업 닫기» 는 그렇다고 말한다', () => {
    const data = pageData('pages/가.html')
    const { canvas, status } = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups ?? {} })
    // 알림은 «마지막 조작이 만든 것» 이다 — 누를 때마다 그 한 줄이다.
    click(byId(canvas, 'n_a')!.querySelector('[data-wb-part="close"]'))
    expect(lines(status)).toEqual(['열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다'])
    click(byId(canvas, 'n_close_a'))
    expect(lines(status)).toEqual(['열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다'])
  })

  it('서로를 여는 팝업은 다섯 겹에서 멈추고 그렇다고 말한다', () => {
    const data = pageData('pages/목록.html')
    const { canvas, status } = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })
    click(byId(canvas, 'n_open_a'))
    for (let i = 0; i < 5; i += 1) {
      const top = canvas.querySelector(`[data-wb-popup-level="${canvas.querySelectorAll('[data-wb-popup-level]').length}"]`)!
      click(byId(top, 'n_open_b') ?? byId(top, 'n_open_a2'))
    }
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(5)
    expect(lines(status)).toEqual(['팝업은 다섯 겹까지 엽니다'])
  })
})
