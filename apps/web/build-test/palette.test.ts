/**
 * **하단 컴포넌트 판을 실브라우저로 잰다**(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「하단 컴포넌트 목록」) —
 * 판의 높이와 캔버스 몫(`src/shell/sidebar-layout.ts` 머리말 «하단 판의 높이»).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 판을 열면 캔버스 칸이 준다 | 판 높이만큼 안 준다 · 최대에서 캔버스 칸이 `CANVAS_MIN_HEIGHT` 아래 · 셸이 세로로 넘친다 · 새로고침 뒤 열림 · 높이를 잃는다 |
 * | 축소판 — 카드마다 표본 | 어느 카드의 창 안에 그 타입의 `[data-wb-component]` 가 안 선다(빈 카드) · 카드 수가 둘 수 있는 타입 수와 다르다 |
 * | 축소판 — 테마 표지 | `system-portal` 프로젝트에서 축소판 단추의 바탕이 그 테마 주색(`semantic.primary` 기본값)이 아니다 |
 * | 축소판 — 남이 토큰을 저장 | 저장 뒤에도 축소판 단추의 바탕이 옛 값이다 |
 * | 축소판 — 번들을 못 실음 | 축소판이 빈다(기본 뷰로 안 선다) |
 * | 축소판 — `inert` | 축소판 단추 자리를 눌러 iframe 문서에 클릭이 닿는다 · Tab 이 iframe 안으로 들어간다 |
 *
 * **잘라 보이는 방법을 고른 값**(`src/palette/palette-thumbs.tsx` 머리말 «같은 좌표») — 두 판을 같은 판(창 1440×900 · 판 기본 높이 · 카드
 * 18 — 카탈로그의 둘 수 있는 타입 전부)에서 쟀다. A(깔개를 트랙 안에 — 트랙과 함께 스크롤): 누름 → 모든 표본이 창 안에 선 첫 프레임까지
 * 58 · 59ms(rAF 1) · 정착 뒤 18/18 이 창 안 · 표본 중심과 창 중심의 차 0px · 휠로 1440px 미는 동안 rAF 90 프레임의 어긋남 최대 0px.
 * B(깔개를 보이는 칸에 고정하고 스크롤마다 iframe 을 옮김): 같은 값(55 · 54ms · 0 · 0)이지만 트랙 안쪽 여백만큼 따로 맞춰야 했다 — 그 보정을
 * 빼먹은 첫 판은 18 가운데 16 이 창 밖(12 · 8px). rAF 의 읽기는 메인 스레드 값이라 합성기 스크롤을 B 의 처리기가 따라가는 지연은 못 본다.
 * 같은 값에 장치가 적은 A 를 골랐다. 다시 재는 법: B 를 `palette-thumbs.tsx` 에 다시 세우고 위 셋을 같은 판에서 rAF 로 잰다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CANVAS_MIN_HEIGHT, PALETTE_HEIGHT_DEFAULT, PALETTE_HEIGHT_MIN } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 프로젝트 · 페이지 하나에 노드를 싣는다. */
async function fixture(
  stack: EditorStack,
  owner: Session,
  slug: string,
  nodes: unknown[],
  options: { bob?: boolean } = {},
): Promise<{ P: string; projectId: string; pageId: string; call: (m: string, p: string, b?: unknown) => Promise<{ status: number; body: any }> }> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: 'D2 목록', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  if (ops.length > 0) {
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }
  if (options.bob === true) {
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status !== 201) throw new Error(`멤버 ${member.status} ${JSON.stringify(member.body)}`)
  }
  return { P, projectId: project.id, pageId: page.id, call }
}

/** `#rrggbb` → 계산 스타일의 꼴 `rgb(r, g, b)`. */
function rgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (m === null) throw new Error(`색이 #rrggbb 가 아니다: ${hex}`)
  return `rgb(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)})`
}

/** 판을 연다 — 하단 바의 토글을 눌러 판이 설 때까지. */
async function openPalette(page: Page): Promise<void> {
  await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
  await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
}

/**
 * 카드마다 — 그 창(호스트 좌표) 안에 그 타입의 `[data-wb-component]` 가 보이는가(축소판 iframe 안의 상자를 호스트 좌표로 옮겨 견준다).
 * 가운데가 창 안이고 그 요소의 그린 상자가 창을 1px 넘지 않으면 «선다».
 */
const CARD_THUMBS = `(() => {
  const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
  if (iframe === null) return null
  const f = iframe.getBoundingClientRect()
  const doc = iframe.contentDocument
  const out = {}
  for (const win of document.querySelectorAll('[data-wb-palette-window]')) {
    const type = win.getAttribute('data-wb-palette-window')
    const w = win.getBoundingClientRect()
    const wrapper = doc.querySelector('[data-wb-palette-thumb="' + type + '"]')
    const hit = wrapper === null ? [] : [...wrapper.querySelectorAll('[data-wb-component]')].filter((el) => el.getAttribute('data-wb-component') === type)
    out[type] = hit.some((el) => {
      const n = el.getBoundingClientRect()
      const left = f.left + n.left, top = f.top + n.top
      const shown = getComputedStyle(wrapper).visibility === 'visible' && n.width > 0 && n.height > 0
      return shown && left >= w.left - 1 && top >= w.top - 1 && left + n.width <= w.right + 1 && top + n.height <= w.bottom + 1
    })
  }
  return out
})()`

