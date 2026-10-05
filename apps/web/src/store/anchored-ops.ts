/**
 * 편집 ops 를 **노드 id 로**(상태 목록은 상태 id 로) 붙잡아 두고, 바뀐 문서 위에서 경로를 다시 짓는다. 리베이스(`EditorStore`의 `#rebaseOnto`)와
 * 되돌리기(`#startFrom`)가 쓴다. React·DOM·`fetch`를 모른다 — 스토어와 같은 이유다.
 *
 * ## 왜 경로를 다시 짓나 — 인덱스 경로는 남의 편집에 밀린다
 *
 * 웹이 만드는 ops 는 전부 자리(index) 경로다(`edit/ops.ts`). 내 편집이 서버에 닿기 전에 남이 같은 배열 앞자리에 넣거나 빼면, 같은 경로가
 * **다른 노드**를 가리킨다. 그 op 은 던지지 않고 얹히므로 리베이스가 통과시키고, 409 뒤 다시 내기가 그대로 서버에 보낸다(Chrome · api:
 * `[가, 나, 다]`에서 «나»를 지우는 편집이 줄 선 사이 남이 맨 앞에 넣자 서버에서 «가»가 지워졌다 · 글 고침은 «가»를 · «아래로»는 «가»를
 * 옮겼다 · 남이 첫째를 빼자 «다»가 지워지고 고쳐졌다 — 통지 0). 서버 `inverse`도 같다 — 되돌리기가 그 사이 남이 앞에 넣은 배열에 옛 자리로
 * 얹힌다.
 *
 * **그래서 op 을 만든 문서에서 경로가 지나는 노드의 id 를 적어 두고, 얹을 문서에서 그 id 의 자리로 경로를 다시 짓는다.** 경로의 노드가 없으면
 * (남이 지웠다) 그 편집은 얹히지 않는다 — 부르는 쪽이 버리고 알린다(리베이스의 `dropped` · 되돌리기의 `skipped`). 설계서 「개인 undo/redo」의
 * «적용 불가는 정상 흐름»과 같은 판정이다.
 *
 * ## 자리의 셋
 *
 * | 무엇을 가리키나 | 적는 것 | 다시 짓기 |
 * |---|---|---|
 * | 노드(와 그 안의 필드) — `remove` · `replace` · 필드 `add` · `move`의 `from` | 노드 id + 그 아래 토큰 | 그 id 의 지금 경로 + 토큰. 없으면 못 얹음 |
 * | `children` 배열의 **넣을 자리** — `add …/children/<i>` · `move`의 `path` | 부모 id · 앞 형제 id 줄 · 뒤 형제 id 줄(가까운 것부터) · 옛 index | 살아 있는 가장 가까운 형제 곁 — 앞 형제면 그 뒤 · 뒤 형제면 그 앞(같은 거리면 앞) → 다 없으면 옛 index(길이로 자름). 부모가 없으면 못 얹음 |
 * | 상태 목록의 항목(과 그 안) — `/viewStates/<i>(/…)`의 `remove` · `replace` · `test` · 항목 안 `add` · `move`의 `from` | 그 자리 상태의 id + 그 아래 토큰 | 그 id 의 지금 번호 + 토큰. 없으면(남이 뺐다) 못 얹음 |
 * | 상태 목록의 **넣을 자리** — `add /viewStates/<i>` · `move`의 `path` | 앞 상태 id 줄 · 뒤 상태 id 줄 · 옛 번호 | 노드의 넣을 자리와 같은 규칙. 목록이 없으면 못 얹음 |
 * | 노드 밖(`/version` · 목록째 `/viewStates`) | 경로 그대로 | 그대로 |
 *
 * **상태 목록도 번호로만 가리킬 수 있어 노드와 같은 위험이다** — 남이 순서를 바꾼 뒤의 되돌리기(서버 역연산 `remove /viewStates/1`)가 남의
 * 상태를 뺐다(K1 리뷰 R1). 묶음이 싣는 `test /viewStates/<i>/id`(`@wirebound/schema`의 `guardViewStateOps`)도 같은 id 로 다시 지어져 늘
 * 맞는다 — 그 `test`는 다시 짓지 않고 경로 그대로 내는 클라이언트를 막는 몫이다. 목록째를 만드는 `add /viewStates [상태]`는 «목록이 없었다»가
 * 전제다(아래 «객체 키의 `add`») — 남이 먼저 목록을 만들었으면 못 얹는다.
 *
 * **넣을 자리는 원래 거리 순으로 앞 · 뒤 형제를 번갈아 본다 — 같은 거리면 앞 형제가 먼저다.** 뒤 형제로 먼저 잡으면 «끝에 넣기»(뒤 형제
 * 없음)와 «뒤 형제가 사라짐»이 같은 값이 된다. 앞 형제 줄을 끝까지 먼저 보면 바로 앞 형제가 사라지고 바로 뒤 형제가 산 판에서 원래 틈(뒤
 * 형제 바로 앞)을 떠나 남이 그 사이에 넣은 노드들 앞에 선다(`[a, b, c, d]`의 b · c 사이에 넣는 동안 남이 b 를 지우고 a 뒤에 x · y · z 를
 * 넣자 `[a, 내 것, x, y, z, c, d]`). 맨 앞(`index 0`)은 늘 맨 앞이다 — 남이 그 앞에 넣었어도 내가 고른 것은 «맨 앞»이다. **바로 옆 형제만
 * 적지 않는다** — 양옆이 함께 사라지면 옛 index 로 떨어져 남이 넣은 노드들 사이에 선다(`[a, b, c, d]`의 b · c 사이에 넣는 동안 남이 b · c 를
 * 지우고 맨 앞에 x · y 를 넣자 `[y, x, 내 것, a, d]`). 형제 줄은 그 배열의 길이만큼 든다.
 *
 * ## 전제가 바뀐 op 은 얹지 않는다
 *
 * 경로가 맞아도 뜻이 바뀌는 op 이 둘 있다 — 그때는 못 얹은 것으로 친다(조용히 남의 것을 덮지 않는다).
 *
 * - **객체 키의 `add`** — 만들 때 없던 키가 그 사이 생겼으면 `add`는 만드는 것이 아니라 **덮는 것**이 된다(`addAt`이 객체에서는 키 할당이다).
 *   빈 컨테이너에 첫 자식을 넣는 `add …/children [노드]`가 그렇다 — 남이 먼저 자식을 넣었으면 그 자식이 지워진다. 반대로 있던 키가 사라져도 뜻이
 *   바뀐다.
 * - **`children` 배열을 통째로 바꾸는 op**(`add` · `replace` · `remove …/children` — 프리셋 적용 · 빈 컨테이너의 첫 자식 · 그 되돌리기) — 만들 때의
 *   자식 id 줄과 지금이 다르면 남의 노드를 덮거나 지운다.
 *
 * 필드 값 `replace`(글 · prop)는 남이 같은 필드를 고쳤어도 얹는다 — 서버가 받는 순서대로 뒤의 것이 이긴다(리베이스가 원래 하던 일이다).
 *
 * ## 비용
 *
 * op 이 하나인 편집은 적어 둘 때 · 다시 지을 때 문서를 걷기만 한다(노드 id 찾기 — 노드 수에 선형). op 이 여럿이면(이동의 `add`+`move` · 패턴
 * 넣기) 뒤 op 의 자리는 앞 op 을 얹은 문서에서 재야 하므로 op 마다 `applyOps`(문서 복제 한 번)가 든다 — **op 수 × 문서 크기**다.
 *
 * 잰 값(ms · 5 회 중앙값 · 스토어는 3 회 · vitest node 환경). 문서는 루트 아래 Container 30 · 60 개에 Text 100 개씩(노드 3000 · 6000), 편집은
 * 마지막 Container 의 `children/10`부터 잇따라 넣는 `add` op N 개(패턴 넣기의 모양), 남의 프레임은 루트 맨 앞에 넣기 하나다. «옛 방식»은 경로
 * 그대로 `applyOps` 한 번이다.
 *
 * | 노드 | op | `anchorOps` | `rebaseAnchored` | 옛 방식 | 스토어 `applyEdit` + 프레임 하나 |
 * |---|---|---|---|---|---|
 * | 3000 | 1 | 0 | 2.0 | 1.4 | 4.5 |
 * | 3000 | 50 | 64 | 74 | 1.4 | 147 |
 * | 3000 | 200 | 264 | 303 | 1.5 | 565 |
 * | 6000 | 1 | 0 | 2.9 | 2.5 | 7.8 |
 * | 6000 | 50 | 127 | 149 | 2.7 | 287 |
 * | 6000 | 200 | 520 | 596 | 2.8 | 1117 |
 *
 * 보내지 않은 op 하나짜리 편집 50 개 위에 프레임 하나(노드 3000): 70ms — 옛 방식도 편집마다 `applyOps`를 한 번씩 해서 같은 급이다.
 *
 * **오늘 값은 낮다** — 웹에서 op 이 여럿인 편집은 패턴 넣기(패턴의 최상위 노드 수 — 만들 때 이미 그만큼 복제한다)와 «안으로»(2)뿐이다. op
 * 수백짜리 편집이 생기면(가져오기 등) 적을 때 · 프레임마다 메인 스레드를 수백 ms 막는다 — 그때는 op 마다 복제하지 않고 한 문서 위에서 자리를
 * 옮겨 가며 재는 쪽으로 바꾼다. 다시 재는 법: 위 문서 · 편집 · 프레임으로 `anchorOps(문서, ops)` · `rebaseAnchored(프레임을 얹은 문서, 붙잡은
 * 것)` · `applyOps(프레임을 얹은 문서, ops)`와 새 `EditorStore`의 `loadPage` → `applyEdit(ops)` → `applyRemoteChange`를 `performance.now()`로 잰다.
 */
