/**
 * **폼 표(`FormTable`)와 열을 정한 조회 폼이 시스템 테마에서 쌍 격자로 서는가** — 실브라우저 판(내보낸 번들). 칸 흐름의 셈은 jsdom
 * (`packages/theme-sdk/test/pair-rows.test.ts` · `packages/renderer/test/form-table.test.tsx`)이 잰다 — 여기서는 격자가 그 차례를 **상자로** 그리는지다.
 *
 * | 케이스 | 판 | 재는 값 |
 * |---|---|---|
 * | 칸 흐름 | 문서 폭 1280 · 1 · 2 · 3 · 4 열(전폭 · 몫이 열을 넘는 자르기 · 끝 빈 쌍 · 넓은 칸 앞 구멍) · 옆 칸 | 줄마다 선 칸 차례(위 좌표로 묶음) · 전폭 칸이 칸 폭 전부 |
 * | 열 맞춤 | 같은 판 | 표마다 라벨 칸 · 값 칸 왼끝이 열 수만큼만 갈린다 · 값 칸이 라벨 칸 오른쪽 같은 줄 |
 * | 키 큰 줄 | 같은 판(여러 줄 값) | 같은 줄 라벨 칸 높이 = 값 칸 높이 |
 * | 빈 쌍 | 같은 판 | 라벨 바탕이 필드 라벨 칸과 같고 두 조각이 줄 높이를 채운다 |
 * | 옆 칸 · 머리줄 | 같은 판 | 옆 칸이 칸 왼쪽에서 위 · 아래 끝이 칸과 같다 · 제목은 왼끝 · 머리 오른쪽은 오른끝 |
 * | 필수 별 | 같은 판 | 라벨 앞(`::before`) |
 * | 조회 폼(Q1) | 열을 정한 판 · 안 정한 판 | 정한 판은 라벨이 값 왼쪽 같은 줄 · 열 맞춤 · 안 정한 판은 라벨 위 |
 * | 좁은 창 | 창 390 · 화면 모드(`#wb-screen`) | 한 줄에 쌍 하나 · 라벨 위 · 빈 쌍 숨김 · 옆 칸 위 · 글자 넘침 0(글자 노드 사각) |
 * | PPTX | 표만 든 페이지 | 화면 이미지 한 장 · 칸 선 색의 긴 가로 줄 수 |
 *
 * 긴 라벨(«필수 · 가입 경로 및 추천인 정보»)이 라벨 칸 안에서 몇 줄인지는 로그로만 남긴다 — 표 칸 안에서 꺾이는 라벨은 줄이 커질 뿐이다.
 * `WB_FORM_TABLE_SHOTS=<디렉터리>` 를 주면 1280 · 390 을 한 장씩 남긴다.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, layoutProject, openBundlePage } from './layout-bundle'
import { decodePng } from './png-pixels'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEME = 'system-admin'
const SHOTS = process.env.WB_FORM_TABLE_SHOTS
const LONG_WORD = 'hong.gildong.very.long.account@examplecompany.co.kr'

const input = (id: string, props: Record<string, unknown> = {}) => ({ id, type: 'Input', props })
const field = (id: string, label: string, pieces: unknown[] = [input(`${id}_i`)], more: Record<string, unknown> = {}) => ({
  id,
  type: 'Field',
  props: { label, ...((more.props as object | undefined) ?? {}) },
  children: pieces,
  ...(more.weight === undefined ? {} : { weight: more.weight }),
})
const required = { props: { required: true } }
const table = (id: string, columns: number | undefined, children: unknown[], more: Record<string, unknown> = {}) => ({
  id,
  type: 'FormTable',
  props: { ...(columns === undefined ? {} : { columns }), ...((more.props as object | undefined) ?? {}) },
  children,
  ...(more.zones === undefined ? {} : { zones: more.zones }),
})

const TABLES = [
  table('t1', undefined, [
    field('t1a', '이름', undefined, required),
    field('t1b', '이메일'),
    field('t1c', '소개', [{ id: 't1c_i', type: 'TextArea', props: { rows: 4 } }]),
  ]),
  table('t2', 2, [
    field('t2a', '아이디'),
    field('t2b', '가입 경로 및 추천인 정보', [{ id: 't2b_i', type: 'Text', props: { content: LONG_WORD } }], required),
    field('t2c', '상태', [{ id: 't2c_i', type: 'Select', props: {} }]),
    field('t2d', '비고', [{ id: 't2d_i', type: 'TextArea', props: { rows: 2 } }], { weight: 2 }),
    field('t2e', '등급'),
  ]),
  table('t3', 3, [
    field('t3a', '가'),
    field('t3b', '나'),
    field('t3c', '다'),
    field('t3d', '라', undefined, { weight: 5 }),
    field('t3e', '마'),
  ]),
  table('t4', 4, [
    field('t4a', '가'),
    field('t4b', '나'),
    field('t4c', '다'),
    field('t4d', '라'),
    field('t4e', '마'),
    field('t4f', '바', undefined, { weight: 2 }),
  ]),
  table(
    't5',
    2,
    [
      field('t5a', '이름'),
      field('t5b', '생년월일', [{ id: 't5b_i', type: 'DateInput', props: {} }]),
      field('t5c', '소속'),
      field('t5d', '직급'),
    ],
    {
      props: { title: '계정상태 정보' },
      zones: {
        headEnd: [{ id: 't5_btn', type: 'Button', props: { label: '처리이력조회' } }],
        aside: [{ id: 't5_photo', type: 'Placeholder', props: { label: '사진' } }],
      },
    },
  ),
]
const SEARCH = [
  {
    id: 's1',
    type: 'SearchForm',
    props: { columns: 2 },
    children: [field('s1a', '검색어'), field('s1b', '상태'), field('s1c', '기간', undefined, { weight: 2 })],
  },
  { id: 's0', type: 'SearchForm', props: {}, children: [field('s0a', '검색어'), field('s0b', '상태')] },
]
const COLUMNS: Record<string, number> = { t1: 1, t2: 2, t3: 3, t4: 4, t5: 2, s1: 2 }
const LAYOUT: Record<string, string> = {
  t1: 't1a | t1b | t1c',
  t2: 't2a t2b | t2c _ | t2d | t2e _',
  t3: 't3a t3b t3c | t3d | t3e _ _',
  t4: 't4a t4b t4c t4d | t4e t4f _',
  t5: 't5a t5b | t5c t5d',
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}
interface Cell {
  id: string
  box: Rect
  label: Rect | null
  value: Rect | null
  labelBg: string | null
  display: string
  star: string | null
}
interface Measured {
  root: Rect
  cells: Rect
  list: Cell[]
  aside: Rect | null
  header: Rect | null
  title: Rect | null
  headEnd: Rect | null
}

/** 표 · 조회 폼마다 칸의 상자. 글로 넘긴다 — vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게. */
const MEASURE = `(ids) => {
  const box = (el) => {
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  }
  const out = {}
  for (const id of ids) {
    const root = document.querySelector('[data-wb-id="' + id + '"]')
    if (root === null) { out[id] = null; continue }
    const cellsEl = root.querySelector(':scope > [data-wb-part="cells"], :scope > [data-wb-part="fields"]')
    const list = [...cellsEl.children].map((el) => {
      const label = el.querySelector(':scope > [data-wb-part="label"]')
      const value = el.querySelector(':scope > [data-wb-part="value"]')
      return {
        id: el.getAttribute('data-wb-id') ?? (el.getAttribute('data-wb-part') === 'filler' ? '_' : '?'),
        box: box(el),
        label: box(label),
        value: box(value),
        labelBg: label === null ? null : getComputedStyle(label).backgroundColor,
        display: getComputedStyle(el).display,
        star: label === null ? null : getComputedStyle(label, '::before').content,
      }
    })
    const part = (selector) => box(root.querySelector(selector))
    out[id] = {
      root: box(root),
      cells: box(cellsEl),
      list,
      aside: part(':scope > [data-wb-part="aside"]'),
      header: part(':scope > [data-wb-part="header"]'),
      title: part(':scope > [data-wb-part="header"] > [data-wb-part="title"]'),
      headEnd: part(':scope > [data-wb-part="header"] > [data-wb-part="headEnd"]'),
    }
  }
  return out
}`

