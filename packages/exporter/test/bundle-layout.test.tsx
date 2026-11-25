// @vitest-environment jsdom
/**
 * **번들의 레이아웃 틀** — 장마다 문서를 `LayoutFrame` 으로 감싸 그리고(영역은 늘 다 켬), 서브페이지 틀의 내비(GNB · LNB · 브레드크럼브)는 번들에 한 벌
 * 실린 메뉴 트리(`assets/nav.js`)에서 짓는다(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「HTML 번들」). 틀 링크는 그 장 파일의
 * 상대 경로다. 실브라우저에서 링크를 눌러 장이 열리는지 · 사람의 표시 옵션이 안 닿는지는 `apps/web/build-test/bundle-layout.test.ts` 가 잰다.
 */
import { NO_THEME } from '@wirebound/renderer'
import { installCatalog, isolateBidi, type LayoutNavMenu, type PageDocument } from '@wirebound/schema'
import { defineTheme, LayoutLink, LayoutRegion, type LayoutView, type ThemeDefinition, type ThemeManifest } from '@wirebound/theme-sdk'
import { installRuntime, WB_RUNTIME_GLOBAL, type RuntimeHandle, type WbRuntime } from '@wirebound/theme-sdk/runtime'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { boot, type BootResult } from '../src/browser/boot'
import { mountExportDocument, type ExportMount } from '../src/browser/mount'
import { exportBundle, type BundlePage, type ExportBundleOptions } from '../src/bundle/index'
import { EXPORT_NAV_GLOBAL, NAV_JS_PATH, PAGE_DATA_ID, type ExportPageData } from '../src/page-data'
import { EMPTY_MANIFEST, popupFixture, subpageFixture } from '../test-support/fixtures'

