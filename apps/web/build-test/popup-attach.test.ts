/**
 * **팝업 안의 파일첨부 · 반복 행 표 — 실브라우저 판**(설계 spec `docs/superpowers/specs/2026-10-26-popup-attach-repeat-design.md` «6» — 팝업 크기가 접기
 * 문턱 노릇). 테마의 접기는 창 폭을 보고, 팝업 상자의 폭(480 · 720 · 960)은 모른다 — 덮개 위 상자 안에 넣은 파일첨부 · 반복 행 표가 상자 밖으로 안
 * 나가는지 재고, 팝업 페이지의 팔레트 «넣기» 가 뿌리(`Popup`)의 몸통 · 바닥 구역에 프리셋 · 파일첨부를 세우는지 잰다.
 *
 * | 판 | 재는 것 |
 * |---|---|
 * | 덮개 층 × 크기 셋 — 에디터 뷰 모드(캔버스 iframe · 창 1440) · 번들 화면 모드(창 1280 · 390) | 상자 폭 · 상자 밖 글자 노드(`Range.getClientRects()`)와 요소 0(그리드는 제 스크롤 상자 안을 빼고 그 상자를 잰다) · 파일첨부가 제 칸 안 · 크기 칸 한 줄 · 이름 칸 글자가 칸 안 · 그리드가 제 칸 안 · 셀 안 조각이 제 행 안 · 머리 칸 한 줄 · 폼 표 줄 수(작은 · 보통은 한 줄에 쌍 하나) |
 * | 여는 단추 | 셋 다 B 의 자리다 — 파일첨부 «단추» 구역(공백 낀 대상) · 반복 행 표 «삭제» 의 사본 줄(접두 없는 대상) · 그리드 머리 오른쪽 · 내보내기 미리보기의 `brokenLinks` 0 · `themeWarning` 없음 |
 * | 팔레트 «넣기» | 팝업 페이지에서 뿌리 줄을 고른 «반복 행 표» · «파일첨부» 는 몸통 끝 · «바닥» 구역 줄을 고른 «반복 행 표» 는 바닥 끝 — 서버 문서 · 캔버스의 `body` 조각 안팎 |
 *
 * 번들은 저장소 빌드의 산출물(api 가 `packages/*\/dist` 를 읽는다)로 그린다 — `pnpm build` 가 먼저다.
 */
import type { Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from './layout-bundle'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEME = 'system-admin'
const TREE = '.wb-shell-region[aria-label="구조 트리"]'
const PRESET = 'DataGrid:repeatRows'
const LONG_EN = 'employment_certificate_hong_gildong_final_revision_v12.pdf'
const LONG_KO = '이천이십육년도하반기정보보안교육결과보고서최종본.hwp'
const SIZES = { 작은: ['small', 480], 보통: ['medium', 720], 넓은: ['large', 960] } as const
type Size = keyof typeof SIZES

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
  interactions?: unknown[]
}

const opens = (target: string) => [{ on: 'click', actions: [{ type: 'openModal', target }] }]
const button = (id: string, label: string, target?: string): Node => ({
  id,
  type: 'Button',
  props: { label },
  ...(target === undefined ? {} : { interactions: opens(target) }),
})
const attach = (p: string, actions: Node[]): Node => ({
  id: `${p}_fa`,
  type: 'FileAttach',
  props: {
    files: [
      { name: '통장사본.PDF', size: '2.1 MB' },
      { name: LONG_EN, size: '100.5 MB' },
      { name: LONG_KO, size: '480 KB' },
    ],
    maxFiles: 3,
    maxSize: '200 MB',
  },
  zones: { actions },
})
/** 팔레트 «반복 행 표» 와 같은 꼴 + 날짜 열(`file-attach-narrow.test.ts` 의 표본과 같다). */
const repeatRows = (p: string, del: Node, add: Node): Node => {
  const column = (n: string, label: string, piece: Node, props: Record<string, unknown> = {}): Node => ({
    id: `${p}_c${n}`,
    type: 'GridColumn',
    props: { label, ...props },
    children: [piece],
  })
  return {
    id: `${p}_g`,
    type: 'DataGrid',
    children: [
      column('1', '자격명', { id: `${p}_i1`, type: 'Input', props: { placeholder: '입력' } }),
      column('2', '발급기관', { id: `${p}_i2`, type: 'Input', props: { placeholder: '입력' } }),
      column('3', '취득일', { id: `${p}_d`, type: 'DateInput', props: { value: '2026-07-04' } }),
      column('4', '삭제', del, { size: 'short', align: 'center' }),
    ],
    zones: { headEnd: [add], rows: [{ id: `${p}_r`, type: 'GridRow', props: { repeat: 2 } }] },
  }
}
/** 팝업 몸통 — 2열 폼 표의 값 칸에 파일첨부 하나 · 몸통 바로 밑에 파일첨부 · 반복 행 표 하나씩. */
const popupBody = (p: string): Node[] => [
  {
    id: `${p}_ft`,
    type: 'FormTable',
    props: { columns: 2 },
    children: [
      { id: `${p}_f1`, type: 'Field', props: { label: '통장사본' }, children: [attach(`${p}_v`, [button(`${p}_va`, '파일추가')])] },
      { id: `${p}_f2`, type: 'Field', props: { label: '이름' }, children: [{ id: `${p}_f2i`, type: 'Input' }] },
    ],
  },
  attach(p, [button(`${p}_a1`, '파일추가'), button(`${p}_a2`, '항목 제거'), button(`${p}_a3`, '전체 항목 제거')]),
  repeatRows(p, button(`${p}_del`, '삭제'), button(`${p}_add`, '추가')),
]
/**
 * 여는 화면 — 여는 단추 셋이 다 B 의 자리다: 파일첨부 «단추» 구역(공백 낀 대상) · 반복 행 표 «삭제»(사본 줄을 누른다 · 접두 없는 대상) · 그리드
 * 머리 오른쪽. 덮개 층 · 번들 · 미리보기가 같은 풀이(`pageTargetKey`)를 지나는지가 이 셋에서 갈린다.
 */
