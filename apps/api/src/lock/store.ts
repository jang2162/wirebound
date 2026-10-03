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
 * # 연결 하나가 서브트리 여럿을 쥔다 — 집합째 갈아 끼운다
 *
 * 「소프트 잠금」이 *"노드를 **선택하면**"*이라고 적었고 선택은 노드 여럿이다(고른 서브트리마다 잠금 하나). 키는 `connectionId`이고
 * 값은 **한 페이지의 노드 집합**이다. `hold`는 그 집합을 **통째로** 갈아 끼운다 — 놓는 프레임을 빠뜨린 클라이언트가 잠금을 쌓지
 * 못한다(다음 프레임이 집합 전체를 다시 말한다). 겹침은 여기서 안 본다 — 부르는 쪽(`ws/lock.ts`)이 프레임마다 집합 전부를 판정하고
 * 막힌 것을 뺀 나머지를 넘긴다.
 *
 * **만료 · 해제는 집합째다**(설계서 「소프트 잠금」의 하트비트 · TTL · 연결 종료). 하트비트는 같은 집합을 다시 보내는 것이고, 남는
 * 노드마다 따로 만료를 두지 않는다 — 화면은 집합을 한 프레임으로 보낸다.
 *
 * **수명은 연결에 매여 있다**(「소프트 잠금」의 *"WS 연결 종료 시 즉시 해제"*). **충돌 판정은
 * 사람이다** — 그 갈림은 여기가 아니라 `@wirebound/schema`의 `findLockConflict`에 있다.
 */

/** 설계서 「소프트 잠금」의 TTL. */
export const LOCK_TTL_MS = 30_000

/**
 * 만료를 걷는 주기(`ws/index.ts`의 스위퍼). 배지는 TTL 뒤 **이 주기 안에** 사라진다. 한 번 훑는 값은 잠금을 쥔 연결 수만큼의
 * `Map` 순회다(집합은 연결마다 한 항목이다).
 */
export const LOCK_SWEEP_MS = 1_000

/** 연결 하나가 잡겠다고 낸 것 — 이 연결의 집합 **전부**다. 빈 집합은 놓는 것이다. */
export interface LockClaim {
  projectId: string
  pageId: string
  /**
   * 서브트리 뿌리들 — **중복이 없다**(프레임을 읽는 자리가 걷는다 — `ws/protocol.ts`의 `parseClientFrame`). 겹침(조상/자손)은 여기서
   * 안 본다 — 부르는 쪽이 판정을 지난 것만 넘긴다.
   */
  nodeIds: readonly string[]
  connectionId: string
  userId: string
  userName: string
}

/**
 * 지금 살아 있는 잠금 하나 — **서브트리 하나**다(집합을 쥔 연결은 그 수만큼 낸다). **`connectionId`가 없다** — 밖에서 이 값으로 하는 일은
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
   * 이 연결이 잡는 것을 이 집합으로 바꾼다. 같은 집합을 다시 잡는 것이 **하트비트**다(차례는 안 본다). 빈 집합은 `release`와 같다.
   *
   * **밖에서 보이는 것이 바뀌었으면 `true`다.** 하트비트는 만료 시각만 미루므로 `false`이고,
   * 그래서 부르는 쪽이 룸에 안 바뀐 목록을 다시 흘리지 않는다.
   */
  hold(claim: LockClaim): boolean
  /** 이 연결이 지금 쥔 것 — 없거나 만료됐으면 `null`(만료면 그 자리에서 걷는다). */
  heldBy(connectionId: string): { pageId: string; nodeIds: string[] } | null
  /** 이 연결이 잡고 있는 것을 놓는다. **놓은 것이 있었으면 `true`.** */
  release(connectionId: string): boolean
  /** 그 프로젝트에서 지금 살아 있는 잠금 전부. 넣은 순서를 지킨다(`Map`의 반복 순서). */
  liveIn(projectId: string): LiveLock[]
  /** 살아 있는 잠금(서브트리)의 수. 누수를 재는 자리가 쓴다. */
  liveCount(): number
  /** 만료된 것을 전부 걷는다 — 걷힌 것마다 `onExpired`가 불린다(위 «걷은 것은 알린다»). 읽는 자가 없는 방을 위한 것이다. */
  sweep(): void
}

interface LockRecord extends LockClaim {
  expiresAt: number
}

/** 두 집합이 같은가 — 차례는 안 본다(둘 다 중복이 없다). */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = new Set(a)
  return b.every((id) => left.has(id))
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
  /** 만료로 걷힌 연결의 집합 하나마다 — 그 집합의 프로젝트. **던지지 않아야 한다**(걷는 도중에 불린다). */
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
      const nodeIds = [...claim.nodeIds]
      if (nodeIds.length === 0) {
        held.delete(claim.connectionId)
        return before !== undefined
      }
      held.set(claim.connectionId, { ...claim, nodeIds, expiresAt: at + ttlMs })
      // 앞의 것이 같은 페이지의 같은 집합이었으면 밖에서 보이는 것은 그대로다.
      return before === undefined || before.pageId !== claim.pageId || !sameSet(before.nodeIds, nodeIds)
    },

    heldBy: (connectionId) => {
      const record = liveAt(connectionId, now())
      return record === undefined ? null : { pageId: record.pageId, nodeIds: [...record.nodeIds] }
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
        for (const nodeId of record.nodeIds) {
          found.push({ pageId: record.pageId, nodeId, userId: record.userId, userName: record.userName })
        }
      }
      return found
    },

    liveCount: () => {
      const at = now()
      let count = 0
      for (const connectionId of [...held.keys()]) {
        count += liveAt(connectionId, at)?.nodeIds.length ?? 0
      }
      return count
    },

    sweep: () => {
      const at = now()
      for (const connectionId of [...held.keys()]) liveAt(connectionId, at)
    },
  }
}
