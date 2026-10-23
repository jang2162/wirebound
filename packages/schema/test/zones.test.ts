/**
 * **노드 구역** — 자식 줄 읽기(`childLists`)의 차례 · 검증 전 문서 · 봉투의 꼴 · 검증 코드 셋 · 순회 · 복사 · 상태 보임 · 읽는 값(`pageView`)이 구역을
 * 몸통과 같은 자리로 다루는가(설계 spec `2026-10-23-node-slots-design.md` 「1. 저장 꼴」 · 「6. 그 밖의 소비자」).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { WbNodeSchema } from '../src/envelope'
import type { PageDocument, WbNode } from '../src/node'
import { pageView } from '../src/page-view'
import { remapNodeIds, stripMarkers, walkNodes } from '../src/tree'
import { validatePage } from '../src/validate'
import { visibleTree } from '../src/visibility'
import { childLists, mapChildLists } from '../src/zones'
import { moduleNodesForSave } from '../src/module/save'
import { inspectNodesEnvelope, writeNodesEnvelope } from '../src/clipboard'
import { listInteractionSentences } from '../src/interaction/describe'

beforeAll(() => {
  installCatalog()
})

/** 열쇠 차례를 선언과 거꾸로 적은 카드 — `jsonb` 가 열쇠 차례를 안 지키는 판. */
function card(): WbNode {
  return {
    id: 'n_card',
    type: 'Card',
    props: { title: '회원 정보' },
    zones: {
      footer: [{ id: 'n_list', type: 'Button', props: { label: '목록' } }],
      headEnd: [{ id: 'n_edit', type: 'Button', props: { label: '수정' } }],
      titleSide: [{ id: 'n_badge', type: 'Text', props: { content: '필수' } }],
    },
    children: [{ id: 'n_kv', type: 'KeyValue' }],
  }
}

function page(...children: WbNode[]): PageDocument {
  return { version: 3, root: { id: 'n_root', type: 'Page', children } }
}

describe('childLists — 차례는 카탈로그의 구역 선언 차례', () => {
  it('카드 — 제목 옆 → 머리 오른쪽 → 몸통 → 바닥 · 열쇠 차례와 무관', () => {
    expect(childLists(card()).map((entry) => [entry.zone, entry.pointer, entry.list.map((node) => (node as WbNode).id)])).toEqual([
      ['titleSide', '/zones/titleSide', ['n_badge']],
      ['headEnd', '/zones/headEnd', ['n_edit']],
      ['body', '/children', ['n_kv']],
      ['footer', '/zones/footer', ['n_list']],
    ])
  })

  it('선언된 구역은 비어도 든다 · 선언 밖 줄은 배열일 때만 선언 뒤에 몸통 → 이름 차례로', () => {
    const odd = { id: 'n_x', type: 'Card', zones: { zeta: [{ id: 'n_z' }], alpha: [{ id: 'n_a' }], bad: 3 } } as unknown as WbNode
    expect(childLists(odd).map((entry) => [entry.zone, entry.list.length])).toEqual([
      ['titleSide', 0],
      ['headEnd', 0],
      ['body', 0],
      ['footer', 0],
      ['alpha', 1],
      ['zeta', 1],
    ])
    // 몸통이 없는 타입의 `children` 도 숨기지 않는다(검증은 `children-not-allowed` 로 막는다 — 숨기면 그 안 노드가 잠금을 지난다).
    const list = { id: 'n_l', type: 'List', children: [{ id: 'n_c' }], zones: { body: [{ id: 'n_b' }] } } as unknown as WbNode
    expect(childLists(list).map((entry) => [entry.zone, entry.pointer])).toEqual([
      ['headStart', '/zones/headStart'],
      ['headEnd', '/zones/headEnd'],
      ['body', '/children'],
      ['body', '/zones/body'],
    ])
  })

  it('카탈로그 밖 타입 — 몸통 → 이름의 코드 단위 차례 · 검증 전 값에서 던지지 않는다', () => {
    const unknown = { type: 'Bogus', zones: { b: [], a: [] }, children: [] } as unknown as WbNode
    expect(childLists(unknown).map((entry) => entry.zone)).toEqual(['body', 'a', 'b'])
    for (const value of [null, 3, 'x', [], { zones: null }, { children: 'no' }]) expect(() => childLists(value)).not.toThrow()
  })
})

