/**
 * **RV-PV · 설정 › 테마 미리보기의 이동 · 팝업 · 토큰 저장의 답** 실브라우저 판(`settings/theme-preview.tsx` · `settings/token-editor.tsx` ·
 * `@wirebound/theme-gallery` 의 `ThemeExamples` · `canvas/canvas-popups.tsx` 의 `usePopupArea`). 보고 `docs/superpowers/plans/2026-11-02-rv-pv-report.md`.
 *
 * H1 · M1 · M2 · M2b · L1 은 리뷰가 찾은 결함을 고친 뒤의 성질이다(고침 보고 `docs/superpowers/plans/2026-11-02-fx-pv-report.md`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * | --- | --- |
 * | H1 | 창이 미리보기를 다 담는 판(1280×1500)에서 «컴포넌트» → «예제» → «주문 상세» 뒤 연 팝업의 «취소» 자리 맨 위 요소가 iframe 이 아니다 |
 * | M1 | 390 에서 긴 «주문 목록» 을 끝까지 굴린 채 LNB «대시보드» 를 누르면 · 긴 대시보드를 끝까지 굴린 채 장 이름 줄 «주문 상세» 를 누르면 새 장의 맨 위가 상자 위 끝에 안 선다 |
 * | M1b | 390 에서 바깥 칸을 굴려 미리보기 틀 위 끝이 창 밖일 때(틀 밑 내용은 바깥 칸의 아래 여백으로 흉내) 이음으로 장을 옮겨도 틀 위 끝이 창 밖에 남는다 |
 * | M2 | 390 에서 «토큰 저장» 의 409 나란히 보기가 창 안에 안 선다 |
 * | M2b | 390 에서 «토큰 저장» 이 다른 탭의 422 를 받으면 «고칠 칸이 있습니다» 문장이 창 안에 안 선다 |
 * | M2c | 390 에서 «토큰 저장» 이 성공하면 «토큰을 저장했습니다» 문장이 창 안에 안 선다 |
 * | L1 | 예제 이음(문서 안 이음 · 틀 링크)의 가운데 단추 누름이 새 탭을 연다 |
 * | 기록 | Enter · Cmd · Shift 누름을 섞어도 `history.length` · 바깥 주소 · 탭 수가 그대로다 |
 * | 다른 탭의 422 | «모양» 탭에 선 채 «색» 칸이 서버에서 거절되면 그 탭 이름이 «색 — 고칠 칸 있음» · 문장이 그 칸을 말하고 창 안 · 저장 꺼짐 · 키보드로 그 탭에 닿는다 |
 */
import type { FrameLocator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack } from './editor-stack'
import { putTheme, seededVersion, themeProject } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const PREVIEW_BOX = '.wb-shell-settings-preview'
const preview = (page: Page): FrameLocator => page.frameLocator(`${PREVIEW_BOX} iframe`)

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

async function pick(page: Page, title: string, id: string): Promise<void> {
  await page.getByRole('navigation', { name: '예제 페이지' }).getByRole('button', { name: title, exact: true }).click()
  await poll(
    title,
    () => shownExample(page),
    (shown) => shown === id,
  )
}

/** 요소의 `click()` — 누르기가 상자를 굴리지 않게. 노드 안의 첫 `a` · `button` 을 누른다. */
async function tap(page: Page, nodeId: string): Promise<void> {
  await preview(page)
    .locator(`[data-wb-id="${nodeId}"]`)
    .first()
    .evaluate((el) => {
      const target = el.matches('a, button') ? el : el.querySelector('a, button')
      ;((target ?? el) as HTMLElement).click()
    })
}

/**
 * 기본테마 서브페이지 틀의 LNB 링크(`LayoutLink`) — 장 사이 이동은 틀이 한다(예제 문서에는 메뉴가 없다 — `@wirebound/theme-gallery` 의
 * `documents.ts` 머리말).
 */
const lnbLink = (page: Page, title: string) =>
  preview(page).locator('[data-wb-layout-region="lnb"]').getByRole('link', { name: title, exact: true })

/** LNB 링크의 `click()` — 누르기가 상자를 굴리지 않게. */
async function tapLnb(page: Page, title: string): Promise<void> {
  await lnbLink(page, title).evaluate((el) => (el as HTMLElement).click())
}

/** 두 프레임 · 잠깐 · 두 프레임 — iframe 높이(`ResizeObserver`)와 덮개 셈이 그려진 뒤다. */
async function settle(page: Page): Promise<void> {
  const two = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
  await page.evaluate(two)
  await page.waitForTimeout(150)
  await page.evaluate(two)
}

