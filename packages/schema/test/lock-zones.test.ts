/**
 * **구역 안 노드의 잠금** — 구역(`zones`) 안 노드를 남이 잡았을 때 그 부모 · 형제 · 조상 편집과 고르기가 몸통(`children`)과 같은 규칙으로 막히는가
 * (설계 spec `2026-10-23-node-slots-design.md` 「그 밖의 소비자」 의 잠금 줄). 판정 규칙은 그대로 «경로가 조상 관계면 부딪친다»이고, 바뀌는 것은
 * 손 순회(`selectionConflicts`)가 `childLists`를 도는 것뿐이다.
 *
 * 무작위 판은 `lock-ops-identity.test.ts`의 오라클(객체 정체성)을 구역이 든 문서로 돌린다 — 판정이 포인터 따라가기에서 구역 경로를 몸통과 다르게
 * 읽으면 오라클과 갈린다. 고르기는 경로 접두로 지은 옛 판정(노드마다 따로)과 견준다.
 *
 * **케이스 여럿이 늘 함께 죽는다** — 편집 쪽은 몸통에서 이미 서던 경로 일반 기전(`lockConflictOfOps` 의 겹침 · 자리 따라가기 · 잠긴 노드의
 * 경로 찾기)이 구역 경로에도 서는지 잠그는 성질 케이스라, 그 기전을 떼는 변조는 조상 쪽 · 자손 쪽 · 옮김을 함께 죽인다. 고르기 쪽은
 * `selectionConflicts` 의 순회 하나에 매여 같다. «순회가 구역을 도는가»의 축은 소스 쪽에서 `zones-census.test.ts` 가 갖는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { findLockConflict, lockConflictOfOps, selectionConflicts, type NodeLock } from '../src/lock'
import type { WbNode } from '../src/node'
import { addAt, applyOpInPlace, removeAt } from '../src/patch/apply'
import { getByPointer, parsePointer } from '../src/patch/pointer'
import type { PatchOp } from '../src/patch/types'
import { findNodePath, walkNodes } from '../src/tree'

beforeAll(() => {
  installCatalog()
})

const BORA = (nodeId: string): NodeLock => ({ nodeId, userId: 'u_bora', userName: '보라' })

/** 카드 하나 — 머리 오른쪽에 단추 둘(`n_edit` · `n_del`), 몸통에 키-값, 바닥에 단추 하나. */
function card(): WbNode {
  return {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_before', type: 'Text', props: { content: '앞' } },
      {
        id: 'n_card',
        type: 'Card',
        props: { title: '회원 정보' },
        children: [{ id: 'n_kv', type: 'KeyValue' }],
        zones: {
          headEnd: [
            { id: 'n_edit', type: 'Button', props: { label: '수정' } },
            { id: 'n_del', type: 'Button', props: { label: '삭제' } },
          ],
          footer: [{ id: 'n_list', type: 'Button', props: { label: '목록' } }],
        },
      },
    ],
  }
}

const opsVerdict = (ops: PatchOp[], locks: NodeLock[]) =>
  lockConflictOfOps({ document: { root: card() }, locks, ops, viewerUserId: 'u_me' })?.nodeId ?? null

