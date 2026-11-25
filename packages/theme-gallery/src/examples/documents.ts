/**
 * **예제 페이지 — 주문 관리**(설계 `docs/superpowers/specs/2026-11-02-theme-preview-and-project-cards-design.md` 「«예제 페이지» 보기」). 테마
 * 미리보기가 «실제 화면에서 어떻게 보이나» 를 보이는 가상의 관리자 화면이다. 장 넷과 팝업 하나가 같은 레이아웃(왼쪽 메뉴 · 위쪽 머리 · Slot)을
 * 쓰고 문서의 상호작용(`navigate` · `openModal` · `closeModal`)으로 서로 이어진다 — 이음은 `ThemeExamples` 가 받아 장을 바꾼다.
 *
 * 문서는 사용자 데이터가 아니다(DB 에 안 들어간다). 지금 카탈로그 검증을 지나고 다섯 그룹을 다 싣는다 — `test/examples.test.tsx` 가 잠근다.
 * 글은 흔한 관리자 화면의 말이고 실제 회사 · 사람 이름을 쓰지 않는다. 노드 id 는 장마다 접두(`ex-l` · `ex-d` · `ex-o` · `ex-od` · `ex-of` ·
 * `ex-pd`)를 둔다 — 레이아웃과 페이지가 한 화면에 함께 그려진다.
 */
import { CURRENT_DOCUMENT_VERSION, type Interaction, type LayoutDocument, type PageDocument, type WbNode } from '@wirebound/schema'

export type ExamplePageId = 'dashboard' | 'orders' | 'order' | 'order-form'

export interface ExamplePage {
  id: ExamplePageId
  title: string
  target: string
  document: PageDocument
}

export interface ExamplePopup {
  target: string
  document: PageDocument
}

const target = (title: string): string => `page:주문 관리/${title}`

const TARGET = {
  dashboard: target('대시보드'),
  orders: target('주문 목록'),
  order: target('주문 상세'),
  'order-form': target('주문 등록'),
  deletePopup: target('주문 삭제'),
} as const

const go = (to: string): Interaction[] => [{ on: 'click', actions: [{ type: 'navigate', target: to }] }]

const text = (id: string, content: string, role?: string): WbNode => ({
  id,
  type: 'Text',
  props: role === undefined ? { content } : { content, role },
})
const button = (id: string, label: string, extra: Partial<WbNode> = {}): WbNode => ({ id, type: 'Button', props: { label }, ...extra })
const link = (id: string, label: string, to: string): WbNode => ({ id, type: 'Link', props: { label, target: to }, interactions: go(to) })
const field = (id: string, label: string, pieces: WbNode[], extra: Partial<WbNode> & { required?: boolean } = {}): WbNode => {
  const { required, ...rest } = extra
  return { id, type: 'Field', props: required === true ? { label, required } : { label }, children: pieces, ...rest }
}
const options = (labels: readonly string[], selected?: string) =>
  labels.map((label) => (label === selected ? { label, selected: true } : { label }))
const page = (id: string, children: WbNode[]): PageDocument => ({
  version: CURRENT_DOCUMENT_VERSION,
  layout: 'blank',
  root: { id, type: 'Page', children },
})

/** 주문 한 줄 — 목록 · 대시보드의 표가 쓴다. */
interface OrderRow {
  no: string
  buyer: string
  item: string
  amount: string
  status: string
  date: string
}

const ORDERS: readonly OrderRow[] = [
  { no: 'ORD-20261102-0128', buyer: '김민준', item: '무선 키보드 외 1건', amount: '89,000원', status: '결제 완료', date: '2026-11-02' },
  { no: 'ORD-20261102-0127', buyer: '이서연', item: '모니터 받침대', amount: '32,000원', status: '배송 중', date: '2026-11-02' },
  { no: 'ORD-20261101-0126', buyer: '박지호', item: '노트북 파우치', amount: '24,500원', status: '배송 완료', date: '2026-11-01' },
  { no: 'ORD-20261101-0125', buyer: '최유나', item: 'USB-C 허브', amount: '45,000원', status: '취소 요청', date: '2026-11-01' },
  { no: 'ORD-20261031-0124', buyer: '정하은', item: '사무용 의자', amount: '219,000원', status: '결제 대기', date: '2026-10-31' },
]

const STATUS_TONE: Record<string, string> = { '취소 요청': 'danger', '결제 대기': 'muted' }

const column = (id: string, label: string, props: Record<string, unknown> = {}): WbNode => ({
  id,
  type: 'GridColumn',
  props: { label, ...props },
  children: [text(`${id}-t`, '—')],
})

