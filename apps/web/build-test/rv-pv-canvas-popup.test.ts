/**
 * **RV-PV · 에디터 뷰 모드의 팝업 덮개 구간이 `usePopupArea` 를 바꾼 뒤에도 같은 자리에 서는지** 실브라우저로 잰다
 * (`src/canvas/canvas-popups.tsx` 의 `usePopupArea` — 보이는 구간을 «스크롤 상자 ∩ 창» 으로 셈하고 호스트 문서의 `scroll` 을 캡처로 듣는다).
 *
 * 판마다 덮개 층(`[data-wb-popup-layer]`)의 호스트 상자를 «캔버스 칸 ∩ iframe ∩ 창» 과 견주고, 고치기 전 셈(«칸 ∩ iframe» — 창을 안 본다)과
 * 같은 값인지(칸이 창 안인지)를 판 카나리아로 적는다 — 둘이 같으면 고친 셈과 고치기 전 셈이 그 판에서 같은 자리를 낸다.
 *
 * | 판 | 재는 것 |
 * | --- | --- |
 * | 줌 50 · 100 · 200 % (창 1440×900) | 덮개 = 칸 ∩ iframe ∩ 창 · 상자 ✖ 가 그 안 |
 * | 굴린 칸 | 긴 화면을 끝까지 굴린 뒤 «아래 열기» · 맨 위에서 열고 칸을 굴린 뒤 |
 * | 좁은 창 · 기기 폭 | 창 700 · 프리셋 375 · 1920 |
 * | 브라우저 확대 200 % | 창 1440×900 · 프로필 기본 확대 |
 * | 굴림 비용 | 팝업이 열린 동안 캔버스 칸 · 다른 스크롤 상자(구조 트리)의 `scroll` 한 번에 덮개 셈이 몇 번 도는가 |
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Frame, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const opener = (id: string, label: string, target: string) => ({
  id,
  type: 'Button',
  props: { label },
  interactions: [{ on: 'click', actions: [{ type: 'openModal', target }] }],
})

const intersect = (...boxes: Box[]): Box => ({
  left: Math.max(...boxes.map((b) => b.left)),
  top: Math.max(...boxes.map((b) => b.top)),
  right: Math.min(...boxes.map((b) => b.right)),
  bottom: Math.min(...boxes.map((b) => b.bottom)),
})
const near = (a: Box, b: Box): boolean =>
  Math.abs(a.left - b.left) <= 1 && Math.abs(a.top - b.top) <= 1 && Math.abs(a.right - b.right) <= 1 && Math.abs(a.bottom - b.bottom) <= 1
const round = (b: Box): Box => ({
  left: Math.round(b.left),
  top: Math.round(b.top),
  right: Math.round(b.right),
  bottom: Math.round(b.bottom),
})

interface Measured {
  layer: Box
  popup: Box
  expected: Box
  before: Box
  paneInView: boolean
}

/** 두 프레임(호스트 · 캔버스) — 굴림 리스너가 다시 잰 값이 그려진 뒤다. */
async function frames(page: Page, frame: Frame): Promise<void> {
  const two = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
  await page.evaluate(two)
  await frame.evaluate(two)
}

async function measure(page: Page, frame: Frame): Promise<Measured> {
  await frames(page, frame)
  const host = await page.evaluate(() => {
    const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')!
    // `usePopupArea` 의 `scrollParent` 와 같은 셈 — 가장 가까운 세로 스크롤 조상.
    let scroller: Element | null = null
    for (let at = iframe.parentElement; at !== null; at = at.parentElement) {
      const overflow = getComputedStyle(at).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        scroller = at
        break
      }
    }
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return {
      scroller: scroller === null ? null : rect(scroller),
      scrollerClass: scroller?.className ?? null,
      iframe: rect(iframe),
      view: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
    }
  })
  const layerBox = await canvasFrame(page).locator('[data-wb-popup-layer]').boundingBox()
  const popupBox = await canvasFrame(page).locator('[data-wb-popup-frame]').last().boundingBox()
  if (layerBox === null || popupBox === null || host.scroller === null) throw new Error(`판이 안 섰다 ${JSON.stringify(host)}`)
  const layer = { left: layerBox.x, top: layerBox.y, right: layerBox.x + layerBox.width, bottom: layerBox.y + layerBox.height }
  const popup = { left: popupBox.x, top: popupBox.y, right: popupBox.x + popupBox.width, bottom: popupBox.y + popupBox.height }
  const expected = intersect(host.scroller, host.iframe, host.view)
  const before = intersect(host.scroller, host.iframe)
  const paneInView =
    host.scroller.left >= 0 && host.scroller.top >= 0 && host.scroller.right <= host.view.right && host.scroller.bottom <= host.view.bottom
  return { layer: round(layer), popup: round(popup), expected: round(expected), before: round(before), paneInView }
}

