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
    // `states: ['disabled']`와 짝이다(P0 이월 #9). `Button`은 처음부터 갖고 있었다.
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  structures: ['default'],
  parts: [],
  variants: ['default', 'muted'],
  states: ['disabled'],
  children: 'none',
})
