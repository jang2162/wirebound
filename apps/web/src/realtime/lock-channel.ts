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
 * (`use-realtime.ts`의 `'open'` 갈래 — `reannounce`).
 *
 * # 잡지 않은 선택 (이월 5차 리뷰 R3 · R4)
 *
 * 고른 자리가 **잡히지 않은 채** 남는 판이 둘 있다. 둘 다 «그 자리를 지금 잡는다»를 **사용자가 안 정한** 순간이다:
 *
 * | 판 | 왜 곧장 잡지 않나 |
 * |---|---|
 * | **승격** — viewer 로 고른 자리를 든 채 editor 가 됐다(`useNodeLock`이 `keepUnclaimed`를 부른다) | 잡는 시각을 남(owner 의 PATCH · 다시 읽기 · 렌더)이 정한다. 그 순간 같은 자리를 누른 editor 는 그 시각을 볼 신호가 없어 **겹친 잠금**이 선다(Chrome: 겹침 17/48 — editor 둘의 보통 경합은 1/48) |
 * | **잃음** — 잡은 줄 아는 자리가 서버의 `locks` 목록에서 빠졌다(`observe`) | 서버가 놓았다(빠른 강등→승격 · TTL). 그 사이 남이 잡았을 수 있다 — 다시 붙을 때 그대로 다시 보내면 **겹친 잠금**이 선다(Chrome: 앨리스가 잡은 카드에 캐럴의 재연결이 `lock`을 다시 보냄) |
 *
 * 그 자리는 **읽기로** 남는다(속성이 보이고 고칠 칸도 켜져 있다 — 남이 안 잡았으면). 잡는 것은 **사용자의 다음 행동**이다:
 * 다른 자리를 고르면 보통 경로(`hold`)로, 그 자리에서 첫 편집을 내면 `refresh`가 잡는다 — 그때 **남에게 막혔으면 잡지 않는다**
 * (`claimable` — 판정은 스토어 한 자리 그대로다). 그래서 잡는 시각은 늘 그 사람이 정하고, 남은 그 순간을 보통 경합과 같은
 * 조건으로 본다. **같은 자리를 다시 누르는 것은 잡지 않는다** — 선택이 안 바뀌어 아무것도 안 돈다(남는 틈 · 보고).
 */
import { locksAgainst } from '@wirebound/schema'
import type { RealtimeLink } from './connection'
import { UNLOCK_FRAME, lockFrame, type NodeLockView } from './protocol'

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
   * `claimable`을 물어 잡는다.
   */
  keepUnclaimed(pageId: string, nodeId: string): void
  /**
   * **편집이 나간다** — §7.2의 *"편집 중 하트비트로 갱신"*. 잡고 있는 것을 **한 번 더** 알리고, 잡지 않은 선택이 있으면
   * (막히지 않았을 때) **이제 잡는다**.
   *
   * `hold`와 갈라 두는 것은 이쪽이 **같은 자리여도 보내야** 하기 때문이다. 잡은 것도 잡지 않은 선택도 없으면
   * 아무것도 안 보낸다.
   */
  refresh(): void
  /**
   * **다시 붙었다** — 잡고 있던 것만 다시 알린다(끊기면 서버가 놓았다). 잡지 않은 선택은 **잡지 않는다** — 잡는 시각을
   * 재연결이 정하게 된다(위 표의 둘째 줄이 그 판이다).
   */
  reannounce(): void
  /**
   * 서버의 `locks` 목록(프로젝트 전부)을 본다. **잡은 줄 아는 자리가 목록에 한 번 선 뒤에 빠졌으면** 잃은 것으로 읽고
   * 잡지 않은 선택으로 옮긴다(위 표의 둘째 줄). 프레임은 보내지 않는다.
   *
   * **한 번 선 뒤에만 본다** — `lock`을 보낸 직후에 오는 목록은 서버가 그것을 처리하기 **전에** 짠 것일 수 있다
   * (`announceLocks`는 목록을 짠 뒤 연결마다 자격을 보고 보낸다 — 앞뒤로 짠 두 목록이 거꾸로 닿을 수 있다). 그래서 빠진
   * 것을 봤어도 «서버가 아직 쥐고 있을 수 있다»로 적어 두고, 놓을 때 `unlock`을 보낸다.
   *
   * 내 것인지는 **사람 · 페이지 · 노드**로 본다 — 목록에 연결 id 가 없다(`apps/api/src/lock/store.ts`의 `LiveLock`). 같은
   * 사람의 다른 탭이 같은 자리를 쥐고 있으면 그것을 내 것으로 읽는다(남는 틈). **«누구의 것인가»는 여기서 비교하지 않는다** —
   * `@wirebound/schema`의 `locksAgainst`(D3 — 소유자 판정의 한 자리)가 남의 것으로 고른 것을 빼고 남은 것이 내 것이다
   * (`test/lock/one-verdict.test.ts`의 «소유자 비교가 `packages/schema` 밖에 없다»).
   */
  observe(locks: readonly NodeLockView[], viewerUserId: string | null): void
  /**
   * 잡지 않은 선택을 **지금 잡아도 되는가**를 묻는 자리 — `useNodeLock`이 스토어의 판정(`selectionBlockedBy`)을 건다.
   * 없으면 막는 것이 없다고 본다(`RealtimeProvider` 없이 스토어만 쓰는 자리).
   */
  setClaimable(claimable: ((pageId: string, nodeId: string) => boolean) | null): void
  /** 연결 하나를 붙인다. **여기서 보내지 않는다** — 붙었다고 열린 것은 아니다. */
  attach(link: RealtimeLink): void
  /** 연결을 뗀다. **잡고 있던 자리는 기억한다** — 다시 붙으면 그것을 다시 잡는다. */
  detach(): void
}

