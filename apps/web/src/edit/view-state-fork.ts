/**
 * **상태를 고른 채 낸 편집이 흐린 기본 가지 안을 고치면 «복사 + 편집»으로 바꾸고, 안 보이는 가지를 고치면 보내지 않는다**(설계서 「설계서 화면
 * 구조」 «화면 상태»). 화면이 편집을 내는 통로 하나(`edit/use-edit-commit.tsx` 의 `commitOps`)가 이 판정을 지난다 — 속성 · 구조 · 붙이기 · 끌어
 * 놓기 · 별칭 · 상호작용이 다 그 통로다.
 *
 * | 묶음이 건드리는 것(`viewStateTouch`) | 결과 |
 * |---|---|
 * | 지킬 가지가 없다 · 영역 밖만 · 영역째 사라지는 가지(영역 지우기 · 풀기) | 그대로(`plain`) — 영역 밖 편집은 모든 상태에 반영된다(노드가 하나뿐) |
 * | 흐린 기본 가지(지금 상태의 가지가 없는 영역) 하나의 안만 | `editInForkOps` — 그 상태의 가지를 기본 가지 복사(새 id)로 만들고 편집을 그 복사로 옮긴 한 묶음(`fork`) · 되돌리기 한 번 |
 * | 흐린 가지 안과 밖 · 흐린 가지 둘 · 흐린 가지 자신의 필드 | 보내지 않는다(`refused` · `FORK_REFUSED`) — 그대로 보내면 기본 가지(모든 상태)를 바꾸고, 나눌 길이 없다 |
 * | 안 보이는 가지(«모든 가지 보기»가 꺼졌을 때) | 보내지 않는다(`refused` · `HIDDEN_REFUSED`) — 사람이 못 보는 가지를 바꾼다. 남의 편집으로 고른 노드가 숨은 판이다 |
 *
 * **«건드린다»는 노드 정체성으로 센다**(`@wirebound/schema` 의 `viewStateTouch` 머리말) — 묶음의 포인터는 앞 연산을 적용한 뒤의 좌표라, 편집 전
 * 문서의 경로와 글자로 견주면 앞 형제를 민 묶음(끌어 놓기 · 여럿 Delete · 여럿 Cmd+D)이 기본 가지를 바꿨다(K2 리뷰 H1). 겹친 영역은 바깥 것을
 * 고른다 — 바깥 영역의 흐린 기본 가지를 통째로 복사하면 안쪽 영역도 복사 안에 선다(지금 상태에서 보이는 것은 바깥의 흐린 가지다).
 */
import { DEFAULT_CASE, editInForkOps, viewStateTouch, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'

export type ViewStateEditPlan =
  | { kind: 'plain' }
  | { kind: 'fork'; ops: PatchOp[]; remap: Map<string, string>; switchId: string }
  | { kind: 'refused'; reason: string }

/** 흐린 가지를 건드리는 편집을 나눌 수 없을 때의 말. */
export const FORK_REFUSED = '이 상태의 가지가 없는 영역 안과 밖을 한 번에 고칠 수 없습니다 — 영역 안을 먼저 고쳐 이 상태의 가지를 만드세요'

/** 지금 상태에서 안 보이는 가지를 건드리는 편집의 말. */
export const HIDDEN_REFUSED = '지금 화면 상태에서 보이지 않는 가지는 고칠 수 없습니다 — «모든 가지 보기»를 켜고 고르세요'

const PLAIN: ViewStateEditPlan = { kind: 'plain' }

/** `allCases` — 구조 트리의 «모든 가지 보기»(`shell/use-view-state.ts` 의 `useAllCases`). 켜면 모든 가지가 보이는 가지다. */
export function planViewStateEdit(
  doc: PageDocument,
  ops: readonly PatchOp[],
  viewState: string | null,
  newId: () => string,
  allCases = false,
): ViewStateEditPlan {
  const touch = viewStateTouch(doc, ops, viewState, allCases)
  if (touch.kind === 'none') return PLAIN
  if (touch.kind === 'hidden') return { kind: 'refused', reason: HIDDEN_REFUSED }
  if (touch.kind === 'mixed' || viewState === null) return { kind: 'refused', reason: FORK_REFUSED }
  const forked = editInForkOps(doc, touch.switchId, viewState, [...ops], newId)
  if (forked === null) return { kind: 'refused', reason: FORK_REFUSED }
  return { kind: 'fork', ops: forked.ops, remap: forked.remap, switchId: touch.switchId }
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

/**
 * **지금 상태에서 안 보이는 노드** — 보이는 길(영역마다 지금 상태의 가지, 없으면 기본 가지) 밖의 가지와 그 안 전부(`allCases` 면 없다). 흐린
 * 기본 가지는 보인다. 고른 것 · 친 글이 이 노드에 남으면 안 된다 — 남이 같은 영역의 가지를 먼저 만들면 고른 흐린 노드가 이리 숨는다(K2 리뷰 H2 ·
 * `shell/use-view-state.ts` 의 `HiddenSelectionPrune` · `panels/property-panel.tsx` 의 `useLeftoverCommit` · `panels/alias-edit.tsx`). 검증 전
 * 문서가 들어온다 — 던지지 않는다.
 */
export function hiddenNodeIds(doc: PageDocument | null, viewState: string | null, allCases: boolean): ReadonlySet<string> {
  const hidden = new Set<string>()
  if (doc === null || allCases) return hidden
  const all = (node: WbNode): void => {
    if (typeof node.id === 'string') hidden.add(node.id)
    for (const child of Array.isArray(node.children) ? node.children : []) if (isNode(child)) all(child)
  }
  const visit = (node: WbNode): void => {
    const children = (Array.isArray(node.children) ? node.children : []).filter(isNode)
    if (node.type !== 'StateSwitch') {
      children.forEach(visit)
      return
    }
    const own = viewState === null ? -1 : children.findIndex((child) => caseState(child) === viewState)
    const shown = own !== -1 ? own : children.findIndex((child) => caseState(child) === DEFAULT_CASE)
    children.forEach((child, index) => (index === shown ? visit(child) : all(child)))
  }
  if (isNode(doc.root)) visit(doc.root)
  return hidden
}

function isNode(value: unknown): value is WbNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function caseState(node: WbNode): unknown {
  return node.type === 'StateCase' ? node.props?.state : undefined
}
