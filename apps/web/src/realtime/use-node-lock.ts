/**
 * **고른 노드를 서버에 알린다**(설계 §7.2 — *"노드를 선택하면 그 서브트리에 잠금을 건다"*).
 *
 * # 왜 스토어가 아니라 훅인가
 *
 * 스토어는 전송을 모른다(`store/editor-store.ts`의 머리말 — React·DOM·`fetch`를 import하지
 * 않는다). 선택은 스토어에 있고 통로는 컨텍스트에 있으므로, 둘을 잇는 자리는 React 쪽이다.
 *
 * # `pageId`를 스토어에서 안 읽는다
 *
 * 주소가 바뀐 뒤 스토어가 앞 페이지를 들고 있는 커밋이 하나 있다(`useOpenPage`의 머리말).
 * 그 창에서 스토어의 `openPageId`로 잠금을 걸면 **앞 페이지의 노드를 새 주소에서 잡는다.**
 * 셸이 주소에서 푼 값을 받는 것이 그 창을 지나간다 — `test/store-access-guard.ts`가 같은
 * 이유로 `getState().openPageId`를 막는다.
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
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

export function useNodeLock(pageId: string | undefined): void {
  const store = useEditorStoreInstance()
  const channel = useLockChannel()
  const user = useSessionUser()
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)

  useEffect(() => {
    store.setViewer(user?.id ?? null)
  }, [store, user])

  useEffect(() => {
    // 통로가 없으면 아무것도 안 한다 — `RealtimeProvider` 없이 도는 화면이 그 판이다.
    channel?.hold(pageId, selectedNodeId)
  }, [channel, pageId, selectedNodeId])
}
