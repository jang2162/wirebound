/**
 * **속성 칸의 묶음**(«컴포넌트» 탭 — `./property-panel.tsx`). 카탈로그의 `EditorField` 는 prop 의 묶음을 안 갖고(`control` 뿐이다) 타입마다 손으로
 * 늘어놓으면 카탈로그가 늘 때마다 이 표가 낡는다 — 그래서 **칸의 꼴(`control`)에서 짓는 규칙 + prop 이름의 예외 표**로 가른다.
 *
 * | 묶음 | 규칙 |
 * |---|---|
 * | 내용 | `control` 이 글 · 목록 · 그림(`CONTENT_CONTROLS`) — 제목 · 라벨 · 값 · 안내 문구 · 선택지 · 파일 · 항목 · 그림 |
 * | 표시 | `select` · `number` · `color` · `STATE_PROPS` 밖의 `switch` |
 * | 레이아웃 | prop 이름이 `LAYOUT_PROPS` — 방향 · 정렬 · 줄바꿈 · 열 수 · 칸 수 · 폭 · 크기 · 여백 · 모서리 · 비율 |
 * | 상태 | `switch` 이고 prop 이름이 `STATE_PROPS` — 비활성 · 읽기 전용 · 오류 · 로딩 · 빈 · 선택 · 접힘 |
 *
 * 칸이 아닌 줄(노드 봉투의 필드 · 화면 명령)은 속성 패널이 제 묶음에 넣는다 — 변형은 표시, 공통코드 · 행 내용은 내용, 몫은 레이아웃, 상태 보임은 상태다.
 * 묶음 안 차례는 카탈로그 `editor` 차례 그대로다. **모르는 `control` 은 묶음이 없다(`null`)** — 기본 묶음으로 새지 않아 카탈로그에 새 꼴이 들면
 * `test/panels/prop-groups.test.ts` 가 `CATALOG_TYPES` 전부를 돌며 잡는다.
 */
import type { EditorControl, EditorField } from '@wirebound/schema'

export type PropGroup = 'content' | 'look' | 'layout' | 'state'

/** 그리는 차례와 머리 글. */
export const PROP_GROUPS: readonly { id: PropGroup; label: string }[] = [
  { id: 'content', label: '내용' },
  { id: 'look', label: '표시' },
  { id: 'layout', label: '레이아웃' },
  { id: 'state', label: '상태' },
]

const CONTENT_CONTROLS: ReadonlySet<EditorControl> = new Set([
  'text',
  'textarea',
  'optionList',
  'pairList',
  'fileList',
  'treeItems',
  'image',
])
const LOOK_CONTROLS: ReadonlySet<EditorControl> = new Set(['select', 'number', 'color', 'switch'])

/** 배치를 정하는 prop 이름 — 꼴과 무관하게 레이아웃이다. */
export const LAYOUT_PROPS: ReadonlySet<string> = new Set([
  'direction',
  'align',
  'justify',
  'wrap',
  'columns',
  'fixedColumns',
  'span',
  'rowSpan',
  'size',
  'width',
  'height',
  'padding',
  'radius',
  'ratio',
])

/** 화면 상태를 흉내 내는 켜고 끔 — `switch` 일 때만 상태다. */
export const STATE_PROPS: ReadonlySet<string> = new Set(['disabled', 'readonly', 'invalid', 'loading', 'empty', 'selected', 'collapsed'])

export function propGroupOf(field: Pick<EditorField, 'prop' | 'control'>): PropGroup | null {
  if (field.control === 'switch' && STATE_PROPS.has(field.prop)) return 'state'
  if (LAYOUT_PROPS.has(field.prop) && (LOOK_CONTROLS.has(field.control) || CONTENT_CONTROLS.has(field.control))) return 'layout'
  if (CONTENT_CONTROLS.has(field.control)) return 'content'
  if (LOOK_CONTROLS.has(field.control)) return 'look'
  return null
}

/**
 * 선택지를 세그먼트 단추로 그리는가 — 넷 이하이고 글이 값 칸(기본 폭에서 ≈ 200px)에 한 줄로 드는 것만. 글자 수 + 단추마다 둘(여백)이 30 을
 * 넘으면 `<select>` 그대로다(`illustration` 같은 긴 낱말 넷은 300px 패널에서 줄이 넘친다).
 */
export function segmentable(options: readonly string[]): boolean {
  if (options.length < 2 || options.length > 4) return false
  return options.reduce((sum, option) => sum + option.length + 2, 0) <= 30
}
