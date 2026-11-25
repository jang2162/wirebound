/**
 * **캔버스의 레이아웃 틀을 실브라우저로 잰다**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「캔버스」 · 계획
 * `docs/superpowers/plans/2026-11-25-page-layout-plan.md` 「T6」). 서브페이지 틀은 레이아웃 뷰를 낸 픽스처 테마(`./layout-theme.ts` — GNB 60 · LNB 240)로
 * 세운다 — 기본테마 2.1.0 은 레이아웃 뷰가 없어 내용만 그린다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 | 혼자 죽는 변조 |
 * |---|---|---|
 * | 틀(GNB 링크) 위에 카드를 끌어 놓음 | 미리보기가 선다 · 서버 편집이 나간다(카나리아: 같은 판에서 내용 칸에 놓으면 편집 1) | `canvas-drop.ts` 의 틀 거름을 뗌 |
 * | 편집 모드에서 틀 링크 누름 | 고른 노드가 풀린다 · 주소가 바뀐다(카나리아: 노드를 먼저 골랐다) | `canvas.tsx` 표면 누름의 틀 거름을 뗌 |
 * | 뷰 모드에서 LNB 링크 누름 | 그 페이지가 안 열린다(주소 · 틀의 페이지 제목) | 틀의 이동 처리기를 편집 모드 것(없음)으로 |
 * | 편집 모드에서 GNB 를 끈 값 | 편집 모드에 GNB 가 선다 · 뷰 모드에서 안 선다 | 끈 영역을 모드와 무관하게 |
 * | 팝업 레이아웃 페이지 | 상자 가운데가 문서 가운데가 아니다 · 막이 문서 폭이 아니다 · 막 누름이 고름을 바꾼다 | SDK 의 가운데 세우기를 뗌(빌드) |
 * | 앞 판 테마(기본테마 1.7.0)에 고정된 프로젝트의 서브페이지 | 뿌리 노드 자리가 빈 레이아웃 판과 다르다 · 영역이 선다 | — |
 * | 틀이 민 노드의 번호 · 외곽선 | 번호가 노드 왼쪽 위(±1)에 안 선다 — 서브페이지 판 · LNB 를 끈 편집 모드에서 뷰 모드로 바꾼 판 | 측정 의존에서 틀 값을 뺌 |
 * | 틀(LNB 빈 자리)에서 시작한 사각형 | 내용의 노드를 감싸도 안 고른다 | 사각형 누름이 틀을 거름 |
 *
 * 좌표 판은 줌 100%(`zoomToFull`)에서 재고, 누를 점은 훑어 고른다(`pointOn` — 셸의 맨 위가 캔버스 iframe 이고 그 점의 iframe 요소가 겨눈 것인 점).
 * 기존 실브라우저 판의 픽스처는 빈 레이아웃이라(API 기본값) 틀이 안 선다 — 이 파일만 서브페이지를 만든다.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright-core'
import { readWbtheme } from '@wirebound/themes'
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
import { GNB_HEIGHT, LAYOUT_THEME, layoutTheme, LNB_WIDTH } from './layout-theme'
import { makeAdmin, putTheme, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const ADMIN_170 = fileURLToPath(new URL('./fixtures/system-admin-1.7.0.wbtheme', import.meta.url))

interface Fixture {
  projectId: string
  /** 서브페이지 «첫째»(글 둘 · 카드) · «둘째»(글) · 팝업 «창»(글) · 빈 «빈쪽»(«첫째» 와 같은 노드). */
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

