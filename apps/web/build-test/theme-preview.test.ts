/**
 * **테마 미리보기 — 토큰 탭 · 넓은 미리보기 · 두 보기** 실브라우저 판(`settings/token-editor.tsx` · `settings/theme-preview.tsx` ·
 * `@wirebound/theme-gallery` 의 `ThemeGallery` · `ThemeExamples`). jsdom 판(`test/settings/theme-preview.test.tsx`)이 못 재는 것 — 배치(한 화면 ·
 * 폭 · 좁은 창), 예제 안의 누름이 바깥 기록을 안 쌓는지(«뒤로»), 팝업이 상자의 보이는 구간에 서는지 — 를 잰다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FrameLocator, Page } from 'playwright-core'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'
import { themeProject } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const PREVIEW_BOX = '.wb-shell-settings-preview'
const preview = (page: Page): FrameLocator => page.frameLocator(`${PREVIEW_BOX} iframe`)

/** 미리보기 iframe 문서에서 지금 그린 예제 장(`[data-wb-examples]`). 예제 보기가 아니면 `null`. */
async function shownExample(page: Page): Promise<string | null> {
  const handle = await page.$(`${PREVIEW_BOX} iframe`)
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) return null
  return frame.evaluate(() => document.querySelector('[data-wb-examples]')?.getAttribute('data-wb-examples') ?? null)
}

async function openExamples(page: Page): Promise<void> {
  await page.getByRole('radiogroup', { name: '미리보기 보기' }).getByText('예제 페이지', { exact: true }).click()
  await poll(
    '예제 첫 장',
    () => shownExample(page),
    (shown) => shown === 'dashboard',
  )
}

/** 예제 안의 노드를 누른다 — 노드 id 로 찾는다(글자는 장마다 겹친다). */
async function press(page: Page, nodeId: string, expected: string | null): Promise<void> {
  await preview(page).locator(`[data-wb-id="${nodeId}"]`).first().click()
  if (expected !== null)
    await poll(
      `${nodeId} 뒤의 장`,
      () => shownExample(page),
      (shown) => shown === expected,
    )
}

