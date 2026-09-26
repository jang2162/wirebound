/**
 * **복원 배너의 문장은 누가 복원했는지 말하지 않는다**(`shell/remote-alert.tsx`의 `NOTICE` · `OWN_RESTORE_NOTICE`). 탭이 받는 복원 신호로는 그
 * 복원이 남의 것인지 내 것인지 가를 수 없는 판이 있다 — 복원 id 는 룸의 모두에게 보여 흉내 낼 수 있고(`RestoreSignal`), 내 복원도 알아보는
 * 목록을 벗어나면 남의 복원과 같은 신호다. 네 판에서 «다른 사람이 …» · «답을 받지 못한 … 복원이 반영됐습니다»는 반만 맞았다.
 *
 * | 판 | 신호로 아는 것 |
 * |---|---|
 * | 흉내 — 답을 잃은 내 복원 id 를 실은 남의 복원 | 그 id 의 복원이 커밋됐다(내 것인지 모른다) |
 * | 겹침 — 남의 복원 배너와 답을 잃은 내 복원의 신호(두 차례) | 복원이 둘 커밋됐다 · 먼저 선 문장이 남는다 |
 * | 돌아온 셸 — 복원이 도는 사이 다른 프로젝트로 갔다 돌아옴(`reset`이 목록을 비운다) | 복원이 커밋됐다 |
 * | 한도 — 미뤄 둔 내 신호가 `RESTORE_SIGNAL_WAIT_MS` 안에 답을 못 봄 | 복원이 커밋됐다 |
 *
 * 단추는 어느 판이든 같다(`routes/editor.tsx`의 `reloadAfterRestore`) — 문장만 잰다. 단추를 누른 뒤의 앞머리는
 * `remote-restore-reload.test.tsx` · `restore-banner-lift.test.tsx`(«답을 잃은 뒤 그 복원 id 의 신호가 오면 …»)가 잰다.
 *
 * **«겹침: 남의 복원 배너 뒤에 …» · «돌아온 셸» · «한도»는 늘 함께 죽는다** — 셋 다 한 문장(`NOTICE.restored`)에 닿고 길만 다르다. 길 자체
 * (`reset`이 목록을 비움 · 한도가 신호를 세움)는 `test/store/restore-own-signal.test.ts`가 잰다. 여기 판 카나리아(`remoteStale` 값)는 그 길에
 * 닿았는지만 본다.
 */
import { act, render, screen } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteAlert } from '../../src/shell/remote-alert'
import { EditorStore, RESTORE_SIGNAL_WAIT_MS } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'

function doc(): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }
}

function opened(): EditorStore {
  const store = new EditorStore()
  act(() => {
    store.loadPage('page_1', doc(), 4)
  })
  render(
    <EditorStoreProvider store={store}>
      <RemoteAlert onReload={() => {}} />
    </EditorStoreProvider>,
  )
  return store
}

/** 배너 글(단추 글 «다시 불러오기»는 뺀다). 배너가 없으면 `null`. */
function bannerText(): string | null {
  const status = screen.queryByRole('status')
  if (status === null) return null
  return (status.firstChild?.textContent ?? '').trim()
}

/** **누가 했는지를 말하는 문안** — 남(«다른 사람이») · 나(«답을 받지 못한 … 복원이 반영»). */
const NAMES_WHO = /다른 사람|받지 못한 스냅샷 복원이/

/** 성질: 복원이 일어났다고 말하고, 누가 했는지는 말하지 않는다. */
function expectRestoredWithoutWho(text: string | null): void {
  expect(text).toMatch(/복원됐|복원했|반영됐/)
  expect(text).not.toMatch(/알 수 없/)
  expect(text).not.toMatch(NAMES_WHO)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('복원 배너의 문장 — 신호로 가를 수 없는 «누가»를 말하지 않는다', () => {
  it('흉내: 답을 잃은 내 복원 id 를 실은 남의 복원 — «내 복원이 반영됐다»고 하지 않는다', () => {
    const store = opened()
    act(() => {
      store.beginOwnRestore('r-1')
    })
    act(() => {
      store.markRestoreUnanswered('r-1')
    })
    // 판 카나리아 — 답을 잃은 문장이 먼저 섰다(이 문장은 참이다 — 모른다).
    expect(bannerText()).toMatch(/알 수 없습니다/)

    act(() => {

      store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-1' })

    })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'landed' })
    expectRestoredWithoutWho(bannerText())
  })

  it('겹침: 남의 복원 배너 뒤에 답을 잃은 내 복원의 신호 — «다른 사람이»로 남지 않는다', () => {
    const store = opened()
    act(() => {
      store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-bob' })
    })
    act(() => {
      store.beginOwnRestore('r-1')
    })
    act(() => {
      store.markRestoreUnanswered('r-1')
    })
    act(() => {
      store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    })

    // 판 카나리아 — 앞에 선 남의 복원 낡음이 그대로다(`#ownRestoreLanded`가 덮지 않는다).
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
    expectRestoredWithoutWho(bannerText())
  })

  it('겹침: 답을 잃은 내 복원의 신호 뒤에 남의 복원 — «내 복원이 반영됐다»로 남지 않는다', () => {
    const store = opened()
    act(() => {
      store.beginOwnRestore('r-1')
    })
    act(() => {
      store.markRestoreUnanswered('r-1')
    })
    act(() => {
      store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    })
    act(() => {
      store.markRestored({ safetySnapshotId: 's-bob', clientRestoreId: 'r-bob' })
    })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored', own: 'landed' })
    expectRestoredWithoutWho(bannerText())
  })

  it('돌아온 셸: 떠나기 전에 낸 내 복원의 신호 — «다른 사람이»라고 하지 않는다', () => {
    const store = opened()
    act(() => {
      store.beginOwnRestore('r-1')
    })
    // 셸 안의 프로젝트 전환 — `reset`이 알아보는 목록을 비운다(`routes/editor.tsx`의 `shellGeneration`).
    act(() => {
      store.reset()
    })
    act(() => {
      store.loadPage('page_1', doc(), 4)
    })
    act(() => {
      store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
    expectRestoredWithoutWho(bannerText())
  })

  it('한도: 답을 한도 안에 못 본 내 복원의 신호 — «다른 사람이»라고 하지 않는다', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const store = opened()
    act(() => {
      store.beginOwnRestore('r-1')
    })
    act(() => {
      store.markRestored({ safetySnapshotId: 's-1', clientRestoreId: 'r-1' })
    })
    // 판 카나리아 — 한도 전에는 미룬다.
    expect(bannerText()).toBeNull()

    act(() => {

      vi.advanceTimersByTime(RESTORE_SIGNAL_WAIT_MS)

    })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
    expectRestoredWithoutWho(bannerText())
  })

  it('답을 잃은 내 복원은 «모른다»를 그대로 말한다 — 신호가 오기 전에는 그것이 참이다', () => {
    const store = opened()
    act(() => {
      store.beginOwnRestore('r-1')
    })
    act(() => {
      store.markRestoreUnanswered('r-1')
    })

    expect(bannerText()).toBe('스냅샷 복원의 답을 받지 못해 복원됐는지 알 수 없습니다. 다시 불러와 지금 상태를 확인하세요.')
  })
})