describe.skipIf(!전제.ok)('캔버스의 레이아웃 틀 — 실브라우저', () => {
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

  /** 메뉴 «가»(첫째 · 둘째 · 창 · 빈쪽) · 메뉴 «나»(셋째). `theme` 이 없으면 픽스처 테마로 고정한다. */
  async function fixture(
    slug: string,
    theme: { themeId: string; version: string } = { themeId: LAYOUT_THEME.id, version: LAYOUT_THEME.version },
  ): Promise<Fixture> {
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
    await seed(popup.id, project.id, [{ id: 'n_pop', type: 'Text', props: { content: '창 글' } }])
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

  const regionCount = (page: Page, id: string) => canvasFrame(page).locator(`[data-wb-layout-region="${id}"]`).count()

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

  /** 캔버스 문서 안의 상자(iframe 문서 좌표). */
  async function frameBox(page: Page, css: string): Promise<{ left: number; top: number; width: number; height: number } | null> {
    return canvasFrame(page)
      .locator('html')
      .evaluate((_html, selector) => {
        const element = document.querySelector(selector)
        if (element === null) return null
        const r = element.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      }, css)
  }

  /** 번호 마커 가운데와 노드 왼쪽 위의 차(호스트 px). */
  async function markerGap(page: Page, nodeId: string): Promise<{ dx: number; dy: number }> {
    const marker = await page.locator(`.wb-shell-marker[data-wb-marker-for="${nodeId}"]`).boundingBox()
    const node = await canvasFrame(page).locator(`[data-wb-id="${nodeId}"]`).boundingBox()
    if (marker === null || node === null) throw new Error('마커 · 노드 상자를 못 쟀다')
    return { dx: Math.round(marker.x + marker.width / 2 - node.x), dy: Math.round(marker.y + marker.height / 2 - node.y) }
  }

  it('틀(GNB 링크) 위에 카드를 끌어 놓으면 미리보기도 편집도 없다 — 내용 칸에 놓으면 들어간다', async () => {
    const f = await fixture('lc-drop')
    const { page, close } = await open(f.path(f.first))
    try {
      const before = await childCount(f, f.first)
      // GNB 링크의 점은 쥐기 전에 훑는다 — 끄는 동안 캔버스 iframe 은 `pointer-events: none` 이라 호스트의 `elementFromPoint` 가 그것을 못 본다
      // (`src/drag/use-pointer-drag.ts`). GNB 는 내용 위라 끄는 동안 서는 빈 구역 칸(카드의 구역)이 밀지 않는다 — 쥔 뒤 같은 자리인지 본다.
      const gnb = await pointOn(page, '[data-wb-layout-region="gnb"] a')
      expect(gnb, 'GNB 링크를 겨눌 점').not.toBeNull()
      const gnbBefore = await frameBox(page, '[data-wb-layout-region="gnb"] a')
      await grabCard(page, 'Divider')
      await dragLayoutSettled(page)
      expect(await frameBox(page, '[data-wb-layout-region="gnb"] a'), 'GNB 링크가 안 밀렸다').toEqual(gnbBefore)
      await page.mouse.move(gnb!.x, gnb!.y, { steps: 10 })
      await page.waitForTimeout(150)
      const overFrame = await shownDrops(page)
      await page.mouse.up()
      await page.waitForTimeout(600)
      const afterFrame = await childCount(f, f.first)

      // 카나리아 — 같은 판에서 내용 칸(글 노드)에 놓으면 편집 하나가 들어간다.
      await grabCard(page, 'Divider')
      await dragLayoutSettled(page)
      // 빈 구역 칸이 민 뒤의 상자 가운데(끝 글 — 자식이 없는 잎이다).
      const last = await canvasFrame(page).locator('[data-wb-id="n_last"]').boundingBox()
      expect(last, '내용 칸의 상자').not.toBeNull()
      const text = { x: last!.x + last!.width / 2, y: last!.y + last!.height / 2 }
      await page.mouse.move(text.x, text.y, { steps: 10 })
      await page.waitForTimeout(150)
      const overContent = (await shownDrops(page)).length
      await page.mouse.up()
      const afterContent = await poll(
        '내용 칸에 놓인다',
        () => childCount(f, f.first),
        (n) => n === before + 1,
      ).catch(() => childCount(f, f.first))
      expect({
        틀위미리보기: overFrame,
        틀놓은뒤: afterFrame - before,
        내용미리보기: overContent > 0,
        내용놓은뒤: afterContent - before,
      }).toEqual({
        틀위미리보기: [],
        틀놓은뒤: 0,
        내용미리보기: true,
        내용놓은뒤: 1,
      })
    } finally {
      await close()
    }
  })

  it('편집 모드에서 틀 링크를 누르면 고른 노드도 주소도 그대로다', async () => {
    const f = await fixture('lc-pick')
    const { page, close } = await open(f.path(f.first))
    try {
      await selectNode(page, 'n_card')
      const url = page.url()
      for (const css of [
        '[data-wb-layout-region="lnb"] a:nth-of-type(2)',
        '[data-wb-layout-region="gnb"] a',
        '[data-wb-layout-region="title"]',
      ]) {
        const at = await pointOn(page, css)
        expect(at, `${css} 를 누를 점`).not.toBeNull()
        await page.mouse.click(at!.x, at!.y)
        await page.waitForTimeout(300)
        expect({ css, selected: await selectedId(page), url: page.url() }).toEqual({ css, selected: 'n_card', url })
      }
    } finally {
      await close()
    }
  })

  it('뷰 모드에서 LNB 링크를 누르면 그 페이지가 열린다', async () => {
    const f = await fixture('lc-view-nav')
    const { page, close } = await open(f.path(f.first))
    try {
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      const link = await pointOn(page, '[data-wb-layout-region="lnb"] a:nth-of-type(2)')
      expect(link, '«둘째» 링크의 점').not.toBeNull()
      expect(await canvasFrame(page).locator('[data-wb-layout-region="lnb"] a:nth-of-type(2)').textContent()).toBe('둘째')
      await page.mouse.click(link!.x, link!.y)
      // 기다림이 끝나도 값으로 단언한다 — 시간 초과로 죽으면 무엇이 섰는지가 안 남는다.
      await poll(
        '주소가 «둘째»',
        async () => page.url(),
        (url) => url.endsWith(f.path(f.second)),
      ).catch(() => undefined)
      await canvasFrame(page)
        .locator('[data-wb-id="n_two"]')
        .waitFor({ timeout: 3000 })
        .catch(() => undefined)
      expect({
        url: new URL(page.url()).pathname,
        title: await canvasFrame(page).locator('[data-wb-layout-region="title"]').textContent(),
        current: await canvasFrame(page).locator('[data-wb-layout-region="lnb"] a[aria-current="page"]').textContent(),
        mode: await page.getByRole('button', { name: '편집 모드', exact: true }).count(),
      }).toEqual({ url: f.path(f.second), title: '둘째', current: '둘째', mode: 1 })
    } finally {
      await close()
    }
  })

  it('편집 모드에서 끈 GNB 는 편집 모드에만 꺼진다 — 뷰 모드는 다 켬', async () => {
    const f = await fixture('lc-prefs')
    const put = await call('PUT', `/projects/${f.projectId}/view-prefs`, { hiddenRegions: ['subpage.gnb'] })
    expect(put.status).toBe(200)
    const { page, close } = await open(f.path(f.first))
    try {
      await poll(
        '읽은 끔이 선다',
        () => regionCount(page, 'gnb'),
        (n) => n === 0,
      ).catch(() => undefined)
      const edit = { gnb: await regionCount(page, 'gnb'), lnb: await regionCount(page, 'lnb') }
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await poll(
        '뷰 모드의 GNB',
        () => regionCount(page, 'gnb'),
        (n) => n === 1,
      ).catch(() => undefined)
      const view = { gnb: await regionCount(page, 'gnb'), lnb: await regionCount(page, 'lnb') }
      await page.getByRole('button', { name: '편집 모드', exact: true }).click()
      await poll(
        '편집 모드로 돌아오면 다시 끔',
        () => regionCount(page, 'gnb'),
        (n) => n === 0,
      ).catch(() => undefined)
      expect({ edit, view, back: await regionCount(page, 'gnb') }).toEqual({ edit: { gnb: 0, lnb: 1 }, view: { gnb: 1, lnb: 1 }, back: 0 })
    } finally {
      await close()
    }
  })

  it('팝업 레이아웃 — 상자가 문서 가운데 위에 서고 막이 문서 폭이다 · 막을 눌러도 고름이 그대로다', async () => {
    const f = await fixture('lc-popup')
    const { page, close } = await open(f.path(f.popup), '[data-wb-id="n_pop"]')
    try {
      const measured = await canvasFrame(page)
        .locator('html')
        .evaluate(() => {
          const backdrop = document.querySelector('[data-wb-layout="popup"]')!.getBoundingClientRect()
          const box = document.querySelector('[data-wb-component="Popup"]')!.getBoundingClientRect()
          return {
            center: Math.round(box.left + box.width / 2 - document.documentElement.clientWidth / 2),
            top: Math.round(box.top - backdrop.top),
            backdropWidth: Math.round(backdrop.width - document.documentElement.clientWidth),
            boxNarrower: box.width < backdrop.width,
          }
        })
      await selectNode(page, 'n_pop')
      const at = await pointOn(page, '[data-wb-layout="popup"]', { exact: true })
      expect(at, '막의 점').not.toBeNull()
      await page.mouse.click(at!.x, at!.y)
      await page.waitForTimeout(300)
      expect({ ...measured, center: Math.abs(measured.center) <= 1 ? 0 : measured.center, selected: await selectedId(page) }).toEqual({
        center: 0,
        top: 24,
        backdropWidth: 0,
        boxNarrower: true,
        selected: 'n_pop',
      })
    } finally {
      await close()
    }
  })

  it('앞 판 테마(기본테마 1.7.0)에 고정된 프로젝트의 서브페이지는 빈 레이아웃과 같은 자리에 선다 — 영역이 없다', async () => {
    const bytes = readFileSync(ADMIN_170)
    const { files } = readWbtheme(new Uint8Array(bytes), { stored: true })
    const old = files!.manifest
    expect(`${old.id}@${old.version}`).toBe('system-admin@1.7.0')
    await stack.query(
      `insert into theme_packages (theme_id, version, name, description, sdk_range, manifest, files, size, sha256, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null) on conflict do nothing`,
      [
        old.id,
        old.version,
        old.name,
        old.description ?? null,
        old.sdk,
        JSON.stringify(old),
        bytes,
        bytes.byteLength,
        createHash('sha256').update(bytes).digest('hex'),
      ],
    )
    const f = await fixture('lc-old', { themeId: 'system-admin', version: '1.7.0' })
    const rootOf = async (pageId: string) => (await call('GET', `/projects/${f.projectId}/pages/${pageId}`)).body.schema.root.id as string
    const measure = async (pageId: string) => {
      const { page, close } = await open(f.path(pageId), '[data-wb-id="n_last"]')
      try {
        const box = await frameBox(page, `[data-wb-id="${await rootOf(pageId)}"]`)
        return {
          box,
          regions: await canvasFrame(page).locator('[data-wb-layout-region]').count(),
          layout: await canvasFrame(page).locator('[data-wb-layout]').getAttribute('data-wb-layout'),
        }
      } finally {
        await close()
      }
    }
    const subpage = await measure(f.first)
    const blank = await measure(f.blank)
    expect({ box: subpage.box, regions: subpage.regions, layout: subpage.layout }).toEqual({
      box: blank.box,
      regions: 0,
      layout: 'subpage',
    })
    expect(blank.layout).toBe('blank')
  })

  it('틀이 민 노드에서 번호가 노드를 따른다 — 서브페이지 판 · LNB 를 끈 편집 모드에서 뷰 모드로 바꾼 판', async () => {
    const f = await fixture('lc-marker')
    const commented = await call('POST', `${f.path(f.first)}/comments`, { nodeId: 'n_last', body: '여기' })
    expect(commented.status).toBeLessThan(300)
    expect((await call('PUT', `/projects/${f.projectId}/view-prefs`, { hiddenRegions: ['subpage.lnb'] })).status).toBe(200)
    const { page, close } = await open(f.path(f.first), '[data-wb-layout-region="gnb"] a')
    try {
      await page.locator('.wb-shell-marker[data-wb-marker-for="n_last"]').waitFor()
      await poll(
        'LNB 가 꺼졌다',
        () => regionCount(page, 'lnb'),
        (n) => n === 0,
      )
      const edit = await markerGap(page, 'n_last')
      const editLeft = (await frameBox(page, '[data-wb-id="n_last"]'))!.left
      // 고름을 비운다 — 페이지를 열면 뿌리가 골라져, 모드를 바꿀 때 고른 노드의 펼침(`reveal`)이 바뀌어 측정이 다시 돈다. 비우면 모드를 바꿔도
      // 측정 의존 가운데 틀 값만 바뀐다(문서 · 펼침 · 겹layer 그대로 · LNB 폭만 늘어 문서 높이도 그대로).
      await page.keyboard.press('Escape')
      await poll(
        '고름이 비었다',
        () => selectedId(page),
        (id) => id === null,
      )
      const heightBefore = await page.locator('iframe.wb-shell-canvas-iframe').evaluate((el) => (el as HTMLIFrameElement).clientHeight)
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await poll(
        '뷰 모드의 LNB',
        () => regionCount(page, 'lnb'),
        (n) => n === 1,
      ).catch(() => undefined)
      const heightAfter = await page.locator('iframe.wb-shell-canvas-iframe').evaluate((el) => (el as HTMLIFrameElement).clientHeight)
      const viewLeft = (await frameBox(page, '[data-wb-id="n_last"]'))!.left
      await page.waitForTimeout(300)
      const view = await markerGap(page, 'n_last')
      // 카나리아 — 틀이 노드를 민다(GNB 아래 · 뷰 모드에서 LNB 만큼 오른쪽).
      expect({
        pushedDown: (await frameBox(page, '[data-wb-id="n_last"]'))!.top > GNB_HEIGHT,
        shifted: Math.round(viewLeft - editLeft),
        sameHeight: heightAfter === heightBefore,
      }).toEqual({ pushedDown: true, shifted: LNB_WIDTH, sameHeight: true })
      const near = (gap: { dx: number; dy: number }) => Math.abs(gap.dx) <= 1 && Math.abs(gap.dy) <= 1
      expect({ edit: near(edit) ? 'near' : edit, view: near(view) ? 'near' : view }).toEqual({ edit: 'near', view: 'near' })
    } finally {
      await close()
    }
  })

  it('틀(LNB 빈 자리)에서 시작한 사각형은 바탕에서 시작한 것과 같다 — 감싼 내용 노드를 고른다', async () => {
    const f = await fixture('lc-marquee')
    const { page, close } = await open(f.path(f.first))
    try {
      const lnb =
        (await page.evaluate(`(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect();
        const scale = r.width / f.clientWidth; const d = f.contentDocument; const region = d.querySelector('[data-wb-layout-region="lnb"]');
        const links = region.querySelectorAll('a'); const last = links[links.length - 1].getBoundingClientRect(); const b = region.getBoundingClientRect();
        const text = d.querySelector('[data-wb-id="n_text"]').getBoundingClientRect();
        return { x: r.left + (b.left + b.width / 2) * scale, y: r.top + (Math.max(last.bottom, text.bottom) + 8) * scale, bottom: r.top + b.bottom * scale } })()`)) as {
          x: number
          y: number
          bottom: number
        }
      const target = await canvasFrame(page).locator('[data-wb-id="n_text"]').boundingBox()
      if (target === null) throw new Error('n_text 상자')
      // 판 카나리아 — 누를 자리가 LNB 안의 빈 자리이고(링크 밑) 그 위가 캔버스 iframe 이다.
      expect(lnb.y < lnb.bottom).toBe(true)
      const startsOn =
        await page.evaluate(`(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect();
        const scale = r.width / f.clientWidth; const el = f.contentDocument.elementFromPoint((${lnb.x} - r.left) / scale, (${lnb.y} - r.top) / scale);
        return document.elementFromPoint(${lnb.x}, ${lnb.y}) === f && el !== null && el.closest('[data-wb-layout-region="lnb"]') !== null })()`)
      expect(startsOn, 'LNB 빈 자리에서 누른다').toBe(true)
      await page.mouse.move(lnb.x, lnb.y)
      await page.mouse.down()
      // n_text 를 완전히 감싸는 데까지 — 위로 · 오른쪽으로(시작점이 n_text 아래끝보다 밑이라 세로로도 감싼다 · 그 밑 카드는 다 안 감싼다).
      await page.mouse.move(target.x + target.width + 4, target.y - 4, { steps: 12 })
      await page.mouse.up()
      await poll(
        '사각형이 n_text 를 고른다',
        () => selectedId(page),
        (id) => id === 'n_text',
      ).catch(() => undefined)
      expect(await selectedId(page)).toBe('n_text')
    } finally {
      await close()
    }
  })
})
