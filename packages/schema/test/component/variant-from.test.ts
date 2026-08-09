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

  it('enum 값이 전부 variants에 있으면 통과한다', () => {
    const def = defineComponent({
      ...base,
      props: z.strictObject({ role: z.enum(['a', 'b']).default('a') }),
      variants: ['a', 'b'],
      variantFrom: 'role',
    })
    expect(def.variantFrom).toBe('role')
  })

  it('variants가 enum보다 넓은 것은 막지 않는다', () => {
    // 노드가 `variant`로 직접 고르는 값이 따로 있을 수 있다. 좁히는 것은 이 검사의 일이
    // 아니고, **선언되지 않은 값이 나가지 않는 것**만 본다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ role: z.enum(['a']).default('a') }),
        variants: ['a', 'b'],
        variantFrom: 'role',
      }),
    ).not.toThrow()
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
