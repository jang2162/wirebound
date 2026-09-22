/**
 * 나가 있는 쓰기가 **시간 안에 응답을 못 받았을 때**의 통지 — «페이지 설명»과 코멘트 탭이 같은
 * 것을 쓴다. 무엇이 언제 서는지는 `write-ledger.tsx`의 단계 표가 갖는다.
 *
 * **«실패»로 말하지 않는다.** 응답이 없다는 것은 저장이 안 됐다는 뜻이 아니다 — 서버가 이미
 * 커밋했을 수 있다(그 파일의 머리말에 실측이 있다). 그래서 확인하는 중에는 `status`이고, 다시
 * 읽기도 실패해 **모를 때만** `alert`와 함께 «다시 확인»을 준다. 판정이 서면 이 통지는 사라지고
 * 그 칸의 저장 통지(«저장했습니다» / «저장되지 않았습니다»)가 대신 선다.
 */
import type { ReactElement } from 'react'
import type { PanelLock } from './panel-drafts'

/** «다시 확인» 단추의 이름. 두 탭이 같은 말을 쓴다. */
const RECHECK = '다시 확인'

export function PendingNotice(props: { lock: PanelLock; checking: string; unknown: string }): ReactElement | null {
  const { lock } = props
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
