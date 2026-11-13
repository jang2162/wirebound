/**
 * **코멘트 묶음이 캔버스를 가리킨다 — 실브라우저 판**(설계 `docs/superpowers/specs/2026-11-13-comment-focus-design.md`). «코멘트» 탭의 묶음에
 * 포커스가 들면 캔버스의 그 노드에 고른 것과 같은 링이 서고, 묶음을 누르면 숨은 노드가 보이는 화면 상태로 바뀌며, 머리 단추는 그 노드를 골라
 * «컴포넌트» 탭으로 간다. jsdom 판은 `test/panels/comment-focus.test.tsx` · `test/canvas/comment-pointing-ring.test.tsx`.
 *
 * jsdom 이 못 내는 것만 여기서 잰다 — Tab 차례로 묶음에 듦, 누름이 포커스를 준 뒤 클릭이 뒤따르는 차례(묶음 안 단추 · 링크 · 글 상자를
 * 누르면 포커스는 묶음 안으로 들어 링은 서되 상태는 안 바뀐다), 링의 자리.
 *
 * | 무엇이 거짓이면 죽나 |
 * |---|
 * | Tab 으로 든 묶음의 노드에 링이 안 서거나 그 노드 상자와 1px 넘게 어긋난다 · 포커스로 선택 · «달 곳» · 초안이 바뀐다 |
 * | Tab 으로 들기만 해도 상태가 바뀐다 · 숨은 노드의 묶음을 눌러도 그 노드가 안 보인다 |
 * | 묶음 안의 «수정» · 고치는 상자의 Enter · 토큰 링크 · «삭제» 가 상태를 바꾼다 |
 * | 고른 외곽선이 링 때문에 옮거나 사라진다 · 머리 단추가 고르지 않거나 «컴포넌트» 탭으로 안 간다 |
 * | 뷰 모드에 머리 단추가 서거나 묶음 누름이 링 · 상태 전환을 안 한다 · 캔버스 누름 · 탭 옮김에 링이 남는다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('코멘트 포커스 — 실브라우저', () => {
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

  /** 페이지 하나 — 상태 `s_admin`, 늘 보이는 `n_a` · `s_admin` 에서만 보이는 `n_b` · 늘 보이는 `n_c`. `n_a` · `n_b` 에 코멘트. */
  async function fixture(): Promise<string> {
    const project = (await call('POST', '/projects', { name: '코멘트 포커스', slug: `cf-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/viewStates', value: [{ id: 's_admin', name: '관리자' }] },
        { op: 'add', path: '/root/children/0', value: { id: 'n_a', type: 'Text', props: { content: '늘 보이는 글' } } },
        {
          op: 'add',
          path: '/root/children/1',
          value: { id: 'n_b', type: 'Text', props: { content: '관리자 글' }, visibility: { mode: 'only', states: ['s_admin'] } },
        },
        { op: 'add', path: '/root/children/2', value: { id: 'n_c', type: 'Text', props: { content: '또 다른 글' } } },
      ],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    const post = async (nodeId: string, body: string) => {
      const res = await call('POST', `${P}/comments`, { nodeId, body })
      if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    }
    await post('n_a', '가에 단 말')
    await post('n_b', `저기 보세요 [옛 글](wb:comment/${pageId}/n_a) 끝`)
    await post('n_b', '지울 말')
    return P
  }

  async function openTab(path: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    await page.goto(path)
    await canvasFrame(page).locator('[data-wb-id="n_a"]').waitFor()
    return { page, close: () => context.close() }
  }

  async function openCommentTab(page: Page): Promise<void> {
    await page.getByRole('tab', { name: '코멘트', exact: true }).click()
    await group(page, 'n_b').waitFor()
  }

  const group = (page: Page, nodeId: string) => page.locator(`.wb-shell-comments [data-comment-node="${nodeId}"]`)
  const switcherName = async (page: Page) => (await page.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label')) ?? ''
  const rings = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-wb-comment-pointed]')].map((element) => element.getAttribute('data-wb-comment-pointed')),
    )
  const selectedOutline = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-wb-selected-id]')].map((element) => element.getAttribute('data-wb-selected-id')),
    )
  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const focusedGroup = (page: Page) =>
    page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-comment-node') ?? null)

  /** 사람처럼 Tab 을 눌러 그 묶음에 든다 — 몇 번 눌렀는지 돌려준다(카나리아). */
  async function tabInto(page: Page, nodeId: string): Promise<number> {
    for (let presses = 1; presses <= 40; presses += 1) {
      await page.keyboard.press('Tab')
      if ((await focusedGroup(page)) === nodeId) return presses
    }
    throw new Error(`Tab 40 번 안에 ${nodeId} 묶음에 못 들었다`)
  }

  /** 링 · 그 노드의 iframe 상자(둘 다 호스트 좌표). */
  async function ringAndNode(page: Page, nodeId: string) {
    const ring = await page.locator(`[data-wb-comment-pointed="${nodeId}"]`).boundingBox()
    const node = await canvasFrame(page).locator(`[data-wb-id="${nodeId}"]`).boundingBox()
    return { ring, node }
  }

  it('Tab 으로 묶음에 들면 그 노드 상자에 링이 선다 — 선택 · «달 곳» · 초안은 그대로', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      // 고른 노드(페이지를 열면 뿌리)의 초안을 친다 — 포커스가 «달 곳» 을 옮기면 상자가 다른 노드의 초안(빈 칸)이 된다.
      const draft = page.locator('#wb-comment-draft')
      await draft.fill('쓰던 말')
      const before = {
        selected: await selectedOutline(page),
        target: await page.locator('#wb-comment-target').textContent(),
        draft: await draft.inputValue(),
      }
      expect(before.selected.length).toBe(1)

      const presses = await tabInto(page, 'n_a')
      expect(presses).toBeGreaterThan(0)
      await frames(page)
      expect(await rings(page)).toEqual(['n_a'])
      const { ring, node } = await ringAndNode(page, 'n_a')
      expect(ring).not.toBeNull()
      expect(node).not.toBeNull()
      for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(ring![key] - node![key])).toBeLessThanOrEqual(1)
      expect(node!.width).toBeGreaterThan(0)

      expect({
        selected: await selectedOutline(page),
        target: await page.locator('#wb-comment-target').textContent(),
        draft: await draft.inputValue(),
      }).toEqual(before)
      expect(await switcherName(page)).toBe('화면 상태: 기본')
    } finally {
      await close()
    }
  })

  it('숨은 노드의 묶음 — Tab 으로 들면 그대로, 누르면 보이는 상태로 바뀌고 링이 선다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      await tabInto(page, 'n_b')
      await frames(page)
      expect(await switcherName(page)).toBe('화면 상태: 기본')
      expect(await rings(page)).toEqual([])
      expect(await canvasFrame(page).locator('[data-wb-id="n_b"]').count()).toBe(0)

      // 묶음의 맨 글(작성자 줄)을 누른다 — 단추 · 링크가 아닌 자리.
      await group(page, 'n_b').locator('.wb-shell-comment-author').first().click()
      await frames(page)

      expect(await switcherName(page)).toBe('화면 상태: 관리자')
      expect(await rings(page)).toEqual(['n_b'])
      expect(await canvasFrame(page).locator('[data-wb-id="n_b"]').isVisible()).toBe(true)
    } finally {
      await close()
    }
  })

  it('묶음 안의 «수정» · 고치는 상자의 Enter · 토큰 링크 · «삭제» 는 상태를 안 바꾼다 — 포커스는 묶음 안으로 든다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      const b = group(page, 'n_b')

      // «수정» 을 누른다 — 고치는 상자가 선다(누른 단추는 상자로 바뀌어 내려간다).
      await b.getByRole('button', { name: '수정', exact: true }).first().click()
      const box = b.getByRole('textbox', { name: '코멘트 수정' })
      await box.waitFor()
      await frames(page)
      expect(await switcherName(page)).toBe('화면 상태: 기본')
      // 상자를 누르면 포커스가 묶음 안으로 든다 — 그 누름도 · 거기서 친 Enter 도 고름이 아니다.
      await box.click()
      expect(
        await page.evaluate(() => document.activeElement?.closest('[data-comment-node]')?.getAttribute('data-comment-node') ?? null),
      ).toBe('n_b')
      await page.keyboard.press('Enter')
      await frames(page)
      expect(await switcherName(page)).toBe('화면 상태: 기본')
      await b.getByRole('button', { name: '취소', exact: true }).click()

      // 키보드로 «수정» — 단추에 포커스를 두고 Enter.
      await b.getByRole('button', { name: '수정', exact: true }).first().focus()
      await page.keyboard.press('Enter')
      await box.waitFor()
      await frames(page)
      expect(await switcherName(page)).toBe('화면 상태: 기본')
      await b.getByRole('button', { name: '취소', exact: true }).click()

      // 토큰 링크 — 같은 페이지의 `n_a` 번호로 간다(그 노드를 고르고 강조). 상태는 그대로다.
      const link = b.locator('.wb-shell-comment-body a')
      await link.waitFor()
      await link.click()
      await poll(
        '토큰이 그 노드를 고른다',
        () => selectedOutline(page),
        (list) => list.join() === 'n_a',
      )
      expect(await switcherName(page)).toBe('화면 상태: 기본')

      // «삭제» — 둘째 코멘트를 지운다.
      await openCommentTab(page)
      await group(page, 'n_b').getByRole('button', { name: '삭제', exact: true }).last().click()
      await poll(
        '코멘트가 지워진다',
        () => group(page, 'n_b').locator('.wb-shell-comment').count(),
        (count) => count === 1,
      )
      expect(await switcherName(page)).toBe('화면 상태: 기본')

      // 양성 대조 — 같은 판에서 묶음 자체를 누르면 바뀐다.
      await group(page, 'n_b').locator('.wb-shell-comment-author').first().click()
      await frames(page)
      expect(await switcherName(page)).toBe('화면 상태: 관리자')
    } finally {
      await close()
    }
  })

  it('편집 모드에서 다른 노드를 고른 채 — 고른 외곽선은 그대로 · 링은 따로', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_a"]').click()
      await poll(
        'n_a 를 골랐다',
        () => selectedOutline(page),
        (list) => list.join() === 'n_a',
      )
      await openCommentTab(page)

      await group(page, 'n_b').locator('.wb-shell-comment-author').first().click()
      await frames(page)

      expect(await rings(page)).toEqual(['n_b'])
      expect(await selectedOutline(page)).toEqual(['n_a'])
      // 고른 외곽선이 `.wb-shell-selection` 의 첫 요소다 — 그것을 고른 것으로 읽는 판들이 있다.
      expect(await page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)).toBe(
        'n_a',
      )
    } finally {
      await close()
    }
  })

  it('머리 단추 — 그 노드를 골라 «컴포넌트» 탭으로 가고 링이 걷힌다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      const pick = group(page, 'n_b').locator('.wb-shell-comment-group-pick')
      expect(await pick.count()).toBe(1)

      await pick.click()
      await frames(page)

      expect(await page.getByRole('tab', { name: '컴포넌트', exact: true }).getAttribute('aria-selected')).toBe('true')
      expect(await selectedOutline(page)).toEqual(['n_b'])
      expect(await switcherName(page)).toBe('화면 상태: 관리자')
      expect(await rings(page)).toEqual([])
    } finally {
      await close()
    }
  })

  it('뷰 모드 — 머리 단추가 없고 묶음 누름이 링 · 상태 전환을 한다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await openCommentTab(page)
      expect(await page.locator('.wb-shell-comment-group-pick').count()).toBe(0)

      await group(page, 'n_b').locator('.wb-shell-comment-author').first().click()
      await frames(page)

      expect(await switcherName(page)).toBe('화면 상태: 관리자')
      expect(await rings(page)).toEqual(['n_b'])
      expect(await selectedOutline(page)).toEqual([])
    } finally {
      await close()
    }
  })

  it('캔버스를 누르거나 «페이지 정보» 탭으로 가면 링이 걷힌다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await openCommentTab(page)
      await group(page, 'n_a').locator('.wb-shell-comment-author').first().click()
      await poll(
        '링이 선다',
        () => rings(page),
        (list) => list.join() === 'n_a',
      )

      await canvasFrame(page).locator('[data-wb-id="n_c"]').click()
      await frames(page)
      expect(await rings(page)).toEqual([])

      await group(page, 'n_a').locator('.wb-shell-comment-author').first().click()
      await poll(
        '링이 다시 선다',
        () => rings(page),
        (list) => list.join() === 'n_a',
      )
      await page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
      await frames(page)
      expect(await rings(page)).toEqual([])
    } finally {
      await close()
    }
  })
})
