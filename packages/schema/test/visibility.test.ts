/**
 * 노드마다 상태 보임 — `WbNode.visibility` 의 봉투와 판정 `isVisibleIn` · `visibleTree`(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C2」).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { NodeVisibility, PageDocument, ViewState, WbNode } from '../src/index'
import { unknownVisibilityStates, validatePage } from '../src/validate'
import { isVisibleIn, visibleTree } from '../src/visibility'

beforeAll(() => {
  installCatalog()
})

const STATES: ViewState[] = [
  { id: 's_login', name: '로그인' },
  { id: 's_admin', name: '관리자', parent: 's_login' },
]

const text = (id: string, visibility?: unknown): WbNode =>
  ({ id, type: 'Text', props: { content: id }, ...(visibility === undefined ? {} : { visibility }) }) as WbNode

function page(children: WbNode[], viewStates: ViewState[] | null = STATES): PageDocument {
  const doc = { version: 1, root: { id: 'n_root', type: 'Page', children } } as PageDocument
  if (viewStates !== null) doc.viewStates = viewStates
  return doc
}

function messages(visibility: unknown): string[] {
  return validatePage(page([text('n_t', visibility)])).map((issue) => `${issue.code} ${issue.path} ${issue.message}`)
}

describe('visibility — 봉투', () => {
  it('only · except 와 상태 하나 이상을 받는다 — default 포함', () => {
    expect(messages({ mode: 'only', states: ['s_login'] })).toEqual([])
    expect(messages({ mode: 'except', states: ['s_admin', 'default'] })).toEqual([])
    expect(messages({ mode: 'only', states: ['default'] })).toEqual([])
  })

  it('states 빈 배열을 거절한다', () => {
    expect(messages({ mode: 'only', states: [] })).toEqual([
      'bad-document /root/children/0/visibility/states 상태 보임에는 상태가 하나 이상 있어야 합니다',
    ])
  })

  it('겹침을 거절한다', () => {
    expect(messages({ mode: 'except', states: ['s_login', 's_login'] })).toEqual([
      'bad-document /root/children/0/visibility/states/1 상태 보임의 상태가 겹칩니다: s_login',
    ])
  })

  it('모양 밖 — 모르는 mode · 모르는 키 · id 규칙 밖 · 없는 states', () => {
    expect(messages({ mode: 'hide', states: ['s_login'] })).toHaveLength(1)
    expect(messages({ mode: 'only', states: ['s_login'], when: 'x' })).toHaveLength(1)
    expect(messages({ mode: 'only', states: ['s login'] })).toHaveLength(1)
    expect(messages({ mode: 'only' })).toHaveLength(1)
  })

  it('목록 밖 상태는 봉투가 아니라 unknownVisibilityStates 가 말한다 — default 는 늘 안다', () => {
    const doc = page([text('n_a', { mode: 'only', states: ['s_gone', 's_login'] }), text('n_b', { mode: 'except', states: ['default'] })])
    expect(validatePage(doc)).toEqual([])
    expect(unknownVisibilityStates(doc)).toEqual([{ nodeId: 'n_a', path: '/root/children/0/visibility', states: ['s_gone'] }])
    // 목록이 없는 페이지에서는 default 말고 전부 밖이다.
    expect(unknownVisibilityStates(page([text('n_a', { mode: 'only', states: ['s_login', 'default'] })], null))).toEqual([
      { nodeId: 'n_a', path: '/root/children/0/visibility', states: ['s_login'] },
    ])
  })

  it('뿌리에는 보임을 둘 수 없다', () => {
    const doc = page([])
    doc.root.visibility = { mode: 'only', states: ['s_login'] }
    expect(validatePage(doc).map((issue) => `${issue.code} ${issue.path}`)).toEqual(['bad-root /root/visibility'])
  })
})

describe('isVisibleIn — 판정 표(상태 «로그인 > 관리자», 기본)', () => {
  const cases: [string, NodeVisibility | undefined, { 기본: boolean; 로그인: boolean; 관리자: boolean }][] = [
    ['없음', undefined, { 기본: true, 로그인: true, 관리자: true }],
    ['only [로그인]', { mode: 'only', states: ['s_login'] }, { 기본: false, 로그인: true, 관리자: true }],
    ['except [관리자]', { mode: 'except', states: ['s_admin'] }, { 기본: true, 로그인: true, 관리자: false }],
    ['only [default]', { mode: 'only', states: ['default'] }, { 기본: true, 로그인: false, 관리자: false }],
    ['except [로그인]', { mode: 'except', states: ['s_login'] }, { 기본: true, 로그인: false, 관리자: false }],
    ['only [관리자]', { mode: 'only', states: ['s_admin'] }, { 기본: false, 로그인: false, 관리자: true }],
    ['except [default]', { mode: 'except', states: ['default'] }, { 기본: false, 로그인: true, 관리자: true }],
  ]

  it.each(cases)('%s', (_, visibility, expected) => {
    const node = text('n_t', visibility)
    expect({
      기본: isVisibleIn(node, null, STATES),
      로그인: isVisibleIn(node, 's_login', STATES),
      관리자: isVisibleIn(node, 's_admin', STATES),
    }).toEqual(expected)
  })

  it('고른 상태가 목록 밖 · default 문자열이면 기본으로 판정한다', () => {
    const node = text('n_t', { mode: 'only', states: ['default'] })
    expect(isVisibleIn(node, 's_gone', STATES)).toBe(true)
    expect(isVisibleIn(node, 'default', STATES)).toBe(true)
    expect(isVisibleIn(text('n_u', { mode: 'only', states: ['s_gone'] }), 's_gone', STATES)).toBe(false)
  })

  it('검증 전 모양이 틀린 보임은 «없음»으로 읽는다 — 던지지 않는다', () => {
    expect(isVisibleIn(text('n_t', { mode: 'hide', states: ['s_login'] }), null, STATES)).toBe(true)
    expect(isVisibleIn(text('n_t', 'only'), null, STATES)).toBe(true)
    expect(isVisibleIn(text('n_t', { mode: 'only', states: 's_login' }), null, STATES)).toBe(true)
  })
})

describe('visibleTree — 숨은 노드를 자손째 뺀다', () => {
  const doc = page([
    text('n_a'),
    {
      id: 'n_box',
      type: 'Card',
      visibility: { mode: 'only', states: ['s_login'] },
      // 자식의 only 가 숨은 부모를 되살리지 않는다.
      children: [text('n_in', { mode: 'only', states: ['default'] }), text('n_in2')],
    },
    text('n_b', { mode: 'except', states: ['s_admin'] }),
  ])
  const ids = (node: WbNode): string[] => [node.id, ...(node.children ?? []).flatMap(ids)]

  it('상태마다 남는 노드', () => {
    expect(ids(visibleTree(doc, null))).toEqual(['n_root', 'n_a', 'n_b'])
    expect(ids(visibleTree(doc, 's_login'))).toEqual(['n_root', 'n_a', 'n_box', 'n_in2', 'n_b'])
    expect(ids(visibleTree(doc, 's_admin'))).toEqual(['n_root', 'n_a', 'n_box', 'n_in2'])
  })

  it('바뀌지 않은 하위 트리는 입력과 객체를 나눠 쓴다', () => {
    const tree = visibleTree(doc, 's_login')
    expect(tree.children![0]).toBe(doc.root.children![0])
    expect(tree.children![2]).toBe(doc.root.children![2])
    const plain = page([text('n_a'), text('n_b')])
    expect(visibleTree(plain, 's_login')).toBe(plain.root)
  })
})
