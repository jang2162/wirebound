/**
 * **캔버스 사각형으로 그리드 고르기 — 실브라우저 판**(`src/canvas/use-canvas-marquee.ts` 의 `drawnNodes` · `src/canvas/canvas-marquee.ts` 의 `nodesInRect`).
 * 사각형은 누름과 같은 판정(`src/canvas/canvas-pick.ts` 의 `nodeIdAt`)으로 요소를 노드로 읽는다 — 사본 줄의 칸을 덮으면 그 줄의 행이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 사본 줄의 칸 | 되풀이 행 둘째 줄의 셀 틀 칸 · 그 칸 안의 사본 노드 · 사본 줄 번호 칸만 덮은 사각형이 그 줄의 행을 안 고른다 |
 * | 첫 줄 | 첫 줄 셀 틀 원본만 덮으면 그 노드 · 첫 줄을 다 덮으면 행 하나(셀 틀 원본을 함께 고르면 Delete 가 열의 셀 틀까지 지운다) |
 * | 여러 줄 | 되풀이 3 줄과 커스텀 행 첫 줄을 덮으면 두 행 — 같은 행이 되풀이된 줄은 행 하나 |
 * | 같은 갈래 | 커스텀 행 사본 줄의 제 칸은 그 원본 칸 · 머리 칸은 그 열(누름과 같다) |
 *
 * 사각형은 대상 상자(캔버스 문서 좌표)를 `PAD` 만큼 넓혀 그 바깥 왼쪽 위에서 오른쪽 아래로 끈다. 고르기 전에 아래 글을 골라 두고 고름이 그것에서 바뀌기를
 * 기다린다(안 바뀌면 그 값 — 사각형이 아무것도 안 고른 판이 시간 초과가 아니라 값으로 죽게).
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

/** 번호 열 · 셀 틀 열 둘 · 첫 행 · 되풀이 3 행 · 커스텀 행(제 칸 둘 · 2 줄). */
const GRID: Node[] = [
  {
    id: 'm_g',
    type: 'DataGrid',
    children: [
      { id: 'm_n', type: 'GridColumn', props: { label: '번호', numbering: 'asc' } },
      { id: 'm_ca', type: 'GridColumn', props: { label: '이름' }, children: [text('m_ta', '홍길동')] },
      { id: 'm_cb', type: 'GridColumn', props: { label: '상태' }, children: [text('m_tb', '정상')] },
    ],
    zones: {
      rows: [
        { id: 'm_r1', type: 'GridRow' },
        { id: 'm_r2', type: 'GridRow', props: { repeat: 3 } },
        {
          id: 'm_r3',
          type: 'GridRow',
          props: { repeat: 2 },
          children: [
            { id: 'm_x0', type: 'GridCell' },
            { id: 'm_x1', type: 'GridCell', children: [text('m_xt', '제 칸 글')] },
            { id: 'm_x2', type: 'GridCell' },
          ],
        },
      ],
    },
  },
  text('m_tail', '아래 글'),
]

/** 사각형이 대상 상자 밖으로 넓히는 폭(캔버스 문서 px). */
const PAD = 2

const TREE = '.wb-shell-region[aria-label="구조 트리"]'

