/**
 * **그리드 에디터 입구(GR-B) — 실브라우저 판**(설계 spec `2026-10-25-grid-design.md` «8» · «11» GR-B 6).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 사본 위 놓기 | 사본(되풀이 줄의 셀 틀 글 · 틀 칸)에 팔레트 카드를 끌면 표시가 없고 «첫 행의 칸에 놓으세요» 가 포인터 곁에 서며 놓아도 편집 0 · 첫 줄 틀 칸의 빈 자리는 그 열의 셀 틀 끝 |
 * | 흐름 | 열 복제(Cmd+D) · 열을 골라 팔레트 «열 묶음»(그 열 뒤) · 들여쓰기로 묶기 · 내어쓰기로 풀기 · «한 행 떼어 내기» 두 번 → 첫 행 강조 · 둘째 행 딤드 · «열 틀로 칸 짓기» → 칸 고치기(가로 칸 수 · 지우기) · 합계 행 — 걸음마다 서버 문서와 캔버스의 표지 |
 * | 두 사람 — 잠금 | 밥이 열을 쥔 동안 앨리스의 «열 틀로 칸 짓기» 는 안 나가고(밥의 이름) «한 행 떼어 내기» 는 나간다 · 밥이 놓은 뒤의 칸 짓기는 밥이 고친 셀 틀을 베끼고 셀 틀은 밥의 것 그대로 |
 * | 두 사람 — 닿기 전 | 밥의 «되풀이» · 셀 틀 고침이 앨리스 화면에 닿기 전(서버 → 브라우저 1.5s)에 앨리스가 떼어 내기 · 칸 짓기를 눌렀을 때 서버에 무엇이 남는지 값으로 · 끝에 화면 = 서버 |
 * | 되돌리기 | 줄 행동 하나 = 되돌리기 한 번 · 다시 실행 한 번 |
 * | 새로고침 뒤 되돌리기 | 새로고침으로 채운 스택(서버 이력)에서 되돌리기 한 번이 칸 짓기를 · 한 번 더가 떼어 내기를 돌린다 |
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

function find(root: Node, id: string): Node | undefined {
  if (root.id === id) return root
  for (const child of [...(root.children ?? []), ...Object.values(root.zones ?? {}).flat()]) {
    const hit = find(child, id)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** 열 셋(셀 틀 글 A · B · C) · 되풀이 5 행 · 바. */
