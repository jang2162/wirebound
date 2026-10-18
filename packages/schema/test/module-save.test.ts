/**
 * `module/save.ts` — 모듈에 담을 노드(`moduleNodesForSave`)와 노드 수(`countModuleNodes`).
 *
 * 서버(`apps/api` 의 `routes/modules.ts`)와 화면(«모듈로 저장…» 상자)이 이 함수 하나를 쓴다 — 서버 판은 `apps/api/test/modules.test.ts` 가
 * 잰다. 여기서 재는 것은 거름의 표와 «입력을 바꾸지 않는다»다.
 */
import { describe, expect, it } from 'vitest'
import { countModuleNodes, moduleNodesForSave } from '../src/module/save'
import type { WbNode } from '../src/node'

const opener = (targets: string[]): WbNode => ({
  id: 'm_open',
  type: 'Button',
  props: { label: '열기' },
  interactions: [{ on: 'click', actions: targets.map((target) => ({ type: 'setVisible' as const, target, value: true })) }],
})

describe('moduleNodesForSave', () => {
  it('marker 를 트리 어디서든 걷는다', () => {
    const { nodes } = moduleNodesForSave([{ id: 'a', type: 'Card', marker: 1, children: [{ id: 'b', type: 'Text', marker: 2 }] }])
    expect(nodes).toEqual([{ id: 'a', type: 'Card', children: [{ id: 'b', type: 'Text' }] }])
  })

  it('묶음 밖 노드를 겨냥하는 액션만 빼고 센다 — 안 · 자손 · 페이지 · 빈 대상은 남는다', () => {
    const { nodes, droppedActions } = moduleNodesForSave([
      opener(['m_panel', 'm_deep', 'n_out1', '', 'n_out2']),
      {
        id: 'm_go',
        type: 'Button',
        interactions: [
          { on: 'click', actions: [{ type: 'navigate', target: 'page-x' }] },
          { on: 'change', actions: [{ type: 'openModal', target: 'page-y' }] },
        ],
      },
      { id: 'm_panel', type: 'Card', children: [{ id: 'm_deep', type: 'Text' }] },
    ])
    expect(droppedActions).toBe(2)
    expect(nodes[0]!.interactions![0]!.actions.map((action) => action.target)).toEqual(['m_panel', 'm_deep', ''])
    expect(nodes[1]!.interactions).toHaveLength(2)
  })

  it('액션이 다 빠진 상호작용은 상호작용째 · 상호작용이 다 빠진 노드는 interactions 키째 빠진다', () => {
    const { nodes, droppedActions } = moduleNodesForSave([
      {
        id: 'm_two',
        type: 'Button',
        interactions: [
          { on: 'click', actions: [{ type: 'setVisible', target: 'n_out', value: true }] },
          { on: 'change', actions: [{ type: 'setVisible', target: 'm_two', value: false }] },
        ],
      },
      { ...opener(['n_out']), id: 'm_lone' },
    ])
    expect(droppedActions).toBe(2)
    expect(nodes[0]!.interactions).toEqual([{ on: 'change', actions: [{ type: 'setVisible', target: 'm_two', value: false }] }])
    expect('interactions' in nodes[1]!).toBe(false)
  })

  it('처음부터 빈 interactions 는 그대로 둔다(뺀 것이 없다)', () => {
    const { nodes, droppedActions } = moduleNodesForSave([{ id: 'm_a', type: 'Button', interactions: [] }])
    expect({ nodes, droppedActions }).toEqual({ nodes: [{ id: 'm_a', type: 'Button', interactions: [] }], droppedActions: 0 })
  })

  it('id 를 바꾸지 않고 입력을 바꾸지 않는다 · 값을 공유하지 않는다', () => {
    const input: WbNode[] = [{ ...opener(['n_out', 'm_open']), marker: 4, props: { label: '열기', nested: { a: 1 } } }]
    const before = structuredClone(input)
    const { nodes } = moduleNodesForSave(input)

    expect(input).toEqual(before)
    expect(nodes[0]!.id).toBe('m_open')
    ;(nodes[0]!.props!['nested'] as { a: number }).a = 2
    expect((input[0]!.props!['nested'] as { a: number }).a).toBe(1)
  })
})

describe('countModuleNodes', () => {
  it('자손까지 센다', () => {
    expect(
      countModuleNodes([
        {
          id: 'a',
          type: 'Card',
          children: [
            { id: 'b', type: 'Text' },
            { id: 'c', type: 'Text' },
          ],
        },
        { id: 'd', type: 'Text' },
      ]),
    ).toBe(4)
    expect(countModuleNodes([])).toBe(0)
  })
})