const LIST: Node[] = [
  attach('n_l', [button('n_open_small', '작은 열기', ' page: 관리자 / 작은 ')]),
  repeatRows('n_lg', button('n_open_mid', '보통 열기', '관리자/보통'), button('n_open_wide', '넓은 열기', 'page:관리자/넓은')),
]
/** 덮개 위에서 여는 자리 — 보통은 «삭제» 의 둘째 줄(사본). */
const OPENER: Record<Size, string> = {
  작은: '[data-wb-id="n_open_small"]',
  보통: '[data-wb-copy-of="n_open_mid"]',
  넓은: '[data-wb-id="n_open_wide"]',
}

interface Read {
  vw: number
  scrollWidth: number
  width: number
  /** 상자가 설 수 있는 폭 — 그 겹(`[data-wb-popup-level]`)의 폭 − 좌우 여백(뷰 모드의 겹은 보이는 캔버스 칸에 맞춘다 · 번들은 창 폭). 덮개 틀은 상자에 맞춰 줄어 폭이 늘 상자와 같다. */
  frame: number
  past: number
  over: number
  overWhat: string[]
  texts: number
  attach: { rootOver: number; sizeLines: number[]; nameLines: number[]; nameOver: number }[]
  grids: { rootOver: number; scrollOver: number; pieceOut: number; pieces: number; headLines: number[] }[]
  formRows: number
}

