/**
 * **트랙 사이의 겹침 — 실브라우저 판**. «컴포넌트» 탭(`src/panels/component-panel.tsx` · `shell/canvas-pick.tsx`), 그리드 행 «행 내용»
 * (`src/panels/row-content-field.tsx`), 카드 더블클릭 넣기(`src/palette/card-double-click.ts`)가 따로 지어져 한 판에서 처음 만난다. 셋이 함께
 * 선 판을 서버 값 · 화면으로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 캔버스에서 그리드 행 누름 | «코멘트» 탭에서 캔버스의 행을 눌렀는데 탭이 «컴포넌트» 로 안 옮긴다 · «속성» 묶음에 «행 내용» 이 안 선다 · «코멘트» 묶음이 안 선다 |
 * | «코멘트» 탭으로 옮김 | «컴포넌트» 탭의 «코멘트» 묶음이 읽어 둔 목록이 «코멘트» 탭에 섰다가 다시 읽는 동안 «불러오는 중» 으로 빠진다 |
 * | 카드 더블클릭 넣기 | 넣은 노드가 안 골라진다 · 넣은 뒤 저절로 고름이 우측 탭을 «컴포넌트» 로 옮긴다(캔버스 누름이 아니다) |
 * | 우측 탭 머리 줄 | 창 1280 · 1440 · 900 의 우측 패널 기본 폭(= 최소 폭 300)에서 탭 이름이 두 줄로 꺾인다 · 탭이 두 줄로 놓인다 · 탭 줄이 패널 밖으로 넘친다 · 탭을 눌러 못 고른다 |
 *
 * 줄 수는 탭 단추의 글 노드 하나의 `Range.getClientRects()` 서로 다른 `top` 수로 센다 — 요소 상자는 꺾여도 한 상자다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MIN } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
}

/**
 * 고름 칸(`select: 'check'`) · 셀 틀 글 열 둘 · 행 하나 · 아래 글. 캔버스는 셀 틀 칸을 그 열로 읽는다(`canvas/canvas.tsx` 의 `nodeIdAt` —
 * `data-wb-column-of`) — 행만 덮는 자리는 열이 없는 고름 칸이다.
 */
const GRID: Node[] = [
  {
    id: 'm_g',
    type: 'DataGrid',
    props: { select: 'check' },
    children: [
      { id: 'm_c0', type: 'GridColumn', props: { label: '이름' }, children: [{ id: 'm_t0', type: 'Text', props: { content: '홍길동' } }] },
      { id: 'm_c1', type: 'GridColumn', props: { label: '상태' }, children: [{ id: 'm_t1', type: 'Text', props: { content: '정상' } }] },
    ],
    zones: { rows: [{ id: 'm_r', type: 'GridRow' }] },
  },
  { id: 'm_tail', type: 'Text', props: { content: '아래 글' } },
]

