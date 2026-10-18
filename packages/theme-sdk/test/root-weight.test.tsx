// @vitest-environment jsdom
/**
 * `Root` 가 노드 몫(`NodeBinding.weight`)을 `--wb-node-weight` 로 뿌리에 싣는가 — 뷰가 준 `style` 과 **합쳐서**(덮지 않고). 몫이 화면에서
 * 무엇을 하는지는 실브라우저 판 `apps/web/build-test/layout-weight.test.ts` 가 잰다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeContext, Root, WEIGHT_VAR, type NodeBinding } from '@wirebound/theme-sdk'

afterEach(() => {
  cleanup()
})

function draw(binding: Partial<NodeBinding>, rootProps: Record<string, unknown> = {}): HTMLElement {
  const value: NodeBinding = { attrs: { 'data-wb-id': 'n1', 'data-wb-component': 'Grid' }, markRootRendered: () => {}, ...binding }
  const { container } = render(
    <NodeContext.Provider value={value}>
      <Root {...rootProps} />
    </NodeContext.Provider>,
  )
  return container.firstElementChild as HTMLElement
}

describe('Root — 몫', () => {
  it('변수 이름은 --wb-node-weight 다', () => {
    expect(WEIGHT_VAR).toBe('--wb-node-weight')
  })

  it('몫이 있으면 뷰가 준 커스텀 프로퍼티와 몫이 둘 다 뿌리에 선다', () => {
    const el = draw({ weight: 3 }, { style: { '--wb-node-grid-columns': '4' } })
    expect(el.style.getPropertyValue('--wb-node-weight')).toBe('3')
    expect(el.style.getPropertyValue('--wb-node-grid-columns')).toBe('4')
  })

  it('뷰가 style 을 안 주어도 몫이 선다', () => {
    const el = draw({ weight: 12 })
    expect(el.style.getPropertyValue('--wb-node-weight')).toBe('12')
  })

  it('뷰가 같은 이름을 넘겨도 노드의 몫이 이긴다', () => {
    const el = draw({ weight: 2 }, { style: { '--wb-node-weight': '9' } })
    expect(el.style.getPropertyValue('--wb-node-weight')).toBe('2')
  })

  it('몫이 없으면 변수를 싣지 않고 뷰의 style 을 그대로 둔다', () => {
    const el = draw({}, { style: { '--wb-node-grid-columns': '4' } })
    expect(el.style.getPropertyValue('--wb-node-weight')).toBe('')
    expect(el.getAttribute('style')).toBe('--wb-node-grid-columns: 4;')
  })

  it('몫도 style 도 없으면 style 속성이 없다', () => {
    expect(draw({}).hasAttribute('style')).toBe(false)
  })
})
