/**
 * **`#` 자동완성 — 한글 조합 중의 Enter 는 고르지 않는다**(Review Focus 4). jsdom 은 Chrome 의 조합 차례(조합 중 `keydown` 의 `isComposing`)를
 * 못 내 실브라우저로 잰다 — CDP `Input.imeSetComposition` 으로 조합을 세운다(`editor-shell-modal.test.ts` 의 같은 꼴). jsdom 판은
 * `test/panels/comment-token-picker.test.tsx`.
 *
 * | 무엇이 거짓이면 죽나 |
 * |---|
 * | 조합 중 Enter 가 후보를 골라 토큰을 넣는다 |
 * | 조합이 끝난 뒤 그 글로 안 거른다 · Enter 로 안 고른다 |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('# 자동완성 — 한글 조합 · 실브라우저', () => {
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

  it('조합 중 Enter 는 안 고르고, 조합이 끝난 뒤 그 글로 걸러 Enter 로 고른다', async () => {
    const project = (await call('POST', '/projects', { name: '토큰 고르기', slug: `tp-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원' })).body
    const list = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '목록' })).body.id as string
    const detail = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '상세' })).body.id as string
    const seeded = await call('PATCH', `/projects/${project.id}/pages/${list}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_a', type: 'Text', props: { content: '목록 글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    const posted = await call('POST', `/projects/${project.id}/pages/${list}/comments`, { nodeId: 'n_a', body: '먼저 단 말' })
    if (posted.status !== 201) throw new Error(`comment ${posted.status}`)

    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await page.goto(`/projects/${project.id}/pages/${list}`)
      await canvasFrame(page).locator('[data-wb-id="n_a"]').waitFor()
      await page.getByRole('tab', { name: '코멘트', exact: true }).click()
      const box = page.getByLabel('새 코멘트', { exact: true })
      await poll('상자가 열린다', () => box.isEnabled(), Boolean)
      await box.click()
      await page.keyboard.type('#')
      const listbox = page.locator('[role="listbox"][aria-label="넣을 토큰"]')
      // 판 카나리아 — `#` 로 목록이 섰다(조합 판이 열린 목록 위에서 선다).
      await listbox.waitFor()
      const before = await listbox.locator('[role="option"]').count()
      expect(before).toBeGreaterThan(1)

      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', { text: '상', selectionStart: 1, selectionEnd: 1 })
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
      const during = await box.inputValue()
      expect(during).not.toContain('](wb:')

      await cdp.send('Input.insertText', { text: '상' })
      await poll(
        '조합이 끝난 뒤 그 글로 거른다',
        () => listbox.locator('[role="option"] .wb-shell-comment-picker-label').allTextContents(),
        (labels) => labels.length > 0 && labels.length < before,
        5_000,
      )
      const labels = await listbox.locator('[role="option"] .wb-shell-comment-picker-label').allTextContents()
      expect(labels).toEqual(['상세'])
      await page.keyboard.press('Enter')
      await poll(
        '고른다',
        () => box.inputValue(),
        (value) => value.includes('](wb:'),
        5_000,
      )
      // 조합 중 Enter 가 낸 줄바꿈(있다면)은 그대로 두고 토큰 자리만 본다.
      expect((await box.inputValue()).replace(/\n/g, '')).toBe(`[상세](wb:page/${detail})`)
    } finally {
      await context.close()
    }
  })
})
