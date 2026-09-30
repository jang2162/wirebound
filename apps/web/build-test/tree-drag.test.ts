/**
 * **트리의 줄 행동과 끌어 놓기를 실브라우저로 잰다**(`src/panels/tree-row-actions.tsx` · `src/drag/use-pointer-drag.ts` · 자리 판정
 * `src/tree/tree-drop.ts`). jsdom 은 배치 · 포인터 캡처 · `:hover` · `visibility` 상속이 없다 — 보내는 요청의 모양은
 * `test/panels/menu-row-actions.test.tsx`(가짜 자리)가 갖고, 여기는 **진짜 마우스가 진짜 줄 위에서** 그 요청을 내고 서버 트리가
 * 그렇게 서는지를 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 줄 행동이 서는 조건 | 마우스 · 고른 줄 밖의 줄에도 `+` · `…`가 보인다 · 마우스를 올려도 안 보인다 · 줄에 포커스가 와도 Tab 이 `+`에 안 닿는다 |
 * | 페이지를 다른 메뉴 둘째 자리로 | 서버 트리에서 그 메뉴의 둘째가 아니다(`sortOrder` 가 «옮긴 뒤 차례»가 아니다) · 끈 링크가 열린다 |
 * | 메뉴를 다른 메뉴 안으로 | 서버의 `parentId` 가 그 메뉴가 아니다 |
 * | 자기 자손 위에 놓음 | 요청이 나간다 |
 * | Escape | 요청이 나간다 |
 * | 끄는 중 캔버스 위를 지나 돌아와 놓음 | 캔버스 iframe 위의 움직임이 호스트에 안 와(캡처 없음) 마지막 줄의 표시가 남는다 · 돌아와 놓은 요청이 안 나간다 |
 * | 캔버스 위에서 놓음 | 캔버스 iframe 위의 `pointerup`이 호스트에 안 와 끌기가 붙은 채 남는다 · 요청이 나간다 |
 */
import type { Page, Request } from 'playwright-core'
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

