/**
 * **늦게 커밋된 변경의 신호(`page-stale`)를 스토어가 받는 판**(`EditorStore.markPageStale` · `loadPage`의 `lateKept` · `confirmPageFresh`). 서버는 답을 잃은 편집 ·
 * 게시의 COMMIT 이 확인 한도를 넘겨 커밋되면 번호 없는 이 신호를 낸다(`apps/api/src/ws/protocol.ts`). 받는 쪽이 할 수 있는 일은 «그 페이지가 낡았다»고 말하는 것
 * 뿐이고, 푸는 것은 **신호 뒤에 시작한 조회**가 실은 판이다 — 신호 앞에 시작한 조회는 그 커밋 앞을 읽었을 수 있다(복원의 `#restoredAt`과 같은 잣대).
 *
 * | 판 | 낡음 |
 * |---|---|
 * | 열린 페이지의 신호 | `late` |
 * | 다른 페이지의 신호 | 안 선다 |
 * | 신호 앞에 시작한 조회의 판 | 남는다 |
 * | 신호 뒤에 시작한 조회의 판 | 풀린다 |
 * | 여는 중인 페이지의 신호 | 안 서고 · 그 조회가 신호 앞에 시작했으면 판을 실어도 남는다 |
 * | 판이 같다고 본 조회(`confirmPageFresh`) | 신호 뒤에 시작했을 때만 풀린다 |
 * | 복원 낡음 | 늦은 낡음이 덮지 않고 풀지도 않는다 |
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore, type RemoteStale } from '../../src/store/editor-store'

function doc(): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }
}

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

/** 판을 서버에서 다시 읽어 싣는다 — 조회를 시작하고 판을 정하고 싣는다(`routes/editor.tsx`의 재조회 이펙트). */
function reload(store: EditorStore, pageId = 'page_1', headSeq = 5): number {
  const ticket = store.beginPageLoad(pageId)
  store.settlePageLoad(ticket)
  store.loadPage(pageId, doc(), headSeq, ticket)
  return ticket
}

