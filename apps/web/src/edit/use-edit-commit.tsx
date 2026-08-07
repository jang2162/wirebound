/**
 * 화면이 편집을 내는 통로. ops를 만들어 스토어에 넘기고 전송을 밟는다.
 *
 * **전송은 이펙트가 아니라 명시적 펌프다.** `useEffect`로 걸면 `pending`이 바뀔 때마다
 * 이펙트가 다시 돌아 "지금 보내는 중인가"를 ref로 따로 지켜야 하고, 그 ref와 이펙트의
 * 의존 배열이 어긋나는 날 두 요청이 동시에 나간다. 큐에서 다음을 꺼내 보내는 일을 함수
 * 하나에 두고 편집이 들어올 때 그것을 부르면, 조건이 코드에 보인다.
 *
 * **in-flight는 항상 하나다**(D6). README가 요구한다 — *"앞 요청의 `seq`를 받아야 다음
 * `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다."* 그것을 지키는 것은
 * 아래 `pumpingRef`와 **한 번에 하나씩 `await`하는 루프**다. 루프가 도는 동안 들어온 편집은
 * 큐에 쌓이고, 앞 요청이 끝난 뒤 같은 루프가 그것을 집는다.
 */
import { useCallback, useRef } from 'react'
import { useApi } from '../api/context'
import { useEditorStore, useEditorStoreInstance, useOpenPage } from '../store/use-editor-store'
import type { EditStatus } from '../store/editor-store'
import { propOps } from './ops'

export interface EditCommit {
  /** 노드의 prop 하나를 바꾼다. 적용할 수 없으면 아무 일도 일어나지 않는다(D7). */
  commitProp: (nodeId: string, prop: string, value: unknown) => void
  status: EditStatus
}

export function useEditCommit(props: { projectId: string; pageId: string }): EditCommit {
  const { projectId, pageId } = props
  const api = useApi()
  const store = useEditorStoreInstance()
  const open = useOpenPage(pageId)
  const status = useEditorStore(store, (s) => s.editStatus)

  // 루프가 돌고 있는지. **state가 아니라 ref인 것이 요점이다** — state로 두면 두 번째
  // 편집이 그 갱신이 커밋되기 전에 들어와 루프를 하나 더 시작한다(그것이 D6 위반이다).
  const pumpingRef = useRef(false)

  const pump = useCallback(async (): Promise<void> => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    try {
      for (;;) {
        // **`baseSeq`는 스토어가 전송 시점에 붙인다.** 훅으로 읽은 `headSeq`는 앞 편집이
        // ack되며 이미 낡아 있다 — ack의 `setState`는 이 루프가 도는 microtask 뒤에야
        // 커밋되기 때문이다.
        const request = store.nextRequest()
        if (request === null) return

        store.setEditStatus('sending')
        try {
          const result = await api.patchOps(projectId, pageId, request)
          store.ackEdit(request.clientOpId, result)
        } catch {
          // **실패의 수렴은 Task 6이 채운다.** 지금은 큐를 비워 루프를 끝내기만 한다 —
          // 그러지 않으면 같은 편집을 무한히 다시 보낸다.
          store.failEdits()
          return
        }
      }
    } finally {
      pumpingRef.current = false
      // 큐가 비었으면 `idle`로 돌린다. `recovering`은 Task 6이 재조회를 마칠 때 푼다.
      if (store.getState().editStatus === 'sending') store.setEditStatus('idle')
    }
  }, [api, projectId, pageId, store])

  const commitProp = useCallback(
    (nodeId: string, prop: string, value: unknown): void => {
      // 지금 열린 페이지의 문서가 아니면 편집을 만들지 않는다. `useOpenPage`가 주소와
      // 대조한 결과이므로, 주소가 바뀐 뒤 스토어가 아직 앞 페이지를 들고 있는 커밋에서도
      // 여기가 `null`이다.
      if (open === null) return

      const ops = propOps(open.document, nodeId, prop, value)
      // 문서에 없는 노드다. 보내 봐야 서버가 409/422를 낸다(D7).
      if (ops === null) return
      if (store.applyEdit(ops) === null) return

      void pump()
    },
    [open, store, pump],
  )

  return { commitProp, status }
}
