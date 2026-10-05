/**
 * 화면 상태의 읽기 — 어느 가지가 서는가 · 노드가 어느 상태에 속하는가 · 그 상태에서 보이는 트리(설계서 「페이지 스키마 노드」의 화면
 * 상태). 렌더러 · 화면 · exporter · MCP 가 같은 답을 내게 판정을 여기 한 곳에 둔다.
 *
 * **검증 전 문서를 견딘다** — 화면은 서버 검증 전의 낙관적 문서를 그린다(`display.ts`와 같은 결). 노드가 아닌 자식 · 모양이 틀린 props 를
 * 던지지 않고 «없음»으로 읽는다.
 */
import { DEFAULT_CASE, type PageDocument, type WbNode } from './node'

function isCase(child: unknown, state: string): child is WbNode {
  if (child === null || typeof child !== 'object') return false
  const node = child as { type?: unknown; props?: unknown }
  if (node.type !== 'StateCase' || node.props === null || typeof node.props !== 'object') return false
  return (node.props as { state?: unknown }).state === state
}

/**
 * 상태 영역 `sw`에서 `viewState`일 때 서는 가지 — 그 상태의 가지, 없으면 기본 가지. 둘 다 없으면 `null`. `viewState`가 페이지 목록에
 * 있는지는 보지 않는다 — 목록 밖 상태를 걸러 기본으로 돌리는 것은 부르는 쪽이다(렌더러의 `renderDocument`). `null` · `default`는 기본이다.
 */
export function caseFor(sw: WbNode, viewState: string | null): WbNode | null {
  const cases: unknown[] = Array.isArray(sw.children) ? sw.children : []
  if (viewState !== null && viewState !== DEFAULT_CASE) {
    const own = cases.find((child) => isCase(child, viewState))
    if (own !== undefined) return own as WbNode
  }
  return (cases.find((child) => isCase(child, DEFAULT_CASE)) as WbNode | undefined) ?? null
}

/**
 * 노드가 속한 상태 — 그 노드가 상태 영역의 가지(자신 포함) 안에 있으면 그 가지의 `state`, 밖이면 `null`. 가지가 겹치면(영역 안의 영역)
 * **가장 가까운 기본이 아닌 가지**의 상태다: 관리자 가지 안 영역의 기본 가지에 든 노드는 관리자 화면에만 있다. 기본 가지들 안에만 있으면
 * `default`. 문서에 없는 노드도 `null`이다.
 */
export function nodeViewState(doc: { root: WbNode }, nodeId: string): string | null {
  return viewStateIndex(doc.root).get(nodeId) ?? null
}

/**
 * 문서 전부의 «노드 id → 속한 상태»(`nodeViewState`의 답 — 영역 밖 노드는 없다). 노드마다 문서를 다시 돌지 않게 문장 · 목록을 짓는
 * 자리가 한 번 짓는다.
 */
export function viewStateIndex(root: WbNode): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (node: unknown, inherited: string | null): void => {
    if (node === null || typeof node !== 'object') return
    const { id, type, props, children } = node as { id?: unknown; type?: unknown; props?: unknown; children?: unknown }
    let own = inherited
    if (type === 'StateCase' && props !== null && typeof props === 'object') {
      const state = (props as { state?: unknown }).state
      if (typeof state === 'string' && (inherited === null || inherited === DEFAULT_CASE)) own = state
    }
    if (own !== null && typeof id === 'string' && !out.has(id)) out.set(id, own)
    if (Array.isArray(children)) for (const child of children) visit(child, own)
  }
  visit(root, null)
  return out
}

/**
 * 그 상태에서 보이는 트리 — 상태 영역마다 서는 가지 하나만 남긴다(영역 · 가지 노드는 그대로 둔다 — 구조 트리가 «상태 영역 > 가지» 줄을
 * 그린다). `viewState`가 페이지 목록에 없으면 기본이다(렌더러와 같은 답). 바뀌지 않은 하위 트리는 입력과 객체를 나눠 쓴다 — 결과를
 * 고치지 마라.
 */
export function visibleTree(doc: PageDocument, viewState: string | null): WbNode {
  const known = viewState !== null && (doc.viewStates ?? []).some((entry) => entry.id === viewState) ? viewState : null
  const visit = (node: WbNode): WbNode => {
    if (node.type === 'StateSwitch') {
      const picked = caseFor(node, known)
      return { ...node, children: picked === null ? [] : [visit(picked)] }
    }
    if (!Array.isArray(node.children)) return node
    const children = node.children.map((child) => (child !== null && typeof child === 'object' ? visit(child) : child))
    return children.every((child, index) => child === node.children![index]) ? node : { ...node, children }
  }
  return visit(doc.root)
}
