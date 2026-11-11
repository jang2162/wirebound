/**
 * **코멘트 토큰 리뷰 대응 — 에디터 실브라우저 판**(리뷰 `docs/superpowers/plans/2026-11-11-rv-tk-report.md` M1 · M3 · L2 · L3 의 탐침을 옮겼다).
 * 번들 판은 `comment-token-bundle.test.ts`. jsdom 판은 `test/panels/comment-token-picker.test.tsx`.
 *
 * | 무엇이 거짓이면 죽나 |
 * |---|
 * | M1 페이지 제목의 방향 제어 글자(RLO)가 토큰 뒤의 글(«끝 글»)까지 뒤집는다 |
 * | M3 고치는 상자에서 든 토큰의 라벨 «#1» 뒤로 캐럿만 옮겨도 목록이 서고 Enter 가 후보를 골라 본문을 깬다 |
 * | M3 보통 글 «#12» 뒤로 캐럿을 옮겨 친 Enter 가 줄을 안 바꾸고 후보를 고른다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const RLO = String.fromCharCode(0x202e)
const PICKER = '[role="listbox"][aria-label="넣을 토큰"]'

describe.skipIf(!전제.ok)('코멘트 토큰 리뷰 대응 — 실브라우저', () => {
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

  async function project(): Promise<{ id: string; menu: string }> {
    const created = (
      await call('POST', '/projects', {
        name: '토큰 리뷰',
        slug: `tkr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      })
    ).body
    const menu = (await call('POST', `/projects/${created.id}/menu`, { parentId: null, title: '회원' })).body
    return { id: created.id as string, menu: menu.id as string }
  }

  async function page(projectId: string, menuId: string, title: string, nodes: unknown[]): Promise<string> {
    const res = await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menuId, title })
    if (res.status >= 300) throw new Error(`page ${res.status} ${JSON.stringify(res.body)}`)
    const pageId = res.body.id as string
    const seeded = await call('PATCH', `/projects/${projectId}/pages/${pageId}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return pageId
  }

  async function post(projectId: string, pageId: string, nodeId: string, body: string): Promise<string> {
    const res = await call('POST', `/projects/${projectId}/pages/${pageId}/comments`, { nodeId, body })
    if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    return res.body.comment.id as string
  }

  async function openComments(tab: Page, projectId: string, pageId: string, nodeId: string): Promise<void> {
    await tab.goto(`/projects/${projectId}/pages/${pageId}`)
    await canvasFrame(tab).locator(`[data-wb-id="${nodeId}"]`).waitFor()
    await tab.getByRole('tab', { name: '코멘트', exact: true }).click()
    await tab.locator('.wb-shell-comments .wb-shell-comment-body').first().waitFor()
  }

  it('M1 — 페이지 제목의 방향 제어 글자가 토큰 뒤의 글을 뒤집지 않는다', async () => {
    const p = await project()
    const list = await page(p.id, p.menu, '목록', [{ id: 'n_a', type: 'Text', props: { content: '목록 글' } }])
    const evil = await page(p.id, p.menu, `${RLO}뒤집`, [{ id: 'n_e', type: 'Text', props: { content: 'e' } }])
    await post(p.id, list, 'n_a', `방향 [x](wb:page/${evil}) 끝 글`)

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await openComments(tab, p.id, list, 'n_a')
      // 판 카나리아 — 토큰이 링크로 풀렸다(색인을 읽었다).
      await tab.locator('.wb-shell-comments .wb-shell-comment-body a').waitFor()
      const order = await tab.evaluate(() => {
        const body = [...document.querySelectorAll('.wb-shell-comments .wb-shell-comment-body')].find((el) =>
          el.textContent!.startsWith('방향'),
        )!
        const last = body.lastChild as Text
        const at = last.textContent!.indexOf('끝 글')
        const x = (i: number): number => {
          const range = document.createRange()
          range.setStart(last, i)
          range.setEnd(last, i + 1)
          return range.getBoundingClientRect().left
        }
        return { at, end: x(at), geul: x(at + 2) }
      })
      expect(order.at).toBeGreaterThanOrEqual(0)
      // 왼쪽에서 오른쪽으로 «끝» 이 «글» 보다 앞에 선다.
      expect(order.end).toBeLessThan(order.geul)
    } finally {
      await context.close()
    }
  })

  it('M3 — 고치는 상자에서 든 토큰 라벨 뒤로 캐럿만 옮기면 목록이 안 서고 Enter 는 줄을 바꾼다', async () => {
    const p = await project()
    const list = await page(p.id, p.menu, '목록', [{ id: 'n_a', type: 'Text', props: { content: '목록 글' } }])
    await post(p.id, list, 'n_a', '먼저 단 말')
    const editable = await post(p.id, list, 'n_a', `[#1](wb:comment/${list}/n_a) 뒤 글`)

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await openComments(tab, p.id, list, 'n_a')
      await tab.locator('.wb-shell-comment', { hasText: '뒤 글' }).getByRole('button', { name: '수정' }).click()
      const box = tab.locator(`#wb-comment-edit-${editable}`)
      await box.waitFor()
      const raw = await box.inputValue()
      const caret = raw.indexOf('#1') + 2
      await box.click()
      await tab.keyboard.press('Meta+ArrowUp')
      for (let i = 0; i < caret; i++) await tab.keyboard.press('ArrowRight')
      await tab.waitForTimeout(300)
      // 판 카나리아 — 캐럿이 «#1» 뒤에 섰다.
      expect(await box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(caret)
      expect(await tab.locator(PICKER).count()).toBe(0)
      await tab.keyboard.press('Enter')
      await tab.waitForTimeout(300)
      expect(await box.inputValue()).toBe(`${raw.slice(0, caret)}\n${raw.slice(caret)}`)
    } finally {
      await context.close()
    }
  })

  it('M3 — 보통 글 «#12» 뒤로 캐럿을 옮겨 친 Enter 는 줄을 바꾼다', async () => {
    const p = await project()
    const list = await page(p.id, p.menu, '목록', [{ id: 'n_a', type: 'Text', props: { content: '목록 글' } }])
    // «12» 로 걸리는 후보가 있다 — 고치기 전 판에서는 Enter 가 이것을 골랐다.
    await page(p.id, p.menu, '상세 12', [{ id: 'n_d', type: 'Text', props: { content: 'd' } }])
    const editable = await post(p.id, list, 'n_a', '이슈 #12 참고')

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await openComments(tab, p.id, list, 'n_a')
      await tab.locator('.wb-shell-comment', { hasText: '참고' }).getByRole('button', { name: '수정' }).click()
      const box = tab.locator(`#wb-comment-edit-${editable}`)
      await box.waitFor()
      const raw = await box.inputValue()
      const caret = raw.indexOf('#12') + 3
      await box.click()
      await tab.keyboard.press('Meta+ArrowUp')
      for (let i = 0; i < caret; i++) await tab.keyboard.press('ArrowRight')
      await tab.waitForTimeout(300)
      expect(await box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(caret)
      await tab.keyboard.press('Enter')
      await tab.waitForTimeout(300)
      expect(await box.inputValue()).toBe(`${raw.slice(0, caret)}\n${raw.slice(caret)}`)
      // 대조 — 새로 친 `#` 로는 목록이 선다.
      await tab.keyboard.type(' #')
      await tab.locator(PICKER).waitFor()
    } finally {
      await context.close()
    }
  })
})