/** 주문 표 — 행마다 제 칸(주문번호는 상세로 가는 링크). `prefix` 로 장마다 id 를 가른다. */
function orderGrid(prefix: string, rows: readonly OrderRow[], zones: WbNode['zones'], props: Record<string, unknown> = {}): WbNode {
  const cols = [
    column(`${prefix}-c-no`, '주문번호', { size: 'medium' }),
    column(`${prefix}-c-buyer`, '주문자'),
    column(`${prefix}-c-item`, '상품'),
    column(`${prefix}-c-amount`, '결제 금액', { align: 'end' }),
    column(`${prefix}-c-status`, '상태', { align: 'center' }),
    column(`${prefix}-c-date`, '주문일', { align: 'center' }),
  ]
  const cell = (id: string, content: WbNode): WbNode => ({ id, type: 'GridCell', props: {}, children: [content] })
  return {
    id: `${prefix}-grid`,
    type: 'DataGrid',
    props,
    children: cols,
    zones: {
      ...zones,
      rows: rows.map((row, at) => {
        const r = `${prefix}-r${at}`
        const tone = STATUS_TONE[row.status]
        return {
          id: r,
          type: 'GridRow',
          props: {},
          children: [
            cell(`${r}-no`, link(`${r}-no-l`, row.no, TARGET.order)),
            cell(`${r}-buyer`, text(`${r}-buyer-t`, row.buyer)),
            cell(`${r}-item`, text(`${r}-item-t`, row.item)),
            cell(`${r}-amount`, text(`${r}-amount-t`, row.amount)),
            cell(`${r}-status`, {
              id: `${r}-status-a`,
              type: 'Affix',
              props: tone === undefined ? { text: row.status, tone: 'primary' } : { text: row.status, tone },
            }),
            cell(`${r}-date`, text(`${r}-date-t`, row.date)),
          ],
        }
      }),
    },
  }
}

/** 레이아웃 — 왼쪽 메뉴(`Link` · `Button` — 카탈로그에 메뉴 컴포넌트가 없다) · 위쪽 머리 · 가운데 Slot. */
export const EXAMPLE_LAYOUT: LayoutDocument = {
  version: CURRENT_DOCUMENT_VERSION,
  root: {
    id: 'ex-l',
    type: 'Page',
    children: [
      {
        id: 'ex-l-shell',
        type: 'Flex',
        props: { align: 'stretch', wrap: true },
        children: [
          {
            id: 'ex-l-menu',
            type: 'Section',
            props: { compact: true },
            weight: 1,
            children: [
              text('ex-l-brand', '주문 관리', 'h3'),
              { id: 'ex-l-menu-line', type: 'Divider', props: { direction: 'horizontal' } },
              {
                id: 'ex-l-nav',
                type: 'Flex',
                props: { direction: 'column', align: 'start' },
                children: [
                  link('ex-l-go-dash', '대시보드', TARGET.dashboard),
                  link('ex-l-go-orders', '주문 목록', TARGET.orders),
                  button('ex-l-go-new', '주문 등록', { variant: 'primary', interactions: go(TARGET['order-form']) }),
                ],
              },
            ],
          },
          {
            id: 'ex-l-main',
            type: 'Flex',
            props: { direction: 'column' },
            weight: 4,
            children: [
              {
                id: 'ex-l-head',
                type: 'Flex',
                props: { justify: 'between', align: 'center' },
                children: [
                  text('ex-l-title', '쇼핑몰 관리자', 'h2'),
                  {
                    id: 'ex-l-user',
                    type: 'Flex',
                    props: { align: 'center' },
                    children: [text('ex-l-user-name', '운영자 님', 'caption'), button('ex-l-logout', '로그아웃', { variant: 'ghost' })],
                  },
                ],
              },
              { id: 'ex-l-slot', type: 'Slot' },
            ],
          },
        ],
      },
    ],
  },
}

const stat = (id: string, title: string, value: string, note: string): WbNode => ({
  id,
  type: 'Card',
  props: { title },
  children: [text(`${id}-v`, value, 'display'), text(`${id}-n`, note, 'caption')],
})

const dashboard = page('ex-d', [
  text('ex-d-title', '대시보드', 'h1'),
  {
    id: 'ex-d-stats',
    type: 'Grid',
    props: { columns: 4 },
    children: [
      stat('ex-d-s1', '오늘 주문', '128건', '어제보다 12건 많음'),
      stat('ex-d-s2', '결제 대기', '12건', '입금 확인 필요'),
      stat('ex-d-s3', '배송 중', '46건', '평균 1.8일'),
      stat('ex-d-s4', '취소 요청', '3건', '처리 필요'),
    ],
  },
  {
    id: 'ex-d-row',
    type: 'Grid',
    props: { columns: 3 },
    children: [
      {
        id: 'ex-d-recent',
        type: 'Card',
        props: { title: '최근 주문' },
        weight: 2,
        children: [orderGrid('ex-d-g', ORDERS.slice(0, 3), {})],
        zones: { headEnd: [link('ex-d-all', '전체 보기', TARGET.orders)] },
      },
      {
        id: 'ex-d-trend',
        type: 'Card',
        props: { title: '주간 주문 추이' },
        children: [{ id: 'ex-d-chart', type: 'Media', props: { kind: 'chart', caption: '최근 7일', ratio: '4/3' } }],
      },
    ],
  },
])

