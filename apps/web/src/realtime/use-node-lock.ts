/**
 * **고른 노드를 서버에 알린다**(설계 §7.2 — *"노드를 선택하면 그 서브트리에 잠금을 건다"*).
 *
 * # 왜 스토어가 아니라 훅인가
 *
 * 스토어는 전송을 모른다(`store/editor-store.ts`의 머리말 — React·DOM·`fetch`를 import하지
 * 않는다). 선택은 스토어에 있고 통로는 컨텍스트에 있으므로, 둘을 잇는 자리는 React 쪽이다.
 *
 * # 주소가 바뀐 커밋 하나를 지나가야 한다
 *
 * 주소가 바뀐 뒤 스토어가 앞 페이지를 들고 있는 커밋이 하나 있다(`useOpenPage`의 머리말).
 * **`pageId`만 셸에서 받는 것으로는 그 창이 안 닫힌다 — 리뷰가 프로브로 찍었다:**
 *
 * ```
 * lock(pg-1, n-b) → lock(pg-2, n-b) → unlock
 * ```
 *
 * 가운데 프레임이 **새 주소에 앞 페이지의 노드**다. `pageId`는 그 커밋에 이미 새 값인데
 * `selectedNodeId`는 아직 앞 페이지의 것이기 때문이다(선택을 비우는 `clearPage`는 자식의
 * 이펙트라 그 알림이 만드는 렌더가 이 이펙트 **뒤**다). 다음 커밋에 스스로 `unlock`되지만,
 * **두 페이지의 노드 id가 겹치면 그 한 프레임 동안 남의 화면에 없는 노드의 배지가 뜨고
 * 남의 선택을 막는다** — 그런 문서는 가져오기·프리셋이 만든다.
 *
 * **그래서 `useOpenPage`의 관문을 함께 지난다.** 스토어가 든 것이 지금 주소의 페이지가 아니면
 * 잠금을 **놓는다**(잡지 않는 것이 아니라 놓는 것이다 — 그 순간 우리는 그 페이지를 떠나는
 * 중이다). `openPageId`를 직접 읽지 않는 것은 `test/store-access-guard.ts`가 막는 형태이기도
 * 하고, 대조를 한 곳에 두는 것이 그 훅의 계약이기 때문이다.
 *
 * **불린으로 좁혀 쓴다.** `useOpenPage`가 돌려주는 객체는 문서가 바뀔 때마다(즉 편집마다)
 * 참조가 달라지므로, 그대로 의존 배열에 넣으면 이 이펙트가 편집마다 다시 돈다.
 *
 * # 누구인지도 여기서 놓는다
 *
 * 잠금 소유자 판정은 사람 단위다(P3-3 D3). 그 값은 세션 컨텍스트에 있고 스토어는 그것을
 * 모르므로, 같은 훅이 함께 놓는다 — 자리를 나누면 *"선택은 알리는데 내가 누구인지는 안
 * 알린"* 상태가 생기고, 그때 화면은 **자기 잠금에 자기가 막힌다.**
 *
 * # 문서 루트는 claim 하지 않는다
 *
 * **루트 잠금은 페이지 전체 잠금이고, §7.2의 서브트리 잠금이 뜻한 것이 아니다.** 루트는
 * 문서 안 모든 노드의 조상이므로 그 하나가 페이지의 **모든** 선택을 막는다 — 스토어를 쥐고
 * 잰 값이다:
 *
 * ```
 * setLocks([{ nodeId: 'n_root', userId: 'u_bora' }])
 * lockedBy('n_a')  →  { nodeId: 'n_root', userId: 'u_bora', userName: '보라' }
 * ```
 *
 * **이 예외가 생긴 이유는 자동 선택이다.** 페이지를 열면 스토어가 루트를 고른 채로 시작하는데
 * (`store/editor-store.ts`의 `#selectionFor` — 그러지 않으면 연 직후가 죽은 화면이다),
 * 그것을 그대로 보내면 **페이지를 여는 것만으로 남의 그 페이지 전체가 얼어붙는다.**
 * 실측: 고치기 전에는 트리에서 노드 둘을 고르는 동안 나간 프레임이
 * `['n-root', 'n-b', 'n-a']`였다 — 첫 것이 아무도 누르지 않은 잠금이다.
 *
 * **보내는 쪽만 고친 것이 요점이다.** 스토어의 `lockedBy`에는 루트 예외를 두지 않았다.
 * 그쪽 판정은 `@wirebound/schema`의 `findLockConflict`이고 **서버의 2차 방어가 부르는 바로
 * 그 함수**라, 여기서 갈라 두면 화면이 통과시킨 편집을 서버가 거절한다. 그리고 아무도 루트
 * 잠금을 보내지 않으면 그 잠금은 서버에 **생기지 않으므로** 예외를 둘 자리도 없다 — 그래도
 * 도착하면(안 고친 탭 등) 화면은 그것을 그대로 존중하는 편이 서버와 같은 판정이다.
 *
 * **편집이 무방비가 되는 것은 아니다.** 루트를 고른 채로 내는 편집도 서버의 2차 방어를
 * 그대로 지난다(`lockPointers(ops)` — 잠긴 서브트리를 건드리면 거절된다). 놓는 것은
 * *"내가 여기 있다"*는 표시뿐이고, 루트에서 그 표시는 페이지 전체 정지와 같은 말이었다.
 *
 * # 고칠 수 없는 사람은 잡지 않는다
 *
 * **viewer 는 고르기만 한다**(이월 M′ — 셸이 `canHold`에 `projectAbilities(role).editDesign`을 넘긴다). 고르기는
 * 읽기(속성 · 코멘트를 보려고 고른다)지만 잠금은 쓰기다 — 서버는 `lock` · `unlock`을 editor 게이트로 받고 viewer 의 것은
 * 조용히 버린다(`apps/api/src/ws/protocol.ts`의 `MIN_ROLE_FOR_FRAME`). 버려진다고 보내도 되는 것은 아니다: 보내는
 * 것 자체가 «조회 전용»을 어긴 프레임이다. **놓는 것도 같은 길이다** — `false`면 «잡을 자리가 없다»로 넘기므로 앞에
 * 잡고 있던 것이 있으면 놓고(역할은 새로고침해야 바뀌므로 오늘은 없는 판이다), 없으면 아무것도 안 보낸다
 * (`lock-channel.ts`의 `hold` — 잡은 것이 없으면 `unlock`도 안 보낸다).
 */
