/**
 * **기본테마 서브페이지 틀 — 치수와 넘침**(실 Chrome). 틀(`system-themes/admin/src/views/layout-subpage.tsx` · `theme.css` «서브페이지 틀»)을
 * `LayoutFrame` 으로 그린 정적 판을 창 폭마다 연다 — 캔버스 · 번들 · 캡처가 같은 틀을 같은 CSS 로 그린다(이 판은 그 CSS 를 그 차례로 싣는다: SDK 기본
 * 뷰 · 테마 · 토큰 시트). jsdom 판(`system-themes/admin/test/layout-subpage.test.tsx`)이 못 재는 자리 · 크기를 잰다.
 *
 * - 치수(창 1280) — GNB 높이 60 · LNB 폭 240 · 본문 패딩 24/28 · 브레드크럼브 12.5px · 페이지 제목 22px/700(lms-skala 관리자 셸).
 * - 넘침(창 390 · PPTX 캡처 폭 720 — `apps/api/src/services/screen-render-chromium.ts` 의 뷰포트) — 문서 `scrollWidth` 와 글자 노드 `Range` 의
 *   오른끝(요소 상자 안에 선 채 글자만 넘치는 판 · `overflow: hidden` 이 잘라 숨긴 판을 센다). LNB 안 글은 LNB 상자 끝과 견준다. 그리드 표의 `scroll` 조각은 일부러 가로로 구르는 상자라 그 안의 글은
 *   빼고 상자째 창 안인지 본다. GNB 메뉴 줄은 넘치면 줄을 바꿔 그 글도 창 끝과 견준다. 표본 이름은 끊을 자리 없는 영문 낱말이다(Chrome 은 띄어 쓰지 않은 한글도 꺾는다).
 *
 * `?raw` CSS 는 이 프로젝트에서 빈 글자라 테마 CSS 를 파일로 읽고 길이 카나리아를 둔다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, type Browser, type Page } from 'playwright-core'
import { afterAll, describe, expect, it } from 'vitest'
import { buildLayoutNav, installCatalog, type LayoutNavMenu, type PageDocument, type WbNode } from '@wirebound/schema'
import { LayoutFrame, renderDocument } from '@wirebound/renderer'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { tokensCss } from '@wirebound/themes'
import { ADMIN_V0 } from '@wirebound/system-theme-admin'

/** 띄워지는 첫 후보 — `packages/theme-kit/build-test/layout-bidi.test.ts` 와 같은 차례. */
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
if (launched.browser === null) console.warn(`[admin-subpage] Chrome 을 못 띄워 건너뛴다 — ${launched.skipReason}`)
afterAll(() => launched.browser?.close())

const THEME_CSS = readFileSync(fileURLToPath(new URL('../../../system-themes/admin/src/theme.css', import.meta.url)), 'utf8')

/** 끊을 자리 없는 긴 영문 이름 — LNB 머리 · 항목 · 브레드크럼브 · 제목에 든다. */
const LONG = 'Administrationconsolesettingsandpermissionsoverview'

const MENU: LayoutNavMenu[] = [
  {
    id: 'm-root',
    title: `홈페이지 관리 ${LONG}`,
    pages: [{ id: 'p-banner', title: '배너관리', layout: 'subpage' }],
    children: [
      {
        id: 'm-board',
        title: '게시판관리',
        pages: [
          { id: 'p-list', title: LONG, layout: 'subpage' },
          { id: 'p-new', title: '게시물 등록', layout: 'subpage' },
        ],
        children: [{ id: 'm-deep', title: '답글', pages: [{ id: 'p-deep', title: `답글 ${LONG}`, layout: 'subpage' }], children: [] }],
      },
    ],
  },
  { id: 'm-users', title: '사용자 관리', pages: [{ id: 'p-u', title: '사용자', layout: 'subpage' }], children: [] },
  { id: 'm-edu', title: '교육운영', pages: [{ id: 'p-e', title: '과정', layout: 'subpage' }], children: [] },
  { id: 'm-sys', title: '시스템', pages: [{ id: 'p-s', title: '설정', layout: 'subpage' }], children: [] },
]

