import { describe, expect, it } from 'vitest'
import type { WbNode } from '../src/node'
import { collectNodeIds, findNode, findNodePath, remapNodeIds, walkNodes } from '../src/tree'

function sample(): WbNode {
  return {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      { id: 'n_000000000002', type: 'SearchForm', children: [{ id: 'n_000000000003', type: 'Field', props: { label: '아이디' } }] },
      { id: 'n_000000000004', type: 'List', props: { items: 10 } },
    ],
  }
}

describe('walkNodes', () => {
  it('깊이 우선으로 모든 노드를 방문한다', () => {
    const visited = [...walkNodes(sample())].map((v) => v.node.id)
    expect(visited).toEqual(['n_000000000001', 'n_000000000002', 'n_000000000003', 'n_000000000004'])
  })

  it('각 방문에 JSON Pointer 경로를 함께 준다', () => {
    const paths = [...walkNodes(sample())].map((v) => v.path)
    expect(paths).toEqual(['/root', '/root/children/0', '/root/children/0/children/0', '/root/children/1'])
  })

  it('루트가 아닌 노드는 부모와 인덱스를 준다', () => {
    const visits = [...walkNodes(sample())]
    expect(visits[0]!.parent).toBeNull()
    expect(visits[0]!.index).toBe(-1)
    expect(visits[1]!.parent!.id).toBe('n_000000000001')
    expect(visits[1]!.index).toBe(0)
    expect(visits[3]!.index).toBe(1)
  })
})

describe('findNode / findNodePath', () => {
  it('id로 노드를 찾는다', () => {
    expect(findNode(sample(), 'n_000000000003')!.type).toBe('Field')
  })

  it('없는 id면 undefined를 준다', () => {
    expect(findNode(sample(), 'n_ffffffffffff')).toBeUndefined()
  })

  it('id로 경로를 찾는다', () => {
    expect(findNodePath(sample(), 'n_000000000004')).toBe('/root/children/1')
  })
})

describe('collectNodeIds', () => {
  it('트리의 모든 id를 순서대로 모은다', () => {
    expect(collectNodeIds(sample())).toEqual(['n_000000000001', 'n_000000000002', 'n_000000000003', 'n_000000000004'])
  })
})

describe('remapNodeIds', () => {
  it('모든 노드에 새 id를 발급한다', () => {
    let counter = 0
    const { root } = remapNodeIds(sample(), () => `n_new${String(counter++).padStart(9, '0')}`)
    expect(collectNodeIds(root)).toEqual(['n_new000000000', 'n_new000000001', 'n_new000000002', 'n_new000000003'])
  })

  it('옛 id에서 새 id로의 매핑을 함께 준다', () => {
    let counter = 0
    const { mapping } = remapNodeIds(sample(), () => `n_new${String(counter++).padStart(9, '0')}`)
    expect(mapping.get('n_000000000003')).toBe('n_new000000002')
  })

  it('id가 `__proto__`여도 프로토타입을 id로 쓰지 않는다', () => {
    const tree: WbNode = {
      id: '__proto__',
      type: 'Page',
      children: [{ id: 'constructor', type: 'Text' }],
    }
    let counter = 0
    const { root, mapping } = remapNodeIds(tree, () => `n_new${String(counter++).padStart(9, '0')}`)
    expect(root.id).toBe('n_new000000000')
    expect(root.children![0]!.id).toBe('n_new000000001')
    expect(mapping.get('__proto__')).toBe('n_new000000000')
    expect(typeof root.id).toBe('string')
  })

  it('원본 트리를 변경하지 않는다', () => {
    const original = sample()
    remapNodeIds(original, () => 'n_aaaaaaaaaaaa')
    expect(original.id).toBe('n_000000000001')
  })

  it('상호작용 target도 새 id로 바꾼다', () => {
    const tree: WbNode = {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Button',
          interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_000000000003', value: false }] }],
        },
        { id: 'n_000000000003', type: 'List' },
      ],
    }
    let counter = 0
    const { root } = remapNodeIds(tree, () => `n_new${String(counter++).padStart(9, '0')}`)
    const button = root.children![0]!
    const action = button.interactions![0]!.actions[0]!
    expect(action.type === 'setVisible' && action.target).toBe('n_new000000002')
  })

  /**
   * **이 함수의 계약이 어디까지인가.** `expandPattern`과 같은 부류(참조 공유)가 여기에도
   * 선다. 이 함수는 설계서 「페이지 JSON」의 가져오기와 프리셋 적용이 쓰므로
   * **입력이 오래 사는 객체(모듈 상수·초안 스토어)일 수 있고**, 그때 결과 문서를 고치면
   * 원본이 함께 바뀐다.
   *
   * **계약은 "`WbNode`가 선언한 키에 대해 값을 공유하지 않는다"이다.** 선언되지 않은 키는
   * 참조로 남고, 그것은 봉투(`WbNodeSchema`가 strictObject다)가 저장 경계에서 거부한다.
   */
  it('돌려받은 트리가 입력과 props를 공유하지 않는다', () => {
    const tree: WbNode = {
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'List', props: { columns: ['하나'] } }],
    }

    const { root } = remapNodeIds(tree, () => 'n_aaaaaaaaaaaa')
    ;(tree.children![0]!.props!['columns'] as string[]).push('둘')

    expect(root.children![0]!.props!['columns']).toEqual(['하나'])
  })

  it('상호작용 액션의 value도 공유하지 않는다', () => {
    const tree: WbNode = {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Button',
          interactions: [
            {
              on: 'click',
              actions: [{ type: 'setProp', target: 'n_000000000002', prop: 'columns', value: { list: ['하나'] } }],
            },
          ],
        },
      ],
    }

    const { root } = remapNodeIds(tree, () => 'n_aaaaaaaaaaaa')
    const source = tree.children![0]!.interactions![0]!.actions[0]!
    ;(source as { value: { list: string[] } }).value.list.push('둘')

    const copied = root.children![0]!.interactions![0]!.actions[0]!
    expect((copied as { value: { list: string[] } }).value.list).toEqual(['하나'])
  })

  it('트리 밖을 가리키는 target은 그대로 둔다', () => {
    const tree: WbNode = {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'Button',
          interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] }],
        },
      ],
    }
    const { root } = remapNodeIds(tree, () => 'n_aaaaaaaaaaaa')
    const action = root.children![0]!.interactions![0]!.actions[0]!
    expect(action.type === 'navigate' && action.target).toBe('page:관리자/회원/상세')
  })
})