const FLOW: Node[] = [
  {
    id: 'f_g',
    type: 'DataGrid',
    children: ['a', 'b', 'c'].map((key) => ({
      id: `f_c${key}`,
      type: 'GridColumn',
      props: { label: key.toUpperCase() },
      children: [{ id: `f_t${key}`, type: 'Text', props: { content: key.toUpperCase() } }],
    })),
    zones: { rows: [{ id: 'f_r', type: 'GridRow', props: { repeat: 5 } }], footer: [{ id: 'f_p', type: 'Pagination' }] },
  },
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

  async function seed(slug: string, nodes: Node[], bob = false): Promise<{ P: string }> {
    const project = (await call('POST', '/projects', { name: '그리드 입구', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    if (bob) {
      const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
      if (member.status !== 201) throw new Error(`멤버 ${member.status}`)
    }
    return { P }
  }

  const server = async (P: string): Promise<Node> => (await call('GET', P)).body.schema.root as Node
  const treeRow = (page: Page, nodeId: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${nodeId}"]`)
  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  async function open(
    P: string,
    ready: string,
    options: { user?: 'alice' | 'bob'; origin?: string } = {},
  ): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users[options.user ?? 'alice'], {
      viewport: { width: 1440, height: 900 },
      ...(options.origin === undefined ? {} : { origin: options.origin }),
    })
    await page.goto(`${options.origin ?? ''}${P}`)
    await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  /** 그 줄을 고른다(줄 단추) — 고른 외곽선이 그 노드에 설 때까지. */
  async function pick(page: Page, nodeId: string): Promise<void> {
    await treeRow(page, nodeId).locator('button').first().click()
    await poll(
      `${nodeId} 를 골랐다`,
      () => selected(page),
      (id) => id === nodeId,
    )
  }

  /** 그 줄을 고르고 줄 `…` 의 항목을 누른다. 같은 자리의 앞 누름과 더블클릭으로 안 읽히게 간격을 둔다(`shell/action-menu.tsx` 의 `DOUBLE_CLICK_MS`). */
  async function rowAction(page: Page, nodeId: string, name: string): Promise<void> {
    await pick(page, nodeId)
    await treeRow(page, nodeId)
      .getByRole('button', { name: /더 보기$/ })
      .click()
    await page.getByRole('menuitem', { name, exact: true }).click()
    await page.waitForTimeout(550)
  }

  /** 그리드의 행 구역 — 행마다 [id(첫 글자 둘이 n_ 이면 새 id 는 «새»), 되풀이, 종류, 행 꼴, 칸 수]. */
  const rowsOf = (root: Node, gridId: string) =>
    (find(root, gridId)?.zones?.rows ?? []).map((row) => [
      row.id,
      (row.props?.repeat as number | undefined) ?? 1,
      (row.props?.kind as string | undefined) ?? 'data',
      (row.props?.tone as string | undefined) ?? 'default',
      (row.children ?? []).length,
    ])

  /** 열 트리 — 열은 id, 열 묶음은 [id, 자식…]. */
  const columnsOf = (node: Node): unknown[] =>
    (node.children ?? []).map((child) => (child.type === 'GridColumnGroup' ? [child.id, ...columnsOf(child)] : child.id))

  const headOf = async (P: string) => (await call('GET', P)).body.headSeq as number

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
   * 표시를 안 세우고 «첫 행의 칸에 놓으세요» 를 포인터 곁에 둔다. 고치기 전에는 사본 위가 가장 가까운 `[data-wb-id]` 인 그리드로 읽혀(`docs/superpowers/plans/2026-10-25-fx-gr-report.md`
   * «훑기 자리 × 사본을 읽는 법») 그리드의 거절 문장이 섰다. 첫 줄 틀 칸의 빈 자리는 그 열의 셀 틀 끝이다 — 고치기 전에는 행(칸만 받는다)으로 읽혀 놓을 자리가 없었다.
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

  /**
   * **흐름**(설계 «8» 의 표 · GR-B 6). 걸음마다 서버 문서를 값으로 적고, 캔버스가 그 꼴을 그리는지 표지로 본다 — 묶음 머리 칸의 `colSpan` · 행의 행 꼴 표지
   * (`data-wb-tone`) · 사본 수 · 합계 행 첫 칸의 `colSpan`.
   */
  it('흐름 — 열 복제 · 열 묶기 · 풀기 · 한 행 떼어 내기 두 번(강조 · 딤드) · 열 틀로 칸 짓기 → 칸 고치기 · 합계 행', async () => {
    const { P } = await seed('grb-flow', FLOW)
    const { page, close } = await open(P, 'f_g')
    const frame = canvasFrame(page)
    const steps: Record<string, unknown> = {}
    try {
      // 열 복제 — Cmd+D 는 바로 뒤에 같은 셀 틀.
      await pick(page, 'f_ca')
      await page.keyboard.press('ControlOrMeta+d')
      const duplicated = await poll(
        'Cmd+D',
        () => server(P),
        (root) => (find(root, 'f_g')!.children ?? []).length === 4,
      )
      const dup = find(duplicated, 'f_g')!.children![1]!.id
      steps['복제'] = columnsOf(find(duplicated, 'f_g')!).map((id) => (id === dup ? '복제' : id))

      // 열 묶기 — 첫 열을 골라 팔레트 «열 묶음» 은 그 열 뒤(«안» 은 셀 틀이라 설 자리에 걸려 «뒤» 로 물러선다).
      await pick(page, 'f_ca')
      await openPalette(page, 'GridColumnGroup')
      await page.locator('[data-wb-palette-card="GridColumnGroup"] .wb-shell-palette-add').click()
      const grouped = await poll(
        '팔레트 «열 묶음»',
        () => server(P),
        (root) => (find(root, 'f_g')!.children ?? []).some((child) => child.type === 'GridColumnGroup'),
      )
      const group = find(grouped, 'f_g')!.children!.find((child) => child.type === 'GridColumnGroup')!.id
      const named = (ids: unknown[]): unknown[] =>
        ids.map((id) => (Array.isArray(id) ? named(id) : id === dup ? '복제' : id === group ? '묶음' : id))
      steps['열 묶음'] = named(columnsOf(find(grouped, 'f_g')!))
      // 들여쓰기 둘 — 복제 · B 가 앞 형제(열 묶음) 몸통으로.
      for (const id of [dup, 'f_cb']) {
        await pick(page, id)
        await page.keyboard.press('Alt+Shift+ArrowRight')
        await poll(
          `${id} 들여쓰기`,
          () => server(P),
          (root) => (find(root, group)!.children ?? []).some((child) => child.id === id),
        )
      }
      const indented = await server(P)
      steps['묶기'] = named(columnsOf(find(indented, 'f_g')!))
      await frame.locator(`th[data-wb-id="${group}"][colspan="2"]`).waitFor({ state: 'attached' })
      // 풀기 — B 를 내어쓰기하면 묶음 뒤로.
      await pick(page, 'f_cb')
      await page.keyboard.press('Alt+Shift+ArrowLeft')
      const outdented = await poll(
        'B 내어쓰기',
        () => server(P),
        (root) => (find(root, 'f_g')!.children ?? []).some((child) => child.id === 'f_cb'),
      )
      steps['풀기'] = named(columnsOf(find(outdented, 'f_g')!))

      // 한 행 떼어 내기 두 번 → 첫 행 · 둘째 행 · 나머지 셋.
      await rowAction(page, 'f_r', '한 행 떼어 내기')
      const once = await poll(
        '첫 떼기',
        () => server(P),
        (root) => rowsOf(root, 'f_g').length === 2,
      )
      const second = find(once, 'f_g')!.zones!.rows![1]!.id
      await rowAction(page, second, '한 행 떼어 내기')
      const twice = await poll(
        '둘째 떼기',
        () => server(P),
        (root) => rowsOf(root, 'f_g').length === 3,
      )
      const third = find(twice, 'f_g')!.zones!.rows![2]!.id
      // 행 꼴 — 첫 행 강조 · 둘째 행 딤드.
      for (const [id, tone] of [
        ['f_r', 'selected'],
        [second, 'dimmed'],
      ] as const) {
        await pick(page, id)
        await page.getByLabel('행 꼴', { exact: true }).selectOption(tone)
        await poll(
          `${id} 행 꼴`,
          () => server(P),
          (root) => find(root, id)?.props?.tone === tone,
        )
      }
      await frame.locator(`tr[data-wb-id="${second}"][data-wb-tone="dimmed"]`).waitFor({ state: 'attached' })
      const toned = await server(P)
      const rowName = (id: unknown) => (id === 'f_r' ? '첫' : id === second ? '둘째' : id === third ? '셋째' : id)
      steps['떼기 · 행 꼴'] = rowsOf(toned, 'f_g').map(([id, ...rest]) => [rowName(id), ...rest])
      steps['캔버스 행'] = {
        first: await frame.locator('tr[data-wb-id="f_r"]').getAttribute('data-wb-tone'),
        second: await frame.locator(`tr[data-wb-id="${second}"]`).getAttribute('data-wb-tone'),
        thirdCopies: await frame.locator(`[data-wb-copy-of="${third}"]`).count(),
      }

      // 열 틀로 칸 짓기 → 첫 칸 «가로 칸 수» 2 · 둘째 칸 지우기 · 종류 합계.
      await rowAction(page, third, '열 틀로 칸 짓기')
      const built = await poll(
        '칸 짓기',
        () => server(P),
        (root) => (find(root, third)?.children ?? []).length > 0,
      )
      const cells = find(built, third)!.children!
      steps['칸 짓기'] = cells.map((cell) => (cell.children ?? []).map((piece) => piece.props?.content ?? piece.type))
      await pick(page, cells[0]!.id)
      const span = page.getByLabel('가로 칸 수', { exact: true })
      await span.fill('2')
      await span.press('Enter')
      await poll(
        '가로 칸 수',
        () => server(P),
        (root) => find(root, cells[0]!.id)?.props?.span === 2,
      )
      await pick(page, cells[1]!.id)
      await page.keyboard.press('Delete')
      await poll(
        '칸 지우기',
        () => server(P),
        (root) => find(root, cells[1]!.id) === undefined,
      )
      await pick(page, third)
      await page.getByLabel('종류', { exact: true }).selectOption('total')
      const total = await poll(
        '합계 행',
        () => server(P),
        (root) => find(root, third)?.props?.kind === 'total',
      )
      steps['합계 행'] = {
        row: rowsOf(total, 'f_g')
          .filter(([id]) => id === third)
          .map(([, ...rest]) => rest)[0],
        spans: find(total, third)!.children!.map((cell) => (cell.props?.span as number | undefined) ?? 1),
        firstColSpan: await frame.locator(`td[data-wb-id="${cells[0]!.id}"]`).getAttribute('colspan'),
      }

      // eslint-disable-next-line no-console
      console.log('[흐름]', JSON.stringify(steps))
      expect(steps).toEqual({
        복제: ['f_ca', '복제', 'f_cb', 'f_cc'],
        '열 묶음': ['f_ca', ['묶음'], '복제', 'f_cb', 'f_cc'],
        묶기: ['f_ca', ['묶음', '복제', 'f_cb'], 'f_cc'],
        풀기: ['f_ca', ['묶음', '복제'], 'f_cb', 'f_cc'],
        '떼기 · 행 꼴': [
          ['첫', 1, 'data', 'selected', 0],
          ['둘째', 1, 'data', 'dimmed', 0],
          ['셋째', 3, 'data', 'default', 0],
        ],
        '캔버스 행': { first: 'selected', second: 'dimmed', thirdCopies: 2 },
        '칸 짓기': [['A'], ['A'], ['B'], ['C']],
        '합계 행': { row: [3, 'total', 'default', 3], spans: [2, 1, 1], firstColSpan: '2' },
      })
    } finally {
      await close()
    }
  }, 120_000)

  /**
   * **두 사람 — 잠금.** 밥이 열(B)을 쥔 동안 앨리스의 «열 틀로 칸 짓기» 는 안 나간다 — 남이 고치는 셀 틀을 베끼지 않는다(`panels/structure-toolbar.tsx` 의
   * `buildCells`). «한 행 떼어 내기» 는 열을 안 써 나간다. 밥이 셀 틀을 고치고 놓은 뒤의 칸 짓기는 밥의 글을 베끼고, 셀 틀은 밥의 것 그대로다.
   */
  it('두 사람 — 밥이 열을 쥔 동안 칸 짓기는 막히고(밥의 이름) 떼어 내기는 나간다 · 밥이 놓은 뒤 칸 짓기는 밥의 셀 틀을 베낀다', async () => {
    const { P } = await seed('grb-two-lock', FLOW, true)
    const a = await open(P, 'f_g')
    const b = await open(P, 'f_g', { user: 'bob' })
    try {
      await pick(b.page, 'f_cb')
      await poll(
        '밥의 잠금이 앨리스에게 닿는다',
        () => a.page.locator(`${TREE} [data-tree-id="f_cb"]`).locator('xpath=..').locator('.wb-shell-structure-lock').count(),
        (n) => n > 0,
      )
      const head = await headOf(P)
      await rowAction(a.page, 'f_r', '열 틀로 칸 짓기')
      await a.page.waitForTimeout(800)
      const blocked = {
        head: (await headOf(P)) - head,
        said: (await a.page.getByText(/밥님이/).allTextContents()).length > 0,
      }
      await rowAction(a.page, 'f_r', '한 행 떼어 내기')
      const split = await poll(
        '떼어 내기는 나간다',
        () => server(P),
        (root) => rowsOf(root, 'f_g').length === 2,
      )
      // 밥이 셀 틀 글을 고치고(제 잠금 안 — 서버가 받는다) 열을 놓는다.
      const bobs = await stack.request(await stack.login(stack.users.bob), 'PATCH', `${P}/ops`, {
        baseSeq: await headOf(P),
        ops: [{ op: 'replace', path: '/root/children/0/children/1/children/0/props/content', value: '밥 고침' }],
      })
      expect(bobs.status, JSON.stringify(bobs.body)).toBe(200)
      // 열이 아닌 것(바)을 골라 놓는다 — 다른 열을 고르면 그 열의 셀 틀을 칸 짓기가 베끼지 못한다.
      await pick(b.page, 'f_p')
      await poll(
        '밥의 B 잠금이 걷힌다',
        () => a.page.locator(`${TREE} [data-tree-id="f_cb"]`).locator('xpath=..').locator('.wb-shell-structure-lock').count(),
        (n) => n === 0,
      )
      await canvasFrame(a.page).locator('[data-wb-id="f_tb"]', { hasText: '밥 고침' }).waitFor({ state: 'attached' })
      const fresh = find(split, 'f_g')!.zones!.rows![1]!.id
      await rowAction(a.page, fresh, '열 틀로 칸 짓기')
      const built = await poll(
        '밥이 놓은 뒤 칸 짓기',
        () => server(P),
        (root) => (find(root, fresh)?.children ?? []).length > 0,
      )
      const outcome = {
        blocked,
        rowsAfterSplit: rowsOf(split, 'f_g').map(([, ...rest]) => rest),
        cells: find(built, fresh)!.children!.map((cell) => cell.children?.[0]?.props?.content),
        template: find(built, 'f_tb')!.props?.content,
      }
      // eslint-disable-next-line no-console
      console.log('[두 사람 — 잠금]', JSON.stringify(outcome))
      expect(outcome).toEqual({
        blocked: { head: 0, said: true },
        rowsAfterSplit: [
          [1, 'data', 'default', 0],
          [4, 'data', 'default', 0],
        ],
        cells: ['A', '밥 고침', 'C'],
        template: '밥 고침',
      })
    } finally {
      await a.close()
      await b.close()
    }
  }, 120_000)

  /**
   * **두 사람 — 남의 편집이 닿기 전**(3단계 이월 «종류 바꾸기» 꼴 · `build-test/compose-input.test.ts` «남의 안내 문구 고침이 닿기 전에»). 밥이 행의
   * «되풀이» 를 5 → 7 로 고치고(REST), 그 고침이 앨리스 화면에 닿기 전(서버 → 브라우저 1.5s)에 앨리스가 그 행을 떼어 낸다. 셀 틀 글도 같은 꼴로 —
   * 밥이 고친 글이 닿기 전에 앨리스가 다른 행의 칸을 짓는다. 서버에 무엇이 남는지 값으로 적고, 끝에 화면 = 서버인지 단언한다.
   */
  it('두 사람 — 밥의 «되풀이» · 셀 틀 고침이 닿기 전에 떼어 내기 · 칸 짓기를 누르면 서버에 남는 것 · 끝에 화면 = 서버', async () => {
    const twoRows: Node[] = [
      {
        ...FLOW[0]!,
        zones: {
          rows: [
            { id: 'f_r', type: 'GridRow', props: { repeat: 5 } },
            { id: 'f_r2', type: 'GridRow' },
          ],
        },
      },
    ]
    const { P } = await seed('grb-two-stale', twoRows, true)
    const bob = await stack.login(stack.users.bob)
    const slow = await stack.startDownDelay(1500)
    const received: string[] = []
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: slow.origin })
    page.on('websocket', (socket) => socket.on('framereceived', (f) => received.push(String(f.payload))))
    const outcome: Record<string, unknown> = {}
    try {
      await page.goto(`${slow.origin}${P}`)
      await canvasFrame(page).locator('[data-wb-id="f_g"]').waitFor({ state: 'attached' })
      await poll('joined', async () => received.some((f) => f.includes('"type":"joined"')), Boolean, 15_000)

      for (const [name, ops, act, settled] of [
        [
          '되풀이 5 → 7 뒤 떼어 내기',
          [{ op: 'replace', path: '/root/children/0/zones/rows/0/props/repeat', value: 7 }],
          () => rowAction(page, 'f_r', '한 행 떼어 내기'),
          // 밥의 7 이 남거나(떼어 내기를 버림) 행이 셋이 되면(떼어 내기가 얹힘) 선 것이다 — 어느 쪽인지는 값으로 단언한다.
          (root: Node) => rowsOf(root, 'f_g').length === 3 || find(root, 'f_r')?.props?.repeat === 7,
        ],
        [
          '셀 틀 B 고침 뒤 칸 짓기',
          [{ op: 'replace', path: '/root/children/0/children/1/children/0/props/content', value: '밥 고침' }],
          () => rowAction(page, 'f_r2', '열 틀로 칸 짓기'),
          (root: Node) => (find(root, 'f_r2')?.children ?? []).length > 0,
        ],
      ] as const) {
        const before = received.filter((f) => f.includes('"type":"page-changed"')).length
        const theirs = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: await headOf(P), ops })
        expect(theirs.status, JSON.stringify(theirs.body)).toBe(200)
        await act()
        // 판 카나리아 — 누른 때 밥의 고침은 아직 앨리스 화면에 안 닿았다.
        const stale = received.filter((f) => f.includes('"type":"page-changed"')).length === before
        const landed = await poll('서버에 닿는다', () => server(P), settled, 15_000).catch(() => server(P))
        // 늦춘 프레임이 다 닿을 때까지 — 밥의 고침이 앨리스 화면에 서고(캔버스 줄 수 · 셀 틀 글이 서버의 것), 버린 편집의 알림이 서면 그것까지. 다음 걸음의
        // «닿기 전» 카나리아를 이 걸음의 늦은 프레임이 흐리지 않게 한다.
        const lines = rowsOf(landed, 'f_g').reduce((sum, [, repeat]) => sum + Number(repeat), 0)
        const template = String(find(landed, 'f_tb')?.props?.content)
        await poll(
          '앨리스 화면이 서버의 것',
          async () => [
            await canvasFrame(page).locator('tbody > tr').count(),
            await canvasFrame(page).locator('[data-wb-id="f_tb"]').textContent(),
          ],
          ([count, text]) => count === lines && text === template,
          15_000,
        ).catch(() => null)
        await poll(
          '버린 편집의 알림',
          () => page.locator('.wb-shell-info-notice, .wb-shell-edit-alert').count(),
          (n) => n > 0,
          3000,
        ).catch(() => 0)
        outcome[name] = {
          stale,
          rows: rowsOf(landed, 'f_g').map(([id, ...rest]) => [String(id).startsWith('f_') ? id : '새', ...rest]),
          cells: (find(landed, 'f_r2')?.children ?? []).map((cell) => cell.children?.[0]?.props?.content),
          template: find(landed, 'f_tb')?.props?.content,
          notices: await page.locator('.wb-shell-info-notice, .wb-shell-edit-alert').allTextContents(),
        }
      }
      // 끝에 화면 = 서버 — 캔버스의 행 수(원본 + 사본)와 칸 글이 서버 문서의 것.
      const last = await server(P)
      const expected = {
        lines: rowsOf(last, 'f_g').reduce((sum, [, repeat]) => sum + Number(repeat), 0),
        cells: (find(last, 'f_r2')?.children ?? []).map((cell) => cell.children?.[0]?.props?.content),
      }
      const shown = await poll(
        '캔버스가 서버와 같다',
        async () => ({
          lines: await canvasFrame(page).locator('tbody > tr').count(),
          cells: await canvasFrame(page)
            .locator('tr[data-wb-id="f_r2"] > td')
            .evaluateAll((tds) => tds.map((td) => td.textContent ?? '')),
        }),
        (now) => now.lines === expected.lines && JSON.stringify(now.cells) === JSON.stringify(expected.cells),
        15_000,
      ).catch(async () => ({
        lines: await canvasFrame(page).locator('tbody > tr').count(),
        cells: await canvasFrame(page)
          .locator('tr[data-wb-id="f_r2"] > td')
          .evaluateAll((tds) => tds.map((td) => td.textContent ?? '')),
      }))
      outcome['끝'] = { expected, shown, delayed: slow.delayed() }
      // eslint-disable-next-line no-console
      console.log('[두 사람 — 닿기 전]', JSON.stringify(outcome))
      expect(slow.delayed()).toBeGreaterThan(0)
      expect(shown).toEqual(expected)
      // 떼어 내기는 낡은 되풀이 수(5) 위에서 지어져 전제(`test`)에 걸려 버려진다 — 밥의 7 이 남는다(고치기 전에는 떼어 내기가 얹혀 밥의 7 이 말없이 걷혔다).
      // 칸 짓기는 누른 때 본 셀 틀(«B»)을 베낀다 — 셀 틀 자신은 밥의 글 그대로다.
      const named = outcome as Record<string, { stale: boolean; rows: unknown; cells: unknown; template: unknown; notices: string[] }>
      expect({
        split: {
          stale: named['되풀이 5 → 7 뒤 떼어 내기']!.stale,
          rows: named['되풀이 5 → 7 뒤 떼어 내기']!.rows,
          told: named['되풀이 5 → 7 뒤 떼어 내기']!.notices.length > 0,
        },
        build: {
          stale: named['셀 틀 B 고침 뒤 칸 짓기']!.stale,
          cells: named['셀 틀 B 고침 뒤 칸 짓기']!.cells,
          template: named['셀 틀 B 고침 뒤 칸 짓기']!.template,
        },
      }).toEqual({
        split: {
          stale: true,
          rows: [
            ['f_r', 7, 'data', 'default', 0],
            ['f_r2', 1, 'data', 'default', 0],
          ],
          told: true,
        },
        build: { stale: true, cells: ['A', 'B', 'C'], template: '밥 고침' },
      })
    } finally {
      await context.close()
      await slow.close()
    }
  }, 120_000)

  /** **되돌리기** — 줄 행동 하나가 되돌리기 한 번 · 다시 실행 한 번이다. */
  it('되돌리기 — 떼어 내기 · 칸 짓기가 각각 한 번에 돌아가고 다시 실행된다', async () => {
    const { P } = await seed('grb-undo', FLOW)
    const { page, close } = await open(P, 'f_g')
    const history = page.getByRole('group', { name: '편집 이력' })
    const shape = async () => JSON.stringify(rowsOf(await server(P), 'f_g').map(([, ...rest]) => rest))
    const start = await shape()
    const marks: Record<string, unknown> = {}
    try {
      await rowAction(page, 'f_r', '한 행 떼어 내기')
      const split = await poll('떼어 내기', shape, (now) => now !== start)
      await history.getByRole('button', { name: '되돌리기' }).click()
      marks['떼기 되돌리기'] = (await poll('되돌리기', shape, (now) => now === start).catch(shape)) === start
      await history.getByRole('button', { name: '다시 실행' }).click()
      marks['떼기 다시 실행'] = (await poll('다시 실행', shape, (now) => now === split).catch(shape)) === split

      await rowAction(page, 'f_r', '열 틀로 칸 짓기')
      const built = await poll('칸 짓기', shape, (now) => now !== split)
      await history.getByRole('button', { name: '되돌리기' }).click()
      marks['칸 짓기 되돌리기'] = (await poll('되돌리기', shape, (now) => now === split).catch(shape)) === split
      await history.getByRole('button', { name: '다시 실행' }).click()
      marks['칸 짓기 다시 실행'] = (await poll('다시 실행', shape, (now) => now === built).catch(shape)) === built
      // eslint-disable-next-line no-console
      console.log('[되돌리기]', JSON.stringify({ start, split, built, marks }))
      expect(marks).toEqual({ '떼기 되돌리기': true, '떼기 다시 실행': true, '칸 짓기 되돌리기': true, '칸 짓기 다시 실행': true })
    } finally {
      await close()
    }
  }, 120_000)

  /**
   * **새로고침으로 채운 되돌리기**(서버 이력 — `build-test/editor-page-version.test.ts` «새로고침으로 채운 되돌리기» 꼴). 떼어 내기 · 칸 짓기를 하고
   * 새로고침하면 되돌리기 한 번이 칸 짓기를, 한 번 더가 떼어 내기를 돌린다 — 줄 행동 하나가 서버 이력의 revision 하나다.
   */
  it('새로고침 뒤 — 되돌리기 한 번이 칸 짓기를 · 한 번 더가 떼어 내기를 돌린다', async () => {
    const { P } = await seed('grb-undo-reload', FLOW)
    const { page, close } = await open(P, 'f_g')
    const history = page.getByRole('group', { name: '편집 이력' })
    const shape = async () => JSON.stringify(rowsOf(await server(P), 'f_g').map(([, ...rest]) => rest))
    const start = await shape()
    try {
      await rowAction(page, 'f_r', '한 행 떼어 내기')
      const split = await poll('떼어 내기', shape, (now) => now !== start)
      await rowAction(page, 'f_r', '열 틀로 칸 짓기')
      const built = await poll('칸 짓기', shape, (now) => now !== split)
      const heads = { built: await headOf(P) }

      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="f_g"]').waitFor({ state: 'attached' })
      const undo = history.getByRole('button', { name: '되돌리기' })
      await poll('새로고침 뒤 되돌리기가 켜진다', () => undo.isEnabled(), Boolean)
      await undo.click()
      const once = await poll('되돌리기 한 번', shape, (now) => now !== built).catch(shape)
      await page.waitForTimeout(600)
      await undo.click()
      const twice = await poll('되돌리기 두 번', shape, (now) => now !== once).catch(shape)
      const marks = { once: once === split, twice: twice === start, heads: (await headOf(P)) - heads.built }
      // eslint-disable-next-line no-console
      console.log('[새로고침 뒤 되돌리기]', JSON.stringify({ start, split, built, once, twice, marks }))
      expect(marks).toEqual({ once: true, twice: true, heads: 2 })
    } finally {
      await close()
    }
  }, 120_000)
})
