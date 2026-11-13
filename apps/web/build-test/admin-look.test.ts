/**
 * **기본테마(`system-admin`)가 관리자 화면의 꼴로 서는가** — 실브라우저 판(내보낸 번들). 테마의 규칙 · 변수는 jsdom(`system-themes/admin/test/admin.test.ts`)이
 * 선언 단위로 잰다. 여기서는 그 규칙이 **계산된 값**(색 · 크기 · 상자)으로 서는지와, 넓어진 라벨 칸(140px) · 여백 없는 카드에서 **좁은 창이 안 넘치는지**를
 * 잰다.
 *
 * 판 — 새 프로젝트(시딩된 기본테마 최신판)의 페이지 둘:
 *
 * - «화면» — 구역 안에 제목 · 조회 폼 카드(열 2 · 단추 둘) · 그리드 카드(머리 오른쪽 단추 · 세 줄 · 페이지네이션) · 폼 표 카드(2열 · 필수 · 읽기 전용 ·
 *   비활성 · 세그먼트 · 여러 줄) · 단추 다섯 variant.
 * - «팝업»(팝업 페이지) — 폼 표와 바닥 단추.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 꼴 | 단추 · 입력 · 폼 표 라벨 칸 · 카드 · 그리드 머리 · 세그먼트 · 본문 글 · 팝업의 계산된 색 · 크기 |
 * | 붙음 | 테두리 있는 카드의 몸통에 곧바로 든 조회 폼 · 그리드 · 폼 표가 카드 테두리 안쪽에 맞닿는다(좌우 1px = 카드 테두리 — 형제가 있는 판은 jsdom 이 잰다) |
 * | 넘침 | 창 1280 · 1000 · 720 · 390(화면 모드 — 문서 폭 = 창 폭)에서 문서 `scrollWidth` ≤ 창 폭 · 글자 노드(`Range.getClientRects()`) · 노드 상자의 오른끝이 문서 뿌리 안 |
 *
 * 색은 테마가 닮으려는 원본(lms-skala 관리자 본문)의 값으로 적는다 — 이 케이스는 «토큰을 따르는가» 가 아니라 «기본값이 그 꼴인가» 를 잠근다(토큰을
 * 따르는지는 `theme-canvas.test.ts` 가 잰다). 기본값을 바꾸는 판은 이 표를 함께 고친다.
 *
 * `WB_ADMIN_LOOK_SHOTS=<디렉터리>` 를 주면 창 1280 의 «화면» · «팝업» 과 창 390 의 «화면» 을 한 장씩 남긴다.
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

const SHOTS = process.env.WB_ADMIN_LOOK_SHOTS

type Node = {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
  weight?: number
  variant?: string
}

const button = (id: string, label: string, variant?: string): Node => ({
  id,
  type: 'Button',
  props: { label },
  ...(variant ? { variant } : {}),
})
const input = (id: string, props: Record<string, unknown> = {}): Node => ({ id, type: 'Input', props })
const field = (id: string, label: string, pieces: Node[], more: Partial<Node> & { required?: boolean } = {}): Node => {
  const { required, ...rest } = more
  return { id, type: 'Field', props: { label, ...(required ? { required: true } : {}) }, children: pieces, ...rest }
}
const text = (id: string, content: string, role?: string): Node => ({ id, type: 'Text', props: { content, ...(role ? { role } : {}) } })
const column = (id: string, label: string, content: string): Node => ({
  id,
  type: 'GridColumn',
  props: { label },
  children: [text(`${id}_t`, content)],
})

const SCREEN: Node[] = [
  {
    id: 'sec',
    type: 'Section',
    children: [
      text('h1', '회원 관리', 'h1'),
      {
        id: 'c_search',
        type: 'Card',
        props: { title: '검색영역' },
        children: [
          {
            id: 'sf',
            type: 'SearchForm',
            props: { columns: 2 },
            children: [
              field('sf_name', '이름', [input('sf_name_i', { placeholder: '입력' })]),
              field('sf_state', '회원 상태', [{ id: 'sf_state_s', type: 'Select', props: { placeholder: '전체' } }]),
              field('sf_term', '가입 기간', [
                { id: 'sf_from', type: 'DateInput', props: {} },
                { id: 'sf_tilde', type: 'Affix', props: { text: '~' } },
                { id: 'sf_to', type: 'DateInput', props: {} },
              ]),
            ],
            zones: { actions: [button('sf_reset', '초기화'), button('sf_go', '검색', 'primary')] },
          },
        ],
      },
      {
        id: 'c_grid',
        type: 'Card',
        props: { title: '검색결과' },
        zones: { headEnd: [button('dg_excel', '엑셀다운로드'), button('dg_new', '등록', 'primary')] },
        children: [
          {
            id: 'dg',
            type: 'DataGrid',
            props: { select: 'check' },
            children: [
              column('col_name', '이름', '홍길동'),
              column('col_mail', '이메일', 'hong@example.com'),
              column('col_state', '상태', '정상'),
            ],
            zones: {
              rows: [{ id: 'row', type: 'GridRow', props: { repeat: 3 } }],
              footer: [{ id: 'pg', type: 'Pagination', props: { pageSize: 10 } }],
            },
          },
        ],
      },
      {
        id: 'c_form',
        type: 'Card',
        props: { title: '기본정보' },
        zones: { headEnd: [button('ft_edit', '수정')] },
        children: [
          {
            id: 'ft',
            type: 'FormTable',
            props: { columns: 2 },
            children: [
              field('f_name', '이름', [input('f_name_i', { value: '홍길동' })], { required: true }),
              field('f_id', '아이디', [input('f_id_i', { value: 'hong', readonly: true })]),
              field('f_joined', '가입일', [input('f_joined_i', { value: '2026-07-04', disabled: true })]),
              field('f_grade', '개인정보 수집 및 이용 동의 여부', [
                { id: 'f_grade_r', type: 'RadioGroup', props: { options: [{ label: '동의', selected: true }, { label: '미동의' }] } },
              ]),
              field('f_memo', '비고', [{ id: 'f_memo_t', type: 'TextArea', props: { rows: 2 } }], { weight: 2 }),
            ],
          },
        ],
      },
      {
        id: 'buttons',
        type: 'Flex',
        props: { justify: 'end' },
        children: [
          button('b_default', '목록'),
          button('b_primary', '저장', 'primary'),
          button('b_secondary', '취소', 'secondary'),
          button('b_danger', '삭제', 'danger'),
          button('b_ghost', '더 보기', 'ghost'),
        ],
      },
    ],
  },
]

const POPUP_BODY: Node[] = [
  {
    id: 'p_ft',
    type: 'FormTable',
    props: { columns: 1 },
    children: [
      field('p_name', '분반명', [input('p_name_i', { value: '1분반' })], { required: true }),
      field('p_size', '정원', [input('p_size_i', { size: 'short' })]),
    ],
  },
]
const POPUP_FOOTER: Node[] = [button('p_cancel', '취소'), button('p_save', '저장', 'primary')]

/** 요소의 계산된 색 · 크기. 글로 넘긴다 — vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게. */
const LOOK = `(() => {
  const q = (selector) => {
    const el = document.querySelector('.wb-export-canvas ' + selector)
    if (el === null) throw new Error('없다: ' + selector)
    return el
  }
  const node = (id, rest) => q('[data-wb-id="' + id + '"]' + (rest || ''))
  const css = (el) => getComputedStyle(el)
  const box = (el) => el.getBoundingClientRect()
  const round = (n) => Math.round(n * 100) / 100
  const paint = (el) => ({ bg: css(el).backgroundColor, border: css(el).borderTopColor, color: css(el).color, height: round(box(el).height) })
  const page = q('[data-wb-component="Page"], [data-wb-component="Popup"]')
  const card = node('c_form')
  const label = node('f_name', ' > [data-wb-part="label"]')
  const value = node('f_name', ' > [data-wb-part="value"]')
  const flush = (cardId, childId) => {
    const c = box(node(cardId))
    const n = box(node(childId))
    return { left: round(n.left - c.left), right: round(c.right - n.right), bottom: round(c.bottom - n.bottom) }
  }
  return {
    buttons: Object.fromEntries(['b_default', 'b_primary', 'b_secondary', 'b_danger', 'b_ghost'].map((id) => [id, paint(node(id))])),
    inputs: { edit: paint(node('f_name_i')), readonly: paint(node('f_id_i')), disabled: paint(node('f_joined_i')) },
    label: { width: round(box(label).width), bg: css(label).backgroundColor, height: round(box(label).height), weight: css(label).fontWeight },
    valueHeight: round(box(value).height),
    card: {
      border: css(card).borderTopColor,
      radius: css(card).borderTopLeftRadius,
      padding: css(card).paddingTop + ' ' + css(card).paddingLeft,
      headHeight: round(box(node('c_form', ' > [data-wb-part="header"]')).height),
      headLine: css(node('c_form', ' > [data-wb-part="header"]')).borderBottomColor,
    },
    gridHead: css(node('col_name')).backgroundColor,
    segment: { on: paint(node('f_grade_r', ' > [aria-checked="true"]')), off: paint(node('f_grade_r', ' > [aria-checked="false"]')) },
    body: { size: css(page).fontSize, family: css(page).fontFamily.replace(/["']/g, '').split(',')[0].trim(), h1: css(node('h1')).fontSize },
    flush: { search: flush('c_search', 'sf'), grid: flush('c_grid', 'dg'), form: flush('c_form', 'ft') },
  }
})()`

