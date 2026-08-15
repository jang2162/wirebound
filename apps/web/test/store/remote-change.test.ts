// @vitest-environment node
/**
 * **남의 변경이 도착했을 때 스토어가 하는 일**(P3-1 D6). `editor-store.test.ts`와 같은
 * 이유로 DOM 없는 환경에서 돈다 — 이 판정에는 화면이 필요 없다.
 *
 * D6이 남긴 물음은 하나였다: *"내 낙관적 편집이 pending인 상태에서 남의 ops가 오면
 * 무엇을 하나."* §7.1의 답(*"자기 pending 위에 리베이스 적용"*)은 P3-2이고, 이 슬라이스의
 * 판정은 **미루고 말한다**이다. 아래가 그 판정을 갈래마다 고정한다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument, type PatchOp, type ValidationIssue } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'

function doc(children: { id: string }[] = []): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: { id: 'n_root', type: 'Container', children: children.map((c) => ({ id: c.id, type: 'Container' })) },
  }
}

const ADD_ONE: PatchOp[] = [{ op: 'add', path: '/root/children/-', value: { id: 'n_remote', type: 'Container' } }]

const NO_WARNINGS: ValidationIssue[] = []

function warning(nodeId: string): ValidationIssue {
  return { code: 'ignored-variant', severity: 'warning', nodeId, path: '/root', message: '버려집니다' }
}

/** 페이지 하나를 열어 둔 스토어. */
function opened(): EditorStore {
  const store = new EditorStore({ nextOpId: () => 'op_1' })
  store.loadPage('page_1', doc(), 4)
  return store
}

describe('applyRemoteChange — 얹는 갈래', () => {
  it('pending이 비어 있으면 얹고 headSeq를 올린다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_remote'])
    expect(store.getState().remoteStale).toBeNull()
  })

  it('경고를 함께 갈아 끼운다 — 남이 만든 경고를 낸 사람만 보지 않는다', () => {
    const store = opened()

    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: [warning('n_remote')] })

    expect(store.getState().editWarnings.map((issue) => issue.nodeId)).toEqual(['n_remote'])
  })

  it('경고가 없어졌으면 빈 배열이 되어 화면에서 사라진다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: [warning('n_remote')] })

    store.applyRemoteChange('page_1', {
      seq: 6,
      ops: [{ op: 'remove', path: '/root/children/0' }],
      warnings: NO_WARNINGS,
    })

    expect(store.getState().editWarnings).toEqual([])
  })
})

describe('applyRemoteChange — 안 얹는 갈래', () => {
  it('다른 페이지의 변경은 건너뛴다 — headSeq도 안 건드린다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_2', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('skipped')
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('문서가 없으면 건너뛴다', () => {
    const store = new EditorStore()

    expect(store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })).toBe('skipped')
  })

  /**
   * **자기 편집이 되돌아온 경우다.** 연결 id 헤더를 안 싣는 클라이언트는 서버가 자기를
   * 제외하지 못해 자기 ops를 되받는다 — 그때 그것을 또 얹으면 문서가 두 번 바뀐다.
   */
  it('이미 아는 seq는 건너뛴다 — 두 번 얹지 않는다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', { seq: 4, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('skipped')
    expect(store.getState().document?.root.children ?? []).toEqual([])
  })

  it('보내지 않은 편집이 있으면 미루고 낡았다고 말한다 (D6)', () => {
    const store = opened()
    store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])

    const result = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('deferred')
    expect(store.getState().remoteStale).toEqual({ reason: 'pending' })
    // **문서도 `headSeq`도 안 움직인다** — 둘 중 하나만 움직이면 조용히 갈라진다.
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_mine'])
  })

  it('얹을 수 없는 ops면 갈라졌다고 말한다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
      warnings: NO_WARNINGS,
    })

    expect(result).toBe('diverged')
    expect(store.getState().remoteStale).toEqual({ reason: 'diverged' })
    expect(store.getState().headSeq).toBe(4)
  })
})

describe('낡음은 풀린다', () => {
  it('페이지를 다시 받으면 풀린다 — 새로고침한 뒤에도 남지 않는다', () => {
    const store = opened()
    store.markRestored()
    expect(store.getState().remoteStale).not.toBeNull()

    store.loadPage('page_1', doc(), 9)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('미룬 뒤 pending이 비고 다음 변경이 오면 그때 얹히며 풀린다', () => {
    const store = opened()
    const opId = store.applyEdit([
      { op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } },
    ])
    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })
    expect(store.getState().remoteStale).toEqual({ reason: 'pending' })

    store.ackEdit(opId!, { seq: 5, revisionId: 'rev_1', inverse: [] })
    const result = store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('applied')
    expect(store.getState().remoteStale).toBeNull()
  })

  it('페이지를 닫으면 풀린다', () => {
    const store = opened()
    store.markRestored()

    store.clearPage()

    expect(store.getState().remoteStale).toBeNull()
  })
})

describe('markRestored', () => {
  it('판이 갈렸다고 말한다 — 얹을 ops가 없다', () => {
    const store = opened()

    store.markRestored()

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
    expect(store.getState().headSeq).toBe(4)
  })

  it('같은 이유가 이어지면 구독자를 다시 부르지 않는다', () => {
    const store = opened()
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })

    store.markRestored()
    const afterFirst = notified
    store.markRestored()

    expect(notified).toBe(afterFirst)
  })
})
