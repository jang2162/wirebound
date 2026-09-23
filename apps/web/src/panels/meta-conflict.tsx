/**
 * **«다른 사람이 바꿨습니다» 화면 — 페이지 메타(제목 · 설명)에 하나**(이월 P · 2026-09-23). 판정은
 * `api/page-meta.ts`가 하고, 이 컴포넌트는 그 결과(`'other'`)를 보이고 둘 중 하나를 고르게 한다:
 *
 * - **«내 글로 덮기»** — 그 사람의 값을 **새 바탕**으로 내 글을 다시 보낸다. 덮는 것은 **지금 보고 있는 값**뿐이다 —
 *   그 사이 또 바뀌었으면 서버가 또 409 를 내고 이 화면이 새 값으로 다시 선다.
 * - **«내 글 버리기»** — 그 사람의 값을 받는다. 초안이 사라진다.
 *
 * **그 사람의 값을 글 그대로 보인다** — 무엇을 덮는지 모르고 덮게 하지 않는다. 비었으면(`null`) 비었다고 적는다.
 * `role="alert"`인 것은 사용자가 방금 누른 저장이 **안 된** 것이라서다(실패 통지와 같은 자리).
 */
import type { ReactElement } from 'react'

/** 무엇이 바뀌었나 — 문장의 자리 하나. 둘 다 받침으로 끝나 조사가 같다(«…을»). */
export type MetaWhat = '제목' | '설명'

export function MetaConflict(props: {
  what: MetaWhat
  /** 서버가 견준 그 사람의 값. */
  theirs: string | null
  onOverwrite: () => void
  onDiscard: () => void
  /** 덮기가 나가 있는 동안 둘 다 끈다. */
  disabled?: boolean
}): ReactElement {
  const { what, theirs } = props
  return (
    <div className="wb-shell-meta-conflict" role="alert">
      <p className="wb-shell-meta-conflict-lead">다른 사람이 이 {what}을 바꿨습니다</p>
      <p className="wb-shell-meta-conflict-label">지금 저장된 {what}</p>
      <p className="wb-shell-meta-conflict-theirs">{theirs === null || theirs === '' ? `(${what} 없음)` : theirs}</p>
      <div className="wb-shell-meta-conflict-actions">
        <button type="button" className="wb-shell-meta-conflict-button" disabled={props.disabled} onClick={props.onOverwrite}>
          내 글로 덮기
        </button>
        <button type="button" className="wb-shell-meta-conflict-button" disabled={props.disabled} onClick={props.onDiscard}>
          내 글 버리기
        </button>
      </div>
    </div>
  )
}
