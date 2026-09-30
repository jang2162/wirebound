// @vitest-environment jsdom
/**
 * **나가는 `dist/runtime.js` 를 그대로 돌린다** — 번들 페이지가 싣는 내보내기 런타임(vite IIFE · `vite.runtime.config.ts`).
 *
 * 소스를 재는 케이스(`test/*`)는 vitest 가 옮긴 글자를 돈다. 받는 쪽이 받는 것은 vite 가 묶은 이 파일이라 — react · react-dom 을
 * 묶고 NODE_ENV 를 글자로 바꾼 판 — 그 글자를 jsdom 에 올려 재는 자리가 따로 있어야 한다.
 *
 * jsdom 은 `<script src>` 를 돌리지 않는다 — 파일의 글자를 `new Function` 으로 돌리고 페이지의 인라인 `boot()` 를 손으로 부른다.
 * 좌표 · 글꼴 · `<link>` 적재는 여기서 못 잰다(실브라우저 판 `apps/web/build-test/export-bundle.test.ts`).
 *
 * `pnpm test` 에는 안 들어간다(`--project '!build'`). `pnpm test:build` 가 돌린다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

// **`import.meta.url`을 안 쓴다** — jsdom 환경에서는 그것이 `file:` 스킴이 아니다. vitest 의 cwd 는 저장소 뿌리다.
const repoRoot = process.cwd()
const runtimePath = resolve(repoRoot, 'packages/exporter/dist/runtime.js')
const distPath = resolve(repoRoot, 'packages/exporter/dist/index.js')

let runtimeJs = ''

/**
 * **`packages/*` 를 전부 짓는다** — 받는 쪽(api 는 `dist/index.js` 를 부른다)이 받는 것으로 번들을 짓고 그 런타임으로 연다. exporter 의
 * `build` 가 tsdown 뒤 런타임(vite)을 짓는다.
 */
beforeAll(() => {
  execFileSync('pnpm', ['--filter', './packages/*', '-r', 'build'], { cwd: repoRoot, stdio: 'pipe' })
  runtimeJs = readFileSync(runtimePath, 'utf8')
}, 300_000)

const DOC = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_btn', type: 'Button', props: { label: '검색' } },
      { id: 'n_list', type: 'List', props: {} },
    ],
  },
}

function pageData(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    document: DOC,
    title: '회원 목록',
    target: null,
    themeRef: null,
    manifest: null,
    tokens: {},
    hrefs: {},
    markers: [],
    ...overrides,
  }).replace(/</g, '\\u003c')
}

/** 번들 페이지의 뼈대 — 셸의 목업 자리 · 상태 줄 · 페이지 JSON(`bundle/shell.tsx` 의 이름). */
function loadPage(data: string): void {
  document.documentElement.removeAttribute('data-wb-ready')
  document.documentElement.removeAttribute('data-wb-failed')
  document.body.innerHTML = `
    <main class="wb-export-mockup"><div class="wb-export-canvas"></div><div class="wb-export-status" role="status" hidden></div></main>
    <script type="application/json" id="wb-export-page">${data}</script>`
}

async function bootPage(): Promise<void> {
  const exported = (window as unknown as { __wirebound_export__?: { boot(): Promise<unknown> } }).__wirebound_export__
  if (exported === undefined) throw new Error('런타임이 boot 를 걸지 않았다')
  await exported.boot()
}

