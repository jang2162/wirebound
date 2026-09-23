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
 *
 * **판정이 `'late'`면(앞서 보낸 내 저장이 늦게 닿았다 — 리뷰 F2) 같은 화면이 «다른 사람»이라 말하지 않는다.** 지금
 * 저장된 값은 **내가 앞서 보낸 글**이다. 권하는 것은 **덮기**다 — 둘 다 이 창에서 보낸 글이고 뒤의 것이 지금 상자의
 * 글이라, 덮어도 남의 글을 지우지 않는다. 그래서 덮기가 먼저이고 단추 이름이 «지금 글로 덮기»다. 버리기는 «앞서 보낸
 * 글로 두기»다(그 뒤 더 친 글을 버린다). 덮기가 나가는 바탕은 같다 — 보이는 그 값이다(그 사이 남이 또 바꿨으면 409).
 */
import type { ReactElement } from 'react'

/** 무엇이 바뀌었나 — 문장의 자리 하나. 둘 다 받침으로 끝나 조사가 같다(«…을»). */
export type MetaWhat = '제목' | '설명'

export function MetaConflict(props: {
  what: MetaWhat
  /** 서버가 견준 그 사람의 값. */
  theirs: string | null
  /** 그 값이 **앞서 보낸 내 글**이다(`judgeMeta`의 `'late'`) — «다른 사람»이라 말하지 않는다. */
  late?: boolean
  onOverwrite: () => void
  onDiscard: () => void
  /** 덮기가 나가 있는 동안 둘 다 끈다. */
  disabled?: boolean
}): ReactElement {
  const { what, theirs } = props
  const late = props.late ?? false
  return (
    <div className="wb-shell-meta-conflict" role="alert">
      <p className="wb-shell-meta-conflict-lead">
        {late ? `앞서 보낸 ${what}이 늦게 저장됐습니다 — 다른 사람이 바꾼 것이 아닙니다` : `다른 사람이 이 ${what}을 바꿨습니다`}
      </p>
      <p className="wb-shell-meta-conflict-label">{late ? `지금 저장된 ${what} — 앞서 보낸 글` : `지금 저장된 ${what}`}</p>
      <p className="wb-shell-meta-conflict-theirs">{theirs === null || theirs === '' ? `(${what} 없음)` : theirs}</p>
      <div className="wb-shell-meta-conflict-actions">
        <button type="button" className="wb-shell-meta-conflict-button" disabled={props.disabled} onClick={props.onOverwrite}>
          {late ? '지금 글로 덮기' : '내 글로 덮기'}
        </button>
        <button type="button" className="wb-shell-meta-conflict-button" disabled={props.disabled} onClick={props.onDiscard}>
          {late ? '앞서 보낸 글로 두기' : '내 글 버리기'}
        </button>
      </div>
    </div>
  )
}
