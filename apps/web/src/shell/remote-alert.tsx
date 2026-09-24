/**
 * **화면이 낡았다고 말하는 한 자리.**
 *
 * 남의 변경을 받았는데 얹지 못하면 화면은 조용히 낡는다. **조용히 덮지 마라** — 덮으면
 * 사용자는 낡은 화면 위에서 그런 줄 모르고 일한다. 얹지 못한 이유 셋이 사용자에게 뜻하는 바가 다르므로
 * (`store/editor-store.ts`의 `RemoteStale` 표) 문장도 셋이다.
 *
 * **`role="alert"`이 아니라 `role="status"`다.** `EditAlert`는 사용자가 **방금 누른** 행동이
 * 실패한 것이고, 이쪽은 **남이 한 일**이라 지금 하던 것을 멈출 이유가 없다. `alert`으로 내면
 * 보조 기술 사용자의 흐름을 남의 편집이 끊는다.
 *
 * **남의 변경을 미루는 상태가 없다** — 리베이스가 얹는다. 그래서 *"저장하지 않은 편집이 있어
 * 아직 반영하지 않았습니다"*라고 말할 갈래(`'pending'`)를 두지 않는다.
 *
 * **`'gap'`의 문장은 원인을 말하지 않는다** — 이 탭이 아는 것은 «받지 못한 번호가 있다»뿐이다. 끊겼다 다시 붙은 판은
 * 화면이 페이지를 다시 읽어 스스로 풀리지만, 갭은 **끊김 없이도** 난다: 서버가 COMMIT 의 답을 잃고 같은 키의 재생으로
 * 답하면 그 편집의 방송이 없다(Chrome — 연결을 연 채 `page-changed` 하나만 빼면 다음 변경에서 이 문장이 선다). 그때
 * «연결이 끊긴 사이»라고 하면 겪지 않은 실패를 말하고, 다시 붙는 일이 없으므로 재조회도 없다 — 그래서 새로고침을 말한다.
 *
 * **`NOTICE`가 `Record<RemoteStale['reason'], string>`인 것이 계약이다.** 갈래를 하나
 * 더하면 여기서 컴파일이 막힌다 — 문장 없는 갈래가 **조용히 아무 말도 안 하는 상태**로
 * 새어 나가지 않는다.
 */
import type { ReactElement } from 'react'
import type { RemoteStale } from '../store/editor-store'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

const NOTICE: Record<RemoteStale['reason'], string> = {
  gap: '받지 못한 변경이 있어 화면이 최신이 아닙니다. 새로고침하면 맞춰집니다.',
  diverged: '다른 사람의 변경을 화면에 반영하지 못했습니다. 새로고침하면 맞춰집니다.',
  restored: '다른 사람이 스냅샷을 복원했습니다. 새로고침해 지금 상태를 확인하세요.',
}

export function RemoteAlert(): ReactElement | null {
  const store = useEditorStoreInstance()
  const stale = useEditorStore(store, (s) => s.remoteStale)

  if (stale === null) return null

  return (
    <p className="wb-shell-remote-alert" role="status">
      {NOTICE[stale.reason]}
    </p>
  )
}