describe('나가는 runtime.js 의 글자', () => {
  it('일반 스크립트(IIFE)다 — 모듈 문법이 없다', () => {
    expect(runtimeJs.startsWith('(function(){')).toBe(true)
    expect(runtimeJs.trimEnd().endsWith('})();')).toBe(true)
    expect(runtimeJs).not.toMatch(/^\s*(import|export)\s/m)
  })

  it('운영판이다 — process.env 를 읽지 않고 개발 JSX 가 없다', () => {
    expect(runtimeJs).not.toContain('process.env')
    expect(runtimeJs).not.toContain('jsxDEV')
  })

  /** `file://` 에서는 `styleSheets[i].cssRules` 가 `SecurityError` 를 던진다 — 시트가 붙고 적용되는데도 그렇다. 런타임은 시트를 안 읽는다. */
  it('시트를 읽지 않는다', () => {
    expect(runtimeJs).not.toContain('cssRules')
  })

  it('비어 있지 않다 — 카나리아(react-dom 을 묶었다)', () => {
    expect(runtimeJs.length).toBeGreaterThan(100_000)
  })

  /**
   * **자릿수 상한(UTF-8 바이트).** 지금 판은 react · react-dom · 카탈로그(zod) · 렌더러 · SDK 를 묶어 수백 KB 다 — 개발 React 가 묶이거나
   * 워크스페이스 패키지가 두 벌 실리는 회귀는 크기를 배로 키워 여기 걸린다. 크기 자체는 이 케이스의 실패 값이 말한다.
   */
  it('자릿수 상한(1 MB) 안이다', () => {
    expect(new TextEncoder().encode(runtimeJs).length).toBeLessThan(1_000_000)
  })
})

describe('나가는 runtime.js 를 돌린다', () => {
  let leaked: string[] = []

  beforeAll(() => {
    const before = new Set(Object.keys(window))
    new Function(runtimeJs)()
    leaked = Object.keys(window).filter((key) => !before.has(key))
  })

  /**
   * 런타임이 전역에 세우는 이름을 전부 센다 — 같은 페이지의 테마 번들과 이름을 나눠 쓰는 자리는 이 둘뿐이어야 한다. zod 의 둘은 zod 4 가
   * 스스로 두는 전역이다(사본이 여럿이어도 설정 한 벌을 나눈다). **IIFE 밖의 최상위 `var` 는 여기서 안 보인다** — `new Function` 의 본문에서는
   * 지역이다. 그것은 위 «일반 스크립트(IIFE)다» 가 글자의 머리로 잰다.
   */
  it('공유 런타임 전역과 boot 를 세운다 — 그 밖의 이름은 전역에 새지 않는다', () => {
    // zod 의 전역은 같은 판에서 먼저 선 것이 있으면 «새로 선 이름» 에 안 든다 — 판에 매이지 않게 셈에서 뗀다.
    expect(leaked.filter((key) => !key.startsWith('__zod_')).sort()).toEqual(['__wirebound_export__', '__wirebound_runtime__'])
    const runtime = (window as unknown as Record<string, { sdk?: { Root?: unknown }; react?: { createElement?: unknown } }>)
      .__wirebound_runtime__!
    expect(typeof runtime.react?.createElement).toBe('function')
    expect(typeof runtime.sdk?.Root).toBe('function')
  })

  it('페이지 JSON 의 문서를 기본 뷰로 그리고 data-wb-ready 를 세운다', async () => {
    loadPage(pageData())
    await bootPage()
    const canvas = document.querySelector('.wb-export-canvas')!
    expect([...canvas.querySelectorAll('[data-wb-id]')].map((node) => node.getAttribute('data-wb-id'))).toEqual(['n_root', 'n_btn', 'n_list'])
    expect(canvas.querySelector('[data-wb-id="n_btn"]')?.textContent).toBe('검색')
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    expect(document.documentElement.hasAttribute('data-wb-failed')).toBe(false)
  })

  it('페이지 JSON 이 없으면 까닭을 적고 준비 신호도 세운다', async () => {
    loadPage('')
    document.getElementById('wb-export-page')!.remove()
    await bootPage()
    expect(document.documentElement.getAttribute('data-wb-failed')).toBe('페이지 데이터를 읽지 못했습니다')
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    expect(document.querySelector('.wb-export-status')?.textContent).toBe('페이지 데이터를 읽지 못했습니다')
  })
})

/** `dist` 가 내는 것 중 이 파일이 쓰는 것만. */
interface DistExporter {
  exportBundle: (options: {
    pages: readonly { title: string; document: unknown; comments?: readonly { nodeId: string; body: string }[]; target?: string }[]
    runtimeJs: string
  }) => { files: { path: string; content: string | Uint8Array }[]; errors: unknown[] }
}

