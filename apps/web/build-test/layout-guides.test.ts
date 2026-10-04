/**
 * **배치 선을 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «배치 선» · `src/canvas/layout-guides.tsx` · `src/canvas/canvas.tsx` 의 `guides`).
 * jsdom 은 배치가 없어 «선이 노드 상자에 맞는다 · 모서리 글이 그려진 배치다»를 못 잰다 — 토글 · 기억 · 모드는 `test/canvas/layout-guides.test.tsx`.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 시스템 테마 다섯 — 줌 0.5 · 1 · 1.5 · 칸 스크롤 · 뷰포트 폭 | 선의 네 변이 노드 상자(외곽선과 같은 `data-wb-focus` 상자)에서 1px 넘게 어긋난다 · Flex 가로 · 세로 · Grid 3열의 모서리 글이 «→ · ↓ · 3열»이 아니다(창 1440 · 뷰포트 1440) |
 * | 남의 편집 | 남이 형제 차례를 바꾼 뒤(문서 높이 그대로 — iframe 이 다시 안 잼) 선이 옛 상자에 남는다 · 남이 Flex 를 세로로 바꾼 뒤 그 선의 글이 «↓»가 아니다 |
 * | 미리보기 끌기 | 끄는 동안 미리보기 노드(`wb:preview:`)에 선이 선다 · 밀린 형제의 선이 옛 자리에 남는다 |
 * | 뷰 모드 · 새로 고침 | 뷰 모드에 단추 · 선이 남는다 · 새로 고친 뒤 켬을 잃는다 |
 * | 안쪽 선 — 시스템 테마 다섯 · 관리 테마 간격 0 × 줌 0.5 · 1 · 1.5 · 칸 스크롤 · 뷰포트 375 · 남의 편집 | Grid 2×3 · 3×2 · 빈 칸이 있는 3열 · Flex 가로 · 세로 · 줄바꿈 · 자식 하나의 선 수가 기대와 다르다 · 선이 이웃 자식 사이 간격의 가운데에서 1px 넘게 어긋난다 · 남이 자식을 지운 뒤 옛 선이 남는다 · 맞닿은 칸(간격 0)을 한 열로 잇는다 |
 * | 미리보기 끌기 — 안쪽 선 | Flex 안에 선 미리보기를 자식으로 세어 선을 하나 더 긋는다 |
 * | 자식 수백 | 자식 200 의 Grid(10열)에 세로 9 · 가로 19 가 아니다 — 비용(판정 하나 · 줌 한 단계)은 `[다시 잼]` 로그 |
 *
 * **못 재는 것:** 캔버스 문서 좌표를 표면 좌표로 옮기는 셈(`canvas.tsx` 의 `onSurface` — iframe 의 표면 안 자리를 더한다)을 떼도 여기 판들은
 * 초록이다 — 판마다 iframe 이 표면 왼쪽 위에 서서(알림 줄이 없다) 더할 값이 0 이다. 바깥 점선의 `measure` 도 같은 자리를 더해 같은 처지다.
 *
 * 테마마다 그 판의 모서리 글(빈 Flex · 좁은 뷰포트 375 의 Grid 포함)을 `[배치 선]` 로그로, 안쪽 선의 수 · 차 · 칸 사이 간격 · 줄바꿈 줄 수를
 * `[안쪽 선]` 로그로 낸다.
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

const THEMES = ['system-admin', 'system-commerce', 'system-docs', 'system-portal', 'system-saas-marketing'] as const

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })

/** Flex 가로 · Flex 세로 · Grid 3열 · 빈 Flex, 그리고 칸이 스크롤하게 글 스물. */
const NODES = [
  { id: 'n_flxr0000001', type: 'Flex', props: { direction: 'row' }, children: [text('n_r1', '가로 하나'), text('n_r2', '가로 둘'), text('n_r3', '가로 셋')] },
  { id: 'n_flxc0000001', type: 'Flex', props: { direction: 'column' }, children: [text('n_c1', '세로 하나'), text('n_c2', '세로 둘')] },
  { id: 'n_grid0000001', type: 'Grid', props: { columns: 3 }, children: [text('n_g1', '칸 하나'), text('n_g2', '칸 둘'), text('n_g3', '칸 셋'), text('n_g4', '칸 넷')] },
  { id: 'n_flxe0000001', type: 'Flex', props: { direction: 'row' }, children: [] },
  ...Array.from({ length: 20 }, (_, index) => text(`n_t${index}`, `채우는 글 ${index} — 캔버스를 세로로 길게 만든다`)),
]

