/**
 * 화면이 편집을 내는 통로. ops를 만들어 스토어에 넘기고 전송을 밟는다.
 *
 * **전송은 이펙트가 아니라 명시적 펌프다.** `useEffect`로 걸면 `pending`이 바뀔 때마다
 * 이펙트가 다시 돌아 "지금 보내는 중인가"를 ref로 따로 지켜야 하고, 그 ref와 이펙트의
 * 의존 배열이 어긋나는 날 두 요청이 동시에 나간다. 큐에서 다음을 꺼내 보내는 일을 함수
 * 하나에 두고 편집이 들어올 때 그것을 부르면, 조건이 코드에 보인다.
 *
 * **in-flight는 항상 하나다.** README가 요구한다 — *"앞 요청의 `seq`를 받아야 다음
 * `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다."* 그것을 지키는 것은
 * 아래 `pumpingRef`와 **한 번에 하나씩 `await`하는 루프**다. 루프가 도는 동안 들어온 편집은
 * 큐에 쌓이고, 앞 요청이 끝난 뒤 같은 루프가 그것을 집는다.
 */
import { useCallback } from 'react'
import type { Interaction, PatchOp } from '@wirebound/schema'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { useEditChannel, useLockChannel } from '../realtime/context'
import { UnansweredEditError } from '../realtime/edit-channel'
import { isPageOpen, useEditorStore, useEditorStoreInstance, useOpenPage } from '../store/use-editor-store'
import type { EditStatus, UndoAttempt } from '../store/editor-store'
import { interactionsOps, propOps, variantOps } from './ops'

/** 서버가 이유를 주지 않은 편집 실패에 쓸 문장(네트워크 단절 등). */
const EDIT_UNKNOWN_FAILURE = '편집을 저장하지 못했습니다'
/** 재조회마저 실패했을 때. 편집 실패와 갈라 적어야 사용자가 무엇이 남았는지 안다. */
const RECOVER_UNKNOWN_FAILURE = '편집에 실패한 뒤 페이지를 다시 불러오지도 못했습니다'

/**
 * **재조회까지 실패한 갈래에서 덧붙이는 문장** — *"실패했다고 말하는데 조작은 화면에
 * 남는다"*를 닫는 자리다.
 *
 * **이 갈래는 `loadPage`를 지나지 않는다.** 그래서 낙관적으로 적용된 편집이 문서에 그대로
 * 남고, 선택도 유지되어 화면이 아무것도 되돌리지 않는다 — 재조회가 **성공한** 갈래가
 * 문서·선택·큐를 서버 상태로 놓는 것과 정반대다. 사용자는 실패 알림을 보면서 **자기가
 * 방금 만든 것이 화면에 그대로 있는 것**을 본다.
 *
 * **되돌릴 문서가 없다 — 그것이 이 갈래의 성질이다.** 서버 상태를 못 읽었으므로 무엇으로
 * 되돌릴지 모른다. **문서를 비우는 쪽은 고르지 않았다:** 그러면 사용자가 보고 있던 것을
 * 통째로 잃고, 그 손실은 *"서버가 잠깐 답을 못 했다"*는 사유에 비해 너무 크다. **할 수
 * 있는 정직한 일은 그 상태를 말하는 것뿐이고**, 그것이 `'diverged'`에 내린 판정과
 * 같은 형태다(*"서버엔 번호가 있는데 내 화면엔 없다 — 새로고침하면 맞춰집니다"*).
 *
 * **우리 쪽 문장에만 붙인다.** 서버 문장을 고치지 않는 경계(`api/failure.tsx`)는 그대로다.
 */
const UNRECOVERED_NOTICE =
  '화면에 남아 있는 편집은 저장되지 않았습니다. 새로고침해 서버 상태를 확인하세요.'

