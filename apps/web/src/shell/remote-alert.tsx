/**
 * **화면이 낡았다고 말하는 한 자리**(P3-1 D6).
 *
 * 남의 변경을 받았는데 얹지 못하면 화면은 조용히 낡는다. **조용히 덮지 마라** — 이 저장소가
 * 여섯 번 만난 부류가 정확히 그 자리다. 얹지 못한 이유 셋이 사용자에게 뜻하는 바가 다르므로
 * (`store/editor-store.ts`의 `RemoteStale` 표) 문장도 셋이다.
 *
 * **`role="alert"`이 아니라 `role="status"`다.** `EditAlert`는 사용자가 **방금 누른** 행동이
 * 실패한 것이고, 이쪽은 **남이 한 일**이라 지금 하던 것을 멈출 이유가 없다. `alert`으로 내면
 * 보조 기술 사용자의 흐름을 남의 편집이 끊는다.
 *
 * **`'pending'`은 저절로 풀린다** — 보내지 않은 편집이 서버에 닿으면 `loadPage`나 다음
 * `page-changed`가 `remoteStale`을 `null`로 되돌린다. 그래서 문장이 *"새로고침하세요"*로
 * 시작하지 않는다.
 *
 * **`'gap'`도 편집을 내는 사람에게는 저절로 풀린다** — `headSeq`가 뒤처진 채 남으므로 다음
 * 편집이 409를 받고 복구 경로가 페이지를 다시 받는다(`editor-store.ts`의 그 문단). 그래도
 * 문장이 새로고침을 말하는 것은 **아무것도 안 내고 보고만 있는 사람**에게는 그 수렴이
 * 일어나지 않기 때문이다.
 *
 * **`NOTICE`가 `Record<RemoteStale['reason'], string>`인 것이 계약이다.** 갈래를 하나
 * 더하면 여기서 컴파일이 막힌다 — 실제로 `'gap'`을 더할 때 그렇게 잡혔다. 문장 없는
 * 갈래가 **조용히 아무 말도 안 하는 상태**로 새어 나가지 않는다.
 */
import type { ReactElement } from 'react'
import type { RemoteStale } from '../store/editor-store'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

const NOTICE: Record<RemoteStale['reason'], string> = {
  pending: '다른 사람의 변경이 도착했습니다. 저장하지 않은 편집이 있어 아직 화면에 반영하지 않았습니다.',
  gap: '연결이 끊긴 사이의 변경을 놓쳐 화면이 최신이 아닙니다. 새로고침하면 맞춰집니다.',
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
