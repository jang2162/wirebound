// @vitest-environment node
/**
 * 편집 큐의 순수 로직. 스토어에 넣기 전에 **단독으로** 재기 위해 뽑아 둔 것이므로
 * 여기서도 React·DOM 없이 돈다.
 *
 * 이 큐가 지키는 것은 하나다 — **in-flight는 항상 하나**다. README가 그렇게 요구한다:
 * *"앞 요청의 `seq`를 받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이
 * 409를 받는다."* 그 직렬화를 실제로 화면에서 재는 것은 `test/edit/use-edit-commit.test.tsx`
 * 이고, 여기서는 큐의 계약만 본다.
 */
import { describe, expect, it } from 'vitest'
import { ackPending, clearPending, nextPending, type PendingEdit } from '../../src/store/edit-queue'

function edit(clientOpId: string, baseSeq = 7): PendingEdit {
  return {
    clientOpId,
    ops: [{ op: 'replace', path: '/root/children/0/props/title', value: clientOpId }],
    baseSeq,
    // 이 파일은 큐의 순서만 재므로 종류는 상관없다. ack가 그것으로 어느 스택에 쌓을지를
    // 가르는 것은 `editor-store.test.ts`가 본다.
    kind: 'edit',
  }
}

describe('nextPending', () => {
  it('보낼 것이 없으면 null이다', () => {
    expect(nextPending([])).toBeNull()
  })

  it('첫 항목을 보낸다', () => {
    // `[0]`이 in-flight다. 마지막 것을 고르는 구현은 편집 순서를 뒤집는다.
    const queue = [edit('op-1'), edit('op-2')]

    expect(nextPending(queue)).toBe(queue[0])
  })
})

describe('ackPending', () => {
  it('ack하면 첫 항목이 빠진다', () => {
    const queue = [edit('op-1'), edit('op-2')]

    expect(ackPending(queue, 'op-1').map((p) => p.clientOpId)).toEqual(['op-2'])
  })

  it('모르는 clientOpId의 ack는 무시한다', () => {
    // 늦게 도착한 응답이 큐를 흔들지 않아야 한다 — 그러지 않으면 아직 보내지도 않은
    // 편집이 ack 하나에 사라진다.
    const queue = [edit('op-1'), edit('op-2')]

    expect(ackPending(queue, 'op-없음')).toBe(queue)
  })

  it('첫 항목이 아닌 것의 ack도 무시한다', () => {
    // in-flight는 `[0]` 하나뿐이므로 다른 항목의 ack가 올 길이 없다. 와도 큐를 흔들지
    // 않는 것이, 순서가 뒤집힌 응답에서 앞 항목을 조용히 버리는 것보다 낫다.
    const queue = [edit('op-1'), edit('op-2')]

    expect(ackPending(queue, 'op-2')).toBe(queue)
  })

  it('ack하면 새 배열이 나온다', () => {
    // 스토어의 `#apply`가 참조 비교를 하므로, 제자리에서 `shift`하면 구독자가 알림을
    // 받지 못한다.
    const queue = [edit('op-1')]
    const next = ackPending(queue, 'op-1')

    expect(next).not.toBe(queue)
    expect(queue).toHaveLength(1)
  })
})

describe('clearPending', () => {
  it('실패하면 큐가 비고 버려진 항목이 반환된다', () => {
    // 버려진 것을 돌려주는 것은 통지에 쓰기 위해서다 — 몇 개를 잃었는지는 사용자가
    // 알아야 한다.
    const queue = [edit('op-1'), edit('op-2')]

    expect(clearPending(queue)).toEqual({ pending: [], dropped: queue })
    expect(clearPending(queue).pending).toHaveLength(0)
  })

  it('빈 큐를 비우면 버린 것이 없다', () => {
    // 양성 대조 — 늘 "잃었다"고 알리는 구현을 잡는다.
    expect(clearPending([])).toEqual({ pending: [], dropped: [] })
  })
})
