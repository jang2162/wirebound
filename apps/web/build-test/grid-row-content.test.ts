/**
 * **그리드 행 «행 내용: 기본 / 커스텀» — 실브라우저 판**(`src/edit/row-content.ts` · `src/panels/row-content-field.tsx`).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 확인 사이 남의 고침 | 커스텀 행의 «기본» 확인 줄이 선 동안 같은 사람의 다른 탭(REST)이 그 행에 칸을 더하면 확인은 걷지 않고 지금 칸(3개)으로 다시 묻는다 · 다시 물은 확인은 걷는다(서버 문서) |
 * | 흐름 | 팔레트 «반복 행 표» 넣기 → 첫 행의 «커스텀» 은 꺼진 채 까닭 → «한 행 떼어 내기» · 복제(Cmd+D)로 행 셋 → 둘째 행 «커스텀» → 그 칸의 입력 «값» 만 바꿈 → 첫 행 · 셋째 행은 그대로(서버 문서 · 캔버스) → 내보낸 번들(뷰어 · 화면 모드 = PPTX 캡처 길)에서도 둘째 행만 제 칸 · 제 값 → «기본» 은 확인 줄이 서고 «취소» 는 그대로 · 확인은 칸을 걷는다 → 안 고친 커스텀 행의 «기본» 은 확인 없이 걷힌다 |
 */
import type { Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'
const PRESET = 'DataGrid:repeatRows'
const FIRST_ROW_WHY = '첫 행은 늘 기본입니다 — 기본 행은 첫 행과 같은 꼴로 그려집니다'
const TYPED = '둘째 행 값'

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
}

function find(root: Node, id: string): Node | undefined {
  if (root.id === id) return root
  for (const child of [...(root.children ?? []), ...Object.values(root.zones ?? {}).flat()]) {
    const hit = find(child, id)
    if (hit !== undefined) return hit
  }
  return undefined
}

function findType(root: Node, type: string): Node | undefined {
  if (root.type === type) return root
  for (const child of [...(root.children ?? []), ...Object.values(root.zones ?? {}).flat()]) {
    const hit = findType(child, type)
    if (hit !== undefined) return hit
  }
  return undefined
}

