/**
 * 잠금을 잡고 놓는 통로(§7.2 · P3-3 D4). **React도 DOM도 `fetch`도 import하지 않는다** —
 * `connection.ts`·`edit-channel.ts`와 같은 이유다.
 *
 * # 왜 편집 채널이 아닌가 (P3-2 이월 §2.4)
 *
 * `edit-channel.ts`는 `clientOpId` 하나로 프레임과 `Promise`를 짝짓고, 연결이 끊기면
 * **기다리던 것을 전부 실패시킨다.** 잠금은 그 셋이 다 다르다:
 *
 * | | 편집 | 잠금 |
 * |---|---|---|
 * | 답 | `patch-ack`/`patch-error`가 짝지어 온다 | 짝이 없다 — 받으면 룸 전체로 `locks` 목록이, 거절하면 나에게만 `lock-denied`가 온다 |
 * | 실패하면 | 그 편집이 취소된다 | 잠금을 못 잡았을 뿐 편집은 그대로다 |
 * | 끊기면 | 기다리던 것을 실패로 끝내야 한다 | **서버가 알아서 놓는다** — 할 일이 없다 |
 *
 * 같은 채널에 얹으면 `failInFlight`의 뜻이 갈래마다 달라진다.
 *
 * # 잡고 있는 자리를 기억한다 — 다시 붙을 때 그것을 쓴다
 *
 * 연결이 끊기면 서버가 잠금을 놓는다(§7.2). 다시 붙었을 때 **누가 그것을 다시 잡는가**를
 * 정해야 하는데, 화면의 선택은 그 사이 바뀌지 않았으므로 *"선택이 바뀔 때 보낸다"*만으로는
 * 아무것도 안 나간다 — 사용자는 노드를 고른 채로 있는데 남의 화면에서 배지가 사라진다.
 * 그래서 잡은 자리를 기억하고, **다시 붙을 때 `reannounce()`가 그것을 다시 보낸다**
 * (`use-realtime.ts`의 `'open'` 갈래). 그 사이 남이 잡았으면 **서버가 거절한다**(아래).
 *
 * # 섰는지는 서버가 말한다 — 거절만 온다 (이월 5차 2회 LK)
 *
 * 서버는 겹치는 자리를 남이 쥐었으면 `lock`을 받지 않고 **낸 연결에** `lock-denied`로 답한다(`apps/api/src/ws/lock.ts`). 그래서
 * 이 통로는 **보낸 `lock`이 섰다고 보고, 거절이 오면 그 자리를 «잡지 않은 선택»으로 옮긴다**(`denied`). 거절된 연결은 서버에서
 * 아무것도 안 쥔다(서버가 앞 자리도 놓는다) — 놓을 때 `unlock`을 보낼 것이 없다.
 *
 * **거절은 그 `lock` 프레임과 짝짓는다.** 보낼 때마다 차례(`lockId`)를 올려 싣고, 서버가 거절에 그것을 되돌려준다 — **마지막으로
 * 보낸 `lock`의 거절만** 받는다. «자리»로만 짝지으면 조용히 어긋난다: X → Y → X 를 거절 왕복 안에 보내면 첫 X 의 거절이 셋째 X 의
 * 답으로 읽혀, 화면은 «잡지 않은 선택»인데 서버는 셋째 X 를 쥔다 — 그 화면이 빈 곳을 누르면 `unlock`을 안 보내 남의 화면에 배지가
 * 남는다(재는 자리: `test/realtime/lock-channel.test.ts` 「옛 차례의 거절은 버린다」). 옛 차례의 거절을 버려도 되는 까닭: 뒤에 보낸 `lock`이 서버에서 자기 판정을 받는다(뒤에 받은
 * 것이 이긴다 — 서버 `ws/lock.ts`) — 그 답은 따로 온다.
 *
 * **앞 판의 추정 장치를 걷었다.** 서버가 거절하지 않던 판에서는 «내 것이 섰나 · 잃었나»를 룸의 `locks` 목록으로 추정했다 —
 * `observe`(목록에 «한 번 선 뒤» 빠지면 잃음) · `serverMayHold`(잃었다고 읽은 자리를 서버가 아직 쥘 수 있다) · 첫 편집 전에
 * 스토어에 «막혔나»를 묻는 `claimable`. 셋 다 **서버의 판정을 화면이 한 번 더 짓는 것**이었고 틀렸다: 목록이 확인 **뒤에**
 * 거꾸로 닿아 거짓 잃음(C 리뷰 2 N4 — raw WS 5/210) · 서버가 세대로 버린 `lock`을 쥔 줄 앎(N3). 이제 서버가 판정하므로
 * 목록은 **배지와 선택 차단**(스토어)에만 쓰인다. 잃은 자리(TTL · 빠른 강등→승격)는 **다음에 보내는 `lock`**(첫 편집의 하트비트 ·
 * 재알림)이 서버에 묻는다 — 남이 잡았으면 거절이 온다.
 *
 * # 잡지 않은 선택 (이월 5차 리뷰 R3 · 2회 LK)
 *
 * 고른 자리가 **잡히지 않은 채** 남는 판이 둘 있다:
 *
 * | 판 | 왜 |
 * |---|---|
 * | **승격** — viewer 로 고른 자리를 든 채 editor 가 됐다(`useNodeLock`이 `keepUnclaimed`를 부른다) | 잡는 시각을 남(owner 의 PATCH · 다시 읽기 · 렌더)이 정하지 않게 한다(리뷰 R3). 사용자의 다음 행동이 잡는다 |
 * | **거절** — 서버가 `lock-denied`로 답했다(`denied`) | 남이 쥐었다. 선택은 남긴다 — 보던 것(속성 · 코멘트)과 치던 글을 지킨다. 편집 입구는 스토어가 남의 잠금으로 막는다(`lockedBy`) |
 *
 * 잡는 것은 **사용자의 다음 행동**이다: 다른 자리를 고르면 보통 경로(`hold`)로, 그 자리에서 첫 편집을 내면 `refresh`가 잡는다
 * — **막혔는지는 묻지 않고 보낸다.** 서버가 판정하고, 막혔으면 거절이 온다(그때 그 편집의 `patch`는 2차 방어가 423 으로
 * 막는다). **같은 자리를 다시 누르는 것은 잡지 않는다** — 선택이 안 바뀌어 아무것도 안 돈다(남는 틈).
 */