describe.skipIf(!전제.ok)('캔버스 사각형으로 그리드 고르기 — 실브라우저', () => {
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
    const project = (await call('POST', '/projects', { name: '사각형 그리드', slug: `${slug}-${Date.now().toString(36)}` })).body
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

  let shared: { P: string; page: Page; close: () => Promise<void> } | null = null
  /** 케이스 넷이 한 페이지를 나눠 쓴다 — 사각형은 문서를 안 바꾼다. */
  async function opened(): Promise<Page> {
    if (shared !== null) return shared.page
    const P = await seed('gx-marquee', GRID)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1000 } })
    await page.goto(P)
    await canvasFrame(page).locator('tr[data-wb-copy-of="m_r3"]').waitFor({ state: 'attached' })
    // 문서를 좁힌다 — 1280 폭 문서는 이 창의 캔버스 칸보다 넓어 행 줄 전체를 덮는 사각형의 끝이 칸 밖(사이드바)에 선다.
    await page.getByLabel('뷰포트 폭').selectOption('375')
    await page.waitForTimeout(200)
    shared = { P, page, close: () => context.close() }
    return page
  }
  afterAll(async () => {
    await shared?.close()
  })

  /** 고른 것 — 캔버스 외곽선(기준 노드 · 나머지)으로 읽는다(화면이 그린 값). */
  const picked = (page: Page) =>
    page.evaluate(() =>
      [
        document.querySelector('[data-wb-selected-id]')?.getAttribute('data-wb-selected-id'),
        ...[...document.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id')),
      ]
        .filter((id): id is string => typeof id === 'string')
        .sort(),
    )

  /** 덮을 상자(호스트 좌표 · `PAD` 를 넓힌 값) — 캔버스 문서의 `selector` 의 `nth` 째들을 다 감싼다. */
  async function boxOf(page: Page, selector: string, nths: readonly number[]): Promise<{ x0: number; y0: number; x1: number; y1: number }> {
    const box = (await page.evaluate(
      async ([selector, nths, pad]) => {
        const f = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const d = f.contentDocument!
        const all = d.querySelectorAll(selector)
        const targets = nths.map((nth) => all[nth])
        if (targets.some((target) => target === undefined)) return null
        targets[0]!.scrollIntoView({ block: 'center', inline: 'nearest' })
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        const r = f.getBoundingClientRect()
        const scale = r.width / f.clientWidth
        const boxes = targets.map((target) => target!.getBoundingClientRect())
        const left = Math.min(...boxes.map((b) => b.left)) - pad
        const top = Math.min(...boxes.map((b) => b.top)) - pad
        const right = Math.max(...boxes.map((b) => b.right)) + pad
        const bottom = Math.max(...boxes.map((b) => b.bottom)) + pad
        return { x0: r.left + left * scale, y0: r.top + top * scale, x1: r.left + right * scale, y1: r.top + bottom * scale }
      },
      [selector, nths, PAD] as const,
    )) as { x0: number; y0: number; x1: number; y1: number } | null
    // 카나리아 — 덮을 대상이 다 그려졌다.
    expect(box, `${selector} ${JSON.stringify(nths)}`).not.toBeNull()
    return box!
  }

  /** 아래 글을 골라 두고 그 상자를 덮는 사각형을 그린 뒤 고른 것. */
  async function cover(page: Page, selector: string, nths: readonly number[] = [0]): Promise<string[]> {
    await page.locator(`${TREE} [data-tree-row][data-tree-id="m_tail"] > button`).first().click()
    await poll(
      '아래 글을 골랐다',
      () => picked(page),
      (ids) => ids.length === 1 && ids[0] === 'm_tail',
    )
    const box = await boxOf(page, selector, nths)
    await page.mouse.move(box.x0, box.y0)
    await page.mouse.down()
    await page.mouse.move(box.x1, box.y1, { steps: 10 })
    await page.mouse.up()
    try {
      return await poll(
        '고름이 바뀌었다',
        () => picked(page),
        (ids) => !(ids.length === 1 && ids[0] === 'm_tail'),
        3_000,
      )
    } catch {
      return picked(page)
    }
  }

  it('사본 줄의 칸 — 셀 틀 칸 · 그 안의 사본 노드 · 번호 칸만 덮어도 그 줄의 행이다', async () => {
    const page = await opened()
    // m_r2 의 둘째 줄 = m_r2 사본 `tr` 의 첫째(0 줄은 행 노드 자신).
    const line = 'tr[data-wb-copy-of="m_r2"]'
    expect({
      '셀 틀 칸': await cover(page, `${line} td[data-wb-cell="template"]`),
      '칸 안 사본 노드': await cover(page, '[data-wb-copy-of="m_tb"]', [1]),
      '번호 칸': await cover(page, `${line} td[data-wb-cell="number"]`),
    }).toEqual({ '셀 틀 칸': ['m_r2'], '칸 안 사본 노드': ['m_r2'], '번호 칸': ['m_r2'] })
  })

  it('첫 줄 — 셀 틀 원본만 덮으면 그 노드 · 첫 줄을 다 덮으면 행 하나', async () => {
    const page = await opened()
    expect({
      '셀 틀 원본': await cover(page, '[data-wb-id="m_ta"]'),
      '첫 줄 전부': await cover(page, 'tr[data-wb-id="m_r1"]'),
    }).toEqual({ '셀 틀 원본': ['m_ta'], '첫 줄 전부': ['m_r1'] })
  })

  it('여러 줄 — 되풀이 3 줄과 커스텀 행 첫 줄을 덮으면 두 행이다(되풀이 줄은 행 하나)', async () => {
    const page = await opened()
    // 몸 줄 차례: m_r1 · m_r2 · m_r2 사본 둘 · m_r3 · m_r3 사본 — 둘째부터 다섯째 줄.
    expect(await cover(page, 'tbody > tr', [1, 2, 3, 4])).toEqual(['m_r2', 'm_r3'])
  })

  it('같은 갈래 — 커스텀 행 사본 줄의 제 칸은 그 원본 칸 · 머리 칸은 그 열', async () => {
    const page = await opened()
    expect({
      '제 칸 사본': await cover(page, 'td[data-wb-copy-of="m_x1"]'),
      '머리 칸': await cover(page, 'th[data-wb-id="m_ca"]'),
    }).toEqual({ '제 칸 사본': ['m_x1'], '머리 칸': ['m_ca'] })
  })
})
