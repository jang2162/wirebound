/**
 * **상태를 고른 채 낸 편집의 판정(`src/edit/view-state-fork.ts` 의 `planViewStateEdit`)이 적용의 실제 결과와 같은가** — 무작위 문서 · 묶음으로
 * 잰다(K2 리뷰 H1 · H2 — `docs/superpowers/plans/2026-10-06-k2-review.md`).
 *
 * 오라클은 포인터를 견주지 않는다. 지킬 가지(지금 상태에서 흐린 기본 가지 · «모든 가지 보기»가 꺼졌으면 안 보이는 가지)를 **원 문서에서 노드
 * id 로** 고르고, 판정이 내보낸 묶음(`plain` 이면 편집 그대로 · `fork` 면 복사 + 편집)을 적용한 뒤 그 가지의 깊은 사본이 그대로인지 본다.
 * 가지의 영역째 사라진 판(영역 지우기 · 풀기)은 셈에서 뺀다 — 영역째 다루는 편집은 모든 상태에서 같다.
 *
 * | 판정 | 오라클이 보는 것 |
 * |---|---|
 * | `plain` · `fork` | 영역이 남은 지킬 가지의 깊은 사본 = 적용 뒤 그 가지 |
 * | `fork` | 새 가지의 내용(id · 번호를 걷은 것) = 편집을 그대로 적용한 기본 가지의 내용 |
 * | `refused` | 편집을 연산 하나씩 적용할 때 영역이 남은 지킬 가지를 바꾸는 연산이 있다(괜히 막지 않는다) |
 *
 * **묶음은 화면처럼 앞 연산을 적용한 뒤의 좌표로 짓는다** — 영역(또는 그 조상)의 앞 형제를 빼거나 넣거나 옮긴 뒤 흐린 가지 안을 고치는 묶음
 * (`shifted`)을 절반쯤 싣는다(H1 의 꼴 — 끌어 놓기 · 여럿 Delete · 여럿 Cmd+D). 번호는 가끔 적용이 같은 수로 읽는 다른 꼴(`01` · `1.0`)로 쓴다.
 */
