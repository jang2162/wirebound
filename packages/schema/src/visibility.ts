/**
 * 화면 상태의 읽기 — 상태 트리의 차례 · 물려받기 · 노드가 그 상태에서 보이는가(정본 설계서 「페이지 스키마 노드」의 화면 상태). 렌더러 ·
 * 에디터 · exporter · MCP 가 같은 답을 내게 판정을 여기 한 곳에 둔다.
 *
 * **검증 전 문서를 견딘다** — 화면은 서버 검증 전의 낙관적 문서를 그린다(`display.ts`와 같은 결). 모양이 틀린 보임 · 목록은 던지지 않고
 * 읽을 수 있는 만큼 읽는다: 모양이 틀린 보임은 «없음»(보인다), 고리 · 없는 부모는 거기서 멈춘다.
 */
import { DEFAULT_VIEW_STATE, type NodeVisibility, type PageDocument, type ViewState, type WbNode } from './node'
import { mapChildLists } from './zones'

type States = readonly ViewState[] | undefined

function listed(viewStates: States, id: string): ViewState | undefined {
  return (viewStates ?? []).find((state) => state.id === id)
}

/**
 * 고른 상태를 판정에 쓸 값으로 — `null` · `DEFAULT_VIEW_STATE` · 목록에 없는 상태는 «기본»이다(렌더러가 목록 밖 `?state=` 를 기본으로
 * 그리는 것과 같은 답).
 */
export function effectiveViewState(viewState: string | null, viewStates: States): string {
  return viewState !== null && viewState !== DEFAULT_VIEW_STATE && listed(viewStates, viewState) !== undefined
    ? viewState
    : DEFAULT_VIEW_STATE
}

/**
 * 그 상태와 그 조상들 — 가까운 것부터(«관리자» → `['관리자', '로그인']`). `DEFAULT_VIEW_STATE` 는 `[DEFAULT_VIEW_STATE]`(기본은 조상도
 * 자손도 없다), 목록에 없는 id 는 `[]`. 고리 · 없는 부모를 만나면 거기서 멈춘다.
 */
export function stateLineage(viewStates: States, id: string): string[] {
  if (id === DEFAULT_VIEW_STATE) return [DEFAULT_VIEW_STATE]
  const out: string[] = []
  let at = listed(viewStates, id)
  while (at !== undefined && !out.includes(at.id)) {
    out.push(at.id)
    at = at.parent === undefined ? undefined : listed(viewStates, at.parent)
  }
  return out
}

function readVisibility(node: WbNode): NodeVisibility | null {
  const visibility: unknown = (node as { visibility?: unknown }).visibility
  if (visibility === null || typeof visibility !== 'object') return null
  const { mode, states } = visibility as { mode?: unknown; states?: unknown }
  if ((mode !== 'only' && mode !== 'except') || !Array.isArray(states)) return null
  return { mode, states: states.filter((state): state is string => typeof state === 'string') }
}

/**
 * 노드 **자신의** 보임 규칙이 `viewState`에서 노드를 보이게 하는가 — 조상이 숨은 것은 보지 않는다(부르는 쪽이 트리를 걸으며 걷는다 —
 * 부모가 숨으면 자손도 숨는다). 물려받기: «S 에서»는 S 와 그 자손 상태를 뜻한다 — 고른 상태의 조상 줄 중 하나라도 나열돼 있으면 맞는다.
 *
 * | 보임 | 맞으면 | 안 맞으면 |
 * |---|---|---|
 * | 없음 | 보인다 | 보인다 |
 * | `only` | 보인다 | 숨는다 |
 * | `except` | 숨는다 | 보인다 |
 */
export function isVisibleIn(node: WbNode, viewState: string | null, viewStates: States): boolean {
  const visibility = readVisibility(node)
  if (visibility === null) return true
  const lineage = stateLineage(viewStates, effectiveViewState(viewState, viewStates))
  const matches = visibility.states.some((state) => lineage.includes(state))
  return visibility.mode === 'only' ? matches : !matches
}

/**
 * 그 상태에서 보이는 트리 — 숨은 노드를 그 자손째 뺀다(뿌리는 늘 남는다 — 뿌리 보임은 봉투 밖의 규칙이 거절한다). MCP · exporter 가
 * 쓴다. 바뀌지 않은 하위 트리는 입력과 객체를 나눠 쓴다 — 결과를 고치지 마라.
 */
export function visibleTree(doc: Pick<PageDocument, 'root' | 'viewStates'>, viewState: string | null): WbNode {
  const visit = (node: WbNode): WbNode =>
    mapChildLists(node, (child) => (isVisibleIn(child, viewState, doc.viewStates) ? visit(child) : null))
  return visit(doc.root)
}

/**
 * 상태 트리의 차례 — 뿌리 상태를 목록 차례로, 각 상태 바로 뒤에 그 자식들을(목록 차례) 잇는 전위 차례. `depth` 는 뿌리가 0 이다. 전환기 ·
 * 메뉴 트리 · 번들 고르개 · 속성 패널 · CLI 가 같은 차례로 쓴다. 고리 · 없는 부모로 닿지 못한 상태는 끝에 깊이 0 으로 잇는다(검증 전 문서 —
 * 상태가 화면에서 사라지지 않게).
 */
export function viewStateOrder(viewStates: States): { state: ViewState; depth: number }[] {
  const states = viewStates ?? []
  const ids = new Set(states.map((state) => state.id))
  const out: { state: ViewState; depth: number }[] = []
  const placed = new Set<string>()
  const visit = (state: ViewState, depth: number): void => {
    if (placed.has(state.id)) return
    placed.add(state.id)
    out.push({ state, depth })
    for (const child of states) if (child.parent === state.id) visit(child, depth + 1)
  }
  for (const state of states) if (state.parent === undefined || !ids.has(state.parent)) visit(state, 0)
  for (const state of states) visit(state, 0)
  return out
}

/** 그 상태의 자손 상태 id 전부(자신은 빼고 · 전위 차례). 상태 삭제가 하위 상태째 지울 때 쓴다. */
export function stateDescendants(viewStates: States, id: string): string[] {
  const states = viewStates ?? []
  const out: string[] = []
  const visit = (parent: string): void => {
    for (const child of states) {
      if (child.parent !== parent || out.includes(child.id) || child.id === id) continue
      out.push(child.id)
      visit(child.id)
    }
  }
  visit(id)
  return out
}
