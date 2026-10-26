/**
 * **좁은 칸 안의 파일첨부 · 반복 행 표 — 실브라우저 판**(설계 spec `docs/superpowers/specs/2026-10-26-popup-attach-repeat-design.md` «6»). 테마의 접기는 창
 * 폭(`@media`)을 보고 칸 폭을 모른다 — 2열 폼 표의 값 칸 · 격자 배치 2열 · 카드 안에 넣은 판을 창 390 · 720(PPTX 캡처 폭) · 961 · 1000(접기 문턱 960
 * 바로 위 — 열 수가 그대로라 칸이 가장 좁다) · 1280 에서 잰다. 내보낸 번들의 화면 모드(`#wb-screen` — 문서 폭 = 창 폭)다.
 *
 * | 판 | 재는 값 |
 * |---|---|
 * | 기본테마 · SDK 기본 CSS(같은 번들에서 테마 CSS 를 비운 판) × 창 다섯 | 문서 `scrollWidth` = 창 폭 · 파일첨부의 글자 노드(`Range.getClientRects()`) · 요소 오른끝이 파일첨부 안 · 파일첨부가 제 칸 안 · 크기 칸 한 줄 · 긴 이름 칸 안(390 은 두 줄 이상) · 한도 수가 기본테마에서만 빨갛다 |
 * | 같은 판 | 반복 행 표가 제 칸 안(표만 제 스크롤 상자에서 굴러간다) · 셀 안 입력 · 단추가 제 행 안 · 머리 칸 글 한 줄 |
 * | PPTX(기본테마) | 폼 표 · 카드 페이지의 화면 그림 폭 = 캡처 폭 × 2 — 문서가 캡처 폭을 안 넘는다(격자 배치 2열은 찍는 판이 표를 펼쳐 넓다 — 값만 적는다) |
 *
 * 표본 이름은 하이픈 없는 긴 낱말 · 띄어 쓰지 않은 한글 낱말이다(하이픈 뒤에서 브라우저가 줄을 바꿔 넘침을 못 보인다).
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
const WIDTHS = [390, 720, 961, 1000, 1280] as const
const LONG_EN = 'employment_certificate_hong_gildong_final_revision_v12.pdf'
const LONG_KO = '이천이십육년도하반기정보보안교육결과보고서최종본.hwp'

let seq = 0
const id = (prefix: string) => `${prefix}${(seq++).toString(36).padStart(3, '0')}`
const button = (label: string) => ({ id: id('b'), type: 'Button', props: { label } })
const attach = () => ({
  id: id('fa'),
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
  zones: { actions: [button('파일추가'), button('항목 제거'), button('전체 항목 제거')] },
})
/** 팔레트 «반복 행 표» 와 같은 꼴 + 날짜 열(입력이 셋인 줄). */
const repeatRows = () => {
  const column = (label: string, pieces: unknown[], props: Record<string, unknown> = {}) => ({
    id: id('c'),
    type: 'GridColumn',
    props: { label, ...props },
    children: pieces,
  })
  return {
    id: id('g'),
    type: 'DataGrid',
    children: [
      column('자격명', [{ id: id('i'), type: 'Input', props: { placeholder: '입력' } }]),
      column('발급기관', [{ id: id('i'), type: 'Input', props: { placeholder: '입력' } }]),
      column('취득일', [{ id: id('d'), type: 'DateInput', props: { value: '2026-07-04' } }]),
      column('삭제', [button('삭제')], { size: 'short', align: 'center' }),
    ],
    zones: { headEnd: [button('추가')], rows: [{ id: id('r'), type: 'GridRow', props: { repeat: 2 } }] },
  }
}
const field = (label: string, pieces: unknown[]) => ({ id: id('f'), type: 'Field', props: { label }, children: pieces })

const PAGES = {
  폼표: [
    {
      id: id('ft'),
      type: 'FormTable',
      props: { columns: 2, title: '등록' },
      children: [
        field('통장사본', [attach()]),
        field('자격사항', [repeatRows()]),
        field('이름', [{ id: id('i'), type: 'Input', props: {} }]),
        field('비고', [attach()]),
      ],
    },
  ],
  격자: [{ id: id('gr'), type: 'Grid', props: { columns: 2 }, children: [attach(), repeatRows()] }],
  카드: [{ id: id('cd'), type: 'Card', props: { title: '첨부' }, children: [attach(), repeatRows()] }],
}