/**
 * **답을 기다리던 편집을 이 탭이 스스로 버린 연결과 함께 잃었을 때의 문장**(`UnansweredEditError`).
 *
 * **«취소됐다»도 «저장하지 못했다»도 거짓이다.** 그 연결은 열려 있었으므로 편집은 서버에 닿았다 — 결과만 모른다.
 * 끊김과 같은 문장(«편집을 저장하지 못했습니다 — … 편집 1개가 취소됐습니다»)을 내면, 서버는 그것을 커밋하고
 * 새 연결이 방송해 화면에도 선다(Chrome · 행 잠금 5s 로 잰 값). 사용자가 믿고 다시 하면 **두 번 선다.** 그래서
 * 모른다고 말하고, 반영됐다면 화면이 저절로 맞춰진다는 것을 말한다(까닭은 `realtime/use-realtime.ts`의 «쿠키가
 * 바뀌면»). 되돌리기 이력이 비는 것은 그대로다 — 답(`inverse`)을 못 받았다.
 *
 * **앞머리가 까닭을 말한다 — 부르는 곳이 하나라서다**(같은 사람이 다른 탭에서 다시 로그인했을 때의 재연결). 답을
 * 못 받은 편집은 하나다(in-flight는 한 번에 하나). **아직 안 보낸 편집은 서버에 닿지 않았다** — 그것은 따로 세어 취소됐다고
 * 말한다.
 *
 * @param outcome 다시 불러왔으면 `cancelled`(그러며 버린 **안 보낸** 편집 수), 다시 불러오지도 못했으면 `reason`(그 까닭).
 */
function unansweredNotice(outcome: { cancelled: number } | { reason: string }): string {
  const head =
    '다른 탭에서 다시 로그인해 실시간 연결을 새로 붙이느라 보낸 편집의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 없습니다.'
  if ('reason' in outcome) return `${head} ${outcome.reason} — 새로고침해 서버 상태를 확인하세요.`
  const tail = outcome.cancelled > 0 ? ` 아직 보내지 않은 편집 ${outcome.cancelled}개는 취소됐습니다.` : ''
  return `${head} 페이지를 서버 상태로 다시 불러왔고, 반영됐다면 곧 화면에 나타납니다.${tail}`
}

/** 답을 못 받은 판에서 다시 불러오지도 못했을 때, 서버가 이유를 주지 않으면 쓸 문장(`unansweredNotice`의 `reason`). */
const UNANSWERED_RECOVER_FAILURE = '페이지를 다시 불러오지도 못했습니다'

/**
 * 되돌릴 수 없는 항목을 건너뛰었을 때의 안내(설계서 「개인 undo/redo」).
 *
 * **에러가 아니라 정상 흐름이다** — 다른 사람이 그 노드를 지웠으면 내 `inverse`가 적용되지
 * 않는 것이 당연하고, 그때 할 일은 멈추는 것이 아니라 다음 항목으로 넘어가는 것이다.
 * 자리는 편집 실패와 같은 `role="alert"` 하나를 쓴다 — 사용자가 누른 행동의 결과라는
 * 점이 같고, 자리를 나누면 그 하나뿐인 통지 규칙이 흩어진다.
 */
function skippedNotice(skipped: number, applied: boolean): string {
  const head = `되돌릴 수 없는 편집 ${skipped}개를 건너뛰었습니다.`
  return applied ? `${head} 그 앞의 편집을 되돌렸습니다.` : `${head} 되돌릴 것이 더 없습니다.`
}

/**
 * 남의 잠금에 막혀 되돌리지 못했을 때의 안내(설계서 「소프트 잠금」 · 「에러 처리」의 잠금 충돌 —
 * *"발생 시 안내 — 자동 재시도하지 않는다"*. 다시 누르는 것은 사람이다).
 *
 * **위 `skippedNotice`와 갈라 적는다.** 그쪽은 *"그 편집은 이제 없다"*이고 이쪽은
 * *"지금은 안 된다"*다 — 사용자가 다음에 할 일이 다르므로(포기 / 기다림) 문장도 다르다.
 * 뒷문장이 그 차이를 말하는 자리이고, 그것이 없으면 사용자는 이력이 사라진 줄 안다.
 *
 * **건너뛴 것이 함께 있으면 앞에 붙인다.** 둘은 서로 다른 항목에서 났고(건너뛴 것은
 * 버려졌다, 막힌 것은 남아 있다) 한쪽만 말하면 나머지가 조용히 사라진다.
 *
 * # 왜 상태줄이 아니라 여기인가
 *
 * 상태줄(`panels/toolbar-status.ts`)이 «왜 회색인가»를 말하는 자리이고 잠금이 그 사다리
 * 맨 위에 있다. **되돌리기는 그 사다리에 안 올린다** — 그 줄이 답하는
 * 물음이 *"지금 **고른 것**이 무엇이라서 그런가"*인데 되돌리기는 **선택과 무관**하고, 자리도
 * 구조 툴바가 아니라 셸 헤더의 `편집 이력` 묶음이다(`routes/editor.tsx`의 `UndoTools`).
 * 그 줄에 얹으면 사다리가 자기 것이 아닌 물음에 답하게 되고, 구조 툴바를 안 보고 있는
 * 사용자에게는 어차피 안 보인다.
 */
