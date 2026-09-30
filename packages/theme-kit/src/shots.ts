import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import type { Browser, Page } from 'playwright-core'
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
  /** 창 폭을 넘는 요소 — 넘친 조상이 이미 든 것은 뺀다(뿌리만). 스크롤 · 잘림(`overflow-x` 가 `visible` 이 아닌) 조상 안에 갇힌 것도 뺀다. */
  overflow: ShotOverflow[]
  pageScrollWidth: number
  pageClientWidth: number
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
  const candidates: (string | undefined)[] = browserPath !== undefined ? [browserPath] : [...(existsSync(MAC_CHROME) ? [MAC_CHROME] : []), undefined]
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

/** 페이지 안에서 돈다 — 폴백 · 넘침을 잰다. 인자로 넘기는 함수라 바깥 이름을 쓰지 않는다. */
function measure(): Omit<ShotWidthReport, 'width' | 'pngs' | 'pageHeight' | 'consoleErrors'> {
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
  return {
    wbErrors: [...document.querySelectorAll('[data-wb-error]')].map((el) => ({ item: itemOf(el), message: el.getAttribute('data-wb-error') ?? '' })),
    overflow,
    pageScrollWidth: document.documentElement.scrollWidth,
    pageClientWidth: vw,
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
        const measured = await page.evaluate(measure)
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
    for (const line of w.consoleErrors) lines.push(`✗ ${w.width}px 콘솔: ${line}`)
    for (const e of w.wbErrors) lines.push(`✗ ${w.width}px 폴백 ${e.item ?? '(칸 밖)'}: ${e.message}`)
    for (const o of w.overflow) lines.push(`✗ ${w.width}px 넘침 ${o.item ?? '(칸 밖)'}: ${o.element} (${o.left}–${o.right}px)`)
  }
  return lines
}
