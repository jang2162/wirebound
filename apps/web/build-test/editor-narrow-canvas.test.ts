/**
 * **좁은 창의 캔버스 · 화면 맞춤 · 가로 끝 스크롤을 실브라우저로 잰다**(`src/shell/sidebar-layout.ts` 머리말 «둘 다 최소인데도 캔버스 몫이
 * 모자라면 사람이 접는다» · `src/shell/panel-fold.tsx` · `src/routes/editor.tsx` 의 `fitZoom` · `useZoomCommands` · `CanvasFrame` 의 무대 ·
 * `src/drag/use-pointer-drag.ts` 머리말 «끝 스크롤»). jsdom 은 배치 · 스크롤이 없어 칸 폭 · 넘침 · 끝 스크롤을 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 좁은 창 — 칸 폭 · 접기 · 기억 | 창 1440 · 1024 · 900 · 836 · 700 × 편집 · 뷰에서 칸 폭이 표와 다르다 · 셸에 가로 넘침 · 접으면 그 쪽의 트랙(손잡이 · 여백까지)이 안 빠진다 · 새로 고친 뒤 접힘을 잃는다 · 펴면 폭이 안 돌아온다 |
 * | 화면 맞춤 | 프리셋 1920 · 1440 · 1280 · 375 × 창 1440 · 900 · 700 에서 맞춘 뒤 칸에 가로 넘침이 있다(줌 하한에 막힌다) |
 * | 줌 하한 | 축소(−)가 25% 아래로 내린다 · 맞춤이 25% 아래로 못 간다 · 맞춘 배율에서 − 가 배율을 바꾼다 · 거기서 + 가 25% 가 아니다 |
 * | 빈 세로 스크롤 | 줌 ≠ 1 에서 칸의 세로 넘침이 보이는 문서 아래끝 + 안쪽 여백과 다르다(빈 스크롤 · 잘림) |
 * | 낮은 줌의 겹 | 맞춘 줌(7% · 18%)에서 선택 외곽선 · 번호 마커 · 배치 선이 노드에서 1px 넘게 어긋난다 |
 * | 끝 스크롤 — 손잡이 · 카드 · 사각형 | 칸의 오른 · 왼 끝에 대도 가로로 안 민다 · 민 뒤 보인 놓을 자리와 서버에 놓인 자리가 다르다 · 민 뒤의 사각형이 처음 화면 밖 노드를 못 감싼다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { panelWidthDefault } from '../src/shell/sidebar-layout'
import {
  canvasFrame,
  editorStackPrerequisite,
  poll,
  shownDrops,
  startEditorStack,
  zoomToFull,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LAYOUT_KEY = 'wirebound.editor.sidebar'

interface SeedNode {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: SeedNode[]
}
interface Doc {
  id: string
  children?: Doc[]
}
const text = (id: string, content: string): SeedNode => ({ id, type: 'Text', props: { content } })
const texts = (count: number): SeedNode[] =>
  Array.from({ length: count }, (_, index) =>
    text(`n_text${String(index + 1).padStart(7, '0')}`, `글 ${index + 1} — 캔버스를 세로로 채운다`),
  )

/**
 * **가로로 넓은 페이지** — 맨 위 글 하나(끌 것)와 4열 × 2행 그리드. 프리셋 1920 · 줌 1 · 창 1440 이면 칸(쓰는 폭 812)에 첫 열과 둘째 열의 앞만
 * 보이고 셋째 · 넷째 열은 칸 오른쪽 밖이다. 둘째 행은 첫 행만 감싼 사각형이 그리드째 고르지 않게 둔다(가장 바깥 노드를 고른다).
 */
const GRID_IDS = ['n_w0', 'n_w1', 'n_w2', 'n_w3', 'n_w4', 'n_w5', 'n_w6', 'n_w7']
const WIDE: SeedNode[] = [
  text('n_src', '끌 글'),
  { id: 'n_grid', type: 'Grid', props: { columns: 4 }, children: GRID_IDS.map((id, index) => text(id, `${index + 1}번 칸`)) },
  ...texts(4),
]