const POPUP_LOOK = `(() => {
  const q = (selector) => {
    const el = document.querySelector('.wb-export-canvas ' + selector)
    if (el === null) throw new Error('없다: ' + selector)
    return el
  }
  const css = (el) => getComputedStyle(el)
  const popup = q('[data-wb-component="Popup"]')
  return {
    border: css(popup).borderTopColor,
    radius: css(popup).borderTopLeftRadius,
    titlebar: css(q('[data-wb-component="Popup"] > [data-wb-part="titlebar"]')).backgroundColor,
    title: css(q('[data-wb-component="Popup"] > [data-wb-part="titlebar"] > [data-wb-part="title"]')).fontSize,
    footer: css(q('[data-wb-component="Popup"] > [data-wb-part="footer"]')).backgroundColor,
    save: css(q('[data-wb-id="p_save"]')).backgroundColor,
  }
})()`

/**
 * 문서의 넘침 — 문서 `scrollWidth` 와 창 폭, 문서 뿌리 밖으로 나간 글자 노드(`Range.getClientRects()` 의 오른끝 — 끊을 자리 없는 낱말은 제 요소 상자
 * 안에 선 채 글자만 넘친다) · 노드 상자, 잰 글자 노드 · 노드 수.
 */
const OVERFLOW = `(() => {
  const root = document.querySelector('.wb-export-canvas [data-wb-id]')
  const right = root.getBoundingClientRect().right
  const past = []
  let texts = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue
    texts += 1
    const range = document.createRange()
    range.selectNodeContents(n)
    let max = -Infinity
    for (const r of range.getClientRects()) max = Math.max(max, r.right)
    if (max > right + 0.5) past.push(n.parentElement.closest('[data-wb-id]').getAttribute('data-wb-id') + ' +' + Math.round(max - right) + 'px ' + n.textContent.slice(0, 24))
  }
  // 노드 상자 — 카드에 붙은 폼 표 · 그리드는 넘친 것을 자른다(\`overflow: hidden\`). 잘린 상자는 문서를 안 넓히고 글자도 안 보여 위 둘에 안 걸린다.
  // 표의 스크롤 상자 안은 뺀다(넓은 표는 그 안에서 굴러간다).
  const boxes = []
  let nodes = 0
  for (const el of root.querySelectorAll('[data-wb-id]')) {
    if (el.closest('[data-wb-part="scroll"]')) continue
    nodes += 1
    const r = el.getBoundingClientRect()
    if (r.right > right + 0.5) boxes.push(el.getAttribute('data-wb-id') + ' +' + Math.round(r.right - right) + 'px')
  }
  return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, rootWidth: Math.round(right - root.getBoundingClientRect().left), texts, past, nodes, boxes }
})()`

