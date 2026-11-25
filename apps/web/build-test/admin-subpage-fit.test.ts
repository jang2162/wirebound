/**
 * **기본테마 서브페이지 틀 — 긴 이름 · 많은 메뉴 · 짧은 페이지**(실 Chrome). `admin-subpage.test.ts` 와 같은 정적 판(`LayoutFrame` + 기본테마를 SSR 로
 * 그려 SDK 기본 뷰 · 테마 · 토큰 시트 차례로 싣는다)에서 그 파일이 안 세우는 판을 잰다.
 *
 * - 브레드크럼브 · 제목 — 끊을 자리 없는 85 자 이름이 본문 칸 안에서 꺾인다. 글자 노드 `Range` 의 오른끝을 본문 칸 끝 · 창 끝과 견준다(요소 상자는
 *   제자리에 선 채 글자만 넘친다).
 * - GNB — 메뉴가 한 줄을 넘치면 줄을 바꿔 다 보인다. 창 1280 · 1024 · 720(PPTX 캡처 폭) · 390 × 메뉴 7 · 12 · 긴 이름, 고른 메뉴는 늘 끝이다. 링크마다
 *   가운데의 `elementFromPoint` 가 그 링크다(잘리거나 덮이거나 창 밖이면 아니다).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser, type Page } from 'playwright-core'
import { afterAll, describe, expect, it } from 'vitest'
import { buildLayoutNav, installCatalog, type LayoutNavMenu, type PageDocument } from '@wirebound/schema'
import { LayoutFrame, renderDocument } from '@wirebound/renderer'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { tokensCss } from '@wirebound/themes'
import { ADMIN_V0 } from '@wirebound/system-theme-admin'

/** 띄워지는 첫 후보 — `admin-subpage.test.ts` 와 같은 차례. */
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
if (launched.browser === null) console.warn(`[admin-subpage-fit] Chrome 을 못 띄워 건너뛴다 — ${launched.skipReason}`)
afterAll(() => launched.browser?.close())

const THEME_CSS = readFileSync(fileURLToPath(new URL('../../../system-themes/admin/src/theme.css', import.meta.url)), 'utf8')

/** 끊을 자리 없는 영문 85 자 — 하이픈이 없어야 한다(있으면 그 뒤에서 꺾여 넘침이 안 선다). */
const LONG = 'Administrationconsolesettingsandpermissionsoverviewforallregisteredorganizationunits'

const page = (id: string, title: string) => ({ id, title, layout: 'subpage' as const })

/** 브레드크럼브 판 — 뿌리 · 하위 메뉴 · 지금 페이지가 다 긴 이름이다. */
const LONG_MENU: LayoutNavMenu[] = [
  {
    id: 'm-root',
    title: LONG,
    pages: [page('p-banner', '배너관리')],
    children: [{ id: 'm-sub', title: `${LONG}둘`, pages: [page('p-long', `${LONG}${LONG}`)], children: [] }],
  },
  { id: 'm-users', title: '사용자 관리', pages: [page('p-u', '사용자')], children: [] },
]

const COMMON7 = ['홈페이지관리', '사용자관리', '교육운영관리', '과정관리', '통계', '게시판관리', '시스템관리']
const MORE5 = ['권한관리', '코드관리', '접속로그관리', '설문관리', '알림관리']

/** 뿌리 메뉴마다 페이지 하나 — GNB 항목이 그 수만큼 선다. 지금 페이지는 마지막 메뉴의 것. */
function gnbMenu(names: readonly string[]): { menu: LayoutNavMenu[]; current: { id: string; title: string } } {
  const menu = names.map((name, at) => ({ id: `m${at}`, title: name, pages: [page(`p${at}`, `${name} 목록`)], children: [] }))
  const last = names.length - 1
  return { menu, current: { id: `p${last}`, title: `${names[last]} 목록` } }
}

const SHORT_DOC: PageDocument = {
  version: 7,
  layout: 'subpage',
  root: {
    id: 'root',
    type: 'Page',
    children: [{ id: 'card', type: 'Card', props: { title: '결과' }, children: [{ id: 't', type: 'Text', props: { content: '본문' } }] }],
  },
}

interface Opt {
  menu?: LayoutNavMenu[]
  current?: { id: string; title: string }
  doc?: PageDocument
  tokens?: Record<string, string>
}

