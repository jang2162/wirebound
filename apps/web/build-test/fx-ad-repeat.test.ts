/**
 * **FX-AD H2 — 에디터의 줄 «…» 에서 Enter 를 누른 채 있으면**(리뷰 `docs/superpowers/plans/2026-11-01-rv-ad-report.md` H2 · 대응
 * `2026-11-01-fx-ad-report.md`). 행동 메뉴(`src/shell/action-menu.tsx`)는 관리자 칸과 에디터가 함께 쓴다 — 고른 항목이 메뉴를 닫고 포커스를
 * 단추로 돌린 뒤 누른 채인 Enter 의 반복이 단추를 다시 눌러 첫 항목을 고르는 사슬을, 에디터 구조 트리 줄의 «…» 에서 잰다. 관리자 칸의 판은
 * `./rv-ad-admin.test.ts` «H2».
 *
 * 키 반복은 Playwright `keyboard.down` 을 거듭 불러 낸다(이미 눌린 키면 `autoRepeat` 로 나간다 — 리뷰 H2 와 같은 꼴). 서버 문서와 누른 동안
 * 메뉴가 다시 선 횟수로 단언한다 — 사슬이 고르는 첫 항목(«별칭 바꾸기»)은 서버 편집을 안 내 서버 값만으로는 안 보인다.
 *
 * **«삭제» 판은 반복 거름을 떼도 초록이다** — 지운 줄의 «…» 가 사라져 포커스가 `body` 로 떨어지므로 반복이 누를 단추가 없다(잰 값 — 보고
 * B4). 그 판은 «지운 뒤 포커스가 다른 줄의 단추로 가면» 이 서는 길을 잠근다. 반복 거름은 «아래로» 판이 혼자 잰다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const T = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const C = (id: string, title: string, children: unknown[]) => ({ id, type: 'Card', props: { title }, children })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const log = (label: string, value: unknown): void => {
  // eslint-disable-next-line no-console
  console.log(`[fx-ad ${label}] ${JSON.stringify(value)}`)
}

describe.skipIf(!전제.ok)('FX-AD H2 — 에디터 줄 «…» 의 키 반복', () => {
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

  async function fixture(nodes: unknown[]): Promise<string> {
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await stack.request(alice, method, path, body)
      if (response.status >= 300) throw new Error(`픽스처 ${method} ${path} ${response.status} ${JSON.stringify(response.body)}`)
      return response.body
    }
    const project = await call('POST', '/projects', { name: 'FX-AD 반복', slug: `fx-ad-${Date.now().toString(36)}` })
    const menu = await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })
    const page = await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })
    const P = `/projects/${project.id}/pages/${page.id}`
    await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })),
    })
    return P
  }

  /** 서버의 그 페이지 — 전위 순회 id 와 `headSeq`. */
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

  /** 편집이 멎을 때까지 기다린 서버 값. */
  async function settled(P: string): Promise<{ order: string[]; headSeq: number }> {
    let last = ''
    for (let i = 0; i < 20; i += 1) {
      await sleep(250)
      const now = JSON.stringify(await server(P))
      if (now === last) break
      last = now
    }
    return server(P)
  }

  const row = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)
  const rowMore = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] button[aria-haspopup="menu"][aria-label$=" 더 보기"]`)

  /** 열린 메뉴에서 그 이름의 항목까지 ↓ 로 간다 — 판 카나리아로 그 항목에 섰는지 돌려준다. */
  async function focusItem(page: Page, name: string): Promise<boolean> {
    for (let i = 0; i < 12; i += 1) {
      const text = await page.evaluate(() => document.activeElement?.textContent ?? '')
      if (text.trim() === name) return true
      await page.keyboard.press('ArrowDown')
    }
    return false
  }

  /** 지금부터 `role="menu"` 목록이 DOM 에 새로 선 횟수를 센다 — 사슬이 서면 메뉴가 다시 열린다(서버 편집이 없는 항목이 골라져도 보인다). */
  async function countMenuOpens(page: Page): Promise<() => Promise<number>> {
    await page.evaluate(() => {
      const w = window as unknown as { fxMenuOpens: number }
      w.fxMenuOpens = 0
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof Element && (node.matches('[role="menu"]') || node.querySelector('[role="menu"]') !== null))
              w.fxMenuOpens += 1
      }).observe(document.body, { childList: true, subtree: true })
    })
    return () => page.evaluate(() => (window as unknown as { fxMenuOpens: number }).fxMenuOpens)
  }

  /** Enter 를 누른 채 — 첫 keydown + 반복 keydown 20 번 · 35ms(리뷰 H2 와 같은 꼴). */
  async function holdEnter(page: Page): Promise<void> {
    await page.keyboard.down('Enter')
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(35)
      await page.keyboard.down('Enter')
    }
    await page.keyboard.up('Enter')
  }

  it.each([
    // «삭제» — 지운 줄의 «…» 가 사라져 포커스가 단추로 못 돌아온다. 사슬이 서면 남은 줄의 메뉴가 다시 열린다.
    { item: '삭제', rowId: 'n_text0000002', expected: ['n_card0000001', 'n_text0000001', 'n_text0000003', 'n_text0000004'] },
    // «아래로» — 옮긴 줄의 «…» 가 남아 포커스가 돌아온다. 사슬이 서면 반복이 첫 항목(«별칭 바꾸기»)을 고르거나 «아래로» 를 거듭 낸다.
    {
      item: '아래로',
      rowId: 'n_text0000001',
      expected: ['n_card0000001', 'n_text0000002', 'n_text0000001', 'n_text0000003', 'n_text0000004'],
    },
  ])('구조 트리 줄 «…» 의 «$item» 에서 Enter 를 누른 채 — 편집 하나', async ({ item, rowId, expected }) => {
    const P = await fixture([
      C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]),
      T('n_text0000004', '글 4'),
    ])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await page.locator('iframe.wb-shell-canvas-iframe').waitFor()
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await row(page, rowId).click()
      await rowMore(page, rowId).click()
      // 판 카나리아 — 메뉴가 열렸고 그 항목에 섰다.
      expect(await focusItem(page, item)).toBe(true)
      const opens = await countMenuOpens(page)
      await holdEnter(page)
      await sleep(1500)
      const after = await settled(P)
      const seen = {
        ...after,
        reopened: await opens(),
        menuOpen: await page.locator('[role="menu"]').count(),
        active: await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('aria-label') ?? ''}`),
      }
      log(item, seen)
      expect({ order: after.order, headSeq: after.headSeq, reopened: seen.reopened }).toEqual({ order: expected, headSeq: 2, reopened: 0 })
    } finally {
      await context.close()
    }
  })
})