let runtime: RuntimeHandle
beforeAll(() => {
  installCatalog()
  runtime = installRuntime(window as unknown as typeof globalThis)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let mounted: ExportMount | null = null
let booted: BootResult | null = null
afterEach(() => {
  const mount = mounted ?? booted?.mount ?? null
  mounted = null
  booted = null
  if (mount !== null) act(() => mount.unmount())
  runtime.take()
  delete (window as unknown as Record<string, unknown>)[EXPORT_NAV_GLOBAL]
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

/** 방향 제어 글자를 든 메뉴 이름 — 틀이 이름을 다음 항목과 이어 그려도 이름 밖을 안 뒤집어야 한다(`isolateBidi`). */
const BIDI_MENU = '회원\u202E관리'

/**
 * 메뉴 트리 — 뿌리 메뉴 «회원관리»(팝업 하나 · 화면 «회원 목록» · 하위 메뉴 «하위»(화면 «회원 상세»)) · 빈 뿌리 메뉴. 팝업은 내비에 안 서고, 메뉴의
 * 링크는 그 아래 첫 화면 페이지다.
 */
const MENU: LayoutNavMenu[] = [
  {
    id: 'm_member',
    title: BIDI_MENU,
    pages: [
      { id: 'p_popup', title: '회원 검색', layout: 'popup' },
      { id: 'p_list', title: '회원 목록', layout: 'subpage' },
    ],
    children: [{ id: 'm_sub', title: '하위', pages: [{ id: 'p_detail', title: '회원 상세', layout: 'subpage' }], children: [] }],
  },
  { id: 'm_empty', title: '빈 메뉴', pages: [], children: [] },
]

function pages(): BundlePage[] {
  return [
    { id: 'p_list', title: '회원관리 회원 목록', pageTitle: '회원 목록', document: subpageFixture() },
    { id: 'p_detail', title: '회원관리 하위 회원 상세', pageTitle: '회원 상세', document: subpageFixture() },
    { id: 'p_popup', title: '회원관리 회원 검색', pageTitle: '회원 검색', document: popupFixture() },
  ]
}

const LIST_PATH = 'pages/회원관리-회원-목록.html'
const DETAIL_PATH = 'pages/회원관리-하위-회원-상세.html'
const POPUP_PATH = 'pages/회원관리-회원-검색.html'

function bundle(options: Partial<ExportBundleOptions> = {}) {
  return exportBundle({ pages: pages(), runtimeJs: '/* runtime */', menu: MENU, ...options })
}

function fileAt(from: ReturnType<typeof exportBundle>, path: string): string {
  const found = from.files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  return found.content as string
}

function pageData(html: string): ExportPageData {
  const node = new DOMParser().parseFromString(html, 'text/html').getElementById(PAGE_DATA_ID)
  return JSON.parse(node?.textContent ?? '') as ExportPageData
}

/** 서브페이지 틀을 그리는 테마 — 영역 셋(GNB · LNB · 브레드크럼브)을 `LayoutRegion` 으로, 항목을 `LayoutLink` 로. */
const SubpageView: LayoutView = (props) => (
  <div data-probe="frame">
    <LayoutRegion id="gnb" as="nav">
      {props.gnb.map((item) => (
        <LayoutLink key={item.id} item={item} data-probe="gnb" />
      ))}
    </LayoutRegion>
    <LayoutRegion id="lnb" as="aside">
      {(props.lnb?.children ?? []).map((item) => (
        <LayoutLink key={item.id} item={item} data-probe="lnb" />
      ))}
    </LayoutRegion>
    <LayoutRegion id="breadcrumb" as="ol">
      {props.trail.map((item) => (
        <li key={item.id} data-probe="trail">
          {item.title}
        </li>
      ))}
    </LayoutRegion>
    <h1 data-probe="title">{props.title}</h1>
    {props.children}
  </div>
)

const LAYOUT_MANIFEST = {
  ...EMPTY_MANIFEST,
  layouts: {
    subpage: {
      regions: [
        { id: 'gnb', label: 'GNB' },
        { id: 'lnb', label: 'LNB' },
        { id: 'breadcrumb', label: '브레드크럼브' },
      ],
    },
  },
} as ThemeManifest

const LAYOUT_THEME: ThemeDefinition = defineTheme({ manifest: LAYOUT_MANIFEST, views: {}, layouts: { subpage: SubpageView } })

/** 번들의 한 장을 그 장의 데이터 그대로(내비 · 페이지 id · 제 자리) 목업 자리에 그린다 — 런타임이 `boot` 에서 넘기는 것과 같다. */
function mountPage(path: string, theme: ThemeDefinition = LAYOUT_THEME, from = bundle()): Element {
  const data = pageData(fileAt(from, path))
  const nav = navOf(from)
  const canvas = document.createElement('div')
  canvas.className = 'wb-export-canvas'
  document.body.appendChild(canvas)
  act(() => {
    mounted = mountExportDocument(canvas, {
      document: data.document,
      theme,
      tokens: {},
      window,
      nav,
      pageId: data.pageId,
      pageTitle: data.pageTitle,
      path: data.path,
      hrefs: data.hrefs,
      markers: [],
      status: null,
    })
  })
  return canvas
}

/** `assets/nav.js` 를 돌려 세운 전역 — 런타임이 읽는 그 값. */
function navOf(from: ReturnType<typeof exportBundle>) {
  const scope: Record<string, unknown> = {}
  new Function('globalThis', fileAt(from, NAV_JS_PATH))(scope)
  return scope[EXPORT_NAV_GLOBAL] as { menu: LayoutNavMenu[]; paths: Record<string, string> }
}

function links(canvas: Element, probe: string): [text: string, href: string | null, current: string | null][] {
  return [...canvas.querySelectorAll(`[data-probe="${probe}"]`)].map((element) => [
    element.textContent ?? '',
    element.getAttribute('href'),
    element.getAttribute('aria-current'),
  ])
}

describe('번들의 내비는 한 벌이다', () => {
  it('assets/nav.js 하나가 메뉴 트리와 페이지 경로(번들 안 경로)를 든다', () => {
    const from = bundle()
    expect(from.files.filter((file) => file.path === NAV_JS_PATH)).toHaveLength(1)
    const nav = navOf(from)
    expect(nav.menu).toEqual(MENU)
    expect(nav.paths).toEqual({
      p_list: LIST_PATH,
      p_detail: DETAIL_PATH,
      p_popup: POPUP_PATH,
    })
  })

  /** 장마다 트리를 실으면 장 수 × 트리 크기로 자란다 — 트리를 키워도 장 HTML 은 바이트째 그대로이고 `nav.js` 만 는다. */
  it('메뉴 트리를 키워도 장 HTML 은 그대로다', () => {
    const big: LayoutNavMenu[] = [
      ...MENU,
      ...Array.from({ length: 50 }, (_unused, index) => ({
        id: `m_more_${index}`,
        title: `더 많은 메뉴 ${index}`,
        pages: [],
        children: [],
      })),
    ]
    const small = bundle()
    const large = bundle({ menu: big })
    for (const path of ['index.html', LIST_PATH, DETAIL_PATH, POPUP_PATH]) expect(fileAt(large, path), path).toBe(fileAt(small, path))
    expect(fileAt(large, NAV_JS_PATH).length).toBeGreaterThan(fileAt(small, NAV_JS_PATH).length + 50 * 20)
  })

  it('장의 데이터는 제 페이지 id · 제목 · 제 자리만 든다', () => {
    const from = bundle()
    expect(pick(pageData(fileAt(from, DETAIL_PATH)))).toEqual({ pageId: 'p_detail', pageTitle: '회원 상세', path: DETAIL_PATH })
    expect(pick(pageData(fileAt(from, 'index.html')))).toEqual({ pageId: 'p_list', pageTitle: '회원 목록', path: 'index.html' })
  })
})

function pick(data: ExportPageData): Pick<ExportPageData, 'pageId' | 'pageTitle' | 'path'> {
  return { pageId: data.pageId, pageTitle: data.pageTitle, path: data.path }
}

describe('서브페이지 장의 틀', () => {
  it('GNB — 뿌리 메뉴의 링크는 그 아래 첫 화면 페이지 장이다(팝업은 건너뛴다) · 화면 없는 메뉴는 링크가 아니다', () => {
    const canvas = mountPage(DETAIL_PATH)
    expect(links(canvas, 'gnb')).toEqual([
      [isolateBidi(BIDI_MENU), encodeURI('회원관리-회원-목록.html'), null],
      ['빈 메뉴', null, null],
    ])
    expect(canvas.querySelector('[data-probe="gnb"][aria-disabled="true"]')?.textContent).toBe('빈 메뉴')
  })

  it('LNB — 지금 페이지가 든 뿌리 메뉴의 항목들 · 하위 메뉴는 그 첫 화면 · 지금 페이지만 aria-current', () => {
    const canvas = mountPage(DETAIL_PATH)
    expect(links(canvas, 'lnb')).toEqual([
      ['회원 목록', encodeURI('회원관리-회원-목록.html'), null],
      ['하위', encodeURI('회원관리-하위-회원-상세.html'), null],
    ])
    expect(canvas.querySelectorAll('[aria-current="page"]')).toHaveLength(0)
    const list = mountPage(LIST_PATH)
    expect(list.querySelector('[data-probe="lnb"][aria-current="page"]')?.textContent).toBe('회원 목록')
  })

  it('index.html(첫 장의 사본)의 링크는 그 자리에서 본 경로다', () => {
    const canvas = mountPage('index.html')
    expect(links(canvas, 'lnb').map(([, href]) => href)).toEqual([
      encodeURI('pages/회원관리-회원-목록.html'),
      encodeURI('pages/회원관리-하위-회원-상세.html'),
    ])
  })

  it('브레드크럼브 · 제목 — 뿌리 메뉴 → 하위 메뉴 → 지금 페이지 · 페이지 이름 그대로', () => {
    const canvas = mountPage(DETAIL_PATH)
    expect([...canvas.querySelectorAll('[data-probe="trail"]')].map((item) => item.textContent)).toEqual([
      isolateBidi(BIDI_MENU),
      '하위',
      '회원 상세',
    ])
    expect(canvas.querySelector('[data-probe="title"]')?.textContent).toBe('회원 상세')
  })

  it('선언한 영역은 늘 다 켠다', () => {
    const canvas = mountPage(DETAIL_PATH)
    expect([...canvas.querySelectorAll('[data-wb-layout-region]')].map((region) => region.getAttribute('data-wb-layout-region'))).toEqual([
      'gnb',
      'lnb',
      'breadcrumb',
    ])
  })

  it('틀은 노드가 아니다 — 틀 안 · 내용 밖에 data-wb-id 가 없고 문서 뿌리가 내용 상자 안에 하나 선다', () => {
    const canvas = mountPage(DETAIL_PATH)
    const frame = canvas.querySelector('[data-wb-layout="subpage"]')!
    expect(frame).not.toBeNull()
    const content = frame.querySelector('[data-wb-layout-content]')!
    const outside = [...frame.querySelectorAll('[data-wb-id]')].filter((element) => !content.contains(element))
    expect(outside).toHaveLength(0)
    expect(content.children).toHaveLength(1)
    expect(content.firstElementChild?.getAttribute('data-wb-component')).toBe('Page')
  })
})

describe('팝업 · 빈 레이아웃 장', () => {
  it('팝업 장은 팝업 틀 안에 상자를 세운다', () => {
    const canvas = mountPage(POPUP_PATH)
    const frame = canvas.querySelector('[data-wb-layout]')
    expect(frame?.getAttribute('data-wb-layout')).toBe('popup')
    expect(frame?.querySelector('[data-wb-layout-content] > [data-wb-component="Popup"]')).not.toBeNull()
  })

  it('레이아웃 뷰가 없는 테마는 서브페이지도 내용만 그린다', () => {
    const canvas = mountPage(DETAIL_PATH, NO_THEME)
    const frame = canvas.querySelector('[data-wb-layout="subpage"]')!
    expect(frame.children).toHaveLength(1)
    expect(frame.firstElementChild?.hasAttribute('data-wb-layout-content')).toBe(true)
    expect(canvas.querySelector('[data-wb-layout-region]')).toBeNull()
  })
})

describe('부팅이 nav.js 의 전역을 읽는다', () => {
  /** 번들에 실을 테마 — 서버 manifest 가 위 정의의 것이다(런타임이 등록 정의의 manifest 를 이것으로 바꿔 끼운다). */
  const BUNDLE_THEME = {
    ref: { themeId: LAYOUT_MANIFEST.id, version: LAYOUT_MANIFEST.version },
    manifest: LAYOUT_MANIFEST,
    tokens: {},
    themeJs: '/* theme.js */',
    themeCss: null,
    assets: [],
  }

  /** 테마 번들이 도는 순간 — 그 스크립트를 `currentScript` 로 세운 채 공유 런타임에 등록한다(`bundle-theme.test.tsx` 의 `runThemeScript` 와 같다). */
  function runThemeScript(): void {
    const script = document.getElementById('wb-export-theme')!
    const descriptor = Object.getOwnPropertyDescriptor(document, 'currentScript')
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script })
    try {
      ;(window as unknown as Record<string, WbRuntime>)[WB_RUNTIME_GLOBAL]!.register(LAYOUT_THEME)
    } finally {
      if (descriptor === undefined) delete (document as unknown as Record<string, unknown>)['currentScript']
      else Object.defineProperty(document, 'currentScript', descriptor)
    }
  }

  /** 장 하나를 싣고 스크립트 차례(런타임 → 내비 → 테마 → `boot`)를 흉내 내 세운다. `withNav` 가 거짓이면 `nav.js` 를 못 실은 판이다. */
  async function bootPage(path: string, withNav: boolean): Promise<Element> {
    const from = bundle({ theme: BUNDLE_THEME })
    const parsed = new DOMParser().parseFromString(fileAt(from, path), 'text/html')
    document.head.innerHTML = parsed.head.innerHTML
    document.body.innerHTML = parsed.body.innerHTML
    if (withNav) new Function(fileAt(from, NAV_JS_PATH))()
    runThemeScript()
    await act(async () => {
      booted = await boot({ window, runtime })
    })
    return document.querySelector('.wb-export-canvas')!
  }

  it('전역의 트리 · 경로와 장의 페이지 id · 제목으로 틀이 선다', async () => {
    const canvas = await bootPage(DETAIL_PATH, true)
    expect(booted?.failures).toEqual([])
    expect(links(canvas, 'lnb')).toEqual([
      ['회원 목록', encodeURI('회원관리-회원-목록.html'), null],
      ['하위', encodeURI('회원관리-하위-회원-상세.html'), null],
    ])
    expect(canvas.querySelector('[data-probe="title"]')?.textContent).toBe('회원 상세')
  })

  it('전역이 없어도(파일을 못 실음) 틀은 선다 — 내비는 지금 페이지 하나짜리다', async () => {
    const canvas = await bootPage(DETAIL_PATH, false)
    expect(booted?.failures).toEqual([])
    expect(links(canvas, 'gnb')).toEqual([])
    expect([...canvas.querySelectorAll('[data-probe="trail"]')].map((item) => item.textContent)).toEqual(['회원 상세'])
  })
})

describe('레이아웃 뷰가 던지면', () => {
  const THROWING: ThemeDefinition = defineTheme({
    manifest: LAYOUT_MANIFEST,
    views: {},
    layouts: {
      subpage: () => {
        throw new Error('틀 고장')
      },
    },
  })

  it('틀은 내용만으로 서고 그 말을 낸다 — 노드 오류로 세지 않는다', () => {
    const original = console.error
    console.error = () => {}
    try {
      mountPage(DETAIL_PATH, THROWING)
    } finally {
      console.error = original
    }
    expect(mounted?.layoutError).toBe('테마 레이아웃 뷰가 던졌습니다: 틀 고장')
    expect(mounted?.thrown).toEqual([])
    expect(document.querySelector('[data-wb-layout-content] > [data-wb-component="Page"]')).not.toBeNull()
  })
})

/** 번들에 실린 페이지 문서가 판 7 의 레이아웃을 든다 — 픽스처가 낡으면 위 판이 다른 레이아웃을 잰다. */
it('픽스처의 레이아웃', () => {
  const layouts = pages().map((page) => (page.document as PageDocument & { layout?: string }).layout)
  expect(layouts).toEqual(['subpage', 'subpage', 'popup'])
})