import { describe, expect, it } from 'vitest'
import {
  applyOps,
  findNode,
  findNodePath,
  parsePointer,
  formatPointer,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { planViewStateEdit } from '../../src/edit/view-state-fork'

const STATES = ['s_admin', 's_guest'] as const

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

interface Board {
  doc: PageDocument
  ops: PatchOp[]
  viewState: string | null
  allCases: boolean
  /** 앞 형제를 미는 연산 뒤에 기본 가지 안 연산이 선 묶음인가(H1 의 꼴). */
  shifted: boolean
}

function walk(node: WbNode, visit: (node: WbNode, parent: WbNode | null) => void, parent: WbNode | null = null): void {
  visit(node, parent)
  for (const child of node.children ?? []) walk(child, visit, node)
}

function boardOf(seed: number): Board {
  const rnd = prng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
  let next = 0
  const id = (): string => `n_${seed}_${next++}`
  const text = (): WbNode => ({ id: id(), type: 'Text', props: { content: `t${next}` } })
  const content = (depth: number): WbNode[] =>
    Array.from({ length: 1 + Math.floor(rnd() * 3) }, () =>
      depth > 0 && rnd() < 0.2 ? region(depth - 1) : depth > 0 && rnd() < 0.3 ? box(depth - 1) : text(),
    )
  const box = (depth: number): WbNode => ({ id: id(), type: 'Box', props: {}, children: content(depth) })
  const region = (depth: number): WbNode => {
    const cases: WbNode[] = [{ id: id(), type: 'StateCase', props: { state: 'default' }, children: content(depth) }]
    if (rnd() < 0.5) cases.push({ id: id(), type: 'StateCase', props: { state: 's_admin' }, children: content(depth) })
    if (rnd() < 0.25) cases.push({ id: id(), type: 'StateCase', props: { state: 's_guest' }, children: content(depth) })
    if (rnd() < 0.2) cases.reverse()
    return { id: id(), type: 'StateSwitch', props: {}, children: cases }
  }
  const children: WbNode[] = Array.from({ length: Math.floor(rnd() * 3) }, () => (rnd() < 0.7 ? text() : box(1)))
  const regions = 1 + (rnd() < 0.3 ? 1 : 0)
  for (let i = 0; i < regions; i += 1) {
    children.push(
      rnd() < 0.25
        ? { id: id(), type: 'Box', props: {}, children: [...Array.from({ length: Math.floor(rnd() * 2) }, text), region(1)] }
        : region(1),
    )
    if (rnd() < 0.5) children.push(text())
  }
  const doc: PageDocument = {
    version: 1,
    viewStates: [
      { id: 's_admin', name: '관리자' },
      { id: 's_guest', name: '손님' },
    ],
    root: { id: id(), type: 'Page', props: {}, children },
  }

  const viewState = rnd() < 0.2 ? null : pick(STATES)
  const allCases = rnd() < 0.2

  /** 적용이 같은 수로 읽는 다른 꼴로 배열 번호 하나를 바꾼다(가끔). */
  const mangle = (pointer: string): string => {
    if (rnd() >= 0.1) return pointer
    const tokens = parsePointer(pointer)
    const spots = tokens.flatMap((token, i) => (i > 0 && tokens[i - 1] === 'children' && /^\d+$/.test(token) ? [i] : []))
    if (spots.length === 0) return pointer
    const at = pick(spots)
    tokens[at] = pick([`0${tokens[at]}`, `${tokens[at]}.0`])
    return formatPointer(tokens)
  }

  let cur = doc
  const nodes = (): { node: WbNode; parent: WbNode | null; path: string }[] => {
    const out: { node: WbNode; parent: WbNode | null; path: string }[] = []
    walk(cur.root, (node, parent) => out.push({ node, parent, path: findNodePath(cur.root, node.id)! }))
    return out
  }
  /** 기본 가지(어느 영역이든) 안의 노드 · 기본 가지 자신. */
  const insideDefault = (): { node: WbNode; parent: WbNode | null; path: string }[] => {
    const under = new Set<string>()
    walk(cur.root, (node, parent) => {
      if ((parent !== null && under.has(parent.id)) || (node.type === 'StateCase' && node.props?.state === 'default')) under.add(node.id)
    })
    return nodes().filter((entry) => under.has(entry.node.id))
  }
  /** 뿌리 바로 아래에서 첫 영역(또는 영역을 품은 상자)보다 앞 자리의 형제. */
  const before = (): { node: WbNode; parent: WbNode | null; path: string }[] => {
    const kids = cur.root.children ?? []
    const first = kids.findIndex((kid) => JSON.stringify(kid).includes('"StateSwitch"'))
    return first <= 0 ? [] : nodes().filter((entry) => entry.parent === cur.root && kids.indexOf(entry.node) < first)
  }
  const containers = (): { node: WbNode; path: string }[] =>
    nodes().filter((entry) => Array.isArray(entry.node.children) && entry.node.type !== 'StateSwitch')

  type Kind = 'shift' | 'inside' | 'any'
  const opOf = (kind: Kind): PatchOp | null => {
    const pool = kind === 'shift' ? before() : kind === 'inside' ? insideDefault() : nodes()
    if (pool.length === 0) return null
    const target = pick(pool)
    const where = pick(containers())
    const at = (): string => `${where.path}/children/${rnd() < 0.2 ? '-' : Math.floor(rnd() * ((where.node.children?.length ?? 0) + 1))}`
    const what = kind === 'shift' ? pick(['remove', 'add', 'move', 'move'] as const) : pick(['replace', 'remove', 'add', 'move'] as const)
    if (target.parent === null && what !== 'add') return null
    if (target.node.type === 'StateCase' && what !== 'add' && what !== 'replace') return null
    if (what === 'replace') {
      return target.node.type === 'Text'
        ? { op: 'replace', path: mangle(`${target.path}/props/content`), value: `r${next++}` }
        : target.node.type === 'StateCase' && rnd() < 0.3
          ? {
              op: 'replace',
              path: mangle(`${target.path}/props/state`),
              value: pick(['default', ...STATES].filter((state) => state !== target.node.props?.state)),
            }
          : null
    }
    if (what === 'remove') return { op: 'remove', path: mangle(target.path) }
    if (what === 'add') {
      if (kind === 'shift') return { op: 'add', path: mangle(target.path), value: text() }
      return {
        op: 'add',
        path: mangle(Array.isArray(target.node.children) && target.node.type !== 'StateSwitch' ? `${target.path}/children/0` : target.path),
        value: text(),
      }
    }
    return { op: 'move', from: mangle(target.path), path: mangle(at()) }
  }

  const ops: PatchOp[] = []
  const shifted = rnd() < 0.5
  const plan: Kind[] = shifted
    ? ['shift', 'inside', ...(rnd() < 0.5 ? [pick(['shift', 'inside', 'any'] as const)] : [])]
    : Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(['inside', 'any', 'shift'] as const))
  for (const kind of plan) {
    for (let tries = 0; tries < 6; tries += 1) {
      const op = opOf(kind)
      if (op === null) continue
      let after: PageDocument
      try {
        after = applyOps(cur, [op])
      } catch {
        continue
      }
      // 아무것도 안 바꾸는 연산(같은 값 · 제자리 옮기기)은 싣지 않는다 — 오라클은 «바뀌었나»로 «건드렸나»를 센다(머리말의 표).
      if (JSON.stringify(after) === JSON.stringify(cur)) continue
      cur = after
      ops.push(op)
      break
    }
  }
  return { doc, ops, viewState, allCases, shifted: shifted && ops.length >= 2 }
}

