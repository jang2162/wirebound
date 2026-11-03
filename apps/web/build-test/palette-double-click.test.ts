/**
 * **카드 몸통을 더블클릭하면 넣는다**(`src/palette/card-double-click.ts` · `palette/component-palette.tsx` · `palette/module-tab.tsx` 머리말 «카드») —
 * 컴포넌트 카드 · 모듈 카드의 몸통 더블클릭이 «넣기» 단추와 같은 넣기를 한 번 하는지 서버 문서로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 컴포넌트 카드 더블클릭 | 몸통 더블클릭이 안 넣는다 · 둘을 넣는다 · 누름 둘이 끌기를 세운다(이름표) |
 * | 홑클릭 | 몸통 누름 한 번이 넣는다 |
 * | 끈 뒤의 누름 | 끌기를 마친 자리에서 곧바로 누른 한 번(OS 가 더블클릭으로 세는 둘째)이 넣기로 선다 |
 * | «넣기» 단추 더블클릭 | 단추의 누름 둘을 몸통의 더블클릭으로도 세어 둘을 넣는다(단추의 둘째 삼킴은 `DOUBLE_CLICK_MS`) |
 * | 모듈 카드 더블클릭 | 모듈 카드 몸통 더블클릭이 모듈을 안 넣는다 · 두 벌 넣는다 |
 * | 모듈 카드의 «이름 바꾸기» · 이름 칸 더블클릭 | 카드 안 조작 요소(단추 · 입력)의 누름 둘을 몸통의 더블클릭으로 세어 모듈을 넣는다 |
 *
 * «넣기» 단추 케이스는 단추의 둘째 삼킴(`repeatsLastAdd`)을 잠근다 — 몸통이 조작 요소의 누름을 거르는지는 그 삼킴이 함께 막아 이 케이스로 못 잰다.
 * 그 거름은 «이름 바꾸기» 케이스가 잰다(그 단추에는 둘째 삼킴이 없다).
 *
 * 누름은 CDP 마우스다(playwright `dblclick` 은 `clickCount` 1 · 2 를 낸다 — 브라우저가 `dblclick` 을 낸다). «끈 뒤의 누름» 의 둘째 누름은
 * `clickCount: 2` 로 낸다 — OS 가 끌기 뒤의 누름을 더블클릭의 둘째로 세는 가장 나쁜 판이다(그 판에서 `dblclick` 이 섰는지를 카나리아로 센다).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DOUBLE_CLICK_MS } from '../src/shell/action-menu'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface SchemaNode {
  id: string
  type: string
  children?: SchemaNode[]
}

/** 모듈 하나 — 글 둘을 든 카드. */
const MODULE_NODES = [
  {
    id: 'n_modcard0001',
    type: 'Card',
    props: { title: '모듈 카드' },
    children: [
      { id: 'n_modtext0001', type: 'Text', props: { content: '모듈 글 하나' } },
      { id: 'n_modtext0002', type: 'Text', props: { content: '모듈 글 둘' } },
    ],
  },
]