const GUIDED = ['n_flxr0000001', 'n_flxc0000001', 'n_grid0000001', 'n_flxe0000001']

const texts = (prefix: string, count: number, content: (index: number) => string = (index) => `${prefix} ${index + 1}`) =>
  Array.from({ length: count }, (_, index) => text(`${prefix}${index}`, content(index)))

/**
 * 안쪽 구분선의 판 — Grid 2×3 · 3×2 · 마지막 줄이 빈 3열 · Flex 가로 · 세로 · 줄바꿈 · 자식 하나. 줄바꿈은 글 여섯이 한 줄에 다 못 서는 긴
 * 글이다 — 테마마다 글자 크기가 달라 줄 수가 갈리므로 «두 줄 이상 · 한 줄에 둘 이상인 줄이 있다»를 카나리아로 센다(창 1440 · 뷰포트 1440).
 */
const LINE_NODES = [
  { id: 'n_g23', type: 'Grid', props: { columns: 3 }, children: texts('g23_', 6) },
  { id: 'n_g32', type: 'Grid', props: { columns: 2 }, children: texts('g32_', 6) },
  { id: 'n_g34', type: 'Grid', props: { columns: 3 }, children: texts('g34_', 4) },
  { id: 'n_frow', type: 'Flex', props: { direction: 'row' }, children: texts('frow_', 3) },
  { id: 'n_fcol', type: 'Flex', props: { direction: 'column' }, children: texts('fcol_', 3) },
  {
    id: 'n_fwrap',
    type: 'Flex',
    props: { direction: 'row', wrap: true },
    children: texts('fwrap_', 6, (index) => `줄바꿈 ${index + 1} — 한 줄에 몇만 서도록 늘인 글 가나다라마바사아자차카타파하`),
  },
  { id: 'n_fone', type: 'Flex', props: { direction: 'row' }, children: texts('fone_', 1) },
  ...texts('fill_', 16, (index) => `채우는 글 ${index} — 캔버스를 세로로 길게 만든다`),
]

/** 판마다 기대하는 선 수 — `x` 세로선 · `y` 가로선. 줄바꿈은 그려진 줄 수 `L` 에서 짓는다(`x = 자식 − L` · `y = L − 1`). */
const LINE_COUNTS: Record<string, { x: number; y: number } | 'wrap'> = {
  n_g23: { x: 2, y: 1 },
  n_g32: { x: 1, y: 2 },
  n_g34: { x: 2, y: 1 },
  n_frow: { x: 2, y: 0 },
  n_fcol: { x: 0, y: 2 },
  n_fwrap: 'wrap',
  n_fone: { x: 0, y: 0 },
}

/**
 * 배치 선마다 안쪽 선 — 선마다 «이웃 자식 사이 간격의 가운데»와의 차(px · 호스트 좌표). 이웃은 그린 자식 상자로 고른다: 세로선은 세로로 겹치는
 * 두 자식 가운데 왼쪽 것의 오른끝 바로 오른쪽에 선 것, 가로선은 가로로 겹치는 두 자식 가운데 위의 것의 아래끝 바로 밑에 선 것. 자식은
 * 그 노드 요소 안에서 가장 가까운 노드 조상이 그 노드인 `data-wb-id` 요소다. 줄 수(`rows`)는 서로 다른 윗끝(1px 안은 같다)의 수다.
 */