/** 표 안 글자 노드의 사각 — 문서 폭 밖으로 나간 오른끝 · 긴 라벨의 줄 수. */
const TEXTS = `(ids) => {
  const vw = document.documentElement.clientWidth
  let right = 0
  let count = 0
  for (const id of ids) {
    const root = document.querySelector('[data-wb-id="' + id + '"]')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      if ((text.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(text)
      for (const r of range.getClientRects()) if (r.width > 0) { right = Math.max(right, r.right); count += 1 }
    }
  }
  const label = document.querySelector('[data-wb-id="t2b"] > [data-wb-part="label"]')
  const range = document.createRange()
  range.selectNodeContents(label.firstChild)
  const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)))
  return { vw, right, count, labelLines: tops.size }
}`

const ALL = [...TABLES, ...SEARCH].map((node) => node.id)
const near = (a: number, b: number, slack = 1) => Math.abs(a - b) <= slack

/** 보이는 칸을 위 좌표로 묶은 줄 — `a b | c _`. */
function layoutOf(m: Measured): string {
  const rows: { top: number; ids: string[] }[] = []
  for (const cell of m.list) {
    if (cell.display === 'none' || cell.box.width === 0) continue
    const row = rows.find((entry) => near(entry.top, cell.box.top))
    if (row === undefined) rows.push({ top: cell.box.top, ids: [cell.id] })
    else row.ids.push(cell.id)
  }
  return rows.map((row) => row.ids.join(' ')).join(' | ')
}

