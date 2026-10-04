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
 *
 * 테마마다 그 판의 모서리 글(빈 Flex · 좁은 뷰포트 375 의 Grid 포함)을 `[배치 선]` 로그로 낸다.
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

  async function fixture(slug: string, theme: string): Promise<{ P: string }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'F1 배치 선', slug: `${slug}-${Date.now().toString(36)}` })).body
    if (theme !== 'system-admin') await putTheme(call, project.id, { themeId: theme, version: '1.0.0', tokens: {} })
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
    const P = `/projects/${project.id}/pages/${page.id}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: NODES.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })) })
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

  it('컴포넌트 카드를 끄는 동안 미리보기 노드에는 선이 없고, 밀린 형제의 선은 새 자리에 맞는다', async () => {
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
      await page.keyboard.press('Escape')
      await page.mouse.up()
      expect({ previewNodes: previewNodes > 0, previewGuides, aligned: worst(during) <= 1, before: worst(before) <= 1 }).toEqual({
        previewNodes: true,
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
})