const orders = page('ex-o', [
  text('ex-o-title', '주문 목록', 'h1'),
  {
    id: 'ex-o-search',
    type: 'SearchForm',
    props: { columns: 2 },
    children: [
      field('ex-o-f-no', '주문번호', [{ id: 'ex-o-f-no-i', type: 'Input', props: { placeholder: '주문번호를 입력하세요' } }]),
      field('ex-o-f-status', '상태', [
        {
          id: 'ex-o-f-status-s',
          type: 'Select',
          props: { options: options(['전체', '결제 대기', '결제 완료', '배송 중', '배송 완료'], '전체') },
        },
      ]),
      field(
        'ex-o-f-date',
        '주문일',
        [
          { id: 'ex-o-f-date-a', type: 'DateInput', props: { value: '2026-10-01' } },
          { id: 'ex-o-f-date-m', type: 'Affix', props: { text: '~' } },
          { id: 'ex-o-f-date-b', type: 'DateInput', props: { value: '2026-11-02' } },
        ],
        { weight: 2 },
      ),
    ],
    zones: { actions: [button('ex-o-reset', '초기화'), button('ex-o-go', '검색', { variant: 'primary' })] },
  },
  orderGrid(
    'ex-o-g',
    ORDERS,
    {
      headStart: [text('ex-o-total', '검색결과 총 128건')],
      headEnd: [
        button('ex-o-excel', '엑셀 다운로드'),
        button('ex-o-new', '주문 등록', { variant: 'primary', interactions: go(TARGET['order-form']) }),
      ],
      footer: [{ id: 'ex-o-pg', type: 'Pagination', props: { total: 128, pageSize: 10, page: 1 } }],
    },
    { select: 'check' },
  ),
])

const kv = (id: string, pairs: [string, string][]): WbNode => ({
  id,
  type: 'KeyValue',
  props: { pairs: pairs.map(([key, value]) => ({ key, value })), columns: 2 },
})

const order = page('ex-od', [
  {
    id: 'ex-od-head',
    type: 'Flex',
    props: { justify: 'between', align: 'center', wrap: true },
    children: [
      text('ex-od-title', '주문 상세', 'h1'),
      {
        id: 'ex-od-acts',
        type: 'Flex',
        props: { align: 'center' },
        children: [
          button('ex-od-list', '목록', { interactions: go(TARGET.orders) }),
          button('ex-od-edit', '수정', { variant: 'primary', interactions: go(TARGET['order-form']) }),
          button('ex-od-del', '삭제', {
            variant: 'danger',
            interactions: [{ on: 'click', actions: [{ type: 'openModal', target: TARGET.deletePopup }] }],
          }),
        ],
      },
    ],
  },
  text('ex-od-no', '주문번호 ORD-20261102-0128 · 2026-11-02 10:24 접수', 'caption'),
  {
    id: 'ex-od-tabs',
    type: 'Tabs',
    props: { active: 0 },
    children: [
      {
        id: 'ex-od-t1',
        type: 'TabPanel',
        props: { label: '주문 정보' },
        children: [
          kv('ex-od-kv1', [
            ['주문자', '김민준'],
            ['연락처', '010-0000-0000'],
            ['상품', '무선 키보드 외 1건'],
            ['결제 금액', '89,000원'],
            ['배송지', '서울시 중구 세종대로 00, 101호'],
            ['요청 사항', '부재 시 문 앞에 놓아 주세요'],
          ]),
          {
            id: 'ex-od-tags',
            type: 'Flex',
            props: { align: 'center' },
            children: [
              text('ex-od-tags-l', '태그', 'caption'),
              { id: 'ex-od-tag1', type: 'Chip', props: { label: '첫 주문', removable: false } },
              { id: 'ex-od-tag2', type: 'Chip', props: { label: '빠른 배송', removable: false } },
            ],
          },
        ],
      },
      {
        id: 'ex-od-t2',
        type: 'TabPanel',
        props: { label: '결제' },
        children: [
          kv('ex-od-kv2', [
            ['결제 수단', '신용카드'],
            ['결제 일시', '2026-11-02 10:25'],
            ['승인 번호', '30012345'],
            ['할부', '일시불'],
          ]),
        ],
      },
      {
        id: 'ex-od-t3',
        type: 'TabPanel',
        props: { label: '배송 이력' },
        children: [
          {
            id: 'ex-od-track',
            type: 'Tree',
            props: { items: [{ label: '결제 완료', open: true, children: [{ label: '상품 준비' }] }, { label: '출고' }] },
          },
        ],
      },
    ],
  },
])

