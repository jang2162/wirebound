/**
 * **노드 여럿을 고르는 판정(`selectionConflicts`)은 노드마다 따로 묻던 옛 판정과 답이 같다** — 무작위 트리 × 무작위 잠금으로 잰다.
 *
 * 옛 판정은 노드마다 `findNodePath`로 경로를 찾고 남의 잠금마다 다시 `findNodePath`로 경로를 찾아 세그먼트 접두로 견줬다(고른 수 ×
 * 남의 잠금 수 번의 문서 훑기 — `docs/superpowers/plans/2026-10-03-e2-review-2.md` N1). 새 판정은 문서를 한 번 돈다. **옛 판정의 사본이
 * 이 파일의 오라클이다** — 소스에는 남기지 않는다. 오라클은 포인터 규칙(`findNodePath` · 세그먼트 접두)으로 짓고 새 판정은 자리 번호로
 * 짓는다 — 같은 규칙으로 짓는 기대값은 판정과 같은 데서 틀린다(`CLAUDE.md` «포인터로 판정하는 장치는 포인터를 안 쓰는 오라클로»의 뒤집힌 꼴).
 *
 * 답은 노드마다 **어느 잠금이냐까지** 견준다(`toBe` — 같은 객체) — 화면의 배지가 그 잠금의 이름을 그린다. 겹치는 잠금이 여럿이면 옛
 * 판정은 목록의 차례로 첫 것을 냈다.
 */
import { describe, expect, it } from 'vitest'
import { selectionConflicts, type NodeLock } from '../src/lock'
import type { WbNode } from '../src/node'
import { parsePointer } from '../src/patch/pointer'
import { findNodePath } from '../src/tree'

