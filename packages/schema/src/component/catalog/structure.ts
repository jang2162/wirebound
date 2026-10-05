import { z } from 'zod'
import { NODE_ID_PATTERN } from '../../envelope'
import { defineComponent } from '../define'
import { axisWord, firstOf, integer, joined, oneLine } from '../summary'

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
  summary: (props) => joined(axisWord(props.direction), props.wrap === true ? '줄바꿈' : null),
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
  summary: (props) => {
    const columns = integer(props.columns)
    return columns === null ? null : `${columns}열`
  },
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
  summary: (props) => oneLine(props.title),
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
  summary: (props) => firstOf(props.tabs),
  states: [],
  children: 'many',
})

/**
 * 상태 영역 — 같은 페이지가 화면 상태(`PageDocument.viewStates`)마다 다르게 보이는 자리. 자식은 `StateCase`만이고 기본 가지가 정확히
 * 하나다(`validate.ts`의 `checkStateRegion`). **테마가 그리지 않는다**(`THEMELESS_TYPES`) — 렌더러가 지금 상태의 가지 하나를 고른다.
 * 요약(가지 수)은 props 가 아니라 자식에서 나와 `summary`가 아니라 `display.ts`의 `nodeSummary`가 짓는다.
 */
export const StateSwitchDef = defineComponent({
  type: 'StateSwitch',
  label: '상태 영역',
  description: '화면 상태마다 다른 내용을 보이는 자리. 나머지는 기본을 따른다.',
  group: 'structure',
  props: z.strictObject({}),
  editor: [],
  states: [],
  children: 'many',
})

/**
 * 상태 가지 — `state`가 `default`(기본 가지)이거나 상태 id 다. 기본값을 두지 않는다: 빈 props 를 기본 가지로 읽으면 «기본 가지 정확히
 * 하나»를 세는 구조 판정(원본 props 를 본다)과 갈린다. 상태 id 는 노드 id 규칙이다(`envelope.ts`의 `ViewStatesSchema`).
 */
export const StateCaseDef = defineComponent({
  type: 'StateCase',
  label: '상태 가지',
  description: '상태 영역 안에서 한 상태(또는 기본)의 내용을 담는다.',
  group: 'structure',
  props: z.strictObject({
    state: z.string().regex(NODE_ID_PATTERN),
  }),
  editor: [],
  states: [],
  children: 'many',
})