const field = (id: string, label: string): WbNode => ({
  id,
  type: 'Field',
  props: { label },
  children: [{ id: `${id}-i`, type: 'Input', props: {} }],
})
const column = (id: string, label: string): WbNode => ({
  id,
  type: 'GridColumn',
  props: { label },
  children: [{ id: `${id}-t`, type: 'Text', props: { content: '2026-07-04' } }],
})

/** 관리자 목록 화면 — 조회 폼(2열) · 결과 그리드(열 여섯) · 등록 폼 표. */
const DOC: PageDocument = {
  version: 7,
  layout: 'subpage',
  root: {
    id: 'root',
    type: 'Page',
    children: [
      {
        id: 'search',
        type: 'SearchForm',
        props: { columns: 2 },
        children: [field('f1', '제목'), field('f2', '작성자'), field('f3', '기간')],
        zones: { actions: [{ id: 'go', type: 'Button', variant: 'primary', props: { label: '검색' } }] },
      },
      {
        id: 'grid',
        type: 'DataGrid',
        props: { select: 'check' },
        children: ['번호', '제목', '작성자', '등록일', '조회수', '상태'].map((label, at) => column(`c${at}`, label)),
        zones: { rows: [{ id: 'r', type: 'GridRow', props: { repeat: 3 } }] },
      },
      {
        id: 'form',
        type: 'FormTable',
        props: { columns: 2 },
        children: [field('e1', '이름'), field('e2', '연락처'), field('e3', '메모')],
      },
    ],
  },
}

