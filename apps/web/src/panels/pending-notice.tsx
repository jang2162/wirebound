/**
 * 나가 있는 쓰기가 **시간 안에 응답을 못 받았을 때**의 통지 — «페이지 설명»과 코멘트 탭이 같은
 * 것을 쓴다. 무엇이 언제 서는지는 `write-ledger.tsx`의 단계 표가 갖는다.
 *
 * **«실패»로 말하지 않는다.** 응답이 없다는 것은 저장이 안 됐다는 뜻이 아니다 — 서버가 이미
 * 커밋했을 수 있다(그 파일의 머리말에 실측이 있다). 그래서 확인하는 중에는 `status`이고, 다시
 * 읽기도 실패해 **모를 때만** `alert`와 함께 «다시 확인»을 준다. 판정이 서면 이 통지는 사라지고
 * 그 칸의 저장 통지(«저장했습니다» / «저장되지 않았습니다»)가 대신 선다.
 *
 * **떠나 있는 동안 끝난 실패도 여기서 말한다**(이월 S · 2026-09-23). 쓰기가 끝난 순간 그 페이지를 보는 방문이 없으면
 * 칸의 통지는 닿을 곳이 없어 버려졌다 — 장부가 그 실패를 남기고(`write-ledger.tsx`의 «떠나 있는 동안 끝난 실패»)
 * 돌아온 방문이 이 자리에서 말한다. **새 통지 체계가 아니다** — 장부가 드는 «그 페이지 그 칸의 쓰기»를 그리는 자리가
 * 이미 여기였다. 이것은 **실패**라 `alert`이고, «확인»으로 닫는다.
 *
 * **판정으로 끝난 결말도 여기서 말한다**(이월 5차 2회 — `write-ledger.tsx`의 «판정으로 끝난 쓰기도 전한다»). 실패가 아닌 결말
 * (`WriteNote` — 코멘트의 «이미 달렸고 그 뒤 지워졌습니다»)은 머리 없이 그 문장만 `status`로 말한다. 그 페이지를 보고 있었고
 * 그 칸의 본문만 내려가 있었으면(다른 탭 · 다른 모드 — `Missed.stayed`) 머리가 «이 탭을 떠나 있는 동안 …»이다 — «이 페이지를
 * 떠나 있는 동안»은 그 판에 거짓이다.
 */
import type { ReactElement } from 'react'
import type { PanelLock } from './panel-drafts'

/** «다시 확인» 단추의 이름. 두 탭이 같은 말을 쓴다. */
const RECHECK = '다시 확인'
/** 떠나 있는 동안 끝난 실패의 머리. 뒤에 실패 문장이 붙는다. */
const MISSED = '이 페이지를 떠나 있는 동안 저장하지 못했습니다'
/** 같은 페이지의 다른 탭 · 다른 모드에 가 있는 동안 끝난 실패의 머리(`Missed.stayed`). */
const MISSED_STAYED = '이 탭을 떠나 있는 동안 저장하지 못했습니다'
/** 그 통지를 닫는 단추. */
const DISMISS = '확인'

export function PendingNotice(props: {
  lock: PanelLock
  checking: string
  unknown: string
  /**
   * 떠나 있는 동안 끝난 실패의 머리 — 없으면 «이 페이지를 떠나 있는 동안 …»이다. 트리는 **그 프로젝트의 트리가 떠 있지
   * 않았을 때만** 남는다(`tree/use-tree-commands.tsx` — 트리는 프로젝트의 어느 페이지에서나 떠 있다).
   */
  missedLead?: string
}): ReactElement | null {
  const { lock } = props
  // 잠금이 서 있으면 새 쓰기가 나간 것이다 — 남긴 실패는 그 쓰기가 이미 지웠다(`run`). 그래서 둘이 함께 서지 않는다.
  if (lock.missed !== null && lock.phase === null) {
    const { conclusion, stayed } = lock.missed
    // **실패가 아닌 결말은 머리 없이 그 문장이다**(`WriteNote`) — «저장하지 못했습니다»가 거짓이다.
    if (conclusion.kind === 'note') {
      return (
        <div className="wb-shell-pending">
          <p className="wb-shell-panel-notice" role="status">
            {conclusion.message}
          </p>
          <button type="button" className="wb-shell-pending-dismiss" onClick={lock.dismiss}>
            {DISMISS}
          </button>
        </div>
      )
    }
    // **세션이 끝난 실패는 여기 오지 않는다** — 장부가 곧바로 세션을 끝낸다(`write-ledger.tsx`). 남는 것은 문장뿐이다.
    const reason = conclusion.kind === 'message' ? conclusion.message : ''
    const lead = stayed ? MISSED_STAYED : (props.missedLead ?? MISSED)
    return (
      <div className="wb-shell-pending">
        <p className="wb-shell-panel-notice" role="alert">
          {reason === '' ? lead : `${lead} — ${reason}`}
        </p>
        <button type="button" className="wb-shell-pending-dismiss" onClick={lock.dismiss}>
          {DISMISS}
        </button>
      </div>
    )
  }
  if (lock.phase === 'checking') {
    return (
      <p className="wb-shell-panel-notice" role="status">
        {props.checking}
      </p>
    )
  }
  if (lock.phase === 'unknown') {
    return (
      <div className="wb-shell-pending">
        <p className="wb-shell-panel-notice" role="alert">
          {props.unknown}
        </p>
        <button type="button" className="wb-shell-pending-recheck" onClick={() => lock.recheck?.()}>
          {RECHECK}
        </button>
      </div>
    )
  }
  return null
}
