/**
 * **캔버스 손잡이로 노드를 옮기는 것을 실브라우저로 잰다**(`src/canvas/canvas-drag-handle.tsx` · 판정 `src/canvas/canvas-drop.ts` · 경로 층
 * `src/drag/use-placement.ts`). jsdom 은 레이아웃 · `elementFromPoint` · 포인터 캡처 · `transform` 이 없다 — 손잡이가 서는 조건은
 * `test/canvas/canvas-drag-handle.test.tsx`, 판정의 순수 함수는 `test/canvas/canvas-drop.test.ts`, 경로 · 놓는 순간 다시 판정은
 * `test/drag/use-placement.test.tsx` 가 갖고, 여기는 **진짜 마우스가 진짜 iframe 위에서** 그 판정을 내고 서버 문서가 그렇게 서는지를 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 빈 카드 안 · 형제 앞 · 되돌리기 | 서버 문서에서 그 자리가 아니다 · 되돌리기 뒤 원래 문서가 아니다 |
 * | 클릭만 | 편집이 나간다 · 고른 노드가 풀린다 |
 * | 끄는 중 남이 대상을 잡음 · 지움 | 포인터가 멈춘 채 표시가 남는다 · 조금 움직였다 놓으면 편집이 나간다(지운 자리 밑의 바탕 = 페이지 끝으로) |
 * | 시스템 테마 다섯의 가로 배치 | `Grid` 칸의 왼 · 오른쪽이 문서의 앞 · 뒤가 아니다 · 표시가 세로 선이 아니다 · 검색폼 필드 줄의 축이 표와 다르다 |
 * | 줌 0.5 · 1 · 1.5 · 스크롤한 칸 | 표시 상자가 포인터 밑 노드의 상자와 1px 넘게 어긋난다 |
 * | 끄는 중 페이지 옮김 | 표시가 남는다 · 놓으면 편집이 나간다 |
 * | 트리 영역을 지나 캔버스로 돌아옴 · 트리 줄 위에 놓음 | 트리 위에서 표시가 안 선다 · 돌아와 놓은 자리 · 트리 줄에 놓은 자리가 서버 문서와 다르다 |
 *
 * 구조 편집은 WS 프레임(`patch`)으로 나가므로 HTTP 가 아니라 보낸 프레임을 센다(`openEditor` 의 `patches`).
 *
 * **표시는 창 좌표의 겹이다**(`.wb-shell-drop-indicator` — `position: fixed`). 노드의 상자는 playwright 의 `boundingBox`(프레임 위치 ·
 * `transform` 이 든 주 창 좌표)로 읽어 견준다 — 두 길이 서로 다른 계산이다(앞은 `canvasHitAt` 의 `frameToHost`, 뒤는 브라우저).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface SeedNode {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: SeedNode[]
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

describe.skipIf(!전제.ok)('캔버스 손잡이로 옮기기 — 실브라우저', () => {
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

  /** 프로젝트 · 메뉴 하나 · 페이지(들)에 문서를 싣는다. `bob` 은 editor. `theme` 을 주면 그 시스템 테마 `1.0.0` 에 묶는다. */
  async function fixture(
    slug: string,
    pages: SeedNode[][],
    theme?: string,
  ): Promise<{ projectId: string; P: string[]; pageIds: string[] }> {
    const project = (await call('POST', '/projects', { name: 'D1 캔버스', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    if (theme !== undefined) await putTheme(call, project.id, { themeId: `system-${theme}`, version: '1.0.0', tokens: {} })
    const P: string[] = []
    const pageIds: string[] = []
    for (const [index, nodes] of pages.entries()) {
      const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: `쪽${index + 1}` })).body.id
      const path = `/projects/${project.id}/pages/${pageId}`
      const seeded = await call('PATCH', `${path}/ops`, {
        baseSeq: 0,
        ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
      })
      if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
      P.push(path)
      pageIds.push(pageId)
    }
    return { projectId: project.id, P, pageIds }
  }

  /** 서버 문서의 모양 — id(자식) 차례. */
  async function serverIds(P: string): Promise<unknown> {
    const shape = (node: { id: string; children?: unknown[] }): unknown =>
      Array.isArray(node.children) && node.children.length > 0 ? { [node.id]: node.children.map((child) => shape(child as never)) } : node.id
    return shape((await stack.request(alice, 'GET', P)).body.schema.root)
  }

  async function openEditor(
    P: string,
    user: 'alice' | 'bob' = 'alice',
  ): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
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

  /** 캔버스 노드의 주 창 상자. */
  async function nodeBox(page: Page, id: string): Promise<Box> {
    const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
    if (box === null) throw new Error(`캔버스에 ${id} 상자가 없다`)
    return box
  }

  /** 노드 상자 안의 자리(비율). */
  async function spotIn(page: Page, id: string, fx: number, fy: number): Promise<{ x: number; y: number }> {
    const box = await nodeBox(page, id)
    return { x: box.x + box.width * fx, y: box.y + box.height * fy }
  }

  async function pick(page: Page, id: string): Promise<void> {
    const at = await spotIn(page, id, 0.5, 0.5)
    await page.mouse.click(at.x, at.y)
  }

  function handle(page: Page) {
    return page.locator('.wb-shell-canvas-handle')
  }

  /** 고른 노드의 손잡이를 쥐고 문턱(4px)을 넘긴다. */
  async function grab(page: Page): Promise<void> {
    const box = await handle(page).boundingBox()
    if (box === null) throw new Error('손잡이가 없다')
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y + 6, { steps: 3 })
  }

  async function moveTo(page: Page, at: { x: number; y: number }): Promise<void> {
    await page.mouse.move(at.x, at.y, { steps: 8 })
  }

  /** 지금 선 표시 — 기다리지 않고 읽는다(없으면 `[]` 가 값이다). */
  async function indicators(page: Page): Promise<{ placement: string | null; axis: string | null; rect: Box }[]> {
    return page.locator('.wb-shell-drop-indicator').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return {
          placement: el.getAttribute('data-placement'),
          axis: el.getAttribute('data-axis'),
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        }
      }),
    )
  }

  /**
   * ```
   * Page
   * ├ Text    n_text  '글'
   * ├ Card    n_card  '카드'
   * │ └ Text  n_intx  '안'
   * ├ Card    n_empt  '빈 카드'   ← 자식이 없다 — 상자 전체가 «안»
   * └ Divider n_divi
   * ```
   */
  const BASIC: SeedNode[] = [
    { id: 'n_text', type: 'Text', props: { content: '글' } },
    { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
    { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
    { id: 'n_divi', type: 'Divider' },
  ]
  const ORIGINAL = { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_divi'] }

  /** 뿌리 id 는 서버가 짓는다 — 모양을 견줄 때 `n_root` 로 읽는다. */
  async function shape(P: string): Promise<unknown> {
    const raw = (await serverIds(P)) as Record<string, unknown>
    return { n_root: Object.values(raw)[0] }
  }

  it('손잡이로 빈 카드 안 · 다른 카드의 자식 앞에 놓으면 서버 문서가 그 자리이고, 되돌리기 둘로 원래 문서다', async () => {
    const { P } = await fixture('basic', [BASIC])
    const { page, close, patches } = await openEditor(P[0]!)
    try {
      await pick(page, 'n_text')
      await grab(page)
      await moveTo(page, await spotIn(page, 'n_empt', 0.5, 0.5))
      const intoHint = await indicators(page)
      await page.mouse.up()
      const into = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(ORIGINAL))

      await pick(page, 'n_divi')
      await grab(page)
      await moveTo(page, await spotIn(page, 'n_intx', 0.5, 0.1))
      const beforeHint = await indicators(page)
      await page.mouse.up()
      const before = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(into))

      const undo = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
      await undo.click()
      await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) === JSON.stringify(into))
      await undo.click()
      const undone = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) === JSON.stringify(ORIGINAL))

      expect({
        intoHint: intoHint.map((h) => h.placement),
        into,
        beforeHint: beforeHint.map((h) => [h.placement, h.axis]),
        before,
        undone,
        sent: patches.length,
      }).toEqual({
        intoHint: ['inside'],
        into: { n_root: [{ n_card: ['n_intx'] }, { n_empt: ['n_text'] }, 'n_divi'] },
        beforeHint: [['before', 'y']],
        before: { n_root: [{ n_card: ['n_divi', 'n_intx'] }, { n_empt: ['n_text'] }] },
        undone: ORIGINAL,
        sent: 4,
      })
    } finally {
      await close()
    }
  })

  it('손잡이를 누르기만 하면 편집이 없고 고른 노드가 그대로다', async () => {
    const { P } = await fixture('click', [BASIC])
    const { page, close, patches } = await openEditor(P[0]!)
    try {
      await pick(page, 'n_text')
      await handle(page).click()
      await page.waitForTimeout(400)
      const selected = await page.locator('.wb-shell-selection').getAttribute('data-wb-selected-id')
      expect({ sent: patches.length, selected, shape: await shape(P[0]!) }).toEqual({ sent: 0, selected: 'n_text', shape: ORIGINAL })
    } finally {
      await close()
    }
  })

  describe('끄는 중 남이 대상을 바꾼다', () => {
    /** alice 가 n_text 를 쥐고 빈 카드 위에서 «안» 표시를 세운 판. */
    async function armed(P: string): Promise<{ page: Page; close: () => Promise<void>; patches: string[]; armedHint: string[] }> {
      const tab = await openEditor(P)
      await pick(tab.page, 'n_text')
      await grab(tab.page)
      await moveTo(tab.page, await spotIn(tab.page, 'n_empt', 0.5, 0.5))
      const armedHint = (await indicators(tab.page)).map((h) => `${h.placement}`)
      return { ...tab, armedHint }
    }

    it('bob 이 그 카드를 고르면(잠금) 표시가 곧바로 걷히고 조금 움직였다 놓아도 편집이 없다', async () => {
      const { P } = await fixture('locked', [BASIC])
      const bob = await openEditor(P[0]!, 'bob')
      const { page, close, patches, armedHint } = await armed(P[0]!)
      try {
        await pick(bob.page, 'n_empt')
        await page.locator('.wb-shell-structure-lock').waitFor()
        const stillAfterLock = (await indicators(page)).length
        const here = await spotIn(page, 'n_empt', 0.5, 0.5)
        await page.mouse.move(here.x + 1, here.y + 1)
        const afterLock = (await indicators(page)).length
        await page.mouse.up()
        await page.waitForTimeout(500)
        expect({ armedHint, stillAfterLock, afterLock, sent: patches.length, shape: await shape(P[0]!) }).toEqual({
          armedHint: ['inside'],
          stillAfterLock: 0,
          afterLock: 0,
          sent: 0,
          shape: ORIGINAL,
        })
      } finally {
        await close()
        await bob.close()
      }
    })

    it('bob 이 그 카드를 지우면 표시가 곧바로 걷히고 조금 움직였다 놓아도 그 밑의 다른 자리로 안 간다', async () => {
      const { P } = await fixture('deleted', [BASIC])
      const { page, close, patches, armedHint } = await armed(P[0]!)
      try {
        const here = await spotIn(page, 'n_empt', 0.5, 0.5)
        const bob = await stack.login(stack.users.bob)
        const head = (await stack.request(bob, 'GET', P[0]!)).body.headSeq as number
        const removed = await stack.request(bob, 'PATCH', `${P[0]!}/ops`, { baseSeq: head, ops: [{ op: 'remove', path: '/root/children/2' }] })
        if (removed.status >= 300) throw new Error(`remove ${removed.status}`)
        await canvasFrame(page).locator('[data-wb-id="n_empt"]').waitFor({ state: 'detached' })
        // 포인터가 멈춘 채 — 보인 자리가 무너졌으니 표시가 걷힌다(`use-placement.ts` 의 `live`).
        const stillAfterRemove = (await indicators(page)).length
        // 지운 카드 자리 밑에는 이제 다른 것(바탕 = 페이지 끝 · 아래 형제)이 있다 — 조금 움직였다 떼도 그 자리로 안 간다.
        await page.mouse.move(here.x + 1, here.y + 1)
        const afterRemove = (await indicators(page)).length
        await page.mouse.up()
        await page.waitForTimeout(500)
        expect({ armedHint, stillAfterRemove, afterRemove, sent: patches.length, shape: await shape(P[0]!) }).toEqual({
          armedHint: ['inside'],
          stillAfterRemove: 0,
          afterRemove: 0,
          sent: 0,
          shape: { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_divi'] },
        })
      } finally {
        await close()
      }
    })
  })

  /**
   * **시스템 테마 다섯의 가로 배치.** 노드를 자식으로 담아 가로로 늘어놓는 상자(테마 소스에서 센 것):
   *
   * | 테마 | `Grid`(`columns` ≥ 2) | `SearchForm` 필드 줄 |
   * |---|---|---|
   * | 다섯 다 | SDK 기본 뷰 `display: grid` — 테마 CSS 는 `gap` 만 준다 | 테마 CSS 가 `[data-wb-part="fields"]` 를 `display: flex`(row) 로 둔다 |
   *
   * (다시 세는 법: `grep -n 'data-wb-component="\(Grid\|SearchForm\)"' system-themes/*\/src/theme.css` 와 `ls system-themes/*\/src/views` —
   * `Grid` 뷰를 덮는 테마가 없다.) `row-reverse` 로 노드를 늘어놓는 상자는 다섯 다 없다 — 뒤집힘은 순수 함수 판(`test/canvas/canvas-drop.test.ts`)만 잰다.
   */
  const THEMES = ['admin', 'commerce', 'docs', 'portal', 'saas-marketing'] as const
  const ROW: SeedNode[] = [
    { id: 'n_move', type: 'Text', props: { content: '옮길 글' } },
    {
      id: 'n_grid',
      type: 'Grid',
      props: { columns: 3 },
      children: [
        { id: 'n_g1', type: 'Text', props: { content: '하나' } },
        { id: 'n_g2', type: 'Text', props: { content: '둘' } },
        { id: 'n_g3', type: 'Text', props: { content: '셋' } },
      ],
    },
    {
      id: 'n_form',
      type: 'SearchForm',
      children: [
        { id: 'n_f1', type: 'Field', props: { label: '이름' } },
        { id: 'n_f2', type: 'Field', props: { label: '상태' } },
      ],
    },
  ]

  for (const theme of THEMES) {
    it(`system-${theme}: 그리드 칸의 오른쪽 · 왼쪽에 놓으면 문서의 뒤 · 앞이고 표시가 세로 선이다 · 검색폼 필드 줄도 가로다`, async () => {
      const { P } = await fixture(`row-${theme}`, [ROW], theme)
      const { page, close } = await openEditor(P[0]!)
      try {
        const sheet = await canvasFrame(page).locator('head [data-wb-style="theme"]').count()
        await pick(page, 'n_move')
        await grab(page)
        await moveTo(page, await spotIn(page, 'n_g1', 0.92, 0.5))
        const afterG1 = (await indicators(page)).map((h) => `${h.placement}:${h.axis}`)
        await page.mouse.up()
        // 바뀔 때까지만 기다리고 자리는 아래에서 값으로 견준다 — 자리를 기다리면 틀린 자리가 시간 초과로만 죽는다.
        const seeded = { n_root: ['n_move', { n_grid: ['n_g1', 'n_g2', 'n_g3'] }, { n_form: ['n_f1', 'n_f2'] }] }
        const first = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(seeded))

        await pick(page, 'n_move')
        await grab(page)
        await moveTo(page, await spotIn(page, 'n_f1', 0.08, 0.5))
        const beforeF1 = (await indicators(page)).map((h) => `${h.placement}:${h.axis}`)
        await moveTo(page, await spotIn(page, 'n_g3', 0.08, 0.5))
        const beforeG3 = (await indicators(page)).map((h) => `${h.placement}:${h.axis}`)
        await page.mouse.up()
        const second = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(first))

        expect({ sheet, afterG1, first, beforeF1, beforeG3, second }).toEqual({
          sheet: 1,
          afterG1: ['after:x'],
          first: { n_root: [{ n_grid: ['n_g1', 'n_move', 'n_g2', 'n_g3'] }, { n_form: ['n_f1', 'n_f2'] }] },
          beforeF1: ['before:x'],
          beforeG3: ['before:x'],
          second: { n_root: [{ n_grid: ['n_g1', 'n_g2', 'n_move', 'n_g3'] }, { n_form: ['n_f1', 'n_f2'] }] },
        })
      } finally {
        await close()
      }
    })
  }

  /** 줌 단추로 그 배율까지 민다. */
  async function zoomTo(page: Page, target: number): Promise<void> {
    const group = page.getByRole('group', { name: '줌' })
    for (let step = 0; step < 12; step += 1) {
      const now = Number((await group.locator('.wb-shell-zoom-value').textContent())?.replace('%', '')) / 100
      if (Math.abs(now - target) < 0.01) return
      await group.getByRole('button', { name: now < target ? '확대' : '축소', exact: true }).click()
    }
    throw new Error(`줌 ${target} 에 못 닿았다`)
  }

  /** 캔버스 칸을 밀어 그 노드가 칸 위에서 `offset` 아래에 서게 한다. 민 뒤 칸의 `scrollTop`. */
  async function scrollToNode(page: Page, id: string, offset: number): Promise<number> {
    const box = await nodeBox(page, id)
    return page.evaluate(
      ({ y, offset }) => {
        const canvas = document.querySelector('.wb-shell-canvas') as HTMLElement
        canvas.scrollTop += y - canvas.getBoundingClientRect().top - offset
        return canvas.scrollTop
      },
      { y: box.y, offset },
    )
  }

  it('줌 0.5 · 1 · 1.5 와 스크롤한 칸에서 표시 상자가 포인터 밑 노드의 상자와 1px 안에서 맞다', async () => {
    const texts: SeedNode[] = Array.from({ length: 24 }, (_, i) => ({
      id: `n_t${String(i).padStart(2, '0')}`,
      type: 'Text',
      props: { content: `줄 ${i}` },
    }))
    const { P } = await fixture('zoom', [[...texts, { id: 'n_box', type: 'Card', props: { title: '상자' } }]])
    const { page, close, patches } = await openEditor(P[0]!)
    const rows: Record<string, unknown> = {}
    try {
      for (const zoom of [0.5, 1, 1.5]) {
        await zoomTo(page, zoom)
        const scrollTop = await scrollToNode(page, 'n_t22', 160)
        await pick(page, 'n_t23')
        await grab(page)
        await moveTo(page, await spotIn(page, 'n_box', 0.15, 0.5))
        const inside = await indicators(page)
        const box = await nodeBox(page, 'n_box')
        await moveTo(page, await spotIn(page, 'n_t21', 0.15, 0.9))
        const line = await indicators(page)
        const t21 = await nodeBox(page, 'n_t21')
        await page.keyboard.press('Escape')
        await page.mouse.up()
        const off = (a: number, b: number) => Math.abs(a - b) <= 1
        rows[String(zoom)] = {
          scrolled: scrollTop > 0,
          inside: inside.length === 1 && inside[0]!.placement === 'inside'
            ? [off(inside[0]!.rect.x, box.x), off(inside[0]!.rect.y, box.y), off(inside[0]!.rect.width, box.width), off(inside[0]!.rect.height, box.height)]
            : inside,
          // 선은 노드 아래 가장자리에 두께(2px)의 가운데를 맞춘다.
          line: line.length === 1 && line[0]!.placement === 'after'
            ? [off(line[0]!.rect.x, t21.x), off(line[0]!.rect.y + 1, t21.y + t21.height), off(line[0]!.rect.width, t21.width)]
            : line,
        }
      }
      await page.waitForTimeout(300)
      expect({ rows, sent: patches.length }).toEqual({
        rows: Object.fromEntries(
          ['0.5', '1', '1.5'].map((zoom) => [zoom, { scrolled: true, inside: [true, true, true, true], line: [true, true, true] }]),
        ),
        sent: 0,
      })
    } finally {
      await close()
    }
  })

  it('끄는 중 페이지를 옮기면(뒤로 가기) 표시가 걷히고 놓아도 편집이 없다', async () => {
    const page1: SeedNode[] = [
      { id: 'n_text', type: 'Text', props: { content: '글' } },
      { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
    ]
    // 둘째 쪽은 id 를 달리한다 — 같으면 첫 쪽의 캔버스가 남은 동안 기다림이 먼저 풀린다.
    const page2: SeedNode[] = [
      { id: 'n_text2', type: 'Text', props: { content: '글' } },
      { id: 'n_empt2', type: 'Card', props: { title: '빈 카드' } },
    ]
    const { P } = await fixture('page-move', [page1, page2])
    const { page, close, patches } = await openEditor(P[0]!)
    try {
      await page.getByRole('link', { name: '쪽2' }).click()
      await page.waitForURL((url) => url.pathname === P[1])
      await canvasFrame(page).locator('[data-wb-id="n_empt2"]').waitFor()
      await pick(page, 'n_text2')
      await grab(page)
      await moveTo(page, await spotIn(page, 'n_empt2', 0.5, 0.5))
      const armed = (await indicators(page)).map((h) => h.placement)
      await page.evaluate(() => history.back())
      await page.waitForURL((url) => url.pathname === P[0])
      await canvasFrame(page).locator('[data-wb-id="n_empt"]').waitFor()
      const afterMove = (await indicators(page)).length
      const there = await spotIn(page, 'n_empt', 0.5, 0.5)
      await page.mouse.move(there.x, there.y, { steps: 4 })
      const overNewPage = (await indicators(page)).length
      await page.mouse.up()
      await page.waitForTimeout(500)
      const original = { n_root: ['n_text', 'n_empt'] }
      expect({ armed, afterMove, overNewPage, sent: patches.length, first: await shape(P[0]!), second: await shape(P[1]!) }).toEqual({
        armed: ['inside'],
        afterMove: 0,
        overNewPage: 0,
        sent: 0,
        first: original,
        second: { n_root: ['n_text2', 'n_empt2'] },
      })
    } finally {
      await close()
    }
  })

  function treeRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  it('끄는 중 구조 트리를 지나 캔버스로 돌아와 놓으면 캔버스의 자리로 · 트리 줄 위에 놓으면 트리 판정의 자리로 간다', async () => {
    const { P } = await fixture('via-tree', [BASIC])
    const { page, close } = await openEditor(P[0]!)
    try {
      await pick(page, 'n_text')
      await grab(page)
      const card = (await treeRow(page, 'n_card').boundingBox())!
      await moveTo(page, { x: card.x + 30, y: card.y + card.height / 2 })
      const overTree = await indicators(page)
      await moveTo(page, await spotIn(page, 'n_empt', 0.5, 0.5))
      const backOnCanvas = (await indicators(page)).map((h) => h.placement)
      await page.mouse.up()
      const viaTree = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(ORIGINAL))

      await pick(page, 'n_text')
      await grab(page)
      const divider = (await treeRow(page, 'n_divi').boundingBox())!
      await moveTo(page, { x: divider.x + 30, y: divider.y + divider.height - 3 })
      const onRow = (await indicators(page)).map((h) => `${h.placement}:${h.axis}`)
      await page.mouse.up()
      const ontoRow = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(viaTree))

      expect({
        overTree: overTree.map((h) => h.placement),
        overTreeOnRow: overTree.length === 1 && Math.abs(overTree[0]!.rect.y - card.y) <= 1,
        backOnCanvas,
        viaTree,
        onRow,
        ontoRow,
      }).toEqual({
        overTree: ['inside'],
        overTreeOnRow: true,
        backOnCanvas: ['inside'],
        viaTree: { n_root: [{ n_card: ['n_intx'] }, { n_empt: ['n_text'] }, 'n_divi'] },
        onRow: ['after:y'],
        ontoRow: { n_root: [{ n_card: ['n_intx'] }, 'n_empt', 'n_divi', 'n_text'] },
      })
    } finally {
      await close()
    }
  })
})
