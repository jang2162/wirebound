/**
 * `lock`·`unlock` 프레임 하나를 처리한다 — 설계서 「소프트 잠금」의 *"노드를 선택하면 그 서브트리에 잠금을
 * 건다"*가 서버에 닿는 자리다.
 *
 * # 편집 채널에 얹지 않는다
 *
 * `patch`는 `clientOpId`로 답과 짝지어지고, 연결이 끊기면 기다리던 것이 **전부 실패한다.**
 * 잠금은 그 셋이 다 다르다:
 *
 * | | `patch` | 잠금 |
 * |---|---|---|
 * | 답 | `patch-ack`/`patch-error`를 **낸 사람에게만** | 받으면 `locks` 목록을 **룸 전체에** · 거절하면 `lock-denied`를 **낸 사람에게만** |
 * | 짝짓기 | `clientOpId` | 받으면 없다 — 목록이 곧 답이다. 거절은 `pageId`·`nodeId`와 그 프레임의 `lockId`를 싣는다(아래) |
 * | 끊겼을 때 | 기다리던 편집을 실패로 끝낸다 | **서버가 알아서 놓는다**(「소프트 잠금」) |
 *
 * 같은 채널에 얹으면 `failInFlight`의 뜻이 갈래마다 달라진다.
 *
 * # 서버가 획득을 거절한다
 *
 * **남이 이미 쥔 자리(또는 겹치는 서브트리)의 `lock`은 받지 않고, 낸 연결에 `lock-denied`로 답한다.** 겹침의 판정은 「소프트 잠금」의
 * «선택 = 서브트리 claim» 그대로 — 화면의 1차 방어가 부르는 **스키마의 같은 함수**다(`lock/check.ts`의 `selectionVerdict`).
 *
 * **겹친 잠금을 «둘 다 서로를 못 고치는» 보수적인 결과로 두지 않는다.** 겹치면 둘 다 막혀 누구도 못 고치고, 친 글은
 * 423 으로 사라진다 — 그리고 겹침은 드물지 않다(Chrome 두 화면에서 난다): 끊겼다 다시 붙는 화면의 재알림이 그 사이 남이
 * 잡은 자리를 다시 잡고, 승격 뒤 첫 편집의 잡기와 editor 둘의 보통 경합도 겹친다. 클라이언트가 «내 것이 섰나»를 목록으로
 * 추정하면(`observe`) 목록이 거꾸로 닿는 창에서 거짓 잃음이 난다. 뿌리는 하나다 — **판정하는 자리가 서버에 있어야 한다.**
 *
 * **비용은 작다** — *"막으려면 선택 하나마다 문서를 읽어야 한다"*가 아니다. 문서를 읽는 것은 **같은 페이지에 남의 잠금이 있을 때뿐이다** — 혼자 고르는 흔한
 * 판은 조회가 없다(`lockConflictError`와 같은 자세).
 *
 * # 무엇을 답하나 — 판마다
 *
 * | 판 | 답 | 까닭 |
 * |---|---|---|
 * | 겹치는 자리를 **다른 사람**이 쥐었다 | `lock-denied` · 이 연결이 쥔 것도 놓는다 | 새 자리를 달라는 것이 앞 자리를 놓는 것이다(연결 하나 = 잠금 하나). 놓지 않으면 화면은 아무것도 안 쥔 줄 아는데 앞 자리의 배지가 TTL 까지 남는다 |
 * | **같은 사람의 다른 탭**이 쥐었다 | 받는다(둘 다 쥔다) | 소유자는 사람이다. 편집의 2차 방어도 같은 사람을 막지 않는다(`lockConflictError`). 두 판정이 갈리면 화면이 잡은 자리를 서버가 편집에서 막는다 |
 * | **같은 연결이 같은 자리를 다시 보냈다**(하트비트 · 재알림) | 받는다 — 만료만 미룬다(목록은 안 흐른다) | 남이 겹쳐 쥔 판이 생기지 않는다 — 판정은 그대로 돌고 막히면 위 첫 줄이다 |
 * | 남의 잠금이 **TTL 을 넘겼다** | 받는다 | `liveIn`이 읽으며 걷는다(`lock/store.ts`) — 판정은 살아 있는 것만 본다 |
 * | 자격을 보는 사이 멤버십이 **잠금을 쥘 수 없게** 바뀌었다(viewer · 제거 — `membershipEpoch`) | `lock-denied` · 이 연결이 쥔 것도 놓는다 | 읽은 자격이 바뀌기 전의 것이다. 조용히 버리면 **화면은 쥔 줄 안다.** 답을 받은 화면은 «잡지 않은 선택»에 서고 다음 편집이 다시 보낸다. **편집 권한이 그대로인 변경(editor↔owner · 같은 역할)은 세대를 안 올린다** — 올리면 그 사이의 하트비트 하나가 정당한 잠금을 놓는다. 올리는 판정은 `ws/notify.ts`의 `canHold` 하나다 |
 * | 끝나는 순간 연결이 **룸에 없다**(닫혔다 · 회수됐다) | 답 없음 · 잡지 않는다 | 닫힘의 해제(`releaseLocksOf`)는 이미 지나갔다 — 여기서 잡으면 아무도 안 놓는 잠금이 TTL 까지 선다 |
 * | viewer 가 보냈다 | 답 없음(`ws/routes.ts`) | 웹은 viewer 로 보내지 않는다. 강등이 끼면 `membership-changed`가 가고 화면이 놓는다 |
 * | 이 연결이 **뒤에 보낸** `lock`·`unlock`이 있다 | 답 없음 · 아무것도 안 한다 | 아래 «뒤에 온 것이 이긴다» |
 *
 * **거절은 그 `lock` 프레임과 짝지어진다.** 프레임이 `lockId`를 실어 오면 `lock-denied`가 그것을 되돌려준다 — 화면은 **마지막으로
 * 보낸 `lock`의 거절만** 받아들인다(`apps/web`의 `lock-channel.ts` 「거절은 그 `lock` 프레임과 짝짓는다」).
 *
 * # 뒤에 온 것이 이긴다
 *
 * 프레임마다 자격을 보는 await(DB 둘)가 있고 거기에 문서 조회가 더해질 수 있어, **한 연결의 `lock`·`unlock` 둘이 받은 순서와
 * 다르게 끝날 수 있다** — `lock A`(조회 중) 뒤의 `unlock`이 먼저 끝나면 뒤이어 A 가 서서 화면이 놓은 자리가 TTL 까지 남는다.
 * 그래서 받는 순간 차례를 매기고(`ws/routes.ts`), 끝나는 순간 **더 뒤에 받은 것이 있으면 아무것도 안 한다**(`LockTurn`).
 * 끝난 것만 이긴다 — 뒤의 것이 끝나며 자기 판정을 한다.
 *
 * # 판정과 잡기는 같은 틱이다 — 문서 조회 경로는 페이지 행 안이다
 *
 * 문서를 읽는 await 뒤에 **목록을 다시 읽어** 판정하고 그 자리에서 잡는다(`selectionVerdict`는 동기다). 두 연결이 같은
 * 자리를 두고 함께 읽었어도 먼저 돌아온 쪽이 잡고, 뒤에 돌아온 쪽은 그것을 보고 거절된다.
 *
 * **문서는 페이지 행을 잡고 읽고, 판정과 `hold`는 그 행을 쥔 채 한다**(`lock/check.ts`의 «판정은 페이지 행 안에서»).
 * 편집도 그 행 안에서 판정하고 커밋하므로 둘이 한 점에 줄 선다: 판정을 지난 편집의 커밋 **전** 문서로 잠금을 판정하는 일
 * (들여쓰기 · 새 노드 판의 겹침)이 없다. 빠른 경로(남의 잠금 없음)는 행을 안 잡는다 — 그 까닭도 그 머리말이 적었다.
 *
 * 남는 것:
 *
 * - **화면의 목록이 낡은 창.** 남의 `locks`가 닿기 전에 고른 화면은 거절을 받고서야 안다(배지는 곧 온다). 그 사이 첫 편집을
 *   냈으면 그 `patch`는 2차 방어(`lockConflictError`)가 423 으로 막는다.
 * - **이기는 것은 도착 순서가 아니라 판정이 끝난 순서다.** 문서를 읽어야 하는 요청(같은 페이지에 남의 잠금이 있다)은 읽지 않아도
 *   되는 요청에 뒤질 수 있다 — 어느 쪽이든 하나만 선다(코드로 판단한 것이다 — 따로 재지 않는다).
 * - **빠른 경로의 잠금 아래로 이미 판정을 지난 편집이 커밋될 수 있다** — 겹침이 아니라 «배지가 선 뒤 수 ms 에
 *   커밋»이다. 닫으려면 빠른 경로도 행을 잡거나(선택마다 트랜잭션) 진행 중인 편집을 세야 한다 — 짓지 않는다.
 * - **문서 조회 경로가 행을 기다린다.** 같은 페이지의 편집(과 다른 선택)이 쥔 동안 줄 선다 — 큰 문서면 그 편집의 문서 조회만큼이다.
 */