import { applyOps, formatPointer, getByPointer, parsePointer, type PageDocument, type PatchOp } from '@wirebound/schema'
import { findNodePathSafely, isNodeLike } from '../edit/safe-walk'

/** op 하나의 경로가 가리키는 자리(머리말의 «자리의 셋»). */
type Anchor =
  | { kind: 'raw'; path: string }
  | { kind: 'node'; id: string; rest: string[] }
  | { kind: 'slot'; parentId: string; after: string[]; before: string[]; index: number | '-' }
  | { kind: 'state'; id: string; rest: string[] }
  | { kind: 'stateSlot'; after: string[]; before: string[]; index: number | '-' }

/**
 * op 을 만든 문서에서 선 전제(머리말의 «전제가 바뀐 op»). `had`는 객체 키 `add`가 가리킨 키가 있었는가, `kids`는 통째로 바꾸는 `children`의 자식
 * id 줄(없었으면 `null`)이다. 둘 다 없으면 볼 전제가 없다.
 */
interface Premise {
  had?: boolean
  kids?: string[] | null
}

/** 노드 id 로 붙잡은 op 하나. `value`는 원래 op 의 값을 그대로 든다 — `applyOps`가 넣을 때 복제한다. */
export type AnchoredOp =
  | { op: 'add' | 'replace' | 'test'; at: Anchor; value: unknown; premise: Premise }
  | { op: 'remove'; at: Anchor; premise: Premise }
  | { op: 'move'; from: Anchor; to: Anchor }

