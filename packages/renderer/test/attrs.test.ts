import { installCatalog, ListDef, type WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { activeStates } from '../src/attrs'
import { renderNode } from '../src/render'

beforeAll(() => {
  installCatalog()
})

/**
 * 노드 루트에 렌더러가 싣는 `data-wb-*` 속성(`WbAttrs`). 기본 뷰가 스스로 다는 마크업 훅(`data-wb-structure` ·
 * `data-wb-part`)은 뺀다 — 그것은 `@wirebound/theme-sdk`의 몫이다.
 */
function rootAttrs(node: WbNode): Record<string, string> {
  const html = renderToStaticMarkup(renderNode(node))
  const tag = new RegExp(`<\\w+ ([^>]*data-wb-id="${node.id}"[^>]*)>`).exec(html)
  if (!tag) throw new Error(`루트를 못 찾았다: ${html}`)
  const out: Record<string, string> = {}
  for (const [, name, value] of tag[1]!.matchAll(/(data-wb-[\w-]+)="([^"]*)"/g)) {
    if (name === 'data-wb-structure' || name === 'data-wb-part') continue
    out[name!] = value!
  }
  return out
}

describe('노드 루트의 속성', () => {
  it('id·컴포넌트를 항상 낸다', () => {
    expect(rootAttrs({ id: 'n_000000000001', type: 'Text' })).toEqual({
      'data-wb-id': 'n_000000000001',
      'data-wb-component': 'Text',
      'data-wb-variant': 'body',
    })
  })

  it('variant가 있으면 함께 낸다', () => {
    expect(rootAttrs({ id: 'n_000000000001', type: 'Button', variant: 'primary' })['data-wb-variant']).toBe('primary')
  })

  it('활성 상태를 공백으로 이어 낸다', () => {
    const attrs = rootAttrs({
      id: 'n_000000000001',
      type: 'List',
      props: { loading: true, empty: true, selected: false },
    })
    expect(attrs['data-wb-state']).toBe('loading empty')
  })

  it('활성 상태가 없으면 data-wb-state를 내지 않는다', () => {
    expect(rootAttrs({ id: 'n_000000000001', type: 'List' })['data-wb-state']).toBeUndefined()
  })
})

describe('activeStates', () => {
  it('선언된 상태와 같은 이름의 prop이 true인 것만 고른다', () => {
    expect(activeStates(ListDef, { selected: true, disabled: false, bogus: true })).toEqual(['selected'])
  })

  it('선언 순서를 지킨다', () => {
    expect(activeStates(ListDef, { empty: true, selected: true })).toEqual(['selected', 'empty'])
  })
})

describe('variantFrom', () => {
  it('enum prop 값이 data-wb-variant로 나온다', () => {
    const attrs = rootAttrs({ id: 'n_000000000001', type: 'Text', props: { role: 'h1', content: '제목' } })
    expect(attrs['data-wb-variant']).toBe('h1')
  })

  it('Field의 control과 Divider의 direction도 같은 채널로 나온다', () => {
    expect(rootAttrs({ id: 'n_000000000001', type: 'Field', props: { control: 'select' } })['data-wb-variant']).toBe('select')
    expect(rootAttrs({ id: 'n_000000000001', type: 'Divider', props: { direction: 'vertical' } })['data-wb-variant']).toBe('vertical')
  })

  /**
   * **`variantFrom`이 이긴다.**
   *
   * 셋 중에서 고른 근거:
   *
   * - **(b) `node.variant`가 이긴다**를 고르면 **같은 prop에서 파생된 것끼리 어긋난다.**
   *   `Text`의 기본 뷰는 `role`로 태그를 고르므로 `role:'h1'` + `variant:'caption'`은
   *   `<h1 data-wb-variant="caption">`이 된다 — 태그는 제목이라 하고 스타일은 캡션이라 한다.
   *   `variantFrom`을 만든 이유가 *"prop이 단일 진실"*인데 그것을 스스로 깬다.
   * - **(c) 둘 다 있으면 막는 검증 이슈**는 설계서 「정방향 흐름」의 게이트가 편집을
   *   **막는** 자리다. 표현 세부 하나 때문에 패치가 거부되는 것은 과하다 — 그래서 막지 않고
   *   `ignored-variant`(warning)로 알린다(`validate.ts`). UI는 그 상태를 만들지 않는다 —
   *   속성 패널은 `variantFrom`이 있는 컴포넌트에 변형 컨트롤을 내지 않는다
   *   (`apps/web/src/panels/property-panel.tsx`의 `variantFieldOf`).
   *
   * **남는 대가:** MCP·CLI·가져오기로 들어온 `variant`는 버려진다. 조용하지는 않다 —
   * `ignored-variant` 경고가 그것을 알린다.
   */
  it('variantFrom이 있으면 node.variant보다 prop이 이긴다', () => {
    const attrs = rootAttrs({ id: 'n_000000000001', type: 'Text', variant: 'caption', props: { role: 'h1' } })
    expect(attrs['data-wb-variant']).toBe('h1')
  })

  it('variantFrom이 없는 컴포넌트는 node.variant를 그대로 쓴다', () => {
    expect(rootAttrs({ id: 'n_000000000001', type: 'Button', variant: 'primary' })['data-wb-variant']).toBe('primary')
  })
})
