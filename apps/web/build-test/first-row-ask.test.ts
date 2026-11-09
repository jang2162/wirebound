/**
 * **커스텀 행이 첫 자리로 오는 편집의 확인 — 실브라우저 판**(`src/edit/first-row-ask.ts` · `src/edit/use-edit-commit.tsx` 의 `commitOps` ·
 * `src/shell/first-row-dialog.tsx` · `src/store/editor-store.ts` 의 `settleFirstRowAsk`). 키 · 줄 메뉴 · 삭제 · 잘라내기 입구는 jsdom
 * (`test/edit/first-row-ask.test.tsx`)이 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 캔버스 손잡이 | 커스텀 행을 손잡이로 첫 행 앞 띠에 놓아 놓은 뒤 상자가 안 선다 · 취소 뒤 서버 문서가 바뀐다 · 계속 뒤 첫 자리로 안 옮겨진다 |
 * | 구조 트리 끌기 | 커스텀 행 줄을 첫 행 줄 위 띠에 놓아 상자가 안 선다 · 계속 뒤 첫 자리로 안 옮겨진다 |
 * | 묻는 사이 — 무관한 편집 | 같은 사람의 다른 탭(REST)이 다른 노드를 고친 뒤 «계속» 이 옮기지 않는다(물은 문서와 다르다고 버린다) |
 * | 묻는 사이 — 대상이 사라짐 | 다른 탭이 그 행을 지운 뒤 «계속» 이 무언가를 보낸다 · 하단 바 한 줄이 안 선다 |
 * | 묻는 사이 — 판정이 바뀜 | 다른 탭이 첫 행을 커스텀으로 바꾼 뒤(이제 묻지 않을 판) «계속» 이 옮기지 않는다 · 상자를 다시 세운다 |
 *
 * 셋째 ~ 다섯째 판의 입구는 구조 트리 줄의 Alt+↑ 다. 다른 탭의 편집이 이 탭 화면에 닿은 뒤(캔버스 · 트리 값) «계속» 을 누른다.
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

/** 고름 칸 · 열 둘 · 행 셋 — 기본 `f_r1` · 커스텀 `f_own`(제 칸 둘) · 기본 `f_r2`. */
const GRID: Node[] = [
  {
    id: 'f_g',
    type: 'DataGrid',
    props: { select: 'check' },
    children: [
      { id: 'f_ca', type: 'GridColumn', props: { label: '이름' }, children: [text('f_ta', '이름 글')] },
      { id: 'f_cb', type: 'GridColumn', props: { label: '상태' }, children: [text('f_tb', '상태 글')] },
    ],
    zones: {
      rows: [
        { id: 'f_r1', type: 'GridRow' },
        {
          id: 'f_own',
          type: 'GridRow',
          children: [
            { id: 'f_x1', type: 'GridCell', children: [text('f_xt', '제 칸 글')] },
            { id: 'f_x2', type: 'GridCell' },
          ],
        },
        { id: 'f_r2', type: 'GridRow' },
      ],
    },
  },
  text('f_tail', '아래 글'),
]

const START = ['f_r1', 'f_own', 'f_r2']
const TREE = '.wb-shell-region[aria-label="구조 트리"]'
const TITLE = '첫 행 바꾸기'
const STALE = '묻는 사이 페이지가 바뀌어 편집을 내지 않았습니다 — 다시 해 주세요.'

