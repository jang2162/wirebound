// @vitest-environment node
/**
 * 잠금 통로 자체(§7.2 · P3-3 D4). **화면 없이 잰다** — 이 파일이 재는 것은 *"언제 프레임을
 * 내는가"*이고, 그것이 화면의 선택과 이어지는 것은 `test/lock/soft-lock.test.tsx`가 잰다.
 *
 * **셸째로 재는 것으로는 안 되는 축이 있다.** 같은 노드를 두 번 눌러도 선택이 안 바뀌므로
 * 이펙트가 다시 돌지 않는다 — 즉 화면에서는 *"같은 자리를 다시 잡는"* 호출이 애초에 나지
 * 않는다(변이 실증: 그 판만으로는 아래 `hold`의 중복 거르기를 지워도 **0 사망**이었다).
 * 그 호출은 다시 붙을 때·페이지를 옮길 때 실제로 나므로, 여기서 직접 부른다.
 */
import { describe, expect, it } from 'vitest'
import type { NodeLockView } from '../../src/realtime/protocol'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { RealtimeLink } from '../../src/realtime/connection'

function fakeLink(): RealtimeLink & { sent: string[] } {
  const sent: string[] = []
  return {
    sent,
    isOpen: () => true,
    send: (payload) => {
      sent.push(payload)
      return true
    },
  }
}

function types(link: { sent: string[] }): string[] {
  return link.sent.map((raw) => (JSON.parse(raw) as { type: string }).type)
}

describe('잡고 놓는다', () => {
  it('자리를 잡으면 프레임이 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', 'n-a')

    expect(link.sent.map((raw) => JSON.parse(raw))).toEqual([{ type: 'lock', pageId: 'pg-1', nodeId: 'n-a' }])
  })

  it('**같은 자리를 다시 잡으면 아무것도 안 나간다** — 룸 전체가 목록을 다시 받는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', 'n-a')
    channel.hold('pg-1', 'n-a')
    channel.hold('pg-1', 'n-a')

    expect(link.sent).toHaveLength(1)
  })

  it('노드가 바뀌면 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', 'n-a')
    channel.hold('pg-1', 'n-b')

    expect(link.sent.map((raw) => (JSON.parse(raw) as { nodeId: string }).nodeId)).toEqual(['n-a', 'n-b'])
  })

  it('페이지만 바뀌어도 나간다 — 같은 노드 id가 두 페이지에 있을 수 있다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', 'n-a')
    channel.hold('pg-2', 'n-a')

    expect(link.sent.map((raw) => (JSON.parse(raw) as { pageId: string }).pageId)).toEqual(['pg-1', 'pg-2'])
  })

  it('선택이 없어지면 놓는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', 'n-a')
    channel.hold('pg-1', null)

    expect(types(link)).toEqual(['lock', 'unlock'])
  })

  it('잡은 것이 없는데 놓으라고 하면 아무것도 안 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', null)
    channel.hold(undefined, 'n-a')

    expect(link.sent).toEqual([])
  })
})

describe('하트비트와 다시 붙기', () => {
  it('`refresh`는 같은 자리여도 보낸다 — §7.2의 *"편집 중 하트비트로 갱신"*', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', 'n-a')

    channel.refresh()
    channel.refresh()

    expect(types(link)).toEqual(['lock', 'lock', 'lock'])
  })

  it('잡은 것이 없으면 `refresh`가 아무것도 안 보낸다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.refresh()

    expect(link.sent).toEqual([])
  })

  it('다시 붙은 연결에 잡고 있던 자리를 알린다 — 서버는 끊기며 놓았다', () => {
    const first = fakeLink()
    const second = fakeLink()
    const channel = createLockChannel()
    channel.attach(first)
    channel.hold('pg-1', 'n-a')

    channel.attach(second)
    channel.reannounce()

    expect(second.sent.map((raw) => JSON.parse(raw))).toEqual([{ type: 'lock', pageId: 'pg-1', nodeId: 'n-a' }])
  })

  it('연결이 없으면 조용하다 — 잠금을 못 잡은 것은 편집 실패가 아니다', () => {
    const channel = createLockChannel()

    expect(() => {
      channel.hold('pg-1', 'n-a')
      channel.refresh()
    }).not.toThrow()
  })

  it('뗀 뒤에는 안 보낸다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', 'n-a')

    channel.detach()
    channel.refresh()

    expect(link.sent).toHaveLength(1)
  })
})

/**
 * **잡지 않은 선택**(이월 5차 리뷰 R3 · R4 — `lock-channel.ts`의 그 절). 고른 자리를 잡는 시각을 사용자가 안 정한 판(승격 · 잃음)은
 * 곧장 잡지 않고, 첫 편집(`refresh`)이 — 막히지 않았으면 — 잡는다.
 */
describe('잡지 않은 선택', () => {
  const mine = (nodeId: string): NodeLockView => ({ pageId: 'pg-1', nodeId, userId: 'u-me', userName: '나' })
  const bob = (nodeId: string): NodeLockView => ({ pageId: 'pg-1', nodeId, userId: 'u-bob', userName: '밥' })

  /** 혼자 죽는 변조: `refresh`가 `claimable`을 안 묻는다. */
  it('첫 편집이 잡을 때 남에게 막혔으면 잡지 않는다 — 막힘이 풀리면 다음 편집이 잡는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    let blocked = true
    channel.setClaimable(() => !blocked)

    channel.keepUnclaimed('pg-1', 'n-a')
    channel.refresh()
    expect(link.sent).toEqual([])

    blocked = false
    channel.refresh()
    expect(types(link)).toEqual(['lock'])
  })

  /**
   * 혼자 죽는 변조 둘: `observe`가 «한 번 선 뒤»를 안 본다(보낸 직후의 낡은 목록을 잃음으로 읽는다) · `observe`가 잃음을 안 읽는다
   * (그러면 다시 붙을 때 그 자리를 다시 보낸다 — 앞 판).
   */
  it('잡은 자리가 목록에 선 뒤 빠지면 잃은 것이다 — 다시 붙어도 안 보내고, 첫 편집이 잡는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', 'n-a')

    // 보낸 직후의 목록은 서버가 그것을 처리하기 전에 짠 것일 수 있다 — 잃은 것으로 안 읽는다.
    channel.observe([bob('n-b')], 'u-me')
    channel.reannounce()
    expect(types(link)).toEqual(['lock', 'lock'])

    channel.observe([mine('n-a'), bob('n-b')], 'u-me')
    channel.observe([bob('n-a')], 'u-me')
    channel.reannounce()
    expect(types(link)).toEqual(['lock', 'lock'])

    channel.refresh()
    expect(types(link)).toEqual(['lock', 'lock', 'lock'])
  })

  /** 혼자 죽는 변조: 놓을 때 «서버가 아직 쥐고 있을 수 있다»를 안 본다(`unlock`을 안 보낸다). */
  it('잃었다고 읽은 자리를 놓을 때는 `unlock`을 보낸다 — 승격이 둔 자리는 서버에 없어 안 보낸다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', 'n-a')
    channel.observe([mine('n-a')], 'u-me')
    channel.observe([], 'u-me')

    channel.hold('pg-1', null)
    expect(types(link)).toEqual(['lock', 'unlock'])

    channel.keepUnclaimed('pg-1', 'n-b')
    channel.hold('pg-1', null)
    expect(types(link)).toEqual(['lock', 'unlock'])
  })
})