interface AttachRead {
  id: string
  /** 파일첨부 뿌리 오른끝 − 제 칸(부모 요소) 오른끝. */
  rootOver: number
  /** 안의 요소 · 글자 노드 오른끝 − 파일첨부 오른끝(가장 큰 것)과 그것. */
  over: number
  what: string
  sizeLines: number[]
  nameLines: number[]
  /** 이름 칸 글자 오른끝 − 이름 칸 오른끝. */
  nameOver: number
  /** 한도 글의 개수 조각 글 색(계산 값) — 기본테마가 빨갛게 칠하는지. */
  limitColor: string
}
interface GridRead {
  id: string
  rootOver: number
  scrollOver: number
  /** 제 행 밖으로 나간 셀 안 조각(입력 · 날짜 · 단추) 수. */
  pieceOut: number
  pieces: number
  headLines: number[]
}
interface Read {
  vw: number
  scrollWidth: number
  attach: AttachRead[]
  grids: GridRead[]
}

/** 글로 넘긴다(변환기가 함수에 끼우는 도우미가 페이지에 없다). */
const MEASURE = `() => {
  const lines = (el) => {
    const tops = new Set()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t !== null; t = walker.nextNode()) {
      if ((t.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(t)
      for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top))
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
      for (const r of range.getClientRects()) if (r.width > 0) right = Math.max(right, r.right)
    }
    return right
  }
  const attach = [...document.querySelectorAll('[data-wb-component="FileAttach"]')].map((fa) => {
    const box = fa.getBoundingClientRect()
    const host = fa.parentElement.getBoundingClientRect()
    let over = -Infinity
    let what = ''
    for (const el of fa.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.right - box.right > over) { over = r.right - box.right; what = el.getAttribute('data-wb-part') ?? el.tagName.toLowerCase() }
    }
    const t = textRight(fa) - box.right
    if (t > over) { over = t; what = 'text' }
    const names = [...fa.querySelectorAll('[data-wb-part="fileName"]')]
    return {
      id: fa.getAttribute('data-wb-id'),
      rootOver: Math.round(box.right - host.right),
      over: Math.round(over),
      what,
      sizeLines: [...fa.querySelectorAll('[data-wb-part="fileSize"]')].map(lines),
      nameLines: names.map(lines),
      nameOver: Math.round(Math.max(...names.map((cell) => textRight(cell) - cell.getBoundingClientRect().right))),
      limitColor: getComputedStyle(fa.querySelector('[data-wb-part="limitCount"]')).color,
    }
  })
  const grids = [...document.querySelectorAll('[data-wb-component="DataGrid"]')].map((g) => {
    const box = g.getBoundingClientRect()
    const host = g.parentElement.getBoundingClientRect()
    const scroll = g.querySelector('[data-wb-part="scroll"]').getBoundingClientRect()
    let pieceOut = 0
    let pieces = 0
    for (const row of g.querySelectorAll('[data-wb-part="table"] > tbody > tr')) {
      const r = row.getBoundingClientRect()
      for (const piece of row.querySelectorAll('[data-wb-component="Input"], [data-wb-component="DateInput"], [data-wb-component="Button"]')) {
        const p = piece.getBoundingClientRect()
        pieces += 1
        if (p.top < r.top - 0.5 || p.bottom > r.bottom + 0.5) pieceOut += 1
      }
    }
    return {
      id: g.getAttribute('data-wb-id'),
      rootOver: Math.round(box.right - host.right),
      scrollOver: Math.round(scroll.right - box.right),
      pieceOut,
      pieces,
      headLines: [...g.querySelectorAll('[data-wb-part="table"] > thead > tr > th')].map(lines),
    }
  })
  return { vw: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, attach, grids }
}`

