/**
 * **복사 + 편집(`editInForkOps`)의 무작위 판** — 무작위 문서(별칭 · 번호 · 상호작용 · 영역 안 영역 · `children` 키 없는 기본 가지) × 기본
 * 가지 안 무작위 편집 1 ~ 3(값 · 넣기 · 빼기 · 옮기기 · 노드 통째 바꾸기(같은 id · 새 id) · 상호작용 · 별칭 · 첫 자식 넣기). 판마다:
 *
 * - 기본 가지는 깊은 복사와 같다(안 바뀐다).
 * - 결과 문서의 검증 오류 0 — 같은 편집을 기본 가지에 바로 낸 문서가 오류 없는 판만 센다.
 * - 역연산 왕복이 원래 문서다.
 * - 새 가지 = 같은 편집을 기본 가지에 바로 낸 결과(복사 id 를 원래 id 로 되돌려 견줌).
 *
 * 값 안의 노드 id(노드를 통째로 바꾼 값 · 그 자식)가 기본 가지의 노드면 복사 id 로 옮긴다 — 안 옮기면 복사 가지에 기본 가지와 같은 id 가 다시
 * 서서 `duplicate-id`(K1 리뷰 R3). 정해진 칸의 케이스는 `view-state-ops.test.ts` 가 갖는다.
 */
import { isDeepStrictEqual } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { PageDocument, WbNode } from '../src/node'
import { applyOps } from '../src/patch/apply'
import { invertOps } from '../src/patch/inverse'
import type { PatchOp } from '../src/patch/types'
import { findNode, findNodePath, walkNodes } from '../src/tree'
import { partitionIssues, validatePage } from '../src/validate'
import { editInForkOps } from '../src/view-state-ops'

beforeAll(() => {
  installCatalog()
})

/** 결정적 난수(mulberry32). */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KINDS = [
  'props',
  'add',
  'remove',
  'move',
  'replaceNode',
  'replaceNodeSameId',
  'interaction',
  'alias',
  'addWithTargetInside',
  'firstChild',
] as const
type Kind = (typeof KINDS)[number]

interface Board {
  doc: PageDocument
  edit: PatchOp[]
  kinds: Kind[]
}

