/**
 * **좁은 창 문턱 바로 위(641 ~ 1024px)와 PPTX 캡처 폭(720)에서 쌍 격자가 넘치지 않는가** — 실브라우저 판(내보낸 번들 · 화면 모드). 문턱 위에서는 열 수가
 * 그대로인 채 라벨 칸이 열마다 빠져 값 칸이 가장 좁다(`docs/superpowers/plans/2026-10-25-rv-ft-report.md` M2 · M3).
 *
 * | 판 | 재는 값 |
 * |---|---|
 * | 기본테마 1.6.0 · SDK 기본 CSS(같은 번들에서 `assets/theme/theme.css` 를 비운 판) × 창 700 · 720 · 768 · 900 · 1024 · 1280 | 문서 `scrollWidth` = 창 폭 · 값 칸 안 글자 · 상자의 오른끝이 그 값 칸 안 |
 * | 같은 판 | 값 칸 안 폼 표(하위 표)의 입력칸 폭 — 값 칸에서 내용 폭으로 줄어 손톱만 해지지 않는다(RV-FT L3) |
 * | PPTX(기본테마) | 화면 이미지 폭 = 캡처 폭 × 2 — 문서가 캡처 폭보다 넓으면 그림이 넓어진다 |
 *
 * 표본(두 페이지): «폼» — 1 · 2 · 3 열 폼 표(제목 · 머리 오른쪽 · 옆 칸 · 몫 · 세그먼트 7 · 기간 + 단추) · 입력폼 안 2열 표 · 2열 조회 폼(«상태» 세그먼트 7).
 * «넓은 값» — 값 칸에 그리드 · 목록 · 카드 · 기간 + 단추 · 세그먼트 7 · 긴 낱말 · 자리표시자 · 하위 폼 표를 든 2열 · 1열 표.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, layoutProject, openBundlePage, type UnpackedBundle } from './layout-bundle'
import { decodePng } from './png-pixels'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEME = 'system-admin'
const WIDTHS = [700, 720, 768, 900, 1024, 1280] as const
const LONG = 'verylongunbrokenaddresslineforthecustomer@subdomain.example-company-internal.co.kr'

let seq = 0
const id = (prefix: string) => `${prefix}${(seq++).toString(36).padStart(3, '0')}`
const field = (label: string, pieces?: unknown[], more: Record<string, unknown> = {}) => ({
  id: id('f'),
  type: 'Field',
  props: { label, ...(more.required === true ? { required: true } : {}) },
  children: pieces ?? [{ id: id('i'), type: 'Input', props: {} }],
  ...(more.weight === undefined ? {} : { weight: more.weight }),
})
const text = (content: string) => ({ id: id('t'), type: 'Text', props: { content } })
const button = (label: string) => ({ id: id('b'), type: 'Button', props: { label } })
const table = (columns: number, children: unknown[], more: Record<string, unknown> = {}) => ({
  id: id('ft'),
  type: 'FormTable',
  props: { columns, ...(more.title === undefined ? {} : { title: more.title }) },
  children,
  ...(more.zones === undefined ? {} : { zones: more.zones }),
})
const dateRange = () => [
  { id: id('d'), type: 'DateInput', props: { value: '2026-01-01' } },
  { id: id('a'), type: 'Affix', props: { text: '~' } },
  { id: id('d'), type: 'DateInput', props: { value: '2026-12-31' } },
  button('조회'),
]
const seg7 = () => [
  {
    id: id('r'),
    type: 'RadioGroup',
    props: {
      options: ['전체', '대기', '진행', '보류', '완료', '취소', '반려'].map((label, i) => ({
        label,
        ...(i === 0 ? { selected: true } : {}),
      })),
    },
  },
]

const FORMS = [
  table(1, [field('이름', undefined, { required: true }), field('가입 경로 및 추천인 정보 입력'), field('주소', [text(LONG)])], {
    title: '기본 정보',
  }),
  table(
    2,
    [
      field('이름', undefined, { required: true }),
      field('전화'),
      field('메모', [text(`긴 메모 ${'가나다라마바사 '.repeat(12)}`)], { weight: 2 }),
      field('상태', seg7()),
      field('', []),
      field('기간', dateRange()),
      field('끝'),
    ],
    { title: '계정상태 정보', zones: { headEnd: [button('처리이력조회')] } },
  ),
  table(2, [field('사진 옆 1'), field('사진 옆 2'), field('사진 옆 3')], {
    zones: { aside: [{ id: id('ph'), type: 'Placeholder', props: { label: '사진', width: 120, height: 150 } }] },
  }),
  {
    id: id('ef'),
    type: 'EntryForm',
    props: { title: '새 입력폼(2열)' },
    children: [table(2, [field('가'), field('나'), field('다')])],
    zones: { actions: [button('저장'), button('취소')] },
  },
  table(3, [field('셋 1'), field('셋 2', undefined, { weight: 2 }), field('셋 3', undefined, { weight: 3 }), field('셋 4')]),
  {
    id: id('sf'),
    type: 'SearchForm',
    props: { columns: 2 },
    children: [field('검색어'), field('상태', seg7()), field('기간', dateRange(), { weight: 2 })],
  },
]
const wideValues = () => [
  field('격자 배치', [
    { id: id('g'), type: 'Grid', props: { columns: 3 }, children: ['하나', '둘', '셋', '넷', '다섯', '여섯'].map(text) },
  ]),
  field('그리드 표', [
    {
      id: id('l'),
      type: 'DataGrid',
      props: {},
      children: ['이름', '이메일', '가입일', '상태'].map((label) => ({ id: id('lc'), type: 'GridColumn', props: { label } })),
      zones: { rows: [{ id: id('lr'), type: 'GridRow', props: { repeat: 2 } }] },
    },
  ]),
  field('카드', [{ id: id('c'), type: 'Card', props: { title: '값 칸 카드' }, children: [text('카드 몸통')] }]),
  field('기간 + 단추', dateRange()),
  field('세그먼트 7', seg7()),
  field('긴 낱말', [text(LONG)]),
  field('자리표시자', [{ id: id('ph'), type: 'Placeholder', props: { label: '그림', width: 320, height: 120 } }]),
  field('하위 표', [table(2, [field('안 1'), field('안 2'), field('안 3')])]),
]
const WIDE = [table(2, wideValues(), { title: '넓은 내용 2열' }), table(1, wideValues(), { title: '넓은 내용 1열' })]
const PAGES = { 폼: FORMS, '넓은 값': WIDE }

interface Spill {
  field: string
  label: string
  over: number
  what: string
}
interface Read {
  vw: number
  scrollWidth: number
  fields: number
  spills: Spill[]
  /** 값 칸 안 폼 표(하위 표)에 든 입력칸의 폭. */
  nestedInputs: number[]
}

