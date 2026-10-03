/**
 * 잠금 저장소(설계서 「소프트 잠금」). **DB를 안 쓴다** — 이 저장소는 프로세스 메모리에 산다.
 *
 * # 시계를 주입한다 — 케이스가 30초를 기다리지 않는다
 *
 * 「소프트 잠금」의 TTL은 30초다. 만료를 타이머로 쓸어내면 *"만료됐다"*를 재는 유일한 길이
 * **실제로 기다리는 것**이 되고, 그런 케이스는 느린 데 그치지 않고 흔들린다 — 짧은 시간 창에
 * 기댄 케이스는 붐빌 때 떨어진다. **읽을 때 판정하면 시계가 인자가 된다**(`lock/store.ts`의
 * 「만료를 타이머로 쓸지 읽을 때 판정할지」 절) — 아래 케이스들이 `clock.value`를 밀어 만료를 잰다.
 */
import { describe, expect, it } from 'vitest'
import { LOCK_TTL_MS, createLockStore, type LockClaim, type LockStore } from '../src/lock/store'

/** 손으로 미는 시계. */
function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let value = start
  return {
    now: () => value,
    advance: (ms) => {
      value += ms
    },
  }
}

const PROJECT = 'p_1'
const OTHER_PROJECT = 'p_2'
const PAGE = 'pg_1'
const OTHER_PAGE = 'pg_2'

/** 노드 하나짜리는 `nodeId`로 적는다 — 집합 케이스만 `nodeIds`를 쓴다. */
function claim(over: Partial<Omit<LockClaim, 'nodeIds'>> & { nodeId?: string; nodeIds?: readonly string[] } = {}): LockClaim {
  const { nodeId = 'n_a', nodeIds, ...rest } = over
  return {
    projectId: PROJECT,
    pageId: PAGE,
    nodeIds: nodeIds ?? [nodeId],
    connectionId: 'wsc_1',
    userId: 'u_bora',
    userName: '보라',
    ...rest,
  }
}

function nodeIdsIn(store: LockStore, projectId = PROJECT): string[] {
  return store.liveIn(projectId).map((lock) => lock.nodeId)
}

describe('잡고 놓는다', () => {
  it('잡으면 그 프로젝트의 목록에 뜬다 — 배지가 읽을 값이 전부 실린다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)

    store.hold(claim())

    expect(store.liveIn(PROJECT)).toEqual([{ pageId: PAGE, nodeId: 'n_a', userId: 'u_bora', userName: '보라' }])
  })

  it('잡는 것은 집합을 갈아 끼우는 것이다 — 하나짜리로 다른 노드를 잡으면 앞 것이 사라진다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)

    store.hold(claim({ nodeId: 'n_a' }))
    store.hold(claim({ nodeId: 'n_b' }))

    expect(nodeIdsIn(store)).toEqual(['n_b'])
  })

  it('놓으면 사라진다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    expect(store.release('wsc_1')).toBe(true)
    expect(store.liveIn(PROJECT)).toEqual([])
  })

  it('놓을 것이 없는 연결을 놓는 것은 조용히 지난다 — 닫힘이 두 번 오는 경로가 있다', () => {
    const store = createLockStore(fakeClock().now)

    expect(store.release('wsc_없음')).toBe(false)
  })

  it('다른 프로젝트의 잠금은 안 보인다', () => {
    const store = createLockStore(fakeClock().now)

    store.hold(claim({ connectionId: 'wsc_1', projectId: PROJECT, nodeId: 'n_a' }))
    store.hold(claim({ connectionId: 'wsc_2', projectId: OTHER_PROJECT, nodeId: 'n_b' }))

    expect(nodeIdsIn(store, PROJECT)).toEqual(['n_a'])
    expect(nodeIdsIn(store, OTHER_PROJECT)).toEqual(['n_b'])
  })

  it('페이지가 여럿이면 각각 실린다 — 룸은 프로젝트 하나이고 프레임이 pageId를 나른다', () => {
    const store = createLockStore(fakeClock().now)

    store.hold(claim({ connectionId: 'wsc_1', pageId: PAGE, nodeId: 'n_a' }))
    store.hold(claim({ connectionId: 'wsc_2', pageId: OTHER_PAGE, nodeId: 'n_b' }))

    expect(store.liveIn(PROJECT).map((lock) => [lock.pageId, lock.nodeId])).toEqual([
      [PAGE, 'n_a'],
      [OTHER_PAGE, 'n_b'],
    ])
  })
})