import type { WbNode } from '@wirebound/schema'
import type { FastifyInstance } from 'fastify'
import { withTransaction } from '../db/tx'
import { readSelectionRoot, selectionVerdict } from '../lock/check'
import type { ClientFrame, ServerFrame } from './protocol'
import type { RoomConnection } from './rooms'

export type LockFrame = Extract<ClientFrame, { type: 'lock' }>

/**
 * 프레임 하나가 **끝나는 순간** 아직 뜻이 있는가 — 받는 순간 `ws/routes.ts`가 매겨 넘긴다(위 «뒤에 온 것이 이긴다» · 표의
 * 멤버십 줄).
 */
export interface LockTurn {
  /** 자격을 보기 **전에** 읽은 멤버십 세대(`RoomConnection.membershipEpoch`). */
  epoch: number
  /** 이 연결이 이 프레임 **뒤에** 받은 `lock`·`unlock`이 없는가. */
  current(): boolean
}

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

/** 받지 않았다 — 이 연결이 쥔 것을 놓고(위 표) 낸 연결에만 답한다. 프레임의 `lockId`를 되돌려준다(위 «거절은 그 프레임과 짝지어진다»). */
function deny(app: FastifyInstance, connection: RoomConnection, frame: LockFrame): void {
  releaseLocksOf(app, connection)
  const denied: ServerFrame = {
    type: 'lock-denied',
    projectId: connection.projectId,
    pageId: frame.pageId,
    nodeId: frame.nodeId,
    ...(frame.lockId !== undefined ? { lockId: frame.lockId } : {}),
  }
  connection.send(JSON.stringify(denied))
}

