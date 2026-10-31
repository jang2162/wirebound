/**
 * **에디터 밖 화면의 뼈대**(`src/shell/workspace-layout.tsx`) — 실브라우저 판. jsdom 은 CSS 배치 · 미디어 질의 · 넘침을 못 잰다.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 넓은 창 | 창 1280 · 1920 에서 화면 넷의 몸(`.wb-shell-project-list` · `.wb-shell-settings`) 폭 = 창 폭 − 사이드바 폭 − 내용 칸 좌우 여백(±2px) |
 * | 좁은 창 | 창 390 에서 화면 넷 — 문서 · 뼈대 상자의 `scrollWidth` 가 창 안, 글자 노드 하나하나의 `Range.getClientRects()` 오른끝이 창 안(접힘 · 편 메뉴 둘 다) |
 * | 좁은 창의 «메뉴» | 칸 목록이 접혀 있다 → Tab 으로 «메뉴» 에 닿아 Enter 로 편다 → 다음 Tab 이 첫 칸 → «계정» 을 누르면 `/account` |
 * | 설정 «테마» 미리보기 | 창 1920 에서 미리보기 틀(`.wb-shell-settings-preview`) 폭이 뼈대 전 판보다 넓다 |
 *
 * **뼈대 전 판의 미리보기 폭** — `PREVIEW_BEFORE`. 기준 커밋 `20b398e2` 를 스크래치에 풀어(`git archive`) 세운 사본에서 같은 판(창 1920×900 · 관리자 alice ·
 * `themeProject` · `?section=theme`)으로 두 번 잰 값이다(580 · 580) — 설정 화면이 `max-width: 1280px` 에 왼쪽 세로 탭 200px 였을 때다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, startEditorStack, type EditorStack } from './editor-stack'
import { makeAdmin, themeProject } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const HEIGHT = 900
/** 뼈대 전 판(기준 `20b398e2`)의 창 1920 미리보기 틀 폭(px) — 머리말. */
const PREVIEW_BEFORE = 580

/** 화면 넷 — 주소 · 다 섰다는 표지 · 몸의 선택자. */
function screens(projectId: string): [string, string, (page: Page) => Promise<void>, string][] {
  return [
    ['프로젝트 목록', '/', (page) => page.getByRole('link', { name: '테마 판', exact: true }).waitFor(), '.wb-shell-project-list'],
    ['계정 설정', '/account', (page) => page.getByText('alice@browser.test').waitFor(), '.wb-shell-settings'],
    [
      '프로젝트 설정',
      `/projects/${projectId}/settings`,
      (page) => page.getByRole('region', { name: '일반' }).waitFor(),
      '.wb-shell-settings',
    ],
    ['테마 관리', '/admin/themes', (page) => page.getByRole('list', { name: '테마 목록' }).waitFor(), '.wb-shell-settings'],
  ]
}

/** 몸 폭과 그 기대값(창 − 사이드바 − 내용 칸 좌우 여백). */
function bodyWidth(page: Page, selector: string): Promise<{ body: number; expected: number; side: number }> {
  return page.evaluate((sel) => {
    const body = document.querySelector(sel)!.getBoundingClientRect().width
    const side = document.querySelector('.wb-shell-workspace-side')!.getBoundingClientRect().width
    const main = getComputedStyle(document.querySelector('.wb-shell-workspace-main')!)
    const pad = parseFloat(main.paddingLeft) + parseFloat(main.paddingRight)
    return { body, expected: document.documentElement.clientWidth - side - pad, side }
  }, selector)
}

/** 넘침 — 문서 · 뼈대 상자의 가로 넘침(px)과 창 오른끝을 넘는 글자 노드(글 앞 24 자 · 넘은 px). */
function overflow(page: Page): Promise<{ doc: number; workspace: number; texts: string[]; counted: number }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const box = document.querySelector('.wb-shell-workspace')!
    const texts: string[] = []
    let counted = 0
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const rects = [...range.getClientRects()]
      if (rects.length === 0) continue
      counted += 1
      const right = Math.max(...rects.map((r) => r.right))
      if (right > width + 0.5) texts.push(`${n.textContent.trim().slice(0, 24)} +${Math.round(right - width)}px`)
    }
    return {
      doc: document.documentElement.scrollWidth - width,
      workspace: box.scrollWidth - box.clientWidth,
      texts,
      counted,
    }
  })
}