/**
 * **연결 하나가 서브트리 여럿을 쥔다**(설계서 「소프트 잠금」 · 여러 노드 선택). `hold`는 그 연결의 집합을 통째로 갈아 끼운다 — 무엇이
 * 새로 들고 무엇이 남는지는 부르는 쪽(`ws/lock.ts`)이 `heldBy`로 읽어 판정한다. 만료는 집합째다(하트비트가 집합 전체를 미룬다).
 */
describe('집합', () => {
  it('셋을 잡으면 목록에 세 줄이 선다 — 잠금 하나가 서브트리 하나다', () => {
    const store = createLockStore(fakeClock().now)

    store.hold(claim({ nodeIds: ['n_a', 'n_b', 'n_c'] }))

    expect(store.liveIn(PROJECT)).toEqual([
      { pageId: PAGE, nodeId: 'n_a', userId: 'u_bora', userName: '보라' },
      { pageId: PAGE, nodeId: 'n_b', userId: 'u_bora', userName: '보라' },
      { pageId: PAGE, nodeId: 'n_c', userId: 'u_bora', userName: '보라' },
    ])
    expect(store.liveCount()).toBe(3)
    expect(store.heldBy('wsc_1')).toEqual({ pageId: PAGE, nodeIds: ['n_a', 'n_b', 'n_c'] })
  })

  it('집합을 줄이면 빠진 것만 사라진다 — 남은 것은 그대로다', () => {
    const store = createLockStore(fakeClock().now)
    store.hold(claim({ nodeIds: ['n_a', 'n_b', 'n_c'] }))

    expect(store.hold(claim({ nodeIds: ['n_a', 'n_c'] }))).toBe(true)

    expect(nodeIdsIn(store)).toEqual(['n_a', 'n_c'])
  })

  it('같은 집합을 다시 잡는 것(하트비트)은 차례가 달라도 안 바뀐 것이고 집합 전체의 만료를 미룬다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim({ nodeIds: ['n_a', 'n_b'] }))

    clock.advance(LOCK_TTL_MS - 1)
    expect(store.hold(claim({ nodeIds: ['n_b', 'n_a'] }))).toBe(false)
    clock.advance(LOCK_TTL_MS - 1)

    expect(nodeIdsIn(store).sort()).toEqual(['n_a', 'n_b'])
  })

  it('만료는 집합째다 — 걷히면 집합의 줄이 함께 사라지고 프로젝트가 한 번 불린다', () => {
    const clock = fakeClock()
    const expired: string[] = []
    const store = createLockStore(clock.now, LOCK_TTL_MS, (projectId) => expired.push(projectId))
    store.hold(claim({ nodeIds: ['n_a', 'n_b'] }))

    clock.advance(LOCK_TTL_MS)

    expect(store.heldBy('wsc_1')).toBeNull()
    expect(store.liveIn(PROJECT)).toEqual([])
    expect(expired).toEqual([PROJECT])
  })

  it('빈 집합을 잡는 것은 놓는 것이다', () => {
    const store = createLockStore(fakeClock().now)
    store.hold(claim({ nodeIds: ['n_a', 'n_b'] }))

    expect(store.hold(claim({ nodeIds: [] }))).toBe(true)

    expect(store.liveIn(PROJECT)).toEqual([])
    expect(store.heldBy('wsc_1')).toBeNull()
  })

  it('놓으면 집합 전부가 사라진다', () => {
    const store = createLockStore(fakeClock().now)
    store.hold(claim({ nodeIds: ['n_a', 'n_b'] }))

    expect(store.release('wsc_1')).toBe(true)

    expect(store.liveCount()).toBe(0)
  })
})

describe('연결 둘·사용자 둘·같은 사용자의 탭 둘', () => {
  it('사용자 둘이 각각 자기 잠금을 갖는다', () => {
    const store = createLockStore(fakeClock().now)

    store.hold(claim({ connectionId: 'wsc_1', userId: 'u_bora', userName: '보라', nodeId: 'n_a' }))
    store.hold(claim({ connectionId: 'wsc_2', userId: 'u_dahye', userName: '다혜', nodeId: 'n_b' }))

    expect(store.liveIn(PROJECT).map((lock) => [lock.userId, lock.nodeId])).toEqual([
      ['u_bora', 'n_a'],
      ['u_dahye', 'n_b'],
    ])
  })

  it('같은 사용자의 탭 둘은 연결 둘이고 잠금도 둘이다 — 수명이 연결에 매여 있다(설계서 「소프트 잠금」)', () => {
    const store = createLockStore(fakeClock().now)

    store.hold(claim({ connectionId: 'wsc_1', userId: 'u_bora', nodeId: 'n_a' }))
    store.hold(claim({ connectionId: 'wsc_2', userId: 'u_bora', nodeId: 'n_b' }))

    expect(nodeIdsIn(store)).toEqual(['n_a', 'n_b'])

    // 한 탭이 닫혀도 다른 탭의 잠금은 남는다.
    store.release('wsc_1')
    expect(nodeIdsIn(store)).toEqual(['n_b'])
  })
})

