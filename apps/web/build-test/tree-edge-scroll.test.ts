/**
 * **구조 트리 줄 끌기의 끝 스크롤을 실브라우저로 잰다**(`src/drag/use-pointer-drag.ts` 머리말 «끝 스크롤» — 같은 장치를 트리 줄 · 캔버스 손잡이 · 컴포넌트
 * 카드가 쓰고, 캔버스 칸 둘은 `./editor-narrow-canvas.test.ts` · `./palette.test.ts` 가 잰다). 트리는 이 파일이 맡는다.
 *
 * 창 1440×900 · 좌측 최소 폭(`SIDE_WIDTH_MIN` 200)에서 긴 트리(노드 50 + 깊이 열의 카드 사슬)는 세로로도(`scrollHeight` 1540 > 422) 가로로도(`scrollWidth`
 * 230 > 200 — 사슬의 안쪽 들여쓰기) 넘친다. 끌기는 트리 안에서 시작하므로 끝 띠는 곧바로 민다(상자 밖에서 들어온 끌기만 `EDGE_ENTER_DWELL_MS` 를 기다린다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 아래 · 위 끝 띠 | 아래 끝 띠에 0.5s 대도 안 민다(잰 값 224 ~ 256px) · 위 끝 띠에 대도 안 돌아온다 · 상자 밖에서도 민다 |
 * | 오른 · 왼 끝 띠 | 가로로 넘친 트리에서 오른 끝 띠가 가로로 안 민다(잰 값 30px = 넘친 만큼) · 왼 끝 띠가 안 돌아온다 |
 * | 민 뒤 놓기 | 민 뒤 놓은 자리가 보인 줄(밀린 줄) 곁이 아니라 옛 좌표의 줄로 간다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LAYOUT_KEY = 'wirebound.editor.sidebar'
const TREE = '.wb-shell-region[aria-label="구조 트리"]'

interface SeedNode {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: SeedNode[]
}
const TEXTS: SeedNode[] = Array.from({ length: 50 }, (_, i) => ({ id: `n_t${i}`, type: 'Text', props: { content: `글 ${i}` } }))
/** 카드 사슬 — 깊이 0 ~ 9, 끝은 잎. 안쪽 줄의 들여쓰기가 트리를 가로로 넘기게 한다. */
const chain = (depth: number): SeedNode => ({
  id: `n_d${depth}`,
  type: 'Card',
  props: { title: `깊이 ${depth} 의 아주 긴 카드 제목입니다` },
  children: depth < 9 ? [chain(depth + 1)] : [{ id: 'n_leaf', type: 'Text', props: { content: '잎' } }],
})

