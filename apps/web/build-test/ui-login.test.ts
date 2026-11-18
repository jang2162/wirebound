/**
 * **로그인 화면 — 실브라우저 판**(`src/routes/login.tsx` · `src/account/password-input.tsx`). jsdom 은 포커스를 누름으로 옮기지 않아(`fireEvent.click`)
 * «토글을 눌러도 포커스가 칸에 남는다» 를 못 잰다 — 칸 구조 · 이름 · `type` 은 `test/routes/login.test.tsx`.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | «보기» 토글 | 칸에 글을 치고 토글을 실클릭하면 `activeElement` 가 칸 그대로 · 이어 친 글이 끝에 붙는다 · 토글이 칸 상자 안 오른쪽에 서고 친 글 자리(칸의 안쪽 여백 밖)와 안 겹친다 |
 * | 가운데 카드 | 창 1280×800 에서 카드 가운데가 창 가운데(±2px) · 라벨 13px · 칸 높이 ≥ 40 · 재설정 안내가 카드 안. 창 390×320(카드가 창보다 길다)에서 카드 위끝이 창 안(가운데 맞춤이 넘쳐도 위가 안 잘린다 — `safe`) · 가로 넘침 0 |
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

  it('카드가 창 가운데에 서고 라벨 13px · 칸 높이 40 이며, 짧은 창에서도 위가 안 잘린다', async () => {
    const seen: Record<string, unknown> = {}
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 320 },
    ]) {
      const context = await stack.browser.newContext({ viewport })
      try {
        const page = await context.newPage()
        await page.goto(`${stack.webUrl}/login`)
        await page.getByLabel('이메일', { exact: true }).waitFor()
        seen[`${viewport.width}x${viewport.height}`] = await page.evaluate(() => {
          const card = document.querySelector('.wb-shell-login-card')!.getBoundingClientRect()
          const label = document.querySelector('.wb-shell-login-label')!
          const input = document.getElementById('login-email')!.getBoundingClientRect()
          const hint = document.querySelector('.wb-shell-login-hint')
          return {
            dx: Math.round(card.left + card.width / 2 - window.innerWidth / 2),
            dy: Math.round(card.top + card.height / 2 - window.innerHeight / 2),
            top: Math.round(card.top),
            labelPx: getComputedStyle(label).fontSize,
            inputH: Math.round(input.height),
            hintInCard: hint !== null && hint.closest('.wb-shell-login-card') !== null,
            overflowX: document.documentElement.scrollWidth - window.innerWidth,
          }
        })
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[로그인 카드]', JSON.stringify(seen))
    const wide = seen['1280x800'] as { dx: number; dy: number; labelPx: string; inputH: number; hintInCard: boolean; overflowX: number }
    const short = seen['390x320'] as { top: number; overflowX: number; labelPx: string }
    expect({
      centered: Math.abs(wide.dx) <= 2 && Math.abs(wide.dy) <= 2,
      labelPx: wide.labelPx,
      tall: wide.inputH >= 40,
      hintInCard: wide.hintInCard,
      shortTopInView: short.top >= 0,
      overflowX: [wide.overflowX, short.overflowX],
    }).toEqual({ centered: true, labelPx: '13px', tall: true, hintInCard: true, shortTopInView: true, overflowX: [0, 0] })
  })
})
