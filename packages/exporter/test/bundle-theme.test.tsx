// @vitest-environment jsdom
/**
 * **테마를 실은 번들** — 패키지 파일 그대로 · 토큰 CSS · 페이지 JSON 의 테마 칸 · 시트와 스크립트의 차례, 그리고 런타임이 그 테마로
 * 그리거나 못 쓴 까닭을 말하는지.
 *
 * jsdom 은 `<script src>` 를 돌리지 않는다 — 테마 번들이 도는 순간을 흉내 낸다: 페이지의 테마 스크립트(`#wb-export-theme`)를
 * `document.currentScript` 로 세운 채 공유 런타임의 `register` 를 부른다(`theme.js` 가 하는 일). 그 흉내가 실브라우저와 같은지는
 * `apps/web/build-test/export-bundle.test.ts` 가 진짜 `theme.js` 를 `file://` 로 싣고 같은 성질을 잰다. 시트의 겹침(계산값)도 거기서 잰다.
 */
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { defineTheme, Root, view, type ThemeDefinition } from '@wirebound/theme-sdk'
import { installRuntime, WB_RUNTIME_GLOBAL, type RuntimeHandle, type WbRuntime } from '@wirebound/theme-sdk/runtime'
import { tokensCss } from '@wirebound/themes'
import { act, createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { boot, type BootResult } from '../src/browser/boot'
import { exportBundle, type BundleTheme } from '../src/bundle/index'
import type { ExportPageData } from '../src/page-data'
import { EMPTY_MANIFEST, markedTheme } from '../test-support/fixtures'

let runtime: RuntimeHandle
beforeAll(() => {
  installCatalog()
  runtime = installRuntime(window as unknown as typeof globalThis)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let booted: BootResult | null = null
afterEach(() => {
  const mount = booted?.mount
  booted = null
  if (mount !== null && mount !== undefined) act(() => mount.unmount())
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-wb-ready')
  document.documentElement.removeAttribute('data-wb-failed')
  runtime.take()
  vi.restoreAllMocks()
})

/** 서버 manifest — 토큰 하나(`color.brand`)를 선언한다. `markedTheme` 과 같은 id · 판이다. */
const SERVER_MANIFEST = {
  ...markedTheme().manifest,
  tokens: { items: { 'color.brand': { type: 'color' as const, label: '브랜드', default: '#2563eb' } } },
}

const FONT = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0x80, 0x01])

function theme(overrides: Partial<BundleTheme> = {}): BundleTheme {
  return {
    ref: { themeId: SERVER_MANIFEST.id, version: SERVER_MANIFEST.version },
    manifest: SERVER_MANIFEST,
    tokens: { 'color.brand': '#123456' },
    themeJs: '/* theme.js */',
    themeCss: '@font-face { font-family: T; src: url(./assets/t.woff2) }',
    assets: [['assets/t.woff2', FONT]],
    ...overrides,
  }
}

const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_card', type: 'Card', props: { title: '회원' }, marker: 1 },
      { id: 'n_btn', type: 'Button', props: { label: '저장' } },
    ],
  } as WbNode,
}

function bundle(withTheme: BundleTheme | null = theme()): ReturnType<typeof exportBundle> {
  return exportBundle({ pages: [{ title: '회원 목록', document: DOC }], runtimeJs: '/* runtime */', theme: withTheme })
}

