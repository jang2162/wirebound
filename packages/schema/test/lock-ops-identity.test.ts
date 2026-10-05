/**
 * **`lockConflictOfOps`의 판정이 적용의 실제 결과와 같은가** — 무작위 문서 · 잠금 · 편집으로 잰다(C2 좁은 반증 ·
 * `docs/superpowers/plans/2026-09-30-c2-review-2.md`).
 *
 * 판정은 잠긴 자리를 **포인터로** 따라간다(`../src/lock.ts`의 `canonicalAt` · `shiftSiblings`). 여기 오라클은 포인터를 견주지 않고
 * **객체 정체성**으로 잰다 — 적용 사본에서 잠긴 노드 객체를 쥐고, 연산마다 그 연산이 실제로 고르는 자리(부모 객체 + 키 — 적용과 같은
 * `Number(token)` 규칙)가 그 객체의 안이거나, 그 객체를 품은 값을 지우거나 덮는지 본다. 옮기기(`move`)는 적용과 같이 둘로 나눠
 * 뺀 뒤 문서에서 넣는 자리를 잰다. 그래서 판정의 좌표 따라가기 · 번호 읽기가 적용과 갈리면 이 오라클과 갈린다.
 *
 * **오라클의 «건드린다»는 셋이다:**
 *
 * - 안쪽 — 고르는 부모가 잠긴 노드의 서브트리 안이다.
 * - 덮음 — 지우거나(`remove` · `move`의 `from`) 바꾸거나(`replace`) 객체 키에 넣는(`add` — 덮어쓴다) 값이 잠긴 노드를 품는다.
 * - 끼움 — 배열에 넣는 자리의 지금 값이 잠긴 노드를 품는다(잠긴 노드나 그 조상 자리에 형제를 끼움). **지금 설계다**(`lock-shifted-pointers.test.ts`
 *   «C11» · `apps/web`의 `edit/structure-actions.ts` 표 — 판정은 넣는 자리와 잠긴 자리의 겹침으로 잰다).
 *
 * **견주는 것은 적용이 성공하는 묶음뿐이다.** 실패하는 묶음은 파이프라인이 통째로 `patch-failed`로 거절해 아무것도 안 바뀐다 — 판정이
 * 그때 무엇을 내든(잠금 · `null`) 잠긴 노드는 그대로다(`lock-shifted-pointers.test.ts` «적용이 실패하는 묶음»이 그 답을 잰다).
 *
 * 번호 꼴은 적용이 `Number(token)`으로 받아 주는 것(`01` · `1.0` · ` 1` · `+1` · `1e0` · `0x1` · `-0` · 빈 낱말)과 안 받는 것(`-` 넣기 밖 ·
 * `-1` · `99` · `~0` · `%31`)을 섞는다.
 */
import { describe, expect, it } from 'vitest'
import { lockConflictOfOps, type NodeLock } from '../src/lock'
import { addAt, applyOpInPlace, removeAt } from '../src/patch/apply'
import { getByPointer, parsePointer } from '../src/patch/pointer'
import type { PatchOp } from '../src/patch/types'
import { findNodePath } from '../src/tree'
import type { WbNode } from '../src/node'

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

const NUMBER_FORMS = ['0', '1', '2', '3', '01', '1.0', '-', '', '-1', '1e0', ' 1', '0x1', '-0', '99', 'abc', '~0', '~1', '%31', '+1', '00']
const KEYS = ['children', 'props', 'id', 'type', 'x']

interface Board {
  doc: { version: number; root: WbNode }
  locks: NodeLock[]
  ops: PatchOp[]
}

