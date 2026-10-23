// @vitest-environment node
/**
 * **구역이 든 문서에서 내 편집이 남의 편집 뒤에 «같은 뜻»으로 얹히는가 — 무작위 판**(`src/store/anchored-ops.ts`). 카드 넷(몸통 · 구역 셋 —
 * `zones` 맵이 없는 카드도 섞는다) 문서 D 에서 웹 편집 함수로 내 편집 L 과 남의 편집 R 을 짓고, 서버 문서 S = R(D) 위로 L 을 리베이스한다.
 *
 * **오라클은 포인터를 안 쓴다** — 노드 id 마다 (부모, 구역)을 견준다. 리베이스가 포인터로 틀리는 판(엉뚱한 구역 · 남의 노드)을 같은 포인터 규칙으로
 * 지은 기대값은 못 잡는다(`.ruler` 「«거짓 빨강이라 안전하다»는 절반만 맞다」 의 «포인터로 판정하는 장치는 포인터를 안 쓰는 오라클로 잰다»).
 *
 * - 지움 · prop: 겨눈 노드가 S 에 있으면 얹혀야 하고 그 노드(서브트리)만 바뀐다. 없으면 못 얹어야 한다.
 * - 넣기: 부모가 S 에 있으면 새 노드가 그 부모의 그 구역에 선다.
 * - 옮기기: 노드 · 새 부모가 S 에 있고 새 부모가 노드의 서브트리 밖이면 노드가 그 부모의 그 구역에 선다(구역 사이 `move` 포함).
 *
 * **못 얹어도 되는 판은 하나다** — 둘이 같은 부모에 같은 그릇(`children` 배열 · `zones` 맵 · 한 구역 배열)을 함께 새로 만든 판. 뒤에 닿은 쪽의
 * 전제(«그 키가 없었다»)가 깨져 버려진다(통지가 말한다 — 리뷰 RV-NS 발견 3, B 의 몫). 그 밖의 버림은 결함이다.
 *
 * 시드를 고정해 판이 늘 같다. 카나리아(판 수 · 꼴마다 얹힌 수 · 구역 경로를 건드린 판 · 구역 사이 옮기기)는 재려던 판이 실제로 섰는지를 센다.
 */
import { applyOps, childLists, CURRENT_DOCUMENT_VERSION, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { insertNodeOps, moveNodeOps, propOps, removeNodeOps } from '../../src/edit/ops'
import { anchorOps, rebaseAnchored } from '../../src/store/anchored-ops'

const TRIALS = 4000
const ZONES = ['body', 'titleSide', 'headEnd', 'footer'] as const

let seed = 12345
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(rand() * xs.length)]
let uid = 0
const button = (): WbNode => ({ id: `n_${++uid}`, type: 'Button', props: { label: `b${uid}` } })

function card(): WbNode {
  const zones: Record<string, WbNode[]> = {}
  for (const zone of ['titleSide', 'headEnd', 'footer']) {
    if (rand() < 0.25) continue
    zones[zone] = Array.from({ length: Math.floor(rand() * 3) }, button)
  }
  const node: WbNode = {
    id: `n_${++uid}`,
    type: 'Card',
    props: { title: 'c' },
    children: Array.from({ length: Math.floor(rand() * 3) }, button),
  }
  if (rand() < 0.8) node.zones = zones
  return node
}

const makeDoc = (): PageDocument => ({
  version: CURRENT_DOCUMENT_VERSION,
  root: { id: 'n_root', type: 'Page', children: [card(), card(), button(), card()] },
})

interface Place {
  parent: string | null
  zone: string | null
  type: string
  label: unknown
}

function places(doc: PageDocument): Map<string, Place> {
  const out = new Map<string, Place>()
  const walk = (node: WbNode, parent: string | null, zone: string | null): void => {
    out.set(node.id, { parent, zone, type: node.type, label: node.props?.label })
    for (const { zone: name, list } of childLists(node)) for (const child of list) walk(child, node.id, name)
  }
  walk(doc.root, null, null)
  return out
}

