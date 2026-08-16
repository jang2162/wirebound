/**
 * 잠금 저장소(§7.2 · P3-3 T1 · D5). **DB를 안 쓴다** — 이 저장소는 프로세스 메모리에 산다.
 *
 * # 시계를 주입한다 — 케이스가 30초를 기다리지 않는다
 *
 * §7.2의 TTL은 30초다. 만료를 타이머로 쓸어내면 *"만료됐다"*를 재는 유일한 길이 **실제로
 * 기다리는 것**이 되고, 그런 케이스는 느린 데 그치지 않고 흔들린다(앞 슬라이스가 3초 창에
 * 기댄 케이스로 3회 중 1회만 통과하는 flake를 냈다). **읽을 때 판정하면 시계가 인자가 된다**
 * (재라 #6) — 아래 케이스들이 `clock.value`를 밀어 만료를 잰다.
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

function claim(over: Partial<LockClaim> = {}): LockClaim {
  return {
    projectId: PROJECT,
    pageId: PAGE,
    nodeId: 'n_a',
    connectionId: 'wsc_1',
    userId: 'u_bora',
    userName: '보라',
    ...over,
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

  it('연결 하나가 드는 잠금은 하나다 — 다른 노드를 잡으면 앞 것이 사라진다', () => {
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

  it('같은 사용자의 탭 둘은 연결 둘이고 잠금도 둘이다 — 수명이 연결에 매여 있다(§7.2)', () => {
    const store = createLockStore(fakeClock().now)

    store.hold(claim({ connectionId: 'wsc_1', userId: 'u_bora', nodeId: 'n_a' }))
    store.hold(claim({ connectionId: 'wsc_2', userId: 'u_bora', nodeId: 'n_b' }))

    expect(nodeIdsIn(store)).toEqual(['n_a', 'n_b'])

    // 한 탭이 닫혀도 다른 탭의 잠금은 남는다.
    store.release('wsc_1')
    expect(nodeIdsIn(store)).toEqual(['n_b'])
  })
})

describe('TTL 30초 — 읽을 때 판정한다 (D5)', () => {
  it('TTL이 §7.2의 30초다', () => {
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

  it('하트비트가 만료를 미룬다 — §7.2의 *"편집 중 하트비트로 갱신"*', () => {
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
