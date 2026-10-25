/**
 * **그리드를 에디터에서 쓸 수 있는가** — 실브라우저 판(설계 spec `2026-10-25-grid-design.md` «8» · 브리프 «GR-A 만으로도 에디터에서 쓸 수 있어야 한다»).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 트리 · 캔버스 | 구조 트리에 그리드의 구역 줄(«열» · «행» · «바닥»)과 열 · 행 줄이 선다 · 사본 칸을 누르면 그리드를 고른다(사본은 `data-wb-id` 가 없다 — 가장 가까운 노드) · 셀 틀 글의 노드 id 가 캔버스에 한 번이다 |
 * | 열 더하기 | 그리드를 골라 팔레트 «열» 이 그리드 «열» 끝에 서고 · 열을 골라 Cmd+D 가 셀 틀째 복제한다 |
 * | 비용(위험 3) | 행 × 열 10×3 · 50×3 · 10×10 · 50×10 — 판을 열어 그리드가 다 서기까지 · 열 머리 이름을 고쳐 캔버스에 서기까지의 시간과 그 동안의 긴 작업. 기계마다 달라 상한을 단언하지 않는다(`./canvas-cost.test.ts` 와 같다) |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
  marker?: number
}

/** 행 `rows` 줄 · 열 `cols` 개(셀 틀 글 하나씩) 그리드. 첫 열의 셀 틀 글에 표지 1. */
function gridOf(gridId: string, rows: number, cols: number): Node {
  return {
    id: gridId,
    type: 'DataGrid',
    children: Array.from({ length: cols }, (_unused, at) => ({
      id: `${gridId}_c${at}`,
      type: 'GridColumn',
      props: { label: `열 ${at + 1}` },
      children: [{ id: `${gridId}_t${at}`, type: 'Text', props: { content: `값 ${at + 1}` }, ...(at === 0 ? { marker: 1 } : {}) }],
    })),
    zones: { rows: [{ id: `${gridId}_r`, type: 'GridRow', props: { repeat: rows } }], footer: [{ id: `${gridId}_p`, type: 'Pagination' }] },
  }
}