/**
 * `ops`를 `document`(그 ops 를 만든 문서) 위에서 붙잡는다. **못 붙잡으면 `null`** — ops 가 그 문서에 얹히지 않는다. 부르는 쪽은 그 편집을 옛
 * 방식(경로 그대로)으로 둔다.
 */
export function anchorOps(document: PageDocument, ops: readonly PatchOp[]): AnchoredOp[] | null {
  const anchored: AnchoredOp[] = []
  let current = document
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i]!
    if (op.op === 'move') {
      let afterRemove: PageDocument
      try {
        afterRemove = applyOps(current, [{ op: 'remove', path: op.from }])
      } catch {
        return null
      }
      anchored.push({ op: 'move', from: anchorPath(current, op.from, false), to: anchorPath(afterRemove, op.path, true) })
    } else {
      const at = anchorPath(current, op.path, op.op === 'add')
      const premise = op.op === 'test' ? {} : premiseOf(current, op.op, op.path)
      anchored.push(op.op === 'remove' ? { op: 'remove', at, premise } : { op: op.op, at, value: op.value, premise })
    }
    // 뒤 op 의 자리는 이 op 을 얹은 문서에서 잰다. 마지막 op 은 얹을 까닭이 없다.
    if (i < ops.length - 1) {
      try {
        current = applyOps(current, [op])
      } catch {
        return null
      }
    }
  }
  return anchored
}

/**
 * 붙잡은 ops 를 `document` 위에서 경로를 다시 지어 얹는다. 지은 ops 와 얹은 문서를 돌려준다. **못 얹으면 `null`** — 경로의 노드가 없거나 ·
 * 전제가 바뀌었거나 · `applyOps`가 던졌다.
 */
