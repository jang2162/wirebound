/**
 * **공통코드 화면 다듬기 — 실브라우저**(`src/codes/codes-screen.tsx`). 머리 단추 · 표 줄의 세로 맞춤, 그룹 찾기의 한글 조합, 목록 칸이 따로 구르는지.
 * 넘침 · 카드 접힘은 `codes-screen.test.ts`, 흐름(만들기 · 지우기 · 사용처 이동 · 찾기 거름)은 jsdom `test/codes/codes-screen.test.tsx`.
 *
 * | 판 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 머리 | 고른 그룹 머리의 «항목 추가» · «…» 가운데 y 차 ≤ 0.5px(창 1280 · 1000) |
 * | 표의 줄 | 줄마다 이름 칸 글의 가운데와 줄 «…» 가운데의 차 ≤ 2px |
 * | 한글 조합 | 찾기 칸에 CDP 로 «과목» 을 조합해 치면 칸 값 · 거른 목록이 그 글이고, 조합 중에도 칸 값이 조합 글이다 |
 * | 목록 칸 | 그룹이 많은 창 1280 — 목록 칸이 창보다 짧고 안에서 구르며, 상세가 긴 그룹에서 내용 칸을 굴려도 찾기 칸이 창 안이다 · 주소로 고른 끝 그룹이 목록 칸 안에 보인다 |
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
/** 목록의 끝 그룹 키. */
const LAST = `CD_${500 + GROUPS - 2}`

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
    // 끝 그룹은 항목이 많다 — 상세가 목록 칸보다 길어야 목록 칸이 창에 붙어 설 자리가 있다.
    for (let i = 0; i < 30; i += 1) {
      const item = await stack.request(alice, 'POST', `${base}/codes/${LAST}/items`, { value: `V${i}`, name: `항목 ${i}` })
      expect(item.status).toBe(201)
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

  it('찾기 칸 — 한글을 조합해 치면 칸 값 · 거른 목록이 그 글이다(조합 중에도)', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await openCodes(page)
      const box = page.getByRole('searchbox', { name: '그룹 찾기' })
      await box.click()
      const cdp = await context.newCDPSession(page)
      const names = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('ul[aria-label="공통코드 그룹"] .wb-shell-admin-pick-name')].map((el) => el.textContent ?? ''),
        )
      const steps: { value: string; shown: number }[] = []
      for (const [text, commit] of [
        ['ㄱ', false],
        ['과', false],
        ['과', true],
        ['ㅁ', false],
        ['모', false],
        ['목', false],
        ['목', true],
      ] as const) {
        if (commit) await cdp.send('Input.insertText', { text })
        else await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
        await page.waitForTimeout(60)
        steps.push({ value: await box.inputValue(), shown: (await names()).length })
      }
      // 조합 중의 칸 값은 그 조합 글이다 — 칸이 되돌려 조합을 굳히지 않는다.
      expect(steps.map((step) => step.value)).toEqual(['ㄱ', '과', '과', '과ㅁ', '과모', '과목', '과목'])
      expect(await box.inputValue()).toBe('과목')
      const shown = await names()
      expect(shown.length).toBe(1)
      expect(shown[0]).toContain('과목 분류')
      // 판 카나리아 — 거르기 전에는 모두였다.
      await box.fill('')
      expect((await names()).length).toBe(GROUPS)
      // eslint-disable-next-line no-console
      console.log(`[codes-polish 조합] ${JSON.stringify(steps)}`)
    } finally {
      await context.close()
    }
  })

  it('넓은 창 — 목록 칸이 따로 구르고 찾기 칸이 창에 남으며, 주소로 고른 끝 그룹이 목록 칸 안에 보인다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 700 } })
    try {
      await openCodes(page, `group=${LAST}`)
      await page.getByRole('region', { name: `그룹 교육 그룹 ${GROUPS - 2}` }).waitFor()
      await page.waitForTimeout(200)
      const got = await page.evaluate(() => {
        const list = document.querySelector('ul[aria-label="공통코드 그룹"]')!
        const pick = list.querySelector('[aria-current="true"]')!.getBoundingClientRect()
        const box = list.getBoundingClientRect()
        // 목록 칸 위 끝이 창 위로 넘어갈 만큼만 굴린다 — 상세가 끝나는 곳까지 굴리면 격자 칸이 끝나 붙을 자리가 없다(그것이 맞다).
        const scroller = document.querySelector('.wb-shell-workspace')!
        scroller.scrollTop = box.top + 300
        return {
          listScrolls: list.scrollHeight > list.clientHeight,
          listScrollTop: list.scrollTop,
          listShorterThanWindow: box.height < window.innerHeight,
          pickInList: pick.top >= box.top - 1 && pick.bottom <= box.bottom + 1,
        }
      })
      await page.waitForTimeout(100)
      const find = await page.getByRole('searchbox', { name: '그룹 찾기' }).evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= window.innerHeight
      })
      // eslint-disable-next-line no-console
      console.log(`[codes-polish 목록 칸] ${JSON.stringify({ ...got, find })}`)
      expect({ ...got, listScrollTop: got.listScrollTop > 0, find }).toEqual({
        listScrolls: true,
        listScrollTop: true,
        listShorterThanWindow: true,
        pickInList: true,
        find: true,
      })
    } finally {
      await context.close()
    }
  })
})