function subtree(doc: PageDocument, id: string): Set<string> {
  const out = new Set<string>()
  const walk = (node: WbNode, inside: boolean): void => {
    const now = inside || node.id === id
    if (now) out.add(node.id)
    for (const { list } of childLists(node)) for (const child of list) walk(child, now)
  }
  walk(doc.root, false)
  return out
}

function zoneLength(doc: PageDocument, id: string, zone: string): number | undefined {
  let length: number | undefined
  const walk = (node: WbNode): void => {
    if (node.id === id) {
      const list = zone === 'body' ? node.children : node.zones?.[zone]
      length = Array.isArray(list) ? list.length : undefined
    }
    for (const { list } of childLists(node)) for (const child of list) walk(child)
  }
  walk(doc.root)
  return length
}

type Intent =
  | { kind: 'remove'; x: string }
  | { kind: 'prop'; x: string }
  | { kind: 'insert'; p: string; z: string; node: WbNode }
  | { kind: 'move'; x: string; p: string; z: string }

function randomEdit(doc: PageDocument): { intent: Intent; ops: PatchOp[] } | null {
  const at = places(doc)
  const ids = [...at.keys()].filter((id) => id !== 'n_root')
  const buttons = ids.filter((id) => at.get(id)!.type === 'Button')
  const cards = ids.filter((id) => at.get(id)!.type === 'Card')
  const k = rand()
  if (k < 0.25) {
    const x = pick(ids)
    const ops = x === undefined ? null : removeNodeOps(doc, x)
    return ops === null ? null : { intent: { kind: 'remove', x: x! }, ops }
  }
  if (k < 0.45) {
    const x = pick(buttons)
    const ops = x === undefined ? null : propOps(doc, x, 'label', `L${++uid}`)
    return ops === null ? null : { intent: { kind: 'prop', x: x! }, ops }
  }
  const p = pick(cards)
  const z = pick(ZONES)!
  if (p === undefined) return null
  const length = zoneLength(doc, p, z)
  if (k < 0.7) {
    const node = button()
    const ops = insertNodeOps(doc, p, length === undefined ? 0 : Math.floor(rand() * (length + 1)), node, z)
    return ops === null ? null : { intent: { kind: 'insert', p, z, node }, ops }
  }
  const x = pick(buttons)
  if (x === undefined) return null
  const sameList = at.get(x)!.parent === p && at.get(x)!.zone === z
  const index = length === undefined ? 0 : Math.floor(rand() * (length + (sameList ? 0 : 1)))
  const ops = moveNodeOps(doc, x, p, index, z)
  return ops === null ? null : { intent: { kind: 'move', x, p, z }, ops }
}

/** 오라클 — 틀렸으면 까닭, 맞으면 `null`. 넣기 · 옮기기의 «얹을 수 있는데 못 얹음» 은 `premise` 로 따로 낸다. */
function judge(S: PageDocument, intent: Intent, result: { document: PageDocument } | null): string | null {
  const before = places(S)
  const othersStay = (after: Map<string, Place>, skip: Set<string>, label: string): string | null => {
    for (const [id, was] of before) {
      if (skip.has(id)) continue
      const now = after.get(id)
      if (now === undefined) return `${label}: 남의 노드가 사라졌다`
      if (now.parent !== was.parent || now.zone !== was.zone) return `${label}: 남의 노드 자리가 바뀌었다`
      if (now.label !== was.label) return `${label}: 남의 노드 label 이 바뀌었다`
    }
    return null
  }
  if (intent.kind === 'remove' || intent.kind === 'prop') {
    if (!before.has(intent.x)) return result === null ? null : `${intent.kind}: 겨눈 노드가 없는데 얹혔다`
    if (result === null) return `${intent.kind}: 겨눈 노드가 있는데 못 얹었다`
    const after = places(result.document)
    if (intent.kind === 'remove') {
      const gone = subtree(S, intent.x)
      for (const id of gone) if (after.has(id)) return 'remove: 지운 노드가 남았다'
      return othersStay(after, gone, 'remove')
    }
    if (after.get(intent.x)!.label === before.get(intent.x)!.label) return 'prop: 겨눈 노드가 안 바뀌었다'
    return othersStay(after, new Set([intent.x]), 'prop')
  }
  if (intent.kind === 'insert') {
    if (!before.has(intent.p)) return result === null ? null : 'insert: 부모가 없는데 얹혔다'
    if (result === null) return 'premise'
    const after = places(result.document)
    const made = after.get(intent.node.id)
    if (made === undefined || made.parent !== intent.p || made.zone !== intent.z) return 'insert: 새 노드가 엉뚱한 자리에 섰다'
    return othersStay(after, new Set(), 'insert')
  }
  const possible = before.has(intent.x) && before.has(intent.p) && !subtree(S, intent.x).has(intent.p)
  if (!possible) return result === null ? null : 'move: 얹을 수 없는데 얹혔다'
  if (result === null) return 'premise'
  const after = places(result.document)
  const moved = after.get(intent.x)
  if (moved === undefined || moved.parent !== intent.p || moved.zone !== intent.z) return 'move: 옮긴 노드가 엉뚱한 자리에 섰다'
  return othersStay(after, new Set([intent.x]), 'move')
}

