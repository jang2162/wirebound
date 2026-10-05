/**
 * **열린 행동 메뉴 안의 Delete · Backspace 는 노드를 지우지 않는다**(설계서 「설계서 화면 구조」 단축키 절 · `src/edit/editor-shortcuts.ts` 의
 * `keyHeldByWidget` · `src/shell/action-menu.tsx` 머리말 «열린 동안 키는 메뉴의 것이다»). 키 반복은 CDP `autoRepeat` 로만 서고, 포커스 · 메뉴
 * 목록의 portal · 캔버스 iframe 은 jsdom 이 못 세우는 판이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 구조 트리 줄 `…` — 첫 항목 · 둘째 항목 · 단추에 포커스 | 메뉴가 열린 채 친 Delete · Backspace · 1s 누름이 고른 노드를 지운다 |
 * | 구조 트리 줄 `+` · 구조 트리 머리 · 셸 머리 `…` | 같은 판정이 그 메뉴들에서 안 선다 |
 * | 메뉴 트리 줄 `…` | 메뉴 목록의 키가 React 트리를 따라 메뉴 트리 상자의 단축키(`panels/menu-tree.tsx` 의 `handleKeyDown`)에 닿아 삭제 확인을 건다 |
 * | 메뉴를 닫은 뒤 · 캔버스를 눌러 닫힌 뒤 · 캔버스로 포커스만 옮겨 닫힌 뒤 | 닫힌 메뉴의 Delete 가 고른 노드를 안 지운다(막는 것이 메뉴 밖까지 샌다) · 포커스가 떠난 메뉴가 열린 채 남는다 |
 *
 * 서버 문서(`GET …/pages/:id`)와 열린 `role="menu"` 수로 단언한다.
 */
import type { CDPSession, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const T = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const C = (id: string, title: string, children: unknown[]) => ({ id, type: 'Card', props: { title }, children })

/** `[카드[글 1, 글 2, 글 3], 글 4, 글 5]`. */
const PAGE = () => [
  C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]),
  T('n_text0000004', '글 4'),
  T('n_text0000005', '글 5'),
]
const WHOLE = ['n_card0000001', 'n_text0000001', 'n_text0000002', 'n_text0000003', 'n_text0000004', 'n_text0000005']
const WITHOUT_TEXT2 = WHOLE.filter((id) => id !== 'n_text0000002')

const DELETE = { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, modifiers: 0 }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface After {
  order: string[]
  headSeq: number
  menus: number
  selected: string | null
}

