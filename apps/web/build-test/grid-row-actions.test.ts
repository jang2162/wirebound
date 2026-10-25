/**
 * **그리드 에디터 입구(GR-B) — 실브라우저 판**(설계 spec `2026-10-25-grid-design.md` «8» · «11» GR-B 6).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 사본 위 놓기 | 사본(되풀이 줄의 셀 틀 글 · 틀 칸)에 팔레트 카드를 끌면 표시가 없고 «첫 행의 칸에 놓으세요» 가 포인터 곁에 서며 놓아도 편집 0 · 첫 줄 틀 칸의 빈 자리는 그 열의 셀 틀 끝 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  shownDrops,
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

/** 셀 틀 글 열 둘 · 되풀이 4 행 · 아래 글. */
const COPIES: Node[] = [
  {
    id: 'd_g',
    type: 'DataGrid',
    children: [
      { id: 'd_c0', type: 'GridColumn', props: { label: '이름' }, children: [{ id: 'd_t0', type: 'Text', props: { content: '홍길동' } }] },
      { id: 'd_c1', type: 'GridColumn', props: { label: '상태' }, children: [{ id: 'd_t1', type: 'Text', props: { content: '정상' } }] },
    ],
    zones: { rows: [{ id: 'd_r', type: 'GridRow', props: { repeat: 4 } }] },
  },
  { id: 'd_tail', type: 'Text', props: { content: '아래 글' } },
]

describe.skipIf(!전제.ok)('그리드 에디터 입구(실브라우저)', () => {
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
    const project = (await call('POST', '/projects', { name: '그리드 입구', slug: `${slug}-${Date.now().toString(36)}` })).body
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
  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  async function open(P: string, ready: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  async function openPalette(page: Page, type: string): Promise<void> {
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
  }

  /** 카드를 쥐고 문턱을 넘긴 뒤 빈 구역 칸이 설 때까지 기다린다. */
  async function grabCard(page: Page, type: string): Promise<void> {
    const box = (await page.locator(`[data-wb-palette-card="${type}"]`).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 - 6, { steps: 3 })
    await dragLayoutSettled(page)
  }

  /** 끄는 중 — 그 요소의 상자(끄는 동안 선 배치로 잰다) 안 한 점으로 옮긴다. */
  async function moveInto(page: Page, selector: string, nth: number, fx: number, fy: number): Promise<void> {
    const box = (await canvasFrame(page).locator(selector).nth(nth).boundingBox())!
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 8 })
    await dragLayoutSettled(page)
  }

  /** 끄는 중 — 그 틀 칸의 셀 틀 글 오른쪽 빈 자리(칸 안 · 글 밖)로 옮긴다. 칸은 넓어 오른끝이 캔버스 칸 밖일 수 있다. */
  async function moveBeside(page: Page, textSelector: string, nth: number): Promise<void> {
    const text = (await canvasFrame(page).locator(textSelector).nth(nth).boundingBox())!
    await page.mouse.move(text.x + text.width + 24, text.y + text.height / 2, { steps: 8 })
    await dragLayoutSettled(page)
  }

  const refusals = (page: Page) => page.locator('.wb-shell-drop-refusal').allTextContents()
  /** 보인 놓을 자리의 띠 — 셀 틀의 미리보기는 행 `tr` 안에 그려져 DOM 부모(`ShownDrop.parent`)가 행이다. 놓인 자리는 서버 문서로 잰다. */
  const indicators = async (page: Page) => (await shownDrops(page)).map((drop) => `${drop.kind}:${drop.placement}`)

  /**
   * **사본 위 놓기**(설계 «8» «사본에 놓기» · GR-B 4). 사본(되풀이 줄)은 문서의 노드가 아니라 원본의 그림이라 그 «앞 · 뒤 · 안» 은 문서에 없는 자리다 —
   * 표시를 안 세우고 «첫 행의 칸에 놓으세요» 를 포인터 곁에 둔다. 고치기 전에는 사본 위가 가장 가까운 `[data-wb-id]` 인 그리드로 읽혀 그리드의 앞 · 뒤에
   * 놓였다(`docs/superpowers/plans/2026-10-25-fx-gr-report.md` «훑기 자리 × 사본을 읽는 법»). 첫 줄 틀 칸의 빈 자리는 그 열의 셀 틀 끝이다.
   */
  it('사본 위에 끌면 표시 없이 «첫 행의 칸에 놓으세요» · 놓아도 편집 0 — 첫 줄 틀 칸 빈 자리는 그 열의 셀 틀 끝', async () => {
    const { P } = await seed('grb-copy-drop', COPIES)
    const { page, close } = await open(P, 'd_g')
    const before = JSON.stringify(await server(P))
    const outcome: Record<string, { shown: string[]; refusal: string[] }> = {}
    try {
      await openPalette(page, 'Divider')
      // 판 카나리아 — 셀 틀 글 사본 셋 · 행 사본 셋.
      expect([
        await canvasFrame(page).locator('[data-wb-copy-of="d_t0"]').count(),
        await canvasFrame(page).locator('[data-wb-copy-of="d_r"]').count(),
      ]).toEqual([3, 3])
      for (const [name, move] of [
        ['사본 글 위쪽', () => moveInto(page, '[data-wb-copy-of="d_t0"]', 1, 0.5, 0.2)],
        ['사본 줄 틀 칸 빈 자리', () => moveBeside(page, '[data-wb-copy-of="d_t0"]', 2)],
      ] as const) {
        await grabCard(page, 'Divider')
        await move()
        outcome[name] = { shown: await indicators(page), refusal: await refusals(page) }
        await page.mouse.up()
        await page.waitForTimeout(500)
      }
      const untouched = JSON.stringify(await server(P))

      await grabCard(page, 'Divider')
      await moveBeside(page, '[data-wb-id="d_t0"]', 0)
      outcome['첫 줄 틀 칸 빈 자리'] = { shown: await indicators(page), refusal: await refusals(page) }
      await page.mouse.up()
      const landed = await poll(
        '첫 줄 틀 칸에 놓은 구분선이 서버에 닿는다',
        () => server(P),
        (root) => (root.children![0]!.children![0]!.children ?? []).length === 2,
      ).catch(() => server(P))

      // eslint-disable-next-line no-console
      console.log('[사본 위 놓기]', JSON.stringify(outcome))
      expect({
        outcome,
        untouched: untouched === before,
        template: (landed.children![0]!.children![0]!.children ?? []).map((node) => node.type),
        top: (landed.children ?? []).map((node) => node.id),
      }).toEqual({
        outcome: {
          '사본 글 위쪽': { shown: [], refusal: ['되풀이된 줄에는 놓을 수 없습니다 — 첫 행의 칸에 놓으세요'] },
          '사본 줄 틀 칸 빈 자리': { shown: [], refusal: ['되풀이된 줄에는 놓을 수 없습니다 — 첫 행의 칸에 놓으세요'] },
          '첫 줄 틀 칸 빈 자리': { shown: ['preview:inside'], refusal: [] },
        },
        untouched: true,
        template: ['Text', 'Divider'],
        top: ['d_g', 'd_tail'],
      })
    } finally {
      await close()
    }
  })
})
