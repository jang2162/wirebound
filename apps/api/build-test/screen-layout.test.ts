/**
 * **레이아웃 틀을 단 장의 PPTX 그림과 번들 화면** — 진짜 Chromium 으로 잰다(`screen-chromium.test.ts` 와 같은 그리는 자 · 같은 번들 길).
 *
 * | 판 | 무엇을 잰다 |
 * |---|---|
 * | 서브페이지 장 | 그림 폭이 캡처 폭 720 그대로다(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「정한 것 — 레이아웃 갈래」 3) — 틀(GNB 60px)은 다 켠 채 함께 찍혀 높이만 그만큼 는다 |
 * | 팝업 장 — PPTX | 찍는 판(`html[data-wb-capture]`)은 막을 안 그린다 — 그림에 막 색 화소가 없다(`packages/theme-sdk/src/capture.ts`) |
 * | 팝업 장 — 번들 화면 | 같은 장을 `file://` 로 열면 막이 뷰포트 폭에 깔리고 상자가 가운데 위(여백 24px)에 선다 |
 *
 * 테마는 글자로 짓는 작은 테마(`inlineTheme`)다 — 서브페이지 레이아웃 뷰가 GNB(60px · 칠한 띠) · LNB(240px)를 그린다. 기본테마 2.1.0 은 레이아웃
 * 뷰가 없어 서브페이지가 내용만이다. 번들 런타임은 저장소 빌드가 지은 것이다(`readExportRuntime`) — `pnpm build` 뒤에 잰다.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { chromium } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import { chromiumScreenRenderer } from '../src/services/screen-render-chromium'
import { readApiEnvFile } from '../test/test-database-url'
import { bundled, countColor, inlineTheme, jobOf, type Entry } from './screen-jobs'

installCatalog()

/** 서버가 띄우는 그 브라우저(`screen-chromium.test.ts` 의 `screenChromiumPath` 와 같은 차례). */
const EXECUTABLE = (() => {
  const value = process.env.SCREEN_CHROMIUM_PATH ?? readApiEnvFile().SCREEN_CHROMIUM_PATH
  return value === undefined || value === '' ? undefined : value
})()
const LAUNCH = EXECUTABLE === undefined ? {} : { executablePath: EXECUTABLE }

async function launches(): Promise<boolean> {
  try {
    await (await chromium.launch(LAUNCH)).close()
    return true
  } catch {
    return false
  }
}
const 있다 = await launches()
if (!있다) {
  // eslint-disable-next-line no-console
  console.log('[screen-layout] Chromium 을 띄우지 못해 건너뛴다 — `screen-chromium.test.ts` 머리말의 «넣는 법»')
}

/** GNB 띠 · LNB 칸의 색 — 그림에서 그 화소를 센다. 테마 CSS 밖에서는 안 쓰는 색이다. */
const GNB_RGB: [number, number, number] = [12, 34, 156]
const LNB_RGB: [number, number, number] = [210, 230, 40]
/** 팝업 막의 색(`--wb-popup-backdrop`) — 찍는 판에서는 0 화소여야 한다. */
const SCRIM_RGB: [number, number, number] = [200, 10, 150]

const LAYOUT_CSS = `
:root { --wb-popup-backdrop: rgb(${SCRIM_RGB.join(', ')}); }
html, body { margin: 0; }
[data-probe="frame"] { display: grid; grid-template-columns: 240px minmax(0, 1fr); grid-template-rows: 60px auto; }
[data-probe="gnb"] { grid-column: 1 / -1; height: 60px; background: rgb(${GNB_RGB.join(', ')}); }
[data-probe="lnb"] { background: rgb(${LNB_RGB.join(', ')}); }
[data-probe="body"] { min-width: 0; }
`

/** 서브페이지 레이아웃 뷰 — GNB · LNB 를 `LayoutRegion` 으로(번들 · PPTX 는 늘 다 켠다), 내용을 오른쪽 칸에. */
const SUBPAGE_VIEW = `{ subpage: (props) => {
  const h = rt.react.createElement
  return h('div', { 'data-probe': 'frame' },
    h(rt.sdk.LayoutRegion, { id: 'gnb', 'data-probe': 'gnb' }),
    h(rt.sdk.LayoutRegion, { id: 'lnb', 'data-probe': 'lnb' }),
    h('div', { 'data-probe': 'body' }, props.children))
} }`

function theme() {
  return inlineTheme({
    id: 'layout-probe',
    themeCss: LAYOUT_CSS,
    layouts: SUBPAGE_VIEW,
    manifestLayouts: {
      subpage: {
        regions: [
          { id: 'gnb', label: 'GNB' },
          { id: 'lnb', label: 'LNB' },
        ],
      },
    },
  })
}

