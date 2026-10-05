/**
 * **상태를 고른 채 낸 편집이 흐린 기본 가지 안을 고치면 «복사 + 편집»으로 바꾼다**(설계서 「설계서 화면 구조」 «화면 상태»). 화면이 편집을 내는
 * 통로 하나(`edit/use-edit-commit.tsx` 의 `commitOps`)가 이 판정을 지난다 — 속성 · 구조 · 붙이기 · 끌어 놓기 · 별칭 · 상호작용이 다 그 통로다.
 *
 * | 지금 상태 · 편집 | 결과 |
 * |---|---|
 * | 기본 | 그대로(`plain`) |
 * | 기본이 아니고, 편집이 «그 상태의 가지가 없는 영역»의 기본 가지 안을 건드리지 않는다 | 그대로 — 영역 밖 편집은 모든 상태에 반영된다(노드가 하나뿐) |
 * | 그런 영역 하나의 기본 가지 안만 건드린다 | `editInForkOps` — 그 상태의 가지를 기본 가지 복사(새 id)로 만들고 편집을 그 복사로 옮긴 한 묶음(`fork`) · 되돌리기 한 번 |
 * | 그런 영역 안과 밖을 함께 건드린다 · 그런 영역 둘을 건드린다 · 가지 자신의 필드를 건드린다 | 보내지 않는다(`refused`) — 그대로 보내면 기본 가지(모든 상태)를 바꾸고, 나눌 길이 없다 |
 *
 * **«건드린다»는 포인터(`path` · `from`)가 그 기본 가지의 경로 아래인가로 센다.** 영역 노드 · 가지 노드 자신을 지우거나 옮기는 편집은 기본 가지
 * **안**이 아니라 평범한 편집이다(영역째 지우기는 모든 상태에서 지운다). 겹친 영역은 바깥 것을 고른다 — 바깥 영역의 흐린 기본 가지를 통째로
 * 복사하면 안쪽 영역도 복사 안에 선다(지금 상태에서 보이는 것은 바깥의 흐린 가지다).
 */
