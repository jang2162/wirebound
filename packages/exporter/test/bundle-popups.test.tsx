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

const nav = (id: string, target: string): WbNode => ({
  id,
  type: 'Button',
  props: { label: id },
  interactions: [{ on: 'click', actions: [{ type: 'navigate', target }] }],
})

/**
 * 실린 팝업 문서 안의 요청 — 목록 → 팝업 «검색»(이동 · 화면 대상 열기 · 팝업 대상 열기 · 닫기) → 팝업 «고르기»(이동). 여는 페이지의 `hrefs` 가
 * 실린 문서들이 겨누는 대상까지 실어야 그 요청이 «이 번들에 없는 페이지» 로 안 끊긴다.
 */
function nestedPages(): BundlePage[] {
  return [
    { title: '목록', target: 'page:목록', document: screen('n_list', [opener('n_open', 'page:검색')]) },
    {
      title: '검색',
      target: 'page:검색',
      document: popup(
        'n_pop',
        '검색',
        [nav('n_go', 'page:상세'), opener('n_modal_screen', 'page:상세'), opener('n_pick', 'page:고르기')],
        [closer('n_close')],
      ),
    },
    { title: '고르기', target: 'page:고르기', document: popup('n_pick_pop', '고르기', [nav('n_go_end', 'page:끝')]) },
    { title: '상세', target: 'page:상세', document: screen('n_detail', []) },
    { title: '끝', target: 'page:끝', document: screen('n_end', []) },
  ]
}

function dataOf(list: BundlePage[], path: string): ExportPageData {
  const html = String(exportBundle({ pages: list, runtimeJs: '' }).files.find((file) => file.path === path)!.content)
  return JSON.parse(new DOMParser().parseFromString(html, 'text/html').getElementById(PAGE_DATA_ID)!.textContent!) as ExportPageData
}

describe('런타임 — 실린 팝업 문서 안의 요청', () => {
  const open = () => {
    const data = dataOf(nestedPages(), 'pages/목록.html')
    const mounted = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })
    click(byId(mounted.canvas, 'n_open'))
    expect(mounted.canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(1)
    return mounted
  }
  const inTop = (canvas: HTMLElement, id: string) =>
    byId(canvas.querySelector(`[data-wb-popup-level="${canvas.querySelectorAll('[data-wb-popup-level]').length}"]`)!, id)

  it('«이동» 은 그 페이지 파일로 옮긴다', () => {
    const { canvas, navigated, status } = open()
    click(inTop(canvas, 'n_go'))
    expect([navigated, lines(status)]).toEqual([[`${encodeURIComponent('상세')}.html`], []])
  })

  it('화면 페이지를 겨눈 «팝업 열기» 는 이동의 길이다', () => {
    const { canvas, navigated, status } = open()
    click(inTop(canvas, 'n_modal_screen'))
    expect([navigated, lines(status)]).toEqual([[`${encodeURIComponent('상세')}.html`], []])
  })

  it('팝업을 겨눈 «팝업 열기» 는 쌓고, 그 팝업 안의 «이동» 도 옮긴다(팝업이 연 팝업까지)', () => {
    const { canvas, navigated, status } = open()
    click(inTop(canvas, 'n_pick'))
    expect(canvas.querySelectorAll('[data-wb-popup-level]')).toHaveLength(2)
    click(inTop(canvas, 'n_go_end'))
    expect([navigated, lines(status)]).toEqual([[`${encodeURIComponent('끝')}.html`], []])
  })

  it('«팝업 닫기» 는 맨 위를 닫는다', () => {
    const { canvas, navigated, status } = open()
    click(inTop(canvas, 'n_close'))
    expect([canvas.querySelectorAll('[data-wb-popup-level]').length, navigated, lines(status)]).toEqual([0, [], []])
  })
})

