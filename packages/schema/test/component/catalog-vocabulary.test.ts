/**
 * **카탈로그가 설계 문서의 예시와 어긋나는 자리.**
 *
 * 판정 원칙 — **규격이 이기고 예시가 틀린 것으로 본다.**
 * 설계 문서는 고치지 않고(`docs/superpowers/specs/*`), 어긋난 사실과 근거를 여기 남긴다.
 *
 * **예시를 손으로 인용하지 않는다.** 설계 절을 읽어 대조하므로, 설계가 예시를 고치면
 * 카나리아가 먼저 죽고 그때 판정을 다시 한다.
 */
import designDoc from '../../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { getComponent } from '../../src/component/registry'
import type { PageDocument } from '../../src/node'
import { validatePage } from '../../src/validate'

beforeAll(() => {
  installCatalog()
})

/** 설계 문서의 절 하나를 통째로 잘라 온다. 다음 `### ` 앞까지다. */
function section(heading: string): string {
  const body = designDoc.split(heading)[1] ?? ''
  return body.split('\n### ')[0] ?? ''
}

/**
 * **설계서 「patterns — 테마가 소유한 구성 레시피」 예시의 `Grid.props.gap`.**
 *
 * 그 절의 `hero.split` 패턴이 `{ type: 'Grid', props: { columns: 2, gap: 'space.10' } }`를
 * 쓰는데 카탈로그의 `Grid`는 `columns` 하나만 선언한다.
 *
 * **판정: 예시가 틀렸다. `gap`을 카탈로그에 더하지 않는다.** 근거 셋.
 *
 * 1. **설계서 「스타일 프로퍼티 화이트리스트」가 `gap`을 이미 갖고 있다.** 그것은 **테마의** 스타일 어휘다. 같은 이름을 노드
 *    prop으로도 두면 어느 쪽이 이기는지를 설계가 답하지 않는 자리가 새로 생긴다.
 * 2. **노드 props는 토큰 해석기를 지나지 않는다.** 예시의 값이 `"space.10"`(토큰 참조)인데
 *    `validatePage`는 zod 스키마만 보고 `resolveTokens`를 부르지 않는다 — 통과시켜도 그
 *    문자열이 CSS에 그대로 실려 **무효 선언**이 된다. 참조를 푸는 층을 노드 props에
 *    만드는 것은 「페이지 스키마 노드」·「컴포넌트 정의 구조」 어디에도 근거가 없다.
 * 3. **같은 화면에 닿는 길이 이미 있다** — `components.Grid.base.gap: "space.10"`.
 *
 * **이 판정을 뒤집으려면 2번부터 반증해야 한다.**
 */
describe('patterns 예시의 Grid.props.gap', () => {
  it('설계서 patterns 절이 실제로 Grid에 gap을 쓴다 — 카나리아', () => {
    // 파싱이 깨지면 아래 판정이 근거를 잃고 조용히 통과한다.
    const patterns = section('### 6.6 patterns')
    expect(patterns).toContain('"type": "Grid"')
    expect(patterns).toContain('"gap": "space.10"')
  })

  it('카탈로그의 Grid는 gap을 선언하지 않는다', () => {
    const grid = getComponent('Grid')
    expect(grid).toBeDefined()

    const shape = (grid!.props as unknown as { shape: Record<string, unknown> }).shape
    expect(Object.keys(shape)).toEqual(['columns'])
  })

  it('예시를 그대로 페이지에 넣으면 invalid-props다 — 실측', () => {
    // **`unknown-prop`이 아니다.** `Grid.props`가 `z.strictObject`라 미선언 키가 zod의
    // 파싱 단계에서 걸리고, 그 실패가 통째로 `invalid-props` 하나로 나온다.
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Grid', props: { columns: 2, gap: 'space.10' } },
        ],
      },
    }

    const issues = validatePage(doc)
    expect(issues.map((issue) => issue.code)).toEqual(['invalid-props'])
    expect(issues[0]?.message).toContain('gap')
  })

  it('gap을 빼면 통과한다 — 어긋나는 것이 그 키 하나다', () => {
    // 음성 대조. 이것이 없으면 위 케이스가 `columns: 2` 때문에 죽는 것과 구별되지 않는다.
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Grid', props: { columns: 2 } }],
      },
    }

    expect(validatePage(doc)).toEqual([])
  })

  it('스타일 화이트리스트 절이 gap을 테마의 어휘로 갖고 있다 — 대신 쓸 길', () => {
    // 근거 3. `themes`를 import하지 않는다 — 의존 방향이 반대다(설계서 「각 패키지의 책임과 의존」).
    // 설계 절을 읽는다.
    expect(section('### 6.8 스타일 프로퍼티 화이트리스트')).toContain('gap')
  })
})

/**
 * **도달성 — 설계서 「컴포넌트 정의 구조」가 *"속성 패널이 `editor`에서 자동 생성된다"*고 한 것의 결과.**
 *
 * `editor`에 없는 prop은 **UI에서 도달 불가**다. 그런데 `states`는 *"같은 이름의 prop이
 * `true`이면 그 상태가 활성화된다"*이므로(같은 절), 그 prop이 `editor`에 없으면 **선언된 상태를
 * 목업에서 켤 수 없다.** 설계서 「components — 구조 + 스킨」이 상태의 쓸모를 *"'선택된 행 강조'
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
   * 셋(Text·Divider·Field — 아래 카나리아가 목록을 단언한다)이 그 prop을 `editor`에 갖는
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
    expect(
      [...CATALOG_TYPES.filter((type) => getComponent(type)?.variantFrom !== undefined)].sort(),
    ).toEqual(['Divider', 'Field', 'Text'])
    expect(unreachable).toEqual([])
  })
})
