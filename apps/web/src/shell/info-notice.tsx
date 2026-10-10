/**
 * **정보 통지 한 자리**(`EditorState.infoNotice`) — 실패가 아닌 한 줄. `EditAlert`(`role="alert"`)는 «방금 한 일이 안 됐다» 를 말하는 자리이고
 * 이쪽은 «됐지만 알아 둘 것»(붙이며 동작을 뺐다 · 키가 아무것도 안 했다 · 고른 것이 숨었다)의 자리다 — `role="status"` 라 보조 기술이 성공한
 * 편집을 실패로 읽지 않는다(`EditWarnings` · `RemoteAlert` 와 같은 판정).
 *
 * **한 칸이다 — 쌓지 않는다.** 줄을 늘리면 하단 바가 위로 자라 캔버스 줄이 준다(`shell/shell-footer.tsx`). 새 정보 통지는 앞의 것을 대신한다.
 */
import type { ReactElement } from 'react'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

export function InfoNotice(): ReactElement | null {
  const store = useEditorStoreInstance()
  const message = useEditorStore(store, (s) => s.infoNotice)
  if (message === null) return null
  return (
    <p className="wb-shell-info-notice" role="status">
      {message}
    </p>
  )
}
