/**
 * **기본테마(`system-admin`)가 lms-skala 관리자의 목록 화면 · 일괄등록 팝업 꼴로 서는가** — 실브라우저 판(내보낸 번들 · 창 1280 · 화면 모드).
 * 규칙 · 변수는 jsdom(`system-themes/admin/test/admin.test.ts`)이 선언 단위로 잰다. 여기서는 그 규칙이 상자 · 계산된 값으로 서는지를 잰다 — 카드로
 * 감싸지 않고 페이지 뿌리에 곧바로 쌓은 판이다(`admin-look.test.ts` 는 카드에 든 판).
 *
 * 판 — 새 프로젝트(시딩된 기본테마 최신판)의 페이지 둘. 원본 화면은 lms-skala 관리자의 «게시물 목록(답글 등록 폼 열림)» · «훈련생 일괄등록»
 * (`docs/superpowers/plans/2026-11-25-skt-report.md`).
 *
 * - «목록» — 페이지 뿌리에 조회 폼(열 2 · 짧은 셀렉트 + 입력 · 안내 글만 든 짧은 셀렉트 · 긴 값의 짧은 셀렉트) · 그리드(머리 왼쪽 글 · 머리 오른쪽 단추 ·
 *   칸 안 링크 · 쪽 넘김) · 등록 폼(제목 · 폼 표 — 숫자칸 안내 글 · 숫자 값).
 * - «팝업»(팝업 페이지) — 몸통에 가로 배치(글 + 링크) · 그리드(머리 왼쪽 제목 + 캡션 글), 바닥 단추 둘.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 뿌리 사이 | 페이지 뿌리에 곧바로 든 조회 폼 · 그리드 · 등록 폼 사이가 8px |
 * | 결과 머리 · 표 · 쪽 넘김 | 그리드 머리줄 42px 이상 · 아래 선 하나 · 제목 14px 굵게 · 머리 아래끝 = 표 위끝(틈 0 · 표 위 선 없음) · 표 아래끝 = 쪽 넘김 위끝 · 쪽 넘김 오른끝 글이 그리드 오른끝에서 12px 안쪽 |
 * | 폼 제목 | 등록 폼 제목 14px 굵게 · 아래 선 · 42px 이상 · 몸통 여백 12px |
 * | 셀렉트 | 짧은 셀렉트의 높이 = 입력 높이(30px) · 값 글 한 줄 · 긴 값은 말줄임 · 화살표는 글자가 아니다 |
 * | 숫자칸 | 안내 글은 칸 왼쪽 · 값은 칸 오른쪽 |
 * | 팝업 | 닫기 26×26 · 16px · 제목 15px · 캡션 글 12px 흐림 |
 *
 * `WB_SKALA_SHOTS=<디렉터리>` 를 주면 창 1280 의 «목록» · «팝업» 을 한 장씩 남긴다(`list-1280.png` · `popup-1280.png`).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const SHOTS = process.env.WB_SKALA_SHOTS

type Node = {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
  variant?: string
}

const button = (id: string, label: string, variant?: string): Node => ({
  id,
  type: 'Button',
  props: { label },
  ...(variant ? { variant } : {}),
})
const text = (id: string, content: string, role?: string): Node => ({ id, type: 'Text', props: { content, ...(role ? { role } : {}) } })
const field = (id: string, label: string, pieces: Node[]): Node => ({ id, type: 'Field', props: { label }, children: pieces })
const select = (id: string, props: Record<string, unknown>): Node => ({ id, type: 'Select', props })
const column = (id: string, label: string, content: Node): Node => ({ id, type: 'GridColumn', props: { label }, children: [content] })

const LIST: Node[] = [
  {
    id: 's_form',
    type: 'SearchForm',
    props: { columns: 2 },
    children: [
      field('s_kw', '키워드', [
        select('s_kw_sel', { size: 'short', options: [{ label: '제목+내용', selected: true }, { label: '제목' }] }),
        { id: 's_kw_in', type: 'Input', props: { placeholder: '검색어를 입력하세요' } },
      ]),
      field('s_org', '기관 선택', [select('s_org_sel', { size: 'short', placeholder: '- 전체 -' })]),
      field('s_course', '과정', [select('s_course_sel', { placeholder: '- 전체 -' })]),
      field('s_cat', '분류', [select('s_cat_sel', { size: 'short', options: [{ label: '공지사항과 안내사항 전체', selected: true }] })]),
    ],
    zones: { actions: [button('s_reset', '초기화'), button('s_go', '검색', 'primary')] },
  },
  {
    id: 'g_list',
    type: 'DataGrid',
    props: { select: 'check' },
    children: [
      column('g_no', '번호', text('g_no_t', '3')),
      column('g_cat', '분류', text('g_cat_t', '공지')),
      column('g_title', '제목', { id: 'g_link', type: 'Link', props: { label: '[필독] 11월 교육장 이용 안내' } }),
      column('g_hit', '조회수', text('g_hit_t', '214')),
      column('g_by', '등록자', text('g_by_t', '정민재')),
      column('g_at', '등록일', text('g_at_t', '2026-11-10 09:30')),
    ],
    zones: {
      headStart: [text('g_head', '게시물 검색결과 총 3건')],
      headEnd: [button('g_new', '등록', 'primary'), button('g_del', '삭제')],
      rows: [{ id: 'g_row', type: 'GridRow', props: { repeat: 3 } }],
      footer: [{ id: 'g_pg', type: 'Pagination', props: { total: 3, pageSize: 10 } }],
    },
  },
  {
    id: 'e_form',
    type: 'EntryForm',
    props: { title: '답글 등록' },
    children: [
      {
        id: 'e_ft',
        type: 'FormTable',
        props: { columns: 1 },
        children: [
          field('e_subject', '제목', [
            { id: 'e_subject_i', type: 'Input', props: { value: 'RE:[필독] 11월 교육장 이용 안내', size: 'long' } },
          ]),
          field('e_year', '연도', [{ id: 'e_year_i', type: 'Input', props: { kind: 'number', size: 'medium', placeholder: '예) 2026' } }]),
          field('e_fee', '수강료', [{ id: 'e_fee_i', type: 'Input', props: { kind: 'number', size: 'medium', value: '120000' } }]),
        ],
      },
    ],
    zones: { actions: [button('e_cancel', '취소'), button('e_save', '저장', 'primary')] },
  },
]

const POPUP_BODY: Node[] = [
  {
    id: 'p_row',
    type: 'Flex',
    children: [
      text('p_txt', '4. 샘플 파일을 참고하여 작성하여 주십시오.'),
      { id: 'p_link', type: 'Link', props: { label: '샘플파일 다운로드' } },
    ],
  },
  {
    id: 'p_grid',
    type: 'DataGrid',
    props: {},
    children: [
      column('p_c_row', '행', text('p_c_row_t', '2')),
      column('p_c_res', '결과', text('p_c_res_t', '정상')),
      column('p_c_id', '아이디', text('p_c_id_t', 'skala20260014')),
    ],
    zones: {
      headStart: [text('p_head', '검증결과'), text('p_head_sub', '총 3건 · 오류 1건', 'caption')],
      rows: [{ id: 'p_rows', type: 'GridRow', props: { repeat: 3 } }],
    },
  },
]
const POPUP_FOOTER: Node[] = [button('p_close', '닫기'), button('p_go', '일괄등록', 'primary')]

/** «목록» 의 상자 · 계산된 값. 글로 넘긴다 — vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게. */
const LIST_LOOK = `(() => {
  const q = (selector) => {
    const el = document.querySelector('.wb-export-canvas ' + selector)
    if (el === null) throw new Error('없다: ' + selector)
    return el
  }
  const node = (id, rest) => q('[data-wb-id="' + id + '"]' + (rest || ''))
  const css = (el) => getComputedStyle(el)
  const box = (el) => el.getBoundingClientRect()
  const round = (n) => Math.round(n * 100) / 100
  const lines = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size
  }
  const textOf = (id) => node(id, ' > [data-wb-part="text"]')
  const root = q('[data-wb-component="Page"]')
  const kids = Array.from(root.children).map((el) => ({ id: el.getAttribute('data-wb-id'), top: box(el).top, bottom: box(el).bottom }))
  const grid = node('g_list')
  const head = node('g_list', ' > [data-wb-part="head"]')
  const scroll = node('g_list', ' > [data-wb-part="scroll"]')
  const table = node('g_list', ' [data-wb-part="table"]')
  const footer = node('g_list', ' > [data-wb-part="footer"]')
  const range = node('g_pg', ' > [data-wb-part="range"]')
  const title = node('g_head')
  const formLabel = node('e_form', ' > [data-wb-part="label"]')
  const formRow = node('e_form', ' > [data-wb-part="row"]')
  const kwSel = node('s_kw_sel')
  const kwIn = node('s_kw_in')
  const sel = (id) => {
    const t = textOf(id)
    return { height: round(box(node(id)).height), lines: lines(t), clipped: t.scrollWidth > t.clientWidth + 0.5, whiteSpace: css(t).whiteSpace, overflow: css(t).textOverflow }
  }
  const after = getComputedStyle(kwSel, '::after')
  const year = node('e_year_i')
  const fee = node('e_fee_i')
  return {
    rootGaps: kids.slice(1).map((k, i) => k.id + ' ' + round(k.top - kids[i].bottom)),
    grid: {
      border: css(grid).borderTopWidth + ' ' + css(grid).borderTopStyle,
      radius: css(grid).borderTopLeftRadius,
      headHeight: round(box(head).height),
      headPad: css(head).paddingTop + ' ' + css(head).paddingLeft,
      headLine: css(head).borderBottomWidth,
      headToTable: round(box(scroll).top - box(head).bottom),
      tableTopLine: css(table).borderTopWidth,
      tableToFooter: round(box(footer).top - box(scroll).bottom),
      footerLine: css(footer).borderTopWidth,
      footerPad: css(footer).paddingTop + ' ' + css(footer).paddingLeft,
      rangeInset: round(box(grid).right - box(range).right),
      titleSize: css(title).fontSize,
      titleWeight: css(title).fontWeight,
      headLeftInset: round(box(title).left - box(grid).left),
    },
    form: {
      labelHeight: round(box(formLabel).height),
      labelSize: css(formLabel).fontSize,
      labelWeight: css(formLabel).fontWeight,
      labelLine: css(formLabel).borderBottomWidth,
      rowPad: css(formRow).paddingTop + ' ' + css(formRow).paddingLeft,
      border: css(node('e_form')).borderTopWidth,
    },
    search: {
      actionsPad: css(node('s_form', ' > [data-wb-part="actions"]')).paddingTop + ' ' + css(node('s_form', ' > [data-wb-part="actions"]')).paddingLeft,
      actionsLine: css(node('s_form', ' > [data-wb-part="actions"]')).borderTopWidth,
      goRightInset: round(box(node('s_form')).right - box(node('s_go')).right),
    },
    select: {
      inputHeight: round(box(kwIn).height),
      kw: sel('s_kw_sel'),
      org: sel('s_org_sel'),
      cat: sel('s_cat_sel'),
      course: sel('s_course_sel'),
      orgWidth: round(box(node('s_org_sel')).width),
      arrow: { content: after.content, width: after.width, height: after.height, borderRight: after.borderRightWidth },
    },
    number: {
      hintLeft: round(box(textOf('e_year_i')).left - box(year).left),
      hintRight: round(box(year).right - box(textOf('e_year_i')).right),
      valueRight: round(box(fee).right - box(textOf('e_fee_i')).right),
      valueLeft: round(box(textOf('e_fee_i')).left - box(fee).left),
    },
  }
})()`