/** 지킬 가지 — 지금 상태에서 흐린 기본 가지 · «모든 가지 보기»가 꺼졌으면 안 보이는 가지. 보이는 길만 따라간다(바깥 것이 안쪽을 덮는다). */
function guarded(
  doc: PageDocument,
  viewState: string | null,
  allCases: boolean,
): { caseId: string; switchId: string; why: 'dimmed' | 'hidden' }[] {
  const out: { caseId: string; switchId: string; why: 'dimmed' | 'hidden' }[] = []
  const visit = (node: WbNode, shownPath: boolean): void => {
    const kids = node.children ?? []
    if (node.type !== 'StateSwitch') {
      for (const kid of kids) visit(kid, shownPath)
      return
    }
    const own = viewState === null ? -1 : kids.findIndex((kid) => kid.props?.state === viewState)
    const fallback = kids.findIndex((kid) => kid.props?.state === 'default')
    const shown = own !== -1 ? own : fallback
    kids.forEach((kid, index) => {
      if (shownPath && index === shown && own === -1 && viewState !== null) out.push({ caseId: kid.id, switchId: node.id, why: 'dimmed' })
      else if (shownPath && index !== shown && !allCases) out.push({ caseId: kid.id, switchId: node.id, why: 'hidden' })
      else visit(kid, shownPath && index === shown)
    })
  }
  visit(doc.root, true)
  return out
}

/** 지킬 가지 가운데 그 문서에서 영역째 남은 것 — id → 깊은 사본(JSON). */
function snapshot(doc: PageDocument, keep: readonly { caseId: string; switchId: string }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const entry of keep) {
    if (findNode(doc.root, entry.switchId) === undefined) continue
    const found = findNode(doc.root, entry.caseId)
    if (found !== undefined) out.set(entry.caseId, JSON.stringify(found))
  }
  return out
}

