/**
 * **캔버스에서 그리드 행 고르기 — 실브라우저 판**(`src/canvas/canvas.tsx` 의 `nodeIdAt`). 몸 줄의 칸을 누르면 열이 아니라 그 줄의 행이 골라진다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 흐름 | 되풀이 3 행의 둘째 줄 셀 틀 사본 노드를 눌러 그 행이 안 골라진다 · 고른 표지가 그 행의 세 줄을 안 덮는다 · «컴포넌트» 탭 «행 내용» 이 안 선다 · «커스텀» 이 그 행의 칸을 안 짓는다 |
 * | 원본 셀 틀 | 첫 줄의 실제 셀 틀 노드를 눌러 그 노드가 아니라 행이 골라진다 |
 * | 번호 열 · 열 묶음 · 셋째 줄 | 번호 칸 · 열 묶음 아래 셀 틀 칸의 바탕(첫 줄 · 셋째 줄)을 눌러 열이 골라진다 |
 * | 그 밖의 칸 | 머리 칸 · 열 묶음 머리 · 고름 칸 · 합계 행 · 생략 띠 · 커스텀 행의 제 칸(첫 줄 · 사본 줄) · 제 칸 안 노드가 지금의 답에서 벗어난다 |
 *
 * 누를 점은 대상 상자를 4px 격자로 훑어 고른다 — 셸의 맨 위가 캔버스 iframe 이고, iframe 문서의 그 점이 대상 안(«in») 또는 대상의 바탕(«bg» — 그
 * 점과 대상 사이에 다른 노드가 없다)인 첫 점이다. 점이 없으면 카나리아로 죽는다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

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

/**
 * 고름 칸 · 셀 틀 열 둘 · 행 다섯 — 첫 행(1 줄) · 되풀이 3 행 · 커스텀 행(제 칸 둘 · 2 줄) · 합계 · 생략 띠. 첫 행은 «커스텀» 으로 못 옮기므로
 * (`edit/grid-row-actions.ts` 의 `buildCellsRefusal`) 흐름은 둘째 행을 누른다.
 */
const GRID: Node[] = [
  {
    id: 'p_g',
    type: 'DataGrid',
    props: { select: 'check' },
    children: [
      { id: 'p_ca', type: 'GridColumn', props: { label: '이름' }, children: [text('p_ta', '홍길동')] },
      { id: 'p_cb', type: 'GridColumn', props: { label: '상태' }, children: [text('p_tb', '정상')] },
    ],
    zones: {
      rows: [
        { id: 'p_r1', type: 'GridRow' },
        { id: 'p_r2', type: 'GridRow', props: { repeat: 3 } },
        {
          id: 'p_r3',
          type: 'GridRow',
          props: { repeat: 2 },
          children: [
            { id: 'p_x1', type: 'GridCell', children: [text('p_xt', '제 칸 글')] },
            { id: 'p_x2', type: 'GridCell' },
          ],
        },
        { id: 'p_r4', type: 'GridRow', props: { kind: 'total' } },
        { id: 'p_r5', type: 'GridRow', props: { kind: 'gap' } },
      ],
    },
  },
  text('p_tail', '아래 글'),
]

/** 번호 열 · 열 묶음(열 둘) · 첫 행 · 되풀이 3 행. */
const GROUPED: Node[] = [
  {
    id: 'q_g',
    type: 'DataGrid',
    children: [
      { id: 'q_n', type: 'GridColumn', props: { label: '번호', numbering: 'asc' } },
      {
        id: 'q_grp',
        type: 'GridColumnGroup',
        props: { label: '묶음' },
        children: [
          { id: 'q_ca', type: 'GridColumn', props: { label: '가' }, children: [text('q_ta', '가 글')] },
          { id: 'q_cb', type: 'GridColumn', props: { label: '나' }, children: [text('q_tb', '나 글')] },
        ],
      },
    ],
    zones: {
      rows: [
        { id: 'q_r1', type: 'GridRow' },
        { id: 'q_r2', type: 'GridRow', props: { repeat: 3 } },
      ],
    },
  },
  text('q_tail', '아래 글'),
]

/** 누를 자리 — iframe 문서의 셀렉터 · 그 몇째 · 대상 안(`in`)인가 바탕(`bg`)인가. */
interface Spot {
  selector: string
  nth?: number
  mode: 'in' | 'bg'
}

