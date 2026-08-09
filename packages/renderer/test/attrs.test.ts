import { ButtonDef, DividerDef, FieldDef, ListDef, TextDef } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { activeStates, nodeAttrs, partAttrs } from '../src/attrs'

describe('nodeAttrs', () => {
  it('id·컴포넌트·구조를 항상 낸다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'Text' }, TextDef, 'default', {})
    expect(attrs).toEqual({
      'data-wb-id': 'n_000000000001',
      'data-wb-component': 'Text',
      'data-wb-structure': 'default',
    })
  })

  it('variant가 있으면 함께 낸다', () => {
    const attrs = nodeAttrs(
      { id: 'n_000000000001', type: 'Button', variant: 'primary' },
      ButtonDef,
      'solid',
      {},
    )
    expect(attrs['data-wb-variant']).toBe('primary')
  })

  it('활성 상태를 공백으로 이어 낸다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'List' }, ListDef, 'table', {
      loading: true,
      empty: true,
      selected: false,
    })
    expect(attrs['data-wb-state']).toBe('loading empty')
  })

  it('활성 상태가 없으면 data-wb-state를 내지 않는다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'List' }, ListDef, 'table', {})
    expect(attrs['data-wb-state']).toBeUndefined()
  })
})

describe('activeStates', () => {
  it('선언된 상태와 같은 이름의 prop이 true인 것만 고른다', () => {
    expect(activeStates(ListDef, { selected: true, disabled: false, bogus: true })).toEqual([
      'selected',
    ])
  })

  it('선언 순서를 지킨다', () => {
    expect(activeStates(ListDef, { empty: true, selected: true })).toEqual(['selected', 'empty'])
  })
})

describe('partAttrs', () => {
  it('조각 이름을 낸다', () => {
    expect(partAttrs('header')).toEqual({ 'data-wb-part': 'header' })
  })
})

describe('nodeAttrs의 variantFrom (P0 이월 #8)', () => {
  it('enum prop 값이 data-wb-variant로 나온다', () => {
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'Text' }, TextDef, 'default', {
      role: 'h1',
      content: '제목',
    })
    expect(attrs['data-wb-variant']).toBe('h1')
  })

  it('Field의 control과 Divider의 direction도 같은 채널로 나온다', () => {
    expect(
      nodeAttrs({ id: 'n_000000000001', type: 'Field' }, FieldDef, 'outlined', {
        control: 'select',
      })['data-wb-variant'],
    ).toBe('select')
    expect(
      nodeAttrs({ id: 'n_000000000001', type: 'Divider' }, DividerDef, 'default', {
        direction: 'vertical',
      })['data-wb-variant'],
    ).toBe('vertical')
  })

  /**
   * **재라 #4 — `variantFrom`이 이긴다.**
   *
   * 셋 중에서 고른 근거:
   *
   * - **(b) `node.variant`가 이긴다**를 고르면 **같은 prop에서 파생된 것끼리 어긋난다.**
   *   `TextDefault`는 `role`로 태그를 고르므로(`ROLE_TAG`) `role:'h1'` + `variant:'caption'`은
   *   `<h1 data-wb-variant="caption">`이 된다 — 태그는 제목이라 하고 스타일은 캡션이라 한다.
   *   `variantFrom`을 만든 이유가 *"prop이 단일 진실"*인데 그것을 스스로 깬다.
   * - **(c) 둘 다 있으면 검증 이슈**는 §7.1의 게이트가 편집을 **막는** 자리다. 표현 세부
   *   하나 때문에 패치가 거부되는 것은 과하고, 아래 사실이 그 판단을 굳힌다 —
   *   **오늘 `node.variant`를 설정할 수 있는 UI 경로가 없다**(속성 패널은 `editor`에서
   *   자동 생성되고 어느 컴포넌트의 `editor`에도 `variant` 항목이 없다. `apps/web/src`
   *   전체에서 `variant`를 쓰는 자리는 CSS의 `font-variant-numeric` 하나다).
   *   즉 (c)가 막을 상태를 만들어 내는 경로가 제품 안에 없다.
   *
   * **`node.variant`가 이미 검증되고 있다**는 것은 확인했다 — `validatePage`가
   * `def.variants`와 대조해 `unknown-variant` 이슈를 낸다(`validate.ts`). 그래서 여기서
   * 지는 값도 카탈로그가 선언한 값이지 아무 문자열이 아니다.
   *
   * **남는 대가:** MCP·CLI·가져오기로 들어온 `variant`가 조용히 무시된다. 그 경로가
   * 실제로 쓰이기 시작하면 다시 재야 한다.
   */
  it('variantFrom이 있으면 node.variant보다 prop이 이긴다', () => {
    const attrs = nodeAttrs(
      { id: 'n_000000000001', type: 'Text', variant: 'caption' },
      TextDef,
      'default',
      { role: 'h1' },
    )
    expect(attrs['data-wb-variant']).toBe('h1')
  })

  it('variantFrom이 없는 컴포넌트는 node.variant를 그대로 쓴다', () => {
    const attrs = nodeAttrs(
      { id: 'n_000000000001', type: 'Button', variant: 'primary' },
      ButtonDef,
      'solid',
      {},
    )
    expect(attrs['data-wb-variant']).toBe('primary')
  })

  it('prop 값이 문자열이 아니면 속성을 내지 않는다', () => {
    // 렌더러는 검증 전 문서를 받을 수 있다(§7.1) — 값이 무엇이든 던지지 않는다.
    const attrs = nodeAttrs({ id: 'n_000000000001', type: 'Text' }, TextDef, 'default', {
      role: 42,
    })
    expect(attrs['data-wb-variant']).toBeUndefined()
  })
})