describe.skipIf(!전제.ok)('좁은 창 캔버스 · 화면 맞춤 · 가로 끝 스크롤 — 실브라우저', () => {
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

  async function fixture(slug: string, nodes: SeedNode[]): Promise<string> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '관리자 콘솔 설계서', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
    const P = `/projects/${project.id}/pages/${page.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function open(P: string, viewport: { width: number; height: number }) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close() }
  }

  /**
   * 창 다섯 × 편집 · 뷰 — 펼침 · 좌측 접음 · 둘 다 접음의 칸 폭(셋째 판은 새로 고친 뒤). 기대 값은 셈이다: 펼침은 두 폭(264 · 300 을 우측 먼저
   * 조인 값 — 둘 다 최소면 200 · 300)과 손잡이 · 여백 16 을 뺀 것, 좌측 접음은 우측 300 · 손잡이 하나 · 여백 둘(8)을 뺀 것, 둘 다 접음은 창 폭.
   * 우측만 접으면 좌측이 창 − 8 − 480 까지 조인다. 펼친 판이 캔버스 몫(480) 아래인 창(900 · 836 · 700)에서 접는 것이 메우는 길이다.
   */
  it('좁은 창 — 창 다섯 × 편집 · 뷰의 칸 폭, 접으면 그 쪽 트랙째 빠지고 새로 고쳐도 기억하며 펴면 돌아온다', async () => {
    const P = await fixture('narrow', texts(6))
    const rows: string[] = []
    const cells: Record<string, unknown> = {}
    for (const mode of ['편집 모드', '뷰 모드'] as const) {
      const { page, close } = await open(P, { width: 1440, height: 800 })
      try {
        await page.getByRole('button', { name: mode, exact: true }).click()
        for (const width of [1440, 1024, 900, 836, 700]) {
          await page.setViewportSize({ width, height: 800 })
          // 창 폭이 바뀐 뒤 셸이 `resize` 를 받아 다시 그릴 때까지 — 창 값만 기다리면 앞 창의 폭을 읽는다(두 프레임을 넘긴다).
          await poll(
            '창이 바뀐다',
            () => page.evaluate(() => window.innerWidth),
            (value) => value === width,
          )
          const open1 = await settled(page)
          // 누른 뒤 한 번 그린 값을 읽는다 — 기다림의 끝 조건에 재는 값을 넣으면 그 값이 틀린 판이 값이 아니라 시간 초과로 죽는다.
          await page.getByRole('button', { name: '좌측 패널 접기', exact: true }).click()
          const sideFolded = await settled(page)
          await page.getByRole('button', { name: '우측 패널 접기', exact: true }).click()
          const bothFolded = await settled(page)
          await page.reload()
          await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
          const reloaded = await settled(page)
          // 접힌 쪽만 편다 — 접힘을 잃은 판(새로 고친 뒤 펼침)에서도 판이 서서 위 `reloaded` 의 값으로 죽는다.
          const foldedToggles = page.locator('.wb-shell-fold-toggle[aria-expanded="false"]')
          for (let left = await foldedToggles.count(); left > 0; left -= 1) await foldedToggles.first().click()
          const back = await settled(page)
          await page.getByRole('button', { name: '우측 패널 접기', exact: true }).click()
          const panelFolded = await settled(page)
          await page.getByRole('button', { name: '우측 패널 펴기', exact: true }).click()
          rows.push(
            `${mode} ${width}: 펼침 ${open1.canvas}(좌 ${open1.side} · 우 ${open1.panel}) · 좌측 접음 ${sideFolded.canvas} · 우측 접음 ${panelFolded.canvas}(좌 ${panelFolded.side}) · 둘 다 ${bothFolded.canvas}`,
          )
          cells[`${mode}·${width}`] = {
            open: [open1.side, open1.panel, open1.canvas],
            sideFolded: [sideFolded.side, sideFolded.panel, sideFolded.canvas, sideFolded.handles],
            panelFolded: [panelFolded.side, panelFolded.panel, panelFolded.canvas, panelFolded.handles],
            bothFolded: [bothFolded.canvas, bothFolded.handles],
            reloaded: [reloaded.side, reloaded.panel, reloaded.canvas, reloaded.folded],
            back: [back.side, back.panel, back.canvas],
            overflow: [open1, sideFolded, bothFolded, reloaded, back, panelFolded].map((value) => value.shellOverflow),
          }
        }
        const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY)) ?? '{}')
        cells[`${mode}·저장`] = stored
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[좁은 창 표]\n${rows.join('\n')}`)
    const want = (width: number) => {
      // 우측 기본 폭은 창을 따른다(`panelWidthDefault` — 창 1440 에서 346, 1060 아래는 최소 300).
      const panel = panelWidthDefault(width)
      const side = width >= 1060 ? 264 : Math.max(200, width - 16 - 480 - panel)
      const open1 = width - 16 - side - panel
      return {
        open: [side, panel, open1],
        sideFolded: [0, panel, width - 8 - panel, ['우측 패널 폭']],
        // 우측만 접으면 좌측의 예산이 창 − 8 − 480 이라 좌측 264 가 그 아래 창(752 미만)에서 조인다.
        panelFolded: [
          Math.max(200, Math.min(264, width - 8 - 480)),
          0,
          width - 8 - Math.max(200, Math.min(264, width - 8 - 480)),
          ['사이드바 폭'],
        ],
        bothFolded: [width, []],
        reloaded: [0, 0, width, { side: true, panel: true }],
        back: [side, panel, open1],
        overflow: [0, 0, 0, 0, 0, 0],
      }
    }
    const expected: Record<string, unknown> = {}
    for (const mode of ['편집 모드', '뷰 모드']) {
      for (const width of [1440, 1024, 900, 836, 700]) expected[`${mode}·${width}`] = want(width)
      expected[`${mode}·저장`] = { sideFolded: false, panelFolded: false }
    }
    expect(cells).toEqual(expected)
  }, 240_000)

  /** 프리셋 넷 × 창 셋 — 맞춘 뒤 칸의 가로 넘침이 0 이다(맞춘 줌은 로그). 창 700 은 머리가 줌을 `…` 로 접은 판이다. */
  it('화면 맞춤 — 프리셋 1920 · 1440 · 1280 · 375 × 창 1440 · 900 · 700 에서 맞춘 뒤 가로 넘침 0', async () => {
    const P = await fixture('fit', texts(6))
    const zooms: string[] = []
    const over: Record<string, number> = {}
    for (const width of [1440, 900, 700]) {
      const { page, close } = await open(P, { width, height: 700 })
      try {
        for (const preset of [1920, 1440, 1280, 375]) {
          await page.getByLabel('뷰포트 폭').selectOption(String(preset))
          await pressFit(page)
          const m = await poll(
            '맞춘 줌이 무대에 실린다',
            () => canvasState(page),
            (value) => value.settled && value.presetWidth === preset,
          )
          zooms.push(`${width}·${preset} ${(m.zoom * 100).toFixed(1)}%`)
          over[`${width}·${preset}`] = m.overX
        }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[화면 맞춤 줌] ${zooms.join(' · ')}`)
    expect(Object.keys(over)).toHaveLength(12)
    expect(Object.entries(over).filter(([, value]) => value !== 0)).toEqual([])
  }, 120_000)

  /**
   * 창 900(머리에 줌 묶음이 선 판) · 프리셋 1920. − 셋이 100 → 75 → 50 → 25 이고 넷째 − 는 25 그대로. 맞춤이 25% 아래(336 ÷ 1920 → 18%)로 가고,
   * 그 배율에서 − 는 그대로 · + 는 다음 25 배수(25%) · 다시 + 는 한 칸(50%)이다.
   */
  it('줌 하한 — 축소는 25% 에서 멈추고, 맞춤은 그 아래로 가며 거기서 축소는 그대로 · 확대는 25% 로', async () => {
    const P = await fixture('floor', texts(3))
    const { page, close } = await open(P, { width: 900, height: 700 })
    try {
      await page.getByLabel('뷰포트 폭').selectOption('1920')
      // 폭 맞춤으로 열린다 — 100% 에서 시작한다(`zoomToFull`).
      await zoomToFull(page)
      // 배율은 프레임의 그려진 폭 ÷ 레이아웃 폭(`canvasState`) — 표시 글(반올림)이 아니라 값으로 견준다.
      const zoom = async () =>
        Math.round(
          (
            await poll(
              '줌이 무대에 실린다',
              () => canvasState(page),
              (value) => value.settled,
            )
          ).zoom * 1000,
        ) / 1000
      const press = async (name: string) => {
        await page.getByRole('button', { name, exact: true }).click()
        return zoom()
      }
      const steps = [await press('축소'), await press('축소'), await press('축소'), await press('축소')]
      const fitted = await press('화면 맞춤')
      const outAtFit = await press('축소')
      const inAtFit = [await press('확대'), await press('확대')]
      // 맞춘 배율 = (칸 384 − 안쪽 여백 48) ÷ 1920 = 0.175.
      expect({ steps, fitted, outAtFit, inAtFit }).toEqual({
        steps: [0.75, 0.5, 0.25, 0.25],
        fitted: 0.175,
        outAtFit: 0.175,
        inAtFit: [0.25, 0.5],
      })
    } finally {
      await close()
    }
  })

  /**
   * 글 40 줄 · 창 1440 — 줌 1 · 0.5 · 0.25 · 1.5 · 맞춤(프리셋 1920)마다 칸의 세로 넘침(`scrollHeight`)이 «보이는 문서 아래끝 + 안쪽 여백 24» 와
   * 같다(1px 안) — 크면 빈 세로 스크롤, 작으면 문서 아래가 잘린다. 문서가 칸보다 짧으면 넘침이 0 이다.
   */
  it('빈 세로 스크롤 0 — 줌 1 · 0.5 · 0.25 · 1.5 · 맞춤에서 칸의 세로 넘침이 보이는 문서 아래끝과 같다', async () => {
    const P = await fixture('empty-y', texts(40))
    const { page, close } = await open(P, { width: 1440, height: 900 })
    try {
      await canvasFrame(page).locator('[data-wb-id="n_text0000040"]').waitFor()
      // 폭 맞춤으로 열린다 — «1» 판은 100% 에서 잰다.
      await zoomToFull(page)
      const rows: Record<string, { gap: number; overY: number }> = {}
      const measure = async (label: string) => {
        const m = await poll(
          '무대 높이가 줌을 따른다',
          () => canvasState(page),
          (value) => value.settled,
        )
        rows[label] = { gap: m.gapY, overY: m.overY }
      }
      await measure('1')
      for (const [label, clicks] of [
        ['0.5', 2],
        ['0.25', 1],
      ] as const) {
        for (let i = 0; i < clicks; i += 1) await page.getByRole('button', { name: '축소', exact: true }).click()
        await measure(label)
      }
      for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: '확대', exact: true }).click()
      await measure('1.5')
      await page.getByLabel('뷰포트 폭').selectOption('1920')
      await page.getByRole('button', { name: '화면 맞춤', exact: true }).click()
      await measure('맞춤')
      // 판 카나리아 — 줌 1 에서는 문서가 칸보다 길다(세로 넘침이 있다).
      expect(rows['1']!.overY).toBeGreaterThan(0)
      expect(Object.entries(rows).filter(([, value]) => Math.abs(value.gap) > 1)).toEqual([])
    } finally {
      await close()
    }
  })

  /**
   * 맞춘 낮은 줌(창 700 · 1920 → 7% · 창 900 → 18%)에서 고른 노드의 외곽선 · 코멘트 마커 · 배치 선(Flex · Grid)이 노드 상자에 맞는다(1px 안).
   * 상자는 호스트 좌표다 — 노드는 iframe 안의 상자를 iframe 의 그려진 배율로 옮긴다(구현의 줌 값을 안 읽는다).
   */
  it('낮은 줌의 겹 — 맞춘 7% · 18% 에서 선택 외곽선 · 번호 마커 · 배치 선이 노드에 1px 안으로 맞는다', async () => {
    const P = await fixture('low-zoom', [
      { id: 'n_flex', type: 'Flex', props: { direction: 'row' }, children: [text('n_r1', '가로 하나'), text('n_r2', '가로 둘')] },
      { id: 'n_grid', type: 'Grid', props: { columns: 3 }, children: [text('n_g1', '칸 하나'), text('n_g2', '칸 둘')] },
      text('n_note', '코멘트를 단 글'),
    ])
    const commented = await stack.request(alice, 'POST', `${P}/comments`, { nodeId: 'n_note', body: '여기' })
    expect(commented.status).toBeLessThan(300)
    const out: Record<string, unknown> = {}
    for (const width of [700, 900]) {
      const { page, close } = await open(P, { width, height: 700 })
      try {
        await page.getByLabel('뷰포트 폭').selectOption('1920')
        await pressFit(page)
        await poll(
          '맞춘 줌',
          () => canvasState(page),
          (value) => value.settled && value.zoom < 0.25,
        )
        await page.getByRole('button', { name: '배치 선', exact: true }).click()
        await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_r2"] button').first().click()
        await page.locator('.wb-shell-selection[data-wb-selected-id="n_r2"]').waitFor()
        await page.locator('.wb-shell-marker[data-wb-marker-for="n_note"]').waitFor()
        await page.locator('.wb-shell-guide[data-wb-guide-for="n_grid"]').waitFor()
        const m = await page.evaluate(() => {
          const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
          const f = iframe.getBoundingClientRect()
          const scale = f.width / iframe.offsetWidth
          const node = (id: string) => {
            const r = iframe.contentDocument!.querySelector(`[data-wb-id="${id}"]`)!.getBoundingClientRect()
            return { x: f.x + r.x * scale, y: f.y + r.y * scale, w: r.width * scale, h: r.height * scale }
          }
          const host = (selector: string) => {
            const r = document.querySelector(selector)!.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
          }
          const off = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
            Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h))
          const marker = host('.wb-shell-marker[data-wb-marker-for="n_note"]')
          const note = node('n_note')
          return {
            scale,
            outline: off(node('n_r2'), host('.wb-shell-selection[data-wb-selected-id="n_r2"]')),
            marker: Math.max(Math.abs(marker.x + marker.w / 2 - note.x), Math.abs(marker.y + marker.h / 2 - note.y)),
            flex: off(node('n_flex'), host('.wb-shell-guide[data-wb-guide-for="n_flex"]')),
            grid: off(node('n_grid'), host('.wb-shell-guide[data-wb-guide-for="n_grid"]')),
          }
        })
        out[String(width)] = m
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[낮은 줌의 겹] ${JSON.stringify(out)}`)
    for (const m of Object.values(out) as { scale: number; outline: number; marker: number; flex: number; grid: number }[]) {
      expect({ low: m.scale < 0.25, outline: m.outline <= 1, marker: m.marker <= 1, flex: m.flex <= 1, grid: m.grid <= 1 }).toEqual({
        low: true,
        outline: true,
        marker: true,
        flex: true,
        grid: true,
      })
    }
  }, 120_000)

  describe('가로 끝 스크롤 — 창 1440 · 프리셋 1920 · 줌 1', () => {
    async function openWide(P: string) {
      const tab = await open(P, { width: 1440, height: 900 })
      await tab.page.getByLabel('뷰포트 폭').selectOption('1920')
      // 폭 맞춤으로 열린다 — 이 판은 칸보다 넓은 문서(줌 1)를 민다.
      await zoomToFull(tab.page)
      await poll(
        '넓은 문서',
        () => canvasState(tab.page),
        (value) => value.settled && value.presetWidth === 1920 && Math.abs(value.zoom - 1) < 0.01,
      )
      return tab
    }

    const scrollLeft = (page: Page) => page.evaluate(() => (document.querySelector('.wb-shell-canvas') as HTMLElement).scrollLeft)

    /**
     * 칸의 오른 · 왼 끝(안쪽 8px)에 대고 기다린다 — 칸이 끝까지 밀릴 때까지(최대 4s). 민 양을 돌려준다. `y` 를 안 주면 칸 세로 가운데다.
     */
    async function holdAtEdge(page: Page, side: 'left' | 'right', y?: number, arrived?: () => Promise<void>): Promise<number> {
      const pane = (await page.locator('.wb-shell-canvas').boundingBox())!
      const x = side === 'right' ? pane.x + pane.width - 8 : pane.x + 8
      const start = await scrollLeft(page)
      await page.mouse.move(x, y ?? pane.y + pane.height / 2, { steps: 6 })
      await arrived?.()
      const target =
        side === 'right'
          ? await page.evaluate(() => {
              const c = document.querySelector('.wb-shell-canvas') as HTMLElement
              return c.scrollWidth - c.clientWidth
            })
          : 0
      await poll(
        '칸이 끝까지 밀린다',
        () => scrollLeft(page),
        (value) => Math.abs(value - target) < 1,
        4_000,
      ).catch(() => undefined)
      return (await scrollLeft(page)) - start
    }

    /** 노드 `id` 상자의 (fx, fy) 점 — 호스트 좌표. */
    async function spot(page: Page, id: string, fx: number, fy: number): Promise<{ x: number; y: number }> {
      const box = (await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox())!
      return { x: box.x + box.width * fx, y: box.y + box.height * fy }
    }

    /** 서버 문서의 그리드 자식 — 시드에 없던 노드(카드로 넣은 것)는 `+`. */
    async function serverGrid(P: string): Promise<string[]> {
      const root = (await stack.request(alice, 'GET', P)).body.schema.root as Doc
      const grid = root.children!.find((child) => child.id === 'n_grid')!
      return grid.children!.map((child) => ([...GRID_IDS, 'n_src'].includes(child.id) ? child.id : '+'))
    }

    /**
     * 손잡이를 쥐고 그리드 첫 행 높이에서 칸 오른 끝에 대면 칸이 오른쪽 끝까지 밀린다(처음 칸 밖이던 넷째 열이 보인다). 닿은 순간에는 포인터
     * 밑이 문서라 자리가 보이고, 끝까지 민 뒤에는 포인터 밑이 칸의 안쪽 여백(문서 밖)이라 **포인터를 안 움직여도** 표시가 걷힌다 — 밀 때마다
     * 같은 좌표로 다시 묻는다(`edgeScrollBy`). 넷째 열의 오른쪽 반에 놓으면 보인 자리(넷째 열 뒤)에 선다. 민 칸에서 보이는 넷째 열을 골라 그 손잡이를 쥐고 왼 끝에 대면 칸이 처음으로 돌아온다.
     */
    it('손잡이 — 오른 끝에서 오른쪽으로 · 왼 끝에서 왼쪽으로 밀고, 민 뒤에 보인 자리에 놓인다', async () => {
      const P = await fixture('edge-handle', WIDE)
      const { page, close } = await openWide(P)
      try {
        const hiddenBefore = await page.evaluate(() => {
          const pane = document.querySelector('.wb-shell-canvas')!.getBoundingClientRect()
          const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
          const r = iframe.contentDocument!.querySelector('[data-wb-id="n_w3"]')!.getBoundingClientRect()
          return iframe.getBoundingClientRect().x + r.x > pane.right
        })
        await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_src"] button').first().click()
        const handle = page.locator('.wb-shell-canvas-handle')
        await handle.waitFor()
        const hb = (await handle.boundingBox())!
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
        await page.mouse.down()
        await page.mouse.move(hb.x + hb.width / 2 + 3, hb.y + hb.height / 2 + 6, { steps: 3 })
        const row = await spot(page, 'n_w0', 0.5, 0.5)
        let arrived = false
        const pushedRight = await holdAtEdge(page, 'right', row.y, async () => {
          arrived = (await shownDrops(page)).some((drop) => drop.kind === 'preview')
        })
        const held = (await shownDrops(page)).length
        const over = await spot(page, 'n_w3', 0.8, 0.5)
        await page.mouse.move(over.x, over.y, { steps: 6 })
        await page.waitForTimeout(150)
        const shownAt = (await shownDrops(page)).find((drop) => drop.kind === 'preview')
        const preview = shownAt === undefined ? null : { parent: shownAt.parent, prev: shownAt.prev, next: shownAt.next }
        await page.mouse.up()
        // 놓은 뒤 서버 판 — 놓기가 안 나간 판도 값(시드 그대로)으로 견준다.
        await page.waitForTimeout(500)
        const landed = await serverGrid(P)

        await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_w3"] button').first().click()
        await page.locator('.wb-shell-selection[data-wb-selected-id="n_w3"]').waitFor()
        await handle.waitFor()
        const hb2 = (await handle.boundingBox())!
        await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2)
        await page.mouse.down()
        await page.mouse.move(hb2.x + hb2.width / 2 - 3, hb2.y + hb2.height / 2 + 6, { steps: 3 })
        const pushedLeft = await holdAtEdge(page, 'left')
        await page.keyboard.press('Escape')
        await page.mouse.up()

        expect({
          hiddenBefore,
          pushedRight: pushedRight > 0,
          arrived,
          held,
          preview,
          landed,
          pushedLeft: pushedLeft < 0,
          endsAtStart: await scrollLeft(page),
        }).toEqual({
          hiddenBefore: true,
          pushedRight: true,
          arrived: true,
          held: 0,
          preview: { parent: 'n_grid', prev: 'n_w3', next: 'n_w4' },
          landed: ['n_w0', 'n_w1', 'n_w2', 'n_w3', 'n_src', 'n_w4', 'n_w5', 'n_w6', 'n_w7'],
          pushedLeft: true,
          endsAtStart: 0,
        })
      } finally {
        await close()
      }
    })

    /** 하단 판의 «구분선» 카드를 쥐고 칸 오른 끝에 대면 칸이 밀리고, 넷째 열의 왼쪽 반에 놓으면 보인 자리(넷째 열 앞)에 선다. */
    it('카드 — 오른 끝에서 밀고, 민 뒤에 보인 자리에 놓인다', async () => {
      const P = await fixture('edge-card', WIDE)
      const { page, close } = await openWide(P)
      try {
        await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
        await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Divider')
        const card = page.locator('[data-wb-palette-card="Divider"]')
        await card.waitFor()
        const cb = (await card.boundingBox())!
        await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
        await page.mouse.down()
        await page.mouse.move(cb.x + cb.width / 2 + 3, cb.y + cb.height / 2 - 6, { steps: 3 })
        const pushed = await holdAtEdge(page, 'right')
        const over = await spot(page, 'n_w3', 0.2, 0.5)
        await page.mouse.move(over.x, over.y, { steps: 6 })
        await page.waitForTimeout(150)
        const shownAt = (await shownDrops(page)).find((drop) => drop.kind === 'preview')
        const preview = shownAt === undefined ? null : { parent: shownAt.parent, prev: shownAt.prev, next: shownAt.next }
        await page.mouse.up()
        await page.waitForTimeout(500)
        const landed = await serverGrid(P)
        expect({ pushed: pushed > 0, preview, landed }).toEqual({
          pushed: true,
          preview: { parent: 'n_grid', prev: 'n_w2', next: 'n_w3' },
          landed: ['n_w0', 'n_w1', 'n_w2', '+', 'n_w3', 'n_w4', 'n_w5', 'n_w6', 'n_w7'],
        })
      } finally {
        await close()
      }
    })

    /**
     * 그리드 왼쪽 바깥(칸의 빈 여백)에서 눌러 칸 오른 끝에 대면 칸이 밀리고, 넷째 열의 오른쪽 아래 바깥에서 떼면 처음 화면 밖이던 넷째 열까지
     * 감싼다 — 판정은 문서 좌표다(`src/canvas/canvas-marquee.ts`).
     */
    it('사각형 — 오른 끝에서 밀고, 처음 화면 밖이던 넷째 열까지 감싼다', async () => {
      const P = await fixture('edge-marquee', WIDE)
      const { page, close } = await openWide(P)
      try {
        const start = await spot(page, 'n_w0', 0, 0)
        await page.mouse.move(start.x - 12, start.y - 4)
        await page.mouse.down()
        await page.mouse.move(start.x + 40, start.y + 20, { steps: 5 })
        const pushed = await holdAtEdge(page, 'right')
        const end = await spot(page, 'n_w3', 1, 1)
        await page.mouse.move(end.x + 4, end.y + 4, { steps: 6 })
        await page.mouse.up()
        const picked = await page.evaluate(() => {
          const anchor = document.querySelector('[data-wb-selected-id]')?.getAttribute('data-wb-selected-id') ?? null
          const members = [...document.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id')!)
          return [...(anchor === null ? [] : [anchor]), ...members].sort()
        })
        expect({ pushed: pushed > 0, picked }).toEqual({ pushed: true, picked: ['n_w0', 'n_w1', 'n_w2', 'n_w3'] })
      } finally {
        await close()
      }
    })
  })
})

