import { z } from 'zod'
import { defineComponent } from '../define'

export const SearchFormDef = defineComponent({
  type: 'SearchForm',
  props: z.strictObject({
    collapsed: z.boolean().default(false),
  }),
  editor: [{ prop: 'collapsed', control: 'switch', label: '접힌 상태' }],
  structures: ['inline', 'stacked', 'collapsible'],
  // `row`는 `stacked`가 자식 하나마다 내는 줄이다. **테마는 §6.5에서 `parts`만 겨냥할 수
  // 있고 자식 컴포넌트를 직접 겨냥할 수 없으므로**, 줄이 조각으로 나오지 않으면 줄 사이
  // 간격·구분선에 손댈 길이 아예 없다 — `flex-direction: column`으로 대신할 수 없는 것이
  // 그 부분이고, `stacked`가 `inline`과 DOM으로 갈리는 근거다.
  parts: ['fields', 'actions', 'row'],
  variants: [],
  states: [],
  children: 'many',
})

export const EntryFormDef = defineComponent({
  type: 'EntryForm',
  props: z.strictObject({
    title: z.string().default(''),
  }),
  editor: [{ prop: 'title', control: 'text', label: '제목' }],
  structures: ['labelLeft', 'labelTop', 'sectioned'],
  parts: ['row', 'label', 'control', 'actions'],
  variants: [],
  states: [],
  children: 'many',
})

export const FieldDef = defineComponent({
  type: 'Field',
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
  structures: ['outlined', 'filled', 'underlined'],
  parts: ['label', 'control', 'help'],
  // `control`의 enum 값 그대로다. 계획서 표는 설계 §5의 문장에서 옮긴 것이었는데,
  // 카탈로그의 실제 enum과 대조해 보니 아홉으로 일치했다.
  variants: ['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'],
  variantFrom: 'control',
  states: ['required', 'disabled', 'invalid'],
  children: 'none',
})