describe.skipIf(!전제.ok)('캔버스에서 그리드 행 고르기 — 실브라우저', () => {
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
    const project = (await call('POST', '/projects', { name: '행 고르기', slug: `${slug}-${Date.now().toString(36)}` })).body
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

  const server = async (P: string): Promise<Node> => (await call('GET', P)).body.schema.root as Node
  function find(root: Node, id: string): Node | undefined {
    if (root.id === id) return root
    for (const child of [...(root.children ?? []), ...Object.values(root.zones ?? {}).flat()]) {
      const hit = find(child, id)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1000 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  /** 누를 점(호스트 좌표). 셀렉터는 iframe 문서에서 찾는다. */
  async function pointOf(page: Page, spot: Spot): Promise<{ x: number; y: number } | null> {
    return (await page.evaluate(
      async ([selector, nth, mode]) => {
        const f = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const d = f.contentDocument!
        const target = d.querySelectorAll(selector)[nth]
        if (target === undefined) return null
        // 창 밖의 칸은 `elementFromPoint` 가 못 짚는다 — 캔버스 칸을 굴려 들인다.
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

  /** 그 자리를 누르고 골라진 id 를 돌려준다 — 누르기 전에 아래 글을 골라 두고, 고름이 그것에서 바뀌기를 기다린다(안 바뀌면 그 값). */
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

  const rightTabs = (page: Page) => page.getByRole('tablist', { name: '우측 패널 탭', exact: true })
  const selectedTab = async (page: Page): Promise<string> =>
    // 탭 이름 글만 — «코멘트» 탭은 곁에 수 배지를 단다(`routes/editor.tsx` 의 `CommentTabLabel`).
    (
      await rightTabs(page)
        .locator('[role="tab"][aria-selected="true"]')
        .evaluate((el) => el.firstChild?.textContent ?? '')
    ).trim()

  it('흐름 — 되풀이 3 행의 둘째 줄 셀 틀 사본 노드를 누르면 그 행이 골라지고, «행 내용» «커스텀» 이 그 행의 칸을 짓는다', async () => {
    const P = await seed('gp-flow', GRID)
    const opened = await open(P)
    const { page } = opened
    try {
      await canvasFrame(page).locator('tr[data-wb-copy-of="p_r2"]').first().waitFor({ state: 'attached' })
      await rightTabs(page).getByRole('tab', { name: '코멘트', exact: true }).click()
      const picked = await pickAt(page, { selector: '[data-wb-copy-of="p_tb"]', nth: 1, mode: 'in' }, 'p_tail')
      // 카나리아 — 누른 사본이 둘째 행의 둘째 줄이다(사본 차례: 첫 행 0 줄은 원본 · 둘째 행 0 줄 사본 · 1 줄 사본).
      const where = await canvasFrame(page)
        .locator('[data-wb-copy-of="p_tb"]')
        .nth(1)
        .evaluate((el) => {
          const tr = el.closest('tr')!
          return tr.getAttribute('data-wb-id') ?? `copy:${tr.getAttribute('data-wb-copy-of')}`
        })
      // 고른 것을 «행 내용» 을 기다리기 전에 단언한다 — 열이 골라진 판이 시간 초과가 아니라 값으로 죽게.
      expect({ 줄: where, 고른: picked }).toEqual({ 줄: 'copy:p_r2', 고른: 'p_r2' })
      // 고른 표지가 그 행의 세 줄을 덮는다 — 사본 줄을 눌러 고른 행이 첫 줄에만 표지를 받으면 이어진 Delete 가 무엇을 지울지 안 보인다.
      const lines = canvasFrame(page).locator('tbody > tr[data-wb-id="p_r2"], tbody > tr[data-wb-copy-of="p_r2"]')
      const first = (await lines.nth(0).boundingBox())!
      const last = (await lines.nth(2).boundingBox())!
      const mark = (await page.locator('.wb-shell-selection').boundingBox())!
      expect({
        줄수: await lines.count(),
        위: Math.abs(mark.y - first.y) <= 3,
        아래: Math.abs(mark.y + mark.height - (last.y + last.height)) <= 3,
      }).toEqual({ 줄수: 3, 위: true, 아래: true })
      const props = page.getByRole('tabpanel').getByRole('region', { name: '속성', exact: true })
      await props.getByLabel('되풀이', { exact: true }).waitFor()
      const content = props.getByRole('radiogroup', { name: '행 내용' })
      expect({ 탭: await selectedTab(page), 행내용: await content.getByRole('radio').allTextContents() }).toEqual({
        탭: '컴포넌트',
        행내용: ['기본', '커스텀'],
      })
      await content.getByRole('radio', { name: '커스텀' }).click()
      const custom = await poll(
        '커스텀',
        () => server(P),
        (root) => (find(root, 'p_r2')?.children ?? []).length > 0,
      )
      expect(
        find(custom, 'p_r2')!.children!.map((cell) => [cell.type, (cell.children ?? []).map((piece) => piece.props?.content)]),
      ).toEqual([
        ['GridCell', ['홍길동']],
        ['GridCell', ['정상']],
      ])
    } finally {
      await opened.close()
    }
  })

  it('원본 셀 틀 — 첫 줄의 실제 셀 틀 노드를 누르면 그 노드가 골라진다', async () => {
    const P = await seed('gp-origin', GRID)
    const opened = await open(P)
    const { page } = opened
    try {
      await canvasFrame(page).locator('[data-wb-id="p_ta"]').waitFor({ state: 'attached' })
      expect({
        p_ta: await pickAt(page, { selector: '[data-wb-id="p_ta"]', mode: 'in' }, 'p_tail'),
        p_tb: await pickAt(page, { selector: '[data-wb-id="p_tb"]', mode: 'in' }, 'p_tail'),
      }).toEqual({ p_ta: 'p_ta', p_tb: 'p_tb' })
    } finally {
      await opened.close()
    }
  })

  it('번호 열 · 열 묶음 · 셋째 줄 — 번호 칸과 셀 틀 칸의 바탕은 그 줄의 행이다(첫 줄 · 되풀이의 셋째 줄)', async () => {
    const P = await seed('gp-grouped', GROUPED)
    const opened = await open(P)
    const { page } = opened
    try {
      await canvasFrame(page).locator('tr[data-wb-copy-of="q_r2"]').nth(1).waitFor({ state: 'attached' })
      const third = (inner: string, nth: number): Spot => ({ selector: `tr[data-wb-copy-of="q_r2"] ${inner}`, nth, mode: 'bg' })
      // 셋째 줄 = q_r2 의 사본 줄 둘째(q_r2 의 0 줄도 셀 틀은 사본이다 — 셀렉터는 사본 `tr` 만 고르므로 nth 는 열마다 0 · 1).
      const spots: Record<string, Spot> = {
        '열 묶음 머리': { selector: 'th[data-wb-id="q_grp"]', mode: 'in' },
        '첫 줄 번호 칸': { selector: 'tr[data-wb-id="q_r1"] td[data-wb-cell="number"]', mode: 'bg' },
        '첫 줄 셀 틀 바탕': { selector: 'tr[data-wb-id="q_r1"] td[data-wb-cell="template"]', mode: 'bg' },
        '둘째 행 0 줄 번호 칸': { selector: 'tr[data-wb-id="q_r2"] td[data-wb-cell="number"]', mode: 'bg' },
        '셋째 줄 번호 칸': third('td[data-wb-cell="number"]', 1),
        '셋째 줄 묶음 둘째 열 바탕': third('td[data-wb-cell="template"]', 3),
      }
      const got: Record<string, string | null> = {}
      for (const [name, spot] of Object.entries(spots)) got[name] = await pickAt(page, spot, 'q_tail')
      expect(got).toEqual({
        '열 묶음 머리': 'q_grp',
        '첫 줄 번호 칸': 'q_r1',
        '첫 줄 셀 틀 바탕': 'q_r1',
        '둘째 행 0 줄 번호 칸': 'q_r2',
        '셋째 줄 번호 칸': 'q_r2',
        '셋째 줄 묶음 둘째 열 바탕': 'q_r2',
      })
    } finally {
      await opened.close()
    }
  })

  it('그 밖의 칸 — 머리 칸 · 열 묶음 머리 · 고름 칸 · 합계 · 생략 띠 · 커스텀 행의 제 칸', async () => {
    const P = await seed('gp-rest', GRID)
    const opened = await open(P)
    const { page } = opened
    try {
      await canvasFrame(page).locator('tr[data-wb-copy-of="p_r3"]').waitFor({ state: 'attached' })
      const spots: Record<string, Spot> = {
        '머리 칸': { selector: 'th[data-wb-id="p_ca"]', mode: 'in' },
        '고름 칸 머리': { selector: 'th[data-wb-cell="select"]', mode: 'bg' },
        '첫 줄 고름 칸': { selector: 'tr[data-wb-id="p_r1"] td[data-wb-cell="select"]', mode: 'bg' },
        '사본 줄 고름 칸': { selector: 'tr[data-wb-copy-of="p_r2"] td[data-wb-cell="select"]', nth: 1, mode: 'bg' },
        '합계 행 빈 칸': { selector: 'tr[data-wb-id="p_r4"] td[data-wb-cell="blank"]', mode: 'bg' },
        '생략 띠': { selector: 'tr[data-wb-id="p_r5"] td[data-wb-part="gap"]', mode: 'bg' },
        '제 칸 첫 줄': { selector: 'td[data-wb-id="p_x2"]', mode: 'bg' },
        '제 칸 안 노드': { selector: '[data-wb-id="p_xt"]', mode: 'in' },
        '제 칸 사본 줄': { selector: 'td[data-wb-copy-of="p_x2"]', mode: 'bg' },
        '제 칸 사본 안 노드': { selector: '[data-wb-copy-of="p_xt"]', mode: 'in' },
      }
      const got: Record<string, string | null> = {}
      for (const [name, spot] of Object.entries(spots)) got[name] = await pickAt(page, spot, 'p_tail')
      expect(got).toEqual({
        '머리 칸': 'p_ca',
        '고름 칸 머리': 'p_g',
        '첫 줄 고름 칸': 'p_r1',
        '사본 줄 고름 칸': 'p_r2',
        '합계 행 빈 칸': 'p_r4',
        '생략 띠': 'p_r5',
        '제 칸 첫 줄': 'p_x2',
        '제 칸 안 노드': 'p_xt',
        '제 칸 사본 줄': 'p_x2',
        '제 칸 사본 안 노드': 'p_xt',
      })
    } finally {
      await opened.close()
    }
  })
})
