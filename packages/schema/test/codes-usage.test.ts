import { beforeAll, describe, expect, it } from 'vitest'
import { codeUsage, codeUsageCounts, indexCodes, installCatalog, resetRegistry, type UsageSource, type WbNode } from '../src/index'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const affix = (id: string, item: string): WbNode => ({ id, type: 'Affix', props: { text: 'x' }, code: { group: 'ORDER_STATUS', item } })

const sources: UsageSource[] = [
  {
    kind: 'page',
    id: 'p1',
    title: '주문 목록',
    nodes: [
      {
        id: 'n_root',
        type: 'Page',
        children: [
          affix('n_a', 'WAIT'),
          // 숨은 노드도 센다.
          { ...affix('n_hidden', 'WAIT'), visibility: { mode: 'only', states: ['s_admin'] } },
          { id: 'n_sel', type: 'Select', code: { group: 'ORDER_STATUS', selected: ['WAIT'] } },
          { id: 'n_sel2', type: 'Select', code: { group: 'ORDER_STATUS' } },
        ],
      },
    ],
  },
  {
    kind: 'page',
    id: 'p2',
    title: '주문 상세',
    nodes: [
      {
        id: 'n_root2',
        type: 'Page',
        children: [{ id: 'n_card', type: 'Card', zones: { headEnd: [affix('n_inzone', 'DONE')] } }],
      },
    ],
  },
  { kind: 'page', id: 'l1', title: '셋째 쪽', nodes: [{ id: 'n_lroot', type: 'Page', children: [affix('n_l', 'WAIT')] }] },
  {
    kind: 'module',
    id: 'm1',
    title: '상태 칩',
    nodes: [affix('n_m', 'WAIT'), { id: 'n_other', type: 'Text', props: { content: '무관' } }],
  },
  { kind: 'page', id: 'p3', title: '무관', nodes: [{ id: 'n_root3', type: 'Page', children: [] }] },
]

describe('codeUsage', () => {
  it('그룹 — 페이지 셋 · 모듈 · 구역 · 숨은 노드까지', () => {
    const hits = codeUsage(sources, 'ORDER_STATUS')
    expect(hits.map((hit) => [hit.kind, hit.id, hit.nodes.map((n) => n.nodeId)])).toEqual([
      ['page', 'p1', ['n_a', 'n_hidden', 'n_sel', 'n_sel2']],
      ['page', 'p2', ['n_inzone']],
      ['page', 'l1', ['n_l']],
      ['module', 'm1', ['n_m']],
    ])
  })

  it('항목 — 대표 글의 item 과 선택 위젯의 selected', () => {
    const hits = codeUsage(sources, 'ORDER_STATUS', 'WAIT')
    expect(hits.find((hit) => hit.id === 'p1')?.nodes.map((n) => n.nodeId)).toEqual(['n_a', 'n_hidden', 'n_sel'])
    expect(hits.map((hit) => hit.id)).toEqual(['p1', 'l1', 'm1'])
    expect(codeUsage(sources, 'ORDER_STATUS', 'DONE').map((hit) => hit.id)).toEqual(['p2'])
  })

  it('노드 이름을 싣는다', () => {
    const hit = codeUsage(sources, 'ORDER_STATUS', 'DONE')[0]!
    expect(hit.nodes[0]!.name).toContain('사이 글자')
  })

  it('노드마다 타입과 조상 이름(trail)을 싣는다 — 페이지 뿌리는 빼고 뿌리 쪽부터 · 구역 안도 그 부모가 조상이다', () => {
    const at = (group: string, item?: string) =>
      codeUsage(sources, group, item).flatMap((hit) => hit.nodes.map((node) => [node.nodeId, node.type, node.trail]))
    expect(at('ORDER_STATUS', 'WAIT')).toEqual([
      ['n_a', 'Affix', []],
      ['n_hidden', 'Affix', []],
      ['n_sel', 'Select', []],
      ['n_l', 'Affix', []],
      // 모듈의 뿌리는 `Page` 가 아니다 — 그 자신이 내용이라 그 아래 노드의 조상으로 선다(여기는 뿌리 자신이라 조상이 없다).
      ['n_m', 'Affix', []],
    ])
    expect(at('ORDER_STATUS', 'DONE')).toEqual([['n_inzone', 'Affix', ['카드']]])
  })

  /** 같은 이름의 노드 둘이 부모로 갈린다 — 공통코드 화면 «쓰는 곳» 이 이 `trail` 로 줄을 가른다. */
  it('같은 표시 이름의 둘은 trail 로 갈린다', () => {
    const select = (id: string): WbNode => ({ id, type: 'Select', code: { group: 'SUBJECT' } })
    const field = (id: string, label: string, child: WbNode): WbNode => ({ id, type: 'Field', props: { label }, children: [child] })
    const page: UsageSource = {
      kind: 'page',
      id: 'p',
      title: '과목관리',
      nodes: [
        {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_form', type: 'SearchForm', children: [field('n_f1', '과목분류', select('n_s1'))] },
            field('n_f2', '교수법', select('n_s2')),
          ],
        },
      ],
    }
    const nodes = codeUsage([page], 'SUBJECT')[0]!.nodes
    expect(nodes.map((node) => node.name)).toEqual([nodes[0]!.name, nodes[0]!.name])
    expect(nodes.map((node) => node.trail.join(' › '))).toEqual([`${nodes[0]!.trail[0]} › ${nodes[0]!.trail[1]}`, nodes[1]!.trail[0]])
    expect(nodes[0]!.trail).toHaveLength(2)
    expect(nodes[0]!.trail[1]).toContain('과목분류')
    expect(nodes[1]!.trail).toHaveLength(1)
    expect(nodes[1]!.trail[0]).toContain('교수법')
  })

  it('없는 그룹은 빈 목록', () => {
    expect(codeUsage(sources, 'NOPE')).toEqual([])
  })
})