describe('편집 — 구역 안 노드를 남이 잡았다', () => {
  const locked = [BORA('n_del')]

  it('그 노드 · 그 안을 고치면 막힌다', () => {
    expect(opsVerdict([{ op: 'replace', path: '/root/children/1/zones/headEnd/1/props/label', value: '지움' }], locked)).toBe('n_del')
    expect(opsVerdict([{ op: 'remove', path: '/root/children/1/zones/headEnd/1' }], locked)).toBe('n_del')
  })

  it('부모(카드)를 지우거나 덮으면 막힌다 — 조상 쪽', () => {
    expect(opsVerdict([{ op: 'remove', path: '/root/children/1' }], locked)).toBe('n_del')
    expect(opsVerdict([{ op: 'replace', path: '/root/children/1', value: { id: 'n_x', type: 'Text' } }], locked)).toBe('n_del')
    expect(opsVerdict([{ op: 'replace', path: '/root', value: { id: 'n_r', type: 'Page' } }], locked)).toBe('n_del')
  })

  it('구역째 지우거나 덮으면 막힌다 — `zones` 맵 · 그 구역 배열', () => {
    expect(opsVerdict([{ op: 'remove', path: '/root/children/1/zones/headEnd' }], locked)).toBe('n_del')
    expect(opsVerdict([{ op: 'remove', path: '/root/children/1/zones' }], locked)).toBe('n_del')
    expect(opsVerdict([{ op: 'replace', path: '/root/children/1/zones', value: {} }], locked)).toBe('n_del')
  })

  it('구역 사이 옮김 — 잠긴 노드를 옮기면 막히고, 형제를 옮기면 지난다', () => {
    expect(opsVerdict([{ op: 'move', from: '/root/children/1/zones/headEnd/1', path: '/root/children/1/zones/footer/0' }], locked)).toBe(
      'n_del',
    )
    expect(
      opsVerdict([{ op: 'move', from: '/root/children/1/zones/headEnd/0', path: '/root/children/1/zones/footer/0' }], locked),
    ).toBeNull()
  })

  it('형제를 빼 자리가 당겨진 뒤 그 자리를 고치면 막힌다 — 좌표를 연산마다 따라간다', () => {
    // 앞 형제(n_edit)를 빼면 n_del 이 headEnd/0 이 된다.
    expect(
      opsVerdict(
        [
          { op: 'remove', path: '/root/children/1/zones/headEnd/0' },
          { op: 'replace', path: '/root/children/1/zones/headEnd/0/props/label', value: '지움' },
        ],
        locked,
      ),
    ).toBe('n_del')
    // 앞에 형제를 끼우면 n_del 이 headEnd/2 로 밀린다 — 밀린 뒤의 headEnd/1(새 노드)은 지난다.
    expect(
      opsVerdict(
        [
          { op: 'add', path: '/root/children/1/zones/headEnd/0', value: { id: 'n_new', type: 'Button' } },
          { op: 'replace', path: '/root/children/1/zones/headEnd/1/props/label', value: '새' },
        ],
        locked,
      ),
    ).toBeNull()
  })

  it('다른 구역 · 몸통 · 카드의 prop 은 지난다', () => {
    expect(opsVerdict([{ op: 'replace', path: '/root/children/1/zones/footer/0/props/label', value: '돌아가기' }], locked)).toBeNull()
    expect(opsVerdict([{ op: 'replace', path: '/root/children/1/children/0/props', value: {} }], locked)).toBeNull()
    expect(opsVerdict([{ op: 'replace', path: '/root/children/1/props/title', value: '회원' }], locked)).toBeNull()
  })

  it('몸통 안 노드를 잡으면 이름 붙은 구역의 형제는 지난다 — 구역은 몸통과 다른 자리다', () => {
    expect(opsVerdict([{ op: 'remove', path: '/root/children/1/zones/headEnd/0' }], [BORA('n_kv')])).toBeNull()
    expect(opsVerdict([{ op: 'remove', path: '/root/children/1/children/0' }], [BORA('n_kv')])).toBe('n_kv')
  })

  it('포인터 판정(`findLockConflict`)도 구역 안 노드를 찾는다', () => {
    expect(findLockConflict({ root: card(), locks: locked, pointers: ['/root/children/1'], viewerUserId: 'u_me' })?.nodeId).toBe('n_del')
    expect(findLockConflict({ root: card(), locks: locked, pointers: ['/root/children/1/zones/footer'], viewerUserId: 'u_me' })).toBeNull()
  })
})

describe('고르기 — 구역 안 노드를 남이 잡았다', () => {
  const pick = (nodeIds: string[], locks: NodeLock[]) =>
    selectionConflicts({ root: card(), locks, nodeIds, viewerUserId: 'u_me' }).map((lock) => lock?.nodeId ?? null)

  it('그 노드 · 그 조상(카드 · 뿌리)을 고르면 막히고, 형제 · 다른 구역 · 앞 형제는 지난다', () => {
    expect(pick(['n_del', 'n_card', 'n_root', 'n_edit', 'n_list', 'n_kv', 'n_before'], [BORA('n_del')])).toEqual([
      'n_del',
      'n_del',
      'n_del',
      null,
      null,
      null,
      null,
    ])
  })

  it('카드를 남이 잡았으면 구역 안 노드를 고르면 막힌다 — 자손 쪽', () => {
    expect(pick(['n_edit', 'n_list', 'n_kv', 'n_before'], [BORA('n_card')])).toEqual(['n_card', 'n_card', 'n_card', null])
  })
})

// ---- 무작위 판 — 구역이 든 문서 ----

