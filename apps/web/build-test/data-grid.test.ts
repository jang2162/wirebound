/**
 * **그리드가 실브라우저에서 설계대로 서는가** — 내보낸 번들(화면 모드 `#wb-screen`)에서 잰다(설계 spec `2026-10-25-grid-design.md`). 기본테마(시드된 판)와
 * SDK 기본 CSS(같은 번들에서 `assets/theme/theme.css` 를 비운 판) 두 판이다.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 사본 | 되풀이 행의 둘째 줄부터는 `data-wb-id` 가 없고 `data-wb-copy-of` 만 — 노드 id 가 문서에 한 번 · HTML `id` 가 겹치지 않는다 · 사본의 글이 원본과 같고 «No» 만 다르다(Q4) |
 * | 병합 머리 | 열 묶음 깊이 1 · 2 · 3 의 머리 줄 수 · `colspan` · `rowspan` · `scope` · 머리 칸 상자가 그 아래 열의 칸 상자를 덮는다 · 접근성 트리의 열 머리 이름 |
 * | 고정 열 · 넓은 표 | 창 390 · 720 · 1280 — 문서 `scrollWidth` = 창 폭 · 표 칸만 가로로 굴러간다 · 끝까지 굴려도 고정 열의 화면 자리가 그대로 · 둘째 고정 열의 왼쪽 자리 변수가 첫 열 폭(번들에서도 레이아웃 이펙트가 돈다 — 위험 2) · 칸 글이 칸 밖으로 안 나간다(글자 노드 `Range`) |
 * | 사본 행의 몫 | 셀 틀 안 `Flex`(몫 2) 의 몫 없는 자식 폭이 원본 줄과 사본 줄에서 같다 — 사본은 `data-wb-id` 가 없어 SDK 의 몫 초기화(`[data-wb-id]`)를 못 받으면 부모 몫을 물려받는다 |
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, layoutProject, openBundlePage, type UnpackedBundle } from './layout-bundle'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEME = 'system-admin'
const WIDTHS = [390, 720, 1280] as const
const LONG = 'verylongunbrokenaddresslineforthecustomer@subdomain.example-company-internal.co.kr'

let seq = 0
const id = (prefix: string) => `${prefix}${(seq++).toString(36).padStart(3, '0')}`
const text = (content: string, more: Record<string, unknown> = {}) => ({ id: id('t'), type: 'Text', props: { content }, ...more })
const col = (label: string, props: Record<string, unknown> = {}, cells: unknown[] = [text('—')]) => ({
  id: id('c'),
  type: 'GridColumn',
  props: { label, ...props },
  children: cells,
})
const group = (label: string, children: unknown[]) => ({ id: id('g'), type: 'GridColumnGroup', props: { label }, children })
const row = (props: Record<string, unknown>, cells?: unknown[]) => ({
  id: id('r'),
  type: 'GridRow',
  props,
  ...(cells === undefined ? {} : { children: cells }),
})
const cell = (props: Record<string, unknown>, content: unknown[]) => ({ id: id('x'), type: 'GridCell', props, children: content })
const grid = (gridId: string, props: Record<string, unknown>, columns: unknown[], rows: unknown[], footer?: unknown[]) => ({
  id: gridId,
  type: 'DataGrid',
  props,
  children: columns,
  zones: { rows, ...(footer === undefined ? {} : { footer }) },
})

// 넓은 표 — 고정 열 둘(«No» 번호 · 이름) · 선택 칸 · 긴 낱말 열 · 넓은 열 여덟 · 되풀이 5 줄 · 생략 띠 · 합계 줄 · 바.
const NUMBER = col('No', { numbering: 'desc', align: 'center', size: 'short' }, [])
const NAME_TEXT = text('홍길동')
const MAIL_TEXT = text(LONG)
const WIDE_ROW = row({ repeat: 5 })
const WIDE = grid(
  'g_wide',
  { select: 'check', fixedColumns: 2 },
  [
    NUMBER,
    col('이름', { size: 'medium' }, [NAME_TEXT]),
    col('이메일', { size: 'long' }, [MAIL_TEXT]),
    ...Array.from({ length: 8 }, (_unused, at) => col(`항목 ${at + 1}`, { size: 'long' }, [text(`값 ${at + 1}`)])),
    // 열 폭(`size`)은 테마가 정한다 — SDK 기본 CSS 판도 표가 창보다 넓게 폭 900 자리표시자 열을 둔다.
    col('그림', {}, [{ id: id('ph'), type: 'Placeholder', props: { label: '', width: 900, height: 20, border: 'none' } }]),
  ],
  [WIDE_ROW, row({ kind: 'gap' }), row({ kind: 'total' }, [cell({ span: 3 }, [text('합계')]), cell({}, [text('48')])])],
  [{ id: 'p_wide', type: 'Pagination', props: { total: 48 } }],
)

// 병합 머리 — 열 묶음 깊이 1(묶음 없음) · 2 · 3.
const HEADS = [
  grid('g_d1', {}, [col('가'), col('나'), col('다')], [row({ repeat: 2 })]),
  grid('g_d2', {}, [col('가'), group('묶음', [col('나'), col('다')]), col('라')], [row({ repeat: 2 })]),
  grid('g_d3', {}, [col('가'), group('위', [col('나'), group('아래', [col('다'), col('라')])]), col('마')], [row({ repeat: 2 })]),
]

// 사본 행의 몫 — 셀 틀이 가로 `Flex` 안의 몫 2 가로 `Flex`(몫 없는 글 하나) · 글. 몫 변수는 부모가 `Flex` 인 노드에만 실린다(안쪽 `Flex`).
const WEIGHTED_B = text('몫 없음')
const WEIGHT = grid(
  'g_w',
  {},
  [
    col('몫', {}, [
      {
        id: 'f_out',
        type: 'Flex',
        props: { direction: 'row' },
        children: [{ id: 'f_in', type: 'Flex', weight: 2, props: { direction: 'row' }, children: [WEIGHTED_B] }, text('곁')],
      },
    ]),
    col('뒤'),
  ],
  [row({ repeat: 3 })],
)

const PAGES = { '넓은 표': [WIDE], '병합 머리': HEADS, '몫 사본': [WEIGHT] }

/** 사본 — 노드 id · HTML id 겹침 · 사본 수 · 몸 줄의 칸 글. 글로 넘긴다(vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게). */
const COPIES = `(ids) => {
  const all = [...document.querySelectorAll('[data-wb-id]')].map((el) => el.getAttribute('data-wb-id'))
  const html = [...document.querySelectorAll('[id]')].map((el) => el.id)
  const grid = document.querySelector('[data-wb-id="' + ids.grid + '"]')
  const rows = [...grid.querySelectorAll('tbody > tr')].map((tr) => ({
    copy: tr.hasAttribute('data-wb-copy-of'),
    id: tr.getAttribute('data-wb-id') ?? tr.getAttribute('data-wb-copy-of'),
    cells: [...tr.children].map((td) => (td.textContent ?? '').trim()),
  }))
  return {
    nodeIds: all.length,
    dupNodeIds: all.filter((v, i) => all.indexOf(v) !== i),
    dupHtmlIds: html.filter((v, i) => html.indexOf(v) !== i),
    copiesOf: Object.fromEntries(ids.copied.map((nodeId) => [nodeId, document.querySelectorAll('[data-wb-copy-of="' + nodeId + '"]').length])),
    rows,
  }
}`

