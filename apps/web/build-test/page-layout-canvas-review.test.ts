/**
 * **캔버스 레이아웃 틀 — 리뷰 대응 판**(리뷰 `docs/superpowers/plans/2026-11-25-rv-lc-report.md` L2 · L3 · 설계
 * `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「캔버스」). 픽스처 · 점 고르기는 `./page-layout-canvas.test.ts` 의 것을 옮겼다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 | 혼자 죽는 변조 |
 * |---|---|---|
 * | 뷰 모드에서 틀 링크로 지금 페이지를 누름 | 이력이 한 칸 쌓인다(메뉴 트리 링크는 안 쌓는다 — 대조) · 다른 페이지 링크가 이력을 안 쌓는다(카나리아) | `canvas.tsx` 틀 이동의 «같은 주소면 replace» 를 뗌 |
 * | 짧은 팝업의 막 | 막이 캔버스 문서 높이를 다 안 덮는다 · 막 아래 바탕 점이 선다 · 문서 끝 띠를 누르면 고름이 풀린다 · 거기 놓으면 미리보기 · 편집이 선다 | `canvas.tsx` 기본 시트의 막 높이 규칙을 뗌 |
 * | 창보다 긴 팝업의 막 | 위와 같다 · 끌기 뒤 iframe 높이가 끌기 전과 다르다 | 막 높이를 `100vh` 로(끌기가 키운 높이가 안 준다) |
 *
 * 좌표 판은 줌 100%(`zoomToFull`)에서 재고, 누를 점은 셸의 맨 위가 캔버스 iframe 인 점으로 고른다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  shownDrops,
  startEditorStack,
  zoomToFull,
  type EditorStack,
  type Session,
} from './editor-stack'
import { LAYOUT_THEME, layoutTheme } from './layout-theme'
import { makeAdmin, uploadRaw, putTheme } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface Fixture {
  projectId: string
  first: string
  second: string
  popup: string
  blank: string
  path: (pageId: string) => string
}

const SEED = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
  { id: 'n_last', type: 'Text', props: { content: '끝' } },
]

/** 창(1000)보다 긴 팝업 — 글 마흔 줄. */
const TALL_POPUP = [
  { id: 'n_pop', type: 'Text', props: { content: '창 글' } },
  ...Array.from({ length: 40 }, (_, at) => ({ id: `n_row${at}`, type: 'Text', props: { content: `줄 ${at}` } })),
]

