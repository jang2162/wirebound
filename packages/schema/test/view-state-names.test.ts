/**
 * 화면 상태의 읽기 — 노드가 속한 상태(`nodeViewState`) · 상태를 붙인 이름(`nodeDisplayName` · 상호작용 문장) · 그 상태에서 보이는
 * 트리(`visibleTree`) · 붙여넣기의 가지 빼기(`prepareNodesForPaste` — 계획 Review Focus 5). 설계 spec 「상호작용 · 별칭」 · 「페이지 JSON ·
 * 프리셋 · 붙여넣기」.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNodesForPaste, readNodesEnvelope, writeNodesEnvelope } from '../src/clipboard'
import { installCatalog } from '../src/component/catalog/index'
import { describeNode, listInteractionSentences, nodeDisplayName } from '../src/interaction/describe'
import type { PageDocument, WbNode } from '../src/node'
import { collectNodeIds, findNode } from '../src/tree'
import { partitionIssues, validatePage } from '../src/validate'
import { nodeViewState, viewStateIndex, visibleTree } from '../src/view-state'
import { pageView } from '../src/page-view'

beforeAll(() => {
  installCatalog()
})

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }
const caseOf = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })
const button = (id: string, label: string, extra: Partial<WbNode> = {}): WbNode => ({ id, type: 'Button', props: { label }, ...extra })

/**
 * ```
 * n_root
 *   n_out(버튼 '목록' — 누르면 n_ok 숨김)
 *   n_sw ─ n_c0(default) ─ n_view(버튼 '보기')
 *        │                 n_in ─ n_i0(default) ─ n_deep(버튼 '깊이')
 *        │                      └ n_i1(s_guest) ─ n_deep2
 *        └ n_c1(s_admin) ─ n_ok(버튼 '승인') · n_in2 ─ n_j0(default) ─ n_admin_deep(버튼 '관리 깊이')
 *        └ n_c2(s_gone)  ─ n_lost
 * ```
 */