/** «화면 맞춤»을 누른다 — 머리에 줌 묶음이 없으면(접힌 머리) `…` 의 항목으로. 같은 자리의 메뉴를 다시 열 때는 더블클릭 간격을 넘긴다. */
async function pressFit(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: '화면 맞춤', exact: true })
  if ((await button.count()) > 0) {
    await button.click()
    return
  }
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '더 보기', exact: true }).click()
  await page.getByRole('menuitem', { name: '화면 맞춤', exact: true }).click()
}

/** 칸 · 무대 · 프레임의 지금 값 — 줌은 프레임의 그려진 폭 ÷ 레이아웃 폭(구현의 줌 값을 안 읽는다). */
async function canvasState(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.wb-shell-canvas') as HTMLElement
    const frame = document.querySelector('.wb-shell-canvas-frame') as HTMLElement
    const stage = document.querySelector('.wb-shell-canvas-stage') as HTMLElement
    const c = canvas.getBoundingClientRect()
    const f = frame.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    const zoom = f.width / frame.offsetWidth
    const bottom = f.bottom - c.top + canvas.scrollTop + 24
    return {
      zoom,
      presetWidth: frame.offsetWidth,
      // 판 — 무대의 폭이 프레임의 보이는 폭이다(줌이 실린 뒤). 높이는 재는 값이라 판 조건에 안 넣는다(`gapY`).
      settled: Math.abs(s.width - f.width) < 1,
      overX: canvas.scrollWidth - canvas.clientWidth,
      overY: canvas.scrollHeight - canvas.clientHeight,
      // 세로 넘침과 «보이는 문서 아래끝 + 여백» 의 차 — 문서가 칸보다 짧으면 넘침이 없어야 한다.
      gapY: canvas.scrollHeight - Math.max(canvas.clientHeight, bottom),
    }
  })
}

async function widths(page: Page) {
  return page.evaluate(() => {
    const width = (selector: string) => Math.round(document.querySelector(selector)!.getBoundingClientRect().width)
    const shell = document.querySelector('.wb-shell') as HTMLElement
    const folded = (name: string) =>
      document.querySelector(`.wb-shell-fold-toggle[aria-label^="${name}"]`)?.getAttribute('aria-expanded') === 'false'
    return {
      window: window.innerWidth,
      side: width('.wb-shell-side'),
      panel: width('.wb-shell-panel'),
      canvas: width('.wb-shell-canvas'),
      handles: [...document.querySelectorAll('[role="separator"][aria-orientation="vertical"]')].map((element) =>
        element.getAttribute('aria-label'),
      ),
      folded: { side: folded('좌측'), panel: folded('우측') },
      shellOverflow: shell.scrollWidth - shell.clientWidth,
    }
  })
}

/** 셸이 다시 그릴 때까지(두 프레임) 기다린 뒤 폭을 읽는다. */
async function settled(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return widths(page)
}
