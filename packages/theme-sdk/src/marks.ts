/**
 * **prop 표지 — 화면을 바꾸는 불리언 · enum prop 을 뷰의 루트에 싣는 규칙**(정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md`
 * 「노드 속성」).
 *
 * 불리언은 참일 때 `data-wb-<prop>=""`, enum 은 늘 `data-wb-<prop>="<값>"`. 상태(카탈로그 `states` — 렌더러가 `data-wb-state` 로
 * 싣는다)와 변형(`variantFrom` — `data-wb-variant`)으로 이미 실리는 prop 은 표에 넣지 않는다 — 같은 값을 두 이름으로 실으면 테마
 * CSS 가 어느 쪽을 겨냥할지 갈린다. 표가 카탈로그와 맞는지는 `packages/renderer/test/prop-marks.test.tsx` 가 센다(새 불리언 · enum
 * prop 이 이 표 · 상태 · 변형 어디에도 없으면 죽는다).
 *
 * **SDK 가 싣는다 — 렌더러가 아니다.** 렌더러의 노드 속성(`data-wb-id` · `-component` · `-variant` · `-state`)은 계약을 넓히지 않는다
 * (`packages/renderer/test/contract-attrs.test.ts`). `view()` 가 노드의 props 를 문맥으로 내리고 `Root` 가 펴므로, 기본 뷰든 테마 뷰든
 * `view` · `Root` 로 짠 뷰는 빠뜨릴 수 없다.
 */

/** `flag` — 불리언(참일 때만 싣는다). `value` — enum(값을 싣는다). */
export type MarkKind = 'flag' | 'value'

export const MARKED_PROPS: Readonly<Record<string, Readonly<Record<string, MarkKind>>>> = Object.freeze({
  Section: { compact: 'flag' },
  Flex: { direction: 'value', align: 'value', justify: 'value', wrap: 'flag' },
  List: { pagination: 'flag', selectable: 'flag' },
  SearchForm: { collapsed: 'flag' },
  Media: { kind: 'value', ratio: 'value' },
})

/**
 * 상태마다 루트에 다는 접근성 속성. 상태는 `data-wb-state` 로 이미 실리므로 표지가 아니라 뜻을 더한다. `selected` 는 없다 — 루트가
 * 표 · 목록이라 `aria-selected` 를 받는 역할이 아니다. `empty` 도 없다(해당하는 속성이 없다).
 */
export const STATE_ARIA: Readonly<Record<string, string>> = Object.freeze({
  disabled: 'aria-disabled',
  loading: 'aria-busy',
  invalid: 'aria-invalid',
  required: 'aria-required',
})

/** 표지 속성 이름. 낙타 꼴(`fooBar`)은 `data-wb-foo-bar` 로 — HTML 은 속성 이름의 대소문자를 가리지 않는다. */
export function markAttr(prop: string): string {
  return `data-wb-${prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** 그 노드의 표지. 표에 없는 타입 · 값이 없는 enum 은 아무것도 안 싣는다. */
export function propMarks(type: string, props: Readonly<Record<string, unknown>>): Record<string, string> {
  const table = MARKED_PROPS[type]
  if (table === undefined) return {}
  const out: Record<string, string> = {}
  for (const [prop, kind] of Object.entries(table)) {
    const value = props[prop]
    if (kind === 'flag') {
      if (value === true) out[markAttr(prop)] = ''
    } else if (typeof value === 'string') {
      out[markAttr(prop)] = value
    }
  }
  return out
}

/** 참인 상태의 접근성 속성. */
export function stateAria(states: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const state of states) {
    const attr = STATE_ARIA[state]
    if (attr !== undefined) out[attr] = 'true'
  }
  return out
}
