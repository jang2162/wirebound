/**
 * **겹치는 영역 표지는 깊이마다 한 줄씩 아래로 내려 쌓는다**(L-280 — `canvas/region-tag-stack.ts` · 뷰 모드 `canvas/state-badges.tsx` · 편집 모드 꼬리표
 * `canvas/canvas.tsx` 의 `regionMarks`).
 *
 * 영역이 영역의 직계 자식이면 두 영역의 상자가 같아(N19 `L-244`) 바깥 · 안쪽 표지가 같은 자리에 선다 — DOM 차례상 안쪽이 위라 바깥 표지는 포인터로 눌리지
 * 않았다. 성질: 둘 다 보이고(상자가 안 겹친다) 둘 다 눌린다(`elementFromPoint` · 실클릭이 그 영역의 가지 목록을 연다). 겹치지 않는 판(형제 영역)의 표지는 제
 * 자리에 그대로다 — 영역 상자 위 18px 에 붙은 자리(뷰 모드) · 16px(편집 모드).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '손님' }
const PAYMENT = { id: 's_pay', name: '결제' }

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const caseOf = (id: string, state: string, children: unknown[]) => ({ id, type: 'StateCase', props: { state }, children })
const region = (id: string, cases: unknown[]) => ({ id, type: 'StateSwitch', children: cases })

/** 바깥 영역의 기본 가지에 안쪽 영역 하나만 든다 — 두 영역의 상자가 같다. 가지 목록이 달라(관리자 · 손님) 어느 영역의 목록이 열렸는지 가른다. */
const NESTED = [
  text('n_out', '영역 밖 글'),
  region('n_sw', [
    caseOf('n_cd', 'default', [
      region('n_in', [caseOf('n_cdi', 'default', [text('n_dt', '안쪽 글')]), caseOf('n_cgi', GUEST.id, [text('n_gt', '손님 글')])]),
    ]),
    caseOf('n_ca', ADMIN.id, [text('n_at', '관리자 글')]),
  ]),
]

/** 셋이 겹친다 — 바깥 → 가운데 → 안쪽. */
const TRIPLE = [
  region('n_a', [
    caseOf('n_ad', 'default', [
      region('n_b', [
        caseOf('n_bd', 'default', [region('n_c', [caseOf('n_cd0', 'default', [text('n_dt', '가장 안쪽 글')])])]),
        caseOf('n_bg', GUEST.id, [text('n_bt', 'b 손님')]),
      ]),
    ]),
    caseOf('n_aa', ADMIN.id, [text('n_at', 'a 관리자')]),
  ]),
]

/** 영역 둘이 형제다 — 사이에 글이 있어 상자가 위아래로 떨어진다. 겹침이 없다. */
const SIBLINGS = [
  region('n_s1', [caseOf('n_s1d', 'default', [text('n_t1', '첫 영역 글')]), caseOf('n_s1a', ADMIN.id, [text('n_t1a', '첫 관리자')])]),
  text('n_mid', '가운데 글'),
  region('n_s2', [caseOf('n_s2d', 'default', [text('n_t2', '둘째 영역 글')]), caseOf('n_s2g', GUEST.id, [text('n_t2g', '둘째 손님')])]),
]

/** 바깥이 아주 낮다 — 안쪽 Divider 하나뿐인 영역이 표지 한 줄(18px)보다 낮다. 쌓은 표지 줄이 상자 밖으로 나간다. */
const LOW = [
  region('n_lo', [
    caseOf('n_lod', 'default', [region('n_li', [caseOf('n_lid', 'default', [{ id: 'n_sp', type: 'Divider' }])])]),
    caseOf('n_loa', ADMIN.id, [text('n_loat', '관리자')]),
  ]),
]

