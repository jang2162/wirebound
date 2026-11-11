/**
 * **코멘트 토큰이 데려온 번호** — 번호 토큰을 누르면 주소가 `?node=<id>&comment=1` 로 그 페이지를 열고(`panels/comment-body.tsx` 의 `commentTokenHref`),
 * 셸이 그 노드를 고른 뒤(`routes/editor.tsx` 의 `useNodeFromAddress`) 이 값을 세운다. 우측 패널이 «코멘트» 탭으로 가고, 코멘트 패널이 그 묶음으로
 * 굴려 잠깐 강조한다. `at` 은 누를 때마다 다른 값이라 같은 번호를 다시 눌러도 다시 선다.
 */
import { createContext, useContext } from 'react'

export interface CommentFocus {
  nodeId: string
  at: number
}

export const CommentFocusContext = createContext<CommentFocus | null>(null)

export function useCommentFocus(): CommentFocus | null {
  return useContext(CommentFocusContext)
}

/** 강조가 서 있는 시간. */
export const COMMENT_FLASH_MS = 1500
