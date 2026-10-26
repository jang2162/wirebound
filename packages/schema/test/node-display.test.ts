/**
 * 노드를 부르는 이름(`nodeDisplayName`) · 줄 요약(`nodeSummary`) · 트리 줄 글(`nodeRowLabel`).
 *
 * **레지스트리를 비운 채 잰다** — 셋은 카탈로그 정의를 정적으로 읽어 `installCatalog()` 와 무관해야 한다(exporter · MCP 가
 * 설치 없이 부른다).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, resetRegistry } from '../src/index'
import { nodeDisplayName, nodeHeading, nodeRowLabel, nodeSummary } from '../src/index'
import type { WbNode } from '../src/node'

beforeAll(() => {
  resetRegistry()
})

const n = (type: string, props?: Record<string, unknown>, alias?: string): WbNode => ({
  id: 'n_000000000001',
  type,
  ...(props === undefined ? {} : { props }),
  ...(alias === undefined ? {} : { alias }),
})

describe('nodeSummary — 타입마다', () => {
  it.each<[string, Record<string, unknown> | undefined, string | null]>([
    ['Flex', { direction: 'row' }, '가로'],
    ['Flex', { direction: 'column' }, '세로'],
    ['Flex', { direction: 'column', wrap: true }, '세로 · 줄바꿈'],
    ['Flex', undefined, '가로'],
    ['Grid', { columns: 3 }, '3열'],
    ['Grid', undefined, '2열'],
    ['Button', { label: '저장' }, '저장'],
    ['Button', undefined, '버튼'],
    ['Button', { label: '' }, null],
    ['Button', { label: '   ' }, null],
    ['Link', { label: '회원 목록' }, '회원 목록'],
    ['Placeholder', { label: '광고 자리' }, '광고 자리'],
    ['Field', { label: '이름' }, '이름'],
    ['Field', { label: '' }, null],
    ['Input', { value: '홍길동', placeholder: '이름' }, '홍길동'],
    ['Input', { placeholder: '이름' }, '이름'],
    ['Input', undefined, null],
    ['TextArea', { placeholder: '내용' }, '내용'],
    ['Select', undefined, '항목 1'],
    ['Select', { options: [{ label: '10' }, { label: '20', selected: true }] }, '20'],
    ['DateInput', undefined, 'YYYY-MM-DD'],
    ['TimeInput', { value: '09:30' }, '09:30'],
    ['CheckboxGroup', { options: [{ label: '월', selected: true }, { label: '화' }, { label: '수', selected: true }] }, '월 · 수'],
    ['RadioGroup', { options: [{ label: 'Y' }, { label: 'N' }] }, 'Y'],
    ['RadioGroup', { options: 'Y' }, null],
    ['Chip', { label: '설문' }, '설문'],
    ['Affix', undefined, '~'],
    ['Card', { title: '회원 정보' }, '회원 정보'],
    ['Card', { title: '' }, null],
    ['EntryForm', { title: '회원 등록' }, '회원 등록'],
    ['FormTable', { title: '계정상태 정보', columns: 2 }, '계정상태 정보 · 2열'],
    ['FormTable', undefined, '1열'],
    ['Text', { content: '안녕하세요' }, '안녕하세요'],
    ['Text', { content: '가나다라마바사아자차카타파하가나다라마바사아자' }, '가나다라마바사아자차카타파하가나다라마바…'],
    ['Text', { content: '첫 줄\n둘째 줄' }, '첫 줄 둘째 줄'],
    ['Tabs', undefined, null],
    ['TabPanel', { label: '상세정보' }, '상세정보'],
    ['TabPanel', { label: ' ' }, null],
    ['DataGrid', undefined, null],
    ['DataGrid', { select: 'check', fixedColumns: 2 }, '체크 선택 · 고정 2'],
    ['DataGrid', { select: 'radio' }, '라디오 선택'],
    ['GridColumnGroup', { label: '1학기' }, '1학기'],
    ['GridColumn', { label: '과정명' }, '과정명'],
    ['GridColumn', undefined, '컬럼'],
    ['GridRow', undefined, '×1'],
    ['GridRow', { repeat: 5 }, '×5'],
    ['GridRow', { tone: 'selected' }, '강조 · ×1'],
    ['GridRow', { kind: 'total' }, '합계 · ×1'],
    ['GridRow', { kind: 'gap', repeat: 3 }, '생략'],
    ['GridCell', undefined, null],
    ['GridCell', { span: 5, rowSpan: 2 }, '가로 5 · 세로 2'],
    ['Pagination', undefined, '총 72'],
    [
      'KeyValue',
      {
        pairs: [
          { key: 'a', value: '1' },
          { key: 'b', value: '2' },
        ],
      },
      '2쌍',
    ],
    ['Media', { kind: 'image', caption: '대표 사진' }, 'image · 대표 사진'],
    ['Media', { kind: 'chart' }, 'chart'],
    ['Divider', { direction: 'vertical' }, '세로'],
    ['Divider', undefined, '가로'],
    ['Tree', { items: ['a', 'b', 'c'] }, '항목 3'],
    ['Page', undefined, null],
    ['Slot', undefined, null],
    ['Section', { compact: true }, null],
    ['SearchForm', undefined, null],
    ['FileAttach', undefined, '파일 0개 · 최대 1개'],
    [
      'FileAttach',
      {
        files: [
          { name: 'a.pdf', size: '1 MB' },
          { name: 'b.pdf', size: '2 MB' },
        ],
        maxFiles: 3,
      },
      '파일 2개 · 최대 3개',
    ],
    ['FileAttach', { maxFiles: 0 }, '파일 0개'],
  ])('%s %j → %s', (type, props, expected) => {
    expect(nodeSummary(n(type, props))).toBe(expected)
  })

  it('표가 카탈로그 전부를 덮는다 — 새 타입은 요약을 정하거나 없음을 정해야 한다', () => {
    // 표의 타입(위 케이스) 집합이 카탈로그와 같아야 한다 — 새 컴포넌트가 이 표에 오르지 않으면 여기서 걸린다.
    const covered = new Set([
      'Flex',
      'Grid',
      'Button',
      'Link',
      'Placeholder',
      'Field',
      'Input',
      'TextArea',
      'Select',
      'DateInput',
      'TimeInput',
      'CheckboxGroup',
      'RadioGroup',
      'Chip',
      'Affix',
      'Card',
      'EntryForm',
      'FormTable',
      'Text',
      'Tabs',
      'TabPanel',
      'DataGrid',
      'GridColumnGroup',
      'GridColumn',
      'GridRow',
      'GridCell',
      'Pagination',
      'KeyValue',
      'Media',
      'Divider',
      'Tree',
      'Page',
      'Slot',
      'Section',
      'SearchForm',
      'FileAttach',
    ])
    expect([...covered].sort()).toEqual([...CATALOG_TYPES].sort())
  })

  it('긴 라벨은 자르지 않는다 — 줄임표는 화면이 한 줄에 맞춰 단다', () => {
    const long = '가'.repeat(80)
    expect(nodeSummary(n('Button', { label: long }))).toBe(long)
  })

  it('props 가 규격에 안 맞아도 던지지 않는다', () => {
    expect(nodeSummary(n('Grid', { columns: 'many' }))).toBeNull()
    expect(nodeSummary(n('TabPanel', { label: 3 }))).toBeNull()
    expect(nodeSummary(n('Button', { label: 3 }))).toBeNull()
    expect(nodeSummary({ id: 'x', type: 'Button', props: null } as unknown as WbNode)).toBe('버튼')
  })

  it('카탈로그에 없는 타입은 요약이 없다', () => {
    expect(nodeSummary(n('Bogus', { label: 'x' }))).toBeNull()
  })
})

describe('nodeDisplayName', () => {
  it('별칭이 있으면 별칭이다', () => {
    expect(nodeDisplayName(n('Button', { label: '저장' }, '저장 버튼(머리)'))).toBe('저장 버튼(머리)')
  })

  it('별칭이 없으면 지금 문장이 쓰는 이름이다 — 라벨 + 한국어 이름', () => {
    expect(nodeDisplayName(n('Button', { label: '저장' }))).toBe('저장 버튼')
    expect(nodeDisplayName(n('DataGrid'))).toBe('그리드')
    expect(nodeDisplayName(n('Bogus'))).toBe('Bogus')
  })

  it('번호(marker)는 싣지 않는다 — 번호는 문장이 앞에 붙인다', () => {
    expect(nodeDisplayName({ ...n('DataGrid'), marker: 2 })).toBe('그리드')
  })

  it('모양이 틀린 별칭(검증 전 문서)은 없는 것으로 읽는다', () => {
    expect(nodeDisplayName({ ...n('DataGrid'), alias: '   ' })).toBe('그리드')
    expect(nodeDisplayName({ ...n('DataGrid'), alias: 3 } as unknown as WbNode)).toBe('그리드')
  })
})

describe('nodeHeading · nodeRowLabel', () => {
  it('`타입 (별칭) 요약`', () => {
    expect(nodeRowLabel(n('Button', { label: '저장' }, '머리 저장'))).toBe('Button (머리 저장) 저장')
    expect(nodeHeading(n('Button', { label: '저장' }, '머리 저장'))).toBe('Button (머리 저장)')
  })

  it('별칭이 없으면 괄호를 생략한다', () => {
    expect(nodeRowLabel(n('Flex', { direction: 'column' }))).toBe('Flex 세로')
    expect(nodeHeading(n('Flex', { direction: 'column' }))).toBe('Flex')
  })

  it('요약이 없으면 타입 (별칭)만', () => {
    expect(nodeRowLabel(n('Section', undefined, '본문'))).toBe('Section (본문)')
    expect(nodeRowLabel(n('Page'))).toBe('Page')
  })
})
