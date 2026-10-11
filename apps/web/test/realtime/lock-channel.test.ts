// @vitest-environment node
/**
 * 잠금 통로 자체(설계서 「소프트 잠금」). **화면 없이 잰다** — 이 파일이 재는 것은 *"언제 프레임을
 * 내는가"*이고, 그것이 화면의 선택과 이어지는 것은 `test/lock/soft-lock.test.tsx`가 잰다.
 *
 * **셸째로 재는 것으로는 안 되는 축이 있다.** 같은 노드를 두 번 눌러도 선택이 안 바뀌므로
 * 이펙트가 다시 돌지 않는다 — 즉 화면에서는 *"같은 자리를 다시 잡는"* 호출이 애초에 나지
 * 않는다(변이 실증: 셸째로 재는 판만으로는 아래 `hold`의 중복 거르기를 지워도 **아무것도 안 죽는다**).
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

/** 마지막으로 나간 `lock`의 차례 — 서버의 거절이 되돌려주는 값이다. */
function lastLockId(link: { sent: string[] }): number {
  const locks = link.sent.map((raw) => JSON.parse(raw) as { type: string; lockId?: number }).filter((frame) => frame.type === 'lock')
  const id = locks.at(-1)?.lockId
  if (id === undefined) throw new Error('나간 lock 이 없다')
  return id
}

describe('잡고 놓는다', () => {
  it('자리를 잡으면 프레임이 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a'])

    expect(link.sent.map((raw) => JSON.parse(raw))).toEqual([{ type: 'lock', pageId: 'pg-1', nodeIds: ['n-a'], lockId: 1 }])
  })

  it('**같은 자리를 다시 잡으면 아무것도 안 나간다** — 룸 전체가 목록을 다시 받는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a'])
    channel.hold('pg-1', ['n-a'])
    channel.hold('pg-1', ['n-a'])

    expect(link.sent).toHaveLength(1)
  })

  it('노드가 바뀌면 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a'])
    channel.hold('pg-1', ['n-b'])

    expect(link.sent.map((raw) => (JSON.parse(raw) as { nodeIds: string[] }).nodeIds)).toEqual([['n-a'], ['n-b']])
  })

  it('페이지만 바뀌어도 나간다 — 같은 노드 id가 두 페이지에 있을 수 있다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a'])
    channel.hold('pg-2', ['n-a'])

    expect(link.sent.map((raw) => (JSON.parse(raw) as { pageId: string }).pageId)).toEqual(['pg-1', 'pg-2'])
  })

  it('선택이 없어지면 놓는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a'])
    channel.hold('pg-1', [])

    expect(types(link)).toEqual(['lock', 'unlock'])
  })

  it('잡은 것이 없는데 놓으라고 하면 아무것도 안 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', [])
    channel.hold(undefined, ['n-a'])

    expect(link.sent).toEqual([])
  })
})

describe('하트비트와 다시 붙기', () => {
  it('`refresh`는 같은 자리여도 보낸다 — 설계서 「소프트 잠금」의 *"편집 중 하트비트로 갱신"*', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', ['n-a'])

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
    channel.hold('pg-1', ['n-a'])

    channel.attach(second)
    channel.reannounce()

    // 차례는 연결이 아니라 통로의 것이다 — 다시 붙어도 이어서 올린다(앞 연결의 거절이 늦게 닿아도 짝이 안 맞는다).
    expect(second.sent.map((raw) => JSON.parse(raw))).toEqual([{ type: 'lock', pageId: 'pg-1', nodeIds: ['n-a'], lockId: 2 }])
  })

  it('연결이 없으면 조용하다 — 잠금을 못 잡은 것은 편집 실패가 아니다', () => {
    const channel = createLockChannel()

    expect(() => {
      channel.hold('pg-1', ['n-a'])
      channel.refresh()
    }).not.toThrow()
  })

  it('뗀 뒤에는 안 보낸다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', ['n-a'])

    channel.detach()
    channel.refresh()

    expect(link.sent).toHaveLength(1)
  })
})