export function rebaseAnchored(
  document: PageDocument,
  anchored: readonly AnchoredOp[],
): { ops: PatchOp[]; document: PageDocument } | null {
  const ops: PatchOp[] = []
  let current = document
  for (const entry of anchored) {
    let op: PatchOp
    if (entry.op === 'move') {
      const from = resolveAnchor(current, entry.from)
      if (from === null) return null
      let afterRemove: PageDocument
      try {
        afterRemove = applyOps(current, [{ op: 'remove', path: from }])
      } catch {
        return null
      }
      const path = resolveAnchor(afterRemove, entry.to)
      if (path === null) return null
      op = { op: 'move', from, path }
    } else {
      const path = resolveAnchor(current, entry.at)
      if (path === null || !premiseHolds(current, path, entry.premise)) return null
      op = entry.op === 'remove' ? { op: 'remove', path } : { op: entry.op, path, value: entry.value }
    }
    try {
      current = applyOps(current, [op])
    } catch {
      return null
    }
    ops.push(op)
  }
  return { ops, document: current }
}

/** 두 ops 목록이 같은 경로의 같은 op 인가 — 값은 참조로 본다(`rebaseAnchored`는 값을 그대로 옮긴다). */
export function sameOps(left: readonly PatchOp[], right: readonly PatchOp[]): boolean {
  if (left.length !== right.length) return false
  return left.every((op, i) => {
    const other = right[i]!
    if (op.op !== other.op || op.path !== other.path) return false
    if (op.op === 'move' && other.op === 'move') return op.from === other.from
    if ('value' in op && 'value' in other) return op.value === other.value
    return true
  })
}

/**
 * 경로가 지나는 노드를 id 로 적는다. `slot`이면 마지막 `children/<i>`를 **넣을 자리**로 읽는다(`add` · `move`의 `path`).
 * `children/<i>`로 이어지는 동안만 노드를 따라간다 — 그 밖의 토큰(`props/…` · 노드가 아닌 배열의 index)은 그 노드 아래 글자 그대로다.
 */
function anchorPath(document: PageDocument, path: string, slot: boolean): Anchor {
  const tokens = parsePointer(path)
  if (tokens[0] === 'viewStates' && tokens.length >= 2) return anchorStatePath(document, path, tokens, slot)
  if (tokens[0] !== 'root' || !isNodeLike(document.root) || typeof document.root.id !== 'string') return { kind: 'raw', path }
  let node = document.root
  let i = 1
  while (tokens[i] === 'children' && i + 1 < tokens.length) {
    const token = tokens[i + 1]!
    const kids = node.children
    if (slot && i + 2 === tokens.length && Array.isArray(kids)) {
      if (token === '-') return { kind: 'slot', parentId: node.id, after: [], before: [], index: '-' }
      if (!/^\d+$/.test(token)) break
      const index = Number(token)
      return { kind: 'slot', parentId: node.id, after: idsOf(kids.slice(0, index)).reverse(), before: idsOf(kids.slice(index)), index }
    }
    if (!Array.isArray(kids) || !/^\d+$/.test(token)) break
    const child: unknown = kids[Number(token)]
    if (!isNodeLike(child) || typeof child.id !== 'string') break
    node = child
    i += 2
  }
  return { kind: 'node', id: node.id, rest: tokens.slice(i) }
}

/** 상태 목록 안의 경로를 상태 id 로 적는다(머리말 «자리의 셋»). 번호가 아니거나 id 없는 항목이면 경로 그대로다. */
function anchorStatePath(document: PageDocument, path: string, tokens: string[], slot: boolean): Anchor {
  const list: unknown = document.viewStates
  const token = tokens[1]!
  if (!Array.isArray(list)) return { kind: 'raw', path }
  if (slot && tokens.length === 2) {
    if (token === '-') return { kind: 'stateSlot', after: [], before: [], index: '-' }
    if (!/^\d+$/.test(token)) return { kind: 'raw', path }
    const index = Number(token)
    return { kind: 'stateSlot', after: idsOf(list.slice(0, index)).reverse(), before: idsOf(list.slice(index)), index }
  }
  if (!/^\d+$/.test(token)) return { kind: 'raw', path }
  const entry: unknown = list[Number(token)]
  if (!isNodeLike(entry) || typeof entry.id !== 'string') return { kind: 'raw', path }
  return { kind: 'state', id: entry.id, rest: tokens.slice(2) }
}

