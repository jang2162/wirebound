import { z } from 'zod'
import { defineComponent } from '../define'

export const ListDef = defineComponent({
  type: 'List',
  // **이름은 §9의 그림에서 빌려 왔다**(*"① 검색폼 / ② 목록"*). 규격이 부른 이름을 그대로
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
    { prop: 'columns', control: 'stringList', label: '컬럼', visibleWhen: { structure: 'table' } },
    { prop: 'pagination', control: 'switch', label: '페이지네이션' },
    { prop: 'selectable', control: 'switch', label: '선택 가능' },
    // **아래 넷이 `states`와 짝이다**(P0 이월 #9). `selected`·`disabled`가 빠져 있어
    // §6.5가 상태의 쓸모로 든 *"선택된 행 강조"*를 목업에서 켤 수 없었다 —
    // `defineComponent`가 이제 그 빠짐을 던진다.
    { prop: 'selected', control: 'switch', label: '선택 상태' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'loading', control: 'switch', label: '로딩 상태' },
    { prop: 'empty', control: 'switch', label: '빈 상태' },
  ],
  structures: ['table', 'cardGrid', 'stackedList', 'mediaList'],
  // `body`는 P4b-2 W2가 더했다 — `mediaList`가 *"미디어 옆에 글묶음"*을 표현 가능하게
  // 하려면 `title`·`meta`를 감싸는 것이 있어야 한다. 감싸개가 없으면 셋이 다 형제라
  // item에 무엇을 걸어도 한 축을 나눠 갖고, 글 두 줄만 세로로 쌓을 방법이 없다.
  // 이름은 `Card`의 `body`와 같다 — 조각 어휘를 컴포넌트마다 새로 만들지 않는다.
  parts: [
    'header',
    'row',
    'rowAlt',
    'cell',
    'item',
    'media',
    'body',
    'title',
    'meta',
    'pagination',
  ],
  variants: ['default', 'featured', 'compact'],
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
    // `states`와 짝이다(P0 이월 #9) — 둘 다 없어 트리의 선택·비활성 표현이 도달 불가였다.
    { prop: 'selected', control: 'switch', label: '선택 상태' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  structures: ['indent', 'accordion'],
  // `panel`은 P4b-2 W2가 더했다 — 아코디언의 본체는 *"머리줄을 눌러 접었다 펴는 묶음"*이고
  // 그 묶음이 DOM에 없으면 `indent`와 구별되는 것이 화살표 글자 하나뿐이다.
  // 이름은 `Tabs`의 `panel`과 같다.
  parts: ['node', 'label', 'toggle', 'panel'],
  variants: [],
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
  structures: ['table', 'definitionList', 'cardGrid'],
  parts: ['row', 'key', 'value'],
  variants: [],
  states: [],
  children: 'none',
})
