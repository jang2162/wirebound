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
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { ViewState } from '@wirebound/schema'
import { useOpenDocument } from '../store/use-editor-store'

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
}

const ViewStateContext = createContext<ViewStateContextValue | null>(null)

export function ViewStateProvider(props: { pageId: string | undefined; children: ReactNode }): ReactElement {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [dialog, setDialog] = useState<ManageDialog | null>(null)
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
  const value = useMemo(() => ({ chosen: current, setChosen, dialog, setDialog }), [current, dialog])
  return createElement(ViewStateContext.Provider, { value }, props.children)
}

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

/** 상태 다루기 상자의 열림 — 전환기 · 접힌 `…` 의 항목이 열고, 상자가 닫는다. 깔지 않은 판은 늘 닫혀 있다. */
export function useManageDialog(): { dialog: ManageDialog | null; open: (dialog: ManageDialog) => void; close: () => void } {
  const context = useContext(ViewStateContext)
  const setDialog = context?.setDialog
  const open = useCallback((dialog: ManageDialog) => setDialog?.(dialog), [setDialog])
  const close = useCallback(() => setDialog?.(null), [setDialog])
  return { dialog: context?.dialog ?? null, open, close }
}
