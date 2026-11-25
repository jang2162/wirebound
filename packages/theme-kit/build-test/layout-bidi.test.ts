/**
 * **레이아웃 틀의 메뉴 · 페이지 이름이 방향을 가둔다** — 이름은 사람이 지은 글이라 방향 제어 글자(U+202E)가 들 수 있다. 틀이 그 이름을 뒤따르는
 * 글(브레드크럼브의 구분 글자 · 다음 항목 · 제목 뒤 글)과 이어 그리면 짝 없는 U+202E 가 요소 끝을 넘어 문단 끝까지 뒤집는다 — `<a>` · `<span>`
 * 은 격리가 아니다. 이름은 `buildLayoutNav`(항목 이름) · `LayoutFrame`(페이지 이름 `title`)이 `isolateBidi` 로 가두어 내린다 — 뷰가
 * `LayoutLink` 로 두든 `item.title` 을 한 글로 이어 붙이든 같다.
 *
 * jsdom 은 글자 자리를 못 재므로 실 Chrome 에서 글자마다 `Range` 의 x 를 잰다 — 이름 뒤의 글자가 왼쪽에서 오른쪽 차례로 이름 오른쪽에 서는가.
 * 카나리아: 이름 안의 `A` · `B` 는 뒤집혀 선다(U+202E 가 실제로 먹었다).
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser } from 'playwright-core'
import { afterAll, describe, expect, it } from 'vitest'
import { buildLayoutNav, installCatalog, type LayoutNavMenu, type PageDocument } from '@wirebound/schema'
import { LayoutFrame, NO_THEME, renderDocument } from '@wirebound/renderer'
import { LayoutLink, type LayoutView, type ThemeDefinition } from '@wirebound/theme-sdk'

/** 띄워지는 첫 후보 — `field-a11y.test.ts` 와 같은 차례. */
async function launch(): Promise<{ browser: Browser | null; skipReason: string }> {
  const fromShell = process.env.EDITOR_BROWSER_PATH
  const candidates =
    fromShell !== undefined && fromShell !== ''
      ? [fromShell]
      : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()]
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      return { browser: await chromium.launch({ executablePath: candidate, headless: true }), skipReason: '' }
    } catch (error) {
      failures.push(`${candidate}: ${(error as Error).message.split('\n')[0]}`)
    }
  }
  return { browser: null, skipReason: failures.join(' · ') }
}

const launched = await launch()
if (launched.browser === null) console.warn(`[layout-bidi] Chrome 을 못 띄워 건너뛴다 — ${launched.skipReason}`)
afterAll(() => launched.browser?.close())

const RLO = String.fromCharCode(0x202e)

/** 브레드크럼브 셋(`LayoutLink` · 이름을 한 글로 이어 붙임) · 제목 뒤 글 — 뷰가 이름을 그리는 꼴마다 한 줄. */
const View: LayoutView = (props) =>
  h(
    'div',
    null,
    h(
      'nav',
      { id: 'links' },
      props.trail.flatMap((item, at) => [at > 0 ? h('span', { key: `s${at}` }, ' > ') : null, h(LayoutLink, { key: item.id, item })]),
    ),
    h('p', { id: 'joined' }, props.trail.map((item) => item.title).join(' > ')),
    h('h1', { id: 'title' }, props.title, ' 끝'),
    props.children,
  )

const THEME: ThemeDefinition = { ...NO_THEME, layouts: { subpage: View } }
const DOC: PageDocument = { version: 7, layout: 'subpage', root: { id: 'root', type: 'Page', children: [] } }

function html(menuTitle: string, pageTitle: string): string {
  installCatalog()
  const menu: LayoutNavMenu[] = [{ id: 'm1', title: menuTitle, pages: [{ id: 'p1', title: pageTitle, layout: 'subpage' }], children: [] }]
  return renderToStaticMarkup(
    h(LayoutFrame, {
      theme: THEME,
      layout: 'subpage',
      title: pageTitle,
      nav: buildLayoutNav(menu, { id: 'p1', title: pageTitle }),
      children: renderDocument(DOC),
    }),
  )
}

/** 줄마다 보이는 글자(공백 · 방향 제어 빼고)와 그 x — 글자 노드 차례. */
async function glyphs(markup: string): Promise<Record<string, { ch: string; x: number }[]>> {
  const page = await launched.browser!.newPage()
  try {
    await page.setContent(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{font:16px sans-serif}</style></head><body>${markup}</body></html>`,
    )
    return await page.evaluate(`(() => {
      const out = {}
      for (const id of ['links', 'joined', 'title']) {
        const el = document.getElementById(id)
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        const row = []
        for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
          const s = t.textContent
          for (let i = 0; i < s.length; i++) {
            if (/[\\s\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]/.test(s[i])) continue
            const r = document.createRange()
            r.setStart(t, i)
            r.setEnd(t, i + 1)
            row.push({ ch: s[i], x: Math.round(r.getBoundingClientRect().x) })
          }
        }
        out[id] = row
      }
      return out
    })()`)
  } finally {
    await page.close()
  }
}

/** 이름(`name` 의 보이는 글자 — 글자 노드 차례) 뒤의 글자들이 왼쪽 → 오른쪽 차례로 · 이름 오른쪽에 서는가. */
function after(row: { ch: string; x: number }[], name: string): { ok: boolean; seen: string } {
  const visible = [...name].filter((c) => !/[\s‮]/u.test(c))
  const start = row.findIndex((g, at) => visible.every((c, k) => row[at + k]?.ch === c))
  if (start < 0) return { ok: false, seen: `이름을 못 찾음: ${row.map((g) => g.ch).join('')}` }
  const nameRight = Math.max(...row.slice(start, start + visible.length).map((g) => g.x))
  const tail = row.slice(start + visible.length)
  const ok = tail.length > 0 && tail.every((g, at) => g.x > nameRight && (at === 0 || g.x > tail[at - 1]!.x))
  return { ok, seen: row.map((g) => `${g.ch}${g.x}`).join(' ') }
}

describe.skipIf(launched.browser === null)('레이아웃 틀 — 이름의 방향 격리(실 Chrome)', () => {
  it('메뉴 이름의 U+202E 가 뒤의 구분 글자 · 다음 항목을 안 뒤집는다 — LayoutLink 로 두든 한 글로 이어 붙이든', async () => {
    const menuTitle = `주문${RLO}AB`
    const rows = await glyphs(html(menuTitle, '목록XY'))
    for (const id of ['links', 'joined'] as const) {
      const row = rows[id]!
      // 카나리아 — 이름 안은 뒤집혔다(B 가 A 왼쪽).
      const a = row.find((g) => g.ch === 'A')!
      const b = row.find((g) => g.ch === 'B')!
      expect(b.x, `${id}: ${row.map((g) => g.ch + g.x).join(' ')}`).toBeLessThan(a.x)
      const result = after(row, '주문AB')
      expect(result.ok, `${id}: ${result.seen}`).toBe(true)
    }
  })

  it('페이지 이름의 U+202E 가 제목 뒤 글을 안 뒤집는다', async () => {
    const rows = await glyphs(html('주문', `목록${RLO}XY`))
    const result = after(rows.title!, '목록XY')
    expect(result.ok, result.seen).toBe(true)
  })

  it('방향 제어 글자가 없는 이름은 그대로 — 글자가 한 글자도 안 바뀐다', () => {
    const markup = html('주문 관리', '주문 목록')
    expect(markup).not.toMatch(/[⁦-⁩]/u)
    expect(markup).toContain('주문 관리 &gt; 주문 목록')
  })
})
