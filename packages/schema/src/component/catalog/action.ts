import { z } from 'zod'
import { defineComponent } from '../define'

export const ButtonDef = defineComponent({
  type: 'Button',
  // **이름은 설계서 「자동 문장화」의 예에서 빌려 왔다**(*"검색 버튼 클릭 시"*) — 상호작용 문장이 이 이름으로
  // 노드를 부르므로 규격의 낱말과 어긋나면 문장과 규격이 갈린다.
  label: '버튼',
  description: '누르면 동작이 일어나는 조작 버튼.',
  group: 'action',
  props: z.strictObject({
    label: z.string().default('버튼'),
    disabled: z.boolean().default(false),
    loading: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'loading', control: 'switch', label: '로딩' },
  ],
  structures: ['solid', 'outline', 'text'],
  parts: ['label'],
  variants: ['primary', 'secondary', 'danger', 'ghost'],
  states: ['disabled', 'loading'],
  children: 'none',
})

export const LinkDef = defineComponent({
  type: 'Link',
  label: '링크',
  description: '다른 화면으로 이동하는 글자 링크.',
  group: 'action',
  props: z.strictObject({
    label: z.string().default('링크'),
    target: z.string().default(''),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'target', control: 'text', label: '이동 대상' },
    // `states: ['disabled']`와 짝이다(`Button`과 같다).
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  structures: ['default'],
  parts: [],
  variants: ['default', 'muted'],
  states: ['disabled'],
  children: 'none',
})