/** 축소판 단추(갤러리 표본 «Button — 보통»)의 계산 바탕색. */
const THUMB_BUTTON = `(() => {
  const doc = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')?.contentDocument
  const button = doc?.querySelector('[data-wb-palette-thumb="Button"] [data-wb-component="Button"]')
  return button == null ? '단추 없음' : getComputedStyle(button).backgroundColor
})()`

const texts = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `n_t${index}`, type: 'Text', props: { content: `글 ${index} — 캔버스를 세로로 채운다` } }))

/** 셸 조각들의 높이(셸 · 머리 · 캔버스 칸 · 판 · 하단 바)와 셸의 세로 넘침. */
async function heights(page: Page) {
  return page.evaluate(() => {
    const h = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().height ?? null
    const shell = document.querySelector('.wb-shell') as HTMLElement
    return {
      shell: h('.wb-shell'),
      head: h('.wb-shell-header'),
      canvas: h('.wb-shell-canvas'),
      palette: h('.wb-shell-palette'),
      footer: h('.wb-shell-footer'),
      overflow: shell.scrollHeight - shell.clientHeight,
    }
  })
}

describe.skipIf(!전제.ok)('하단 컴포넌트 판 — 실브라우저', () => {
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

  it.each([900, 700])('판을 열면 캔버스 칸이 판 높이만큼 준다 — 창 높이 %i', async (windowHeight) => {
    const { P } = await fixture(stack, alice, `pal-h${windowHeight}`, texts(3))
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: windowHeight } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      const closed = await heights(page)

      const toggle = page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true })
      await toggle.click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      const opened = await heights(page)

      const handle = page.getByRole('separator', { name: '컴포넌트 목록 높이' })
      await handle.focus()
      await page.keyboard.press('End')
      const tallest = await heights(page)
      await page.keyboard.press('Home')
      const lowest = await heights(page)
      // 끌기 — 위로 40px 끌면 40px 커진다(`reversed`).
      await page.keyboard.press('Enter')
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + 200, box.y + 3)
      await page.mouse.down()
      await page.mouse.move(box.x + 200, box.y + 3 - 40, { steps: 4 })
      await page.mouse.up()
      const dragged = await heights(page)

      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      const reloaded = await heights(page)

      // eslint-disable-next-line no-console
      console.log(`[하단 판 높이] 창 ${windowHeight}: ${JSON.stringify({ closed, opened, tallest, lowest, dragged, reloaded })}`)

      expect(opened.palette).toBe(PALETTE_HEIGHT_DEFAULT)
      // 닫힌 판의 빈 줄도 칸 사이 여백을 쥐어 — 캔버스는 판 높이만큼만 준다.
      expect(closed.canvas! - opened.canvas!).toBe(PALETTE_HEIGHT_DEFAULT)
      expect(tallest.canvas!).toBeGreaterThanOrEqual(CANVAS_MIN_HEIGHT)
      expect(lowest.palette).toBe(PALETTE_HEIGHT_MIN)
      expect(dragged.palette).toBe(PALETTE_HEIGHT_DEFAULT + 40)
      expect(reloaded.palette).toBe(PALETTE_HEIGHT_DEFAULT + 40)
      for (const state of [closed, opened, tallest, lowest, dragged, reloaded]) expect(state.overflow).toBe(0)
    } finally {
      await context.close()
    }
  })

  it('축소판 — 카드마다 그 타입의 표본이 창 안에 선다 · 빈 카드가 없다', async () => {
    const { P } = await fixture(stack, alice, 'pal-thumbs', texts(1))
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      await openPalette(page)
      const shown = await poll(
        '표본이 선다',
        async () => (await page.evaluate(CARD_THUMBS)) as Record<string, boolean> | null,
        (value) => value !== null && Object.values(value).length > 0 && Object.values(value).every(Boolean),
      ).catch(async () => (await page.evaluate(CARD_THUMBS)) as Record<string, boolean> | null)
      const cards = await page.locator('[data-wb-palette-card]').count()
      // eslint-disable-next-line no-console
      console.log(`[축소판 표본] ${JSON.stringify(shown)}`)
      expect(Object.keys(shown ?? {}).length).toBe(cards)
      expect(Object.entries(shown ?? {}).filter(([, ok]) => !ok).map(([type]) => type)).toEqual([])
    } finally {
      await context.close()
    }
  })

  it('축소판 — 프로젝트 테마(system-portal)로 그리고, 남이 주색을 저장하면 따라간다', async () => {
    const project = await fixture(stack, alice, 'pal-portal', texts(1), { bob: true })
    const manifest = (await project.call('GET', '/theme-packages/system-portal/1.0.0/manifest')).body
    const portalPrimary = rgb(String(manifest.tokens.items['semantic.primary'].default))
    await putTheme(project.call, project.projectId, { themeId: 'system-portal', version: '1.0.0', tokens: {} })
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(project.P)
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      await openPalette(page)
      const before = await poll('축소판 표지', async () => String(await page.evaluate(THUMB_BUTTON)), (value) => value === portalPrimary).catch(
        async () => String(await page.evaluate(THUMB_BUTTON)),
      )
      await putTheme(project.call, project.projectId, { themeId: 'system-portal', version: '1.0.0', tokens: { 'semantic.primary': '#00aa11' } })
      const after = await poll('남의 저장을 따라간다', async () => String(await page.evaluate(THUMB_BUTTON)), (value) => value === 'rgb(0, 170, 17)').catch(
        async () => String(await page.evaluate(THUMB_BUTTON)),
      )
      expect({ before, after }).toEqual({ before: portalPrimary, after: 'rgb(0, 170, 17)' })
    } finally {
      await context.close()
    }
  })

  it('축소판 — 번들을 못 실으면 기본 뷰로 선다 · 빈 판이 아니다', async () => {
    const { P } = await fixture(stack, alice, 'pal-nobundle', texts(1))
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    let refused = 0
    await page.route('**/files/theme.js', (route) => {
      refused += 1
      return route.fulfill({ status: 404, body: 'no' })
    })
    try {
      await page.goto(P)
      await page.getByText(/테마를 불러오지 못해 기본 모양으로 그립니다/).waitFor()
      await openPalette(page)
      const shown = await poll(
        '표본이 선다',
        async () => (await page.evaluate(CARD_THUMBS)) as Record<string, boolean> | null,
        (value) => value !== null && Object.values(value).length > 0 && Object.values(value).every(Boolean),
      ).catch(async () => (await page.evaluate(CARD_THUMBS)) as Record<string, boolean> | null)
      const sheets = await page.evaluate(
        `[...document.querySelector('iframe.wb-shell-palette-thumbs-iframe').contentDocument.querySelectorAll('head [data-wb-style]')].map((el) => el.tagName.toLowerCase() + ':' + el.getAttribute('data-wb-style'))`,
      )
      expect(refused).toBeGreaterThanOrEqual(1)
      expect(sheets).toEqual(['style:base', 'style:tokens'])
      expect(Object.keys(shown ?? {}).length).toBeGreaterThan(0)
      expect(Object.entries(shown ?? {}).filter(([, ok]) => !ok).map(([type]) => type)).toEqual([])
    } finally {
      await context.close()
    }
  })

  it('축소판 — 안의 단추를 눌러도 · Tab 으로도 닿지 않는다(inert)', async () => {
    const { P } = await fixture(stack, alice, 'pal-inert', texts(1))
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      await openPalette(page)
      await poll('단추 표본', async () => String(await page.evaluate(THUMB_BUTTON)), (value) => value !== '단추 없음')
      await page.locator('[data-wb-palette-card="Button"]').scrollIntoViewIfNeeded()
      await page.waitForTimeout(100)
      // iframe 문서가 받는 클릭 · 포커스를 센다.
      await page.evaluate(`(() => {
        const doc = document.querySelector('iframe.wb-shell-palette-thumbs-iframe').contentDocument
        window.__thumbHits = { clicks: 0, focus: 0 }
        doc.addEventListener('click', () => window.__thumbHits.clicks++, true)
        doc.addEventListener('focusin', () => window.__thumbHits.focus++, true)
      })()`)
      // 축소판 단추의 가운데(호스트 좌표) — 그 위에 무엇이 서는지와 누른 뒤.
      const center = (await page.evaluate(`(() => {
        const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
        const f = iframe.getBoundingClientRect()
        const b = iframe.contentDocument.querySelector('[data-wb-palette-thumb="Button"] [data-wb-component="Button"]').getBoundingClientRect()
        return { x: f.left + b.left + b.width / 2, y: f.top + b.top + b.height / 2 }
      })()`)) as { x: number; y: number }
      const top = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y)
          return el?.closest('[data-wb-palette-card]')?.getAttribute('data-wb-palette-card') ?? el?.tagName ?? null
        },
        center,
      )
      await page.mouse.click(center.x, center.y)
      // 카드 줄을 Tab 으로 지난다 — 판 안의 단추들 뒤 하단 바까지.
      await page.getByRole('separator', { name: '컴포넌트 목록 높이' }).focus()
      const visited: string[] = []
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab')
        visited.push(await page.evaluate(() => document.activeElement?.tagName ?? ''))
      }
      const hits = await page.evaluate('window.__thumbHits')
      expect({ top, hits, iframeFocused: visited.includes('IFRAME') }).toEqual({ top: 'Button', hits: { clicks: 0, focus: 0 }, iframeFocused: false })
    } finally {
      await context.close()
    }
  })
})
