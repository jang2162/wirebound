/**
 * `wb-theme shots` 를 빌드한 kit(`dist/bin.js`)으로 돌린다 — dev 서버의 갤러리 프레임을 실 Chromium 으로 폭마다 찍고 `report.json` 을 낸다.
 *
 * Chromium 은 `build-test/dev.test.ts` 와 같은 순서로 찾아 **띄워 보고** 건너뛸지 정한다. 명령에는 그 경로를 `--browser` 로 넘긴다 —
 * 명령이 제 순서로 다시 찾으면 이 파일이 띄운 것과 다른 브라우저를 잴 수 있다.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const KIT = resolve(repoRoot, 'packages/theme-kit')
const BIN = join(KIT, 'bin/wb-theme.js')
const FIXTURE = join(KIT, 'test/fixtures/sample-theme')
// 설치한 작성자 프로젝트처럼 SDK · react 가 `node_modules` 로 풀리는 자리(`test/build.test.ts` 의 `TMP` 와 같은 까닭).
const TMP = join(KIT, '.tmp')

/** 띄워지는 첫 후보의 경로. `null` 이면 못 띄운다 — 까닭은 `skipReason`. */
async function launchablePath(): Promise<{ path: string | null; skipReason: string }> {
  const fromShell = process.env.EDITOR_BROWSER_PATH
  const candidates =
    fromShell !== undefined && fromShell !== ''
      ? [fromShell]
      : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()]
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      const browser = await chromium.launch({ executablePath: candidate, headless: true })
      await browser.close()
      return { path: candidate, skipReason: '' }
    } catch (error) {
      failures.push(`${candidate}: ${(error as Error).message.split('\n')[0]}`)
    }
  }
  return { path: null, skipReason: failures.join(' · ') }
}

const browser = await launchablePath()
if (browser.path === null) console.warn(`[theme-kit shots] Chrome 을 못 띄워 건너뛴다 — ${browser.skipReason}`)

interface Report {
  theme: { id: string; version: string }
  widths: {
    width: number
    pngs: string[]
    pageHeight: number
    consoleErrors: string[]
    wbErrors: { item: string | null; message: string }[]
    overflow: { item: string | null; element: string; left: number; right: number }[]
    pageScrollWidth: number
    pageClientWidth: number
    compatMode: string
  }[]
}

