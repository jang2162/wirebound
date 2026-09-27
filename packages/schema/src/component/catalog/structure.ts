import { z } from 'zod'
import { defineComponent } from '../define'

export const PageDef = defineComponent({
  type: 'Page',
  label: '페이지',
  description: '설계서 한 장의 뿌리. 모든 내용이 이 안에 담긴다.',
  group: 'structure',
  props: z.strictObject({}),
  editor: [],
  states: [],
  children: 'many',
})

export const SlotDef = defineComponent({
  type: 'Slot',
  label: '슬롯',
  description: '레이아웃이 페이지 내용을 끼우는 자리. 레이아웃 문서 전용이다.',
  group: 'structure',
  props: z.strictObject({}),
  editor: [],
  states: [],
  children: 'none',
})

export const SectionDef = defineComponent({
  type: 'Section',
  label: '영역',
  description: '화면을 크게 가르는 묶음. 배경과 여백을 따로 준다.',
  group: 'structure',
  props: z.strictObject({
    compact: z.boolean().default(false),
  }),
  editor: [{ prop: 'compact', control: 'switch', label: '좁은 여백' }],
  states: [],
  children: 'many',
})

export const FlexDef = defineComponent({
  type: 'Flex',
  label: '배치',
  description: '자식을 가로나 세로 한 줄로 늘어놓는다.',
  group: 'structure',
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
  states: [],
  children: 'many',
})

export const GridDef = defineComponent({
  type: 'Grid',
  label: '그리드',
  description: '자식을 정해진 열 수로 나눠 배치한다.',
  group: 'structure',
  props: z.strictObject({
    columns: z.number().int().min(1).max(12).default(2),
  }),
  editor: [{ prop: 'columns', control: 'number', label: '열 수' }],
  states: [],
  children: 'many',
})

export const CardDef = defineComponent({
  type: 'Card',
  label: '카드',
  description: '제목과 내용을 한 덩어리로 묶어 보이는 상자.',
  group: 'structure',
  props: z.strictObject({
    title: z.string().default(''),
    subtitle: z.string().default(''),
  }),
  editor: [
    { prop: 'title', control: 'text', label: '제목' },
    { prop: 'subtitle', control: 'text', label: '부제' },
  ],
  states: [],
  children: 'many',
})

export const TabsDef = defineComponent({
  type: 'Tabs',
  label: '탭',
  description: '여러 화면을 탭으로 갈라 한 번에 하나씩 보인다.',
  group: 'structure',
  props: z.strictObject({
    tabs: z.array(z.string()).default(['탭 1', '탭 2']),
    active: z.number().int().min(0).default(0),
  }),
  editor: [
    { prop: 'tabs', control: 'stringList', label: '탭 목록' },
    { prop: 'active', control: 'number', label: '활성 탭' },
  ],
  states: [],
  children: 'many',
})
