/**
 * **내 복원의 신호를 알아보는 판**(`EditorStore.markRestored` · `beginOwnRestore` · `ownRestoreAnswered` · `ownRestoreRefused` ·
 * `markRestoreUnanswered`). 복원의 방송은 낸 연결도 빼지 않으므로(서버 `ws/notify.ts`의 `notifyRestored`) 내 복원의 신호가 늘 온다 — 답과 신호의
 * 차례 넷(답 받음 · 잃음 × 신호가 먼저 · 늦게)이 칸마다 한 판이다. 넘기는 판정은 서버가 지은 안전망 스냅샷 id 로만 하고, 탭이 지은 복원 id 는
 * 미루기 · «반영됐다»에만 쓴다(`RestoreSignal`). 미뤄 둔 신호는 한도(`RESTORE_SIGNAL_WAIT_MS`)가 지나면 남의 복원으로 서고, `reset`은 앞 셸이 낸
 * 복원을 잊는다. 실브라우저 판은 `apps/web/build-test/editor-restore-signal-order.test.ts` 와 `editor-restore-unanswered.test.ts` ·
 * `editor-restore-own-signal.test.ts` 가 든다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { READ_DEADLINE_MS } from '../../src/api/http-client'
import { EditorStore, RESTORE_SIGNAL_WAIT_MS, type RemoteStale } from '../../src/store/editor-store'

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
   * `apps/web/build-test/editor-restore-signal-order.test.ts` «답을 잃음 · 다시 읽기보다 늦게 커밋» — 연결을 빼던 판에서는 신호가 안 와 조용했다).
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

/**
 * **미뤄 둔 신호의 한도**(`RESTORE_SIGNAL_WAIT_MS`). 흉내 낸 복원 id 의 신호는 그 탭의 답까지 미뤄지는데, 복원은 쓰기라 답에 시간 한도가 없다 —
 * 한도가 없으면 답이 매달린 동안 서버는 복원됐는데 배너가 끝까지 없다(Chrome: `apps/web/build-test/editor-restore-signal-order.test.ts`
 * «흉내 낸 신호 · 내 답이 매달림»).
 */
describe('미뤄 둔 신호의 한도', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('한도는 읽기 한도와 같다', () => {
    expect(RESTORE_SIGNAL_WAIT_MS).toBe(READ_DEADLINE_MS)
  })

  it('한도 안에 답이 안 오면 미뤄 둔 신호가 남의 복원으로 선다', () => {
    vi.useFakeTimers()
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-1' })
    vi.advanceTimersByTime(RESTORE_SIGNAL_WAIT_MS - 1)
    // 판 카나리아 — 한도 앞에서는 미룬다.
    expect(store.getState().remoteStale).toBeNull()

    vi.advanceTimersByTime(1)

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('한도가 지난 뒤 같은 복원 id 의 신호는 미루지 않는다', () => {
    vi.useFakeTimers()
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-1' })
    vi.advanceTimersByTime(RESTORE_SIGNAL_WAIT_MS)
    reread(store, 5)
    expect(store.getState().remoteStale).toBeNull()

    store.markRestored({ safetySnapshotId: 's-bob-2', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  /** **대가** — 내 답이 한도보다 늦으면 내 복원의 신호가 한 번 선다. 그 답이 여는 다시 읽기가 걷는다. */
  it('내 답이 한도보다 늦으면 거짓 배너가 한 번 서고, 그 답 뒤의 다시 읽기가 걷는다', () => {
    vi.useFakeTimers()
    const { store, seen } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    vi.advanceTimersByTime(RESTORE_SIGNAL_WAIT_MS)

    store.ownRestoreAnswered('r-1', 's-1')
    reread(store, 5)

    expect(seen).toEqual([{ reason: 'restored' }, null])
  })

  it('한도 안에 답이 오면 한도가 지나도 아무것도 세우지 않는다', () => {
    vi.useFakeTimers()
    const { store, seen } = opened()
    store.beginOwnRestore('r-1')
    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    vi.advanceTimersByTime(RESTORE_SIGNAL_WAIT_MS / 2)
    store.ownRestoreAnswered('r-1', 's-1')
    reread(store, 5)

    vi.advanceTimersByTime(RESTORE_SIGNAL_WAIT_MS)

    expect(seen).toEqual([])
  })
})

/**
 * **`reset`은 앞 셸이 낸 복원을 잊는다**(`#restoresInFlight` · `#ownRestores` · `#lostRestores`). 셸 안에서 다른 프로젝트로 갔다 돌아오면 스토어는
 * 그대로고 셸만 새것이다 — 앞 셸의 답은 스토어에 안 쓴다(`routes/editor.tsx`의 `shellGeneration`). 남은 id 는 돌아온 셸에 온 그 복원의 신호를
 * 넘기거나 미뤄 둔다(Chrome: `apps/web/build-test/editor-restore-signal-order.test.ts` «다른 프로젝트로 갔다 돌아옴»).
 */
describe('reset 뒤의 앞 복원', () => {
  /** 다른 프로젝트를 다녀와 같은 페이지를 다시 연 스토어. */
  function returned(store: EditorStore): void {
    store.reset('project_2')
    store.reset('project_1')
    store.loadPage('page_1', doc(), 4)
  }

  it('답을 기다리던 복원의 신호를 미루지 않는다 — 남의 복원으로 선다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    returned(store)

    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('답을 받은 복원의 안전망 스냅샷 id 로 넘기지 않는다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.ownRestoreAnswered('r-1', 's-1')
    returned(store)

    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('답을 잃은 복원의 신호를 «반영됐다»로 읽지 않는다', () => {
    const { store } = opened()
    store.beginOwnRestore('r-1')
    store.markRestoreUnanswered('r-1')
    returned(store)

    store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('세대가 오른다', () => {
    const store = new EditorStore()
    const before = store.resetGeneration()

    store.reset('project_1')

    expect(store.resetGeneration()).toBe(before + 1)
  })
})
