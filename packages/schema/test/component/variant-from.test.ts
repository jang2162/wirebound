import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../src/component/define'

/**
 * **`variantFrom` — enum prop을 `data-wb-variant`로 접는 채널.**
 *
 * *"노드의 enum prop에서 파생되는 표현 변형"*을 실을 채널이 없으면 컴포넌트마다 설계서
 * 「컴파일」의 여섯 속성 밖에 계약 밖 속성(`data-wb-role`·`data-control`·`data-direction` 꼴)을
 * 각자 만든다. 설계서 「컴포넌트 정의 구조」가 같은 모양의 채널을 하나 갖고 있다(boolean
 * prop → `data-wb-state`). 이것이 그 짝인 **enum prop → `data-wb-variant`**다 — 여섯 중
 * 하나에 접으므로 계약이 늘지 않는다.
 */
describe('defineComponent의 variantFrom 검사', () => {
  const base = {
    type: 'T',
    label: '티',
    description: '검사용 표본.',
    group: 'document' as const,
    editor: [],
    structures: ['default'],
    parts: [],
    states: [],
    children: 'none' as const,
  }

  it('variantFrom이 가리키는 prop이 없으면 던진다', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ other: z.string().default('') }),
        variants: [],
        variantFrom: 'role',
      }),
    ).toThrow(/variantFrom/)
  })

  it('variantFrom이 가리키는 prop이 enum이 아니면 던진다', () => {
    // enum이 아니면 **값 목록을 읽을 수 없다** — 그러면 `variants`와 대조할 것이 없고
    // 검증되지 않은 값이 `data-wb-variant`로 나간다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.string().default('body') }),
        variants: [],
        variantFrom: 'role',
      }),
    ).toThrow(/enum/)
  })

  it('variantFrom의 enum 값이 variants에 없으면 던진다', () => {
    // **이것이 핵심이다.** 선언되지 않은 값이 `data-wb-variant`로 나가면 테마 검증기가
    // 대조할 선언이 없다 — `checkThemeComponents`가 `def.variants`를 어휘로 쓴다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.enum(['a', 'b']).default('a') }),
        variants: ['a'],
        variantFrom: 'role',
      }),
    ).toThrow(/b/)
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

  it('enum 값이 전부 variants에 있으면 통과한다', () => {
    const def = defineComponent({
      ...base,
      props: z.strictObject({ role: z.enum(['a', 'b']).default('a') }),
      editor: roleEditor,
      variants: ['a', 'b'],
      variantFrom: 'role',
    })
    expect(def.variantFrom).toBe('role')
  })

  /**
   * **`variants`가 enum보다 넓으면 막는다.**
   *
   * *"노드가 `variant`로 직접 고르는 값이 따로 있을 수 있다"*는 넓은 것을 허용할 근거가
   * 못 된다: `variantFrom`을 가진 컴포넌트에서 `node.variant`는 **선언된 값이든 아니든 똑같이
   * 버려진다**(`variantFrom`이 이기고 `ignored-variant`가 난다).
   *
   * 그리고 속성 패널도 그런 컴포넌트에는 변형 컨트롤을 내지 않는다.
   * **두 길이 다 막혀 있으므로 enum 밖의 이름은 고를 방법이 없다.**
   *
   * **이 판정은 그 두 전제에 기댄다** — `variantFrom`이 `node.variant`를 이긴다 · 패널이
   * 변형 컨트롤을 안 낸다. 어느 하나가 바뀌면 이 케이스를 함께 다시 판정한다 — 안 그러면
   * 초록인 채 틀린 것을 지킨다.
   */
  it('variants가 enum보다 넓으면 던진다 — 그 이름을 고를 길이 없다', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.enum(['a']).default('a') }),
        editor: roleEditor,
        variants: ['a', 'b'],
        variantFrom: 'role',
      }),
    ).toThrow(/b/)
  })

  it('optional enum도 값 목록을 읽는다', () => {
    // `.default()`·`.optional()`이 enum을 감싸므로 감싼 것을 벗겨야 읽힌다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.enum(['a', 'b']).optional() }),
        variants: ['a'],
        variantFrom: 'role',
      }),
    ).toThrow(/b/)
  })

  it('variantFrom이 없으면 아무것도 요구하지 않는다', () => {
    expect(() =>
      defineComponent({ ...base, props: z.strictObject({}), variants: [] }),
    ).not.toThrow()
  })
})
