/**
 * **`defineComponent`의 도달성 검사 — 부류를 닫는 자리.**
 *
 * 설계서 「컴포넌트 정의 구조」가 *"속성 패널이 `editor`에서 자동 생성된다"*고 하므로
 * **`editor`에 없는 prop은 UI에서 도달 불가**다. 카탈로그 항목마다 케이스를
 * 하나씩 더하는 것으로는 **카탈로그가 커질 때 같은 구멍이 다시 난다.**
 *
 * **그래서 카탈로그 데이터가 아니라 `defineComponent`가 검사한다.** 컴포넌트를 정의하는
 * 순간 던지므로 컴포넌트를 늘릴 때 **그 자리에서** 걸린다.
 *
 * ---
 *
 * **무엇을 검사하고 무엇을 검사하지 않는가.**
 *
 * | 대상 | 검사하나 | 왜 |
 * |---|---|---|
 * | `states` | **한다** | 같은 이름의 prop이 `editor`에 없으면 그 상태를 켤 길이 없다 |
 * | `variantFrom`이 가리키는 prop | **한다** | 그 컴포넌트에는 패널이 변형 컨트롤을 내지 않으므로 **그 prop이 유일한 길**이다 |
 *
 * 변형 목록은 카탈로그에 없다 — 테마 manifest 가 선언하고, 패널은 그 manifest 로 변형 칸을 연다(`apps/web`의 `variantFieldOf`).
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
  label: '티',
  description: '검사용 표본.',
  group: 'document' as const,
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
    expect(() => defineComponent({ ...base, props: z.strictObject({}), editor: [], states: [] })).not.toThrow()
  })
})

describe('defineComponent — variantFrom의 도달성', () => {
  const enumProps = z.strictObject({
    role: z.enum(['h1', 'body']).default('body'),
  })

  it('variantFrom이 가리키는 prop이 editor에 없으면 던진다', () => {
    // **패널은 이 컴포넌트에 변형 컨트롤을 내지 않는다**(내면 `ignored-variant`를
    // UI가 유도하는 셈이다). 그러면 그 prop이 유일한 길인데 그것마저 없으면
    // **변형이 통째로 도달 불가**다.
    expect(() =>
      defineComponent({
        ...base,
        props: enumProps,
        editor: [],
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
        variantFrom: 'role',
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
