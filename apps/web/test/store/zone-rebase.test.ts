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
 * **못 얹어도 되는 판은 하나다** — 둘이 같은 부모의 **같은 구역**(몸통 `children` 배열 · 한 구역 배열)을 함께 새로 만든 판. 뒤에 닿은 쪽의
 * 전제(«그 키가 없었다»)가 깨져 버려진다(통지가 말한다 — 먼저 선 자리를 덮지 않으려면 버려야 맞다). `zones` 맵이 없는 노드의 **서로 다른** 구역에
 * 둘이 함께 첫 노드를 넣은 판은 얹혀야 한다 — 맵째 `add` 를 그 구역 키의 `add` 로 좁힌다(`src/store/anchored-ops.ts` 머리말 «구역 하나의 뜻인 맵째
 * op 은 그 구역 키로 좁힌다» · 리뷰 RV-NS 발견 3). 그 밖의 버림은 결함이다.
 *
 * 시드를 고정해 판이 늘 같다. 카나리아(판 수 · 꼴마다 얹힌 수 · 구역 경로를 건드린 판 · 구역 사이 옮기기)는 재려던 판이 실제로 섰는지를 센다.
 */
import { applyOps, childLists, CURRENT_DOCUMENT_VERSION, invertOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
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

/**
 * 편집이 새로 만드는 그릇 — 구역 단위로(`…/children` · `…/zones/<이름>`). 맵째 `add …/zones { <이름>: … }` 는 그 맵이 든 구역마다의 그릇이다 — 맵 하나를
 * 서로 다른 구역의 넣기가 함께 만든 판은 같은 그릇이 아니다. D 의 포인터라 두 편집끼리 견줄 수 있다.
 */
const created = (ops: readonly PatchOp[]): Set<string> =>
  new Set(
    ops.flatMap((op) => {
      if (op.op !== 'add') return []
      if (/\/(children|zones\/[A-Za-z0-9]+)$/.test(op.path)) return [op.path]
      if (op.path.endsWith('/zones') && typeof op.value === 'object' && op.value !== null)
        return Object.keys(op.value).map((name) => `${op.path}/${name}`)
      return []
    }),
  )

describe('리베이스 — 구역이 든 문서의 무작위 판', () => {
  // 이 판은 아래 «정해진 판» 넷의 꼴을 다 품어, 그 넷을 죽이는 변조에 함께 죽는다 — 축마다의 잠금은 정해진 판이 갖는다(정해진 판 가운데 그 하나만
  // 죽이는 변조가 저마다 있다 — 보고 `docs/superpowers/plans/2026-10-23-ze-report.md` 「혼자 죽는 변조」). 이 판은 그 꼴들이 무작위 문서 · 편집에서도 서는지를 센다.
  it('내 편집이 남의 편집 뒤에 같은 뜻으로 얹힌다 — 못 얹는 것은 둘이 같은 구역을 함께 만든 판뿐', () => {
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
      // 서로 다른 구역의 첫 넣기가 맵을 함께 만든 판(리뷰 RV-NS 발견 3) — 이 판이 얹혀야 한다(아래 `judge`).
      const mapBoth = (ops: readonly PatchOp[]): string[] =>
        ops.filter((op) => op.op === 'add' && op.path.endsWith('/zones')).map((op) => op.path)
      if (
        mapBoth(mine.ops).some((path) => mapBoth(theirs.ops).includes(path)) &&
        [...created(mine.ops)].every((path) => !created(theirs.ops).has(path))
      )
        bump(result === null ? 'map-both-dropped' : 'map-both-applied')
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
    // 서로 다른 구역의 첫 넣기가 맵을 함께 만든 판이 섰고 다 얹혔다 — 위 `wrong` 이 «얹을 수 있는데 못 얹었다» 로도 세지만, 그 판이 몇이나 섰는지를 여기서 센다.
    expect(count['map-both-applied']).toBeGreaterThan(10)
    expect(count['map-both-dropped'] ?? 0).toBe(0)
    expect(count.wrong ?? 0).toBe(0)
  })
})

/**
 * 위 무작위 판이 넣기 · 옮기기 축을 갖는다 — 아래 정해진 판의 앞 셋(다른 구역 · 같은 구역 · 옮기기)은 그 판이 무엇을 재는지 이름으로 보이는 것이라
 * 늘 무작위 판과 함께 죽는다. 되돌리기(넷째)는 무작위 판에 없는 축이라 혼자 죽는다.
 */
describe('맵째 op 을 구역 키로 좁힌다 — 정해진 판', () => {
  /** `zones` 맵이 없는 카드 하나. */
  const bare = (): PageDocument => ({
    version: CURRENT_DOCUMENT_VERSION,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_card', type: 'Card', props: { title: 'c' } }] },
  })
  const x: WbNode = { id: 'n_x', type: 'Button', props: { label: 'x' } }
  const y: WbNode = { id: 'n_y', type: 'Button', props: { label: 'y' } }
  const zonesOf = (doc: PageDocument): unknown => (doc.root.children![0] as WbNode).zones

  it('남이 다른 구역의 첫 노드로 맵을 먼저 만들었으면 내 첫 넣기는 그 구역 키의 `add` 로 얹힌다', () => {
    const D = bare()
    const mine = insertNodeOps(D, 'n_card', 0, x, 'footer')!
    const theirs = insertNodeOps(D, 'n_card', 0, y, 'headEnd')!
    // 카나리아 — 둘 다 맵째 `add` 다(재려던 판).
    expect([mine[0]!.path, theirs[0]!.path]).toEqual(['/root/children/0/zones', '/root/children/0/zones'])
    const result = rebaseAnchored(applyOps(D, theirs), anchorOps(D, mine)!)
    expect(result?.ops).toEqual([{ op: 'add', path: '/root/children/0/zones/footer', value: [x] }])
    expect(zonesOf(result!.document)).toEqual({ headEnd: [y], footer: [x] })
  })

  it('남이 같은 구역을 먼저 만들었으면 못 얹는다 — 남의 노드를 덮지 않는다', () => {
    const D = bare()
    const mine = insertNodeOps(D, 'n_card', 0, x, 'footer')!
    const theirs = insertNodeOps(D, 'n_card', 0, y, 'footer')!
    expect(rebaseAnchored(applyOps(D, theirs), anchorOps(D, mine)!)).toBeNull()
  })

  it('빈 구역으로 옮기기(맵째 빈 배열 + `move`)도 좁혀 얹힌다', () => {
    const D: PageDocument = { ...bare(), root: { ...bare().root, children: [...bare().root.children!, x] } }
    const mine = moveNodeOps(D, 'n_x', 'n_card', 0, 'footer')!
    expect(mine[0]).toEqual({ op: 'add', path: '/root/children/0/zones', value: { footer: [] } })
    const result = rebaseAnchored(applyOps(D, insertNodeOps(D, 'n_card', 0, y, 'headEnd')!), anchorOps(D, mine)!)
    expect(result).not.toBeNull()
    expect(zonesOf(result!.document)).toEqual({ headEnd: [y], footer: [x] })
  })

  it('맵을 만든 넣기의 되돌리기(`remove …/zones`)는 남이 다른 구역을 더한 뒤 그 구역만 지운다 — 그 구역이 그대로일 때만', () => {
    const D = bare()
    const mine = insertNodeOps(D, 'n_card', 0, x, 'footer')!
    const after = applyOps(D, mine)
    const inverse = invertOps(D, mine)
    expect(inverse).toEqual([{ op: 'remove', path: '/root/children/0/zones' }])
    const anchoredUndo = anchorOps(after, inverse)!
    // 남이 다른 구역에 넣었다 → 내 구역만 지운다.
    const S = applyOps(after, insertNodeOps(after, 'n_card', 0, y, 'headEnd')!)
    const undone = rebaseAnchored(S, anchoredUndo)
    expect(undone?.ops).toEqual([{ op: 'remove', path: '/root/children/0/zones/footer' }])
    expect(zonesOf(undone!.document)).toEqual({ headEnd: [y] })
    // 아무도 안 고쳤으면 맵째 그대로.
    expect(rebaseAnchored(after, anchoredUndo)?.ops).toEqual(inverse)
    // 남이 내 구역에 더 넣었으면 못 얹는다 — 남의 노드를 함께 지우지 않는다.
    expect(rebaseAnchored(applyOps(after, insertNodeOps(after, 'n_card', 1, y, 'footer')!), anchoredUndo)).toBeNull()
  })
})

/**
 * **좁히기의 거울 — 남이 맵을 지웠거나 빈 구역을 남겼을 때**(리뷰 RV-ZE M1 · L3 — 스토어 B5 · B4). 맵이 있을 때 낸 키 `add …/zones/<k>` 는 얹을
 * 문서에 맵이 없으면 맵째 `add …/zones { k: … }` 로 되살리고, 남이 만들었다 비운 구역(`k: []`)에 오는 첫 넣기는 `add …/zones/k/<i>` 로 다시
 * 짓는다. 남이 그 구역에 넣은 노드가 있으면 지금처럼 못 얹는다(덮지 않는다 — 위 «같은 구역» 판).
 */
describe('맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3)', () => {
  const x: WbNode = { id: 'n_x', type: 'Button', props: { label: 'x' } }
  const y: WbNode = { id: 'n_y', type: 'Button', props: { label: 'y' } }
  const card = (zones?: WbNode['zones'], extra: WbNode[] = []): PageDocument => ({
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_card', type: 'Card', props: { title: 'c' }, ...(zones === undefined ? {} : { zones }) }, ...extra],
    },
  })
  const zonesOf = (doc: PageDocument): unknown => (doc.root.children![0] as WbNode).zones

  it('B5 — 맵이 있을 때 낸 키 `add` 는 남이 맵을 지웠으면 맵째로 되살아난다', () => {
    const D = card({ headEnd: [y] })
    const mine = insertNodeOps(D, 'n_card', 0, x, 'footer')!
    // 카나리아 — 키 `add` 다(재려던 판).
    expect(mine).toEqual([{ op: 'add', path: '/root/children/0/zones/footer', value: [x] }])
    const S = applyOps(D, [{ op: 'remove', path: '/root/children/0/zones' }])
    const result = rebaseAnchored(S, anchorOps(D, mine)!)
    expect(result?.ops).toEqual([{ op: 'add', path: '/root/children/0/zones', value: { footer: [x] } }])
    expect(zonesOf(result!.document)).toEqual({ footer: [x] })
  })

  it('B5 — 빈 구역으로 옮기기(키 `add` 빈 배열 + `move`)도 남이 맵을 지웠으면 맵째로 되살아난다', () => {
    const D = card({ headEnd: [y] }, [x])
    const mine = moveNodeOps(D, 'n_x', 'n_card', 0, 'footer')!
    expect(mine[0]).toEqual({ op: 'add', path: '/root/children/0/zones/footer', value: [] })
    const S = applyOps(D, [{ op: 'remove', path: '/root/children/0/zones' }])
    const result = rebaseAnchored(S, anchorOps(D, mine)!)
    expect(result?.ops[0]).toEqual({ op: 'add', path: '/root/children/0/zones', value: { footer: [] } })
    expect(zonesOf(result!.document)).toEqual({ footer: [x] })
  })

  it('B4 — 남이 만들었다 비운 구역에 오는 내 맵째 첫 넣기는 `add …/zones/k/0` 으로 얹힌다', () => {
    const D = card()
    const mine = insertNodeOps(D, 'n_card', 0, x, 'footer')!
    expect(mine[0]!.path).toBe('/root/children/0/zones')
    const S = applyOps(D, [
      { op: 'add', path: '/root/children/0/zones', value: { footer: [y] } },
      { op: 'remove', path: '/root/children/0/zones/footer/0' },
    ])
    expect(zonesOf(S)).toEqual({ footer: [] })
    const result = rebaseAnchored(S, anchorOps(D, mine)!)
    expect(result?.ops).toEqual([{ op: 'add', path: '/root/children/0/zones/footer/0', value: x }])
    expect(zonesOf(result!.document)).toEqual({ footer: [x] })
  })

  it('B4 — 키 `add` 도 · 빈 구역으로 옮기기도 남이 남긴 빈 구역에 얹힌다', () => {
    const D = card({ headEnd: [y] }, [x])
    const S = applyOps(D, [{ op: 'add', path: '/root/children/0/zones/footer', value: [] }])
    const insert = rebaseAnchored(S, anchorOps(D, insertNodeOps(D, 'n_card', 0, { ...x, id: 'n_z' }, 'footer')!)!)
    expect(insert?.ops).toEqual([{ op: 'add', path: '/root/children/0/zones/footer/0', value: { ...x, id: 'n_z' } }])
    const move = rebaseAnchored(S, anchorOps(D, moveNodeOps(D, 'n_x', 'n_card', 0, 'footer')!)!)
    expect(move?.ops).toEqual([{ op: 'move', from: '/root/children/1', path: '/root/children/0/zones/footer/0' }])
    expect(zonesOf(move!.document)).toEqual({ headEnd: [y], footer: [x] })
  })

  it('남이 그 구역에 넣은 노드가 있으면 지금처럼 못 얹는다 — 키 `add` 도 덮지 않는다', () => {
    const D = card({ headEnd: [y] })
    const mine = insertNodeOps(D, 'n_card', 0, x, 'footer')!
    const S = applyOps(D, [{ op: 'add', path: '/root/children/0/zones/footer', value: [{ id: 'n_w', type: 'Button' }] }])
    expect(rebaseAnchored(S, anchorOps(D, mine)!)).toBeNull()
  })
})
