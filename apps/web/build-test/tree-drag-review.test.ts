/**
 * **C2 리뷰가 실브라우저로 잰 트리 끌기 · 줄 행동의 판**(`docs/superpowers/plans/2026-09-30-c2-review.md` 항목 2 ~ 5). `./tree-drag.test.ts`
 * 가 구현 트랙의 판이고, 여기는 그 판 밖의 입력(트리 밖에 놓음 · 끄는 중 남의 편집 · 창을 잃음 · 다른 단추 · 둘째 포인터) · 부모를
 * 바꾸며 놓은 차례 · 줄 행동의 서는 조건 · 두 번 누르기 확인 · 되돌리기다.
 *
 * 발견 2 · 3 · 4 의 판은 옳은 값으로 단언한다. 발견 4(두 사람이 같은 부모를 번갈아 끈다)는 메뉴 트리가 남의 변경을 받아(`menu-changed` —
 * `src/tree/use-tree-commands.tsx`의 `remoteRev`) 둘째 사람이 새 차례에서 자리를 센다 — 끄는 동안 신호가 와도 놓는 순간의 판정은 새 트리로 한다.
 *
 * 구조 편집은 WS 프레임(`patch`)으로 나가므로 보낸 프레임을 세고(`patches`), 메뉴 · 페이지 쓰기는 HTTP 요청을 센다(`writes`).
 */
import type { CDPSession, Page, Request } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface TreeNode {
  id: string
  title: string
  sortOrder: number
  pages: { id: string; title: string; sortOrder: number }[]
  children: TreeNode[]
}

type Tab = { page: Page; close: () => Promise<void>; writes: string[]; patches: string[] }

