/**
 * **L-141 의 «안 잰 칸» 가운데 이 기계(macOS · 헤드리스 Chrome)에서 잴 수 있던 것을 값으로 잠근다**(N38 보고 `2026-10-14-n38-report.md`). 칸마다 케이스 하나 — 이름 앞의 «칸»이 L-141 행의 문구다.
 *
 * | 칸 | 성질(값) |
 * |---|---|
 * | 끄는 중 사각형이 안 서는 것 | 손잡이 · 카드를 끄는 동안 칸의 여백 · 노드 · 빈 자리를 지나도 사각형(`[data-wb-marquee]`)이 0 · 빈 자리를 눌러 끌면 1(카나리아) |
 * | 원본이 남의 편집으로 다시 그려지는 판 | 끄는 중 같은 사람의 다른 연결이 원본을 고쳐도 원본 요소는 그대로이고 흐림이 유지되며(`opacity` 인라인) 놓은 뒤 인라인 `opacity` 가 0 개 |
 * | `onLeave` 의 Chrome 대조 | 글 칸 · 목록 칸에 친 채 떠나는 네 길(다른 줄 · 캔버스 빈 자리 · 뷰 모드 · 다른 탭)이 모두 커밋 1건이고 서버에 친 값이 있다 — **blur 가 나는 길이다**(아래 케이스 머리말) |
 * | 일부 거절이 줄 메뉴를 닫는 판 | 늦게 닿은 `lock-denied` 가 고른 목록을 줄이면 열린 줄 `…` 메뉴가 닫힌다 |
 * | «보내지 않은 편집» 이 있는 받는 쪽 | 보낸 편집의 답을 못 받은 채 남이 열린 페이지를 지우면 한도(`SENT_EDIT_WAIT_MS` 3s) 뒤 «열어 둔 페이지가 지워졌습니다 … 편집 1개가 취소됐습니다» |
 * | 사라짐에서 서버 판을 싣는 갈래 | 트리가 열린 페이지를 잃었는데 서버에는 있고 판이 다르면(낡은 트리 · 늦춘 `page-changed`) 서버 판을 싣는다 — 사라짐으로 가지 않는다 |
 * | 뿌리 줄을 골라도 잠금 표지 0 | 남이 뿌리 줄을 골라도 표지 0 이고 페이지 끝 쓰기는 거절이 아니다 — «잠금 때문에 페이지 끝이 거절되는 판» 은 사용자가 만날 수 없다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  delayServerFrames,
  editorStackPrerequisite,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const T = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const row = (page: Page, nodeId: string) => page.locator(`[data-tree-id="${nodeId}"] > button.wb-shell-structure-node`)

describe.skipIf(!전제.ok)('L-141 — 이 기계에서 잰 칸', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 프로젝트 · 메뉴 하나 · 페이지 하나(글 다섯 + 추가 노드) — bob 은 editor. 페이지 경로를 돌려 준다. */
  async function fixture(slug: string, extra: unknown[] = []): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N38 L-141', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const nodes = [...[0, 1, 2, 3, 4].map((n) => T(`n_t0${n}`, `줄 ${n}`)), ...extra]
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  /** 탭을 열고 페이지로 간다. `prepare` 는 `goto` 앞에 부른다 — 소켓은 페이지가 열릴 때 붙으므로 그 뒤에 건 `websocket` 리스너는 놓친다. */
  async function open(
    P: string,
    user: 'alice' | 'bob',
    options: { origin?: string; prepare?: (page: Page) => void } = {},
  ): Promise<{ page: Page; close: () => Promise<void> }> {
    const { prepare, ...tab } = options
    const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1440, height: 900 }, ...tab })
    prepare?.(page)
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close() }
  }

  /** 노드를 고르고 손잡이를 쥐어 문턱을 넘긴다. */
  async function grabHandle(page: Page, nodeId: string): Promise<void> {
    const box = (await canvasFrame(page).locator(`[data-wb-id="${nodeId}"]`).boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    const handle = page.locator('.wb-shell-canvas-handle')
    await handle.waitFor()
    const h = (await handle.boundingBox())!
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2 + 3, h.y + h.height / 2 + 6, { steps: 3 })
  }

  /** 호스트 문서와 캔버스 문서에 선 사각형 수. */
  async function marquees(page: Page): Promise<number> {
    return (await page.locator('[data-wb-marquee]').count()) + (await canvasFrame(page).locator('[data-wb-marquee]').count())
  }

  /** 캔버스 칸을 가로지르며(여백 · 노드 · 빈 자리) 지날 때마다 사각형 수를 적는다. */
  async function sweep(page: Page): Promise<number[]> {
    const canvas = (await page.locator('.wb-shell-canvas').boundingBox())!
    const node = (await canvasFrame(page).locator('[data-wb-id="n_t02"]').boundingBox())!
    const stops = [
      { x: canvas.x + 4, y: canvas.y + 20 },
      { x: node.x + node.width / 2, y: node.y + node.height / 2 },
      { x: canvas.x + canvas.width - 6, y: canvas.y + canvas.height - 6 },
      { x: canvas.x + 4, y: canvas.y + canvas.height - 6 },
    ]
    const seen: number[] = []
    for (const stop of stops) {
      for (let step = 0; step < 3; step += 1) {
        await page.mouse.move(stop.x, stop.y, { steps: 6 })
        seen.push(await marquees(page))
      }
    }
    return seen
  }

  it('칸 «끄는 중 사각형이 안 서는 것» — 손잡이 · 카드를 끄는 동안 0, 빈 자리를 눌러 끌면 1', async () => {
    const { page, close } = await open(await fixture('l141-marquee'), 'alice')
    try {
      await grabHandle(page, 'n_t01')
      const handleSweep = await sweep(page)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      const afterHandle = await marquees(page)

      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Button')
      const card = page.locator('[data-wb-palette-card="Button"]')
      await card.waitFor()
      const c = (await card.boundingBox())!
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
      await page.mouse.down()
      await page.mouse.move(c.x + c.width / 2 + 3, c.y + c.height / 2 - 6, { steps: 3 })
      const cardSweep = await sweep(page)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      const afterCard = await marquees(page)

      // 카나리아 — 빈 자리(칸 여백)를 눌러 끌면 사각형이 선다.
      const canvas = (await page.locator('.wb-shell-canvas').boundingBox())!
      await page.mouse.move(canvas.x + 4, canvas.y + 4)
      await page.mouse.down()
      await page.mouse.move(canvas.x + 200, canvas.y + 200, { steps: 10 })
      const control = await marquees(page)
      await page.mouse.up()

      // eslint-disable-next-line no-console
      console.log(`[끄는 중 사각형] ${JSON.stringify({ handleSweep, cardSweep, afterHandle, afterCard, control })}`)
      expect({ 손잡이: handleSweep.length, 카드: cardSweep.length }).toEqual({ 손잡이: 12, 카드: 12 })
      expect(Math.max(...handleSweep, ...cardSweep, afterHandle, afterCard)).toBe(0)
      expect(control).toBe(1)
    } finally {
      await close()
    }
  })

  it('칸 «원본이 남의 편집으로 다시 그려지는 판» — 같은 사람의 다른 연결이 원본을 고쳐도 흐림이 유지되고 놓은 뒤 남지 않는다', async () => {
    const P = await fixture('l141-redraw')
    const { page, close } = await open(P, 'alice')
    try {
      await grabHandle(page, 'n_t01')
      const target = (await canvasFrame(page).locator('[data-wb-id="n_t03"]').boundingBox())!
      await page.mouse.move(target.x + 40, target.y + target.height * 0.8, { steps: 8 })
      const original = canvasFrame(page).locator('[data-wb-id="n_t01"]')
      const look = () =>
        original.evaluate((element) => ({
          opacity: (element as HTMLElement).style.opacity,
          sameElement: (element as HTMLElement & { __probe?: boolean }).__probe === true,
        }))
      await original.evaluate((element) => ((element as HTMLElement & { __probe?: boolean }).__probe = true))
      const before = await look()
      // 같은 사람의 다른 연결(REST)은 제 잠금에 안 막힌다 — 남의 편집은 423 이라 이 길로만 «원본이 고쳐지는» 판이 선다.
      const head = (await call('GET', P)).body.headSeq
      const patched = await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'replace', path: '/root/children/1/props/content', value: '남이 바꿈' }],
      })
      await poll(
        '고친 글이 캔버스에 선다',
        async () => (await original.textContent()) ?? '',
        (text) => text === '남이 바꿈',
      )
      const during = await look()
      await page.mouse.move(target.x + 44, target.y + target.height * 0.8, { steps: 4 })
      await page.mouse.up()
      const server = await poll(
        '놓은 자리가 서버에 닿는다',
        async () => ((await call('GET', P)).body.schema.root.children as { id: string }[]).map((child) => child.id),
        (ids) => ids[3] === 'n_t01',
      )
      const dimmedAfter = await canvasFrame(page).locator('[style*="opacity"]').count()

      // eslint-disable-next-line no-console
      console.log(`[끄는 중 원본 다시 그림] ${JSON.stringify({ patched: patched.status, before, during, dimmedAfter, server })}`)
      expect(patched.status).toBe(200)
      expect(before.opacity).not.toBe('')
      expect(before.sameElement).toBe(true)
      // 성질 — 고쳐진 뒤에도 같은 요소가 같은 흐림을 쥔다.
      expect(during).toEqual(before)
      expect(dimmedAfter).toBe(0)
      expect(server).toEqual(['n_t00', 'n_t02', 'n_t03', 'n_t01', 'n_t04'])
    } finally {
      await close()
    }
  })

  /**
   * 칸 «`onLeave` 의 Chrome 대조»(`test/click-as-browser.ts` 머리말 — «그 커밋 수는 Chrome 에 다시 대지 않았다»). 위젯 둘(글 칸 · 목록 칸) × 떠나는 길 넷에서 커밋 1건이고 서버에 친 값이 있다.
   * 입력 중 패치 0 은 카나리아 — 치는 동안은 아무것도 안 나간다(blur · 떠남에서 나간다).
   *
   * **이 네 길은 blur 가 나는 길이다**(변조 «`onLeave` 를 안 부름» 이 이 케이스를 안 죽인다 — blur 가 먼저 커밋해 `onLeave` 가 넘길 초안이 없다). `onLeave` 자신(포커스가 안 옮겨 간 채 위젯이 내려가는 길 —
   * 다른 탭의 지움 · 일부 거절 · Cmd+클릭)은 `./multiselect.test.ts` 의 «칸에 친 채 고른 것이 바뀐다» 케이스들이 Chrome 에서 잰다.
   */
  it('칸 «onLeave» — 글 칸 · 목록 칸에 친 채 떠나는 네 길이 모두 커밋 1건이다', async () => {
    const P = await fixture('l141-leave', [{ id: 'n_l', type: 'Tree', props: { items: [{ label: '가' }, { label: '나' }] } }])
    const results: Record<string, { 입력중패치: number; 떠난뒤패치: number; 서버: unknown }> = {}
    for (const kind of ['글', '목록'] as const) {
      for (const gesture of ['다른 줄', '캔버스 빈 자리', '뷰 모드', '다른 탭'] as const) {
        const patches: string[] = []
        const { page, close } = await open(P, 'alice', {
          prepare: (tab) =>
            tab.on('websocket', (socket) =>
              socket.on('framesent', (frame) => {
                const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
                if (text.includes('"type":"patch"')) patches.push(text)
              }),
            ),
        })
        try {
          const target = kind === '글' ? 'n_t00' : 'n_l'
          await row(page, target).click()
          const field = kind === '글' ? page.getByLabel('내용', { exact: true }) : page.locator('.wb-shell-list-cell').first()
          await field.click()
          await page.keyboard.type('Z')
          const typed = patches.length
          if (gesture === '다른 줄') await row(page, 'n_t01').click()
          else if (gesture === '캔버스 빈 자리') {
            const canvas = (await page.locator('.wb-shell-canvas').boundingBox())!
            await page.mouse.click(canvas.x + 4, canvas.y + canvas.height - 6)
          } else if (gesture === '뷰 모드') await page.getByRole('button', { name: '뷰 모드' }).click()
          else await page.getByRole('tab', { name: '코멘트' }).click()
          await poll(
            '떠난 뒤 커밋이 서버에 닿는다',
            async () => {
              const node = ((await call('GET', P)).body.schema.root.children as { id: string; props: Record<string, unknown> }[]).find(
                (c) => c.id === target,
              )!
              return kind === '글' ? node.props['content'] : node.props['items']
            },
            (value) =>
              kind === '글' ? value === '줄 0Z' : Array.isArray(value) && (value[0] as { label?: unknown } | undefined)?.label === '가Z',
          )
          const server = ((await call('GET', P)).body.schema.root.children as { id: string; props: Record<string, unknown> }[]).find(
            (c) => c.id === target,
          )!
          await page.waitForTimeout(500)
          results[`${kind} · ${gesture}`] = {
            입력중패치: typed,
            떠난뒤패치: patches.length - typed,
            서버: kind === '글' ? server.props['content'] : server.props['items'],
          }
          // 다음 판의 기준을 같게 되돌린다.
          const head = (await call('GET', P)).body.headSeq
          await call('PATCH', `${P}/ops`, {
            baseSeq: head,
            ops: [
              kind === '글'
                ? { op: 'replace', path: '/root/children/0/props/content', value: '줄 0' }
                : { op: 'replace', path: '/root/children/5/props/items', value: [{ label: '가' }, { label: '나' }] },
            ],
          })
        } finally {
          await close()
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[떠날 때 커밋] ${JSON.stringify(results)}`)
    expect(Object.keys(results)).toHaveLength(8)
    for (const [label, value] of Object.entries(results)) {
      expect({ label, 입력중패치: value.입력중패치, 떠난뒤패치: value.떠난뒤패치 }).toEqual({ label, 입력중패치: 0, 떠난뒤패치: 1 })
    }
  })

  /**
   * 칸 «일부 거절이 줄 메뉴를 닫는 판». bob 이 먼저 쥔 노드를 alice 가(WS 내림이 늦어 모른 채) 고른 목록에 넣고 줄 `…` 를 연다. 늦게 닿은 `lock-denied` 가 목록을 줄이면 메뉴가 닫힌다.
   * 카나리아: 메뉴가 열린 순간 거절은 아직 안 닿았다 · 닫힌 뒤 거절이 닿았다 · 늦춘 덩어리 수 > 0.
   */
  it('칸 «일부 거절이 줄 메뉴를 닫는 판» — 늦게 닿은 거절이 고른 목록을 줄이면 열린 줄 … 메뉴가 닫힌다', async () => {
    const P = await fixture('l141-partial')
    const delay = await stack.startDownDelay(3500)
    const received: string[] = []
    const a = await open(P, 'alice', {
      origin: delay.origin,
      prepare: (tab) =>
        tab.on('websocket', (socket) =>
          socket.on('framereceived', (frame) => {
            const kind = /"type":"([a-z-]+)"/.exec(String(frame.payload))?.[1]
            if (kind !== undefined) received.push(kind)
          }),
        ),
    }).catch(async (error) => {
      await delay.close()
      throw error
    })
    const b = await open(P, 'bob')
    try {
      await poll(
        'alice 의 WS 가 늦춰진 채 붙는다',
        async () => delay.delayed(),
        (n) => n >= 1,
      )
      await a.page.waitForTimeout(4000)
      received.length = 0
      await row(b.page, 'n_t02').click()
      await b.page.waitForTimeout(400)
      await row(a.page, 'n_t01').click()
      await row(a.page, 'n_t02').click({ modifiers: ['ControlOrMeta'] })
      await row(a.page, 'n_t03').click({ modifiers: ['ControlOrMeta'] })
      await a.page
        .locator('[data-tree-id="n_t03"]')
        .getByRole('button', { name: /더 보기$/ })
        .click()
      const opened = await a.page.getByRole('menu').count()
      const deniedWhenOpened = received.filter((kind) => kind === 'lock-denied').length
      // 끝 조건은 «거절이 닿았다» 까지다 — 메뉴가 닫혔는가는 그 뒤에 값으로 읽는다(닫힘을 기다리면 안 닫는 변조가 시간 초과로 죽어 값이 안 남는다).
      await poll(
        '거절이 닿는다',
        async () => received.filter((kind) => kind === 'lock-denied').length,
        (n) => n >= 1,
        10_000,
      )
      await a.page.waitForTimeout(600)
      const menusAfter = await a.page.getByRole('menu').count()
      const deniedWhenClosed = received.filter((kind) => kind === 'lock-denied').length
      const picked = await a.page.evaluate(() =>
        [...document.querySelectorAll('[data-wb-selected-id],[data-wb-member-id]')]
          .map((element) => element.getAttribute('data-wb-selected-id') ?? element.getAttribute('data-wb-member-id'))
          .sort(),
      )
      const alerts = await a.page.getByRole('alert').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[일부 거절 · 줄 메뉴] ${JSON.stringify({ opened, deniedWhenOpened, deniedWhenClosed, menusAfter, picked, alerts })}`)
      expect({ delayed: delay.delayed() > 0, opened, deniedWhenOpened }).toEqual({ delayed: true, opened: 1, deniedWhenOpened: 0 })
      expect(deniedWhenClosed).toBeGreaterThanOrEqual(1)
      expect(menusAfter).toBe(0)
      expect(picked).toEqual(['n_t01', 'n_t03'])
      expect(alerts).toEqual([`${stack.users.bob.name}님이 편집 중이라 고를 수 없습니다`])
    } finally {
      await a.close()
      await b.close()
      await delay.close()
    }
  })

  /**
   * 칸 «「보내지 않은 편집」이 있는 받는 쪽 판». bob 의 `patch` 프레임을 서버에 안 보내 붙잡는다(첫 편집은 답을 못 받은 채 나간 것 · 둘째는 큐에 남는다). alice 가 bob 이 연 페이지를 지운다.
   * 보낸 편집의 답을 기다리는 동안(`editsAnswered`) 화면은 그대로이고, 한도(3s) 뒤 판을 비우며 두 몫을 말한다. 카나리아: 붙잡은 프레임 ≥ 1 · 지움 204.
   */
  it('칸 «보내지 않은 편집이 있는 받는 쪽» — 남이 열린 페이지를 지우면 한도 뒤 버린 편집을 말한다', async () => {
    const P = await fixture('l141-unsent')
    const projectId = P.split('/')[2]!
    const pageId = P.split('/').pop()!
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    let held = 0
    await page.routeWebSocket(/\/ws(?:[?#]|$)/, (route) => {
      const server = route.connectToServer()
      route.onMessage((message) => {
        const text = typeof message === 'string' ? message : message.toString()
        if (text.includes('"type":"patch"')) {
          held += 1
          return
        }
        server.send(message)
      })
      server.onMessage((message) => route.send(message))
    })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await page.waitForTimeout(500)
      await row(page, 'n_t01').click()
      await page.keyboard.press('ControlOrMeta+d')
      await page.waitForTimeout(300)
      await page.keyboard.press('ControlOrMeta+d')
      await page.waitForTimeout(500)
      const heldBefore = held
      const deleted = await call('DELETE', `/projects/${projectId}/pages/${pageId}`)
      await page.waitForTimeout(1500)
      const early = await page.getByRole('alert').allTextContents()
      // 끝 조건은 «판이 비워졌다» 까지다 — 통지 문장은 그 뒤에 값으로 읽는다.
      await poll(
        '한도 뒤 판이 비워진다',
        async () => page.locator('body').innerText(),
        (shown) => shown.includes('열린 페이지가 없습니다'),
        10_000,
      )
      const alerts = await page.getByRole('alert').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[보내지 않은 편집 · 받는 쪽] ${JSON.stringify({ heldBefore, deleted: deleted.status, early, alerts })}`)
      expect({ held: heldBefore >= 1, deleted: deleted.status, early }).toEqual({ held: true, deleted: 204, early: [] })
      expect(alerts.join(' | ')).toContain('보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다')
      expect(alerts.join(' | ')).toContain('아직 저장되지 않은 편집 1개가 취소됐습니다')
    } finally {
      await context.close()
    }
  })

  /**
   * 칸 «사라짐에서 서버 판을 싣는 갈래»(`routes/editor.tsx` 의 `goneCheck` · `PAGE_CHECK_LEAD`). bob 의 `page-changed` 를 늦춰 bob 의 판을 낡게 두고, 트리 조회를 열린 페이지를 뺀 낡은 트리로 답하게 한 뒤
   * alice 가 페이지를 고치고 메뉴를 더한다(`menu-changed`). bob 의 트리가 페이지를 잃어 서버에 묻는다 — 있고 판이 다르다. 성질: 서버 판을 싣고(글이 alice 의 것) 사라짐으로 안 간다.
   * 카나리아: 낡은 트리를 실제로 내줬다 · 늦춘 `page-changed` 가 아직 안 닿았다.
   */
  it('칸 «사라짐에서 서버 판을 싣는 갈래» — 트리가 페이지를 잃었는데 서버에 있고 판이 다르면 서버 판을 싣는다', async () => {
    const P = await fixture('l141-check')
    const projectId = P.split('/')[2]!
    const pageId = P.split('/').pop()!
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    let stale = false
    let staleServed = 0
    try {
      const delay = await delayServerFrames(page, ['page-changed'], 20_000)
      await page.route(/\/api\/projects\/[^/]+\/tree$/, async (route) => {
        const response = await route.fetch()
        if (!stale) return route.fulfill({ response })
        const body = await response.json()
        const drop = (value: unknown): unknown =>
          Array.isArray(value)
            ? value.filter((one) => !(one !== null && typeof one === 'object' && (one as { id?: string }).id === pageId)).map(drop)
            : value !== null && typeof value === 'object'
              ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, drop(inner)]))
              : value
        staleServed += 1
        return route.fulfill({ response, json: drop(body) })
      })
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await page.waitForTimeout(500)
      stale = true
      const head = (await call('GET', P)).body.headSeq
      await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '앨리스가 바꿈' }],
      })
      await call('POST', `/projects/${projectId}/menu`, { parentId: null, title: '새 메뉴' })
      // 끝 조건은 «낡은 트리가 나갔다» 까지다 — 서버 판이 섰는가는 잠깐 뒤에 값으로 읽는다.
      await poll(
        '낡은 트리가 나간다',
        async () => staleServed,
        (n) => n >= 1,
        10_000,
      )
      await page.waitForTimeout(2500)
      const text =
        (await canvasFrame(page)
          .locator('[data-wb-id="n_t00"]')
          .textContent()
          .catch(() => '')) ?? ''
      const alerts = await page.getByRole('alert').allTextContents()
      const delivered = delay.delivered().map((frame) => frame.type)
      // eslint-disable-next-line no-console
      console.log(`[사라짐 · 있고 판이 다름] ${JSON.stringify({ staleServed, text, alerts, delivered })}`)
      expect(staleServed).toBeGreaterThanOrEqual(1)
      expect(delivered).not.toContain('page-changed')
      expect(text).toBe('앨리스가 바꿈')
      expect(alerts.join(' | ')).not.toContain('지워졌습니다')
      expect(await page.locator('body').innerText()).not.toContain('열린 페이지가 없습니다')
    } finally {
      await context.close()
    }
  })

  /**
   * 칸 «잠금 때문에 「페이지 끝이 거절되는 판」을 못 세움(뿌리 줄을 골라도 잠금 표지 0)». 값: 남이 뿌리 줄을 골라도 표지가 0 이고 페이지 끝 쓰기(`/root/children/-`)는 200 이다 — 뿌리는 잠금을 쥐는
   * 대상이 아니라서 «잠금이 페이지 끝을 거절하는» 판은 사용자가 만날 수 없다(서버 판정은 `packages/schema/test/lock-*`). 구분력: 이 케이스는 뿌리 선택이 잠금을 쥐게 되면 빨강이다.
   */
  it('칸 «뿌리 줄을 골라도 잠금 표지 0» — 남이 뿌리 줄을 골라도 표지 0 이고 페이지 끝 쓰기는 거절되지 않는다', async () => {
    const P = await fixture('l141-root')
    const b = await open(P, 'bob')
    const a = await open(P, 'alice')
    try {
      const rootRow = b.page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]').first()
      expect(await rootRow.textContent()).toContain('Page')
      await rootRow.locator('button').first().click()
      await b.page.waitForTimeout(1200)
      // 카나리아 — 같은 판에서 bob 이 글 줄을 고르면 alice 에게 표지가 선다(표지를 셀 수 있다).
      await row(b.page, 'n_t01').click()
      const marksOnText = await poll(
        'alice 화면에 bob 의 표지가 선다',
        () => a.page.locator('.wb-shell-structure-lock').allTextContents(),
        (marks) => marks.length >= 1,
        5000,
      )
      await rootRow.locator('button').first().click()
      await poll(
        'bob 이 뿌리 줄로 옮겨 표지가 걷힌다',
        () => a.page.locator('.wb-shell-structure-lock').count(),
        (n) => n === 0,
        5000,
      )
      const head = (await call('GET', P)).body.headSeq
      const append = await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'add', path: '/root/children/-', value: T('n_end', '끝에 붙임') }],
      })
      // eslint-disable-next-line no-console
      console.log(`[뿌리 고름] ${JSON.stringify({ marksOnText, aliceAppend: append.status })}`)
      expect(marksOnText.length).toBe(1)
      expect(append.status).toBe(200)
    } finally {
      await a.close()
      await b.close()
    }
  })
})
