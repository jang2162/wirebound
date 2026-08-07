/**
 * 보내지 않았거나 응답을 기다리는 편집의 큐. **순수 함수뿐이고 상태를 들지 않는다** —
 * 상태는 `editor-store.ts`가 갖고, 여기 있는 것은 그 상태를 어떻게 옮기는가다. 큐 로직만
 * 따로 재려고 뽑았다.
 *
 * **지키는 것은 D6다: in-flight는 항상 하나.** README가 요구한다 — *"앞 요청의 `seq`를
 * 받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다."*
 * 그래서 배열의 `[0]`이 전송 중인 것이고, ack가 오면 그것만 빠진다.
 */
import type { PatchOp } from '@wirebound/schema'

/**
 * 이 편집이 어디서 나왔나. **ack 시점에 revision을 어느 스택에 쌓을지가 여기서 갈린다** —
 * undo가 만든 revision의 `inverse`는 원래 편집을 **다시** 적용하므로 redo 스택으로 가야 한다.
 * 큐를 지날 때 그 사실이 남지 않으면 ack가 그것을 알 길이 없다.
 */
export type EditKind = 'edit' | 'undo' | 'redo'

export interface PendingEdit {
  /**
   * 이 편집을 만든 쪽이 붙인 id.
   *
   * **ack를 가르는 것은 이 값과 큐의 `[0]`이지 서버 응답의 에코가 아니다.** 서버가
   * `clientOpId`를 되돌려 주지만(`api/types.ts`의 `PatchResult`) 클라이언트는 그것을 읽지
   * 않는다 — `edit/use-edit-commit.tsx`가 `store.ackEdit(request.clientOpId, result)`로
   * **보낸 요청의** id를 넘긴다. D6로 in-flight가 하나이므로 응답은 반드시 그 요청의
   * 것이고, **요청 id로 맞추는 편이 서버 에코를 믿는 것보다 견고하다** — 서버가 엉뚱한
   * 값을 되돌려 줘도 ack가 어긋나지 않는다(실측: 그렇게 해도 `headSeq`·큐·undo 스택이
   * 정상으로 움직인다).
   */
  clientOpId: string
  ops: PatchOp[]
  /**
   * 이 편집을 만들 때의 `headSeq`.
   *
   * **전송에 쓰는 값이 아니다.** `[0]`만 전송되고 그 시점의 `baseSeq`는 스토어의 지금
   * `headSeq`를 다시 읽는다 — 앞 편집이 ack되며 `headSeq`가 올랐으면 이 값은 이미 낡았다.
   * 여기 담아 두는 것은 이 편집이 어느 revision 위에서 만들어졌는지를 남기기 위한 것이고,
   * P3의 리베이스가 그것을 쓴다.
   */
  baseSeq: number
  kind: EditKind
}

/** 지금 보낼 것. 없으면 `null`이다. */
export function nextPending(pending: readonly PendingEdit[]): PendingEdit | null {
  return pending[0] ?? null
}

/**
 * ack 하나를 반영한 새 큐.
 *
 * **`[0]`의 id와 맞을 때만 움직인다.** 늦게 도착한 응답이나 모르는 id가 큐를 흔들면
 * 아직 보내지도 않은 편집이 조용히 사라진다. 맞지 않으면 **같은 배열을 그대로** 돌려주는데,
 * 스토어가 참조 비교로 변경을 판정하므로 그래야 구독자가 헛일을 하지 않는다.
 */
export function ackPending(pending: readonly PendingEdit[], clientOpId: string): PendingEdit[] {
  const head = pending[0]
  if (head === undefined || head.clientOpId !== clientOpId) return pending as PendingEdit[]
  return pending.slice(1)
}

/**
 * 큐를 비우고 **버린 것을 함께 돌려준다.** 버린 목록이 필요한 이유는 통지다(D8) —
 * 사용자는 보내지 못한 편집이 있었다는 것을 알아야 한다.
 *
 * 문서를 되돌리는 일은 여기서 하지 않는다. 실패는 **어떤 종류든** 재조회로 수렴한다(D4).
 */
export function clearPending(pending: readonly PendingEdit[]): {
  pending: PendingEdit[]
  dropped: PendingEdit[]
} {
  return { pending: [], dropped: [...pending] }
}
