/**
 * **기본테마 위에서 끄는 동안 캔버스가 안 멈추는가** — 실브라우저 훑기. 에디터는 끄는 동안 배치 미리보기를 `display: none` 으로 숨긴 배치로 놓을 자리를
 * 재는데(`apps/web/src/canvas/canvas-preview.ts` 의 `withoutPreview`), 테마의 형제 셀렉터(`* + *` · `:only-child` …)는 숨긴 요소도 형제로 센다. 그
 * 규칙이 배치(여백)를 바꾸면 미리보기가 선 자리마다 숨긴 배치가 달라져 같은 포인터에서 답이 뒤집히고, 캔버스가 다시 잴 때마다 다시 물어
 * `Maximum update depth` 로 죽는다(캔버스 iframe 이 통째로 사라진다).
 *
 * jsdom 인구조사(`system-themes/admin/test/admin.test.ts` «배치를 바꾸는 규칙은 형제 구조로 안 가른다»)는 셀렉터 글자로 그 꼴을 막는다. 이 케이스는 기하와
 * 무관하게 결과(캔버스가 죽는가 · 답이 뒤집히는가)를 잰다 — 형제 셀렉터로 쌓인 틈을 주던 판(`git show ec71f22b:system-themes/admin/src/theme.css`)을 시딩한
 * 테마로 지으면 다섯 판 가운데 넷이 죽는다(`docs/superpowers/plans/2026-11-13-fx-sk-report.md` «혼자 죽는 변조»). 원문은 리뷰
 * `docs/superpowers/plans/2026-11-13-rv-sk-report.md` «3 · 실브라우저 훑기» 의 탐침이다(창 1000 판을 걷어 판 수를 줄였다).
 *
 * 판 — 구역 안에 글 · 카드(글 · 폼 표 · 그리드 · 조회 폼 · 글) · 탭 패널(같은 꼴) · 테두리 없는 카드 · 폼 표만 든 카드 · 글 셋, 팝업 페이지 몸통에 글 ·
 * 폼 표 · 글 · 그리드 · 글, 서브페이지 레이아웃 페이지(빈 레이아웃 화면과 같은 노드 — 틀은 기본테마의 레이아웃 뷰가 그린다).
 *
 * **서브페이지 판은 캔버스가 틀(`LayoutFrame`)을 그릴 때 틀 규칙(`theme.css` «서브페이지 틀»)을 지난다** — 캔버스가 아직 틀 없이 문서 뿌리만 그리는
 * 판에서는 빈 레이아웃 화면과 같은 판이다. 캔버스에 틀이 서는지(`[data-wb-layout="subpage"]`)는 이 파일이 세지 않는다. 끄는 것은 팔레트 카드(`Button` · `Text` — 카드를 쥐고 위로 200px 끈 뒤)와 캔버스 손잡이(구조 트리 줄을 눌러 고른 글).
 *
 * 점 — 끌기를 세우고 배치가 선 뒤(`dragLayoutSettled`) 잰 노드마다 x = 왼끝 + min(폭/2, 120), y = 위끝 −1 · +1 · 아래끝 −1 · +1 · 다음 형제와의 틈
 * 가운데(마지막이면 아래끝 +4 · +12). 캔버스 칸(`.wb-shell-canvas`) 안 점만. 점마다 steps 4 로 옮긴 뒤 60ms × 6 번 «surface 의 `data-wb-preview` |
 * 미리보기 부모 id @ 차례» 를 읽는다 — iframe 이 없으면 «죽음», 뒤 넷이 둘 이상의 값이면 «뒤집힘». 페이지 오류 · 콘솔의 `Maximum update depth` 를 센다.
 * 죽은 점은 `<노드> <자리> (x,y)` 로 실패 값에 남는다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dragLayoutSettled, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const WIDTH = 1280
const HEIGHT = 1100

type Node = {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
  variant?: string
}
const text = (id: string, content: string): Node => ({ id, type: 'Text', props: { content } })
const input = (id: string): Node => ({ id, type: 'Input', props: {} })
const field = (id: string, label: string): Node => ({ id, type: 'Field', props: { label }, children: [input(`${id}_i`)] })
const formTable = (id: string): Node => ({
  id,
  type: 'FormTable',
  props: { columns: 2 },
  children: [field(`${id}_a`, '이름'), field(`${id}_b`, '상태'), field(`${id}_c`, '기간')],
})
const grid = (id: string): Node => ({
  id,
  type: 'DataGrid',
  props: {},
  children: [
    { id: `${id}_c1`, type: 'GridColumn', props: { label: '이름' }, children: [text(`${id}_c1t`, '홍길동')] },
    { id: `${id}_c2`, type: 'GridColumn', props: { label: '상태' }, children: [text(`${id}_c2t`, '정상')] },
  ],
  zones: { rows: [{ id: `${id}_r`, type: 'GridRow', props: { repeat: 2 } }] },
})
const search = (id: string): Node => ({
  id,
  type: 'SearchForm',
  props: { columns: 2 },
  children: [field(`${id}_a`, '이름'), field(`${id}_b`, '상태'), field(`${id}_c`, '기간')],
  zones: { actions: [{ id: `${id}_go`, type: 'Button', props: { label: '검색' } }] },
})

const SCREEN: Node[] = [
  {
    id: 'sec',
    type: 'Section',
    children: [
      text('s_t1', '구역 첫 글'),
      text('s_t2', '구역 둘째 글'),
      {
        id: 'c1',
        type: 'Card',
        props: { title: '카드' },
        children: [
          text('c1_t1', '카드 글 하나'),
          formTable('c1_ft'),
          text('c1_t2', '카드 글 둘'),
          grid('c1_dg'),
          search('c1_sf'),
          text('c1_t3', '카드 끝 글'),
        ],
      },
      {
        id: 'tabs',
        type: 'Tabs',
        props: { active: 0 },
        children: [
          {
            id: 'tp1',
            type: 'TabPanel',
            props: { label: '기본' },
            children: [text('tp_t1', '탭 글 하나'), formTable('tp_ft'), grid('tp_dg'), text('tp_t2', '탭 글 둘'), search('tp_sf')],
          },
          { id: 'tp2', type: 'TabPanel', props: { label: '상세' }, children: [text('tp2_t', '둘째 탭')] },
        ],
      },
      {
        id: 'cb',
        type: 'Card',
        variant: 'borderless',
        props: { title: '테두리 없는 카드' },
        children: [formTable('cb_ft'), text('cb_t1', '테두리 없는 글'), grid('cb_dg'), text('cb_t2', '끝')],
      },
      { id: 'c2', type: 'Card', props: { title: '홀로 든 폼 표' }, children: [formTable('c2_ft')] },
      text('s_t3', '구역 셋째 글'),
      text('s_t4', '구역 넷째 글'),
      text('s_t5', '구역 다섯째 글'),
    ],
  },
]
const POPUP: Node[] = [text('p_t1', '팝업 글'), formTable('p_ft'), text('p_t2', '팝업 둘째 글'), grid('p_dg'), text('p_t3', '팝업 끝')]

const TARGETS_SCREEN = [
  's_t1',
  's_t2',
  'c1',
  'c1_t1',
  'c1_ft',
  'c1_t2',
  'c1_dg',
  'c1_sf',
  'c1_t3',
  'tabs',
  'tp_t1',
  'tp_ft',
  'tp_dg',
  'tp_t2',
  'tp_sf',
  'cb',
  'cb_ft',
  'cb_t1',
  'cb_dg',
  'cb_t2',
  'c2',
  'c2_ft',
  's_t3',
  's_t4',
  's_t5',
]
const TARGETS_POPUP = ['p_t1', 'p_ft', 'p_t2', 'p_dg', 'p_t3']

/** 머무는 동안의 판 — surface 의 미리보기 자리 · 미리보기 노드의 부모 id 와 차례. iframe 이 없으면 `NO-IFRAME`. 글로 넘긴다. */
const STATE = `(() => {
  const surface = document.querySelector('.wb-shell-canvas-surface')
  const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')
  const doc = iframe && iframe.contentDocument
  if (iframe === null || doc === null) return 'NO-IFRAME'
  const placement = surface && surface.getAttribute('data-wb-preview')
  const isPreview = (el) => (el && el.getAttribute('data-wb-id') || '').startsWith('wb:preview:')
  const root = Array.from(doc.querySelectorAll('[data-wb-id]')).find((el) => isPreview(el) && !isPreview(el.parentElement && el.parentElement.closest('[data-wb-id]')))
  if (!root) return String(placement) + '|-'
  const parent = root.parentElement.closest('[data-wb-id]')
  const sibs = parent ? Array.from(parent.querySelectorAll('[data-wb-id]')).filter((el) => el.parentElement.closest('[data-wb-id]') === parent) : []
  return String(placement) + '|' + (parent ? parent.getAttribute('data-wb-id') : '?') + '@' + sibs.indexOf(root)
})()`

