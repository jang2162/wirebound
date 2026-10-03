/**
 * 클립보드 봉투(설계서 「설계서 화면 구조」의 클립보드 — 노드를 `text/plain` 한 벌로 주고받는다).
 *
 * **봉투가 아닌 글은 `null` 이다** — 다른 앱의 글을 붙인 것은 실수가 아니라 아무 일도 안 일어나야 한다.
 * 붙일 노드 짓기는 id 를 **한 번에** 새로 짓고(형제를 가리키는 대상이 따라간다), 붙이는 노드 밖을 가리키는 동작은
 * 붙이는 문서에 그 대상이 있을 때만 남긴다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_OPS_PER_EDIT,
  NODES_ENVELOPE_KIND,
  prepareNodesForPaste,
  readNodesEnvelope,
  writeNodesEnvelope,
} from '../src/clipboard'
import { installCatalog } from '../src/component/catalog/index'
import type { Migration } from '../src/migrate'
import type { WbNode } from '../src/node'
import { collectNodeIds } from '../src/tree'

beforeAll(() => {
  installCatalog()
})

/** 결정적인 id 발급기. **임시 뿌리가 첫 번째를 가져간다**(`prepareNodesForPaste` 머리말). */
function counter(): { generate: () => string; calls: () => number } {
  let next = 0
  return {
    generate: () => {
      next += 1
      return `new_${next}`
    },
    calls: () => next,
  }
}

const ALL = { node: () => true, page: () => true }
const NONE = { node: () => false, page: () => false }

const BUTTON: WbNode = {
  id: 'src_button',
  type: 'Button',
  props: { label: '열기' },
  interactions: [
    {
      on: 'click',
      actions: [
        { type: 'setVisible', target: 'src_list', value: true },
        { type: 'setProp', target: 'src_text', prop: 'content', value: { nested: ['a'] } },
      ],
    },
  ],
}
const LIST: WbNode = { id: 'src_list', type: 'List', props: { items: 3 } }

describe('writeNodesEnvelope · readNodesEnvelope', () => {
  it('왕복하면 같은 노드다', () => {
    const text = writeNodesEnvelope([BUTTON, LIST], 1)
    expect(JSON.parse(text)).toEqual({ wirebound: NODES_ENVELOPE_KIND, version: 1, nodes: [BUTTON, LIST] })
    expect(readNodesEnvelope(text)).toEqual({ nodes: [BUTTON, LIST] })
  })

  it.each([
    ['빈 글', ''],
    ['그냥 글', '안녕하세요'],
    ['일반 JSON', '{"a":1}'],
    ['페이지 봉투', JSON.stringify({ wirebound: 'page', version: 1, nodes: [LIST] })],
    ['잘린 JSON', writeNodesEnvelope([LIST], 1).slice(0, 20)],
    ['배열', JSON.stringify([LIST])],
    ['노드 없음', JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [] })],
    ['버전 없음', JSON.stringify({ wirebound: 'nodes', nodes: [LIST] })],
    ['모르는 키', JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [LIST], extra: 1 })],
  ])('봉투가 아니면 null — %s', (_label, text) => {
    expect(readNodesEnvelope(text)).toBeNull()
  })

  it.each([
    ['없는 타입', [{ id: 'a', type: 'NoSuchType' }]],
    ['중복 id', [LIST, { ...LIST }]],
    ['자식 안의 중복 id', [{ id: 'sec', type: 'Section', children: [{ id: 'sec', type: 'Text' }] }]],
    ['props 가 틀림', [{ id: 'a', type: 'List', props: { items: 'many' } }]],
    ['자식을 못 담는 타입', [{ id: 'a', type: 'Text', children: [{ id: 'b', type: 'Text' }] }]],
    ['id 형식 밖', [{ id: 'a b', type: 'Text' }]],
  ])('검증을 못 지나는 노드면 null — %s', (_label, nodes) => {
    expect(readNodesEnvelope(writeNodesEnvelope(nodes as WbNode[], 1))).toBeNull()
  })

  it('옛 version 봉투는 문서 마이그레이션 체인으로 올려 읽는다', () => {
    const toV2: Migration = {
      from: 1,
      to: 2,
      migrate: (doc) => ({
        ...doc,
        root: {
          ...doc.root,
          children: (doc.root.children ?? []).map((node) =>
            node.type === 'Text' ? { ...node, props: { ...node.props, content: 'migrated' } } : node,
          ),
        },
      }),
    }
    const text = writeNodesEnvelope([{ id: 't', type: 'Text', props: { content: 'old' } }], 1)

    expect(readNodesEnvelope(text, [toV2], 2)).toEqual({
      nodes: [{ id: 't', type: 'Text', props: { content: 'migrated' } }],
    })
  })

  it('지금보다 높은 version 이나 올릴 길이 없는 version 은 null', () => {
    expect(readNodesEnvelope(writeNodesEnvelope([LIST], 3), [], 2)).toBeNull()
    expect(readNodesEnvelope(writeNodesEnvelope([LIST], 1), [], 2)).toBeNull()
  })
})

