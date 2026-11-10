/**
 * 노드의 공통코드 참조(`WbNode.code`) — 봉투가 보는 모양과, 카탈로그 선언(`ComponentDef.code`)과의 맞춤(`invalid-code-ref`).
 * 풀기 · 사용처 · lint 는 `codes-resolve.test.ts` · `codes-usage.test.ts` · `lint-codes.test.ts`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { codeBindingOf, installCatalog, listComponents, resetRegistry, validatePage, WbNodeSchema, type WbNode } from '../src/index'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const LABEL_BINDINGS: Record<string, string> = {
  Button: 'label',
  Link: 'label',
  Text: 'content',
  Chip: 'label',
  Affix: 'text',
  Placeholder: 'label',
  TabPanel: 'label',
  Input: 'value',
}
const CHOICE_TYPES = ['Select', 'CheckboxGroup', 'RadioGroup']

function page(child: WbNode) {
  // TabPanel 은 Tabs 몸통에만 선다.
  const node: WbNode = child.type === 'TabPanel' ? { id: 'n_tabs', type: 'Tabs', children: [child] } : child
  return { version: 1, root: { id: 'n_root', type: 'Page', children: [node] } }
}

function codeIssues(child: WbNode) {
  return validatePage(page(child) as never).filter((issue) => issue.code === 'invalid-code-ref')
}

describe('카탈로그의 공통코드 선언', () => {
  it('선택 위젯 셋은 그룹을 받는다', () => {
    for (const type of CHOICE_TYPES) expect(codeBindingOf(type), type).toEqual({ kind: 'choices' })
  })

  it('대표 글 타입과 그 prop', () => {
    for (const [type, prop] of Object.entries(LABEL_BINDINGS)) expect(codeBindingOf(type), type).toEqual({ kind: 'label', prop })
  })

  it('선언한 타입은 위 표가 전부다', () => {
    const declared = listComponents()
      .filter((def) => def.code !== undefined)
      .map((def) => def.type)
      .sort()
    expect(declared).toEqual([...CHOICE_TYPES, ...Object.keys(LABEL_BINDINGS)].sort())
    expect(codeBindingOf('DataGrid')).toBeNull()
    expect(codeBindingOf('없는타입')).toBeNull()
  })
})

describe('봉투 — code 의 모양', () => {
  const at = (code: unknown) => WbNodeSchema.safeParse({ id: 'n_a', type: 'Affix', code }).success
  it('그룹 키 · 코드값 꼴만 받는다', () => {
    expect(at({ group: 'ORDER_STATUS', item: 'WAIT' })).toBe(true)
    expect(at({ group: 'ORDER_STATUS', selected: ['A', 'B'] })).toBe(true)
    expect(at({ group: 'order' })).toBe(false)
    expect(at({ group: 'A', item: '' })).toBe(false)
    expect(at({ group: 'A', extra: 1 })).toBe(false)
    expect(at({ item: 'A' })).toBe(false)
  })
})

describe('validatePage — invalid-code-ref', () => {
  it('code 가 없는 옛 문서는 이슈 0', () => {
    expect(codeIssues({ id: 'n_a', type: 'Affix', props: { text: '대기' } })).toEqual([])
  })

  it('맞는 꼴은 이슈 0', () => {
    expect(codeIssues({ id: 'n_a', type: 'Affix', code: { group: 'S', item: 'A' } })).toEqual([])
    expect(codeIssues({ id: 'n_a', type: 'Select', code: { group: 'S', selected: ['A'] } })).toEqual([])
    expect(codeIssues({ id: 'n_a', type: 'CheckboxGroup', code: { group: 'S', selected: ['A', 'B'] } })).toEqual([])
    expect(codeIssues({ id: 'n_a', type: 'TabPanel', code: { group: 'S', item: 'A' } })).toEqual([])
  })

  it('받지 않는 타입', () => {
    const issues = codeIssues({ id: 'n_a', type: 'DataGrid', code: { group: 'S' } })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'error', nodeId: 'n_a', path: '/root/children/0/code' })
  })

  it('선택 위젯에 item', () => {
    expect(codeIssues({ id: 'n_a', type: 'Select', code: { group: 'S', item: 'A' } })).toHaveLength(1)
  })

  it('대표 글 타입에 item 없음 · selected', () => {
    expect(codeIssues({ id: 'n_a', type: 'Affix', code: { group: 'S' } })).toHaveLength(1)
    expect(codeIssues({ id: 'n_a', type: 'Affix', code: { group: 'S', item: 'A', selected: ['A'] } })).toHaveLength(1)
  })

  it('하나 고르는 타입의 selected 둘', () => {
    expect(codeIssues({ id: 'n_a', type: 'Select', code: { group: 'S', selected: ['A', 'B'] } })).toHaveLength(1)
    expect(codeIssues({ id: 'n_a', type: 'RadioGroup', code: { group: 'S', selected: ['A', 'B'] } })).toHaveLength(1)
  })

  it('selected 의 겹친 값', () => {
    expect(codeIssues({ id: 'n_a', type: 'CheckboxGroup', code: { group: 'S', selected: ['A', 'A'] } })).toHaveLength(1)
  })
})