describe.skipIf(!전제.ok)('열린 행동 메뉴의 Delete · Backspace — 실브라우저', () => {
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

  async function server(P: string): Promise<{ order: string[]; headSeq: number }> {
    const response = await stack.request(alice, 'GET', P)
    const order: string[] = []
    const walk = (node: { id?: unknown; children?: unknown[] }): void => {
      if (typeof node.id === 'string') order.push(node.id)
      for (const child of node.children ?? []) walk(child as typeof node)
    }
    for (const child of response.body.schema.root.children ?? []) walk(child)
    return { order, headSeq: response.body.headSeq }
  }

  /** 편집이 멎을 때까지 기다린 서버 값 · 열린 메뉴 수 · 고른 노드. */
  async function after(page: Page, P: string): Promise<After> {
    let last = ''
    for (let i = 0; i < 12; i += 1) {
      await sleep(200)
      const now = JSON.stringify(await server(P))
      if (now === last) break
      last = now
    }
    return { ...(await server(P)), menus: await page.locator('[role="menu"]').count(), selected: await selected(page) }
  }

  async function fixture(slug: string): Promise<{ P: string }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'G2 메뉴 Delete', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const first = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
    const P = `/projects/${project.id}/pages/${first.id}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: PAGE().map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P }
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').waitFor()
    return { page, close: () => context.close() }
  }

  const selected = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-tree-kind="node"] > button[aria-current="true"]')
      return button === null ? null : button.parentElement!.getAttribute('data-tree-id')
    })

  const row = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)
  /** 그 줄의 `+`(0) · `…`(1). */
  const rowMenu = (page: Page, id: string, which: 0 | 1) => page.locator(`[data-tree-id="${id}"] button[aria-haspopup="menu"]`).nth(which)

  /** 포커스 받은 요소의 역할 · 이름 — 판 카나리아(키가 그 자리에서 났다). */
  const focusOf = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement
      if (active === null) return null
      if (active.localName === 'iframe') return 'iframe'
      return active.getAttribute('role') ?? active.getAttribute('aria-haspopup') ?? active.localName
    })

  /** CDP 로 1s 누른다 — 첫 `rawKeyDown` 뒤 400ms 부터 33ms 간격 `autoRepeat`. 돌려주는 값은 낸 keydown 수. */
  async function hold(page: Page, key: typeof DELETE): Promise<number> {
    const cdp: CDPSession = await page.context().newCDPSession(page)
    const started = Date.now()
    let sent = 1
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await sleep(400)
    while (Date.now() - started < 1_000) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: true, ...key })
      sent += 1
      await sleep(33)
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    return sent
  }

  it('구조 트리 줄 `…` — 첫 항목 · 둘째 항목 · 단추에 포커스가 있어도 Delete · Backspace · 누름은 노드를 안 지우고 메뉴는 열린 채다', async () => {
    const cases: [string, (page: Page) => Promise<void>, (page: Page) => Promise<unknown>][] = [
      ['첫 항목 Delete', async () => {}, (page) => page.keyboard.press('Delete')],
      ['첫 항목 Backspace', async () => {}, (page) => page.keyboard.press('Backspace')],
      ['첫 항목 누름', async () => {}, (page) => hold(page, DELETE)],
      ['둘째 항목 Delete', (page) => page.keyboard.press('ArrowDown'), (page) => page.keyboard.press('Delete')],
      ['단추 Delete', (page) => rowMenu(page, 'n_text0000002', 1).focus(), (page) => page.keyboard.press('Delete')],
      ['단추 Backspace', (page) => rowMenu(page, 'n_text0000002', 1).focus(), (page) => page.keyboard.press('Backspace')],
    ]
    const results: Record<string, unknown> = {}
    for (const [name, place, press] of cases) {
      const { P } = await fixture(`menu-del-row-${Object.keys(results).length}`)
      const { page, close } = await open(P)
      try {
        await row(page, 'n_text0000002').click()
        await rowMenu(page, 'n_text0000002', 1).click()
        await page.locator('[role="menu"]').waitFor()
        await place(page)
        const focus = await focusOf(page)
        const sent = await press(page)
        results[name] = { focus, ...(await after(page, P)), ...(typeof sent === 'number' ? { held: sent >= 10 } : {}) }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[메뉴 Delete] 줄 … ${JSON.stringify(results)}`)
    const kept = (focus: string, extra: Record<string, unknown> = {}) => ({ focus, order: WHOLE, headSeq: 1, menus: 1, selected: 'n_text0000002', ...extra })
    expect(results).toEqual({
      '첫 항목 Delete': kept('menuitem'),
      '첫 항목 Backspace': kept('menuitem'),
      '첫 항목 누름': kept('menuitem', { held: true }),
      '둘째 항목 Delete': kept('menuitem'),
      '단추 Delete': kept('menu'),
      '단추 Backspace': kept('menu'),
    })
  })

  it('구조 트리 줄 `+` · 구조 트리 머리 · 셸 머리 `…` — 열린 동안 Delete 는 노드를 안 지운다', async () => {
    const menus: [string, (page: Page) => ReturnType<Page['locator']>][] = [
      ['줄 +', (page) => rowMenu(page, 'n_text0000002', 0)],
      ['구조 트리 머리', (page) => page.getByRole('button', { name: '구조 트리에 추가', exact: true })],
      ['셸 머리 …', (page) => page.locator('header.wb-shell-header').getByRole('button', { name: '더 보기', exact: true })],
    ]
    const results: Record<string, unknown> = {}
    for (const [name, toggle] of menus) {
      const { P } = await fixture(`menu-del-other-${Object.keys(results).length}`)
      const { page, close } = await open(P)
      try {
        await row(page, 'n_text0000002').click()
        await toggle(page).click()
        await page.locator('[role="menu"]').waitFor()
        const focus = await focusOf(page)
        await page.keyboard.press('Delete')
        results[name] = { focus, ...(await after(page, P)) }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[메뉴 Delete] 다른 메뉴 ${JSON.stringify(results)}`)
    const kept = { focus: 'menuitem', order: WHOLE, headSeq: 1, menus: 1, selected: 'n_text0000002' }
    expect(results).toEqual({ '줄 +': kept, '구조 트리 머리': kept, '셸 머리 …': kept })
  })

  it('메뉴 트리 줄 `…` — 열린 동안 Delete · Backspace 는 메뉴 트리의 삭제 확인도 안 건다', async () => {
    const results: Record<string, unknown> = {}
    for (const key of ['Delete', 'Backspace']) {
      const { P } = await fixture(`menu-del-tree-${key.toLowerCase()}`)
      const { page, close } = await open(P)
      try {
        // 줄 행동은 마우스가 올라온 줄에서 선다 — 페이지 줄의 줄 단추는 링크라 누르지 않고 올린다(`./action-menu-portal.test.ts` 의 `openRow`).
        const pageRow = page.locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-kind="page"]').first()
        await pageRow.locator(':scope > :first-child').hover()
        await pageRow.getByRole('button', { name: '첫째 더 보기', exact: true }).click()
        await page.locator('[role="menu"]').waitFor()
        const focus = await focusOf(page)
        await page.keyboard.press(key)
        await sleep(200)
        results[key] = { focus, confirms: await page.locator('.wb-shell-tree-confirm').count(), menus: await page.locator('[role="menu"]').count() }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[메뉴 Delete] 메뉴 트리 ${JSON.stringify(results)}`)
    expect(results).toEqual({ Delete: { focus: 'menuitem', confirms: 0, menus: 1 }, Backspace: { focus: 'menuitem', confirms: 0, menus: 1 } })
  })

  it('닫힌 뒤의 Delete 는 지금처럼 고른 노드를 지운다 — Escape 로 닫음 · 캔버스를 눌러 닫음 · 메뉴를 연 채 캔버스로 포커스만 옮김', async () => {
    const results: Record<string, unknown> = {}
    const ways: [string, (page: Page) => Promise<void>][] = [
      ['Escape', (page) => page.keyboard.press('Escape')],
      ['캔버스 누름', (page) => canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()],
      [
        '캔버스 포커스',
        (page) => page.evaluate(() => (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentWindow!.focus()),
      ],
    ]
    for (const [name, leave] of ways) {
      const { P } = await fixture(`menu-del-closed-${Object.keys(results).length}`)
      const { page, close } = await open(P)
      try {
        await row(page, 'n_text0000002').click()
        await rowMenu(page, 'n_text0000002', 1).click()
        await page.locator('[role="menu"]').waitFor()
        await leave(page)
        await sleep(100)
        const menusBefore = await page.locator('[role="menu"]').count()
        const focus = await focusOf(page)
        await page.keyboard.press('Delete')
        results[name] = { menusBefore, focus, ...(await after(page, P)) }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[메뉴 Delete] 닫힌 뒤 ${JSON.stringify(results)}`)
    const removed = (menusBefore: number, focus: string) => ({ menusBefore, focus, order: WITHOUT_TEXT2, headSeq: 2, menus: 0, selected: null })
    expect(results).toEqual({
      Escape: removed(0, 'menu'),
      '캔버스 누름': removed(0, 'iframe'),
      // 메뉴는 포커스가 밖으로 간 순간 닫힌다(`src/shell/action-menu.tsx` 머리말 «포커스가 메뉴 밖의 요소로 옮으면 닫는다»).
      '캔버스 포커스': removed(0, 'iframe'),
    })
  })
})