/** 옛 판정의 사본 — `apps/api`의 `selectionVerdict`가 노드마다 부르던 `findLockConflict({ pointers: [findNodePath(root, nodeId)] })`. */
function oldVerdict(root: WbNode, locks: readonly NodeLock[], nodeIds: readonly string[], viewerUserId: string): (NodeLock | null)[] {
  const overlaps = (a: readonly string[], b: readonly string[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return false
    return true
  }
  return nodeIds.map((nodeId) => {
    const path = findNodePath(root, nodeId)
    if (path === undefined) return null
    const target = parsePointer(path)
    for (const lock of locks.filter((l) => l.userId !== viewerUserId)) {
      const lockPath = findNodePath(root, lock.nodeId)
      if (lockPath === undefined) continue
      if (overlaps(parsePointer(lockPath), target)) return lock
    }
    return null
  })
}

/** 씨앗을 받는 난수(mulberry32) — 실패한 판을 씨앗으로 다시 세운다. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Board {
  root: WbNode
  ids: string[]
  locks: NodeLock[]
  ask: string[]
}

const USERS = ['u_me', 'u_bora', 'u_dahye', 'u_sera']

/**
 * 판 하나 — 트리 모양(깊이 · 폭 · 노드 수)을 판마다 갈래로 고른다. 드물게 **같은 id 가 둘**인 트리를 짓는다(검증 전 문서 · 옛 판정은
 * 전위 순회의 첫 자리를 썼다). 잠금은 남(셋)과 나에게 나눠 주고 일부는 문서에 없는 노드를 가리킨다. 묻는 노드는 문서의 노드에 없는 id 를 섞는다.
 */
function board(seed: number): Board {
  const rnd = random(seed)
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
  const shape = pick(['deep', 'wide', 'bushy', 'tiny'] as const)
  const limit = shape === 'tiny' ? 1 + Math.floor(rnd() * 6) : 10 + Math.floor(rnd() * 70)
  const maxKids = shape === 'deep' ? 2 : shape === 'wide' ? 12 : 4
  const ids: string[] = []
  let count = 0
  const make = (depth: number): WbNode => {
    // 같은 id 둘 — 판의 5% 남짓에서 앞 노드의 id 를 다시 쓴다.
    const id = ids.length > 0 && rnd() < 0.05 ? pick(ids) : `n_${seed}_${count}`
    count += 1
    ids.push(id)
    const node: WbNode = { id, type: 'Box' }
    const kids = depth > (shape === 'deep' ? 40 : 8) ? 0 : Math.floor(rnd() * (maxKids + 1))
    const children: WbNode[] = []
    for (let i = 0; i < kids && count < limit; i += 1) children.push(make(depth + 1))
    if (children.length > 0 || rnd() < 0.3) node.children = children
    return node
  }
  const root = make(0)
  const distinct = [...new Set(ids)]
  const lockCount = Math.floor(rnd() * Math.min(10, distinct.length + 2))
  const locks: NodeLock[] = []
  for (let i = 0; i < lockCount; i += 1) {
    const userId = pick(USERS)
    locks.push({ nodeId: rnd() < 0.1 ? `n_gone_${i}` : pick(distinct), userId, userName: userId })
  }
  const ask = [...distinct, 'n_gone_ask']
  return { root, ids: distinct, locks, ask }
}

/** 판의 노드 하나가 어떤 꼴로 막혔나 — 카나리아가 센다. */
function kindOf(root: WbNode, nodeId: string, lock: NodeLock): 'self' | 'inside' | 'contains' {
  const at = findNodePath(root, nodeId)!
  const held = findNodePath(root, lock.nodeId)!
  if (at === held) return 'self'
  return at.startsWith(`${held}/`) ? 'inside' : 'contains'
}

describe('selectionConflicts — 옛 판정(노드마다 따로)과 같은 답', () => {
  it('무작위 트리 × 무작위 잠금 4000 판에서 노드마다 같은 잠금을 낸다', () => {
    const tally = { boards: 0, nodes: 0, blocked: 0, free: 0, self: 0, inside: 0, contains: 0, duplicateIds: 0, ghostLocks: 0, firstOfMany: 0 }
    for (let seed = 1; seed <= 4000; seed += 1) {
      const { root, locks, ask } = board(seed)
      const viewer = USERS[seed % USERS.length]!
      const expected = oldVerdict(root, locks, ask, viewer)
      const actual = selectionConflicts({ root, locks, nodeIds: ask, viewerUserId: viewer })
      expect(actual.length, `seed ${seed}`).toBe(ask.length)
      for (let i = 0; i < ask.length; i += 1) {
        expect(actual[i], `seed ${seed} · ${ask[i]}`).toBe(expected[i])
      }
      tally.boards += 1
      tally.nodes += ask.length
      if (locks.some((lock) => lock.nodeId.startsWith('n_gone_'))) tally.ghostLocks += 1
      let names = 0
      const walk = (node: WbNode) => {
        names += 1
        for (const child of node.children ?? []) walk(child)
      }
      walk(root)
      if (names > new Set(ask).size - 1) tally.duplicateIds += 1
      expected.forEach((lock, i) => {
        if (lock === null) {
          tally.free += 1
          return
        }
        tally.blocked += 1
        tally[kindOf(root, ask[i]!, lock)] += 1
        const against = locks.filter((l) => l.userId !== viewer && findNodePath(root, l.nodeId) !== undefined)
        if (against.filter((l) => oldVerdict(root, [l], [ask[i]!], viewer)[0] !== null).length > 1) tally.firstOfMany += 1
      })
    }
    // **카나리아 — 판이 실제로 겹침과 비겹침을 둘 다 넉넉히 낸다.** 무작위 판이 한쪽만 내면 두 판정이 «다 null» 로 같아 아무것도 안 잰다.
    // 꼴마다 하한(막힌 노드가 잠금 자신 · 잠금 안 · 잠금을 품음 · 겹치는 잠금이 여럿이라 차례가 고름)과 같은 id 둘 · 없는 노드의 잠금 판.
    console.log('ORACLE', JSON.stringify(tally))
    expect(tally.boards).toBe(4000)
    expect(tally.blocked).toBeGreaterThan(20_000)
    expect(tally.free).toBeGreaterThan(20_000)
    expect(tally.self).toBeGreaterThan(1000)
    expect(tally.inside).toBeGreaterThan(5000)
    expect(tally.contains).toBeGreaterThan(1000)
    expect(tally.firstOfMany).toBeGreaterThan(1000)
    expect(tally.duplicateIds).toBeGreaterThan(100)
    expect(tally.ghostLocks).toBeGreaterThan(100)
  })
})
