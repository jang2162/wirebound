import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { getComponent, listComponents, resetRegistry } from '../../src/component/registry'

describe('컴포넌트 카탈로그', () => {
  beforeEach(() => {
    resetRegistry()
    installCatalog()
  })

  it('29종을 등록한다', () => {
    expect(listComponents()).toHaveLength(29)
  })

  it('CATALOG_TYPES와 등록 결과가 일치한다', () => {
    expect(
      listComponents()
        .map((d) => d.type)
        .sort(),
    ).toEqual([...CATALOG_TYPES].sort())
  })

  it('두 번 설치해도 중복 등록하지 않는다', () => {
    installCatalog()
    expect(listComponents()).toHaveLength(29)
  })

  it('구역 선언 — 타입마다 이름 차례', () => {
    const zones = Object.fromEntries(
      listComponents()
        .filter((d) => d.zones.length > 0)
        .map((d) => [d.type, d.zones.map((zone) => zone.name)]),
    )
    expect(zones).toEqual({
      Page: ['body'],
      Section: ['body'],
      Flex: ['body'],
      Grid: ['body'],
      Card: ['titleSide', 'headEnd', 'body', 'footer'],
      Tabs: ['body'],
      TabPanel: ['body'],
      List: ['headStart', 'headEnd'],
      SearchForm: ['body', 'actions'],
      EntryForm: ['body', 'actions'],
      Field: ['body'],
    })
  })

  it('Slot은 자식을 담지 않는다', () => {
    expect(getComponent('Slot')!.zones).toEqual([])
  })

  it('받는 타입 제약은 탭 하나다 — 탭 몸통은 탭 패널만 · 탭 패널은 탭 몸통에만', () => {
    const accepts = listComponents().flatMap((d) => d.zones.filter((z) => z.accepts !== undefined).map((z) => [d.type, z.name, z.accepts]))
    expect(accepts).toEqual([['Tabs', 'body', ['TabPanel']]])
    expect(listComponents().flatMap((d) => (d.placement === undefined ? [] : [[d.type, d.placement]]))).toEqual([
      ['TabPanel', { type: 'Tabs', zone: 'body' }],
    ])
    expect(getComponent('TabPanel')!.bodyHost).toBe('parent')
  })

  it('기본 내용 — 폼의 단추(주 단추는 «검색» · «저장» 의 primary) · 탭의 패널 둘', () => {
    const seeds = (type: string, zone: string) => getComponent(type)!.zones.find((z) => z.name === zone)!.initial
    expect(seeds('SearchForm', 'actions')).toEqual([
      { type: 'Button', props: { label: '초기화' } },
      { type: 'Button', props: { label: '검색' }, variant: 'primary' },
    ])
    expect(seeds('EntryForm', 'actions')).toEqual([
      { type: 'Button', props: { label: '저장' }, variant: 'primary' },
      { type: 'Button', props: { label: '취소' } },
    ])
    expect(seeds('Tabs', 'body')).toEqual([
      { type: 'TabPanel', props: { label: '탭 1' } },
      { type: 'TabPanel', props: { label: '탭 2' } },
    ])
  })

  it('props 스키마가 기본값을 채워 준다', () => {
    const parsed = getComponent('List')!.props.parse({})
    expect(parsed).toMatchObject({ items: 5, pagination: true, selectable: false })
  })

  it('알 수 없는 prop은 거부한다', () => {
    expect(() => getComponent('Button')!.props.parse({ label: '저장', bogus: 1 })).toThrow()
  })
})
