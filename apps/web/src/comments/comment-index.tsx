/**
 * **에디터 셸이 든 코멘트 번호 색인** — 코멘트 토큰(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md`)을 지금의 이름 · 번호로 푸는 자료.
 * 공통코드 표(`codes/project-codes.tsx`)와 같은 꼴이다 — 셸이 설 때 한 번 읽고, 신호에서 다시 읽고, **마지막에 시작한 조회의 답만 싣는다**.
 *
 * | 다시 읽는 때 | 까닭 |
 * |---|---|
 * | 코멘트 신호(`comments-changed` · `page-stale` · 다시 붙음 — `realtime/comment-signals.ts`) | 번호 · 첫 코멘트 · 토큰이 가리키는 노드가 바뀐다 — 번호를 바꾼 재번호도 `comments-changed` 를 낸다 |
 * | `menu-changed` · `codes-changed` · 다시 붙음(셸이 `reload` 를 부른다) | 페이지 제목 · 메뉴 경로 · 노드 이름이 바뀐다 |
 * | 연 페이지가 바뀜 | 번호를 바꾸는 문서 편집(노드를 지움 · 되돌리기)은 그 페이지의 `page-changed` 만 내고 다른 페이지의 화면에는 신호가 없다 |
 *
 * **열린 페이지는 서버 색인이 아니라 스토어의 문서로 푼다**(`useCommentTokenContext`) — 내 재번호 · 편집이 답을 기다리지 않고 «#3» → «#1» 로 선다.
 * 남이 다른 페이지에서 문서 편집으로 번호를 바꾼 것은 위 표의 다음 때까지 옛 번호로 보인다 — 이동은 id 라 그대로 맞는다.
 *
 * 조회가 실패하면 앞 색인을 그대로 둔다. 한 번도 못 읽었으면 컨텍스트가 `null` 이고 토큰은 대체 글로만 보인다 — «찾을 수 없음» 이라 단언하지 않는다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { buildMarkerIndex, markerKey, type CodeIndex, type CommentTokenContext, type PageDocument } from '@wirebound/schema'
import { useApi } from '../api/context'
import type { CommentIndex } from '../api/types'
import { useProjectCodes } from '../codes/project-codes'
import { useRealtimeSetup } from '../realtime/context'
import { useOpenPage } from '../store/use-editor-store'

export interface ProjectCommentIndex {
  index: CommentIndex | null
  reload: () => void
}

const NO_INDEX: ProjectCommentIndex = { index: null, reload: () => {} }

const CommentIndexContext = createContext<ProjectCommentIndex>(NO_INDEX)

export function ProjectCommentIndexProvider(props: { projectId: string; pageId: string | undefined; children: ReactNode }): ReactElement {
  const api = useApi()
  const signals = useRealtimeSetup()?.comments
  const [index, setIndex] = useState<CommentIndex | null>(null)
  const turn = useRef(0)
  const alive = useRef(true)

  const reload = useCallback(() => {
    const mine = ++turn.current
    void api.commentIndex(props.projectId).then(
      (next) => {
        if (alive.current && turn.current === mine) setIndex(next)
      },
      () => {},
    )
  }, [api, props.projectId])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 설 때 · 연 페이지가 바뀔 때(머리말 표의 셋째 줄).
  useEffect(() => reload(), [reload, props.pageId])
  useEffect(() => signals?.subscribe(() => reload()), [signals, reload])

  const value = useMemo<ProjectCommentIndex>(() => ({ index, reload }), [index, reload])
  return <CommentIndexContext.Provider value={value}>{props.children}</CommentIndexContext.Provider>
}

export function useCommentIndex(): ProjectCommentIndex {
  return useContext(CommentIndexContext)
}

/** 그 페이지의 코멘트를 풀 컨텍스트. 색인을 아직 못 읽었으면 `null`(머리말 끝 문단). */
export function useCommentTokenContext(pageId: string | undefined): CommentTokenContext | null {
  const { index } = useCommentIndex()
  const codes = useProjectCodes().index
  const open = useOpenPage(pageId)
  const document = open?.document ?? null
  return useMemo(() => {
    if (index === null || pageId === undefined) return null
    const live = liveMarkers(pageId, document, codes)
    const markers = new Map<string, { marker: number | null; nodeName: string }>()
    for (const entry of index.markers) {
      if (live !== null && entry.pageId === pageId) continue
      markers.set(markerKey(entry.pageId, entry.nodeId), { marker: entry.marker, nodeName: entry.nodeName })
    }
    if (live !== null) for (const [key, entry] of live) markers.set(key, entry)
    return {
      currentPageId: pageId,
      pages: new Map(index.pages.map((page) => [page.id, { title: page.title, menuPath: page.menuPath }])),
      markers,
      ...(codes === undefined ? {} : { codes }),
    }
  }, [index, pageId, document, codes])
}

/**
 * 열린 문서의 번호 · 이름. 검증 전 문서가 스토어에 실릴 수 있어 순회가 던질 수 있다(`edit/safe-walk.ts`) — 그때는 `null` 이고 서버 색인으로 푼다.
 */
function liveMarkers(
  pageId: string,
  document: PageDocument | null,
  codes: CodeIndex | undefined,
): Map<string, { marker: number | null; nodeName: string }> | null {
  if (document === null) return null
  try {
    return buildMarkerIndex([{ id: pageId, document }], codes)
  } catch {
    return null
  }
}