function fileAt(from: ReturnType<typeof exportBundle>, path: string): string | Uint8Array {
  const found = from.files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  return found.content
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('테마를 실은 번들의 파일', () => {
  it('패키지 파일을 assets/theme/ 아래에 그대로 싣고 토큰 CSS 를 더한다', () => {
    expect(bundle().files.map((file) => file.path)).toEqual([
      'index.html',
      'pages/회원-목록.html',
      'assets/shell.css',
      'assets/views.css',
      'assets/runtime.js',
      'assets/theme/theme.js',
      'assets/theme/theme.css',
      'assets/theme/assets/t.woff2',
      'assets/tokens.css',
    ])
    expect(fileAt(bundle(), 'assets/theme/theme.js')).toBe('/* theme.js */')
    expect(fileAt(bundle(), 'assets/theme/theme.css')).toBe(theme().themeCss)
    expect(fileAt(bundle(), 'assets/tokens.css')).toBe(tokensCss(SERVER_MANIFEST, { 'color.brand': '#123456' }).css)
  })

  /** 자산은 바이트다 — 글자로 옮기면 글꼴이 깨진다(UTF-8 로 못 읽는 바이트를 넣어 둔다). */
  it('자산이 바이트 그대로다', () => {
    const font = fileAt(bundle(), 'assets/theme/assets/t.woff2')
    expect(font).toBeInstanceOf(Uint8Array)
    expect([...(font as Uint8Array)]).toEqual([...FONT])
  })

  it('theme.css 가 없는 패키지는 그 파일도 link 도 없다', () => {
    const plain = bundle(theme({ themeCss: null }))
    expect(plain.files.map((file) => file.path)).not.toContain('assets/theme/theme.css')
    const links = [...parse(fileAt(plain, 'pages/회원-목록.html') as string).head.querySelectorAll('link')].map((link) =>
      link.getAttribute('href'),
    )
    expect(links).toEqual(['../assets/shell.css', '../assets/views.css', '../assets/tokens.css'])
  })

  /** 문서 시트는 캔버스와 같은 차례다 — 기본 뷰 → 테마 → 토큰. 테마 link 에만 런타임이 찾는 표지가 있다. */
  it.each([
    ['index.html', ''],
    ['pages/회원-목록.html', '../'],
  ])('%s 의 머리 시트가 셸 → 기본 뷰 → 테마 → 토큰 차례다', (path, up) => {
    const links = [...parse(fileAt(bundle(), path) as string).head.querySelectorAll('link')]
    expect(links.map((link) => [link.getAttribute('href'), link.getAttribute('data-wb-sheet')])).toEqual([
      [`${up}assets/shell.css`, null],
      [`${up}assets/views.css`, null],
      [`${up}assets/theme/theme.css`, 'theme'],
      [`${up}assets/tokens.css`, null],
    ])
  })

  /** 테마 번들은 런타임 **뒤**, `boot` **앞**이다 — 공유 런타임 전역을 읽고, `boot` 가 그 등록을 받는다. */
  it('스크립트가 데이터 → 런타임 → 테마 번들 → boot 차례다', () => {
    const scripts = [...parse(fileAt(bundle(), 'pages/회원-목록.html') as string).querySelectorAll('script')]
    expect(scripts.map((script) => [script.getAttribute('id'), script.getAttribute('src')])).toEqual([
      ['wb-export-page', null],
      [null, '../assets/runtime.js'],
      ['wb-export-theme', '../assets/theme/theme.js'],
      [null, null],
    ])
  })

  it('페이지 JSON 이 테마 칸 셋(themeRef · 서버 manifest · 토큰)을 싣는다', () => {
    const node = parse(fileAt(bundle(), 'pages/회원-목록.html') as string).getElementById('wb-export-page')!
    const data = JSON.parse(node.textContent ?? '') as ExportPageData
    expect([data.themeRef, data.manifest, data.tokens]).toEqual([
      { themeId: 'marked', version: '0.0.0' },
      SERVER_MANIFEST,
      { 'color.brand': '#123456' },
    ])
  })
})

/** 번들의 한 장을 싣는다 — 스크립트는 돌지 않는다. */
function load(from: ReturnType<typeof exportBundle>): void {
  const parsed = parse(fileAt(from, 'pages/회원-목록.html') as string)
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
}

/** 테마 번들이 도는 순간 — 그 스크립트를 `currentScript` 로 세운 채 공유 런타임에 등록한다(`theme.js` 의 몸). */
function runThemeScript(definition: ThemeDefinition): void {
  const script = document.getElementById('wb-export-theme')!
  const descriptor = Object.getOwnPropertyDescriptor(document, 'currentScript')
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script })
  try {
    ;(window as unknown as Record<string, WbRuntime>)[WB_RUNTIME_GLOBAL]!.register(definition)
  } finally {
    if (descriptor === undefined) delete (document as unknown as Record<string, unknown>)['currentScript']
    else Object.defineProperty(document, 'currentScript', descriptor)
  }
}