/** 편집이 새로 만드는 그릇 — `add` 가 `…/children` · `…/zones` · `…/zones/<이름>` 을 통째로 넣는 자리. D 의 포인터라 두 편집끼리 견줄 수 있다. */
const created = (ops: readonly PatchOp[]): Set<string> =>
  new Set(ops.filter((op) => op.op === 'add' && /\/(children|zones(\/[A-Za-z0-9]+)?)$/.test(op.path)).map((op) => op.path))

describe('리베이스 — 구역이 든 문서의 무작위 판', () => {
  it('내 편집이 남의 편집 뒤에 같은 뜻으로 얹힌다 — 못 얹는 것은 둘이 같은 그릇을 함께 만든 판뿐', () => {
    const count: Record<string, number> = {}
    const bump = (key: string): void => {
      count[key] = (count[key] ?? 0) + 1
    }
    const wrong: string[] = []
    for (let t = 0; t < TRIALS; t += 1) {
      const D = makeDoc()
      const mine = randomEdit(D)
      const theirs = randomEdit(D)
      if (mine === null || theirs === null) continue
      let S: PageDocument
      try {
        S = applyOps(D, theirs.ops)
      } catch {
        continue
      }
      bump('trials')
      if (JSON.stringify(mine.ops).includes('/zones')) bump('zone-path')
      const anchored = anchorOps(D, mine.ops)
      const result = anchored === null ? null : rebaseAnchored(S, anchored)
      let verdict = judge(S, mine.intent, result)
      if (verdict === 'premise') {
        const theirsMade = created(theirs.ops)
        verdict = [...created(mine.ops)].some((path) => theirsMade.has(path)) ? null : `${mine.intent.kind}: 얹을 수 있는데 못 얹었다`
        if (verdict === null) bump('dropped-shared-container')
      }
      if (result !== null) {
        bump(`applied-${mine.intent.kind}`)
        if (mine.intent.kind === 'move') {
          const was = places(D).get(mine.intent.x)!
          if (was.parent !== mine.intent.p || was.zone !== mine.intent.z) bump('applied-move-across')
        }
      }
      if (verdict !== null && wrong.length < 5)
        wrong.push(`${verdict}\n  mine ${JSON.stringify(mine.ops)}\n  theirs ${JSON.stringify(theirs.ops)}`)
      if (verdict !== null) bump('wrong')
    }
    expect(wrong).toEqual([])
    // 카나리아 — 판이 섰고 꼴마다 얹힌 판이 있다(시드 고정이라 수가 늘 같다 — 하한은 그보다 넉넉히 낮게).
    expect(count.trials).toBeGreaterThan(3000)
    expect(count['zone-path']).toBeGreaterThan(1500)
    for (const kind of ['remove', 'prop', 'insert', 'move']) expect(count[`applied-${kind}`], kind).toBeGreaterThan(500)
    expect(count['applied-move-across']).toBeGreaterThan(500)
    expect(count.wrong ?? 0).toBe(0)
  })
})
