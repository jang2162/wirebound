/**
 * **E1 리뷰가 실브라우저로 찾은 판을 잠근다**(`docs/superpowers/plans/2026-10-03-e1-review.md` 의 H1 · H2 · L1 ~ L6). 키 반복 · 메뉴 안 화살표 ·
 * 닫힌 shadow · 굴림 · 브라우저 기본 고르기는 jsdom 이 못 세우는 판이다(키 반복은 CDP `autoRepeat` 로만 선다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | H1 Delete 누름 · 두 번 | 키보드 삭제가 지운 뒤 부모를 고른다 — 다음 Delete 가 형제를 든 부모까지 지운다 |
 * | H1 Cmd+D 누름 | 복제가 키 반복을 받는다 — 1s 누름에 사본 열 몇 개 |
 * | H2 열린 줄 메뉴의 ← → | 메뉴 안의 화살표가 선택을 옮기고 그 메뉴의 «삭제»가 옮겨 간 노드를 지운다 |
 * | H2 위젯이 쓰는 키 | 탭 · 손잡이에 포커스가 있어도 그 위젯이 쓰는 축의 화살표를 단축키가 받는다 · 안 쓰는 축의 화살표와 Delete 를 위젯이 먹는다 |
 * | L2 · L3 Escape | 열린 팝오버 · 고르개 안의 Escape 가 선택을 푼다 · 고르개 안의 Escape 가 고르개를 안 닫는다 · 줄의 Escape 뒤 고르개(`adding`)가 다음 선택에 다시 선다 |
 * | L1 닫힌 shadow 입력 | 캔버스의 포커스 받은 요소를 표면으로 안 본다 — 그 칸의 Backspace 가 노드를 지운다 |
 * | L4 붙이는 사이 떠남 | 페이지 목록을 읽는 사이 떠났다 돌아온 판을 id 로 «안 떠났다»로 읽고 붙인다 · 떠나 머물면 말없이 사라진다 |
 * | L5 굴림 | 화살표로 옮긴 선택이 화면 밖에 남는다 |
 * | L6 Cmd+A | Cmd+A 는 «형제 모두 고르기»다 — 브라우저의 «전부 고르기»를 막아 캔버스 글자가 안 골라지고 기준 노드의 형제가 다 든다 |
 *
 * **Delete 의 반복 거름은 여기서 혼자 안 죽는다** — 키보드 삭제가 선택을 비우므로 반복된 Delete 에는 지울 것이 없다(누름 케이스는 둘을 다 뗀
 * 판에서만 죽는다). 반복 거름은 Cmd+D 누름 케이스와 `test/edit/use-editor-shortcuts.test.tsx` «누른 채의 반복»이 잰다.
 *
 * **열린 줄 메뉴의 ← → 는 두 겹이 막는다** — 포커스가 `menuitem` 안이라는 역할 판정과 열린 메뉴 상자의 표지(`data-wb-holds-keys`)다. 한 겹씩
 * 떼면 이 케이스는 초록이다. 둘 다 떼면 ← 가 선택을 옮기고 메뉴는 닫힌다(`shell/action-menu.tsx` 의 `openWhile` — 그것은
 * `./editor-shortcuts-review-2.test.ts` «R1» 이 잰다). 메뉴 표지는 «L2 · L3» 의 «Page 더 보기» 판이 혼자 잰다.
 *
 * 서버 문서(`GET …/pages/:id`)로 단언한다.
 */