/** id · 번호를 걷은 사본 — 복사는 새 id 로 짓고 번호를 걷는다. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'id' && key !== 'marker')
      .map(([key, inner]) => [key, shape(inner)]),
  )
}

describe('planViewStateEdit — 오라클(지킬 가지의 깊은 사본 = 적용 뒤)', () => {
  it('무작위 묶음에서 지킬 가지가 바뀌는 `plain` · `fork` 가 0, 괜히 막는 `refused` 가 0, `fork` 는 편집을 복사로 옮긴다', () => {
    const tally = {
      boards: 0,
      multiOp: 0,
      shifted: 0,
      plain: 0,
      fork: 0,
      refused: 0,
      shiftedCaught: 0,
      hiddenGuarded: 0,
      dimmedGuarded: 0,
      touched: 0,
    }
    const broken: { seed: number; why: string; kind: string; ops: PatchOp[]; viewState: string | null; allCases: boolean }[] = []
    /** 어긋난 판의 수 — 까닭마다(첫 여덟만 `broken` 에 싣는다). */
    const diverged: Record<string, number> = {}
    let k = 0
    const newId = (): string => `n_fork${String((k += 1)).padStart(8, '0')}`

    for (let seed = 1; seed <= 6000; seed += 1) {
      const board = boardOf(seed)
      if (board.ops.length === 0) continue
      tally.boards += 1
      if (board.ops.length > 1) tally.multiOp += 1
      if (board.shifted) tally.shifted += 1
      const keep = guarded(board.doc, board.viewState, board.allCases)
      if (keep.some((entry) => entry.why === 'hidden')) tally.hiddenGuarded += 1
      if (keep.some((entry) => entry.why === 'dimmed')) tally.dimmedGuarded += 1
      const before = snapshot(board.doc, keep)

      // 연산 하나씩 적용할 때 영역이 남은 지킬 가지를 바꾸는 연산이 있는가.
      let running = board.doc
      let touches = false
      for (const op of board.ops) {
        const after = applyOps(running, [op])
        const was = snapshot(running, keep)
        const now = snapshot(after, keep)
        if ([...now].some(([caseId, json]) => was.has(caseId) && was.get(caseId) !== json)) touches = true
        running = after
      }
      if (touches) tally.touched += 1

      const plan = planViewStateEdit(board.doc, board.ops, board.viewState, newId, board.allCases)
      tally[plan.kind] += 1
      if (board.shifted && plan.kind !== 'plain') tally.shiftedCaught += 1
      const note = (why: string) => {
        diverged[why] = (diverged[why] ?? 0) + 1
        if (board.shifted) diverged[`${why} — 앞 형제를 민 묶음`] = (diverged[`${why} — 앞 형제를 민 묶음`] ?? 0) + 1
        if (broken.length < 8)
          broken.push({ seed, why, kind: plan.kind, ops: board.ops, viewState: board.viewState, allCases: board.allCases })
      }
      if (plan.kind === 'refused') {
        if (!touches) note('괜히 막음')
        continue
      }
      let after: PageDocument
      try {
        after = applyOps(board.doc, plan.kind === 'fork' ? plan.ops : board.ops)
      } catch {
        note('보낼 묶음이 적용되지 않음')
        continue
      }
      const now = snapshot(after, keep)
      const changed = keep.filter(
        (entry) => now.has(entry.caseId) && before.has(entry.caseId) && before.get(entry.caseId) !== now.get(entry.caseId),
      )
      if (changed.length > 0) note(`지킬 가지가 바뀜(${[...new Set(changed.map((entry) => entry.why))].join(' · ')})`)
      if (plan.kind === 'fork') {
        const sw = findNode(after.root, plan.switchId)
        const made = sw?.children?.find((kid) => kid.props?.state === board.viewState)
        const defaultId = findNode(board.doc.root, plan.switchId)?.children?.find((kid) => kid.props?.state === 'default')?.id
        const plain = defaultId === undefined ? undefined : findNode(applyOps(board.doc, board.ops).root, defaultId)
        if (
          made === undefined ||
          plain === undefined ||
          JSON.stringify(shape(made.children ?? [])) !== JSON.stringify(shape(plain.children ?? []))
        )
          note('복사가 편집과 다름')
      }
    }

    // 판 카나리아 — 생성기가 여러 연산 묶음 · H1 의 꼴 · 세 판정 · 지킬 가지 두 꼴을 다 낸다(0 이면 아무것도 안 잰 것이다). 어긋남과 한 값으로
    // 단언한다 — 카나리아가 먼저 죽으면 어긋난 수가 안 보인다.
    const canary = {
      boards: tally.boards > 5000,
      multiOp: tally.multiOp > 2500,
      shifted: tally.shifted > 1500,
      touched: tally.touched > 1000,
      verdicts: Math.min(tally.plain, tally.fork, tally.refused) > 300,
      shiftedCaught: tally.shiftedCaught > 500,
      guarded: Math.min(tally.hiddenGuarded, tally.dimmedGuarded) > 1000,
    }
    expect({ canary, diverged, broken }).toEqual({
      canary: { boards: true, multiOp: true, shifted: true, touched: true, verdicts: true, shiftedCaught: true, guarded: true },
      diverged: {},
      broken: [],
    })
  })
})
