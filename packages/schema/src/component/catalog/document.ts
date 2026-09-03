import { z } from 'zod'
import { defineComponent } from '../define'

export const TextDef = defineComponent({
  type: 'Text',
  label: '텍스트',
  description: '제목·본문 같은 글. 역할이 크기를 정한다.',
  group: 'document',
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
  structures: ['image', 'video', 'illustration', 'chart'],
  // `frame`·`caption`은 네 구조가 다 쓴다. 뒤의 것들은 그 구조에만 나온다 —
  // 조각 이름은 **테마가 쓸 수 있는 어휘**이고(§5.1) 어휘에 없으면 스타일할 길이 없다.
  //
  // **네 구조를 갈라 그리는 것이 이 이름들이다.** 빈 상자 넷은 와이어프레임에서 전부
  // "사진"으로 읽힌다 — `play`(영상)·`glyph`(일러스트)·`plot`+`legend`(차트)가
  // 그 넷을 서로 다른 것으로 만든다.
  parts: ['frame', 'caption', 'play', 'glyph', 'plot', 'legend'],
  variants: [],
  states: [],
  children: 'none',
})

export const DividerDef = defineComponent({
  type: 'Divider',
  label: '구분선',
  description: '내용을 가르는 선.',
  group: 'document',
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
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})
