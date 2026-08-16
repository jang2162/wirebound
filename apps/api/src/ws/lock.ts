/**
 * `lock`·`unlock` 프레임 하나를 처리한다 — §7.2의 *"노드를 선택하면 그 서브트리에 잠금을
 * 건다"*가 서버에 닿는 자리다.
 *
 * # 편집 채널에 얹지 않았다 (P3-2 이월 §2.4 · P3-3 D4)
 *
 * `patch`는 `clientOpId`로 답과 짝지어지고, 연결이 끊기면 기다리던 것이 **전부 실패한다.**
 * 잠금은 그 셋이 다 다르다:
 *
 * | | `patch` | 잠금 |
 * |---|---|---|
 * | 답 | `patch-ack`/`patch-error`를 **낸 사람에게만** | `locks` 목록을 **룸 전체에** |
 * | 짝짓기 | `clientOpId` | 없다 — 목록이 곧 답이다 |
 * | 끊겼을 때 | 기다리던 편집을 실패로 끝낸다 | **서버가 알아서 놓는다**(§7.2) |
 *
 * 같은 채널에 얹으면 `failInFlight`의 뜻이 갈래마다 달라진다.
 *
 * # 서버는 획득을 거절하지 않는다 — 판정이다
 *
 * 남이 이미 잠근 서브트리를 잠그겠다고 해도 **여기서는 막지 않는다.** 막으려면 선택 하나마다
 * 문서를 읽어야 하는데(경로를 알아야 겹침을 안다), §7.2가 재확인을 요구한 자리는
 * *"patch 수신 시"*이고 그쪽은 어차피 문서를 읽는다(`lock/check.ts`).
 *
 * **겹친 잠금이 서는 판은 화면이 배지를 무시하고 보낸 경우뿐이고, 그때 결과는 보수적인
 * 쪽이다** — 둘 다 상대의 구역을 못 고친다(잠금이 뚫리는 것이 아니라 서로 막힌다).
 * 30초면 풀린다.
 */
import type { FastifyInstance } from 'fastify'
import type { ClientFrame } from './protocol'
import type { RoomConnection } from './rooms'

export type LockFrame = Extract<ClientFrame, { type: 'lock' }>

/**
 * 잠금 목록이 바뀌었으면 룸에 알린다. **던지지 않는다** — 알림이 실패해도 잠금 자체는 섰다
 * (`ws/notify.ts`가 같은 자세를 적었다).
 */
function announce(app: FastifyInstance, projectId: string, changed: boolean): void {
  if (!changed) return
  void app.realtime.broadcast.announceLocks(projectId).catch((error: unknown) => {
    app.log.error({ err: error, projectId }, 'locks 알림 실패')
  })
}

/** `lock` 하나. **같은 노드를 다시 보내는 것이 하트비트다** — 그때는 목록이 안 바뀌어 조용하다. */
export function handleLockFrame(app: FastifyInstance, connection: RoomConnection, frame: LockFrame): void {
  const changed = app.realtime.locks.hold({
    projectId: connection.projectId,
    pageId: frame.pageId,
    nodeId: frame.nodeId,
    connectionId: connection.id,
    // **연결이 든다** — 프레임이 실어 온 값이 아니다(`ws/patch.ts`의 actor와 같은 이유).
    userId: connection.userId,
    userName: connection.userName,
  })
  announce(app, connection.projectId, changed)
}

/**
 * 이 연결이 든 것을 놓는다. 놓을 것이 없었으면 조용하다.
 *
 * **`unlock` 프레임과 연결 종료가 같은 함수를 부른다.** 둘은 같은 일이고(§7.2가 *"연결 종료
 * 시 즉시 해제"*라고 적은 그 해제다), 갈라 두면 한쪽만 알리는 날이 온다 — 그러면 배지가
 * 남는다.
 */
export function releaseLocksOf(app: FastifyInstance, connection: RoomConnection): void {
  announce(app, connection.projectId, app.realtime.locks.release(connection.id))
}