/** 연결이 아직 룸에 있는가 — 닫힘 · 회수가 룸에서 뺀 **뒤에** 놓는다(`ws/routes.ts`). */
function inRoom(app: FastifyInstance, connection: RoomConnection): boolean {
  return app.realtime.rooms.membersOf(connection.projectId).includes(connection)
}

/**
 * 끝을 짓는다 — **동기다.** 뜻이 없어졌으면(뒤 프레임 · 룸에 없음) 아무것도 안 하고, 세대가 바뀌었으면 거절하고, 아니면 판정해
 * 거절하거나 잡는다. 문서가 필요하면 `needs-document`를 돌려준다(아무것도 안 했다).
 */
function settle(
  app: FastifyInstance,
  connection: RoomConnection,
  frame: LockFrame,
  turn: LockTurn,
  root: WbNode | null | undefined,
): 'settled' | 'needs-document' {
  if (!turn.current()) return 'settled'
  if (!inRoom(app, connection)) return 'settled'
  if (connection.membershipEpoch !== turn.epoch) {
    deny(app, connection, frame)
    return 'settled'
  }
  const input = { projectId: connection.projectId, pageId: frame.pageId, nodeId: frame.nodeId, userId: connection.userId }
  const verdict = selectionVerdict(app, input, root)
  if (verdict === 'needs-document') return verdict
  if (verdict === 'held') {
    deny(app, connection, frame)
    return 'settled'
  }
  const changed = app.realtime.locks.hold({
    ...input,
    connectionId: connection.id,
    // **연결이 든다** — 프레임이 실어 온 값이 아니다(`ws/patch.ts`의 actor와 같은 이유).
    userName: connection.userName,
  })
  announce(app, connection.projectId, changed)
  return 'settled'
}

/**
 * `lock` 하나. **같은 노드를 다시 보내는 것이 하트비트다** — 그때는 목록이 안 바뀌어 조용하다.
 *
 * 먼저 문서 없이 묻는다(빠른 경로). 문서가 필요하면(같은 페이지에 남의 잠금이 있다) **페이지 행을 잡고 머리 문서를 읽은 뒤 그 행을
 * 쥔 채 처음부터 다시 묻는다**(위 «판정과 잡기는 같은 틱이다»). 읽은 뒤의 판정은 `needs-document`를 내지 않는다.
 */
export async function handleLockFrame(
  app: FastifyInstance,
  connection: RoomConnection,
  frame: LockFrame,
  turn: LockTurn,
): Promise<void> {
  if (settle(app, connection, frame, turn, undefined) === 'settled') return
  await withTransaction(app.db, async (trx) => {
    const root = await readSelectionRoot(trx, connection.projectId, frame.pageId)
    settle(app, connection, frame, turn, root)
  })
}

/**
 * 이 연결이 든 것을 놓는다. 놓을 것이 없었으면 조용하다.
 *
 * **`unlock` 프레임과 연결 종료가 같은 함수를 부른다.** 둘은 같은 일이고(설계서 「소프트 잠금」이 *"연결 종료
 * 시 즉시 해제"*라고 적은 그 해제다), 갈라 두면 한쪽만 알리는 날이 온다 — 그러면 배지가
 * 남는다. **거절(`deny`)도 같은 함수다.**
 */
export function releaseLocksOf(app: FastifyInstance, connection: RoomConnection): void {
  announce(app, connection.projectId, app.realtime.locks.release(connection.id))
}
