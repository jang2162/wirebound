/**
 * **코멘트가 가리킨 노드** — «코멘트» 탭의 묶음에 포커스가 들면 코멘트 패널(`panels/comment-panel.tsx`)이 그 노드를 세우고, 캔버스
 * (`canvas/canvas.tsx`)가 그 노드에 고른 것과 같은 링을 그린다. 셸(`routes/editor.tsx` 의 `EditorShell`)이 한 번 깐다.
 *
 * - **진짜 선택이 아니다.** 스토어의 `selectedNodeId(s)` 를 고르면 새 코멘트의 «달 곳» · 노드마다의 초안이 그 노드로 바뀌고 소프트 잠금이 서
 *   남의 편집을 기다리게 한다 — 읽기만 했는데 그 일이 나면 안 된다. 그래서 스토어 밖의 셸 값이다.
 * - **번호 토큰이 데려온 강조(`./comment-focus.tsx` 의 `CommentFocus`)와 다른 값이다** — 그것은 주소가 노드를 **고르고** 코멘트 탭에서 묶음을
 *   잠깐 빛낸다. 이것은 코멘트 탭이 캔버스를 **가리킬** 뿐이다. 이름이 겹치지 않게 «가리킴»이라 부른다.
 * - **걷히는 때:** 다른 묶음으로 포커스가 감(그 노드로 바뀜) · 캔버스를 누름(`canvas/canvas.tsx`) · «코멘트» 탭이 안 보임(탭을 옮김 · 우측을
 *   접음 — `routes/editor.tsx` 의 `RightPanel`) · 페이지를 옮김(아래 provider — 렌더 중에 걷는다. 이펙트로 걷으면 옮긴 첫 렌더가 앞 페이지의
 *   노드 id 로 링을 잰다. `shell/use-view-state.ts` 의 `ViewStateProvider` 와 같은 꼴). 포커스가 묶음 밖으로 나가기만 해서는 안 걷는다.
 * - **깔지 않은 판**(패널 · 캔버스를 혼자 세운 케이스)은 늘 `null` 이고 `point` 는 아무것도 안 한다.
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'

export interface CommentPointing {
  /** 가리킨 노드 — 없으면 `null`. */
  nodeId: string | null
  /** 노드를 가리킨다 — `null` 이면 걷는다. 페이지가 같은 동안 같은 함수다(이펙트의 의존에 둬도 된다). */
  point: (nodeId: string | null) => void
}

const CommentPointingContext = createContext<CommentPointing | null>(null)

interface Pointed {
  pageId: string | undefined
  nodeId: string
}

export function CommentPointingProvider(props: { pageId: string | undefined; children: ReactNode }): ReactElement {
  const [pointed, setPointed] = useState<Pointed | null>(null)
  const [seenPage, setSeenPage] = useState(props.pageId)
  let current = pointed
  if (seenPage !== props.pageId) {
    setSeenPage(props.pageId)
    setPointed(null)
    current = null
  }
  const { pageId } = props
  const nodeId = current !== null && current.pageId === pageId ? current.nodeId : null
  const point = useCallback(
    (next: string | null) =>
      setPointed((prev) => {
        if (next === null) return prev === null ? prev : null
        return prev !== null && prev.pageId === pageId && prev.nodeId === next ? prev : { pageId, nodeId: next }
      }),
    [pageId],
  )
  const value = useMemo<CommentPointing>(() => ({ nodeId, point }), [nodeId, point])
  return createElement(CommentPointingContext.Provider, { value }, props.children)
}

const NOWHERE: CommentPointing = { nodeId: null, point: () => {} }

export function useCommentPointing(): CommentPointing {
  return useContext(CommentPointingContext) ?? NOWHERE
}
