// @vitest-environment jsdom
/**
 * **번들 페이지를 열면 그 페이지의 문서가 캔버스와 같은 그림으로 서는가.**
 *
 * ---
 *
 * # 사슬
 *
 * `packages/exporter`는 `apps/web`의 캔버스를 볼 수 없으므로 직접 견줄 수 없다. 대신 **사슬**을 잇는다:
 *
 * | 어디 | 무엇을 견주나 |
 * |---|---|
 * | `apps/web/test/canvas/bundle-parity.test.tsx` | 진짜 캔버스 ↔ 번들 런타임의 진입(`mountExportDocument`) |
 * | `parity.test.tsx` | 렌더러를 클라이언트로 그린 것 ↔ 같은 진입 — 픽스처 셋 × 테마 둘 |
 * | **여기** | 번들의 **페이지 파일**을 부팅한 것(`boot` — 페이지 JSON 을 읽어 그 진입을 부른다) ↔ 그 페이지 문서의 화면 경로 |
 *
 * 여기가 따로 재는 것은 **파일마다 제 문서**다 — 페이지 JSON 을 잘못 실으면(모든 파일이 첫 페이지) 진입만 재는 자로는 안 잡힌다.
 * 테마는 싣지 않는다(테마를 실은 번들은 `bundle-theme.test.tsx`).
 *
 * # 견주는 자와 픽스처를 새로 짜지 않는다
 *
 * `@wirebound/exporter/test-support`의 `describeTree`를 쓴다. 두 벌을 두면 *"같다"*의 뜻이 둘이 된다.
 */
import { NO_THEME, renderDocument } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { ThemeProvider } from '@wirebound/theme-sdk'
import { installRuntime, type RuntimeHandle } from '@wirebound/theme-sdk/runtime'
import { broadFixture, describeTree, SAMPLE_PAGE } from '@wirebound/exporter/test-support'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { boot, type BootResult } from '../src/browser/boot'
import { exportBundle } from '../src/bundle/index'

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
})

/** 화면 경로 — 캔버스가 하는 것과 같다(렌더러를 `react-dom/client` 로 · 기본 뷰). 떼기 전에 편다. */
function screenTree(page: PageDocument): string[] {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => {
    root.render(createElement(ThemeProvider, { value: { tokens: {}, window }, children: renderDocument(page, { theme: NO_THEME }) }))
  })
  const tree = describeTree(host.firstElementChild!)
  act(() => root.unmount())
  return tree
}

/** 번들 안의 한 파일을 싣고 부팅한 뒤 목업 자리의 문서 뿌리. 셸의 상자는 `data-wb-id` 를 안 단다. */
async function bootedTree(bundle: ReturnType<typeof exportBundle>, path: string): Promise<string[]> {
  const file = bundle.files.find((item) => item.path === path)
  if (file === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  const parsed = new DOMParser().parseFromString(file.content as string, 'text/html')
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
  await act(async () => {
    booted = await boot({ window, runtime })
  })
  const root = document.querySelector('.wb-export-canvas [data-wb-id]')
  if (root === null) throw new Error('목업이 서지 않았습니다')
  const tree = describeTree(root)
  act(() => booted!.mount!.unmount())
  booted = null
  return tree
}

const MANY: [title: string, make: () => PageDocument][] = [
  ['넓게 덮는 문서', broadFixture],
  ['글 하나', () => SAMPLE_PAGE],
  [
    '버튼 하나',
    () => ({ version: 1, root: { id: 'n_p', type: 'Page', children: [{ id: 'n_b', type: 'Button', props: { label: '저장' } }] } }),
  ],
]

const PATHS = ['pages/넓게-덮는-문서.html', 'pages/글-하나.html', 'pages/버튼-하나.html']

function manyPages(documents: PageDocument[]): ReturnType<typeof exportBundle> {
  return exportBundle({ pages: MANY.map(([title], index) => ({ title, document: documents[index]! })), runtimeJs: '/* runtime */' })
}

/**
 * **번들의 가장 큰 약속** — 페이지 파일 하나를 열면 **그 페이지가** 그려진다.
 *
 * **세는 단위를 못박는다:** 페이지 파일의 **목록**을 자리까지 견주고(빠지거나 늘면 죽는다), 그 다음 **자리마다** 그 페이지의
 * 화면 경로와 견준다.
 */
describe('페이지가 여럿이어도 페이지마다 자기 문서를 그린다', () => {
  it('페이지 셋이 각각 자기 문서와 같다', async () => {
    const documents = MANY.map(([, make]) => make())
    const bundle = manyPages(documents)

    /**
     * **셋이 서로 다른 그림인지부터 본다.** 같으면 아래 반복이 *"자리마다 제 것"*을 재는 것이 아니라 **아무거나 그려도 통과하는
     * 검사**가 된다.
     */
    const expected = documents.map((page) => screenTree(page))
    expect(new Set(expected.map((lines) => lines.join('\n'))).size).toBe(expected.length)

    // 세는 단위 — 파일 목록이 자리까지 같아야 아래 index가 뜻을 갖는다.
    expect(bundle.files.filter((file) => file.path.startsWith('pages/')).map((f) => f.path)).toEqual(PATHS)

    for (const [index, path] of PATHS.entries()) {
      expect(await bootedTree(bundle, path), path).toEqual(expected[index])
    }
  })

  /** `index.html`은 **첫 페이지**를 담는다. 그것도 자리로 재 둔다. */
  it('index.html은 첫 페이지를 담는다 — 아무 페이지나가 아니다', async () => {
    const documents = MANY.map(([, make]) => make())
    expect(await bootedTree(manyPages(documents), 'index.html')).toEqual(screenTree(documents[0]!))
  })
})

describe('셸이 문서에 손대지 않는다', () => {
  /**
   * 견주기는 뿌리 **아래**만 잰다. 여기서는 **반대쪽**을 든다 — 셸의 상자에 `data-wb-id`가 없다는 것. 그것이 위
   * `querySelector('.wb-export-canvas [data-wb-id]')`가 문서 뿌리를 집는다는 전제다.
   */
  it('셸의 상자에 data-wb-id가 없고 목업의 첫 노드가 문서 뿌리다', async () => {
    const bundle = exportBundle({ pages: [{ title: '견주기', document: broadFixture() }], runtimeJs: '/* runtime */' })
    const file = bundle.files.find((item) => item.path === 'pages/견주기.html')!
    const parsed = new DOMParser().parseFromString(file.content as string, 'text/html')
    document.head.innerHTML = parsed.head.innerHTML
    document.body.innerHTML = parsed.body.innerHTML
    await act(async () => {
      booted = await boot({ window, runtime })
    })
    expect(document.querySelector('[data-wb-id]')?.getAttribute('data-wb-component')).toBe('Page')
    for (const shell of [...document.querySelectorAll('[class^="wb-export"]')]) {
      expect(shell.hasAttribute('data-wb-id')).toBe(false)
    }
  })
})
