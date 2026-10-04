/**
 * **구조 트리 줄의 별칭 입력이 어느 노드에 서 있나** — 화면의 상태 하나(노드 id 또는 `null`).
 *
 * 입력은 구조 트리가 그리지만 여는 입구가 트리 밖에도 있다 — F2 는 에디터 단축키(`shell/editor-keys.tsx`)가 받는다(캔버스에 포커스가
 * 있어도 선다). 둘은 명령 훅(`useStructureCommands`)을 각자 만들어 훅의 상태로는 나눠 가질 수 없어, 셸이 이 상자를 한 번 깔고 둘이 같은
 * 값을 본다. 스토어에 두지 않는다 — 서버 · 되돌리기와 무관한 화면 상태다.
 *
 * **상자가 없으면 그 컴포넌트 안의 상태로 물러선다** — 구조 트리만 띄운 판도 더블클릭 · `…` 로 연다(F2 만 셸 밖에서 안 닿는다).
 */
import { createContext, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'

export interface AliasEdit {
  /** 입력이 선 노드. 없으면 `null`. */
  nodeId: string | null
  open: (nodeId: string) => void
  close: () => void
}

const AliasEditContext = createContext<AliasEdit | null>(null)

export function AliasEditProvider(props: { children: ReactNode }): ReactElement {
  const edit = useAliasEditState()
  return <AliasEditContext.Provider value={edit}>{props.children}</AliasEditContext.Provider>
}

export function useAliasEdit(): AliasEdit {
  const shared = useContext(AliasEditContext)
  const local = useAliasEditState()
  return shared ?? local
}

function useAliasEditState(): AliasEdit {
  const [nodeId, setNodeId] = useState<string | null>(null)
  return useMemo(() => ({ nodeId, open: setNodeId, close: () => setNodeId(null) }), [nodeId])
}