/** 상호작용 · 마커가 든 문서 — 누른 결과가 셋(setProp · switchTab · setVisible) 다 보이게. */
const PRESSED = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '검색' },
        marker: 1,
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
              { type: 'switchTab', target: 'n_tabs', tab: 1 },
              { type: 'setVisible', target: 'n_card', value: false },
            ],
          },
        ],
      },
      { id: 'n_list', type: 'List', props: {}, marker: 2 },
      { id: 'n_tabs', type: 'Tabs', props: { tabs: ['ㄱ', 'ㄴ'], active: 0 } },
      { id: 'n_card', type: 'Card', props: { title: '회원' } },
    ],
  },
}

describe('받는 쪽이 받는 dist 로 지은 번들을 나가는 런타임으로 연다', () => {
  let files: { path: string; content: string | Uint8Array }[] = []

  beforeAll(async () => {
    const dist = (await import(/* @vite-ignore */ pathToFileURL(distPath).href)) as DistExporter
    files = dist.exportBundle({
      pages: [{ title: '회원 목록', document: PRESSED, comments: [{ nodeId: 'n_list', body: '기본 정렬은 가입일 역순' }] }],
      runtimeJs,
    }).files
  })

  function fileAt(path: string): string {
    const found = files.find((file) => file.path === path)
    if (found === undefined || typeof found.content !== 'string') throw new Error(`번들에 없는 글자 파일: ${path}`)
    return found.content
  }

  it('dist 가 번들의 파일 트리를 내고 런타임 글자를 그대로 싣는다', () => {
    expect(files.map((file) => file.path)).toEqual(['index.html', 'pages/회원-목록.html', 'assets/shell.css', 'assets/views.css', 'assets/runtime.js'])
    expect(fileAt('assets/runtime.js')).toBe(runtimeJs)
  })

  it('페이지를 싣고 런타임을 돌리면 목업 · 마커가 서고 눌러 바뀐다', async () => {
    const parsed = new DOMParser().parseFromString(fileAt('pages/회원-목록.html'), 'text/html')
    document.head.innerHTML = parsed.head.innerHTML
    document.body.innerHTML = parsed.body.innerHTML
    document.documentElement.removeAttribute('data-wb-ready')
    new Function(fileAt('assets/runtime.js'))()
    await bootPage()
    const canvas = document.querySelector('.wb-export-canvas')!
    expect(document.documentElement.hasAttribute('data-wb-ready')).toBe(true)
    expect([...document.querySelectorAll('.wb-export-marker')].map((badge) => [badge.getAttribute('data-wb-marker-for'), badge.textContent])).toEqual([
      ['n_btn', '1'],
      ['n_list', '2'],
    ])
    canvas.querySelector('[data-wb-id="n_btn"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // 런타임의 React 는 이벤트 뒤 다시 그리기를 다음 마이크로태스크에 한다.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(canvas.querySelector('[data-wb-id="n_list"]')?.getAttribute('data-wb-state')).toBe('loading')
    expect([...canvas.querySelectorAll('[data-wb-id="n_tabs"] [data-wb-part="tab"]')].map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(canvas.querySelector('[data-wb-id="n_card"]')).toBeNull()
  })

  /** 소스 파일에도 날 제어 바이트가 없어야 하듯, **나가는 자산에도** 없어야 한다. */
  it('나가는 글자 자산에 날 제어 바이트가 없다', () => {
    for (const file of files) {
      if (typeof file.content !== 'string') continue
      expect(CONTROL_BYTES.test(file.content), file.path).toBe(false)
    }
  })
})

/** 날 제어 바이트. **소스에 날로 적지 않는다** — census가 이 파일도 훑는다. */
const CONTROL_BYTES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

/** 이 파일이 진짜 산출물을 봤는지. 경로가 어긋나면 위가 공허하게 통과한다. */
describe('자가 dist 를 본다 — 카나리아', () => {
  it('cwd 가 저장소 뿌리이고 dist/runtime.js 가 실재한다', () => {
    expect(existsSync(resolve(repoRoot, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(runtimePath)).toBe(true)
  })

  it('dist/index.js 가 실재하고 소스가 아니다', () => {
    const text = readFileSync(distPath, 'utf8')
    expect(text.length).toBeGreaterThan(1_000)
    expect(text).not.toContain("from '@wirebound/schema/src")
  })
})
