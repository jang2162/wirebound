/**
 * **컴포넌트 목록의 줄바꿈 배치를 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «컴포넌트 목록» · `src/palette/component-palette.tsx` 의
 * `PaletteCards` · `src/palette/palette-thumbs.tsx`). jsdom 은 배치가 없어 «카드가 판 폭에 맞춰 감싸인다 · 판 높이를 따라 안 는다 · 축소판이
 * 카드 창에 맞는다»를 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 창 1440 · 900 · 700 — 카드 여러 줄 | 카드가 한 줄에 늘어서 가로로 넘친다 · 판 높이(최소 · 기본 · 최대)를 바꾸면 카드 크기가 바뀐다 · 창 1440×900 의 최대 판에서 두 줄이 다 안 보인다 |
 * | 축소판이 카드 창에 맞는다 | 카드 판을 처음 · 가운데 · 끝까지 세로로 민 판 · 검색으로 카드 수가 바뀐 판에서 표본 중심과 창 중심이 1px 넘게 어긋난다 · 표본이 창 밖이다 |
 * | 아래 줄 카드 — 휠 · «넣기» · 끌기 | 휠로 카드 판이 안 밀린다 · 끝까지 민 판의 마지막 카드 «넣기»가 넣지 않는다 · 아래 줄 카드를 캔버스에 끌어 놓은 노드가 서버 문서에 없다 |
 *
 * **잰 값**(창 1440×900 · 사이드바 기본 · 검색 «e»): 한 줄 카드 수 · 판 높이마다 보이는 줄 · 표본 중심 차 최대 · 세로로 긴 표본(`KeyValue` ·
 * `Media`)의 줄임 비를 `[목록 줄바꿈]` 로그로 낸다. 다시 재는 법: `pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/palette-wrap.test.ts`.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/**
 * 카드마다 크기 · 자리(트랙 기준)와, 그 창 중심과 축소판 표본 노드 중심의 차(px) — 표본이 안 섰으면 `null`. `inside` 는 표본 노드가 창 안이고
 * 창이 iframe 상자 · 깔개 상자 안이다(잘리지 않는다).
 */
const CARDS = `(() => {
  const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
  const f = iframe === null ? null : iframe.getBoundingClientRect()
  const doc = iframe === null ? null : iframe.contentDocument
  const track = document.querySelector('.wb-shell-palette-track').getBoundingClientRect()
  // 표본은 iframe 상자 · 깔개 상자(\`overflow: hidden\`) 밖이면 잘려 안 보인다 — 창이 둘 안에 들어야 «선다».
  const clip = document.querySelector('.wb-shell-palette-thumbs').getBoundingClientRect()
  const within = (w, r) => r !== null && w.left >= r.left - 1 && w.top >= r.top - 1 && w.right <= r.right + 1 && w.bottom <= r.bottom + 1
  const out = []
  for (const card of document.querySelectorAll('[data-wb-palette-card]')) {
    const type = card.getAttribute('data-wb-palette-card')
    const c = card.getBoundingClientRect()
    const w = card.querySelector('[data-wb-palette-window]').getBoundingClientRect()
    const wrapper = doc === null ? null : doc.querySelector('[data-wb-palette-thumb="' + type + '"]')
    const nodeId = wrapper === null ? null : wrapper.getAttribute('data-wb-palette-node')
    const node = wrapper === null ? null : [...wrapper.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === nodeId)
    let dx = null, dy = null, inside = false, scale = null
    if (node !== undefined && node !== null && getComputedStyle(wrapper).visibility === 'visible') {
      const n = node.getBoundingClientRect()
      const left = f.left + n.left, top = f.top + n.top
      dx = Math.round((left + n.width / 2 - (w.left + w.width / 2)) * 10) / 10
      dy = Math.round((top + n.height / 2 - (w.top + w.height / 2)) * 10) / 10
      inside = left >= w.left - 1 && top >= w.top - 1 && left + n.width <= w.right + 1 && top + n.height <= w.bottom + 1 && within(w, f) && within(w, clip)
      const m = /scale\\(([0-9.]+)\\)/.exec(wrapper.style.transform)
      scale = m === null ? null : Math.round(Number(m[1]) * 100) / 100
    }
    out.push({ type, left: Math.round(c.left - track.left), top: Math.round(c.top - track.top), width: Math.round(c.width), height: Math.round(c.height), dx, dy, inside, scale })
  }
  return out
})()`

interface Card {
  type: string
  left: number
  top: number
  width: number
  height: number
  dx: number | null
  dy: number | null
  inside: boolean
  scale: number | null
}