function html(o: Opt = {}): string {
  installCatalog()
  const menu = o.menu ?? LONG_MENU
  const current = o.current ?? { id: 'p-long', title: `${LONG}${LONG}` }
  const markup = renderToStaticMarkup(
    h(LayoutFrame, {
      theme: ADMIN_V0,
      layout: 'subpage',
      title: current.title,
      nav: buildLayoutNav(menu, current),
      children: renderDocument(o.doc ?? SHORT_DOC, { theme: ADMIN_V0 }),
    }),
  )
  const tokens = tokensCss(ADMIN_V0.manifest, o.tokens ?? {}).css
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${defaultViewsCss()}</style><style>${THEME_CSS}</style><style>${tokens}</style><style>body{margin:0}</style></head><body>${markup}</body></html>`
}

async function open(width: number, o: Opt = {}, height = 900): Promise<Page> {
  const tab = await launched.browser!.newPage({ viewport: { width, height } })
  await tab.setContent(html(o))
  return tab
}

const FRAME = '[data-wb-layout="subpage"] > [data-wb-part="frame"]'

describe.skipIf(launched.browser === null)('기본테마 서브페이지 틀 — 긴 이름 · 많은 메뉴 · 짧은 페이지(실 Chrome)', () => {
  it.each([390, 720, 1280])('브레드크럼브 · 제목 — 끊을 자리 없는 긴 이름이 본문 칸 안에서 꺾인다(창 %ipx)', async (width) => {
    const tab = await open(width)
    try {
      const got = await tab.evaluate((frame) => {
        const content = document.querySelector(`${frame} > [data-wb-part="body"] > [data-wb-part="content"]`)!
        const edge = Math.min(window.innerWidth, content.getBoundingClientRect().right) + 0.5
        const scope = [
          content.querySelector(':scope > [data-wb-part="breadcrumb"]')!,
          content.querySelector(':scope > [data-wb-part="title"]')!,
        ]
        const past: string[] = []
        let long = 0
        let lines = 0
        for (const region of scope) {
          const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
          for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
            const text = t.textContent ?? ''
            if (!text.includes('Administrationconsole')) continue
            long += 1
            const range = document.createRange()
            range.selectNodeContents(t)
            const rects = [...range.getClientRects()]
            lines = Math.max(lines, new Set(rects.map((r) => Math.round(r.top))).size)
            const right = Math.max(...rects.map((r) => r.right), 0)
            if (right > edge)
              past.push(`${t.parentElement?.getAttribute('data-wb-part') ?? '?'} → ${Math.round(right)} (끝 ${Math.round(edge)})`)
          }
        }
        return { doc: document.documentElement.scrollWidth <= window.innerWidth, past, long, lines }
      }, FRAME)
      // 카나리아 — 긴 이름 넷(뿌리 · 하위 메뉴 · 지금 페이지 · 제목)을 쟀고, 지금 페이지 이름(170 자)은 어느 창에서도 한 줄에 못 든다.
      expect(got.long).toBe(4)
      expect(got.lines).toBeGreaterThan(1)
      expect({ doc: got.doc, past: got.past }).toEqual({ doc: true, past: [] })
    } finally {
      await tab.close()
    }
  })

  const GNB_CASES: [string, readonly string[]][] = [
    ['흔한 메뉴 7', COMMON7],
    ['메뉴 12', [...COMMON7, ...MORE5]],
    ['긴 이름', [...COMMON7.slice(0, 3), LONG, ...COMMON7.slice(3)]],
  ]
  const GNB_GRID = [1280, 1024, 720, 390].flatMap((width) => GNB_CASES.map(([name, names]) => [width, name, names] as const))

  it.each(GNB_GRID)('GNB — 창 %ipx · %s · 고른 메뉴가 끝 — 모든 메뉴 항목이 보인다', async (width, _name, names) => {
    const { menu, current } = gnbMenu(names)
    const tab = await open(width, { menu, current })
    try {
      const got = await tab.evaluate((frame) => {
        const gnb = document.querySelector(`${frame} > [data-wb-part="gnb"]`)!
        const links = [...gnb.querySelectorAll('[data-wb-part="gnbLink"]')]
        const hidden: string[] = []
        for (const link of links) {
          const r = link.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          const hit = x >= 0 && x < window.innerWidth && y >= 0 && y < window.innerHeight ? document.elementFromPoint(x, y) : null
          if (hit === null || hit.closest('[data-wb-part="gnbLink"]') !== link) hidden.push((link.textContent ?? '').slice(0, 12))
        }
        const chosen = gnb.querySelector('[data-wb-part="gnbLink"][data-wb-current="true"]')
        const g = gnb.getBoundingClientRect()
        const c = chosen?.getBoundingClientRect()
        return {
          links: links.length,
          chosenLast: chosen !== null && chosen === links[links.length - 1],
          // 고른 막대(`::after` · 링크 아래 2px)가 그 링크 안 · 머리 안에 선다.
          barInside: c !== undefined && c.bottom <= g.bottom + 0.5,
          gnbHeight: g.height,
          hidden,
          doc: document.documentElement.scrollWidth <= window.innerWidth,
        }
      }, FRAME)
      expect(got.links).toBe(names.length)
      expect(got.chosenLast).toBe(true)
      expect(got.barInside).toBe(true)
      expect(got.gnbHeight).toBeGreaterThanOrEqual(60)
      expect({ hidden: got.hidden, doc: got.doc }).toEqual({ hidden: [], doc: true })
    } finally {
      await tab.close()
    }
  })

  it('GNB — 좁은 창(390)에서는 메뉴 줄이 로고 · 사용자 칸 아래 폭 전체를 써 흔한 메뉴 7 이 두 줄에 든다', async () => {
    const { menu, current } = gnbMenu(COMMON7)
    const tab = await open(390, { menu, current })
    try {
      const rows = await tab.evaluate(
        (frame) =>
          new Set(
            [...document.querySelectorAll(`${frame} [data-wb-part="gnbLink"]`)].map((link) => Math.round(link.getBoundingClientRect().top)),
          ).size,
        FRAME,
      )
      expect(rows).toBe(2)
    } finally {
      await tab.close()
    }
  })
})
