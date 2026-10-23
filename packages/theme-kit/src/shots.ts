import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { GALLERY_SAMPLES, PLACEHOLDER_SET_PROPS, PLACEHOLDER_SET_SAMPLE } from '@wirebound/theme-gallery'
import { loadProject } from './config'
import { startDev } from './dev'

export interface ShotOverflow {
  /** 넘친 요소가 든 갤러리 칸(`type/variant/표본 id`). 칸 밖이면 `null`. */
  item: string | null
  /** 요소를 알아볼 꼴 — `div.sample-card[data-wb-component=Card]`. */
  element: string
  left: number
  right: number
}

export interface ShotWidthReport {
  width: number
  /**
   * 출력 디렉터리 안의 PNG 이름 — 위에서 아래 차례. 페이지가 한 구간(`SHOT_SEGMENT_PX`)보다 길면 여럿이다(`<id>-<폭>-1.png` …), 아니면
   * `<id>-<폭>.png` 하나.
   */
  pngs: string[]
  /** 문서 전체 높이(px) — PNG 높이의 합과 같다. */
  pageHeight: number
  /** `console.error` · 잡히지 않은 예외. */
  consoleErrors: string[]
  wbErrors: { item: string | null; message: string }[]
  /**
   * 창 폭을 넘는 요소 — 넘친 조상이 이미 든 것은 뺀다(뿌리만). 스크롤 · 잘림(`overflow-x` 가 `visible` 이 아닌) 조상 안에 갇힌 것도 뺀다.
   * 그리고 **창이나 잘라 숨기는 조상 밖으로 나간 글자 노드**(`element` 가 `… "글자"` 꼴) — 끊을 자리 없는 낱말은 제 요소 상자 안에 선 채
   * 글자만 넘치고, `overflow: hidden` 조상은 그 글자를 잘라 숨겨 요소 상자로는 안 보인다.
   */
  overflow: ShotOverflow[]
  pageScrollWidth: number
  pageClientWidth: number
  /**
   * 갤러리 프레임의 `document.compatMode`. 번들 · PPTX 는 표준 모드(`CSS1Compat`)라 다른 모드면 이 판의 레이아웃이 그 판과 갈린다 — 그때
   * `shotsProblems` 가 적는다.
   */
  compatMode: string
  /**
   * **사람이 정한 그리기 값을 테마가 안 따른 자리** — 그 자리표시자 표본(`PLACEHOLDER_SET_PROPS`)의 계산된 값이 정한 값과 다른 속성. 테마 CSS 가
   * `--wb-node-placeholder-*` 변수를 안 읽고 덮으면 선다. 표본을 하나도 못 찾았으면 `item` 이 `null` 인 한 줄이다(자가 아무것도 안 잰 판).
   */
  placeholder: { item: string | null; property: string; want: string; got: string }[]
}

export interface ShotsReport {
  theme: { id: string; version: string }
  widths: ShotWidthReport[]
}

/** Chromium 을 못 띄웠다 — 후보마다 까닭을 든다. 아무것도 쓰지 않았다. */
export class ShotsBrowserError extends Error {
  constructor(failures: readonly string[]) {
    super(
      `Chromium 을 띄우지 못했습니다 — ${failures.join(' · ')}\n` +
        '  --browser <경로> 로 Chrome · Chromium 실행 파일을 주거나 `npx playwright install chromium` 으로 받습니다',
    )
    this.name = 'ShotsBrowserError'
  }
}

export const DEFAULT_SHOT_WIDTHS: readonly number[] = [390, 1280]

/**
 * PNG 한 장의 높이 한도. **Chromium 의 전체 페이지 캡처는 16384px 부근을 넘으면 크기는 맞게 내고 내용을 틀리게 낸다** — 그 아래를 되풀이해
 * 그려 오류가 없다. 다시 재는 법: 높이 40000px 의 세로 기울기 한 장을 `fullPage` 로 찍으면 맨 아래 띠의 색이 안 나온다 · 이 값으로 `clip`
 * 을 잘라 찍으면 구간마다 위아래 색이 이어진다.
 */
export const SHOT_SEGMENT_PX = 8000

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/**
 * `--browser` 가 있으면 그것만, 없으면 설치된 Chrome(macOS) → playwright-core 캐시 차례. **띄워 보고** 정한다 — 경로가 있다는 것은 뜨는 것이
 * 아니다(`CLAUDE.md` «건너뛸 전제는 실물로»와 같은 까닭).
 */
async function launch(browserPath: string | undefined): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  const candidates: (string | undefined)[] =
    browserPath !== undefined ? [browserPath] : [...(existsSync(MAC_CHROME) ? [MAC_CHROME] : []), undefined]
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      return await chromium.launch({ executablePath: candidate, headless: true })
    } catch (error) {
      failures.push(`${candidate ?? 'playwright-core 캐시'}: ${(error as Error).message.split('\n')[0]}`)
    }
  }
  throw new ShotsBrowserError(failures)
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => done(port))
    })
  })
}