describe.skipIf(!전제.ok)('트리 끌기 · 줄 행동 — C2 리뷰(실브라우저)', () => {
  let stack: EditorStack
  let alice: Session
  let bob: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    bob = await stack.login(stack.users.bob)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /**
   * ```
   * 가   pages: 가1 가2
   * ├ 가-하위
   * └ 가-하위2
   * 나   pages: 나1 나2 나3
   * 다
   * ```
   * 첫 페이지(가1)를 연다. `bob`은 `role`로 넣는다(없으면 안 넣는다).
   */
  async function menuFixture(slug: string, role?: 'editor' | 'viewer') {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'C2 리뷰', slug: `${slug}-${Date.now().toString(36)}` })).body
    const ids: Record<string, string> = {}
    const menu = async (title: string, parentId: string | null = null): Promise<void> => {
      ids[title] = (await call('POST', `/projects/${project.id}/menu`, { parentId, title })).body.id
    }
    const page = async (title: string, menuTitle: string): Promise<void> => {
      ids[title] = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: ids[menuTitle], title })).body.id
    }
    await menu('가')
    await menu('나')
    await menu('다')
    await menu('가-하위', ids['가'])
    await menu('가-하위2', ids['가'])
    await page('가1', '가')
    await page('가2', '가')
    await page('나1', '나')
    await page('나2', '나')
    await page('나3', '나')
    if (role !== undefined) {
      const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role })
      if (member.status >= 300) throw new Error(`member ${member.status}`)
    }
    const P = `/projects/${project.id}/pages/${ids['가1']}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { projectId: project.id as string, P, ids }
  }

  async function serverTree(projectId: string): Promise<TreeNode[]> {
    return (await stack.request(alice, 'GET', `/projects/${projectId}/tree`)).body.menu as TreeNode[]
  }

  function titles(items: readonly { title: string; sortOrder: number }[]): string[] {
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.title)
  }

  function find(menu: TreeNode[], title: string): TreeNode | undefined {
    for (const node of menu) {
      if (node.title === title) return node
      const inner = find(node.children, title)
      if (inner !== undefined) return inner
    }
    return undefined
  }

  async function openEditor(P: string, user: 'alice' | 'bob' = 'alice', viewport = { width: 1440, height: 900 }): Promise<Tab> {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const writes: string[] = []
    const patches: string[] = []
    page.on('request', (request: Request) => {
      if (request.method() !== 'GET' && /\/api\/projects\/[^/]+\/(menu|pages)\//.test(request.url())) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
      }
    })
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close(), writes, patches }
  }

  function row(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  async function spot(page: Page, id: string, zone: 'top' | 'middle' | 'bottom'): Promise<{ x: number; y: number }> {
    const box = (await row(page, id).boundingBox())!
    const y = zone === 'top' ? box.y + 3 : zone === 'middle' ? box.y + box.height / 2 : box.y + box.height - 3
    return { x: box.x + 40, y }
  }

  async function grab(page: Page, id: string): Promise<void> {
    const at = await spot(page, id, 'middle')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 2, at.y + 8, { steps: 3 })
  }

  async function dropAt(page: Page, at: { x: number; y: number }): Promise<void> {
    await page.mouse.move(at.x, at.y, { steps: 6 })
    await page.mouse.up()
  }

  const counts = async (page: Page) => ({
    lifted: await page.locator('.wb-shell-tree-row-dragging').count(),
    hint: await page.locator('.wb-shell-drop-indicator').count(),
  })

  /** 구조 판 — `./tree-drag.test.ts`의 `structureFixture`와 같은 문서. `bob`은 editor. */
  async function structureFixture(slug: string) {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'C2 리뷰 구조', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '가1' })).body.id
    const other = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '가2' })).body.id
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const P = `/projects/${project.id}/pages/${pageId}`
    const Q = `/projects/${project.id}/pages/${other}`
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
    const seededQ = await call('PATCH', `${Q}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: { id: 'n_qtxt0000001', type: 'Text', props: { content: '둘째' } } },
        { op: 'add', path: '/root/children/1', value: { id: 'n_qcrd0000001', type: 'Card', children: [] } },
      ],
    })
    if (seededQ.status >= 300) throw new Error(`seed Q ${seededQ.status}`)
    return { projectId: project.id as string, pageId: pageId as string, P, Q }
  }

  async function serverShape(P: string): Promise<unknown> {
    const shape = (node: { type: string; children?: unknown[] }): unknown =>
      Array.isArray(node.children) && node.children.length > 0
        ? { [node.type]: node.children.map((child) => shape(child as never)) }
        : node.type
    return shape((await stack.request(alice, 'GET', P)).body.schema.root)
  }

  const ORIGINAL = { Page: ['Text', { Card: ['Text'] }, 'Divider'] }

  function nodeRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  async function nodeSpot(page: Page, id: string, zone: 'top' | 'middle' | 'bottom'): Promise<{ x: number; y: number }> {
    const box = (await nodeRow(page, id).boundingBox())!
    const y = zone === 'top' ? box.y + 3 : zone === 'middle' ? box.y + box.height / 2 : box.y + box.height - 3
    return { x: box.x + 30, y }
  }

  async function grabNode(page: Page, id: string): Promise<void> {
    const at = await nodeSpot(page, id, 'middle')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 2, at.y + 8, { steps: 3 })
  }

  // ── 항목 2 — 끌기의 입력 ─────────────────────────────────────────────────────────────────────────────

  it('트리 밖(우측 패널 · 하단 바)에서 놓으면 요청이 없고 표시가 걷힌다', async () => {
    const { P, ids } = await menuFixture('outside')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      const panel = (await page.locator('aside[aria-label="우측 패널"]').boundingBox())!
      const footer = (await page.locator('footer[aria-label="하단 바"]').boundingBox())!
      await grab(page, ids['나1']!)
      await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2, { steps: 10 })
      const overPanel = await counts(page)
      await page.mouse.up()
      const afterPanel = await counts(page)
      await grab(page, ids['나2']!)
      await page.mouse.move(footer.x + 40, footer.y + footer.height / 2, { steps: 10 })
      const overFooter = await counts(page)
      await page.mouse.up()
      const afterFooter = await counts(page)
      await page.waitForTimeout(400)

      expect({ overPanel, afterPanel, overFooter, afterFooter, writes: tab.writes }).toEqual({
        overPanel: { lifted: 1, hint: 0 },
        afterPanel: { lifted: 0, hint: 0 },
        overFooter: { lifted: 1, hint: 0 },
        afterFooter: { lifted: 0, hint: 0 },
        writes: [],
      })
    } finally {
      await tab.close()
    }
  })

  it('구조: 끄는 중 남이 그 노드를 지우면 놓아도 편집이 없고 표시가 걷힌다', async () => {
    const { P } = await structureFixture('gone')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await grabNode(page, 'n_divi0000001')
      const over = await nodeSpot(page, 'n_card0000001', 'middle')
      await page.mouse.move(over.x, over.y, { steps: 6 })
      const before = await counts(page)
      const head = (await stack.request(alice, 'GET', P)).body.headSeq as number
      const removed = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: head, ops: [{ op: 'remove', path: '/root/children/2' }] })
      // 그 노드의 줄이 사라질 때까지(프레임이 닿았다).
      await nodeRow(page, 'n_divi0000001').waitFor({ state: 'detached' })
      await page.mouse.move(over.x, over.y + 1, { steps: 2 })
      const afterFrame = await counts(page)
      await page.mouse.up()
      await page.waitForTimeout(400)

      expect({ removed: removed.status, before, afterFrame, after: await counts(page), sent: tab.patches.length }).toEqual({
        removed: 200,
        before: { lifted: 1, hint: 1 },
        afterFrame: { lifted: 0, hint: 0 },
        after: { lifted: 0, hint: 0 },
        sent: 0,
      })
      expect(await serverShape(P)).toEqual({ Page: ['Text', { Card: ['Text'] }] })
    } finally {
      await tab.close()
    }
  })

  it('구조: 끄는 중 남이 놓을 컨테이너를 잡으면 포인터가 멈춰 있어도 표시가 곧바로 걷히고 놓아도 편집이 없다', async () => {
    const { P } = await structureFixture('locked-mid')
    const bobTab = await openEditor(P, 'bob')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await grabNode(page, 'n_divi0000001')
      const over = await nodeSpot(page, 'n_card0000001', 'middle')
      await page.mouse.move(over.x, over.y, { steps: 6 })
      const before = await counts(page)
      await bobTab.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('button', { name: 'Card', exact: true }).click()
      await page.locator('.wb-shell-structure-lock').waitFor()
      // 포인터가 멈춰 있는 동안 — 잠금이 오면 트리가 표시를 다시 물어(`refresh`) 못 놓는 자리라 걷는다.
      const stillBeforeMove = await counts(page)
      await page.mouse.move(over.x, over.y + 1, { steps: 2 })
      const afterMove = await counts(page)
      await page.mouse.up()
      await page.waitForTimeout(400)

      expect({ before, stillBeforeMove, afterMove, sent: tab.patches.length, shape: await serverShape(P) }).toEqual({
        before: { lifted: 1, hint: 1 },
        stillBeforeMove: { lifted: 1, hint: 0 },
        afterMove: { lifted: 1, hint: 0 },
        sent: 0,
        shape: ORIGINAL,
      })
    } finally {
      await tab.close()
      await bobTab.close()
    }
  })

  /**
   * 끄는 중 남이 그 페이지를 지운다. 메뉴 트리는 남의 변경을 받으므로(`menu-changed`) 끈 줄이 트리에서 빠지고, 놓아도 요청이 안 나간다 —
   * 놓는 판정이 지금 트리로 끈 것을 못 찾는다(`use-tree-commands.tsx`의 `dropTo`). 끄는 표시도 남지 않는다. 남의 변경을 받지 않으면 줄이
   * 남고 지워진 페이지에 요청 하나가 나가 404 · 트리 칸이 실패를 말한다.
   */
  it('메뉴: 끄는 중 남이 그 페이지를 지우면 — 줄이 빠지고 놓아도 요청이 없다', async () => {
    const { projectId, P, ids } = await menuFixture('page-gone', 'editor')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await page.waitForTimeout(300)
      await grab(page, ids['나1']!)
      const target = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const removed = await stack.request(bob, 'DELETE', `/projects/${projectId}/pages/${ids['나1']}`)
      const gone = await row(page, ids['나1']!)
        .waitFor({ state: 'detached', timeout: 2_000 })
        .then(() => true)
        .catch(() => false)
      await page.mouse.move(target.x, target.y + 1, { steps: 2 })
      await page.mouse.up()
      await page.waitForTimeout(500)
      const said = await page.locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] [role="alert"]').allInnerTexts()
      const tree = await serverTree(projectId)

      expect({
        removed: removed.status,
        gone,
        writes: tab.writes.length,
        said,
        lifted: await page.locator('.wb-shell-tree-row-dragging').count(),
        가: titles(find(tree, '가')!.pages),
      }).toEqual({ removed: 204, gone: true, writes: 0, said: [], lifted: 0, 가: ['가1', '가2'] })
    } finally {
      await tab.close()
    }
  })

  it('구조: 끄는 중 뒤로 가기로 다른 페이지가 열리면 놓아도 편집이 없고 표시가 걷힌다', async () => {
    const { P, Q } = await structureFixture('nav-mid')
    const tab = await openEditor(Q)
    try {
      const { page } = tab
      // Q → P 로 옮겨 뒤로 가기에 Q 를 둔다.
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_card0000001"]').waitFor()
      await nodeRow(page, 'n_divi0000001').waitFor({ state: 'attached' })
      await grabNode(page, 'n_text0000001')
      await page.mouse.move((await nodeSpot(page, 'n_card0000001', 'middle')).x, (await nodeSpot(page, 'n_card0000001', 'middle')).y, {
        steps: 6,
      })
      const before = await counts(page)
      await page.goBack()
      await canvasFrame(page).locator('[data-wb-id="n_qcrd0000001"]').waitFor()
      const card = await nodeSpot(page, 'n_qcrd0000001', 'middle')
      await page.mouse.move(card.x, card.y, { steps: 6 })
      const afterNav = await counts(page)
      await page.mouse.up()
      await page.waitForTimeout(400)

      expect({ before, afterNav, sent: tab.patches.length, P: await serverShape(P), Q: await serverShape(Q) }).toEqual({
        before: { lifted: 1, hint: 1 },
        afterNav: { lifted: 0, hint: 0 },
        sent: 0,
        P: ORIGINAL,
        Q: { Page: ['Text', 'Card'] },
      })
    } finally {
      await tab.close()
    }
  })

  it('메뉴: 끄는 중 단축키(Alt+↓)로 고른 줄을 옮겨도 놓은 결과는 요청 하나다', async () => {
    const { projectId, P, ids } = await menuFixture('shortcut-mid')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      // 가1(열린 페이지 · 고른 줄)을 끈다 — 누르면 줄 단추에 포커스가 간다.
      await grab(page, ids['가1']!)
      const focused = await page.evaluate(() => document.activeElement?.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? null)
      await page.keyboard.press('Alt+ArrowDown')
      await page.waitForTimeout(600)
      const midWrites = [...tab.writes]
      await dropAt(page, await spot(page, ids['나2']!, 'top'))
      const tree = await poll(
        '서버 트리',
        () => serverTree(projectId),
        (menu) => find(menu, '나')!.pages.length === 4,
        5_000,
      ).catch(async () => serverTree(projectId))

      expect({
        focused,
        midWrites: midWrites.length,
        writes: tab.writes.length,
        가: titles(find(tree, '가')!.pages),
        나: titles(find(tree, '나')!.pages),
      }).toEqual({ focused: ids['가1'], midWrites: 1, writes: 2, 가: ['가2'], 나: ['나1', '가1', '나2', '나3'] })
    } finally {
      await tab.close()
    }
  })

  it('`pointercancel` 이 오면 표시가 걷히고 뒤의 뗌이 아무것도 안 한다', async () => {
    const { P, ids } = await menuFixture('cancel')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await grab(page, ids['나1']!)
      const target = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const before = await counts(page)
      // 실제 취소는 브라우저가 낸다(기본 DnD · 터치 팬 · 기기 분리) — 마우스로는 못 낸다. 같은 이벤트를 창에 낸다.
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })))
      const afterCancel = await counts(page)
      await page.mouse.up()
      await page.waitForTimeout(400)
      expect({ before, afterCancel, writes: tab.writes }).toEqual({
        before: { lifted: 1, hint: 1 },
        afterCancel: { lifted: 0, hint: 0 },
        writes: [],
      })
    } finally {
      await tab.close()
    }
  })

  it('창이 초점을 잃어도(`blur`) 끌기가 남는지 — 값을 적는다', async () => {
    const { projectId, P, ids } = await menuFixture('blur')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await grab(page, ids['나1']!)
      const target = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const before = await counts(page)
      // 헤드리스 Chrome 에서는 다른 탭을 앞으로 해도 `document.hasFocus()`가 참이다(잰 값) — 창을 잃는 것을 못 낸다. 창이 받는 이벤트를
      // 그대로 낸다(`blur`). 끌기 장치는 `blur`를 안 듣는다(`use-pointer-drag.ts`) — 적는 값은 그 결과다.
      const other = await page.context().newPage()
      await other.bringToFront()
      const blurred = await page.evaluate(() => document.hasFocus())
      await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')))
      const afterBlur = await counts(page)
      await page.bringToFront()
      await page.mouse.up()
      await page.waitForTimeout(600)
      const tree = await serverTree(projectId)
      await other.close()
      expect({ before, blurred, afterBlur, writes: tab.writes.length, 가: titles(find(tree, '가')!.pages) }).toEqual({
        before: { lifted: 1, hint: 1 },
        blurred: true,
        afterBlur: { lifted: 1, hint: 1 },
        writes: 1,
        가: ['가1', '가2', '나1'],
      })
    } finally {
      await tab.close()
    }
  })

  it('오른쪽 단추로는 끌리지 않고, 끄는 중 오른쪽 단추를 눌렀다 떼도 끌기는 그대로 한 번 놓인다', async () => {
    const { projectId, P, ids } = await menuFixture('right-button')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      const at = await spot(page, ids['나1']!, 'middle')
      await page.mouse.move(at.x, at.y)
      await page.mouse.down({ button: 'right' })
      await page.mouse.move(at.x + 2, at.y + 30, { steps: 5 })
      const rightDrag = await counts(page)
      await page.mouse.up({ button: 'right' })
      await page.keyboard.press('Escape')

      await grab(page, ids['나1']!)
      const target = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      await page.mouse.down({ button: 'right' })
      await page.mouse.up({ button: 'right' })
      const afterRight = await counts(page)
      const menuOpen = await page.locator('[role="menu"]').count()
      await page.mouse.move(target.x, target.y + 1)
      await page.mouse.up()
      await page.waitForTimeout(600)
      const tree = await serverTree(projectId)

      expect({ rightDrag, afterRight, menuOpen, writes: tab.writes.length, 가: titles(find(tree, '가')!.pages) }).toEqual({
        rightDrag: { lifted: 0, hint: 0 },
        afterRight: { lifted: 1, hint: 1 },
        menuOpen: 0,
        writes: 1,
        가: ['가1', '가2', '나1'],
      })
    } finally {
      await tab.close()
    }
  })

  it('둘째 포인터의 뗌(합성 이벤트)은 첫 포인터의 끌기를 놓지 않는다 — 아래 터치 판의 가장 작은 꼴', async () => {
    const { projectId, P, ids } = await menuFixture('second-pointer')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await grab(page, ids['나1']!)
      const target = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const before = await counts(page)
      // 둘째 손가락 · 펜이 다른 자리(트리 밖)에서 떨어진다 — 끄는 첫 포인터(마우스)는 아직 누른 채다.
      await page.evaluate(
        ({ x, y }) => {
          window.dispatchEvent(
            new PointerEvent('pointerup', { pointerId: 77, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }),
          )
        },
        { x: target.x, y: target.y },
      )
      await page.waitForTimeout(600)
      const afterSecond = { ...(await counts(page)), writes: tab.writes.length }
      await page.mouse.up()
      await page.waitForTimeout(400)
      const tree = await serverTree(projectId)

      expect({ before, afterSecond, 가: titles(find(tree, '가')!.pages) }).toEqual({
        before: { lifted: 1, hint: 1 },
        afterSecond: { lifted: 1, hint: 1, writes: 0 },
        가: ['가1', '가2', '나1'],
      })
    } finally {
      await tab.close()
    }
  })

  /** 창에 오는 포인터 이벤트를 적는 자 — `pointermove`는 이어진 같은 줄을 하나로 친다. */
  async function recordPointers(page: Page): Promise<() => Promise<string[]>> {
    await page.evaluate(() => {
      const log: string[] = []
      ;(window as unknown as { __log: string[] }).__log = log
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
        window.addEventListener(
          type,
          (event) => {
            const e = event as PointerEvent
            const line = `${type}:${e.pointerType}`
            if (log[log.length - 1] !== line) log.push(line)
          },
          true,
        )
      }
    })
    return () => page.evaluate(() => (window as unknown as { __log: string[] }).__log)
  }

  it('터치로 길게 누르지 않고 움직이면 끌기가 서지 않는다 — 브라우저가 팬으로 가져가 `pointercancel`(값)', async () => {
    const { projectId, P, ids } = await menuFixture('touch-one')
    const tab = await openEditor(P)
    const cdp: CDPSession = await tab.page.context().newCDPSession(tab.page)
    try {
      const { page } = tab
      const events = await recordPointers(page)
      const a = await spot(page, ids['나1']!, 'middle')
      const target = await spot(page, ids['가']!, 'middle')
      const touch = (type: string, points: { x: number; y: number }[]) =>
        cdp.send('Input.dispatchTouchEvent', { type: type as never, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: 1 })) })
      await touch('touchStart', [a])
      for (let i = 1; i <= 8; i += 1) await touch('touchMove', [{ x: a.x, y: a.y + (target.y - a.y) * (i / 8) }])
      const during = await counts(page)
      await touch('touchEnd', [])
      await page.waitForTimeout(400)

      expect({ during, events: await events(), writes: tab.writes, 가: titles(find(await serverTree(projectId), '가')!.pages) }).toEqual({
        during: { lifted: 0, hint: 0 },
        events: ['pointerdown:touch', 'pointermove:touch', 'pointercancel:touch'],
        writes: [],
        가: ['가1', '가2'],
      })
    } finally {
      await cdp.detach().catch(() => undefined)
      await tab.close()
    }
  })

  /**
   * 끌기 장치가 `pointerId`를 안 가르면 끄는 포인터가 아닌 다른 포인터의 뗌이 그 끌기를 그 자리에 놓는다(리뷰 발견 2) — 터치 화면이
   * 달린 기계에서 마우스로 끄는 중 화면을 한 번 톡 치면 된다(CDP 의 진짜 터치 이벤트로 낸다). 끌기 장치는 시작한 포인터의 이벤트만
   * 듣는다(`use-pointer-drag.ts` «시작한 포인터만 듣는다»).
   */
  it('마우스로 끄는 중 다른 자리를 터치로 한 번 쳐도 끌기가 그 자리에 놓이지 않는다', async () => {
    const { projectId, P, ids } = await menuFixture('touch-tap')
    const tab = await openEditor(P)
    const cdp: CDPSession = await tab.page.context().newCDPSession(tab.page)
    try {
      const { page } = tab
      const events = await recordPointers(page)
      await grab(page, ids['나1']!)
      const target = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const before = await counts(page)
      // 마우스는 가 위에서 누른 채 — 터치는 다 위를 친다.
      const tap = await spot(page, ids['다']!, 'middle')
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tap.x, y: tap.y, id: 5 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(600)
      const afterTap = { ...(await counts(page)), writes: tab.writes.length }
      await page.mouse.up()
      await page.waitForTimeout(400)
      const tree = await serverTree(projectId)
      const seen = await events()

      expect(seen).toContain('pointerup:touch')
      expect({ before, afterTap, 가: titles(find(tree, '가')!.pages), 다: titles(find(tree, '다')!.pages) }).toEqual({
        before: { lifted: 1, hint: 1 },
        afterTap: { lifted: 1, hint: 1, writes: 0 },
        가: ['가1', '가2', '나1'],
        다: [],
      })
    } finally {
      await cdp.detach().catch(() => undefined)
      await tab.close()
    }
  })

  // ── 항목 3 — 메뉴 트리의 순서 ────────────────────────────────────────────────────────────────────────

  it('페이지를 다른 메뉴로 — 첫 · 가운데 · 끝 · 메뉴 줄 위에 놓은 자리가 서버에서 그 차례다', async () => {
    const cases: Array<[string, 'top' | 'bottom' | 'middle', string[]]> = [
      ['나1', 'top', ['가2', '나1', '나2', '나3']],
      ['나2', 'top', ['나1', '가2', '나2', '나3']],
      ['나3', 'bottom', ['나1', '나2', '나3', '가2']],
      ['나', 'middle', ['나1', '나2', '나3', '가2']],
    ]
    const got: string[][] = []
    for (const [n, [over, zone]] of cases.entries()) {
      const { projectId, P, ids } = await menuFixture(`page-order-${n}`)
      const tab = await openEditor(P)
      try {
        await grab(tab.page, ids['가2']!)
        await dropAt(tab.page, await spot(tab.page, ids[over]!, zone))
        const tree = await poll(
          '서버 트리',
          () => serverTree(projectId),
          (menu) => find(menu, '나')!.pages.length === 4,
          5_000,
        )
        got.push(titles(find(tree, '나')!.pages))
      } finally {
        await tab.close()
      }
    }
    expect(got).toEqual(cases.map(([, , want]) => want))
  })

  it('메뉴 최상위 → 하위(첫 · 가운데 · 끝) · 하위 → 최상위(첫 · 가운데 · 끝)가 서버에서 그 차례다', async () => {
    const down: Array<[string, 'top' | 'bottom', string[]]> = [
      ['가-하위', 'top', ['다', '가-하위', '가-하위2']],
      ['가-하위2', 'top', ['가-하위', '다', '가-하위2']],
      ['가-하위2', 'bottom', ['가-하위', '가-하위2', '다']],
    ]
    const up: Array<[string, 'top' | 'bottom', string[]]> = [
      ['가', 'top', ['가-하위', '가', '나', '다']],
      ['나', 'top', ['가', '가-하위', '나', '다']],
      ['다', 'bottom', ['가', '나', '다', '가-하위']],
    ]
    const got = { down: [] as string[][], up: [] as string[][] }
    for (const [n, [over, zone]] of down.entries()) {
      const { projectId, P, ids } = await menuFixture(`menu-down-${n}`)
      const tab = await openEditor(P)
      try {
        await grab(tab.page, ids['다']!)
        await dropAt(tab.page, await spot(tab.page, ids[over]!, zone))
        const tree = await poll(
          '서버 트리',
          () => serverTree(projectId),
          (menu) => menu.length === 2,
          5_000,
        )
        got.down.push(titles(find(tree, '가')!.children))
      } finally {
        await tab.close()
      }
    }
    for (const [n, [over, zone]] of up.entries()) {
      const { projectId, P, ids } = await menuFixture(`menu-up-${n}`)
      const tab = await openEditor(P)
      try {
        await grab(tab.page, ids['가-하위']!)
        await dropAt(tab.page, await spot(tab.page, ids[over]!, zone))
        const tree = await poll(
          '서버 트리',
          () => serverTree(projectId),
          (menu) => menu.length === 4,
          5_000,
        )
        got.up.push(titles(tree))
      } finally {
        await tab.close()
      }
    }
    expect(got).toEqual({ down: down.map(([, , want]) => want), up: up.map(([, , want]) => want) })
  })

  /**
   * 두 사람이 같은 부모를 번갈아 끈다. 보내는 값은 «옮긴 뒤 차례»(`tree-drop.ts`)라 서버의 지금 차례에 그 번호로 들어간다 — 둘째 사람의 트리가
   * 첫째의 옮김을 받아야 둘째의 뜻이 선다. 적는 값: 둘째 화면이 첫째의 결과를 받았는지 · 둘째의 뜻(«나1 을 나2 뒤로»)이 서버에서 서는지 · 둘째
   * 화면이 결과를 받는지. 남의 변경을 받지 않으면 `bobSeesBefore` 가 `[나1, 나2, 나3]`(옛 차례) · `second` · `bobSeesAfter` 가
   * `[나3, 나1, 나2]`다(뜻은 `[나3, 나2, 나1]`).
   */
  it('두 사람이 같은 부모를 번갈아 끌면 둘째의 뜻이 서버에 선다', async () => {
    const { projectId, P, ids } = await menuFixture('two-clients', 'editor')
    const aliceTab = await openEditor(P)
    const bobTab = await openEditor(P, 'bob')
    const pagesOfNa = (page: Page) =>
      page
        .locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-kind="page"]')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-tree-id')))
        .then((list) =>
          list.filter((id) => [ids['나1'], ids['나2'], ids['나3']].includes(id!)).map((id) => Object.keys(ids).find((k) => ids[k] === id)),
        )
    try {
      await grab(aliceTab.page, ids['나3']!)
      await dropAt(aliceTab.page, await spot(aliceTab.page, ids['나1']!, 'top'))
      const first = await poll(
        '서버 트리',
        () => serverTree(projectId),
        (menu) => titles(find(menu, '나')!.pages)[0] === '나3',
        5_000,
      )
      await bobTab.page.waitForTimeout(800)
      const bobSeesBefore = await pagesOfNa(bobTab.page)
      // bob 의 뜻 — 나1 을 나2 뒤로.
      await grab(bobTab.page, ids['나1']!)
      await dropAt(bobTab.page, await spot(bobTab.page, ids['나2']!, 'bottom'))
      await poll(
        'bob 의 요청',
        async () => bobTab.writes.length,
        (n) => n === 1,
        5_000,
      )
      await bobTab.page.waitForTimeout(600)
      const second = await serverTree(projectId)

      expect({
        first: titles(find(first, '나')!.pages),
        bobSeesBefore,
        second: titles(find(second, '나')!.pages),
        bobSeesAfter: await pagesOfNa(bobTab.page),
      }).toEqual({
        first: ['나3', '나1', '나2'],
        bobSeesBefore: ['나3', '나1', '나2'],
        second: ['나3', '나2', '나1'],
        bobSeesAfter: ['나3', '나2', '나1'],
      })
    } finally {
      await aliceTab.close()
      await bobTab.close()
    }
  })

  /**
   * **끄는 동안 신호가 온다** — bob 이 나1 을 쥔 채, alice 가 나3 을 맨 앞으로 옮긴다. bob 의 트리가 새 차례로 서는 동안 끄는 표시(쥔 줄의
   * `wb-shell-tree-row-dragging`)는 그대로 남고, 놓는 순간의 판정은 새 트리로 한다(`drag/use-pointer-drag.ts` — 뗀 좌표로 `onOver`를 다시
   * 묻는다 · 그 판정이 지금 트리를 든다). bob 의 뜻 «나1 을 나2 뒤로»가 서버에서 `[나3, 나2, 나1]`로 선다.
   */
  it('끄는 동안 남이 같은 부모를 바꾸면 — 표시는 끝까지 남고 놓는 판정은 새 트리로 한다', async () => {
    const { projectId, P, ids } = await menuFixture('drag-frame', 'editor')
    const bobTab = await openEditor(P, 'bob')
    const order = (page: Page) =>
      page
        .locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-kind="page"]')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-tree-id')))
        .then((list) =>
          list.filter((id) => [ids['나1'], ids['나2'], ids['나3']].includes(id!)).map((id) => Object.keys(ids).find((k) => ids[k] === id)),
        )
    try {
      await bobTab.page.waitForTimeout(300)
      await grab(bobTab.page, ids['나1']!)
      const lifted = () => row(bobTab.page, ids['나1']!).evaluate((element) => element.classList.contains('wb-shell-tree-row-dragging'))
      const liftedBefore = await lifted()
      const moved = await stack.request(alice, 'PATCH', `/projects/${projectId}/pages/${ids['나3']}`, { sortOrder: 0 })
      expect(moved.status).toBe(200)
      const seenDuring = await poll(
        'bob 의 트리가 새 차례로',
        () => order(bobTab.page),
        (now) => now[0] === '나3',
        5_000,
      ).catch(() => null)
      const liftedDuring = await lifted()
      await dropAt(bobTab.page, await spot(bobTab.page, ids['나2']!, 'bottom'))
      await poll(
        'bob 의 요청',
        async () => bobTab.writes.length,
        (n) => n === 1,
        5_000,
      )
      await bobTab.page.waitForTimeout(600)
      expect({
        liftedBefore,
        seenDuring,
        liftedDuring,
        server: titles(find(await serverTree(projectId), '나')!.pages),
      }).toEqual({ liftedBefore: true, seenDuring: ['나3', '나1', '나2'], liftedDuring: true, server: ['나3', '나2', '나1'] })
    } finally {
      await bobTab.close()
    }
  })

  /**
   * L-028 — 메뉴 트리 끌기도 놓는 답이 보인 답이어야 한다. bob 이 나1 을 쥐고 나3 의 아래 띠(«나 안 끝»)를 세운 채 alice 가 위 줄(가2)을 지우면
   * 줄이 하나 올라가 포인터 밑에 «다» 메뉴 줄이 온다 — 안 견주면 떼는 순간 나1 이 보인 자리(나) 가 아닌 «다 안» 으로 간다.
   */
  it('메뉴: 끄는 중 남이 위 줄을 지워 포인터 밑에 다른 부모의 줄이 오면 표시가 걷히고 놓아도 요청이 없다', async () => {
    const { projectId, P, ids } = await menuFixture('menu-shifted', 'editor')
    const tab = await openEditor(P, 'bob')
    try {
      const { page } = tab
      await page.waitForTimeout(300)
      await grab(page, ids['나1']!)
      const target = await spot(page, ids['나3']!, 'bottom')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const armed = await counts(page)
      const removed = await stack.request(alice, 'DELETE', `/projects/${projectId}/pages/${ids['가2']}`)
      await row(page, ids['가2']!).waitFor({ state: 'detached', timeout: 3_000 })
      await page.waitForTimeout(200)
      const afterShift = await counts(page)
      await page.mouse.up()
      await page.waitForTimeout(600)
      const tree = await serverTree(projectId)
      expect({
        armed: armed.hint,
        removed: removed.status,
        afterShift: afterShift.hint,
        writes: tab.writes.length,
        나: titles(find(tree, '나')!.pages),
        다: titles(find(tree, '다')!.pages),
      }).toEqual({ armed: 1, removed: 204, afterShift: 0, writes: 0, 나: ['나1', '나2', '나3'], 다: [] })
    } finally {
      await tab.close()
    }
  })

  /**
   * L-238 — `refresh`(끄는 사이 트리가 바뀌면 마지막 좌표로 다시 묻는다)만 가르는 판. 위 케이스는 `refresh` 를 떼도 `sameMenuDrop` 을 떼도 죽어
   * 둘을 못 가른다. 여기서는 남이 **다른 부모의 줄**을 지워(가2 — 나 위) 포인터 밑에 **같은 부모의 줄**(나2)이 오고, 그 자리는 끄는 나3 의
   * 제자리(나2 뒤)라 `onOver` 가 `null` 이다. `refresh` 가 있으면 표시가 걷히고 `sameDrop` 은 이 길에 안 든다(`reask` 의 `next === null`) —
   * `refresh` 를 뗀 변조에서만 표시가 옛 자리에 남는다.
   */
  it('메뉴: 끄는 중 남이 위 줄을 지워 포인터 밑에 같은 부모의 줄이 오면 — 표시가 새 자리로 다시 물어 걷힌다(제자리)', async () => {
    const { projectId, P, ids } = await menuFixture('menu-refresh-only', 'editor')
    const tab = await openEditor(P, 'bob')
    try {
      const { page } = tab
      await page.waitForTimeout(300)
      await grab(page, ids['나3']!)
      const target = await spot(page, ids['나1']!, 'bottom')
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const armed = await counts(page)
      const removed = await stack.request(alice, 'DELETE', `/projects/${projectId}/pages/${ids['가2']}`)
      await row(page, ids['가2']!).waitFor({ state: 'detached', timeout: 3_000 })
      await page.waitForTimeout(200)
      const box = (await row(page, ids['나2']!).boundingBox())!
      const underPointer = target.y >= box.y && target.y <= box.y + box.height ? '나2' : null
      const afterShift = await counts(page)
      await page.mouse.up()
      await page.waitForTimeout(600)
      const tree = await serverTree(projectId)
      expect({
        armed: armed.hint,
        removed: removed.status,
        underPointer,
        afterShift: afterShift.hint,
        writes: tab.writes.length,
        나: titles(find(tree, '나')!.pages),
      }).toEqual({ armed: 1, removed: 204, underPointer: '나2', afterShift: 0, writes: 0, 나: ['나1', '나2', '나3'] })
    } finally {
      await tab.close()
    }
  })

  // ── 항목 4 — 줄 행동 ─────────────────────────────────────────────────────────────────────────────────

  /** Tab 을 `n` 번 눌러 포커스가 선 요소의 접근 이름 — 트리 안의 것만. */
  async function tabWalk(page: Page, n: number): Promise<string[]> {
    const seen: string[] = []
    for (let i = 0; i < n; i += 1) {
      await page.keyboard.press('Tab')
      const name = await page.evaluate(() => {
        const el = document.activeElement
        if (el === null || el.closest('[aria-label="메뉴와 구조"]') === null) return null
        return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''
      })
      if (name !== null) seen.push(name)
    }
    return seen
  }

  /**
   * 메뉴 트리에는 줄 행동이 없고, 구조 트리에는 뿌리 밖 줄마다 «모듈로 저장…» 한 항목짜리 `…` 만 선다(내 개인 모듈로 남기는 쓰기라 문서를
   * 안 바꾼다 — 설계 spec `2026-10-20-personal-modules-design.md` «편집할 수 없는 판의 입구»). 이 판의 구조 트리는 뿌리 밖 노드가 하나다.
   */
  it('viewer 에게는 메뉴 트리 줄 `+` · `…` · 뿌리 `+` 가 없고, 구조 트리 줄 `…` 은 «모듈로 저장…» 하나다 — 마우스로도 Tab 으로도', async () => {
    const { P, ids } = await menuFixture('viewer', 'viewer')
    const tab = await openEditor(P, 'bob')
    try {
      const { page } = tab
      const over = await spot(page, ids['나']!, 'middle')
      await page.mouse.move(over.x, over.y)
      const menuTree = '[aria-label="메뉴와 구조"] .wb-shell-region[aria-label="메뉴·페이지 트리"]'
      const structureTree = '[aria-label="메뉴와 구조"] .wb-shell-region[aria-label="구조 트리"]'
      const boxes = await page.locator(`${menuTree} .wb-shell-tree-row-actions`).count()
      const structureBoxes = await page.locator(`${structureTree} .wb-shell-tree-row-actions`).count()
      // 제목 줄의 «모두 접기» · «모두 펴기»는 읽기 도구라 viewer 에게도 선다(`src/panels/tree-fold.tsx`) — 세는 것은 그 밖의 단추(뿌리 `+`)다.
      const headButtons = await page.locator('[aria-label="메뉴와 구조"] .wb-shell-region-actions button:not(.wb-shell-tree-fold)').count()
      await page.locator('[aria-label="메뉴와 구조"] [data-tree-row] a, [aria-label="메뉴와 구조"] [data-tree-row] button').first().focus()
      const walked = await tabWalk(page, 30)
      const textRow = page.locator(`${structureTree} [data-tree-row][data-tree-id="n_text0000001"]`)
      await textRow.locator(':scope > :first-child').hover()
      await textRow.getByRole('button', { name: /더 보기$/ }).click()
      const items = await page.getByRole('menu').getByRole('menuitem').allTextContents()
      await page.keyboard.press('Escape')
      expect({
        boxes,
        structureBoxes,
        headButtons,
        reached: walked.filter((name) => (/ (추가|더 보기)$/.test(name) || name === '+') && !name.startsWith('Text')),
        items,
      }).toEqual({
        boxes: 0,
        structureBoxes: 1,
        headButtons: 0,
        reached: [],
        items: ['모듈로 저장…'],
      })
    } finally {
      await tab.close()
    }
  })

  it('뷰 모드에서는 줄 `+` · `…` 가 없다 — 마우스로도 Tab 으로도', async () => {
    const { P, ids } = await menuFixture('view-mode')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.waitForTimeout(300)
      const over = await spot(page, ids['나']!, 'middle')
      await page.mouse.move(over.x, over.y)
      const boxes = await page.locator('[aria-label="메뉴와 구조"] .wb-shell-tree-row-actions').count()
      await page.locator('[aria-label="메뉴와 구조"] [data-tree-row] a, [aria-label="메뉴와 구조"] [data-tree-row] button').first().focus()
      const walked = await tabWalk(page, 30)
      expect({ boxes, reached: walked.filter((name) => / (추가|더 보기)$/.test(name)) }).toEqual({ boxes: 0, reached: [] })
    } finally {
      await tab.close()
    }
  })

  it('줄 `…` 를 연 채 다른 줄을 누르면 메뉴가 닫히고 그 줄이 고른 줄이 된다', async () => {
    const { P, ids } = await menuFixture('open-then-other')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      const over = await spot(page, ids['나']!, 'middle')
      await page.mouse.move(over.x, over.y)
      await row(page, ids['나']!).getByRole('button', { name: '나 더 보기' }).click()
      const opened = await page.getByRole('menu').count()
      const other = await spot(page, ids['다']!, 'middle')
      await page.mouse.click(other.x, other.y)
      await page.waitForTimeout(300)
      const picked = await page
        .locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] .wb-shell-tree-row-picked')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-tree-id')))
      expect({ opened, after: await page.getByRole('menu').count(), picked, writes: tab.writes }).toEqual({
        opened: 1,
        after: 0,
        picked: [ids['다']],
        writes: [],
      })
    } finally {
      await tab.close()
    }
  })

  /**
   * «삭제»를 누르면 확인(«정말 삭제합니까?» · «취소»)이 줄 아래에 선다. 첫 누름 뒤 «삭제» 항목이 있던 자리(왼끝 · 가운데 · 오른끝)에
   * 무엇이 서는지를 폭 셋에서 적고, 그 자리를 **실브라우저 더블클릭** · **따로 두 번**으로 눌러 한 몸짓에 지워지지 않는지 잰다
   * (`CLAUDE.md` «jsdom 은 좌표 · 상속 계산도 없다»).
   */
  /** 삭제 두 번 누르기의 판 — 폭 셋 × 누르는 자리 셋(왼끝 · 가운데 · 오른끝) × 몸짓 둘. 아래 두 케이스가 같은 표를 다른 성질로 읽는다. */
  let deleteTable: Promise<Record<string, { deleted: boolean; confirm: number; under: unknown }>> | undefined
  function measureDeletes() {
    deleteTable ??= (async () => {
      const widths = [1440, 1024, 800]
      const table: Record<string, { deleted: boolean; confirm: number; under: unknown }> = {}
      for (const width of widths) {
        for (const at of ['left', 'middle', 'right'] as const) {
          for (const gesture of ['dblclick', 'twice'] as const) {
            const { projectId, P, ids } = await menuFixture(`del-${width}-${at}-${gesture}`)
            const tab = await openEditor(P, 'alice', { width, height: 900 })
            try {
              const { page } = tab
              const over = await spot(page, ids['나2']!, 'middle')
              await page.mouse.move(over.x, over.y)
              await row(page, ids['나2']!).getByRole('button', { name: '나2 더 보기' }).click()
              const item = page.getByRole('menuitem', { name: '삭제' })
              const box = (await item.boundingBox())!
              const points = {
                left: { x: box.x + 3, y: box.y + box.height / 2 },
                middle: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
                right: { x: box.x + box.width - 3, y: box.y + box.height / 2 },
              }
              const pressAt = points[at]
              if (gesture === 'dblclick') {
                await page.mouse.dblclick(pressAt.x, pressAt.y)
              } else {
                await page.mouse.click(pressAt.x, pressAt.y)
                await page.waitForTimeout(350)
                await page.mouse.click(pressAt.x, pressAt.y)
              }
              await page.waitForTimeout(500)
              const under = await page.evaluate((pts) => {
                const out: Record<string, string> = {}
                for (const [key, p] of Object.entries(pts)) {
                  const el = document.elementFromPoint(p.x, p.y)
                  out[key] =
                    el === null
                      ? 'null'
                      : `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 12)}`
                }
                return out
              }, points)
              const tree = await serverTree(projectId)
              table[`${width}/${at}/${gesture}`] = {
                deleted: !titles(find(tree, '나')!.pages).includes('나2'),
                confirm: await page.getByRole('button', { name: '정말 삭제합니까?' }).count(),
                under,
              }
            } finally {
              await tab.close()
            }
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log('[delete-confirm]', JSON.stringify(table))
      return table
    })()
    return deleteTable
  }

  it('삭제 두 번 누르기 — 더블클릭 · 따로 두 번이 한 몸짓에 지우지 않는다(폭 셋 · 왼끝 · 가운데 · 오른끝)', async () => {
    const table = await measureDeletes()
    expect(Object.values(table).map((v) => ({ deleted: v.deleted, confirm: v.confirm }))).toEqual(
      Array.from({ length: 18 }, () => ({ deleted: false, confirm: 1 })),
    )
  })

  /**
   * 첫 누름이 행동 메뉴를 닫으면 «삭제» 항목 자리 밑의 요소가 드러나고, 막는 것이 없으면 더블클릭의 둘째 누름이 그것을 누른다 — 그 밑이
   * 페이지 줄이면 그 페이지로 옮겨 가며 고른 것이 풀려 삭제 확인이 사라진다. 행동 메뉴가 포인터로 고른 뒤 같은 자리의 둘째 누름 하나를
   * 삼킨다(`shell/action-menu.tsx` «포인터로 고른 뒤 …»). 위 표의 «나2»는 목록이 트리 끝 아래로 떠 밑에 누를 것이 없어 이 성질을 못 잰다 —
   * 그래서 목록이 아래 줄들 위에 뜨는 «가1»의 `…`로 잰다. 판 카나리아: 누르기 전 «삭제» 가운데 밑(목록을 닫은 뒤의 `elementFromPoint`)이
   * 트리의 줄이다. 페이지 `…` 는 «상태 추가»까지 실어 «삭제»가 공용 픽스처의 마지막 줄(«다») 바로 밑에 떨어지므로 이 판에만 메뉴 «라»를
   * 더한다 — 공용 픽스처에 더하면 위 «나2» 표의 «밑에 누를 것이 없다»가 깨진다.
   */
  it('삭제 항목의 둘째 누름이 그 밑 줄을 누르지 않는다 — 목록이 아래 줄들 위에 뜨는 줄(값)', async () => {
    const { projectId, P, ids } = await menuFixture('del-over-rows')
    const extra = await stack.request(alice, 'POST', `/projects/${projectId}/menu`, { parentId: null, title: '라' })
    if (extra.status >= 300) throw new Error(`menu ${extra.status}`)
    const tab = await openEditor(P)
    try {
      const { page } = tab
      const over = await spot(page, ids['가1']!, 'middle')
      await page.mouse.move(over.x, over.y)
      await row(page, ids['가1']!).getByRole('button', { name: '가1 더 보기' }).click()
      const item = page.getByRole('menuitem', { name: '삭제' })
      const box = (await item.boundingBox())!
      const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      // 목록을 잠깐 감춰 그 자리 밑을 읽는다 — 감춘 채 누르지 않는다.
      const under = await page.evaluate(({ x, y }) => {
        const list = document.querySelector<HTMLElement>('.wb-shell-action-menu-body')!
        list.style.visibility = 'hidden'
        const el = document.elementFromPoint(x, y)
        list.style.visibility = ''
        return el === null ? 'null' : el.closest('[data-tree-row]') === null ? el.tagName : 'row'
      }, at)
      const before = new URL(page.url()).pathname
      await page.mouse.dblclick(at.x, at.y)
      await page.waitForTimeout(500)
      expect({
        under,
        path: new URL(page.url()).pathname === before,
        confirm: await page.getByRole('button', { name: '정말 삭제합니까?' }).count(),
      }).toEqual({ under: 'row', path: true, confirm: 1 })
    } finally {
      await tab.close()
    }
  })

  it('삭제 두 번 누르기 — 키보드 Enter 두 번(값)', async () => {
    const { projectId, P, ids } = await menuFixture('del-enter')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      const over = await spot(page, ids['나2']!, 'middle')
      await page.mouse.move(over.x, over.y)
      await row(page, ids['나2']!).getByRole('button', { name: '나2 더 보기' }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('menuitem', { name: '삭제' }).focus()
      await page.keyboard.press('Enter')
      const focusedAfterFirst = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(600)
      const tree = await serverTree(projectId)
      // 첫 Enter 가 확인 단추에 포커스를 옮겨 둘째 Enter 가 지운다 — 옛 툴바(«삭제» 단추가 제자리에서 «정말 삭제합니까?»로 바뀜)와 같은 몸짓이다.
      expect({ focusedAfterFirst, 나: titles(find(tree, '나')!.pages) }).toEqual({
        focusedAfterFirst: '정말 삭제합니까?',
        나: ['나1', '나3'],
      })
    } finally {
      await tab.close()
    }
  })

  // ── 항목 5 — 되돌리기 ────────────────────────────────────────────────────────────────────────────────

  it('구조: 같은 부모 안에서 뒤로 끈 것을 되돌리기 · 다시 실행 단추로 돌린다', async () => {
    const { P } = await structureFixture('undo-reorder')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      await grabNode(page, 'n_text0000001')
      await dropAt(page, await nodeSpot(page, 'n_divi0000001', 'bottom'))
      const moved = await poll(
        '서버 문서',
        () => serverShape(P),
        (shape) => JSON.stringify(shape) !== JSON.stringify(ORIGINAL),
      )
      await page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' }).click()
      const undone = await poll(
        '서버 문서',
        () => serverShape(P),
        (shape) => JSON.stringify(shape) === JSON.stringify(ORIGINAL),
      )
      await page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '다시 실행' }).click()
      const redone = await poll(
        '서버 문서',
        () => serverShape(P),
        (shape) => JSON.stringify(shape) !== JSON.stringify(ORIGINAL),
      )
      expect({ moved, undone, redone, sent: tab.patches.length }).toEqual({
        moved: { Page: [{ Card: ['Text'] }, 'Divider', 'Text'] },
        undone: ORIGINAL,
        redone: { Page: [{ Card: ['Text'] }, 'Divider', 'Text'] },
        sent: 3,
      })
    } finally {
      await tab.close()
    }
  })

  it('메뉴: 끌어 옮긴 페이지는 되돌리기에 들지 않는다 — 되돌리기는 그 앞의 구조 편집(씨앗 Text)을 돌린다(값)', async () => {
    const { projectId, P, ids } = await menuFixture('menu-undo')
    const tab = await openEditor(P)
    try {
      const { page } = tab
      const undoButton = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
      const beforeAny = await undoButton.isDisabled()
      await grab(page, ids['가2']!)
      await dropAt(page, await spot(page, ids['나']!, 'middle'))
      await poll(
        '서버 트리',
        () => serverTree(projectId),
        (menu) => find(menu, '나')!.pages.length === 4,
        5_000,
      )
      await page.waitForTimeout(300)
      const afterMenuDrag = await undoButton.isDisabled()
      await undoButton.click()
      const doc = await poll(
        '서버 문서',
        async () => (await stack.request(alice, 'GET', P)).body.schema.root.children.length as number,
        (n) => n === 0,
        5_000,
      ).catch(async () => (await stack.request(alice, 'GET', P)).body.schema.root.children.length as number)
      const tree = await serverTree(projectId)
      expect({ beforeAny, afterMenuDrag, rootChildren: doc, 나: titles(find(tree, '나')!.pages) }).toEqual({
        beforeAny: false,
        afterMenuDrag: false,
        rootChildren: 0,
        나: ['나1', '나2', '나3', '가2'],
      })
    } finally {
      await tab.close()
    }
  })
})
