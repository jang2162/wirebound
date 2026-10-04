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
  }),
  editor: [{ prop: 'collapsed', control: 'switch', label: '접힌 상태' }],
  states: [],
  children: 'many',
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
  children: 'many',
})

export const FieldDef = defineComponent({
  type: 'Field',
  label: '입력 필드',
  description: '입력 한 칸. 종류에 따라 텍스트·선택·날짜가 된다.',
  group: 'input',
  props: z.strictObject({
    label: z.string().default('라벨'),
    control: z
      .enum(['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'])
      .default('text'),
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
  children: 'none',
})
