/**
 * **구조 트리 줄의 별칭 입력이 어느 노드에 서 있나** — 화면의 상태 하나(노드 id 또는 `null`).
 *
 * 입력은 구조 트리가 그리지만 여는 입구가 트리 밖에도 있다 — F2 는 에디터 단축키(`shell/editor-keys.tsx`)가 받는다(캔버스에 포커스가
 * 있어도 선다). 둘은 명령 훅(`useStructureCommands`)을 각자 만들어 훅의 상태로는 나눠 가질 수 없어, 셸이 이 상자를 한 번 깔고 둘이 같은
 * 값을 본다. 스토어에 두지 않는다 — 서버 · 되돌리기와 무관한 화면 상태다.
 *
 * **상자가 없으면 그 컴포넌트 안의 상태로 물러선다** — 구조 트리만 띄운 판도 더블클릭 · `…` 로 연다(F2 만 셸 밖에서 안 닿는다).
 *
 * **입력은 노드 id 에 매인다 — 그 노드가 문서에서 빠지면 상자를 닫는다.** 빠지는 길은 같은 사람의 다른 탭 · 같은 계정의 에이전트 · 복원이다(남은
 * 고른 노드를 못 지운다 — 423). 닫지 않으면 입력은 그 줄과 함께 말없이 내려가 친 글이 사라지고, 같은 id 가 되살아나는 순간(되돌리기 · 다른
 * 탭) 묻지 않은 입력이 다시 서며 포커스를 가져간다. 친 글이 있었으면 하단 바에 속성 칸과 같은 한 줄(`DROPPED_DRAFT_NOTICE`)을 세운다 —
 * 잃음 통지가 서 있으면 덮지 않는다. 판정은 스토어의 문서로 한다(구조 트리가 안 그려진 판에서도 상자는 산다 — F2 는 상태만 연다).
 *
 * **친 글은 상자가 든다**(`draft`) — 노드가 다른 부모로 옮겨지면 줄이 새로 마운트되어 입력의 상태가 처음 값으로 돌아간다. 새 입력은 상자의
 * 글로 선다. 친 글은 화면을 다시 그릴 일이 없어 상태가 아니라 ref 다(치는 동안 셸이 다시 그려지지 않게).
 */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { findNodeSafely } from '../edit/safe-walk'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'
import { DROPPED_DRAFT_NOTICE } from './property-panel'

export interface AliasEdit {
  /** 입력이 선 노드. 없으면 `null`. */
  nodeId: string | null
  open: (nodeId: string) => void
  close: () => void
  /** 입력에 친 글 — 열고 나서 친 적이 없으면 `null`. */
  draft: () => string | null
  /** 입력이 친 글을 상자에 적는다. */
  type: (value: string) => void
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
  const store = useEditorStoreInstance()
  const document = useEditorStore(store, (s) => s.document)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const typed = useRef<string | null>(null)
  // 노드가 빠진 그 커밋에서 닫는다 — 다음 문서(되살림)가 들기 전에.
  useLayoutEffect(() => {
    if (nodeId === null) return
    if (document !== null && findNodeSafely(document.root, nodeId) !== undefined) return
    setNodeId(null)
    if (typed.current !== null && !store.showsLoss()) store.setEditFailure({ kind: 'message', message: DROPPED_DRAFT_NOTICE })
    typed.current = null
  }, [document, nodeId, store])
  return useMemo(
    () => ({
      nodeId,
      open: (id: string) => {
        typed.current = null
        setNodeId(id)
      },
      close: () => {
        typed.current = null
        setNodeId(null)
      },
      draft: () => typed.current,
      type: (value: string) => {
        typed.current = value
      },
    }),
    [nodeId],
  )
}
