/**
 * **코멘트 목록을 다시 읽으라는 신호의 통로.** 소켓이 받은 것(`use-realtime.ts`)을 열린 코멘트 목록(`panels/comment-panel.tsx`)이 듣는다 —
 * 연결 id 홀더와 같은 까닭으로 `RealtimeSetup`에 든다(소켓이 쓰고 패널이 읽는다 · 모듈 전역이면 트리를 여럿 세우는 테스트가 서로의 것을 덮는다).
 *
 * 신호는 셋이다 — `comments-changed`(남이 그 페이지의 코멘트를 달고 · 고치고 · 지웠다), `page-stale`(답을 잃은 쓰기가 늦게 커밋됐다 —
 * 코멘트 게시 · 삭제도 그 길이다), 다시 붙음(끊긴 동안의 신호는 사라졌다 — `pageId` 없이 «어느 페이지든»). 듣는 쪽이 없으면 버린다 —
 * 목록은 열릴 때 읽는다.
 */
export interface CommentSignals {
  /** 그 페이지의 목록이 낡았다. `pageId`가 없으면 열린 목록 전부다. */
  emit(pageId?: string): void
  /** 듣는다 — 돌려준 함수가 그만 듣는다. */
  subscribe(listener: (pageId: string | undefined) => void): () => void
}

export function createCommentSignals(): CommentSignals {
  const listeners = new Set<(pageId: string | undefined) => void>()
  return {
    emit: (pageId) => {
      for (const listener of listeners) listener(pageId)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