/** mulberry32 — 씨앗이 같으면 같은 판이다. */
function prng(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NUMBER_FORMS = ['0', '1', '2', '01', '1.0', '-', '', '-1', '+1', '99']
const ZONE_NAMES = ['footer', 'headEnd', 'actions']

interface Board {
  doc: { version: number; root: WbNode }
  locks: NodeLock[]
  ops: PatchOp[]
}

/** 노드마다 몸통 · 구역 둘까지(카탈로그 밖 타입 — 순회는 몸통 → 이름 차례). */
function boardOf(seed: number): Board | null {
  const rnd = prng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
  let next = 0
  const list = (depth: number): WbNode[] => Array.from({ length: Math.floor(rnd() * 3) }, () => node(depth - 1))
  const node = (depth: number): WbNode => {
    const made: WbNode = { id: `n${next++}`, type: 'Box', props: { x: 1 } }
    if (depth > 0) {
      if (rnd() < 0.6) made.children = list(depth)
      if (rnd() < 0.7) {
        made.zones = {}
        for (const name of ZONE_NAMES) if (rnd() < 0.5) made.zones[name] = list(depth)
      }
    }
    return made
  }
  const doc = { version: 3, root: node(3) }
  const ids = [...walkNodes(doc.root)].map((visit) => visit.node.id)
  if (ids.length < 2) return null
  const lockIds = [pick(ids.slice(1))]
  if (rnd() < 0.3) lockIds.push(pick(ids.slice(1)))
  const locks = lockIds.map((nodeId) => BORA(nodeId))

  const pointer = (): string => {
    const tokens = ['root']
    let at: unknown = doc.root
    const steps = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < steps; i += 1) {
      if (at === null || typeof at !== 'object' || Array.isArray(at)) break
      const viaZone = rnd() < 0.6
      const key = viaZone ? 'zones' : 'children'
      tokens.push(key)
      at = (at as Record<string, unknown>)[key]
      if (viaZone) {
        const name = pick(ZONE_NAMES)
        tokens.push(name)
        at = at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[name] : undefined
        if (rnd() < 0.1) break
      }
      const length = Array.isArray(at) ? at.length : 0
      const token = rnd() < 0.85 ? String(Math.floor(rnd() * (length + 1))) : pick(NUMBER_FORMS)
      tokens.push(token)
      at = Array.isArray(at) ? at[Number(token)] : undefined
    }
    if (rnd() < 0.15) tokens.push(pick(['props', 'zones', 'children']))
    return '/' + tokens.join('/')
  }
  const ops: PatchOp[] = []
  for (let i = 1 + Math.floor(rnd() * 3); i > 0; i -= 1) {
    const kind = pick(['add', 'remove', 'replace', 'move', 'move', 'add'] as const)
    const path = pointer()
    if (kind === 'remove') ops.push({ op: 'remove', path })
    else if (kind === 'move') ops.push({ op: 'move', from: pointer(), path })
    else ops.push({ op: kind, path, value: rnd() < 0.6 ? { id: `v${next++}`, type: 'Box' } : rnd() < 0.5 ? [] : {} })
  }
  return { doc, locks, ops }
}

function holds(hay: unknown, needle: object): boolean {
  if (hay === needle) return true
  if (hay === null || typeof hay !== 'object') return false
  return Object.values(hay).some((value) => holds(value, needle))
}

/** 적용이 고르는 자리(`lock-ops-identity.test.ts`와 같은 규칙 — 포인터를 견주지 않고 객체를 쥔다). */
function slotOf(doc: unknown, pointer: string): { parent: object; key: string } | null {
  let tokens: string[]
  try {
    tokens = parsePointer(pointer)
  } catch {
    return null
  }
  const key = tokens.pop()
  if (key === undefined) return null
  let parent: unknown = doc
  for (const token of tokens) {
    if (parent === null || typeof parent !== 'object') return null
    parent = Array.isArray(parent)
      ? parent[Number(token)]
      : Object.hasOwn(parent, token)
        ? (parent as Record<string, unknown>)[token]
        : undefined
  }
  return parent !== null && typeof parent === 'object' ? { parent, key } : null
}

function touches(doc: unknown, pointer: string, mode: 'add' | 'remove' | 'replace', locked: object): boolean {
  const slot = slotOf(doc, pointer)
  if (slot === null) return false
  if (holds(locked, slot.parent)) return true
  if (Array.isArray(slot.parent)) {
    const index = slot.key === '-' && mode === 'add' ? slot.parent.length : Number(slot.key)
    return holds(slot.parent[index], locked)
  }
  const record = slot.parent as Record<string, unknown>
  return Object.hasOwn(record, slot.key) && holds(record[slot.key], locked)
}

