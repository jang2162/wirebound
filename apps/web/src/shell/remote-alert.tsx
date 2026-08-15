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
 * **`'pending'`이 있었다 — P3-2가 리베이스를 세우며 지웠다.** 남의 변경을 미루는 상태가
 * 없어졌으므로 *"저장하지 않은 편집이 있어 아직 반영하지 않았습니다"*라고 말할 자리도 없다.
 *
 * **`'gap'`은 대개 스스로 풀린다** — 다시 붙으면 화면이 페이지를 다시 읽는다(P3-2 D6).
 * 그래도 문장이 새로고침을 말하는 것은, 갭이 **끊김 없이도** 날 수 있기 때문이다(브로드캐스트
 * 순서가 뒤바뀌는 자리 — P3-1 이월 §4.6). 그때는 다시 붙는 일이 없으므로 재조회도 없다.
 *
 * **`NOTICE`가 `Record<RemoteStale['reason'], string>`인 것이 계약이다.** 갈래를 하나
 * 더하면 여기서 컴파일이 막힌다 — 실제로 `'gap'`을 더할 때 그렇게 잡혔다. 문장 없는
 * 갈래가 **조용히 아무 말도 안 하는 상태**로 새어 나가지 않는다.
 */
import type { ReactElement } from 'react'
import type { RemoteStale } from '../store/editor-store'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

const NOTICE: Record<RemoteStale['reason'], string> = {
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
