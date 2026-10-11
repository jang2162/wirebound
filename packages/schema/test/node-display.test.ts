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
    ['Field', { label: '이름', control: 'text' }, '이름 · text'],
    ['Field', { label: '', control: 'date' }, 'date'],
    ['Card', { title: '회원 정보' }, '회원 정보'],
    ['Card', { title: '' }, null],
    ['EntryForm', { title: '회원 등록' }, '회원 등록'],
    ['Text', { content: '안녕하세요' }, '안녕하세요'],
    ['Text', { content: '가나다라마바사아자차카타파하가나다라마바사아자' }, '가나다라마바사아자차카타파하가나다라마바…'],
    ['Text', { content: '첫 줄\n둘째 줄' }, '첫 줄 둘째 줄'],
    ['Tabs', { tabs: ['기본', '상세'] }, '기본 · 상세'],
    ['Tabs', { tabs: ['가', '나', '다'] }, '가 · 나 · 다'],
    ['Tabs', { tabs: ['가', '나', '다', '라'] }, '가 · 나 · 다 · …'],
    ['Tabs', { tabs: [] }, null],
    ['List', { columns: ['이름', '이메일', '가입일', '상태'] }, '이름 · 이메일 · 가입일 · …'],
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
  ])('%s %j → %s', (type, props, expected) => {
    expect(nodeSummary(n(type, props))).toBe(expected)
  })

  it('상태 영역은 가지 수, 상태 가지는 그 상태의 이름이다', () => {
    const states = [{ id: 's_admin', name: '관리자' }]
    const sw = (count: number): WbNode => ({
      id: 'n_sw',
      type: 'StateSwitch',
      children: Array.from({ length: count }, (_, i) => ({ id: `n_c${i}`, type: 'StateCase', props: { state: 'default' } })),
    })
    expect(nodeSummary(sw(2))).toBe('가지 2')
    expect(nodeSummary(sw(0))).toBe('가지 0')
    expect(nodeSummary({ id: 'n_sw', type: 'StateSwitch', children: 'x' } as unknown as WbNode)).toBe('가지 0')
    expect(nodeSummary(n('StateCase', { state: 'default' }), states)).toBe('기본')
    expect(nodeSummary(n('StateCase', { state: 's_admin' }), states)).toBe('관리자')
    // 목록이 없거나 목록에 없는 상태 — 그 가지는 그려지지 않는다(렌더러 · lint `view-state-unknown`).
    expect(nodeSummary(n('StateCase', { state: 's_admin' }))).toBe('목록에 없는 상태')
    expect(nodeSummary(n('StateCase', { state: 's_gone' }), states)).toBe('목록에 없는 상태')
    expect(nodeSummary(n('StateCase', { state: 7 }), states)).toBe('목록에 없는 상태')
    expect(nodeRowLabel(n('StateCase', { state: 's_admin' }), states)).toBe('StateCase 관리자')
  })

  it('표가 카탈로그 21종을 모두 덮는다 — 새 타입은 요약을 정하거나 없음을 정해야 한다', () => {
    // 표의 타입(위 케이스) 집합이 카탈로그와 같아야 한다 — 새 컴포넌트가 이 표에 오르지 않으면 여기서 걸린다.
    const covered = new Set([
      'Flex',
      'Grid',
      'Button',
      'Link',
      'Placeholder',
      'Field',
      'Card',
      'EntryForm',
      'Text',
      'Tabs',
      'List',
      'KeyValue',
      'Media',
      'Divider',
      'Tree',
      'Page',
      'Slot',
      'Section',
      'SearchForm',
      'StateSwitch',
      'StateCase',
    ])
    expect([...covered].sort()).toEqual([...CATALOG_TYPES].sort())
  })

  it('긴 라벨은 자르지 않는다 — 줄임표는 화면이 한 줄에 맞춰 단다', () => {
    const long = '가'.repeat(80)
    expect(nodeSummary(n('Button', { label: long }))).toBe(long)
  })

  it('props 가 규격에 안 맞아도 던지지 않는다', () => {
    expect(nodeSummary(n('Grid', { columns: 'many' }))).toBeNull()
    expect(nodeSummary(n('Tabs', { tabs: 'x' }))).toBeNull()
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
    expect(nodeDisplayName(n('List'))).toBe('목록')
    expect(nodeDisplayName(n('Bogus'))).toBe('Bogus')
  })

  it('번호(marker)는 싣지 않는다 — 번호는 문장이 앞에 붙인다', () => {
    expect(nodeDisplayName({ ...n('List'), marker: 2 })).toBe('목록')
  })

  it('모양이 틀린 별칭(검증 전 문서)은 없는 것으로 읽는다', () => {
    expect(nodeDisplayName({ ...n('List'), alias: '   ' })).toBe('목록')
    expect(nodeDisplayName({ ...n('List'), alias: 3 } as unknown as WbNode)).toBe('목록')
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
