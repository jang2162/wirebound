import { beforeAll, describe, expect, it } from 'vitest'
import { codeUsage, codeUsageCounts, installCatalog, resetRegistry, type UsageSource, type WbNode } from '../src/index'

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
  { kind: 'layout', id: 'l1', title: '기본 틀', nodes: [{ id: 'n_lroot', type: 'Page', children: [affix('n_l', 'WAIT')] }] },
  {
    kind: 'module',
    id: 'm1',
    title: '상태 칩',
    nodes: [affix('n_m', 'WAIT'), { id: 'n_other', type: 'Text', props: { content: '무관' } }],
  },
  { kind: 'page', id: 'p3', title: '무관', nodes: [{ id: 'n_root3', type: 'Page', children: [] }] },
]

describe('codeUsage', () => {
  it('그룹 — 페이지 둘 · 레이아웃 · 모듈 · 구역 · 숨은 노드까지', () => {
    const hits = codeUsage(sources, 'ORDER_STATUS')
    expect(hits.map((hit) => [hit.kind, hit.id, hit.nodes.map((n) => n.nodeId)])).toEqual([
      ['page', 'p1', ['n_a', 'n_hidden', 'n_sel', 'n_sel2']],
      ['page', 'p2', ['n_inzone']],
      ['layout', 'l1', ['n_l']],
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

  it('없는 그룹은 빈 목록', () => {
    expect(codeUsage(sources, 'NOPE')).toEqual([])
  })
})

describe('codeUsageCounts', () => {
  it('그룹 · 항목마다 센다', () => {
    const count = codeUsageCounts(sources).get('ORDER_STATUS')!
    expect(count.group).toBe(7)
    expect(Object.fromEntries(count.items)).toEqual({ WAIT: 5, DONE: 1 })
  })
})
