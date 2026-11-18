/**
 * **로그인 화면 — 실브라우저 판**(`src/routes/login.tsx` · `src/account/password-input.tsx`). jsdom 은 포커스를 누름으로 옮기지 않아(`fireEvent.click`)
 * «토글을 눌러도 포커스가 칸에 남는다» 를 못 잰다 — 칸 구조 · 이름 · `type` 은 `test/routes/login.test.tsx`.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | «보기» 토글 | 칸에 글을 치고 토글을 실클릭하면 `activeElement` 가 칸 그대로 · 이어 친 글이 끝에 붙는다 · 토글이 칸 상자 안 오른쪽에 서고 친 글 자리(칸의 안쪽 여백 밖)와 안 겹친다 |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('로그인 화면 — 실브라우저', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('«보기» 를 누르면 칸이 글로 보이고 포커스는 칸에 남아 이어 친 글이 끝에 붙는다', async () => {
    const context = await stack.browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      const page = await context.newPage()
      await page.goto(`${stack.webUrl}/login`)
      const field = page.getByLabel('비밀번호', { exact: true })
      await field.click()
      await page.keyboard.type('abc')
      const toggle = page.getByRole('button', { name: '비밀번호 보기', exact: true })
      await toggle.click()
      await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).waitFor()
      const focused = await page.evaluate(() => document.activeElement?.id ?? null)
      await page.keyboard.type('def')
      const after = await field.evaluate((el) => ({ type: (el as HTMLInputElement).type, value: (el as HTMLInputElement).value }))
      const boxes = await page.evaluate(() => {
        const input = document.getElementById('login-password')!
        const button = input.parentElement!.querySelector('button')!
        const i = input.getBoundingClientRect()
        const b = button.getBoundingClientRect()
        const textRight = i.right - parseFloat(getComputedStyle(input).paddingRight)
        return {
          inside: b.left >= i.left && b.right <= i.right && b.top >= i.top && b.bottom <= i.bottom,
          clearOfText: b.left >= textRight,
        }
      })
      expect({ focused, ...after, ...boxes }).toEqual({
        focused: 'login-password',
        type: 'text',
        value: 'abcdef',
        inside: true,
        clearOfText: true,
      })
    } finally {
      await context.close()
    }
  })
})
