import { z } from 'zod'
import { defineComponent } from '../define'

export const PageDef = defineComponent({
  type: 'Page',
  props: z.strictObject({}),
  editor: [],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'many',
})

export const SlotDef = defineComponent({
  type: 'Slot',
  props: z.strictObject({}),
  editor: [],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none',
})

export const SectionDef = defineComponent({
  type: 'Section',
  props: z.strictObject({
    compact: z.boolean().default(false),
  }),
  editor: [{ prop: 'compact', control: 'switch', label: '좁은 여백' }],
  structures: ['contained', 'fullBleed', 'splitBg'],
  // `band`는 `splitBg`가 내는 조각이다 — *"배경이 갈린 쪽"*을 테마가 겨냥할 셀렉터가
  // 없으면 그 구조를 표현할 방법이 아예 없다(§5.1: 테마는 `parts`에 없는 조각을 스타일링할
  // 수 없다). 의사 요소는 테마 어휘에 없으므로 대안이 아니다.
  parts: ['inner', 'band'],
  variants: ['default', 'hero', 'muted'],
  states: [],
  children: 'many',
})

export const FlexDef = defineComponent({
  type: 'Flex',
  props: z.strictObject({
    direction: z.enum(['row', 'column']).default('row'),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
    justify: z.enum(['start', 'center', 'end', 'between']).default('start'),
    wrap: z.boolean().default(false),
  }),
  editor: [
    { prop: 'direction', control: 'select', label: '방향', options: ['row', 'column'] },
    { prop: 'align', control: 'select', label: '교차축 정렬', options: ['start', 'center', 'end', 'stretch'] },
    { prop: 'justify', control: 'select', label: '주축 정렬', options: ['start', 'center', 'end', 'between'] },
    { prop: 'wrap', control: 'switch', label: '줄바꿈' },
  ],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'many',
})

export const GridDef = defineComponent({
  type: 'Grid',
  props: z.strictObject({
    columns: z.number().int().min(1).max(12).default(2),
  }),
  editor: [{ prop: 'columns', control: 'number', label: '열 수' }],
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'many',
})

export const CardDef = defineComponent({
  type: 'Card',
  props: z.strictObject({
    title: z.string().default(''),
    subtitle: z.string().default(''),
  }),
  editor: [
    { prop: 'title', control: 'text', label: '제목' },
    { prop: 'subtitle', control: 'text', label: '부제' },
  ],
  structures: ['plain', 'bordered', 'elevated', 'mediaTop', 'horizontal'],
  // `media`는 `mediaTop`·`horizontal`이 내는 조각이다 — *"카드에 이미지 자리가 있다"*는
  // 테마가 겨냥할 상자 없이는 표현할 수 없다(§6.5: `parts`가 테마 매핑의 실제 지점이다).
  // **이름은 `List`의 §5.1 예시에서 빌려 왔다** — 같은 뜻의 조각을 그쪽이 이미 `media`라
  // 부른다. 그룹마다 새 이름을 지으면 테마 작성자가 외울 것이 는다.
  parts: ['header', 'title', 'subtitle', 'body', 'media'],
  variants: ['default', 'featured'],
  states: [],
  children: 'many',
})

export const TabsDef = defineComponent({
  type: 'Tabs',
  props: z.strictObject({
    tabs: z.array(z.string()).default(['탭 1', '탭 2']),
    active: z.number().int().min(0).default(0),
  }),
  editor: [
    { prop: 'tabs', control: 'stringList', label: '탭 목록' },
    { prop: 'active', control: 'number', label: '활성 탭' },
  ],
  structures: ['underline', 'pill', 'enclosed', 'vertical'],
  parts: ['list', 'tab', 'panel'],
  variants: [],
  states: [],
  children: 'many',
})
