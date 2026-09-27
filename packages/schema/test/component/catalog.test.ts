import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { getComponent, listComponents, resetRegistry } from '../../src/component/registry'

describe('컴포넌트 카탈로그', () => {
  beforeEach(() => {
    resetRegistry()
    installCatalog()
  })

  it('19종을 등록한다', () => {
    expect(listComponents()).toHaveLength(19)
  })

  it('CATALOG_TYPES와 등록 결과가 일치한다', () => {
    expect(listComponents().map((d) => d.type).sort()).toEqual([...CATALOG_TYPES].sort())
  })

  it('두 번 설치해도 중복 등록하지 않는다', () => {
    installCatalog()
    expect(listComponents()).toHaveLength(19)
  })

  it('자식을 담는 컴포넌트만 children이 many다', () => {
    const containers = listComponents()
      .filter((d) => d.children === 'many')
      .map((d) => d.type)
      .sort()
    expect(containers).toEqual([
      'Card', 'EntryForm', 'Flex', 'Grid', 'Page', 'SearchForm', 'Section', 'Tabs',
    ])
  })

  it('Slot은 자식을 담지 않는다', () => {
    expect(getComponent('Slot')!.children).toBe('none')
  })

  it('props 스키마가 기본값을 채워 준다', () => {
    const parsed = getComponent('List')!.props.parse({})
    expect(parsed).toMatchObject({ items: 5, pagination: true, selectable: false })
  })

  it('알 수 없는 prop은 거부한다', () => {
    expect(() => getComponent('Button')!.props.parse({ label: '저장', bogus: 1 })).toThrow()
  })
})
