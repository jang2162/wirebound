import { z } from 'zod'
import { defineComponent } from '../define'

export const SearchFormDef = defineComponent({
  type: 'SearchForm',
  props: z.strictObject({
    collapsed: z.boolean().default(false),
  }),
  editor: [{ prop: 'collapsed', control: 'switch', label: '접힌 상태' }],
  structures: ['inline', 'stacked', 'collapsible'],
  parts: ['fields', 'actions'],
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
  variants: [],
  states: ['required', 'disabled', 'invalid'],
  children: 'none',
})
