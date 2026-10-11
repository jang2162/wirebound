/**
 * **끌기 장치를 쓰는 입구마다 마우스 · 펜 · 터치로 끌어 본다**(`src/drag/use-pointer-drag.ts` 머리말 «포인터 종류»). 입구는 넷이다 — 컴포넌트 카드 ·
 * 캔버스 손잡이 · 구조 트리 줄 · 메뉴 트리 줄(메뉴 줄과 페이지 줄은 같은 `bind` 를 쓴다). 펜 · 터치는 CDP 로 보낸다 — 펜은 `Input.dispatchMouseEvent`
 * 의 `pointerType: 'pen'`, 터치는 `Input.dispatchTouchEvent`(`hasTouch` 컨텍스트).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 입구 × 포인터(끌어 캔버스 문서 위에서 놓음 — 트리 줄은 놓을 자리가 없어 «끝나는가» 만 잰다) | 끌기 중 캔버스 iframe 이 move · up 을 가져가 호스트가 못 받는다(펜) · 터치가 스크롤로 가 `pointercancel` 이 온다 · 놓은 결과가 서버에 안 선다 · 이름표 · 들린 줄이 남는다 |
 * | 터치로 쓸기(길게 누르지 않고 바로 움직임) | 카드 · 줄이 끌려 편집이 난다 · 카드 판이 안 밀린다(스크롤이 막혔다) |
 *
 * 펜 · 터치의 «끝나지 않은 끌기» 는 **호스트가 받은 `pointerup` 수와 캔버스 iframe 이 받은 move · up 수를 함께** 센다(`CLAUDE.md` «CDP 펜 캡처»).
 * 터치는 카드 · 줄을 길게 눌러(`HOLD_MS`) 끌고, 손잡이는 곧바로 끈다 — 손잡이는 작은 단추라 `touch-action: none` 이다.
 */
import type { BrowserContext, CDPSession, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

type Kind = 'mouse' | 'pen' | 'touch'
interface Pt {
  x: number
  y: number
}

/** 터치의 길게 누름 — 문턱(300ms)보다 넉넉히 눌러 시계 흔들림에 안 진다. */
const HOLD_MS = 450
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Driver {
  down(at: Pt): Promise<void>
  move(at: Pt): Promise<void>
  up(at: Pt): Promise<void>
}

/** 포인터 종류별 입력. 마우스는 `page.mouse`, 펜 · 터치는 CDP. */
async function driver(page: Page, kind: Kind): Promise<Driver> {
  if (kind === 'mouse') {
    return {
      down: async (at) => {
        await page.mouse.move(at.x, at.y)
        await page.mouse.down()
      },
      move: (at) => page.mouse.move(at.x, at.y),
      up: () => page.mouse.up(),
    }
  }
  const cdp: CDPSession = await page.context().newCDPSession(page)
  if (kind === 'pen') {
    const send = async (type: string, at: Pt, buttons: number, button: string): Promise<void> => {
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: at.x,
        y: at.y,
        button,
        buttons,
        clickCount: type === 'mouseMoved' ? 0 : 1,
        pointerType: 'pen',
      } as never)
    }
    let pressed = false
    return {
      down: async (at) => {
        await send('mouseMoved', at, 0, 'none')
        pressed = true
        await send('mousePressed', at, 1, 'left')
      },
      move: (at) => send('mouseMoved', at, pressed ? 1 : 0, pressed ? 'left' : 'none'),
      up: async (at) => {
        pressed = false
        await send('mouseReleased', at, 0, 'left')
      },
    }
  }
  const touch = async (type: string, points: Pt[]): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((at) => ({ x: at.x, y: at.y, id: 1 })) } as never)
  }
  return {
    down: (at) => touch('touchStart', [at]),
    move: (at) => touch('touchMove', [at]),
    up: () => touch('touchEnd', []),
  }
}

interface Counts {
  hostUp: number
  hostCancel: number
  frameMove: number
  frameUp: number
}