describe('page-stale 의 신호', () => {
  it('열린 페이지의 신호는 늦은 변경 낡음을 세운다', () => {
    const { store } = opened()
    store.markPageStale('page_1')

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('다른 페이지의 신호는 무시한다 — 낡음도 안 서고 그 페이지를 나중에 열어도 안 선다', () => {
    const { store, seen } = opened()
    store.markPageStale('page_2')

    expect(store.getState().remoteStale).toBeNull()
    reload(store, 'page_2', 1)
    expect(store.getState().remoteStale).toBeNull()
    expect(seen).toEqual([])
  })

  it('같은 신호가 여러 번 와도 구독자는 한 번만 깨운다 — 참조가 그대로다', () => {
    const { store, seen } = opened()
    store.markPageStale('page_1')
    const first = store.getState().remoteStale
    store.markPageStale('page_1')
    store.markPageStale('page_1')

    expect(store.getState().remoteStale).toBe(first)
    expect(seen).toEqual([{ reason: 'late' }])
  })

  it('뒤따르는 갭 · 갈라짐은 늦은 낡음을 덮지 않는다 — 뒤 revision 이 빠진 번호 위에 안 얹히는 것은 그 결과다', () => {
    const { store } = opened()
    store.markPageStale('page_1')
    // headSeq 4 에서 6 이 왔다 — 5(늦게 커밋된 것)가 빠졌다.
    store.applyRemoteChange('page_1', { seq: 6, ops: [], warnings: [] })

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('먼저 선 갭을 늦은 낡음이 덮는다 — 원인이 증상을 덮는다', () => {
    const { store } = opened()
    store.applyRemoteChange('page_1', { seq: 6, ops: [], warnings: [] })
    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })

    store.markPageStale('page_1')

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('복원 낡음은 늦은 낡음이 덮지 않는다', () => {
    const { store } = opened()
    store.markRestored({})
    store.markPageStale('page_1')

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })
})

describe('늦은 변경 낡음이 풀리는 때', () => {
  it('신호 뒤에 시작한 조회의 판이 풀린다', () => {
    const { store } = opened()
    store.markPageStale('page_1')
    reload(store)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('신호 앞에 시작한 조회의 판은 풀지 않는다 — 그 조회는 늦은 커밋 앞을 읽었을 수 있다', () => {
    const { store } = opened()
    const before = store.beginPageLoad('page_1')
    store.markPageStale('page_1')
    store.settlePageLoad(before)
    store.loadPage('page_1', doc(), 5, before)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
    // 신호 뒤에 시작한 조회가 푼다.
    reload(store, 'page_1', 6)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('세대를 안 넘기는 입구의 판은 안 남긴다 — 신호의 시점을 가를 수 없다(복원의 `beforeRestore`와 같다)', () => {
    const { store } = opened()
    store.markPageStale('page_1')
    store.loadPage('page_1', doc(), 5)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('페이지를 비우면 풀린다 — 떠났다 돌아온 페이지는 신호 뒤에 시작한 조회가 읽는다', () => {
    const { store } = opened()
    store.markPageStale('page_1')
    store.clearPage()
    expect(store.getState().remoteStale).toBeNull()

    reload(store)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('복원 뒤 다시 읽기가 복원 낡음을 풀어도 신호 앞에 시작한 조회면 늦은 낡음은 남긴다 — 둘은 따로 푼다', () => {
    const { store } = opened()
    store.markRestored({})
    store.beginRestoreReread()
    const ticket = store.beginPageLoad('page_1')
    store.markPageStale('page_1')
    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 6, ticket, { restoreReread: true })

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })
})

describe('seq 힌트 — 비교에만 쓴다', () => {
  /**
   * 서버가 신호에 그 revision 의 `seq` 를 힌트로 싣는다(`apps/api/src/ws/protocol.ts`). 받는 쪽은 `seq <= headSeq`(이미 그 revision 을 품은 판)면 경보를 안 세운다.
   * **번호를 얹는 데 쓰지 않는다** — 늦은 옛 번호 프레임이 뒤 revision 이 빠진 화면을 최신으로 두던 이음 오염으로 돌아가면 안 된다. 이 스토어는 4 번 판에서 열린다.
   * `headSeq` 가 오르는 자리(`loadPage` · 연속 번호의 프레임 · 번호 응답 · 내 ack · 고아 ack · 다시 읽은 판 위의 창)는 모두 그 번호 이하의 커밋된 내용을 품은 판에서만 오른다.
   */
  it('힌트가 지금 판의 번호 이하면 경보가 안 선다 — 구독자도 안 깨우고 판(문서 · 바탕 · 번호)을 안 건드린다', () => {
    const { store, seen } = opened()
    const before = store.getState()

    store.markPageStale('page_1', 4)
    store.markPageStale('page_1', 3)
    store.markPageStale('page_1', 0)

    expect(store.getState().remoteStale).toBeNull()
    expect(seen).toEqual([])
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().document).toBe(before.document)
    expect(store.getState().baseDocument).toBe(before.baseDocument)
  })

  it('힌트가 지금 판보다 앞서면(`headSeq + 1`) 경보가 선다 — 번호도 문서도 안 얹는다', () => {
    const { store } = opened()
    const before = store.getState()

    store.markPageStale('page_1', 5)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
    // 비교에만 쓴다 — 힌트의 번호로 `headSeq` 를 올리지도 문서를 바꾸지도 않는다.
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().document).toBe(before.document)
    expect(store.getState().baseDocument).toBe(before.baseDocument)
  })

  it('힌트가 없는 신호(번호를 모르는 게시)는 지금처럼 경보를 세운다', () => {
    const { store } = opened()

    store.markPageStale('page_1', undefined)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('판을 다시 읽어 힌트의 번호에 닿은 탭은 경보가 안 선다 — 거짓 경보가 줄어드는 판', () => {
    const { store } = opened()
    // 늦게 커밋된 revision(5)을 신호보다 먼저 읽은 탭 — 그 판을 실었다.
    reload(store, 'page_1', 5)

    store.markPageStale('page_1', 5)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('번호 프레임이 구멍(5)을 건너뛰어 와도 `headSeq` 는 그 구멍을 넘지 않는다 — 5 의 힌트는 참 경보를 세운다', () => {
    const { store } = opened()
    // 늦게 커밋된 5 의 프레임은 안 나갔고 그 뒤 6 의 프레임이 온다 — 이음이 안 맞아 얹히지 않는다(갭).
    store.applyRemoteChange('page_1', { seq: 6, ops: [], warnings: [] })
    expect(store.getState().headSeq).toBe(4)

    store.markPageStale('page_1', 5)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
    expect(store.getState().headSeq).toBe(4)
  })

  it('경보를 안 세워도 신호의 시점은 적는다 — 신호 앞에 시작한 조회가 더 옛 판(힌트보다 낮은 번호)을 싣고 돌아오면 낡음이 선다', () => {
    const { store } = opened()
    // 5 번 판을 읽은 탭 — 이어서 신호(힌트 5)가 오고, 그 앞에 시작한 옛 조회(4 번 판)가 늦게 돌아온다.
    reload(store, 'page_1', 5)
    const before = store.beginPageLoad('page_1')
    store.markPageStale('page_1', 5)
    expect(store.getState().remoteStale).toBeNull()

    store.settlePageLoad(before)
    store.loadPage('page_1', doc(), 4, before)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('복원 낡음이 서 있으면 힌트와 상관없이 그대로다', () => {
    const { store } = opened()
    store.markRestored({})

    store.markPageStale('page_1', 5)
    store.markPageStale('page_1', 1)

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })
})

describe('여는 중인 페이지', () => {
  it('열린 페이지가 아니면 낡음은 안 서지만, 여는 조회가 신호 앞에 시작했으면 그 판에 낡음이 선다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    // 여는 입구는 조회 전에 판을 비운다.
    store.clearPage()
    const ticket = store.beginPageLoad('page_2')
    store.markPageStale('page_2')
    expect(store.getState().remoteStale).toBeNull()

    store.settlePageLoad(ticket)
    store.loadPage('page_2', doc(), 8, ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('여는 조회가 신호 뒤에 시작했으면 안 선다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    store.clearPage()
    store.markPageStale('page_2')
    reload(store, 'page_2', 8)

    expect(store.getState().remoteStale).toBeNull()
  })

  /**
   * 신호의 기록(`#lateAt`)은 페이지 수 한도(16)가 있다 — 열려 있지도 여는 중도 아닌 페이지의 신호를 안 적어야 그 신호가 여는 중인 페이지의 기록을 밀어내지 않는다. 안 적으면
   * 밀려난 페이지의 조회는 신호 앞에 시작했어도 «풀린다»로 읽힌다.
   */
  it('다른 페이지의 신호가 한도를 넘게 와도 여는 중인 페이지의 기록을 밀어내지 않는다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    store.clearPage()
    const ticket = store.beginPageLoad('page_2')
    store.markPageStale('page_2')
    for (let index = 0; index < 40; index += 1) store.markPageStale(`other_${index}`)
    store.settlePageLoad(ticket)
    store.loadPage('page_2', doc(), 8, ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('프로젝트를 옮기면(`reset`) 신호의 기록을 잊는다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    const ticket = store.beginPageLoad('page_1')
    store.markPageStale('page_1')
    store.reset('p2')
    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 4, ticket)

    expect(store.getState().remoteStale).toBeNull()
  })
})

describe('confirmPageFresh — 판이 같다고 보고 돌아온 조회', () => {
  it('신호 뒤에 시작한 조회면 늦은 낡음을 푼다 — 거짓 경보를 걷는다', () => {
    const { store } = opened()
    store.markPageStale('page_1')
    const ticket = store.beginPageLoad('page_1')
    store.settlePageLoad(ticket)
    store.confirmPageFresh('page_1', ticket)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('신호 앞에 시작한 조회면 안 푼다', () => {
    const { store } = opened()
    const ticket = store.beginPageLoad('page_1')
    store.markPageStale('page_1')
    store.settlePageLoad(ticket)
    store.confirmPageFresh('page_1', ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })

  it('다른 낡음(갭 · 복원)은 안 건드린다', () => {
    const { store } = opened()
    store.applyRemoteChange('page_1', { seq: 6, ops: [], warnings: [] })
    const ticket = store.beginPageLoad('page_1')
    store.settlePageLoad(ticket)
    store.confirmPageFresh('page_1', ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })
  })

  it('다른 페이지의 조회는 안 푼다', () => {
    const { store } = opened()
    store.markPageStale('page_1')
    const ticket = store.beginPageLoad('page_2')
    store.settlePageLoad(ticket)
    store.confirmPageFresh('page_2', ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'late' })
  })
})