/** 병합 머리 — 머리 칸마다 꼴 · 상자와 그 아래 열의 첫 몸 줄 칸 상자. */
const HEADERS = `(gridIds) => gridIds.map((gridId) => {
  const grid = document.querySelector('[data-wb-id="' + gridId + '"]')
  const head = [...grid.querySelectorAll('thead > tr')]
  const first = grid.querySelector('tbody > tr')
  const bodyCells = [...first.children].map((td) => ({ col: Number(td.getAttribute('data-wb-col')), span: td.colSpan, r: td.getBoundingClientRect() }))
  return {
    gridId,
    headRows: head.length,
    cells: head.flatMap((tr, depth) => [...tr.children].map((th) => {
      const col = Number(th.getAttribute('data-wb-col'))
      const under = bodyCells.filter((c) => c.col >= col && c.col + c.span <= col + th.colSpan)
      const r = th.getBoundingClientRect()
      const left = Math.min(...under.map((c) => c.r.left))
      const right = Math.max(...under.map((c) => c.r.right))
      return {
        depth,
        text: (th.textContent ?? '').trim(),
        colspan: th.colSpan,
        rowspan: th.rowSpan,
        scope: th.getAttribute('scope'),
        under: under.length,
        off: Math.round(Math.max(Math.abs(r.left - left), Math.abs(r.right - right)) * 10) / 10,
      }
    })),
  }
})`

