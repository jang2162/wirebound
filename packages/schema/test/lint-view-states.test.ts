/**
 * **화면 상태의 lint 셋**(설계서 「lint 규칙」) — 목록에 없는 상태를 가리키는 가지(경고) · 쓰이지 않는 상태(정보) · 상태 영역 안의 상태
 * 영역(정보).
 *
 * 규칙마다 서는 판과 안 서는 판(카나리아)을 함께 둔다 — 안 서는 판만 있으면 규칙을 통째로 뗀 변조가 산다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { lintDesign } from '../src/lint/design'
import type { LintProject } from '../src/lint/input'
import { lintRule } from '../src/lint/rules'
import type { PageDocument, ViewState, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const caseOf = (id: string, state: string, children: WbNode[] = [{ id: `${id}_b`, type: 'Button', props: { label: '단추' } }]): WbNode => ({
  id,
  type: 'StateCase',
  props: { state },
  children,
})

const switchOf = (id: string, cases: WbNode[]): WbNode => ({ id, type: 'StateSwitch', children: cases })

function doc(children: WbNode[], viewStates?: ViewState[]): PageDocument {
  return { version: 1, ...(viewStates === undefined ? {} : { viewStates }), root: { id: 'n_root', type: 'Page', children } }
}

function lint(document: PageDocument) {
  const project: LintProject = {
    menu: [{ id: 'm1', parentId: null, title: '관리자' }],
    pages: [{ id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document }],
    comments: [],
  }
  return lintDesign(project)
}

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }
const GUEST: ViewState = { id: 's_guest', name: '비로그인' }

describe('view-state-unknown — 목록에 없는 상태를 가리키는 가지', () => {
  it('목록에 없는 상태의 가지 하나에 경고 하나 — 자리는 그 가지', () => {
    const issues = lint(
      doc([switchOf('n_sw', [caseOf('n_d', 'default'), caseOf('n_a', 's_admin'), caseOf('n_x', 's_gone')])], [ADMIN]),
    ).filter((issue) => issue.rule === 'view-state-unknown')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'warning', pageId: 'pg1', nodeId: 'n_x', path: '/root/children/0/children/2' })
    expect(issues[0]!.message).toContain('s_gone')
  })

  it('목록이 없는 페이지의 가지도 — 기본 가지는 늘 있다', () => {
    const issues = lint(doc([switchOf('n_sw', [caseOf('n_d', 'default'), caseOf('n_x', 's_gone')])])).filter(
      (issue) => issue.rule === 'view-state-unknown',
    )
    expect(issues.map((issue) => issue.nodeId)).toEqual(['n_x'])
  })

  it('카나리아 — 목록에 있는 상태 · 기본 가지는 안 낸다', () => {
    const issues = lint(doc([switchOf('n_sw', [caseOf('n_d', 'default'), caseOf('n_a', 's_admin')])], [ADMIN]))
    expect(issues.filter((issue) => issue.rule === 'view-state-unknown')).toEqual([])
    expect(issues).toEqual([])
  })
})

describe('view-state-unused — 쓰이지 않는 상태', () => {
  it('가지가 하나도 없는 상태에 정보 하나 — 자리는 목록의 그 항목', () => {
    const issues = lint(doc([switchOf('n_sw', [caseOf('n_d', 'default'), caseOf('n_a', 's_admin')])], [ADMIN, GUEST])).filter(
      (issue) => issue.rule === 'view-state-unused',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'info', pageId: 'pg1', nodeId: null, path: '/viewStates/1' })
    expect(issues[0]!.message).toContain('비로그인')
  })

  it('영역이 하나도 없는 페이지의 상태도 쓰이지 않는 것이다', () => {
    const issues = lint(doc([{ id: 'n_t', type: 'Text', props: { content: '글' } }], [ADMIN]))
    expect(issues.map((issue) => [issue.rule, issue.path])).toEqual([['view-state-unused', '/viewStates/0']])
  })

  it('카나리아 — 가지가 있는 상태는 안 낸다(영역 안 영역의 가지도 쓰인 것이다)', () => {
    const inner = switchOf('n_in', [caseOf('n_id', 'default'), caseOf('n_ig', 's_guest')])
    const issues = lint(doc([switchOf('n_sw', [caseOf('n_d', 'default', [inner]), caseOf('n_a', 's_admin')])], [ADMIN, GUEST]))
    expect(issues.filter((issue) => issue.rule === 'view-state-unused')).toEqual([])
  })
})

describe('view-state-nested — 상태 영역 안의 상태 영역', () => {
  it('영역 안의 영역에 정보 하나 — 자리는 안쪽 영역', () => {
    const inner = switchOf('n_in', [caseOf('n_id', 'default')])
    const issues = lint(doc([switchOf('n_sw', [caseOf('n_d', 'default', [inner])])])).filter((issue) => issue.rule === 'view-state-nested')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'info', pageId: 'pg1', nodeId: 'n_in', path: '/root/children/0/children/0/children/0' })
  })

  it('카나리아 — 나란한 영역 둘은 안 낸다', () => {
    const issues = lint(doc([switchOf('n_s1', [caseOf('n_d1', 'default')]), switchOf('n_s2', [caseOf('n_d2', 'default')])]))
    expect(issues).toEqual([])
  })
})

describe('규칙 표', () => {
  it('셋이 설계서 규칙이고 등급이 경고 · 정보 · 정보다', () => {
    expect(
      ['view-state-unknown', 'view-state-unused', 'view-state-nested'].map((id) => [id, lintRule(id)?.group, lintRule(id)?.severity]),
    ).toEqual([
      ['view-state-unknown', 'document', 'warning'],
      ['view-state-unused', 'document', 'info'],
      ['view-state-nested', 'document', 'info'],
    ])
  })
})
