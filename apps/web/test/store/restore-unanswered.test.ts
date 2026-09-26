/**
 * **답을 잃은 내 복원도 복원이다**(`EditorStore.markRestoreUnanswered`) — 그 앞에 시작한 조회의 판은 복원 앞을 읽었을 수 있어 배너를 풀지
 * 않는다. 셸의 판(문장 · 단추 · 커밋 전 거절)은 `test/shell/restore-banner-lift.test.tsx`의 «내 복원 — 답을 잃은 판»이 잰다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'

function doc(): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }
}

describe('답을 잃은 내 복원', () => {
  it('남의 복원 배너가 서 있으면 그 문장을 두고, 도는 다시 읽기의 판은 배너를 풀지 않는다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    store.markRestored({ safetySnapshotId: 's-bob' })
    // 배너의 단추로 다시 읽기를 시작한다 — 그 판이 오기 전에 내 복원의 답을 잃는다.
    store.beginRestoreReread()
    const ticket = store.beginPageLoad('page_1')
    store.markRestoreUnanswered()
    // 판 카나리아 — 서 있던 남의 복원 문장 그대로다.
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 5, ticket, { restoreReread: true })

    expect(store.getState().remoteStale?.reason).toBe('restored')
  })

  it('서 있는 배너가 없으면 «모른다»의 낡음을 세우고, 그 뒤에 시작한 다시 읽기의 판이 푼다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    store.markRestoreUnanswered()
    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'unanswered' })

    store.beginRestoreReread()
    const ticket = store.beginPageLoad('page_1')
    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 5, ticket, { restoreReread: true })

    expect(store.getState().remoteStale).toBeNull()
  })
})
