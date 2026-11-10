import { z } from 'zod'
import { defineComponent } from '../define'
import { countOf, integer, joined, oneLine } from '../summary'

export const SearchFormDef = defineComponent({
  type: 'SearchForm',
  // **이름은 설계서 「설계서 화면 구조」의 그림에서 빌려 왔다**(*"① 검색폼"*).
  label: '검색폼',
  description: '목록을 거를 조건을 받는 검색 영역.',
  group: 'input',
  props: z.strictObject({
    collapsed: z.boolean().default(false),
    // **기본값이 없다** — 없으면 테마마다의 지금 배치(필드가 옆으로 서고 넘치면 접힌다)다. 정하면 필드를 그 수의 같은 폭 칸으로 깔고, 필드의
    // 몫(`WbNode.weight`)이 차지할 칸 수다. 상한은 `KeyValue.columns` 와 같다.
    columns: z.number().int().min(1).max(4).optional(),
  }),
  editor: [
    { prop: 'collapsed', control: 'switch', label: '접힌 상태' },
    { prop: 'columns', control: 'number', label: '열 수' },
  ],
  states: [],
  // 접히면 안의 노드가 DOM 에 없다 — 그 안을 펼쳐 보일 때는 펴진 판으로 그린다.
  reveal: (props) => ({ ...props, collapsed: false }),
  // 접히면(`collapsed`) 두 구역 다 DOM 에서 빠지고 접기 줄만 선다 — 그 줄은 뷰 몫이다.
  zones: [
    { name: 'body', label: '조건' },
    {
      name: 'actions',
      label: '단추',
      initial: [
        { type: 'Button', props: { label: '초기화' } },
        { type: 'Button', props: { label: '검색' }, variant: 'primary' },
      ],
    },
  ],
})

export const EntryFormDef = defineComponent({
  type: 'EntryForm',
  label: '입력폼',
  description: '여러 항목을 입력받는 등록·수정 폼.',
  group: 'input',
  props: z.strictObject({
    title: z.string().default(''),
  }),
  editor: [{ prop: 'title', control: 'text', label: '제목' }],
  summary: (props) => oneLine(props.title),
  states: [],
  // 새 입력폼은 몸통에 1쌍 폼 표 하나(필드 셋 — 그 폼 표의 `initial`)를 들고 선다. 몸통은 무엇이든 받는다 — 폼 표 여럿 · 구역 제목 · 그리드를 쌓는다.
  zones: [
    { name: 'body', label: '항목', initial: [{ type: 'FormTable' }] },
    {
      name: 'actions',
      label: '단추',
      initial: [
        { type: 'Button', props: { label: '저장' }, variant: 'primary' },
        { type: 'Button', props: { label: '취소' } },
      ],
    },
  ],
})

/**
 * **폼 표** — 라벨|값 칸을 표로 깐다(설계 spec `2026-10-25-form-table-design.md`). 한 줄에 쌍을 `columns` 개 놓고 넘치면 다음 줄이다 — 행은 노드가
 * 아니다. 자식의 몫(`WbNode.weight`)이 차지할 쌍 수이고 열 수로 자른다(몫 ≥ 열 수면 한 줄 전체). 줄 끝 · 넓은 칸이 남긴 구멍의 빈 쌍은 뷰가
 * 채운다(`@wirebound/theme-sdk` 의 `pairRows`). 라벨 칸 · 값 칸은 안의 `Field` 의 `label` · `value` 조각이다.
 *
 * **세 구역 다 무엇이든 받는다**(`accepts` 없음) — 몸통에 `Field` 가 아닌 자식(안내 글 · 그리드)이 서면 그 몫만큼의 쌍 폭을 한 칸으로 덮는다.
 * «머리 오른쪽» 은 `title` 오른쪽의 단추, «옆 칸» 은 표 왼쪽에서 모든 줄을 덮는 칸(사진)이다.
 */
export const FormTableDef = defineComponent({
  type: 'FormTable',
  label: '폼 표',
  description: '라벨|값 칸을 표로 깐다. 한 줄에 쌍을 열 수만큼 놓는다.',
  group: 'input',
  props: z.strictObject({
    // 비면 머리줄째 없다(«머리 오른쪽» 이 차면 제목 없는 머리줄이 선다).
    title: z.string().default(''),
    columns: z.number().int().min(1).max(4).default(1),
  }),
  editor: [
    { prop: 'title', control: 'text', label: '제목' },
    { prop: 'columns', control: 'number', label: '열 수' },
  ],
  summary: (props) => {
    const columns = integer(props.columns)
    return joined(oneLine(props.title), columns === null ? null : `${columns}열`)
  },
  states: [],
  // 선언 차례가 순회 · 트리 차례다 — 화면을 읽는 차례(제목줄 → 왼쪽 칸 → 칸)다.
  zones: [
    { name: 'headEnd', label: '머리 오른쪽' },
    { name: 'aside', label: '옆 칸' },
    { name: 'body', label: '칸', initial: [{ type: 'Field' }, { type: 'Field' }, { type: 'Field' }] },
  ],
})

