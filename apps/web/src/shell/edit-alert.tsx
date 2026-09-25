/**
 * 편집 실패 통지 **한 자리**.
 *
 * **왜 한 자리인가.** 조회 실패는 각 화면이 자기 자리에 그린다 — 어느 조회가
 * 실패했는지에 따라 사용자가 잃는 것이 다르기 때문이다. 편집 실패는 그렇지 않다.
 * 어느 화면에서 시작된 편집이든 **결과가 같다**: 페이지를 다시 받고, 보내지 못한 편집을
 * 잃는다. 자리를 나눌 이유가 없으므로 `role="alert"` 하나로 모은다.
 *
 * **세션이 끊긴 실패는 여기서 화면을 바꾼다.** `<SignedOut />`이 세션을 무효화하고
 * 로그인으로 보낸다 — 조회 실패 자리들이 쓰는 것과 같은 컴포넌트다. 편집 훅이
 * 세션 훅을 직접 부르지 않고 이 자리로 넘기는 것은, 그 규칙이 `api/failure.tsx` 한 곳에
 * 있어야 하기 때문이다.
 *
 * **떠남의 조각을 품은 통지에만 닫는 단추가 있다**(`EditorStore.closeLeaveNotice` — 이어 붙은 조각도 함께 닫는다). 다른 통지는 페이지를
 * 옮기면 판을 비우며 지워지지만 떠남의 조각은 그것을 비켜 가게 만들었다(`EditorStore`의 `#lossParts`) — 편집을 못 내는 화면(뷰 모드 ·
 * viewer)에서는 새 편집이 덮을 일도 없어 셸이 사는 동안 남는다. 단추는 문장(`role="alert"`) **밖**에 둔다 — 문장의 글자가 곧 통지다.
 */
import type { ReactElement } from 'react'
import { SignedOut } from '../api/failure'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

export function EditAlert(): ReactElement | null {
  const store = useEditorStoreInstance()
  const failure = useEditorStore(store, (s) => s.editFailure)

  if (failure === null) return null
  if (failure.kind === 'signed-out') return <SignedOut />

  const alert = (
    <p className="wb-shell-edit-alert" role="alert">
      {failure.message}
    </p>
  )
  if (!store.isLeaveNotice(failure)) return alert
  return (
    <div className="wb-shell-edit-alert-row">
      {alert}
      <button type="button" className="wb-shell-edit-alert-close" aria-label="통지 닫기" onClick={store.closeLeaveNotice}>
        닫기
      </button>
    </div>
  )
}
