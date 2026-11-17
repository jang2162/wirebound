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
 * - **뷰 모드를 나가면 그 페이지의 들어가기 전 고름으로 돌아간다**(`viewMode` — 정본 「상호작용」 「실행」 의 «모드가 리셋»). 뷰 모드에서는
 *   상호작용(«화면 상태 바꾸기» — `canvas/canvas.tsx`)도 · 전환기도 같은 값을 바꾸고 모두가 그 값을 보지만, 시연은 어느 페이지의 편집 화면에도
 *   남지 않는다. 뷰 모드 동안 연 페이지마다 들어가기 전 고름을 적어 두고(들어간 페이지는 그때의 고름 · 뷰 모드에서 처음 연 페이지는 기본 —
 *   페이지를 옮기면 고름이 기본으로 돌아가므로), 페이지를 옮겨도 앞 페이지의 기록을 버리지 않는다. 나갈 때 선 페이지가 그 기록으로 돌아간다 —
 *   떠났다 돌아와 나가도 들어가기 전 고름이다. 되돌림도 렌더 중에 한다(위와 같은 까닭). 주소 `?state=` 는 `shell/view-state-address.ts` 가
 *   나갈 때 되돌린 고름으로 맞춘다.
 * - **깔지 않은 판**(컴포넌트를 혼자 그리는 케이스)은 늘 기본이고 `choose` 는 아무것도 안 한다.
 *
 * 상태를 고른 채 편집해도 노드는 하나다 — 숨은 노드도 고르고 고칠 수 있다(구조 트리가 흐리게 그린다 · 캔버스는 안 그린다).
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { childLists, isVisibleIn, viewStateOrder, type PageDocument, type ViewState, type WbNode } from '@wirebound/schema'
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

export function ViewStateProvider(props: {
  pageId: string | undefined
  /** 지금 뷰 모드인가 — 나갈 때 들어가기 전 고름으로 되돌린다(머리말). 안 주면 늘 편집 모드다. */
  viewMode?: boolean
  children: ReactNode
}): ReactElement {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [seenPage, setSeenPage] = useState(props.pageId)
  const viewMode = props.viewMode === true
  const [seenMode, setSeenMode] = useState(viewMode)
  /** 뷰 모드 동안 연 페이지마다 들어가기 전 고름(기본이면 `null`) — 나갈 때 선 페이지가 되돌린다. 뷰 모드가 아니면 `null`. */
  const [beforeView, setBeforeView] = useState<ReadonlyMap<string, string | null> | null>(null)
  let before = beforeView
  // 페이지가 바뀐 렌더에서 곧바로 지운다(머리말 «페이지를 옮기면 …»).
  let current = chosen
  if (seenPage !== props.pageId) {
    setSeenPage(props.pageId)
    setChosen(null)
    current = null
    // 뷰 모드에서 처음 연 페이지의 들어가기 전 고름은 기본이다 — 이미 적은 페이지(떠났다 돌아옴)는 그 기록을 둔다.
    if (before !== null && props.pageId !== undefined && !before.has(props.pageId)) {
      before = new Map(before).set(props.pageId, null)
      setBeforeView(before)
    }
  }
  if (seenMode !== viewMode) {
    setSeenMode(viewMode)
    if (viewMode) {
      before = props.pageId === undefined ? new Map() : new Map([[props.pageId, current?.pageId === props.pageId ? current.state : null]])
      setBeforeView(before)
    } else {
      const state = props.pageId === undefined ? null : (before?.get(props.pageId) ?? null)
      const back = state === null || props.pageId === undefined ? null : { pageId: props.pageId, state }
      setChosen(back)
      setBeforeView(null)
      current = back
    }
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

/**
 * **그 노드가 보이는 화면 상태**(코멘트 묶음을 고를 때 — `panels/comment-panel.tsx`). 지금 상태에서 보이면 안 바꾼다. 숨었으면 «기본» → 상태 트리
 * 차례(`viewStateOrder`)로 그 노드가 보이는 첫 상태다. 어느 상태에서도 안 보이거나 문서 · 노드가 없으면 안 바꾼다 — 고른 사람의 화면을 까닭 없이
 * 뒤집지 않는다.
 */
export function stateShowingNode(
  document: Pick<PageDocument, 'root' | 'viewStates'> | null,
  nodeId: string,
  current: string | null,
): { change: false } | { change: true; state: string | null } {
  // 없는 노드 · 없는 문서도 여기서 끝난다 — 숨은 집합에 없다.
  if (document === null || !hiddenNodeIds(document, current).has(nodeId)) return { change: false }
  const candidates: (string | null)[] = [null, ...viewStateOrder(document.viewStates).map((entry) => entry.state.id)]
  for (const state of candidates) {
    if (!hiddenNodeIds(document, state).has(nodeId)) return { change: true, state }
  }
  return { change: false }
}

/** 지금 상태에서 숨은 노드(`hiddenNodeIds`) — 구조 트리의 흐림 · 표지가 쓴다. */
export function useHiddenNodes(pageId: string | undefined): ReadonlySet<string> {
  const document = useOpenDocument(pageId)
  const { state } = useViewState(pageId)
  return useMemo(() => hiddenNodeIds(document, state), [document, state])
}