/**
 * **라벨과 값 칸** — 값 칸(몸통 구역 «값»)에 입력 조각(아래 아홉 · `Button`)을 줄 세운다(설계 spec `2026-10-24-compose-input-design.md` 「1. `Field` 의 꼴」).
 * 새로 만들면 값 칸에 `Input` 하나가 든다(`initial`) — 흔한 «라벨 + 입력 하나» 가 팔레트 한 걸음이다. 입력 종류 · 안내 문구 · 비활성 · 오류는 조각의
 * 것이다. `required` 만 여기 있다 — 라벨 앞 별은 라벨의 것이라 조각마다 두면 한 칸에 별이 여럿 선다.
 *
 * **값 칸은 무엇이든 받는다**(`accepts` 없음) — 값 칸 안의 그리드 · 파일첨부 같은 뒤 단계의 꼴을 막지 않는다. 몸통 하나라 구조 트리에 구역 줄이 안 선다.
 */
export const FieldDef = defineComponent({
  type: 'Field',
  label: '입력 필드',
  description: '라벨과 값 칸. 값 칸에 입력 조각을 줄 세운다.',
  group: 'input',
  props: z.strictObject({
    label: z.string().default('라벨'),
    required: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'required', control: 'switch', label: '필수' },
  ],
  summary: (props) => oneLine(props.label),
  states: ['required'],
  zones: [{ name: 'body', label: '값', initial: [{ type: 'Input' }] }],
})

/**
 * 선택지 한 항목. **고른 것이 항목에 붙는다**(`selected`) — 번호로 두면 항목을 옮기거나 지울 때 번호를 함께 고쳐야 하고, 남이 그 사이 배열을 바꾸면
 * 번호가 다른 항목을 가리킨다. 항목에 붙이면 배열 하나를 통째로 바꾸는 패널 위젯(`apps/web/src/panels/controls/list-control.tsx`)의 한 연산에 고른
 * 것까지 든다. 항목은 노드가 아니다 — 표지 · 상호작용을 항목마다 달 수 없다.
 */
export const OptionSchema = z.strictObject({ label: z.string(), selected: z.boolean().optional() })

export type ChoiceOption = z.infer<typeof OptionSchema>

/** 선택지 수의 상한 — 13칸 체크 칩 · 7칸 세그먼트 · 행 수 고르개를 덮고 패널 위젯이 한 화면에 든다. */
export const OPTIONS_MAX = 30

/** 고른 항목이 하나 이하인가 — 하나만 고르는 타입(`Select` · `RadioGroup`)의 규칙이다. */
export function atMostOneSelected(options: readonly { selected?: boolean }[]): boolean {
  return options.filter((option) => option.selected === true).length <= 1
}

export const ONE_SELECTED_MESSAGE = '하나만 고를 수 있습니다'

/** 하나만 고르는 선택지. 둘 이상 고른 배열은 검증이 거절한다 — 패널 위젯은 그 판을 못 만든다(고르면 다른 항목을 함께 걷는다). */
function singleChoice(defaults: ChoiceOption[]) {
  return z.array(OptionSchema).min(1).max(OPTIONS_MAX).refine(atMostOneSelected, ONE_SELECTED_MESSAGE).default(defaults)
}

function multiChoice(defaults: ChoiceOption[]) {
  return z.array(OptionSchema).min(1).max(OPTIONS_MAX).default(defaults)
}

/** 고정 폭 표지의 값 — 실제 길이는 테마가 정한다(설계의 낱말 «짧은 칸 · 보통 · 긴 칸»). 몫(`WbNode.weight`)을 주면 몫이 이긴다. */
const SIZES = ['short', 'medium', 'long'] as const

/** 값이 있으면 그것, 없으면 안내 문구 — 글을 받는 조각의 요약. */
function valueOrHint(props: Record<string, unknown>): string | null {
  return oneLine(props.value) ?? oneLine(props.placeholder)
}

/** 고른 항목들(없으면 첫 항목) — 선택지 조각의 요약. */
function chosen(props: Record<string, unknown>): string | null {
  const options = props.options
  if (!Array.isArray(options)) return null
  const labelOf = (option: unknown): string | null =>
    option !== null && typeof option === 'object' ? oneLine((option as { label?: unknown }).label) : null
  const picked = options.filter(
    (option) => option !== null && typeof option === 'object' && (option as { selected?: unknown }).selected === true,
  )
  const lines = (picked.length > 0 ? picked : options.slice(0, 1)).map(labelOf).filter((line): line is string => line !== null)
  return lines.length === 0 ? null : lines.join(' · ')
}

