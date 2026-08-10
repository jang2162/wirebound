/**
 * **`defineComponent`의 도달성 검사 — 부류를 닫는 자리** (P0 이월 #9, 계획 D2).
 *
 * §5.1이 *"속성 패널이 `editor`에서 자동 생성된다"*고 하므로 **`editor`에 없는 prop은
 * UI에서 도달 불가**다. 카탈로그에 그런 자리가 다섯 있었고(P4b-1이 닫았다), 케이스를
 * 하나씩 더하는 것으로는 **카탈로그가 커질 때 같은 구멍이 다시 난다.**
 *
 * **그래서 카탈로그 데이터가 아니라 `defineComponent`가 검사한다.** 컴포넌트를 정의하는
 * 순간 던지므로 P4b-2·P4b-3이 컴포넌트를 늘릴 때 **그 자리에서** 걸린다.
 *
 * ---
 *
 * **무엇을 검사하고 무엇을 검사하지 않는가 — 계획 D2의 후반은 성립하지 않는다.**
 *
 * | 대상 | 검사하나 | 왜 |
 * |---|---|---|
 * | `states` | **한다** | 같은 이름의 prop이 `editor`에 없으면 그 상태를 켤 길이 없다 |
 * | `variantFrom`이 가리키는 prop | **한다** | 그 컴포넌트에는 패널이 변형 컨트롤을 내지 않으므로(재라 #4) **그 prop이 유일한 길**이다 |
 * | `variants` — `variantFrom`이 **있을** 때 | **한다** | enum 밖의 이름은 **두 길이 다 막혀** 고를 방법이 없다(`variants ⊆ enum 값`) |
 * | `variants` — `variantFrom`이 **없을** 때 | **안 한다** | 패널이 `variants.length > 0`를 보고 **자동으로** 연다 — 어긋날 자리가 없다 |
 *
 * **D2 후반의 반증은 절반만 참이다 — 리뷰가 반례로 잡았다.**
 * `variantFrom === undefined` 가지에서는 반증이 성립한다(패널이 자동으로 여니 늘 참인
 * 단언이 된다). **`variantFrom`이 있는 가지에서는 아니다** — 그쪽은 패널이 컨트롤을 내지
 * 않고 `node.variant`도 무시되므로, `variants`에 enum 밖의 이름이 있으면 **선언돼 있는데
 * 도달 불가**다. 앞 판은 그 가지를 보지 않고 *"어긋날 자리가 없어졌다"*로 뭉뚱그렸다.
 *
 * **예외 쪽이 실제 구멍이었다** — D2가 *"예외가 구멍이 되지 않는가"*를 의심하라고 한 자리가
 * 정확히 여기이고, 구멍이 **둘**이었다(그 prop의 `editor` 부재 · `variants`의 enum 밖 이름).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { defineComponent } from '../../src/component/define'
import { getComponent } from '../../src/component/registry'

beforeAll(() => {
  installCatalog()
})

const base = {
  type: 'T',
  structures: ['default'],
  parts: [],
  variants: [],
  states: [],
  children: 'none' as const,
}

describe('defineComponent — states의 도달성', () => {
  it('states와 같은 이름의 prop이 editor에 없으면 던진다', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ disabled: z.boolean().default(false) }),
        // prop은 있으므로 기존 `states` 검사는 지나간다 — **여기서 새로 걸린다.**
        editor: [],
        states: ['disabled'],
      }),
    ).toThrow(/editor/)
  })

  it('문안이 어느 상태인지 말한다', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({
          selected: z.boolean().default(false),
          disabled: z.boolean().default(false),
        }),
        editor: [{ prop: 'selected', control: 'switch', label: '선택' }],
        states: ['selected', 'disabled'],
      }),
    ).toThrow(/disabled/)
  })

  it('여럿 빠지면 전부 말한다 — 하나씩 고치며 다시 돌리지 않게', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({
          selected: z.boolean().default(false),
          disabled: z.boolean().default(false),
        }),
        editor: [],
        states: ['selected', 'disabled'],
      }),
    ).toThrow(/selected.*disabled|disabled.*selected/)
  })

  it('editor에 있으면 던지지 않는다 — 음성 대조', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ disabled: z.boolean().default(false) }),
        editor: [{ prop: 'disabled', control: 'switch', label: '비활성' }],
        states: ['disabled'],
      }),
    ).not.toThrow()
  })

  it('states가 비면 던지지 않는다', () => {
    expect(() =>
      defineComponent({ ...base, props: z.strictObject({}), editor: [], states: [] }),
    ).not.toThrow()
  })

  it('visibleWhen이 붙은 항목도 도달로 센다', () => {
    // **감춰지는 것과 없는 것은 다르다.** `visibleWhen`은 구조에 따라 감출 뿐이고,
    // 그 구조를 고른 테마에서는 보인다. 여기서 막으면 정상적인 카탈로그가 거부된다.
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({ disabled: z.boolean().default(false) }),
        editor: [
          { prop: 'disabled', control: 'switch', label: '비활성', visibleWhen: { structure: 'default' } },
        ],
        states: ['disabled'],
      }),
    ).not.toThrow()
  })
})

describe('defineComponent — variantFrom의 도달성', () => {
  const enumProps = z.strictObject({
    role: z.enum(['h1', 'body']).default('body'),
  })

  it('variantFrom이 가리키는 prop이 editor에 없으면 던진다', () => {
    // **패널은 이 컴포넌트에 변형 컨트롤을 내지 않는다**(재라 #4 — 내면 `ignored-variant`를
    // UI가 유도하는 셈이다). 그러면 그 prop이 유일한 길인데 그것마저 없으면
    // **변형이 통째로 도달 불가**다.
    expect(() =>
      defineComponent({
        ...base,
        props: enumProps,
        editor: [],
        variants: ['h1', 'body'],
        variantFrom: 'role',
      }),
    ).toThrow(/editor/)
  })

  it('editor에 있으면 던지지 않는다 — 음성 대조', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: enumProps,
        editor: [{ prop: 'role', control: 'select', label: '역할', options: ['h1', 'body'] }],
        variants: ['h1', 'body'],
        variantFrom: 'role',
      }),
    ).not.toThrow()
  })

  /**
   * **리뷰가 만든 반례 — 반대 방향이 열려 있었다.**
   *
   * 기존 검사는 **`enum 값 ⊆ variants`**만 본다(*"선언되지 않은 값이 `data-wb-variant`로
   * 나가면 테마 검증기가 대조할 선언이 없다"*). **반대 방향은 아무도 안 봤다** —
   * `variants`에 enum에 없는 이름이 있으면:
   *
   * - `defineComponent`가 **통과시키고**
   * - 패널은 컨트롤을 **안 낸다**(`variantFrom`이 있으므로 `variantFieldOf`가 `null`)
   * - 그래서 그 이름은 **선언돼 있는데 UI에서 도달 불가**다
   *
   * 테마가 그 이름에 스킨을 정의하면 **아무도 켤 수 없는 스킨**이 되어 `Media.kind`와 같은
   * *"죽어 있다"* 부류가 하나 생긴다.
   *
   * **오늘 셋(Text·Divider·Field)은 `variants === enum`이라 실제 구멍은 아니었다 —
   * 강제하는 것이 없었을 뿐이다.**
   */
  it('variants에 enum 값이 아닌 이름이 있으면 던진다 — 도달 불가한 변형', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: enumProps,
        editor: [{ prop: 'role', control: 'select', label: '역할', options: ['h1', 'body'] }],
        // `role` enum은 h1·body 둘인데 여기에 셋째가 있다. 그 값을 고를 길이 없다.
        variants: ['h1', 'body', 'featured'],
        variantFrom: 'role',
      }),
    ).toThrow(/featured/)
  })

  it('여럿 남으면 전부 말한다', () => {
    expect(() =>
      defineComponent({
        ...base,
        props: enumProps,
        editor: [{ prop: 'role', control: 'select', label: '역할', options: ['h1', 'body'] }],
        variants: ['h1', 'body', 'featured', 'compact'],
        variantFrom: 'role',
      }),
    ).toThrow(/featured.*compact|compact.*featured/)
  })

  it('variants === enum이면 던지지 않는다 — 음성 대조', () => {
    // 오늘 카탈로그 셋이 이 모양이다. 좁히다 정상 카탈로그를 막으면 여기가 죽는다.
    expect(() =>
      defineComponent({
        ...base,
        props: enumProps,
        editor: [{ prop: 'role', control: 'select', label: '역할', options: ['h1', 'body'] }],
        variants: ['h1', 'body'],
        variantFrom: 'role',
      }),
    ).not.toThrow()
  })

  it('variantFrom이 없으면 variants만으로는 던지지 않는다 — 패널이 자동으로 연다', () => {
    // **D2의 후반이 성립하지 않는 자리다.** `variants`가 있고 `editor`가 비어도 변형은
    // 도달 가능하다 — 패널이 카탈로그를 보고 컨트롤을 만든다(재라 #4의 A안).
    expect(() =>
      defineComponent({
        ...base,
        props: z.strictObject({}),
        editor: [],
        variants: ['featured'],
      }),
    ).not.toThrow()
  })
})

describe('카탈로그 전체가 도달성 검사를 지난다', () => {
  it('열아홉이 전부 등록돼 있다 — 카나리아', () => {
    // 카탈로그 로드 자체가 `defineComponent`를 지나므로, 검사에 걸리는 컴포넌트가 있으면
    // **import가 던져** 이 파일이 통째로 실행되지 않는다. 그 사실을 여기 적어 둔다.
    expect(CATALOG_TYPES.length).toBeGreaterThan(10)
    expect(CATALOG_TYPES.every((type) => getComponent(type) !== undefined)).toBe(true)
  })

  it('같은 정의를 다시 통과시켜도 던지지 않는다', () => {
    // 로드 시점에 이미 지났지만, **그 통과가 우연이 아니라는 것**을 다시 실행해 확인한다 —
    // 검사를 나중에 좁히면 여기가 먼저 죽는다.
    for (const type of CATALOG_TYPES) {
      const def = getComponent(type)
      if (def === undefined) continue
      expect(() => defineComponent(def), type).not.toThrow()
    }
  })
})
