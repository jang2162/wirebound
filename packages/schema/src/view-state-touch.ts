/**
 * **상태를 고른 채 낸 편집 묶음이 어느 가지를 건드리는가** — 화면의 «복사 + 편집» 판정(`apps/web` 의 `edit/view-state-fork.ts` 의
 * `planViewStateEdit`)이 부른다(설계 spec `docs/superpowers/specs/2026-10-05-page-states-design.md` 「상태를 고른 채 편집」).
 *
 * **지킬 가지**는 둘이다. 보이는 길(상태 영역마다 지금 상태의 가지, 없으면 기본 가지)만 따라가며 고르고, 바깥 것이 안쪽을 덮는다(안쪽
 * 영역은 바깥 가지째 따라간다).
 *
 * - **흐린 기본 가지** — 지금 상태가 기본이 아니고 영역에 그 상태의 가지가 없어 기본 가지를 보이는 자리. 그 안만 고친 편집은 «복사 + 편집»이 된다.
 * - **안 보이는 가지** — 보이는 가지 밖의 가지(`allCases` — «모든 가지 보기»를 켰으면 없다). 화면은 그 안을 고칠 길이 없어야 하고, 남의 편집으로
 *   고른 노드가 숨은 판(K2 리뷰 H2)에서 그 편집이 숨은 가지(대개 모든 상태가 보는 기본 가지)를 바꿨다.
 *
 * **판정은 포인터가 아니라 노드 정체성이다**(K2 리뷰 H1). 묶음의 포인터는 앞 연산을 적용한 **뒤** 문서의 좌표다(`move` 의 `path` 는 `from` 을
 * 뺀 뒤) — 편집 전 문서의 경로와 글자로 견주면 앞 형제를 빼거나 넣은 묶음에서 영역 번호가 밀려 흐린 가지 안 연산이 «밖»으로 읽혔다. 그래서
 * 사본에서 지킬 가지 **객체**를 쥐고, 연산마다 적용과 같은 규칙(`readMember` — 배열 번호는 `Number(token)`)으로 그 연산이 고르는 부모까지
 * 걸으며 지나는 객체가 지킬 가지인지 본 뒤 사본에 적용한다. `move` 는 `from` 을 그 문서에서, `path` 를 `from` 을 뺀 문서에서 잰다.
 *
 * **영역째 사라지는 묶음은 그 영역을 지키지 않는다** — 묶음을 다 적용한 사본에 영역 객체가 없으면(영역 지우기 · 그 조상 지우기 · «상태 나누기
 * 풀기») 그 영역의 가지를 건드린 연산은 평범한 편집이다. 풀기는 기본 가지의 내용을 영역 밖으로 옮긴 뒤 영역을 지운다 — 모든 상태가 같은 결과를 본다.
 *
 * 던지지 않는다 — 적용이 실패하는 묶음 · 읽을 수 없는 포인터는 `none` 이다(그 편집은 화면의 로컬 적용 · 서버가 같은 자리에서 거절한다).
 * 오라클은 `apps/web/test/edit/view-state-fork-oracle.test.ts`(지킬 가지의 깊은 사본 = 적용 뒤 — 포인터를 견주지 않는다).
 */
import { DEFAULT_CASE, type PageDocument } from './node'
import { addAt, applyOpInPlace, removeAt } from './patch/apply'
import { getByPointer, parsePointer, readMember } from './patch/pointer'
import type { PatchOp } from './patch/types'

/**
 * | 결과 | 묶음 |
 * |---|---|
 * | `none` | 지킬 가지를 안 건드린다(영역째 사라지는 가지만 건드림 포함) |
 * | `fork` | 흐린 기본 가지 하나의 `children` 안만 건드린다 |
 * | `mixed` | 흐린 기본 가지 안과 밖 · 흐린 가지 둘 · 흐린 가지 자신의 필드 |
 * | `hidden` | 안 보이는 가지를 건드린다(`mixed` 보다 앞선다) |
 */
export type ViewStateTouch = { kind: 'none' } | { kind: 'fork'; switchId: string } | { kind: 'mixed' } | { kind: 'hidden' }

interface Guard {
  why: 'dimmed' | 'hidden'
  switchNode: object
  switchId: string
}

