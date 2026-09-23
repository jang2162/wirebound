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
 * **잡지 않은 선택**(이월 5차 리뷰 R3 · 2회 LK — `lock-channel.ts`의 그 절). 승격이 둔 자리와 **서버가 거절한 자리**는 곧장 잡지
 * 않고, 사용자의 다음 행동(다른 자리를 고름 · 첫 편집)이 잡는다. 섰는지는 서버가 거절로만 말한다 — 목록을 보지 않는다.
 */
describe('잡지 않은 선택', () => {
  const denial = (channel: ReturnType<typeof createLockChannel>, nodeId: string): void => channel.denied('pg-1', nodeId)

  /**
   * 세 경로(고르기 `hold` · 첫 편집 `refresh`의 잡기 · 다시 붙은 `reannounce`)가 보낸 `lock`이 **모두** 거절을 받는다.
   *
   * **혼자 죽는 변조가 없다 — 늘 함께 죽는다.** 잡지 않은 선택을 놓을 때 `unlock`을 보내는 변조는 `role-live`의 F4 «viewer → editor
   * 승격 — 밥이 쥔 카드를…»(승격이 둔 자리를 놓는다 — 그 축의 주인)과, 거절을 무시하는 변조는 `role-live`의 «다시 붙어 보낸
   * `lock`을 서버가 거절하면…»(거절의 셸 경로 — 그 축의 주인)과 함께 죽는다. 이 케이스의 몫은 **채널 단독으로 세 경로를 잇는 것**이다.
   */
  it('거절된 자리는 잡지 않은 선택이다 — 다시 붙어도 안 보내고, 놓을 때 `unlock`도 없고, 첫 편집이 다시 잡는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    // 고르기 → 거절
    channel.hold('pg-1', 'n-a')
    denial(channel, 'n-a')
    channel.reannounce()
    expect(types(link)).toEqual(['lock'])

    // 첫 편집이 잡는다 → 거절
    channel.refresh()
    expect(types(link)).toEqual(['lock', 'lock'])
    denial(channel, 'n-a')

    // 거절 뒤 다시 첫 편집 → 잡음 → 서버가 받음(거절 없음) → 다시 붙으면 다시 알린다 → 거절
    channel.refresh()
    channel.reannounce()
    expect(types(link)).toEqual(['lock', 'lock', 'lock', 'lock'])
    denial(channel, 'n-a')

    // 놓는다 — 서버는 거절하며 이미 놓았다
    channel.hold('pg-1', null)
    expect(types(link)).toEqual(['lock', 'lock', 'lock', 'lock'])
  })

  /** 혼자 죽는 변조: `denied`가 자리를 안 가린다(옮겨 간 뒤 닿은 앞 자리의 거절이 지금 자리를 버린다). */
  it('옮겨 간 뒤에 닿은 앞 자리의 거절은 버린다 — 지금 자리는 그대로 쥔다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', 'n-a')
    channel.hold('pg-1', 'n-b')

    denial(channel, 'n-a')
    channel.denied('pg-2', 'n-b')
    channel.reannounce()

    expect(link.sent.map((raw) => (JSON.parse(raw) as { nodeId: string }).nodeId)).toEqual(['n-a', 'n-b', 'n-b'])
  })
})