describe('prepareNodesForPaste', () => {
  it('모든 노드가 새 id 를 받고 형제를 가리키던 대상이 새 id 로 따라간다', () => {
    const ids = counter()
    const { nodes, droppedActions } = prepareNodesForPaste([BUTTON, LIST], NONE, ids.generate)

    // 대상이 짝 노드의 새 id 다 — 노드마다 따로 지으면 옛 id 로 남는다.
    expect(nodes[0]!.interactions![0]!.actions[0]!.target).toBe(nodes[1]!.id)
    expect(droppedActions).toBe(1) // src_text 는 붙이는 노드 밖이고 문서에도 없다
    expect(nodes.map((node) => node.id)).toEqual(['new_2', 'new_3'])
    expect(nodes[0]!.interactions).toEqual([
      { on: 'click', actions: [{ type: 'setVisible', target: 'new_3', value: true }] },
    ])
    // 임시 뿌리 몫 1 + 노드 둘.
    expect(ids.calls()).toBe(3)
  })

  it('자손을 가리키는 대상도 따라간다', () => {
    const section: WbNode = {
      id: 'sec',
      type: 'Section',
      children: [
        { id: 'tabs', type: 'Tabs', props: { tabs: ['a', 'b'] } },
        {
          id: 'btn',
          type: 'Button',
          interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: 'tabs', tab: 1 }] }],
        },
      ],
    }
    const { nodes } = prepareNodesForPaste([section], NONE, counter().generate)
    const [tabs, btn] = nodes[0]!.children!
    expect(btn!.interactions![0]!.actions[0]).toEqual({ type: 'switchTab', target: tabs!.id, tab: 1 })
    expect(collectNodeIds(nodes[0]!)).not.toContain('tabs')
  })

  it('붙이는 노드 밖의 노드 대상 — 문서에 있으면 남기고 없으면 동작째 뺀다', () => {
    const kept = prepareNodesForPaste([BUTTON], { node: (id) => id === 'src_text', page: () => false })
    expect(kept.droppedActions).toBe(1)
    expect(kept.nodes[0]!.interactions![0]!.actions).toEqual([
      { type: 'setProp', target: 'src_text', prop: 'content', value: { nested: ['a'] } },
    ])

    const both = prepareNodesForPaste([BUTTON], ALL)
    expect(both.droppedActions).toBe(0)
    expect(both.nodes[0]!.interactions![0]!.actions.map((action) => action.target)).toEqual([
      'src_list',
      'src_text',
    ])
  })

  it('동작이 다 빠진 상호작용은 상호작용째 뺀다 — 남은 상호작용은 그대로', () => {
    const node: WbNode = {
      id: 'b',
      type: 'Button',
      interactions: [
        { on: 'click', actions: [{ type: 'setVisible', target: 'gone', value: true }] },
        { on: 'submit', actions: [{ type: 'navigate', target: 'page:here' }] },
      ],
    }
    const { nodes, droppedActions } = prepareNodesForPaste([node], {
      node: () => false,
      page: (target) => target === 'page:here',
    })
    expect(droppedActions).toBe(1)
    expect(nodes[0]!.interactions).toEqual([{ on: 'submit', actions: [{ type: 'navigate', target: 'page:here' }] }])
  })

  it('상호작용이 전부 빠지면 interactions 키도 걷는다', () => {
    const node: WbNode = {
      id: 'b',
      type: 'Button',
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'gone', value: true }] }],
    }
    const { nodes, droppedActions } = prepareNodesForPaste([node], NONE)
    expect(droppedActions).toBe(1)
    expect(nodes[0]).not.toHaveProperty('interactions')
  })

  it('페이지 대상도 같다 — 지금 프로젝트에 있으면 남기고 없으면 뺀다', () => {
    const node: WbNode = {
      id: 'b',
      type: 'Button',
      interactions: [
        {
          on: 'click',
          actions: [
            { type: 'navigate', target: 'page:관리자/회원' },
            { type: 'openModal', target: 'page:다른 프로젝트' },
          ],
        },
      ],
    }
    const seen: string[] = []
    const { nodes, droppedActions } = prepareNodesForPaste([node], {
      node: () => true,
      page: (target) => {
        seen.push(target)
        return target === 'page:관리자/회원'
      },
    })
    expect(seen).toEqual(['page:관리자/회원', 'page:다른 프로젝트'])
    expect(droppedActions).toBe(1)
    expect(nodes[0]!.interactions![0]!.actions).toEqual([{ type: 'navigate', target: 'page:관리자/회원' }])
  })

  it('아직 고르지 않은(빈) 대상은 밖을 가리키는 것이 아니라 남긴다', () => {
    const node: WbNode = {
      id: 'b',
      type: 'Button',
      interactions: [
        {
          on: 'click',
          actions: [
            { type: 'setVisible', target: '', value: true },
            { type: 'navigate', target: ' ' },
          ],
        },
      ],
    }
    const { nodes, droppedActions } = prepareNodesForPaste([node], NONE)
    expect(droppedActions).toBe(0)
    expect(nodes[0]!.interactions![0]!.actions).toHaveLength(2)
  })

  it('props · setProp.value 를 입력과 공유하지 않고 입력을 바꾸지 않는다', () => {
    const input = structuredClone(BUTTON)
    const { nodes } = prepareNodesForPaste([input], ALL)
    const action = nodes[0]!.interactions![0]!.actions[1] as { value: { nested: string[] } }

    expect(nodes[0]!.props).not.toBe(input.props)
    expect(nodes[0]!.props).toEqual(input.props)
    action.value.nested.push('b')
    ;(nodes[0]!.props as { label: string }).label = '바뀜'
    expect(input).toEqual(BUTTON)

    prepareNodesForPaste([input], NONE)
    expect(input).toEqual(BUTTON)
  })

  it('MAX_OPS_PER_EDIT 는 200 이다(서버 OpsBody 가 같은 상수를 읽는다)', () => {
    expect(MAX_OPS_PER_EDIT).toBe(200)
  })
})