export const InputDef = defineComponent({
  type: 'Input',
  code: { kind: 'label', prop: 'value' },
  label: '입력',
  description: '글 · 숫자 · 비밀번호를 받는 한 줄 입력 칸.',
  group: 'input',
  props: z.strictObject({
    kind: z.enum(['text', 'number', 'password']).default('text'),
    value: z.string().default(''),
    placeholder: z.string().default(''),
    size: z.enum(SIZES).default('medium'),
    disabled: z.boolean().default(false),
    readonly: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'kind', control: 'select', label: '종류', options: ['text', 'number', 'password'] },
    { prop: 'value', control: 'text', label: '값' },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'size', control: 'select', label: '폭', options: [...SIZES] },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'readonly', control: 'switch', label: '읽기 전용' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  summary: valueOrHint,
  states: ['disabled', 'readonly', 'invalid'],
  zones: [],
})

export const TextAreaDef = defineComponent({
  type: 'TextArea',
  label: '여러 줄 입력',
  description: '여러 줄 글을 받는 입력 칸.',
  group: 'input',
  props: z.strictObject({
    value: z.string().default(''),
    placeholder: z.string().default(''),
    rows: z.number().int().min(1).max(20).default(3),
    disabled: z.boolean().default(false),
    readonly: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'value', control: 'textarea', label: '값' },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'rows', control: 'number', label: '줄 수' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'readonly', control: 'switch', label: '읽기 전용' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  summary: valueOrHint,
  states: ['disabled', 'readonly', 'invalid'],
  zones: [],
})

export const SelectDef = defineComponent({
  type: 'Select',
  code: { kind: 'choices' },
  label: '셀렉트',
  description: '펼쳐서 항목 하나를 고르는 칸.',
  group: 'input',
  props: z.strictObject({
    options: singleChoice([{ label: '항목 1' }, { label: '항목 2' }]),
    placeholder: z.string().default('== 선택 =='),
    size: z.enum(SIZES).default('medium'),
    disabled: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'options', control: 'optionList', label: '선택지', select: 'one' },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'size', control: 'select', label: '폭', options: [...SIZES] },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  summary: chosen,
  states: ['disabled', 'invalid'],
  zones: [],
})

export const DateInputDef = defineComponent({
  type: 'DateInput',
  label: '날짜',
  description: '날짜 하나를 받는 칸.',
  group: 'input',
  props: z.strictObject({
    value: z.string().default(''),
    placeholder: z.string().default('YYYY-MM-DD'),
    disabled: z.boolean().default(false),
    readonly: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'value', control: 'text', label: '값' },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'readonly', control: 'switch', label: '읽기 전용' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  summary: valueOrHint,
  states: ['disabled', 'readonly', 'invalid'],
  zones: [],
})

export const TimeInputDef = defineComponent({
  type: 'TimeInput',
  label: '시간',
  description: '시각 하나를 받는 칸.',
  group: 'input',
  props: z.strictObject({
    value: z.string().default(''),
    placeholder: z.string().default('00:00'),
    disabled: z.boolean().default(false),
    readonly: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'value', control: 'text', label: '값' },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'readonly', control: 'switch', label: '읽기 전용' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  summary: valueOrHint,
  states: ['disabled', 'readonly', 'invalid'],
  zones: [],
})

// 테마 변형 `checkbox` · `chip`(체크 칩 묶음)은 테마 manifest 가 선언한다 — 자료 모양이 같고 다른 것은 모양뿐이다(설계 Q1).
export const CheckboxGroupDef = defineComponent({
  type: 'CheckboxGroup',
  code: { kind: 'choices' },
  label: '체크박스',
  description: '항목을 여럿 고르는 체크 묶음. 하나면 단일 체크다.',
  group: 'input',
  props: z.strictObject({
    options: multiChoice([{ label: '선택' }]),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'options', control: 'optionList', label: '선택지', select: 'many' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  summary: chosen,
  states: ['disabled'],
  zones: [],
})

// 테마 변형 `radio` · `segment`(붙은 칸 — 고른 칸이 채워진다)는 테마 manifest 가 선언한다(설계 Q1). 고른 항목 0 개도 받는다(세그먼트의 «미선택»).
export const RadioGroupDef = defineComponent({
  type: 'RadioGroup',
  code: { kind: 'choices' },
  label: '라디오 묶음',
  description: '항목 하나를 고르는 묶음. 테마에 따라 세그먼트로 선다.',
  group: 'input',
  props: z.strictObject({
    options: singleChoice([{ label: 'Y' }, { label: 'N' }]),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'options', control: 'optionList', label: '선택지', select: 'one' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  summary: chosen,
  states: ['disabled'],
  zones: [],
})

export const ChipDef = defineComponent({
  type: 'Chip',
  code: { kind: 'label', prop: 'label' },
  label: '칩',
  description: '고른 값을 보이는 작은 꼬리표. 지우기 표지를 달 수 있다.',
  group: 'input',
  props: z.strictObject({
    label: z.string().default('칩'),
    removable: z.boolean().default(true),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '글' },
    { prop: 'removable', control: 'switch', label: '지우기 표지' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  summary: (props) => oneLine(props.label),
  states: ['disabled'],
  zones: [],
})

export const AffixDef = defineComponent({
  type: 'Affix',
  code: { kind: 'label', prop: 'text' },
  label: '사이 글자',
  description: '조각 사이의 짧은 글(~ · 부터 · % · 안내 글).',
  group: 'input',
  props: z.strictObject({
    text: z.string().default('~'),
    tone: z.enum(['default', 'muted', 'danger', 'primary']).default('default'),
  }),
  editor: [
    { prop: 'text', control: 'text', label: '글' },
    { prop: 'tone', control: 'select', label: '색조', options: ['default', 'muted', 'danger', 'primary'] },
  ],
  summary: (props) => oneLine(props.text),
  states: [],
  zones: [],
})

/**
 * 파일 목록의 한 줄 — 설계서의 파일 행은 늘 표본 값(«이름.PDF | 2.1 MB»)이라 이름 · 크기 글 둘이다(실제 파일을 올리지 않는다 — 설계 spec
 * `2026-10-26-popup-attach-repeat-design.md` «4»). **노드가 아니다** — 선택지(`OptionSchema`)와 같이 표지 · 상호작용을 줄마다 달 수 없다. 이름은 빈
 * 글도 받는다 — 목록 위젯의 «항목 추가» 가 빈 줄을 더한다(빈 이름을 막으면 더하는 순간 422 다).
 */
export const FileEntrySchema = z.strictObject({ name: z.string().max(200), size: z.string().max(20) })

export type FileEntry = z.infer<typeof FileEntrySchema>

/** 파일 목록의 상한 — 넘는 값은 422 다(목록 위젯은 상한에서 «항목 추가» 를 끈다). */
export const FILES_MAX = 20

/**
 * **파일첨부** — 단추 줄(«단추» 구역 — 기본 `[파일추가][항목 제거][전체 항목 제거]`) · 파일 목록 표(머리 `□ | 파일이름 | 파일크기` 는 뷰의 고정 글) · 빈 목록
 * 안내 · 한도 글(«최대 {maxFiles}개 {maxSize} 제한» — 수는 뷰가 조각으로 감싸 테마가 칠한다). 값 칸(`Field`) 안이면 렌더러가 필드 이름을 준다.
 * `Field` 의 값 조각(조합 입력)이 아니다 — 한 값이 아니라 목록 · 단추 · 글을 품은 상자다.
 */
export const FileAttachDef = defineComponent({
  type: 'FileAttach',
  label: '파일첨부',
  description: '파일을 붙이는 칸. 단추 · 파일 목록 · 빈 목록 안내 · 한도 글.',
  group: 'input',
  props: z.strictObject({
    files: z.array(FileEntrySchema).max(FILES_MAX).default([]),
    // 0 이면 개수 글이 없다 · 빈 글이면 크기 글이 없다 — 둘 다 없으면 한도 줄째 없다.
    maxFiles: z.number().int().min(0).max(99).default(1),
    maxSize: z.string().max(20).default('100 MB'),
    hint: z.string().default('이곳을 더블클릭 또는 파일을 드래그 하세요'),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'files', control: 'fileList', label: '파일' },
    { prop: 'maxFiles', control: 'number', label: '최대 개수', hint: '한도 글의 개수 — 0 이면 개수를 안 적습니다' },
    { prop: 'maxSize', control: 'text', label: '최대 크기', hint: '한도 글의 크기 — 비우면 크기를 안 적습니다' },
    { prop: 'hint', control: 'text', label: '빈 목록 안내' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  summary: (props) => {
    const files = countOf(props.files)
    const max = integer(props.maxFiles)
    return joined(files === null ? null : `파일 ${files}개`, max === null || max === 0 ? null : `최대 ${max}개`)
  },
  states: ['disabled'],
  zones: [
    {
      name: 'actions',
      label: '단추',
      initial: [
        { type: 'Button', props: { label: '파일추가' } },
        { type: 'Button', props: { label: '항목 제거' } },
        { type: 'Button', props: { label: '전체 항목 제거' } },
      ],
    },
  ],
})