const orderForm = page('ex-of', [
  {
    id: 'ex-of-form',
    type: 'EntryForm',
    props: { title: '주문 등록' },
    children: [
      {
        id: 'ex-of-t',
        type: 'FormTable',
        props: { columns: 2 },
        children: [
          field('ex-of-buyer', '주문자', [{ id: 'ex-of-buyer-i', type: 'Input', props: { placeholder: '이름' } }], { required: true }),
          field('ex-of-phone', '연락처', [{ id: 'ex-of-phone-i', type: 'Input', props: { placeholder: '010-0000-0000' } }], {
            required: true,
          }),
          field('ex-of-date', '주문일', [{ id: 'ex-of-date-i', type: 'DateInput', props: { value: '2026-11-02' } }]),
          field('ex-of-time', '희망 배송 시간', [{ id: 'ex-of-time-i', type: 'TimeInput', props: { value: '14:00' } }]),
          field('ex-of-pay', '결제 수단', [
            { id: 'ex-of-pay-r', type: 'RadioGroup', props: { options: options(['신용카드', '계좌이체', '휴대폰'], '신용카드') } },
          ]),
          field('ex-of-status', '상태', [
            { id: 'ex-of-status-s', type: 'Select', props: { options: options(['결제 대기', '결제 완료', '배송 중'], '결제 대기') } },
          ]),
          field(
            'ex-of-opt',
            '요청 옵션',
            [
              {
                id: 'ex-of-opt-c',
                type: 'CheckboxGroup',
                props: { options: options(['선물 포장', '빠른 배송', '영수증 동봉'], '빠른 배송') },
              },
            ],
            { weight: 2 },
          ),
          field(
            'ex-of-amount',
            '결제 금액',
            [
              { id: 'ex-of-amount-i', type: 'Input', props: { kind: 'number', size: 'short', value: '89000' } },
              { id: 'ex-of-amount-u', type: 'Affix', props: { text: '원' } },
            ],
            { weight: 2 },
          ),
          field('ex-of-memo', '메모', [{ id: 'ex-of-memo-i', type: 'TextArea', props: { placeholder: '배송 요청 사항을 적어 주세요' } }], {
            weight: 2,
          }),
          field(
            'ex-of-file',
            '첨부',
            [
              {
                id: 'ex-of-file-a',
                type: 'FileAttach',
                props: { files: [{ name: '주문서.pdf', size: '120 KB' }], maxFiles: 3 },
                zones: { actions: [button('ex-of-file-add', '파일추가'), button('ex-of-file-del', '항목 제거')] },
              },
            ],
            {
              weight: 2,
            },
          ),
        ],
      },
    ],
    zones: {
      actions: [
        button('ex-of-cancel', '취소', { interactions: go(TARGET.orders) }),
        button('ex-of-save', '저장', { variant: 'primary', interactions: go(TARGET.orders) }),
      ],
    },
  },
])

const deletePopup: PageDocument = {
  version: CURRENT_DOCUMENT_VERSION,
  layout: 'popup',
  root: {
    id: 'ex-pd',
    type: 'Popup',
    props: { title: '주문 삭제', size: 'small' },
    children: [
      text('ex-pd-msg', 'ORD-20261102-0128 주문을 삭제합니다.'),
      text('ex-pd-warn', '삭제한 주문은 되돌릴 수 없습니다.', 'caption'),
    ],
    zones: {
      footer: [
        button('ex-pd-cancel', '취소', { interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] }),
        button('ex-pd-ok', '삭제', {
          variant: 'danger',
          interactions: [{ on: 'click', actions: [{ type: 'closeModal' }, { type: 'navigate', target: TARGET.orders }] }],
        }),
      ],
    },
  },
}

/** 장 넷 — 이 차례가 장 이름 줄의 차례다. 처음 여는 장은 첫째(대시보드). */
export const EXAMPLE_PAGES: readonly ExamplePage[] = [
  { id: 'dashboard', title: '대시보드', target: TARGET.dashboard, document: dashboard },
  { id: 'orders', title: '주문 목록', target: TARGET.orders, document: orders },
  { id: 'order', title: '주문 상세', target: TARGET.order, document: order },
  { id: 'order-form', title: '주문 등록', target: TARGET['order-form'], document: orderForm },
]

/** 팝업 — 장 이름 줄에 없고 주문 상세의 «삭제» 가 연다. */
export const EXAMPLE_POPUPS: readonly ExamplePopup[] = [{ target: TARGET.deletePopup, document: deletePopup }]
