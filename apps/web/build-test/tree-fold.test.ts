/**
 * **트리 줄 접기를 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «트리 줄마다 접기» · `src/tree/collapse.ts` · `src/drag/hover-open.ts`). jsdom 은
 * 배치 · 포인터 캡처가 없어 «끄는 포인터가 접힌 줄 위에 0.7s 머문다»를 못 세운다 — 펼침 단추 · 저절로 펴짐의 판정은
 * `test/panels/tree-fold.test.tsx` 가, 타이머는 `test/drag/hover-open.test.ts` 가 갖고, 여기는 **진짜 마우스가 진짜 줄 위에서** 그것을 낸다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 구조 줄 끌기 — 접힌 줄 위 0.7s | 머물러도 안 펴진다 · 0.3s 만 머물고 떠나도 펴진다 · 놓은 자리가 그 안 끝이 아니다 |
 * | 구조 — 접힌 줄에 «안»으로 곧바로 | 접힌 줄에 놓은 노드가 그 안 끝이 아니다 |
 * | 메뉴 줄 끌기 — 접힌 메뉴 위 0.7s | 머물러도 안 펴진다 |
 * | 컴포넌트 카드 — 접힌 줄 위 0.7s | 경로 층(`drag/use-placement.ts`)을 지나는 끌기에서 안 펴진다 |
 * | 캔버스에서 접힌 줄 안의 노드를 누름 | 그 조상이 안 펴진다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('트리 줄 접기 — 실브라우저', () => {
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

  /**
   * ```
   * 메뉴 가   pages: 가1(연다) 가2
   * 메뉴 나   pages: 나1
   * 가1: Page ─ Text · Card(─ Text) · Divider
   * ```
   */
  async function fixture(slug: string): Promise<{ P: string; ids: Record<string, string> }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'F1 접기', slug: `${slug}-${Date.now().toString(36)}` })).body
    const ids: Record<string, string> = {}
    for (const title of ['가', '나']) ids[title] = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title })).body.id
    for (const [title, menu] of [
      ['가1', '가'],
      ['가2', '가'],
      ['나1', '나'],
    ] as const) {
      ids[title] = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: ids[menu], title })).body.id
    }
    const P = `/projects/${project.id}/pages/${ids['가1']}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '글' } } },
        {
          op: 'add',
          path: '/root/children/1',
          value: { id: 'n_card0000001', type: 'Card', children: [{ id: 'n_intx0000001', type: 'Text', props: { content: '안' } }] },
        },
        { op: 'add', path: '/root/children/2', value: { id: 'n_divi0000001', type: 'Divider' } },
      ],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, ids }
  }

  async function serverShape(P: string): Promise<unknown> {
    const shape = (node: { type: string; children?: unknown[] }): unknown =>
      Array.isArray(node.children) && node.children.length > 0
        ? { [node.type]: node.children.map((child) => shape(child as never)) }
        : node.type
    return shape((await stack.request(alice, 'GET', P)).body.schema.root)
  }

  async function openEditor(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  function nodeRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  function menuRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  async function middle(row: ReturnType<Page['locator']>): Promise<{ x: number; y: number }> {
    const box = (await row.boundingBox())!
    return { x: box.x + 40, y: box.y + box.height / 2 }
  }

  /** 그 줄을 누른 채 문턱(4px)을 넘긴다. */
  async function grab(page: Page, row: ReturnType<Page['locator']>): Promise<void> {
    const at = await middle(row)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 2, at.y + 8, { steps: 3 })
  }

  /** 그 자리로 옮겨 `ms` 동안 멈춘다 — 포인터가 멈춰도 연다(`hover-open.ts` 머리말). */
  async function hover(page: Page, at: { x: number; y: number }, ms: number): Promise<void> {
    await page.mouse.move(at.x, at.y, { steps: 4 })
    await page.waitForTimeout(ms)
  }

  it('구조 줄 끌기 — 접힌 줄 위에 0.7s 머물면 펴지고 0.3s 는 아니다 · 펴진 줄 안에 놓으면 그 안 끝이다', async () => {
    const { P } = await fixture('fold-structure-hover')
    const { page, close } = await openEditor(P)
    try {
      await nodeRow(page, 'n_card0000001').locator('[data-tree-toggle]').click()
      await nodeRow(page, 'n_intx0000001').waitFor({ state: 'detached' })

      await grab(page, nodeRow(page, 'n_divi0000001'))
      const card = await middle(nodeRow(page, 'n_card0000001'))
      await hover(page, card, 300)
      await hover(page, { x: card.x, y: card.y - 60 }, 900)
      const brief = await nodeRow(page, 'n_intx0000001').count()
      await hover(page, card, 900)
      const held = await nodeRow(page, 'n_intx0000001').count()
      await page.mouse.move(card.x, card.y + 2)
      await page.mouse.up()
      const moved = await poll(
        '서버 문서',
        () => serverShape(P),
        (shape) => JSON.stringify(shape).includes('"Card":["Text","Divider"]'),
      )

      expect({ brief, held, moved }).toEqual({ brief: 0, held: 1, moved: { Page: ['Text', { Card: ['Text', 'Divider'] }] } })
    } finally {
      await close()
    }
  })

  it('구조 — 접힌 줄에 «안»으로 곧바로 놓으면 그 안 끝이다', async () => {
    const { P } = await fixture('fold-structure-inside')
    const { page, close } = await openEditor(P)
    try {
      await nodeRow(page, 'n_card0000001').locator('[data-tree-toggle]').click()
      await nodeRow(page, 'n_intx0000001').waitFor({ state: 'detached' })
      await grab(page, nodeRow(page, 'n_text0000001'))
      const card = await middle(nodeRow(page, 'n_card0000001'))
      await page.mouse.move(card.x, card.y, { steps: 4 })
      await page.mouse.up()
      const moved = await poll(
        '서버 문서',
        () => serverShape(P),
        (shape) => JSON.stringify(shape).includes('"Card":["Text","Text"]'),
      )
      // 놓은 자리는 그 안 끝 — 앞의 Text 는 원래 안에 있던 것이다(id 로 가른다).
      const card0 = (await stack.request(alice, 'GET', P)).body.schema.root.children[0] as { id: string; children: { id: string }[] }
      expect({ moved, inside: card0.children.map((child) => child.id) }).toEqual({
        moved: { Page: [{ Card: ['Text', 'Text'] }, 'Divider'] },
        inside: ['n_intx0000001', 'n_text0000001'],
      })
    } finally {
      await close()
    }
  })

  it('메뉴 줄 끌기 — 접힌 메뉴 위에 0.7s 머물면 편다', async () => {
    const { P, ids } = await fixture('fold-menu-hover')
    const { page, close } = await openEditor(P)
    try {
      await menuRow(page, ids['나']!).locator('[data-tree-toggle]').click()
      await menuRow(page, ids['나1']!).waitFor({ state: 'detached' })
      await grab(page, menuRow(page, ids['가2']!))
      await hover(page, await middle(menuRow(page, ids['나']!)), 900)
      const held = await menuRow(page, ids['나1']!).count()
      await page.keyboard.press('Escape')
      await page.mouse.up()
      expect(held).toBe(1)
    } finally {
      await close()
    }
  })

  it('컴포넌트 카드 — 트리 위 접힌 줄에 0.7s 머물면 편다(경로 층을 지나는 끌기)', async () => {
    const { P } = await fixture('fold-palette-hover')
    const { page, close } = await openEditor(P)
    try {
      await nodeRow(page, 'n_card0000001').locator('[data-tree-toggle]').click()
      await nodeRow(page, 'n_intx0000001').waitFor({ state: 'detached' })
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      const cardBox = (await page.locator('[data-wb-palette-card]').first().boundingBox())!
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(cardBox.x + cardBox.width / 2 + 10, cardBox.y + cardBox.height / 2 - 10, { steps: 3 })
      await hover(page, await middle(nodeRow(page, 'n_card0000001')), 900)
      const held = await nodeRow(page, 'n_intx0000001').count()
      await page.keyboard.press('Escape')
      await page.mouse.up()
      expect(held).toBe(1)
    } finally {
      await close()
    }
  })

  it('캔버스에서 접힌 줄 안의 노드를 누르면 그 조상이 펴지고 그 줄이 고른 줄이다', async () => {
    const { P } = await fixture('fold-canvas-pick')
    const { page, close } = await openEditor(P)
    try {
      await page.getByRole('region', { name: '구조 트리' }).getByRole('button', { name: '모두 접기' }).click()
      await nodeRow(page, 'n_intx0000001').waitFor({ state: 'detached' })
      await canvasFrame(page).locator('[data-wb-id="n_intx0000001"]').click()
      // 값으로 끝낸다 — 안 펴지면 시간 초과가 아니라 0 이 남는다.
      const shown = await poll(
        '조상이 펴짐',
        () => nodeRow(page, 'n_intx0000001').count(),
        (count) => count > 0,
        3_000,
      ).catch(() => 0)
      const current = await nodeRow(page, 'n_intx0000001').locator('button[aria-current="true"]').count()
      expect({ shown, current }).toEqual({ shown: 1, current: 1 })
    } finally {
      await close()
    }
  })
})
