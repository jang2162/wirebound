// @vitest-environment node
/**
 * **넣을 자리로 고른 구역**(`EditorStore` 의 `selectedZone` · `selectZone`) — 구조 트리의 구역 줄을 누른 판의 상태. 노드 선택과 함께 서지 않고,
 * 그 구역이 문서에서 사라지면 빈다(`src/store/editor-store.ts` 의 `#withZone`).
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
      ],
    },
  }
}

function opened(): EditorStore {
  const store = new EditorStore()
  store.loadPage(PAGE, doc(), 1)
  return store
}

describe('넣을 자리로 고른 구역', () => {
  it('구역을 고르면 노드 선택이 빈다 — 노드를 고르면 구역이 빈다', () => {
    const store = opened()
    // 카나리아 — 여는 경로는 뿌리를 고른다(구역을 고르면 그것이 빈다).
    expect(store.getState().selectedNodeIds).toEqual(['n-root'])
    store.selectZone('n-card', 'footer')
    expect(store.getState().selectedZone).toEqual({ parentId: 'n-card', zone: 'footer' })
    expect(store.getState().selectedNodeIds).toEqual([])
    expect(store.getState().selectedNodeId).toBeNull()

    store.selectNode('n-text')
    expect(store.getState().selectedZone).toBeNull()

    store.selectZone('n-card', 'headEnd')
    store.toggleSelect('n-text')
    expect(store.getState().selectedZone).toBeNull()

    store.selectZone('n-card', 'headEnd')
    store.selectMany(['n-text'], 'replace')
    expect(store.getState().selectedZone).toBeNull()
  })

  it('선언 밖 구역 · 문서에 없는 부모는 안 고른다', () => {
    const store = opened()
    store.selectZone('n-text', 'footer')
    store.selectZone('n-gone', 'footer')
    expect(store.getState().selectedZone).toBeNull()
    expect(store.getState().selectedNodeIds).toEqual(['n-root'])
  })

  it('그 부모가 문서에서 사라지면 빈다 — 무관한 편집에는 남는다', () => {
    const store = opened()
    store.selectZone('n-card', 'footer')
    store.applyEdit([{ op: 'remove', path: '/root/children/1' }])
    expect(store.getState().selectedZone).toEqual({ parentId: 'n-card', zone: 'footer' })
    store.applyEdit([{ op: 'remove', path: '/root/children/0' }])
    expect(store.getState().selectedZone).toBeNull()
  })

  it('같은 페이지를 다시 실으면 남고 · 다른 페이지를 열면 빈다', () => {
    const store = opened()
    store.selectZone('n-card', 'footer')
    store.loadPage(PAGE, doc(), 2)
    expect(store.getState().selectedZone).toEqual({ parentId: 'n-card', zone: 'footer' })
    store.loadPage('pg-2', doc(), 1)
    expect(store.getState().selectedZone).toBeNull()
  })
})
