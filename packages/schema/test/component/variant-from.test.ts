import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../src/component/define'

/**
 * **`variantFrom` — enum prop을 `data-wb-variant`로 접는 채널** (P0 이월 #8).
 *
 * 계약 밖 속성 셋(`data-wb-role`·`data-control`·`data-direction`)은 한 부류였다 —
 * 셋 다 *"노드의 enum prop에서 파생되는 표현 변형"*인데 §6.11의 여섯에 채널이 없어
 * 각자 속성을 만들었다. §5.1이 이미 같은 모양의 채널을 하나 갖고 있다(boolean prop →
 * `data-wb-state`). 빠진 것이 **enum prop → `data-wb-variant`**다.
 */
describe('defineComponent의 variantFrom 검사', () => {
  const base = {
    type: 'T',
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
   * **통과하는 케이스에는 `editor`가 필요하다** — P4b-1이 *"`variantFrom`이 가리키는 prop은
   * `editor`에 있어야 한다"*를 더했다(`test/component/reachability.test.ts`). 그 컴포넌트에는
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
   * **뒤집었다 — 이 케이스는 틀린 것을 지키고 있었다.**
   *
   * 앞서 여기는 *"variants가 enum보다 넓은 것은 막지 않는다"*였고 근거가
   * *"노드가 `variant`로 직접 고르는 값이 따로 있을 수 있다"*였다. **그 근거가 거짓이다:**
   * `variantFrom`을 가진 컴포넌트에서 `node.variant`는 **선언된 값이든 아니든 똑같이
   * 버려진다**(P4a-2가 `variantFrom`이 이기게 정하며 `ignored-variant`를 만든 자리다).
   *
   * 그리고 속성 패널도 그런 컴포넌트에는 변형 컨트롤을 내지 않는다(P4b-1의 재라 #4).
   * **두 길이 다 막혀 있으므로 enum 밖의 이름은 고를 방법이 없다.**
   *
   * 리뷰가 반례로 잡았다. 이 케이스의 근거는 P0 이월 #8 시절(패널에 변형 컨트롤이 아예
   * 없던 때)에 쓰인 것이고, 그 뒤 두 결정이 전제를 바꿨는데 함께 고쳐지지 않았다.
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