/** 서로 다른 값의 수(± 0.5). */
function distinct(values: number[]): number {
  const seen: number[] = []
  for (const value of values) if (!seen.some((other) => near(other, value, 0.5))) seen.push(value)
  return seen.length
}

describe.skipIf(!전제.ok)('시스템 테마 — 폼 표 · 쌍 격자', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string
  let pptxProject: string
  let wide: Record<string, Measured>
  let narrow: Record<string, Measured>
  let texts: {
    wide: { vw: number; right: number; count: number; labelLines: number }
    narrow: { vw: number; right: number; count: number; labelLines: number }
  }

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    let call
    ;({ projectId, call } = await layoutProject(stack, alice, '폼', { 표: [...TABLES, ...SEARCH] }))
    await putTheme(call, projectId, { themeId: THEME, version: seededVersion(THEME), tokens: {} })
    const pptx = await layoutProject(stack, alice, '표만', { 표: TABLES.slice(0, 2) })
    pptxProject = pptx.projectId
    await putTheme(pptx.call, pptxProject, { themeId: THEME, version: seededVersion(THEME), tokens: {} })
    const bundle = await exportBundle(stack, alice, projectId)
    try {
      const read = async (viewport: { width: number; height: number }, more: { docWidth?: number; screen?: boolean }, shot: string) => {
        const { context, page } = await openBundlePage(stack, bundle.pages['폼-표']!, { viewport, ...more })
        try {
          if (SHOTS !== undefined) await snap(page, join(SHOTS, shot))
          return {
            boxes: (await page.evaluate(`(${MEASURE})(${JSON.stringify(ALL)})`)) as Record<string, Measured>,
            texts: (await page.evaluate(`(${TEXTS})(${JSON.stringify(TABLES.map((node) => node.id))})`)) as typeof texts.wide,
          }
        } finally {
          await context.close()
        }
      }
      if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
      const a = await read({ width: 1980, height: 2400 }, { docWidth: 1280 }, 'form-table-1280.png')
      const b = await read({ width: 390, height: 3200 }, { screen: true }, 'form-table-390.png')
      wide = a.boxes
      narrow = b.boxes
      texts = { wide: a.texts, narrow: b.texts }
    } finally {
      bundle.dispose()
    }
    for (const [id, m] of [...Object.entries(wide), ...Object.entries(narrow)]) if (m === null) throw new Error(`${id} 가 안 그려졌다`)
    // eslint-disable-next-line no-console
    console.log(
      `[폼 표] 긴 라벨 줄 수 1280=${texts.wide.labelLines} 390=${texts.narrow.labelLines} · 글자 오른끝 390=${texts.narrow.right}/${texts.narrow.vw}`,
    )
  }, 240_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  it('칸 흐름 — 줄 끝 · 넓은 칸 앞에 빈 쌍 · 전폭(몫 ≥ 열)과 자른 몫이 칸 폭 전부', () => {
    const got = Object.fromEntries(Object.keys(LAYOUT).map((id) => [id, layoutOf(wide[id]!)]))
    expect(got).toEqual(LAYOUT)
    for (const id of ['t2d', 't3d']) {
      const owner = wide[id.slice(0, 2)]!
      const cell = owner.list.find((entry) => entry.id === id)!
      const first = owner.list[0]!
      expect(
        [near(cell.box.left, first.box.left), near(cell.box.right, owner.cells.right)],
        `${id} ${JSON.stringify(cell.box)} ${JSON.stringify(owner.cells)}`,
      ).toEqual([true, true])
    }
  })

  it('열 맞춤 — 라벨 칸 · 값 칸 왼끝이 열 수만큼만 갈리고 값 칸은 라벨 칸 오른쪽 같은 줄이다', () => {
    const bad: string[] = []
    for (const id of ['t2', 't3', 't4', 't5']) {
      const fields = wide[id]!.list.filter((cell) => cell.id !== '_' && cell.label !== null && cell.value !== null)
      const labels = distinct(fields.map((cell) => cell.label!.left))
      const values = distinct(fields.map((cell) => cell.value!.left))
      if (labels !== COLUMNS[id] || values !== COLUMNS[id]) bad.push(`${id} 라벨 ${labels} · 값 ${values} · 열 ${COLUMNS[id]}`)
      for (const cell of fields) {
        if (!(cell.value!.left >= cell.label!.right - 0.5 && near(cell.value!.top, cell.label!.top, 0.5)))
          bad.push(`${cell.id} ${JSON.stringify([cell.label, cell.value])}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('키 큰 줄 — 여러 줄 값이 든 줄의 라벨 칸이 값 칸 높이를 따라 늘어난다', () => {
    const tall = ['t1c', 't2d'].map((id) => wide[id.slice(0, 2)]!.list.find((cell) => cell.id === id)!)
    // 카나리아 — 그 줄이 실제로 키가 크다(한 줄 필드보다).
    const single = wide.t1!.list.find((cell) => cell.id === 't1b')!
    expect(
      tall.map((cell) => cell.value!.height > single.value!.height + 10),
      JSON.stringify([tall, single]),
    ).toEqual([true, true])
    expect(tall.map((cell) => near(cell.label!.height, cell.value!.height))).toEqual([true, true])
  })

  it('빈 쌍 — 라벨 바탕이 필드 라벨 칸과 같고 두 조각이 그 줄 높이를 채운다', () => {
    const fillers = ['t2', 't3', 't4'].flatMap((id) => wide[id]!.list.filter((cell) => cell.id === '_'))
    expect(fillers.length).toBe(2 + 2 + 1)
    const fieldBg = wide.t2!.list.find((cell) => cell.id === 't2a')!.labelBg
    expect(fieldBg).not.toBe('rgba(0, 0, 0, 0)')
    const bad = fillers.filter(
      (cell) => cell.labelBg !== fieldBg || !near(cell.label!.height, cell.box.height) || !near(cell.value!.height, cell.box.height),
    )
    expect(bad).toEqual([])
  })

  it('옆 칸 · 머리줄 — 옆 칸은 칸 왼쪽에서 위 · 아래 끝이 칸과 같고 · 제목은 왼끝 · 머리 오른쪽은 오른끝', () => {
    const t5 = wide.t5!
    expect({
      asideLeft: t5.aside!.right <= t5.cells.left + 0.5,
      // 라벨 칸 폭(8rem) 이상 — 안의 자리표시자가 글 폭으로 줄지 않는다.
      asideWide: t5.aside!.width >= 128,
      asideTop: near(t5.aside!.top, t5.cells.top),
      asideBottom: near(t5.aside!.bottom, t5.cells.bottom),
      title: near(t5.title!.left, t5.root.left),
      headEnd: near(t5.headEnd!.right, t5.root.right),
      above: t5.header!.bottom <= t5.cells.top + 0.5,
    }).toEqual({ asideLeft: true, asideWide: true, asideTop: true, asideBottom: true, title: true, headEnd: true, above: true })
  })

  it('필수 별은 라벨 앞이다', () => {
    const star = (id: string) => wide[id.slice(0, 2)]!.list.find((cell) => cell.id === id)!.star
    expect([star('t1a'), star('t2b'), star('t1b')]).toEqual(['"* "', '"* "', 'none'])
  })

  it('조회 폼(Q1) — 열을 정한 판은 라벨이 값 왼쪽 같은 줄 · 열 맞춤 · 안 정한 판은 라벨 위', () => {
    const fields = wide.s1!.list
    expect(layoutOf(wide.s1!)).toBe('s1a s1b | s1c')
    const s1c = fields.find((cell) => cell.id === 's1c')!
    const left = (cell: Cell) =>
      cell.label!.right <= cell.value!.left + 0.5 &&
      near(cell.label!.top + cell.label!.height / 2, cell.value!.top + cell.value!.height / 2)
    expect({
      leftOf: fields.every(left),
      labels: distinct(fields.map((cell) => cell.label!.left)),
      values: distinct(fields.map((cell) => cell.value!.left)),
      wide: near(s1c.box.right, wide.s1!.cells.right),
      plainAbove: wide.s0!.list.every((cell) => cell.label!.bottom <= cell.value!.top + 0.5),
    }).toEqual({ leftOf: true, labels: 2, values: 2, wide: true, plainAbove: true })
  })

  it('좁은 창(390 · 화면 모드) — 한 줄에 쌍 하나 · 라벨 위 · 빈 쌍 숨김 · 옆 칸 위 · 글자 넘침 0', () => {
    // 카나리아 — 문서가 창 폭을 받았다(셸이 서면 문서 칸이 0 으로 눌린다).
    expect(texts.narrow.vw).toBe(390)
    expect(narrow.t2!.cells.width).toBeGreaterThan(300)
    const bad: string[] = []
    for (const id of Object.keys(LAYOUT)) {
      const m = narrow[id]!
      const shown = m.list.filter((cell) => cell.display !== 'none')
      if (m.list.some((cell) => cell.id === '_' && cell.display !== 'none')) bad.push(`${id} 빈 쌍이 선다`)
      if (distinct(shown.map((cell) => cell.box.left)) !== 1) bad.push(`${id} 한 줄에 쌍 하나가 아니다`)
      for (const cell of shown) if (cell.label!.bottom > cell.value!.top + 0.5) bad.push(`${cell.id} 라벨이 위가 아니다`)
    }
    if (narrow.t5!.aside!.bottom > narrow.t5!.cells.top + 0.5) bad.push('옆 칸이 칸 위가 아니다')
    expect(texts.narrow.count).toBeGreaterThan(20)
    if (texts.narrow.right > texts.narrow.vw + 0.5) bad.push(`글자 오른끝 ${texts.narrow.right}`)
    expect(bad).toEqual([])
  })

  it('PPTX — 표만 든 페이지가 화면 이미지 한 장이고 칸 선이 가로 줄로 선다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${pptxProject}/export?format=pptx`, { headers: { cookie: alice.cookie } })
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const shots = Object.entries(entries).filter(([path]) => path.startsWith('ppt/media/') && path.endsWith('.png'))
    expect(shots.length).toBe(1)
    const pixels = decodePng(Buffer.from(shots[0]![1]))
    // 칸 선(`semantic.border` #e2e8f0)의 가로 줄 — 한 줄에서 그 색이 이어진 길이가 폭의 절반을 넘는 줄 수. 표 둘(3 + 4 줄 · 바깥 선 포함)이면 여럿이다.
    let lines = 0
    for (let y = 0; y < pixels.height; y++) {
      let run = 0
      let best = 0
      for (let x = 0; x < pixels.width; x++) {
        const [r, g, b] = pixels.at(x, y)
        run = Math.abs(r - 226) <= 3 && Math.abs(g - 232) <= 3 && Math.abs(b - 240) <= 3 ? run + 1 : 0
        best = Math.max(best, run)
      }
      if (best > pixels.width / 2) lines += 1
    }
    // eslint-disable-next-line no-console
    console.log(`[폼 표] PPTX ${pixels.width}×${pixels.height} 가로 줄 ${lines}`)
    expect(lines).toBeGreaterThanOrEqual(8)
  }, 120_000)
})

async function snap(page: Page, path: string): Promise<void> {
  await page.screenshot({ path, fullPage: true })
}