const LINES = `(() => {
  const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')
  const f = iframe.getBoundingClientRect()
  const zoom = f.width / iframe.offsetWidth
  const doc = iframe.contentDocument
  const out = {}
  for (const guide of document.querySelectorAll('[data-wb-guide-for]')) {
    const id = guide.getAttribute('data-wb-guide-for')
    const node = [...doc.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === id)
    if (node === undefined) continue
    const kids = [...node.querySelectorAll('[data-wb-id]')]
      .filter((el) => el.parentElement.closest('[data-wb-id]') === node)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 || r.height > 0)
      .map((r) => ({ left: f.left + r.left * zoom, top: f.top + r.top * zoom, right: f.left + r.right * zoom, bottom: f.top + r.bottom * zoom }))
    const tops = []
    for (const k of kids) if (!tops.some((t) => Math.abs(t - k.top) <= 1)) tops.push(k.top)
    const overlapY = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
    const overlapX = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
    const mids = { x: [], y: [] }
    for (const a of kids) {
      const right = kids.filter((b) => b !== a && overlapY(a, b) && b.left >= a.right - 1).sort((p, q) => p.left - q.left)[0]
      if (right !== undefined) mids.x.push((a.right + right.left) / 2)
      const below = kids.filter((b) => b !== a && overlapX(a, b) && b.top >= a.bottom - 1).sort((p, q) => p.top - q.top)[0]
      if (below !== undefined) mids.y.push((a.bottom + below.top) / 2)
    }
    const lines = { x: [], y: [] }
    for (const line of guide.querySelectorAll('[data-wb-guide-line]')) {
      const axis = line.getAttribute('data-wb-guide-line')
      const r = line.getBoundingClientRect()
      const at = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2
      const off = Math.min(...mids[axis].map((mid) => Math.abs(mid - at)))
      lines[axis].push(Math.round(off * 10) / 10)
    }
    const gaps = []
    for (const a of kids) for (const b of kids) if (b !== a && overlapY(a, b) && b.left >= a.right - 1) gaps.push(b.left - a.right)
    out[id] = { children: kids.length, rows: tops.length, gap: gaps.length === 0 ? null : Math.round(Math.min(...gaps) * 10) / 10, x: lines.x, y: lines.y }
  }
  return out
})()`

type Lines = Record<string, { children: number; rows: number; gap: number | null; x: number[]; y: number[] }>

/** 배치 선마다 — 모서리 글과, 선 상자와 노드 상자(외곽선과 같은 `data-wb-focus` 상자 · 호스트 좌표)의 네 변 차 최대(px). */
const GUIDES = `(() => {
  const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')
  const f = iframe.getBoundingClientRect()
  const zoom = f.width / iframe.offsetWidth
  const doc = iframe.contentDocument
  const out = {}
  for (const guide of document.querySelectorAll('[data-wb-guide-for]')) {
    const id = guide.getAttribute('data-wb-guide-for')
    const node = [...doc.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === id)
    const focus = node === undefined ? undefined : ([...node.querySelectorAll('[data-wb-focus]')].find((el) => el.closest('[data-wb-id]') === node) ?? node)
    const g = guide.getBoundingClientRect()
    let off = null
    if (focus !== undefined) {
      const r = focus.getBoundingClientRect()
      const left = f.left + r.left * zoom, top = f.top + r.top * zoom
      off = Math.round(Math.max(Math.abs(g.left - left), Math.abs(g.top - top), Math.abs(g.right - (left + r.width * zoom)), Math.abs(g.bottom - (top + r.height * zoom))) * 10) / 10
    }
    out[id] = { label: guide.getAttribute('data-wb-guide'), off }
  }
  return out
})()`

type Guides = Record<string, { label: string; off: number | null }>