import { useEffect } from 'react'
import { useLockChannel } from './context'
import { useSessionUser } from '../session/session-context'
import {
  useEditorStore,
  useEditorStoreInstance,
  useOpenDocument,
  useOpenPage,
} from '../store/use-editor-store'

export function useNodeLock(pageId: string | undefined, canHold: boolean): void {
  const store = useEditorStoreInstance()
  const channel = useLockChannel()
  const user = useSessionUser()
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // **스토어가 든 것이 지금 주소의 페이지인가.** 위 머리말의 창을 닫는 값이다.
  const onThisPage = useOpenPage(pageId) !== null
  /**
   * 지금 문서의 루트 id. **문자열로 좁혀 든다** — 문서 객체는 편집마다 참조가 달라지므로
   * 그대로 의존 배열에 넣으면 아래 이펙트가 편집마다 다시 돈다(`onThisPage`가 불린인 것과
   * 같은 이유). 루트 id는 문서가 갈리지 않는 한 그대로다.
   */
  const rootId = useOpenDocument(pageId)?.root.id ?? null

  useEffect(() => {
    store.setViewer(user?.id ?? null)
  }, [store, user])

  useEffect(() => {
    // **루트는 claim 하지 않는다**(위 머리말). 루트를 고른 것은 잠글 자리를 고른 것이 아니라
    // 아직 아무 자리도 안 고른 것에 가깝다 — 앞에 잡고 있던 것이 있으면 여기서 놓는다.
    const holdId = selectedNodeId === rootId ? null : selectedNodeId
    // 통로가 없으면 아무것도 안 한다 — `RealtimeProvider` 없이 도는 화면이 그 판이다.
    channel?.hold(onThisPage && canHold ? pageId : null, holdId)
  }, [channel, pageId, selectedNodeId, onThisPage, rootId, canHold])
}