describe.skipIf(!전제.ok)('그리드 — 에디터(실브라우저)', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function seed(slug: string, nodes: Node[]): Promise<{ P: string }> {
    const project = (await call('POST', '/projects', { name: '그리드', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P }
  }

  const server = async (P: string): Promise<Node> => (await call('GET', P)).body.schema.root as Node
  const treeRow = (page: Page, nodeId: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${nodeId}"]`)
  const zoneRow = (page: Page, parentId: string, zone: string) =>
    page.locator(`${TREE} [data-tree-zone-row][data-tree-zone-parent="${parentId}"][data-tree-zone-name="${zone}"]`)
  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  async function open(P: string, ready: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  it('트리에 구역 줄 · 열 · 행 줄이 서고 · 사본 칸을 누르면 그리드를 고르고 · 셀 틀 글의 노드 id 는 캔버스에 한 번이다', async () => {
    const { P } = await seed('grid-tree', [gridOf('g_a', 3, 2)])
    const { page, close } = await open(P, 'g_a')
    try {
      for (const zone of ['body', 'rows', 'footer']) expect(await zoneRow(page, 'g_a', zone).count(), zone).toBe(1)
      for (const nodeId of ['g_a_c0', 'g_a_c1', 'g_a_r', 'g_a_p', 'g_a_t0']) expect(await treeRow(page, nodeId).count(), nodeId).toBe(1)
      // 사본 칸(둘째 줄의 첫 칸)을 누른다 — 가장 가까운 노드는 그리드다(사본 → 원본 고르기는 GR-B).
      const copyCell = canvasFrame(page).locator('[data-wb-copy-of="g_a_r"]').first().locator('td').nth(0)
      await copyCell.click()
      await poll(
        '사본 누름이 무언가를 고른다',
        () => selected(page),
        (id) => id !== null,
      )
      expect(await selected(page)).toBe('g_a')
      // 셀 틀 글의 노드 id 는 캔버스에 한 번이다(사본 둘은 `data-wb-copy-of`) — 원본 줄의 그 글을 누르면 그 글을 고른다(대조).
      expect(await canvasFrame(page).locator('[data-wb-id="g_a_t0"]').count()).toBe(1)
      expect(await canvasFrame(page).locator('[data-wb-copy-of="g_a_t0"]').count()).toBe(2)
      await canvasFrame(page).locator('[data-wb-id="g_a_t0"]').click()
      await poll(
        '원본 글을 고른다',
        () => selected(page),
        (id) => id === 'g_a_t0',
      )
    } finally {
      await close()
    }
  })

  it('그리드를 골라 팔레트 «열» 은 그리드 «열» 끝에 서고 · 열을 골라 Cmd+D 는 셀 틀째 복제한다', async () => {
    const { P } = await seed('grid-add', [gridOf('g_b', 2, 2)])
    const { page, close } = await open(P, 'g_b')
    const columns = async () =>
      ((await server(P)).children![0]!.children ?? []).map((node) => node.type + ':' + (node.children ?? []).length)
    try {
      await treeRow(page, 'g_b').locator('button').first().click()
      await poll(
        '그리드를 골랐다',
        () => selected(page),
        (id) => id === 'g_b',
      )
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('열')
      await page.locator('[data-wb-palette-card="GridColumn"] .wb-shell-palette-add').click()
      // 새 열은 셀 틀(글 하나)을 들고 «열» 끝에 선다.
      expect(await poll('팔레트 «열» 이 서버에 닿는다', columns, (list) => list.length === 3)).toEqual([
        'GridColumn:1',
        'GridColumn:1',
        'GridColumn:1',
      ])
      await treeRow(page, 'g_b_c0').locator('button').first().click()
      await poll(
        '열을 골랐다',
        () => selected(page),
        (id) => id === 'g_b_c0',
      )
      await page.keyboard.press('ControlOrMeta+d')
      const after = await poll(
        'Cmd+D 가 서버에 닿는다',
        () => server(P),
        (root) => (root.children![0]!.children ?? []).length === 4,
      )
      const cols = after.children![0]!.children!
      // 바로 뒤에 같은 이름 · 같은 셀 틀(새 id)로 선다.
      expect([cols[1]!.props?.label, cols[1]!.children!.map((child) => child.props?.content)]).toEqual(['열 1', ['값 1']])
      expect(cols[1]!.id).not.toBe('g_b_c0')
    } finally {
      await close()
    }
  })

  /**
   * **위험 3 — 사본 비용.** 판을 열어 그리드의 마지막 사본 줄이 서기까지(`goto` 부터) · 첫 열의 «머리 이름» 을 고쳐 Enter 부터 캔버스의 머리 칸이 새
   * 이름이 되기까지의 시간(ms)과 그 사이 긴 작업(50ms 넘는 일)의 합. 축마다 한 값 이상 — 행만 늘린 판 · 열만 늘린 판 · 둘 다 늘린 판.
   */
  it('비용 — 행 × 열 10×3 · 50×3 · 10×10 · 50×10 에서 열기 · 머리 이름 고치기의 시간을 적는다', async () => {
    const SIZES = [
      [10, 3],
      [50, 3],
      [10, 10],
      [50, 10],
    ] as const
    const out: Record<string, { open: number; edit: number; longTasks: number; copies: number }> = {}
    for (const [rows, cols] of SIZES) {
      const gridId = `g_${rows}x${cols}`
      const { P } = await seed(`grid-cost-${rows}x${cols}`, [gridOf(gridId, rows, cols)])
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        const started = Date.now()
        await page.goto(P)
        const lastCopy = canvasFrame(page)
          .locator(`[data-wb-copy-of="${gridId}_r"]`)
          .nth(rows - 2)
        await lastCopy.waitFor({ state: 'attached', timeout: 30_000 })
        const opened = Date.now() - started
        const copies = await canvasFrame(page).locator(`[data-wb-copy-of="${gridId}_r"]`).count()
        await treeRow(page, `${gridId}_c0`).locator('button').first().click()
        await poll(
          '열을 골랐다',
          () => selected(page),
          (id) => id === `${gridId}_c0`,
        )
        const field = page.getByLabel('머리 이름', { exact: true })
        await field.fill('바뀐 머리')
        // 긴 작업을 세는 관찰자를 캔버스 창에도 건다 — 그리기는 캔버스 iframe 에서 돈다.
        await page.evaluate(() => {
          const w = window as unknown as { __long: number }
          w.__long = 0
          const watch = (target: Window) =>
            new target.PerformanceObserver((list) => list.getEntries().forEach((entry) => (w.__long += entry.duration))).observe({
              type: 'longtask',
            })
          watch(window)
          const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')?.contentWindow
          if (frame !== null && frame !== undefined) watch(frame)
        })
        const editStarted = Date.now()
        await field.press('Enter')
        await canvasFrame(page).locator(`[data-wb-id="${gridId}_c0"]`).filter({ hasText: '바뀐 머리' }).waitFor({ timeout: 30_000 })
        const edited = Date.now() - editStarted
        const longTasks = Math.round(await page.evaluate(() => (window as unknown as { __long: number }).__long))
        out[`${rows}x${cols}`] = { open: opened, edit: edited, longTasks, copies }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[그리드 비용] ${JSON.stringify(out)}`)
    // 판 카나리아 — 사본이 다 섰다(되풀이 − 1).
    expect(Object.entries(out).map(([key, value]) => `${key}:${value.copies}`)).toEqual(
      SIZES.map(([rows, cols]) => `${rows}x${cols}:${rows - 1}`),
    )
  }, 240_000)
})