describe('대상 글자의 풀이 — `matchPageTargets` 와 같다(공백 · 접두)', () => {
  const spaced = (): BundlePage[] => [
    {
      title: '목록',
      target: 'page:목록',
      document: screen('n_list', [opener('n_open_sp', 'page: 검색 '), nav('n_go_sp', ' 상세 '), opener('n_open_bare', '검색')]),
    },
    { title: '검색', target: 'page:검색', document: popup('n_pop', '검색') },
    { title: '상세', target: 'page:상세', document: screen('n_detail', []) },
  ]

  it('공백이 낀 «팝업 열기» 대상도 실린 팝업을 연다 · 접두 없는 글자도 같다', () => {
    const data = dataOf(spaced(), 'pages/목록.html')
    expect(Object.keys(data.popups ?? {}).sort()).toEqual(['page: 검색 ', '검색'])
    for (const id of ['n_open_sp', 'n_open_bare']) {
      const { canvas, status } = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })
      click(byId(canvas, id))
      expect([id, canvas.querySelectorAll('[data-wb-popup-level]').length, lines(status)]).toEqual([id, 1, []])
      act(() => mounted!.unmount())
      mounted = null
      document.body.innerHTML = ''
    }
  })

  it('공백이 낀 «이동» 대상도 그 페이지 파일로 옮긴다', () => {
    const data = dataOf(spaced(), 'pages/목록.html')
    const { canvas, navigated, status } = mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })
    click(byId(canvas, 'n_go_sp'))
    expect([navigated, lines(status)]).toEqual([[`${encodeURIComponent('상세')}.html`], []])
  })
})

/**
 * **파일첨부 · 반복 행 표 안 단추** — 파일첨부의 «단추» 구역 · 그리드의 머리 오른쪽 · 셀 틀(반복 행 표의 «삭제» — 둘째 줄부터는 사본 `data-wb-copy-of`)의
 * 단추도 몸통의 단추와 같은 표(`hrefs` · `popups`)로 풀린다. 대상 글자는 공백 · 접두를 섞었다(`pageTargetKey`).
 */
describe('대상 글자의 풀이 — 파일첨부 · 반복 행 표 안 단추', () => {
  const attach = (id: string, actions: WbNode[]): WbNode => ({
    id,
    type: 'FileAttach',
    props: { files: [{ name: '통장사본.pdf', size: '2.1 MB' }] },
    zones: { actions },
  })
  const listed = (): BundlePage[] => [
    {
      title: '목록',
      target: 'page:목록',
      document: screen('n_list', [
        attach('n_fa', [opener('n_fa_open', ' page: 첨부 ')]),
        {
          id: 'n_grid',
          type: 'DataGrid',
          children: [{ id: 'n_col', type: 'GridColumn', props: { label: '삭제' }, children: [opener('n_del', '첨부 ')] }],
          zones: { headEnd: [nav('n_add', ' 상세 ')], rows: [{ id: 'n_row', type: 'GridRow', props: { repeat: 2 } }] },
        },
      ]),
    },
    { title: '첨부', target: 'page:첨부', document: popup('n_pop', '첨부', [attach('n_fa_in', [nav('n_fa_go', 'page: 상세')])]) },
    { title: '상세', target: 'page:상세', document: screen('n_detail', []) },
  ]
  const fresh = () => {
    if (mounted !== null) act(() => mounted!.unmount())
    mounted = null
    document.body.innerHTML = ''
    const data = dataOf(listed(), 'pages/목록.html')
    return mount({ document: data.document, hrefs: data.hrefs, popups: data.popups! })
  }

  it('구역 · 셀 틀 · 사본 줄의 «팝업 열기» 는 실린 팝업을 연다 · «이동» 은 옮긴다 · 팝업 안 파일첨부 단추도 같다', () => {
    const data = dataOf(listed(), 'pages/목록.html')
    expect(Object.keys(data.popups ?? {}).sort()).toEqual([' page: 첨부 ', '첨부 '])
    const opened: [string, number, string[]][] = []
    for (const pick of ['n_fa_open', 'n_del', 'copy:n_del']) {
      const { canvas, status } = fresh()
      // 판 카나리아 — 반복 행의 둘째 줄이 사본으로 섰다.
      expect(canvas.querySelectorAll('[data-wb-copy-of="n_del"]')).toHaveLength(1)
      click(pick.startsWith('copy:') ? canvas.querySelector('[data-wb-copy-of="n_del"]') : byId(canvas, pick))
      opened.push([pick, canvas.querySelectorAll('[data-wb-popup-level]').length, lines(status)])
    }
    expect(opened).toEqual([
      ['n_fa_open', 1, []],
      ['n_del', 1, []],
      ['copy:n_del', 1, []],
    ])
    const head = fresh()
    click(byId(head.canvas, 'n_add'))
    const inside = fresh()
    click(byId(inside.canvas, 'n_fa_open'))
    click(byId(inside.canvas.querySelector('[data-wb-popup-level="1"]')!, 'n_fa_go'))
    expect([head.navigated, lines(head.status), inside.navigated, lines(inside.status)]).toEqual([
      [`${encodeURIComponent('상세')}.html`],
      [],
      [`${encodeURIComponent('상세')}.html`],
      [],
    ])
  })
})
