/**
 * **그리드 에디터 입구(GR-B) — 실브라우저 판**(설계 spec `2026-10-25-grid-design.md` «8» · «11» GR-B 6).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 사본 위 놓기 | 사본(되풀이 줄의 셀 틀 글 · 틀 칸)에 팔레트 카드를 끌면 표시가 없고 «첫 행의 칸에 놓으세요» 가 포인터 곁에 서며 놓아도 편집 0 · 첫 줄 틀 칸의 빈 자리는 그 열의 셀 틀 끝 |
 * | 번호 칸 위 놓기 | 첫 줄 번호 칸은 번호 열의 셀 틀로 안 읽힌다 — 표시 없음 · «행에는 칸만 …» · 편집 0 |
 * | 흐름 | 열 복제(Cmd+D) · 열을 골라 팔레트 «열 묶음»(그 열 뒤) · 들여쓰기로 묶기 · 내어쓰기로 풀기 · «한 행 떼어 내기» 두 번 → 첫 행 강조 · 둘째 행 딤드 · «열 틀로 칸 짓기» → 칸 고치기(가로 칸 수 · 지우기) · 합계 행 — 걸음마다 서버 문서와 캔버스의 표지 |
 * | 두 사람 — 잠금 | 밥이 열을 쥔 동안 앨리스의 «열 틀로 칸 짓기» 는 꺼진 채 밥의 이름을 들고 안 나가며 «한 행 떼어 내기» 는 나간다 · 밥이 놓은 뒤의 칸 짓기는 밥이 고친 셀 틀을 베끼고 셀 틀은 밥의 것 그대로 |
 * | 두 사람 — 닿기 전 | 밥의 «되풀이» · 셀 틀 고침이 앨리스 화면에 닿기 전(서버 → 브라우저 1.5s)에 앨리스가 떼어 내기 · 칸 짓기를 눌렀을 때 서버에 무엇이 남는지 값으로 · 끝에 화면 = 서버 |
 * | 두 사람 — 닿기 전: 칸마다 | 떼어 내기가 베끼는 행의 칸(행 꼴 · 제 칸 글 · 보임 · 별칭 · 상호작용) · 칸 짓기가 읽는 열(더함 · 지움)을 밥이 바꾼 것이 닿기 전 — 서버에 밥의 것이 남고 앨리스의 묶음은 버려진다(알림) · 대조 둘(행 지움 · 같은 행 먼저 떼어 냄) |
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
  alias?: string
  visibility?: unknown
  interactions?: unknown[]
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

/**
 * FLOW 앞에 행 하나(`f_r0`)를 둔 판 — «열 틀로 칸 짓기» 는 첫 행에 못 짓는다(`src/edit/grid-row-actions.ts` 의 `FIRST_ROW_WHY` — 첫 행은 늘 기본). 칸을 짓는
 * 판은 둘째 행 뒤에 짓는다.
 */