import type { RealtimeLink } from './connection'
import { UNLOCK_FRAME, lockFrame } from './protocol'

export interface LockChannel {
  /**
   * 이 자리를 잡는다. `pageId`나 `nodeId`가 없으면 **놓는다.**
   *
   * **같은 자리를 다시 부르면 아무것도 안 보낸다.** 선택은 안 바뀌었는데 스토어가 다른
   * 이유로 알릴 때마다 프레임이 나가면, 룸 전체가 그만큼 목록을 다시 받는다.
   */
  hold(pageId: string | null | undefined, nodeId: string | null): void
  /**
   * 이 자리를 **고른 채 잡지 않고** 둔다(위 «잡지 않은 선택» — 승격). 잡고 있던 것이 있으면 놓는다. 다음 `refresh`(첫 편집)가
   * 잡는다.
   */
  keepUnclaimed(pageId: string, nodeId: string): void
  /**
   * **편집이 나간다** — §7.2의 *"편집 중 하트비트로 갱신"*. 잡고 있는 것을 **한 번 더** 알리고, 잡지 않은 선택이 있으면
   * **이제 잡는다**(막혔으면 서버가 거절한다).
   *
   * `hold`와 갈라 두는 것은 이쪽이 **같은 자리여도 보내야** 하기 때문이다. 잡은 것도 잡지 않은 선택도 없으면
   * 아무것도 안 보낸다.
   */
  refresh(): void
  /**
   * **다시 붙었다** — 잡고 있던 것만 다시 알린다(끊기면 서버가 놓았다 — 그 사이 남이 잡았으면 서버가 거절한다). 잡지 않은
   * 선택은 **잡지 않는다** — 잡는 시각을 재연결이 정하지 않는다(리뷰 R4).
   */
  reannounce(): void
  /**
   * **서버가 그 `lock`을 받지 않았다**(`lock-denied`). **마지막으로 보낸 `lock`의 거절이고**(`lockId`) 잡은 줄 아는 자리가 그것이면
   * «잡지 않은 선택»으로 옮긴다 — 프레임은 안 보낸다(서버는 이 연결이 쥔 것을 이미 놓았다). 옛 차례의 거절이거나(그 뒤에 또
   * 보냈다) 다른 자리의 거절이면(그 사이 옮겨 갔다) 버린다.
   */
  denied(pageId: string, nodeId: string, lockId: number): void
  /** 연결 하나를 붙인다. **여기서 보내지 않는다** — 붙었다고 열린 것은 아니다. */
  attach(link: RealtimeLink): void
  /** 연결을 뗀다. **잡고 있던 자리는 기억한다** — 다시 붙으면 그것을 다시 잡는다. */
  detach(): void
}