/**
 * **잡지 않은 선택**(`lock-channel.ts`의 그 절). 승격이 둔 자리와 **서버가 거절한 자리**는 곧장 잡지
 * 않고, 사용자의 다음 행동(다른 자리를 고름 · 첫 편집)이 잡는다. 섰는지는 서버가 거절로만 말한다 — 목록을 보지 않는다.
 */
describe('잡지 않은 선택', () => {
  /** 마지막으로 보낸 `lock`의 거절 — 서버가 그 `lockId`를 되돌려준다. */
  const denial = (channel: ReturnType<typeof createLockChannel>, link: { sent: string[] }, nodeId: string): void => {
    channel.denied('pg-1', [nodeId], lastLockId(link))
  }

  /**
   * 세 경로(고르기 `hold` · 첫 편집 `refresh`의 잡기 · 다시 붙은 `reannounce`)가 보낸 `lock`이 **모두** 거절을 받는다.
   *
   * **혼자 죽는 변조가 없다 — 늘 함께 죽는다.** 잡지 않은 선택을 놓을 때 `unlock`을 보내는 변조는 `role-live`의 «viewer → editor
   * 승격 — 밥이 쥔 카드를…»(승격이 둔 자리를 놓는다 — 그 축의 주인)과, 거절을 무시하는 변조는 `role-live`의 «다시 붙어 보낸
   * `lock`을 서버가 거절하면…»(거절의 셸 경로 — 그 축의 주인)과 함께 죽는다. 이 케이스의 몫은 **채널 단독으로 세 경로를 잇는 것**이다.
   */
  it('거절된 자리는 잡지 않은 선택이다 — 다시 붙어도 안 보내고, 놓을 때 `unlock`도 없고, 첫 편집이 다시 잡는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    // 고르기 → 거절
    channel.hold('pg-1', ['n-a'])
    denial(channel, link, 'n-a')
    channel.reannounce()
    expect(types(link)).toEqual(['lock'])

    // 첫 편집이 잡는다 → 거절
    channel.refresh()
    expect(types(link)).toEqual(['lock', 'lock'])
    denial(channel, link, 'n-a')

    // 거절 뒤 다시 첫 편집 → 잡음 → 서버가 받음(거절 없음) → 다시 붙으면 다시 알린다 → 거절
    channel.refresh()
    channel.reannounce()
    expect(types(link)).toEqual(['lock', 'lock', 'lock', 'lock'])
    denial(channel, link, 'n-a')

    // 놓는다 — 서버는 거절하며 이미 놓았다
    channel.hold('pg-1', [])
    expect(types(link)).toEqual(['lock', 'lock', 'lock', 'lock'])
  })

  /** 혼자 죽는 변조: `denied`가 자리를 안 가린다(옮겨 간 뒤 닿은 앞 자리의 거절이 지금 자리를 버린다). */
  it('옮겨 간 뒤에 닿은 앞 자리의 거절은 버린다 — 지금 자리는 그대로 쥔다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', ['n-a'])
    const aId = lastLockId(link)
    channel.hold('pg-1', ['n-b'])

    channel.denied('pg-1', ['n-a'], aId)
    channel.denied('pg-2', ['n-b'], lastLockId(link))
    channel.reannounce()

    expect(link.sent.map((raw) => (JSON.parse(raw) as { nodeIds: string[] }).nodeIds)).toEqual([['n-a'], ['n-b'], ['n-b']])
  })

  /**
   * **거절은 그 `lock` 프레임과 짝짓는다**(`lock-channel.ts`의 그 절). 같은 자리를 다시 보낸 뒤 닿은 **앞** `lock`의 거절은 뒤 것의
   * 답이 아니다 — 쥔 채로 두고, 놓을 때 `unlock`을 보낸다(서버는 뒤 `lock`을 쥐고 있다). 하트비트(같은 자리를 다시 보냄)도 같다.
   * 마지막 것의 거절은 받는다. 혼자 죽는 변조: `denied`가 `lockId`를 안 본다(자리로만 짝짓는다).
   */
  it('옛 차례의 거절은 버린다 — X → Y → X 뒤 첫 X 의 거절이 닿아도 쥔 채이고, 놓을 때 `unlock`이 나간다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a'])
    const first = lastLockId(link)
    channel.hold('pg-1', ['n-b'])
    channel.hold('pg-1', ['n-a'])
    channel.denied('pg-1', ['n-a'], first)
    channel.hold('pg-1', [])
    expect(types(link)).toEqual(['lock', 'lock', 'lock', 'unlock'])

    // 하트비트 — 같은 자리를 다시 보낸 뒤 닿은 앞 거절도 버리고, 마지막 것의 거절은 받는다(그 뒤 놓을 것이 없다).
    channel.hold('pg-1', ['n-c'])
    const beat = lastLockId(link)
    channel.refresh()
    channel.denied('pg-1', ['n-c'], beat)
    channel.denied('pg-1', ['n-c'], lastLockId(link))
    channel.hold('pg-1', [])
    expect(types(link)).toEqual(['lock', 'lock', 'lock', 'unlock', 'lock', 'lock'])
  })
})

