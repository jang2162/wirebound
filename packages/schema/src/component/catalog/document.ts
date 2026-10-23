import { z } from 'zod'
import { defineComponent } from '../define'
import { SUMMARY_TEXT_MAX, axisWord, clipped, joined, oneLine } from '../summary'

export const TextDef = defineComponent({
  type: 'Text',
  label: '텍스트',
  description: '제목·본문 같은 글. 역할이 크기를 정한다.',
  group: 'document',
  props: z.strictObject({
    content: z.string().default('텍스트'),
    role: z.enum(['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption']).default('body'),
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
  variantFrom: 'role',
  summary: (props) => clipped(props.content, SUMMARY_TEXT_MAX),
  states: [],
  zones: [],
})

export const MediaDef = defineComponent({
  type: 'Media',
  label: '미디어',
  description: '이미지·영상·차트가 들어갈 자리.',
  group: 'document',
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
  summary: (props) => joined(oneLine(props.kind), oneLine(props.caption)),
  states: [],
  zones: [],
})

export const DividerDef = defineComponent({
  type: 'Divider',
  label: '구분선',
  description: '내용을 가르는 선.',
  group: 'document',
  props: z.strictObject({
    direction: z.enum(['horizontal', 'vertical']).default('horizontal'),
  }),
  editor: [{ prop: 'direction', control: 'select', label: '방향', options: ['horizontal', 'vertical'] }],
  variantFrom: 'direction',
  summary: (props) => axisWord(props.direction),
  states: [],
  zones: [],
})

export const PlaceholderDef = defineComponent({
  type: 'Placeholder',
  // **`영역`이 아닌 것에 근거가 있다.** 이 컴포넌트의 `label` 기본값이 `'미정 영역'`이라
  // 이름을 `영역`으로 두면 상호작용 문장이 *"미정 영역 영역"*이 된다(`describe.ts`가 이
  // 이름을 그대로 쓴다). 짧게 «고치지» 마라.
  label: '자리 표시자',
  description: '아직 정하지 않은 자리. 크기만 잡아 둔다.',
  group: 'document',
  props: z.strictObject({
    label: z.string().default('미정 영역'),
    height: z.number().int().min(20).max(1000).default(120),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'height', control: 'number', label: '높이(px)' },
  ],
  summary: (props) => oneLine(props.label),
  states: [],
  zones: [],
})