/**
 * 폼 표 · 열을 정한 조회 폼의 `Field` 마다 값 칸(`value` 조각) 안 상자 · 글자 노드의 오른끝이 값 칸 오른끝 + 1 을 넘는가 — 넘친 조각은 옆 쌍의 라벨 칸 밑에
 * 가려지거나 표 · 창 밖으로 나간다. 값 칸 상자끼리의 겹침으로는 안에서 넘친 조각을 못 센다(RV-FT «2 · 4 덧붙임»). 글로 넘긴다.
 */
const MEASURE = `() => {
  const vw = document.documentElement.clientWidth
  const fields = [...document.querySelectorAll('[data-wb-component="FormTable"] > [data-wb-part="cells"] > [data-wb-component="Field"], [data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns] > [data-wb-component="Field"]')]
  const spills = []
  for (const f of fields) {
    const value = f.querySelector(':scope > [data-wb-part="value"]')
    if (value === null) continue
    const edge = value.getBoundingClientRect().right
    let over = 0
    let what = ''
    for (const el of value.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.right - edge > over) { over = r.right - edge; what = (el.getAttribute('data-wb-component') ?? el.getAttribute('data-wb-part') ?? el.tagName.toLowerCase()) }
    }
    const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      if ((t.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(t)
      for (const r of range.getClientRects()) if (r.width > 0 && r.right - edge > over) { over = r.right - edge; what = '"' + t.textContent.trim().slice(0, 12) + '"' }
    }
    if (over > 1) spills.push({ field: f.getAttribute('data-wb-id'), label: f.querySelector(':scope > [data-wb-part="label"]')?.textContent ?? '', over: Math.round(over), what })
  }
  const nestedInputs = [...document.querySelectorAll('[data-wb-component="Field"] > [data-wb-part="value"] > [data-wb-component="FormTable"] [data-wb-component="Input"]')].map((el) => Math.round(el.getBoundingClientRect().width))
  return { vw, scrollWidth: document.documentElement.scrollWidth, fields: fields.length, spills, nestedInputs }
}`

