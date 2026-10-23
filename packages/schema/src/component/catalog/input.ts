import { z } from 'zod'
import { defineComponent } from '../define'
import { joined, oneLine } from '../summary'

export const SearchFormDef = defineComponent({
  type: 'SearchForm',
  // **이름은 설계서 「설계서 화면 구조」의 그림에서 빌려 왔다**(*"① 검색폼"*) — `List`와 같은 근거다.
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
  // 접히면(`collapsed`) 두 구역 다 DOM 에서 빠지고 접기 줄만 선다 — 그 줄은 뷰 몫이다.
  zones: [
    { name: 'body', label: '조건' },
    {
      name: 'actions',
      label: '단추',
      initial: [
        { type: 'Button', props: { label: '초기화' } },
        { type: 'Button', props: { label: '검색' } },
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
  zones: [
    { name: 'body', label: '항목' },
    {
      name: 'actions',
      label: '단추',
      initial: [
        { type: 'Button', props: { label: '저장' } },
        { type: 'Button', props: { label: '취소' } },
      ],
    },
  ],
})

export const FieldDef = defineComponent({
  type: 'Field',
  label: '입력 필드',
  description: '입력 한 칸. 종류에 따라 텍스트·선택·날짜가 된다.',
  group: 'input',
  props: z.strictObject({
    label: z.string().default('라벨'),
    control: z.enum(['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file']).default('text'),
    placeholder: z.string().default(''),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    {
      prop: 'control',
      control: 'select',
      label: '입력 종류',
      options: ['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'],
    },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'required', control: 'switch', label: '필수' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  variantFrom: 'control',
  summary: (props) => joined(oneLine(props.label), oneLine(props.control)),
  states: ['required', 'disabled', 'invalid'],
  zones: [],
})