/** 형제들의 id 줄 — id 가 없는 원소는 뺀다(찾을 수 없다). */
function idsOf(kids: readonly unknown[]): string[] {
  return kids.flatMap((kid) => (isNodeLike(kid) && typeof kid.id === 'string' ? [kid.id] : []))
}

/** 적어 둔 자리를 `document`에서 경로로 짓는다. 못 지으면 `null`. */
function resolveAnchor(document: PageDocument, anchor: Anchor): string | null {
  if (anchor.kind === 'raw') return anchor.path
  if (anchor.kind === 'state' || anchor.kind === 'stateSlot') {
    const list: unknown = document.viewStates
    if (!Array.isArray(list)) return null
    if (anchor.kind === 'stateSlot') return `/viewStates/${anchor.index === '-' ? '-' : slotIndex(list, { ...anchor, index: anchor.index })}`
    const index = list.findIndex((entry) => isNodeLike(entry) && entry.id === anchor.id)
    return index === -1 ? null : formatPointer(['viewStates', String(index), ...anchor.rest])
  }
  if (anchor.kind === 'node') {
    const nodePath = findNodePathSafely(document.root, anchor.id)
    if (nodePath === undefined) return null
    return `${nodePath}${formatPointer(anchor.rest)}`
  }
  const parentPath = findNodePathSafely(document.root, anchor.parentId)
  if (parentPath === undefined) return null
  const kids: unknown = getByPointer(document, `${parentPath}/children`)
  if (!Array.isArray(kids)) return null
  const { index, after, before } = anchor
  if (index === '-') return `${parentPath}/children/-`
  return `${parentPath}/children/${slotIndex(kids, { after, before, index })}`
}

/** 넣을 자리의 index — 머리말의 «넣을 자리는 원래 거리 순으로 앞 · 뒤 형제를 번갈아 본다». */
function slotIndex(kids: readonly unknown[], anchor: { after: string[]; before: string[]; index: number }): number {
  if (anchor.index === 0) return 0
  const at = new Map(kids.flatMap((kid, i) => (isNodeLike(kid) && typeof kid.id === 'string' ? [[kid.id, i] as const] : [])))
  for (let distance = 0; distance < Math.max(anchor.after.length, anchor.before.length); distance += 1) {
    const afterId = anchor.after[distance]
    const after = afterId === undefined ? undefined : at.get(afterId)
    if (after !== undefined) return after + 1
    const beforeId = anchor.before[distance]
    const before = beforeId === undefined ? undefined : at.get(beforeId)
    if (before !== undefined) return before
  }
  if (anchor.before.length === 0) return kids.length
  return Math.min(anchor.index, kids.length)
}

/** op 을 만든 문서의 전제(`Premise`). 경로는 그 문서의 것이다. */
function premiseOf(document: PageDocument, op: 'add' | 'remove' | 'replace', path: string): Premise {
  const tokens = parsePointer(path)
  const key = tokens[tokens.length - 1]
  const premise: Premise = {}
  if (key === 'children') premise.kids = kidIds(getByPointer(document, path))
  if (op === 'add' && key !== undefined) {
    const parent: unknown = getByPointer(document, formatPointer(tokens.slice(0, -1)))
    if (isNodeLike(parent)) premise.had = Object.hasOwn(parent, key)
  }
  return premise
}

function premiseHolds(document: PageDocument, path: string, premise: Premise): boolean {
  const tokens = parsePointer(path)
  if (premise.kids !== undefined) {
    const now = kidIds(getByPointer(document, path))
    if (now === null || premise.kids === null ? now !== premise.kids : now.join('\n') !== premise.kids.join('\n')) return false
  }
  if (premise.had !== undefined) {
    const parent: unknown = getByPointer(document, formatPointer(tokens.slice(0, -1)))
    if (!isNodeLike(parent) || Object.hasOwn(parent, tokens[tokens.length - 1]!) !== premise.had) return false
  }
  return true
}

/** `children` 값의 자식 id 줄. 배열이 아니면 `null`. */
function kidIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.map((kid) => (isNodeLike(kid) && typeof kid.id === 'string' ? kid.id : ''))
}