function html(): string {
  installCatalog()
  const markup = renderToStaticMarkup(
    h(LayoutFrame, {
      theme: ADMIN_V0,
      layout: 'subpage',
      title: LONG,
      nav: buildLayoutNav(MENU, { id: 'p-list', title: LONG }),
      children: renderDocument(DOC, { theme: ADMIN_V0 }),
    }),
  )
  const tokens = tokensCss(ADMIN_V0.manifest).css
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${defaultViewsCss()}</style><style>${THEME_CSS}</style><style>${tokens}</style><style>body{margin:0}</style></head><body>${markup}</body></html>`
}

async function open(width: number): Promise<Page> {
  const page = await launched.browser!.newPage({ viewport: { width, height: 900 } })
  await page.setContent(html())
  return page
}

const FRAME = '[data-wb-layout="subpage"] > [data-wb-part="frame"]'

describe.skipIf(launched.browser === null)('기본테마 서브페이지 틀 — 치수 · 넘침(실 Chrome)', () => {
  it('카나리아 — 테마 CSS 를 읽었고 틀 · 영역 넷 · 내용이 선다', async () => {
    expect(THEME_CSS.length).toBeGreaterThan(10_000)
    expect(THEME_CSS).toContain('[data-wb-layout="subpage"]')
    const page = await open(1280)
    try {
      const got = await page.evaluate(
        (frame) => ({
          frame: document.querySelectorAll(frame).length,
          regions: [...document.querySelectorAll('[data-wb-layout-region]')].map((el) => el.getAttribute('data-wb-layout-region')),
          root: document.querySelectorAll('[data-wb-layout-content] > [data-wb-id="root"]').length,
        }),
        FRAME,
      )
      expect(got).toEqual({ frame: 1, regions: ['gnb', 'lnb', 'breadcrumb', 'title'], root: 1 })
    } finally {
      await page.close()
    }
  })

  it('치수(창 1280) — GNB 60 · LNB 240 · 본문 패딩 24/28 · 브레드크럼브 12.5px · 제목 22px/700 · 고른 GNB 막대 3px', async () => {
    const page = await open(1280)
    try {
      const got = await page.evaluate((frame) => {
        const at = (selector: string) => document.querySelector(`${frame} ${selector}`) as HTMLElement
        const content = getComputedStyle(at('> [data-wb-part="body"] > [data-wb-part="content"]'))
        const crumb = getComputedStyle(at('> [data-wb-part="body"] > [data-wb-part="content"] > [data-wb-part="breadcrumb"]'))
        const title = getComputedStyle(at('> [data-wb-part="body"] > [data-wb-part="content"] > [data-wb-part="title"]'))
        const bar = getComputedStyle(at('[data-wb-part="gnbLink"][data-wb-current="true"]'), '::after')
        return {
          gnb: at('> [data-wb-part="gnb"]').getBoundingClientRect().height,
          lnb: at('> [data-wb-part="body"] > [data-wb-part="lnb"]').getBoundingClientRect().width,
          padding: [content.paddingTop, content.paddingRight, content.paddingLeft],
          crumb: crumb.fontSize,
          title: [title.fontSize, title.fontWeight],
          bar: [bar.height, bar.bottom],
        }
      }, FRAME)
      expect(got).toEqual({
        gnb: 60,
        lnb: 240,
        padding: ['24px', '28px', '28px'],
        crumb: '12.5px',
        title: ['22px', '700'],
        bar: ['3px', '2px'],
      })
    } finally {
      await page.close()
    }
  })

  it.each([390, 720])('넘침 0 — 창 %ipx · 문서 폭 · 글자 노드 오른끝 · 구르는 상자(그리드 표)째', async (width) => {
    const page = await open(width)
    try {
      const got = await page.evaluate(() => {
        const limit = window.innerWidth + 0.5
        // LNB 안 글은 LNB 상자 오른끝과 견준다 — LNB 를 넘친 글은 본문 칸 위로 가 창 안에 남는다(창 끝만 재면 못 본다).
        const lnb = document.querySelector('[data-wb-part="lnb"]')!
        const lnbRight = lnb.getBoundingClientRect().right + 0.5
        /** 가로로 구르는 가장 가까운 조상(그리드 표의 `scroll` 조각) — 그 안의 글은 일부러 굴러 창 밖에 설 수 있다. */
        const scrollerOf = (node: Node): Element | null => {
          for (let el = node.parentElement; el !== null; el = el.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(el).overflowX)) return el
          }
          return null
        }
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let measured = 0
        let long = 0
        const scrollers = new Set<Element>()
        const past: string[] = []
        for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
          const textOf = t.textContent ?? ''
          if (textOf.trim() === '') continue
          measured += 1
          if (textOf.includes('Administrationconsole')) long += 1
          const scroller = scrollerOf(t)
          if (scroller !== null) {
            scrollers.add(scroller)
            continue
          }
          const range = document.createRange()
          range.selectNodeContents(t)
          const right = Math.max(...[...range.getClientRects()].map((r) => r.right), 0)
          const edge = lnb.contains(t) ? lnbRight : limit
          if (right > edge) past.push(`${textOf.slice(0, 24)} → ${Math.round(right)} (끝 ${Math.round(edge)})`)
        }
        for (const scroller of scrollers) {
          const right = scroller.getBoundingClientRect().right
          if (right > limit) past.push(`구르는 상자 ${scroller.getAttribute('data-wb-part') ?? scroller.tagName} → ${Math.round(right)}`)
        }
        return {
          doc: document.documentElement.scrollWidth <= window.innerWidth,
          past,
          measured,
          long,
          scrollers: [...scrollers].map((el) => el.getAttribute('data-wb-part')).sort(),
        }
      })
      // 카나리아 — 글자 노드를 넉넉히 쟀고 긴 이름(LNB 머리 · 항목 · 브레드크럼브 · 제목 · 넷째 단)이 다 들었고, 구르는 상자는 그리드 표 하나다(GNB 메뉴 줄은 줄을 바꿔 글이 창 안에 선다).
      expect(got.measured).toBeGreaterThan(40)
      expect(got.long).toBeGreaterThanOrEqual(5)
      expect(got.scrollers).toEqual(['scroll'])
      expect({ doc: got.doc, past: got.past }).toEqual({ doc: true, past: [] })
    } finally {
      await page.close()
    }
  })
})