interface FixedRead {
  vw: number
  scrollWidth: number
  scrollBox: { scrollWidth: number; clientWidth: number; scrolled: number }
  stickies: number
  moved: number
  leftVar: string
  firstWidth: number
  spills: string[]
}

/** 고정 열 · 넓은 표 — 굴리기 전후의 고정 칸 자리 · 둘째 고정 열의 왼쪽 자리 변수 · 칸 밖 글. 굴린 스크롤은 되돌린다. */
const FIXED = `(gridId) => {
  const grid = document.querySelector('[data-wb-id="' + gridId + '"]')
  const scroll = grid.querySelector(':scope > [data-wb-part="scroll"]')
  const stickies = [...grid.querySelectorAll('[data-wb-fixed]')].filter((el) => getComputedStyle(el).position === 'sticky')
  const before = stickies.map((el) => el.getBoundingClientRect().left)
  const headFixed = [...grid.querySelectorAll('thead [data-wb-fixed]')]
  const second = headFixed[headFixed.length - 1]
  const leftVar = second === undefined ? '' : getComputedStyle(second).getPropertyValue('--wb-node-datagrid-left').trim()
  const firstWidth = headFixed.length > 1 ? headFixed[0].getBoundingClientRect().width : 0
  scroll.scrollLeft = scroll.scrollWidth
  const scrolled = scroll.scrollLeft
  const after = stickies.map((el) => el.getBoundingClientRect().left)
  scroll.scrollLeft = 0
  const spills = []
  for (const c of grid.querySelectorAll('th, td')) {
    const box = c.getBoundingClientRect()
    const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      if ((t.textContent ?? '').trim() === '' || t.parentElement.closest('th, td') !== c) continue
      const range = document.createRange()
      range.selectNodeContents(t)
      for (const r of range.getClientRects()) if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) spills.push(t.textContent.trim().slice(0, 16))
    }
  }
  return {
    vw: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollBox: { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth, scrolled },
    stickies: stickies.length,
    moved: Math.max(0, ...after.map((x, i) => Math.abs(x - before[i]))),
    leftVar,
    firstWidth: Math.round(firstWidth * 10) / 10,
    spills,
  }
}`

/** 사본 행의 몫 — 셀 틀의 몫 없는 글이 줄마다 차지한 폭(원본 줄 · 사본 줄). */
const WEIGHTS = `(nodeId) => [
  ...document.querySelectorAll('[data-wb-id="' + nodeId + '"], [data-wb-copy-of="' + nodeId + '"]'),
].map((el) => ({ copy: el.hasAttribute('data-wb-copy-of'), width: Math.round(el.getBoundingClientRect().width * 10) / 10, flex: getComputedStyle(el).flex }))`