describe.skipIf(!전제.ok)('작업 공간 뼈대 — 실브라우저', () => {
  let stack: EditorStack
  let projectId = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    const alice = await stack.login(stack.users.alice)
    projectId = (await themeProject(stack, alice)).id
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('창 1280 · 1920 — 화면 넷의 몸 폭 = 창 폭 − 사이드바 폭 − 좌우 여백(±2px)', async () => {
    const measured: string[] = []
    for (const width of [1280, 1920]) {
      const tab = await stack.openTab(stack.users.alice, { viewport: { width, height: HEIGHT } })
      try {
        for (const [name, path, ready, body] of screens(projectId)) {
          await tab.page.goto(path)
          await ready(tab.page)
          const got = await bodyWidth(tab.page, body)
          // 카나리아 — 사이드바가 선다(좁은 창의 위 줄이 아니다).
          expect(got.side, `${name}@${width}`).toBeGreaterThan(150)
          measured.push(`${name}@${width}: ${Math.round(got.body)} / ${Math.round(got.expected)}`)
          expect(Math.abs(got.body - got.expected), `${name}@${width}`).toBeLessThanOrEqual(2)
        }
      } finally {
        await tab.context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[뼈대 몸 폭]', measured.join(' · '))
    expect(measured).toHaveLength(8)
  })

  it('창 390 — 화면 넷이 가로로 안 넘친다(접힘 · 편 메뉴 둘 다 — 글자 노드의 오른끝까지)', async () => {
    const tab = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    const seen: Record<string, unknown> = {}
    try {
      for (const [name, path, ready] of screens(projectId)) {
        await tab.page.goto(path)
        await ready(tab.page)
        seen[`${name} 접힘`] = await overflow(tab.page)
        await tab.page.getByRole('button', { name: '메뉴' }).click()
        await tab.page.getByRole('navigation', { name: '관리자' }).waitFor()
        seen[`${name} 펼침`] = await overflow(tab.page)
      }
    } finally {
      await tab.context.close()
    }
    // eslint-disable-next-line no-console
    console.log('[뼈대 390 넘침]', JSON.stringify(seen))
    for (const [where, value] of Object.entries(seen)) {
      const v = value as { doc: number; workspace: number; texts: string[]; counted: number }
      // 카나리아 — 글자 노드를 셌다(0 이면 «넘침 0» 이 아무것도 안 잰 것이다).
      expect(v.counted, where).toBeGreaterThan(5)
      expect({ where, doc: v.doc <= 0, workspace: v.workspace <= 0, texts: v.texts }).toEqual({
        where,
        doc: true,
        workspace: true,
        texts: [],
      })
    }
  })

  it('창 390 — 칸 목록은 접혀 있고 Tab 으로 «메뉴» 에 닿아 Enter 로 편다, 다음 Tab 이 첫 칸이고 «계정» 이 /account 로 간다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto('/')
      await page.getByRole('link', { name: '테마 판', exact: true }).waitFor()
      const nav = page.getByRole('navigation', { name: '작업 공간' })
      expect(await nav.isVisible()).toBe(false)

      // 문서 첫 Tab 정지점은 로고, 그다음이 «메뉴»다.
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('메뉴')
      await page.keyboard.press('Enter')
      await nav.waitFor()
      expect(await page.getByRole('button', { name: '메뉴' }).getAttribute('aria-expanded')).toBe('true')

      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('프로젝트')

      await nav.getByRole('link', { name: '계정', exact: true }).click()
      await page.waitForURL(/\/account$/)
      await page.getByText('alice@browser.test').waitFor()
    } finally {
      await context.close()
    }
  })

  it('창 1920 — 설정 «테마» 의 미리보기 틀이 뼈대 전 판보다 넓다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1920, height: HEIGHT } })
    try {
      await page.goto(`/projects/${projectId}/settings?section=theme`)
      await page.locator('.wb-shell-settings-preview iframe.wb-shell-canvas-iframe').waitFor()
      const width = await page.locator('.wb-shell-settings-preview').evaluate((el) => el.getBoundingClientRect().width)
      // eslint-disable-next-line no-console
      console.log('[설정 미리보기 폭 1920]', Math.round(width), '뼈대 전', PREVIEW_BEFORE)
      expect(PREVIEW_BEFORE).toBeGreaterThan(0)
      expect(width).toBeGreaterThan(PREVIEW_BEFORE + 100)
    } finally {
      await context.close()
    }
  })
})
