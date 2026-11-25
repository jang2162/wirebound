/**
 * **공통코드 화면 다듬기 — 실브라우저**(`src/codes/codes-screen.tsx`). 머리 단추 · 표 줄의 세로 맞춤, 그룹 찾기의 한글 조합, 목록 칸이 따로 구르는지.
 * 넘침 · 카드 접힘은 `codes-screen.test.ts`, 흐름(만들기 · 지우기 · 사용처 이동 · 찾기 거름)은 jsdom `test/codes/codes-screen.test.tsx`.
 *
 * | 판 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 머리 | 고른 그룹 머리의 «항목 추가» · «…» 가운데 y 차 ≤ 0.5px(창 1280 · 1000) |
 * | 표의 줄 | 줄마다 이름 칸 글의 가운데와 줄 «…» 가운데의 차 ≤ 2px |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 그룹 수 — 창 1280 × 900 에서 목록이 창보다 길게(그룹 하나 52px 남짓). */
const GROUPS = 30

describe.skipIf(!전제.ok)('공통코드 화면 다듬기 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const project = (
      await stack.request(alice, 'POST', '/projects', { name: '공통코드 다듬기', slug: `codes-polish-${Date.now().toString(36)}` })
    ).body
    projectId = project.id
    const base = `/projects/${projectId}`
    expect((await stack.request(alice, 'POST', `${base}/codes`, { key: 'CD_402', name: '과목 분류' })).status).toBe(201)
    for (let i = 1; i <= 4; i += 1) {
      const item = await stack.request(alice, 'POST', `${base}/codes/CD_402/items`, { value: `40210${i}`, name: `분류0${i}` })
      expect(item.status).toBe(201)
    }
    for (let i = 0; i < GROUPS - 1; i += 1) {
      const key = `CD_${String(500 + i)}`
      expect((await stack.request(alice, 'POST', `${base}/codes`, { key, name: `교육 그룹 ${i}` })).status).toBe(201)
    }
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function openCodes(page: Page, query = 'group=CD_402'): Promise<void> {
    await page.goto(`/projects/${projectId}/codes?${query}`)
    await page.getByRole('list', { name: '공통코드 그룹' }).waitFor()
  }

  it('머리의 «항목 추가» · «…» 와 표의 줄마다 글 · «…» 가 같은 가운데에 선다(창 1280 · 1000)', async () => {
    const log: Record<string, unknown>[] = []
    for (const width of [1280, 1000]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        await openCodes(page)
        await page.getByRole('table', { name: '공통코드 항목' }).locator('tbody tr').nth(3).waitFor()
        const got = await page.evaluate(() => {
          const mid = (rect: DOMRect) => rect.top + rect.height / 2
          const head = document.querySelector('.wb-shell-codes-group .wb-shell-admin-bar-end')
          const add = head?.querySelector('button.wb-shell-project-action')?.getBoundingClientRect()
          const more = head?.querySelector('button.wb-shell-action-menu-toggle')?.getBoundingClientRect()
          const rows = [...document.querySelectorAll('table[aria-label="공통코드 항목"] tbody tr')].map((row) => {
            const name = row.querySelector('.wb-shell-admin-cell-name')
            const range = document.createRange()
            range.selectNodeContents(name!)
            const text = range.getBoundingClientRect()
            const menu = row.querySelector('.wb-shell-action-menu-toggle')!.getBoundingClientRect()
            return Math.abs(mid(text) - mid(menu))
          })
          return { head: add && more ? Math.abs(mid(add) - mid(more)) : null, rows }
        })
        log.push({ width, ...got })
        // 판 카나리아 — 머리 단추 둘 · 줄 넷을 쟀다.
        expect(got.head, `${width}`).not.toBeNull()
        expect(got.rows, `${width}`).toHaveLength(4)
        // 0.5 — 단추 꼴이 같으면(«셸 단추의 두 높이») 블록 상자 안 기준선 맞춤으로도 1px 안이다. 머리 오른끝 묶음의 가운데 맞춤이 그 1px 를 닫는다.
        expect(got.head!, `${width}`).toBeLessThanOrEqual(0.5)
        expect(Math.max(...got.rows), `${width}`).toBeLessThanOrEqual(2)
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[codes-polish 맞춤] ${JSON.stringify(log)}`)
  })
})