/** 갤러리 칸이 서고 그 수가 두 번 잰 사이에 안 바뀔 때까지 — vite 가 첫 적재에 의존을 다시 묶으면 프레임을 한 번 새로 싣는다. */
async function galleryReady(page: Page): Promise<void> {
  const deadline = Date.now() + 60_000
  let last = -1
  for (;;) {
    const count = await page.evaluate(() => document.querySelectorAll('[data-wb-gallery-item]').length).catch(() => 0)
    if (count > 0 && count === last) break
    last = count
    if (Date.now() > deadline) throw new Error('갤러리가 60s 안에 서지 않았습니다')
    await page.waitForTimeout(300)
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

/** `#rrggbb` → Chromium 의 계산 값 꼴(`rgb(r, g, b)`). */
function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** 정한 값 표본의 노드 id 와, 계산 값이 그대로 나와야 할 속성 → 값. 길이는 `px` 정수다(확대 없는 창). */
export function placeholderExpectations(): { nodeId: string; want: Record<string, string> } {
  const sample = GALLERY_SAMPLES.Placeholder?.find((entry) => entry.label === PLACEHOLDER_SET_SAMPLE)
  if (sample === undefined) throw new Error('갤러리에 정한 값 자리표시자 표본이 없습니다')
  const p = PLACEHOLDER_SET_PROPS
  return {
    nodeId: sample.node.id,
    want: {
      'background-color': rgb(p.background),
      'border-top-color': rgb(p.borderColor),
      'border-top-style': p.border,
      color: rgb(p.color),
      'border-top-left-radius': `${p.radius}px`,
      'font-size': `${p.fontSize}px`,
      'padding-top': `${p.padding}px`,
    },
  }
}

/** 페이지 안에서 돈다 — 폴백 · 넘침 · 정한 값 자리표시자를 잰다. 인자로 넘기는 함수라 바깥 이름을 쓰지 않는다. */
function measure(expect: {
  nodeId: string
  want: Record<string, string>
}): Omit<ShotWidthReport, 'width' | 'pngs' | 'pageHeight' | 'consoleErrors'> {
  const itemOf = (el: Element) => el.closest('[data-wb-gallery-item]')?.getAttribute('data-wb-gallery-item') ?? null
  const describe = (el: Element) => {
    const classes = typeof el.className === 'string' && el.className.trim() !== '' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
    const component = el.getAttribute('data-wb-component')
    return `${el.tagName.toLowerCase()}${classes}${component === null ? '' : `[data-wb-component=${component}]`}`
  }
  const vw = document.documentElement.clientWidth
  const outside = (r: DOMRect) => r.right > vw + 0.5 || r.left < -0.5
  const overflowing = new Set<Element>()
  const overflow: ShotOverflow[] = []
  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    if (!outside(rect)) continue
    let contained = false
    for (let up = el.parentElement; up !== null && up !== document.body; up = up.parentElement) {
      if (getComputedStyle(up).overflowX !== 'visible' && !outside(up.getBoundingClientRect())) {
        contained = true
        break
      }
    }
    if (contained) continue
    overflowing.add(el)
    if (el.parentElement !== null && overflowing.has(el.parentElement)) continue
    overflow.push({ item: itemOf(el), element: describe(el), left: Math.round(rect.left), right: Math.round(rect.right) })
  }
  // 글자 노드 — 요소 상자는 안 넘치고 글자만 넘친다. 잘라 숨기는 조상(`hidden` · `clip`)은 그 글자를 지우므로 그 조상의 상자 밖도 넘침이다.
  // 스크롤 조상(`auto` · `scroll`)은 닿을 수 있고 `text-overflow` 로 자른 것은 작성자가 고른 것이라 뺀다. 넘친 요소 뿌리 안의 글자는 이미 들었다.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    const parent = text.parentElement
    const content = (text.textContent ?? '').trim()
    if (parent === null || content === '') continue
    let inside = false
    for (let up: Element | null = parent; up !== null && !inside; up = up.parentElement) inside = overflowing.has(up)
    if (inside) continue
    const range = document.createRange()
    range.selectNodeContents(text)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0)
    if (rects.length === 0) continue
    const left = Math.min(...rects.map((r) => r.left))
    const right = Math.max(...rects.map((r) => r.right))
    let low = 0
    let high = vw
    let reachable = false
    for (let up: Element | null = parent; up !== null && up !== document.body && !reachable; up = up.parentElement) {
      const style = getComputedStyle(up)
      if (style.overflowX === 'visible') continue
      if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.textOverflow !== 'clip') {
        reachable = true
        continue
      }
      const box = up.getBoundingClientRect()
      low = Math.max(low, box.left)
      high = Math.min(high, box.right)
    }
    if (reachable || (right <= high + 0.5 && left >= low - 0.5)) continue
    overflow.push({
      item: itemOf(parent),
      element: `${describe(parent)} "${content.slice(0, 24)}"`,
      left: Math.round(left),
      right: Math.round(right),
    })
  }
  const placeholder: ShotWidthReport['placeholder'] = []
  const samples = [...document.querySelectorAll(`[data-wb-gallery-item^="Placeholder/"] [data-wb-id="${expect.nodeId}"]`)]
  if (samples.length === 0) placeholder.push({ item: null, property: '(표본)', want: expect.nodeId, got: '(없음)' })
  for (const el of samples) {
    const style = getComputedStyle(el)
    for (const [property, want] of Object.entries(expect.want)) {
      const got = style.getPropertyValue(property)
      if (got !== want) placeholder.push({ item: itemOf(el), property, want, got })
    }
  }
  return {
    placeholder,
    wbErrors: [...document.querySelectorAll('[data-wb-error]')].map((el) => ({
      item: itemOf(el),
      message: el.getAttribute('data-wb-error') ?? '',
    })),
    overflow,
    pageScrollWidth: document.documentElement.scrollWidth,
    pageClientWidth: vw,
    compatMode: document.compatMode,
  }
}

