/**
 * **카탈로그 전체가 도달성 성질을 지키는가** — `defineComponent`가 정의마다 던지는 검사(`reachability.test.ts`)를
 * 카탈로그 열아홉 전체에 대해 한 번 더 센다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { getComponent } from '../../src/component/registry'

beforeAll(() => {
  installCatalog()
})

/**
 * **도달성 — 설계서 「컴포넌트 정의 구조」가 *"속성 패널이 `editor`에서 자동 생성된다"*고 한 것의 결과.**
 *
 * `editor`에 없는 prop은 **UI에서 도달 불가**다. 그런데 `states`는 *"같은 이름의 prop이
 * `true`이면 그 상태가 활성화된다"*이므로(같은 절), 그 prop이 `editor`에 없으면 **선언된 상태를
 * 목업에서 켤 수 없다.** 설계서 「컴포넌트 정의 구조」가 상태의 쓸모를 *"'선택된 행 강조'
 * 같은 서술을 목업에서 실제로 보여주려면"*이라고 적었는데 그 서술이 화면에 닿지 않게 된다.
 *
 * **분모를 손으로 적지 않는다.** 카탈로그를 훑어 센다 — 컴포넌트가 늘면
 * 여기가 먼저 죽는다.
 */
describe('states·variantFrom 도달성', () => {
  it('훑을 카탈로그가 실제로 있다', () => {
    // 분모가 비면 아래 케이스들이 조용히 통과한다.
    expect(CATALOG_TYPES.length).toBeGreaterThan(10)
    expect(CATALOG_TYPES.every((type) => getComponent(type) !== undefined)).toBe(true)
  })

  it('모든 states가 editor에서 도달 가능하다', () => {
    const unreachable: string[] = []

    for (const type of CATALOG_TYPES) {
      const def = getComponent(type)
      if (def === undefined) continue
      const editable = new Set(def.editor.map((field) => field.prop))
      for (const state of def.states) {
        if (!editable.has(state)) unreachable.push(`${type}.${state}`)
      }
    }

    expect(unreachable).toEqual([])
  })

  /**
   * **`variantFrom`의 예외가 구멍이 되지 않는가.**
   *
   * `variantFrom`을 가진 컴포넌트에는 속성 패널이 **변형 컨트롤을 내지 않는다**(내면
   * `ignored-variant`를 UI가 유도하는 셈이다). 그 대신 도달하는 길은 **그 prop의
   * 컨트롤**뿐이므로, 그 prop이 `editor`에 없으면 **변형이 통째로 도달 불가가 된다.**
   *
   * 둘(Text·Divider — 아래 카나리아가 목록을 단언한다)이 그 prop을 `editor`에 갖는
   * 것을 **강제하는 자리가 이 케이스다.**
   */
  it('variantFrom이 가리키는 prop도 editor에서 도달 가능하다', () => {
    const unreachable: string[] = []

    for (const type of CATALOG_TYPES) {
      const def = getComponent(type)
      if (def === undefined || def.variantFrom === undefined) continue
      const editable = new Set(def.editor.map((field) => field.prop))
      if (!editable.has(def.variantFrom)) unreachable.push(`${type}.${def.variantFrom}`)
    }

    // 카나리아 — `variantFrom`을 가진 컴포넌트가 있어야 이 케이스가 무언가를 지킨다.
    // **정렬해서 비교한다** — `CATALOG_TYPES`의 순서는 이 성질과 무관하고, 순서에 매이면
    // 카탈로그를 재배치할 때 뜻 없는 실패가 난다.
    expect([...CATALOG_TYPES.filter((type) => getComponent(type)?.variantFrom !== undefined)].sort()).toEqual(['Divider', 'Text'])
    expect(unreachable).toEqual([])
  })
})