import { DEFAULT_CASE, editInForkOps, parsePointer, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'

export type ViewStateEditPlan =
  | { kind: 'plain' }
  | { kind: 'fork'; ops: PatchOp[]; remap: Map<string, string>; switchId: string }
  | { kind: 'refused'; reason: string }

/** 흐린 가지를 건드리는 편집을 나눌 수 없을 때의 말. */
export const FORK_REFUSED = '이 상태의 가지가 없는 영역 안과 밖을 한 번에 고칠 수 없습니다 — 영역 안을 먼저 고쳐 이 상태의 가지를 만드세요'

const PLAIN: ViewStateEditPlan = { kind: 'plain' }

function caseState(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null
  const record = node as { type?: unknown; props?: { state?: unknown } }
  return record.type === 'StateCase' && typeof record.props?.state === 'string' ? record.props.state : null
}

/** 지금 상태에서 흐린 기본 가지를 보이는 영역 — 영역 id 와 그 기본 가지의 포인터 토큰. 보이는 길(지금 상태의 가지)만 따라 내려간다. */
export function dimmedRegions(doc: PageDocument, viewState: string): { switchId: string; tokens: string[] }[] {
  const found: { switchId: string; tokens: string[] }[] = []
  const visit = (node: WbNode, tokens: string[]): void => {
    const children = Array.isArray(node.children) ? node.children : []
    if (node.type === 'StateSwitch') {
      const own = children.findIndex((child) => caseState(child) === viewState)
      const fallback = children.findIndex((child) => caseState(child) === DEFAULT_CASE)
      if (own === -1 && fallback !== -1) {
        found.push({ switchId: node.id, tokens: [...tokens, 'children', String(fallback)] })
        // 바깥 영역의 흐린 가지 안은 그 영역을 복사하면 함께 따라간다 — 안쪽은 따로 세지 않는다(머리말 «겹친 영역»).
        return
      }
      const shown = own !== -1 ? own : fallback
      if (shown !== -1) visit(children[shown]!, [...tokens, 'children', String(shown)])
      return
    }
    children.forEach((child, index) => {
      if (typeof child === 'object' && child !== null) visit(child, [...tokens, 'children', String(index)])
    })
  }
  visit(doc.root, ['root'])
  return found
}

function tokensOf(pointer: string): string[] | null {
  try {
    return parsePointer(pointer)
  } catch {
    return null
  }
}

/** `pointer` 가 그 기본 가지의 `children` 키나 그 아래인가. */
function under(pointer: string[], caseTokens: string[]): boolean {
  return pointer.length > caseTokens.length && pointer[caseTokens.length] === 'children' && caseTokens.every((token, index) => pointer[index] === token)
}

/** 가지 자신(필드 포함)인가 — `children` 밖의 가지 경로 아래. */
function onCase(pointer: string[], caseTokens: string[]): boolean {
  return pointer.length >= caseTokens.length && caseTokens.every((token, index) => pointer[index] === token) && !under(pointer, caseTokens)
}

export function planViewStateEdit(doc: PageDocument, ops: readonly PatchOp[], viewState: string | null, newId: () => string): ViewStateEditPlan {
  if (viewState === null || ops.length === 0) return PLAIN
  let regions: { switchId: string; tokens: string[] }[]
  try {
    regions = dimmedRegions(doc, viewState)
  } catch {
    return PLAIN
  }
  if (regions.length === 0) return PLAIN
  const pointers: string[][] = []
  for (const op of ops) {
    for (const pointer of op.op === 'move' ? [op.path, op.from] : [op.path]) {
      const tokens = tokensOf(pointer)
      if (tokens === null) return PLAIN
      pointers.push(tokens)
    }
  }
  const touched = regions.filter((region) => pointers.some((pointer) => under(pointer, region.tokens) || (onCase(pointer, region.tokens) && pointer.length > region.tokens.length)))
  if (touched.length === 0) return PLAIN
  if (touched.length > 1) return { kind: 'refused', reason: FORK_REFUSED }
  const region = touched[0]!
  const forked = editInForkOps(doc, region.switchId, viewState, [...ops], newId)
  if (forked === null) return { kind: 'refused', reason: FORK_REFUSED }
  return { kind: 'fork', ops: forked.ops, remap: forked.remap, switchId: region.switchId }
}

/**
 * **방금 복사된 노드 → 복사** — «복사 + 편집»을 낸 뒤 한 틱 동안만 든다. 칸을 떠나며 커밋한 편집이 가지를 복사하면 고른 노드가 복사로 옮겨
 * 가고, 그 칸의 위젯은 `key`(노드 id)로 내려가며 남은 초안을 넘긴다(`panels/property-panel.tsx` 의 `useLeftoverCommit` — «떠나기 전에 고른
 * 것이 바뀐 초안»). 그 초안을 옛 노드(이제 숨은 기본 가지)에 쓰면 모든 상태가 바뀐다 — 그래서 그 정리는 이 표로 복사에 쓰고, 이미 같은 값이면
 * 안 쓴다(K2 «흐린 가지 안을 고친 편집» 케이스가 이 자리를 잰다). 한 틱 뒤에 걷는다 — 뒤에 사람이 기본 상태에서 옛 노드를 다시 고르면 그
 * 노드는 그 자체다.
 */
const recentForks = new WeakMap<object, ReadonlyMap<string, string>>()

export function rememberFork(owner: object, remap: ReadonlyMap<string, string>): void {
  recentForks.set(owner, remap)
  setTimeout(() => {
    if (recentForks.get(owner) === remap) recentForks.delete(owner)
  }, 0)
}

/** 방금 복사된 노드면 그 복사의 id, 아니면 그대로. */
export function forkedId(owner: object, nodeId: string): string {
  return recentForks.get(owner)?.get(nodeId) ?? nodeId
}