describe.skipIf(!전제.ok)('그리드 — 실브라우저(번들 · 화면 모드)', () => {
  let stack: EditorStack
  let alice: Session
  let bundle: UnpackedBundle
  const fixed: Record<string, FixedRead> = {}
  const copies: Record<string, any> = {}
  const heads: Record<string, any> = {}
  const weights: Record<string, Array<{ copy: boolean; width: number; flex: string }>> = {}
  const ax: Record<string, string[]> = {}

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const made = await layoutProject(stack, alice, '그리드', PAGES)
    await putTheme(made.call, made.projectId, { themeId: THEME, version: seededVersion(THEME), tokens: {} })
    bundle = await exportBundle(stack, alice, made.projectId)
    const file = (title: string) => {
      const path = bundle.pages[`그리드-${title.replace(' ', '-')}`]
      if (path === undefined) throw new Error(`번들에 ${title} 가 없다: ${Object.keys(bundle.pages).join(', ')}`)
      return path
    }
    for (const theme of ['기본테마', 'SDK'] as const) {
      if (theme === 'SDK') {
        // 테마 CSS 를 비운다 — 기본 뷰 · SDK 기본 CSS · 토큰만 선 판.
        const found = (readdirSync(bundle.dir, { recursive: true }) as string[]).filter((path) => path.endsWith('assets/theme/theme.css'))
        expect(found.length).toBe(1)
        expect(readFileSync(join(bundle.dir, found[0]!), 'utf8').length).toBeGreaterThan(0)
        writeFileSync(join(bundle.dir, found[0]!), '')
      }
      for (const width of WIDTHS) {
        const { context, page } = await openBundlePage(stack, file('넓은 표'), { viewport: { width, height: 1200 }, screen: true })
        try {
          fixed[`${theme} ${width}`] = (await page.evaluate(`(${FIXED})('g_wide')`)) as FixedRead
          if (width === 1280)
            copies[theme] = await page.evaluate(
              `(${COPIES})(${JSON.stringify({ grid: 'g_wide', copied: [WIDE_ROW.id, NAME_TEXT.id, MAIL_TEXT.id] })})`,
            )
        } finally {
          await context.close()
        }
      }
      {
        const { context, page } = await openBundlePage(stack, file('병합 머리'), { viewport: { width: 1280, height: 1200 }, screen: true })
        try {
          heads[theme] = await page.evaluate(`(${HEADERS})(${JSON.stringify(HEADS.map((g) => g.id))})`)
          const cdp = await context.newCDPSession(page)
          const tree = (await cdp.send('Accessibility.getFullAXTree')) as {
            nodes: Array<{ role?: { value?: string }; name?: { value?: string } }>
          }
          // 접근성 트리의 노드 차례는 DOM 차례가 아니다 — 이름으로 늘어놓고 견준다.
          ax[theme] = tree.nodes
            .filter((node) => node.role?.value === 'columnheader')
            .map((node) => node.name?.value ?? '')
            .sort()
        } finally {
          await context.close()
        }
      }
      {
        const { context, page } = await openBundlePage(stack, file('몫 사본'), { viewport: { width: 1280, height: 1200 }, screen: true })
        try {
          weights[theme] = (await page.evaluate(`(${WEIGHTS})(${JSON.stringify(WEIGHTED_B.id)})`)) as (typeof weights)[string]
        } finally {
          await context.close()
        }
      }
    }
    // eslint-disable-next-line no-console
    for (const [key, read] of Object.entries(fixed)) console.log(`[그리드 고정 열] ${key} ${JSON.stringify(read)}`)
    // eslint-disable-next-line no-console
    for (const [key, read] of Object.entries(weights)) console.log(`[그리드 사본 몫] ${key} ${JSON.stringify(read)}`)
  }, 300_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  it.each(['기본테마', 'SDK'] as const)(
    '%s — 사본은 data-wb-copy-of 만 싣고 id 가 안 겹친다 · 사본 글은 원본과 같고 «No» 만 거꾸로 센다',
    (theme) => {
      const read = copies[theme]
      expect(read.nodeIds, theme).toBeGreaterThan(10)
      expect({ dupNodeIds: read.dupNodeIds, dupHtmlIds: read.dupHtmlIds }, theme).toEqual({ dupNodeIds: [], dupHtmlIds: [] })
      // 되풀이 5 줄 — 사본 넷. 셀 틀 글도 줄마다 사본 넷.
      expect(read.copiesOf, theme).toEqual({ [WIDE_ROW.id]: 4, [NAME_TEXT.id]: 4, [MAIL_TEXT.id]: 4 })
      const data = (read.rows as Array<{ copy: boolean; id: string; cells: string[] }>).filter((r) => r.id === WIDE_ROW.id)
      expect(
        data.map((r) => r.copy),
        theme,
      ).toEqual([false, true, true, true, true])
      // 칸 차례: 선택 칸 · No · 이름 · 이메일 · 항목 여덟.
      expect(
        data.map((r) => r.cells[1]),
        theme,
      ).toEqual(['5', '4', '3', '2', '1'])
      for (const r of data) expect(r.cells.slice(2), theme).toEqual(data[0]!.cells.slice(2))
    },
  )

  it.each(['기본테마', 'SDK'] as const)(
    '%s — 병합 머리: 깊이 1 · 2 · 3 의 줄 수 · colspan · rowspan · scope · 머리 칸이 그 아래 열을 덮는다',
    (theme) => {
      const shape = (heads[theme] as Array<{ gridId: string; headRows: number; cells: any[] }>).map((g) => ({
        grid: g.gridId,
        rows: g.headRows,
        cells: g.cells.map((c) => `${c.depth}:${c.text}:${c.colspan}x${c.rowspan}:${c.scope}:${c.under}`),
      }))
      expect(shape, theme).toEqual([
        { grid: 'g_d1', rows: 1, cells: ['0:가:1x1:col:1', '0:나:1x1:col:1', '0:다:1x1:col:1'] },
        { grid: 'g_d2', rows: 2, cells: ['0:가:1x2:col:1', '0:묶음:2x1:colgroup:2', '0:라:1x2:col:1', '1:나:1x1:col:1', '1:다:1x1:col:1'] },
        {
          grid: 'g_d3',
          rows: 3,
          cells: [
            '0:가:1x3:col:1',
            '0:위:3x1:colgroup:3',
            '0:마:1x3:col:1',
            '1:나:1x2:col:1',
            '1:아래:2x1:colgroup:2',
            '2:다:1x1:col:1',
            '2:라:1x1:col:1',
          ],
        },
      ])
      const offs = (heads[theme] as Array<{ cells: Array<{ text: string; off: number }> }>).flatMap((g) => g.cells.map((c) => c.off))
      expect(Math.max(...offs), JSON.stringify(heads[theme])).toBeLessThanOrEqual(1)
      // 접근성 트리 — 머리 칸 전부가 열 머리로 선다(묶음 머리도).
      expect(ax[theme], theme).toEqual(['가', '가', '가', '나', '나', '나', '다', '다', '다', '라', '라', '마', '묶음', '아래', '위'])
    },
  )

  it.each(WIDTHS.flatMap((width) => (['기본테마', 'SDK'] as const).map((theme) => [theme, width] as const)))(
    '%s %i — 문서는 창 폭 그대로 · 표 칸만 굴러간다 · 고정 열이 붙어 있다 · 칸 글이 칸 안이다',
    (theme, width) => {
      const read = fixed[`${theme} ${width}`]!
      const detail = JSON.stringify(read)
      expect(read.scrollWidth, detail).toBe(read.vw)
      expect(read.scrollBox.scrollWidth, detail).toBeGreaterThan(read.scrollBox.clientWidth)
      expect(read.scrollBox.scrolled, detail).toBeGreaterThan(0)
      expect(read.moved, detail).toBeLessThanOrEqual(1)
      expect(read.spills, detail).toEqual([])
      // 기본테마는 640 아래에서 고정을 푼다(좁은 창은 고정 열이 칸을 다 먹는다) — 그 위와 SDK 는 고정 열이 선다.
      if (theme === 'SDK' || width >= 640) {
        expect(read.stickies, detail).toBeGreaterThan(0)
        // 위험 2 — 번들에서도 레이아웃 이펙트가 돌아 둘째 고정 열의 왼쪽 자리가 첫 열 폭이다.
        expect(Math.abs(parseFloat(read.leftVar) - read.firstWidth), detail).toBeLessThanOrEqual(1)
      } else {
        expect(read.stickies, detail).toBe(0)
      }
    },
  )

  it.each(['기본테마', 'SDK'] as const)('%s — 사본 행의 셀 틀도 원본과 같은 몫으로 선다', (theme) => {
    const read = weights[theme]!
    expect(
      read.map((r) => r.copy),
      theme,
    ).toEqual([false, true, true])
    expect(new Set(read.map((r) => r.width)).size, JSON.stringify(read)).toBe(1)
    expect(new Set(read.map((r) => r.flex)).size, JSON.stringify(read)).toBe(1)
  })
})
