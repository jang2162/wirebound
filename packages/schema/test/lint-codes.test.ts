/**
 * 공통코드 lint 다섯(설계서 「lint 규칙」). 규칙마다 서는 판 하나와, 표를 안 준 판(다섯 다 0)을 둔다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { CodeTable } from '../src/codes'
import { lintDesign } from '../src/lint/design'
import type { LintProject } from '../src/lint/input'
import type { WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const CODE_RULES = ['broken-code-ref', 'broken-code-selected', 'inactive-code-ref', 'code-choices-truncated', 'code-choices-empty']

const many = Array.from({ length: 31 }, (_, i) => ({ value: `V${i}`, name: `이름${i}`, active: true }))
const TABLE: CodeTable = [
  {
    key: 'S',
    name: '상태',
    items: [
      { value: 'ON', name: '사용', active: true },
      { value: 'OFF', name: '꺼짐', active: false },
    ],
  },
  { key: 'MANY', name: '많음', items: many },
  { key: 'EMPTY', name: '빔', items: [{ value: 'X', name: '엑스', active: false }] },
]

function lint(children: WbNode[], codes: CodeTable | null = TABLE) {
  const project: LintProject = {
    menu: [{ id: 'm1', parentId: null, title: '관리자' }],
    pages: [
      {
        id: 'pg1',
        menuNodeId: 'm1',
        title: '목록',
        target: 'page:관리자/목록',
        document: { version: 2, root: { id: 'n_root', type: 'Page', children } },
      },
    ],
    comments: [],
    ...(codes === null ? {} : { codes }),
  }
  return lintDesign(project).filter((issue) => CODE_RULES.includes(issue.rule))
}

const affix = (code: WbNode['code']): WbNode => ({ id: 'n_a', type: 'Affix', props: { text: '옛' }, code })
const select = (code: WbNode['code']): WbNode => ({ id: 'n_s', type: 'CheckboxGroup', code })

describe('공통코드 lint', () => {
  it('맞는 참조는 0', () => {
    expect(lint([affix({ group: 'S', item: 'ON' }), select({ group: 'S', selected: ['ON'] })])).toEqual([])
  })

  it('broken-code-ref — 없는 항목(오류)', () => {
    const issues = lint([affix({ group: 'S', item: 'GONE' })])
    expect(issues.map((i) => [i.rule, i.severity, i.nodeId, i.path])).toEqual([
      ['broken-code-ref', 'error', 'n_a', '/root/children/0/code'],
    ])
  })

  it('broken-code-ref — 없는 그룹(선택 위젯)', () => {
    expect(lint([select({ group: 'NOPE' })]).map((i) => [i.rule, i.severity])).toEqual([['broken-code-ref', 'error']])
  })

  it('broken-code-selected — 고른 값이 없거나 사용 안 함(경고)', () => {
    const issues = lint([select({ group: 'S', selected: ['GONE', 'OFF'] })])
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([['broken-code-selected', 'warning']])
    expect(issues[0]!.message).toContain('GONE, OFF')
  })

  it('inactive-code-ref — 사용 안 함 항목을 가리킨 대표 글', () => {
    expect(lint([affix({ group: 'S', item: 'OFF' })]).map((i) => [i.rule, i.severity])).toEqual([['inactive-code-ref', 'warning']])
  })

  it('code-choices-truncated — 사용 중 31 개', () => {
    expect(lint([select({ group: 'MANY' })]).map((i) => i.rule)).toEqual(['code-choices-truncated'])
  })

  it('code-choices-empty — 사용 중 0 개', () => {
    expect(lint([select({ group: 'EMPTY' })]).map((i) => i.rule)).toEqual(['code-choices-empty'])
  })

  it('표를 안 주면 다섯 다 안 돈다', () => {
    const all = [affix({ group: 'S', item: 'GONE' }), select({ group: 'NOPE' }), { ...select({ group: 'EMPTY' }), id: 'n_e' }]
    expect(lint(all).length).toBeGreaterThan(0)
    expect(lint(all, null)).toEqual([])
  })
})
