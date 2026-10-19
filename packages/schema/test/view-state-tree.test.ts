/**
 * 상태 목록이 트리다 — `viewStates[].parent` 의 규칙(봉투)과 트리 차례 · 조상 줄 · 자손(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C1」).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { VIEW_STATE_DEPTH_MAX, type PageDocument, type ViewState } from '../src/index'
import { validatePage } from '../src/validate'
import { stateDescendants, stateLineage, viewStateOrder } from '../src/visibility'

beforeAll(() => {
  installCatalog()
})

function page(viewStates: unknown): PageDocument {
  return { version: 1, root: { id: 'n_root', type: 'Page', children: [] }, viewStates } as PageDocument
}

function messages(viewStates: unknown): string[] {
  return validatePage(page(viewStates)).map((issue) => `${issue.code} ${issue.path} ${issue.message}`)
}

const LOGIN: ViewState = { id: 's_login', name: '로그인' }
const ADMIN: ViewState = { id: 's_admin', name: '관리자', parent: 's_login' }
const GUEST: ViewState = { id: 's_guest', name: '손님' }

describe('parent — 봉투', () => {
  it('부모가 없거나 목록의 다른 상태면 받는다 — 깊이 3 까지', () => {
    expect(VIEW_STATE_DEPTH_MAX).toBe(3)
    expect(messages([LOGIN, ADMIN, GUEST])).toEqual([])
    // 자식이 부모보다 앞에 서도 된다 — 형제 차례만 목록 차례다.
    expect(messages([ADMIN, LOGIN])).toEqual([])
    expect(messages([LOGIN, ADMIN, { id: 's_root', name: '최고', parent: 's_admin' }])).toEqual([])
  })

  it('목록에 없는 부모를 거절한다', () => {
    expect(messages([{ id: 's_admin', name: '관리자', parent: 's_gone' }])).toEqual([
      'bad-document /viewStates/0/parent 상태의 부모가 목록에 없습니다: s_gone',
    ])
  })

  it('자기 자신을 부모로 두면 거절한다', () => {
    expect(messages([{ id: 's_a', name: '가', parent: 's_a' }])).toEqual([
      'bad-document /viewStates/0/parent 상태의 부모가 자기 자신입니다: s_a',
    ])
  })

  it('고리를 거절한다 — 둘 · 셋', () => {
    expect(
      messages([
        { id: 's_a', name: '가', parent: 's_b' },
        { id: 's_b', name: '나', parent: 's_a' },
      ]),
    ).toEqual([
      'bad-document /viewStates/0/parent 상태의 부모가 고리를 이룹니다: s_a',
      'bad-document /viewStates/1/parent 상태의 부모가 고리를 이룹니다: s_b',
    ])
    expect(
      messages([
        { id: 's_a', name: '가', parent: 's_c' },
        { id: 's_b', name: '나', parent: 's_a' },
        { id: 's_c', name: '다', parent: 's_b' },
      ]),
    ).toHaveLength(3)
  })

  it('깊이 4 를 거절한다 — 넷째 단만', () => {
    expect(
      messages([
        { id: 's_1', name: '하나' },
        { id: 's_2', name: '둘', parent: 's_1' },
        { id: 's_3', name: '셋', parent: 's_2' },
        { id: 's_4', name: '넷', parent: 's_3' },
      ]),
    ).toEqual(['bad-document /viewStates/3/parent 상태 트리는 3단까지입니다: 넷'])
  })

  it('parent 모양 — 노드 id 규칙 밖 · 글자가 아님은 거절(그 칸만 말한다)', () => {
    for (const parent of ['s login', 1]) {
      const found = messages([LOGIN, { id: 's_admin', name: '관리자', parent }])
      expect(found.length).toBeGreaterThan(0)
      expect(found.every((line) => line.startsWith('bad-document /viewStates/1/parent '))).toBe(true)
    }
  })
})

describe('트리 읽기', () => {
  const states: ViewState[] = [
    { id: 's_admin', name: '관리자', parent: 's_login' },
    GUEST,
    LOGIN,
    { id: 's_top', name: '최고', parent: 's_admin' },
    { id: 's_member', name: '회원', parent: 's_login' },
  ]

  it('viewStateOrder — 뿌리는 목록 차례 · 각 상태 바로 뒤에 자식들(목록 차례) · 깊이', () => {
    expect(viewStateOrder(states).map(({ state, depth }) => `${depth}:${state.name}`)).toEqual([
      '0:손님',
      '0:로그인',
      '1:관리자',
      '2:최고',
      '1:회원',
    ])
    expect(viewStateOrder(undefined)).toEqual([])
  })

  it('viewStateOrder — 고리 · 없는 부모도 사라지지 않는다(검증 전 문서)', () => {
    const broken: ViewState[] = [
      { id: 's_a', name: '가', parent: 's_b' },
      { id: 's_b', name: '나', parent: 's_a' },
      { id: 's_c', name: '다', parent: 's_gone' },
    ]
    expect(viewStateOrder(broken).map(({ state, depth }) => `${depth}:${state.id}`)).toEqual(['0:s_c', '0:s_a', '1:s_b'])
  })

  it('stateLineage — 가까운 것부터 · 기본은 자신만 · 목록 밖은 빈 줄 · 고리에서 멈춘다', () => {
    expect(stateLineage(states, 's_top')).toEqual(['s_top', 's_admin', 's_login'])
    expect(stateLineage(states, 's_login')).toEqual(['s_login'])
    expect(stateLineage(states, 'default')).toEqual(['default'])
    expect(stateLineage(states, 's_gone')).toEqual([])
    expect(
      stateLineage(
        [
          { id: 's_a', name: '가', parent: 's_b' },
          { id: 's_b', name: '나', parent: 's_a' },
        ],
        's_a',
      ),
    ).toEqual(['s_a', 's_b'])
  })

  it('stateDescendants — 자신은 빼고 하위 상태 전부(전위 차례)', () => {
    expect(stateDescendants(states, 's_login')).toEqual(['s_admin', 's_top', 's_member'])
    expect(stateDescendants(states, 's_top')).toEqual([])
    expect(stateDescendants(states, 's_guest')).toEqual([])
  })
})