function lockedNotice(userName: string, skipped: number): string {
  const head = skipped > 0 ? `되돌릴 수 없는 편집 ${skipped}개를 건너뛰었습니다. 그 앞의 편집은 ` : ''
  return `${head}${userName}님이 편집 중이라 되돌릴 수 없습니다. 잠금이 풀리면 그대로 되돌릴 수 있습니다.`
}

export interface EditCommit {
  /** 노드의 prop 하나를 바꾼다. 적용할 수 없으면 아무 일도 일어나지 않는다. */
  commitProp: (nodeId: string, prop: string, value: unknown) => void
  /**
   * 노드의 `variant`를 바꾼다. **`commitProp`과 갈라 두는 것이 요점이다** — `variant`는
   * props의 키가 아니라 봉투의 필드라 patch 경로가 한 단계 위다(`edit/ops.ts`의 `variantOps`).
   * `null`이면 지운다(기본 표현으로 되돌리기).
   */
  commitVariant: (nodeId: string, variant: string | null) => void
  /**
   * 노드의 `interactions`를 통째로 갈아 끼운다(설계서 「상호작용」의 「모델」). **`commitVariant`와 같은 층이다** —
   * `interactions`도 props의 키가 아니라 봉투의 필드라 patch 경로가 한 단계 위다.
   * 빈 배열이면 키를 지운다(`edit/ops.ts`의 `interactionsOps`).
   *
   * **새 계약이 아니다.** 상호작용은 **클라이언트가** 문서를 바꾸므로 코멘트의
   * `markerOps` 같은 서버 왕복이 필요 없고, 이미 있는 낙관적 편집 경로를 그대로 탄다.
   */
  commitInteractions: (nodeId: string, interactions: readonly Interaction[]) => void
  /**
   * 이미 만들어진 `ops`를 낸다. **낸 편집이 큐에 들어갔으면 `true`다.**
   *
   * `ops`가 `null`인 것은 `edit/ops.ts`의 생성기들이 "요청을 만들지 마라"를 말하는
   * 방식이고, 그대로 넘길 수 있게 받아 준다 — 부르는 쪽마다 `null` 검사를 두면
   * 그중 하나가 빠지는 날 잘못된 요청이 나간다.
   *
   * **반환값이 있는 것은 구조 편집 때문이다.** 삭제는 편집이 큐에 들어간 뒤에만 선택을
   * 옮긴다.
   *
   * **"실패했는데 옮기면 노드는 그대로인데 선택만 부모로 간다"는 인과는 거짓이다.**
   * 툴바 쪽 주석과 같은 사실을 말하므로 한쪽만 고치면 둘이 갈린다. 잰 값 둘:
   *
   * - **서버 실패는 이 반환값과 무관하다.** `commitOps`는 큐에 넣고 `true`를 내며 409는
   *   그 뒤에 온다. **그리고 그때 선택은 툴바가 옮겨 둔 부모 그대로다** — `loadPage`가
   *   **같은 페이지를 다시 싣는 경로에서는 선택을 건드리지 않으므로** 두 경로가 갈리지 않는다
   *   (`store/editor-store.ts`의 `#selectionFor`).
   * - **로컬 실패 경로는 호출자의 앞선 가드가 먼저 잡는다.** 그래서 이 반환값 검사는
   *   지워도 죽는 케이스가 없다(`panels/structure-toolbar.tsx`의 `removeSelected`·`addNode` 주석에
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
  const channel = useEditChannel()
  const lockChannel = useLockChannel()
  const store = useEditorStoreInstance()
  const open = useOpenPage(pageId)
  const status = useEditorStore(store, (s) => s.editStatus)
  const canUndo = useEditorStore(store, (s) => s.undoStack.length > 0)
  const canRedo = useEditorStore(store, (s) => s.redoStack.length > 0)

  /**
   * 실패 하나를 수습한다. **실패 종류로 갈리지 않는다** — 409든 422든 네트워크든
   * 페이지를 다시 받아 서버 상태로 수렴한다. 왜 항목별 롤백이 아닌지는 설계서 「정방향 흐름」에 있다:
   * `inverse`를 서버가 만드는 것과 같은 이유로, 클라이언트가 계산한 되돌리기는 낙관적으로
   * 앞서 있는 만큼 틀릴 수 있다.
   *
   * **세션이 끊긴 실패 하나만 갈린다.** 다시 받아도 401이고 그 사이 요청만 쌓이므로
   * 재조회하지 않는다. 통지 자리(`shell/edit-alert.tsx`)가 그 값을 보고 `<SignedOut />`을
   * 그리면 세션 무효화 경로로 이어진다.
   *
   * **문장만 갈리는 실패가 하나 있다 — 답을 못 받은 편집**(`UnansweredEditError`). 수습은 같고(다시 불러와
   * 서버 상태로) 그 편집을 «취소됐다»고 말하지 않는다 — 서버에 닿았다(`unansweredNotice`).
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

      // **답을 기다리던 편집을 이 탭이 스스로 버린 연결과 함께 잃었다 — 서버에 닿았다.** 수습은 같고
      // (다시 불러와 서버 상태로) 말만 다르다 — 그 편집을 «취소됐다»고 하지 않는다(`unansweredNotice`).
      const unanswered = caught instanceof UnansweredEditError
      const dropped = store.failEdits()
      /**
       * **이 페이지를 떠나면 요청째 끊는다**(`ReadOptions.cancel`). «떠남»은 **스토어가 이 페이지를 더는
       * 열고 있지 않은 것**이다(`openPageId`) — 이 훅을 부른 본문(속성 패널 …)은 탭마다 내려가지만 수습은 스토어의 일이라 본문의
       * 수명에 매지 않는다. 끊지도 거르지도 않으면, 이 조회(1MB 일 수 있다)가 도는 동안 옆 페이지로 가도 끝까지 내려받고
       * **늦게 온 답이 `loadPage`로 스토어를 앞 페이지로 되돌린다**(jsdom — `test/edit/edit-recovery-leave.test.tsx`). 셸째 내려가면
       * 스토어도 버려지므로 끊는 신호가 없다 — 그 조회는 끝까지 돈다(남는 틈).
       */
      const leave = new AbortController()
      const stillOpen = (): boolean => isPageOpen(store, pageId)
      const stop = store.subscribe(() => {
        if (!stillOpen()) leave.abort()
      })
      try {
        const page = await api.getPage(projectId, pageId, { cancel: leave.signal })
        // **떠났으면 싣지 않는다** — 끊기 전에 답이 와 있었을 수 있다. 버린 편집의 통지도 이제 이 화면의 말이 아니다.
        if (!stillOpen()) return
        // **`loadPage`가 그 사이 들어온 편집까지 버리고 그것을 돌려준다.** 재조회는 왕복
        // 하나라 그 동안 새 편집이 큐에 쌓일 수 있고, 비우지 않으면 "취소됐다"고 알린 편집이
        // 나중에 새 `baseSeq` 위에서 서버로 나간다(`store/editor-store.ts`에 실측이 있다).
        const alsoDropped = store.loadPage(pageId, page.schema, page.headSeq)
        // 버린 수는 **센 값이다** — 전송에 실패한 것, 큐에 남아 있던 것, 재조회를 기다리는
        // 동안 들어온 것을 합친 것이고, 셋 다 문서가 서버 것으로 되돌아가며 사라졌다.
        const lost = dropped.length + alsoDropped.length
        if (unanswered) {
          // 버린 것 중 하나(큐의 머리)가 답을 못 받은 그 편집이다 — 나머지는 안 보냈다.
          store.setEditFailure({ kind: 'message', message: unansweredNotice({ cancelled: lost - 1 }) })
          return
        }
        store.setEditFailure({
          kind: 'message',
          // **서버 문장과 우리 문장 사이에 구분자를 둔다.** 공백 하나로 붙이면 두 문장이 한
          // 문장처럼 읽힌다 — 카탈로그 위반의 이유가 **타입 이름으로 끝나기** 때문에
          // `알 수 없는 컴포넌트 타입: 없는타입 페이지를 …`가 되어 **"없는타입 페이지를"이
          // 하나의 명사구**가 된다.
          //
          // **`unknown-type` 하나의 문제가 아니다.** 이 경로가 실제로 받는 문장을 api 하네스로
          // 재 보니 **끝에 마침표를 두는 것이 하나도 없다:**
          //
          //   409 `페이지가 이미 변경되었습니다 (요청 baseSeq 99, 현재 0)`        ← 괄호로 끝난다
          //   409 `편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/…`  ← **경로로 끝난다**
          //   422 `알 수 없는 컴포넌트 타입: 없는타입`                          ← 타입 이름으로 끝난다
          //   400 `잘못된 입력: 예상 타입은 array, 받은 타입은 undefined입니다`
          //
          // **위 넷은 서버에 실재하는 문장이다** — 지어낸 예로 논지를 세우지 않는다. 둘째 줄은
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
        // **떠났으면 말하지도 비우지도 않는다** — 끊긴 조회의 거절이거나 떠난 뒤의 실패다. 아래 `failEdits`는 **지금 열린 페이지의**
        // 큐를 비운다 — 떠난 페이지의 수습이 옆 페이지의 편집을 버리면 안 된다.
        if (!stillOpen()) return
        // **재조회를 기다리는 동안 들어온 편집은 여기서도 버린다.** 서버 상태를 모르는 채
        // 그것을 보내면 낡은 `baseSeq` 위에서 기록된다(실측: 이 줄이 없으면 그 편집이
        // `baseSeq 7`로 나간다 — 재조회가 성공한 판의 42와 달리 서버가 다시 409를 낼 값이다).
        store.failEdits()
        // **여기서 다시 재조회하지 않는다.** 서버가 계속 실패하는 동안 요청이 쌓인다 —
        // 세션 확인에 자동 재시도를 두지 않은 것과 같은 판단이다.
        const recoverFailure = toFailure(
          recoverCaught,
          unanswered ? UNANSWERED_RECOVER_FAILURE : RECOVER_UNKNOWN_FAILURE,
        )
        store.setEditFailure(
          recoverFailure.kind === 'signed-out'
            ? // 세션이 끊긴 것은 여기서 말하지 않는다 — `EditAlert`이 `<SignedOut />`으로
              // 화면을 갈아 끼우므로 남아 있는 화면 자체가 없다.
              recoverFailure
            : unanswered
              ? // **«저장되지 않았습니다»가 여기서도 거짓이다** — 답을 못 받은 편집은 서버에 닿았다.
                { kind: 'message', message: unansweredNotice({ reason: recoverFailure.message }) }
              : // **성공 갈래와 같은 형식으로 우리 문장을 덧붙인다**(구분자 `—`도 같다).
                // 서버 문장은 끝에 마침표를 두지 않으므로 그대로 이어 붙이면 두 문장이 한
                // 문장처럼 읽힌다(성공 갈래 주석의 실측).
                { kind: 'message', message: `${recoverFailure.message} — ${UNRECOVERED_NOTICE}` },
        )
      } finally {
        stop()
        store.setEditStatus('idle')
      }
    },
    [api, projectId, pageId, store],
  )

