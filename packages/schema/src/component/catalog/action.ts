import { z } from 'zod'
import { defineComponent } from '../define'

export const ButtonDef = defineComponent({
  type: 'Button',
  props: z.strictObject({
    label: z.string().default('버튼'),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'loading', control: 'switch', label: '로딩' },
  ],
  structures: ['solid', 'outline', 'text'],
  parts: ['label'],
  variants: ['primary', 'secondary', 'danger', 'ghost'],
  states: ['disabled', 'loading'],
  children: 'none',
})

export const LinkDef = defineComponent({
  type: 'Link',
  props: z.strictObject({
    label: z.string().default('링크'),
    target: z.string().default(''),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'target', control: 'text', label: '이동 대상' },
  ],
  structures: ['default'],
  parts: [],
  variants: ['default', 'muted'],
  states: ['disabled'],
  children: 'none',
})