interface Sweep {
  points: number
  flips: string[]
  dead: string[]
  depthErrors: number
}

describe.skipIf(!전제.ok)('기본테마 — 끄는 동안 캔버스가 안 멈춘다(훑기)', () => {
  let stack: EditorStack
  let alice: Session
  let screenUrl = ''
  let popupUrl = ''
  let subpageUrl = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const ok = (response: { status: number; body: any }, what: string) => {
      if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
      return response.body
    }
    const project = ok(await call('POST', '/projects', { name: '훑기', slug: `drag-sweep-${Date.now().toString(36)}` }), '프로젝트')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' }), '메뉴')
    const add = (nodes: Node[]) => nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value }))
    const screen = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '화면', kind: 'page' }), '화면')
    ok(await call('PATCH', `/projects/${project.id}/pages/${screen.id}/ops`, { baseSeq: 0, ops: add(SCREEN) }), 'ops 화면')
    const subpage = ok(
      await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '서브', kind: 'page', layout: 'subpage' }),
      '서브페이지',
    )
    ok(await call('PATCH', `/projects/${project.id}/pages/${subpage.id}/ops`, { baseSeq: 0, ops: add(SCREEN) }), 'ops 서브페이지')
    const popup = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '팝업', kind: 'popup' }), '팝업')
    ok(await call('PATCH', `/projects/${project.id}/pages/${popup.id}/ops`, { baseSeq: 0, ops: add(POPUP) }), 'ops 팝업')
    screenUrl = `/projects/${project.id}/pages/${screen.id}`
    subpageUrl = `/projects/${project.id}/pages/${subpage.id}`
    popupUrl = `/projects/${project.id}/pages/${popup.id}`
  }, 300_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  /** 겨눌 점 — 노드마다 위끝 −1 · +1 · 아래끝 −1 · +1, 형제 사이 틈 가운데, 마지막 노드 아래 끝 띠(+4 · +12). 주 창 좌표. */
  async function points(page: Page, ids: string[]): Promise<{ id: string; tag: string; x: number; y: number }[]> {
    const iframe = (await page.$('iframe.wb-shell-canvas-iframe'))!
    const outer = await iframe.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, scale: r.width / (el as HTMLElement).offsetWidth }
    })
    const boxes: Record<string, { x: number; y: number; w: number; h: number; next: number | null }> =
      await (await iframe.contentFrame())!.evaluate((wanted) => {
        const out: Record<string, { x: number; y: number; w: number; h: number; next: number | null }> = {}
        for (const id of wanted) {
          const el = document.querySelector(`[data-wb-id="${id}"]`)
          if (el === null) continue
          const r = el.getBoundingClientRect()
          let sib = el.nextElementSibling
          while (sib !== null && !sib.hasAttribute('data-wb-id')) sib = sib.nextElementSibling
          out[id] = { x: r.x, y: r.y, w: r.width, h: r.height, next: sib === null ? null : sib.getBoundingClientRect().top }
        }
        return out
      }, ids)
    const pane = await page.evaluate(() => {
      const r = document.querySelector('.wb-shell-canvas')!.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    })
    const out: { id: string; tag: string; x: number; y: number }[] = []
    for (const [id, b] of Object.entries(boxes)) {
      const x = outer.x + (b.x + Math.min(b.w / 2, 120)) * outer.scale
      const at = (tag: string, y: number) => out.push({ id, tag, x, y: outer.y + y * outer.scale })
      at('top-1', b.y - 1)
      at('top+1', b.y + 1)
      at('bot-1', b.y + b.h - 1)
      at('bot+1', b.y + b.h + 1)
      if (b.next !== null) at('gap', (b.y + b.h + b.next) / 2)
      else {
        at('end+4', b.y + b.h + 4)
        at('end+12', b.y + b.h + 12)
      }
    }
    return out.filter((p) => p.y > pane.top + 4 && p.y < pane.bottom - 30 && p.x > pane.left && p.x < pane.right)
  }

  async function sweep(url: string, ids: string[], grab: (page: Page) => Promise<void>): Promise<Sweep> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: WIDTH, height: HEIGHT } })
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' || /Maximum update depth/.test(m.text())) errors.push(m.text().slice(0, 160))
    })
    page.on('pageerror', (e) => errors.push(`pageerror ${String(e.message).slice(0, 160)}`))
    const flips: string[] = []
    const dead: string[] = []
    let total = 0
    try {
      await page.goto(url)
      await page.frameLocator('iframe.wb-shell-canvas-iframe').locator(`[data-wb-id="${ids[0]}"]`).waitFor({ state: 'attached' })
      await page.waitForTimeout(500)
      await grab(page)
      await dragLayoutSettled(page)
      const pts = await points(page, ids)
      total = pts.length
      for (const p of pts) {
        await page.mouse.move(p.x, p.y, { steps: 4 })
        const seen: string[] = []
        for (let k = 0; k < 6; k += 1) {
          await page.waitForTimeout(60)
          seen.push(String(await page.evaluate(STATE)))
        }
        const where = `${p.id} ${p.tag} (${Math.round(p.x)},${Math.round(p.y)})`
        if (seen.includes('NO-IFRAME')) {
          dead.push(where)
          break
        }
        // 첫 둘은 옮겨 가는 중일 수 있다 — 뒤 넷에서 값이 둘 이상이면 같은 포인터에서 뒤집힘.
        if (new Set(seen.slice(2)).size > 1) flips.push(`${where} ${seen.join(' ')}`)
      }
      await page.mouse.up()
    } finally {
      await context.close()
    }
    return { points: total, flips, dead, depthErrors: errors.filter((e) => /Maximum update depth/.test(e)).length }
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
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
    await page.mouse.move(at.x + 3, at.y - 200, { steps: 6 })
  }

  async function grabHandle(page: Page, id: string): Promise<void> {
    const row = page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
    await row.locator('button').first().click()
    const handle = page.locator('.wb-shell-canvas-handle')
    await handle.waitFor()
    const box = (await handle.boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y + 6, { steps: 3 })
  }

  const CASES: [string, () => string, string[], (page: Page) => Promise<void>, number][] = [
    ['화면 · 팔레트 Button', () => screenUrl, TARGETS_SCREEN, (p) => grabCard(p, 'Button'), 20],
    ['화면 · 팔레트 Text', () => screenUrl, TARGETS_SCREEN, (p) => grabCard(p, 'Text'), 20],
    ['화면 · 손잡이 s_t4', () => screenUrl, TARGETS_SCREEN, (p) => grabHandle(p, 's_t4'), 20],
    ['서브페이지 · 팔레트 Button', () => subpageUrl, TARGETS_SCREEN, (p) => grabCard(p, 'Button'), 20],
    ['서브페이지 · 손잡이 s_t4', () => subpageUrl, TARGETS_SCREEN, (p) => grabHandle(p, 's_t4'), 20],
    ['팝업 · 팔레트 Text', () => popupUrl, TARGETS_POPUP, (p) => grabCard(p, 'Text'), 15],
    ['팝업 · 손잡이 p_t3', () => popupUrl, TARGETS_POPUP, (p) => grabHandle(p, 'p_t3'), 15],
  ]

  it.each(CASES)(
    '%s — 점마다 머물러도 캔버스가 안 죽고 답이 안 뒤집힌다',
    async (label, url, ids, grab, least) => {
      const got = await sweep(url(), ids, grab)
      // eslint-disable-next-line no-console
      console.log(`[훑기] ${label} ${JSON.stringify(got)}`)
      // 카나리아 — 캔버스 칸 안의 점을 그만큼 겨눴다(죽은 판은 그 점에서 멈추므로 죽음을 먼저 본다).
      expect({ dead: got.dead, depthErrors: got.depthErrors, flips: got.flips }).toEqual({ dead: [], depthErrors: 0, flips: [] })
      expect(got.points).toBeGreaterThan(least)
    },
    300_000,
  )
})
