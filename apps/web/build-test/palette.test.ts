/**
 * **하단 컴포넌트 판을 실브라우저로 잰다**(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「하단 컴포넌트 목록」) —
 * 판의 높이와 캔버스 몫(`src/shell/sidebar-layout.ts` 머리말 «하단 판의 높이»).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 판을 열면 캔버스 칸이 준다 | 판 높이만큼 안 준다 · 최대에서 캔버스 칸이 `CANVAS_MIN_HEIGHT` 아래 · 셸이 세로로 넘친다 · 새로고침 뒤 열림 · 높이를 잃는다 |
 * | 축소판 — 카드마다 표본 | 탭 다섯을 돌며 어느 카드의 창 안에 그 타입의 `[data-wb-component]` 가 안 선다(빈 카드) · 카드가 18 보다 적다 |
 * | 축소판 — 테마 표지 | `system-portal` 프로젝트에서 축소판 단추의 바탕이 그 테마 주색(`semantic.primary` 기본값)이 아니다 |
 * | 축소판 — 남이 토큰을 저장 | 저장 뒤에도 축소판 단추의 바탕이 옛 값이다 |
 * | 축소판 — 번들을 못 실음 | 축소판이 빈다(기본 뷰로 안 선다) |
 * | 축소판 — `inert` | 축소판 단추 자리를 눌러 iframe 문서에 클릭이 닿는다 · Tab 이 iframe 안으로 들어간다 |
 * | 카드 끌어 놓기 — 캔버스 · 트리 | 빈 카드 안 · 형제 앞 · 페이지 끝 · 구조 트리 줄에 놓은 자리가 서버 문서와 다르다 · 넣은 노드가 안 골라진다 · 이름표가 안 따라온다 · 되돌리기 넷 뒤 원래 문서가 아니다 |
 * | 카드 — 못 놓는 자리 | 남이 잡은 카드 위 · 판 위에서 표시가 서거나 놓아 편집이 나간다 |
 * | 카드 — 끄는 중 페이지 옮김 | 옮긴 뒤 표시가 남는다 · 새 페이지 위에 놓아 편집이 나간다(판은 셸과 함께 남아 끌기가 이어진다 — 경로 층의 판 검사가 막는다) |
 * | 카드 — 몸통 누름 · «넣기» Enter · 끈 뒤 클릭 | 몸통(창 · 이름 줄)을 누르기만 해도 넣는다 · «넣기» 단추의 Enter 로 안 넣는다 · 끌어 놓은 뒤의 `click` 이 한 번 더 넣는다 |
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

/** 검색으로 그 타입의 카드만 세운다 — 탭은 한 갈래의 카드만 세운다(`Button` 은 액션 갈래). */
async function showOnly(page: Page, type: string): Promise<void> {
  await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
  await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
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
      // 탭마다 그 갈래의 카드가 선다 — 다섯을 돌며 모은다.
      const shown: Record<string, boolean> = {}
      let cards = 0
      const tabs = page.getByRole('tablist', { name: '갈래' }).getByRole('tab')
      for (let i = 0; i < (await tabs.count()); i += 1) {
        await tabs.nth(i).click()
        const here = await poll(
          '표본이 선다',
          async () => (await page.evaluate(CARD_THUMBS)) as Record<string, boolean> | null,
          (value) => value !== null && Object.values(value).length > 0 && Object.values(value).every(Boolean),
        ).catch(async () => (await page.evaluate(CARD_THUMBS)) as Record<string, boolean> | null)
        cards += await page.locator('[data-wb-palette-card]').count()
        Object.assign(shown, here ?? {})
      }
      // eslint-disable-next-line no-console
      console.log(`[축소판 표본] ${JSON.stringify(shown)}`)
      expect(cards).toBeGreaterThanOrEqual(18)
      expect(Object.keys(shown).length).toBe(cards)
      expect(Object.entries(shown).filter(([, ok]) => !ok).map(([type]) => type)).toEqual([])
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
      await showOnly(page, 'Button')
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
      await showOnly(page, 'Button')
      await poll('단추 표본', async () => String(await page.evaluate(THUMB_BUTTON)), (value) => value !== '단추 없음')
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
        // 축소판 iframe 만 센다 — Tab 이 한 바퀴 돌면 캔버스 iframe 에 닿는다(그것은 포커스를 받는 자리다).
        visited.push(await page.evaluate(() => (document.activeElement?.classList.contains('wb-shell-palette-thumbs-iframe') === true ? 'THUMBS' : document.activeElement?.tagName) ?? ''))
      }
      const hits = await page.evaluate('window.__thumbHits')
      expect({ top, hits, iframeFocused: visited.includes('THUMBS') }).toEqual({ top: 'Button', hits: { clicks: 0, focus: 0 }, iframeFocused: false })
    } finally {
      await context.close()
    }
  })

  describe('카드 끌어 놓기 · 누름', () => {
    interface SeedNode {
      id: string
      type: string
      props?: Record<string, unknown>
      children?: SeedNode[]
    }

    /**
     * ```
     * Page
     * ├ Text    n_text  '글'
     * ├ Card    n_card  '카드'
     * │ └ Text  n_intx  '안'
     * ├ Card    n_empt  '빈 카드'
     * └ Text    n_last  '끝'
     * ```
     */
    const BASIC: SeedNode[] = [
      { id: 'n_text', type: 'Text', props: { content: '글' } },
      { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
      { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
      { id: 'n_last', type: 'Text', props: { content: '끝' } },
    ]
    const ORIGINAL = { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last'] }
    const KNOWN = new Set(['n_text', 'n_card', 'n_intx', 'n_empt', 'n_last', 'n_text2', 'n_empt2'])

    /** 서버 문서의 모양 — 뿌리는 `n_root`, 픽스처에 없는 노드(넣은 것)는 `+타입`. */
    async function shape(P: string): Promise<unknown> {
      const walk = (node: { id: string; type: string; children?: unknown[] }, root: boolean): unknown => {
        const name = root ? 'n_root' : KNOWN.has(node.id) ? node.id : `+${node.type}`
        return Array.isArray(node.children) && node.children.length > 0 ? { [name]: node.children.map((child) => walk(child as never, false)) } : name
      }
      return walk((await stack.request(alice, 'GET', P)).body.schema.root, true)
    }

    async function seed(slug: string, pages: SeedNode[][]): Promise<{ P: string[]; projectId: string }> {
      const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
      const project = (await call('POST', '/projects', { name: 'D2 끌기', slug: `${slug}-${Date.now().toString(36)}` })).body
      const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
      const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
      if (member.status >= 300) throw new Error(`member ${member.status}`)
      const P: string[] = []
      for (const [index, nodes] of pages.entries()) {
        const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: `쪽${index + 1}` })).body.id
        const path = `/projects/${project.id}/pages/${pageId}`
        const seeded = await call('PATCH', `${path}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
        if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
        P.push(path)
      }
      return { P, projectId: project.id }
    }

    async function openEditor(P: string, user: 'alice' | 'bob' = 'alice'): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
      const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1440, height: 900 } })
      const patches: string[] = []
      page.on('websocket', (socket) => {
        socket.on('framesent', (frame) => {
          const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
          if (text.includes('"type":"patch"')) patches.push(text)
        })
      })
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      return { page, close: () => context.close(), patches }
    }

    async function nodeBox(page: Page, id: string): Promise<{ x: number; y: number; width: number; height: number }> {
      const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
      if (box === null) throw new Error(`캔버스에 ${id} 상자가 없다`)
      return box
    }

    async function spotIn(page: Page, id: string, fx: number, fy: number): Promise<{ x: number; y: number }> {
      const box = await nodeBox(page, id)
      return { x: box.x + box.width * fx, y: box.y + box.height * fy }
    }

    /** 검색으로 그 타입의 카드 하나만 세운다. */
    async function only(page: Page, type: string): Promise<void> {
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
      await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
    }

    /** 카드를 쥐고 문턱(4px)을 넘긴다. */
    async function grabCard(page: Page, type: string): Promise<void> {
      const box = (await page.locator(`[data-wb-palette-card="${type}"]`).boundingBox())!
      const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
    }

    async function moveTo(page: Page, at: { x: number; y: number }): Promise<void> {
      await page.mouse.move(at.x, at.y, { steps: 8 })
    }

    async function indicators(page: Page): Promise<string[]> {
      return page
        .locator('.wb-shell-drop-indicator')
        .evaluateAll((els) => els.map((el) => `${el.getAttribute('data-placement')}${el.getAttribute('data-axis') === null ? '' : `:${el.getAttribute('data-axis')}`}`))
    }

    function treeRow(page: Page, id: string) {
      return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
    }

    /** 지금 고른 노드(선택 외곽선의 id). */
    async function selectedId(page: Page): Promise<string | null> {
      return page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)
    }

    /** 서버 문서에서 `+타입` 으로 넣은 노드의 id 들. */
    async function addedIds(P: string): Promise<string[]> {
      const ids: string[] = []
      const walk = (node: { id: string; children?: unknown[] }) => {
        if (!KNOWN.has(node.id) && node.id !== root.id) ids.push(node.id)
        for (const child of node.children ?? []) walk(child as never)
      }
      const root = (await stack.request(alice, 'GET', P)).body.schema.root
      walk(root)
      return ids
    }

    it('캔버스의 빈 카드 안 · 형제 앞 · 페이지 끝 · 구조 트리 줄로 끌어 놓으면 서버 문서가 그 자리이고, 되돌리기 넷으로 원래 문서다', async () => {
      const { P } = await seed('pal-drag', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')

        await grabCard(page, 'Divider')
        await moveTo(page, await spotIn(page, 'n_empt', 0.5, 0.5))
        const intoHint = await indicators(page)
        const tag = await page.locator('.wb-shell-palette-dragtag').textContent()
        await page.mouse.up()
        const into = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) !== JSON.stringify(ORIGINAL))
        const firstNew = (await addedIds(P[0]!))[0]
        const selectedAfterDrop = await poll('넣은 노드를 고른다', () => selectedId(page), (id) => id === firstNew).catch(() => selectedId(page))

        await grabCard(page, 'Divider')
        await moveTo(page, await spotIn(page, 'n_intx', 0.5, 0.1))
        const beforeHint = await indicators(page)
        await page.mouse.up()
        const before = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) !== JSON.stringify(into))

        await grabCard(page, 'Divider')
        const last = await nodeBox(page, 'n_last')
        // 문서 아래의 바탕 — 캔버스 iframe 은 문서가 짧아도 최소 높이(320)라 마지막 노드 밑에 노드 없는 자리가 있다.
        await moveTo(page, { x: last.x + 200, y: last.y + last.height + 12 })
        const endHint = await indicators(page)
        await page.mouse.up()
        const atEnd = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) !== JSON.stringify(before))

        await grabCard(page, 'Divider')
        const row = (await treeRow(page, 'n_card').boundingBox())!
        await moveTo(page, { x: row.x + 30, y: row.y + row.height / 2 })
        const rowHint = await indicators(page)
        await page.mouse.up()
        const onRow = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) !== JSON.stringify(atEnd))

        const undo = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
        for (let i = 0; i < 4; i += 1) await undo.click()
        const undone = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) === JSON.stringify(ORIGINAL)).catch(() => shape(P[0]!))

        expect({ intoHint, tag, into, selected: selectedAfterDrop === firstNew, beforeHint, before, endHint, atEnd, rowHint, onRow, undone, sent: patches.length }).toEqual({
          intoHint: ['inside'],
          tag: '구분선',
          into: { n_root: ['n_text', { n_card: ['n_intx'] }, { n_empt: ['+Divider'] }, 'n_last'] },
          selected: true,
          beforeHint: ['before:y'],
          before: { n_root: ['n_text', { n_card: ['+Divider', 'n_intx'] }, { n_empt: ['+Divider'] }, 'n_last'] },
          endHint: ['inside'],
          atEnd: { n_root: ['n_text', { n_card: ['+Divider', 'n_intx'] }, { n_empt: ['+Divider'] }, 'n_last', '+Divider'] },
          rowHint: ['inside'],
          onRow: { n_root: ['n_text', { n_card: ['+Divider', 'n_intx', '+Divider'] }, { n_empt: ['+Divider'] }, 'n_last', '+Divider'] },
          undone: ORIGINAL,
          sent: 8,
        })
      } finally {
        await close()
      }
    })

    it('못 놓는 자리 — 남이 잡은 카드 위 · 판 위 — 표시가 없고 놓아도 편집이 없다', async () => {
      const { P } = await seed('pal-refuse', [BASIC])
      const bob = await openEditor(P[0]!, 'bob')
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        const pickAt = await spotIn(bob.page, 'n_empt', 0.5, 0.5)
        await bob.page.mouse.click(pickAt.x, pickAt.y)
        await page.locator('.wb-shell-structure-lock').waitFor()
        await openPalette(page)
        await only(page, 'Divider')

        await grabCard(page, 'Divider')
        await moveTo(page, await spotIn(page, 'n_empt', 0.5, 0.5))
        const overLocked = await indicators(page)
        await page.mouse.up()
        await page.waitForTimeout(400)

        await grabCard(page, 'Divider')
        const palette = (await page.getByRole('region', { name: '컴포넌트 목록' }).boundingBox())!
        await moveTo(page, { x: palette.x + palette.width - 40, y: palette.y + palette.height / 2 })
        const overPalette = await indicators(page)
        await page.mouse.up()
        await page.waitForTimeout(400)

        expect({ overLocked, overPalette, sent: patches.length, shape: await shape(P[0]!) }).toEqual({
          overLocked: [],
          overPalette: [],
          sent: 0,
          shape: ORIGINAL,
        })
      } finally {
        await close()
        await bob.close()
      }
    })

    it('끄는 중 페이지를 옮기면(뒤로 가기) 표시가 걷히고 새 페이지 위에 놓아도 편집이 없다', async () => {
      const page2: SeedNode[] = [
        { id: 'n_text2', type: 'Text', props: { content: '글' } },
        { id: 'n_empt2', type: 'Card', props: { title: '빈 카드' } },
      ]
      const { P } = await seed('pal-page-move', [BASIC, page2])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await page.getByRole('link', { name: '쪽2' }).click()
        await page.waitForURL((url) => url.pathname === P[1])
        await canvasFrame(page).locator('[data-wb-id="n_empt2"]').waitFor()
        await openPalette(page)
        await only(page, 'Divider')
        await grabCard(page, 'Divider')
        await moveTo(page, await spotIn(page, 'n_empt2', 0.5, 0.5))
        const armed = await indicators(page)
        await page.evaluate(() => history.back())
        await page.waitForURL((url) => url.pathname === P[0])
        await canvasFrame(page).locator('[data-wb-id="n_empt"]').waitFor()
        const afterMove = (await indicators(page)).length
        await moveTo(page, await spotIn(page, 'n_empt', 0.5, 0.5))
        const overNewPage = (await indicators(page)).length
        await page.mouse.up()
        await page.waitForTimeout(500)
        expect({ armed, afterMove, overNewPage, sent: patches.length, first: await shape(P[0]!), second: await shape(P[1]!) }).toEqual({
          armed: ['inside'],
          afterMove: 0,
          overNewPage: 0,
          sent: 0,
          first: ORIGINAL,
          second: { n_root: ['n_text2', 'n_empt2'] },
        })
      } finally {
        await close()
      }
    })

    it('몸통 누름은 안 넣고 · «넣기» 단추의 Enter 로 넣고 · 끌어 놓은 뒤의 클릭은 한 번 더 넣지 않는다', async () => {
      const { P } = await seed('pal-enter', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')
        // 고른 것이 «끝» 글(잎) — 그 뒤에 넣는다.
        const last = await spotIn(page, 'n_last', 0.5, 0.5)
        await page.mouse.click(last.x, last.y)
        // 몸통(축소판 창 · 이름 줄)을 누르기만 하면 넣지 않는다 — 몸통은 끌기 전용이다.
        const card = (await page.locator('[data-wb-palette-card="Divider"]').boundingBox())!
        await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2)
        await page.mouse.click(card.x + card.width / 2, card.y + card.height - 6)
        await page.waitForTimeout(500)
        const sentAfterBody = patches.length
        await page.getByRole('button', { name: '구분선 넣기', exact: true }).focus()
        await page.keyboard.press('Enter')
        const entered = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) !== JSON.stringify(ORIGINAL))
        const sentAfterEnter = patches.length

        await grabCard(page, 'Divider')
        await moveTo(page, await spotIn(page, 'n_empt', 0.5, 0.5))
        await page.mouse.up()
        const dropped = await poll('서버 문서', () => shape(P[0]!), (v) => JSON.stringify(v) !== JSON.stringify(entered))
        await page.waitForTimeout(500)
        expect({ sentAfterBody, entered, sentAfterEnter, dropped, sent: patches.length, final: await shape(P[0]!) }).toEqual({
          sentAfterBody: 0,
          entered: { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last', '+Divider'] },
          sentAfterEnter: 1,
          dropped: { n_root: ['n_text', { n_card: ['n_intx'] }, { n_empt: ['+Divider'] }, 'n_last', '+Divider'] },
          sent: 2,
          final: { n_root: ['n_text', { n_card: ['n_intx'] }, { n_empt: ['+Divider'] }, 'n_last', '+Divider'] },
        })
      } finally {
        await close()
      }
    })
  })
})
