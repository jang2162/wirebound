/**
 * 코멘트 본문 — 토큰(`[글](wb:…)`)을 지금의 이름 · 번호로 풀어 링크로 그린다(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md`
 * «풀린 모양» · «이동»). 풀기는 `@wirebound/schema` 의 `resolveCommentTokens` 한 벌이다 — 번들 · PPTX · MCP · CLI 와 같은 글이다.
 *
 * 날 id 는 글자로 안 보인다 — 링크의 `href` 에만 있다. 끊긴 토큰은 대체 글 + «찾을 수 없음» 이고 누를 수 없다(까닭을 가르지 않는다 — 가르면
 * 남의 프로젝트 id 의 존재가 샌다). 색인을 아직 못 읽었으면(`context` 가 `null`) 토큰은 대체 글로만 선다 — 끊겼다고 단언하지 않는다.
 */
import type { MouseEvent, ReactElement } from 'react'
import { useNavigate } from 'react-router'
import {
  COMMENT_TOKEN_BROKEN_TEXT,
  parseCommentBody,
  resolveCommentTokens,
  type CommentTokenContext,
  type CommentTokenTarget,
} from '@wirebound/schema'

/** 토큰이 데려갈 주소. 번호는 그 페이지를 열고 노드를 고른 뒤 코멘트 탭에서 그 묶음으로 간다(`comments/comment-focus.tsx`). */
export function commentTokenHref(projectId: string, target: CommentTokenTarget): string {
  const project = `/projects/${encodeURIComponent(projectId)}`
  switch (target.kind) {
    case 'page':
      return `${project}/pages/${encodeURIComponent(target.pageId)}`
    case 'comment':
      return `${project}/pages/${encodeURIComponent(target.pageId)}?${new URLSearchParams({ node: target.nodeId, comment: '1' })}`
    case 'code': {
      const query = new URLSearchParams({ group: target.group })
      if (target.item !== undefined) query.set('item', target.item)
      return `${project}/codes?${query}`
    }
  }
}

export function CommentBody(props: { body: string; context: CommentTokenContext | null; projectId: string }): ReactElement {
  const navigate = useNavigate()
  if (props.context === null) {
    return (
      <p className="wb-shell-comment-body">
        {parseCommentBody(props.body)
          .map((segment) => (segment.type === 'text' ? segment.text : segment.label))
          .join('')}
      </p>
    )
  }
  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string): void => {
    // 새 탭 · 새 창으로 여는 누름은 브라우저에 맡긴다.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void navigate(href)
  }
  return (
    <p className="wb-shell-comment-body">
      {resolveCommentTokens(props.body, props.context).map((segment, index) => {
        if (segment.type === 'text') return segment.text
        if (segment.type === 'broken') {
          return (
            <span key={index} className="wb-shell-comment-token-broken">
              {segment.text}
              <span className="wb-shell-comment-token-note"> {COMMENT_TOKEN_BROKEN_TEXT}</span>
            </span>
          )
        }
        const href = commentTokenHref(props.projectId, segment.target)
        return (
          <a key={index} className="wb-shell-comment-token" href={href} onClick={(event) => follow(event, href)}>
            {segment.text}
          </a>
        )
      })}
    </p>
  )
}