describe('봉투 — zones 의 꼴', () => {
  const parse = (zones: unknown) => WbNodeSchema.safeParse({ id: 'n_card', type: 'Card', zones }).success

  it('이름 꼴의 열쇠와 노드 배열을 받는다 · 빈 배열 · 빈 맵도 받는다', () => {
    expect(parse({ headEnd: [{ id: 'n_e', type: 'Button' }], footer: [] })).toBe(true)
    expect(parse({})).toBe(true)
  })

  it('body · 꼴 밖 이름 · 배열이 아닌 값 · 노드가 아닌 원소를 거절한다', () => {
    expect(parse({ body: [] })).toBe(false)
    for (const name of ['Head', '1x', 'head-end', '__proto__', 'a'.repeat(33), '']) expect(parse({ [name]: [] }), name).toBe(false)
    expect(parse({ footer: {} })).toBe(false)
    expect(parse({ footer: [{ id: 'bad id', type: 'Button' }] })).toBe(false)
  })

  it('JSON 의 `__proto__` 열쇠도 거절한다 — z.record 는 그 열쇠를 버리기만 해 원문에 남는다', () => {
    const raw = JSON.parse('{"id":"n_card","type":"Card","zones":{"__proto__":[{"id":"n_hidden","type":"Button"}]}}')
    expect(Object.keys(raw.zones)).toEqual(['__proto__'])
    expect(WbNodeSchema.safeParse(raw).success).toBe(false)
  })
})

describe('검증 — 구역 코드 셋', () => {
  const codes = (doc: PageDocument) => validatePage(doc).map((issue) => [issue.code, issue.path, issue.nodeId])

  it('멀쩡한 카드 · 폼 · 목록 · 탭은 이슈가 없다', () => {
    const tabs: WbNode = {
      id: 'n_tabs',
      type: 'Tabs',
      children: [{ id: 'n_p', type: 'TabPanel', children: [{ id: 'n_t', type: 'Text' }] }],
    }
    const form: WbNode = {
      id: 'n_f',
      type: 'SearchForm',
      children: [{ id: 'n_fd', type: 'Field' }],
      zones: { actions: [{ id: 'n_b', type: 'Button' }] },
    }
    const list: WbNode = { id: 'n_li', type: 'List', zones: { headEnd: [{ id: 'n_x', type: 'Button' }] } }
    expect(codes(page(card(), tabs, form, list))).toEqual([])
  })

  it('zone-not-allowed — 선언 밖 구역 · 구역이 없는 타입의 zones', () => {
    expect(codes(page({ id: 'n_c', type: 'Card', zones: { actions: [] } }))).toEqual([
      ['zone-not-allowed', '/root/children/0/zones/actions', 'n_c'],
    ])
    expect(codes(page({ id: 'n_b', type: 'Button', zones: { footer: [] } }))).toEqual([
      ['zone-not-allowed', '/root/children/0/zones/footer', 'n_b'],
    ])
  })

  it('children-not-allowed — 몸통이 없는 타입(목록)의 children', () => {
    expect(codes(page({ id: 'n_l', type: 'List', children: [{ id: 'n_t', type: 'Text' }] }))).toEqual([
      ['children-not-allowed', '/root/children/0/children', 'n_l'],
    ])
  })

  it('zone-type-not-allowed — 탭 몸통에 탭 패널 밖 · 경로는 그 자식', () => {
    const issues = validatePage(page({ id: 'n_tabs', type: 'Tabs', children: [{ id: 'n_b', type: 'Button' }] }))
    expect(issues.map((issue) => [issue.code, issue.path, issue.nodeId])).toContainEqual([
      'zone-type-not-allowed',
      '/root/children/0/children/0',
      'n_b',
    ])
    expect(issues.find((issue) => issue.code === 'zone-type-not-allowed')?.message).toBe('탭에는 탭 패널만 넣을 수 있습니다 (현재: 버튼)')
  })

  it('misplaced-component — 탭 패널이 탭 몸통 밖(페이지 · 배치 · 카드의 구역)', () => {
    for (const parent of [
      page({ id: 'n_p', type: 'TabPanel' }),
      page({ id: 'n_fx', type: 'Flex', children: [{ id: 'n_p', type: 'TabPanel' }] }),
      page({ id: 'n_c', type: 'Card', zones: { footer: [{ id: 'n_p', type: 'TabPanel' }] } }),
    ]) {
      const issue = validatePage(parent).find((one) => one.code === 'misplaced-component')
      expect(issue?.nodeId).toBe('n_p')
      expect(issue?.message).toBe('탭 패널은 탭 안에만 놓을 수 있습니다')
    }
  })

  it('구역 안 노드도 검증한다 — 없는 타입 · 겹친 id · 틀린 props', () => {
    const bad: WbNode = {
      id: 'n_c',
      type: 'Card',
      zones: { headEnd: [{ id: 'n_kv', type: 'Nope' }], footer: [{ id: 'n_x', type: 'Button', props: { label: 3 } }] },
      children: [{ id: 'n_kv', type: 'KeyValue' }],
    }
    expect(
      validatePage(page(bad))
        .map((issue) => issue.code)
        .sort(),
    ).toEqual(['duplicate-id', 'invalid-props', 'unknown-type'])
  })
})

