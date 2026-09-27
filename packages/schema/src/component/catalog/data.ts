import { z } from 'zod'
import { defineComponent } from '../define'

export const ListDef = defineComponent({
  type: 'List',
  // **이름은 설계서 「설계서 화면 구조」의 그림에서 빌려 왔다**(*"① 검색폼 / ② 목록"*). 규격이 부른 이름을 그대로
  // 쓰는 것이 문서와 화면을 갈리지 않게 하는 가장 싼 방법이다.
  label: '목록',
  description: '여러 건을 표·카드·목록 모양으로 늘어놓는다.',
  group: 'data',
  props: z.strictObject({
    items: z.number().int().min(0).max(50).default(5),
    columns: z.array(z.string()).default(['컬럼 1', '컬럼 2']),
    pagination: z.boolean().default(true),
    selectable: z.boolean().default(false),
    selected: z.boolean().default(false),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
    empty: z.boolean().default(false),
  }),
  editor: [
    { prop: 'items', control: 'number', label: '항목 수' },
    { prop: 'columns', control: 'stringList', label: '컬럼' },
    { prop: 'pagination', control: 'switch', label: '페이지네이션' },
    { prop: 'selectable', control: 'switch', label: '선택 가능' },
    // **아래 넷이 `states`와 짝이다.** `selected`·`disabled`가 빠지면
    // 설계서 「컴포넌트 정의 구조」이 상태의 쓸모로 든 *"선택된 행 강조"*를 목업에서 켤 수 없다 —
    // `defineComponent`가 그 빠짐을 던진다.
    { prop: 'selected', control: 'switch', label: '선택 상태' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'loading', control: 'switch', label: '로딩 상태' },
    { prop: 'empty', control: 'switch', label: '빈 상태' },
  ],
  states: ['selected', 'disabled', 'loading', 'empty'],
  children: 'none',
})

export const TreeDef = defineComponent({
  type: 'Tree',
  label: '트리',
  description: '계층이 있는 항목을 접었다 펴며 보인다.',
  group: 'data',
  props: z.strictObject({
    items: z.array(z.string()).default(['항목 1', '항목 2']),
    depth: z.number().int().min(1).max(5).default(2),
    selected: z.boolean().default(false),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'items', control: 'stringList', label: '항목' },
    { prop: 'depth', control: 'number', label: '깊이' },
    // `states`와 짝이다 — 둘 다 없으면 트리의 선택·비활성 표현이 도달 불가다.
    { prop: 'selected', control: 'switch', label: '선택 상태' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  states: ['selected', 'disabled'],
  children: 'none',
})

export const KeyValueDef = defineComponent({
  type: 'KeyValue',
  label: '키-값 목록',
  description: '항목 이름과 값을 짝지어 보인다. 상세 화면에 쓴다.',
  group: 'data',
  props: z.strictObject({
    pairs: z
      .array(z.strictObject({ key: z.string(), value: z.string() }))
      .default([{ key: '항목', value: '값' }]),
    columns: z.number().int().min(1).max(4).default(1),
  }),
  editor: [
    { prop: 'pairs', control: 'pairList', label: '키-값' },
    { prop: 'columns', control: 'number', label: '열 수' },
  ],
  states: [],
  children: 'none',
})