describe.skipIf(!전제.ok)('트랙 겹침 — 실브라우저', () => {
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

  async function seed(slug: string, nodes: Node[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: '트랙 겹침', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const topIds = async (P: string): Promise<string[]> =>
    (((await call('GET', P)).body.schema.root as Node).children ?? []).map((child) => child.id)

  async function open(P: string, width: number, height = 900): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  /** 우측 패널의 탭 줄 — 하단 판의 갈래 탭도 `role="tab"` 이라 이름으로 좁힌다. */
  const rightTabs = (page: Page) => page.getByRole('tablist', { name: '우측 패널 탭', exact: true })
  const selectedTab = async (page: Page): Promise<string> =>
    ((await rightTabs(page).locator('[role="tab"][aria-selected="true"]').textContent()) ?? '').trim()
  const selected = (page: Page) =>
    page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)

  async function tab(page: Page, name: string): Promise<void> {
    await rightTabs(page).getByRole('tab', { name, exact: true }).click()
    await poll(
      `${name} 탭`,
      () => selectedTab(page),
      (v) => v === name,
    )
  }

  /**
   * 캔버스에서 그 노드를 누른다 — 노드 상자를 4px 격자로 훑어 셸의 맨 위가 캔버스 iframe 이고 그 점을 캔버스가 그 노드로 읽는 첫 점
   * (`component-tab.test.ts` 의 `clickCanvasNode` 꼴 · 읽는 규칙은 `canvas/canvas.tsx` 의 `nodeIdAt` 과 같은 속성 셋).
   */
  async function clickCanvasNode(page: Page, id: string): Promise<void> {
    const box = (await canvasFrame(page).locator(`[data-wb-id="${id}"]`).first().boundingBox())!
    const at = (await page.evaluate(
      `(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument;
        const scale = r.width / f.clientWidth;
        for (let y = ${box.y} + 2; y < ${box.y + box.height} - 1; y += 4) for (let x = ${box.x} + 2; x < ${box.x + box.width} - 1; x += 4) {
          if (document.elementFromPoint(x, y) !== f) continue
          const el = d.elementFromPoint((x - r.left) / scale, (y - r.top) / scale)
          let hit = null
          for (let at = el; at !== null && hit === null; at = at.parentElement)
            for (const name of ['data-wb-id', 'data-wb-copy-of', 'data-wb-column-of']) { const v = at.getAttribute(name); if (v) { hit = v; break } }
          if (hit === '${id}') return { x, y }
        }
        return null })()`,
    )) as { x: number; y: number } | null
    // 카나리아 — 누를 점이 있다.
    expect(at, `${id} 를 누를 점`).not.toBeNull()
    await page.mouse.click(at!.x, at!.y)
    await poll(
      `${id} 를 고른다`,
      () => selected(page),
      (v) => v === id,
    )
  }

  it('«코멘트» 탭에서 캔버스의 그리드 행을 누르면 «컴포넌트» 탭으로 옮기고, «속성» 묶음에 «행 내용» · «코멘트» 묶음이 선다', async () => {
    const P = await seed('mv-row-pick', GRID)
    const opened = await open(P, 1440, 1000)
    const { page } = opened
    try {
      await canvasFrame(page).locator('tr[data-wb-id="m_r"]').waitFor({ state: 'attached' })
      await tab(page, '코멘트')
      await clickCanvasNode(page, 'm_r')
      await poll(
        '«컴포넌트» 탭',
        () => selectedTab(page),
        (v) => v === '컴포넌트',
      )
      const panel = page.getByRole('tabpanel')
      const props = panel.getByRole('region', { name: '속성', exact: true })
      const content = props.getByRole('radiogroup', { name: '행 내용' })
      // «행 내용» 은 기다리지 않는다 — 안 서는 판이 시간 초과가 아니라 값(빈 목록)으로 죽게. 그 칸과 같은 렌더에 서는 것(행 속성의 «되풀이» 칸 ·
      // «코멘트» 묶음)을 기다린다.
      await props.getByLabel('되풀이', { exact: true }).waitFor()
      const commentsPart = panel.getByRole('region', { name: '코멘트', exact: true })
      await commentsPart.waitFor()
      expect({
        탭: await selectedTab(page),
        고른: await selected(page),
        행내용: await content.getByRole('radio').allTextContents(),
        코멘트묶음: await commentsPart.getByRole('textbox').count(),
      }).toEqual({ 탭: '컴포넌트', 고른: 'm_r', 행내용: ['기본', '커스텀'], 코멘트묶음: 1 })
    } finally {
      await opened.close()
    }
  })

  it('카드 더블클릭으로 넣으면 넣은 노드가 골라지고, 우측 탭은 그대로다', async () => {
    const P = await seed('mv-dbl-tab', [{ id: 'm_first', type: 'Text', props: { content: '처음 글' } }])
    const opened = await open(P, 1440)
    const { page } = opened
    try {
      await tab(page, '코멘트')
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Divider')
      const label = page.locator('[data-wb-palette-card="Divider"] .wb-shell-palette-label')
      await label.waitFor()
      const box = (await label.boundingBox())!
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
      const ids = await poll(
        '넣은 노드가 서버에 섰다',
        () => topIds(P),
        (list) => list.length === 2,
      )
      const added = ids[1]!
      await poll(
        '넣은 노드가 골라졌다',
        () => selected(page),
        (v) => v === added,
      )
      // 늦게 오는 탭 바뀜이 있으면 볼 틈.
      await page.waitForTimeout(500)
      expect({ 탭: await selectedTab(page), 고른: await selected(page) }).toEqual({ 탭: '코멘트', 고른: added })
    } finally {
      await opened.close()
    }
  })

  /**
   * **«컴포넌트» 탭의 «코멘트» 묶음과 «코멘트» 탭은 목록 칸 하나를 나눠 쓴다**(`panels/comment-panel.tsx` 의 `LIST`). 묶음이 읽어 둔 목록이 있는
   * 채 «코멘트» 탭을 열면 그 목록이 첫 렌더에 선다 — 다시 읽는 동안 그것을 «불러오는 중» 으로 지우면 말이 섰다가 사라졌다가 다시 선다(부하 판에서
   * `editor-restore-late-commit.test.ts` 가 그 틈에 0 을 셌다). 다시 읽기를 늦춘 판에서 목록 줄이 한 번도 안 빠지는지 센다.
   */
  it('«컴포넌트» 탭에서 «코멘트» 탭으로 옮기면, 다시 읽는 동안에도 읽어 둔 목록이 남는다', async () => {
    const P = await seed('mv-comments-keep', [{ id: 'm_first', type: 'Text', props: { content: '처음 글' } }])
    const posted = await call('POST', `${P}/comments`, { nodeId: 'm_first', body: '남는 말' })
    if (posted.status >= 300) throw new Error(`comment ${posted.status}`)
    const opened = await open(P, 1440)
    const { page } = opened
    try {
      // 묶음이 목록을 읽었다 — 고른 뿌리에는 말이 없다는 문장이 선다.
      await page.getByRole('region', { name: '코멘트', exact: true }).getByText('이 노드에 단 코멘트가 없습니다').waitFor()
      let held = 0
      await page.route(/\/comments(\?|$)/, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        held += 1
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        await route.fallback()
      })
      await page.evaluate(() => {
        const w = window as unknown as { __rows: number[]; __loading: number }
        w.__rows = []
        w.__loading = 0
        const panel = document.querySelector('.wb-shell-panel')!
        new MutationObserver(() => {
          const rows = panel.querySelectorAll('li.wb-shell-comment').length
          if (w.__rows.at(-1) !== rows) w.__rows.push(rows)
          if ((panel.textContent ?? '').includes('코멘트를 불러오는 중')) w.__loading += 1
        }).observe(panel, { childList: true, subtree: true, characterData: true })
      })
      await tab(page, '코멘트')
      await poll(
        '다시 읽기가 늦춰졌다',
        async () => held,
        (n) => n > 0,
      )
      await page.waitForTimeout(2_000)
      const seen = await page.evaluate(() => {
        const w = window as unknown as { __rows: number[]; __loading: number }
        return { rows: w.__rows, loading: w.__loading }
      })
      expect({ 줄: seen.rows, 불러오는중: seen.loading, 끝: await page.locator('[role="tabpanel"] li.wb-shell-comment').count() }).toEqual({
        줄: [1],
        불러오는중: 0,
        끝: 1,
      })
    } finally {
      await opened.close()
    }
  })

  /** 우측 탭 줄을 잰다 — 탭마다 글 줄 수 · 탭 줄이 패널 안에 서는가. */
  function measureTabs(page: Page) {
    return page.evaluate(() => {
      const list = document.querySelector('[role="tablist"][aria-label="우측 패널 탭"]') as HTMLElement
      const panel = list.closest('.wb-shell-panel') as HTMLElement
      const tabs = [...list.querySelectorAll('[role="tab"]')].map((tab) => {
        const text = [...tab.childNodes].find((node) => node.nodeType === 3)!
        const range = document.createRange()
        range.selectNodeContents(text)
        const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
        const r = tab.getBoundingClientRect()
        return {
          name: (tab.textContent ?? '').trim(),
          lines: tops.size,
          right: Math.round(r.right),
          top: Math.round(r.top),
          width: Math.round(r.width),
        }
      })
      const p = panel.getBoundingClientRect()
      const l = list.getBoundingClientRect()
      return {
        panel: Math.round(p.width),
        tabs,
        listWidth: Math.round(l.width),
        rows: new Set(tabs.map((t) => t.top)).size,
        listOverflow: list.scrollWidth - list.clientWidth,
        pastPanel: Math.max(0, ...tabs.map((t) => t.right)) - Math.round(p.right),
        listLeft: Math.round(l.left),
      }
    })
  }

  // 900 은 캔버스가 최소 몫(`CANVAS_MIN_WIDTH`) 아래로 줄어드는 좁은 창이다 — 패널은 최소 폭에 머문다.
  it.each([1280, 1440, 900])('창 %i 의 우측 패널 기본 폭에서 탭 이름이 모두 한 줄이고 패널 안에 서며, 눌러 고를 수 있다', async (width) => {
    // 카나리아 — 기본 폭이 곧 최소 폭이다(그보다 좁은 판이 없다).
    expect(PANEL_WIDTH_DEFAULT).toBe(PANEL_WIDTH_MIN)
    const P = await seed(`mv-tabs-${width}`, [{ id: 'm_first', type: 'Text', props: { content: '처음 글' } }])
    const opened = await open(P, width)
    const { page } = opened
    try {
      const seen = await measureTabs(page)
      // eslint-disable-next-line no-console
      console.log(`[탭 머리 ${width}] ${JSON.stringify(seen)}`)
      expect(seen.panel).toBe(PANEL_WIDTH_DEFAULT)
      expect(seen.tabs.map((t) => t.name)).toEqual(['페이지 정보', '컴포넌트', '코멘트', '상호작용'])
      expect({ 줄: seen.tabs.map((t) => t.lines), 탭줄: seen.rows, 넘침: seen.listOverflow, 패널안: seen.pastPanel <= 0 }).toEqual({
        줄: [1, 1, 1, 1],
        탭줄: 1,
        넘침: 0,
        패널안: true,
      })
      // 고른 탭은 굵은 글이라 넓어진다 — 탭마다 골라 그 판에서도 한 줄인지 본다(누름이 고름을 세우는지도 함께).
      const picked: Record<string, { 줄: number[]; 탭줄: number }> = {}
      for (const name of ['상호작용', '페이지 정보', '코멘트', '컴포넌트']) {
        await tab(page, name)
        const now = await measureTabs(page)
        picked[name] = { 줄: now.tabs.map((t) => t.lines), 탭줄: now.rows }
      }
      const one = { 줄: [1, 1, 1, 1], 탭줄: 1 }
      expect(picked).toEqual({ 상호작용: one, '페이지 정보': one, 코멘트: one, 컴포넌트: one })
    } finally {
      await opened.close()
    }
  })
})
