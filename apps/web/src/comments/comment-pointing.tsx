/**
 * **코멘트가 가리킨 노드** — «코멘트» 탭의 묶음에 포커스가 들면 코멘트 패널(`panels/comment-panel.tsx`)이 그 노드를 세우고, 캔버스
 * (`canvas/canvas.tsx`)가 그 노드에 고른 것과 같은 링을 그린다. 셸(`routes/editor.tsx` 의 `EditorShell`)이 한 번 깐다.
 *
 * - **진짜 선택이 아니다.** 스토어의 `selectedNodeId(s)` 를 고르면 새 코멘트의 «달 곳» · 노드마다의 초안이 그 노드로 바뀌고 소프트 잠금이 서
 *   남의 편집을 기다리게 한다 — 읽기만 했는데 그 일이 나면 안 된다. 그래서 스토어 밖의 셸 값이다.
 * - **번호 토큰이 데려온 강조(`./comment-focus.tsx` 의 `CommentFocus`)와 다른 값이다** — 그것은 주소가 노드를 **고르고** 코멘트 탭에서 묶음을
 *   잠깐 빛낸다. 이것은 코멘트 탭이 캔버스를 **가리킬** 뿐이다. 이름이 겹치지 않게 «가리킴»이라 부른다.
 * - **걷히는 때:** 다른 묶음으로 포커스가 감(그 노드로 바뀜) · 캔버스를 누름(`canvas/canvas.tsx`) · «코멘트» 탭이 안 보임(탭을 옮김 · 우측을
 *   접음 — `routes/editor.tsx` 의 `RightPanel`) · 그 노드가 문서에서 사라짐(아래 `CommentPointingSweep` — 남이 지운 뒤 같은 id 로 다시 세워도
 *   사람 몸짓 없이 링이 되살지 않게 값을 걷는다) · 페이지를 옮김(아래 provider — 렌더 중에 걷는다. 이펙트로 걷으면 옮긴 첫 렌더가 앞 페이지의
 *   노드 id 로 링을 잰다. `shell/use-view-state.ts` 의 `ViewStateProvider` 와 같은 꼴). 포커스가 묶음 밖으로 나가기만 해서는 안 걷는다.
 * - **깔지 않은 판**(패널 · 캔버스를 혼자 세운 케이스)은 늘 `null` 이고 `point` 는 아무것도 안 한다.
 *
 * ## 펼침 — 고른 묶음의 노드가 부모에 가려 있으면 펼쳐 그린다
 *
 * 지금 탭이 아닌 패널 · 접힌 검색폼 안 노드는 화면 상태와 무관하게 DOM 에 없어 링이 설 자리가 없다. 묶음을 **고르면**(패널의 `showNode` — 묶음에
 * 포커스가 듦 · 묶음 누름 · Enter/Space · 머리 단추) 캔버스가 그 노드를 렌더러 `reveal` 로 펼친 판으로 그린다 — 진짜 선택이 고른 노드를 펼치는 것과
 * 같은 장치다(`canvas/canvas.tsx` 의 `reveal`). 문서는 안 바뀐다. 화면 상태 전환과 같은 규칙이다 — 고를 때 곧바로 펼치고, 포커스가 다른 묶음 ·
 * 탭으로 떠나도 되돌리지 않는다.
 *
 * **걷히는 때:** 다른 묶음을 고름(그 노드로 바뀜) · 캔버스를 누름(뷰 모드에서 그 탭 줄을 누르면 상호작용 겹layer 의 탭이 서야 한다 — 펼침이 덮으면
 * 탭이 안 바뀐다) · 그 노드가 문서에서 사라짐(`CommentPointingSweep`) · 진짜 선택이 바뀜(그 선택의 펼침이 이긴다 — 고를 때의 선택을 `selection` 으로 적어 두고 캔버스가 견준다) · 페이지를 옮김.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { findNodeSafely } from '../edit/safe-walk'
import { useOpenDocument } from '../store/use-editor-store'

export interface CommentPointing {
  /** 가리킨 노드 — 없으면 `null`. */
  nodeId: string | null
  /** 노드를 가리킨다 — `null` 이면 걷는다. 페이지가 같은 동안 같은 함수다(이펙트의 의존에 둬도 된다). */
  point: (nodeId: string | null) => void
  /** 펼쳐 그릴 노드(머리말 «펼침») — 고를 때의 진짜 선택(`selectedNodeIds` 를 줄바꿈으로 이은 글)과 함께. 없으면 `null`. */
  revealed: Revealed | null
  /** 고른 묶음의 노드를 펼친다 — `null` 이면 걷는다. 부를 때마다 새 값이다(같은 노드여도). `point` 와 같이 페이지가 같은 동안 같은 함수다. */
  reveal: (target: Revealed | null) => void
}

