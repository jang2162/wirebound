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
import type { Interaction, PatchOp } from '@wirebound/schema'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { useEditorStore, useEditorStoreInstance, useOpenPage } from '../store/use-editor-store'
import type { EditStatus } from '../store/editor-store'
import { interactionsOps, propOps, variantOps } from './ops'

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
  /**
   * 노드의 `variant`를 바꾼다. **`commitProp`과 갈라 두는 것이 요점이다** — `variant`는
   * props의 키가 아니라 봉투의 필드라 patch 경로가 한 단계 위다(`edit/ops.ts`의 `variantOps`).
   * `null`이면 지운다(기본 표현으로 되돌리기).
   */
  commitVariant: (nodeId: string, variant: string | null) => void
  /**
   * 노드의 `interactions`를 통째로 갈아 끼운다(설계 §8.1). **`commitVariant`와 같은 층이다** —
   * `interactions`도 props의 키가 아니라 봉투의 필드라 patch 경로가 한 단계 위다.
   * 빈 배열이면 키를 지운다(`edit/ops.ts`의 `interactionsOps`).
   *
   * **새 계약이 아니다**(P5-2 D6). 상호작용은 **클라이언트가** 문서를 바꾸므로 P5-1의
   * `markerOps` 같은 서버 왕복이 필요 없고, 이미 있는 낙관적 편집 경로를 그대로 탄다.
   */
  commitInteractions: (nodeId: string, interactions: readonly Interaction[]) => void
  /**
   * 이미 만들어진 `ops`를 낸다. **낸 편집이 큐에 들어갔으면 `true`다.**
   *
   * `ops`가 `null`인 것은 `edit/ops.ts`의 생성기들이 "요청을 만들지 마라"를 말하는
   * 방식이고(D7), 그대로 넘길 수 있게 받아 준다 — 부르는 쪽마다 `null` 검사를 두면
   * 그중 하나가 빠지는 날 잘못된 요청이 나간다.
   *
   * **반환값이 있는 것은 구조 편집 때문이다.** 삭제는 편집이 큐에 들어간 뒤에만 선택을
   * 옮긴다(D5).
   *
   * **여기 처음 적었던 인과("실패했는데 옮기면 노드는 그대로인데 선택만 부모로 간다")는
   * 거짓이다.** 툴바 쪽에서 같은 문장을 고치면서 이 자리를 놓쳤고 리뷰가 잡았다 —
   * 한 사실을 말하는 다른 곳을 함께 고치지 않은 형태다. 잰 값 둘:
   *
   * - **서버 실패는 이 반환값과 무관하다.** `commitOps`는 큐에 넣고 `true`를 내며 409는
   *   그 뒤에 온다. 그리고 그때 선택은 부모가 아니라 **`null`**이다 — 재조회가 `loadPage`를
   *   지나고 그것이 선택까지 재설정한다(P2b-2 이월 §1).
   * - **로컬 실패 경로는 호출자의 앞선 가드가 먼저 잡는다.** 그래서 이 반환값 검사는
   *   지금 0 사망이다(`panels/structure-toolbar.tsx`의 `removeSelected`·`addNode` 주석에
   *   무엇이 덮는지 적어 두었다).
   */
  commitOps: (ops: PatchOp[] | null) => boolean
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
          // **서버 문장과 우리 문장 사이에 구분자를 둔다.** 공백 하나로 붙이면 두 문장이 한
          // 문장처럼 읽힌다 — 카탈로그 위반의 이유가 **타입 이름으로 끝나기** 때문에
          // `알 수 없는 컴포넌트 타입: 없는타입 페이지를 …`가 되어 **"없는타입 페이지를"이
          // 하나의 명사구**가 된다(리뷰 W1).
          //
          // **`unknown-type` 하나의 문제가 아니다.** 이 경로가 실제로 받는 문장을 api 하네스로
          // 재 보니 **끝에 마침표를 두는 것이 하나도 없다:**
          //
          //   409 `페이지가 이미 변경되었습니다 (요청 baseSeq 99, 현재 0)`        ← 괄호로 끝난다
          //   409 `편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/…`  ← **경로로 끝난다**
          //   422 `알 수 없는 컴포넌트 타입: 없는타입`                          ← 타입 이름으로 끝난다
          //   400 `잘못된 입력: 예상 타입은 array, 받은 타입은 undefined입니다`
          //
          // **앞 판은 여기에 `다른 편집과 충돌했습니다`를 인용했는데 그런 문장은 서버에 없다**
          // (리뷰 F2 — 지어낸 예였다). 실재 문장으로 갈고 나니 논지가 더 강해진다: 둘째 줄은
          // **경로로 끝나서** 우리 문장과 붙으면 더 읽기 어렵다. 즉 어떤 문장이 와도 붙는다 —
          // **이어 붙이는 형태 자체가 이 부류를 만든다.**
          //
          // **서버 문장에 마침표를 덧붙이지 않는 이유:** 그것은 서버가 쓴 문장을 고치는 것이고,
          // `api/failure.tsx`가 *"화면이 문안을 다시 쓰면 서버가 이유를 바꿔도 사용자는 옛
          // 이유를 듣는다"*로 세운 경계를 넘는다. 구분자는 **우리 쪽 문장에 붙이는 것**이라
          // 그 경계 안이다.
          message: `${failure.message} — 페이지를 서버 상태로 다시 불러왔고, 편집 ${lost}개가 취소됐습니다.`,
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

  /**
   * 편집 하나를 큐에 넣고 전송을 밟는다. **`commitProp`과 구조 편집(P2b-3의 툴바)이
   * 공유하는 유일한 통로다** — 둘이 각자 `applyEdit` + `pump`를 쓰면 그 사이에 끼는
   * 규칙(열린 페이지 대조·통지 치우기)이 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.
   */
  const commitOps = useCallback(
    (ops: PatchOp[] | null): boolean => {
      // 지금 열린 페이지가 아니면 편집을 만들지 않는다. `useOpenPage`가 주소와 대조한
      // 결과이므로, 주소가 바뀐 뒤 스토어가 아직 앞 페이지를 들고 있는 커밋에서도 여기가
      // `null`이다. **그 대조를 지우면 앞 페이지의 ops가 다음 페이지 경로로 나간다** —
      // `test/edit/use-edit-commit.test.tsx`의 `스토어가 다른 페이지를 들고 있으면…`이
      // 그것을 잡고, `test/store-access.test.ts`의 가드는 "우회를 썼다"는 사실을 잡는다.
      // **둘은 다른 것을 잡는다:** 가드는 소스 텍스트라 우회의 존재만 알고 무엇이
      // 잘못되는지 말하지 못하고, 동작 케이스는 그 반대다.
      if (open === null) return false
      // 만드는 쪽이 "요청을 보내지 마라"라고 답한 것이다(D7).
      if (ops === null) return false
      // 로컬 적용이 실패했다 — 클라이언트가 만든 잘못된 `ops`다. 보내 봐야 서버도 같은
      // 자리에서 거절한다.
      if (store.applyEdit(ops) === null) return false

      // 앞 실패의 통지를 치운다. 남겨 두면 사용자가 방금 낸 편집도 실패했다고 읽는다.
      store.setEditFailure(null)
      void pump()
      return true
    },
    [open, store, pump],
  )

  const commitProp = useCallback(
    (nodeId: string, prop: string, value: unknown): void => {
      // **재조회 중(`editStatus === 'recovering'`)에도 편집을 받는다.** 막는 판을 고르지
      // 않은 이유 둘: 재조회는 왕복 하나로 짧고, 입력을 막으려면 컨트롤 넷이 각자 비활성
      // 상태를 다뤄야 해서 범위가 는다. 대신 그 창에서 들어온 편집은 `loadPage`가 문서를
      // 서버 것으로 놓을 때 함께 버려지고, 알림이 그 수를 합쳐 말한다 — 사용자가 낸 편집이
      // 조용히 되살아나지 않는 것이 요점이고 그것은 스토어 쪽에서 닫힌다.
      //
      // **`open`을 여기서도 보는 것은 `open.document`가 필요해서다.** 열린 페이지 대조
      // 자체는 `commitOps`가 다시 한다 — 그쪽이 그 규칙을 갖는 자리다.
      if (open === null) return

      // 문서에 없는 노드면 `propOps`가 `null`을 내고 `commitOps`가 그 자리에서 돌아온다(D7).
      commitOps(propOps(open.document, nodeId, prop, value))
    },
    [open, commitOps],
  )

  const commitVariant = useCallback(
    (nodeId: string, variant: string | null): void => {
      // `commitProp`과 같은 이유로 `open`을 본다 — `open.document`가 필요하다.
      // 열린 페이지 대조 자체는 `commitOps`가 다시 한다.
      if (open === null) return

      // 지울 것이 없거나 노드가 문서에 없으면 `variantOps`가 `null`을 내고 그 자리에서 끝난다(D7).
      commitOps(variantOps(open.document, nodeId, variant))
    },
    [open, commitOps],
  )

  const commitInteractions = useCallback(
    (nodeId: string, interactions: readonly Interaction[]): void => {
      // `commitProp`·`commitVariant`와 같은 이유로 `open`을 본다 — `open.document`가 필요하다.
      // 열린 페이지 대조 자체는 `commitOps`가 다시 한다.
      if (open === null) return

      // 지울 것이 없거나 노드가 문서에 없으면 `interactionsOps`가 `null`을 내고 그 자리에서 끝난다(D7).
      commitOps(interactionsOps(open.document, nodeId, interactions))
    },
    [open, commitOps],
  )

  return {
    commitProp,
    commitVariant,
    commitInteractions,
    commitOps,
    undo,
    redo,
    canUndo,
    canRedo,
    status,
  }
}