/** 적용이 성공하면 잠긴 노드를 건드렸는가, 실패하면 `'fails'`. 건드린 자리가 구역 경로였는지도 센다. */
function applied(board: Board): { touched: boolean; viaZone: boolean } | 'fails' {
  const copy = structuredClone(board.doc)
  const locked = board.locks.map((lock) => getByPointer(copy, findNodePath(copy.root, lock.nodeId)!) as object)
  let touched = false
  let viaZone = false
  const note = (pointer: string, mode: 'add' | 'remove' | 'replace') => {
    if (touched) return
    if (locked.some((one) => touches(copy, pointer, mode, one))) {
      touched = true
      viaZone = pointer.includes('/zones')
    }
  }
  try {
    for (const op of board.ops) {
      if (op.op === 'move') {
        note(op.from, 'remove')
        if (getByPointer(copy, op.from) === undefined) throw new Error('옮길 값 없음')
        const moved = removeAt(copy, op.from)
        note(op.path, 'add')
        addAt(copy, op.path, moved)
        continue
      }
      if (op.op !== 'test') note(op.path, op.op)
      applyOpInPlace(copy, op)
    }
  } catch {
    return 'fails'
  }
  return { touched, viaZone }
}

describe('무작위 판 — 구역이 든 문서', () => {
  it('편집 판정이 «적용이 잠긴 노드를 건드렸는가»(객체 정체성)와 한 판도 안 갈린다', () => {
    const tally = { commits: 0, touched: 0, viaZone: 0, free: 0 }
    const diverged: { seed: number; verdict: string | null; touched: boolean; ops: PatchOp[] }[] = []
    for (let seed = 1; seed <= 60_000; seed += 1) {
      const board = boardOf(seed)
      if (board === null) continue
      const result = applied(board)
      if (result === 'fails') continue
      tally.commits += 1
      if (result.touched) tally.touched += 1
      if (result.viaZone) tally.viaZone += 1
      const verdict = lockConflictOfOps({ document: board.doc, locks: board.locks, ops: board.ops, viewerUserId: 'u_me' })
      if (verdict === null) tally.free += 1
      if ((verdict === null) === result.touched && diverged.length < 5) {
        diverged.push({ seed, verdict: verdict?.nodeId ?? null, touched: result.touched, ops: board.ops })
      }
    }
    // 판 카나리아 — 적용되는 묶음 · 구역 경로로 건드린 판 · 안 건드린 판이 다 선다.
    expect(tally.commits).toBeGreaterThan(3000)
    expect(tally.viaZone).toBeGreaterThan(400)
    expect(tally.free).toBeGreaterThan(2000)
    expect(diverged).toEqual([])
  })

  it('고르기 판정이 경로 접두로 지은 판정(노드마다 따로)과 같다 — 구역 안 노드 · 그 조상 · 형제', () => {
    let blocked = 0
    let zoneLocks = 0
    for (let seed = 1; seed <= 3000; seed += 1) {
      const board = boardOf(seed)
      if (board === null) continue
      const visits = [...walkNodes(board.doc.root)]
      const pathOf = new Map<string, string[]>()
      for (const visit of visits) if (!pathOf.has(visit.node.id)) pathOf.set(visit.node.id, parsePointer(visit.path))
      const prefix = (a: string[], b: string[]) => a.length <= b.length && a.every((token, i) => token === b[i])
      const nodeIds = visits.map((visit) => visit.node.id)
      const expected = nodeIds.map((id) => {
        const mine = pathOf.get(id)!
        const hit = board.locks.find((lock) => {
          const theirs = pathOf.get(lock.nodeId)
          return theirs !== undefined && (prefix(mine, theirs) || prefix(theirs, mine))
        })
        return hit?.nodeId ?? null
      })
      const actual = selectionConflicts({ root: board.doc.root, locks: board.locks, nodeIds, viewerUserId: 'u_me' }).map(
        (lock) => lock?.nodeId ?? null,
      )
      expect(actual, `씨앗 ${seed}`).toEqual(expected)
      blocked += actual.filter((id) => id !== null).length
      if (board.locks.some((lock) => pathOf.get(lock.nodeId)?.includes('zones'))) zoneLocks += 1
    }
    expect(blocked).toBeGreaterThan(1000)
    expect(zoneLocks).toBeGreaterThan(500)
  })
})