describe.skipIf(!전제.ok)('그리드 행 «행 내용»(실브라우저)', () => {
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

  async function seed(slug: string, nodes: Node[]): Promise<{ P: string; projectId: string }> {
    const project = (await call('POST', '/projects', { name: '행 내용', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, projectId: project.id as string }
  }

  const server = async (P: string): Promise<Node> => (await call('GET', P)).body.schema.root as Node
  const treeRow = (page: Page, nodeId: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${nodeId}"]`)
  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  async function pick(page: Page, nodeId: string): Promise<void> {
    await treeRow(page, nodeId).locator('button').first().click()
    await poll(
      `${nodeId} 를 골랐다`,
      () => selected(page),
      (id) => id === nodeId,
    )
  }

  async function rowAction(page: Page, nodeId: string, name: string): Promise<void> {
    await pick(page, nodeId)
    await treeRow(page, nodeId)
      .getByRole('button', { name: /더 보기$/ })
      .click()
    await page.getByRole('menuitem', { name, exact: true }).click()
    await page.waitForTimeout(550)
  }

  const contentGroup = (page: Page) => page.getByRole('radiogroup', { name: '행 내용' })
  const confirmGroup = (page: Page) => page.getByRole('group', { name: '칸 걷기 확인' })

  /** 그리드의 행마다 [id, 칸 수]. */
  const rowsOf = (root: Node, gridId: string) => (find(root, gridId)?.zones?.rows ?? []).map((row) => [row.id, (row.children ?? []).length])
  /** 캔버스 · 번들의 행 `tr`(원본 id 로) 안 입력 조각의 글(`Input` 뷰는 `role=textbox` 상자에 값을 글로 그린다). */
  const inputsIn = (doc: Pick<Frame, 'evaluate'>, rowIds: string[]): Promise<string[][]> =>
    doc.evaluate(
      (ids) =>
        ids.map((id) =>
          [...(document.querySelector(`tr[data-wb-id="${id}"]`)?.querySelectorAll('[data-wb-component="Input"]') ?? [])].map((input) =>
            (input.textContent ?? '').trim(),
          ),
        ),
      rowIds,
    )

  /**
   * **흐름**(결정 기록 `docs/superpowers/plans/2026-11-03-editor-panels-round.md` «④»). 고치기 전(속성 패널에 «행 내용» 칸이 없음)에는 첫 걸음의
   * `radiogroup` 찾기에서 죽는다 — 보고 «재현» 에 그 값을 적는다.
   */
  it('흐름 — 첫 행은 꺼짐 + 까닭 · 둘째 행 커스텀 → 그 행 입력만 바뀜(서버 · 캔버스 · 번들 · 화면 모드) · 기본은 확인 뒤 걷힘 · 안 고친 행은 확인 없음', async () => {
    const { P, projectId } = await seed('row-content', [{ id: 'n_head0000001', type: 'Text', props: { content: '앞 글' } }])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1100 } })
    const steps: Record<string, unknown> = {}
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_head0000001"]').waitFor({ state: 'attached' })

      // 팔레트 «반복 행 표» 넣기(뿌리를 고른 판 — 페이지 끝).
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('반복')
      await page.locator(`[data-wb-palette-card="${PRESET}"] .wb-shell-palette-add`).click()
      const placed = await poll(
        '반복 행 표가 섰다',
        () => server(P),
        (root) => findType(root, 'DataGrid') !== undefined,
      )
      const grid = findType(placed, 'DataGrid')!
      const r1 = grid.zones!.rows![0]!.id
      const frame = canvasFrame(page)
      await frame.locator(`tr[data-wb-id="${r1}"]`).waitFor({ state: 'attached' })

      // 첫 행 — «기본» 이 골라져 있고 «커스텀» 은 꺼진 채 까닭.
      await pick(page, r1)
      const radios = contentGroup(page).getByRole('radio')
      steps['첫 행'] = {
        checked: await contentGroup(page).getByRole('radio', { checked: true }).textContent(),
        customOff: await radios.nth(1).isDisabled(),
        why: await page.locator('[data-wb-row-content-why]').textContent(),
      }

      // 행을 셋으로 — 떼어 내기(되풀이 2 → 1 + 1) · 둘째 행 복제.
      await rowAction(page, r1, '한 행 떼어 내기')
      const split = await poll(
        '떼어 내기',
        () => server(P),
        (root) => rowsOf(root, grid.id).length === 2,
      )
      const r2 = find(split, grid.id)!.zones!.rows![1]!.id
      await pick(page, r2)
      await page.keyboard.press('ControlOrMeta+d')
      const three = await poll(
        '복제',
        () => server(P),
        (root) => rowsOf(root, grid.id).length === 3,
      )
      const r3 = find(three, grid.id)!.zones!.rows![2]!.id
      steps['행 셋'] = rowsOf(three, grid.id).map(([, cells]) => cells)

      // 둘째 행 → 커스텀.
      await pick(page, r2)
      await contentGroup(page).getByRole('radio', { name: '커스텀' }).click()
      const custom = await poll(
        '커스텀',
        () => server(P),
        (root) => (find(root, r2)?.children ?? []).length > 0,
      )
      steps['커스텀'] = {
        rows: rowsOf(custom, grid.id).map(([, cells]) => cells),
        pieces: find(custom, r2)!.children!.map((cell) => (cell.children ?? []).map((piece) => piece.type)),
        checked: await contentGroup(page).getByRole('radio', { checked: true }).textContent(),
      }
      await frame.locator(`td[data-wb-id="${find(custom, r2)!.children![0]!.id}"]`).waitFor({ state: 'attached' })

      // 둘째 행 첫 칸의 입력 «값» 만 바꾼다.
      const input = find(custom, r2)!.children![0]!.children![0]!.id
      await pick(page, input)
      const value = page.getByLabel('값', { exact: true })
      await value.fill(TYPED)
      await value.press('Enter')
      const typed = await poll(
        '값',
        () => server(P),
        (root) => find(root, input)?.props?.value === TYPED,
      )
      const template = find(typed, grid.id)!.children!.map((column) => (column.children ?? []).map((piece) => piece.props?.value ?? null))
      steps['값 바꿈 — 서버'] = { rows: rowsOf(typed, grid.id).map(([, cells]) => cells), template }
      const canvasDoc = (await (await page.$('iframe.wb-shell-canvas-iframe'))!.contentFrame())!
      // 판이 섰다 = 둘째 행에 입력이 그려졌다. 값은 그 뒤 한 번 읽는다(폴의 끝 조건에 단언할 값을 넣지 않는다).
      await poll(
        '캔버스에 둘째 행 입력',
        () => inputsIn(canvasDoc, [r2]),
        (values) => (values[0]?.length ?? 0) > 0,
      )
      await page.waitForTimeout(300)
      steps['값 바꿈 — 캔버스'] = await inputsIn(canvasDoc, [r1, r2, r3])

      // 내보내기 — 번들 뷰어 · 화면 모드(PPTX 가 캡처하는 판).
      const bundle = await exportBundle(stack, alice, projectId)
      try {
        const file = Object.values(bundle.pages)[0]!
        for (const [name, screen] of [
          ['번들', false],
          ['화면 모드', true],
        ] as const) {
          const opened = await openBundlePage(stack, file, { viewport: { width: 1280, height: 900 }, screen })
          try {
            steps[`내보내기 — ${name}`] = {
              inputs: await inputsIn(opened.page, [r1, r2, r3]),
              ownCells: await opened.page.evaluate((id) => document.querySelectorAll(`tr[data-wb-id="${id}"] > td[data-wb-id]`).length, r2),
            }
          } finally {
            await opened.context.close()
          }
        }
      } finally {
        bundle.dispose()
      }

      // 커스텀 → 기본 — 고친 칸이 있어 확인 줄이 선다 · 취소는 그대로 · 확인은 걷는다.
      await pick(page, r2)
      await contentGroup(page).getByRole('radio', { name: '기본' }).click()
      await confirmGroup(page).waitFor()
      steps['확인 줄'] = await confirmGroup(page).locator('p').textContent()
      await confirmGroup(page).getByRole('button', { name: '취소', exact: true }).click()
      await page.waitForTimeout(500)
      steps['취소 뒤'] = { rows: rowsOf(await server(P), grid.id).map(([, cells]) => cells), confirm: await confirmGroup(page).count() }
      await contentGroup(page).getByRole('radio', { name: '기본' }).click()
      await confirmGroup(page).getByRole('button', { name: '기본으로 돌리기', exact: true }).click()
      const cleared = await poll(
        '걷기',
        () => server(P),
        (root) => (find(root, r2)?.children ?? []).length === 0,
      )
      steps['걷은 뒤'] = { rows: rowsOf(cleared, grid.id).map(([, cells]) => cells), children: 'children' in find(cleared, r2)! }

      // 안 고친 커스텀 행의 «기본» — 확인 없이 걷힌다.
      await pick(page, r3)
      await contentGroup(page).getByRole('radio', { name: '커스텀' }).click()
      await poll(
        '셋째 행 커스텀',
        () => server(P),
        (root) => (find(root, r3)?.children ?? []).length > 0,
      )
      await contentGroup(page).getByRole('radio', { name: '기본' }).click()
      const plain = await poll(
        '셋째 행 기본',
        () => server(P),
        (root) => (find(root, r3)?.children ?? []).length === 0,
      ).catch(() => null)
      steps['안 고친 행'] = { cleared: plain !== null, confirm: await confirmGroup(page).count() }

      // eslint-disable-next-line no-console
      console.log('[행 내용 흐름]', JSON.stringify(steps))
      expect(steps).toEqual({
        '첫 행': { checked: '기본', customOff: true, why: FIRST_ROW_WHY },
        '행 셋': [0, 0, 0],
        커스텀: { rows: [0, 3, 0], pieces: [['Input'], ['Input'], ['Button']], checked: '커스텀' },
        '값 바꿈 — 서버': { rows: [0, 3, 0], template: [[null], [null], [null]] },
        '값 바꿈 — 캔버스': [
          ['', ''],
          [TYPED, ''],
          ['', ''],
        ],
        '내보내기 — 번들': {
          inputs: [
            ['', ''],
            [TYPED, ''],
            ['', ''],
          ],
          ownCells: 3,
        },
        '내보내기 — 화면 모드': {
          inputs: [
            ['', ''],
            [TYPED, ''],
            ['', ''],
          ],
          ownCells: 3,
        },
        '확인 줄': '이 행의 칸 3개를 걷고 열의 셀 틀로 그립니다. 칸에서 고친 내용은 사라집니다.',
        '취소 뒤': { rows: [0, 3, 0], confirm: 0 },
        '걷은 뒤': { rows: [0, 0, 0], children: false },
        '안 고친 행': { cleared: true, confirm: 0 },
      })
    } finally {
      await context.close()
    }
  }, 180_000)
  /**
   * **확인을 누른 때 칸이 바뀌었으면 다시 묻는다**(`src/panels/row-content-field.tsx` 머리말). 남의 고침은 같은 사람의 다른 탭 — REST 쓰기라 이 탭은 WS 방송으로 받는다.
   * jsdom 판은 `test/panels/row-content-field.test.tsx` «확인 줄 사이 남이 칸을 바꾸면».
   */
  it('확인 사이 남의 고침 — 다른 탭이 그 행에 칸을 더하면 확인은 걷지 않고 다시 묻는다 · 다시 물은 확인은 걷는다', async () => {
    const cell = (id: string, content: string): Node => ({
      id,
      type: 'GridCell',
      children: [{ id: `${id}_t`, type: 'Text', props: { content } }],
    })
    const { P } = await seed('row-content-race', [
      {
        id: 'c_g',
        type: 'DataGrid',
        props: { select: 'check' },
        children: [
          {
            id: 'c_ca',
            type: 'GridColumn',
            props: { label: '이름' },
            children: [{ id: 'c_ta', type: 'Text', props: { content: '셀 틀' } }],
          },
          { id: 'c_cb', type: 'GridColumn', props: { label: '상태' } },
        ],
        zones: {
          rows: [
            { id: 'c_r1', type: 'GridRow' },
            { id: 'c_own', type: 'GridRow', children: [cell('c_k1', '고친 칸 하나'), cell('c_k2', '고친 칸 둘')] },
          ],
        },
      },
    ])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1000 } })
    try {
      await page.goto(P)
      const own = canvasFrame(page).locator('tr[data-wb-id="c_own"]')
      await own.waitFor({ state: 'attached' })
      // 고름 칸을 누르면 그 행이다(`grid-row-pick.test.ts` «그 밖의 칸»).
      await own.locator('td[data-wb-cell="select"]').click()
      await poll(
        '행을 골랐다',
        () => selected(page),
        (id) => id === 'c_own',
      )
      await contentGroup(page).getByRole('radio', { name: '기본' }).click()
      await confirmGroup(page).waitFor()
      // 기다리지 않고 읽는다 — 확인 줄이 걷힌 판이 시간 초과가 아니라 값(`null`)으로 죽게.
      const question = () => page.evaluate(() => document.querySelector('[role="group"][aria-label="칸 걷기 확인"] p')?.textContent ?? null)
      const asked = await question()

      const head = (await call('GET', P)).body.headSeq as number
      const added = await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'add', path: '/root/children/0/zones/rows/1/children/2', value: { id: 'c_k3', type: 'GridCell' } }],
      })
      // 카나리아 — 다른 탭의 쓰기가 섰고 이 탭의 캔버스에 닿았다(그 행의 제 칸 셋).
      expect(added.status).toBe(200)
      await poll(
        '남의 칸이 닿았다',
        () => own.locator('td[data-wb-id]').count(),
        (n) => n === 3,
      )
      await confirmGroup(page).getByRole('button', { name: '기본으로 돌리기' }).click()
      await page.waitForTimeout(800)
      const first = { cells: (find(await server(P), 'c_own')?.children ?? []).length, question: await question() }
      if (first.question !== null) await confirmGroup(page).getByRole('button', { name: '기본으로 돌리기' }).click()
      const cleared = await poll(
        '걷혔다',
        async () => (find(await server(P), 'c_own')?.children ?? []).length,
        (n) => n === 0,
      ).catch(async () => (find(await server(P), 'c_own')?.children ?? []).length)
      expect({ asked, first, cleared }).toEqual({
        asked: '이 행의 칸 2개를 걷고 열의 셀 틀로 그립니다. 칸에서 고친 내용은 사라집니다.',
        first: { cells: 3, question: '이 행의 칸 3개를 걷고 열의 셀 틀로 그립니다. 칸에서 고친 내용은 사라집니다.' },
        cleared: 0,
      })
    } finally {
      await context.close()
    }
  })
})
