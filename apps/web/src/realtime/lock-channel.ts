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
 * | 답 | `patch-ack`/`patch-error`가 짝지어 온다 | 짝이 없다 — 룸 전체로 오는 `locks` 목록이 답이다 |
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
 * 그래서 잡은 자리를 기억하고, **다시 붙을 때 `refresh()`가 그것을 다시 보낸다**
 * (`use-realtime.ts`의 `'open'` 갈래). 하트비트와 같은 함수인 것은 하는 일이 같기 때문이다.
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
   * 잡고 있는 것을 **한 번 더** 알린다 — §7.2의 *"편집 중 하트비트로 갱신"*.
   *
   * `hold`와 갈라 두는 것은 이쪽이 **같은 자리여도 보내야** 하기 때문이다. 잡은 것이 없으면
   * 아무것도 안 보낸다.
   */
  refresh(): void
  /** 연결 하나를 붙인다. **여기서 보내지 않는다** — 붙었다고 열린 것은 아니다. */
  attach(link: RealtimeLink): void
  /** 연결을 뗀다. **잡고 있던 자리는 기억한다** — 다시 붙으면 그것을 다시 잡는다. */
  detach(): void
}

interface Held {
  pageId: string
  nodeId: string
}

export function createLockChannel(): LockChannel {
  let link: RealtimeLink | null = null
  let held: Held | null = null

  const send = (payload: string): void => {
    // **못 보내도 조용하다.** 잠금을 못 잡은 것은 편집 실패가 아니고, 다시 붙으면
    // `attach`가 같은 자리를 다시 알린다.
    if (link !== null) link.send(payload)
  }

  return {
    hold: (pageId, nodeId) => {
      if (pageId === null || pageId === undefined || nodeId === null) {
        if (held === null) return
        held = null
        send(UNLOCK_FRAME)
        return
      }
      if (held !== null && held.pageId === pageId && held.nodeId === nodeId) return
      held = { pageId, nodeId }
      send(lockFrame(pageId, nodeId))
    },

    refresh: () => {
      if (held === null) return
      send(lockFrame(held.pageId, held.nodeId))
    },

    attach: (next) => {
      link = next
    },

    detach: () => {
      link = null
    },
  }
}
