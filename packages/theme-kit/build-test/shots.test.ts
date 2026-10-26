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
    wrapped: { item: string | null; element: string; lines: number }[]
    pageScrollWidth: number
    pageClientWidth: number
    compatMode: string
    placeholder: { item: string | null; property: string; want: string; got: string }[]
    pairs: { item: string | null; element: string; label: number; value: number }[]
    pairsMeasured: number
    pairsOffGrid: { item: string | null; element: string }[]
    grids: {
      fixed: { item: string | null; element: string; before: number; after: number }[]
      fixedMeasured: number
      text: { item: string | null; element: string }[]
      capture: { item: string | null; element: string; scrollWidth: number; clientWidth: number; tableRight: number; pageWidth: number }[]
      captureMeasured: number
    }
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

  it('system-admin 을 세 폭으로 찍는다 — 폭마다 전체 페이지 PNG · report.json 에 콘솔 오류 · 폴백 0', () => {
    const dir = join(out, 'admin')
    const { status, out: printed } = shots(join(repoRoot, 'system-themes/admin'), [
      '--entry',
      'src/theme.tsx',
      '--out',
      dir,
      '--widths',
      '390,720,1280',
      '--browser',
      browser.path!,
    ])
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report
    expect(report.theme.id).toBe('system-admin')
    expect(report.widths.map((w) => w.width)).toEqual([390, 720, 1280])
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
      // 한 줄 입력 조각의 글이 칸 안에서 안 꺾인다 — 날짜 · 시간의 고정 폭이 제 기본 안내(«YYYY-MM-DD» · «00:00»)보다 넓다.
      expect(w.wrapped, `${w.width}px ${JSON.stringify(w.wrapped)}`).toEqual([])
      // 정한 그리기 값을 기본테마가 따른다 — 갤러리의 정한 값 표본(`PLACEHOLDER_SET_PROPS`)의 계산 값이 정한 값이다.
      expect(w.placeholder).toEqual([])
      // 폼 표의 같은 줄 라벨 칸 · 값 칸이 줄 높이를 채운다(키 큰 행 — 여러 줄 값). 넓은 폭에서는 잰 필드가 있어야 한다(좁은 폭은 라벨이 위다).
      expect(w.pairs, `${w.width}px ${JSON.stringify(w.pairs)}`).toEqual([])
      if (w.width === 1280) expect(w.pairsMeasured).toBeGreaterThan(5)
      expect(w.pairsOffGrid, `${w.width}px ${JSON.stringify(w.pairsOffGrid)}`).toEqual([])
      // 그리드 — 고정 열이 굴려도 제자리 · 칸 글이 칸 안 · 찍는 판에서 표 전체 폭. 고정 열은 640 위(PPTX 캡처 폭 720)에서 잰다 — 390 은 기본테마가 푼다.
      expect(w.grids.fixed, `${w.width}px ${JSON.stringify(w.grids.fixed)}`).toEqual([])
      expect(w.grids.text, `${w.width}px ${JSON.stringify(w.grids.text)}`).toEqual([])
      expect(w.grids.capture, `${w.width}px ${JSON.stringify(w.grids.capture)}`).toEqual([])
      expect(w.grids.captureMeasured).toBeGreaterThan(5)
      if (w.width === 720) expect(w.grids.fixedMeasured).toBeGreaterThan(0)
      if (w.width === 390) expect(w.grids.fixedMeasured).toBe(0)
    }
    // 종료 코드는 넘침 · 꺾임까지 센다 — 둘 다 없으면 0 이다.
    expect(status).toBe(report.widths.every((w) => w.overflow.length === 0 && w.wrapped.length === 0) ? 0 : 1)
  })

  /** 그리드 잣대 셋이 0 만 내지 않는가 — 한 곳씩 깬 테마 CSS(고정 열의 `left` 를 걷음 · 표를 제 상자로 굴림 · 좁게 고정한 칸에 줄 안 바꾸는 글). */
  it.each([
    ['고정 열', '[data-wb-component="DataGrid"] [data-wb-fixed] { left: auto !important; }', 'fixed', '고정 열'],
    // 표를 제 상자로 굴린다 — 폭을 상자 폭(`auto`)으로 되돌려야 표가 제 안에서 굴러간다(SDK 기본 표 폭은 칸 글 폭 `max-content` 다).
    [
      '찍는 판',
      '[data-wb-component="DataGrid"] [data-wb-part="table"] { display: block; overflow-x: auto; width: auto; }',
      'capture',
      '찍는 판',
    ],
    [
      '칸 글',
      '[data-wb-component="DataGrid"] [data-wb-part="table"] { table-layout: fixed; width: 300px; } [data-wb-component="DataGrid"] th { white-space: nowrap; }',
      'text',
      '칸 글',
    ],
  ] as const)('그리드 %s 이 어긋나면 report.json 에 적고 1 로 끝난다', (name, css, key, said) => {
    const root = mkdtempSync(join(TMP, `shots-grid-${key}-`))
    cpSync(FIXTURE, root, { recursive: true })
    appendFileSync(join(root, 'src/theme.css'), `\n${css}\n`)
    const dir = join(out, `grid-${key}`)
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '720', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    expect(w!.grids[key].length, `${name} ${printed}`).toBeGreaterThan(0)
    expect(
      // 그리드를 품은 팝업 표본(`Popup//pop2`)도 같은 그리드라 함께 적힌다.
      w!.grids[key].every((entry) => entry.item?.startsWith('DataGrid/') || entry.item?.startsWith('Grid') || entry.item === 'Popup//pop2'),
      JSON.stringify(w!.grids[key]),
    ).toBe(true)
    expect(printed).toContain(said)
  })

  /** 꺾임을 재는 자가 0 만 내지 않는가 — 날짜 칸을 안내보다 좁게 둔 테마에서 그 표본이 꺾임으로 적힌다(«YYYY-MM-DD» 는 하이픈 뒤에서 꺾인다). */
  it('한 줄 입력 조각의 글이 칸 안에서 꺾이면 report.json 에 적고 1 로 끝난다 — 글자 노드의 줄 수로 잰다', () => {
    const root = mkdtempSync(join(TMP, 'shots-wrap-'))
    cpSync(FIXTURE, root, { recursive: true })
    appendFileSync(join(root, 'src/theme.css'), '\nbody [data-wb-component="DateInput"] { width: 3em; }\n')
    const dir = join(out, 'wrap')
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '390', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    expect(w!.overflow, printed).toEqual([])
    expect(w!.wrapped.length, printed).toBeGreaterThan(0)
    expect(w!.wrapped.every((entry) => entry.lines >= 2)).toBe(true)
    expect(
      w!.wrapped.some((entry) => entry.item === 'DateInput//date' && entry.element.includes('"YYYY-MM-DD"')),
      printed,
    ).toBe(true)
    expect(printed).toContain('꺾임 DateInput//date')
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
    expect(w!.pngs).toEqual(Array.from({ length: w!.pngs.length }, (_, index) => `sample-390-${index + 1}.png`))
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

  /** 라벨 칸 높이를 재는 자가 0 만 내지 않는가 — 폼 표의 필드를 위로 붙여(`align-items: start`) 여러 줄 값이 든 줄의 라벨 칸이 줄 높이보다 작다. */
  it('폼 표의 같은 줄 라벨 칸이 값 칸보다 낮으면 report.json 에 적고 1 로 끝난다', () => {
    const root = mkdtempSync(join(TMP, 'shots-pairs-'))
    cpSync(FIXTURE, root, { recursive: true })
    appendFileSync(join(root, 'src/theme.css'), '\n[data-wb-component="FormTable"] [data-wb-component="Field"] { align-items: start; }\n')
    const dir = join(out, 'pairs')
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '1280', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    expect(w!.pairs.length, printed).toBeGreaterThan(0)
    // 여러 줄 값(`소개`)이 든 줄 — 라벨 칸이 제 글 높이로 줄어 값 칸보다 낮다.
    expect(
      w!.pairs.some((entry) => entry.item === 'FormTable//ft' && entry.label < entry.value),
      printed,
    ).toBe(true)
    expect(printed).toContain('폼 표 FormTable//ft: 같은 줄의 라벨 칸')
  })

  /**
   * 쌍 높이를 재는 자가 아무것도 안 잰 판을 초록으로 내지 않는가 — 칸을 `div` 로 감싸는 폼 표 뷰에서는 `Field` 가 `cells` 의 직계가 아니라 쌍 격자에
   * 안 서고(`docs/superpowers/plans/2026-10-25-rv-ft-report.md` 「8」) `pairs` 의 셀렉터가 그 필드를 하나도 못 찾는다. 그 필드를 꼴 없이 찾아 적는다.
   */
  it('폼 표 몸통의 Field 가 쌍 격자 꼴로 안 서면 report.json 에 적고 1 로 끝난다 — 잰 쌍 0 인 판을 초록으로 안 낸다', () => {
    const root = mkdtempSync(join(TMP, 'shots-offgrid-'))
    cpSync(FIXTURE, root, { recursive: true })
    const entry = join(root, 'src/index.tsx')
    writeFileSync(
      entry,
      readFileSync(entry, 'utf8')
        .replace(
          "import { defineTheme, Root, view } from '@wirebound/theme-sdk'",
          "import { defineTheme, formTableCellsAttrs, pairRows, Root, view, Zone } from '@wirebound/theme-sdk'",
        )
        .replace(
          'views: { Card }',
          `views: {
    Card,
    FormTable: view(({ props, items }) => (
      <Root>
        <Zone name="headEnd" />
        <Zone name="aside" />
        <div data-wb-part="cells" {...formTableCellsAttrs(props.columns)}>
          {pairRows(items, props.columns).map((c) =>
            c.kind === 'item' ? (
              <div key={c.item.nodeId}>{c.item.element}</div>
            ) : (
              <div key={c.key} data-wb-part="filler" aria-hidden="true"><div data-wb-part="label" /><div data-wb-part="value" /></div>
            ),
          )}
        </div>
      </Root>
    )),
  }`,
        ),
    )
    const dir = join(out, 'offgrid')
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '1280', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    expect(w!.overflow, printed).toEqual([])
    expect(w!.pairsMeasured, printed).toBe(0)
    expect(w!.pairsOffGrid.length, printed).toBeGreaterThan(5)
    expect(
      // 폼 표를 품은 팝업 표본(`Popup//pop3`)도 같은 폼 표라 함께 적힌다.
      w!.pairsOffGrid.every(
        (entry) => entry.item?.startsWith('FormTable/') || entry.item?.startsWith('EntryForm/') || entry.item === 'Popup//pop3',
      ),
      JSON.stringify(w!.pairsOffGrid),
    ).toBe(true)
    expect(printed).toContain('폼 표 FormTable//ft: 몸통의 Field 가 [FormTable] > [cells] > [Field] · 두 조각 직계로 안 섰습니다')
  })

  /**
   * 테마 CSS 가 자리표시자 변수를 안 읽고 바탕 · 테두리 · 글 색을 덮으면 정한 값 표본의 계산 값이 정한 값이 아니다 — 속성마다 한 줄 · 1 로 끝난다.
   * jsdom 의 `wb-theme check` 는 이것을 못 잰다(특이도 · `var()` 를 안 푼다 — `src/check.ts` 의 `placeholderDrops`).
   */
  it('자리표시자 변수를 덮는 테마 CSS 를 계산 값으로 적고 1 로 끝난다', () => {
    const root = mkdtempSync(join(TMP, 'shots-placeholder-'))
    cpSync(FIXTURE, root, { recursive: true })
    appendFileSync(
      join(root, 'src/theme.css'),
      '\n[data-wb-component="Placeholder"][data-wb-structure="default"] { background: #eeeeee; border-color: #cccccc; color: var(--wb-node-placeholder-color, #333333); }\n',
    )
    const dir = join(out, 'placeholder')
    const { status, out: printed } = shots(root, ['--out', dir, '--widths', '390', '--browser', browser.path!])
    expect(status, printed).toBe(1)
    const [w] = (JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report).widths
    // 변수를 읽은 글 색은 따른다 — 덮은 둘만 선다.
    expect(w!.placeholder).toEqual([
      { item: 'Placeholder//ph2', property: 'background-color', want: 'rgb(253, 224, 71)', got: 'rgb(238, 238, 238)' },
      { item: 'Placeholder//ph2', property: 'border-top-color', want: 'rgb(220, 38, 38)', got: 'rgb(204, 204, 204)' },
    ])
    expect(printed).toContain('자리표시자 Placeholder//ph2: 정한 background-color rgb(253, 224, 71) 가 아니라 rgb(238, 238, 238)')
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