describe.skipIf(!전제.ok)('RV-PV — 설정 미리보기의 이동 · 팝업 · 토큰 저장의 답', () => {
  let stack: EditorStack
  let projectId = ''
  let call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    const alice = await stack.login(stack.users.alice)
    const made = await themeProject(stack, alice)
    projectId = made.id
    call = made.call
  }, 120_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const settings = () => `/projects/${projectId}/settings?section=theme`

  it('H1 — 창이 미리보기를 다 담는 판에서 장을 바꾼 뒤 연 팝업의 «취소» 가 iframe 안에 선다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 1500 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      await preview(page).locator('[data-wb-gallery-item]').first().waitFor()
      await openExamples(page)
      await pick(page, '주문 상세', 'order')
      await settle(page)
      // 판 카나리아 — 상자가 안 구르고(덮개를 다시 잴 `scroll` 이 없다) iframe 아래 끝이 창 안이다.
      const before = await page.locator(PREVIEW_BOX).evaluate((box) => ({
        scrollTop: box.scrollTop,
        room: box.scrollHeight - box.clientHeight,
        iframeBottom: box.querySelector('iframe')!.getBoundingClientRect().bottom,
        innerHeight,
      }))
      expect(before.scrollTop).toBe(0)
      expect(before.room).toBe(0)
      expect(before.iframeBottom).toBeLessThan(before.innerHeight)
      await tap(page, 'ex-od-del')
      await preview(page).locator('[data-wb-popup-frame]').waitFor()
      await settle(page)
      const cancel = (await preview(page).locator('[data-wb-id="ex-pd-cancel"]').first().boundingBox())!
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, {
        x: cancel.x + cancel.width / 2,
        y: cancel.y + cancel.height / 2,
      })
      expect(hit).toBe('IFRAME')
    } finally {
      await context.close()
    }
  })

  it('M1 — 390 에서 긴 장을 끝까지 굴린 채 이음 · 장 이름 줄로 옮기면 새 장의 맨 위가 상자 위 끝에 선다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      await openExamples(page)
      await pick(page, '주문 목록', 'orders')
      await settle(page)
      await page.locator(PREVIEW_BOX).evaluate((box) => {
        box.scrollTop = box.scrollHeight
      })
      await settle(page)
      // 판 카나리아 — 상자가 실제로 끝까지 굴렀다. 굴린 양은 예제 장의 길이(테마가 정한다)에 매여 글자로 크게 잡지 않는다 — 머리가 위로 밀려 숨는
      // 판을 세우기에 넉넉한 200px 이상이면 선다(기본테마 2.0.0 의 «주문 목록» 은 264px).
      expect(await page.locator(PREVIEW_BOX).evaluate((box) => box.scrollTop)).toBeGreaterThan(200)
      await tapLnb(page, '대시보드')
      await poll(
        '대시보드',
        () => shownExample(page),
        (shown) => shown === 'dashboard',
      )
      await settle(page)
      // 새 장의 맨 위(iframe 위 끝)가 상자 위 끝 아래에 있다 — 머리가 위로 밀려 숨지 않았다.
      const headOf = () =>
        page.locator(PREVIEW_BOX).evaluate((box) => {
          const iframeTop = box.querySelector('iframe')!.getBoundingClientRect().top
          return iframeTop >= box.getBoundingClientRect().top
        })
      const byLink = await headOf()
      // 장 이름 줄 — 대시보드(1094)를 끝까지 굴린 채 «주문 상세» 로.
      await page.locator(PREVIEW_BOX).evaluate((box) => {
        box.scrollTop = box.scrollHeight
      })
      await settle(page)
      expect(await page.locator(PREVIEW_BOX).evaluate((box) => box.scrollTop)).toBeGreaterThan(200)
      await pick(page, '주문 상세', 'order')
      await settle(page)
      expect({ byLink, byRow: await headOf() }).toEqual({ byLink: true, byRow: true })
    } finally {
      await context.close()
    }
  })

  it('M1b — 바깥 칸을 굴려 틀 위 끝이 창 밖일 때 이음으로 옮기면 틀이 창 안으로 내려온다(390)', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      await openExamples(page)
      await pick(page, '주문 목록', 'orders')
      await settle(page)
      const FRAME = '.wb-shell-settings-preview-frame'
      // 바깥 칸(틀의 가장 가까운 세로 스크롤 조상)을 틀 위 끝이 창 위로 200px 나가게 굴린다. 설정에서는 틀이 맨 끝이고 높이가 창에 묶여
      // 끝까지 굴려도 틀 위 끝이 창 안에 남는다 — 틀 밑에 내용이 더 있는 화면을 바깥 칸의 아래 여백으로 흉내 낸다.
      const pushed = await page.locator(FRAME).evaluate((frame) => {
        let scroller: HTMLElement | null = frame.parentElement
        while (scroller !== null && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
        if (scroller === null) return null
        scroller.style.paddingBottom = '2000px'
        scroller.scrollTop += frame.getBoundingClientRect().top + 200
        return frame.getBoundingClientRect().top
      })
      await settle(page)
      // 판 카나리아 — 바깥 칸이 있고 틀 위 끝이 창 밖이다.
      expect(pushed).not.toBeNull()
      expect(pushed!).toBeLessThan(-100)
      await tapLnb(page, '대시보드')
      await poll(
        '대시보드',
        () => shownExample(page),
        (shown) => shown === 'dashboard',
      )
      await settle(page)
      expect(await page.locator(FRAME).evaluate((frame) => Math.round(frame.getBoundingClientRect().top))).toBeGreaterThanOrEqual(0)
    } finally {
      await context.close()
    }
  })

  it('L1 — 예제 이음의 가운데 단추 누름이 새 탭을 안 연다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      await openExamples(page)
      // 문서 안 이음(대시보드 «전체 보기») · 틀 링크(LNB «주문 목록») 둘 다.
      for (const link of [
        preview(page).locator('[data-wb-id="ex-d-all"] a, a[data-wb-id="ex-d-all"]').first(),
        lnbLink(page, '주문 목록'),
      ]) {
        await link.click({ button: 'middle' })
        await page.waitForTimeout(800)
        expect(context.pages()).toHaveLength(1)
      }
      expect(await shownExample(page)).toBe('dashboard')
    } finally {
      await context.close()
    }
  })

  it('기록 — Enter · Cmd · Shift 누름과 장 이름 줄을 섞어도 history.length · 바깥 주소 · 탭 수가 그대로다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto('/')
      await page.getByRole('heading', { name: '프로젝트', exact: true }).waitFor()
      await page.goto(settings())
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
      const before = await page.evaluate(() => ({ length: history.length, href: location.href }))
      await openExamples(page)
      await pick(page, '주문 목록', 'orders')
      await lnbLink(page, '대시보드').focus()
      await page.keyboard.press('Enter')
      await poll(
        'Enter',
        () => shownExample(page),
        (shown) => shown === 'dashboard',
      )
      const link = lnbLink(page, '주문 목록')
      await link.click({ modifiers: ['Meta'] })
      await poll(
        'Cmd 누름',
        () => shownExample(page),
        (shown) => shown === 'orders',
      )
      await pick(page, '대시보드', 'dashboard')
      await link.click({ modifiers: ['Shift'] })
      await poll(
        'Shift 누름',
        () => shownExample(page),
        (shown) => shown === 'orders',
      )
      await page.waitForTimeout(500)
      const after = await page.evaluate(() => ({ length: history.length, href: location.href }))
      expect({ after, pages: context.pages().length }).toEqual({ after: before, pages: 1 })
    } finally {
      await context.close()
    }
  })

  it('다른 탭의 422 — 탭 표지 · 문장이 창 안 · 저장 꺼짐 · 키보드로 표지 탭에 닿는다(창 1280×900 · 390×844)', async () => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport })
      try {
        await page.route(`**/api/projects/${projectId}/theme`, async (route) => {
          if (route.request().method() !== 'PUT') return route.fallback()
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'validation-failed',
                message: '검증 실패',
                issues: [{ path: 'tokens.semantic.primary', message: '서버가 거절한 색' }],
              },
            }),
          })
        })
        await page.goto(settings())
        const tabs = page.getByRole('tablist', { name: '토큰 무리' })
        await tabs.getByRole('tab', { name: '모양', exact: true }).click()
        await page.locator('[role="tabpanel"]:not([hidden])').getByLabel('모서리(작게) — 입력칸 · 단추', { exact: true }).fill('5')
        const save = page.getByRole('button', { name: '토큰 저장', exact: true })
        await save.click()
        const alert = page.locator('p.wb-shell-settings-field-alert', { hasText: '고칠 칸이 있습니다' })
        await alert.waitFor()
        const names = await tabs.getByRole('tab').evaluateAll((all) => all.map((t) => t.getAttribute('aria-label') ?? t.textContent))
        const where = await alert.evaluate((el) => ({ text: el.textContent, top: el.getBoundingClientRect().top, innerHeight }))
        // 키보드 — 저장 단추에서 Shift+Tab 으로 고른 탭(«모양»)까지, 거기서 ← 로 표지 탭.
        await save.focus()
        let reached = ''
        for (let i = 0; i < 4 && reached !== 'tab'; i += 1) {
          await page.keyboard.press('Shift+Tab')
          reached = await page.evaluate(() => document.activeElement?.getAttribute('role') ?? '')
        }
        await page.keyboard.press('ArrowLeft')
        const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent)
        expect({
          names,
          text: where.text,
          // 390 의 문장 자리는 M2b 가 잰다(그 축의 주인).
          inView: viewport.width === 390 ? true : where.top >= 0 && where.top < where.innerHeight,
          disabled: await save.isDisabled(),
          reached,
          focused,
        }).toEqual({
          names: ['색 — 고칠 칸 있음', '모양', '글자', '밀도'],
          text: '고칠 칸이 있습니다 — 주색',
          inView: true,
          disabled: true,
          reached: 'tab',
          focused: '색 — 고칠 칸 있음',
        })
      } finally {
        await context.close()
      }
    }
  })

  it('M2b — 390 에서 «토큰 저장» 이 다른 탭의 422 를 받으면 «고칠 칸이 있습니다» 문장이 창 안에 선다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.route(`**/api/projects/${projectId}/theme`, async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback()
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'validation-failed',
              message: '검증 실패',
              issues: [{ path: 'tokens.semantic.primary', message: '서버가 거절한 색' }],
            },
          }),
        })
      })
      await page.goto(settings())
      await page.getByRole('tablist', { name: '토큰 무리' }).getByRole('tab', { name: '모양', exact: true }).click()
      await page.locator('[role="tabpanel"]:not([hidden])').getByLabel('모서리(작게) — 입력칸 · 단추', { exact: true }).fill('5')
      const save = page.getByRole('button', { name: '토큰 저장', exact: true })
      // 판 카나리아 — 누르는 단추는 창 안이다.
      const button = (await save.boundingBox())!
      expect(button.y + button.height).toBeLessThan(844)
      await save.click()
      const alert = page.locator('p.wb-shell-settings-field-alert', { hasText: '고칠 칸이 있습니다' })
      await alert.waitFor()
      expect(await alert.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(844)
    } finally {
      await context.close()
    }
  })

  it('M2c — 390 에서 «토큰 저장» 이 성공하면 «토큰을 저장했습니다» 문장이 창 안에 선다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto(settings())
      await page.getByRole('tablist', { name: '토큰 무리' }).getByRole('tab', { name: '모양', exact: true }).click()
      await page.locator('[role="tabpanel"]:not([hidden])').getByLabel('모서리(작게) — 입력칸 · 단추', { exact: true }).fill('6')
      const save = page.getByRole('button', { name: '토큰 저장', exact: true })
      // 판 카나리아 — 누르는 단추는 창 안이다.
      const button = (await save.boundingBox())!
      expect(button.y + button.height).toBeLessThan(844)
      await save.click()
      const saved = page.getByRole('status').filter({ hasText: '토큰을 저장했습니다' })
      await saved.waitFor()
      const top = await saved.evaluate((el) => el.getBoundingClientRect().top)
      await putTheme(call, projectId, { themeId: 'system-admin', version: seededVersion('system-admin'), tokens: {} })
      expect(top).toBeLessThan(844)
    } finally {
      await context.close()
    }
  })

  it('M2 — 390 에서 «토큰 저장» 의 409 나란히 보기가 창 안에 선다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto(settings())
      const tabs = page.getByRole('tablist', { name: '토큰 무리' })
      await tabs.getByRole('tab', { name: '모양', exact: true }).click()
      await page.locator('[role="tabpanel"]:not([hidden])').getByLabel('모서리(작게) — 입력칸 · 단추', { exact: true }).fill('7')
      // 다른 사람이 먼저 저장(같은 판).
      await putTheme(call, projectId, { themeId: 'system-admin', version: seededVersion('system-admin'), tokens: { 'radius.sm': '9px' } })
      const save = page.getByRole('button', { name: '토큰 저장', exact: true })
      // 판 카나리아 — 누르는 단추는 창 안이다.
      const button = (await save.boundingBox())!
      expect(button.y + button.height).toBeLessThan(844)
      await save.click()
      const conflict = page.getByRole('group', { name: '서버 값과 내 값' })
      await conflict.waitFor()
      const top = await conflict.evaluate((el) => el.getBoundingClientRect().top)
      await putTheme(call, projectId, { themeId: 'system-admin', version: seededVersion('system-admin'), tokens: {} })
      expect(top).toBeLessThan(844)
    } finally {
      await context.close()
    }
  })
})