describe.skipIf(!전제.ok)('배치 선 — 실브라우저', () => {
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

  async function fixture(slug: string, theme: string, nodes: readonly unknown[] = NODES, tokens: Record<string, string> = {}): Promise<{ P: string }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'F1 배치 선', slug: `${slug}-${Date.now().toString(36)}` })).body
    if (theme !== 'system-admin' || Object.keys(tokens).length > 0) await putTheme(call, project.id, { themeId: theme, version: '1.0.0', tokens })
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
    const P = `/projects/${project.id}/pages/${page.id}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P }
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_grid0000001"]').waitFor()
    return { page, close: () => context.close() }
  }

  async function guides(page: Page, done: (value: Guides) => boolean = (value) => GUIDED.every((id) => value[id] !== undefined)): Promise<Guides> {
    // 다시 잼은 다음 프레임에 선다(레이아웃 이펙트 · iframe 의 `ResizeObserver`) — 판이 선 뒤 한 번 더 읽어 같은 값인지 본다.
    return poll('배치 선', async () => (await page.evaluate(GUIDES)) as Guides, done, 5_000).catch(async () => (await page.evaluate(GUIDES)) as Guides)
  }

  function worst(value: Guides): number {
    return Math.max(0, ...GUIDED.map((id) => value[id]?.off ?? 99))
  }

  async function zoomTo(page: Page, steps: number): Promise<void> {
    const name = steps < 0 ? '축소' : '확대'
    for (let i = 0; i < Math.abs(steps); i += 1) await page.getByRole('group', { name: '줌' }).getByRole('button', { name, exact: true }).click()
    await page.waitForTimeout(150)
  }

  it.each(THEMES)('%s — 선이 줌 0.5 · 1 · 1.5 · 칸 스크롤 · 뷰포트 폭에서 노드 상자에 맞고, 모서리 글이 그려진 배치다', async (theme) => {
    const { P } = await fixture(`guides-${theme}`, theme)
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      const at1 = await guides(page)
      await zoomTo(page, -2)
      const at05 = await guides(page)
      await zoomTo(page, 4)
      const at15 = await guides(page)
      // 칸 스크롤은 줌 1.5 에서 — 문서가 짧은 테마(portal)도 칸보다 길어진다.
      await page.evaluate(() => {
        const canvas = document.querySelector('main.wb-shell-canvas') as HTMLElement
        canvas.scrollTop = 400
      })
      const scrolledBy = await page.evaluate(() => (document.querySelector('main.wb-shell-canvas') as HTMLElement).scrollTop)
      const scrolled = await guides(page)
      await zoomTo(page, -2)
      await page.getByLabel('뷰포트 폭').selectOption('375')
      const narrow = await guides(page)
      // eslint-disable-next-line no-console
      console.log(
        `[배치 선] ${theme}: 글 ${JSON.stringify(Object.fromEntries(GUIDED.map((id) => [id, at1[id]?.label])))} · 375 ${JSON.stringify(Object.fromEntries(GUIDED.map((id) => [id, narrow[id]?.label])))} · 차 최대 1=${worst(at1)} 0.5=${worst(at05)} 1.5=${worst(at15)} 스크롤(${scrolledBy})=${worst(scrolled)} 375=${worst(narrow)}`,
      )

      expect({
        labels: [at1['n_flxr0000001']?.label, at1['n_flxc0000001']?.label, at1['n_grid0000001']?.label],
        offs: [worst(at1), worst(at05), worst(at15), worst(scrolled), worst(narrow)].map((off) => off <= 1),
        scrolled: scrolledBy > 0,
      }).toEqual({ labels: ['→', '↓', '3열'], offs: [true, true, true, true, true], scrolled: true })
    } finally {
      await close()
    }
  })

  it('남이 Flex 를 세로로 바꾸면 그 선의 글이 «↓»가 되고 선이 새 상자에 맞는다', async () => {
    const { P } = await fixture('guides-remote', 'system-admin')
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      await guides(page)
      const frameHeight = () => page.evaluate(() => (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLElement).offsetHeight)
      // 형제 차례만 바꾼다 — 문서 높이가 그대로라 iframe 이 다시 재지 않는다(그 신호에 기대지 않고 남의 편집으로 다시 잰다).
      const heightBefore = await frameHeight()
      const swapped = await stack.request(alice, 'PATCH', `${P}/ops`, {
        baseSeq: (await stack.request(alice, 'GET', P)).body.headSeq as number,
        ops: [{ op: 'move', from: '/root/children/1', path: '/root/children/0' }],
      })
      expect(swapped.status).toBeLessThan(300)
      await canvasFrame(page).locator('[data-wb-id]').nth(1).and(canvasFrame(page).locator('[data-wb-id="n_flxc0000001"]')).waitFor()
      await page.waitForTimeout(300)
      const afterSwap = await guides(page)
      const heightAfter = await frameHeight()

      const changed = await stack.request(alice, 'PATCH', `${P}/ops`, {
        baseSeq: (await stack.request(alice, 'GET', P)).body.headSeq as number,
        ops: [{ op: 'replace', path: '/root/children/1/props/direction', value: 'column' }],
      })
      expect(changed.status).toBeLessThan(300)
      const after = await guides(page, (value) => value['n_flxr0000001']?.label === '↓')
      expect({ sameHeight: heightAfter === heightBefore, swapped: worst(afterSwap) <= 1, label: after['n_flxr0000001']?.label, off: worst(after) <= 1 }).toEqual({
        sameHeight: true,
        swapped: true,
        label: '↓',
        off: true,
      })
    } finally {
      await close()
    }
  })

  it('컴포넌트 카드를 끄는 동안 미리보기 노드에는 선이 없고, 밀린 형제의 선은 새 자리에 맞고, 안쪽 선은 미리보기를 안 센다', async () => {
    const { P } = await fixture('guides-preview', 'system-admin')
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      const before = await guides(page)
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Flex')
      const card = (await page.locator('[data-wb-palette-card="Flex"]').boundingBox())!
      const target = (await canvasFrame(page).locator('[data-wb-id="n_flxr0000001"]').boundingBox())!
      await page.mouse.move(card.x + card.width / 2, card.y + 40)
      await page.mouse.down()
      await page.mouse.move(card.x + card.width / 2 + 10, card.y + 30, { steps: 3 })
      await page.mouse.move(target.x + 20, target.y + 3, { steps: 10 })
      await poll('미리보기', () => page.evaluate(() => document.querySelector('[data-wb-preview]') !== null), (shown) => shown, 5_000)
      const during = await guides(page, (value) => (value['n_flxr0000001']?.off ?? 99) <= 1)
      const previewGuides = await page.evaluate(() =>
        [...document.querySelectorAll('[data-wb-guide-for]')].map((guide) => guide.getAttribute('data-wb-guide-for') ?? '').filter((id) => id.startsWith('wb:preview:')),
      )
      const previewNodes = await canvasFrame(page).locator('[data-wb-id^="wb:preview:"]').count()
      // 가로 Flex 의 가운데 자식 위로 옮겨 미리보기를 그 Flex 안에 세운다 — 안쪽 선은 미리보기를 안 세어 진짜 자식 셋 사이의 둘이다.
      const middle = (await canvasFrame(page).locator('[data-wb-id="n_r2"]').boundingBox())!
      await page.mouse.move(middle.x + middle.width * 0.9, middle.y + middle.height / 2, { steps: 5 })
      const previewInRow = await poll(
        '가로 Flex 안의 미리보기',
        () => canvasFrame(page).locator('[data-wb-id="n_flxr0000001"] [data-wb-id^="wb:preview:"]').count(),
        (count) => count > 0,
        5_000,
      ).catch(() => 0)
      await page.waitForTimeout(150)
      const rowLines = await page.locator('[data-wb-guide-for="n_flxr0000001"] [data-wb-guide-line]').count()
      await page.keyboard.press('Escape')
      await page.mouse.up()
      expect({ previewNodes: previewNodes > 0, previewInRow, rowLines, previewGuides, aligned: worst(during) <= 1, before: worst(before) <= 1 }).toEqual({
        previewNodes: true,
        previewInRow: 1,
        rowLines: 2,
        previewGuides: [],
        aligned: true,
        before: true,
      })
    } finally {
      await close()
    }
  })

  it('뷰 모드에는 단추 · 선이 없고, 새로 고친 뒤에도 켠 채다', async () => {
    const { P } = await fixture('guides-mode', 'system-admin')
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      await guides(page)
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.waitForTimeout(200)
      const view = {
        toggle: await page.getByRole('button', { name: '배치 선', exact: true }).count(),
        lines: await page.locator('[data-wb-guide-for]').count(),
      }
      await page.getByRole('button', { name: '편집 모드' }).click()
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_grid0000001"]').waitFor()
      const reloaded = await guides(page)
      expect({
        view,
        pressed: await page.getByRole('button', { name: '배치 선', exact: true }).getAttribute('aria-pressed'),
        lines: Object.keys(reloaded).length,
      }).toEqual({ view: { toggle: 0, lines: 0 }, pressed: 'true', lines: 4 })
    } finally {
      await close()
    }
  })

  /** 판마다 — 선 수가 기대와 같은가 · 가장 큰 차(px). 기대가 어긋나면 그 판의 값을 그대로 돌려준다. `override` 는 판을 바꾼 뒤의 기대다. */
  function judge(value: Lines, override: typeof LINE_COUNTS = {}): { counts: Record<string, string>; worst: number } {
    const counts: Record<string, string> = {}
    let off = 0
    for (const [id, expected] of Object.entries({ ...LINE_COUNTS, ...override })) {
      const got = value[id]
      if (got === undefined) {
        counts[id] = '선 없음'
        continue
      }
      const want = expected === 'wrap' ? { x: got.children - got.rows, y: got.rows - 1 } : expected
      counts[id] = got.x.length === want.x && got.y.length === want.y ? 'ok' : `x ${got.x.length}/${want.x} · y ${got.y.length}/${want.y}`
      off = Math.max(off, ...got.x, ...got.y)
    }
    return { counts, worst: off }
  }

  async function lines(page: Page, override: typeof LINE_COUNTS = {}): Promise<Lines> {
    const done = (value: Lines) => Object.values(judge(value, override).counts).every((count) => count === 'ok')
    return poll('안쪽 선', async () => (await page.evaluate(LINES)) as Lines, done, 5_000).catch(async () => (await page.evaluate(LINES)) as Lines)
  }

  const allOk = Object.fromEntries(Object.keys(LINE_COUNTS).map((id) => [id, 'ok']))

  /**
   * 줌 0.5 · 1 · 1.5 · 칸 스크롤 · 뷰포트 375 · 남의 편집(가로 Flex 의 자식 하나를 지움 — 노드 상자는 그대로라 상자만 보는 다시 잼은 옛 선을
   * 남긴다) 뒤에 잰다. «간격 0» 판은 간격 단위 토큰을 0 으로 둔 관리 테마다 — 칸이 맞닿아 선이 경계에 서고, 맞닿은 두 상자를 한 묶음으로
   * 잇는 판정(`layout-guides.tsx` 의 `TOUCH`)이 무너지면 선이 빠진다.
   */
  it.each([...THEMES.map((theme) => [theme, theme, {}] as const), ['system-admin · 간격 0', 'system-admin', { 'space.unit': '0px' }] as const])('%s — Grid 의 열 · 행 사이 · Flex 의 자식 사이 · 줄 사이에 선이 서고, 줌 · 칸 스크롤 · 뷰포트 폭 · 남의 편집 뒤에도 이웃 자식 사이 간격의 가운데와 1px 안이다', async (name, theme, tokens) => {
    const { P } = await fixture(`lines-${theme}-${Object.keys(tokens).length}`, theme, LINE_NODES, tokens)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_fone"]').waitFor()
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      const at1 = await lines(page)
      await zoomTo(page, -2)
      const at05 = await lines(page)
      await zoomTo(page, 4)
      const at15 = await lines(page)
      await page.evaluate(() => {
        ;(document.querySelector('main.wb-shell-canvas') as HTMLElement).scrollTop = 400
      })
      const scrolledBy = await page.evaluate(() => (document.querySelector('main.wb-shell-canvas') as HTMLElement).scrollTop)
      const scrolled = await lines(page)
      await zoomTo(page, -2)
      await page.getByLabel('뷰포트 폭').selectOption('375')
      const narrow = await lines(page)
      await page.getByLabel('뷰포트 폭').selectOption('1440')
      await lines(page)
      const removed = await stack.request(alice, 'PATCH', `${P}/ops`, {
        baseSeq: (await stack.request(alice, 'GET', P)).body.headSeq as number,
        ops: [{ op: 'remove', path: '/root/children/3/children/2' }],
      })
      expect(removed.status).toBeLessThan(300)
      const remote = await lines(page, { n_frow: { x: 1, y: 0 } })
      const judged = { 1: judge(at1), 0.5: judge(at05), 1.5: judge(at15), scrolled: judge(scrolled), 375: judge(narrow), remote: judge(remote, { n_frow: { x: 1, y: 0 } }) }
      // eslint-disable-next-line no-console
      console.log(
        `[안쪽 선] ${name}: 줄바꿈 줄 1440=${at1['n_fwrap']?.rows} 375=${narrow['n_fwrap']?.rows} · 칸 사이 간격(가장 좁은 · px) ${JSON.stringify(
          Object.fromEntries(Object.entries(at1).map(([id, v]) => [id, v.gap])),
        )} · 차 최대 ${Object.entries(judged).map(([name, j]) => `${name}=${j.worst}`).join(' ')} · 수(세로/가로) ${JSON.stringify(
          Object.fromEntries(Object.entries(at1).map(([id, v]) => [id, `${v.x.length}/${v.y.length}`])),
        )}`,
      )
      const wrap = at1['n_fwrap']
      expect({
        wrapped: wrap !== undefined && wrap.rows >= 2 && wrap.rows < wrap.children,
        scrolled: scrolledBy > 0,
        counts: Object.values(judged).map((j) => j.counts),
        offs: Object.values(judged).map((j) => j.worst <= 1),
      }).toEqual({
        wrapped: true,
        scrolled: true,
        counts: Object.values(judged).map(() => allOk),
        offs: Object.values(judged).map(() => true),
      })
    } finally {
      await context.close()
    }
  })

  /**
   * **다시 잼 비용** — 자식 50 · 100 · 200 · 400 의 Grid(10열)에서 노드 하나의 판정(`guideOf` — 모서리 글 · 안쪽 선) 한 번의 시간(서른 번 묶음 다섯의 중앙값)과,
   * 줌을 한 단계 바꾼 뒤 렌더 · 레이아웃 이펙트가 끝날 때까지의 시간을 배치 선을 켠 판 · 끈 판으로 견준 중앙값(자식 200 하나만 둔 페이지 · 10번)이다. 판정은 vite
   * dev 의 모듈을 불러 재므로 운영 번들(`EDITOR_STACK_BUNDLE=build`)에서는 건너뛰고 그렇다고 적는다. 값은 `[다시 잼]` 로그다 — 기계마다 달라
   * 상한을 단언하지 않는다. 단언은 200 판의 선 수(세로 9 · 가로 19)와 잰 값이 섰는지다.
   */
  it('자식 수백의 Grid — 선 수가 맞고, 다시 잼 한 번의 시간을 적는다', async () => {
    const SIZES = [50, 100, 200, 400]
    const grid = (size: number) => ({ id: `n_big${size}`, type: 'Grid', props: { columns: 10 }, children: texts(`big${size}_`, size, (index) => `칸 ${index}`) })
    const { P } = await fixture('lines-cost', 'system-admin', SIZES.map(grid))
    const { P: P200 } = await fixture('lines-cost-200', 'system-admin', [grid(200)])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_big400"]').waitFor()
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      const counted = await poll(
        '200 판의 선',
        () => page.evaluate(() => {
          const guide = document.querySelector('[data-wb-guide-for="n_big200"]')
          return guide === null ? null : { x: guide.querySelectorAll('[data-wb-guide-line="x"]').length, y: guide.querySelectorAll('[data-wb-guide-line="y"]').length }
        }),
        (value) => value !== null && value.x === 9 && value.y === 19,
        5_000,
      ).catch(() => null)
      // 글로 넘긴다 — 함수로 넘기면 vitest 가 안의 `import()` 를 제 것(`__vite_ssr_dynamic_import__`)으로 바꿔 페이지에서 죽는다.
      const judged = (await page.evaluate(`(async (input) => {
        let mod
        try {
          mod = await import(location.origin + '/src/canvas/layout-guides.tsx')
        } catch {
          return null
        }
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')
        const doc = iframe.contentDocument
        const out = {}
        for (const node of input) {
          const element = [...doc.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === node.id)
          // 한 번은 시계의 눈금(0.1ms)보다 짧아 서른 번을 한꺼번에 재 나눈다 — 다섯 묶음의 중앙값.
          const batches = []
          for (let b = 0; b < 5; b += 1) {
            const started = performance.now()
            for (let i = 0; i < 30; i += 1) mod.guideOf(node, element, iframe.contentWindow)
            batches.push((performance.now() - started) / 30)
          }
          batches.sort((a, b) => a - b)
          out[node.children.length] = Math.round(batches[2] * 1000) / 1000
        }
        return out
      })(${JSON.stringify(SIZES.map(grid))})`)) as Record<number, number> | null

      await page.goto(P200)
      await canvasFrame(page).locator('[data-wb-id="n_big200"]').waitFor()
      /** 줌 단추를 누른 뒤 렌더 · 커밋 · 레이아웃 이펙트(배치 선의 다시 잼)가 끝난 다음 작업까지의 시간 — 10번(확대 · 축소를 번갈아) 중앙값(ms). */
      const frame = () =>
        page.evaluate(async () => {
          const runs: number[] = []
          for (let i = 0; i < 10; i += 1) {
            const name = i % 2 === 0 ? '확대' : '축소'
            const button = [...document.querySelectorAll('[role="group"][aria-label="줌"] button')].find((el) => el.getAttribute('aria-label') === name || el.textContent === name) as HTMLElement
            const started = performance.now()
            button.click()
            await new Promise((resolve) => setTimeout(resolve, 0))
            runs.push(performance.now() - started)
          }
          runs.sort((a, b) => a - b)
          return Math.round(runs[5]! * 10) / 10
        })
      const on = await frame()
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      const off = await frame()
      // eslint-disable-next-line no-console
      console.log(`[다시 잼] 판정 하나(중앙값 ms · 자식 수별) ${judged === null ? '운영 번들 — 건너뜀' : JSON.stringify(judged)} · 줌 한 단계 → 렌더 · 다시 잼 끝(자식 200 · 중앙값 ms) 켬 ${on} · 끔 ${off}`)
      expect({ counted, judged: judged === null || Object.values(judged).every((ms) => ms >= 0), frames: on > 0 && off > 0 }).toEqual({
        counted: { x: 9, y: 19 },
        judged: true,
        frames: true,
      })
    } finally {
      await context.close()
    }
  })
})
