import { ButtonDef, ListDef, TextDef } from '@wirebound/schema'
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