export interface Revealed {
  nodeId: string
  /** 고를 때의 진짜 선택 — 캔버스가 지금 선택과 다르면 이 펼침을 버린다. */
  selection: string
}

const CommentPointingContext = createContext<CommentPointing | null>(null)

interface Pointed {
  pageId: string | undefined
  nodeId: string
}

interface RevealedOn extends Revealed {
  pageId: string | undefined
}

export function CommentPointingProvider(props: { pageId: string | undefined; children: ReactNode }): ReactElement {
  const [pointed, setPointed] = useState<Pointed | null>(null)
  const [revealedOn, setRevealedOn] = useState<RevealedOn | null>(null)
  const [seenPage, setSeenPage] = useState(props.pageId)
  let current = pointed
  let currentReveal = revealedOn
  if (seenPage !== props.pageId) {
    setSeenPage(props.pageId)
    setPointed(null)
    setRevealedOn(null)
    current = null
    currentReveal = null
  }
  const { pageId } = props
  const nodeId = current !== null && current.pageId === pageId ? current.nodeId : null
  const revealed = useMemo<Revealed | null>(
    () =>
      currentReveal !== null && currentReveal.pageId === pageId
        ? { nodeId: currentReveal.nodeId, selection: currentReveal.selection }
        : null,
    [currentReveal, pageId],
  )
  const point = useCallback(
    (next: string | null) =>
      setPointed((prev) => {
        if (next === null) return prev === null ? prev : null
        return prev !== null && prev.pageId === pageId && prev.nodeId === next ? prev : { pageId, nodeId: next }
      }),
    [pageId],
  )
  // 고를 때마다 새 값이다 — 같은 노드를 다시 골라도 캔버스가 «새로 골랐다» 를 알아본다(그 노드를 칸 안으로 굴린다 — `canvas/canvas.tsx` 의 `scrolledPick`).
  const reveal = useCallback(
    (next: Revealed | null) =>
      setRevealedOn((prev) => (next === null ? (prev === null ? prev : null) : { pageId, nodeId: next.nodeId, selection: next.selection })),
    [pageId],
  )
  const value = useMemo<CommentPointing>(() => ({ nodeId, point, revealed, reveal }), [nodeId, point, revealed, reveal])
  return createElement(CommentPointingContext.Provider, { value }, props.children)
}

const NOWHERE: CommentPointing = { nodeId: null, point: () => {}, revealed: null, reveal: () => {} }

export function useCommentPointing(): CommentPointing {
  return useContext(CommentPointingContext) ?? NOWHERE
}

/**
 * **가리킨 · 펼친 노드가 문서에서 사라지면 걷는다**(머리말 «걷히는 때») — provider 안에 한 번 그린다(`routes/editor.tsx` 의 `EditorShell`). 링은 요소가
 * 없는 노드에 안 서지만 값이 남으면, 남의 되돌리기 · 다시 붙이기로 같은 id 가 다시 설 때 사람이 다른 데를 보고 있어도 링이 선다. 그리기 전에
 * 걷는다(`useLayoutEffect`). 문서를 못 읽은 판(`null`)은 사라진 것이 아니라 모르는 것이라 안 걷는다.
 */
export function CommentPointingSweep(props: { pageId: string | undefined }): null {
  const document = useOpenDocument(props.pageId)
  const { nodeId, point, revealed, reveal } = useCommentPointing()
  useLayoutEffect(() => {
    if (document === null) return
    if (nodeId !== null && findNodeSafely(document.root, nodeId) === undefined) point(null)
    if (revealed !== null && findNodeSafely(document.root, revealed.nodeId) === undefined) reveal(null)
  }, [document, nodeId, revealed, point, reveal])
  return null
}