describe.skipIf(!전제.ok)('끌기 — 마우스 · 펜 · 터치 × 입구 — 실브라우저', () => {
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

  /**
   * ```
   * 메뉴 가: 가1(연 쪽) 가2   메뉴 나: 나1 나2
   * Page
   * ├ Text    n_text   '글'
   * ├ Card    n_card   '카드'
   * │ └ Text  n_intx   '안'
   * └ Divider n_divi
   * ```
   */
  async function fixture(slug: string): Promise<{ projectId: string; P: string; ids: Record<string, string> }> {
    const project = (await call('POST', '/projects', { name: 'M3 펜 · 터치', slug: `${slug}-${Date.now().toString(36)}` })).body
    const ids: Record<string, string> = {}
    for (const title of ['가', '나']) ids[title] = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title })).body.id
    for (const [title, menu] of [
      ['가1', '가'],
      ['가2', '가'],
      ['나1', '나'],
      ['나2', '나'],
    ] as const) {
      ids[title] = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: ids[menu], title })).body.id
    }
    const P = `/projects/${project.id}/pages/${ids['가1']}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: { id: 'n_text', type: 'Text', props: { content: '글' } } },
        {
          op: 'add',
          path: '/root/children/1',
          value: {
            id: 'n_card',
            type: 'Card',
            props: { title: '카드' },
            children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }],
          },
        },
        { op: 'add', path: '/root/children/2', value: { id: 'n_divi', type: 'Divider' } },
      ],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { projectId: project.id, P, ids }
  }

  interface Tab {
    page: Page
    context: BrowserContext
    writes: string[]
    patches: string[]
  }

  async function openEditor(P: string, kind: Kind): Promise<Tab> {
    let context: BrowserContext
    let page: Page
    if (kind === 'touch') {
      // 터치 화면이 있는 컨텍스트 — `maxTouchPoints` 가 서고 터치 입력이 `touch` 포인터로 간다.
      context = await stack.browser.newContext({ baseURL: stack.webUrl, viewport: { width: 1440, height: 900 }, hasTouch: true })
      const login = await context.request.post(`${stack.webUrl}/api/auth/login`, {
        data: { email: stack.users.alice.email, password: stack.users.alice.password },
      })
      if (!login.ok()) throw new Error(`browser login ${login.status()}`)
      page = await context.newPage()
    } else {
      const opened = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      context = opened.context
      page = opened.page
    }
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && /\/api\/projects\/[^/]+\/(menu|pages)\//.test(request.url()))
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })
    // 구조 편집은 WS 프레임(`patch`)으로 나간다 — 보낸 프레임을 센다.
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').nth(1).waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, context, writes, patches }
  }

  /** 호스트 창과 캔버스 iframe 창에 세는 리스너 — 끌기 동안 누가 move · up 을 받았나. */
  async function instrument(page: Page): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as { __k?: Counts }
      w.__k = { hostUp: 0, hostCancel: 0, frameMove: 0, frameUp: 0 }
      const k = w.__k
      window.addEventListener('pointerup', () => (k.hostUp += 1), true)
      window.addEventListener('pointercancel', () => (k.hostCancel += 1), true)
      const frame = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
      frame.contentWindow!.addEventListener('pointermove', () => (k.frameMove += 1), true)
      frame.contentWindow!.addEventListener('pointerup', () => (k.frameUp += 1), true)
    })
  }

  const counts = (page: Page): Promise<Counts> => page.evaluate(() => (window as unknown as { __k: Counts }).__k)

  /** 끌기 한 번 — 쥐고(터치는 길게 눌러) 문턱을 넘기고 `path` 를 따라 가서 뗀다. */
  async function drag(page: Page, kind: Kind, start: Pt, path: readonly Pt[], options: { hold?: boolean } = {}): Promise<void> {
    const d = await driver(page, kind)
    await d.down(start)
    await sleep(kind === 'touch' && options.hold !== false ? HOLD_MS : 40)
    let at = { x: start.x + 2, y: start.y - 2 }
    await d.move(at)
    at = { x: start.x + 4, y: start.y - 6 }
    await d.move(at)
    await sleep(60)
    for (const to of path) {
      const steps = Math.max(2, Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / 24))
      const from = at
      for (let i = 1; i <= steps; i += 1) {
        await d.move({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps })
        await sleep(8)
      }
      at = to
    }
    await sleep(250)
    await d.up(at)
    await sleep(150)
  }

  const center = (box: { x: number; y: number; width: number; height: number }): Pt => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  })

  /** 캔버스 노드 위 `fy`(0 ~ 1)의 점 — 노드의 위 15% 는 «그 노드 앞» 이다. */
  async function nodePoint(page: Page, id: string, fy: number): Promise<Pt> {
    const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
    if (box === null) throw new Error(`캔버스에 ${id} 가 없다`)
    return { x: box.x + Math.min(box.width / 2, 120), y: box.y + box.height * fy }
  }

  async function order(P: string): Promise<string[]> {
    const root = (await call('GET', P)).body.schema.root as { children?: { id: string; type: string }[] }
    const known = new Set(['n_text', 'n_card', 'n_divi'])
    return (root.children ?? []).map((child) => (known.has(child.id) ? child.id : `+${child.type}`))
  }

  async function openPalette(page: Page): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) > 0) return
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  const structureRow = (page: Page, id: string) =>
    page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  const menuRow = (page: Page, id: string) =>
    page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)

  /** 줄 상자의 가운데 왼쪽(줄 단추 위) · 위 띠. */
  async function rowPoint(row: ReturnType<typeof structureRow>, zone: 'middle' | 'top'): Promise<Pt> {
    const box = (await row.boundingBox())!
    return { x: box.x + 40, y: zone === 'top' ? box.y + 3 : box.y + box.height / 2 }
  }

  async function stuck(page: Page): Promise<{ tag: number; lifted: number }> {
    return {
      tag: await page.locator('.wb-shell-palette-dragtag').count(),
      lifted: await page.locator('.wb-shell-tree-row-dragging').count(),
    }
  }

  const KINDS: Kind[] = ['mouse', 'pen', 'touch']
  const CLEAN = { tag: 0, lifted: 0 }
  /** 끌기가 호스트에서 끝났다 — 호스트가 up 하나를 받았고 캔버스 iframe 은 끌기의 move · up 을 하나도 안 받았다. */
  const HOST_ENDED = { hostUp: 1, hostCancel: 0, frameMove: 0, frameUp: 0 }

  for (const kind of KINDS) {
    it(`카드 → 캔버스 문서 위 — ${kind}`, async () => {
      const { P } = await fixture(`card-${kind}`)
      const { page, context } = await openEditor(P, kind)
      try {
        await openPalette(page)
        await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Divider')
        const card = page.locator('[data-wb-palette-card="Divider"]')
        await card.waitFor()
        await instrument(page)
        await drag(page, kind, center((await card.boundingBox())!), [await nodePoint(page, 'n_text', 0.1)])
        const added = await poll(
          '서버 문서',
          () => order(P),
          (v) => v.length === 4,
          3000,
        ).catch(() => order(P))
        const scrolled = await page.locator('.wb-shell-palette-cards').evaluate((el) => el.scrollTop)
        expect({ order: added, ...(await stuck(page)), ...(await counts(page)), scrolled }).toEqual({
          order: ['+Divider', 'n_text', 'n_card', 'n_divi'],
          ...CLEAN,
          ...HOST_ENDED,
          scrolled: 0,
        })
      } finally {
        await context.close()
      }
    })

    it(`캔버스 손잡이 → 캔버스 문서 위 — ${kind}`, async () => {
      const { P } = await fixture(`handle-${kind}`)
      const { page, context } = await openEditor(P, kind)
      try {
        // 고르기는 마우스로 한다(어느 종류든 같은 선택) — 줄 가운데 왼쪽의 줄 단추 자리.
        const pick = await rowPoint(structureRow(page, 'n_card'), 'middle')
        await page.mouse.click(pick.x, pick.y)
        const handle = page.locator('.wb-shell-canvas-handle')
        await handle.waitFor()
        await instrument(page)
        // 손잡이는 `touch-action: none` 이다 — CDP 터치는 이 값이 없어도 `touchmove` 를 막아 끌리지만 실기기의 스크롤 판정은 이 값을 본다(값으로 잠근다).
        const touchAction = await handle.evaluate((el) => getComputedStyle(el).touchAction)
        if (kind === 'touch') expect(touchAction).toBe('none')
        // 손잡이는 곧바로 끈다(터치도 길게 누르지 않는다).
        await drag(page, kind, center((await handle.boundingBox())!), [await nodePoint(page, 'n_text', 0.1)], { hold: false })
        const moved = await poll(
          '서버 문서',
          () => order(P),
          (v) => v[0] === 'n_card',
          3000,
        ).catch(() => order(P))
        expect({ order: moved, ...(await stuck(page)), ...(await counts(page)) }).toEqual({
          order: ['n_card', 'n_text', 'n_divi'],
          ...CLEAN,
          ...HOST_ENDED,
        })
      } finally {
        await context.close()
      }
    })

    it(`구조 트리 줄 → 캔버스 문서 위에서 놓고(아무 일 없음) 다시 끌어 다른 줄 앞으로 — ${kind}`, async () => {
      const { P } = await fixture(`structure-${kind}`)
      const { page, context, patches } = await openEditor(P, kind)
      try {
        await instrument(page)
        // 첫 끌기 — 캔버스 문서 위에서 놓는다: 구조 줄은 캔버스에 못 놓아 편집은 0 이고, 끌기는 끝나야 한다.
        await drag(page, kind, await rowPoint(structureRow(page, 'n_divi'), 'middle'), [await nodePoint(page, 'n_text', 0.1)])
        const first = { sent: patches.length, order: await order(P), ...(await stuck(page)), ...(await counts(page)) }
        // 둘째 끌기 — 끝나지 않은 끌기가 남았으면 이 누름은 무시된다.
        await drag(page, kind, await rowPoint(structureRow(page, 'n_divi'), 'middle'), [
          await rowPoint(structureRow(page, 'n_text'), 'top'),
        ])
        const moved = await poll(
          '서버 문서',
          () => order(P),
          (v) => v[0] === 'n_divi',
          3000,
        ).catch(() => order(P))
        expect({ first, order: moved, sent: patches.length }).toEqual({
          first: { sent: 0, order: ['n_text', 'n_card', 'n_divi'], ...CLEAN, ...HOST_ENDED },
          order: ['n_divi', 'n_text', 'n_card'],
          sent: 1,
        })
      } finally {
        await context.close()
      }
    })

    it(`메뉴 트리 줄 → 캔버스 위에서 놓고(아무 일 없음) 다시 끌어 다른 메뉴로 — ${kind}`, async () => {
      const { projectId, P, ids } = await fixture(`menu-${kind}`)
      const { page, context, writes } = await openEditor(P, kind)
      try {
        await instrument(page)
        // 첫 끌기 — 캔버스 문서 위에서 놓는다: 놓을 자리가 없어 요청은 0 이고, 끌기는 끝나야 한다.
        await drag(page, kind, await rowPoint(menuRow(page, ids['가2']!), 'middle'), [await nodePoint(page, 'n_text', 0.5)])
        const first = { writes: writes.length, ...(await stuck(page)), ...(await counts(page)) }
        // 둘째 끌기 — 끝나지 않은 끌기가 남았으면 이 누름은 무시된다.
        await drag(page, kind, await rowPoint(menuRow(page, ids['가2']!), 'middle'), [await rowPoint(menuRow(page, ids['나2']!), 'top')])
        const tree = (await poll(
          '서버 트리',
          async () =>
            (await call('GET', `/projects/${projectId}/tree`)).body.menu as {
              title: string
              pages: { title: string; sortOrder: number }[]
            }[],
          (menu) => menu.find((m) => m.title === '나')?.pages.length === 3,
          3000,
        ).catch(async () => (await call('GET', `/projects/${projectId}/tree`)).body.menu)) as {
          title: string
          pages: { title: string; sortOrder: number }[]
        }[]
        const pages = [...tree.find((m) => m.title === '나')!.pages].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.title)
        expect({ first, pages, writes: writes.length }).toEqual({
          first: { writes: 0, ...CLEAN, ...HOST_ENDED },
          pages: ['나1', '가2', '나2'],
          writes: 1,
        })
      } finally {
        await context.close()
      }
    })
  }

  // ── 끄는 동안 iframe 은 포인터를 안 받고 끝나면 받는다 ────────────────────────────────────────────────────────
  it('끄는 동안 캔버스 iframe 은 포인터를 안 받고, 끝나면 다시 받는다(마우스 · 펜)', async () => {
    for (const kind of ['mouse', 'pen'] as const) {
      const { P } = await fixture(`inert-${kind}`)
      const { page, context } = await openEditor(P, kind)
      try {
        await openPalette(page)
        await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Divider')
        const card = page.locator('[data-wb-palette-card="Divider"]')
        await card.waitFor()
        const reads = () =>
          page.evaluate(() => ({ iframe: getComputedStyle(document.querySelector('iframe.wb-shell-canvas-iframe')!).pointerEvents }))
        const idle = await reads()
        const d = await driver(page, kind)
        const from = center((await card.boundingBox())!)
        await d.down(from)
        const pressed = await reads()
        await d.move({ x: from.x + 3, y: from.y - 6 })
        await d.move(await nodePoint(page, 'n_text', 0.1))
        const over = await reads()
        await d.up(await nodePoint(page, 'n_text', 0.1))
        await sleep(200)
        const done = await reads()
        // 끝난 뒤 캔버스 위 누름이 고르기로 간다.
        const text = await nodePoint(page, 'n_text', 0.5)
        await page.mouse.click(text.x, text.y)
        const selected = await page.evaluate(
          () => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null,
        )
        expect({ kind, idle, pressed, over, done, selected }).toEqual({
          kind,
          idle: { iframe: 'auto' },
          pressed: { iframe: 'none' },
          over: { iframe: 'none' },
          done: { iframe: 'auto' },
          selected: 'n_text',
        })
      } finally {
        await context.close()
      }
    }
  })

  // ── 터치로 쓸기 — 길게 누르지 않은 움직임은 스크롤이다 ─────────────────────────────────────────────────
  it('터치로 카드 판을 쓸면 판이 밀리고 카드는 안 끌린다', async () => {
    const { P } = await fixture('swipe-card')
    const { page, context } = await openEditor(P, 'touch')
    try {
      await openPalette(page)
      const card = page.locator('[data-wb-palette-card]').first()
      await card.waitFor()
      const from = center((await card.boundingBox())!)
      const d = await driver(page, 'touch')
      await d.down(from)
      for (let i = 1; i <= 8; i += 1) {
        await d.move({ x: from.x, y: from.y - i * 20 })
        await sleep(16)
      }
      await d.up(from)
      await sleep(200)
      const scrolled = await page.locator('.wb-shell-palette-cards').evaluate((el) => el.scrollTop)
      expect({ scrolled: scrolled > 0, order: await order(P), ...(await stuck(page)) }).toEqual({
        scrolled: true,
        order: ['n_text', 'n_card', 'n_divi'],
        ...CLEAN,
      })
    } finally {
      await context.close()
    }
  })

  it('터치로 길게 눌렀다 움직이지 않고 떼면 아무 일도 없고 끌기가 남지 않는다', async () => {
    const { P } = await fixture('hold-release')
    const { page, context } = await openEditor(P, 'touch')
    try {
      await openPalette(page)
      const card = page.locator('[data-wb-palette-card]').first()
      await card.waitFor()
      await instrument(page)
      const from = center((await card.boundingBox())!)
      const d = await driver(page, 'touch')
      await d.down(from)
      await sleep(HOLD_MS)
      const holding = await stuck(page)
      // 길게 누름이 서면 길게 누름 메뉴 · 글자 고르기는 기본 동작이 막힌다(안드로이드의 길게 누름 — CDP 로는 안 오므로 흉내 낸 이벤트로 잰다).
      const prevented = await card.evaluate((el) =>
        ['contextmenu', 'selectstart'].map((type) => {
          const event = new Event(type, { bubbles: true, cancelable: true })
          el.dispatchEvent(event)
          return event.defaultPrevented
        }),
      )
      await d.up(from)
      await sleep(200)
      expect({ holding, prevented, order: await order(P), ...(await stuck(page)), ...(await counts(page)) }).toEqual({
        holding: { tag: 1, lifted: 0 },
        prevented: [true, true],
        order: ['n_text', 'n_card', 'n_divi'],
        ...CLEAN,
        hostUp: 1,
        hostCancel: 0,
        frameMove: 0,
        frameUp: 0,
      })
    } finally {
      await context.close()
    }
  })

  it('터치로 길게 누르는 동안 8px 넘게 움직였으면 가만히 있어도 끌기가 안 선다', async () => {
    const { P } = await fixture('hold-slop')
    const { page, context } = await openEditor(P, 'touch')
    try {
      const start = await rowPoint(structureRow(page, 'n_divi'), 'middle')
      const d = await driver(page, 'touch')
      await d.down(start)
      // 6px 는 길게 누름 안(흔들림)이고 12px 는 밖이다 — 밖으로 나간 뒤 멈춰도 이 누름은 끌기가 아니다.
      await d.move({ x: start.x, y: start.y + 6 })
      await d.move({ x: start.x, y: start.y + 12 })
      await sleep(HOLD_MS)
      const to = await rowPoint(structureRow(page, 'n_text'), 'top')
      await d.move(to)
      await d.up(to)
      await sleep(400)
      expect({ order: await order(P), ...(await stuck(page)) }).toEqual({ order: ['n_text', 'n_card', 'n_divi'], ...CLEAN })
    } finally {
      await context.close()
    }
  })

  it('터치로 트리 줄을 쓸면 줄이 안 끌린다', async () => {
    const { P } = await fixture('swipe-row')
    const { page, context } = await openEditor(P, 'touch')
    try {
      const start = await rowPoint(structureRow(page, 'n_divi'), 'middle')
      const d = await driver(page, 'touch')
      await d.down(start)
      // 트리 안의 다른 줄 앞 — 끌기가 섰다면 편집이 난다.
      const to = await rowPoint(structureRow(page, 'n_text'), 'top')
      for (let i = 1; i <= 12; i += 1) {
        await d.move({ x: start.x + ((to.x - start.x) * i) / 12, y: start.y + ((to.y - start.y) * i) / 12 })
        await sleep(16)
      }
      await d.up(to)
      await sleep(400)
      expect({ order: await order(P), ...(await stuck(page)) }).toEqual({ order: ['n_text', 'n_card', 'n_divi'], ...CLEAN })
    } finally {
      await context.close()
    }
  })
})
