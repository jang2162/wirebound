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
import { useCallback } from 'react'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { useEditorStore, useEditorStoreInstance, useOpenPage } from '../store/use-editor-store'
import type { EditStatus } from '../store/editor-store'
import { propOps } from './ops'

/** 서버가 이유를 주지 않은 편집 실패에 쓸 문장(네트워크 단절 등). */
const EDIT_UNKNOWN_FAILURE = '편집을 저장하지 못했습니다'
/** 재조회마저 실패했을 때. 편집 실패와 갈라 적어야 사용자가 무엇이 남았는지 안다. */
const RECOVER_UNKNOWN_FAILURE = '편집에 실패한 뒤 페이지를 다시 불러오지도 못했습니다'

/**
 * 되돌릴 수 없는 항목을 건너뛰었을 때의 안내(설계 §7.3).
 *
 * **에러가 아니라 정상 흐름이다** — 다른 사람이 그 노드를 지웠으면 내 `inverse`가 적용되지
 * 않는 것이 당연하고, 그때 할 일은 멈추는 것이 아니라 다음 항목으로 넘어가는 것이다.
 * 자리는 편집 실패와 같은 `role="alert"` 하나를 쓴다(D8) — 사용자가 누른 행동의 결과라는
 * 점이 같고, 자리를 나누면 그 하나뿐인 통지 규칙이 흩어진다.
 */
function skippedNotice(skipped: number, applied: boolean): string {
  const head = `되돌릴 수 없는 편집 ${skipped}개를 건너뛰었습니다.`
  return applied ? `${head} 그 앞의 편집을 되돌렸습니다.` : `${head} 되돌릴 것이 더 없습니다.`
}

export interface EditCommit {
  /** 노드의 prop 하나를 바꾼다. 적용할 수 없으면 아무 일도 일어나지 않는다(D7). */
  commitProp: (nodeId: string, prop: string, value: unknown) => void
  /** 한 단계 되돌린다. **서버에는 새 편집으로 나간다** — 서버에 undo 개념은 없다(README). */
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  status: EditStatus
}

