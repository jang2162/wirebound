/**
 * **잃음의 조각을 합치는 규칙**(`store/loss-notice.ts`)과 **스토어가 그 조각을 드는 수명**(`EditorStore.tellLoss` · `#lossAfterLoad` ·
 * `#keptLoss`). 셸의 겨룸(누가 먼저 오나)은 `test/edit/loss-notice-merge.test.tsx`가 잰다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'
import { LOSS_RANK, lossMessage, mergeLoss, type LossPart } from '../../src/store/loss-notice'

function doc(): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }
}

function opened(): EditorStore {
  const store = new EditorStore()
  store.loadPage('page_1', doc(), 4)
  return store
}

/** 수 하나를 싣는 조각. */
function counted(key: string, rank: number, count: number, word = key): LossPart {
  return { key, rank, counts: [count], render: ([n]) => `${word} ${n ?? 0}개.` }
}

const message = (store: EditorStore): string | null => {
  const failure = store.getState().editFailure
  return failure === null ? null : failure.kind === 'message' ? failure.message : failure.kind
}

describe('조각을 합친다', () => {
  it('같은 열쇠는 자리마다 수를 더하고, 세기는 큰 쪽이다', () => {
    // 앞 조각이 «모름»을 셌고 뒤 조각은 안 보낸 것만 센다(재연결 재조회가 두 번 버린 판) — 합친 수에 «모름»이 있으니 앞에 선다.
    const merged = mergeLoss([{ ...counted('버림', LOSS_RANK.unknown, 1), counts: [1, 0] }], { ...counted('버림', LOSS_RANK.cancelled, 0), counts: [0, 5] })

    expect(merged).toHaveLength(1)
    expect(merged[0]!.counts).toEqual([1, 5])
    expect(merged[0]!.rank).toBe(LOSS_RANK.unknown)
  })

  it('수가 없는 조각은 뒤에 온 문장이 선다', () => {
    const merged = mergeLoss(
      [{ key: '떠남', rank: LOSS_RANK.cancelled, counts: [], render: () => '앞 떠남.' }],
      { key: '떠남', rank: LOSS_RANK.cancelled, counts: [], render: () => '뒤 떠남.' },
    )

    expect(lossMessage(merged)).toBe('뒤 떠남.')
  })

  it('세기 순으로 잇고, 같은 세기는 먼저 온 것이 앞이다', () => {
    const parts = [
      counted('이력', LOSS_RANK.history, 1),
      counted('취소 가', LOSS_RANK.cancelled, 1),
      counted('모름', LOSS_RANK.unknown, 1),
      counted('취소 나', LOSS_RANK.cancelled, 1),
    ]

    expect(lossMessage(parts)).toBe('모름 1개. 취소 가 1개. 취소 나 1개. 이력 1개.')
  })
})

describe('스토어가 조각을 드는 수명', () => {
  it('앞 잃음 뒤에 온 잃음은 잇는다', () => {
    const store = opened()
    store.tellLoss(counted('버림', LOSS_RANK.cancelled, 1))
    store.tellLoss(counted('초기화', LOSS_RANK.history, 1))

    expect(message(store)).toBe('버림 1개. 초기화 1개.')
  })

  it('잃음이 아닌 통지 뒤에 온 잃음은 새로 시작한다', () => {
    const store = opened()
    store.tellLoss(counted('버림', LOSS_RANK.cancelled, 1))
    store.setEditFailure({ kind: 'message', message: '되돌릴 수 없는 편집 1개를 건너뛰었습니다.' })
    store.tellLoss(counted('버림', LOSS_RANK.cancelled, 1))

    expect(message(store)).toBe('버림 1개.')
  })

  it('세션이 끊긴 통지는 뒤에 온 잃음이 덮지 않는다', () => {
    const store = opened()
    store.setEditFailure({ kind: 'signed-out' })
    store.tellLoss(counted('버림', LOSS_RANK.cancelled, 1))

    expect(store.getState().editFailure).toEqual({ kind: 'signed-out' })
  })

  it('«화면에 남은 편집»의 조각은 판을 다시 실으면 걷고, 나머지 조각은 남긴다', () => {
    const store = opened()
    store.tellLoss(counted('버림', LOSS_RANK.cancelled, 1))
    store.tellLoss({ key: '못 읽음', rank: LOSS_RANK.cancelled, counts: [], render: () => '화면에 남아 있는 편집은 저장되지 않았습니다.', untilLoad: true })
    // 판 카나리아 — 둘이 이어 섰다.
    expect(message(store)).toBe('버림 1개. 화면에 남아 있는 편집은 저장되지 않았습니다.')

    store.loadPage('page_1', doc(), 5)

    expect(message(store)).toBe('버림 1개.')
  })

  it('판을 비우면 떠남의 조각만 남는다', () => {
    const store = opened()
    store.tellLoss(counted('버림', LOSS_RANK.cancelled, 1))
    store.setLeaveNotice('떠남.', ['page_1'])
    // 판 카나리아 — 떠남이 이어 섰고 닫는 단추를 그린다.
    expect(message(store)).toBe('버림 1개. 떠남.')
    expect(store.isLeaveNotice(store.getState().editFailure)).toBe(true)

    store.clearPage()

    expect(message(store)).toBe('떠남.')
  })

  it('떠남의 조각이 가리키는 페이지를 다시 열면 그 조각만 풀린다', () => {
    const store = opened()
    store.setLeaveNotice('떠남.', ['page_2'])
    store.tellLoss({ key: '못 읽음', rank: LOSS_RANK.unknown, counts: [], render: () => '모름.' })

    store.loadPage('page_2', doc(), 9)

    // `loadPage`는 비우는 자리가 아니다 — 잇던 «모름»은 참이라 남는다(판을 옮기는 비우기는 `clearPage`가 먼저 한다).
    expect(message(store)).toBe('모름.')
    expect(store.isLeaveNotice(store.getState().editFailure)).toBe(false)
  })
})
