/**
 * **붙여넣기의 상태 이름 맞춤** — 붙이는 페이지에 같은 이름의 상태가 있으면 노드의 상태 가지를 그 상태로 옮긴다(설계서 「설계서 화면 구조」
 * 클립보드 · 화면 상태). `shell/editor-keys.tsx` 의 `finishPaste` 가 쓴다. 이름이 페이지에 없는 상태의 가지는 `prepareNodesForPaste` 가 빼고 센다.
 */
import type { ViewState, WbNode } from '@wirebound/schema'

/**
 * **상태를 이름으로 맞추는 자.** 이름은 글자 그대로 견준다 — 상태 상자가 이름을 앞뒤 공백을 뗀 채 받고 같은 이름을 거절하는 것
 * (`shell/view-states-dialog.tsx`)과 같은 규칙이라 대소문자도 다른 이름이다.
 */
function statesByName(list: readonly ViewState[] | undefined): Map<string, string> {
  return new Map((list ?? []).map((state) => [state.name, state.id]))
}

/**
 * **붙이는 페이지에 같은 이름의 상태가 있으면 그 id 로 가지를 옮기는 표**(출처 id → 페이지 id). 같은 id 는 그대로라 표에 안 든다. 이름이 페이지에 없는
 * 상태는 표에 없다 — 그 가지는 `prepareNodesForPaste` 가 빼고 센다.
 */
export function renameStatesByName(current: unknown, incoming: readonly ViewState[] | undefined): Map<string, string> {
  const existing = Array.isArray(current) ? (current as ViewState[]) : undefined
  const ids = new Set((existing ?? []).map((state) => state.id))
  const byName = statesByName(existing)
  const rename = new Map<string, string>()
  for (const state of incoming ?? []) {
    const named = ids.has(state.id) ? undefined : byName.get(state.name)
    if (named !== undefined) rename.set(state.id, named)
  }
  return rename
}

/** 상태 가지의 `state` 를 표대로 바꾼 사본(`renameStatesByName` 의 표). 입력을 바꾸지 않는다. */
export function renameCaseStates(node: WbNode, rename: ReadonlyMap<string, string>): WbNode {
  const state = node.type === 'StateCase' ? node.props?.state : undefined
  const next: WbNode =
    typeof state === 'string' && rename.has(state) ? { ...node, props: { ...node.props, state: rename.get(state)! } } : { ...node }
  if (Array.isArray(node.children)) next.children = node.children.map((child) => renameCaseStates(child, rename))
  return next
}