describe.skipIf(!전제.ok)('좁은 칸 안의 파일첨부 · 반복 행 표', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string
  let bundle: UnpackedBundle
  const reads: Record<string, Read> = {}

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const made = await layoutProject(stack, alice, '좁은칸', PAGES)
    projectId = made.projectId
    await putTheme(made.call, projectId, { themeId: THEME, version: seededVersion(THEME), tokens: {} })
    bundle = await exportBundle(stack, alice, projectId)
    for (const theme of ['기본테마', 'SDK'] as const) {
      if (theme === 'SDK') {
        const found = (readdirSync(bundle.dir, { recursive: true }) as string[]).filter((path) => path.endsWith('assets/theme/theme.css'))
        expect(found.length).toBe(1)
        expect(readFileSync(join(bundle.dir, found[0]!), 'utf8')).toContain('FileAttach')
        writeFileSync(join(bundle.dir, found[0]!), '')
      }
      for (const page of Object.keys(PAGES)) {
        for (const width of WIDTHS) {
          const file = bundle.pages[`좁은칸-${page}`]
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
    for (const [key, read] of Object.entries(reads))
      // eslint-disable-next-line no-console
      console.log(
        `[좁은 칸] ${key} 문서 ${read.scrollWidth}/${read.vw} · 첨부 ${JSON.stringify(read.attach)} · 표 ${JSON.stringify(read.grids)}`,
      )
  }, 300_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  for (const theme of ['기본테마', 'SDK'] as const) {
    it(`${theme} — 파일첨부가 제 칸 안 · 글자 · 요소가 파일첨부 안 · 크기 칸 한 줄 · 긴 이름은 칸 안(390 은 두 줄 이상)`, () => {
      const got: Record<string, unknown> = {}
      const want: Record<string, unknown> = {}
      for (const page of Object.keys(PAGES)) {
        for (const width of WIDTHS) {
          const read = reads[`${theme} ${page} ${width}`]!
          // 카나리아 — 창 폭을 받았고 파일첨부 · 이름 칸 · 크기 칸을 쟀다.
          expect(read.vw).toBe(width)
          expect(read.attach.length).toBe(page === '폼표' ? 2 : 1)
          for (const one of read.attach) expect([one.nameLines.length, one.sizeLines.length]).toEqual([3, 3])
          const key = `${page} ${width}`
          got[key] = {
            page: `${read.scrollWidth}/${read.vw}`,
            attach: read.attach.map((one) => ({
              rootIn: one.rootOver <= 1,
              inside: one.over <= 1 ? true : `${one.what} +${one.over}`,
              sizeLines: one.sizeLines,
              nameIn: one.nameOver <= 1,
              longWraps: width === 390 ? one.nameLines.slice(1).every((n) => n >= 2) : true,
              // 기본테마는 한도 수를 빨간(`--wb-semantic-danger` 기본값) 글로 칠한다 — SDK 기본 CSS 는 색을 안 정한다.
              red: one.limitColor === 'rgb(239, 68, 68)',
            })),
          }
          want[key] = {
            page: `${width}/${width}`,
            attach: read.attach.map(() => ({
              rootIn: true,
              inside: true,
              sizeLines: [1, 1, 1],
              nameIn: true,
              longWraps: true,
              red: theme === '기본테마',
            })),
          }
        }
      }
      expect(got).toEqual(want)
    })

    it(`${theme} — 반복 행 표가 제 칸 안 · 셀 안 조각이 제 행 안 · 머리 칸 글 한 줄`, () => {
      const got: Record<string, unknown> = {}
      const want: Record<string, unknown> = {}
      for (const page of Object.keys(PAGES)) {
        for (const width of WIDTHS) {
          const read = reads[`${theme} ${page} ${width}`]!
          expect(read.grids.length).toBe(1)
          // 카나리아 — 행 둘 × 조각 넷(입력 둘 · 날짜 · 단추).
          expect(read.grids[0]!.pieces).toBe(8)
          got[`${page} ${width}`] = read.grids.map((grid) => ({
            rootIn: grid.rootOver <= 1,
            scrollIn: grid.scrollOver <= 1,
            pieceOut: grid.pieceOut,
            headLines: grid.headLines,
          }))
          want[`${page} ${width}`] = [{ rootIn: true, scrollIn: true, pieceOut: 0, headLines: [1, 1, 1, 1] }]
        }
      }
      expect(got).toEqual(want)
    })
  }

  it('PPTX — 폼 표 · 카드 페이지의 화면 그림 폭이 캡처 폭(720)의 두 배다 — 문서가 캡처 폭을 안 넘는다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=pptx`, { headers: { cookie: alice.cookie } })
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const shots = Object.entries(entries).filter(([path]) => path.startsWith('ppt/media/') && path.endsWith('.png'))
    expect(shots.length).toBe(3)
    const widths = shots.map(([, bytes]) => decodePng(Buffer.from(bytes)).width)
    // eslint-disable-next-line no-console
    console.log(`[좁은 칸] PPTX 그림 폭 ${JSON.stringify(widths)}`)
    // 폼 표 · 카드는 캡처 폭 그대로다. 격자 배치 2열은 찍는 판이 그리드의 스크롤 상자를 풀어 표 전체 폭으로 펼친다(정본 §6.1 «그리드» 의 찍는 판 —
    // 넓은 표는 넓게 찍는다) — 칸이 좁아 표가 칸보다 넓으면 그림이 넓어진다. 그 판은 이 트랙의 것이 아니라(프리셋 없이 지은 그리드도 같다) 값만 적는다.
    expect([widths[0], widths[2]]).toEqual([1440, 1440])
    expect(widths[1]).toBeGreaterThanOrEqual(1440)
  }, 120_000)
})
