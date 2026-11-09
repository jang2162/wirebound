/**
 * **그리드 행 — 안에 다른 그리드를 둔 셀 틀 · 행 손잡이(실브라우저 판).** `grid-row-pick.test.ts` 가 재지 않은 둘이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 안쪽 그리드 | 바깥 셀 틀 칸 안에 둔 그리드의 칸을 눌러(바깥 첫 줄 · 바깥 사본 줄) 안쪽 행이 아니라 다른 것이 골라진다 — 가장 가까운 칸이 이긴다(`src/canvas/canvas.tsx` 의 `nodeIdAt`). 안쪽 그리드의 칸 밖(머리 칸 · 바깥 칸 바탕)은 바깥 줄의 답이다 |
 * | 손잡이 | 되풀이 1 · 3 행을 골랐을 때 손잡이가 외곽선 왼쪽 위(첫 줄 위끝) 바깥 22px 에 안 선다 · 손잡이로 커스텀 행의 고름 칸 뒤 띠에 끌어 놓아 행이 그 뒤로 안 옮겨진다(서버 문서) |
 * | 기본 행 곁 | 되풀이 1 · 3 행을 손잡이로 기본 행(칸 없음)의 고름 칸 앞 띠에 끌어 놓아 그 앞으로 안 옮겨진다 |
 *
 * «기본 행 곁» 은 두 장치가 함께 선다 — 칸 없는 행을 띠 셈에서 빈 컨테이너로 안 본다(`src/drag/use-placement.ts` · 보면 상자 전체가 «안» 이라 «행에는 칸만 …»),
 * 판정이 미리보기 행의 사본 줄까지 숨긴다(`src/canvas/canvas-preview.ts` 의 `withoutPreview` · 안 숨기면 되풀이 3 행의 미리보기 사본 줄이 포인터 밑에 서
 * «사본 위» 와 «그 앞» 이 번갈아 놓아도 안 놓인다 — 되풀이 1 은 사본 줄이 없어 이것과 무관하다).
 *
 * 누를 점은 `grid-row-pick.test.ts` 와 같은 셈으로 고른다(대상 상자를 4px 격자로 훑음). 누를 점을 찾는 `scrollIntoView` 가 캔버스 칸을 가로로 굴리면
 * 왼끝 노드의 손잡이가 칸 밖(왼쪽 칸 밑)에 서므로(정본 «고른 노드의 왼쪽 위가 캔버스 칸 밖으로 밀리면 손잡이도 칸 밖이다»), 손잡이를 재기 전에 칸을 왼끝으로 되돌린다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
}

const text = (id: string, content: string): Node => ({ id, type: 'Text', props: { content } })

/** 바깥 그리드(열 둘 · 첫 행 · 되풀이 2 행)의 둘째 열 셀 틀이 안쪽 그리드(열 하나 · 첫 행 · 되풀이 2 행)다. */
const NESTED: Node[] = [
  {
    id: 'm_g',
    type: 'DataGrid',
    children: [
      { id: 'm_ca', type: 'GridColumn', props: { label: '이름' }, children: [text('m_ta', '바깥 글')] },
      {
        id: 'm_cb',
        type: 'GridColumn',
        props: { label: '안' },
        children: [
          {
            id: 'm_ig',
            type: 'DataGrid',
            children: [{ id: 'm_ic', type: 'GridColumn', props: { label: '안 열' }, children: [text('m_it', '안 글')] }],
            zones: {
              rows: [
                { id: 'm_ir1', type: 'GridRow' },
                { id: 'm_ir2', type: 'GridRow', props: { repeat: 2 } },
              ],
            },
          },
        ],
      },
    ],
    zones: {
      rows: [
        { id: 'm_r1', type: 'GridRow' },
        { id: 'm_r2', type: 'GridRow', props: { repeat: 2 } },
      ],
    },
  },
  text('m_tail', '아래 글'),
]

/** 고름 칸 · 열 둘 · 첫 행(기본) · 되풀이 `repeat` 행(기본) · 커스텀 행(제 칸 둘). */
const ROWS = (repeat: number): Node[] => [
  {
    id: 'k_g',
    type: 'DataGrid',
    props: { select: 'check' },
    children: [
      { id: 'k_ca', type: 'GridColumn', props: { label: '이름' }, children: [text('k_ta', '이름 글')] },
      { id: 'k_cb', type: 'GridColumn', props: { label: '상태' }, children: [text('k_tb', '상태 글')] },
    ],
    zones: {
      rows: [
        { id: 'k_r1', type: 'GridRow' },
        { id: 'k_r2', type: 'GridRow', props: { repeat } },
        {
          id: 'k_r3',
          type: 'GridRow',
          children: [
            { id: 'k_x1', type: 'GridCell', children: [text('k_xt', '제 칸 글')] },
            { id: 'k_x2', type: 'GridCell' },
          ],
        },
      ],
    },
  },
  text('k_tail', '아래 글'),
]

