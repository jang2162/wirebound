/**
 * **내 복원의 신호를 알아보는 판**(`EditorStore.markRestored` · `beginOwnRestore` · `ownRestoreAnswered` · `ownRestoreRefused` ·
 * `markRestoreUnanswered`). 복원의 방송은 낸 연결도 빼지 않으므로(서버 `ws/notify.ts`의 `notifyRestored`) 내 복원의 신호가 늘 온다 — 답과 신호의
 * 차례 넷(답 받음 · 잃음 × 신호가 먼저 · 늦게)이 칸마다 한 판이다. 넘기는 판정은 서버가 지은 안전망 스냅샷 id 로만 하고, 탭이 지은 복원 id 는
 * 미루기 · «반영됐다»에만 쓴다(`RestoreSignal`). 실브라우저 판은 `apps/web/build-test/editor-restore-late-commit.test.ts` 와
 * `editor-restore-unanswered.test.ts`·`editor-restore-own-signal.test.ts` 가 든다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore, type RemoteStale } from '../../src/store/editor-store'

function doc(): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }
}

/** 페이지 하나를 연 스토어와, 낡음이 바뀔 때마다 적은 값. 섰다가 걷힌 거짓 배너도 여기 남는다. */
function opened(): { store: EditorStore; seen: (RemoteStale | null)[] } {
  const store = new EditorStore()
  store.loadPage('page_1', doc(), 4)
  const seen: (RemoteStale | null)[] = []
  let last = store.getState().remoteStale
  store.subscribe(() => {
    const next = store.getState().remoteStale
    if (next !== last) seen.push(next)
    last = next
  })
  return { store, seen }
}

/** 셸의 복원 뒤 다시 읽기 — 시작을 적고 그 판을 싣는다(`routes/editor.tsx`의 `reloadAfterRestore`). */
function reread(store: EditorStore, headSeq: number): void {
  store.beginRestoreReread()
  const ticket = store.beginPageLoad('page_1')
  store.settlePageLoad(ticket)
  store.loadPage('page_1', doc(), headSeq, ticket, { restoreReread: true })
}

describe('답을 받은 내 복원', () => {
  it('신호가 답보다 먼저 와도 배너가 한 번도 서지 않는다 — 답까지 미루고, 답의 안전망 스냅샷 id 로 넘긴다', () => {
    const { store, seen } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    store.ownRestoreAnswered('r-1', 's-1')
    reread(store, 5)

    expect(seen).toEqual([])
  })

  it('신호가 다시 읽기보다 늦게 와도 배너가 서지 않는다', () => {
    const { store, seen } = opened()
    store.beginOwnRestore('r-1')
    store.ownRestoreAnswered('r-1', 's-1')
    reread(store, 5)
    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    expect(seen).toEqual([])
  })

  /**
   * **복원 id 는 룸의 모두에게 보인다 — 넘기는 판정에 안 쓴다.** 남이 내 복원 id 를 실어 복원해도(owner 둘) 그 신호는 답의 안전망 스냅샷 id 와
   * 달라 남의 복원으로 선다. 흉내 낸 신호가 하는 일은 내 답이 올 때까지 배너를 미루는 것뿐이다.
   */
  it('같은 복원 id 를 실은 남의 복원은 답의 안전망 스냅샷 id 와 달라 배너를 세운다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-1' })
    // 판 카나리아 — 답을 기다리는 동안은 미룬다.
    expect(store.getState().remoteStale).toBeNull()

    store.ownRestoreAnswered('r-1', 's-1')

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('답이 온 뒤에는 같은 복원 id 를 실은 다른 신호를 넘기지 않는다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.ownRestoreAnswered('r-1', 's-1')
    reread(store, 5)

    store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })
})

describe('커밋 전에 거절된 내 복원', () => {
  it('미뤄 둔 신호는 내 것이 아니다 — 거절을 받으면 남의 복원으로 선다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-1' })
    expect(store.getState().remoteStale).toBeNull()

    store.ownRestoreRefused('r-1')

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })
})

describe('답을 잃은 내 복원', () => {
  it('답을 기다리는 동안 그 신호가 왔으면 «반영됐다»를 세운다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    store.markRestoreUnanswered('r-1')

    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'landed' })
  })

  /**
   * **F1** — 답을 잃어 «모른다»가 서고, 사람이 다시 읽어 걷힌 **뒤에** 서버가 커밋한다. 그 신호만이 화면이 낡았다는 것을 안다(Chrome:
   * `apps/web/build-test/editor-restore-late-commit.test.ts` — 연결을 빼던 판에서는 신호가 안 와 조용했다).
   */
  it('다시 읽어 배너가 걷힌 뒤에 그 신호가 오면 «반영됐다»를 다시 세우고, 그 앞에 시작한 다시 읽기는 풀지 못한다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestoreUnanswered('r-1')
    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'unanswered' })
    reread(store, 5)
    expect(store.getState().remoteStale).toBeNull()

    // 둘째 다시 읽기가 도는 사이 늦은 커밋의 신호가 온다 — 그 조회는 복원 앞을 읽었을 수 있다.
    store.beginRestoreReread()
    const ticket = store.beginPageLoad('page_1')
    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'landed' })
    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 6, ticket, { restoreReread: true })
    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'landed' })

    // 신호 뒤에 시작한 다시 읽기의 판이 푼다.
    reread(store, 7)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('남의 복원 배너가 서 있으면 «반영됐다»가 그 문장을 덮지 않는다 — 단추가 같다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestoreUnanswered('r-1')
    reread(store, 5)
    store.markRestored({ safetySnapshotId: 's-bob' })

    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('«모른다»가 서 있으면 그 신호가 «반영됐다»로 바꾼다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestoreUnanswered('r-1')

    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'landed' })
  })
})
