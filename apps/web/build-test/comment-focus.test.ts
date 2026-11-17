/**
 * **코멘트 묶음이 캔버스를 가리킨다 — 실브라우저 판**(설계 `docs/superpowers/specs/2026-11-13-comment-focus-design.md`). «코멘트» 탭의 묶음에
 * 포커스가 들면 그것이 곧 고름이다 — 캔버스의 그 노드에 고른 것과 같은 링이 서고, 숨은 노드가 보이는 화면 상태로 바뀌고, 가려진 패널이
 * 펼쳐지고, 칸 밖이면 굴려 들인다. 머리 단추는 그 노드를 골라 «컴포넌트» 탭으로 간다. jsdom 판은 `test/panels/comment-focus.test.tsx` ·
 * `test/canvas/comment-pointing-ring.test.tsx`.
 *
 * jsdom 이 못 내는 것만 여기서 잰다 — Tab 차례로 묶음에 듦, 누름이 포커스를 준 뒤 클릭이 뒤따르는 차례, 고름 곧바로 뒤의 둘째 몸짓, 링의 자리.
 *
 * | 무엇이 거짓이면 죽나 |
 * |---|
 * | Tab 으로 든 묶음의 노드에 링이 안 서거나 그 노드 상자와 1px 넘게 어긋난다 · 포커스로 선택 · «달 곳» · 초안이 바뀐다 |
 * | Tab 으로 들거나 묶음 · 그 안 단추 · 글 상자를 눌러도 숨은 노드가 곧바로 안 보인다 · 글을 고르는 몸짓에 고른 글이 사라진다 |
 * | 고름 곧바로 뒤의 둘째 몸짓(구조 트리 줄 · 전환기 · 캔버스 누름 · 휠 · 페이지 옮김)이 낸 화면을 고름이 뒤에 덮는다 |
 * | 묶음 안 토큰 링크가 데려간 노드가 그 묶음의 고름(상태)에 가려진다 |
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
  async function fixture(extra: readonly { nodeId: string; body: string }[] = []): Promise<string> {
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
    for (const item of extra) await post(item.nodeId, item.body)
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
  /** 고름은 곧바로 선다 — 두 프레임 뒤 상태를 한 번 읽는다(폴로 기다리지 않는다 — 그 값을 깨는 변조가 시간 초과로 죽는다). */
  const stateIs = async (page: Page, name: string) => {
    await frames(page)
    expect(await switcherName(page)).toBe(`화면 상태: ${name}`)
  }
  /**
   * 머리 전환기에서 상태를 고른다 — 포커스가 묶음 밖으로 나간다. 앞 누름에서 더블클릭 간격을 넘겨 연다 — 같은 자리의 메뉴 항목을 간격 안에 다시
   * 누르면 둘째 누름으로 삼킨다(`src/shell/action-menu.tsx` 의 `DOUBLE_CLICK_MS`).
   */
  const chooseState = async (page: Page, name: string) => {
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /^화면 상태:/ }).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await poll(
      `상태 ${name}`,
      () => switcherName(page),
      (label) => label === `화면 상태: ${name}`,
    )
  }
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

  it('숨은 노드의 묶음 — Tab 으로 들면 곧 보이는 상태로 바뀌고 링이 선다 · 사람이 상태를 바꾼 뒤 묶음을 다시 누르면 다시 고른다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      expect(await canvasFrame(page).locator('[data-wb-id="n_b"]').count()).toBe(0)
      await tabInto(page, 'n_b')
      await stateIs(page, '관리자')
      await frames(page)
      expect(await rings(page)).toEqual(['n_b'])
      expect(await canvasFrame(page).locator('[data-wb-id="n_b"]').isVisible()).toBe(true)

      // 사람이 기본으로 되돌린다 — 포커스가 전환기로 나간다. 묶음의 맨 글(작성자 줄)을 누르면 다시 든 포커스가 고른다.
      await chooseState(page, '기본')
      await group(page, 'n_b').locator('.wb-shell-comment-author').first().click()
      await stateIs(page, '관리자')
    } finally {
      await close()
    }
  })

  it('묶음 안의 «수정» · 고치는 상자 · «삭제» 를 누르면 포커스가 들어 곧 고른다 · 그 단추의 일은 그대로 한다', async () => {
    const P = await fixture()
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      const b = group(page, 'n_b')

      // «수정» 을 누른다 — 고름(관리자)과 함께 고치는 상자가 선다.
      await b.getByRole('button', { name: '수정', exact: true }).first().click()
      const box = b.getByRole('textbox', { name: '코멘트 수정' })
      await box.waitFor()
      await stateIs(page, '관리자')

      // 사람이 기본으로 되돌린 뒤 상자를 누르면 다시 든 포커스가 고른다 — 친 글은 상자에 먹는다.
      await chooseState(page, '기본')
      await box.click()
      expect(
        await page.evaluate(() => document.activeElement?.closest('[data-comment-node]')?.getAttribute('data-comment-node') ?? null),
      ).toBe('n_b')
      await stateIs(page, '관리자')
      const typed = await box.inputValue()
      await page.keyboard.type('!')
      expect((await box.inputValue()).length).toBe(typed.length + 1)
      await b.getByRole('button', { name: '취소', exact: true }).click()

      // 키보드로 «수정» — 단추에 포커스를 두면(묶음 밖에서 듦) 고르고, Enter 는 상자를 연다.
      await chooseState(page, '기본')
      await b.getByRole('button', { name: '수정', exact: true }).first().focus()
      await stateIs(page, '관리자')
      await page.keyboard.press('Enter')
      await box.waitFor()
      await b.getByRole('button', { name: '취소', exact: true }).click()

      // «삭제» — 둘째 코멘트를 지운다(고름과 함께).
      await chooseState(page, '기본')
      await b.getByRole('button', { name: '삭제', exact: true }).last().click()
      await poll(
        '코멘트가 지워진다',
        () => b.locator('.wb-shell-comment').count(),
        (count) => count === 1,
      )
      expect(await switcherName(page)).toBe('화면 상태: 관리자')
    } finally {
      await close()
    }
  })

  /**
   * **묶음 안 토큰 링크가 데려간 노드는 그 묶음의 고름에 가려지지 않는다** — 링크를 누르면 포커스가 묶음에 든다. 그것이 고름이면 묶음의 노드를
   * 보이는 상태로 바꾼 뒤 링크가 데려간 노드를 고르는데, 데려간 노드가 그 상태에서 숨으면 고른 노드가 캔버스에 안 선다. 픽스처: `n_x` 는 기본에서만
   * 보이고(`except s_admin`), `n_b`(관리자에서만)의 코멘트가 `n_x` 의 번호를 가리킨다.
   */
  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    it(`${mode} — 묶음 안 토큰 링크가 데려간 노드가 그 묶음의 고름에 가려지지 않는다`, async () => {
      const P = await fixture()
      const pageId = P.split('/').at(-1)!
      const added = await call('PATCH', `${P}/ops`, {
        baseSeq: (await call('GET', P)).body.headSeq,
        ops: [
          {
            op: 'add',
            path: '/root/children/3',
            value: {
              id: 'n_x',
              type: 'Text',
              props: { content: '기본에서만 보이는 글' },
              visibility: { mode: 'except', states: ['s_admin'] },
            },
          },
        ],
      })
      expect(added.status).toBe(200)
      const projectId = P.split('/')[2]!
      const menu = (await call('POST', `/projects/${projectId}/menu`, { parentId: null, title: '나' })).body
      const secondId = (await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menu.id, title: '둘째' })).body.id as string
      for (const [nodeId, body] of [
        ['n_x', '엑스에 단 말'],
        ['n_b', `여기로 [엑스](wb:comment/${pageId}/n_x) 가 보세요`],
        ['n_b', `저기로 [둘째](wb:page/${secondId}) 가 보세요`],
      ] as const) {
        const res = await call('POST', `${P}/comments`, { nodeId, body })
        expect(res.status).toBe(201)
      }
      const { page, close } = await openTab(P)
      try {
        if (mode === '뷰 모드') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await openCommentTab(page)
        await canvasFrame(page).locator('[data-wb-id="n_x"]').waitFor()
        const link = group(page, 'n_b').locator('.wb-shell-comment-body a[href*="node=n_x"]')
        await link.waitFor()
        expect(await focusedGroup(page)).toBe(null)

        await link.click()
        await poll(
          '토큰이 n_x 를 데려간다',
          () => page.evaluate(() => new URL(location.href).searchParams.get('node')),
          (node) => node === null,
        )
        await page.waitForTimeout(700)
        await frames(page)
        expect({
          state: await switcherName(page),
          drawn: await canvasFrame(page).locator('[data-wb-id="n_x"]').count(),
          ...(mode === '편집 모드' ? { selected: await selectedOutline(page) } : {}),
        }).toEqual({ state: '화면 상태: 기본', drawn: 1, ...(mode === '편집 모드' ? { selected: ['n_x'] } : {}) })

        // 다른 페이지로 데려가는 토큰 — 데려간 페이지 · 돌아온 페이지 다 기본이다.
        await openCommentTab(page)
        await group(page, 'n_b').locator(`.wb-shell-comment-body a[href$="/pages/${secondId}"]`).click()
        await poll(
          '둘째 페이지가 선다',
          () => page.evaluate(() => location.pathname),
          (path) => path.endsWith(secondId),
        )
        await page.waitForTimeout(700)
        expect(await switcherName(page)).toBe('화면 상태: 기본')
        await page.goBack()
        await canvasFrame(page).locator('[data-wb-id="n_x"]').waitFor()
        await page.waitForTimeout(700)
        expect({ state: await switcherName(page), drawn: await canvasFrame(page).locator('[data-wb-id="n_x"]').count() }).toEqual({
          state: '화면 상태: 기본',
          drawn: 1,
        })
      } finally {
        await close()
      }
    })
  }

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
      await stateIs(page, '관리자')
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
      await stateIs(page, '관리자')
      await frames(page)

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

  /**
   * **글을 고르는 몸짓도 고름이다** — 묶음 안 본문을 끌어 고르기 · 두 번 · 세 번 눌러 낱말 · 줄 고르기도 포커스를 묶음에 들인다. 화면 상태가 곧바로
   * 바뀌고, 고른 글은 그대로 남는다(베낄 수 있다). 걸음마다 상태를 기본으로 되돌려 포커스를 묶음 밖으로 내고 시작한다.
   */
  const LOREM = 'lorem ipsum dolor sit amet consectetur'
  const BODY_B = '.wb-shell-comments [data-comment-node="n_b"] .wb-shell-comment-body'

  /** 그 셀렉터의 `nth` 째 요소 안 `index` 째 글자의 가운데(호스트 좌표) — 글자 노드를 차례로 훑는다. */
  async function charAt(page: Page, selector: string, nth: number, index: number): Promise<{ x: number; y: number }> {
    const point = await page.evaluate(
      ({ selector, nth, index }) => {
        const host = document.querySelectorAll(selector)[nth]
        if (host === undefined) return null
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
        let left = index
        for (let text = walker.nextNode() as Text | null; text !== null; text = walker.nextNode() as Text | null) {
          if (left < text.length) {
            const range = document.createRange()
            range.setStart(text, left)
            range.setEnd(text, left + 1)
            const rect = range.getBoundingClientRect()
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          }
          left -= text.length
        }
        return null
      },
      { selector, nth, index },
    )
    if (point === null) throw new Error(`글자가 없습니다: ${selector} ${nth} ${index}`)
    return point
  }

  const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '')
  /** 걸음마다 고른 글을 비우고 시작한다 — 앞 걸음의 고른 글 위를 누르면 다른 판이다. */
  const clearSelection = (page: Page) => page.evaluate(() => window.getSelection()?.removeAllRanges())

  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    it(`${mode} — 묶음 안 본문을 끌어 고르기 · 두 번 · 세 번 누르기도 곧바로 고르고 고른 글이 남는다`, async () => {
      const P = await fixture([{ nodeId: 'n_b', body: LOREM }])
      const { page, close } = await openTab(P)
      try {
        if (mode === '뷰 모드') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await openCommentTab(page)
        const bodies = page.locator(BODY_B)
        await poll(
          '셋째 코멘트가 선다',
          () => bodies.count(),
          (count) => count === 3,
        )
        const lorem = 2
        expect(await bodies.nth(lorem).textContent()).toBe(LOREM)

        // 끌어 고르기 — 첫 글자 바로 앞에서 열여섯째 글자까지.
        const from = await charAt(page, BODY_B, lorem, 0)
        const to = await charAt(page, BODY_B, lorem, 15)
        await page.mouse.move(from.x - 2, from.y)
        await page.mouse.down()
        for (let step = 1; step <= 10; step += 1) {
          await page.mouse.move(from.x - 2 + ((to.x - from.x + 2) * step) / 10, from.y + ((to.y - from.y) * step) / 10)
        }
        await page.mouse.up()
        await stateIs(page, '관리자')
        expect(await selectedText(page)).toBe('lorem ipsum dolo')
        expect(await focusedGroup(page)).toBe('n_b')
        expect(await rings(page)).toEqual(['n_b'])

        // 두 번 눌러 낱말.
        await chooseState(page, '기본')
        await clearSelection(page)
        const word = await charAt(page, BODY_B, lorem, 8)
        await page.mouse.dblclick(word.x, word.y)
        await stateIs(page, '관리자')
        expect(await selectedText(page)).toBe('ipsum')

        // 세 번 눌러 줄.
        await chooseState(page, '기본')
        await clearSelection(page)
        await page.mouse.click(word.x, word.y, { clickCount: 3 })
        await stateIs(page, '관리자')
        expect((await selectedText(page)).trim()).toBe(LOREM)
      } finally {
        await close()
      }
    })
  }

  /**
   * **안 보이는 탭 패널 · 접힌 검색폼 안 노드**(M2) — 화면 상태가 아니라 부모가 숨긴 노드다. 고름(포커스가 듦 · 누름 · 묶음 Enter)이면 그 노드가 보이게
   * 펼친 판으로 그리고(렌더러 `reveal` — 진짜 선택과 같은 장치) 링이 그 노드에 선다. 묶음 밖으로 떠나도 되돌리지 않고, 다른 묶음을 고르면 그 고름이
   * 이긴다. 문서는 그대로다.
   */
  async function hiddenParentFixture(): Promise<string> {
    const project = (await call('POST', '/projects', { name: '안 보이는 부모', slug: `cfh-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const panel = (id: string, label: string, inner: string) => ({
      id,
      type: 'TabPanel',
      props: { label },
      children: [{ id: inner, type: 'Text', props: { content: `${label} 안 글` } }],
    })
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: { id: 'n_top', type: 'Text', props: { content: '맨 위 글' } } },
        {
          op: 'add',
          path: '/root/children/1',
          value: {
            id: 'n_tabs',
            type: 'Tabs',
            props: { active: 0 },
            children: [panel('n_p1', '첫 탭', 'n_in1'), panel('n_p2', '둘째 탭', 'n_in2')],
          },
        },
        {
          op: 'add',
          path: '/root/children/2',
          value: {
            id: 'n_sf',
            type: 'SearchForm',
            props: { collapsed: true },
            children: [{ id: 'n_sf_in', type: 'Text', props: { content: '접힌 조건' } }],
          },
        },
      ],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    for (const nodeId of ['n_top', 'n_in2', 'n_sf_in']) {
      const res = await call('POST', `${P}/comments`, { nodeId, body: `${nodeId} 에 단 말` })
      if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    }
    return P
  }

  /** 서버 문서의 `Tabs.active` · `SearchForm.collapsed` · 번호 — 펼침이 문서를 안 바꾸는지. */
  async function serverParents(P: string): Promise<{ active: unknown; collapsed: unknown; headSeq: number }> {
    const response = await call('GET', P)
    const children = response.body.schema.root.children as { id: string; props?: Record<string, unknown> }[]
    const of = (id: string) => children.find((child) => child.id === id)?.props ?? {}
    return { active: of('n_tabs').active, collapsed: of('n_sf').collapsed, headSeq: response.body.headSeq }
  }

  const drawn = (page: Page, nodeId: string) => canvasFrame(page).locator(`[data-wb-id="${nodeId}"]`).count()

  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    it(`${mode} — 안 보이는 탭 패널 · 접힌 검색폼 안 노드의 묶음에 포커스가 들면 곧 펼쳐 그리고 링이 선다`, async () => {
      const P = await hiddenParentFixture()
      const before = await serverParents(P)
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_top"]').waitFor()
        if (mode === '뷰 모드') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await page.getByRole('tab', { name: '코멘트', exact: true }).click()
        await group(page, 'n_in2').waitFor()
        // 연 판 — 지금 탭이 아닌 패널 · 접힌 검색폼 안은 그리지 않는다(카나리아).
        expect(await drawn(page, 'n_in2')).toBe(0)
        expect(await drawn(page, 'n_sf_in')).toBe(0)
        expect(await drawn(page, 'n_in1')).toBe(1)

        // 포커스가 곧 고름 — 둘째 탭을 펼친 판으로 그리고 링이 선다.
        await group(page, 'n_in2').focus()
        await frames(page)
        expect(await drawn(page, 'n_in2')).toBe(1)
        expect(await drawn(page, 'n_in1')).toBe(0)
        expect(await rings(page)).toEqual(['n_in2'])
        const { ring, node } = await ringAndNode(page, 'n_in2')
        expect(node!.width).toBeGreaterThan(0)
        for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(ring![key] - node![key])).toBeLessThanOrEqual(1)

        // 묶음 밖(우측 «코멘트» 탭 단추)으로 떠나도 되돌리지 않는다.
        await page.getByRole('tab', { name: '코멘트', exact: true }).focus()
        await page.waitForTimeout(200)
        expect(await drawn(page, 'n_in2')).toBe(1)

        // 다른 묶음에 들면 그 고름이 이긴다 — 펼침은 하나라 둘째 탭이 걷힌다.
        await group(page, 'n_top').focus()
        await frames(page)
        expect(await rings(page)).toEqual(['n_top'])
        expect(await drawn(page, 'n_in2')).toBe(0)
        expect(await drawn(page, 'n_in1')).toBe(1)

        // 접힌 검색폼 — 묶음을 누른다.
        await group(page, 'n_sf_in').locator('.wb-shell-comment-author').first().click()
        await frames(page)
        expect(await drawn(page, 'n_sf_in')).toBe(1)
        expect(await rings(page)).toEqual(['n_sf_in'])
        // 거듭 고름(묶음 Enter)은 같은 답이다.
        await page.keyboard.press('Enter')
        await frames(page)
        expect(await drawn(page, 'n_sf_in')).toBe(1)

        // 문서는 그대로다 — 펼침은 이 화면에서만이다.
        expect(await serverParents(P)).toEqual(before)
      } finally {
        await context.close()
      }
    })
  }

  /**
   * **묶음에 포커스가 선 동안 노드 단축키가 고른 노드에 안 간다**(M3) — 링이 가리키는 노드와 고른 노드가 달라, 묶음에서 친 Delete 가 사람이 안 보는
   * 노드를 지웠다. 묶음 `li` 와 그 안(«수정» · «삭제» 단추)에서 편집 명령 · 고르기 명령이 안 선다. 묶음 안 글 상자의 글 편집 키는 글에 먹는다.
   */
  async function serverDoc(P: string): Promise<{ children: string[]; headSeq: number }> {
    const response = await call('GET', P)
    const children = (response.body.schema.root.children as { id: string }[]).map((child) => child.id)
    return { children, headSeq: response.body.headSeq }
  }
  const selectedIds = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-wb-selected-id], [data-wb-member-id]')].map(
        (element) => element.getAttribute('data-wb-selected-id') ?? element.getAttribute('data-wb-member-id'),
      ),
    )

  it('묶음 · 그 안 «수정» 단추에 포커스가 선 채 노드 단축키는 고른 노드를 안 바꾼다 — 글 상자의 키는 글에 먹는다', async () => {
    const P = await fixture([{ nodeId: 'n_c', body: '다에 단 말' }])
    const { page, close } = await openTab(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_a"]').click()
      await poll(
        'n_a 를 골랐다',
        () => selectedOutline(page),
        (list) => list.join() === 'n_a',
      )
      await openCommentTab(page)
      const before = await serverDoc(P)
      expect(before.children).toEqual(['n_a', 'n_b', 'n_c'])

      const KEYS = ['Delete', 'Backspace', 'Meta+d', 'ArrowDown', 'ArrowUp', 'Escape', 'Meta+a', 'Meta+z'] as const
      const places = [
        { name: '묶음', focus: () => group(page, 'n_c').focus() },
        { name: '«수정» 단추', focus: () => group(page, 'n_c').getByRole('button', { name: '수정', exact: true }).focus() },
      ]
      for (const place of places) {
        for (const key of KEYS) {
          await place.focus()
          await page.keyboard.press(key)
          await page.waitForTimeout(150)
          expect({ place: place.name, key, selected: await selectedIds(page) }).toEqual({ place: place.name, key, selected: ['n_a'] })
        }
      }
      await page.waitForTimeout(400)
      expect(await serverDoc(P)).toEqual(before)
      // 링은 그대로 묶음의 노드다.
      expect(await rings(page)).toEqual(['n_c'])

      // 묶음 안 글 상자 — Backspace · Cmd+A 는 글에 먹는다.
      await group(page, 'n_c').getByRole('button', { name: '수정', exact: true }).click()
      const box = group(page, 'n_c').getByRole('textbox', { name: '코멘트 수정' })
      await box.waitFor()
      await box.focus()
      await page.keyboard.press('End')
      await page.keyboard.press('Backspace')
      expect(await box.inputValue()).toBe('다에 단 ')
      await page.keyboard.press('Meta+a')
      await page.keyboard.type('새 말')
      expect(await box.inputValue()).toBe('새 말')
      expect(await selectedIds(page)).toEqual(['n_a'])
      expect(await serverDoc(P)).toEqual(before)

      // 양성 대조 — 캔버스로 포커스를 돌리면 Delete 가 고른 노드를 지운다.
      await group(page, 'n_c').getByRole('button', { name: '취소', exact: true }).click()
      await canvasFrame(page).locator('[data-wb-id="n_a"]').click()
      await page.keyboard.press('Delete')
      await poll(
        'Delete 가 n_a 를 지운다',
        () => serverDoc(P),
        (doc) => doc.headSeq > before.headSeq,
      )
      expect((await serverDoc(P)).children).toEqual(['n_b', 'n_c'])
    } finally {
      await close()
    }
  })

  /**
   * **가리킨 노드가 문서에서 사라지면 가리킴을 걷는다**(L1) — 남이 그 노드를 지우고 같은 id 로 다시 세워도(되돌리기 · 다시 붙이기) 사람 몸짓 없이 링이
   * 되살지 않는다. 쓰기는 같은 사람의 다른 탭처럼 REST 로 낸다(이 탭의 연결 id 가 없어 방송이 이 탭에 온다).
   */
  it('가리킨 노드를 남이 지웠다가 같은 id 로 다시 세워도 링이 되살지 않는다', async () => {
    const P = await fixture([{ nodeId: 'n_c', body: '다에 단 말' }])
    const { page, close } = await openTab(P)
    try {
      await openCommentTab(page)
      await group(page, 'n_c').focus()
      await frames(page)
      expect(await rings(page)).toEqual(['n_c'])
      // 포커스를 묶음 밖(상태 전환기)으로 — 사람은 다른 데를 본다. 링은 남는다(묶음 밖으로 나가기만 해서는 안 걷는다).
      await page.getByRole('button', { name: /^화면 상태:/ }).focus()
      await frames(page)
      expect(await rings(page)).toEqual(['n_c'])

      const node = { id: 'n_c', type: 'Text', props: { content: '또 다른 글' } }
      const removed = await call('PATCH', `${P}/ops`, {
        baseSeq: (await serverDoc(P)).headSeq,
        ops: [{ op: 'remove', path: '/root/children/2' }],
      })
      expect(removed.status).toBe(200)
      await poll(
        '사라진 노드로 그린다',
        () => group(page, 'n_c').textContent(),
        (text) => (text ?? '').includes('사라진 노드'),
      )
      await frames(page)
      expect(await rings(page)).toEqual([])

      const back = await call('PATCH', `${P}/ops`, {
        baseSeq: (await serverDoc(P)).headSeq,
        ops: [{ op: 'add', path: '/root/children/2', value: node }],
      })
      expect(back.status).toBe(200)
      await poll(
        '그 노드가 다시 선다',
        () => canvasFrame(page).locator('[data-wb-id="n_c"]').count(),
        (count) => count === 1,
      )
      await frames(page)
      expect(await rings(page)).toEqual([])

      // 양성 대조 — 사람이 다시 그 묶음에 들면 선다.
      await group(page, 'n_c').focus()
      await frames(page)
      expect(await rings(page)).toEqual(['n_c'])
    } finally {
      await close()
    }
  })

  /**
   * **이미 고른 노드를 가리키면 링을 따로 그리지 않는다**(L2) — 그 노드의 외곽선이 그대로 선다: 기준이면 진한 선, 여럿 고름의 옅은 것이면 가는 끊은 선.
   * 링이 옅은 외곽선을 대신하면 캔버스에 진한 실선이 둘 서 어느 쪽이 기준 노드인지 못 가른다.
   */
  it('편집 모드 — 고른 기준 · 옅은 노드를 가리키면 그 노드의 외곽선 그대로다 · 링은 따로 없다', async () => {
    const P = await fixture([{ nodeId: 'n_c', body: '다에 단 말' }])
    const { page, close } = await openTab(P)
    try {
      await canvasFrame(page).locator('[data-wb-id="n_c"]').click()
      await canvasFrame(page)
        .locator('[data-wb-id="n_a"]')
        .click({ modifiers: ['Meta'] })
      // Cmd+누른 것이 기준이 된다 — 기준 n_a · 옅은 n_c.
      await poll(
        '기준 n_a · 옅은 n_c',
        () => selectedIds(page),
        (list) => list.join() === 'n_a,n_c',
      )
      const outlines = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.wb-shell-selection, .wb-shell-selection-member')].map((element) => {
            const style = getComputedStyle(element)
            const id =
              element.getAttribute('data-wb-selected-id') ??
              element.getAttribute('data-wb-member-id') ??
              `ring:${element.getAttribute('data-wb-comment-pointed')}`
            return `${id}|${element.className}|${style.outlineStyle}`
          }),
        )
      const before = await outlines()
      expect(before).toEqual(['n_a|wb-shell-selection|solid', 'n_c|wb-shell-selection-member|dashed'])
      await openCommentTab(page)

      await group(page, 'n_a').focus()
      await frames(page)
      expect(await outlines()).toEqual(before)
      expect(await rings(page)).toEqual([])

      await group(page, 'n_c').focus()
      await frames(page)
      expect(await outlines()).toEqual(before)
      expect(await rings(page)).toEqual([])

      // 양성 대조 — 안 고른 노드를 가리키면 링이 따로 선다.
      await group(page, 'n_b').locator('.wb-shell-comment-author').first().click()
      await stateIs(page, '관리자')
      await frames(page)
      expect(await rings(page)).toEqual(['n_b'])
    } finally {
      await close()
    }
  })

  /**
   * **링이 캔버스 칸 밖에 서면 칸을 굴려 들인다**(V1) — 묶음에 포커스가 가서 링이 설 때 · 묶음을 고를 때 · 머리 단추로 고를 때, 그 노드가 캔버스 칸
   * (`.wb-shell-canvas`)의 보이는 구간에 다 안 들면 가장 가까운 쪽으로 굴린다(이미 보이면 안 굴린다 — `block: 'nearest'` 와 같은 뜻). 칸의 `scrollTop`
   * 쓰기를 setter 로 세어 한 번만 굴리는지, 다른 스크롤 상자(문서 · 우측 패널)가 그 사이 움직였는지를 최댓값으로 잰다.
   */
  async function longFixture(): Promise<string> {
    const project = (await call('POST', '/projects', { name: '긴 페이지', slug: `cfl-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const ops = Array.from({ length: 70 }, (_, i) => ({
      op: 'add',
      path: `/root/children/${i}`,
      value: { id: `n_t${i}`, type: 'Text', props: { content: `줄 ${i} 글` } },
    }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    for (const nodeId of ['n_t0', 'n_t35', 'n_t62', 'n_t69']) {
      const res = await call('POST', `${P}/comments`, { nodeId, body: `${nodeId} 에 단 말` })
      if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    }
    return P
  }

  /** 칸의 `scrollTop` 쓰기를 세고, 칸 밖 스크롤 상자들의 움직임 최댓값을 모은다. */
  async function watchScrolls(page: Page): Promise<void> {
    await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('.wb-shell-canvas')
      if (pane === null) throw new Error('캔버스 칸이 없습니다')
      const box = window as unknown as { __writes: number[]; __jumps: Record<string, number> }
      box.__writes = []
      box.__jumps = {}
      const own = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!
      Object.defineProperty(pane, 'scrollTop', {
        configurable: true,
        get() {
          return own.get!.call(this)
        },
        set(value: number) {
          const before = own.get!.call(this) as number
          own.set!.call(this, value)
          box.__writes.push((own.get!.call(this) as number) - before)
        },
      })
      // 문서는 넘치지 않아도 잰다 — 칸 밖까지 굴리는 장치(`scrollIntoView`)가 가장 먼저 움직이는 상자다.
      const page = document.scrollingElement as Element
      const scrollers = [
        page,
        ...[...document.querySelectorAll('*')].filter(
          (element) => element !== pane && element !== page && element.scrollHeight > element.clientHeight,
        ),
      ]
      scrollers.forEach((element, index) => {
        const name = `${element.tagName.toLowerCase()}.${(element.className || '').toString().split(' ')[0]}#${index}`
        const start = element.scrollTop
        box.__jumps[name] = 0
        const target = element === document.scrollingElement ? window : element
        target.addEventListener('scroll', () => {
          box.__jumps[name] = Math.max(box.__jumps[name]!, Math.abs(element.scrollTop - start))
        })
      })
    })
  }
  const scrollLog = (page: Page) =>
    page.evaluate(() => {
      const box = window as unknown as { __writes: number[]; __jumps: Record<string, number> }
      const moved = Object.entries(box.__jumps).filter(([, value]) => value !== 0)
      // 쓰기는 값이 안 바뀐 것(맨 위에서 위로)도 센다 — 안 굴려야 할 때 쓴 것이다.
      return { writes: box.__writes.length, moved, scrollers: Object.keys(box.__jumps).length }
    })
  /** 그 노드의 외곽선(링 · 고른 외곽선)이 칸의 보이는 구간에 다 드는가 — 위 · 아래 끝과 칸의 위 · 아래 끝. */
  const inPane = (page: Page, selector: string) =>
    page.evaluate((selector) => {
      const pane = document.querySelector('.wb-shell-canvas')!.getBoundingClientRect()
      const ring = document.querySelector(selector)?.getBoundingClientRect() ?? null
      return ring === null
        ? null
        : { inside: ring.top >= pane.top && ring.bottom <= pane.bottom, top: ring.top, bottom: ring.bottom, pane: [pane.top, pane.bottom] }
    }, selector)
  const paneScroll = (page: Page) => page.evaluate(() => document.querySelector('.wb-shell-canvas')!.scrollTop)

  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    it(`${mode} — 링이 캔버스 칸 밖에 서면 가장 가까운 쪽으로 한 번 굴려 들인다 · 이미 보이면 안 굴린다`, async () => {
      const P = await longFixture()
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_t69"]').waitFor()
        if (mode === '뷰 모드') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
        await page.getByRole('tab', { name: '코멘트', exact: true }).click()
        await group(page, 'n_t69').waitFor()
        // 판 카나리아 — 칸이 페이지보다 짧아 굴릴 자리가 있다.
        const room = await page.evaluate(() => {
          const pane = document.querySelector('.wb-shell-canvas')!
          return pane.scrollHeight - pane.clientHeight
        })
        expect(room).toBeGreaterThan(500)
        expect(await paneScroll(page)).toBe(0)
        await watchScrolls(page)

        // 이미 보이는 노드 — 안 굴린다.
        await group(page, 'n_t0').focus()
        await frames(page)
        expect(await rings(page)).toEqual(['n_t0'])
        expect((await scrollLog(page)).writes).toBe(0)

        // 칸 밖(아래) 노드 — 한 번 굴려 들인다.
        await group(page, 'n_t69').focus()
        await frames(page)
        expect(await rings(page)).toEqual(['n_t69'])
        const below = await inPane(page, '[data-wb-comment-pointed="n_t69"]')
        expect(below?.inside).toBe(true)
        // 아래에서 왔으니 칸 아래 끝에 붙는다(위 끝 맞춤이 아니다).
        expect(below!.pane[1]! - below!.bottom).toBeLessThanOrEqual(12)
        expect((await scrollLog(page)).writes).toBe(1)
        const down = await paneScroll(page)
        expect(down).toBeGreaterThan(0)

        // 칸 가운데쯤 보이는 노드 — 안 굴린다.
        await group(page, 'n_t62').focus()
        await frames(page)
        expect(await rings(page)).toEqual(['n_t62'])
        const middle = await inPane(page, '[data-wb-comment-pointed="n_t62"]')
        expect(middle?.inside).toBe(true)
        expect(middle!.pane[1]! - middle!.bottom).toBeGreaterThan(50)
        expect((await scrollLog(page)).writes).toBe(1)
        expect(await paneScroll(page)).toBe(down)

        // 칸 밖(위) 노드 — 칸 위 끝에 붙고, 굴린 양이 맨 위까지가 아니다.
        await group(page, 'n_t35').focus()
        await frames(page)
        const above = await inPane(page, '[data-wb-comment-pointed="n_t35"]')
        expect(above?.inside).toBe(true)
        expect(above!.top - above!.pane[0]!).toBeLessThanOrEqual(12)
        const mid = await paneScroll(page)
        expect(mid).toBeLessThan(down)
        expect(mid).toBeGreaterThan(0)
        expect((await scrollLog(page)).writes).toBe(2)

        // 고름(포커스가 선 묶음의 작성자 줄 누름) — 이미 보여 더 안 굴린다.
        await group(page, 'n_t35').locator('.wb-shell-comment-author').first().click()
        await frames(page)
        expect((await scrollLog(page)).writes).toBe(2)

        // 사람이 칸을 굴려 링을 밀어내면 끌려오지 않는다 — 다시 재는 때(줌)에도 칸에 안 쓴다.
        const pane = await page.locator('.wb-shell-canvas').boundingBox()
        await page.mouse.move(pane!.x + pane!.width / 2, pane!.y + pane!.height / 2)
        await page.mouse.wheel(0, 700)
        await poll(
          '휠이 칸을 굴린다',
          () => inPane(page, '[data-wb-comment-pointed="n_t35"]'),
          (place) => place !== null && !place.inside,
        )
        await page.getByRole('group', { name: '줌' }).getByRole('button', { name: '축소', exact: true }).click()
        await frames(page)
        await page.waitForTimeout(200)
        expect(await rings(page)).toEqual(['n_t35'])
        expect((await inPane(page, '[data-wb-comment-pointed="n_t35"]'))?.inside).toBe(false)
        expect((await scrollLog(page)).writes).toBe(2)

        // 같은 묶음을 다시 고르면(링은 그대로) 다시 들인다 — 고름은 사람의 몸짓이다. 포커스는 «축소» 단추에 있어 누름이 다시 든 포커스다.
        await group(page, 'n_t35').locator('.wb-shell-comment-author').first().click()
        await frames(page)
        expect((await inPane(page, '[data-wb-comment-pointed="n_t35"]'))?.inside).toBe(true)
        expect((await scrollLog(page)).writes).toBe(3)

        // 포커스가 선 채 휠로 밀어낸 뒤 그 묶음을 다시 누름 — 새 `focus` 없이 누름이 고른다.
        await page.mouse.move(pane!.x + pane!.width / 2, pane!.y + pane!.height / 2)
        await page.mouse.wheel(0, 700)
        await poll(
          '휠이 칸을 굴린다',
          () => inPane(page, '[data-wb-comment-pointed="n_t35"]'),
          (place) => place !== null && !place.inside,
        )
        expect(await focusedGroup(page)).toBe('n_t35')
        await group(page, 'n_t35').locator('.wb-shell-comment-author').first().click()
        await frames(page)
        expect((await inPane(page, '[data-wb-comment-pointed="n_t35"]'))?.inside).toBe(true)
        expect((await scrollLog(page)).writes).toBe(4)

        if (mode === '편집 모드') {
          // 머리 단추로 고른 진짜 선택 — 칸 밖이면 굴려 들인다.
          await group(page, 'n_t69').locator('.wb-shell-comment-group-pick').click()
          await frames(page)
          expect(await selectedOutline(page)).toEqual(['n_t69'])
          expect((await inPane(page, '[data-wb-selected-id="n_t69"]'))?.inside).toBe(true)
          expect((await scrollLog(page)).writes).toBe(5)
        }

        // 튐 — 칸 밖의 스크롤 상자는 그 사이 안 움직였다.
        const log = await scrollLog(page)
        expect(log.scrollers).toBeGreaterThan(0)
        expect(log.moved).toEqual([])
      } finally {
        await context.close()
      }
    })
  }

  /**
   * **고름 곧바로 뒤의 둘째 몸짓을 고름이 덮지 않는다** — 고름은 묶음에 포커스가 드는 그 렌더에 선다. 묶음을 누른 뒤 더블클릭 간격(500ms) 안에
   * 구조 트리 줄 · 전환기 · 캔버스 누름 · 휠 · 페이지 옮김을 해도, 그 몸짓이 낸 화면이 700ms 뒤에도 그대로다. 둘째 몸짓까지의 틈을 재서 간격 안인지를
   * 카나리아로 둔다(간격 밖이면 늦게 서는 고름이 있어도 이 판이 못 가른다). 두 페이지는 같은 id 의 문서다 — 옮겨 간 페이지에 같은 노드가 있다.
   */
  const GESTURE_DOC = [
    {
      op: 'add',
      path: '/viewStates',
      value: [
        { id: 's_admin', name: '관리자' },
        { id: 's_guest', name: '손님' },
      ],
    },
    { op: 'add', path: '/root/children/0', value: { id: 'n_top', type: 'Text', props: { content: '맨 위 글' } } },
    {
      op: 'add',
      path: '/root/children/1',
      value: { id: 'n_b', type: 'Text', props: { content: '관리자 글' }, visibility: { mode: 'only', states: ['s_admin'] } },
    },
    {
      op: 'add',
      path: '/root/children/2',
      value: {
        id: 'n_tabs',
        type: 'Tabs',
        props: { active: 0 },
        children: [
          {
            id: 'n_p1',
            type: 'TabPanel',
            props: { label: '첫 탭' },
            children: [{ id: 'n_in1', type: 'Text', props: { content: '첫 탭 안 글' } }],
          },
          {
            id: 'n_p2',
            type: 'TabPanel',
            props: { label: '둘째 탭' },
            children: [{ id: 'n_in2', type: 'Text', props: { content: '둘째 탭 안 글' } }],
          },
        ],
      },
    },
    {
      op: 'add',
      path: '/root/children/3',
      value: {
        id: 'n_btn1',
        type: 'Button',
        props: { label: '첫 탭으로' },
        interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: 'n_p1' }] }],
      },
    },
  ]

  async function gestureFixture(): Promise<{ first: string; second: string }> {
    const project = (await call('POST', '/projects', { name: '둘째 몸짓', slug: `cfg-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const paths: string[] = []
    for (const title of ['첫째', '둘째']) {
      const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title })).body.id as string
      const P = `/projects/${project.id}/pages/${pageId}`
      const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: GESTURE_DOC })
      if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
      paths.push(P)
    }
    const [first, second] = paths as [string, string]
    for (const nodeId of ['n_top', 'n_b', 'n_in2']) {
      const res = await call('POST', `${first}/comments`, { nodeId, body: `${nodeId} 에 단 말` })
      if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    }
    return { first, second }
  }

  /** 첫째 페이지를 열고(뷰 모드면 옮기고) «코멘트» 탭에 선다. */
  async function openGesture(first: string, mode: '편집 모드' | '뷰 모드') {
    const opened = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    const { page } = opened
    await page.goto(first)
    await canvasFrame(page).locator('[data-wb-id="n_top"]').waitFor()
    if (mode === '뷰 모드') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
    await page.getByRole('tab', { name: '코멘트', exact: true }).click()
    await group(page, 'n_in2').waitFor()
    return opened
  }

  /** 묶음의 작성자 줄을 누르고 곧 `then` 을 한다 — 누른 때부터 `then` 이 끝날 때까지의 틈(ms)을 돌려준다. */
  async function pickThen(page: Page, nodeId: string, then: () => Promise<void>): Promise<number> {
    await group(page, nodeId).locator('.wb-shell-comment-author').first().click()
    const pressed = Date.now()
    await then()
    return Date.now() - pressed
  }

  /** 늦게 서는 고름이 있으면 섰을 때까지 기다린다 — 더블클릭 간격(500ms)보다 넉넉히. */
  const later = (page: Page) => page.waitForTimeout(700)
  const stateQuery = (page: Page) => page.evaluate(() => new URL(location.href).searchParams.get('state'))

  it('편집 모드 — 묶음을 누른 곧 뒤 구조 트리 줄로 고른 노드가 캔버스에 그려진 채 남는다', async () => {
    const { first } = await gestureFixture()
    const { context, page } = await openGesture(first, '편집 모드')
    try {
      const gap = await pickThen(page, 'n_in2', () =>
        page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_in1"] .wb-shell-structure-node').click(),
      )
      expect(gap).toBeLessThan(450)
      await later(page)
      await frames(page)
      expect({
        selected: await selectedOutline(page),
        in1: await drawn(page, 'n_in1'),
        in2: await drawn(page, 'n_in2'),
      }).toEqual({ selected: ['n_in1'], in1: 1, in2: 0 })
    } finally {
      await context.close()
    }
  })

  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    it(`${mode} — 묶음을 누른 곧 뒤 전환기에서 고른 상태가 남는다`, async () => {
      const { first } = await gestureFixture()
      const { context, page } = await openGesture(first, mode)
      try {
        const gap = await pickThen(page, 'n_b', async () => {
          await page.getByRole('button', { name: /^화면 상태:/ }).click()
          await page.getByRole('menuitemradio', { name: '손님', exact: true }).click()
        })
        expect(gap).toBeLessThan(450)
        await later(page)
        expect(await switcherName(page)).toBe('화면 상태: 손님')
        if (mode === '뷰 모드') expect(await stateQuery(page)).toBe('s_guest')
      } finally {
        await context.close()
      }
    })
  }

  it('뷰 모드 — 묶음을 누른 곧 뒤 캔버스 누름 · 단추의 탭 바꿈이 남는다', async () => {
    const { first } = await gestureFixture()
    const { context, page } = await openGesture(first, '뷰 모드')
    try {
      // 캔버스의 다른 노드를 누름 — 펼침이 걷혀 문서의 탭(첫 탭)이다.
      const gap = await pickThen(page, 'n_in2', () => canvasFrame(page).locator('[data-wb-id="n_top"]').click())
      expect(gap).toBeLessThan(450)
      await later(page)
      await frames(page)
      expect({ in1: await drawn(page, 'n_in1'), in2: await drawn(page, 'n_in2') }).toEqual({ in1: 1, in2: 0 })

      // 단추의 상호작용(`switchTab` → 첫 탭) — 펼친 둘째 탭을 고른 곧 뒤 누른다.
      await group(page, 'n_top').focus()
      const gap2 = await pickThen(page, 'n_in2', () => canvasFrame(page).locator('[data-wb-id="n_btn1"]').click())
      expect(gap2).toBeLessThan(450)
      await later(page)
      await frames(page)
      expect({ in1: await drawn(page, 'n_in1'), in2: await drawn(page, 'n_in2') }).toEqual({ in1: 1, in2: 0 })
    } finally {
      await context.close()
    }
  })

  it('편집 모드 — 묶음을 누른 곧 뒤 휠로 굴린 칸이 끌려오지 않는다', async () => {
    const P = await longFixture()
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_t69"]').waitFor()
      await page.getByRole('tab', { name: '코멘트', exact: true }).click()
      await group(page, 'n_t35').waitFor()
      const pane = await page.locator('.wb-shell-canvas').boundingBox()
      const gap = await pickThen(page, 'n_t35', async () => {
        await page.mouse.move(pane!.x + pane!.width / 2, pane!.y + pane!.height / 2)
        await page.mouse.wheel(0, 900)
      })
      expect(gap).toBeLessThan(450)
      await poll(
        '휠이 칸을 굴려 링이 칸 밖이다',
        () => inPane(page, '[data-wb-comment-pointed="n_t35"]'),
        (place) => place !== null && !place.inside,
      )
      const wheeled = await paneScroll(page)
      await later(page)
      expect(await paneScroll(page)).toBe(wheeled)
      expect((await inPane(page, '[data-wb-comment-pointed="n_t35"]'))?.inside).toBe(false)
    } finally {
      await context.close()
    }
  })

  for (const mode of ['편집 모드', '뷰 모드'] as const) {
    it(`${mode} — 묶음을 누른 곧 뒤 옮겨 간 페이지(같은 id 의 문서)에 그 고름이 닿지 않는다`, async () => {
      const { first, second } = await gestureFixture()
      const { context, page } = await openGesture(first, mode)
      const secondId = second.split('/').at(-1)!
      try {
        for (const nodeId of ['n_b', 'n_in2']) {
          if (nodeId === 'n_in2') {
            await page.goto(first)
            await canvasFrame(page).locator('[data-wb-id="n_top"]').waitFor()
            if (mode === '뷰 모드') await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
            await page.getByRole('tab', { name: '코멘트', exact: true }).click()
            await group(page, nodeId).waitFor()
          }
          const gap = await pickThen(page, nodeId, () => page.getByRole('link', { name: '둘째', exact: true }).click())
          expect(gap).toBeLessThan(450)
          await poll(
            '둘째 페이지가 선다',
            () => page.evaluate(() => location.pathname),
            (path) => path.endsWith(secondId),
          )
          await canvasFrame(page).locator('[data-wb-id="n_top"]').waitFor()
          await later(page)
          await frames(page)
          expect({
            nodeId,
            state: await switcherName(page),
            query: await stateQuery(page),
            in1: await drawn(page, 'n_in1'),
            in2: await drawn(page, 'n_in2'),
          }).toEqual({ nodeId, state: '화면 상태: 기본', query: null, in1: 1, in2: 0 })
        }
      } finally {
        await context.close()
      }
    })
  }

  it('편집 모드 — 우측 탭을 옮겼다 «코멘트» 로 돌아와도 다시 고르지 않는다', async () => {
    const { first } = await gestureFixture()
    const { context, page } = await openGesture(first, '편집 모드')
    try {
      await group(page, 'n_b').focus()
      await stateIs(page, '관리자')
      await chooseState(page, '기본')
      await page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
      await page.getByRole('tab', { name: '코멘트', exact: true }).click()
      await group(page, 'n_b').waitFor()
      await later(page)
      expect(await focusedGroup(page)).toBe(null)
      expect(await switcherName(page)).toBe('화면 상태: 기본')
    } finally {
      await context.close()
    }
  })
})