async function zoomTo(page: Page, target: number): Promise<void> {
  const group = page.getByRole('group', { name: '줌' })
  for (let step = 0; step < 16; step += 1) {
    const now = Number((await group.locator('.wb-shell-zoom-value').textContent())?.replace('%', '')) / 100
    if (Math.abs(now - target) < 0.01) return
    await group.getByRole('button', { name: now < target ? '확대' : '축소', exact: true }).click()
  }
  throw new Error(`줌 ${target} 에 못 닿았다`)
}

async function enterView(page: Page, path: string, ready: string): Promise<Frame> {
  await page.goto(path)
  await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor()
  await page.getByRole('button', { name: '뷰 모드' }).click()
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
  return frame
}

/** 요소의 `click()` 으로 연다 — 누르기가 칸을 다시 굴리지 않게. */
async function open(page: Page, id: string): Promise<void> {
  await canvasFrame(page)
    .locator(`[data-wb-id="${id}"]`)
    .evaluate((el) => (el as HTMLElement).click())
  await canvasFrame(page).locator('[data-wb-popup-frame]').waitFor()
}

const results: Record<string, Measured> = {}

function judge(name: string, m: Measured): void {
  results[name] = m
  // eslint-disable-next-line no-console
  console.log(`[rv-pv 덮개] ${name} ${JSON.stringify(m)}`)
  expect(near(m.layer, m.expected), `${name} 덮개 ${JSON.stringify(m)}`).toBe(true)
  expect(m.popup.top >= m.expected.top - 1 && m.popup.bottom <= m.expected.bottom + 1, `${name} 상자 세로 ${JSON.stringify(m)}`).toBe(true)
}

describe.skipIf(!전제.ok)('RV-PV — 에디터 뷰 모드 팝업 덮개 구간', () => {
  let stack: EditorStack
  let alice: Session
  let P = ''
  let LONG = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    ;({ P, LONG } = await fixture(stack, alice))
  }, 120_000)

  afterAll(async () => {
    // eslint-disable-next-line no-console
    console.log(`[rv-pv 덮개] 요약 ${JSON.stringify(results)}`)
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('줌 50 · 100 · 200 % — 덮개가 칸 ∩ iframe ∩ 창이고 칸이 창 안이다(고치기 전 셈과 같은 자리)', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      const frame = await enterView(page, P, 'n_open')
      for (const zoom of [1, 0.5, 2]) {
        await zoomTo(page, zoom)
        await open(page, 'n_open')
        const m = await measure(page, frame)
        judge(`zoom ${zoom}`, m)
        expect(m.paneInView).toBe(true)
        await page.keyboard.press('Escape')
        await canvasFrame(page).locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
      }
    } finally {
      await context.close()
    }
  })

  it('굴린 칸 — 끝까지 굴린 뒤 연 판 · 맨 위에서 열고 칸을 굴린 판', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      const frame = await enterView(page, LONG, 'n_open')
      const room = await page.locator('.wb-shell-canvas').evaluate((el) => el.scrollHeight - el.clientHeight)
      // 판 카나리아 — 칸이 구를 자리가 있다.
      expect(room).toBeGreaterThan(500)
      await page.locator('.wb-shell-canvas').evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await open(page, 'n_open_bottom')
      const bottom = await measure(page, frame)
      judge('scrolled-then-open', bottom)
      expect(bottom.paneInView).toBe(true)
      await page.keyboard.press('Escape')
      await canvasFrame(page).locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
      await page.locator('.wb-shell-canvas').evaluate((el) => {
        el.scrollTop = 0
      })
      await open(page, 'n_open')
      const top = await measure(page, frame)
      await page.locator('.wb-shell-canvas').evaluate((el) => {
        el.scrollTop = 700
      })
      const moved = await measure(page, frame)
      judge('open-then-scroll', moved)
      // 판 카나리아 — 굴림 리스너가 다시 쟀다(맨 위에서는 iframe 위 여백 밑에서 서고, 굴린 뒤에는 칸 위 끝에서 선다).
      expect(moved.layer.top).toBeLessThan(top.layer.top)
    } finally {
      await context.close()
    }
  })

  for (const [name, viewport, preset] of [
    ['창 700', { width: 700, height: 900 }, null],
    ['프리셋 375', { width: 1440, height: 900 }, '375'],
    ['프리셋 1920', { width: 1440, height: 900 }, '1920'],
  ] as const) {
    it(`좁은 창 · 기기 폭 — ${name}`, async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport })
      try {
        const frame = await enterView(page, P, 'n_open')
        if (preset !== null) {
          await page.getByLabel('뷰포트 폭').selectOption(preset)
          await poll(
            '프리셋',
            () => page.locator('iframe.wb-shell-canvas-iframe').evaluate((el) => (el as HTMLElement).offsetWidth),
            (width) => width === Number(preset),
          )
        }
        await open(page, 'n_open')
        const m = await measure(page, frame)
        judge(name, m)
        expect(m.paneInView).toBe(true)
      } finally {
        await context.close()
      }
    })
  }

  it('브라우저 확대 200 % — 창 1440×900', async () => {
    if (!전제.ok) return
    const context = await zoomedContext(stack, 2, { width: 1440, height: 900 })
    try {
      const page = context.pages()[0] ?? (await context.newPage())
      // 판 카나리아 — 확대가 실렸다.
      await page.goto(stack.webUrl + P)
      expect(await page.evaluate(() => devicePixelRatio)).toBeGreaterThanOrEqual(2)
      const frame = await enterView(page, stack.webUrl + P, 'n_open')
      await open(page, 'n_open')
      const m = await measure(page, frame)
      judge('browser zoom 200', m)
      expect(m.paneInView).toBe(true)
    } finally {
      await context.close()
    }
  })

  it('굴림 비용 — 팝업이 열린 동안 scroll 한 번에 덮개 셈이 한 번 돈다(칸 · 다른 상자)', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      const frame = await enterView(page, LONG, 'n_open')
      // iframe 요소의 `getBoundingClientRect` 를 세면 덮개 셈 수다(셈마다 한 번 — 다른 자리는 호스트에서 iframe 상자를 안 묻는다).
      const count = async (selector: string): Promise<{ calls: number; ms: number; events: number }> =>
        page.evaluate((selector) => {
          const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')!
          const target = document.querySelector(selector)
          if (target === null) throw new Error(`${selector} 없음`)
          let calls = 0
          const original = iframe.getBoundingClientRect.bind(iframe)
          iframe.getBoundingClientRect = () => {
            calls += 1
            return original()
          }
          const events = 200
          const start = performance.now()
          for (let i = 0; i < events; i += 1) target.dispatchEvent(new Event('scroll'))
          const ms = performance.now() - start
          delete (iframe as unknown as Record<string, unknown>)['getBoundingClientRect']
          return { calls, ms, events }
        }, selector)
      const closedCanvas = await count('.wb-shell-canvas')
      await open(page, 'n_open')
      await frames(page, frame)
      const openCanvas = await count('.wb-shell-canvas')
      // 칸 밖의 상자 — `scroll` 은 버블하지 않아 고치기 전 리스너(칸 · 창)에는 안 닿고, 문서 캡처에는 닿는다.
      const openOther = await count('body')
      // eslint-disable-next-line no-console
      console.log(`[rv-pv 덮개] 굴림 비용 ${JSON.stringify({ closedCanvas, openCanvas, openOther })}`)
      expect(closedCanvas.calls).toBe(0)
      expect(openCanvas.calls).toBe(openCanvas.events)
      expect(openOther.calls).toBeLessThanOrEqual(openOther.events)
    } finally {
      await context.close()
    }
  })
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