describe.skipIf(!전제.ok)('컴포넌트 목록 줄바꿈 — 실브라우저', () => {
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

  async function fixture(slug: string): Promise<{ P: string }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: 'F1 목록', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
    const P = `/projects/${project.id}/pages/${page.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    return { P }
  }

  async function open(P: string, size: { width: number; height: number }): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: size })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    return { page, close: () => context.close() }
  }

  async function cards(page: Page): Promise<Card[]> {
    return poll(
      '축소판이 선다',
      async () => (await page.evaluate(CARDS)) as Card[],
      (list) => list.length > 0 && list.every((card) => card.dx !== null),
      5_000,
    ).catch(async () => (await page.evaluate(CARDS)) as Card[])
  }

  /** 판 높이를 손잡이 키로 — `Home` 최소 · `End` 최대 · `Enter`(되돌림)는 기본. */
  async function paletteHeight(page: Page, key: 'Home' | 'End'): Promise<number> {
    await page.getByRole('separator', { name: '컴포넌트 목록 높이' }).focus()
    await page.keyboard.press(key)
    await page.waitForTimeout(200)
    return page.evaluate(() => Math.round(document.querySelector('.wb-shell-palette')!.getBoundingClientRect().height))
  }

  /** 스크롤 상자 안에 다 보이는 카드 줄 수. */
  async function wholeRows(page: Page): Promise<number> {
    return page.evaluate(() => {
      const box = document.querySelector('.wb-shell-palette-cards')!.getBoundingClientRect()
      const tops = new Set<number>()
      for (const card of document.querySelectorAll('[data-wb-palette-card]')) {
        const c = card.getBoundingClientRect()
        if (c.top >= box.top - 0.5 && c.bottom <= box.bottom + 0.5) tops.add(Math.round(c.top))
      }
      return tops.size
    })
  }

  async function overflow(page: Page): Promise<{ x: number; y: number }> {
    return page.evaluate(() => {
      const box = document.querySelector('.wb-shell-palette-cards') as HTMLElement
      return { x: box.scrollWidth - box.clientWidth, y: box.scrollHeight - box.clientHeight }
    })
  }

  async function scrollTo(page: Page, where: 'start' | 'middle' | 'end'): Promise<void> {
    await page.evaluate((at) => {
      const box = document.querySelector('.wb-shell-palette-cards') as HTMLElement
      box.scrollTop = at === 'start' ? 0 : at === 'middle' ? (box.scrollHeight - box.clientHeight) / 2 : box.scrollHeight
    }, where)
    await page.waitForTimeout(100)
  }

  /** 카드 크기 — 모두 같으면 `[폭, 높이]`, 갈리면 갈린 값 전부. 폭이 판에 맞게 준 판(264 미만)은 폭을 -1 로 적는다. */
  function sizesOf(list: readonly Card[]): (number | string)[] {
    const sizes = [...new Set(list.map((card) => `${card.width < 264 ? -1 : card.width}×${card.height}`))]
    return sizes.length === 1 ? sizes[0]!.split('×').map(Number) : sizes
  }

  function worst(list: readonly Card[]): number {
    return Math.max(0, ...list.map((card) => Math.max(Math.abs(card.dx ?? 99), Math.abs(card.dy ?? 99))))
  }

  // `maxRows` — 판 최대에서 다 보이는 줄. 창 700 높이는 판 최대가 캔버스 몫(`CANVAS_MIN_HEIGHT`)에 눌려 둘째 줄을 못 들인다 — 그 판은 세로
  // 스크롤로 본다(재는 값은 로그).
  it.each([
    { width: 1440, height: 900, maxRows: 2 as number | null, cardWidth: 264 },
    { width: 900, height: 700, maxRows: null, cardWidth: 264 },
    // 판이 카드보다 좁다 — 카드 폭이 판에 맞게 준다(`max-width: 100%` — 높이는 그대로).
    { width: 700, height: 700, maxRows: null, cardWidth: -1 },
  ])(
    '창 $width×$height — 카드가 판 폭에 맞춰 여러 줄로 감싸이고, 판 높이를 바꿔도 카드 크기는 그대로 · 축소판은 카드 창에 맞는다',
    async (size) => {
      const { P } = await fixture(`wrap-${size.width}`)
      const { page, close } = await open(P, size)
      try {
        await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('e')
        const base = await cards(page)
        const tops = [...new Set(base.map((card) => card.top))]
        const perRow = tops.map((top) => base.filter((card) => card.top === top).length)
        const atDefault = {
          height: await page.evaluate(() => Math.round(document.querySelector('.wb-shell-palette')!.getBoundingClientRect().height)),
          rows: await wholeRows(page),
        }
        const scroll = await overflow(page)

        const off: string[] = []
        let centre = 0
        for (const at of ['start', 'middle', 'end'] as const) {
          await scrollTo(page, at)
          const list = await cards(page)
          off.push(...list.filter((card) => !card.inside).map((card) => `${card.type}@${at}`))
          centre = Math.max(centre, worst(list))
        }

        const maxHeight = await paletteHeight(page, 'End')
        const atMax = { height: maxHeight, rows: await wholeRows(page), sizes: sizesOf(await cards(page)) }
        const minHeight = await paletteHeight(page, 'Home')
        const atMin = { height: minHeight, sizes: sizesOf(await cards(page)) }

        // 검색으로 카드 수가 바뀐 판 — 다시 맞는다.
        await paletteHeight(page, 'End')
        await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('a')
        const searched = await cards(page)
        const tall = Object.fromEntries(
          base.filter((card) => card.type === 'KeyValue' || card.type === 'Media').map((card) => [card.type, card.scale]),
        )
        const scales = base.map((card) => card.scale ?? 0).sort((a, b) => a - b)
        // eslint-disable-next-line no-console
        console.log(
          `[목록 줄바꿈] 창 ${size.width}×${size.height}: 카드 ${base.length} · 줄마다 ${JSON.stringify(perRow)} · 기본 ${JSON.stringify(atDefault)} · 최대 ${JSON.stringify(atMax)} · 최소 ${JSON.stringify(atMin)} · 중심 차 최대 ${centre} · 검색 «a» ${searched.length}장 차 ${worst(searched)} · 줄임 비 가운데 ${scales[Math.floor(scales.length / 2)]} · 세로로 긴 표본 ${JSON.stringify(tall)}`,
        )

        expect({
          rows: tops.length > 1,
          sizes: sizesOf(base),
          overflowX: scroll.x,
          scrolls: scroll.y > 0 || atMax.rows >= tops.length,
          notFewerWhenTaller: atMax.rows >= atDefault.rows,
          maxRows: size.maxRows === null ? null : atMax.rows,
          maxSizes: atMax.sizes,
          minSizes: atMin.sizes,
          off,
          centre: centre <= 1,
          searched: searched.length > 0 && searched.length !== base.length && searched.every((card) => card.inside) && worst(searched) <= 1,
        }).toEqual({
          rows: true,
          sizes: [size.cardWidth, 200],
          overflowX: 0,
          scrolls: true,
          notFewerWhenTaller: true,
          maxRows: size.maxRows,
          maxSizes: [size.cardWidth, 200],
          minSizes: [size.cardWidth, 200],
          off: [],
          centre: true,
          searched: true,
        })
      } finally {
        await close()
      }
    },
  )

  it('끝까지 민 판의 아래 줄 카드 — «넣기»가 넣고, 끌어 캔버스에 놓아도 넣는다', async () => {
    const { P } = await fixture('wrap-bottom')
    const { page, close } = await open(P, { width: 1440, height: 900 })
    try {
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('e')
      // 사람의 휠로 민다 — 스크롤 상자가 아니면(`overflow-y: hidden`) 코드의 `scrollTop` 은 서도 휠은 안 민다.
      const cardsBox = (await page.locator('.wb-shell-palette-cards').boundingBox())!
      await page.mouse.move(cardsBox.x + cardsBox.width / 2, cardsBox.y + cardsBox.height / 2)
      await page.mouse.wheel(0, 400)
      const wheeled = await poll(
        '휠로 밀림',
        () => page.evaluate(() => document.querySelector('.wb-shell-palette-cards')!.scrollTop),
        (top) => top > 0,
        2_000,
      ).catch(() => 0)
      await scrollTo(page, 'end')
      const list = await cards(page)
      const bottom = Math.max(...list.map((card) => card.top))
      const last = list.filter((card) => card.top === bottom).at(-1)!
      const first = list.filter((card) => card.top === bottom)[0]!
      expect(bottom).toBeGreaterThan(0)

      await page
        .locator(`[data-wb-palette-card="${last.type}"]`)
        .getByRole('button', { name: / 넣기$/ })
        .click()
      const added = await poll(
        '넣은 노드',
        async () => ((await stack.request(alice, 'GET', P)).body.schema.root.children as { type: string }[]).map((node) => node.type),
        (types) => types.includes(last.type),
        5_000,
      ).catch(() => [] as string[])

      const card = (await page.locator(`[data-wb-palette-card="${first.type}"]`).boundingBox())!
      const target = (await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').boundingBox())!
      await page.mouse.move(card.x + card.width / 2, card.y + 40)
      await page.mouse.down()
      await page.mouse.move(card.x + card.width / 2 + 10, card.y + 30, { steps: 3 })
      await page.mouse.move(target.x + target.width / 2, target.y + target.height - 2, { steps: 10 })
      await page.waitForTimeout(150)
      await page.mouse.up()
      const dragged = await poll(
        '끌어 놓은 노드',
        async () => ((await stack.request(alice, 'GET', P)).body.schema.root.children as { type: string }[]).map((node) => node.type),
        (types) => types.filter((type) => type === first.type).length >= (first.type === last.type ? 2 : 1),
        5_000,
      ).catch(() => [] as string[])

      expect({ wheeled: wheeled > 0, added: added.includes(last.type), dragged: dragged.includes(first.type) }).toEqual({
        wheeled: true,
        added: true,
        dragged: true,
      })
    } finally {
      await close()
    }
  })
})