describe.skipIf(!전제.ok)('시스템 테마 — 폼 표 · 좁은 창 문턱 위 폭', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string
  let bundle: UnpackedBundle
  const reads: Record<string, Read> = {}

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const made = await layoutProject(stack, alice, '폭', PAGES)
    projectId = made.projectId
    await putTheme(made.call, projectId, { themeId: THEME, version: seededVersion(THEME), tokens: {} })
    bundle = await exportBundle(stack, alice, projectId)
    for (const theme of ['1.6.0', 'SDK'] as const) {
      if (theme === 'SDK') {
        // 테마 CSS 를 비운다 — 기본 뷰 · SDK 기본 CSS · 토큰만 선 판(테마가 안 꾸민 판).
        const found = (readdirSync(bundle.dir, { recursive: true }) as string[]).filter((path) => path.endsWith('assets/theme/theme.css'))
        expect(found.length).toBe(1)
        expect(readFileSync(join(bundle.dir, found[0]!), 'utf8').length).toBeGreaterThan(0)
        writeFileSync(join(bundle.dir, found[0]!), '')
      }
      for (const page of Object.keys(PAGES)) {
        for (const width of WIDTHS) {
          const file = bundle.pages[`폭-${page.replace(' ', '-')}`]
          if (file === undefined) throw new Error(`번들에 ${page} 가 없다: ${Object.keys(bundle.pages).join(', ')}`)
          const { context, page: tab } = await openBundlePage(stack, file, { viewport: { width, height: 1600 }, screen: true })
          try {
            reads[`${theme} ${page} ${width}`] = (await tab.evaluate(`(${MEASURE})()`)) as Read
          } finally {
            await context.close()
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    for (const [key, read] of Object.entries(reads))
      console.log(
        `[폭] ${key} 문서 ${read.scrollWidth}/${read.vw} · 필드 ${read.fields} · 넘침 ${JSON.stringify(read.spills)} · 하위 표 입력칸 ${JSON.stringify(read.nestedInputs)}`,
      )
  }, 300_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  for (const theme of ['1.6.0', 'SDK'] as const) {
    it(`${theme === 'SDK' ? 'SDK 기본 CSS' : `기본테마 ${theme}`} — 창 ${WIDTHS.join(' · ')} 에서 문서가 창 폭 안 · 값 칸 내용이 값 칸 안`, () => {
      const got: Record<string, { page: string; spills: string[] }> = {}
      for (const page of Object.keys(PAGES)) {
        for (const width of WIDTHS) {
          const read = reads[`${theme} ${page} ${width}`]!
          // 카나리아 — 문서가 창 폭을 받았고 필드를 쟀다.
          expect(read.vw).toBe(width)
          expect(read.fields).toBeGreaterThan(10)
          got[`${page} ${width}`] = {
            page: `${read.scrollWidth}/${read.vw}`,
            spills: read.spills.map((spill) => `${spill.label} +${spill.over} ${spill.what}`),
          }
        }
      }
      const want = Object.fromEntries(
        Object.keys(got).map((key) => [key, { page: `${key.split(' ').at(-1)}/${key.split(' ').at(-1)}`, spills: [] }]),
      )
      expect(got).toEqual(want)
    })
  }

  for (const theme of ['1.6.0', 'SDK'] as const) {
    it(`${theme === 'SDK' ? 'SDK 기본 CSS' : `기본테마 ${theme}`} — 값 칸 안 폼 표의 입력칸이 값 칸에서 줄어들지 않는다(120px 이상)`, () => {
      const got: Record<string, number[]> = {}
      for (const width of WIDTHS) {
        const read = reads[`${theme} 넓은 값 ${width}`]!
        // 카나리아 — 하위 표 둘(2열 표 · 1열 표의 «하위 표») × 입력칸 셋.
        expect(read.nestedInputs.length).toBe(6)
        got[width] = read.nestedInputs.filter((w) => w < 120)
      }
      expect(got).toEqual(Object.fromEntries(WIDTHS.map((width) => [width, []])))
    })
  }

  it('PPTX — 화면 이미지 폭이 캡처 폭(720)의 두 배다 — 문서가 캡처 폭을 안 넘는다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=pptx`, { headers: { cookie: alice.cookie } })
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const shots = Object.entries(entries).filter(([path]) => path.startsWith('ppt/media/') && path.endsWith('.png'))
    expect(shots.length).toBe(2)
    expect(shots.map(([, bytes]) => decodePng(Buffer.from(bytes)).width)).toEqual([1440, 1440])
  }, 120_000)
})
