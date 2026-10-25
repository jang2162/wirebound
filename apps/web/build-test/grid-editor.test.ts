/**
 * **그리드를 에디터에서 쓸 수 있는가** — 실브라우저 판(설계 spec `2026-10-25-grid-design.md` «8» · 브리프 «GR-A 만으로도 에디터에서 쓸 수 있어야 한다»).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 사본 → 원본(H1) | 구조 트리에 그리드의 구역 줄(«열» · «행» · «바닥»)과 열 · 행 줄이 선다 · 사본(칸 · 조각 · 행)을 누르면 그 원본을 고르고 Delete · Cmd+D · Cmd+V · 범위 선택이 원본에 걸린다 · 틀 칸 빈 자리는 그 열이다 · 남이 원본을 쥐면 사본 누름도 막힌다 |
 * | 열 더하기 | 그리드를 골라 팔레트 «열» 이 그리드 «열» 끝에 서고 · 열을 골라 Cmd+D 가 셀 틀째 복제한다 |
 * | L6 | 끄는 동안 그리드의 빈 이름 구역(머리 왼쪽 · 머리 오른쪽 · 바닥)에 칩이 서고 · 그리드 · 셀 틀 글 · 아래 글이 움직인 값을 적는다(원래 있던 길 — 상한 없음) |
 * | 비용(위험 3) | 행 × 열 10×3 · 50×3 · 10×10 · 50×10 — 판을 열어 그리드가 다 서기까지 · 열 머리 이름을 고쳐 캔버스에 서기까지의 시간과 그 동안의 긴 작업. 기계마다 달라 상한을 단언하지 않는다(`./canvas-cost.test.ts` 와 같다) |
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

  /** 사본 판의 그리드 — 체크 선택 · 셀 틀 «단추 + 입력» · «글» · 되풀이 4 행 · 제 칸 둘(링크 · 글)을 가진 되풀이 2 행 · 바. 앞뒤에 글. */
  const COPIES_PAGE: Node[] = [
    {
      id: 'h_g',
      type: 'DataGrid',
      props: { select: 'check' },
      children: [
        {
          id: 'h_c0',
          type: 'GridColumn',
          props: { label: '관리' },
          children: [
            { id: 'h_b0', type: 'Button', props: { label: '수정' } },
            { id: 'h_i0', type: 'Input', props: {} },
          ],
        },
        {
          id: 'h_c1',
          type: 'GridColumn',
          props: { label: '이름' },
          children: [{ id: 'h_t1', type: 'Text', props: { content: '홍길동' } }],
        },
      ],
      zones: {
        rows: [
          { id: 'h_r1', type: 'GridRow', props: { repeat: 4 } },
          {
            id: 'h_r2',
            type: 'GridRow',
            props: { repeat: 2 },
            children: [
              { id: 'h_k0', type: 'GridCell', children: [{ id: 'h_l0', type: 'Link', props: { label: '상세' } }] },
              { id: 'h_k1', type: 'GridCell', children: [{ id: 'h_x1', type: 'Text', props: { content: '제 칸' } }] },
            ],
          },
        ],
        footer: [{ id: 'h_pg', type: 'Pagination' }],
      },
    },
    { id: 'h_tail', type: 'Text', props: { content: '아래 글' } },
  ]

  /** 문서의 노드 id 전부(몸통 · 구역). */
  const idsOf = (root: Node): string[] => [
    root.id,
    ...(root.children ?? []).flatMap(idsOf),
    ...Object.values(root.zones ?? {}).flatMap((list) => list.flatMap(idsOf)),
  ]
  const childrenOf = (root: Node, id: string): Node[] | null => {
    if (root.id === id) return root.children ?? []
    for (const child of [...(root.children ?? []), ...Object.values(root.zones ?? {}).flat()]) {
      const found = childrenOf(child, id)
      if (found !== null) return found
    }
    return null
  }

  /**
   * **H1 — 사본을 누르면 원본을 고른다**(설계 GR-B «1»). 사본(되풀이 줄의 칸 · 그 안 조각)을 누르면 그 원본 노드가 골라지고 Delete · Cmd+D ·
   * Cmd+V · 범위 선택이 원본에 걸린다 — 고치기 전에는 가장 가까운 `[data-wb-id]` 인 그리드가 골라져 Delete 가 그리드째 지웠다
   * (`docs/superpowers/plans/2026-10-25-rv-gr-report.md` «2»). 틀 칸(셀 틀을 담는 `td`)의 빈 자리는 그 열이다.
   */
  it('사본을 누르면 원본을 고르고 Delete · Cmd+D · Cmd+V · 범위 선택이 원본에 걸린다 · 틀 칸 빈 자리는 그 열이다', async () => {
    const { P } = await seed('grid-copies', COPIES_PAGE)
    const { page, close } = await open(P, 'h_g')
    const frame = canvasFrame(page)
    const copyOf = (id: string, nth: number) => frame.locator(`[data-wb-copy-of="${id}"]`).nth(nth)
    const pick = async (what: string, click: () => Promise<void>, id: string) => {
      await click()
      return poll(
        what,
        () => selected(page),
        (now) => now === id,
        5000,
      ).catch(() => selected(page))
    }
    const headOf = async () => (await call('GET', P)).body.headSeq as number
    try {
      for (const zone of ['body', 'rows', 'footer']) expect(await zoneRow(page, 'h_g', zone).count(), zone).toBe(1)
      for (const nodeId of ['h_c0', 'h_c1', 'h_r1', 'h_pg', 'h_t1']) expect(await treeRow(page, nodeId).count(), nodeId).toBe(1)
      // 판 카나리아 — 셀 틀 조각 · 행은 원본 1 · 사본 3, 제 칸은 원본 1 · 사본 1 이다.
      const counts: Record<string, [number, number]> = {}
      for (const id of ['h_b0', 'h_t1', 'h_r1', 'h_k0', 'h_l0'])
        counts[id] = [await frame.locator(`[data-wb-id="${id}"]`).count(), await frame.locator(`[data-wb-copy-of="${id}"]`).count()]
      expect(counts).toEqual({ h_b0: [1, 3], h_t1: [1, 3], h_r1: [1, 3], h_k0: [1, 1], h_l0: [1, 1] })

      // 사본 단추 → 단추 · Delete 는 단추 하나만 지운다(그리드는 남는다).
      expect(await pick('사본 단추 → 단추', () => copyOf('h_b0', 1).click(), 'h_b0')).toBe('h_b0')
      const before = idsOf(await server(P))
      await page.keyboard.press('Delete')
      const deleted = idsOf(
        await poll(
          'Delete 가 닿는다',
          () => server(P),
          (root) => !idsOf(root).includes('h_b0'),
        ),
      )
      expect(before.filter((id) => !deleted.includes(id))).toEqual(['h_b0'])
      await page.keyboard.press('ControlOrMeta+z')
      await poll(
        '되돌리기',
        () => server(P),
        (root) => idsOf(root).includes('h_b0'),
      )
      await frame.locator('[data-wb-id="h_b0"]').waitFor({ state: 'attached' })

      // 사본 입력 → 입력 · Cmd+D 는 그 입력을 셀 틀 안에서 복제한다(뿌리는 그대로).
      expect(await pick('사본 입력 → 입력', () => copyOf('h_i0', 0).click(), 'h_i0')).toBe('h_i0')
      await page.keyboard.press('ControlOrMeta+d')
      const duplicated = await poll(
        'Cmd+D 가 닿는다',
        () => server(P),
        (root) => (childrenOf(root, 'h_c0') ?? []).length === 3,
      )
      expect({
        top: (duplicated.children ?? []).map((node) => node.id),
        template: (childrenOf(duplicated, 'h_c0') ?? []).map((node) => (node.id.startsWith('h_') ? node.id : node.type)),
      }).toEqual({ top: ['h_g', 'h_tail'], template: ['h_b0', 'h_i0', 'Input'] })
      await page.keyboard.press('ControlOrMeta+z')
      await poll(
        '되돌리기',
        () => server(P),
        (root) => (childrenOf(root, 'h_c0') ?? []).length === 2,
      )

      // 제 칸 사본(칸의 빈 귀퉁이) → 칸 · 그 안 링크 사본 → 링크.
      expect(await pick('제 칸 사본 → 칸', () => copyOf('h_k0', 0).click({ position: { x: 3, y: 3 } }), 'h_k0')).toBe('h_k0')
      expect(await pick('제 칸 링크 사본 → 링크', () => copyOf('h_l0', 0).click(), 'h_l0')).toBe('h_l0')

      // 틀 칸의 빈 자리(오른끝) → 그 열 — 사본 줄 · 원본 줄 둘 다.
      const rightEdge = async (cell: ReturnType<typeof frame.locator>) => {
        const box = (await cell.boundingBox())!
        await cell.click({ position: { x: box.width - 4, y: box.height / 2 } })
      }
      expect(
        await pick('사본 줄 틀 칸 → 열', () => rightEdge(copyOf('h_r1', 1).locator('td[data-wb-cell="template"]').nth(1)), 'h_c1'),
      ).toBe('h_c1')
      await treeRow(page, 'h_tail').locator('button').first().click()
      await poll(
        '아래 글을 골랐다',
        () => selected(page),
        (id) => id === 'h_tail',
      )
      expect(
        await pick(
          '원본 줄 틀 칸 → 열',
          () => rightEdge(frame.locator('[data-wb-id="h_r1"]').locator('td[data-wb-cell="template"]').nth(0)),
          'h_c0',
        ),
      ).toBe('h_c0')

      // 붙이기 — 아래 글을 복사하고 사본 글을 누른 뒤 Cmd+V 는 원본 글 바로 뒤(셀 틀)에 선다.
      await treeRow(page, 'h_tail').locator('button').first().click()
      await poll(
        '아래 글을 골랐다',
        () => selected(page),
        (id) => id === 'h_tail',
      )
      await page.keyboard.press('ControlOrMeta+c')
      expect(await pick('사본 글 → 글', () => copyOf('h_t1', 2).click(), 'h_t1')).toBe('h_t1')
      const head = await headOf()
      await page.keyboard.press('ControlOrMeta+v')
      const pasted = await poll(
        '붙이기가 닿는다',
        () => server(P),
        (root) => (childrenOf(root, 'h_c1') ?? []).length === 2,
      )
      expect({
        top: (pasted.children ?? []).map((node) => node.id),
        template: (childrenOf(pasted, 'h_c1') ?? []).map((node) => (node.id === 'h_t1' ? 'h_t1' : node.props?.content)),
        head: (await headOf()) - head,
      }).toEqual({ top: ['h_g', 'h_tail'], template: ['h_t1', '아래 글'], head: 1 })
      await page.keyboard.press('ControlOrMeta+z')
      await poll(
        '되돌리기',
        () => server(P),
        (root) => (childrenOf(root, 'h_c1') ?? []).length === 1,
      )
      await frame.locator('[data-wb-copy-of="h_r1"]').nth(2).waitFor({ state: 'attached' })

      // 범위 선택 — 셋째 줄(사본)의 «이름» 틀 칸 안쪽만 덮는 사각형이 그 칸의 원본 글을 고른다(칸 자신은 노드가 아니다).
      const cell = (await copyOf('h_r1', 1).locator('td[data-wb-cell="template"]').nth(1).boundingBox())!
      await page.mouse.move(cell.x + 2, cell.y + 2)
      await page.mouse.down()
      await page.mouse.move(cell.x + cell.width - 2, cell.y + cell.height - 2, { steps: 10 })
      await page.mouse.up()
      const picked = await poll(
        '범위 선택이 무언가를 고른다',
        () =>
          page.evaluate(() =>
            [
              document.querySelector('[data-wb-selected-id]')?.getAttribute('data-wb-selected-id'),
              ...[...document.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id')),
            ]
              .filter((id): id is string => typeof id === 'string')
              .sort(),
          ),
        (ids) => ids.length > 0,
        5000,
      ).catch((error: Error) => error.message)
      expect(picked).toEqual(['h_t1'])
    } finally {
      await close()
    }
  })

  /**
   * **H1 — 남이 원본을 쥐었을 때 사본 누름은 원본 누름과 같게 막힌다**(리뷰 «2» 의 두 사람 판). 밥이 셀 틀 글을 고른 동안 앨리스가 그 글의 사본을
   * 누르면 원본을 누른 것과 같이 고른 것이 그대로다. 다른 열의 사본(단추)은 밥의 잠금 밖이라 골라진다 — 고치기 전에는 그리드가 골라지려다
   * (밥의 글을 품어) 막혔다.
   */
  it('남이 원본을 쥐었으면 사본 누름도 원본 누름과 같게 막히고 · 다른 열의 사본은 골라진다', async () => {
    const { P } = await seed('grid-copies-lock', COPIES_PAGE)
    const projectId = P.split('/')[2]!
    const member = await call('POST', `/projects/${projectId}/members`, { email: stack.users.bob.email, role: 'editor' })
    expect(member.status).toBeLessThan(300)
    const a = await open(P, 'h_g')
    const { context: bobContext, page: bob } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    try {
      await bob.goto(P)
      await canvasFrame(bob).locator('[data-wb-id="h_g"]').waitFor({ state: 'attached' })
      await treeRow(bob, 'h_t1').locator('button').first().click()
      await poll(
        '밥이 글을 골랐다',
        () => selected(bob),
        (id) => id === 'h_t1',
      )
      // 앨리스 화면에 밥의 잠금이 닿았다(트리 자물쇠) — 판 카나리아.
      await poll(
        '밥의 잠금이 앨리스에게 닿는다',
        () => a.page.locator(`${TREE} [data-tree-id="h_t1"]`).locator('xpath=..').locator('.wb-shell-structure-lock').count(),
        (n) => n > 0,
      )
      await treeRow(a.page, 'h_tail').locator('button').first().click()
      await poll(
        '아래 글을 골랐다',
        () => selected(a.page),
        (id) => id === 'h_tail',
      )
      const frame = canvasFrame(a.page)
      const outcome = async (click: () => Promise<void>) => {
        await click()
        await a.page.waitForTimeout(800)
        return { selected: await selected(a.page), alerts: await a.page.getByRole('alert').allTextContents() }
      }
      const onCopy = await outcome(() => frame.locator('[data-wb-copy-of="h_t1"]').nth(1).click())
      const onOrigin = await outcome(() => frame.locator('[data-wb-id="h_t1"]').click())
      expect(onCopy).toEqual(onOrigin)
      expect(onCopy.selected).toBe('h_tail')
      expect(await outcome(() => frame.locator('[data-wb-copy-of="h_b0"]').nth(1).click())).toEqual({
        selected: 'h_b0',
        alerts: onCopy.alerts,
      })
    } finally {
      await a.close()
      await bobContext.close()
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
   * **끄는 동안 빈 구역 칸이 그리드를 얼마나 미는가**(4단계 이월 L6 — 폼 표에서 x +712 · y +32). 그리드의 빈 이름 구역(머리 왼쪽 · 머리 오른쪽 ·
   * 바닥)마다 칩이 서고, 행 구역 칩은 없다(행이 있다). 위의 글을 손잡이로 쥐고 `dragLayoutSettled` 까지 기다린 뒤 그리드 · 첫 셀 틀 글 · 아래 글의
   * 캔버스 상자가 얼마나 움직였는지 적는다. 원래 있던 길이라 상한을 단언하지 않는다 — 칩이 섰는지(판 카나리아)만 단언한다.
   */
  it('L6 — 끄는 동안 빈 구역 칸이 그리드 · 셀 틀 글 · 아래 글을 얼마나 미는지 적는다', async () => {
    const grid = gridOf('g_l', 3, 2)
    grid.zones = { rows: grid.zones!.rows! }
    const { P } = await seed('grid-l6', [
      { id: 'l_top', type: 'Text', props: { content: '위 글' } },
      grid,
      { id: 'l_after', type: 'Text', props: { content: '아래 글' } },
    ])
    const { page, close } = await open(P, 'g_l')
    const ids = ['g_l', 'g_l_t0', 'l_after']
    const boxes = () =>
      canvasFrame(page)
        .locator('body')
        .evaluate((_body, wanted) => {
          const out: Record<string, [number, number, number]> = {}
          for (const id of wanted) {
            const r = document.querySelector(`[data-wb-id="${id}"]`)!.getBoundingClientRect()
            out[id] = [Math.round(r.x), Math.round(r.y), Math.round(r.height)]
          }
          return out
        }, ids)
    try {
      await treeRow(page, 'l_top').locator('button').first().click()
      await poll(
        '위 글을 골랐다',
        () => selected(page),
        (id) => id === 'l_top',
      )
      const before = await boxes()
      const handle = page.locator('.wb-shell-canvas-handle')
      await handle.waitFor()
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 6, { steps: 3 })
      const slots = await dragLayoutSettled(page)
      const during = await boxes()
      const chips = await canvasFrame(page)
        .locator('[data-zone-slot-of="g_l"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-zone-slot')))
      await page.keyboard.press('Escape')
      await page.mouse.up()
      const moved = Object.fromEntries(
        ids.map((id) => [
          id,
          { dx: during[id]![0] - before[id]![0], dy: during[id]![1] - before[id]![1], dh: during[id]![2] - before[id]![2] },
        ]),
      )
      // eslint-disable-next-line no-console
      console.log('[L6 그리드]', JSON.stringify({ slots, chips, moved }))
      // 판 카나리아 — 끌기가 섰고 그리드의 빈 이름 구역 셋에 칩이 섰다(행 구역은 행이 있어 칩이 없다).
      expect([...chips].sort()).toEqual(['footer', 'headEnd', 'headStart'])
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
            new (target as unknown as typeof globalThis).PerformanceObserver((list) =>
              list.getEntries().forEach((entry) => (w.__long += entry.duration)),
            ).observe({
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