function fixture(): PageDocument {
  return {
    version: 1,
    viewStates: [ADMIN, GUEST],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        button('n_out', '목록', { interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_ok', value: false }] }] }),
        {
          id: 'n_sw',
          type: 'StateSwitch',
          children: [
            caseOf('n_c0', 'default', [
              button('n_view', '보기'),
              { id: 'n_in', type: 'StateSwitch', children: [caseOf('n_i0', 'default', [button('n_deep', '깊이')]), caseOf('n_i1', 's_guest', [button('n_deep2', '깊이 2')])] },
            ]),
            caseOf('n_c1', 's_admin', [
              button('n_ok', '승인', { interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_view', value: true }] }] }),
              { id: 'n_in2', type: 'StateSwitch', children: [caseOf('n_j0', 'default', [button('n_admin_deep', '관리 깊이')])] },
            ]),
            caseOf('n_c2', 's_gone', [button('n_lost', '잃음')]),
          ],
        },
      ],
    },
  }
}

describe('nodeViewState — 노드가 속한 상태', () => {
  it.each<[string, string | null]>([
    ['n_root', null],
    ['n_out', null],
    ['n_sw', null],
    ['n_c0', 'default'],
    ['n_view', 'default'],
    ['n_deep', 'default'],
    ['n_deep2', 's_guest'],
    ['n_c1', 's_admin'],
    ['n_ok', 's_admin'],
    // 관리자 가지 안 영역의 기본 가지 — 관리자 화면에만 있다.
    ['n_admin_deep', 's_admin'],
    ['n_lost', 's_gone'],
    ['n_nope', null],
  ])('%s → %s', (nodeId, expected) => {
    expect(nodeViewState(fixture(), nodeId)).toBe(expected)
  })

  it('검증 전 문서를 견딘다', () => {
    const odd = { root: { id: 'n_root', type: 'Page', children: [null, { id: 'n_c', type: 'StateCase', props: { state: 3 }, children: 'x' }] } }
    expect(() => viewStateIndex(odd.root as unknown as WbNode)).not.toThrow()
    expect(nodeViewState(odd as never, 'n_c')).toBeNull()
  })
})

describe('이름에 상태를 붙인다', () => {
  it('nodeDisplayName — 맥락이 있으면 «\'이름\'(상태 이름 상태)», 없으면 그대로', () => {
    const ok = findNode(fixture().root, 'n_ok')!
    expect(nodeDisplayName(ok)).toBe('승인 버튼')
    expect(nodeDisplayName(ok, { viewStateName: '관리자' })).toBe("'승인 버튼'(관리자 상태)")
    expect(nodeDisplayName({ ...ok, alias: '승인' }, { viewStateName: '관리자' })).toBe("'승인'(관리자 상태)")
    expect(describeNode({ ...ok, marker: 2 }, { viewStateName: '관리자' })).toBe("② '승인 버튼'(관리자 상태)")
  })

  it('상호작용 문장 — 가지 안 노드는 상태를 붙이고 영역 밖 노드는 안 붙인다', () => {
    const texts = listInteractionSentences(fixture()).map((sentence) => sentence.text)
    expect(texts).toEqual([
      "목록 버튼 클릭 시 '승인 버튼'(관리자 상태)가 숨겨집니다",
      "'승인 버튼'(관리자 상태) 클릭 시 '보기 버튼'(기본 상태)가 보입니다",
    ])
  })

  it('상태 영역이 없는 문서의 문장은 한 글자도 안 바뀐다', () => {
    const plain: PageDocument = {
      version: 1,
      root: { id: 'n_root', type: 'Page', children: [button('n_a', '저장', { interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_b', value: false }] }] }), button('n_b', '취소')] },
    }
    expect(listInteractionSentences(plain).map((sentence) => sentence.text)).toEqual(['저장 버튼 클릭 시 취소 버튼이 숨겨집니다'])
  })

  it('목록에 없는 상태의 가지 안 노드는 «목록에 없는 상태»를 붙인다', () => {
    const doc = fixture()
    findNode(doc.root, 'n_out')!.interactions = [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_lost', value: false }] }]
    expect(listInteractionSentences(doc)[0]!.text).toBe("목록 버튼 클릭 시 '잃음 버튼'(목록에 없는 상태 상태)가 숨겨집니다")
  })
})

describe('pageView — 읽기(CLI · 번들)의 이름도 상태를 붙인다(K1 리뷰 R4)', () => {
  const view = () =>
    pageView({
      id: 'p_1',
      title: '목록',
      description: null,
      target: 'page:목록',
      menuPath: [],
      document: fixture(),
      comments: [
        { nodeId: 'n_ok', body: '승인 문구', authorName: '보라', createdAt: '2026-10-05T00:00:00Z' },
        { nodeId: 'n_out', body: '영역 밖', authorName: '보라', createdAt: '2026-10-05T00:00:00Z' },
      ],
    })
  const row = (id: string) => view().nodes.find((node) => node.id === id)!

  it('목록에 있는 상태의 가지 줄은 그 상태 이름이다 — «목록에 없는 상태»가 아니다', () => {
    expect(row('n_c1').rowLabel).toContain('관리자')
    expect(row('n_c1').rowLabel).not.toContain('목록에 없는 상태')
    expect(row('n_c2').rowLabel).toContain('목록에 없는 상태')
  })

  it('가지 안 노드의 이름 · 코멘트의 노드 이름에 상태가 붙는다 — 영역 밖은 그대로', () => {
    expect(row('n_ok').name).toBe(describeNode(findNode(fixture().root, 'n_ok')!, { viewStateName: '관리자' }))
    expect(row('n_ok').name).toContain('(관리자 상태)')
    expect(row('n_out').name).toBe(describeNode(findNode(fixture().root, 'n_out')!))
    expect(view().comments.map((comment) => comment.nodeName)).toEqual([row('n_ok').name, row('n_out').name])
  })
})

describe('visibleTree — 그 상태에서 보이는 트리', () => {
  const shape = (node: WbNode): string => (node.children?.length ? `${node.id}(${node.children.map(shape).join(' ')})` : node.id)

  it.each<[string | null, string]>([
    [null, 'n_root(n_out n_sw(n_c0(n_view n_in(n_i0(n_deep)))))'],
    ['s_admin', 'n_root(n_out n_sw(n_c1(n_ok n_in2(n_j0(n_admin_deep)))))'],
    ['s_guest', 'n_root(n_out n_sw(n_c0(n_view n_in(n_i1(n_deep2)))))'],
    // 목록에 없는 상태는 기본이다 — 그 상태의 가지가 문서에 있어도.
    ['s_gone', 'n_root(n_out n_sw(n_c0(n_view n_in(n_i0(n_deep)))))'],
  ])('%s', (viewState, expected) => {
    expect(shape(visibleTree(fixture(), viewState))).toBe(expected)
  })

  it('입력을 바꾸지 않는다', () => {
    const doc = fixture()
    const before = structuredClone(doc)
    visibleTree(doc, 's_admin')
    expect(doc).toEqual(before)
  })
})

describe('붙여넣기 — 붙일 페이지에 없는 상태의 가지(Review Focus 5)', () => {
  const NONE = { node: () => false, page: () => false }
  let next = 0
  const generate = (): string => `n_p${(next += 1)}`

  /** 붙인 노드를 페이지 하나에 넣어 검증한다 — 붙인 뒤 오류가 없어야 한다. */
  function pasted(nodes: WbNode[], viewStates = [GUEST]): PageDocument {
    const doc: PageDocument = { version: 1, viewStates, root: { id: 'n_target', type: 'Page', children: nodes } }
    expect(partitionIssues(validatePage(doc)).errors).toEqual([])
    return doc
  }

  it('없는 상태의 가지를 빼고 상태마다 센다 · 있는 상태 · 기본 가지는 남긴다', () => {
    const sw = findNode(fixture().root, 'n_sw')!
    const result = prepareNodesForPaste([sw], { ...NONE, state: (id) => id === 's_guest' }, generate)
    expect(result.droppedCases).toEqual([
      { state: 's_admin', count: 1 },
      { state: 's_gone', count: 1 },
    ])
    const doc = pasted(result.nodes)
    const region = doc.root.children![0]!
    expect(region.children!.map((child) => child.props?.state)).toEqual(['default'])
    // 기본 가지 안의 영역은 붙일 페이지에 있는 상태(비로그인)의 가지를 지킨다.
    expect(region.children![0]!.children![1]!.children!.map((child) => child.props?.state)).toEqual(['default', 's_guest'])
  })

  it('뺀 가지 안 노드를 가리키던 동작은 밖을 가리키는 동작으로 빠진다', () => {
    const out = findNode(fixture().root, 'n_out')!
    const sw = findNode(fixture().root, 'n_sw')!
    const result = prepareNodesForPaste([out, sw], { ...NONE, state: () => false }, generate)
    expect(result.droppedActions).toBe(1)
    expect(result.nodes[0]).not.toHaveProperty('interactions')
    pasted(result.nodes)
  })

  it('같은 페이지(상태가 다 있음)면 아무것도 안 뺀다 — `state`를 안 주면 다 남긴다', () => {
    const sw = findNode(fixture().root, 'n_sw')!
    const result = prepareNodesForPaste([sw], NONE, generate)
    expect(result.droppedCases).toEqual([])
    expect(result.nodes[0]!.children).toHaveLength(3)
  })

  it('가지만 골라 붙이면 그 내용으로 푼다 — 가지는 영역 밖에 설 수 없다', () => {
    const admin = findNode(fixture().root, 'n_c1')!
    const result = prepareNodesForPaste([admin], { ...NONE, state: () => true }, generate)
    const doc = pasted(result.nodes)
    expect(doc.root.children!.map((child) => child.type)).toEqual(['Button', 'StateSwitch'])
  })

  it('기본 가지가 정확히 하나가 아닌 영역은 영역째 풀어 기본 가지(없으면 남은 첫 가지)의 내용을 둔다', () => {
    const noDefault: WbNode = { id: 'n_x', type: 'StateSwitch', children: [caseOf('n_x1', 's_guest', [button('n_y', '와이')]), caseOf('n_x2', 's_admin', [])] }
    const r1 = prepareNodesForPaste([noDefault], { ...NONE, state: (id) => id === 's_guest' }, generate)
    expect(r1.droppedCases).toEqual([{ state: 's_admin', count: 1 }])
    expect(pasted(r1.nodes).root.children!.map((child) => child.props?.label)).toEqual(['와이'])

    const twoDefaults: WbNode = { id: 'n_z', type: 'StateSwitch', children: [caseOf('n_z1', 'default', [button('n_z2', '첫')]), caseOf('n_z3', 'default', [button('n_z4', '둘')])] }
    expect(pasted(prepareNodesForPaste([twoDefaults], NONE, generate).nodes).root.children!.map((child) => child.props?.label)).toEqual(['첫'])

    const empty: WbNode = { id: 'n_e', type: 'StateSwitch', children: [caseOf('n_e1', 's_admin', [])] }
    expect(prepareNodesForPaste([empty], { ...NONE, state: () => false }, generate).nodes).toEqual([])
  })

  it('봉투를 거쳐 다른 페이지에 붙여도 검증 오류가 없다 — id 는 새로 짓는다', () => {
    const doc = fixture()
    const text = writeNodesEnvelope([findNode(doc.root, 'n_out')!, findNode(doc.root, 'n_sw')!], doc.version)
    const read = readNodesEnvelope(text)!
    const result = prepareNodesForPaste(read.nodes, { ...NONE, state: () => false }, generate)
    const target = pasted(result.nodes, [])
    expect(collectNodeIds(target.root).filter((id) => collectNodeIds(doc.root).includes(id))).toEqual([])
    expect(result.droppedCases.reduce((sum, entry) => sum + entry.count, 0)).toBe(3)
  })
})