/** 메뉴 «관리자» 아래 — «목록»(등록을 여는 단추) · «등록»(팝업 · 긴 몸통) · «긴 목록»(맨 위 · 맨 아래에 여는 단추 · 뒤 화면 80 줄). */
async function fixture(stack: EditorStack, owner: Session): Promise<{ P: string; LONG: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string) => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(await call('POST', '/projects', { name: '덮개', slug: `rvpv-${Date.now().toString(36)}` }), '프로젝트')
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const body = Array.from({ length: 24 }, (_, i) => ({
    id: `n_line${String(i).padStart(2, '0')}`,
    type: 'Text',
    props: { content: `몸통 ${i + 1}` },
  }))
  const pages: [string, 'page' | 'popup', unknown[]][] = [
    ['목록', 'page', [opener('n_open', '등록 열기', 'page:관리자/등록'), { id: 'n_after', type: 'Text', props: { content: '뒤 화면' } }]],
    ['등록', 'popup', body],
    [
      '긴 목록',
      'page',
      [
        opener('n_open', '등록 열기', 'page:관리자/등록'),
        ...Array.from({ length: 80 }, (_, i) => ({
          id: `n_row${String(i).padStart(2, '0')}`,
          type: 'Text',
          props: { content: `뒤 화면 ${i + 1}` },
        })),
        opener('n_open_bottom', '아래 열기', 'page:관리자/등록'),
      ],
    ],
  ]
  let P = ''
  let LONG = ''
  for (const [title, kind, nodes] of pages) {
    const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title, kind }), title)
    if (P === '') P = `/projects/${project.id}/pages/${page.id}`
    if (title === '긴 목록') LONG = `/projects/${project.id}/pages/${page.id}`
    const ops = nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value }))
    ok(await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, { baseSeq: 0, ops }), `ops ${title}`)
  }
  return { P, LONG }
}