describe.skipIf(!전제.ok)('겹치는 영역 표지 — 실브라우저', () => {
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

  async function fixture(slug: string, nodes: unknown[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N36', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const ops: unknown[] = nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value }))
    ops.unshift({ op: 'add', path: '/viewStates', value: [ADMIN, GUEST, PAYMENT] })
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function open(P: string, viewport = { width: 1440, height: 900 }) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  interface Box {
    id: string
    left: number
    top: number
    width: number
    height: number
  }

  /** 뷰 모드 — 영역 상자와 표지 상자(화면 좌표). */
  async function viewBoxes(page: Page): Promise<{ regions: Box[]; badges: Box[] }> {
    return await page.evaluate(() => {
      const read = (selector: string, attr: string): Box[] =>
        [...document.querySelectorAll(selector)].map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          return { id: el.getAttribute(attr)!, left: r.left, top: r.top, width: r.width, height: r.height }
        })
      return {
        regions: read('[data-wb-state-region-for]', 'data-wb-state-region-for'),
        badges: read('[data-wb-state-badge-for]', 'data-wb-state-badge-for'),
      }
    })
  }

  /** 편집 모드 — 영역 상자와 꼬리표 상자. */
  async function editBoxes(page: Page): Promise<{ regions: Box[]; tags: Box[] }> {
    return await page.evaluate(() => {
      const regions: Box[] = []
      const tags: Box[] = []
      for (const el of document.querySelectorAll('[data-wb-region-for]')) {
        const r = (el as HTMLElement).getBoundingClientRect()
        const id = el.getAttribute('data-wb-region-for')!
        regions.push({ id, left: r.left, top: r.top, width: r.width, height: r.height })
        const t = el.querySelector('.wb-shell-region-tag')!.getBoundingClientRect()
        tags.push({ id, left: t.left, top: t.top, width: t.width, height: t.height })
      }
      return { regions, tags }
    })
  }

  const area = (a: Box, b: Box): number =>
    Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))

  const overlaps = (boxes: Box[]): string[] => {
    const out: string[] = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) if (area(boxes[i]!, boxes[j]!) > 0.5) out.push(`${boxes[i]!.id}×${boxes[j]!.id}`)
    }
    return out
  }

  const r1 = (n: number): number => Math.round(n * 10) / 10

  /** 그 표지 상자의 가운데를 겨눈 점이 그 표지에 닿는가 — `elementFromPoint`. */
  async function hitsOwn(page: Page, badges: Box[]): Promise<string[]> {
    return await page.evaluate(
      (items) =>
        items.map((item) => {
          const hit = document.elementFromPoint(item.left + item.width / 2, item.top + item.height / 2)
          return `${item.id}→${hit?.closest('[data-wb-state-badge-for]')?.getAttribute('data-wb-state-badge-for') ?? '-'}`
        }),
      badges,
    )
  }

  async function menuItems(page: Page, name: string): Promise<string[]> {
    await page.getByRole('button', { name, exact: true }).click()
    const items = await page.getByRole('menuitemradio').allTextContents()
    await page.keyboard.press('Escape')
    return items.map((label) => label.trim())
  }

  it('영역이 영역의 직계 자식 — 뷰 모드: 바깥 표지가 안쪽 표지 위 한 줄에 서고 둘 다 눌려 제 영역의 가지 목록을 연다', async () => {
    const P = await fixture('n36-nested-view', NESTED)
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.locator('[data-wb-state-badge-for="n_in"]').waitFor()
      await frames(page)
      const { regions, badges } = await viewBoxes(page)
      const seen = {
        regions: regions.map((r) => [r.id, r1(r.left), r1(r.top), r1(r.width), r1(r.height)]),
        badges: badges.map((b) => [b.id, r1(b.left), r1(b.top), r1(b.width), r1(b.height)]),
        겹침: overlaps(badges),
        누름: await hitsOwn(page, badges),
      }
      // eslint-disable-next-line no-console
      console.log(`[겹친 표지 · 뷰] ${JSON.stringify(seen)}`)
      // 판 카나리아 — 두 영역의 상자가 같다(N19 L-244).
      expect(regions).toHaveLength(2)
      expect(r1(regions[0]!.left)).toBe(r1(regions[1]!.left))
      expect(r1(regions[0]!.top)).toBe(r1(regions[1]!.top))
      expect(badges.map((b) => b.id)).toEqual(['n_sw', 'n_in'])
      // 성질 — 둘 다 보이고 둘 다 눌린다.
      expect(seen.겹침).toEqual([])
      expect(seen.누름).toEqual(['n_sw→n_sw', 'n_in→n_in'])
      // 안쪽은 바깥보다 정확히 표지 한 줄(높이) 아래다 — 바깥 자리는 그대로.
      const [outer, inner] = [badges[0]!, badges[1]!]
      expect(r1(inner.top - outer.top)).toBe(r1(outer.height))
      expect(r1(inner.left)).toBe(r1(outer.left))
      // 실클릭 — 바깥 표지가 바깥 영역의 가지 목록(기본 · 관리자)을 안쪽이 안쪽 목록(기본 · 손님)을 연다.
      expect(await menuItems(page, '상태에 따라 다름 1')).toEqual(['기본', ADMIN.name])
      expect(await menuItems(page, '상태에 따라 다름 2')).toEqual(['기본', GUEST.name])

      // 줌 — 표지는 줌을 걷어 화면에서 늘 같은 크기이고, 쌓는 한 줄도 화면에서 표지 높이다(표면 좌표에서는 1 / 줌).
      const zoomIn = page.getByRole('button', { name: '확대', exact: true })
      await zoomIn.click()
      await zoomIn.click()
      await frames(page)
      const zoomed = await viewBoxes(page)
      const zoomedSeen = { 겹침: overlaps(zoomed.badges), 누름: await hitsOwn(page, zoomed.badges) }
      // eslint-disable-next-line no-console
      console.log(
        `[겹친 표지 · 줌] ${JSON.stringify({ ...zoomedSeen, badges: zoomed.badges.map((b) => [b.id, r1(b.top), r1(b.height)]) })}`,
      )
      expect(zoomed.badges[0]!.height).toBeCloseTo(outer.height, 0)
      expect(zoomedSeen.겹침).toEqual([])
      expect(zoomedSeen.누름).toEqual(['n_sw→n_sw', 'n_in→n_in'])
      expect(r1(zoomed.badges[1]!.top - zoomed.badges[0]!.top)).toBeCloseTo(r1(zoomed.badges[0]!.height), 0)
    } finally {
      await close()
    }
  }, 120_000)

  it('영역이 영역의 직계 자식 — 편집 모드: 꼬리표 둘이 한 줄씩 어긋나 겹치지 않는다', async () => {
    const P = await fixture('n36-nested-edit', NESTED)
    const { page, close } = await open(P)
    try {
      await page.locator('[data-wb-region-for="n_in"]').waitFor()
      await frames(page)
      const { regions, tags } = await editBoxes(page)
      const seen = { tags: tags.map((t) => [t.id, r1(t.left), r1(t.top), r1(t.width), r1(t.height)]), 겹침: overlaps(tags) }
      // eslint-disable-next-line no-console
      console.log(`[겹친 표지 · 편집] ${JSON.stringify(seen)}`)
      expect(r1(regions[0]!.top)).toBe(r1(regions[1]!.top))
      expect(seen.겹침).toEqual([])
      expect(r1(tags[1]!.top - tags[0]!.top)).toBe(r1(tags[0]!.height))
    } finally {
      await close()
    }
  }, 120_000)

  it('셋이 겹친다 — 깊이마다 한 줄씩(0 · 1 · 2)이고 셋 다 눌린다', async () => {
    const P = await fixture('n36-triple', TRIPLE)
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.locator('[data-wb-state-badge-for="n_c"]').waitFor()
      await frames(page)
      const { badges } = await viewBoxes(page)
      const seen = {
        badges: badges.map((b) => [b.id, r1(b.left), r1(b.top), r1(b.width), r1(b.height)]),
        겹침: overlaps(badges),
        누름: await hitsOwn(page, badges),
      }
      // eslint-disable-next-line no-console
      console.log(`[셋 겹침 · 뷰] ${JSON.stringify(seen)}`)
      expect(badges.map((b) => b.id)).toEqual(['n_a', 'n_b', 'n_c'])
      expect(seen.겹침).toEqual([])
      expect(seen.누름).toEqual(['n_a→n_a', 'n_b→n_b', 'n_c→n_c'])
      const h = badges[0]!.height
      expect([0, 1, 2].map((k) => r1(badges[k]!.top - badges[0]!.top))).toEqual([0, r1(h), r1(2 * h)])
      // 가운데 영역의 목록이 바깥 · 안쪽과 갈린다(기본 · 손님) — 둘째 표지를 눌러 연다.
      expect(await menuItems(page, '상태에 따라 다름 2')).toEqual(['기본', GUEST.name])
    } finally {
      await close()
    }
  }, 120_000)

  it('겹치지 않는 판(형제 영역) — 표지는 제 자리(상자 바로 위)에 그대로다', async () => {
    const P = await fixture('n36-siblings', SIBLINGS)
    const { page, close } = await open(P)
    try {
      await page.locator('[data-wb-region-for="n_s2"]').waitFor()
      await frames(page)
      const edit = await editBoxes(page)
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.locator('[data-wb-state-badge-for="n_s2"]').waitFor()
      await frames(page)
      const view = await viewBoxes(page)
      const gaps = {
        편집: edit.tags.map((t, i) => r1(edit.regions[i]!.top - (t.top + t.height))),
        뷰: view.badges.map((b, i) => r1(view.regions[i]!.top - (b.top + b.height))),
      }
      // eslint-disable-next-line no-console
      console.log(`[형제 영역] ${JSON.stringify(gaps)}`)
      expect(edit.tags.map((t) => t.id)).toEqual(['n_s1', 'n_s2'])
      expect(view.badges.map((b) => b.id)).toEqual(['n_s1', 'n_s2'])
      // 표지 아랫끝이 상자 위끝에 붙는 자리 — 잰 값(편집 꼬리표는 테두리 1px 안쪽 -1 · 뷰 표지는 0)이 쌓기 전과 같다.
      expect(gaps.편집).toEqual([-1, -1])
      expect(gaps.뷰).toEqual([0, 0])
      expect(overlaps(edit.tags)).toEqual([])
      expect(overlaps(view.badges)).toEqual([])
    } finally {
      await close()
    }
  }, 120_000)

  it('바깥 상자가 표지 한 줄보다 낮다 — 안쪽 표지 줄이 상자 밖으로 나가도 둘 다 보이고 눌린다', async () => {
    const P = await fixture('n36-low', LOW)
    const { page, close } = await open(P)
    try {
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.locator('[data-wb-state-badge-for="n_li"]').waitFor()
      await frames(page)
      const { regions, badges } = await viewBoxes(page)
      const seen = {
        regions: regions.map((r) => [r.id, r1(r.top), r1(r.height)]),
        badges: badges.map((b) => [b.id, r1(b.top), r1(b.height)]),
        겹침: overlaps(badges),
        누름: await hitsOwn(page, badges),
      }
      // eslint-disable-next-line no-console
      console.log(`[낮은 바깥] ${JSON.stringify(seen)}`)
      expect(regions[0]!.height).toBeLessThan(badges[0]!.height)
      expect(seen.겹침).toEqual([])
      expect(seen.누름).toEqual(['n_lo→n_lo', 'n_li→n_li'])
    } finally {
      await close()
    }
  }, 120_000)
})