export function useEditCommit(props: { projectId: string; pageId: string }): EditCommit {
  const { projectId, pageId } = props
  const api = useApi()
  const store = useEditorStoreInstance()
  const open = useOpenPage(pageId)
  const status = useEditorStore(store, (s) => s.editStatus)
  const canUndo = useEditorStore(store, (s) => s.undoStack.length > 0)
  const canRedo = useEditorStore(store, (s) => s.redoStack.length > 0)

  /**
   * 실패 하나를 수습한다. **실패 종류로 갈리지 않는다**(D4) — 409든 422든 네트워크든
   * 페이지를 다시 받아 서버 상태로 수렴한다. 왜 항목별 롤백이 아닌지는 설계 §7.1에 있다:
   * `inverse`를 서버가 만드는 것과 같은 이유로, 클라이언트가 계산한 되돌리기는 낙관적으로
   * 앞서 있는 만큼 틀릴 수 있다.
   *
   * **세션이 끊긴 실패 하나만 갈린다.** 다시 받아도 401이고 그 사이 요청만 쌓이므로
   * 재조회하지 않는다. 통지 자리(`shell/edit-alert.tsx`)가 그 값을 보고 `<SignedOut />`을
   * 그리면 웨이브 1의 세션 무효화 경로로 이어진다.
   */
  const recover = useCallback(
    async (caught: unknown): Promise<void> => {
      const failure = toFailure(caught, EDIT_UNKNOWN_FAILURE)
      if (failure.kind === 'signed-out') {
        // 큐는 비운다 — 로그인하고 돌아와도 그 편집들은 이미 낡은 `baseSeq` 위에 있다.
        store.failEdits()
        store.setEditStatus('idle')
        store.setEditFailure(failure)
        return
      }

      const dropped = store.failEdits()
      try {
        const page = await api.getPage(projectId, pageId)
        // **`loadPage`가 그 사이 들어온 편집까지 버리고 그것을 돌려준다.** 재조회는 왕복
        // 하나라 그 동안 새 편집이 큐에 쌓일 수 있고, 비우지 않으면 "취소됐다"고 알린 편집이
        // 나중에 새 `baseSeq` 위에서 서버로 나간다(`store/editor-store.ts`에 실측이 있다).
        const alsoDropped = store.loadPage(pageId, page.schema, page.headSeq)
        // 버린 수는 **센 값이다** — 전송에 실패한 것, 큐에 남아 있던 것, 재조회를 기다리는
        // 동안 들어온 것을 합친 것이고, 셋 다 문서가 서버 것으로 되돌아가며 사라졌다.
        const lost = dropped.length + alsoDropped.length
        store.setEditFailure({
          kind: 'message',
          message: `${failure.message} 페이지를 서버 상태로 다시 불러왔고, 편집 ${lost}개가 취소됐습니다.`,
        })
      } catch (recoverCaught) {
        // **재조회를 기다리는 동안 들어온 편집은 여기서도 버린다.** 서버 상태를 모르는 채
        // 그것을 보내면 낡은 `baseSeq` 위에서 기록된다(실측: 이 줄이 없으면 그 편집이
        // `baseSeq 7`로 나간다 — 재조회가 성공한 판의 42와 달리 서버가 다시 409를 낼 값이다).
        store.failEdits()
        // **여기서 다시 재조회하지 않는다.** 서버가 계속 실패하는 동안 요청이 쌓인다 —
        // 세션 확인에 자동 재시도를 두지 않은 것과 같은 판단이다.
        const recoverFailure = toFailure(recoverCaught, RECOVER_UNKNOWN_FAILURE)
        store.setEditFailure(
          recoverFailure.kind === 'signed-out'
            ? recoverFailure
            : { kind: 'message', message: recoverFailure.message },
        )
      } finally {
        store.setEditStatus('idle')
      }
    },
    [api, projectId, pageId, store],
  )

  const pump = useCallback(async (): Promise<void> => {
    // **가드는 스토어가 든다.** 훅의 `ref`에 두면 `useEditCommit`을 부르는 자리가 둘일 때
    // (속성 패널과 undo/redo 버튼) 각자 자기 것을 갖는다 — 실측: 그 트리에서 편집을 각각
    // 내면 `maxInFlight`가 2가 되어 D6가 깨진다.
    if (!store.beginPump()) return
    try {
      for (;;) {
        // **`baseSeq`는 스토어가 전송 시점에 붙인다.** 훅으로 읽은 `headSeq`는 앞 편집이
        // ack되며 이미 낡아 있다 — ack의 `setState`는 이 루프가 도는 microtask 뒤에야
        // 커밋되기 때문이다.
        const request = store.nextRequest()
        if (request === null) {
          if (store.getState().editStatus === 'sending') store.setEditStatus('idle')
          return
        }

        store.setEditStatus('sending')
        try {
          const result = await api.patchOps(projectId, pageId, request)
          store.ackEdit(request.clientOpId, result)
        } catch (caught) {
          // 루프를 여기서 끝낸다. `recover`가 큐를 비우므로 남은 편집이 다시 나가지 않고,
          // 재조회가 문서를 서버 것으로 맞춘다.
          await recover(caught)
          return
        }
      }
    } finally {
      store.endPump()
    }
  }, [api, projectId, pageId, store, recover])

  /**
   * 스택에서 한 단계 꺼내 보낸다. undo와 redo가 같은 규칙을 쓰므로 한 곳에 둔다 —
   * 다른 것은 어느 스택을 보느냐뿐이고, 그 판단은 스토어 안에 있다.
   */
  const step = useCallback(
    (start: () => { clientOpId: string | null; skipped: number }): void => {
      // 지금 열린 페이지가 아니면 아무것도 하지 않는다(`commitProp`과 같은 대조).
      if (open === null) return

      const attempt = start()
      if (attempt.skipped > 0) {
        store.setEditFailure({
          kind: 'message',
          message: skippedNotice(attempt.skipped, attempt.clientOpId !== null),
        })
      } else {
        // 앞 통지를 치운다 — 남겨 두면 방금 누른 undo도 실패한 것으로 읽힌다.
        store.setEditFailure(null)
      }

      if (attempt.clientOpId === null) return
      void pump()
    },
    [open, store, pump],
  )

  const undo = useCallback(() => {
    step(store.startUndo)
  }, [step, store])

  const redo = useCallback(() => {
    step(store.startRedo)
  }, [step, store])

  const commitProp = useCallback(
    (nodeId: string, prop: string, value: unknown): void => {
      // **재조회 중(`editStatus === 'recovering'`)에도 편집을 받는다.** 막는 판을 고르지
      // 않은 이유 둘: 재조회는 왕복 하나로 짧고, 입력을 막으려면 컨트롤 넷이 각자 비활성
      // 상태를 다뤄야 해서 범위가 는다. 대신 그 창에서 들어온 편집은 `loadPage`가 문서를
      // 서버 것으로 놓을 때 함께 버려지고, 알림이 그 수를 합쳐 말한다 — 사용자가 낸 편집이
      // 조용히 되살아나지 않는 것이 요점이고 그것은 스토어 쪽에서 닫힌다.
      //
      // 지금 열린 페이지의 문서가 아니면 편집을 만들지 않는다. `useOpenPage`가 주소와
      // 대조한 결과이므로, 주소가 바뀐 뒤 스토어가 아직 앞 페이지를 들고 있는 커밋에서도
      // 여기가 `null`이다. **그 대조를 지우면 앞 페이지의 ops가 다음 페이지 경로로 나간다** —
      // `test/edit/use-edit-commit.test.tsx`의 `스토어가 다른 페이지를 들고 있으면…`이
      // 그것을 잡고, `test/store-access.test.ts`의 가드는 "우회를 썼다"는 사실을 잡는다.
      // **둘은 다른 것을 잡는다:** 가드는 소스 텍스트라 우회의 존재만 알고 무엇이 잘못되는지
      // 말하지 못하고, 동작 케이스는 그 반대다.
      if (open === null) return

      const ops = propOps(open.document, nodeId, prop, value)
      // 문서에 없는 노드다. 보내 봐야 서버가 409/422를 낸다(D7).
      if (ops === null) return
      if (store.applyEdit(ops) === null) return

      // 앞 실패의 통지를 치운다. 남겨 두면 사용자가 방금 낸 편집도 실패했다고 읽는다.
      store.setEditFailure(null)
      void pump()
    },
    [open, store, pump],
  )

  return { commitProp, undo, redo, canUndo, canRedo, status }
}