  const pump = useCallback(async (): Promise<void> => {
    // **가드는 스토어가 든다.** 훅의 `ref`에 두면 `useEditCommit`을 부르는 자리가 둘일 때
    // (속성 패널과 undo/redo 버튼) 각자 자기 것을 갖는다 — 실측: 그 트리에서 편집을 각각
    // 내면 `maxInFlight`가 2가 되어 «in-flight는 항상 하나»가 깨진다.
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
        // **설계서 「소프트 잠금」의 *"편집 중 하트비트로 갱신"*.** 타이머를 두지 않고 **편집이 나가는 순간**에
        // 매다는 것이 판정이다: 그 절이 갱신의 조건으로 적은 것이 *"편집 중"*이고, 타이머를
        // 두면 케이스가 시간을 기다리게 된다. 잡은 것이 없으면 아무것도 안 나간다.
        //
        // **여기가 전송의 유일한 통로다** — 속성·구조·undo·redo가 전부 이 루프를 지난다.
        // `commitOps`에 달면 undo/redo가 빠진다.
        lockChannel?.refresh()
        try {
          // **WS가 붙어 있으면 그리로 낸다**(설계서 「정방향 흐름」). 없으면 REST다: 그 경로는
          // 남아 있어야 하고(설계서 「LLM 편집 경로」의 MCP가 REST로 들어온다), `RealtimeProvider` 없이 도는 화면은
          // 여전히 그쪽으로 편집한다.
          //
          // **갈리는 것은 전송뿐이다.** 두 경로가 같은 `applyEdit`을 지나고(`ws/patch.ts`),
          // 같은 모양의 실패를 내며(`patch-error`가 REST 봉투를 그대로 싣는다), 여기 아래의
          // `ackEdit`·`recover`도 같은 것을 받는다.
          const result =
            channel !== null && channel.ready()
              ? await channel.send({ pageId, ...request })
              : await api.patchOps(projectId, pageId, request)
          // **응답의 `warnings`가 여기로 함께 들어간다.** 서버는 응답에 그것을 싣는다 —
          // 여기서 넘기지 않으면 **읽는 코드가 0건**이 되어 경고가 아무 데도 안 남는다.
          // 스토어가 ack와 **함께** 싣는 것이 요점이다 — 늦게 도착한
          // 응답의 경고가 지금 문서의 것으로 실리지 않는다(`ackEdit`의 가드 뒤에 있다).
          store.ackEdit(request.clientOpId, result)
        } catch (caught) {
          // **리베이스가 그 사이에 이 편집을 옮겨 놓았으면 다시 낸다.**
          //
          // **이것이 없으면 리베이스가 서버에 닿지 않는다(실측).** 서버는 `baseSeq`가
          // `head_seq`와 정확히 같을 때만 받으므로, 내 편집이 떠 있는 동안 남의 편집이
          // 기록되면 내 것은 **반드시** 409를 받는다. 그 409를 곧바로 `recover`에 넘기면
          // 재조회가 큐를 통째로 비우므로, 방금 리베이스한 편집도 함께 사라진다. 즉
          // **리베이스의 결과가 한 왕복 뒤에 지워진다.**
          //
          // 다시 내는 조건은 둘이다 — 큐의 머리가 **여전히 이 편집**이고(리베이스가 그것을
          // 버리지 않았다), 그 사이 `headSeq`가 **움직였다**(다른 revision이 기록됐다).
          // 조건이 `headSeq`의 이동이므로 **끝난다:** 서버가 새 revision을 만들어야만 한 번
          // 더 시도하고, 아니면 그대로 `recover`로 간다.
          //
          // **이 갈래는 프레임이 실패보다 먼저 올 때만 돈다 — 재 보면 거의 늘 그 순서다.**
          //
          // | 순서 | 언제 | 무엇이 도나 |
          // |---|---|---|
          // | 프레임 먼저 | 잰 판 전부 — 두 편집을 동시에 내도 | 여기 |
          // | 실패 먼저 | 진 쪽의 요청이 이긴 쪽의 커밋 **뒤** · 방송 **전**에 닿을 때(잰 판에서는 안 났다) | 아래 `recover` |
          //
          // [api 값] 두 WS 연결이 같은 `baseSeq`로 같은 prop 을 바꾸는 `patch`를 간격 0 · 1 · 2 · 5 · 10 · 15 · 20 · 30 ·
          // 50ms 로 30 판씩 보내면, 진 쪽이 이긴 쪽의 `page-changed`를 제 `patch-error`보다 먼저 받았다 — 270/270(별도
          // 프로세스의 서버와 클라이언트로도, 같은 프로세스 하네스 `withRealApi`로도 같다). 동시에 내면 진 쪽은 이긴 쪽이 쥔
          // 페이지 행에서 기다렸다가 그 커밋 뒤에 낡음을 본다(파이프라인 3단계 — 1단계의 잠금 뒤다). 방송은 그 커밋 직후에
          // 나간다. 실패가 먼저 오려면 진 쪽의 요청이 방송이 룸 연결마다 조회를 `await`하는 틈에 닿아야 해서 좁다 —
          // 거기로 가도 **덜 좋아질 뿐 틀리지 않는다**(아래 `recover`의 재조회). 다시 재는 법: 위 간격대로 두 연결의
          // `patch`를 보내고 진 쪽의 수신 순서를 센다. `test/edit/ws-transport.test.tsx`가 두 순서를 가짜 서버로 나란히 잰다.
          //
          // **409로 좁히는 것은 판정이다.** *"문서가 내 밑에서 움직였다"*는 부류가 그것뿐이고
          // (`http/edit-outcome.ts`의 표), 401·422까지 다시 내면 고쳐지지 않는 실패에 왕복을
          // 하나 더 쓴다.
          const head = store.nextRequest()
          if (
            caught instanceof ApiError &&
            caught.status === 409 &&
            head !== null &&
            head.clientOpId === request.clientOpId &&
            head.baseSeq !== request.baseSeq
          ) {
            continue
          }
          // 루프를 여기서 끝낸다. `recover`가 큐를 비우므로 남은 편집이 다시 나가지 않고,
          // 재조회가 문서를 서버 것으로 맞춘다.
          await recover(caught)
          return
        }
      }
    } finally {
      store.endPump()
    }
  }, [api, channel, lockChannel, projectId, pageId, store, recover])

  /**
   * 스택에서 한 단계 꺼내 보낸다. undo와 redo가 같은 규칙을 쓰므로 한 곳에 둔다 —
   * 다른 것은 어느 스택을 보느냐뿐이고, 그 판단은 스토어 안에 있다.
   *
   * **남의 잠금도 그 판단 안이다**(「소프트 잠금」의 1차 방어). 여기서 `locks`를 뒤지지 않고 스토어가
   * 낸 `blocked`를 받는 것이 요점이다 — 화면이 잠금 목록을 손에 쥐는 자리는 하나여야 하고
   * (`test/lock/one-verdict.test.ts`), 되돌리기 버튼을 **비활성으로 만들지 않은 것도** 그
   * 규칙 때문이다: 비활성이 되려면 셸 헤더가 잠금 목록을 구독해 다시 그려야 한다.
   * 대신 **누르면 이 자리가 이유를 말한다** — undo가 이미 쓰는 통로이고(위 `skippedNotice`),
   * 「개인 undo/redo」가 *"적용 불가는 에러가 아니라 정상 흐름"*으로 정한 자리와 같다.
   */
  const step = useCallback(
    (start: () => UndoAttempt): void => {
      // 지금 열린 페이지가 아니면 아무것도 하지 않는다(`commitProp`과 같은 대조).
      if (open === null) return

      const attempt = start()
      // **잠금이 먼저다.** 건너뛴 것이 함께 있어도 사용자가 지금 답을 기다리는 물음은
      // *"왜 안 되돌아갔나"*이고, 그 답은 잠금이다. 건너뛴 수는 문장 안에 함께 실린다.
      if (attempt.blocked !== null) {
        store.setEditFailure({
          kind: 'message',
          message: lockedNotice(attempt.blocked.userName, attempt.skipped),
        })
        // **큐에 들어간 것이 없으므로 펌프도 밟지 않는다** — 스토어가 낙관적 적용조차
        // 안 했다(`#startFrom`이 그 앞에서 멈춘다).
        return
      }
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
   * 편집 하나를 큐에 넣고 전송을 밟는다. **`commitProp`과 구조 편집(구조 툴바)이
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
      // 만드는 쪽이 "요청을 보내지 마라"라고 답한 것이다(`edit/ops.ts` 머리말).
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

      // 문서에 없는 노드면 `propOps`가 `null`을 내고 `commitOps`가 그 자리에서 돌아온다.
      commitOps(propOps(open.document, nodeId, prop, value))
    },
    [open, commitOps],
  )

  const commitVariant = useCallback(
    (nodeId: string, variant: string | null): void => {
      // `commitProp`과 같은 이유로 `open`을 본다 — `open.document`가 필요하다.
      // 열린 페이지 대조 자체는 `commitOps`가 다시 한다.
      if (open === null) return

      // 지울 것이 없거나 노드가 문서에 없으면 `variantOps`가 `null`을 내고 그 자리에서 끝난다.
      commitOps(variantOps(open.document, nodeId, variant))
    },
    [open, commitOps],
  )

  const commitInteractions = useCallback(
    (nodeId: string, interactions: readonly Interaction[]): void => {
      // `commitProp`·`commitVariant`와 같은 이유로 `open`을 본다 — `open.document`가 필요하다.
      // 열린 페이지 대조 자체는 `commitOps`가 다시 한다.
      if (open === null) return

      // 지울 것이 없거나 노드가 문서에 없으면 `interactionsOps`가 `null`을 내고 그 자리에서 끝난다.
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
