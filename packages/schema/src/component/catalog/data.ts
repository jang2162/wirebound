import { z } from 'zod'
import { defineComponent } from '../define'

export const ListDef = defineComponent({
  type: 'List',
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
  parts: ['header', 'row', 'rowAlt', 'cell', 'item', 'media', 'title', 'meta', 'pagination'],
  variants: ['default', 'featured', 'compact'],
  states: ['selected', 'disabled', 'loading', 'empty'],
  children: 'none',
})

export const TreeDef = defineComponent({
  type: 'Tree',
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
  parts: ['node', 'label', 'toggle'],
  variants: [],
  states: ['selected', 'disabled'],
  children: 'none',
})

export const KeyValueDef = defineComponent({
  type: 'KeyValue',
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
