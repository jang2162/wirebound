import { z } from 'zod'
import { defineComponent } from '../define'
import { axisWord, integer, joined, oneLine } from '../summary'

export const PageDef = defineComponent({
  type: 'Page',
  label: '페이지',
  description: '설계서 한 장의 뿌리. 모든 내용이 이 안에 담긴다.',
  group: 'structure',
  props: z.strictObject({}),
  editor: [],
  states: [],
  zones: [{ name: 'body', label: '몸통' }],
})

export const SlotDef = defineComponent({
  type: 'Slot',
  label: '슬롯',
  description: '레이아웃이 페이지 내용을 끼우는 자리. 레이아웃 문서 전용이다.',
  group: 'structure',
  props: z.strictObject({}),
  editor: [],
  states: [],
  zones: [],
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
  zones: [{ name: 'body', label: '몸통' }],
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
  summary: (props) => joined(axisWord(props.direction), props.wrap === true ? '줄바꿈' : null),
  states: [],
  zones: [{ name: 'body', label: '몸통' }],
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
  summary: (props) => {
    const columns = integer(props.columns)
    return columns === null ? null : `${columns}열`
  },
  states: [],
  zones: [{ name: 'body', label: '몸통' }],
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
  summary: (props) => oneLine(props.title),
  states: [],
  zones: [
    { name: 'titleSide', label: '제목 옆' },
    { name: 'headEnd', label: '머리 오른쪽' },
    { name: 'body', label: '몸통' },
    { name: 'footer', label: '바닥' },
  ],
})

/**
 * 탭 — 탭마다 `TabPanel` 노드 하나를 몸통에 둔다(탭 이름은 패널의 `label`). `active`는 «몇째 패널»(0 부터 · 숨은 패널도 센다)이고, 그 자리의
 * 패널이 지금 상태에서 숨었거나 없으면 보이는 첫 패널을 연다.
 */
export const TabsDef = defineComponent({
  type: 'Tabs',
  label: '탭',
  description: '여러 화면을 탭으로 갈라 한 번에 하나씩 보인다.',
  group: 'structure',
  props: z.strictObject({
    active: z.number().int().min(0).default(0),
  }),
  editor: [{ prop: 'active', control: 'number', label: '활성 탭' }],
  states: [],
  // 지금 탭이 아닌 패널의 내용은 DOM 에 없다 — 그 안을 펼쳐 보일 때는 그 패널을 연 판으로 그린다.
  reveal: (props, at) => (at.zone === 'body' ? { ...props, active: at.index } : props),
  zones: [
    {
      name: 'body',
      label: '탭',
      accepts: ['TabPanel'],
      initial: [
        { type: 'TabPanel', props: { label: '탭 1' } },
        { type: 'TabPanel', props: { label: '탭 2' } },
      ],
    },
  ],
})

/** 탭 하나 — 뿌리 요소는 탭 머리(`label`)이고 몸통은 부모 `Tabs`의 뷰가 패널 칸에 둔다(`bodyHost: 'parent'`). `Tabs`의 몸통에만 선다. */
export const TabPanelDef = defineComponent({
  type: 'TabPanel',
  label: '탭 패널',
  description: '탭 하나. 이름은 탭 머리에, 내용은 그 탭의 패널에 선다.',
  group: 'structure',
  props: z.strictObject({
    label: z.string().default('탭'),
  }),
  editor: [{ prop: 'label', control: 'text', label: '탭 이름' }],
  summary: (props) => oneLine(props.label),
  states: [],
  zones: [{ name: 'body', label: '내용' }],
  placement: { type: 'Tabs', zone: 'body' },
  bodyHost: 'parent',
})