function boardOf(seed: number): Board | null {
  const rnd = prng(seed)
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
  let next = 0
  const node = (depth: number): WbNode => {
    const made: WbNode = { id: `n${next++}`, type: 'Box', props: { x: 1 } }
    if (depth > 0) made.children = Array.from({ length: Math.floor(rnd() * 4) }, () => node(depth - 1))
    return made
  }
  const doc = { version: 1, root: node(3) }
  const ids: string[] = []
  const walk = (n: WbNode) => {
    ids.push(n.id)
    for (const child of n.children ?? []) walk(child)
  }
  walk(doc.root)
  if (ids.length < 2) return null
  const lockIds = [pick(ids.slice(1))]
  if (rnd() < 0.3) lockIds.push(pick(ids.slice(1)))
  const locks = lockIds.map((nodeId) => ({ nodeId, userId: 'u_bora', userName: '보라' }))

  const pointer = (): string => {
    const tokens = ['root']
    let at: unknown = doc.root
    const depth = 2 * (1 + Math.floor(rnd() * 3)) - (rnd() < 0.2 ? 1 : 0) + (rnd() < 0.2 ? 2 : 0)
    for (let i = 0; i < depth; i += 1) {
      if (Array.isArray(at)) {
        const token = rnd() < 0.8 ? String(Math.floor(rnd() * (at.length + 1))) : pick(NUMBER_FORMS)
        tokens.push(token)
        at = at[Number(token)]
      } else {
        const token = rnd() < 0.7 ? 'children' : pick(KEYS)
        tokens.push(token)
        at = at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[token] : undefined
      }
    }
    return '/' + tokens.map((token) => token.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')
  }
  const ops: PatchOp[] = []
  for (let i = 1 + Math.floor(rnd() * 4); i > 0; i -= 1) {
    const kind = pick(['add', 'remove', 'replace', 'move', 'move', 'add'] as const)
    const path = pointer()
    if (kind === 'remove') ops.push({ op: 'remove', path })
    else if (kind === 'move') ops.push({ op: 'move', from: pointer(), path })
    else ops.push({ op: kind, path, value: rnd() < 0.5 ? { id: `v${next++}`, type: 'Box' } : rnd() < 0.5 ? 7 : [] })
  }
  return { doc, locks, ops }
}

function holds(hay: unknown, needle: object): boolean {
  if (hay === needle) return true
  if (hay === null || typeof hay !== 'object') return false
  return Object.values(hay).some((value) => holds(value, needle))
}

/** 적용이 고르는 자리 — `patch/apply.ts`의 `resolveSlot`과 같은 규칙으로(포인터를 견주지 않고 객체를 쥔다). */
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

type Touch = 'inside' | 'over' | 'wedge'

function touchOf(doc: unknown, pointer: string, mode: 'add' | 'remove' | 'replace', locked: object): Touch | null {
  const slot = slotOf(doc, pointer)
  if (slot === null) return null
  if (holds(locked, slot.parent)) return 'inside'
  if (Array.isArray(slot.parent)) {
    const index = slot.key === '-' && mode === 'add' ? slot.parent.length : Number(slot.key)
    if (!holds(slot.parent[index], locked)) return null
    return mode === 'add' ? 'wedge' : 'over'
  }
  const record = slot.parent as Record<string, unknown>
  return Object.hasOwn(record, slot.key) && holds(record[slot.key], locked) ? 'over' : null
}

/** 적용이 성공하면 잠긴 노드를 건드린 첫 꼴, 실패하면 `'fails'`. */
function appliedTouch(board: Board): Touch | null | 'fails' {
  const copy = structuredClone(board.doc)
  const locked = board.locks.map((lock) => getByPointer(copy, findNodePath(copy.root, lock.nodeId)!) as object)
  let first: Touch | null = null
  const note = (touch: Touch | null) => {
    if (first === null) first = touch
  }
  try {
    for (const op of board.ops) {
      if (op.op === 'move') {
        for (const one of locked) note(touchOf(copy, op.from, 'remove', one))
        if (getByPointer(copy, op.from) === undefined) throw new Error('옮길 값 없음')
        const moved = removeAt(copy, op.from)
        for (const one of locked) note(touchOf(copy, op.path, 'add', one))
        addAt(copy, op.path, moved)
        continue
      }
      // `test`는 문서를 안 바꾼다 — 아무것도 건드리지 않는다.
      if (op.op !== 'test') for (const one of locked) note(touchOf(copy, op.path, op.op, one))
      applyOpInPlace(copy, op)
    }
  } catch {
    return 'fails'
  }
  return first
}

describe('판정 = 적용이 잠긴 노드를 건드렸는가(객체 정체성)', () => {
  it('적용이 성공하는 무작위 묶음에서 판정이 «건드림»과 한 판도 안 갈린다 — 번호 꼴 · op 넷 · 묶음 · 잠금 둘', () => {
    const tally = { commits: 0, multiOp: 0, blocked: 0, free: 0, inside: 0, over: 0, wedge: 0 }
    const diverged: { seed: number; verdict: string | null; touch: Touch | null; ops: PatchOp[] }[] = []

    for (let seed = 1; seed <= 60_000; seed += 1) {
      const board = boardOf(seed)
      if (board === null) continue
      const touch = appliedTouch(board)
      if (touch === 'fails') continue
      tally.commits += 1
      if (board.ops.length > 1) tally.multiOp += 1
      if (touch !== null) tally[touch] += 1

      const verdict = lockConflictOfOps({ document: board.doc, locks: board.locks, ops: board.ops, viewerUserId: 'u_me' })
      if (verdict === null) tally.free += 1
      else tally.blocked += 1
      if ((verdict === null) !== (touch === null) && diverged.length < 5) {
        diverged.push({ seed, verdict: verdict?.nodeId ?? null, touch, ops: board.ops })
      }
    }

    // 판 카나리아 — 생성기가 적용되는 묶음 · 여러 연산 묶음 · 세 꼴의 «건드림» · 안 건드림을 다 낸다(0 이면 아무것도 안 잰 것이다).
    expect(tally.commits).toBeGreaterThan(2500)
    expect(tally.multiOp).toBeGreaterThan(500)
    expect(tally.free).toBeGreaterThan(1000)
    expect(Math.min(tally.inside, tally.over, tally.wedge)).toBeGreaterThan(200)
    expect(diverged).toEqual([])
  })
})

describe('판정이 적용과 같은 규칙으로 읽는 번호 꼴 — 잠긴 n_b(`/root/children/1`)를 지운다', () => {
  const root: WbNode = {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_a', type: 'Section', children: [] },
      { id: 'n_b', type: 'Section', children: [{ id: 'n_b1', type: 'Text', props: {} }] },
      { id: 'n_c', type: 'Section', children: [] },
    ],
  }
  const BORA: NodeLock = { nodeId: 'n_b', userId: 'u_bora', userName: '보라' }
  const verdict = (ops: PatchOp[], locks: NodeLock[] = [BORA]) =>
    lockConflictOfOps({ document: { root }, locks, ops, viewerUserId: 'u_me' })?.nodeId ?? null
  const removedId = (token: string) => {
    const copy = structuredClone({ root })
    return (removeAt(copy, `/root/children/${token}`) as WbNode).id
  }

  it.each(['1', '01', '1.0', ' 1', '+1', '1e0', '0x1', '0b1', '\t1\n'])('`remove /root/children/%j` — 적용은 n_b 를 지우고 판정은 막는다', (token) => {
    expect(removedId(token)).toBe('n_b')
    expect(verdict([{ op: 'remove', path: `/root/children/${token}` }])).toBe('n_b')
  })

  it.each(['', '-0', '0', '00'])('`remove /root/children/%j` — 적용은 n_a 를 지우고 판정은 안 막는다', (token) => {
    expect(removedId(token)).toBe('n_a')
    expect(verdict([{ op: 'remove', path: `/root/children/${token}` }])).toBeNull()
  })

  it('내 잠금 안의 편집은 지나가고, 남의 잠금 둘이 조상 · 자손으로 겹치면 먼저 놓인 잠금을 낸다', () => {
    const MINE: NodeLock = { nodeId: 'n_b', userId: 'u_me', userName: '나' }
    const INNER: NodeLock = { nodeId: 'n_b1', userId: 'u_dahye', userName: '다혜' }
    expect(verdict([{ op: 'replace', path: '/root/children/1/children/0/props', value: {} }], [MINE])).toBeNull()
    expect(verdict([{ op: 'replace', path: '/root/children/1/children/0/props', value: {} }], [BORA, INNER])).toBe('n_b')
    expect(verdict([{ op: 'replace', path: '/root/children/1/children/0/props', value: {} }], [INNER, BORA])).toBe('n_b1')
    // 내 잠금이 남의 잠금을 품어도 남의 것은 막는다.
    expect(verdict([{ op: 'remove', path: '/root/children/1' }], [MINE, INNER])).toBe('n_b1')
  })
})
