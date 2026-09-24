/**
 * 소프트 잠금 저장소(설계서 「소프트 잠금」). **인터페이스 뒤에 인메모리 구현 하나다.**
 *
 * 「소프트 잠금」: *"MVP는 서버 인메모리 저장소를 쓰되 인터페이스를 분리해, 다중 인스턴스 확장 시
 * Redis 구현으로 교체한다."* `ws/rooms.ts`가 룸에 대해 같은 자세를 취했고, 그 파일의
 * *"단일 인스턴스 가정이 박히는 자리"* 표에 **이 파일도 한 줄로 들어 있다.**
 *
 * # 만료를 타이머로 쓸지 읽을 때 판정할지
 *
 * **읽을 때 판정한다.** 타이머는 *"만료됐다"*를 재는 유일한 길을 **실제로 30초를 기다리는
 * 것**으로 만든다 — 몇 초짜리 시간 창에 기댄 케이스는 기계가 붐비면 통과했다 떨어졌다
 * 한다. 읽을 때 판정하면 시계가 **인자**가 되고, 케이스는
 * `now`를 밀어 만료를 잰다.
 *
 * **읽을 때 실제로 지운다.** 판정만 하고 두면 만료된 항목이 `Map`에 남아, 연결이 오간
 * 만큼 자란다. `liveIn`은 훑은 항목 중 만료된 것을 그 자리에서 걷어 낸다.
 *
 * # 걷은 것은 알린다 — 한 자리에서
 *
 * **조용히 걷으면 배지가 다음 `locks` 알림까지 남는다** — 조용한 방이면 끝이 없고, 그동안 남의 화면은 그 자리를 못 고른다.
 * 그래서 **걷는 자리(`liveAt`) 하나가 `onExpired`를 부른다** —
 * `liveIn` · `hold` · `release` · `sweep` 어디서 걷히든 같은 길이다. 부르는 쪽(`ws/index.ts`)이 그 방에 목록을 알린다.
 * 읽는 자가 없는 방을 위해 **`sweep`을 주기로 부르는 것도 그쪽이다**(`LOCK_SWEEP_MS`) — 스위퍼는 걷기만 하고 알림은 이 한
 * 갈래로 모인다. 시계는 여전히 인자다 — 케이스는 `now`를 밀고 `sweep`을 부른다.
 *
 * # 연결 하나가 드는 잠금은 하나다
 *
 * 「소프트 잠금」이 *"노드를 **선택하면**"*이라고 적었고 선택은 하나다. 그래서 키가 `connectionId`이고,
 * 새로 잡으면 앞의 것이 그 자리에서 대체된다 — 놓는 프레임을 빠뜨린 클라이언트가 잠금을
 * 쌓지 못한다.
 *
 * **수명은 연결에 매여 있다**(「소프트 잠금」의 *"WS 연결 종료 시 즉시 해제"*). **충돌 판정은
 * 사람이다** — 그 갈림은 여기가 아니라 `@wirebound/schema`의 `findLockConflict`에 있다.
 */

/** 설계서 「소프트 잠금」의 TTL. */
export const LOCK_TTL_MS = 30_000

/**
 * 만료를 걷는 주기(`ws/index.ts`의 스위퍼). 배지는 TTL 뒤 **이 주기 안에** 사라진다. 한 번 훑는 값은 살아 있는 잠금 수(연결 수)
 * 만큼의 `Map` 순회다.
 */
export const LOCK_SWEEP_MS = 1_000

/** 연결 하나가 잡겠다고 낸 것. */
export interface LockClaim {
  projectId: string
  pageId: string
  nodeId: string
  connectionId: string
  userId: string
  userName: string
}

/**
 * 지금 살아 있는 잠금 하나. **`connectionId`가 없다** — 밖에서 이 값으로 하는 일은
 * 프레임에 실어 보내는 것뿐이고, 충돌 판정은 사람 단위라 연결 id를 쓸 자리가 없다.
 */
export interface LiveLock {
  pageId: string
  nodeId: string
  userId: string
  userName: string
}

export interface LockStore {
  /**
   * 이 연결이 잡는 것을 이것으로 바꾼다. 같은 노드를 다시 잡는 것이 **하트비트**다.
   *
   * **밖에서 보이는 것이 바뀌었으면 `true`다.** 하트비트는 만료 시각만 미루므로 `false`이고,
   * 그래서 부르는 쪽이 룸에 안 바뀐 목록을 다시 흘리지 않는다.
   */
  hold(claim: LockClaim): boolean
  /** 이 연결이 잡고 있는 것을 놓는다. **놓은 것이 있었으면 `true`.** */
  release(connectionId: string): boolean
  /** 그 프로젝트에서 지금 살아 있는 잠금 전부. 넣은 순서를 지킨다(`Map`의 반복 순서). */
  liveIn(projectId: string): LiveLock[]
  /** 살아 있는 잠금의 수. 누수를 재는 자리가 쓴다. */
  liveCount(): number
  /** 만료된 것을 전부 걷는다 — 걷힌 것마다 `onExpired`가 불린다(위 «걷은 것은 알린다»). 읽는 자가 없는 방을 위한 것이다. */
  sweep(): void
}

interface LockRecord extends LockClaim {
  expiresAt: number
}

/**
 * 프로세스 메모리에 사는 구현.
 *
 * **시계를 인자로 받는다.** 이 파일의 유일한 환경 의존이고, 주입하면 그것마저 없어진다
 * (`store/editor-store.ts`의 `nextOpId`가 같은 자세다).
 */
export function createLockStore(
  now: () => number = Date.now,
  ttlMs: number = LOCK_TTL_MS,
  /** 만료로 걷힌 잠금 하나마다 — 그 잠금의 프로젝트. **던지지 않아야 한다**(걷는 도중에 불린다). */
  onExpired: (projectId: string) => void = () => {},
): LockStore {
  const held = new Map<string, LockRecord>()

  /** 만료됐으면 그 자리에서 지우고 `undefined`. **걷는 자리는 여기 하나다** — 알림도 여기서 나간다. */
  const liveAt = (connectionId: string, at: number): LockRecord | undefined => {
    const record = held.get(connectionId)
    if (record === undefined) return undefined
    if (record.expiresAt <= at) {
      held.delete(connectionId)
      onExpired(record.projectId)
      return undefined
    }
    return record
  }

  return {
    hold: (claim) => {
      const at = now()
      const before = liveAt(claim.connectionId, at)
      held.set(claim.connectionId, { ...claim, expiresAt: at + ttlMs })
      // 앞의 것이 같은 자리를 가리키고 있었으면 밖에서 보이는 것은 그대로다.
      return before === undefined || before.nodeId !== claim.nodeId || before.pageId !== claim.pageId
    },

    release: (connectionId) => {
      const at = now()
      const live = liveAt(connectionId, at)
      held.delete(connectionId)
      return live !== undefined
    },

    liveIn: (projectId) => {
      const at = now()
      const found: LiveLock[] = []
      for (const connectionId of [...held.keys()]) {
        const record = liveAt(connectionId, at)
        if (record === undefined || record.projectId !== projectId) continue
        found.push({
          pageId: record.pageId,
          nodeId: record.nodeId,
          userId: record.userId,
          userName: record.userName,
        })
      }
      return found
    },

    liveCount: () => {
      const at = now()
      let count = 0
      for (const connectionId of [...held.keys()]) {
        if (liveAt(connectionId, at) !== undefined) count += 1
      }
      return count
    },

    sweep: () => {
      const at = now()
      for (const connectionId of [...held.keys()]) liveAt(connectionId, at)
    },
  }
}