/** 글로 넘긴다(변환기가 함수에 끼우는 도우미가 페이지에 없다). 인자는 팝업 뿌리의 셀렉터. */
const MEASURE = `(selector) => {
  const box = document.querySelector(selector)
  const r = box.getBoundingClientRect()
  const lines = (el) => {
    const tops = new Set()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      if ((t.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(t)
      for (const q of range.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top))
    }
    return tops.size
  }
  const textRight = (el) => {
    let right = -Infinity
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      if ((t.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(t)
      for (const q of range.getClientRects()) if (q.width > 0) right = Math.max(right, q.right)
    }
    return right
  }
  // 그리드는 표만 제 스크롤 상자에서 굴러간다 — 그 상자 안은 빼고, 상자 자체는 잰다.
  const scrolled = (el) => {
    const s = el.closest('[data-wb-part="scroll"]')
    return s !== null && s !== el && box.contains(s)
  }
  let past = 0
  let texts = 0
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
    if ((t.textContent ?? '').trim() === '' || scrolled(t.parentElement)) continue
    texts += 1
    const range = document.createRange()
    range.selectNodeContents(t)
    for (const q of range.getClientRects()) if (q.width > 0 && (q.right > r.right + 0.5 || q.left < r.left - 0.5)) past += 1
  }
  const overWhat = []
  for (const el of box.querySelectorAll('*')) {
    if (scrolled(el)) continue
    const q = el.getBoundingClientRect()
    if (q.width === 0 && q.height === 0) continue
    if (q.right > r.right + 0.5 || q.left < r.left - 0.5) overWhat.push(el.getAttribute('data-wb-part') ?? el.getAttribute('data-wb-component') ?? el.tagName.toLowerCase())
  }
  const attach = [...box.querySelectorAll('[data-wb-component="FileAttach"]')].map((fa) => {
    const names = [...fa.querySelectorAll('[data-wb-part="fileName"]')]
    return {
      rootOver: Math.round(fa.getBoundingClientRect().right - fa.parentElement.getBoundingClientRect().right),
      sizeLines: [...fa.querySelectorAll('[data-wb-part="fileSize"]')].map(lines),
      nameLines: names.map(lines),
      nameOver: Math.round(Math.max(...names.map((cell) => textRight(cell) - cell.getBoundingClientRect().right))),
    }
  })
  const grids = [...box.querySelectorAll('[data-wb-component="DataGrid"]')].map((g) => {
    const gb = g.getBoundingClientRect()
    let pieceOut = 0
    let pieces = 0
    for (const row of g.querySelectorAll('[data-wb-part="table"] > tbody > tr')) {
      const rr = row.getBoundingClientRect()
      for (const piece of row.querySelectorAll('[data-wb-component="Input"], [data-wb-component="DateInput"], [data-wb-component="Button"]')) {
        const p = piece.getBoundingClientRect()
        pieces += 1
        if (p.top < rr.top - 0.5 || p.bottom > rr.bottom + 0.5) pieceOut += 1
      }
    }
    return {
      rootOver: Math.round(gb.right - g.parentElement.getBoundingClientRect().right),
      scrollOver: Math.round(g.querySelector('[data-wb-part="scroll"]').getBoundingClientRect().right - gb.right),
      pieceOut,
      pieces,
      headLines: [...g.querySelectorAll('[data-wb-part="table"] > thead > tr > th')].map(lines),
    }
  })
  const labels = [...box.querySelectorAll('[data-wb-component="FormTable"] [data-wb-component="Field"] > [data-wb-part="label"]')]
  return {
    vw: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    width: Math.round(r.width),
    frame: (() => {
      const level = box.closest('[data-wb-popup-level]')
      const cs = getComputedStyle(level)
      return Math.round(level.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))
    })(),
    past,
    over: overWhat.length,
    overWhat,
    texts,
    attach,
    grids,
    formRows: labels.length === 2 ? new Set(labels.map((label) => Math.round(label.getBoundingClientRect().top))).size : -labels.length,
  }
}`
const LAYER = '[data-wb-popup-frame] > [data-wb-component="Popup"]'