/**
 * `wb-theme shots` — kit dev 의 갤러리 프레임(`/frame.html`)을 폭마다 실 Chromium 으로 열어 전체 페이지 PNG(길면 구간마다 한 장)와
 * `report.json` 을 낸다.
 * 토큰은 기본값이다(셸 없이 프레임만 연다). `report.json` 은 폭마다 콘솔 오류 · `data-wb-error` · 가로 넘침을 싣는다.
 */
export async function takeShots(opts: {
  root: string
  entry?: string
  outDir: string
  widths?: readonly number[]
  browserPath?: string
}): Promise<ShotsReport> {
  const root = resolve(opts.root)
  const { project, issues } = await loadProject(root, opts.entry)
  if (project === null) throw new Error(`manifest 가 검증을 못 지났습니다 — ${issues.map((i) => `${i.path} ${i.message}`).join(' · ')}`)
  const widths = opts.widths ?? DEFAULT_SHOT_WIDTHS
  const browser = await launch(opts.browserPath)
  const server = await startDev({ root, entry: opts.entry, port: await freePort() }).catch(async (error: unknown) => {
    await browser.close()
    throw error
  })
  try {
    const frameUrl = new URL('frame.html', server.url).href
    // 첫 적재에 vite 가 의존을 묶는다 — 한 번 열어 데워 두고 폭마다 새 페이지로 잰다.
    const warm = await browser.newPage()
    await warm.goto(frameUrl)
    await galleryReady(warm)
    await warm.close()

    const outDir = resolve(opts.outDir)
    mkdirSync(outDir, { recursive: true })
    const report: ShotsReport = { theme: { id: project.manifest.id, version: project.manifest.version }, widths: [] }
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const consoleErrors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().split('\n')[0]!)
      })
      page.on('pageerror', (error) => consoleErrors.push(error.message.split('\n')[0]!))
      try {
        await page.goto(frameUrl)
        await galleryReady(page)
        const measured = await page.evaluate(measure, placeholderExpectations())
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
        const count = Math.max(1, Math.ceil(pageHeight / SHOT_SEGMENT_PX))
        const pngs: string[] = []
        for (let index = 0; index < count; index++) {
          const png = count === 1 ? `${project.manifest.id}-${width}.png` : `${project.manifest.id}-${width}-${index + 1}.png`
          const y = index * SHOT_SEGMENT_PX
          const clip = { x: 0, y, width, height: Math.min(SHOT_SEGMENT_PX, pageHeight - y) }
          await page.screenshot({ path: join(outDir, png), fullPage: true, clip })
          pngs.push(png)
        }
        report.widths.push({ width, pngs, pageHeight, consoleErrors, ...measured })
      } finally {
        await page.close()
      }
    }
    writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    return report
  } finally {
    await browser.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

/** 보고에 무엇이 있나 — 명령의 종료 코드를 가른다. */
export function shotsProblems(report: ShotsReport): string[] {
  const lines: string[] = []
  for (const w of report.widths) {
    if (w.compatMode !== 'CSS1Compat') lines.push(`✗ ${w.width}px 문서 모드 ${w.compatMode} — 번들 · PPTX(표준 모드)와 레이아웃이 갈립니다`)
    for (const line of w.consoleErrors) lines.push(`✗ ${w.width}px 콘솔: ${line}`)
    for (const e of w.wbErrors) lines.push(`✗ ${w.width}px 폴백 ${e.item ?? '(칸 밖)'}: ${e.message}`)
    for (const o of w.overflow) lines.push(`✗ ${w.width}px 넘침 ${o.item ?? '(칸 밖)'}: ${o.element} (${o.left}–${o.right}px)`)
    for (const p of w.placeholder) {
      lines.push(
        `✗ ${w.width}px 자리표시자 ${p.item ?? '(표본 없음)'}: 정한 ${p.property} ${p.want} 가 아니라 ${p.got} — 테마 CSS 가 --wb-node-placeholder-* 를 안 읽고 덮었습니다`,
      )
    }
  }
  return lines
}