describe.skipIf(!전제.ok)('트리 끌어 놓기 · 줄 행동 — 실브라우저', () => {
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

  /**
   * ```
   * 가   pages: 가1 가2
   * └ 가-하위
   * 나   pages: 나1 나2
   * 다
   * ```
   * 첫 페이지(가1)를 연다.
   */
  async function menuFixture(slug: string): Promise<{ projectId: string; P: string; ids: Record<string, string> }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'C2 트리', slug: `${slug}-${Date.now().toString(36)}` })).body
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
    await page('가1', '가')
    await page('가2', '가')
    await page('나1', '나')
    await page('나2', '나')
    const P = `/projects/${project.id}/pages/${ids['가1']}`
    // 캔버스에 노드 하나 — 문서가 그려졌는지를 그것으로 기다린다(빈 루트는 캔버스에 `data-wb-id`를 안 남긴다).
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { projectId: project.id, P, ids }
  }

  async function serverTree(projectId: string): Promise<TreeNode[]> {
    return (await stack.request(alice, 'GET', `/projects/${projectId}/tree`)).body.menu as TreeNode[]
  }

  function titles(items: readonly { title: string; sortOrder: number }[]): string[] {
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.title)
  }

  async function openEditor(P: string): Promise<{ page: Page; close: () => Promise<void>; writes: string[] }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const writes: string[] = []
    page.on('request', (request: Request) => {
      if (request.method() !== 'GET' && /\/api\/projects\/[^/]+\/(menu|pages)\//.test(request.url())) {
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
      }
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    // 줄 상자는 `visibility: hidden`이다(보이는 것은 줄 단추 · 고른 줄) — 붙었는지만 기다린다.
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close(), writes }
  }

  /** 메뉴 트리의 줄 상자 — 줄의 id 로. */
  function row(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  /** 줄 상자의 띠 좌표 — 위 끝 근처 · 가운데 · 아래 끝 근처(`tree-drop.ts`의 `dropZone`). */
  async function spot(page: Page, id: string, zone: 'top' | 'middle' | 'bottom'): Promise<{ x: number; y: number }> {
    const box = (await row(page, id).boundingBox())!
    const y = zone === 'top' ? box.y + 3 : zone === 'middle' ? box.y + box.height / 2 : box.y + box.height - 3
    return { x: box.x + 40, y }
  }

  /** 줄 단추를 눌러 끌기 시작 — 문턱(4px)을 넘긴다. */
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

  it('줄 행동은 마우스가 올라온 줄 · 고른 줄에서만 보이고, 줄에 포커스가 오면 Tab 이 `+`에 닿는다', async () => {
    const { P, ids } = await menuFixture('row-actions')
    const { page, close } = await openEditor(P)
    try {
      const visibility = (id: string) =>
        row(page, id).locator('.wb-shell-tree-row-actions').evaluate((el) => getComputedStyle(el).visibility)
      // 열린 페이지(가1)가 고른 줄이다 — 그 줄만 보인다.
      await page.mouse.move(1000, 800)
      const idle = { 가1: await visibility(ids['가1']!), 나: await visibility(ids['나']!) }
      // 줄 상자는 숨어 있어 `hover()`가 기다리기만 한다 — 좌표로 올린다.
      const over = await spot(page, ids['나']!, 'middle')
      await page.mouse.move(over.x, over.y)
      const hovered = await visibility(ids['나']!)
      // 줄 단추에 포커스를 주고 Tab.
      await page.mouse.move(1000, 800)
      await row(page, ids['다']!).getByRole('button', { name: '다', exact: true }).focus()
      await page.keyboard.press('Tab')
      const tabbed = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)

      expect({ idle, hovered, tabbed }).toEqual({
        idle: { 가1: 'visible', 나: 'hidden' },
        hovered: 'visible',
        tabbed: '다 추가',
      })
    } finally {
      await close()
    }
  })

  it('페이지를 다른 메뉴의 둘째 자리로 끌어 놓으면 서버 트리에서 그 메뉴의 둘째다', async () => {
    const { projectId, P, ids } = await menuFixture('page-move')
    const { page, close, writes } = await openEditor(P)
    try {
      await grab(page, ids['가2']!)
      // 나2 의 위 띠 → 나1 · 가2 · 나2.
      await dropAt(page, await spot(page, ids['나2']!, 'top'))

      const tree = await poll('서버 트리', () => serverTree(projectId), (menu) => menu.find((m) => m.title === '나')?.pages.length === 3)
      expect(titles(tree.find((m) => m.title === '나')!.pages)).toEqual(['나1', '가2', '나2'])
      expect(titles(tree.find((m) => m.title === '가')!.pages)).toEqual(['가1'])
      expect(writes).toEqual([`PATCH /api/projects/${projectId}/pages/${ids['가2']}`])
      // 끈 링크가 열리지 않았다 — 뗀 뒤 브라우저가 그 링크에 내는 click 을 삼킨다(`use-pointer-drag.ts` «끈 뒤의 클릭을 삼킨다»).
      expect(new URL(page.url()).pathname).toBe(P)
    } finally {
      await close()
    }
  })

  it('메뉴를 다른 메뉴 안으로 끌어 놓으면 서버의 parentId 가 그 메뉴다', async () => {
    const { projectId, P, ids } = await menuFixture('menu-into')
    const { page, close } = await openEditor(P)
    try {
      await grab(page, ids['다']!)
      await dropAt(page, await spot(page, ids['나']!, 'middle'))

      const tree = await poll('서버 트리', () => serverTree(projectId), (menu) => menu.length === 2)
      expect(titles(tree)).toEqual(['가', '나'])
      expect(titles(tree.find((m) => m.title === '나')!.children)).toEqual(['다'])
    } finally {
      await close()
    }
  })

  it('메뉴를 자기 자손 위에 놓으면 요청이 없다 · Escape 로 취소하면 요청이 없다', async () => {
    const { P, ids } = await menuFixture('refused')
    const { page, close, writes } = await openEditor(P)
    try {
      await grab(page, ids['가']!)
      await page.mouse.move((await spot(page, ids['가-하위']!, 'middle')).x, (await spot(page, ids['가-하위']!, 'middle')).y, {
        steps: 6,
      })
      const refusedHint = await page.locator('.wb-shell-drop-indicator').count()
      await page.mouse.up()

      await grab(page, ids['나']!)
      await page.mouse.move((await spot(page, ids['다']!, 'middle')).x, (await spot(page, ids['다']!, 'middle')).y, { steps: 6 })
      const liveHint = await page.locator('.wb-shell-drop-indicator').count()
      await page.keyboard.press('Escape')
      const afterEscape = await page.locator('.wb-shell-drop-indicator').count()
      await page.mouse.up()
      await page.waitForTimeout(500)

      expect({ refusedHint, liveHint, afterEscape, writes }).toEqual({ refusedHint: 0, liveHint: 1, afterEscape: 0, writes: [] })
    } finally {
      await close()
    }
  })

  it('끄는 중 캔버스 iframe 위를 지나 돌아와 놓아도 끌기가 이어져 그 자리로 간다', async () => {
    const { projectId, P, ids } = await menuFixture('over-canvas')
    const { page, close } = await openEditor(P)
    try {
      const canvas = (await page.locator('iframe.wb-shell-canvas-iframe').boundingBox())!
      await grab(page, ids['나1']!)
      // 캔버스 한가운데까지 갔다가 머문다.
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 12 })
      await page.waitForTimeout(150)
      // 끌기는 살아 있고(줄이 들려 있다) 캔버스 위에는 놓을 자리가 없다 — 포인터 이벤트가 캔버스 위에서도 호스트로 와야 표시가
      // 걷힌다(안 오면 마지막 줄 위의 표시가 남는다).
      const overCanvas = {
        lifted: await page.locator('.wb-shell-tree-row-dragging').count(),
        hint: await page.locator('.wb-shell-drop-indicator').count(),
      }
      // 돌아와 가 메뉴 안(가운데 띠)에 놓는다.
      await dropAt(page, await spot(page, ids['가']!, 'middle'))

      const tree = await poll('서버 트리', () => serverTree(projectId), (menu) => menu.find((m) => m.title === '가')?.pages.length === 3)
      expect(overCanvas).toEqual({ lifted: 1, hint: 0 })
      expect(titles(tree.find((m) => m.title === '가')!.pages)).toEqual(['가1', '가2', '나1'])
      expect(await page.locator('.wb-shell-tree-row-dragging').count()).toBe(0)
    } finally {
      await close()
    }
  })

  it('캔버스 iframe 위에서 놓으면 끌기가 끝난다 — 요청 없음 · 돌아와도 끌리지 않는다', async () => {
    const { P, ids } = await menuFixture('drop-on-canvas')
    const { page, close, writes } = await openEditor(P)
    try {
      const canvas = (await page.locator('iframe.wb-shell-canvas-iframe').boundingBox())!
      await grab(page, ids['나1']!)
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 12 })
      await page.mouse.up()
      const afterRelease = await page.locator('.wb-shell-tree-row-dragging').count()
      // 뗀 뒤 트리로 돌아와 가 메뉴 위에 머문다 — `pointerup`을 못 받았으면 끌기가 붙은 채 남아 표시가 선다.
      const back = await spot(page, ids['가']!, 'middle')
      await page.mouse.move(back.x, back.y, { steps: 6 })
      await page.waitForTimeout(200)

      expect({
        afterRelease,
        hint: await page.locator('.wb-shell-drop-indicator').count(),
        lifted: await page.locator('.wb-shell-tree-row-dragging').count(),
        writes,
      }).toEqual({ afterRelease: 0, hint: 0, lifted: 0, writes: [] })
    } finally {
      await close()
    }
  })
})