/** «팝업» 의 제목줄 · 몸통 · 바닥 · 가로 배치의 기준선 · 머리 캡션 글. */
const POPUP_LOOK = `(() => {
  const q = (selector) => {
    const el = document.querySelector('.wb-export-canvas ' + selector)
    if (el === null) throw new Error('없다: ' + selector)
    return el
  }
  const node = (id, rest) => q('[data-wb-id="' + id + '"]' + (rest || ''))
  const css = (el) => getComputedStyle(el)
  const box = (el) => el.getBoundingClientRect()
  const round = (n) => Math.round(n * 100) / 100
  const baseline = (el) => {
    const span = document.createElement('span')
    span.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
    el.appendChild(span)
    const y = box(span).top
    span.remove()
    return round(y)
  }
  const popup = q('[data-wb-component="Popup"]')
  const bar = q('[data-wb-component="Popup"] > [data-wb-part="titlebar"]')
  const close = q('[data-wb-component="Popup"] > [data-wb-part="titlebar"] > [data-wb-part="close"]')
  const body = q('[data-wb-component="Popup"] > [data-wb-part="body"]')
  const foot = q('[data-wb-component="Popup"] > [data-wb-part="footer"]')
  const txt = node('p_txt')
  const link = node('p_link')
  return {
    bar: { bg: css(bar).backgroundColor, pad: css(bar).paddingTop + ' ' + css(bar).paddingLeft },
    title: { size: css(q('[data-wb-component="Popup"] > [data-wb-part="titlebar"] > [data-wb-part="title"]')).fontSize, weight: css(q('[data-wb-component="Popup"] > [data-wb-part="titlebar"] > [data-wb-part="title"]')).fontWeight },
    close: { width: round(box(close).width), height: round(box(close).height), size: css(close).fontSize },
    body: css(body).paddingTop + ' ' + css(body).paddingLeft,
    foot: { bg: css(foot).backgroundColor, pad: css(foot).paddingTop + ' ' + css(foot).paddingLeft, line: css(foot).borderTopWidth },
    shadowFree: css(popup).boxShadow,
    row: {
      baselineGap: round(baseline(link) - baseline(txt)),
      textTop: round(box(txt).top - box(node('p_row')).top),
      textMargin: css(txt).marginTop + ' ' + css(txt).marginBottom,
      linkTop: round(box(link).top - box(node('p_row')).top),
      linkHeight: round(box(link).height),
      textHeight: round(box(txt).height),
      align: css(node('p_row')).alignItems,
    },
    head: { title: css(node('p_head')).fontSize + ' ' + css(node('p_head')).fontWeight, sub: css(node('p_head_sub')).fontSize + ' ' + css(node('p_head_sub')).color },
  }
})()`

