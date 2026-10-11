import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../src/component/define'

/**
 * **`variantFrom` — enum prop을 `data-wb-variant`로 접는 채널.**
 *
 * *"노드의 enum prop에서 파생되는 표현 변형"*을 실을 채널이 없으면 컴포넌트마다 계약 밖
 * 속성(`data-wb-role`·`data-control`·`data-direction` 꼴)을 각자 만든다. 설계서 「컴포넌트 정의 구조」가 같은 모양의
 * 채널을 하나 갖고 있다(boolean prop → `data-wb-state`). 이것이 그 짝인 **enum prop → `data-wb-variant`**다 — 이미 있는
 * 속성에 접으므로 계약이 늘지 않는다.
 */
describe('defineComponent의 variantFrom 검사', () => {
  const base = {
    type: 'T',
    label: '티',
    description: '검사용 표본.',
    group: 'document' as const,
    editor: [],
    states: [],
    children: 'none' as const,
  }

  it('variantFrom이 가리키는 prop이 없으면 던진다', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ other: z.string().default('') }),
        variantFrom: 'role',
      }),
    ).toThrow(/variantFrom/)
  })

  it('variantFrom이 가리키는 prop이 enum이 아니면 던진다', () => {
    // enum이 아니면 **값 목록이 닫혀 있지 않다** — 아무 글자나 `data-wb-variant`로 나간다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.string().default('body') }),
        variantFrom: 'role',
      }),
    ).toThrow(/enum/)
  })

  /**
   * **통과하는 케이스에는 `editor`가 필요하다** — `defineComponent`가 *"`variantFrom`이 가리키는 prop은
   * `editor`에 있어야 한다"*를 검사한다(`test/component/reachability.test.ts`). 그 컴포넌트에는
   * 패널이 변형 컨트롤을 내지 않으므로 그 prop이 유일한 길이다.
   *
   * **던지는 케이스는 `editor`를 주지 않는다** — 그래야 위 검사들이 **먼저** 던지는 것이
   * 유지된다(도달성 검사가 앞서 걸리면 이 파일이 무엇을 재는지 흐려진다).
   */
  const roleEditor = [{ prop: 'role', control: 'select' as const, label: '역할' }]

  it('enum prop이고 editor에 있으면 통과한다', () => {
    const def = defineComponent({
      ...base,
      props: z.strictObject({ role: z.enum(['a', 'b']).default('a') }),
      editor: roleEditor,
      variantFrom: 'role',
    })
    expect(def.variantFrom).toBe('role')
  })

  it('optional enum도 enum으로 읽는다', () => {
    // `.default()`·`.optional()`이 enum을 감싸므로 감싼 것을 벗겨야 읽힌다 — 못 벗기면 «enum이 아닙니다»로 던진다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.enum(['a', 'b']).optional() }),
        editor: roleEditor,
        variantFrom: 'role',
      }),
    ).not.toThrow()
  })

  it('variantFrom이 없으면 아무것도 요구하지 않는다', () => {
    expect(() => defineComponent({ ...base, props: z.strictObject({}) })).not.toThrow()
  })
})
