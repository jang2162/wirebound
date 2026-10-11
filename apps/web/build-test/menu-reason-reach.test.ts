/**
 * **꺼진 항목의 이유에 키보드만으로 닿는다 — 실브라우저**(`src/shell/action-menu.tsx` 머리말 «끈 항목은 …»).
 *
 * 판: alice 는 루트(`Page`, 자동 선택), bob 이 자식 하나를 고른다(잠금) — 루트 `…` 의 항목이 전부 꺼지고 잠근 사람을 이유로 든다. alice 가
 * 키보드만으로(단추에 포커스 → Enter → ↓) 메뉴를 돌며, 포커스가 선 항목마다 Chrome 접근성 트리(CDP `Accessibility.getPartialAXTree`)의
 * 설명을 읽는다 — 보조 기술이 받는 값이다. 그 자리의 Enter 가 아무것도 안 하는지도 본다. 실제 낭독기(VoiceOver 등)가 그 설명을 소리로
 * 읽는지는 이 기계에서 재지 않는다.
 *
 * jsdom 판(`test/panels/toolbar-status-reach.test.tsx`)은 열두 상태의 «화살표가 이유 전부에 선다»를 갖고, 이 파일은 Chrome 의 포커스 ·
 * 접근성 트리 값을 갖는다.
 */
import type { CDPSession, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('꺼진 항목의 이유 — 키보드만으로', () => {
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

  function created(response: { status: number; body: any }): { id: string } {
    if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }

  /** 구조 트리에서 고른 노드의 id(`aria-current`). */
  const selected = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-tree-kind="node"] > button[aria-current="true"]')
      return button === null ? null : button.parentElement!.getAttribute('data-tree-id')
    })

  /** 지금 포커스된 요소 — 글 · 역할 · `aria-disabled` · `aria-description` · Chrome AX 설명. */
  async function focusedItem(page: Page, cdp: CDPSession) {
    const info = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (element === null) return null
      element.setAttribute('data-reach-focus', '1')
      return {
        text: element.textContent?.trim() ?? '',
        role: element.getAttribute('role'),
        off: element.getAttribute('aria-disabled'),
        description: element.getAttribute('aria-description'),
      }
    })
    if (info === null) return null
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-reach-focus="1"]' })
    const ax = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })
    await page.evaluate(() => document.querySelector('[data-reach-focus]')?.removeAttribute('data-reach-focus'))
    return { ...info, axDescription: (ax.nodes[0]?.description?.value as string | undefined) ?? null }
  }

  it('남이 잠근 판의 루트 `…` — ↓ 가 꺼진 항목 전부에 서고 · 선 항목마다 AX 설명이 이유다 · Enter 는 아무것도 안 한다', async () => {
    const project = created(await stack.request(alice, 'POST', '/projects', { name: '이유', slug: `reason-${Date.now().toString(36)}` }))
    const menu = created(await stack.request(alice, 'POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원관리' }))
    const added = await stack.request(alice, 'POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (added.status >= 300) throw new Error(`member ${added.status}`)
    const page1 = created(await stack.request(alice, 'POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '회원 목록' }))
    const seeded = await stack.request(alice, 'PATCH', `/projects/${project.id}/pages/${page1.id}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '하나' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    const P = `/projects/${project.id}/pages/${page1.id}`

    const a = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const b = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    try {
      const cdp = await a.context.newCDPSession(a.page)
      await cdp.send('Accessibility.enable')
      await a.page.goto(P)
      await canvasFrame(a.page).locator('[data-wb-id]').first().waitFor()
      await b.page.goto(P)
      await canvasFrame(b.page).locator('[data-wb-id]').first().waitFor()
      await b.page.locator('[data-tree-id="n_text0000001"] > button.wb-shell-structure-node').click()
      await a.page.locator('[data-tree-id="n_text0000001"] ~ .wb-shell-structure-lock').waitFor()

      const structure = a.page.locator('.wb-shell-region[aria-label="구조 트리"]')
      const root = await selected(a.page)
      const toggle = structure.getByRole('button', { name: 'Page 더 보기', exact: true })
      await toggle.focus()
      await a.page.keyboard.press('Enter')
      const items = await poll(
        '메뉴가 열린다',
        async () =>
          a.page.getByRole('menuitem').evaluateAll((elements) =>
            elements.map((element) => ({
              text: element.textContent?.trim() ?? '',
              off: element.getAttribute('aria-disabled'),
            })),
          ),
        (list) => list.length > 0,
      )
      const visited: NonNullable<Awaited<ReturnType<typeof focusedItem>>>[] = []
      for (let step = 0; step < items.length; step += 1) {
        const at = await focusedItem(a.page, cdp)
        if (at !== null) visited.push(at)
        await a.page.keyboard.press('ArrowDown')
      }
      const wrapped = await focusedItem(a.page, cdp)
      // eslint-disable-next-line no-console
      console.log('[꺼진 항목 · 키보드]', JSON.stringify({ items, visited, wrapped }, null, 1))

      // 그 자리의 Enter — 메뉴는 열린 채 · 포커스 그대로 · 고른 노드 그대로.
      const before = await a.page.evaluate(() => document.activeElement?.textContent?.trim())
      await a.page.keyboard.press('Enter')
      const afterEnter = {
        menus: await a.page.locator('[role="menu"]').count(),
        focus: await a.page.evaluate(() => document.activeElement?.textContent?.trim()),
        selected: await selected(a.page),
      }

      const reason = visited[0]?.description ?? ''
      expect({
        allOff: items.every((item) => item.off === 'true'),
        visitedTexts: visited.map((item) => item.text),
        visitedRoles: [...new Set(visited.map((item) => item.role))],
        visitedOff: [...new Set(visited.map((item) => item.off))],
        axIsDescription: visited.every((item) => item.axDescription === item.description && item.description !== null),
        lockReasons: visited.every((item) => (item.description ?? '').includes('편집 중이라')),
        wrapped: wrapped?.text,
        afterEnter: { menus: afterEnter.menus, focus: afterEnter.focus },
      }).toEqual({
        allOff: true,
        visitedTexts: items.map((item) => item.text),
        visitedRoles: ['menuitem'],
        visitedOff: ['true'],
        axIsDescription: true,
        lockReasons: true,
        wrapped: items[0]!.text,
        afterEnter: { menus: 1, focus: before },
      })
      expect(reason.length).toBeGreaterThan(0)
      // 카나리아: 루트가 골라진 판이다(자식이 아니다) · Enter 뒤에도 그대로.
      expect({ root: root !== null && root !== 'n_text0000001', after: afterEnter.selected }).toEqual({ root: true, after: root })
    } finally {
      await b.context.close()
      await a.context.close()
    }
  })
})
