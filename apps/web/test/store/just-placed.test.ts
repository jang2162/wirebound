// @vitest-environment node
/**
 * **«방금 넣음» 표지의 수명**(`EditorStore` 의 `justPlaced` · `selectPlaced`) — 하단 판이 넣어 고르면 서고, 사람이 무엇이든 고르면(같은 노드를 다시
 * 골라도) 빈다. 고른 것이 바뀌거나 사라지면(남의 지움 · 되돌리기) · 다른 페이지를 열면 빈다. 판정이 그 표지로 무엇을 하는지는
 * `palette/palette-add-chain.test.ts` 가 잰다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import '../../src/catalog-setup'
import { EditorStore } from '../../src/store/editor-store'

const PAGE = 'pg-1'

function doc(): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-card', type: 'Card', zones: { headEnd: [{ id: 'n-edit', type: 'Button' }] } },
        { id: 'n-text', type: 'Text' },
        { id: 'n-flex', type: 'Flex' },
      ],
    },
  }
}

/** 페이지를 열고 «넣은» 노드 하나를 표지와 함께 고른 판. */
function placed(id = 'n-text'): EditorStore {
  const store = new EditorStore()
  store.loadPage(PAGE, doc(), 1)
  store.selectPlaced([id])
  // 카나리아 — 판이 섰다.
  expect(store.getState().justPlaced).toEqual([id])
  expect(store.getState().selectedNodeId).toBe(id)
  return store
}

describe('«방금 넣음» 이 서는 판', () => {
  it('하나는 그 노드를 고르고 적는다 · 여럿은 기준 노드와 함께 목록을 적는다', () => {
    placed()
    const store = new EditorStore()
    store.loadPage(PAGE, doc(), 1)
    store.selectPlaced(['n-text', 'n-flex'], 'n-flex')
    expect(store.getState().selectedNodeIds).toEqual(['n-text', 'n-flex'])
    expect(store.getState().selectedNodeId).toBe('n-flex')
    expect(store.getState().justPlaced).toEqual(['n-text', 'n-flex'])
  })

  it('무관한 편집 · 같은 페이지를 다시 실음에는 남는다', () => {
    const store = placed()
    store.applyEdit([{ op: 'remove', path: '/root/children/2' }])
    store.loadPage(PAGE, store.getState().document as PageDocument, 2)
    expect(store.getState().justPlaced).toEqual(['n-text'])
  })
})

describe('사람이 고르면 빈다', () => {
  it('같은 노드를 다시 골라도(캔버스 · 구조 트리의 `selectNode`)', () => {
    const store = placed()
    store.selectNode('n-text')
    expect(store.getState().selectedNodeId).toBe('n-text')
    expect(store.getState().justPlaced).toBeNull()
  })

  it('다른 노드 · 빈 곳 · 구역 줄 · Cmd · Shift · 여럿', () => {
    const picks: ((store: EditorStore) => void)[] = [
      (store) => store.selectNode('n-flex'),
      (store) => store.selectNode(null),
      (store) => store.selectZone('n-card', 'headEnd'),
      (store) => store.toggleSelect('n-flex'),
      (store) => store.selectRange('n-flex', ['n-card', 'n-text', 'n-flex']),
      (store) => store.selectMany(['n-text'], 'replace'),
    ]
    for (const pick of picks) {
      const store = placed()
      pick(store)
      expect(store.getState().justPlaced).toBeNull()
    }
  })
})

describe('고른 것이 바뀌거나 사라지면 빈다', () => {
  it('그 노드가 지워지면(내 되돌리기 · 남의 편집)', () => {
    const mine = placed()
    mine.applyEdit([{ op: 'remove', path: '/root/children/1' }])
    expect(mine.getState().justPlaced).toBeNull()

    const theirs = placed()
    theirs.applyRemoteChange(PAGE, { seq: 2, ops: [{ op: 'remove', path: '/root/children/1' }], warnings: [] })
    expect(theirs.getState().justPlaced).toBeNull()
  })

  it('잠금 거절이 선택에서 빼면 · 다른 페이지를 열면', () => {
    const denied = placed()
    denied.dropFromSelection(['n-text'])
    expect(denied.getState().justPlaced).toBeNull()

    const moved = placed()
    moved.loadPage('pg-2', doc(), 1)
    expect(moved.getState().justPlaced).toBeNull()
  })
})