describe.skipIf(!전제.ok)('카드 더블클릭 넣기 — 실브라우저', () => {
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

  async function seed(slug: string): Promise<{ P: string; projectId: string }> {
    const project = (await call('POST', '/projects', { name: '더블클릭 넣기', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_first000001', type: 'Text', props: { content: '처음 글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, projectId: project.id }
  }

  /** 뿌리 몸통의 자식 타입 — 문서 차례. */
  async function topTypes(P: string): Promise<string[]> {
    const root = (await call('GET', P)).body.schema.root as SchemaNode
    return (root.children ?? []).map((child) => child.type)
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    // 끄는 이름표가 선 횟수 · 몸통에 온 `dblclick` 수 — 끌기가 섰는지 · OS 의 더블클릭이 났는지의 카나리아.
    await page.evaluate(() => {
      const w = window as unknown as { __tags: number; __dbl: number }
      w.__tags = 0
      w.__dbl = 0
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof HTMLElement && node.classList.contains('wb-shell-palette-dragtag')) w.__tags += 1
      }).observe(document.body, { childList: true, subtree: true })
      document.addEventListener('dblclick', () => (w.__dbl += 1), true)
    })
    return { page, close: () => context.close() }
  }

  const counters = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __tags: number; __dbl: number }
      return { tags: w.__tags, dbl: w.__dbl }
    })

  async function only(page: Page, type: string): Promise<void> {
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
  }

  /** 카드의 이름 글 가운데 — 몸통의 한 점(«넣기» 단추 밖). */
  async function bodyPoint(page: Page, selector: string): Promise<{ x: number; y: number }> {
    const box = (await page.locator(selector).boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  /** 서버 문서가 바뀌었으면 그 판, 아니면 한도 뒤의 판 — 넣기는 WS 로 나가 곧바로 안 닿는다. */
  async function settled(P: string, before: string[], ms = 3_000): Promise<string[]> {
    const until = Date.now() + ms
    for (;;) {
      const now = await topTypes(P)
      if (now.length !== before.length || Date.now() > until) return now
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  it('컴포넌트 카드 몸통을 더블클릭하면 노드 하나를 넣고, 끌기는 서지 않는다', async () => {
    const { P } = await seed('dbl-card')
    const tab = await open(P)
    try {
      await only(tab.page, 'Divider')
      const at = await bodyPoint(tab.page, '[data-wb-palette-card="Divider"] .wb-shell-palette-label')
      await tab.page.mouse.dblclick(at.x, at.y)
      const types = await settled(P, ['Text'])
      // 둘째가 늦게 닿을 틈 — 한 번 더 본다.
      await new Promise((resolve) => setTimeout(resolve, DOUBLE_CLICK_MS))
      expect({ 서버: await topTypes(P), 처음: types, ...(await counters(tab.page)) }).toEqual({
        서버: ['Text', 'Divider'],
        처음: ['Text', 'Divider'],
        tags: 0,
        dbl: 1,
      })
    } finally {
      await tab.close()
    }
  })

  it('몸통 홑클릭은 넣지 않는다', async () => {
    const { P } = await seed('dbl-single')
    const tab = await open(P)
    try {
      await only(tab.page, 'Divider')
      const at = await bodyPoint(tab.page, '[data-wb-palette-card="Divider"] .wb-shell-palette-label')
      await tab.page.mouse.click(at.x, at.y)
      await tab.page.waitForTimeout(DOUBLE_CLICK_MS + 200)
      await tab.page.mouse.click(at.x, at.y)
      expect({ 서버: await settled(P, ['Text'], 1_500), ...(await counters(tab.page)) }).toEqual({ 서버: ['Text'], tags: 0, dbl: 0 })
    } finally {
      await tab.close()
    }
  })

  it('몸통을 끌어 판 안에 놓은 자리에서 곧바로 누른 한 번(OS 의 더블클릭 둘째)은 넣지 않는다', async () => {
    const { P } = await seed('dbl-after-drag')
    const tab = await open(P)
    try {
      await only(tab.page, 'Divider')
      const at = await bodyPoint(tab.page, '[data-wb-palette-card="Divider"] .wb-shell-palette-label')
      const { mouse } = tab.page
      await mouse.move(at.x, at.y)
      await mouse.down()
      await mouse.move(at.x + 20, at.y, { steps: 4 })
      await mouse.move(at.x + 40, at.y + 4, { steps: 4 })
      await mouse.up()
      await mouse.down({ clickCount: 2 })
      await mouse.up({ clickCount: 2 })
      const seen = await counters(tab.page)
      expect({ 서버: await settled(P, ['Text'], 1_500), 끌기: seen.tags > 0, 더블클릭: seen.dbl }).toEqual({
        서버: ['Text'],
        끌기: true,
        더블클릭: 1,
      })
    } finally {
      await tab.close()
    }
  })

  it('«넣기» 단추를 더블클릭해도 노드는 하나다 — 단추의 누름은 몸통의 더블클릭이 아니다', async () => {
    const { P } = await seed('dbl-button')
    const tab = await open(P)
    try {
      await only(tab.page, 'Divider')
      await tab.page.getByRole('button', { name: '구분선 넣기', exact: true }).dblclick()
      await settled(P, ['Text'])
      await tab.page.waitForTimeout(DOUBLE_CLICK_MS + 300)
      expect({ 서버: await topTypes(P), 더블클릭: (await counters(tab.page)).dbl }).toEqual({ 서버: ['Text', 'Divider'], 더블클릭: 1 })
    } finally {
      await tab.close()
    }
  })

  it('모듈 카드 몸통을 더블클릭하면 모듈 한 벌을 넣는다', async () => {
    const { P, projectId } = await seed('dbl-module')
    const made = await call('POST', `/projects/${projectId}/modules`, { name: '두 글 카드', nodes: MODULE_NODES })
    if (made.status >= 300) throw new Error(`module ${made.status} ${JSON.stringify(made.body)}`)
    const moduleId = made.body.module.id as string
    const tab = await open(P)
    try {
      await tab.page.getByRole('tablist', { name: '목록 종류' }).getByRole('tab', { name: '모듈', exact: true }).click()
      const card = `[data-wb-module-card="project:${moduleId}"]`
      await tab.page.locator(card).waitFor()
      const at = await bodyPoint(tab.page, `${card} .wb-shell-module-name`)
      await tab.page.mouse.dblclick(at.x, at.y)
      await settled(P, ['Text'])
      await tab.page.waitForTimeout(DOUBLE_CLICK_MS + 300)
      expect({ 서버: await topTypes(P), ...(await counters(tab.page)) }).toEqual({ 서버: ['Text', 'Card'], tags: 0, dbl: 1 })
    } finally {
      await tab.close()
    }
  })

  it('모듈 카드의 «이름 바꾸기» 단추 · 이름 칸을 더블클릭해도 모듈을 넣지 않는다', async () => {
    const { P, projectId } = await seed('dbl-module-rename')
    const made = await call('POST', `/projects/${projectId}/modules`, { name: '두 글 카드', nodes: MODULE_NODES })
    if (made.status >= 300) throw new Error(`module ${made.status} ${JSON.stringify(made.body)}`)
    const moduleId = made.body.module.id as string
    const tab = await open(P)
    try {
      await tab.page.getByRole('tablist', { name: '목록 종류' }).getByRole('tab', { name: '모듈', exact: true }).click()
      const card = tab.page.locator(`[data-wb-module-card="project:${moduleId}"]`)
      await card.waitFor()
      await card.getByRole('button', { name: '두 글 카드 이름 바꾸기', exact: true }).dblclick()
      const input = card.getByRole('textbox', { name: '두 글 카드 새 이름', exact: true })
      await input.waitFor()
      await input.dblclick()
      await tab.page.waitForTimeout(DOUBLE_CLICK_MS + 300)
      expect({
        서버: await settled(P, ['Text'], 1_000),
        이름칸: await input.isVisible(),
        더블클릭: (await counters(tab.page)).dbl,
      }).toEqual({
        서버: ['Text'],
        이름칸: true,
        더블클릭: 2,
      })
    } finally {
      await tab.close()
    }
  })
})
