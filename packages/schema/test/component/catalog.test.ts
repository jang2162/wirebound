import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, installCatalog } from '../../src/component/catalog/index'
import { getComponent, listComponents, resetRegistry } from '../../src/component/registry'

describe('컴포넌트 카탈로그', () => {
  beforeEach(() => {
    resetRegistry()
    installCatalog()
  })

  it('36종을 등록한다', () => {
    expect(listComponents()).toHaveLength(36)
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
    expect(listComponents()).toHaveLength(36)
  })

  it('구역 선언 — 타입마다 이름 차례', () => {
    const zones = Object.fromEntries(
      listComponents()
        .filter((d) => d.zones.length > 0)
        .map((d) => [d.type, d.zones.map((zone) => zone.name)]),
    )
    expect(zones).toEqual({
      Page: ['body'],
      Popup: ['body', 'footer'],
      Section: ['body'],
      Flex: ['body'],
      Grid: ['body'],
      Card: ['titleSide', 'headEnd', 'body', 'footer'],
      Tabs: ['body'],
      TabPanel: ['body'],
      DataGrid: ['headStart', 'headEnd', 'body', 'rows', 'footer'],
      GridColumnGroup: ['body'],
      GridColumn: ['body'],
      GridRow: ['body'],
      GridCell: ['body'],
      SearchForm: ['body', 'actions'],
      EntryForm: ['body', 'actions'],
      FormTable: ['headEnd', 'aside', 'body'],
      Field: ['body'],
      Placeholder: ['body'],
    })
  })

  it('Slot은 자식을 담지 않는다', () => {
    expect(getComponent('Slot')!.zones).toEqual([])
  })

  it('받는 타입 제약 — 탭 몸통은 탭 패널만 · 그리드의 열 · 행 · 열 묶음 · 행 몸통 · 탭 패널과 그리드 부품의 설 자리', () => {
    const accepts = listComponents().flatMap((d) => d.zones.filter((z) => z.accepts !== undefined).map((z) => [d.type, z.name, z.accepts]))
    expect(accepts).toEqual([
      ['Tabs', 'body', ['TabPanel']],
      ['DataGrid', 'body', ['GridColumn', 'GridColumnGroup']],
      ['DataGrid', 'rows', ['GridRow']],
      ['GridColumnGroup', 'body', ['GridColumn', 'GridColumnGroup']],
      ['GridRow', 'body', ['GridCell']],
    ])
    const columnPlaces = [
      { type: 'DataGrid', zone: 'body' },
      { type: 'GridColumnGroup', zone: 'body' },
    ]
    expect(listComponents().flatMap((d) => (d.placement === undefined ? [] : [[d.type, d.placement]]))).toEqual([
      ['TabPanel', { type: 'Tabs', zone: 'body' }],
      ['GridColumnGroup', columnPlaces],
      ['GridColumn', columnPlaces],
      ['GridRow', { type: 'DataGrid', zone: 'rows' }],
      ['GridCell', { type: 'GridRow', zone: 'body' }],
    ])
    expect(listComponents().flatMap((d) => (d.bodyHost === 'parent' ? [d.type] : []))).toEqual([
      'TabPanel',
      'GridColumnGroup',
      'GridColumn',
    ])
  })

  it('기본 내용 — 폼의 단추(주 단추는 «검색» · «저장» 의 primary) · 입력폼의 폼 표 · 폼 표의 필드 셋 · 탭의 패널 둘 · 그리드의 열 · 행 · 바', () => {
    const seeds = (type: string, zone: string) => getComponent(type)!.zones.find((z) => z.name === zone)!.initial
    expect(seeds('SearchForm', 'actions')).toEqual([
      { type: 'Button', props: { label: '초기화' } },
      { type: 'Button', props: { label: '검색' }, variant: 'primary' },
    ])
    // 새 입력폼은 1쌍 폼 표(필드 셋)를 들고 선다 — 기본 내용이 겹으로 돈다(`apps/web/src/edit/create-node.ts`).
    expect(seeds('EntryForm', 'body')).toEqual([{ type: 'FormTable' }])
    expect(seeds('FormTable', 'body')).toEqual([{ type: 'Field' }, { type: 'Field' }, { type: 'Field' }])
    expect(seeds('EntryForm', 'actions')).toEqual([
      { type: 'Button', props: { label: '저장' }, variant: 'primary' },
      { type: 'Button', props: { label: '취소' } },
    ])
    expect(seeds('Tabs', 'body')).toEqual([
      { type: 'TabPanel', props: { label: '탭 1' } },
      { type: 'TabPanel', props: { label: '탭 2' } },
    ])
    // 새 그리드는 열 셋(셀 틀 «—») · 행 하나(다섯 줄) · 바 하나를 들고 선다.
    expect(seeds('DataGrid', 'body')).toEqual([
      { type: 'GridColumn', props: { label: '컬럼 1' } },
      { type: 'GridColumn', props: { label: '컬럼 2' } },
      { type: 'GridColumn', props: { label: '컬럼 3' } },
    ])
    expect(seeds('DataGrid', 'rows')).toEqual([{ type: 'GridRow', props: { repeat: 5 } }])
    expect(seeds('DataGrid', 'footer')).toEqual([{ type: 'Pagination' }])
    expect(seeds('GridColumn', 'body')).toEqual([{ type: 'Text', props: { content: '—' } }])
  })

  it('props 스키마가 기본값을 채워 준다', () => {
    const parsed = getComponent('DataGrid')!.props.parse({})
    expect(parsed).toEqual({ select: 'none', fixedColumns: 0, emptyText: '검색 결과가 없습니다.', empty: false, loading: false })
    expect(getComponent('Pagination')!.props.parse({})).toEqual({ total: 72, pageSize: 10, page: 1, sizeSelect: true, range: true })
  })

  it('알 수 없는 prop은 거부한다', () => {
    expect(() => getComponent('Button')!.props.parse({ label: '저장', bogus: 1 })).toThrow()
  })
})