function boardOf(seed: number): Board | null {
  const rnd = random(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
  let next = 0
  const allIds: string[] = []
  const leaf = (): WbNode => {
    const id = `n${next++}`
    allIds.push(id)
    const node: WbNode = rnd() < 0.5 ? { id, type: 'Text', props: { content: id } } : { id, type: 'Button', props: { label: id } }
    if (rnd() < 0.15) node.alias = `별칭${next % 3}`
    if (rnd() < 0.15) node.marker = next
    return node
  }
  const tree = (depth: number): WbNode[] =>
    Array.from({ length: Math.floor(rnd() * 4) }, () => {
      if (depth > 0 && rnd() < 0.35) {
        const id = `n${next++}`
        allIds.push(id)
        return { id, type: 'Section', children: tree(depth - 1) }
      }
      return leaf()
    })
  const head = tree(1)
  const defaultKids = tree(2)
  const adminKids = tree(1)
  if (rnd() < 0.3) {
    defaultKids.push({
      id: 'n_isw',
      type: 'StateSwitch',
      children: [
        { id: 'n_ic0', type: 'StateCase', props: { state: 'default' }, children: tree(1) },
        ...(rnd() < 0.5 ? [{ id: 'n_ic1', type: 'StateCase', props: { state: 's_guest' }, children: tree(1) }] : []),
      ],
    })
  }
  const tail = tree(1)
  // 빈 기본 가지의 반은 `children` 키가 없다 — 검증이 받는 모양이다(API 로 만든 문서).
  const defaultCase: WbNode = { id: 'n_c0', type: 'StateCase', props: { state: 'default' }, children: defaultKids }
  if (defaultKids.length === 0 && rnd() < 0.5) delete defaultCase.children
  const doc: PageDocument = {
    version: 1,
    viewStates: [
      { id: 's_admin', name: '관리자' },
      { id: 's_guest', name: '비로그인' },
    ],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        ...head,
        {
          id: 'n_sw',
          type: 'StateSwitch',
          children: [
            defaultCase,
            ...(rnd() < 0.5 ? [{ id: 'n_c1', type: 'StateCase', props: { state: 's_admin' }, children: adminKids }] : []),
          ],
        },
        ...tail,
      ],
    },
  }
  for (const visit of walkNodes(doc.root)) {
    const node = visit.node
    if ((node.type === 'Button' || node.type === 'Text') && rnd() < 0.3) {
      node.interactions = [{ on: 'click', actions: [{ type: 'setVisible', target: pick(allIds), value: true }] }]
    }
  }

  // 편집 — 앞 편집을 얹은 문서 좌표로, 기본 가지 n_c0 안만.
  const edit: PatchOp[] = []
  const kinds: Kind[] = []
  let cur = doc
  const count = 1 + Math.floor(rnd() * 3)
  for (let i = 0; i < count; i += 1) {
    const casePath = findNodePath(cur.root, 'n_c0')!
    const base = findNode(cur.root, 'n_c0')!
    const inside = [...walkNodes(base)].filter((v) => v.node.id !== 'n_c0' && v.node.type !== 'StateCase')
    const containers = [...walkNodes(base)].filter((v) => v.node.type === 'Section' || v.node.type === 'StateCase')
    const rel = (v: { path: string }) => casePath + v.path.slice('/root'.length)
    const kind = pick(KINDS)
    let op: PatchOp | null = null
    if (kind === 'props' && inside.length) {
      const v = pick(inside)
      op = {
        op: 'replace',
        path: `${rel(v)}/props`,
        value: v.node.type === 'Text' ? { content: `X${i}` } : v.node.type === 'Button' ? { label: `Y${i}` } : {},
      }
    } else if ((kind === 'add' || kind === 'addWithTargetInside') && containers.length) {
      const v = pick(containers.filter((c) => c.node.children !== undefined))
      if (v) {
        const len = v.node.children!.length
        const value: WbNode = { id: `e${seed}_${i}`, type: 'Text', props: { content: 'new' } }
        if (kind === 'addWithTargetInside' && inside.length)
          value.interactions = [{ on: 'click', actions: [{ type: 'setVisible', target: pick(inside).node.id, value: false }] }]
        op = { op: 'add', path: `${rel(v)}/children/${rnd() < 0.3 ? '-' : String(Math.floor(rnd() * (len + 1)))}`, value }
      }
    } else if (kind === 'firstChild' && base.children === undefined) {
      op = { op: 'add', path: `${casePath}/children`, value: [{ id: `f${seed}_${i}`, type: 'Text', props: { content: '첫' } }] }
    } else if (kind === 'remove' && inside.length) {
      op = { op: 'remove', path: rel(pick(inside)) }
    } else if (kind === 'move' && inside.length && containers.length) {
      const from = pick(inside)
      const to = pick(containers.filter((c) => c.node.children !== undefined && !rel(c).startsWith(rel(from))))
      if (to) {
        const after = applyOps(cur, [{ op: 'remove', path: rel(from) }])
        const toPath = findNodePath(after.root, to.node.id)!
        const len = findNode(after.root, to.node.id)!.children?.length ?? 0
        op = { op: 'move', from: rel(from), path: `${toPath}/children/${Math.floor(rnd() * (len + 1))}` }
      }
    } else if ((kind === 'replaceNode' || kind === 'replaceNodeSameId') && inside.length) {
      const v = pick(inside)
      const value: WbNode = structuredClone(v.node)
      if (v.node.type === 'Text') value.props = { content: 'R' }
      if (kind === 'replaceNode') value.id = `r${seed}_${i}`
      op = { op: 'replace', path: rel(v), value }
    } else if (kind === 'interaction') {
      const buttons = inside.filter((x) => x.node.type === 'Button')
      if (buttons.length)
        op = {
          op: 'add',
          path: `${rel(pick(buttons))}/interactions`,
          value: [{ on: 'click', actions: [{ type: 'setVisible', target: pick(allIds), value: true }] }],
        }
    } else if (kind === 'alias' && inside.length) {
      op = { op: 'add', path: `${rel(pick(inside))}/alias`, value: '새 별칭' }
    }
    if (op === null) continue
    try {
      cur = applyOps(cur, [op])
    } catch {
      return null
    }
    edit.push(op)
    kinds.push(kind)
  }
  return edit.length === 0 ? null : { doc, edit, kinds }
}