function shots(root: string, args: string[]) {
  const run = spawnSync('node', [BIN, 'shots', ...args], { cwd: root, encoding: 'utf8', timeout: 180_000 })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

/** PNG 머리(IHDR)의 폭 · 높이. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file)
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe.skipIf(browser.path === null)('wb-theme shots (실 Chromium)', () => {
  let out: string

  beforeAll(() => {
    execFileSync('pnpm', ['--filter', '@wirebound/theme-kit...', 'build'], { cwd: repoRoot, stdio: 'pipe' })
    mkdirSync(TMP, { recursive: true })
    out = mkdtempSync(join(TMP, 'shots-'))
  })
  afterAll(() => rmSync(TMP, { recursive: true, force: true }))

  it('system-admin 을 두 폭으로 찍는다 — 폭마다 전체 페이지 PNG · report.json 에 콘솔 오류 · 폴백 0', () => {
    const dir = join(out, 'admin')
    const { status, out: printed } = shots(join(repoRoot, 'system-themes/admin'), [
      '--entry',
      'src/theme.tsx',
      '--out',
      dir,
      '--widths',
      '390,1280',
      '--browser',
      browser.path!,
    ])
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report
    expect(report.theme.id).toBe('system-admin')
    expect(report.widths.map((w) => w.width)).toEqual([390, 1280])
    for (const w of report.widths) {
      expect(w.pngs.length, printed).toBeGreaterThan(0)
      const sizes = w.pngs.map((png) => pngSize(join(dir, png)))
      expect(sizes.every((size) => size.width === w.width)).toBe(true)
      // 전체 페이지 — 갤러리는 한 화면보다 길다. 구간의 합이 문서 높이다.
      expect(sizes.reduce((sum, size) => sum + size.height, 0)).toBe(w.pageHeight)
      expect(w.pageHeight).toBeGreaterThan(2000)
      expect(w.consoleErrors).toEqual([])
      expect(w.wbErrors).toEqual([])
      expect(w.compatMode).toBe('CSS1Compat')
    }
    // 종료 코드는 넘침까지 센다 — 넘침이 없으면 0 이다.
    expect(status).toBe(report.widths.every((w) => w.overflow.length === 0) ? 0 : 1)
  })

  it('넘치는 칸 · 던지는 뷰를 report.json 에 적고 1 로 끝난다', () => {
    const root = mkdtempSync(join(TMP, 'shots-fixture-'))
    cpSync(FIXTURE, root, { recursive: true })
    // Card 를 폭보다 넓게 · Tabs 는 던진다 · 페이지를 한 구간(8000px)의 두 배보다 길게.
    appendFileSync(join(root, 'src/theme.css'), '\n.sample-card { width: 2000px; }\nbody { padding-bottom: 20000px; }\n')
    const entry = join(root, 'src/index.tsx')
    writeFileSync(
      entry,
      readFileSync(entry, 'utf8').replace('views: { Card }', "views: { Card, Tabs: view(() => { throw new Error('탭이 터졌다') }) }"),
    )
    const dir = join(out, 'fixture')
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '390', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    // 긴 페이지는 구간마다 한 장 — 높이의 합이 문서 높이다(한 장으로 찍으면 16384px 부근부터 내용이 틀린다).
    expect(w!.pngs).toEqual(['sample-390-1.png', 'sample-390-2.png', 'sample-390-3.png', 'sample-390-4.png'].slice(0, w!.pngs.length))
    expect(w!.pngs.length).toBeGreaterThanOrEqual(3)
    const sizes = w!.pngs.map((png) => pngSize(join(dir, png)))
    expect(sizes.every((size) => size.width === 390 && size.height <= 8000)).toBe(true)
    expect(sizes.reduce((sum, size) => sum + size.height, 0)).toBe(w!.pageHeight)
    expect(w!.pageScrollWidth).toBeGreaterThan(w!.pageClientWidth)
    expect(w!.overflow.length).toBeGreaterThan(0)
    expect(
      w!.overflow.every((entry) => entry.item?.startsWith('Card/')),
      JSON.stringify(w!.overflow.map((entry) => [entry.item, entry.element])),
    ).toBe(true)
    // 넘친 뿌리만 — 카드 안의 제목 · 글(카드와 함께 넘친다)은 안 든다.
    expect(w!.overflow.every((entry) => entry.element.startsWith('article.sample-card'))).toBe(true)
    expect(w!.wbErrors.length).toBeGreaterThan(0)
    // `TabPanel` 표본은 탭 몸통에만 서서 `Tabs` 부모 안에 그려진다(`galleryItemDocument`) — 던지는 `Tabs` 에 함께 걸린다.
    expect(w!.wbErrors.map((entry) => entry.item)).toEqual(['Tabs//tabs', 'TabPanel//tabp'])
    expect(w!.wbErrors.every((entry) => entry.message.includes('탭이 터졌다'))).toBe(true)
    expect(w!.consoleErrors.some((line) => line.includes('탭이 터졌다'))).toBe(true)
  })

  /**
   * 끊을 자리 없는 낱말은 요소 상자를 안 넘기고 글자만 넘긴다 — 잘라 숨기는 조상이 있으면 문서 폭(`scrollWidth`)에도 안 뜬다. 갤러리의
   * 긴 낱말 표본(`Text — 긴 낱말` · `KeyValue` 의 긴 값)을 SDK 기본 CSS 의 `overflow-wrap` 을 끈 채 뿌리를 잘라 숨기게 그린다.
   */
  it('잘려 숨는 글자도 넘침으로 적는다 — 글자 노드의 사각으로 잰다', () => {
    const root = mkdtempSync(join(TMP, 'shots-longword-'))
    cpSync(FIXTURE, root, { recursive: true })
    appendFileSync(
      join(root, 'src/theme.css'),
      '\nbody [data-wb-component="Text"], body [data-wb-component="KeyValue"] { overflow-wrap: normal; }\nbody [data-wb-component="Page"] { overflow: hidden; }\n',
    )
    const dir = join(out, 'longword')
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '390', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    // 문서 폭으로는 안 보인다 — 잘라 숨긴 뿌리 안이다.
    expect(w!.pageScrollWidth).toBe(w!.pageClientWidth)
    expect(w!.overflow.length, printed).toBeGreaterThan(0)
    // 요소 상자는 하나도 안 넘친다 — 적힌 것은 전부 글자 노드다.
    expect(
      w!.overflow.every((entry) => entry.element.includes(' "')),
      printed,
    ).toBe(true)
    expect(
      w!.overflow.some((entry) => entry.item?.startsWith('Text/') && entry.element.includes('"문의 hong.gildong')),
      printed,
    ).toBe(true)
    expect(
      w!.overflow.some((entry) => entry.item?.startsWith('KeyValue/') && entry.element.includes('"hong.gildong')),
      printed,
    ).toBe(true)
  })

  it('Chromium 을 못 띄우면 까닭과 고치는 법을 말하고 1 로 끝난다 — 아무것도 안 쓴다', () => {
    const dir = join(out, 'nope')
    const { status, out: printed } = shots(join(repoRoot, 'system-themes/admin'), [
      '--entry',
      'src/theme.tsx',
      '--out',
      dir,
      '--browser',
      '/nope/chrome',
    ])
    expect(status).toBe(1)
    expect(printed).toContain('Chromium 을 띄우지 못했습니다')
    expect(printed).toContain('/nope/chrome')
    expect(printed).toContain('--browser')
    expect(existsSync(join(dir, 'report.json'))).toBe(false)
  })
})