async function run(): Promise<void> {
  await act(async () => {
    booted = await boot({ window, runtime })
  })
}

function statusLines(): string[] {
  const box = document.querySelector('.wb-export-status')!
  return box.hasAttribute('hidden') ? [] : [...box.querySelectorAll('.wb-export-status-line')].map((line) => line.textContent ?? '')
}

describe('런타임이 번들의 테마로 그린다', () => {
  it('등록한 정의의 뷰로 그리고 정의의 manifest 는 서버 것이다 — 실패 없음', async () => {
    load(bundle())
    runThemeScript(markedTheme())
    await run()
    const card = document.querySelector('.wb-export-canvas [data-wb-id="n_card"]')
    expect([card?.tagName, card?.className]).toEqual(['SECTION', 'marked'])
    expect(document.documentElement.hasAttribute('data-wb-failed')).toBe(false)
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    expect(statusLines()).toEqual([])
    expect(document.querySelector('link[data-wb-sheet="theme"]')).not.toBeNull()
  })

  /** `useToken` 은 서버 manifest 로 푼 값이다 — 저장한 토큰이 뷰에 닿는다. */
  it('저장한 토큰을 뷰가 useToken 으로 읽는다', async () => {
    const { useToken } = await import('@wirebound/theme-sdk')
    const reading = defineTheme({
      manifest: SERVER_MANIFEST,
      views: { Card: view(() => createElement(Root, { as: 'div' }, String(useToken('color.brand')))) },
    })
    load(bundle())
    runThemeScript(reading)
    await run()
    expect(document.querySelector('.wb-export-canvas [data-wb-id="n_card"]')?.textContent).toBe('#123456')
  })

  it('테마 번들이 등록하지 않으면 기본 뷰로 그리고 까닭을 적고 테마 시트를 뗀다', async () => {
    load(bundle())
    await run()
    const reason = '테마 번들이 등록하지 않았습니다(marked@0.0.0)'
    expect(document.documentElement.getAttribute('data-wb-failed')).toBe(reason)
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    expect(statusLines()).toEqual([reason])
    expect(document.querySelector('.wb-export-canvas [data-wb-id="n_card"]')?.className).not.toBe('marked')
    expect(document.querySelector('link[data-wb-sheet="theme"]')).toBeNull()
  })

  /** 스크립트 밖의 등록(미룬 것 · 다른 스크립트)은 제 정의로 받지 않는다(`take(script)`). */
  it('테마 스크립트 밖에서 온 등록은 받지 않는다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    load(bundle())
    ;(window as unknown as Record<string, WbRuntime>)[WB_RUNTIME_GLOBAL]!.register(markedTheme())
    await run()
    expect(document.documentElement.getAttribute('data-wb-failed')).toBe('테마 번들이 등록하지 않았습니다(marked@0.0.0)')
  })

  it('다른 판을 등록하면 adoptManifest 의 까닭으로 실패한다', async () => {
    load(bundle())
    runThemeScript(defineTheme({ manifest: { ...markedTheme().manifest, version: '9.9.9' }, views: {} }))
    await run()
    expect(document.documentElement.getAttribute('data-wb-failed')).toBe(
      '테마 번들이 다른 테마를 등록했습니다(marked@0.0.0 — 번들은 marked@9.9.9)',
    )
  })

  it('뷰가 던지면 그 노드 id 와 함께 실패를 적는다 — 준비 신호는 선다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    load(bundle())
    runThemeScript(
      defineTheme({
        manifest: { ...EMPTY_MANIFEST, id: 'marked' },
        views: {
          Card: view(() => {
            throw new Error('카드가 던짐')
          }),
        },
      }),
    )
    await run()
    expect(document.documentElement.getAttribute('data-wb-failed')).toBe('테마 뷰가 던졌습니다: n_card')
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    expect(statusLines()).toEqual(['테마 뷰가 던졌습니다: n_card'])
  })
})
