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
 */
import { useEffect } from 'react'
import { useLockChannel } from './context'
import { useSessionUser } from '../session/session-context'
import { useEditorStore, useEditorStoreInstance, useOpenPage } from '../store/use-editor-store'

export function useNodeLock(pageId: string | undefined): void {
  const store = useEditorStoreInstance()
  const channel = useLockChannel()
  const user = useSessionUser()
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // **스토어가 든 것이 지금 주소의 페이지인가.** 위 머리말의 창을 닫는 값이다.
  const onThisPage = useOpenPage(pageId) !== null

  useEffect(() => {
    store.setViewer(user?.id ?? null)
  }, [store, user])

  useEffect(() => {
    // 통로가 없으면 아무것도 안 한다 — `RealtimeProvider` 없이 도는 화면이 그 판이다.
    channel?.hold(onThisPage ? pageId : null, selectedNodeId)
  }, [channel, pageId, selectedNodeId, onThisPage])
}