const FLOW_TOP: Node[] = [{ ...FLOW[0]!, zones: { ...FLOW[0]!.zones!, rows: [{ id: 'f_r0', type: 'GridRow' }, ...FLOW[0]!.zones!.rows!] } }]

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

  async function seed(slug: string, nodes: Node[], bob = false, viewStates: { id: string; name: string }[] = []): Promise<{ P: string }> {
    const project = (await call('POST', '/projects', { name: '그리드 입구', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        ...(viewStates.length === 0 ? [] : [{ op: 'add', path: '/viewStates', value: viewStates }]),
        ...nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
      ],
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
   * «훑기 자리 × 사본을 읽는 법») 사본 글 위는 그리드의 거절 문장이, 사본 줄 틀 칸의 빈 자리는 그리드 곁의 미리보기(놓으면 그 자리에 놓인다)가 섰다. 첫 줄 틀 칸의
   * 빈 자리는 그 열의 셀 틀 끝이다 — 고치기 전에는 행(칸만 받는다)으로 읽혀 «행에는 칸만 놓을 수 있습니다» 였다.
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
   * **번호 칸은 셀 틀이 아니다**(`canvas/canvas-drop.ts` 머리말 «첫 줄 틀 칸») — 번호 열의 칸도 `data-wb-column-of` 를 달지만 셀 틀이 안 그려져, 그 빈 자리를 열 셀
   * 틀 끝으로 읽으면 화면에 안 나오는 자리(lint `ignored-template`)에 놓인다. 첫 줄 번호 칸 위는 행으로 읽혀 표시가 없다(리뷰 변조 X6 — 번호 열 없는 픽스처의
   * 빈칸).
   */
  it('첫 줄 번호 칸 위에 끌면 표시 없이 «행에는 칸만 …» · 놓아도 편집 0 — 번호 열의 셀 틀로 안 읽힌다', async () => {
    const numbered: Node[] = [
      {
        id: 'd_g',
        type: 'DataGrid',
        children: [
          { id: 'd_no', type: 'GridColumn', props: { label: 'No', numbering: 'asc' } },
          {
            id: 'd_c0',
            type: 'GridColumn',
            props: { label: '이름' },
            children: [{ id: 'd_t0', type: 'Text', props: { content: '홍길동' } }],
          },
        ],
        zones: { rows: [{ id: 'd_r', type: 'GridRow', props: { repeat: 2 } }] },
      },
    ]
    const { P } = await seed('grb-number-drop', numbered)
    const { page, close } = await open(P, 'd_g')
    const before = JSON.stringify(await server(P))
    try {
      await openPalette(page, 'Divider')
      const number = 'tr[data-wb-id="d_r"] > td[data-wb-cell="number"]'
      // 판 카나리아 — 첫 줄 번호 칸이 «1» 로 섰고 번호 열을 단다.
      expect([
        await canvasFrame(page).locator(number).textContent(),
        await canvasFrame(page).locator(number).getAttribute('data-wb-column-of'),
      ]).toEqual(['1', 'd_no'])
      await grabCard(page, 'Divider')
      await moveInto(page, number, 0, 0.5, 0.5)
      const outcome = { shown: await indicators(page), refusal: await refusals(page) }
      await page.mouse.up()
      await page.waitForTimeout(800)
      // eslint-disable-next-line no-console
      console.log('[번호 칸 위 놓기]', JSON.stringify(outcome))
      expect({ outcome, untouched: JSON.stringify(await server(P)) === before }).toEqual({
        outcome: { shown: [], refusal: ['행에는 칸만 놓을 수 있습니다'] },
        untouched: true,
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
      // «종류»(data · total · gap)는 세그먼트 단추다(`src/panels/controls/select-control.tsx`).
      await page.getByRole('radiogroup', { name: '종류', exact: true }).getByRole('radio', { name: 'total', exact: true }).click()
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
    const { P } = await seed('grb-two-lock', FLOW_TOP, true)
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
      // 항목이 꺼진 채 밥의 이름을 까닭으로 든다(누르기 전에 — 리뷰 L5). 꺼진 항목을 눌러도 편집이 안 나간다.
      await pick(a.page, 'f_r')
      await treeRow(a.page, 'f_r')
        .getByRole('button', { name: /더 보기$/ })
        .click()
      const item = a.page.getByRole('menuitem', { name: '열 틀로 칸 짓기', exact: true })
      const off = { disabled: await item.getAttribute('aria-disabled'), why: await item.getAttribute('aria-description') }
      await item.click({ force: true })
      await a.page.keyboard.press('Escape')
      await a.page.waitForTimeout(800)
      const blocked = { ...off, head: (await headOf(P)) - head }
      // 그 걸음의 값을 그 자리에서 — 막힘을 떼면 칸 짓기가 셀 틀 원본 줄을 없애 뒤 걸음이 값 없이 멈춘다.
      expect(blocked).toEqual({ disabled: 'true', why: '밥님이 편집 중이라 바꿀 수 없습니다', head: 0 })
      await rowAction(a.page, 'f_r', '한 행 떼어 내기')
      const split = await poll(
        '떼어 내기는 나간다',
        () => server(P),
        (root) => rowsOf(root, 'f_g').length === 3,
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
      const fresh = find(split, 'f_g')!.zones!.rows![2]!.id
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
        blocked: { disabled: 'true', why: '밥님이 편집 중이라 바꿀 수 없습니다', head: 0 },
        rowsAfterSplit: [
          [1, 'data', 'default', 0],
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
          // 칸이 서거나(칸 짓기가 얹힘) 밥의 글이 서면(칸 짓기를 버림) 선 것이다.
          (root: Node) => (find(root, 'f_r2')?.children ?? []).length > 0 || find(root, 'f_tb')?.props?.content === '밥 고침',
        ],
      ] as const) {
        const before = received.filter((f) => f.includes('"type":"page-changed"')).length
        const theirs = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: await headOf(P), ops })
        expect(theirs.status, JSON.stringify(theirs.body)).toBe(200)
        await act()
        // 판 카나리아 — 누른 때 밥의 고침은 아직 앨리스 화면에 안 닿았다.
        const stale = received.filter((f) => f.includes('"type":"page-changed"')).length === before
        await poll('서버에 닿는다', () => server(P), settled, 15_000).catch(() => null)
        // 늦춘 프레임 · 리베이스가 다 끝날 때까지 — 앨리스 화면(캔버스 줄 수 · 셀 틀 글)이 **그때의** 서버 문서와 같고 1.5s 뒤에도 서버가 그대로일 때. 밥의
        // 고침이 먼저 서버에 서고 앨리스의 묶음은 그 프레임을 받은 뒤 리베이스되어 나가므로, 첫 «서버에 닿음» 으로 끊으면 뒤에 얹히는 묶음을 못 본다. 다음 걸음의
        // «닿기 전» 카나리아를 이 걸음의 늦은 프레임이 흐리지 않게도 한다.
        const view = async () => {
          const root = await server(P)
          const lines = rowsOf(root, 'f_g').reduce((sum, [, repeat]) => sum + Number(repeat), 0)
          const shown = [
            await canvasFrame(page).locator('tbody > tr').count(),
            await canvasFrame(page).locator('[data-wb-id="f_tb"]').textContent(),
          ]
          return { root, same: shown[0] === lines && shown[1] === String(find(root, 'f_tb')?.props?.content) }
        }
        let landed = (await view()).root
        for (let round = 0; round < 10; round += 1) {
          const first = await poll('앨리스 화면이 서버의 것', view, (now) => now.same, 15_000).catch(view)
          await page.waitForTimeout(1500)
          const again = await view()
          landed = again.root
          if (again.same && JSON.stringify(again.root) === JSON.stringify(first.root)) break
        }
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
      // 끝에 화면 = 서버 — 캔버스의 행 수(원본 + 사본)와 칸 글이 서버 문서의 것. 칸 없는 행은 열마다 셀 틀 글을 그린다.
      const last = await server(P)
      const own = find(last, 'f_r2')?.children ?? []
      const expected = {
        lines: rowsOf(last, 'f_g').reduce((sum, [, repeat]) => sum + Number(repeat), 0),
        cells: (own.length > 0 ? own : (find(last, 'f_g')?.children ?? [])).map((cell) => cell.children?.[0]?.props?.content),
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
      // 떼어 내기는 낡은 행(되풀이 5) 위에서 지어져 전제(행 통째 `test`)에 걸려 버려진다 — 밥의 7 이 남는다(고치기 전에는 떼어 내기가 얹혀 밥의 7 이 말없이
      // 걷혔다). 칸 짓기도 낡은 열 트리(셀 틀 «B») 위에서 지어져 전제(열 트리 `test`)에 걸려 버려진다 — 낡은 셀 틀을 베끼지 않는다(고치기 전에는 «B» 를 베꼈다).
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
          told: named['셀 틀 B 고침 뒤 칸 짓기']!.notices.some((text) => text.includes('버렸습니다')),
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
        build: { stale: true, cells: [], template: '밥 고침', told: true },
      })
    } finally {
      await context.close()
      await slow.close()
    }
  }, 120_000)

  /** 문서 안 그 노드의 경로(JSON Pointer) — 밥의 REST 편집이 앨리스의 문서와 같은 노드를 가리킨다. */
  function pathOf(root: Node, id: string, at = '/root'): string {
    if (root.id === id) return at
    for (const [i, child] of (root.children ?? []).entries()) {
      const hit = pathOf(child, id, `${at}/children/${i}`)
      if (hit !== '') return hit
    }
    for (const [zone, list] of Object.entries(root.zones ?? {}))
      for (const [i, child] of list.entries()) {
        const hit = pathOf(child, id, `${at}/zones/${zone}/${i}`)
        if (hit !== '') return hit
      }
    return ''
  }

  /**
   * 칸을 다 든 행(별칭 · props · 상태 보임 · 상호작용 · 제 칸) — 떼어 내기가 베끼는 칸마다 «닿기 전» 판을 하나씩 세우려고 모두 미리 둔다. 남이 **있던 칸을
   * 바꾸는** 판이라 칸 하나만 전제에서 뺀 변조가 그 판만 죽인다(없던 칸을 더하는 판은 칸마다의 `test` 로 못 가른다).
   */
  const FULL_ROW: Node = {
    id: 'f_r',
    type: 'GridRow',
    alias: '첫 행',
    props: { repeat: 4, tone: 'default' },
    visibility: { mode: 'except', states: ['s_x'] },
    interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'f_r', prop: 'tone', value: 'selected' }] }],
    children: ['a', 'b', 'c'].map((key) => ({
      id: `f_k${key}`,
      type: 'GridCell',
      children: [{ id: `f_x${key}`, type: 'Text', props: { content: `옛${key}` } }],
    })),
  }

  interface BeforeArrival {
    name: string
    rows: Node[]
    theirs: (root: Node) => unknown[]
    act: string
    target: string
    /** 서버에 남은 것에서 읽을 값 — 단언은 이 값과 알림이다. */
    read: (root: Node) => unknown
    expected: unknown
  }

  /** 행 하나의 칸 — 별칭 · 되풀이 · 행 꼴 · 보임 · 상호작용 동작의 값 · 제 칸 글. */
  const rowFields = (root: Node) =>
    (find(root, 'f_g')?.zones?.rows ?? []).map((row) => ({
      id: row.id.startsWith('f_') ? row.id : '새',
      alias: row.alias ?? null,
      repeat: (row.props?.repeat as number | undefined) ?? 1,
      tone: (row.props?.tone as string | undefined) ?? 'default',
      visibility: row.visibility ?? null,
      on: ((row.interactions ?? []) as { actions: { value?: unknown }[] }[]).map((one) =>
        one.actions.map((action) => action.value ?? null),
      ),
      cells: (row.children ?? []).map((cell) => cell.children?.[0]?.props?.content ?? null),
    }))

  const FULL_FIELDS = {
    id: 'f_r',
    alias: '첫 행',
    repeat: 4,
    tone: 'default',
    visibility: { mode: 'except', states: ['s_x'] },
    on: [['selected']],
    cells: ['옛a', '옛b', '옛c'],
  }
  const columnsAndCells = (root: Node) => ({
    leaves: (find(root, 'f_g')?.children ?? []).map((column) => column.id),
    cells: (find(root, 'f_r')?.children ?? []).length,
  })

  /**
   * **남의 편집이 닿기 전 — 떼어 내기 · 칸 짓기가 베끼는 칸 전부**(리뷰 `docs/superpowers/plans/2026-10-26-rv-grb-report.md` H1 · M3). 밥이 REST 로 그 칸을
   * 고치고, 그 고침이 앨리스 화면에 닿기 전(서버 → 브라우저 1.5s)에 앨리스가 누른다. 떼어 내기는 뒤 행을 낡은 행의 사본으로 짓고 칸 짓기는 낡은 열 수로 칸을
   * 지으므로, 묶음이 그 칸을 전제로 안 묶으면 밥의 고침이 둘째 줄부터 말없이 걷히거나 칸 수가 열과 어긋난다. 판마다 서버에 밥의 고침이 남고(앨리스의 묶음은
   * 버려짐) 버린 편집의 알림이 서는지 본다. 행 지움 · 같은 행 떼어 내기는 대조다(고치기 전에도 버려졌다). 되풀이 칸은 위 «닿기 전» 케이스가 잰다.
   */
  const BEFORE_ARRIVAL: BeforeArrival[] = [
    {
      name: '떼어 내기 — 밥이 행 꼴을 바꿈',
      rows: [FULL_ROW],
      theirs: (root) => [{ op: 'replace', path: `${pathOf(root, 'f_r')}/props/tone`, value: 'dimmed' }],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: rowFields,
      expected: [{ ...FULL_FIELDS, tone: 'dimmed' }],
    },
    {
      name: '떼어 내기 — 밥이 제 칸 글을 바꿈',
      rows: [FULL_ROW],
      theirs: (root) => [{ op: 'replace', path: `${pathOf(root, 'f_xb')}/props/content`, value: '밥' }],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: rowFields,
      expected: [{ ...FULL_FIELDS, cells: ['옛a', '밥', '옛c'] }],
    },
    {
      name: '떼어 내기 — 밥이 상태 보임을 바꿈',
      rows: [FULL_ROW],
      theirs: (root) => [{ op: 'replace', path: `${pathOf(root, 'f_r')}/visibility`, value: { mode: 'only', states: ['s_x'] } }],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: rowFields,
      expected: [{ ...FULL_FIELDS, visibility: { mode: 'only', states: ['s_x'] } }],
    },
    {
      name: '떼어 내기 — 밥이 별칭을 바꿈',
      rows: [FULL_ROW],
      theirs: (root) => [{ op: 'replace', path: `${pathOf(root, 'f_r')}/alias`, value: '밥 행' }],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: rowFields,
      expected: [{ ...FULL_FIELDS, alias: '밥 행' }],
    },
    {
      name: '떼어 내기 — 밥이 상호작용을 바꿈',
      rows: [FULL_ROW],
      theirs: (root) => [{ op: 'replace', path: `${pathOf(root, 'f_r')}/interactions/0/actions/0/value`, value: 'dimmed' }],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: rowFields,
      expected: [{ ...FULL_FIELDS, on: [['dimmed']] }],
    },
    {
      name: '칸 짓기 — 밥이 열을 더함',
      rows: [
        { id: 'f_r0', type: 'GridRow' },
        { id: 'f_r', type: 'GridRow', props: { repeat: 2 } },
      ],
      theirs: (root) => [
        {
          op: 'add',
          path: `${pathOf(root, 'f_g')}/children/3`,
          value: {
            id: 'f_cd',
            type: 'GridColumn',
            props: { label: 'D' },
            children: [{ id: 'f_td', type: 'Text', props: { content: 'D' } }],
          },
        },
      ],
      act: '열 틀로 칸 짓기',
      target: 'f_r',
      read: columnsAndCells,
      expected: { leaves: ['f_ca', 'f_cb', 'f_cc', 'f_cd'], cells: 0 },
    },
    {
      // 열 더함과 같은 전제(열 트리의 `test`)가 막는다 — 전제를 뗀 변조에서 둘이 함께 죽는다. 이 판만 죽는 변조는 없다(열 트리를 열마다 나눈 `test` 는 지움을 막고
      // 더함을 못 막는다 — 열 더함 판만 죽인다).
      name: '칸 짓기 — 밥이 열을 지움',
      rows: [
        { id: 'f_r0', type: 'GridRow' },
        { id: 'f_r', type: 'GridRow', props: { repeat: 2 } },
      ],
      theirs: (root) => [{ op: 'remove', path: pathOf(root, 'f_cc') }],
      act: '열 틀로 칸 짓기',
      target: 'f_r',
      read: columnsAndCells,
      expected: { leaves: ['f_ca', 'f_cb'], cells: 0 },
    },
    {
      name: '대조 — 밥이 행을 지움',
      rows: [
        { id: 'f_r', type: 'GridRow', props: { repeat: 4 } },
        { id: 'f_r2', type: 'GridRow' },
      ],
      theirs: (root) => [{ op: 'remove', path: pathOf(root, 'f_r') }],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: (root) => rowsOf(root, 'f_g'),
      expected: [['f_r2', 1, 'data', 'default', 0]],
    },
    {
      name: '대조 — 밥이 같은 행을 먼저 떼어 냄',
      rows: [{ id: 'f_r', type: 'GridRow', props: { repeat: 4 } }],
      theirs: (root) => [
        { op: 'remove', path: `${pathOf(root, 'f_r')}/props/repeat` },
        { op: 'add', path: `${pathOf(root, 'f_g')}/zones/rows/1`, value: { id: 'f_bob', type: 'GridRow', props: { repeat: 3 } } },
      ],
      act: '한 행 떼어 내기',
      target: 'f_r',
      read: (root) => rowsOf(root, 'f_g'),
      expected: [
        ['f_r', 1, 'data', 'default', 0],
        ['f_bob', 3, 'data', 'default', 0],
      ],
    },
  ]

  for (const c of BEFORE_ARRIVAL)
    it(`두 사람 — 닿기 전: ${c.name} → 서버에 밥의 것이 남고 앨리스의 묶음은 버려진다(알림)`, async () => {
      const { P } = await seed('grb-arrival', [{ ...FLOW[0]!, zones: { rows: c.rows } }], true, [{ id: 's_x', name: '요약' }])
      const bob = await stack.login(stack.users.bob)
      const slow = await stack.startDownDelay(1500)
      const received: string[] = []
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: slow.origin })
      page.on('websocket', (socket) => socket.on('framereceived', (f) => received.push(String(f.payload))))
      try {
        await page.goto(`${slow.origin}${P}`)
        await canvasFrame(page).locator('[data-wb-id="f_g"]').waitFor({ state: 'attached' })
        await poll('joined', async () => received.some((f) => f.includes('"type":"joined"')), Boolean, 15_000)
        const before = received.filter((f) => f.includes('"type":"page-changed"')).length
        const theirs = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: await headOf(P), ops: c.theirs(await server(P)) })
        expect(theirs.status, JSON.stringify(theirs.body)).toBe(200)
        await rowAction(page, c.target, c.act)
        // 판 카나리아 — 누른 때 밥의 고침은 아직 앨리스 화면에 안 닿았다.
        const stale = received.filter((f) => f.includes('"type":"page-changed"')).length === before
        // 늦춘 프레임 · 리베이스가 다 끝날 때까지 — 서버가 늦춘 시간(1.5s)보다 길게 그대로일 때(위 «닿기 전» 케이스의 기다림과 같은 까닭).
        let landed = await server(P)
        for (let round = 0; round < 12; round += 1) {
          await page.waitForTimeout(1800)
          const again = await server(P)
          const same = JSON.stringify(again) === JSON.stringify(landed)
          landed = again
          if (same) break
        }
        const told = await poll(
          '버린 편집의 알림',
          () => page.locator('.wb-shell-info-notice, .wb-shell-edit-alert').allTextContents(),
          (all) => all.some((text) => text.includes('버렸습니다')),
          3000,
        ).catch(() => page.locator('.wb-shell-info-notice, .wb-shell-edit-alert').allTextContents())
        const outcome = { stale, kept: c.read(landed), told: told.some((text) => text.includes('버렸습니다')) }
        // eslint-disable-next-line no-console
        console.log(`[닿기 전 — ${c.name}]`, JSON.stringify({ ...outcome, notices: told }))
        expect(outcome).toEqual({ stale: true, kept: c.expected, told: true })
      } finally {
        await context.close()
        await slow.close()
      }
    }, 120_000)

  /** **되돌리기** — 줄 행동 하나가 되돌리기 한 번 · 다시 실행 한 번이다. */
  it('되돌리기 — 떼어 내기 · 칸 짓기가 각각 한 번에 돌아가고 다시 실행된다', async () => {
    const { P } = await seed('grb-undo', FLOW_TOP)
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
    const { P } = await seed('grb-undo-reload', FLOW_TOP)
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
