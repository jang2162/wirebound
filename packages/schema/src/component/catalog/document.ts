import { z } from 'zod'
import { defineComponent } from '../define'

export const TextDef = defineComponent({
  type: 'Text',
  props: z.strictObject({
    content: z.string().default('텍스트'),
    role: z
      .enum(['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'])
      .default('body'),
  }),
  editor: [
    { prop: 'content', control: 'textarea', label: '내용' },
    {
      prop: 'role',
      control: 'select',
      label: '역할',
      options: ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'],
    },
  ],
  structures: ['default'],
  parts: [],
  // `role`의 enum 값 그대로다. `variantFrom`이 그 둘이 어긋나지 않는 것을 검사한다.
  variants: ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption'],
  variantFrom: 'role',
  states: [],
  children: 'none',
})

export const MediaDef = defineComponent({
  type: 'Media',
  props: z.strictObject({
    kind: z.enum(['image', 'video', 'illustration', 'chart']).default('image'),
    caption: z.string().default(''),
    ratio: z.enum(['16/9', '4/3', '1/1', '3/4']).default('16/9'),
  }),
  editor: [
    { prop: 'kind', control: 'select', label: '종류', options: ['image', 'video', 'illustration', 'chart'] },
    { prop: 'ratio', control: 'select', label: '비율', options: ['16/9', '4/3', '1/1', '3/4'] },
    { prop: 'caption', control: 'text', label: '설명' },
  ],
  structures: ['image', 'video', 'illustration', 'chart'],
  parts: ['frame', 'caption'],
  variants: [],
  states: [],
  children: 'none',
})

export const DividerDef = defineComponent({
  type: 'Divider',
  props: z.strictObject({
    direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),
  editor: [
    { prop: 'direction', control: 'select', label: '방향', options: ['horizontal', 'vertical'] },
  ],
  structures: ['default'],
  parts: [],
  variants: ['horizontal', 'vertical'],
  variantFrom: 'direction',
  states: [],
  children: 'none',
})

export const PlaceholderDef = defineComponent({
  type: 'Placeholder',
  props: z.strictObject({
    label: z.string().default('미정 영역'),
    height: z.number().int().min(20).max(1000).default(120),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'height', control: 'number', label: '높이(px)' },
  ],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})