describe.skipIf(!전제.ok)('팝업 안의 파일첨부 · 반복 행 표 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string
  let P = ''
  let EMPTY = ''
  let bundle: UnpackedBundle
  const reads: Record<string, Read> = {}
  const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const ok = (response: { status: number; body: any }, what: string) => {
      if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
      return response.body
    }
    const project = ok(await call('POST', '/projects', { name: '팝업 첨부', slug: `popup-attach-${Date.now().toString(36)}` }), '프로젝트')
    projectId = project.id
    const menu = ok(await call('POST', `/projects/${projectId}/menu`, { parentId: null, title: '관리자' }), '메뉴')
    const pages: [string, 'page' | 'popup', string | null, Node[]][] = [
      ['목록', 'page', null, LIST],
      ...(Object.entries(SIZES) as [Size, readonly [string, number]][]).map(
        ([title, [size]]) => [title, 'popup', size, popupBody(`n_${size}`)] as [string, 'popup', string, Node[]],
      ),
      ['빈', 'popup', null, []],
    ]
    for (const [title, kind, size, nodes] of pages) {
      const made = ok(await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menu.id, title, kind }), title)
      if (title === '목록') P = `/projects/${projectId}/pages/${made.id}`
      if (title === '빈') EMPTY = `/projects/${projectId}/pages/${made.id}`
      const ops: unknown[] = nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value }))
      if (size !== null) ops.push({ op: 'add', path: '/root/props/size', value: size })
      if (ops.length > 0) ok(await call('PATCH', `/projects/${projectId}/pages/${made.id}/ops`, { baseSeq: 0, ops }), `ops ${title}`)
    }
    await putTheme(call, projectId, { themeId: THEME, version: seededVersion(THEME), tokens: {} })

    // 에디터 뷰 모드 — 캔버스 iframe(기기 폭) 안의 덮개 층.
    for (const size of Object.keys(SIZES) as Size[]) {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator(OPENER[size]).click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        await settle(page)
        reads[`뷰 모드 ${size}`] = (await frame.evaluate(`(${MEASURE})(${JSON.stringify(LAYER)})`)) as Read
      })
    }
    // 번들 화면 모드 — 여는 화면에서 덮개를 띄운다.
    bundle = await exportBundle(stack, alice, projectId)
    for (const width of [1280, 390]) {
      for (const size of Object.keys(SIZES) as Size[]) {
        const { context, page } = await openBundlePage(stack, bundle.pages['관리자-목록']!, {
          viewport: { width, height: 900 },
          screen: true,
        })
        try {
          await page.locator(OPENER[size]).click()
          await page.locator('[data-wb-popup-frame]').waitFor()
          await settle(page)
          reads[`번들 ${width} ${size}`] = (await page.evaluate(`(${MEASURE})(${JSON.stringify(LAYER)})`)) as Read
        } finally {
          await context.close()
        }
      }
    }
    for (const [key, read] of Object.entries(reads))
      // eslint-disable-next-line no-console
      console.log(`[팝업 첨부] ${key} ${JSON.stringify(read)}`)
  }, 300_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  it('덮개 위 상자 안 — 상자 밖 글자 · 요소 0 · 파일첨부 크기 칸 한 줄 · 이름 칸 안 · 그리드 제 칸 안 · 조각이 제 행 안 · 머리 칸 한 줄', () => {
    const got: Record<string, unknown> = {}
    const want: Record<string, unknown> = {}
    for (const [key, read] of Object.entries(reads)) {
      // 카나리아 — 상자 안 글을 셌고 파일첨부 둘(값 칸 · 몸통) · 그리드 하나 · 행 둘 × 조각 넷을 쟀다.
      expect([key, read.frame > 300, read.texts > 20, read.attach.length, read.grids.length, read.grids[0]!.pieces]).toEqual([
        key,
        true,
        true,
        2,
        1,
        8,
      ])
      for (const one of read.attach) expect([key, one.nameLines.length, one.sizeLines.length]).toEqual([key, 3, 3])
      got[key] = {
        page: `${read.scrollWidth}/${read.vw}`,
        past: read.past,
        over: read.overWhat,
        attach: read.attach.map((one) => ({ rootIn: one.rootOver <= 1, sizeLines: one.sizeLines, nameIn: one.nameOver <= 1 })),
        grids: read.grids.map((grid) => ({
          rootIn: grid.rootOver <= 1,
          scrollIn: grid.scrollOver <= 1,
          pieceOut: grid.pieceOut,
          headLines: grid.headLines,
        })),
      }
      want[key] = {
        page: `${read.vw}/${read.vw}`,
        past: 0,
        over: [],
        attach: read.attach.map(() => ({ rootIn: true, sizeLines: [1, 1, 1], nameIn: true })),
        grids: [{ rootIn: true, scrollIn: true, pieceOut: 0, headLines: [1, 1, 1, 1] }],
      }
    }
    expect(got).toEqual(want)
  })

  it('팝업 크기가 접기 문턱이다 — 상자 폭은 크기(창보다 넓지 않게) · 작은 · 보통 팝업 안 2열 폼 표는 한 줄에 쌍 하나 · 넓은 팝업은 2열', () => {
    const got: Record<string, unknown> = {}
    const want: Record<string, unknown> = {}
    for (const [key, read] of Object.entries(reads)) {
      const size = key.split(' ').at(-1) as Size
      // 폼 표의 접기는 상자 폭이 아니라 크기 표지(`data-wb-size`)와 창 폭을 본다 — 뷰 모드의 넓은 팝업은 칸에 맞춰 줄어도 2열이다.
      const narrowWindow = key.startsWith('번들 390')
      got[key] = { width: read.width, formRows: read.formRows }
      want[key] = { width: Math.min(SIZES[size][1], read.frame), formRows: size === '넓은' && !narrowWindow ? 1 : 2 }
    }
    expect(got).toEqual(want)
  })

  it('여는 단추가 파일첨부 · 반복 행 표 안이어도 내보내기 미리보기는 끊긴 링크 0 · 테마 경고 없음', async () => {
    const preview = await call('GET', `/projects/${projectId}/export/preview?format=html`)
    expect(preview.status).toBe(200)
    expect({ brokenLinks: preview.body.brokenLinks, themeWarning: preview.body.themeWarning ?? null, theme: preview.body.themeId }).toEqual(
      {
        brokenLinks: [],
        themeWarning: null,
        theme: `${THEME}@${seededVersion(THEME)}`,
      },
    )
  })

  it('팝업 페이지의 팔레트 «넣기» — 뿌리 줄은 몸통 끝 · «바닥» 구역 줄은 바닥 끝에 프리셋 · 파일첨부를 세운다', async () => {
    const server = async (): Promise<Node> => (await call('GET', EMPTY)).body.schema.root as Node
    const root = await server()
    // 판 카나리아 — 빈 팝업은 몸통이 비고 바닥은 기본 내용 둘(«취소» · «저장»)이다.
    expect([root.type, root.children ?? [], (root.zones?.footer ?? []).map((node) => node.props?.label)]).toEqual([
      'Popup',
      [],
      ['취소', '저장'],
    ])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1100 } })
    try {
      await page.goto(EMPTY)
      await canvasFrame(page).locator(`[data-wb-id="${root.id}"]`).waitFor({ state: 'attached' })
      const rootRow = page.locator(`${TREE} [data-tree-row][data-tree-id="${root.id}"]`)
      const footerRow = page.locator(`${TREE} [data-tree-zone-row][data-tree-zone-parent="${root.id}"][data-tree-zone-name="footer"]`)
      const count = async (type: string) => JSON.stringify(await server()).split(`"type":"${type}"`).length - 1
      const landed = async (label: string, type: string, n: number) =>
        poll(
          label,
          () => count(type),
          (k) => k === n,
        )

      if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) === 0) {
        await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
        await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      }
      const add = async (key: string, query: string) => {
        await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(query)
        // 같은 카드의 둘째 누름으로 안 읽히게 더블클릭 간격(`DOUBLE_CLICK_MS`)을 넘긴다.
        await page.waitForTimeout(600)
        await page.locator(`[data-wb-palette-card="${key}"] .wb-shell-palette-add`).click()
      }
      await rootRow.locator('button').first().click()
      await add(PRESET, '반복')
      await landed('몸통 프리셋', 'DataGrid', 1)
      await rootRow.locator('button').first().click()
      await add('FileAttach', '파일')
      await landed('몸통 파일첨부', 'FileAttach', 1)
      // 빈 구역 줄은 뿌리를 고르면 선다(`StructureNode` 의 `showEmpty`).
      await rootRow.locator('button').first().click()
      await footerRow.click()
      await add(PRESET, '반복')
      await landed('바닥 프리셋', 'DataGrid', 2)

      const after = await server()
      const body = (after.children ?? []).map((node) => node.type)
      const footer = (after.zones?.footer ?? []).map((node) => node.type + (node.props?.label === undefined ? '' : ` ${node.props.label}`))
      const presets = [...(after.children ?? []), ...(after.zones?.footer ?? [])].filter((node) => node.type === 'DataGrid')
      expect({ body, footer }).toEqual({ body: ['DataGrid', 'FileAttach'], footer: ['Button 취소', 'Button 저장', 'DataGrid'] })
      // 둘 다 프리셋 꼴 — 머리 오른쪽 «추가» · 열 셋.
      expect(presets.map((grid) => [grid.zones?.headEnd?.[0]?.props?.label, grid.children?.length])).toEqual([
        ['추가', 3],
        ['추가', 3],
      ])
      // 캔버스 — 몸통의 둘은 `body` 조각 안 · 바닥의 표는 `body` 밖(덮개 층이 몸통만 굴린다).
      const frame = await (await page.$('iframe.wb-shell-canvas-iframe'))?.contentFrame()
      if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
      const inBody = await frame.evaluate(
        (ids) => {
          const body = document.querySelector('[data-wb-component="Popup"] > [data-wb-part="body"]')
          return ids.map((id) => {
            const el = document.querySelector(`[data-wb-id="${id}"]`)
            return el === null ? null : body?.contains(el) === true
          })
        },
        [after.children![0]!.id, after.children![1]!.id, presets[1]!.id],
      )
      expect(inBody).toEqual([true, true, false])
    } finally {
      await context.close()
    }
  }, 120_000)
})

/** 두 프레임 — 덮개 위 상자의 배치가 선 뒤 읽는다. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

async function withView(stack: EditorStack, path: string, run: (page: Page, frame: Frame) => Promise<void>): Promise<void> {
  const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(path)
    await canvasFrame(page).locator('[data-wb-id="n_open_small"]').waitFor()
    await page.getByRole('button', { name: '뷰 모드' }).click()
    const handle = await page.$('iframe.wb-shell-canvas-iframe')
    const frame = await handle?.contentFrame()
    if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
    await run(page, frame)
  } finally {
    await context.close()
  }
}