const WHITE = 'rgb(255, 255, 255)'
const BORDER = 'rgb(204, 204, 204)'
const PRIMARY = 'rgb(10, 120, 216)'
const DANGER = 'rgb(240, 74, 59)'
const CANVAS = 'rgb(243, 244, 246)'
const HEADER = 'rgb(242, 244, 247)'
const TEXT = 'rgb(51, 51, 51)'

describe.skipIf(!전제.ok)('기본테마 — 관리자 화면의 꼴', () => {
  let stack: EditorStack
  let alice: Session
  let bundle: UnpackedBundle
  let SCREEN_FILE = ''
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
    const project = ok(await call('POST', '/projects', { name: '꼴', slug: `admin-look-${Date.now().toString(36)}` }), '프로젝트')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
    const add = (nodes: Node[], at = '/root/children') => nodes.map((value, i) => ({ op: 'add', path: `${at}/${i}`, value }))
    const screen = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '화면', kind: 'page' }), '화면')
    ok(await call('PATCH', `/projects/${project.id}/pages/${screen.id}/ops`, { baseSeq: 0, ops: add(SCREEN) }), 'ops 화면')
    const popup = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '팝업', kind: 'popup' }), '팝업')
    ok(
      await call('PATCH', `/projects/${project.id}/pages/${popup.id}/ops`, {
        baseSeq: 0,
        ops: [...add(POPUP_BODY), { op: 'add', path: '/root/zones', value: { footer: POPUP_FOOTER } }],
      }),
      'ops 팝업',
    )
    bundle = await exportBundle(stack, alice, project.id)
    SCREEN_FILE = bundle.pages['관리자-화면']!
    POPUP_FILE = bundle.pages['관리자-팝업']!
    if (SCREEN_FILE === undefined || POPUP_FILE === undefined)
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

  const open = (file: string, width: number) => openBundlePage(stack, file, { viewport: { width, height: 1200 }, screen: true })

  it('꼴 — 흰 단추와 채운 주 단추 · 30px 입력 · 140px 라벨 칸 · 42px 칸 · 4px 카드 · 13px 본문', async () => {
    const { context, page } = await open(SCREEN_FILE, 1280)
    try {
      if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, 'screen-1280.png'), fullPage: true })
      const look: any = await page.evaluate(LOOK)
      // eslint-disable-next-line no-console
      console.log(`[기본테마 꼴] ${JSON.stringify(look)}`)

      // 단추 — 바탕 · `secondary` 는 흰 단추, `primary` 만 채운다, `danger` 는 위험 색 테두리 · 글.
      expect({ bg: look.buttons.b_default.bg, border: look.buttons.b_default.border, color: look.buttons.b_default.color }).toEqual({
        bg: WHITE,
        border: BORDER,
        color: TEXT,
      })
      expect(look.buttons.b_secondary).toEqual(look.buttons.b_default)
      expect({ bg: look.buttons.b_primary.bg, border: look.buttons.b_primary.border, color: look.buttons.b_primary.color }).toEqual({
        bg: PRIMARY,
        border: PRIMARY,
        color: WHITE,
      })
      expect({ bg: look.buttons.b_danger.bg, border: look.buttons.b_danger.border, color: look.buttons.b_danger.color }).toEqual({
        bg: WHITE,
        border: DANGER,
        color: DANGER,
      })
      for (const id of Object.keys(look.buttons)) expect(look.buttons[id].height, id).toBeGreaterThanOrEqual(30)

      // 입력 — 잠금 사다리(면 → 읽기 전용 → 비활성).
      expect([look.inputs.edit.bg, look.inputs.readonly.bg, look.inputs.disabled.bg]).toEqual([WHITE, CANVAS, 'rgb(228, 231, 235)'])
      expect(look.inputs.edit.border).toBe(BORDER)
      expect(look.inputs.edit.height).toBeGreaterThanOrEqual(30)

      // 폼 표 — 라벨 칸 140px · 옅은 바탕 · 굵은 글, 칸 42px 이상.
      expect(Math.abs(look.label.width - 140)).toBeLessThanOrEqual(1)
      expect(look.label.bg).toBe(CANVAS)
      expect(look.label.weight).toBe('700')
      expect(look.label.height).toBeGreaterThanOrEqual(42)
      expect(look.valueHeight).toBeGreaterThanOrEqual(42)

      // 카드 — 테두리 · 4px 모서리 · 여백 없는 상자 · 42px 머리줄(밑선).
      expect(look.card).toEqual({ border: BORDER, radius: '4px', padding: '0px 0px', headHeight: look.card.headHeight, headLine: BORDER })
      expect(look.card.headHeight).toBeGreaterThanOrEqual(42)

      expect(look.gridHead).toBe(HEADER)
      expect({ bg: look.segment.on.bg, color: look.segment.on.color }).toEqual({ bg: PRIMARY, color: WHITE })
      expect(look.segment.off.bg).toBe(WHITE)
      expect(look.body).toEqual({ size: '13px', family: 'Pretendard', h1: '22px' })
    } finally {
      await context.close()
    }
  }, 120_000)

  it('붙음 — 테두리 있는 카드의 몸통에 곧바로 든 조회 폼 · 그리드 · 폼 표가 카드 테두리 안쪽에 맞닿는다', async () => {
    const { context, page } = await open(SCREEN_FILE, 1280)
    try {
      const look: any = await page.evaluate(LOOK)
      // 좌우는 카드 테두리 1px 안쪽, 아래는 카드 끝(바닥 구역이 없다) — 테두리 1px 안쪽.
      expect(look.flush).toEqual({
        search: { left: 1, right: 1, bottom: 1 },
        grid: { left: 1, right: 1, bottom: 1 },
        form: { left: 1, right: 1, bottom: 1 },
      })
    } finally {
      await context.close()
    }
  }, 120_000)

  it('팝업 — 테두리 · 머리 바탕 제목줄 · 옅은 바탕 바닥 · 채운 주 단추', async () => {
    const { context, page } = await open(POPUP_FILE, 1280)
    try {
      if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, 'popup-1280.png'), fullPage: true })
      expect(await page.evaluate(POPUP_LOOK)).toEqual({
        border: BORDER,
        radius: '4px',
        titlebar: HEADER,
        title: '15px',
        footer: CANVAS,
        save: PRIMARY,
      })
    } finally {
      await context.close()
    }
  }, 120_000)

  it.each([1280, 1000, 720, 390])(
    '넘침 — 창 %d 에서 «화면» · «팝업» 이 창 폭 안이고 글자 · 노드 상자가 문서 뿌리 밖으로 안 나간다',
    async (width) => {
      const got: Record<string, unknown> = {}
      const want: Record<string, unknown> = {}
      for (const [name, file] of [
        ['화면', SCREEN_FILE],
        ['팝업', POPUP_FILE],
      ] as const) {
        const { context, page } = await open(file, width)
        try {
          if (SHOTS !== undefined && name === '화면' && width !== 1280)
            await page.screenshot({ path: join(SHOTS, `screen-${width}.png`), fullPage: true })
          const read: any = await page.evaluate(OVERFLOW)
          // 카나리아 — 화면 모드라 문서 폭이 창 폭이고(셸이 서면 좁은 창에서 문서 칸이 0 으로 눌려 아무것도 안 넘친다) 글자 노드를 쟀다.
          expect(read.clientWidth, name).toBe(width)
          // 팝업 상자는 창이 넓어도 720px(보통 크기)이다.
          expect(read.rootWidth, name).toBeGreaterThan(Math.min(width, name === '팝업' ? 720 : width) * 0.8)
          expect(read.texts, name).toBeGreaterThan(name === '팝업' ? 4 : 8)
          expect(read.nodes, name).toBeGreaterThan(name === '팝업' ? 4 : 20)
          got[name] = {
            scroll: read.scrollWidth <= read.clientWidth ? '안' : `${read.scrollWidth}/${read.clientWidth}`,
            past: read.past,
            boxes: read.boxes,
          }
          want[name] = { scroll: '안', past: [], boxes: [] }
        } finally {
          await context.close()
        }
      }
      expect(got).toEqual(want)
    },
    120_000,
  )
})