/** 누를 자리 — iframe 문서의 셀렉터 · 그 몇째 · 대상 안(`in`)인가 바탕(`bg`)인가. */
interface Spot {
  selector: string
  nth?: number
  mode: 'in' | 'bg'
}

describe.skipIf(!전제.ok)('그리드 행 — 안쪽 그리드 · 손잡이 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function seed(slug: string, nodes: Node[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: '행 손잡이', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const rowsOf = async (P: string): Promise<string[]> => {
    const root = (await call('GET', P)).body.schema.root as Node
    const grid = root.children?.find((child) => child.id === 'k_g')
    return (grid?.zones?.rows ?? []).map((row) => row.id)
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1000 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  /** 누를 점(호스트 좌표) — `grid-row-pick.test.ts` 의 `pointOf` 와 같은 셈. */
  async function pointOf(page: Page, spot: Spot): Promise<{ x: number; y: number } | null> {
    return (await page.evaluate(
      async ([selector, nth, mode]) => {
        const f = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const d = f.contentDocument!
        const target = d.querySelectorAll(selector)[nth]
        if (target === undefined) return null
        target.scrollIntoView({ block: 'center', inline: 'nearest' })
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        const r = f.getBoundingClientRect()
        const scale = r.width / f.clientWidth
        const b = target.getBoundingClientRect()
        const nodeish = (el: Element) => el.hasAttribute('data-wb-id') || el.hasAttribute('data-wb-copy-of')
        for (let y = b.top + 2; y < b.bottom - 1; y += 4)
          for (let x = b.left + 2; x < b.right - 1; x += 4) {
            const hx = r.left + x * scale
            const hy = r.top + y * scale
            if (document.elementFromPoint(hx, hy) !== f) continue
            const hit = d.elementFromPoint(x, y)
            if (hit === null || !target.contains(hit)) continue
            if (mode === 'bg') {
              let between = false
              for (let at: Element | null = hit; at !== null && at !== target; at = at.parentElement) if (nodeish(at)) between = true
              if (between) continue
            }
            return { x: hx, y: hy }
          }
        return null
      },
      [spot.selector, spot.nth ?? 0, spot.mode] as const,
    )) as { x: number; y: number } | null
  }

  /** 그 자리를 누르고 골라진 id — 누르기 전에 아래 글을 골라 두고, 고름이 그것에서 바뀌기를 기다린다(안 바뀌면 그 값). */
  async function pickAt(page: Page, spot: Spot, tail: string): Promise<string | null> {
    const rest = (await pointOf(page, { selector: `[data-wb-id="${tail}"]`, mode: 'in' }))!
    await page.mouse.click(rest.x, rest.y)
    await poll(
      '아래 글을 골랐다',
      () => selected(page),
      (v) => v === tail,
    )
    const at = await pointOf(page, spot)
    // 카나리아 — 누를 점이 있다.
    expect(at, `${JSON.stringify(spot)} 를 누를 점`).not.toBeNull()
    // 같은 자리 두 번째 누름이 더블클릭으로 묶이지 않게 띄운다.
    await page.waitForTimeout(550)
    await page.mouse.click(at!.x, at!.y)
    try {
      return await poll(
        '고름이 바뀌었다',
        () => selected(page),
        (v) => v !== tail,
        3_000,
      )
    } catch {
      return selected(page)
    }
  }

  it('안쪽 그리드 — 바깥 셀 틀 칸 안 그리드의 칸은 안쪽 행이다(바깥 첫 줄 · 바깥 사본 줄)', async () => {
    const P = await seed('ms-nested', NESTED)
    const { page, close } = await open(P)
    try {
      await canvasFrame(page).locator('tr[data-wb-copy-of="m_r2"]').first().waitFor({ state: 'attached' })
      const first = 'tr[data-wb-id="m_r1"]'
      // 바깥 사본 줄 = m_r2 의 둘째 줄(안쪽 그리드는 통째 사본이다).
      const copy = 'tr[data-wb-copy-of="m_r2"]'
      const spots: Record<string, Spot> = {
        '첫 줄 · 안쪽 첫 행 칸 바탕': { selector: `${first} tr[data-wb-id="m_ir1"] td[data-wb-column-of]`, mode: 'bg' },
        '첫 줄 · 안쪽 사본 줄 칸 바탕': { selector: `${first} tr[data-wb-copy-of="m_ir2"] td[data-wb-column-of]`, mode: 'bg' },
        '첫 줄 · 안쪽 셀 틀 원본': { selector: `${first} [data-wb-id="m_it"]`, mode: 'in' },
        '첫 줄 · 안쪽 사본 줄 글': { selector: `${first} [data-wb-copy-of="m_it"]`, nth: 1, mode: 'in' },
        '첫 줄 · 안쪽 머리 칸': { selector: `${first} th[data-wb-id="m_ic"]`, mode: 'in' },
        '첫 줄 · 바깥 칸 바탕': { selector: `${first} td[data-wb-column-of="m_cb"]`, mode: 'bg' },
        '사본 줄 · 안쪽 첫 행 칸 바탕': { selector: `${copy} tr[data-wb-copy-of="m_ir1"] td[data-wb-column-of]`, mode: 'bg' },
        '사본 줄 · 안쪽 사본 줄 칸 바탕': { selector: `${copy} tr[data-wb-copy-of="m_ir2"] td[data-wb-column-of]`, nth: 1, mode: 'bg' },
        '사본 줄 · 안쪽 첫 행 글': { selector: `${copy} [data-wb-copy-of="m_it"]`, mode: 'in' },
        '사본 줄 · 안쪽 머리 칸': { selector: `${copy} th[data-wb-copy-of="m_ic"]`, mode: 'in' },
        '사본 줄 · 바깥 칸 바탕': { selector: `${copy} td[data-wb-column-of="m_cb"]`, mode: 'bg' },
      }
      const got: Record<string, string | null> = {}
      for (const [name, spot] of Object.entries(spots)) got[name] = await pickAt(page, spot, 'm_tail')
      expect(got).toEqual({
        '첫 줄 · 안쪽 첫 행 칸 바탕': 'm_ir1',
        '첫 줄 · 안쪽 사본 줄 칸 바탕': 'm_ir2',
        '첫 줄 · 안쪽 셀 틀 원본': 'm_it',
        '첫 줄 · 안쪽 사본 줄 글': 'm_ir2',
        '첫 줄 · 안쪽 머리 칸': 'm_ic',
        '첫 줄 · 바깥 칸 바탕': 'm_r1',
        '사본 줄 · 안쪽 첫 행 칸 바탕': 'm_ir1',
        '사본 줄 · 안쪽 사본 줄 칸 바탕': 'm_ir2',
        '사본 줄 · 안쪽 첫 행 글': 'm_ir1',
        // 안쪽 머리 칸의 사본은 바깥 틀 칸 안의 사본 조각이다 — 바깥 줄의 행(`grid-row-pick` «흐름» 과 같은 갈래).
        '사본 줄 · 안쪽 머리 칸': 'm_r2',
        '사본 줄 · 바깥 칸 바탕': 'm_r2',
      })
    } finally {
      await close()
    }
  })

  /** 행 `k_r2` 를 캔버스에서 고르고 칸을 왼끝으로 되돌린 뒤 손잡이 · 외곽선 · 그 행의 줄을 돌려준다. */
  async function pickRow(page: Page) {
    expect(await pickAt(page, { selector: 'tr[data-wb-id="k_r2"] td[data-wb-column-of]', mode: 'bg' }, 'k_tail')).toBe('k_r2')
    await page.evaluate(() => document.querySelector('.wb-shell-canvas')!.scrollTo({ left: 0 }))
    const handle = page.locator('.wb-shell-canvas-handle')
    await handle.waitFor()
    const mark = page.locator('.wb-shell-selection')
    const lines = canvasFrame(page).locator('tbody > tr[data-wb-id="k_r2"], tbody > tr[data-wb-copy-of="k_r2"]')
    // 칸을 되돌린 뒤 외곽선이 다시 잰 자리(첫 줄 위)에 서기를 기다린다.
    await poll(
      '외곽선이 첫 줄에 섰다',
      async () => [(await mark.boundingBox())!, (await lines.first().boundingBox())!] as const,
      ([m, f]) => Math.abs(m.x - f.x) < 1 && Math.abs(m.y - f.y) < 1,
    )
    return { handle, mark: (await mark.boundingBox())!, lines }
  }

  /** 손잡이를 쥐고 `to()` 의 점에 놓는다. 놓기 직전의 거절 문장을 돌려준다. */
  async function dragHandle(page: Page, to: () => Promise<{ x: number; y: number }>): Promise<string[]> {
    const hb = (await page.locator('.wb-shell-canvas-handle').boundingBox())!
    // 카나리아 — 손잡이 가운데의 맨 위가 손잡이다(칸 밖이면 왼쪽 칸이 누름을 받는다).
    expect(
      await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.wb-shell-canvas-handle') != null, [
        hb.x + hb.width / 2,
        hb.y + hb.height / 2,
      ] as const),
    ).toBe(true)
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2 + 3, hb.y + hb.height / 2 + 6, { steps: 3 })
    await dragLayoutSettled(page)
    // 점은 끌기가 선 뒤(빈 구역 칸이 판을 민 뒤) 한 번만 잰다 — 미리보기가 서면 대상이 밀리므로, 다시 재면 포인터가 미리보기에 밀린 자리로 따라간다.
    const point = await to()
    await page.mouse.move(point.x, point.y, { steps: 12 })
    await page.mouse.move(point.x + 1, point.y, { steps: 1 })
    await page.waitForTimeout(200)
    const refusal = await page.locator('.wb-shell-drop-refusal').allTextContents()
    await page.mouse.up()
    return refusal
  }

  /** 행의 고름 칸 안 세로 `at`(0 ~ 1) 자리 — 호스트 좌표. */
  const selectCell = (page: Page, row: string, at: number) => async () => {
    const box = (await canvasFrame(page).locator(`tr[data-wb-id="${row}"] td[data-wb-cell="select"]`).boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height * at }
  }

  const moved = (P: string) =>
    poll(
      '옮겨졌다',
      () => rowsOf(P),
      (ids) => ids.join() !== 'k_r1,k_r2,k_r3',
      5_000,
    ).catch(() => rowsOf(P))

  it('손잡이 — 되풀이 1 · 3 행의 손잡이는 첫 줄 왼쪽 위 바깥에 서고, 커스텀 행 뒤로 끌어 놓으면 그 뒤로 옮겨진다', async () => {
    const got: Record<string, unknown> = {}
    for (const repeat of [1, 3]) {
      const P = await seed(`ms-handle-${repeat}`, ROWS(repeat))
      const { page, close } = await open(P)
      try {
        await canvasFrame(page).locator('tr[data-wb-id="k_r3"]').waitFor({ state: 'attached' })
        const { handle, mark, lines } = await pickRow(page)
        const hb = (await handle.boundingBox())!
        const last = (await lines.last().boundingBox())!
        // 손잡이는 외곽선 왼쪽 위에서 22px 바깥(`canvas-drag-handle.tsx` 의 `OUTSIDE` · 줌 1). 외곽선은 그 행의 N 줄을 덮는다.
        const handleAt = { dx: Math.round(mark.x - hb.x), dy: Math.round(mark.y - hb.y) }
        const covers = { 줄수: await lines.count(), 아래: Math.abs(mark.y + mark.height - (last.y + last.height)) <= 3 }
        const refusal = await dragHandle(page, selectCell(page, 'k_r3', 0.85))
        got[`되풀이 ${repeat}`] = { handleAt, covers, refusal, rows: await moved(P) }
      } finally {
        await close()
      }
    }
    expect(got).toEqual({
      '되풀이 1': { handleAt: { dx: 22, dy: 22 }, covers: { 줄수: 1, 아래: true }, refusal: [], rows: ['k_r1', 'k_r3', 'k_r2'] },
      '되풀이 3': { handleAt: { dx: 22, dy: 22 }, covers: { 줄수: 3, 아래: true }, refusal: [], rows: ['k_r1', 'k_r3', 'k_r2'] },
    })
  })

  it('기본 행 곁 — 되풀이 1 · 3 행을 손잡이로 기본 행의 고름 칸 앞 띠에 놓으면 그 앞으로 옮겨진다', async () => {
    const got: Record<string, unknown> = {}
    for (const repeat of [1, 3]) {
      const P = await seed(`ms-basic-target-${repeat}`, ROWS(repeat))
      const { page, close } = await open(P)
      try {
        await canvasFrame(page).locator('tr[data-wb-id="k_r3"]').waitFor({ state: 'attached' })
        await pickRow(page)
        const refusal = await dragHandle(page, selectCell(page, 'k_r1', 0.15))
        got[`되풀이 ${repeat}`] = { refusal, rows: await moved(P) }
      } finally {
        await close()
      }
    }
    expect(got).toEqual({
      '되풀이 1': { refusal: [], rows: ['k_r2', 'k_r1', 'k_r3'] },
      '되풀이 3': { refusal: [], rows: ['k_r2', 'k_r1', 'k_r3'] },
    })
  })
})
