/**
 * **지금 고른 화면 상태**(설계서 「설계서 화면 구조」 «화면 상태») — 사람 · 탭마다의 화면 값이다. 서버에 안 가고 남의 화면을 안 바꾼다.
 *
 * - **셸이 한 번 깐다**(`ViewStateProvider` — `routes/editor.tsx` 의 `EditorShell`). 머리 전환기 · 캔버스 · 구조 트리 · 편집 명령이 같은 값을 본다.
 * - **페이지를 옮기면 기본으로 돌아간다.** 옮겼다가 돌아와도 기본이다 — 고른 값을 페이지 id 와 함께 적고, 깐 쪽의 `pageId` 가 바뀌면 렌더 중에
 *   지운다(이펙트로 지우면 옮긴 첫 렌더가 앞 페이지의 상태로 새 페이지를 그린다).
 * - **목록에 없는 상태는 기본이다.** 고른 상태를 남이 지웠거나 아직 문서가 안 실렸으면 `state` 는 `null` 이다 — 렌더러가 목록 밖 id 를
 *   기본으로 읽는 것(`renderDocument`)과 같은 결이다. 고른 값 자체는 지우지 않는다(남의 삭제를 되돌리면 다시 선다).
 * - **깔지 않은 판**(컴포넌트를 혼자 그리는 케이스)은 늘 기본이고 `choose` 는 아무것도 안 한다.
 *
 * 읽기 주소 `?state=` 는 이 훅이 모른다 — 뷰 모드 · viewer 가 주소를 읽어 `choose` 를 부른다.
 *
 * **«모든 가지 보기»도 여기 둔다**(`useAllCases`) — 구조 트리의 토글이지만 편집 판정(`edit/use-edit-commit.tsx` 의 `commitOps` — 안 보이는 가지를
 * 고치는 편집을 막는다)과 고른 것 정리(아래 `HiddenSelectionPrune`)가 같은 값을 본다. 트리 하나의 화면 값이라 페이지를 옮겨도 그대로다.
 *
 * **고른 노드가 안 보이게 되면 고른 것에서 뺀다**(`HiddenSelectionPrune` — K2 리뷰 H2). 남이 같은 영역에 지금 상태의 가지를 먼저 만들면 고르던
 * 흐린 노드가 숨은 기본 가지가 된다 — 고른 채 두면 속성 패널이 안 보이는 노드를 그리고 친 글이 그 노드(모든 상태가 보는 기본 가지)에 썼다. 상태를
 * 바꾸거나 «모든 가지 보기»를 끈 판도 같다. 뺄 때 위젯이 넘기는 초안은 그 노드에 안 쓴다(`panels/property-panel.tsx` 의 `useLeftoverCommit` ·
 * `panels/alias-edit.tsx` — 하단 바 `DROPPED_DRAFT_NOTICE`).
 */