describe('codeUsage — 노드 이름', () => {
  // prop 의 대체 글(«옛 …»)과 표의 이름(«새 대기»)을 다르게 둔다 — 같으면 표를 받는 판과 안 받는 판이 같은 글이다.
  const named: UsageSource[] = [
    {
      kind: 'page',
      id: 'p1',
      title: '주문',
      nodes: [
        {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_btn', type: 'Button', props: { label: '옛 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } },
            { id: 'n_affix', type: 'Affix', props: { text: '옛 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } },
            { id: 'n_gone', type: 'Affix', props: { text: '옛 끊김' }, code: { group: 'ORDER_STATUS', item: 'NOPE' } },
          ],
        },
      ],
    },
  ]
  const CODES = indexCodes([{ key: 'ORDER_STATUS', name: '주문 상태', items: [{ value: 'WAIT', name: '새 대기', active: true }] }])
  const names = (hits: ReturnType<typeof codeUsage>) => hits.flatMap((hit) => hit.nodes.map((node) => [node.nodeId, node.name]))

  it('표를 받으면 표의 이름으로 부른다', () => {
    expect(names(codeUsage(named, 'ORDER_STATUS', 'WAIT', CODES))).toEqual([
      ['n_btn', '새 대기 버튼'],
      ['n_affix', '새 대기 사이 글자'],
    ])
  })

  it('끊긴 참조의 노드는 대체 글이다', () => {
    expect(names(codeUsage(named, 'ORDER_STATUS', 'NOPE', CODES))).toEqual([['n_gone', '옛 끊김 사이 글자']])
  })

  it('표를 안 받으면 대체 글이다', () => {
    expect(names(codeUsage(named, 'ORDER_STATUS', 'WAIT'))).toEqual([
      ['n_btn', '옛 대기 버튼'],
      ['n_affix', '옛 대기 사이 글자'],
    ])
  })
})

describe('codeUsageCounts', () => {
  it('그룹 · 항목마다 센다', () => {
    const count = codeUsageCounts(sources).get('ORDER_STATUS')!
    expect(count.group).toBe(7)
    expect(Object.fromEntries(count.items)).toEqual({ WAIT: 5, DONE: 1 })
  })
})
