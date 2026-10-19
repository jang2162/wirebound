/**
 * **화면 상태의 lint 둘**(설계서 「lint 규칙」) — 목록에 없는 상태를 가리키는 노드 보임(경고) · 쓰이지 않는 상태(정보).
 *
 * 규칙마다 서는 판과 안 서는 판(카나리아)을 함께 둔다 — 안 서는 판만 있으면 규칙을 통째로 뗀 변조가 산다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { lintDesign } from '../src/lint/design'
import type { LintProject } from '../src/lint/input'
import { lintRule } from '../src/lint/rules'
import type { NodeVisibility, PageDocument, ViewState, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const shown = (id: string, visibility?: NodeVisibility, children?: WbNode[]): WbNode => ({
  id,
  type: children === undefined ? 'Button' : 'Card',
  ...(children === undefined ? { props: { label: '단추' } } : { children }),
  ...(visibility === undefined ? {} : { visibility }),
})

function doc(children: WbNode[], viewStates?: ViewState[]): PageDocument {
  return { version: 2, ...(viewStates === undefined ? {} : { viewStates }), root: { id: 'n_root', type: 'Page', children } }
}

function lint(document: PageDocument) {
  const project: LintProject = {
    menu: [{ id: 'm1', parentId: null, title: '관리자' }],
    pages: [{ id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document }],
    comments: [],
  }
  return lintDesign(project)
}

const LOGIN: ViewState = { id: 's_login', name: '로그인' }
const ADMIN: ViewState = { id: 's_admin', name: '관리자', parent: 's_login' }
const GUEST: ViewState = { id: 's_guest', name: '비로그인' }

describe('view-state-unknown — 목록에 없는 상태를 가리키는 보임', () => {
  it('목록 밖 상태를 가리키는 노드 하나에 경고 하나 — 자리는 그 노드의 visibility · 밖 상태만 든다', () => {
    const issues = lint(
      doc([shown('n_a', { mode: 'only', states: ['s_login'] }), shown('n_x', { mode: 'except', states: ['s_login', 's_gone'] })], [LOGIN]),
    ).filter((issue) => issue.rule === 'view-state-unknown')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'warning', pageId: 'pg1', nodeId: 'n_x', path: '/root/children/1/visibility' })
    expect(issues[0]!.message).toContain('s_gone')
    expect(issues[0]!.message).not.toContain('s_login')
  })

  it('목록이 없는 페이지 — default 말고는 전부 밖이다', () => {
    const issues = lint(
      doc([shown('n_d', { mode: 'only', states: ['default'] }), shown('n_x', { mode: 'only', states: ['s_gone'] })]),
    ).filter((issue) => issue.rule === 'view-state-unknown')
    expect(issues.map((issue) => issue.nodeId)).toEqual(['n_x'])
  })

  it('카나리아 — 목록의 상태 · default 를 가리키는 보임은 안 낸다', () => {
    const issues = lint(doc([shown('n_a', { mode: 'only', states: ['s_login', 'default'] })], [LOGIN]))
    expect(issues).toEqual([])
  })
})

describe('view-state-unused — 쓰이지 않는 상태', () => {
  it('어느 보임도 가리키지 않는 상태에 정보 하나 — 자리는 목록의 그 항목', () => {
    const issues = lint(doc([shown('n_a', { mode: 'only', states: ['s_login'] })], [LOGIN, GUEST])).filter(
      (issue) => issue.rule === 'view-state-unused',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ severity: 'info', pageId: 'pg1', nodeId: null, path: '/viewStates/1' })
    expect(issues[0]!.message).toContain('비로그인')
  })

  it('보임이 하나도 없는 페이지의 상태도 쓰이지 않는 것이다', () => {
    const issues = lint(doc([shown('n_t')], [GUEST]))
    expect(issues.map((issue) => [issue.rule, issue.path])).toEqual([['view-state-unused', '/viewStates/0']])
  })

  it('하위 상태가 쓰이면 부모 상태도 쓰인 것이다 — 하위만 안 쓰이면 하위만 낸다', () => {
    const child = lint(doc([shown('n_a', { mode: 'except', states: ['s_admin'] })], [LOGIN, ADMIN]))
    expect(child.filter((issue) => issue.rule === 'view-state-unused')).toEqual([])
    const parentOnly = lint(doc([shown('n_a', { mode: 'only', states: ['s_login'] })], [LOGIN, ADMIN]))
    expect(parentOnly.filter((issue) => issue.rule === 'view-state-unused').map((issue) => issue.path)).toEqual(['/viewStates/1'])
  })

  it('카나리아 — 깊은 노드의 보임도 센다', () => {
    const issues = lint(doc([shown('n_card', undefined, [shown('n_in', { mode: 'only', states: ['s_guest'] })])], [GUEST]))
    expect(issues).toEqual([])
  })
})

describe('규칙 표', () => {
  it('둘이 설계서 규칙이고 등급이 경고 · 정보다 · 영역 안 영역 규칙은 없다', () => {
    expect(['view-state-unknown', 'view-state-unused'].map((id) => [id, lintRule(id)?.group, lintRule(id)?.severity])).toEqual([
      ['view-state-unknown', 'document', 'warning'],
      ['view-state-unused', 'document', 'info'],
    ])
    expect(lintRule('view-state-nested')).toBeUndefined()
  })
})