type Hit = { guard: Guard; inside: boolean } | null

const NONE: ViewStateTouch = { kind: 'none' }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stateOf(value: unknown): unknown {
  const node = record(value)
  const props = record(node?.props)
  return node?.type === 'StateCase' ? props?.state : undefined
}

/** 지킬 가지 객체 → 까닭 · 영역. 보이는 길만 따라간다(머리말). */
function guardsOf(root: unknown, viewState: string | null, allCases: boolean): Map<object, Guard> {
  const guards = new Map<object, Guard>()
  const visit = (value: unknown, shownPath: boolean): void => {
    const node = record(value)
    if (node === null) return
    const kids = Array.isArray(node.children) ? node.children : []
    if (node.type !== 'StateSwitch') {
      for (const kid of kids) visit(kid, shownPath)
      return
    }
    const own = viewState === null ? -1 : kids.findIndex((kid) => stateOf(kid) === viewState)
    const fallback = kids.findIndex((kid) => stateOf(kid) === DEFAULT_CASE)
    const shown = own !== -1 ? own : fallback
    const switchId = typeof node.id === 'string' ? node.id : ''
    kids.forEach((kid, index) => {
      if (record(kid) === null) return
      if (shownPath && index === shown && own === -1 && viewState !== null)
        guards.set(kid as object, { why: 'dimmed', switchNode: node, switchId })
      else if (shownPath && index !== shown && !allCases) guards.set(kid as object, { why: 'hidden', switchNode: node, switchId })
      else visit(kid, shownPath && index === shown)
    })
  }
  visit(root, true)
  return guards
}

/** 그 포인터가 고르는 부모까지 걸으며 처음 지나는 지킬 가지 — 그 가지 다음 토큰이 `children` 이면 안이다. */
function hitOf(doc: unknown, pointer: string, guards: ReadonlyMap<object, Guard>): Hit {
  const tokens = parsePointer(pointer)
  let at: unknown = doc
  for (let i = 0; i < tokens.length; i += 1) {
    if (at !== null && typeof at === 'object') {
      const guard = guards.get(at)
      if (guard !== undefined) return { guard, inside: tokens[i] === 'children' }
    }
    if (i === tokens.length - 1) break
    at = at === null || at === undefined ? undefined : readMember(at, tokens[i]!)
  }
  return null
}

function reachable(root: unknown): Set<object> {
  const seen = new Set<object>()
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const value = stack.pop()
    if (value === null || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    for (const inner of Object.values(value)) stack.push(inner)
  }
  return seen
}

export function viewStateTouch(doc: PageDocument, ops: readonly PatchOp[], viewState: string | null, allCases: boolean): ViewStateTouch {
  if (ops.length === 0 || (viewState === null && allCases)) return NONE
  try {
    // 원 문서로 먼저 본다 — 지킬 가지가 없으면 사본을 안 짓는다(편집마다 부른다).
    if (guardsOf(doc.root, viewState, allCases).size === 0) return NONE
    const copy = structuredClone(doc)
    const guards = guardsOf(copy.root, viewState, allCases)
    const hits: Hit[] = []
    for (const op of ops) {
      if (op.op === 'move') {
        hits.push(hitOf(copy, op.from, guards))
        if (getByPointer(copy, op.from) === undefined) return NONE
        const moved = removeAt(copy, op.from)
        hits.push(hitOf(copy, op.path, guards))
        addAt(copy, op.path, moved)
        continue
      }
      hits.push(hitOf(copy, op.path, guards))
      applyOpInPlace(copy, op)
    }
    const present = reachable(copy.root)
    let outside = false
    let hidden = false
    let field = false
    const forked = new Set<string>()
    for (const hit of hits) {
      if (hit === null || !present.has(hit.guard.switchNode)) {
        outside = true
        continue
      }
      if (hit.guard.why === 'hidden') hidden = true
      else if (!hit.inside) field = true
      else forked.add(hit.guard.switchId)
    }
    if (hidden) return { kind: 'hidden' }
    if (forked.size === 0 && !field) return NONE
    if (field || forked.size > 1 || outside) return { kind: 'mixed' }
    return { kind: 'fork', switchId: [...forked][0]! }
  } catch {
    return NONE
  }
}
