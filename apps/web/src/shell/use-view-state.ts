/**
 * **지금 고른 화면 상태**(설계서 「설계서 화면 구조」 «화면 상태») — 사람 · 탭마다의 화면 값이다. 서버에 안 가고 남의 화면을 안 바꾼다.
 *
 * - **셸이 한 번 깐다**(`ViewStateProvider` — `routes/editor.tsx` 의 `EditorShell`). 머리 전환기 · 메뉴 트리의 상태 줄 · 캔버스 · 구조 트리 ·
 *   속성 패널이 같은 값을 본다.
 * - **페이지를 옮기면 기본으로 돌아간다.** 옮겼다가 돌아와도 기본이다 — 고른 값을 페이지 id 와 함께 적고, 깐 쪽의 `pageId` 가 바뀌면 렌더 중에
 *   지운다(이펙트로 지우면 옮긴 첫 렌더가 앞 페이지의 상태로 새 페이지를 그린다). 다른 페이지의 상태 줄은 주소 `?state=` 로 연다
 *   (`shell/view-state-address.ts` 가 페이지를 열 때 읽는다).
 * - **목록에 없는 상태는 기본이다.** 고른 상태를 남이 지웠거나 아직 문서가 안 실렸으면 `state` 는 `null` 이다 — 렌더러가 목록 밖 id 를
 *   기본으로 읽는 것(`renderDocument`)과 같은 결이다. 고른 값 자체는 지우지 않는다(남의 삭제를 되돌리면 다시 선다).
 * - **깔지 않은 판**(컴포넌트를 혼자 그리는 케이스)은 늘 기본이고 `choose` 는 아무것도 안 한다.
 *
 * 상태를 고른 채 편집해도 노드는 하나다 — 숨은 노드도 고르고 고칠 수 있다(구조 트리가 흐리게 그린다 · 캔버스는 안 그린다).
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { childLists, isVisibleIn, type PageDocument, type ViewState, type WbNode } from '@wirebound/schema'
import { useOpenDocument } from '../store/use-editor-store'

interface Chosen {
  pageId: string
  state: string
}

interface ViewStateContextValue {
  chosen: Chosen | null
  setChosen: (chosen: Chosen | null) => void
}

const ViewStateContext = createContext<ViewStateContextValue | null>(null)

export function ViewStateProvider(props: { pageId: string | undefined; children: ReactNode }): ReactElement {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [seenPage, setSeenPage] = useState(props.pageId)
  // 페이지가 바뀐 렌더에서 곧바로 지운다(머리말 «페이지를 옮기면 …»).
  let current = chosen
  if (seenPage !== props.pageId) {
    setSeenPage(props.pageId)
    setChosen(null)
    current = null
  }
  const value = useMemo(() => ({ chosen: current, setChosen }), [current])
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

const NO_HIDDEN: ReadonlySet<string> = new Set()

/**
 * 그 상태에서 숨은 노드 — 자기 보임으로 숨는 노드와 그 자손 전부(`isVisibleIn` · 부모가 숨으면 자손도 숨는다). 뿌리는 숨지 않는다. 검증 전
 * 문서(노드가 아닌 자식)를 견딘다. 숨은 노드가 없으면 같은 빈 집합을 돌려준다.
 */
export function hiddenNodeIds(document: Pick<PageDocument, 'root' | 'viewStates'> | null, state: string | null): ReadonlySet<string> {
  if (document === null) return NO_HIDDEN
  const out = new Set<string>()
  const visit = (node: unknown, hidden: boolean): void => {
    if (node === null || typeof node !== 'object') return
    const { id } = node as { id?: unknown }
    const here = hidden || (node !== document.root && !isVisibleIn(node as WbNode, state, document.viewStates))
    if (here && typeof id === 'string') out.add(id)
    for (const { list } of childLists(node)) for (const child of list) visit(child, here)
  }
  visit(document.root, false)
  return out.size === 0 ? NO_HIDDEN : out
}

/** 지금 상태에서 숨은 노드(`hiddenNodeIds`) — 구조 트리의 흐림 · 표지가 쓴다. */
export function useHiddenNodes(pageId: string | undefined): ReadonlySet<string> {
  const document = useOpenDocument(pageId)
  const { state } = useViewState(pageId)
  return useMemo(() => hiddenNodeIds(document, state), [document, state])
}