describe.skipIf(!전제.ok)('구조 트리 줄 끌기의 끝 스크롤 — 실브라우저', () => {
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

  async function open(slug: string): Promise<{ page: Page; P: string; close: () => Promise<void>; patches: string[] }> {
    const project = (await call('POST', '/projects', { name: 'L-031', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [...TEXTS, chain(0)].map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ sideWidth: 200, panelWidth: 300 })), LAYOUT_KEY)
    await page.reload()
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator(`${TREE} [data-tree-row]`).first().waitFor({ state: 'attached' })
    return { page, P, close: () => context.close(), patches }
  }

  /** 트리 줄을 담는 스크롤 상자의 값 — 가장 가까운 세로 스크롤 조상(`scrollParent` 와 같은 골라냄). */
  const scroller = (page: Page) =>
    page.evaluate((sel) => {
      let el: HTMLElement | null = document.querySelector(`${sel} [data-tree-row]`)!.parentElement
      while (el !== null && !['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) el = el.parentElement
      const r = el!.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        top: Math.round(el!.scrollTop),
        left: Math.round(el!.scrollLeft),
        overflowY: el!.scrollHeight - el!.clientHeight,
        overflowX: el!.scrollWidth - el!.clientWidth,
      }
    }, TREE)

  async function grab(page: Page, id: string): Promise<void> {
    const box = (await page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`).boundingBox())!
    await page.mouse.move(box.x + 30, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 33, box.y + box.height / 2 + 6, { steps: 3 })
  }

  it('아래 · 위 끝 띠에 대면 세로로 밀고 돌아온다 · 상자 밖에서는 안 민다', async () => {
    const { page, close } = await open('tree-edge-y')
    try {
      const first = await scroller(page)
      await grab(page, 'n_t1')
      await page.mouse.move(first.x + 40, first.y + first.height - 10, { steps: 5 })
      await page.waitForTimeout(500)
      const down = await scroller(page)
      await page.mouse.move(first.x + 40, first.y + 10, { steps: 5 })
      await page.waitForTimeout(700)
      const up = await scroller(page)
      // 상자 밖(아래 — 하단 바 쪽)에서는 안 민다.
      await page.mouse.move(first.x + 40, first.y + first.height + 30, { steps: 5 })
      const outsideFrom = (await scroller(page)).top
      await page.waitForTimeout(500)
      const outside = (await scroller(page)).top
      await page.keyboard.press('Escape')
      await page.mouse.up()
      // eslint-disable-next-line no-console
      console.log(
        `[트리 끝 스크롤 세로] ${JSON.stringify({ overflowY: first.overflowY, down: down.top, up: up.top, outsideFrom, outside })}`,
      )
      expect({
        overflows: first.overflowY > 400,
        pushedDown: down.top > 100,
        returned: up.top === 0,
        outsideStill: outside === outsideFrom,
      }).toEqual({
        overflows: true,
        pushedDown: true,
        returned: true,
        outsideStill: true,
      })
    } finally {
      await close()
    }
  })

  it('가로로 넘친 트리(좌측 최소 폭)에서 오른 · 왼 끝 띠에 대면 가로로 밀고 돌아온다', async () => {
    const { page, close } = await open('tree-edge-x')
    try {
      await page.evaluate((sel) => {
        let el: HTMLElement | null = document.querySelector(`${sel} [data-tree-row]`)!.parentElement
        while (el !== null && !['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) el = el.parentElement
        el!.scrollTop = el!.scrollHeight
      }, TREE)
      await page.locator(`${TREE} [data-tree-row][data-tree-id="n_d9"]`).scrollIntoViewIfNeeded()
      const first = await scroller(page)
      await grab(page, 'n_d9')
      await page.mouse.move(first.x + first.width - 8, first.y + 60, { steps: 5 })
      await page.waitForTimeout(500)
      const right = await scroller(page)
      await page.mouse.move(first.x + 8, first.y + 60, { steps: 5 })
      await page.waitForTimeout(500)
      const left = await scroller(page)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      // eslint-disable-next-line no-console
      console.log(`[트리 끝 스크롤 가로] ${JSON.stringify({ overflowX: first.overflowX, right: right.left, left: left.left })}`)
      expect({ overflows: first.overflowX > 0, pushedRight: right.left === first.overflowX, returned: left.left === 0 }).toEqual({
        overflows: true,
        pushedRight: true,
        returned: true,
      })
    } finally {
      await close()
    }
  })

  it('끝 띠로 민 뒤 놓으면 그 자리에서 보인 줄 곁에 놓인다 — 편집 하나', async () => {
    const { page, P, close, patches } = await open('tree-edge-drop')
    try {
      const first = await scroller(page)
      await grab(page, 'n_t1')
      await page.mouse.move(first.x + 40, first.y + first.height - 10, { steps: 5 })
      await page.waitForTimeout(500)
      const shownBefore = await page.locator('.wb-shell-drop-indicator').count()
      const pushed = (await scroller(page)).top
      await page.mouse.up()
      await page.waitForTimeout(800)
      const root = (await stack.request(alice, 'GET', P)).body.schema.root as { children: { id: string }[] }
      const order = root.children.map((child) => child.id)
      expect({ pushed: pushed > 100, shownBefore, sent: patches.length, moved: order.indexOf('n_t1') !== 1 }).toEqual({
        pushed: true,
        shownBefore: 1,
        sent: 1,
        moved: true,
      })
    } finally {
      await close()
    }
  })
})