import type { CDPSession, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const T = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const C = (id: string, title: string, children: unknown[]) => ({ id, type: 'Card', props: { title }, children })
const B = (id: string, label: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Button', props: { label }, ...extra })

/** `[카드[글 1, 글 2, 글 3], 글 4, 글 5, 단추]` — H1 의 판. */
const CARD_PAGE = () => [
  C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]),
  T('n_text0000004', '글 4'),
  T('n_text0000005', '글 5'),
  B('n_btn00000001', '단추'),
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!전제.ok)('E1 리뷰 대응 — 실브라우저', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

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

  /** 편집이 멎을 때까지 기다린 서버 값(반복 키가 낸 편집이 다 닿게). */
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

  async function open(P: string, viewport = { width: 1440, height: 900 }): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await page.locator('iframe.wb-shell-canvas-iframe').waitFor()
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close() }
  }

  /** 고른 노드 id — 구조 트리의 `aria-current` 줄. */
  const selected = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-tree-kind="node"] > button[aria-current="true"]')
      return button === null ? null : button.parentElement!.getAttribute('data-tree-id')
    })

  const row = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)
  /** 그 줄의 `+`(0) · `…`(1). */
  const rowMenu = (page: Page, id: string, which: 0 | 1) => page.locator(`[data-tree-id="${id}"] button[aria-haspopup="menu"]`).nth(which)

  /**
   * 키를 누르고 있는다 — CDP 로 첫 `rawKeyDown` 뒤 400ms 부터 33ms 간격 `autoRepeat`(브라우저의 키 반복 꼴), 1s. 돌려주는 값은 낸 keydown 수.
   */
  async function hold(page: Page, key: { key: string; code: string; windowsVirtualKeyCode: number; modifiers: number }): Promise<number> {
    const cdp: CDPSession = await page.context().newCDPSession(page)
    const started = Date.now()
    let sent = 0
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    sent += 1
    await sleep(400)
    while (Date.now() - started < 1_000) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: true, ...key })
      sent += 1
      await sleep(33)
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    return sent
  }

  /** 문서에 닿은 keydown 중 `repeat` 인 것의 수 — 판 카나리아(반복이 실제로 났다). */
  async function countRepeats(page: Page): Promise<() => Promise<number>> {
    await page.evaluate(() => {
      const box = window as unknown as { __repeats: number }
      box.__repeats = 0
      const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
      for (const doc of [document, frame.contentDocument!]) {
        doc.addEventListener('keydown', (event) => {
          if (event.repeat) box.__repeats += 1
        }, true)
      }
    })
    return () => page.evaluate(() => (window as unknown as { __repeats: number }).__repeats)
  }

  it('H1 Delete 를 1s 누르고 있어도 고른 노드 하나만 지우고 선택을 비운다', async () => {
    const { P } = await fixture(stack, alice, 'h1-hold', CARD_PAGE())
    const { page, close } = await open(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      const before = await selected(page)
      const repeats = await countRepeats(page)
      const sent = await hold(page, { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, modifiers: 0 })
      const after = await settled(P)

      expect({ before, sent: sent >= 10, repeats: (await repeats()) >= 5 }).toEqual({ before: 'n_text0000002', sent: true, repeats: true })
      expect({ ...after, selected: await selected(page) }).toEqual({
        order: ['n_card0000001', 'n_text0000001', 'n_text0000003', 'n_text0000004', 'n_text0000005', 'n_btn00000001'],
        headSeq: 2,
        selected: null,
      })
    } finally {
      await close()
    }
  })

  it('H1 따로 두 번 친 Delete 는 둘째가 아무것도 안 지운다 — 캔버스 · 구조 트리 줄', async () => {
    const results: unknown[] = []
    for (const where of ['canvas', 'tree'] as const) {
      const { P } = await fixture(stack, alice, `h1-twice-${where}`, CARD_PAGE())
      const { page, close } = await open(P)
      try {
        if (where === 'canvas') await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
        else await row(page, 'n_text0000002').click()
        await page.keyboard.press('Delete')
        await poll('첫 Delete 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 2)
        await page.keyboard.press('Delete')
        results.push({ where, ...(await settled(P)), selected: await selected(page) })
      } finally {
        await close()
      }
    }
    const left = ['n_card0000001', 'n_text0000001', 'n_text0000003', 'n_text0000004', 'n_text0000005', 'n_btn00000001']
    expect(results).toEqual([
      { where: 'canvas', order: left, headSeq: 2, selected: null },
      { where: 'tree', order: left, headSeq: 2, selected: null },
    ])
  })

  it('H1 Cmd+D 를 1s 누르고 있어도 한 번만 복제한다', async () => {
    const { P } = await fixture(stack, alice, 'h1-dup', CARD_PAGE())
    const { page, close } = await open(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_text0000004"]').click()
      const repeats = await countRepeats(page)
      const sent = await hold(page, { key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, modifiers: 4 })
      const after = await settled(P)

      expect({ sent: sent >= 10, repeats: (await repeats()) >= 5 }).toEqual({ sent: true, repeats: true })
      // 픽스처 노드 7 + 사본 1.
      expect({ headSeq: after.headSeq, count: after.order.length }).toEqual({ headSeq: 2, count: 8 })
    } finally {
      await close()
    }
  })

  it('H2 열린 줄 메뉴 안의 ← · → 는 선택을 안 옮긴다 — 그 메뉴의 «삭제»는 연 줄을 지운다', async () => {
    const page0 = () => [T('n_text0000000', '글 0'), C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]), T('n_text0000004', '글 4')]
    const results: unknown[] = []
    for (const [rowId, key] of [['n_text0000002', 'ArrowLeft'], ['n_card0000001', 'ArrowRight']] as const) {
      const { P } = await fixture(stack, alice, 'h2-menu', page0())
      const { page, close } = await open(P)
      try {
        await row(page, rowId).click()
        await rowMenu(page, rowId, 1).click()
        // 판 카나리아 — 메뉴가 열렸고 포커스가 그 메뉴의 항목이다.
        const focusRole = await page.evaluate(() => document.activeElement?.getAttribute('role'))
        await page.keyboard.press(key)
        await sleep(200)
        const afterKey = { selected: await selected(page), menuOpen: await page.locator('[role="menu"]').count() }
        // 메뉴가 닫혔으면(선택이 옮아 `openWhile` 이 닫음) 누를 «삭제»가 없다 — 값으로 죽게 누르지 않는다.
        if (afterKey.menuOpen > 0) {
          await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
          await poll('«삭제»가 서버에 닿는다', () => server(P), (s) => s.headSeq === 2)
        }
        results.push({ rowId, focusRole, afterKey, order: (await server(P)).order })
      } finally {
        await close()
      }
    }
    expect(results).toEqual([
      {
        rowId: 'n_text0000002',
        focusRole: 'menuitem',
        afterKey: { selected: 'n_text0000002', menuOpen: 1 },
        order: ['n_text0000000', 'n_card0000001', 'n_text0000001', 'n_text0000003', 'n_text0000004'],
      },
      {
        rowId: 'n_card0000001',
        focusRole: 'menuitem',
        afterKey: { selected: 'n_card0000001', menuOpen: 1 },
        order: ['n_text0000000', 'n_text0000004'],
      },
    ])
  })

  /**
   * 리뷰 «항목 2» 표의 위젯 가운데 `role` 이 키를 쓰는 것(탭 · 손잡이)에 포커스를 두고 화살표 넷 · Delete 를 친다. **위젯은 그 위젯이 쓰는 축의
   * 화살표만 쥔다**(`edit/editor-shortcuts.ts` 의 `keyHeldByWidget`) — 가로 탭 줄은 ← →, 가로 손잡이(`aria-orientation` horizontal)는 ↑ ↓, 세로
   * 손잡이는 ← →. 안 쓰는 축의 화살표는 선택을 옮기고(«글 2»에서 ↑ 글 1 · ↓ 글 3 · ← 카드 · → 자식이 없어 그대로), Delete 는 위젯을 지나 고른
   * 노드를 지운다(반증 «R3» — 키를 하나도 안 쓰는 우측 패널 탭에서 Delete · ↓ · Escape 가 죽어 있었다). 대조: 구조 트리 줄 · 줌 단추.
   */
  it('H2 키를 쓰는 위젯(탭 · 손잡이)은 제 축의 화살표만 쥔다 — 안 쓰는 축의 화살표 · Delete 는 단축키가 받는다', async () => {
    const { P } = await fixture(stack, alice, 'h2-widgets', CARD_PAGE())
    const { page, close } = await open(P)
    try {
      await page.locator('.wb-shell-palette-toggle').click()
      await page.locator('.wb-shell-palette-tab').first().waitFor()
      const widgets: [string, () => Promise<void>][] = [
        ['갈래 탭', () => page.locator('.wb-shell-palette-tab[aria-selected="true"]').focus()],
        ['우측 패널 탭', () => page.locator('.wb-shell-tab').first().focus()],
        ['손잡이 0', () => page.locator('[role="separator"]').nth(0).focus()],
        ['손잡이 1', () => page.locator('[role="separator"]').nth(1).focus()],
        ['손잡이 2', () => page.locator('[role="separator"]').nth(2).focus()],
        ['손잡이 3', () => page.locator('[role="separator"]').nth(3).focus()],
      ]
      const moved: Record<string, (string | null)[]> = {}
      for (const [name, focus] of widgets) {
        moved[name] = []
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
          await focus()
          await page.keyboard.press(key)
          await sleep(100)
          moved[name]!.push(await selected(page))
        }
      }
      const controls: Record<string, string | null> = {}
      for (const [name, focus] of [
        ['트리 줄', () => row(page, 'n_text0000002').focus()],
        ['줌 단추', () => page.locator('.wb-shell-zoom-step').first().focus()],
      ] as const) {
        await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
        await focus()
        await page.keyboard.press('ArrowDown')
        await sleep(100)
        controls[name] = await selected(page)
      }
      // Delete — 첫 위젯(갈래 탭)에서 친 것이 «글 2»를 지우고 선택을 비운다. 이어 친 나머지는 지울 것이 없다(끝의 서버 값이 잰다).
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      for (const [, focus] of widgets) {
        await focus()
        await page.keyboard.press('Delete')
      }
      await sleep(300)
      const orientations = await page.locator('[role="separator"]').evaluateAll((all) => all.map((element) => element.getAttribute('aria-orientation')))
      // ↑ ↓ ← → 차례.
      const rowAxis = ['n_text0000001', 'n_text0000003', 'n_text0000002', 'n_text0000002']
      const columnAxis = ['n_text0000002', 'n_text0000002', 'n_card0000001', 'n_text0000002']
      expect({ orientations, moved, controls, server: await server(P) }).toEqual({
        orientations: ['horizontal', 'vertical', 'horizontal', 'vertical'],
        moved: { '갈래 탭': rowAxis, '우측 패널 탭': rowAxis, '손잡이 0': columnAxis, '손잡이 1': rowAxis, '손잡이 2': columnAxis, '손잡이 3': rowAxis },
        controls: { '트리 줄': 'n_text0000003', '줌 단추': 'n_text0000003' },
        server: { order: ['n_card0000001', 'n_text0000001', 'n_text0000003', 'n_text0000004', 'n_text0000005', 'n_btn00000001'], headSeq: 2 },
      })
    } finally {
      await close()
    }
  })

  it('L2 · L3 열린 팝오버 · 고르개 안의 Escape 는 선택을 안 푼다(고르개는 닫는다) — 고르개가 선 채 트리 줄의 Escape 는 고르개도 걷는다', async () => {
    const { P, rootId } = await fixture(stack, alice, 'l2-l3', CARD_PAGE())
    const { page, close } = await open(P)
    try {
      // L2 — 항목이 전부 꺼진 «Page 더 보기»: 포커스가 토글에 남는다. 뿌리의 `…` 는 «별칭 바꾸기»가 켜져 있어, 뿌리를 고른 채 남(bob)이
      // 자손 하나를 쥐게 해 전부 끈다(뿌리는 모든 노드의 조상이라 판정이 다 꺼진다 — `lock/toolbar-abilities.test.tsx` 와 같은 판).
      await row(page, rootId).click()
      const projectId = P.split('/')[2]!
      const member = await stack.request(alice, 'POST', `/projects/${projectId}/members`, { email: stack.users.bob.email, role: 'editor' })
      if (member.status >= 300) throw new Error(`member ${member.status}`)
      const bob = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
      await bob.page.goto(P)
      await canvasFrame(bob.page).locator('[data-wb-id]').first().waitFor()
      await row(bob.page, 'n_text0000002').click()
      await page.locator('[data-tree-id="n_text0000002"] ~ .wb-shell-structure-lock').waitFor()
      await page.getByRole('button', { name: 'Page 더 보기', exact: true }).click()
      const l2Focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
      await page.keyboard.press('Escape')
      await sleep(150)
      const l2 = { focus: l2Focus, menus: await page.locator('[role="menu"]').count(), selected: await selected(page) }
      // bob 이 나가면 잠금이 풀린다 — 아래 L3 이 그 노드를 고른다.
      await bob.context.close()
      await page.locator('[data-tree-id="n_text0000002"] ~ .wb-shell-structure-lock').waitFor({ state: 'detached' })

      // L3 — 타입 고르개의 «취소»에 포커스. 고르개 안의 Escape 는 고르개를 닫는다(`cancelAdd`) — 선택은 그대로다.
      const openPicker = async () => {
        await row(page, 'n_text0000002').click()
        await rowMenu(page, 'n_text0000002', 0).click()
        await page.getByRole('menuitem', { name: '아래 추가', exact: true }).click()
        await page.locator('.wb-shell-picker').waitFor()
      }
      await openPicker()
      await page.locator('.wb-shell-picker button').last().focus()
      await page.keyboard.press('Escape')
      await sleep(150)
      const l3 = { selected: await selected(page), picker: await page.locator('.wb-shell-picker').count() }

      // 트리 줄은 단축키가 서는 자리다 — Escape 가 선택을 풀고, 고르개(`adding`)도 함께 걷혀 다음 선택에 다시 서지 않는다. 다시 여는 «아래 추가»는
      // 앞 누름과 같은 자리라 더블클릭 간격을 넘겨 누른다(`shell/action-menu.tsx` 의 `DOUBLE_CLICK_MS` — 둘째 누름으로 보고 삼킨다).
      await sleep(600)
      await openPicker()
      await row(page, 'n_text0000002').focus()
      await page.keyboard.press('Escape')
      await sleep(150)
      const fromRow = { selected: await selected(page), picker: await page.locator('.wb-shell-picker').count() }
      await row(page, 'n_text0000004').click()
      await sleep(150)
      const reselect = { selected: await selected(page), picker: await page.locator('.wb-shell-picker').count() }

      expect({ l2, l3, fromRow, reselect }).toEqual({
        l2: { focus: 'Page 더 보기', menus: 0, selected: rootId },
        l3: { selected: 'n_text0000002', picker: 0 },
        fromRow: { selected: null, picker: 0 },
        reselect: { selected: 'n_text0000004', picker: 0 },
      })
    } finally {
      await close()
    }
  })

  /**
   * 닫힌 shadow root 안의 입력은 이벤트 대상이 호스트(`div`)로 리타게팅되고 그 `shadowRoot` 가 `null` 이라 `isTypingSurface` 가 못 본다.
   * 캔버스 문서에서는 대상이 `body` · 글을 안 받는 기본 컨트롤일 때만 단축키가 선다. 대조: 캔버스의 Button 노드를 눌러 포커스가 `BUTTON` 이면 Delete 가 선다.
   */
  it('L1 캔버스의 닫힌 shadow 입력에서 친 Backspace · ? 는 그 칸의 것이다 — Button 노드에 포커스면 Delete 가 선다', async () => {
    const { P } = await fixture(stack, alice, 'l1', CARD_PAGE())
    const { page, close } = await open(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      await page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
        const doc = frame.contentDocument!
        const host = doc.createElement('div')
        host.id = 'closed-host'
        const root = host.attachShadow({ mode: 'closed' })
        const input = doc.createElement('input')
        root.appendChild(input)
        doc.body.appendChild(host)
        ;(frame.contentWindow as unknown as { __closedInput: HTMLInputElement }).__closedInput = input
        input.focus()
      })
      const value = () =>
        page.evaluate(() => {
          const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
          return (frame.contentWindow as unknown as { __closedInput: HTMLInputElement }).__closedInput.value
        })
      await page.keyboard.type('xy')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Shift+Slash')
      await sleep(200)
      const typed = { value: await value(), dialogs: await page.locator('dialog[open]').count(), server: (await server(P)).headSeq }

      await canvasFrame(page).locator('[data-wb-id="n_btn00000001"]').click()
      const focus = await page.evaluate(() => document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!.contentDocument!.activeElement?.tagName)
      await page.keyboard.press('Delete')
      const deleted = await poll('Button 노드의 Delete 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 2)

      expect({ typed, focus, deleted: deleted.order.includes('n_btn00000001') }).toEqual({
        typed: { value: 'x?', dialogs: 0, server: 1 },
        focus: 'BUTTON',
        deleted: false,
      })
    } finally {
      await close()
    }
  })

  /**
   * 페이지 대상이 든 봉투는 붙이기 전에 페이지 목록(`GET …/tree`)을 읽는다 — 그 조회를 1.5s 붙잡고 그 사이 떠난다. 판 카나리아: 붙잡은 조회 수 1.
   */
  it('L4 붙이는 사이 페이지를 떠났으면 붙이지 않고 한 줄로 말한다 — 떠나 머묾 · 떠났다 돌아옴', async () => {
    const results: unknown[] = []
    for (const variant of ['stay', 'return'] as const) {
      const button = B('n_btngo000001', '가기', { interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:메뉴/둘째' }] }] })
      const { P, P2 } = await fixture(stack, alice, `l4-${variant}`, [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), button])
      const { page, close } = await open(P)
      try {
        let held = 0
        await canvasFrame(page).locator('[data-wb-id="n_btngo000001"]').click()
        await page.keyboard.press('ControlOrMeta+c')
        await page.route(/\/api\/projects\/[^/]+\/tree$/, async (route) => {
          held += 1
          await sleep(1_500)
          await route.continue()
        })
        await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').click()
        await page.keyboard.press('ControlOrMeta+v')
        await sleep(100)
        await page.locator('.wb-shell-tree-page', { hasText: '둘째' }).click()
        await sleep(300)
        if (variant === 'return') {
          await page.locator('.wb-shell-tree-page', { hasText: '첫째' }).click()
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
        }
        await sleep(2_000)
        results.push({
          variant,
          held,
          first: (await settled(P)).headSeq,
          second: (await settled(P2)).headSeq,
          alerts: await page.locator('.wb-shell-edit-alert').allTextContents(),
        })
      } finally {
        await close()
      }
    }
    expect(results).toEqual([
      { variant: 'stay', held: 1, first: 1, second: 0, alerts: [expect.stringContaining('붙이는 사이 페이지를 옮겨')] },
      { variant: 'return', held: 1, first: 1, second: 0, alerts: [expect.stringContaining('붙이는 사이 페이지를 옮겨')] },
    ])
  })

  it('L5 화살표로 옮긴 선택을 캔버스 · 구조 트리에서 보이게 굴린다', async () => {
    const many = Array.from({ length: 45 }, (_, i) => T(`n_long${String(i).padStart(7, '0')}`, `긴 글 ${i} — 굴림을 만든다 `.repeat(3)))
    const { P } = await fixture(stack, alice, 'l5', many)
    const { page, close } = await open(P, { width: 1280, height: 700 })
    try {
      /** 그 노드가 칸(캔버스 · 트리의 굴리는 조상) 안에 다 보이는가. */
      const visible = (id: string) =>
        page.evaluate((nodeId) => {
          const scroller = (element: Element): Element => {
            for (let at = element.parentElement; at !== null; at = at.parentElement) {
              const style = getComputedStyle(at)
              if (/(auto|scroll)/.test(style.overflowY) && at.scrollHeight > at.clientHeight) return at
            }
            return document.documentElement
          }
          const inside = (rect: DOMRect, box: DOMRect) => rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1
          const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
          const node = frame.contentDocument!.querySelector(`[data-wb-id="${nodeId}"]`)!
          const frameRect = frame.getBoundingClientRect()
          const nodeRect = node.getBoundingClientRect()
          const onHost = new DOMRect(frameRect.left + nodeRect.left, frameRect.top + nodeRect.top, nodeRect.width, nodeRect.height)
          const treeRow = document.querySelector(`[data-tree-id="${nodeId}"]`)!
          return {
            canvas: inside(onHost, scroller(frame).getBoundingClientRect()),
            tree: inside(treeRow.getBoundingClientRect(), scroller(treeRow).getBoundingClientRect()),
          }
        }, id)
      const target = 'n_long0000020'
      const results: unknown[] = []
      for (const where of ['canvas', 'tree'] as const) {
        await page.evaluate(() => {
          for (const element of document.querySelectorAll('*')) element.scrollTop = 0
        })
        if (where === 'canvas') await canvasFrame(page).locator('[data-wb-id="n_long0000003"]').click()
        else await row(page, 'n_long0000003').click()
        // 판 카나리아 — 옮겨 갈 노드가 처음에는 캔버스 · 트리 칸 밖이다.
        const before = await visible(target)
        for (let i = 0; i < 17; i += 1) await page.keyboard.press('ArrowDown')
        await sleep(300)
        results.push({ where, before, selected: await selected(page), after: await visible(target) })
      }
      expect(results).toEqual([
        { where: 'canvas', before: { canvas: false, tree: false }, selected: target, after: { canvas: true, tree: true } },
        { where: 'tree', before: { canvas: false, tree: false }, selected: target, after: { canvas: true, tree: true } },
      ])
    } finally {
      await close()
    }
  })

  /**
   * Cmd+A 는 «기준 노드의 형제 모두»다(설계서 「설계서 화면 구조」의 «선택 — 고르는 법») — 브라우저의 «전부 고르기»를 막고(캔버스 글자가
   * 안 골라진다) 카드 안 글 셋을 고른다. 기준 노드는 그대로다.
   */
  it('L6 Cmd+A 는 형제 모두 고르기다 — 브라우저의 «전부 고르기»를 막고 캔버스 글자가 안 골라진다', async () => {
    const { P } = await fixture(stack, alice, 'l6', CARD_PAGE())
    const { page, close } = await open(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      await page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
        const box = window as unknown as { __prevented: boolean | null }
        box.__prevented = null
        frame.contentWindow!.addEventListener('keydown', (event) => {
          if (event.key === 'a') box.__prevented = event.defaultPrevented
        })
      })
      await page.keyboard.press('ControlOrMeta+a')
      await sleep(100)
      const picked = await page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
        return {
          prevented: (window as unknown as { __prevented: boolean | null }).__prevented,
          canvasText: (frame.contentWindow!.getSelection()?.toString() ?? '').length > 0,
        }
      })
      const members = await page.evaluate(() => [...document.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id')).sort())
      expect({ ...picked, selected: await selected(page), members }).toEqual({
        prevented: true,
        canvasText: false,
        selected: 'n_text0000002',
        members: ['n_text0000001', 'n_text0000003'],
      })
    } finally {
      await close()
    }
  })
})

/** 노드를 뿌리 자식으로 넣은 «첫째»와 빈 «둘째»(메뉴 «메뉴» 아래). */
async function fixture(
  stack: EditorStack,
  owner: Session,
  slug: string,
  nodes: unknown[],
): Promise<{ P: string; P2: string; rootId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'E1 리뷰 대응', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P = `/projects/${project.id}/pages/${first.id}`
  const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  const page = await call('GET', P)
  return { P, P2: `/projects/${project.id}/pages/${second.id}`, rootId: page.body.schema.root.id }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