import { createContext, createElement, Fragment, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { ViewState } from '@wirebound/schema'
import { hiddenNodeIds } from '../edit/view-state-fork'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'

interface Chosen {
  pageId: string
  state: string
}

/** 열린 상태 다루기 상자 — «상태 추가»(이름 칸 하나) · «상태 관리…»(목록 전부). `shell/view-states-dialog.tsx` 가 그린다. */
export type ManageDialog = 'add' | 'manage'

interface ViewStateContextValue {
  chosen: Chosen | null
  setChosen: (chosen: Chosen | null) => void
  dialog: ManageDialog | null
  setDialog: (dialog: ManageDialog | null) => void
  allCases: boolean
  setAllCases: (next: boolean | ((on: boolean) => boolean)) => void
}

const ViewStateContext = createContext<ViewStateContextValue | null>(null)

export function ViewStateProvider(props: { pageId: string | undefined; children: ReactNode }): ReactElement {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [dialog, setDialog] = useState<ManageDialog | null>(null)
  const [allCases, setAllCases] = useState(false)
  const [seenPage, setSeenPage] = useState(props.pageId)
  // 페이지가 바뀐 렌더에서 곧바로 지운다(머리말 «페이지를 옮기면 …»).
  let current = chosen
  if (seenPage !== props.pageId) {
    setSeenPage(props.pageId)
    setChosen(null)
    current = null
    // 열린 상자는 앞 페이지의 목록을 다룬다 — 함께 닫는다.
    setDialog(null)
  }
  const value = useMemo(() => ({ chosen: current, setChosen, dialog, setDialog, allCases, setAllCases }), [current, dialog, allCases])
  return createElement(ViewStateContext.Provider, { value }, createElement(Fragment, null, createElement(HiddenSelectionPrune, { pageId: props.pageId }), props.children))
}

/**
 * 고른 노드 가운데 지금 안 보이는 것을 고른 것에서 뺀다(머리말). 문서 · 상태 · «모든 가지 보기»가 바뀐 커밋에서 곧바로 — 레이아웃 이펙트라 안 보이는
 * 노드를 그린 판이 화면에 서지 않는다. 남의 잠금 거절과 같은 스토어 명령(`dropFromSelection`)이다.
 */
function HiddenSelectionPrune(props: { pageId: string | undefined }): null {
  const store = useEditorStoreInstance()
  const document = useOpenDocument(props.pageId)
  const selected = useEditorStore(store, (s) => s.selectedNodeIds)
  const { state } = useViewState(props.pageId)
  const { allCases } = useAllCases()
  useLayoutEffect(() => {
    if (selected.length === 0) return
    const hidden = hiddenNodeIds(document, state, allCases)
    const gone = selected.filter((id) => hidden.has(id))
    if (gone.length === 0) return
    store.dropFromSelection(gone)
    // 고른 것만 빠지고 친 글이 없던 판은 말이 없었다 — 선택 · 속성 패널이 조용히 비어 «왜 사라졌나» 만 남는다. 친 글이 있던 판의 통지
    // (`DROPPED_DRAFT_NOTICE`)는 실패 자리에 따로 선다 — 둘은 다른 일이다(이쪽은 정보 한 줄).
    store.setInfoNotice(HIDDEN_SELECTION_NOTICE)
  }, [store, document, selected, state, allCases])
  return null
}

/** 고른 노드가 지금 상태에서 안 보이게 되어 고른 것에서 뺐을 때의 정보 통지(`HiddenSelectionPrune`). */
export const HIDDEN_SELECTION_NOTICE = '고른 노드가 지금 상태에서는 보이지 않아 선택에서 뺐습니다. «모든 가지 보기»를 켜면 다시 고를 수 있습니다.'

export interface ViewStateChoice {
  /** 지금 상태의 id — 기본이면 `null`. 목록에 없으면 `null`(머리말). */
  state: string | null
  /** 그 페이지의 상태 목록 — 문서가 없거나 목록이 없으면 빈 배열. */
  viewStates: readonly ViewState[]
  /** 상태를 고른다 — `null` 이면 기본. 그 페이지가 열려 있지 않으면 아무것도 안 한다. */
  choose: (state: string | null) => void
}

const NO_STATES: readonly ViewState[] = []

export function useViewState(pageId: string | undefined): ViewStateChoice {
  const context = useContext(ViewStateContext)
  const document = useOpenDocument(pageId)
  const viewStates = Array.isArray(document?.viewStates) ? document.viewStates : NO_STATES
  const chosen = context?.chosen ?? null
  const picked = pageId !== undefined && chosen !== null && chosen.pageId === pageId ? chosen.state : null
  const state = picked !== null && viewStates.some((entry) => entry.id === picked) ? picked : null
  const setChosen = context?.setChosen
  const choose = useCallback(
    (next: string | null) => {
      if (setChosen === undefined || pageId === undefined) return
      setChosen(next === null ? null : { pageId, state: next })
    },
    [setChosen, pageId],
  )
  return { state, viewStates, choose }
}

/** «모든 가지 보기» — 깔지 않은 판(구조 트리만 띄운 케이스)은 그 컴포넌트 안의 상태로 물러선다. */
export function useAllCases(): { allCases: boolean; setAllCases: (next: boolean | ((on: boolean) => boolean)) => void } {
  const context = useContext(ViewStateContext)
  const [local, setLocal] = useState(false)
  return context === null ? { allCases: local, setAllCases: setLocal } : { allCases: context.allCases, setAllCases: context.setAllCases }
}

/** 지금 안 보이는 노드인가(`edit/view-state-fork.ts` 의 `hiddenNodeIds`) — 지금 상태 · «모든 가지 보기»로. */
export function useHiddenNodes(pageId: string | undefined): ReadonlySet<string> {
  const document = useOpenDocument(pageId)
  const { state } = useViewState(pageId)
  const { allCases } = useAllCases()
  return useMemo(() => hiddenNodeIds(document, state, allCases), [document, state, allCases])
}

/** 상태 다루기 상자의 열림 — 전환기 · 접힌 `…` 의 항목이 열고, 상자가 닫는다. 깔지 않은 판은 늘 닫혀 있다. */
export function useManageDialog(): { dialog: ManageDialog | null; open: (dialog: ManageDialog) => void; close: () => void } {
  const context = useContext(ViewStateContext)
  const setDialog = context?.setDialog
  const open = useCallback((dialog: ManageDialog) => setDialog?.(dialog), [setDialog])
  const close = useCallback(() => setDialog?.(null), [setDialog])
  return { dialog: context?.dialog ?? null, open, close }
}
