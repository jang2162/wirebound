// @vitest-environment node
/**
 * 스토어의 선택 목록(`selectedNodeIds`)과 기준 노드(`selectedNodeId`) — 명령(`toggleSelect` · `selectRange` · `selectMany`)과 문서가 바뀐 뒤의
 * 정리(`#withSelection`). 규칙 자체(조상/자손 · 루트 · 차례 · 상한)는 `selection-set.test.ts` 가 순수 함수로 잰다 — 여기서는 스토어가 그
 * 규칙을 **어느 자리에서** 거는지와 남의 잠금을 재는다.
 *
 * ```
 * root
 *   a      a1  a2
 *   b      b1
 *   c
 * ```
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'

const PAGE = 'pg-1'

function page(): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: 'root',
      type: 'Page',
      children: [
        {
          id: 'a',
          type: 'Section',
          children: [
            { id: 'a1', type: 'Text', props: {} },
            { id: 'a2', type: 'Text', props: {} },
          ],
        },
        { id: 'b', type: 'Section', children: [{ id: 'b1', type: 'Text', props: {} }] },
        { id: 'c', type: 'Text', props: {} },
      ],
    },
  }
}

const ORDER = ['root', 'a', 'a1', 'a2', 'b', 'b1', 'c']

function opened(): EditorStore {
  const store = new EditorStore()
  store.setViewer('u_me')
  store.loadPage(PAGE, page(), 1)
  return store
}

const picked = (store: EditorStore): { ids: readonly string[]; anchor: string | null } => ({
  ids: store.getState().selectedNodeIds,
  anchor: store.getState().selectedNodeId,
})

describe('하나 고르기 — 지금 길 그대로', () => {
  it('페이지를 열면 루트 하나다', () => {
    expect(picked(opened())).toEqual({ ids: ['root'], anchor: 'root' })
  })

  it('`selectNode` 는 목록을 그 하나로 접는다 — 여럿을 고른 뒤 누른 클릭 하나', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    store.selectNode('b1')
    expect(picked(store)).toEqual({ ids: ['b1'], anchor: 'b1' })
  })

  it('`selectNode(null)` 은 목록을 비운다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    store.selectNode(null)
    expect(picked(store)).toEqual({ ids: [], anchor: null })
  })
})

describe('Cmd+클릭 — `toggleSelect`', () => {
  it('더한 것이 기준 노드가 되고 목록은 문서 차례다', () => {
    const store = opened()
    store.selectNode('c')
    store.toggleSelect('a')
    expect(picked(store)).toEqual({ ids: ['a', 'c'], anchor: 'a' })
  })

  it('고른 것을 다시 누르면 빠지고, 빠진 것이 기준이면 목록의 마지막이 기준이다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('b')
    store.toggleSelect('c')
    store.toggleSelect('c')
    expect(picked(store)).toEqual({ ids: ['a', 'b'], anchor: 'b' })
    store.toggleSelect('a')
    expect(picked(store)).toEqual({ ids: ['b'], anchor: 'b' })
  })

  it('조상을 더하면 자손이 빠진다 · 자손을 더하면 조상이 빠진다', () => {
    const store = opened()
    store.selectNode('a1')
    store.toggleSelect('c')
    store.toggleSelect('a')
    expect(picked(store)).toEqual({ ids: ['a', 'c'], anchor: 'a' })
    store.toggleSelect('a2')
    expect(picked(store)).toEqual({ ids: ['a2', 'c'], anchor: 'a2' })
  })

  it('루트를 더하면 루트 하나다 · 루트를 고른 채 다른 노드를 더하면 루트가 빠진다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('root')
    expect(picked(store)).toEqual({ ids: ['root'], anchor: 'root' })
    store.toggleSelect('c')
    expect(picked(store)).toEqual({ ids: ['c'], anchor: 'c' })
  })

  it('남이 잡은 노드는 더하지 않는다', () => {
    const store = opened()
    store.setLocks([{ pageId: PAGE, nodeId: 'b', userId: 'u_bora', userName: '보라' }])
    store.selectNode('a')
    store.toggleSelect('b1')
    expect(picked(store)).toEqual({ ids: ['a'], anchor: 'a' })
  })
})

describe('Shift+클릭 — `selectRange`', () => {
  it('기준 노드부터 누른 노드까지 보이는 차례로 · 가장 바깥 것들 · 누른 노드가 기준이다', () => {
    const store = opened()
    store.selectNode('a2')
    store.selectRange('c', ORDER)
    expect(picked(store)).toEqual({ ids: ['a2', 'b', 'c'], anchor: 'c' })
  })

  it('거꾸로도 같다 — 누른 노드가 바깥 것 안이면 기준은 목록의 마지막이다', () => {
    const store = opened()
    store.selectNode('c')
    store.selectRange('a1', ORDER)
    expect(picked(store)).toEqual({ ids: ['a1', 'a2', 'b', 'c'], anchor: 'a1' })
    store.selectNode('b1')
    store.selectRange('a', ORDER)
    expect(picked(store)).toEqual({ ids: ['a', 'b'], anchor: 'a' })
  })

  it('남이 잡은 줄은 건너뛴다', () => {
    const store = opened()
    store.setLocks([{ pageId: PAGE, nodeId: 'b1', userId: 'u_bora', userName: '보라' }])
    store.selectNode('a2')
    store.selectRange('c', ORDER)
    // `b`는 `b1`의 조상이라 고를 수 없고(서브트리 claim), `b1`은 남의 것이다.
    expect(picked(store)).toEqual({ ids: ['a2', 'c'], anchor: 'c' })
  })

  it('기준 노드가 없으면 누른 것 하나다', () => {
    const store = opened()
    store.selectNode(null)
    store.selectRange('b', ORDER)
    expect(picked(store)).toEqual({ ids: ['b'], anchor: 'b' })
  })

  it('루트에서 시작한 범위는 루트를 빼고 가장 바깥 것들이다', () => {
    const store = opened()
    store.selectRange('b', ORDER)
    expect(picked(store)).toEqual({ ids: ['a', 'b'], anchor: 'b' })
  })
})

describe('여럿을 한 번에 — `selectMany`', () => {
  it('갈아 끼우면 그 목록이고, 기준은 준 것(남으면)이다', () => {
    const store = opened()
    store.selectNode('c')
    expect(store.selectMany(['a1', 'a2'], 'replace', 'a1')).toEqual({ capped: 0 })
    expect(picked(store)).toEqual({ ids: ['a1', 'a2'], anchor: 'a1' })
  })

  it('더하면 지금 목록에 얹고 기준은 그대로다 · 남이 잡은 것은 빠진다', () => {
    const store = opened()
    store.setLocks([{ pageId: PAGE, nodeId: 'b1', userId: 'u_bora', userName: '보라' }])
    store.selectNode('c')
    store.selectMany(['a', 'b1'], 'add')
    expect(picked(store)).toEqual({ ids: ['a', 'c'], anchor: 'c' })
  })

  it('비어 있는 것으로 갈아 끼우면 비운다', () => {
    const store = opened()
    store.selectMany([], 'replace')
    expect(picked(store)).toEqual({ ids: [], anchor: null })
  })

  it('상한을 넘으면 뒤에서 빼고 뺀 수를 답한다', () => {
    const store = new EditorStore()
    store.loadPage(
      PAGE,
      {
        version: CURRENT_DOCUMENT_VERSION,
        root: { id: 'root', type: 'Page', children: Array.from({ length: 203 }, (_, index) => ({ id: `n${index}`, type: 'Text', props: {} })) },
      },
      1,
    )
    const all = Array.from({ length: 203 }, (_, index) => `n${index}`)
    expect(store.selectMany(all, 'replace')).toEqual({ capped: 3 })
    expect(store.getState().selectedNodeIds).toHaveLength(200)
    expect(store.toggleSelect('n202')).toEqual({ capped: 1 })
    expect(store.getState().selectedNodeIds).not.toContain('n202')
  })
})

describe('문서가 바뀌면 목록이 따라간다', () => {
  it('남이 고른 노드 하나를 지우면 그것만 빠진다 — 기준 노드였으면 목록의 마지막이 기준이다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    store.toggleSelect('b')
    store.applyRemoteChange(PAGE, { seq: 2, ops: [{ op: 'remove', path: '/root/children/1' }], warnings: [] })
    expect(picked(store)).toEqual({ ids: ['a', 'c'], anchor: 'c' })
  })

  it('남이 고른 노드를 다른 고른 노드 안으로 옮기면 바깥 것만 남는다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    store.applyRemoteChange(PAGE, { seq: 2, ops: [{ op: 'move', from: '/root/children/2', path: '/root/children/0/children/-' }], warnings: [] })
    expect(picked(store)).toEqual({ ids: ['a'], anchor: 'a' })
  })

  it('되돌리기가 고른 노드를 없애면 목록에서 빠진다', () => {
    const store = opened()
    store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'd', type: 'Text', props: {} } }])
    store.selectNode('d')
    store.toggleSelect('a')
    store.ackEdit(store.getState().pending[0]!.clientOpId, { seq: 2, revisionId: 'rev-2', inverse: [{ op: 'remove', path: '/root/children/3' }] })
    store.startUndo()
    expect(picked(store)).toEqual({ ids: ['a'], anchor: 'a' })
  })

  it('같은 페이지를 다시 실으면 남은 것은 그대로 · 없어진 것은 빠진다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    const reloaded = page()
    reloaded.root.children = reloaded.root.children!.slice(0, 2)
    store.loadPage(PAGE, reloaded, 3)
    expect(picked(store)).toEqual({ ids: ['a'], anchor: 'a' })
  })

  it('다른 페이지를 열면 그 루트 하나다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    store.loadPage('pg-2', page(), 1)
    expect(picked(store)).toEqual({ ids: ['root'], anchor: 'root' })
  })

  it('목록과 기준이 그대로면 같은 배열을 둔다 — 편집마다 구독자가 헛일을 하지 않는다', () => {
    const store = opened()
    store.selectNode('a')
    store.toggleSelect('c')
    const before = store.getState().selectedNodeIds
    store.applyEdit([{ op: 'replace', path: '/root/children/2/props', value: { text: 'x' } }])
    expect(store.getState().selectedNodeIds).toBe(before)
  })
})

describe('선택이 잠금을 걸게 되면(승격) 막힌 것만 뺀다', () => {
  it('목록에서 남이 잡은 것만 빠지고 기준이 빠지면 목록의 마지막이다', () => {
    const store = opened()
    store.setSelectionClaims(false)
    store.setLocks([{ pageId: PAGE, nodeId: 'c', userId: 'u_bora', userName: '보라' }])
    store.selectNode('a')
    store.toggleSelect('b')
    store.toggleSelect('c')
    store.setSelectionClaims(true)
    expect(picked(store)).toEqual({ ids: ['a', 'b'], anchor: 'b' })
  })
})