describe('editInForkOps — 무작위 복사 + 편집', () => {
  it('기본 가지 = 깊은 복사 · 검증 오류 0 · 역연산 왕복 · 새 가지 = 바로 낸 편집 — 6000 시드', () => {
    const tally = {
      boards: 0,
      nullResult: 0,
      multi: 0,
      moves: 0,
      nested: 0,
      replaced: 0,
      firstChild: 0,
      defaultChanged: 0,
      errors: 0,
      inverseBad: 0,
      shapeBad: 0,
    }
    const samples: string[] = []
    const note = (line: string) => {
      if (samples.length < 6) samples.push(line)
    }
    let seq = 0
    for (let seed = 1; seed <= 6000; seed += 1) {
      const board = boardOf(seed)
      if (board === null) continue
      const direct = applyOps(board.doc, board.edit)
      if (partitionIssues(validatePage(direct)).errors.length > 0) continue
      tally.boards += 1
      if (board.edit.length > 1) tally.multi += 1
      if (board.kinds.includes('move')) tally.moves += 1
      if (findNode(board.doc.root, 'n_isw')) tally.nested += 1
      if (board.kinds.some((kind) => kind.startsWith('replaceNode'))) tally.replaced += 1
      if (board.kinds.includes('firstChild')) tally.firstChild += 1
      const base = structuredClone(findNode(board.doc.root, 'n_c0'))
      const result = editInForkOps(board.doc, 'n_sw', 's_guest', board.edit, () => `k${(seq += 1)}`)
      if (result === null) {
        tally.nullResult += 1
        note(`seed ${seed} null ${board.kinds}`)
        continue
      }
      const after = applyOps(board.doc, result.ops)
      if (!isDeepStrictEqual(findNode(after.root, 'n_c0'), base)) {
        tally.defaultChanged += 1
        note(`seed ${seed} 기본 가지 바뀜 ${board.kinds}`)
      }
      const errors = partitionIssues(validatePage(after)).errors
      if (errors.length > 0) {
        tally.errors += 1
        note(`seed ${seed} ${board.kinds}: ${errors.map((e) => `${e.code} ${e.message}`).join(' · ')}`)
      }
      try {
        if (!isDeepStrictEqual(applyOps(after, invertOps(board.doc, result.ops)), board.doc)) tally.inverseBad += 1
      } catch {
        tally.inverseBad += 1
      }
      // 새 가지를 복사 id → 원래 id 로 되돌리면 같은 편집을 기본 가지에 바로 낸 것과 같다(번호는 복사가 걷는다).
      const copy = findNode(after.root, 'n_sw')!.children!.find((c) => c.props?.state === 's_guest')!
      const back = new Map([...result.remap].map(([from, to]) => [to, from]))
      const restored = JSON.parse(JSON.stringify(copy), (key, value: unknown) =>
        typeof value === 'string' && (key === 'id' || key === 'target') ? (back.get(value) ?? value) : value,
      ) as WbNode
      const strip = (node: WbNode): WbNode => {
        const { marker: _marker, ...rest } = node
        return { ...rest, ...(node.children ? { children: node.children.map(strip) } : {}) }
      }
      const want = strip(findNode(direct.root, 'n_c0')!)
      const got = { ...restored, props: want.props, children: restored.children ?? [] }
      if (!isDeepStrictEqual(got, { ...want, children: want.children ?? [] })) {
        tally.shapeBad += 1
        note(`seed ${seed} 모양 ${board.kinds}`)
      }
    }
    console.log(`editInForkOps 무작위 ${JSON.stringify(tally)}`)
    expect({
      nullResult: tally.nullResult,
      defaultChanged: tally.defaultChanged,
      errors: tally.errors,
      inverseBad: tally.inverseBad,
      shapeBad: tally.shapeBad,
      samples,
    }).toEqual({
      nullResult: 0,
      defaultChanged: 0,
      errors: 0,
      inverseBad: 0,
      shapeBad: 0,
      samples: [],
    })
    // 카나리아 — 판이 결함 꼴(노드 통째 바꾸기 · 첫 자식 넣기)과 여러 연산 · 옮기기 · 영역 안 영역을 넉넉히 세운다.
    expect(tally.boards).toBeGreaterThan(2000)
    expect(tally.multi).toBeGreaterThan(500)
    expect(tally.moves).toBeGreaterThan(200)
    expect(tally.nested).toBeGreaterThan(300)
    expect(tally.replaced).toBeGreaterThan(500)
    expect(tally.firstChild).toBeGreaterThan(50)
  }, 60_000)
})
