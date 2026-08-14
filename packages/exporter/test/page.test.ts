/**
 * `exportPage` — 페이지 문서 하나를 정적 HTML 한 장으로(§11.3, D1·D3·D5·D7).
 *
 * **이 파일은 DOM 없이 돈다.** 루트 `vitest.config.ts`의 `unit` 프로젝트에 `environment`가
 * 없어 Node 전역만 있고, 그것이 이 슬라이스가 기대는 사실이다(재라 #1) — `exportPage`는
 * 서버에서 돌아야 한다. 아래 첫 케이스가 그 전제를 카나리아로 지킨다: 누가 `unit`에
 * jsdom을 걸면 *"DOM 없이 돈다"*가 조용히 안 재지게 되므로, 그때 그 케이스가 먼저 죽는다.
 *
 * DOM을 견주는 것은 `parity.test.tsx`가 한다(D6). 그 파일만 jsdom을 쓴다.
 */
import { installStructures, structureBaseCss } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import {
  THEME_ISSUE_SEVERITY,
  compileTheme,
  resolveTheme,
  systemTheme,
  type ResolvedTheme,
} from '@wirebound/themes'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportPage } from '../src/page'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/**
 * 시스템 테마 하나를 해석한다. **`error`만 막고 `warning`은 통과시킨다** —
 * `resolveTheme`의 기준이 그것이고(`themes`에 첫 `warning`이 생긴 뒤로), 실제로
 * `docs` 테마가 `node-handle-overwrite` 경고 하나를 든다. 경고를 막으면 이 파일이
 * 재려는 것과 무관한 이유로 죽는다.
 */
function resolvedSystemTheme(id: string): ResolvedTheme {
  const { theme, issues } = resolveTheme(systemTheme(id)!)
  const errors = issues.filter((issue) => THEME_ISSUE_SEVERITY[issue.code] === 'error')
  expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  expect(theme).not.toBeNull()
  return theme!
}

const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      { id: 'n_000000000002', type: 'Text', props: { content: '회원 목록' } },
      { id: 'n_000000000003', type: 'List' },
    ],
  },
}

describe('exportPage — 서버에서 돈다', () => {
  it('DOM 전역이 없는 자리에서 돈다', () => {
    // 카나리아. `unit` 프로젝트에 DOM이 걸리면 여기가 먼저 죽고, 그러면 아래 케이스들이
    // 재는 것이 *"서버에서 돈다"*가 아니게 됐다는 뜻이다.
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined')

    expect(() => exportPage({ document: DOC, title: '회원 목록' })).not.toThrow()
  })
})

describe('exportPage — HTML 한 장의 모양 (D7)', () => {
  const { html } = exportPage({ document: DOC, title: '회원 목록' })

  it('doctype으로 시작한다', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })

  it('lang·charset·title·body를 갖는다', () => {
    expect(html).toContain('<html lang="ko">')
    expect(html).toContain('<meta charSet="utf-8"/>')
    expect(html).toContain('<title>회원 목록</title>')
    expect(html).toContain('<body>')
  })

  it('lang은 인자로 바꾼다', () => {
    const other = exportPage({ document: DOC, title: 'Members', lang: 'en' })
    expect(other.html).toContain('<html lang="en">')
  })

  /**
   * **셸·네비·3분할을 여기서 만들지 않는다**(D7). P8-2가 §9의 3분할을 판정한다.
   * 분모를 손으로 든다 — 구현에서 끌어오면 셸을 더한 날 기대값도 함께 늘어난다.
   */
  it('셸을 미리 만들지 않는다 — body의 자식은 문서 뿌리 하나다', () => {
    const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
    expect(body.startsWith('<div data-wb-id="n_000000000001"')).toBe(true)
    expect(body.endsWith('</div>')).toBe(true)
    for (const shell of ['<nav', '<aside', '<header', 'wb-shell', 'index.html']) {
      expect(body, shell).not.toContain(shell)
    }
  })

  /** **CSS를 HTML에 넣지 않는다**(D1·D7) — 링크로 걸지 인라인할지는 P8-2가 정한다. */
  it('CSS를 HTML에 싣지 않는다', () => {
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<link')
  })
})

describe('exportPage — 문서를 렌더러로 그린다 (D3)', () => {
  it('§6.11의 속성이 붙은 채로 나온다', () => {
    const { html } = exportPage({ document: DOC, title: '회원 목록' })
    expect(html).toContain('data-wb-component="Page"')
    expect(html).toContain('data-wb-component="Text"')
    expect(html).toContain('data-wb-component="List"')
    expect(html).toContain('회원 목록')
  })

  it('그리지 못한 노드를 errors로 낸다 — 조용히 넘어가지 않는다', () => {
    const broken: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000009', type: '없는타입' }],
      },
    }
    const { errors } = exportPage({ document: broken, title: '깨진 문서' })
    expect(errors).toEqual([
      { nodeId: 'n_000000000009', type: '없는타입', message: '알 수 없는 컴포넌트 타입: 없는타입' },
    ])
  })
})

describe('exportPage — 테마 (D5)', () => {
  it('테마가 고른 구조를 그린다', () => {
    const admin = resolvedSystemTheme('admin')
    const docs = resolvedSystemTheme('docs')
    const structureOf = (theme: ResolvedTheme): string | undefined =>
      theme.components.get('List')?.structure

    // **두 테마가 실제로 다른 것을 고르는지부터 본다.** 같은 값을 고르면 아래 반복이
    // 같은 것을 두 번 재고, 구조 배선이 끊겨도 통과한다.
    expect(structureOf(admin)).toBeDefined()
    expect(structureOf(docs)).toBeDefined()
    expect(structureOf(admin)).not.toBe(structureOf(docs))

    for (const theme of [admin, docs]) {
      const { html } = exportPage({ document: DOC, title: '회원 목록', theme })
      expect(html, structureOf(theme)).toContain(
        `data-wb-component="List" data-wb-structure="${structureOf(theme)}"`,
      )
    }
  })

  /** 재라 #5 — 테마 없는 프로젝트(`layouts.theme_id`가 NULL)에서 CSS가 무엇인가. */
  it('테마가 없으면 CSS가 구조 기본 CSS 그대로다', () => {
    const { css } = exportPage({ document: DOC, title: '회원 목록' })
    expect(css).toBe(structureBaseCss())
    expect(css.length).toBeGreaterThan(0)
  })

  it('null을 명시해도 같다', () => {
    expect(exportPage({ document: DOC, title: 'ㄱ', theme: null }).css).toBe(structureBaseCss())
  })

  /**
   * **순서가 계약이다.** 구조 기본 CSS가 먼저, 테마가 나중 — 같은 특이도에서 나중에 온
   * 규칙이 이기므로 이 순서가 곧 *"테마가 이긴다"*이다(`use-theme-css.ts`의 D5가 화면에서
   * 같은 순서로 `<style>` 둘을 건다).
   */
  it('테마가 있으면 구조 기본 CSS 뒤에 붙는다', () => {
    const theme = resolvedSystemTheme('admin')
    const { css } = exportPage({ document: DOC, title: '회원 목록', theme })
    const base = structureBaseCss()
    const compiled = compileTheme(theme)

    expect(css.indexOf(base)).toBe(0)
    expect(css.indexOf(compiled)).toBeGreaterThan(base.length - 1)
    expect(css).toBe(`${base}\n${compiled}`)
  })
})
