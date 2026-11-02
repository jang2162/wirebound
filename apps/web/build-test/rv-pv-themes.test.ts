/**
 * **RV-PV · 테마 판마다 토큰 탭 · 미리보기** 실브라우저 판 — 무리를 선언하지 않은 · 무리 하나뿐인 · 토큰이 없는 · 뷰가 던지는 테마, 번들을 못 받은 판,
 * 팝업을 연 채 테마를 바꾼 판, 좁은 창 · 확대, 폭 따라가기(`settings/theme-preview.tsx` 의 `useBoxWidth`)의 고리. 보고
 * `docs/superpowers/plans/2026-11-02-rv-pv-report.md`.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * | --- | --- |
 * | 탭 꼴 | 무리 선언 없는 테마가 «기타» 탭 하나 · 무리 하나뿐인 테마가 그 무리 탭 하나가 아니다 |
 * | L2(`it.fails`) | 토큰이 0 인 테마가 탭 없는 `tablist` 를 그린다 |
 * | 판 옮김 | 팝업을 연 채 테마를 바꾸면 탭이 첫 탭 · 버린 초안 알림 · 보기와 장이 남고 팝업은 걷히고, 다시 연 팝업의 «취소» 에 닿는다 |
 * | 던지는 뷰 · 번들 실패 | 페이지 오류가 난다 · 장 이름 줄이 안 옮긴다 · 번들 실패 알림이 없다 · 그 판의 팝업이 안 닫힌다 |
 * | 좁은 창 · 확대 | 390 · 확대 200 % 에서 탭 · 저장 단추 · 보기 전환 · 장 이름 줄이 넘치거나 가운데 점이 그 요소가 아니다 |
 * | 폭 따라가기 | 고전 스크롤바(15px)의 문턱 높이에서 창 폭을 1px 씩 바꿀 때 iframe 폭이 2s 안에 안 선다(고리) |
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTheme } from '@wirebound/theme-kit'
import { chromium, type BrowserContext, type FrameLocator, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { controlsTheme, makeAdmin, primaryMarkTheme, putTheme, seededVersion, themeProject, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const SAMPLE_ROOT = fileURLToPath(new URL('../../../packages/theme-kit/test/fixtures/sample-theme/', import.meta.url))
const PREVIEW_BOX = '.wb-shell-settings-preview'
const preview = (page: Page): FrameLocator => page.frameLocator(`${PREVIEW_BOX} iframe`)

/** `throws@1.0.0` — 무리 하나(«하나»)만 선언 · `Button` · `Link` · `Popup` 뷰가 던진다. */
async function throwsTheme(): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'wb-throws-theme-'))
  try {
    cpSync(SAMPLE_ROOT, dir, { recursive: true })
    writeFileSync(
      join(dir, 'theme.config.ts'),
      `import { defineManifest } from '@wirebound/theme-sdk'
export default defineManifest({
  id: 'throws',
  name: '던지는 뷰',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: { groups: [{ id: 'one', label: '하나' }], items: { 'semantic.primary': { type: 'color', label: '주색', group: 'one', default: '#111111' } } },
})
`,
    )
    writeFileSync(
      join(dir, 'src/index.tsx'),
      `import { defineTheme, view } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
const boom = view(() => { throw new Error('일부러 던짐') })
export default defineTheme({ manifest, views: { Button: boom, Link: boom, Popup: boom } })
`,
    )
    const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
    return new Uint8Array(readFileSync(built.file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function shownExample(page: Page): Promise<string | null> {
  const handle = await page.$(`${PREVIEW_BOX} iframe`)
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) return null
  return frame.evaluate(() => document.querySelector('[data-wb-examples]')?.getAttribute('data-wb-examples') ?? null)
}

async function openExamples(page: Page): Promise<void> {
  await page.getByRole('radiogroup', { name: '미리보기 보기' }).getByText('예제 페이지', { exact: true }).click()
  await poll(
    '예제',
    () => shownExample(page),
    (shown) => shown !== null,
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

/** 노드 안의 첫 `a` · `button`(없으면 노드)을 요소의 `click()` 으로 누른다 — 누르기가 상자를 굴리지 않게. */
async function tap(page: Page, nodeId: string): Promise<void> {
  await preview(page)
    .locator(`[data-wb-id="${nodeId}"]`)
    .first()
    .evaluate((el) => {
      const target = el.matches('a, button') ? el : el.querySelector('a, button')
      ;((target ?? el) as HTMLElement).click()
    })
}

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

describe.skipIf(!전제.ok)('RV-PV — 테마 판마다 토큰 탭 · 미리보기', () => {
  let stack: EditorStack
  let alice: Session
  let admin = ''
  let mark = ''
  let controls = ''
  let throws = ''
  let call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    alice = await stack.login(stack.users.alice)
    for (const bytes of [await primaryMarkTheme(), await controlsTheme(), await throwsTheme()]) {
      const status = await uploadRaw(stack, alice, bytes)
      if (status !== 201) throw new Error(`업로드 ${status}`)
    }
    const a = await themeProject(stack, alice)
    admin = a.id
    call = a.call
    mark = (await themeProject(stack, alice)).id
    await putTheme(call, mark, { themeId: 'primary-mark', version: '1.0.0', tokens: {} })
    controls = (await themeProject(stack, alice)).id
    await putTheme(call, controls, { themeId: 'controls', version: '1.0.0', tokens: {} })
    throws = (await themeProject(stack, alice)).id
    await putTheme(call, throws, { themeId: 'throws', version: '1.0.0', tokens: {} })
  }, 240_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const settings = (id: string) => `/projects/${id}/settings?section=theme`
  const tabsOf = (page: Page) =>
    page.evaluate(() => {
      const list = document.querySelector('[role="tablist"][aria-label="토큰 무리"]')
      return {
        tablist: list !== null,
        tabs: [...(list?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.textContent),
        panels: document.querySelectorAll('.wb-shell-settings-token-grid:not([hidden])').length,
      }
    })

  it('탭 꼴 — 무리 선언 없는 테마는 «기타» 하나 · 무리 하나뿐인 테마는 그 무리 하나', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      const seen: Record<string, unknown> = {}
      for (const [name, id] of [
        ['primary-mark', mark],
        ['throws', throws],
      ] as const) {
        await page.goto(settings(id))
        await page.getByRole('tablist', { name: '토큰 무리' }).getByRole('tab').first().waitFor()
        seen[name] = await tabsOf(page)
      }
      expect(seen).toEqual({
        'primary-mark': { tablist: true, tabs: ['기타'], panels: 1 },
        throws: { tablist: true, tabs: ['하나'], panels: 1 },
      })
    } finally {
      await context.close()
    }
  })

  it.fails('L2 — 토큰이 0 인 테마는 탭 없는 «토큰 무리» tablist 를 그리지 않는다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto(settings(controls))
      await page.locator(PREVIEW_BOX).waitFor()
      // 판 카나리아 — 토큰 칸 묶음(«토큰» 머리)은 섰다.
      await page.locator('.wb-shell-settings-tokens').waitFor()
      const shape = await tabsOf(page)
      expect(shape.tablist && shape.tabs.length === 0).toBe(false)
    } finally {
      await context.close()
    }
  })

  it('판 옮김 — 팝업을 연 채 테마를 바꾸면 첫 탭 · 버린 초안 알림 · 보기와 장이 남고, 다시 연 팝업의 «취소» 에 닿는다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(settings(admin))
      const tabs = page.getByRole('tablist', { name: '토큰 무리' })
      await tabs.getByRole('tab', { name: '모양', exact: true }).click()
      await page.locator('[role="tabpanel"]:not([hidden])').getByLabel('모서리(작게) — 입력칸 · 단추', { exact: true }).fill('5')
      await openExamples(page)
      await pick(page, '주문 상세', 'order')
      await tap(page, 'ex-od-del')
      await preview(page).locator('[data-wb-popup-frame]').waitFor()
      const section = page.getByRole('region', { name: '테마' })
      await section.getByLabel('테마', { exact: true }).selectOption('primary-mark')
      await section.getByRole('group', { name: '테마 바꾸기 확인' }).getByRole('button', { name: '바꾸기' }).click()
      await poll(
        '판 옮김',
        () => tabs.getByRole('tab').allTextContents(),
        (names) => names.join() === '기타',
      )
      await poll(
        '새 판의 예제',
        () => shownExample(page),
        (shown) => shown !== null,
      )
      const after = {
        selected: await tabs.getByRole('tab', { selected: true }).textContent(),
        notices: await page.locator('.wb-shell-settings-tokens [role="status"]').allTextContents(),
        view: await page.locator('.wb-shell-settings-preview-view-on').textContent(),
        example: await shownExample(page),
        popups: await preview(page).locator('[data-wb-popup-frame]').count(),
      }
      // 다시 열기 전에 단언한다 — 장을 잃은 판은 «삭제» 가 없어 다음 걸음이 값 없이 시간 초과로 죽는다.
      expect(after).toEqual({
        selected: '기타',
        notices: ['바꾼 판으로 옮기지 못한 토큰 1 개의 초안을 버렸습니다'],
        view: '예제 페이지',
        example: 'order',
        popups: 0,
      })
      await tap(page, 'ex-od-del')
      await preview(page).locator('[data-wb-popup-frame]').waitFor()
      const cancel = (await preview(page).locator('[data-wb-id="ex-pd-cancel"]').first().boundingBox())!
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, {
        x: cancel.x + cancel.width / 2,
        y: cancel.y + cancel.height / 2,
      })
      expect(hit).toBe('IFRAME')
    } finally {
      await context.close()
      // 뒤 케이스(번들 실패 · 좁은 창 · 폭)가 이 프로젝트를 기본테마로 잰다 — 죽어도 되돌린다.
      await putTheme(call, admin, { themeId: 'system-admin', version: seededVersion('system-admin'), tokens: {} })
    }
  })

  it('던지는 뷰 · 번들 실패 — 페이지 오류 없이 장 이름 줄이 옮기고, 번들 실패는 알리고 그 판의 팝업이 닫힌다', async () => {
    const seen: Record<string, unknown> = {}
    for (const [name, id, failBundle] of [
      ['던지는 뷰', throws, false],
      ['번들 실패', admin, true],
    ] as const) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        if (failBundle) await page.route('**/files/theme.js', (route) => route.abort())
        await page.goto(settings(id))
        await page.locator(`${PREVIEW_BOX} iframe`).waitFor()
        await openExamples(page)
        await pick(page, '주문 상세', 'order')
        await tap(page, 'ex-od-del')
        await page.waitForTimeout(500)
        const opened = await preview(page).locator('[data-wb-popup-frame]').count()
        if (opened > 0) {
          await tap(page, 'ex-pd-cancel')
          await preview(page).locator('[data-wb-popup-frame]').waitFor({ state: 'detached' })
        }
        seen[name] = {
          notice: (await page.locator(`${PREVIEW_BOX} [role="status"]`).allTextContents()).map((t) => t.split(' — ')[0]),
          example: await shownExample(page),
          opened,
          left: await preview(page).locator('[data-wb-popup-frame]').count(),
          fallbacks: (await preview(page).locator('[data-wb-error]').count()) > 0,
          errors,
        }
      } finally {
        await context.close()
      }
    }
    expect(seen).toEqual({
      // 던지는 `Button` 은 폴백이라 «삭제» 가 팝업을 안 연다(캔버스와 같은 판단) — 막다른 화면은 아니다(장 이름 줄이 옮긴다).
      '던지는 뷰': { notice: [], example: 'order', opened: 0, left: 0, fallbacks: true, errors: [] },
      '번들 실패': {
        notice: ['테마를 불러오지 못해 기본 모양으로 보입니다'],
        example: 'order',
        opened: 1,
        left: 0,
        fallbacks: false,
        errors: [],
      },
    })
  })

  it('좁은 창 390 · 확대 200 % — 탭 · 저장 단추 · 보기 전환 · 장 이름 줄이 창 안이고 가운데 점이 그 요소다', async () => {
    const SELECTORS = [
      '.wb-shell-settings-token-tab',
      '.wb-shell-settings-token-actions button',
      '.wb-shell-settings-preview-view',
      '.wb-shell-settings-preview-page',
    ]
    const run = async (page: Page) => {
      await page.getByRole('tablist', { name: '토큰 무리' }).waitFor()
      await openExamples(page)
      await frames(page)
      return page.evaluate((selectors) => {
        const all = selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
        const misses: string[] = []
        for (const el of all) {
          el.scrollIntoView({ block: 'center', inline: 'nearest' })
          const r = el.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          // `scrollIntoView` 는 `overflow: hidden` 틀도 가로로 굴려 밀려난 요소를 끌어온다 — 그렇게 굴린 틀이 있으면 못 닿은 것으로 센다.
          let clipped = false
          for (let at = el.parentElement; at !== null; at = at.parentElement) {
            const overflow = getComputedStyle(at).overflowX
            if ((overflow === 'hidden' || overflow === 'clip') && at.scrollLeft > 0) clipped = true
          }
          const past = clipped || r.left < 0 || r.right > innerWidth
          if (past || hit === null || !(el === hit || el.contains(hit))) misses.push(`${el.textContent}`)
        }
        const workspace = document.querySelector('.wb-shell-workspace')!
        return { count: all.length, misses, over: workspace.scrollWidth - workspace.clientWidth }
      }, SELECTORS)
    }
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    let narrow: Awaited<ReturnType<typeof run>>
    try {
      await page.goto(settings(admin))
      narrow = await run(page)
    } finally {
      await context.close()
    }
    const zoomed = await zoomedContext(stack, 2, { width: 1280, height: 900 })
    let big: Awaited<ReturnType<typeof run>>
    try {
      const zpage = zoomed.pages()[0] ?? (await zoomed.newPage())
      await zpage.goto(stack.webUrl + settings(admin))
      // 판 카나리아 — 확대가 실렸다.
      expect(await zpage.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }))).toEqual({ dpr: 2, width: 640 })
      big = await run(zpage)
    } finally {
      await zoomed.close()
    }
    // 탭 넷 · 단추 둘 · 보기 둘 · 장 넷.
    expect({ narrow, big }).toEqual({ narrow: { count: 12, misses: [], over: 0 }, big: { count: 12, misses: [], over: 0 } })
  })

  it('폭 따라가기 — 고전 스크롤바의 문턱 높이(726)에서 창 폭을 1px 씩 바꿔도 iframe 폭이 2s 안에 선다(고리 없음)', async () => {
    if (!전제.ok) return
    const browser = await chromium.launch({ executablePath: 전제.executablePath, headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] })
    try {
      const context = await browser.newContext({ baseURL: stack.webUrl, viewport: { width: 1300, height: 726 } })
      const login = await context.request.post(`${stack.webUrl}/api/auth/login`, {
        data: { email: stack.users.alice.email, password: stack.users.alice.password },
      })
      if (!login.ok()) throw new Error('login')
      const page = await context.newPage()
      await page.goto(settings(admin))
      await page.locator(`${PREVIEW_BOX} iframe`).waitFor({ timeout: 20_000 })
      await page.addStyleTag({
        content: '*::-webkit-scrollbar { width: 15px; height: 15px; background: #ddd } *::-webkit-scrollbar-thumb { background: #888 }',
      })
      await openExamples(page)
      await page.evaluate(() => {
        const w = window as unknown as { __changes: number }
        w.__changes = 0
        new MutationObserver(() => {
          w.__changes += 1
        }).observe(document.querySelector('.wb-shell-settings-preview iframe')!, { attributes: true, attributeFilter: ['style'] })
      })
      const unsettled: number[] = []
      let bounced = 0
      for (let width = 1300; width >= 1260; width -= 1) {
        const start = await page.evaluate(() => (window as unknown as { __changes: number }).__changes)
        await page.setViewportSize({ width, height: 726 })
        const step = await page.evaluate(async () => {
          const w = window as unknown as { __changes: number }
          const began = performance.now()
          let last = w.__changes
          let quietSince = performance.now()
          while (performance.now() - began < 2000) {
            await new Promise((done) => setTimeout(done, 25))
            if (w.__changes !== last) {
              last = w.__changes
              quietSince = performance.now()
            } else if (performance.now() - quietSince >= 250) return { changes: w.__changes, settled: true }
          }
          return { changes: w.__changes, settled: false }
        })
        if (!step.settled) unsettled.push(width)
        if (step.changes - start > 2) bounced += 1
      }
      await context.close()
      // 판 카나리아 — 문턱 판이 섰다(폭마다 iframe 폭이 한 번 15px 좁아졌다 돌아온다 · 보고 L3).
      expect(bounced).toBeGreaterThan(10)
      expect(unsettled).toEqual([])
    } finally {
      await browser.close()
    }
  }, 240_000)
})

async function zoomedContext(stack: EditorStack, zoom: number, window: { width: number; height: number }): Promise<BrowserContext> {
  if (!전제.ok) throw new Error('전제 없음')
  const dir = mkdtempSync(join(tmpdir(), 'rv-pv-zoom-'))
  mkdirSync(join(dir, 'Default'), { recursive: true })
  const level = Math.log(zoom) / Math.log(1.2)
  writeFileSync(join(dir, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: { x: level } } }))
  const context = await chromium.launchPersistentContext(dir, {
    executablePath: 전제.executablePath,
    headless: true,
    viewport: null,
    baseURL: stack.webUrl,
    args: [`--window-size=${window.width},${window.height}`],
  })
  const response = await context.request.post(`${stack.webUrl}/api/auth/login`, {
    data: { email: stack.users.alice.email, password: stack.users.alice.password },
  })
  if (!response.ok()) throw new Error(`zoom login ${response.status()}`)
  return context
}