/**
 * **자리는 노드 집합이다**(`lock-channel.ts`의 그 절). 하나 고른 판은 길이 1 의 집합이고, 여럿 고른 판은 고른 서브트리 전부를 한 프레임에
 * 싣는다. 거절은 둘로 갈린다 — 일부면 그 노드를 집합에서 빼고 돌려주고(부르는 쪽이 선택에서 뺀다), 전부면 «잡지 않은 선택»이다.
 */
describe('집합', () => {
  const sentIds = (link: { sent: string[] }): string[][] =>
    link.sent
      .map((raw) => JSON.parse(raw) as { type: string; nodeIds?: string[] })
      .filter((frame) => frame.type === 'lock')
      .map((frame) => frame.nodeIds ?? [])

  it('집합을 한 프레임에 싣고, 차례만 다른 같은 집합은 안 보내고, 바뀌면 보낸다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)

    channel.hold('pg-1', ['n-a', 'n-b'])
    channel.hold('pg-1', ['n-b', 'n-a'])
    channel.hold('pg-1', ['n-a', 'n-b', 'n-c'])

    expect(sentIds(link)).toEqual([
      ['n-a', 'n-b'],
      ['n-a', 'n-b', 'n-c'],
    ])
  })

  /** 혼자 죽는 변조: 일부 거절도 집합째 «잡지 않은 선택»으로 옮긴다(돌려주는 것이 없다 · 하트비트가 거절된 노드까지 싣는다). */
  it('일부 거절은 그 노드를 집합에서 빼고 돌려준다 — 하트비트 · 다시 알림은 남은 것만 싣는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', ['n-a', 'n-b', 'n-c'])

    expect(channel.denied('pg-1', ['n-b'], lastLockId(link))).toEqual(['n-b'])
    channel.refresh()
    channel.reannounce()
    // 선택이 남은 둘로 바뀌어 오는 `hold`는 같은 집합이라 안 보낸다.
    channel.hold('pg-1', ['n-a', 'n-c'])

    expect(sentIds(link)).toEqual([
      ['n-a', 'n-b', 'n-c'],
      ['n-a', 'n-c'],
      ['n-a', 'n-c'],
    ])
  })

  /** 혼자 죽는 변조: 전부 거절도 일부처럼 돌려준다(부르는 쪽이 선택을 비운다). */
  it('전부 거절은 잡지 않은 선택이다 — 돌려주는 것이 없고, 첫 편집이 집합째 다시 잡는다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', ['n-a', 'n-b'])

    expect(channel.denied('pg-1', ['n-b', 'n-a'], lastLockId(link))).toEqual([])
    channel.reannounce()
    channel.refresh()

    expect(sentIds(link)).toEqual([
      ['n-a', 'n-b'],
      ['n-a', 'n-b'],
    ])
  })

  it('잡은 집합 밖의 노드만 실린 거절은 버린다', () => {
    const link = fakeLink()
    const channel = createLockChannel()
    channel.attach(link)
    channel.hold('pg-1', ['n-a'])

    expect(channel.denied('pg-1', ['n-z'], lastLockId(link))).toEqual([])
    channel.hold('pg-1', [])

    expect(types(link)).toEqual(['lock', 'unlock'])
  })
})