describe.skipIf(!전제.ok)('기본테마 — lms-skala 목록 화면 · 일괄등록 팝업', () => {
  let stack: EditorStack
  let alice: Session
  let bundle: UnpackedBundle
  let LIST_FILE = ''
  let POPUP_FILE = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const ok = (response: { status: number; body: any }, what: string) => {
      if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
      return response.body
    }
    const project = ok(await call('POST', '/projects', { name: '목록', slug: `skala-list-${Date.now().toString(36)}` }), '프로젝트')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
    const add = (nodes: Node[], at = '/root/children') => nodes.map((value, i) => ({ op: 'add', path: `${at}/${i}`, value }))
    const list = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '목록', kind: 'page' }), '목록')
    ok(await call('PATCH', `/projects/${project.id}/pages/${list.id}/ops`, { baseSeq: 0, ops: add(LIST) }), 'ops 목록')
    const popup = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '팝업', kind: 'popup' }), '팝업')
    ok(
      await call('PATCH', `/projects/${project.id}/pages/${popup.id}/ops`, {
        baseSeq: 0,
        ops: [...add(POPUP_BODY), { op: 'add', path: '/root/zones', value: { footer: POPUP_FOOTER } }],
      }),
      'ops 팝업',
    )
    bundle = await exportBundle(stack, alice, project.id)
    LIST_FILE = bundle.pages['관리자-목록']!
    POPUP_FILE = bundle.pages['관리자-팝업']!
    if (LIST_FILE === undefined || POPUP_FILE === undefined)
      throw new Error(`번들에 페이지가 없다: ${Object.keys(bundle.pages).join(', ')}`)
    if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  }, 180_000)

  afterAll(async () => {
    if (stack === undefined) return
    bundle?.dispose()
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  const open = (file: string) => openBundlePage(stack, file, { viewport: { width: 1280, height: 1200 }, screen: true })

  const readList = async (): Promise<any> => {
    const { context, page } = await open(LIST_FILE)
    try {
      if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, 'list-1280.png'), fullPage: true })
      const look: any = await page.evaluate(LIST_LOOK)
      // eslint-disable-next-line no-console
      console.log(`[skala 목록] ${JSON.stringify(look)}`)
      return look
    } finally {
      await context.close()
    }
  }

  it('뿌리 사이 — 페이지 뿌리에 곧바로 든 조회 폼 · 그리드 · 등록 폼 사이가 8px', async () => {
    const look = await readList()
    expect(look.rootGaps).toEqual(['g_list 8', 'e_form 8'])
  }, 120_000)

  it('결과 머리 · 표 · 쪽 넘김 — 42px 머리줄(아래 선 하나 · 14px 굵은 제목) 바로 밑에 표 · 표 바로 밑에 쪽 넘김 · 오른끝 글은 12px 안쪽', async () => {
    const look = await readList()
    const { grid } = look
    expect({
      border: grid.border,
      radius: grid.radius,
      headTall: grid.headHeight >= 42,
      headPad: grid.headPad,
      headLine: grid.headLine,
      headToTable: grid.headToTable,
      tableTopLine: grid.tableTopLine,
      tableToFooter: grid.tableToFooter,
      footerLine: grid.footerLine,
      footerPad: grid.footerPad,
      rangeInset: grid.rangeInset,
      title: `${grid.titleSize} ${grid.titleWeight}`,
      headLeftInset: grid.headLeftInset,
    }).toEqual({
      border: '1px solid',
      radius: '4px',
      headTall: true,
      headPad: '6px 12px',
      headLine: '1px',
      headToTable: 0,
      tableTopLine: '0px',
      tableToFooter: 0,
      footerLine: '1px',
      footerPad: '8px 12px',
      // 그리드 테두리 1px + 쪽 넘김 여백 12px.
      rangeInset: 13,
      title: '14px 700',
      headLeftInset: 13,
    })
  }, 120_000)

  it('폼 제목 · 조회 폼 단추줄 — 등록 폼 제목은 42px 머리줄(14px 굵게 · 아래 선) · 몸통 여백 12px, 조회 폼 단추줄은 오른쪽 · 8/12 · 위 선', async () => {
    const look = await readList()
    expect({
      labelTall: look.form.labelHeight >= 42,
      label: `${look.form.labelSize} ${look.form.labelWeight} ${look.form.labelLine}`,
      rowPad: look.form.rowPad,
      border: look.form.border,
    }).toEqual({ labelTall: true, label: '14px 700 1px', rowPad: '12px 12px', border: '1px' })
    expect(look.search).toEqual({ actionsPad: '8px 12px', actionsLine: '1px', goRightInset: 13 })
  }, 120_000)

  it('셀렉트 — 짧은 셀렉트도 입력과 같은 높이 · 값 글 한 줄 · 긴 값은 말줄임 · 화살표는 글자가 아니다', async () => {
    const look = await readList()
    const { select } = look
    // 카나리아 — 입력칸이 30px 로 섰고, 긴 값은 정말 칸보다 길다(말줄임이 서는 판).
    expect(select.inputHeight).toBe(30)
    expect(select.cat.clipped).toBe(true)
    expect({
      kw: [select.kw.height, select.kw.lines, select.kw.whiteSpace],
      org: [select.org.height, select.org.lines, select.org.clipped],
      cat: [select.cat.height, select.cat.lines, select.cat.overflow],
      course: [select.course.height, select.course.lines],
      arrow: select.arrow.content,
    }).toEqual({
      kw: [30, 1, 'nowrap'],
      // 안내 글 «- 전체 -» 는 짧은 칸에 다 든다.
      org: [30, 1, false],
      cat: [30, 1, 'ellipsis'],
      course: [30, 1],
      arrow: '""',
    })
  }, 120_000)

  it('숫자칸 — 안내 글은 칸 왼쪽 · 값은 칸 오른쪽', async () => {
    const look = await readList()
    // 칸 테두리 1px + 여백 8px.
    expect({ hintLeft: look.number.hintLeft, valueRight: look.number.valueRight }).toEqual({ hintLeft: 9, valueRight: 9 })
    // 카나리아 — 두 칸 모두 글보다 넓다(왼끝 · 오른끝이 갈린다).
    expect(look.number.hintRight).toBeGreaterThan(20)
    expect(look.number.valueLeft).toBeGreaterThan(20)
  }, 120_000)

  it('팝업 — 제목줄 12/16 · 15px 굵은 제목 · 닫기 26×26 16px · 몸통 12px · 바닥 10/16 옅은 바탕 · 머리 캡션 글 12px 흐림', async () => {
    const { context, page } = await open(POPUP_FILE)
    try {
      if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, 'popup-1280.png'), fullPage: true })
      const look: any = await page.evaluate(POPUP_LOOK)
      // eslint-disable-next-line no-console
      console.log(`[skala 팝업] ${JSON.stringify(look)}`)
      expect({
        bar: look.bar.pad,
        title: `${look.title.size} ${look.title.weight}`,
        close: look.close,
        body: look.body,
        foot: look.foot,
        head: look.head,
      }).toEqual({
        bar: '12px 16px',
        title: '15px 700',
        close: { width: 26, height: 26, size: '16px' },
        body: '12px 12px',
        foot: { bg: 'rgb(243, 244, 246)', pad: '10px 16px', line: '1px' },
        head: { title: '14px 700', sub: '12px rgb(102, 102, 102)' },
      })
    } finally {
      await context.close()
    }
  }, 120_000)
})