describe('TTL 30초 — 읽을 때 판정한다', () => {
  it('TTL이 설계서 「소프트 잠금」의 30초다', () => {
    expect(LOCK_TTL_MS).toBe(30_000)
  })

  it('TTL 직전까지는 살아 있다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    clock.advance(LOCK_TTL_MS - 1)

    expect(nodeIdsIn(store)).toEqual(['n_a'])
  })

  it('TTL이 지나면 사라진다 — 기다리지 않고 시계를 민다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    clock.advance(LOCK_TTL_MS)

    expect(store.liveIn(PROJECT)).toEqual([])
  })

  it('하트비트가 만료를 미룬다 — 설계서 「소프트 잠금」의 *"편집 중 하트비트로 갱신"*', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    clock.advance(LOCK_TTL_MS - 1)
    store.hold(claim())
    clock.advance(LOCK_TTL_MS - 1)

    expect(nodeIdsIn(store)).toEqual(['n_a'])
  })

  it('만료된 잠금은 읽을 때 실제로 지워진다 — 안 지우면 연결 수만큼 남는다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim({ connectionId: 'wsc_1' }))
    store.hold(claim({ connectionId: 'wsc_2', projectId: OTHER_PROJECT }))

    clock.advance(LOCK_TTL_MS)
    // 한 프로젝트만 읽어도 **훑은 것 전부**에서 만료를 걷어 낸다.
    store.liveIn(PROJECT)

    expect(store.liveCount()).toBe(0)
  })

  it('만료된 잠금을 놓는 것은 놓을 것이 없는 것과 같다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    clock.advance(LOCK_TTL_MS)

    expect(store.release('wsc_1')).toBe(false)
  })
})

/**
 * **걷은 것은 알린다 — 한 자리에서**(`lock/store.ts`의 같은 제목 절). 조용히 걷으면 배지가 다음 알림까지 남는다.
 * 걷는 길(읽기 · 놓기 · 스위퍼)이 어디든 걷힌 잠금마다 그 프로젝트가 한 번 불린다. 혼자 죽는 변조: 걷는 자리(`liveAt`)가
 * `onExpired`를 안 부른다(`ws-lock`의 «TTL 을 넘긴 잠금은 읽는 자가 없어도 걷히고 방에 빈 목록이 흐른다»도 함께 죽는다 — 그쪽은 스위퍼를 거는 축의 주인이다).
 */
describe('만료를 알린다', () => {
  it('걷힌 잠금마다 그 프로젝트가 한 번 불린다 — 스위퍼 · 읽기 · 놓기 어디서 걷히든', () => {
    const clock = fakeClock()
    const expired: string[] = []
    const store = createLockStore(clock.now, LOCK_TTL_MS, (projectId) => expired.push(projectId))
    store.hold(claim({ connectionId: 'wsc_1' }))
    store.hold(claim({ connectionId: 'wsc_2', projectId: OTHER_PROJECT }))
    store.hold(claim({ connectionId: 'wsc_3' }))

    store.sweep()
    expect(expired).toEqual([])

    clock.advance(LOCK_TTL_MS)
    expect(store.release('wsc_3')).toBe(false)
    expect(expired).toEqual([PROJECT])
    store.sweep()
    expect(expired.sort()).toEqual([OTHER_PROJECT, PROJECT, PROJECT].sort())
    store.sweep()
    store.liveIn(PROJECT)
    expect(expired).toHaveLength(3)
  })
})

describe('무엇이 바뀌었는지 낸다 — 안 바뀐 것을 룸에 알리지 않으려고', () => {
  it('새 노드를 잡으면 바뀌었다고 한다', () => {
    const store = createLockStore(fakeClock().now)

    expect(store.hold(claim({ nodeId: 'n_a' }))).toBe(true)
    expect(store.hold(claim({ nodeId: 'n_b' }))).toBe(true)
  })

  it('같은 노드를 다시 잡는 것(하트비트)은 안 바뀐 것이다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    clock.advance(1000)

    expect(store.hold(claim())).toBe(false)
  })

  it('만료된 뒤 같은 노드를 다시 잡는 것은 바뀐 것이다 — 그 사이 목록에서 사라졌다', () => {
    const clock = fakeClock()
    const store = createLockStore(clock.now)
    store.hold(claim())

    clock.advance(LOCK_TTL_MS)

    expect(store.hold(claim())).toBe(true)
  })
})