function page(layout: 'blank' | 'subpage'): PageDocument {
  return {
    version: 7,
    layout,
    root: {
      id: 'n_root',
      type: 'Page',
      children: Array.from({ length: 40 }, (_unused, index) => ({
        id: `n_text_${index}`,
        type: 'Text',
        props: { content: `${index}번째 줄 — 한글 본문` },
      })),
    },
  } as PageDocument
}

function popup(): PageDocument {
  return {
    version: 7,
    layout: 'popup',
    root: {
      id: 'n_popup',
      type: 'Popup',
      props: { title: '사용자 검색', size: 'small' },
      children: [{ id: 'n_popup_text', type: 'Text', props: { content: '이름으로 찾는다' } }],
    },
  } as PageDocument
}

/** 그림 화소 ÷ CSS px. */
const SCALE = 2

async function draw(...entries: Entry[]) {
  const batch = await chromiumScreenRenderer(LAUNCH).render(jobOf(...entries))
  return batch.results.map((result) => {
    if (!result.ok) throw new Error(`그리지 못했다: ${result.reason}`)
    return result
  })
}

describe.skipIf(!있다)('레이아웃 틀을 단 장의 PPTX 그림', () => {
  it('서브페이지 장은 캡처 폭 720 그대로 찍히고 틀(GNB 60px)만큼 높이가 는다', async () => {
    const [sub, blank] = await draw(bundled('서브페이지', page('subpage'), theme()), bundled('빈', page('blank'), theme()))
    // 그림은 CSS px × 2 다(`screen-render-chromium.ts` 의 `DEVICE_SCALE_FACTOR`).
    expect(sub!.width).toBe(720 * SCALE)
    expect(blank!.width).toBe(720 * SCALE)
    // GNB 띠가 그림 폭 전체 × 60px 로 찍혔다 — 다 켠 틀이 함께 찍혔고 폭이 720 이다.
    expect(countColor(sub!.bytes, GNB_RGB)).toBe(720 * SCALE * 60 * SCALE)
    expect(countColor(sub!.bytes, LNB_RGB)).toBeGreaterThan(0)
    expect(countColor(blank!.bytes, GNB_RGB)).toBe(0)
    // 줄 40 개라 두 장 다 뷰포트(552px)보다 길다 — 높이 차는 틀이 민 만큼이다.
    expect(blank!.height).toBeGreaterThan(552 * SCALE)
    expect(sub!.height).toBeGreaterThanOrEqual(blank!.height + 60 * SCALE)
  }, 60_000)

  it('팝업 장은 막 없이 찍힌다 — 그림에 막 색 화소가 없다', async () => {
    const [shot] = await draw(bundled('팝업', popup(), theme()))
    expect(shot!.width).toBeGreaterThan(0)
    expect(countColor(shot!.bytes, SCRIM_RGB)).toBe(0)
  }, 60_000)
})

describe.skipIf(!있다)('팝업 장의 번들 화면', () => {
  it('file:// 로 연 장은 막이 뷰포트 폭에 깔리고 상자가 가운데 위(여백 24px)에 선다', async () => {
    const entry = bundled('팝업', popup(), theme())
    const dir = mkdtempSync(join(tmpdir(), 'wb-screen-layout-'))
    const browser = await chromium.launch(LAUNCH)
    try {
      for (const [path, content] of entry.files) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), content)
      }
      const tab = await browser.newPage({ viewport: { width: 1000, height: 700 } })
      await tab.goto(`${pathToFileURL(join(dir, entry.path)).href}#wb-screen`)
      await tab.locator('html[data-wb-ready]').waitFor({ state: 'attached' })
      const seen = await tab.evaluate(() => {
        const frame = document.querySelector('[data-wb-layout="popup"]')!
        const box = frame.querySelector('[data-wb-component="Popup"]')!.getBoundingClientRect()
        const area = frame.getBoundingClientRect()
        return {
          failed: document.documentElement.getAttribute('data-wb-failed'),
          scrim: getComputedStyle(frame).backgroundColor,
          frameWidth: Math.round(area.width),
          viewport: window.innerWidth,
          top: Math.round(box.top - area.top),
          centerGap: Math.round(box.left - area.left - (area.right - box.right)),
          boxWidth: Math.round(box.width),
        }
      })
      expect(seen.failed).toBeNull()
      expect(seen.scrim).toBe(`rgb(${SCRIM_RGB.join(', ')})`)
      expect(seen.frameWidth).toBe(seen.viewport)
      expect(seen.top).toBe(24)
      expect(Math.abs(seen.centerGap)).toBeLessThanOrEqual(1)
      // 카나리아 — 상자가 뷰포트보다 좁아야 «가운데» 가 무엇을 잰다.
      expect(seen.boxWidth).toBeLessThan(seen.viewport - 48)
    } finally {
      await browser.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