describe.skipIf(!전제.ok)('커스텀 행이 첫 자리로 오는 편집의 확인 — 실브라우저', () => {
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

  async function seed(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: '첫 행 확인', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: GRID.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const rootOf = async (P: string): Promise<Node> => (await call('GET', P)).body.schema.root as Node
  const rowsOf = async (P: string): Promise<string[]> =>
    ((await rootOf(P)).children?.find((child) => child.id === 'f_g')?.zones?.rows ?? []).map((row) => row.id)

  /** 같은 사람의 다른 탭 — REST 로 편집 하나. */
  async function otherTab(P: string, ops: unknown[]): Promise<void> {
    const headSeq = (await call('GET', P)).body.headSeq as number
    const sent = await call('PATCH', `${P}/ops`, { baseSeq: headSeq, ops })
    if (sent.status >= 300) throw new Error(`다른 탭 ${sent.status} ${JSON.stringify(sent.body)}`)
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1000 } })
    await page.goto(P)
    await canvasFrame(page).locator('tr[data-wb-id="f_own"]').waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const treeRow = (page: Page, id: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`)
  const dialog = (page: Page) => page.getByRole('dialog', { name: TITLE })
  /** 상자가 섰는가 — 기다리지 않고 지금 값. */
  const asking = async (page: Page): Promise<boolean> => (await dialog(page).count()) > 0
  const alerts = (page: Page) => page.getByRole('alert').allTextContents()

  /** 서버의 행 차례가 `START` 에서 바뀌기를 잠깐 기다린다 — 안 바뀌면 그 값(바뀌지 않음이 답인 판도 같은 길로 읽는다). */
  const settledRows = (P: string, from: readonly string[] = START, ms = 3_000) =>
    poll(
      '행 차례가 바뀌었다',
      () => rowsOf(P),
      (ids) => ids.join() !== from.join(),
      ms,
    ).catch(() => rowsOf(P))

  async function pickInTree(page: Page, id: string): Promise<void> {
    await treeRow(page, id).locator('button.wb-shell-structure-node').first().click()
    await poll(
      `${id} 를 골랐다`,
      () => page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null),
      (v) => v === id,
    )
  }

  /** 손잡이를 쥐고 `to()` 의 점에 놓는다(`grid-row-nested.test.ts` 의 `dragHandle` 과 같은 길). */
  async function dragHandle(page: Page, to: () => Promise<{ x: number; y: number }>): Promise<void> {
    await page.evaluate(() => document.querySelector('.wb-shell-canvas')!.scrollTo({ left: 0 }))
    const handle = page.locator('.wb-shell-canvas-handle')
    await handle.waitFor()
    await page.waitForTimeout(150)
    const hb = (await handle.boundingBox())!
    // 카나리아 — 손잡이 가운데의 맨 위가 손잡이다.
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
    const point = await to()
    await page.mouse.move(point.x, point.y, { steps: 12 })
    await page.mouse.move(point.x + 1, point.y, { steps: 1 })
    await page.waitForTimeout(200)
    await page.mouse.up()
  }

  /** 첫 행 고름 칸 위 띠 — 그 앞에 놓는 자리(`grid-row-nested.test.ts` «기본 행 곁»). */
  const beforeFirst = (page: Page) => async () => {
    const box = (await canvasFrame(page).locator('tr[data-wb-id="f_r1"] td[data-wb-cell="select"]').boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height * 0.15 }
  }

  it('캔버스 손잡이 — 커스텀 행을 첫 행 앞에 놓으면 놓은 뒤 묻고, 취소면 그대로 · 계속이면 첫 자리로 옮긴다', async () => {
    const P = await seed('gx-handle')
    const { page, close } = await open(P)
    try {
      await pickInTree(page, 'f_own')
      await dragHandle(page, beforeFirst(page))
      await dialog(page)
        .waitFor({ timeout: 5_000 })
        .catch(() => undefined)
      const asked = { 상자: await asking(page), 행: await rowsOf(P) }
      if (asked.상자) await dialog(page).getByRole('button', { name: '취소', exact: true }).click()
      const cancelled = { 상자: await asking(page), 행: await settledRows(P, START, 1_000) }
      await pickInTree(page, 'f_own')
      await dragHandle(page, beforeFirst(page))
      await dialog(page)
        .waitFor({ timeout: 5_000 })
        .catch(() => undefined)
      if (await asking(page)) await dialog(page).getByRole('button', { name: '계속', exact: true }).click()
      expect({ asked, cancelled, 계속: await settledRows(P) }).toEqual({
        asked: { 상자: true, 행: START },
        cancelled: { 상자: false, 행: START },
        계속: ['f_own', 'f_r1', 'f_r2'],
      })
    } finally {
      await close()
    }
  })

  it('구조 트리 끌기 — 커스텀 행 줄을 첫 행 줄 위에 놓으면 묻고, 계속이면 첫 자리로 옮긴다', async () => {
    const P = await seed('gx-tree')
    const { page, close } = await open(P)
    try {
      const from = (await treeRow(page, 'f_own').boundingBox())!
      await page.mouse.move(from.x + 30, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + 32, from.y + from.height / 2 + 8, { steps: 3 })
      const to = (await treeRow(page, 'f_r1').boundingBox())!
      await page.mouse.move(to.x + 30, to.y + 3, { steps: 6 })
      await page.mouse.up()
      await dialog(page)
        .waitFor({ timeout: 5_000 })
        .catch(() => undefined)
      const asked = { 상자: await asking(page), 행: await rowsOf(P) }
      if (asked.상자) await dialog(page).getByRole('button', { name: '계속', exact: true }).click()
      expect({ asked, 계속: await settledRows(P) }).toEqual({ asked: { 상자: true, 행: START }, 계속: ['f_own', 'f_r1', 'f_r2'] })
    } finally {
      await close()
    }
  })

  /** 구조 트리에서 `f_own` 을 골라 Alt+↑ — 상자가 서기를 기다린다(카나리아). */
  async function askByKey(page: Page): Promise<void> {
    await pickInTree(page, 'f_own')
    await treeRow(page, 'f_own').locator('button.wb-shell-structure-node').first().press('Alt+ArrowUp')
    await dialog(page).waitFor({ timeout: 5_000 })
  }

  it('묻는 사이 — 다른 탭이 다른 노드를 고쳤어도 «계속» 은 옮긴다(지금 문서로 옮겨 낸다)', async () => {
    const P = await seed('gx-unrelated')
    const { page, close } = await open(P)
    try {
      await askByKey(page)
      await otherTab(P, [{ op: 'replace', path: '/root/children/1/props/content', value: '다른 탭 글' }])
      await canvasFrame(page).getByText('다른 탭 글').waitFor({ state: 'attached' })
      await dialog(page).getByRole('button', { name: '계속', exact: true }).click()
      const rows = await settledRows(P)
      const tail = (await rootOf(P)).children?.[1]?.props?.content
      expect({ rows, tail, 상자: await asking(page) }).toEqual({ rows: ['f_own', 'f_r1', 'f_r2'], tail: '다른 탭 글', 상자: false })
    } finally {
      await close()
    }
  })

  it('묻는 사이 — 다른 탭이 그 행을 지웠으면 «계속» 은 아무것도 안 내고 하단 바에 한 줄', async () => {
    const P = await seed('gx-gone')
    const { page, close } = await open(P)
    try {
      await askByKey(page)
      const head = (await call('GET', P)).body.headSeq as number
      await otherTab(P, [{ op: 'remove', path: '/root/children/0/zones/rows/1' }])
      await canvasFrame(page).locator('tr[data-wb-id="f_own"]').waitFor({ state: 'detached' })
      await dialog(page).getByRole('button', { name: '계속', exact: true }).click()
      await page.waitForTimeout(800)
      expect({
        rows: await rowsOf(P),
        sent: ((await call('GET', P)).body.headSeq as number) - head,
        alert: (await alerts(page)).some((line) => line.includes(STALE)),
      }).toEqual({ rows: ['f_r1', 'f_r2'], sent: 1, alert: true })
    } finally {
      await close()
    }
  })

  it('묻는 사이 — 다른 탭이 첫 행을 커스텀으로 바꿨으면(이제 묻지 않을 판) «계속» 은 그대로 옮긴다', async () => {
    const P = await seed('gx-changed')
    const { page, close } = await open(P)
    try {
      await askByKey(page)
      await otherTab(P, [{ op: 'add', path: '/root/children/0/zones/rows/0/children', value: [{ id: 'f_y1', type: 'GridCell' }] }])
      await canvasFrame(page).locator('[data-wb-id="f_y1"]').waitFor({ state: 'attached' })
      await dialog(page).getByRole('button', { name: '계속', exact: true }).click()
      const rows = await settledRows(P)
      expect({ rows, 상자: await asking(page) }).toEqual({ rows: ['f_own', 'f_r1', 'f_r2'], 상자: false })
    } finally {
      await close()
    }
  })
})