describe('순회 · 복사 · 보임', () => {
  it('walkNodes 가 구역을 선언 차례로 돌고 경로 · 구역 · 차례를 싣는다', () => {
    expect([...walkNodes(card(), '/root/children/0')].map((visit) => [visit.node.id, visit.path, visit.zone, visit.index])).toEqual([
      ['n_card', '/root/children/0', null, -1],
      ['n_badge', '/root/children/0/zones/titleSide/0', 'titleSide', 0],
      ['n_edit', '/root/children/0/zones/headEnd/0', 'headEnd', 0],
      ['n_kv', '/root/children/0/children/0', 'body', 0],
      ['n_list', '/root/children/0/zones/footer/0', 'footer', 0],
    ])
  })

  it('remapNodeIds — 구역 안 노드의 id 와 그것을 가리키는 대상을 함께 바꾸고 입력과 배열을 나누지 않는다', () => {
    const source = card()
    source.zones!.headEnd![0]!.interactions = [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list', value: false }] }]
    let n = 0
    const { root } = remapNodeIds(source, () => `m_${n++}`)
    const edit = root.zones!.headEnd![0]!
    expect(edit.id).not.toBe('n_edit')
    expect(edit.interactions![0]!.actions[0]).toEqual({ type: 'setVisible', target: root.zones!.footer![0]!.id, value: false })
    expect(root.zones).not.toBe(source.zones)
    expect(root.zones!.footer).not.toBe(source.zones!.footer)
  })

  it('stripMarkers — 구역 안의 번호를 버리고 깊이 복사한다', () => {
    const source = card()
    source.zones!.footer![0]!.marker = 3
    const [copy] = stripMarkers([source])
    expect(copy!.zones!.footer![0]).toEqual({ id: 'n_list', type: 'Button', props: { label: '목록' } })
    copy!.zones!.footer![0]!.props!.label = '바뀜'
    expect(source.zones!.footer![0]!.props!.label).toBe('목록')
  })

  it('visibleTree — 구역 안의 숨은 노드를 뺀다 · 안 바뀐 하위 트리는 같은 객체다', () => {
    const source = card()
    source.zones!.headEnd![0]!.visibility = { mode: 'only', states: ['s_admin'] }
    const doc = { root: { id: 'n_root', type: 'Page', children: [source] }, viewStates: [{ id: 's_admin', name: '관리자' }] }
    const shown = visibleTree(doc, null)
    expect(shown.children![0]!.zones!.headEnd).toEqual([])
    expect(shown.children![0]!.zones!.footer![0]).toBe(source.zones!.footer![0])
    expect(visibleTree(doc, 's_admin').children![0]).toBe(source)
    expect(mapChildLists(source, (child) => child)).toBe(source)
  })

  it('모듈 저장 — 구역 안 노드의 묶음 밖 대상도 거른다', () => {
    const source = card()
    source.zones!.footer![0]!.interactions = [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_outside', value: true }] }]
    const { nodes, droppedActions } = moduleNodesForSave([source])
    expect(droppedActions).toBe(1)
    expect(nodes[0]!.zones!.footer![0]!.interactions).toBeUndefined()
  })

  it('클립보드 — 맨 위 탭 패널은 감싼 뿌리 밑이어도 읽는다(설 자리는 붙인 뒤 문서가 본다) · 그 안의 판정은 그대로', () => {
    const panel: WbNode = { id: 'n_p', type: 'TabPanel', props: { label: '상세' } }
    expect(inspectNodesEnvelope(writeNodesEnvelope([panel], 3))).toEqual({ kind: 'ok', nodes: [panel] })
    const nested: WbNode = { id: 'n_f', type: 'Flex', children: [panel] }
    expect(inspectNodesEnvelope(writeNodesEnvelope([nested], 3))).toEqual({
      kind: 'rejected',
      reason: '탭 패널은 탭 안에만 놓을 수 있습니다',
    })
  })
})

describe('읽는 값 — pageView · 문장', () => {
  it('구역 노드의 깊이는 노드 마디로 세고 구역 이름을 싣는다 · 몸통은 안 싣는다', () => {
    const view = pageView({
      id: 'p',
      title: 't',
      description: '',
      target: 'page:x',
      menuPath: [],
      document: page(card()),
      comments: [],
    } as never)
    expect(view.nodes.map((node) => [node.id, node.depth, node.zone ?? null])).toEqual([
      ['n_root', 0, null],
      ['n_card', 1, null],
      ['n_badge', 2, 'titleSide'],
      ['n_edit', 2, 'headEnd'],
      ['n_kv', 2, null],
      ['n_list', 2, 'footer'],
    ])
  })

  it('구역 안 노드의 상호작용도 문장이 된다 — 차례는 순회 차례', () => {
    const source = card()
    source.zones!.footer![0]!.interactions = [{ on: 'click', actions: [{ type: 'navigate', target: 'page:목록' }] }]
    source.zones!.titleSide![0]!.interactions = [{ on: 'click', actions: [{ type: 'navigate', target: 'page:안내' }] }]
    expect(listInteractionSentences(page(source)).map((line) => line.nodeId)).toEqual(['n_badge', 'n_list'])
  })
})
