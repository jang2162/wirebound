/**
 * 편집 ops 를 **노드 id 로** 붙잡아 두고, 바뀐 문서 위에서 경로를 다시 짓는다. 리베이스(`EditorStore`의 `#rebaseOnto`)와
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
 * | `children` 배열의 **넣을 자리** — `add …/children/<i>` · `move`의 `path` | 부모 id · 앞 형제 id · 뒤 형제 id · 옛 index | 앞 형제 뒤 → (앞이 없으면) 뒤 형제 앞 → 옛 index(길이로 자름). 부모가 없으면 못 얹음 |
 * | 노드 밖(`/version`) | 경로 그대로 | 그대로 |
 *
 * **넣을 자리는 앞 형제로 먼저 잡는다.** 뒤 형제로 먼저 잡으면 «끝에 넣기»(뒤 형제 없음)와 «뒤 형제가 사라짐»이 같은 값이 된다. 맨 앞(`index 0`)
 * 은 늘 맨 앞이다 — 남이 그 앞에 넣었어도 내가 고른 것은 «맨 앞»이다.
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
 * 넣기) 뒤 op 의 자리는 앞 op 을 얹은 문서에서 재야 하므로 op 마다 `applyOps`(문서 복제 한 번)가 든다.
 */
import { applyOps, formatPointer, getByPointer, parsePointer, type PageDocument, type PatchOp } from '@wirebound/schema'
import { findNodePathSafely, isNodeLike } from '../edit/safe-walk'

/** op 하나의 경로가 가리키는 자리(머리말의 «자리의 셋»). */
type Anchor =
  | { kind: 'raw'; path: string }
  | { kind: 'node'; id: string; rest: string[] }
  | { kind: 'slot'; parentId: string; after: string | null; before: string | null; index: number | '-' }

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
  | { op: 'add' | 'replace'; at: Anchor; value: unknown; premise: Premise }
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
      const premise = premiseOf(current, op.op, op.path)
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
  if (tokens[0] !== 'root' || !isNodeLike(document.root) || typeof document.root.id !== 'string') return { kind: 'raw', path }
  let node = document.root
  let i = 1
  while (tokens[i] === 'children' && i + 1 < tokens.length) {
    const token = tokens[i + 1]!
    const kids = node.children
    if (slot && i + 2 === tokens.length && Array.isArray(kids)) {
      if (token === '-') return { kind: 'slot', parentId: node.id, after: null, before: null, index: '-' }
      if (!/^\d+$/.test(token)) break
      const index = Number(token)
      return { kind: 'slot', parentId: node.id, after: idAt(kids, index - 1), before: idAt(kids, index), index }
    }
    if (!Array.isArray(kids) || !/^\d+$/.test(token)) break
    const child: unknown = kids[Number(token)]
    if (!isNodeLike(child) || typeof child.id !== 'string') break
    node = child
    i += 2
  }
  return { kind: 'node', id: node.id, rest: tokens.slice(i) }
}

function idAt(kids: readonly unknown[], index: number): string | null {
  const node = index >= 0 ? kids[index] : undefined
  return isNodeLike(node) && typeof node.id === 'string' ? node.id : null
}

/** 적어 둔 자리를 `document`에서 경로로 짓는다. 못 지으면 `null`. */
function resolveAnchor(document: PageDocument, anchor: Anchor): string | null {
  if (anchor.kind === 'raw') return anchor.path
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

/** 넣을 자리의 index — 머리말의 «넣을 자리는 앞 형제로 먼저 잡는다». */
function slotIndex(kids: readonly unknown[], anchor: { after: string | null; before: string | null; index: number }): number {
  if (anchor.after === null) return 0
  const after = kids.findIndex((kid) => isNodeLike(kid) && kid.id === anchor.after)
  if (after >= 0) return after + 1
  if (anchor.before === null) return kids.length
  const before = kids.findIndex((kid) => isNodeLike(kid) && kid.id === anchor.before)
  if (before >= 0) return before
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
