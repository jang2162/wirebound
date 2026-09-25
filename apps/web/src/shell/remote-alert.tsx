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
 * **`'restored'`에는 «다시 불러오기» 단추가 있다 — 내 복원이 다시 읽는 길을 그대로 탄다**(`onReload` → 셸의 `restoredToken`).
 * 그 길이 복원이 바꾸는 것을 전부 다시 읽는다 — 무엇을 어느 자리가 읽는지는 `routes/editor.tsx`의 `restoredToken` 표가 소유한다.
 * **그 표에서 한 줄이라도 빠지면 이 단추는 거짓이 된다** — 낡은 목록이 남은 채 «낡았다»는 말만 사라진다(Chrome: 스냅샷에 있던
 * 코멘트를 지운 뒤 복원하면 서버 1 · 탭 0 이던 판). 낡음을 푸는 것은 단추가 아니라 다시 실은 판이다(`loadPage` · `clearPage`) —
 * 다시 읽기가 실패하면 캔버스가 그 실패를 말하고 스토어를 비운다(복원 재조회의 실패 갈래).
 *
 * **다시 읽는 창에 커밋된 남의 편집은 조용히 빠질 수 있다.** 응답이 그 커밋 앞을 읽었으면 판에 없고, 그 프레임은 응답보다 먼저
 * 와 갭으로 버려졌고, 실린 판이 낡음을 푼다 — 다음 프레임이 갭을 세울 때까지 아무 말이 없다(jsdom: 응답 head 40 · 그 사이
 * 프레임 41 → 배너 풀림 · 41 의 노드 없음 · 42 에서 «받지 못한 변경»). 판을 다시 싣는 길(재연결 재조회 · 내 복원 · 이 단추 ·
 * 편집 실패 수습)이 모두 같다 — 닫으려면 다시 읽는 동안 온 프레임을 스토어가 들고 있다가 실린 판 위에 얹어야 한다. **두 조회가
 * 겹친 판은 세대가 가른다**(`EditorStore.beginPageLoad`) — 뒤 조회가 판을 정했으면 앞 조회의 옛 답은 안 실린다. 조회가 하나뿐인
 * 창은 세대로 안 닫힌다 — 다툴 조회가 없다(Chrome: 이 단추의 답을 붙잡은 사이 얹힌 남의 노드가 그 답에 지워지고 다음 프레임에서
 * 갭). **뒤 조회가 판이 같다고 보고 넘어가면 이 배너는 남는다** — 판은 서버 것인데 그 조회는 판을 싣지 않아 낡음을 풀지 않는다.
 * 다시 누르면 풀린다.
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
  restored: '다른 사람이 스냅샷을 복원했습니다. 다시 불러와 지금 상태를 확인하세요.',
}

/** 내 복원의 답을 잃었을 때(`RemoteStale`의 `unanswered`) — 남의 복원이라고 하면 거짓이다. 단추는 같다. */
const UNANSWERED_RESTORE_NOTICE = '스냅샷 복원의 답을 받지 못해 복원됐는지 알 수 없습니다. 다시 불러와 지금 상태를 확인하세요.'

export function RemoteAlert(props: {
  /**
   * 남이 복원한 판을 다시 읽는다 — 셸의 복원 신호를 올린다(`routes/editor.tsx`의 `restoredToken`). **반드시 받는다** — 선택 인자면
   * 새 호출자가 빠뜨릴 때 단추가 조용히 아무 일도 안 한다. 서 있는 낡음을 넘긴다 — 셸이 다시 읽으며 말할 앞머리를 고른다(`unanswered`).
   */
  onReload: (stale: RemoteStale) => void
}): ReactElement | null {
  const store = useEditorStoreInstance()
  const stale = useEditorStore(store, (s) => s.remoteStale)

  if (stale === null) return null

  return (
    <p className="wb-shell-remote-alert" role="status">
      {stale.unanswered === true ? UNANSWERED_RESTORE_NOTICE : NOTICE[stale.reason]}
      {stale.reason === 'restored' && (
        <>
          {' '}
          <button type="button" className="wb-shell-remote-reload" onClick={() => props.onReload(stale)}>
            다시 불러오기
          </button>
        </>
      )}
    </p>
  )
}