interface Held {
  pageId: string
  nodeId: string
}

interface Unclaimed extends Held {
  /** 서버가 아직 쥐고 있을 수 있다(`observe`가 옮긴 것) — 놓을 때 `unlock`을 보낸다. 승격이 둔 것은 서버에 없다. */
  serverMayHold: boolean
}

export function createLockChannel(): LockChannel {
  let link: RealtimeLink | null = null
  let held: Held | null = null
  /** 잡은 자리가 서버의 목록에 한 번 섰는가(`observe`). `lock`을 새로 보낼 때마다 내린다. */
  let confirmed = false
  let unclaimed: Unclaimed | null = null
  let claimable: ((pageId: string, nodeId: string) => boolean) | null = null

  const send = (payload: string): void => {
    // **못 보내도 조용하다.** 잠금을 못 잡은 것은 편집 실패가 아니고, 다시 붙으면
    // `use-realtime.ts`의 `'open'` 갈래가 부르는 `refresh()`가 같은 자리를 다시 알린다.
    // **`attach`가 아니다** — 그쪽은 링크만 갈아 끼운다(붙었다고 열린 것은 아니다).
    if (link !== null) link.send(payload)
  }

  const claim = (at: Held): void => {
    held = { pageId: at.pageId, nodeId: at.nodeId }
    unclaimed = null
    confirmed = false
    send(lockFrame(at.pageId, at.nodeId))
  }

  /** 잡은 것 · 서버가 쥐고 있을 수 있는 잡지 않은 선택을 놓는다. 보낼 것이 없으면 조용하다. */
  const letGo = (): void => {
    const mustUnlock = held !== null || unclaimed?.serverMayHold === true
    held = null
    unclaimed = null
    confirmed = false
    if (mustUnlock) send(UNLOCK_FRAME)
  }

  return {
    hold: (pageId, nodeId) => {
      if (pageId === null || pageId === undefined || nodeId === null) {
        letGo()
        return
      }
      if (held !== null && held.pageId === pageId && held.nodeId === nodeId) return
      claim({ pageId, nodeId })
    },

    keepUnclaimed: (pageId, nodeId) => {
      if (held !== null) letGo()
      unclaimed = { pageId, nodeId, serverMayHold: unclaimed?.serverMayHold ?? false }
    },

    refresh: () => {
      if (held !== null) {
        send(lockFrame(held.pageId, held.nodeId))
        return
      }
      if (unclaimed === null) return
      if (claimable !== null && !claimable(unclaimed.pageId, unclaimed.nodeId)) return
      claim(unclaimed)
    },

    reannounce: () => {
      // 끊기면 서버가 놓았다 — 잡지 않은 선택은 이제 서버에 없다.
      if (unclaimed !== null) unclaimed = { ...unclaimed, serverMayHold: false }
      if (held === null) return
      confirmed = false
      send(lockFrame(held.pageId, held.nodeId))
    },

    observe: (locks, viewerUserId) => {
      if (held === null || viewerUserId === null) return
      const at = held
      const others = new Set(locksAgainst(locks, viewerUserId))
      if (locks.some((lock) => !others.has(lock) && lock.pageId === at.pageId && lock.nodeId === at.nodeId)) {
        confirmed = true
        return
      }
      if (!confirmed) return
      held = null
      confirmed = false
      unclaimed = { ...at, serverMayHold: true }
    },

    setClaimable: (next) => {
      claimable = next
    },

    attach: (next) => {
      link = next
    },

    detach: () => {
      link = null
    },
  }
}