describe.skipIf(!전제.ok)('테마 미리보기 — 실브라우저', () => {
  let stack: EditorStack
  let projectId = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    const alice = await stack.login(stack.users.alice)
    projectId = (await themeProject(stack, alice)).id
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const settings = () => `/projects/${projectId}/settings?section=theme`

  it('한 화면 — 창 1280×900 · 기본테마 «색» 탭에서 미리보기 상자의 위 끝이 창 안이다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto(settings())
      const colorTab = page.getByRole('tablist', { name: '토큰 무리' }).getByRole('tab', { name: '색', exact: true })
      await colorTab.waitFor()
      // 판 카나리아 — 첫 탭이 «색» 이고 그 탭이 가장 긴 무리다(기본테마 manifest).
      expect(await colorTab.getAttribute('aria-selected')).toBe('true')
      const tabs = page.getByRole('tablist', { name: '토큰 무리' }).getByRole('tab')
      expect(await tabs.count()).toBeGreaterThanOrEqual(4)
      const fields = await page.locator('.wb-shell-settings-token-grid:not([hidden]) .wb-shell-settings-token').count()
      expect(fields).toBeGreaterThanOrEqual(8)
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      const top = await page.locator('.wb-shell-settings-preview-frame').evaluate((el) => el.getBoundingClientRect().top)
      expect(top).toBeGreaterThan(0)
      expect(top).toBeLessThan(900)
      // 안 고른 탭의 칸은 보이지 않는다(`hidden` 이 `display: grid` 에 지지 않는다).
      expect(await page.locator('.wb-shell-settings-token-grid[hidden]').first().isVisible()).toBe(false)
    } finally {
      await context.close()
    }
  })

  it('폭을 따라간다 — 창 1600 에서 iframe 폭이 1000 이상이고 상자 안쪽 폭과 1px 안에서 같다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      const read = () =>
        page.locator(PREVIEW_BOX).evaluate((box) => {
          const style = getComputedStyle(box)
          const inner = box.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
          return { inner, iframe: box.querySelector('iframe')!.getBoundingClientRect().width }
        })
      // 판이 섰다 — 갤러리 칸이 그려졌고 두 프레임 동안 값이 그대로다. 폭은 그 뒤에 단언한다(폴의 끝 조건에 단언할 값을 넣지 않는다).
      const settled = async () => {
        await preview(page).locator('[data-wb-gallery-item]').first().waitFor()
        let last = await read()
        for (;;) {
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
          const next = await read()
          if (next.inner === last.inner && next.iframe === last.iframe) return next
          last = next
        }
      }
      const measured = await settled()
      expect(Math.abs(measured.inner - measured.iframe), JSON.stringify(measured)).toBeLessThanOrEqual(1)
      expect(measured.iframe).toBeGreaterThanOrEqual(1000)
      // 창을 줄이면 따라 준다.
      await page.setViewportSize({ width: 1100, height: 900 })
      await poll('창이 줄었다', read, (one) => one.inner < measured.inner)
      const narrowed = await settled()
      expect(Math.abs(narrowed.inner - narrowed.iframe), JSON.stringify(narrowed)).toBeLessThanOrEqual(1)
      expect(narrowed.iframe).toBeLessThan(measured.iframe)
    } finally {
      await context.close()
    }
  })

  it('뒤로 — 예제 안에서 이동 · 팝업을 여닫아도 기록이 안 쌓여 «뒤로» 가 앞 화면으로 간다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto('/')
      await page.getByRole('heading', { name: '프로젝트', exact: true }).waitFor()
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      const before = await page.evaluate(() => ({ length: history.length, href: location.href }))
      await openExamples(page)
      await press(page, 'ex-l-go-orders', 'orders')
      await press(page, 'ex-o-g-r0-no-l', 'order')
      await press(page, 'ex-od-del', null)
      await preview(page).locator('[data-wb-popup-frame]').waitFor()
      await press(page, 'ex-pd-cancel', null)
      await preview(page).locator('[data-wb-popup-frame]').waitFor({ state: 'detached' })
      await press(page, 'ex-l-go-dash', 'dashboard')
      await press(page, 'ex-d-all', 'orders')
      const after = await page.evaluate(() => ({ length: history.length, href: location.href }))
      expect(after).toEqual(before)
      const innerHash = await (await (await page.$(`${PREVIEW_BOX} iframe`))!.contentFrame())!.evaluate(() => location.hash)
      expect(innerHash).toBe('')
      await page.goBack()
      await poll(
        '뒤로',
        async () => new URL(page.url()).pathname,
        (path) => path === '/',
      )
    } finally {
      await context.close()
    }
  })

  it('팝업이 보이는 구간에 선다 — 미리보기 상자를 끝까지 내린 판', async () => {
    // 창을 낮게 — 상자(창 높이에 묶인다)보다 상세 장이 길어 상자가 구른다.
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 320 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      await openExamples(page)
      await page.getByRole('navigation', { name: '예제 페이지' }).getByRole('button', { name: '주문 상세' }).click()
      await poll(
        '상세',
        () => shownExample(page),
        (shown) => shown === 'order',
      )
      // 판 카나리아 — 상자가 구를 자리가 있다.
      const room = await page.locator(PREVIEW_BOX).evaluate((box) => ({
        room: box.scrollHeight - box.clientHeight,
        client: box.clientHeight,
        iframe: box.querySelector('iframe')!.getBoundingClientRect().height,
        frame: box.parentElement!.getBoundingClientRect().height,
      }))
      expect(room.room, JSON.stringify(room)).toBeGreaterThan(80)
      await page.locator(PREVIEW_BOX).evaluate((box) => {
        box.scrollTop = box.scrollHeight
      })
      // 누르기가 상자를 다시 굴리지 않게 요소의 `click()` 으로 연다.
      await preview(page)
        .locator('[data-wb-id="ex-od-del"]')
        .evaluate((el) => (el as HTMLElement).click())
      const popup = preview(page).locator('[data-wb-popup-frame]')
      await popup.waitFor()
      const scrolled = await page.locator(PREVIEW_BOX).evaluate((box) => box.scrollTop)
      expect(scrolled).toBeGreaterThan(80)
      const boxRect = await page.locator(PREVIEW_BOX).evaluate((box) => {
        const r = box.getBoundingClientRect()
        // 보이는 구간 — 상자와 창이 겹친 곳.
        return {
          top: Math.max(r.top, 0),
          bottom: Math.min(r.top + box.clientHeight, innerHeight),
          left: Math.max(r.left, 0),
          right: Math.min(r.left + box.clientWidth, innerWidth),
        }
      })
      const popupRect = await popup.boundingBox()
      expect(popupRect).not.toBeNull()
      expect(popupRect!.y).toBeGreaterThanOrEqual(boxRect.top - 1)
      expect(popupRect!.y + popupRect!.height).toBeLessThanOrEqual(boxRect.bottom + 1)
      expect(popupRect!.x).toBeGreaterThanOrEqual(boxRect.left - 1)
      expect(popupRect!.x + popupRect!.width).toBeLessThanOrEqual(boxRect.right + 1)
    } finally {
      await context.close()
    }
  })

  it('좁은 창 — 390 에서 «컴포넌트» 격자가 한 열이고 뼈대 상자가 가로로 안 넘친다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      await preview(page).locator('[data-wb-gallery-group]').first().waitFor()
      const lefts = await preview(page)
        .locator('[data-wb-gallery-item]')
        .evaluateAll((cells) => [...new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().left)))])
      // 판 카나리아 — 칸이 여럿 선다.
      expect(await preview(page).locator('[data-wb-gallery-item]').count()).toBeGreaterThan(20)
      expect(lefts).toHaveLength(1)
      const overflow = await page
        .locator('.wb-shell-workspace')
        .evaluate((workspace) => ({ scroll: workspace.scrollWidth, client: workspace.clientWidth }))
      expect(overflow.client).toBeGreaterThan(0)
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
      // 예제 페이지도 같은 상자 안에 선다.
      await openExamples(page)
      const after = await page.locator('.wb-shell-workspace').evaluate((workspace) => workspace.scrollWidth - workspace.clientWidth)
      expect(after).toBeLessThanOrEqual(0)
    } finally {
      await context.close()
    }
  })
})