describe.skipIf(!전제.ok)('캔버스의 레이아웃 틀 — 리뷰 대응(실브라우저)', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    await makeAdmin(stack, stack.users.alice)
    expect(await uploadRaw(stack, alice, await layoutTheme())).toBe(201)
  }, 180_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function created(response: Promise<{ status: number; body: any }>, what: string): Promise<any> {
    const done = await response
    if (done.status !== 201) throw new Error(`픽스처 ${what} ${done.status} ${JSON.stringify(done.body)}`)
    return done.body
  }

  async function seed(pageId: string, projectId: string, nodes: readonly unknown[], root = '/root/children'): Promise<void> {
    const seeded = await call('PATCH', `/projects/${projectId}/pages/${pageId}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `${root}/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }

  /** 메뉴 «가»(첫째 · 둘째 · 창 · 빈쪽) · 메뉴 «나»(셋째) — 픽스처 테마로 고정한다. `popupSeed` 는 팝업 «창» 몸통의 노드다. */
  async function fixture(
    slug: string,
    popupSeed: readonly unknown[] = [{ id: 'n_pop', type: 'Text', props: { content: '창 글' } }],
  ): Promise<Fixture> {
    const theme = { themeId: LAYOUT_THEME.id, version: LAYOUT_THEME.version }
    const project = await created(
      call('POST', '/projects', { name: '레이아웃 판', slug: `${slug}-${Date.now().toString(36)}` }),
      '프로젝트',
    )
    await putTheme(call, project.id, { ...theme, tokens: {} })
    const menu = await created(call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' }), '메뉴')
    const other = await created(call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '나' }), '메뉴 나')
    const page = (title: string, layout: string, menuNodeId = menu.id) =>
      created(call('POST', `/projects/${project.id}/pages`, { menuNodeId, title, layout }), title)
    const first = await page('첫째', 'subpage')
    const second = await page('둘째', 'subpage')
    const popup = await page('창', 'popup')
    const blank = await page('빈쪽', 'blank')
    await page('셋째', 'subpage', other.id)
    await seed(first.id, project.id, SEED)
    await seed(blank.id, project.id, SEED)
    await seed(second.id, project.id, [{ id: 'n_two', type: 'Text', props: { content: '둘째 글' } }])
    await seed(popup.id, project.id, popupSeed)
    return {
      projectId: project.id,
      first: first.id,
      second: second.id,
      popup: popup.id,
      blank: blank.id,
      path: (pageId) => `/projects/${project.id}/pages/${pageId}`,
    }
  }

  async function open(path: string, wait = '[data-wb-layout-region="lnb"] a'): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 1000 } })
    await page.goto(path)
    await canvasFrame(page).locator(wait).first().waitFor({ state: 'attached' })
    await zoomToFull(page)
    return { page, close: () => context.close() }
  }

  /**
   * 누를 점 — 캔버스 문서의 `css` 첫 요소 상자를 4px 격자로 훑어, 셸의 맨 위가 캔버스 iframe 이고 그 점의 iframe 요소가 그 요소 안(`exact` 면 그
   * 요소 자신 · `nodeId` 면 가장 가까운 노드가 그것)인 첫 점. 호스트 좌표다.
   */
  async function pointOn(
    page: Page,
    css: string,
    options: { exact?: boolean; nodeId?: string } = {},
  ): Promise<{ x: number; y: number } | null> {
    return (await page.evaluate(
      `(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument;
        const scale = r.width / f.clientWidth; const target = d.querySelector(${JSON.stringify(css)}); if (target === null) return null;
        const b = target.getBoundingClientRect();
        const left = r.left + b.left * scale, top = r.top + b.top * scale, right = left + b.width * scale, bottom = top + b.height * scale;
        for (let y = top + 2; y < bottom - 1; y += 4) for (let x = left + 2; x < right - 1; x += 4) {
          if (document.elementFromPoint(x, y) !== f) continue
          const el = d.elementFromPoint((x - r.left) / scale, (y - r.top) / scale)
          if (el === null || !target.contains(el)) continue
          if (${options.exact === true} && el !== target) continue
          if (${JSON.stringify(options.nodeId ?? null)} !== null && el.closest('[data-wb-id]')?.getAttribute('data-wb-id') !== ${JSON.stringify(options.nodeId ?? null)}) continue
          return { x, y }
        }
        return null })()`,
    )) as { x: number; y: number } | null
  }

  async function selectedId(page: Page): Promise<string | null> {
    return page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)
  }

  async function selectNode(page: Page, nodeId: string): Promise<void> {
    const at = await pointOn(page, `[data-wb-id="${nodeId}"]`, { nodeId })
    expect(at, `${nodeId} 를 누를 점`).not.toBeNull()
    await page.mouse.click(at!.x, at!.y)
    await poll(
      `${nodeId} 를 고른다`,
      () => selectedId(page),
      (id) => id === nodeId,
    )
  }

  async function childCount(f: Fixture, pageId: string): Promise<number> {
    return ((await call('GET', `/projects/${f.projectId}/pages/${pageId}`)).body.schema.root.children ?? []).length
  }

  async function grabCard(page: Page, type: string): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) === 0) {
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    }
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    const card = page.locator(`[data-wb-palette-card="${type}"]`)
    await card.waitFor()
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 - 6, { steps: 3 })
  }

  it('뷰 모드에서 틀 링크로 지금 페이지를 누르면 이력이 안 쌓인다 — 메뉴 트리 링크와 같다', async () => {
    const f = await fixture('lc-same-page')
    const { page, close } = await open(f.path(f.first))
    try {
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await page.waitForTimeout(400)
      const length = () => page.evaluate(() => history.length)
      const opened = await length()
      const here = await pointOn(page, '[data-wb-layout-region="lnb"] a[aria-current="page"]')
      expect(here, '지금 페이지 링크를 누를 점').not.toBeNull()
      await page.mouse.click(here!.x, here!.y)
      await page.waitForTimeout(500)
      const afterFrame = await length()
      await page.getByRole('link', { name: '첫째', exact: true }).click()
      await page.waitForTimeout(500)
      const afterTree = await length()
      // 카나리아 — 다른 페이지로 가는 틀 링크는 이력을 한 칸 쌓는다(같은 처리기가 돈다).
      const other = await pointOn(page, '[data-wb-layout-region="lnb"] a:nth-of-type(2)')
      expect(other, '«둘째» 링크를 누를 점').not.toBeNull()
      await page.mouse.click(other!.x, other!.y)
      await poll(
        '«둘째» 가 열린다',
        async () => new URL(page.url()).pathname,
        (path) => path === f.path(f.second),
      ).catch(() => undefined)
      expect({
        틀: afterFrame - opened,
        트리: afterTree - afterFrame,
        다른페이지: (await length()) - afterTree,
        주소: new URL(page.url()).pathname,
      }).toEqual({ 틀: 0, 트리: 0, 다른페이지: 1, 주소: f.path(f.second) })
    } finally {
      await close()
    }
  })

  /** 캔버스 문서 끝 띠(바닥 − 6px · 왼쪽 여백 x 20)의 호스트 점 — 캔버스 칸을 바닥까지 굴린 뒤 잰다. 그 점의 iframe 요소가 막 자신인지도 낸다. */
  async function bottomStrip(page: Page): Promise<{ x: number; y: number; host: boolean; hit: string | null }> {
    return (await page.evaluate(`(() => { const pane = document.querySelector('.wb-shell-canvas'); pane.scrollTop = pane.scrollHeight;
      const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument;
      const s = r.width / f.clientWidth; const x = 20, y = f.clientHeight - 6; const hx = r.left + x * s, hy = r.top + y * s;
      const el = d.elementFromPoint(x, y);
      return { x: hx, y: hy, host: document.elementFromPoint(hx, hy) === f,
        hit: el === null ? null : el.matches('[data-wb-layout="popup"]') ? 'backdrop' : el.tagName } })()`)) as {
      x: number
      y: number
      host: boolean
      hit: string | null
    }
  }

  for (const [label, seedNodes] of [
    ['짧은 팝업', undefined],
    ['창보다 긴 팝업', TALL_POPUP],
  ] as const) {
    it(`${label} — 막이 캔버스 문서 높이를 다 덮고, 문서 끝 띠의 누름 · 놓기는 막 안과 같다(고름 그대로 · 놓을 자리 없음)`, async () => {
      const f = await fixture(`lc-backdrop-${seedNodes === undefined ? 'short' : 'tall'}`, seedNodes)
      const { page, close } = await open(f.path(f.popup), '[data-wb-id="n_pop"]')
      try {
        await page.waitForTimeout(500)
        const iframeHeight = () => page.locator('iframe.wb-shell-canvas-iframe').evaluate((el) => (el as HTMLIFrameElement).clientHeight)
        const height = await iframeHeight()
        const cover = await canvasFrame(page)
          .locator('html')
          .evaluate(() => {
            const backdrop = document.querySelector('[data-wb-layout="popup"]')!.getBoundingClientRect()
            let bare = 0
            for (let y = 1; y < window.innerHeight; y += 6)
              for (let x = 1; x < document.documentElement.clientWidth; x += 6) {
                const el = document.elementFromPoint(x, y)
                if (el !== null && el.closest('[data-wb-layout]') === null) bare += 1
              }
            return { bottomGap: Math.round(window.innerHeight - backdrop.bottom), top: Math.round(backdrop.top), bare }
          })
        await selectNode(page, 'n_pop')
        const strip = await bottomStrip(page)
        await page.mouse.click(strip.x, strip.y)
        await page.waitForTimeout(300)
        const selected = await selectedId(page)

        const before = await childCount(f, f.popup)
        await grabCard(page, 'Divider')
        await dragLayoutSettled(page)
        const target = await bottomStrip(page)
        await page.mouse.move(target.x, target.y, { steps: 10 })
        await page.waitForTimeout(150)
        const drops = await shownDrops(page)
        await page.mouse.up()
        await page.waitForTimeout(600)
        expect({
          // 카나리아 — 긴 판은 창(1000)보다 길다 · 짧은 판은 최소 높이(320)다. 잰 뒤에도 높이가 그대로다(높이 관찰과 고리가 안 선다).
          tall: height > 1000,
          steady: (await iframeHeight()) === height,
          ...cover,
          strip: { host: strip.host, hit: strip.hit },
          selected,
          drops,
          edits: (await childCount(f, f.popup)) - before,
        }).toEqual({
          tall: seedNodes !== undefined,
          steady: true,
          bottomGap: 0,
          top: 0,
          bare: 0,
          strip: { host: true, hit: 'backdrop' },
          selected: 'n_pop',
          drops: [],
          edits: 0,
        })
      } finally {
        await close()
      }
    })
  }
})