interface Spot {
  pageId: string
  nodeId: string
}

const same = (a: Spot | null, pageId: string, nodeId: string): boolean =>
  a !== null && a.pageId === pageId && a.nodeId === nodeId

export function createLockChannel(): LockChannel {
  let link: RealtimeLink | null = null
  let held: Spot | null = null
  let unclaimed: Spot | null = null
  /** 마지막으로 보낸 `lock`의 차례. 거절은 이것과 같을 때만 받는다(머리말 «거절은 그 `lock` 프레임과 짝짓는다»). */
  let lastLockId = 0

  const send = (payload: string): void => {
    // **못 보내도 조용하다.** 잠금을 못 잡은 것은 편집 실패가 아니고, 다시 붙으면
    // `use-realtime.ts`의 `'open'` 갈래가 부르는 `reannounce()`가 같은 자리를 다시 알린다.
    // **`attach`가 아니다** — 그쪽은 링크만 갈아 끼운다(붙었다고 열린 것은 아니다).
    if (link !== null) link.send(payload)
  }

  /** `lock` 하나 — 차례를 올려 싣는다. **이 통로의 `lock`은 전부 여기로 나간다**(고르기 · 첫 편집 · 하트비트 · 재알림). */
  const sendLock = (at: Spot): void => {
    lastLockId += 1
    send(lockFrame(at.pageId, at.nodeId, lastLockId))
  }

  const claim = (at: Spot): void => {
    held = { pageId: at.pageId, nodeId: at.nodeId }
    unclaimed = null
    sendLock(at)
  }

  /** 잡은 것을 놓는다. 잡지 않은 선택은 서버에 없다(승격은 안 보냈고, 거절은 서버가 놓았다) — 보낼 것이 없다. */
  const letGo = (): void => {
    const mustUnlock = held !== null
    held = null
    unclaimed = null
    if (mustUnlock) send(UNLOCK_FRAME)
  }

  return {
    hold: (pageId, nodeId) => {
      if (pageId === null || pageId === undefined || nodeId === null) {
        letGo()
        return
      }
      if (same(held, pageId, nodeId)) return
      claim({ pageId, nodeId })
    },

    keepUnclaimed: (pageId, nodeId) => {
      if (held !== null) letGo()
      unclaimed = { pageId, nodeId }
    },

    refresh: () => {
      if (held !== null) {
        sendLock(held)
        return
      }
      if (unclaimed !== null) claim(unclaimed)
    },

    reannounce: () => {
      if (held !== null) sendLock(held)
    },

    denied: (pageId, nodeId, lockId) => {
      if (lockId !== lastLockId || !same(held, pageId, nodeId)) return
      held = null
      unclaimed = { pageId, nodeId }
    },

    attach: (next) => {
      link = next
    },

    detach: () => {
      link = null
    },
  }
}
