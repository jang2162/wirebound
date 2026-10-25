import { z } from 'zod'
import { defineComponent } from '../define'
import { countOf, integer, joined, oneLine } from '../summary'

/**
 * 자료 표(그리드) — 열은 몸통의 노드(`GridColumn` · `GridColumnGroup` — 머리 칸 + 셀 틀), 행은 «행» 구역의 노드(`GridRow` — 되풀이 수 · 행 꼴, 필요할
 * 때만 제 칸 `GridCell`)다(설계 spec `docs/superpowers/specs/2026-10-25-grid-design.md` «1»). 셀 틀은 행마다 되풀이되고 첫 그림 뒤는 렌더러가
 * «사본»(`data-wb-copy-of`)으로 그린다. 바닥 구역에 페이지네이션 바가 든다.
 */
export const DataGridDef = defineComponent({
  type: 'DataGrid',
  // 설계서 · OD 가 자료 표를 «그리드» 라 부른다 — 배치 `Grid` 는 «격자 배치» 다(설계 Q1).
  label: '그리드',
  description: '여러 건을 열과 행으로 늘어놓는 자료 표.',
  group: 'data',
  props: z.strictObject({
    select: z.enum(['none', 'check', 'radio']).default('none'),
    fixedColumns: z.number().int().min(0).max(20).default(0),
    emptyText: z.string().default('검색 결과가 없습니다.'),
    empty: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  editor: [
    { prop: 'select', control: 'select', label: '선택 열', options: ['none', 'check', 'radio'] },
    { prop: 'fixedColumns', control: 'number', label: '고정 열 수' },
    { prop: 'emptyText', control: 'text', label: '빈 결과 문구' },
    // `states` 와 짝이다 — 둘 다 없으면 빈 결과 · 불러오는 중 화면을 목업에서 켤 수 없다.
    { prop: 'empty', control: 'switch', label: '빈 상태' },
    { prop: 'loading', control: 'switch', label: '로딩 상태' },
  ],
  summary: (props) => joined(selectWord(props.select), fixedWord(props.fixedColumns)),
  states: ['empty', 'loading'],
  // 결과 머리줄(«검색결과 총 N건» · 엑셀 다운로드 단추) → 열 → 행 → 바닥(페이지네이션 바). 둘 다 비면 머리줄째 없다.
  zones: [
    { name: 'headStart', label: '머리 왼쪽' },
    { name: 'headEnd', label: '머리 오른쪽' },
    {
      name: 'body',
      label: '열',
      accepts: ['GridColumn', 'GridColumnGroup'],
      initial: [
        { type: 'GridColumn', props: { label: '컬럼 1' } },
        { type: 'GridColumn', props: { label: '컬럼 2' } },
        { type: 'GridColumn', props: { label: '컬럼 3' } },
      ],
    },
    { name: 'rows', label: '행', accepts: ['GridRow'], initial: [{ type: 'GridRow', props: { repeat: 5 } }] },
    { name: 'footer', label: '바닥', initial: [{ type: 'Pagination' }] },
  ],
})

/** 그리드 · 열 묶음의 몸통 — 열과 열 묶음이 서는 두 자리. */
const COLUMN_PLACES = [
  { type: 'DataGrid', zone: 'body' },
  { type: 'GridColumnGroup', zone: 'body' },
] as const

/** 열 묶음 — 병합 머리 칸 하나(아래 열 수만큼 가로로 걸친다). 트리 깊이가 머리 단이다. 몸통(열 · 열 묶음)은 그리드 뷰가 머리 줄에 둔다. */
export const GridColumnGroupDef = defineComponent({
  type: 'GridColumnGroup',
  label: '열 묶음',
  description: '열 여럿 위에 걸치는 병합 머리 칸.',
  group: 'data',
  props: z.strictObject({
    label: z.string().default('묶음'),
  }),
  editor: [{ prop: 'label', control: 'text', label: '머리 이름' }],
  summary: (props) => oneLine(props.label),
  states: [],
  zones: [{ name: 'body', label: '열', accepts: ['GridColumn', 'GridColumnGroup'] }],
  placement: COLUMN_PLACES,
  bodyHost: 'parent',
})

/**
 * 열 하나 — 뿌리 요소는 머리 칸이고 몸통은 셀 틀(칸을 안 가진 행마다 되풀이되는 칸 내용)이다. 셀 틀은 그리드 뷰가 행마다 칸에 둔다
 * (`bodyHost: 'parent'`). `numbering` 을 켜면 셀 틀 대신 데이터 행의 번호를 그린다.
 */
export const GridColumnDef = defineComponent({
  type: 'GridColumn',
  label: '열',
  description: '머리 칸과 행마다 되풀이되는 셀 틀.',
  group: 'data',
  props: z.strictObject({
    label: z.string().default('컬럼'),
    required: z.boolean().default(false),
    align: z.enum(['start', 'center', 'end']).default('start'),
    // 열 폭은 길이가 아니라 «짧은 칸 · 보통 · 긴 칸» 이라는 설계의 낱말이다 — 실제 길이는 테마가 정한다(`Input.size` 와 같은 낱말).
    size: z.enum(['auto', 'short', 'medium', 'long']).default('auto'),
    sort: z.enum(['none', 'sortable', 'asc', 'desc']).default('none'),
    tone: z.enum(['default', 'shaded']).default('default'),
    numbering: z.enum(['off', 'asc', 'desc']).default('off'),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '머리 이름' },
    { prop: 'required', control: 'switch', label: '필수 표시' },
    { prop: 'align', control: 'select', label: '칸 정렬', options: ['start', 'center', 'end'] },
    { prop: 'size', control: 'select', label: '열 폭', options: ['auto', 'short', 'medium', 'long'] },
    { prop: 'sort', control: 'select', label: '정렬 표시', options: ['none', 'sortable', 'asc', 'desc'] },
    { prop: 'tone', control: 'select', label: '음영', options: ['default', 'shaded'] },
    { prop: 'numbering', control: 'select', label: '번호', options: ['off', 'asc', 'desc'] },
  ],
  summary: (props) => oneLine(props.label),
  states: [],
  zones: [{ name: 'body', label: '셀', initial: [{ type: 'Text', props: { content: '—' } }] }],
  placement: COLUMN_PLACES,
  bodyHost: 'parent',
})

/**
 * 행 하나 — `repeat` 줄로 그려진다(첫 줄이 이 노드, 나머지는 사본). 칸을 안 가지면 열마다 셀 틀을, 하나라도 가지면 제 칸만 그린다(칸이 열을
 * 앞에서부터 덮고 모자란 열은 빈 칸). `kind: gap` 은 칸 · 되풀이를 안 읽는 전폭 생략 띠다.
 */
export const GridRowDef = defineComponent({
  type: 'GridRow',
  label: '행',
  description: '되풀이되는 행. 칸을 가지면 제 칸을 그린다.',
  group: 'data',
  props: z.strictObject({
    repeat: z.number().int().min(1).max(50).default(1),
    kind: z.enum(['data', 'total', 'gap']).default('data'),
    tone: z.enum(['default', 'selected', 'dimmed', 'shaded']).default('default'),
  }),
  editor: [
    { prop: 'repeat', control: 'number', label: '되풀이' },
    { prop: 'kind', control: 'select', label: '종류', options: ['data', 'total', 'gap'] },
    { prop: 'tone', control: 'select', label: '행 꼴', options: ['default', 'selected', 'dimmed', 'shaded'] },
  ],
  summary: (props) => joined(rowKindWord(props.kind), rowToneWord(props.tone), props.kind === 'gap' ? null : repeatWord(props.repeat)),
  states: [],
  zones: [{ name: 'body', label: '칸', accepts: ['GridCell'] }],
  placement: { type: 'DataGrid', zone: 'rows' },
})

/** 행이 제 손으로 그린 칸 하나 — 가로 · 세로로 열 · 줄 여럿을 덮을 수 있다(HTML 표의 `colspan` · `rowspan`). */
export const GridCellDef = defineComponent({
  type: 'GridCell',
  label: '칸',
  description: '행이 제 손으로 그린 칸. 열 여럿을 덮을 수 있다.',
  group: 'data',
  props: z.strictObject({
    span: z.number().int().min(1).max(50).default(1),
    rowSpan: z.number().int().min(1).max(50).default(1),
  }),
  editor: [
    { prop: 'span', control: 'number', label: '가로 칸 수' },
    { prop: 'rowSpan', control: 'number', label: '세로 칸 수' },
  ],
  summary: (props) => joined(spanWord('가로', props.span), spanWord('세로', props.rowSpan)),
  states: [],
  zones: [{ name: 'body', label: '내용' }],
  placement: { type: 'GridRow', zone: 'body' },
})

/**
 * 페이지네이션 바 — 행 수 셀렉트 · 쪽 번호 · 범위 글(«1 - 10 (총 72 항목 중)»). 수는 모두 이 바의 props 로 셈한다(설계 Q3) — 그리드의 행
 * 수와 잇지 않는다(그리드 행은 대표 행이고 바의 수는 검색 결과 전체다).
 */
export const PaginationDef = defineComponent({
  type: 'Pagination',
  label: '페이지네이션',
  description: '행 수 셀렉트 · 쪽 번호 · 범위 글을 한 줄에 둔다.',
  group: 'data',
  props: z.strictObject({
    total: z.number().int().min(0).max(1_000_000).default(72),
    pageSize: z.number().int().min(1).max(1000).default(10),
    page: z.number().int().min(1).max(1_000_000).default(1),
    sizeSelect: z.boolean().default(true),
    range: z.boolean().default(true),
  }),
  editor: [
    { prop: 'total', control: 'number', label: '총 건수' },
    { prop: 'pageSize', control: 'number', label: '쪽 크기' },
    { prop: 'page', control: 'number', label: '지금 쪽' },
    { prop: 'sizeSelect', control: 'switch', label: '행 수 셀렉트' },
    { prop: 'range', control: 'switch', label: '범위 글' },
  ],
  summary: (props) => {
    const total = integer(props.total)
    return total === null ? null : `총 ${total}`
  },
  states: [],
  zones: [],
})

function selectWord(value: unknown): string | null {
  return value === 'check' ? '체크 선택' : value === 'radio' ? '라디오 선택' : null
}

function fixedWord(value: unknown): string | null {
  const count = integer(value)
  return count === null || count === 0 ? null : `고정 ${count}`
}

function rowKindWord(value: unknown): string | null {
  return value === 'total' ? '합계' : value === 'gap' ? '생략' : null
}

function rowToneWord(value: unknown): string | null {
  return value === 'selected' ? '강조' : value === 'dimmed' ? '흐림' : value === 'shaded' ? '음영' : null
}

function repeatWord(value: unknown): string | null {
  const count = integer(value)
  return count === null ? null : `×${count}`
}

function spanWord(axis: string, value: unknown): string | null {
  const count = integer(value)
  return count === null || count <= 1 ? null : `${axis} ${count}`
}

export const TreeDef = defineComponent({
  type: 'Tree',
  label: '트리',
  description: '계층이 있는 항목을 접었다 펴며 보인다.',
  group: 'data',
  props: z.strictObject({
    items: z.array(z.string()).default(['항목 1', '항목 2']),
    depth: z.number().int().min(1).max(5).default(2),
    selected: z.boolean().default(false),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'items', control: 'stringList', label: '항목' },
    { prop: 'depth', control: 'number', label: '깊이' },
    // `states`와 짝이다 — 둘 다 없으면 트리의 선택·비활성 표현이 도달 불가다.
    { prop: 'selected', control: 'switch', label: '선택 상태' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  summary: (props) => {
    const count = countOf(props.items)
    return count === null ? null : `항목 ${count}`
  },
  states: ['selected', 'disabled'],
  zones: [],
})

export const KeyValueDef = defineComponent({
  type: 'KeyValue',
  label: '키-값 목록',
  description: '항목 이름과 값을 짝지어 보인다. 상세 화면에 쓴다.',
  group: 'data',
  props: z.strictObject({
    pairs: z.array(z.strictObject({ key: z.string(), value: z.string() })).default([{ key: '항목', value: '값' }]),
    columns: z.number().int().min(1).max(4).default(1),
  }),
  editor: [
    { prop: 'pairs', control: 'pairList', label: '키-값' },
    { prop: 'columns', control: 'number', label: '열 수' },
  ],
  summary: (props) => {
    const count = countOf(props.pairs)
    return count === null ? null : `${count}쌍`
  },
  states: [],
  zones: [],
})
