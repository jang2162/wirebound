/**
 * 룸에 프레임을 흘리는 자리. **`services/`가 아니라 `ws/`에 있다** —
 * `services/edit-pipeline.ts`의 머리말이 *"`services/`는 SQL을 직접 쓰지 않고 HTTP도
 * 모른다"*고 못박았고, 브로드캐스트는 전송이다. 그 계약을 깨면 `applyEdit`이 소켓을 알게
 * 된다(P3-1 D3).
 *
 * **그래서 호출자가 빠뜨릴 수 있다 — 그것이 D3의 대가다.** 대가를 갚는 것은
 * `test/broadcast-census.test.ts`다: `applyEdit`을 부르는 자리를 소스에서 세어, 새 호출자가
 * 생기면 그 파일이 **먼저 죽는다.**
 *
 * # 보내기 직전에 권한을 다시 본다 (D5 — §10의 *"즉시 회수"*를 실행하는 것)
 *
 * §10은 *"세션 행을 지우면 열려 있는 WS 연결의 권한도 즉시 회수된다"*와 *"WS는 룸 참가 시
 * 한 번, 각 patch 수신 시 한 번 확인한다"*를 함께 적었다. **이 슬라이스에는 patch 수신이
 * 없다** — 클라이언트는 받기만 한다(D6). 그러면 참가 이후로는 아무것도 그 회수를 실행하지
 * 않는다.
 *
 * **판정: 회수를 실행하는 것은 이 함수다.** 프레임 하나를 흘릴 때마다 룸의 각 연결에 대해
 * 세션 행과 멤버십을 **다시** 본다. 못 넘긴 연결은 아무것도 받지 못하고 그 자리에서
 * 닫힌다(`WS_CLOSE.revoked`).
 *
 * **그 판정이 *"즉시"*를 어떻게 좁히는지 적어 둔다.** 세션이 사라진 뒤 그 연결로 나가는
 * 다음 바이트가 없으면 소켓은 열린 채 남는다 — 다만 **그 연결로 프로젝트의 무엇도 나가지
 * 않는다.** 관측 가능한 뜻에서의 회수는 지켜지고, 소켓이 즉시 끊기는 것까지는 아니다.
 * `ws/routes.ts`가 두 번째 확인 지점을 갖는다(클라이언트가 보내는 프레임마다) — P3-2가
 * patch를 얹으면 §10의 문장이 글자 그대로 참이 된다.
 *
 * **비용은 룸 참가자 수만큼의 조회 두 건 × 브로드캐스트 한 번이다.** 캐시하지 않는다 —
 * `auth/plugin.ts`가 매 요청 DB를 direct hit하는 것과 같은 자세다. 캐시하면 그 TTL이 곧
 * *"회수가 늦는 창"*이 되고, 그 창은 아무 데도 적혀 있지 않게 된다.
 */
import { findMembership, roleAtLeast } from '../auth/roles'
import { sessionIsLive } from '../auth/session'
import type { DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'
import { WS_CLOSE, type Participant, type ServerFrame } from './protocol'
import type { RoomConnection, RoomRegistry } from './rooms'

export interface BroadcastOptions {
  /**
   * 이 연결에는 보내지 않는다. **REST로 편집을 낸 사람 자신의 연결**이 여기 온다 —
   * §7.1이 *"[본인] ack 수신 / [타인] ops 수신"*으로 갈라 둔 그 자리다.
   *
   * 안 가르면 자기 편집이 자기에게 되돌아오고, 그 프레임이 **HTTP 응답보다 먼저 도착할 수
   * 있다.** 그때 받는 쪽은 이미 낙관적으로 적용한 ops를 한 번 더 적용하게 된다.
   */
  exceptConnectionId?: string
}

export interface Broadcaster {
  /** 룸 전체에 프레임 하나를 흘린다. **보낸 연결 수**를 돌려준다 — 케이스가 그 수를 쓴다. */
  send(projectId: string, frame: ServerFrame, options?: BroadcastOptions): Promise<number>
  /** 지금 룸에 있는 사람을 룸 전체에 알린다(D4의 셋째 — 연결·참가·이탈). */
  announcePresence(projectId: string): Promise<number>
  /**
   * 연결 하나가 아직 자격이 있는지 본다. `ws/routes.ts`가 **프레임을 받을 때마다** 부른다 —
   * §10의 *"각 patch 수신 시 한 번"*이 이 슬라이스에서 설 수 있는 자리다.
   */
  stillAllowed(connection: RoomConnection): Promise<boolean>
}

/**
 * 브로드캐스트를 받을 수 있는 최소 역할. **`viewer`다** — 조회 전용 사용자도 남이 고친
 * 화면을 봐야 한다. `editor`를 요구하면 뷰어의 화면은 새로고침해야만 갱신되고, 그것은
 * §1의 *"실시간 동시편집"*이 뜻하는 바가 아니다.
 */
const MIN_ROLE_TO_RECEIVE: ProjectRole = 'viewer'

export function createBroadcaster(db: DbHandle, rooms: RoomRegistry): Broadcaster {
  const stillAllowed = async (connection: RoomConnection): Promise<boolean> => {
    if (!(await sessionIsLive(db, connection.sessionId))) return false
    const role = await findMembership(db, connection.projectId, connection.userId)
    return role !== null && roleAtLeast(role, MIN_ROLE_TO_RECEIVE)
  }

  const send: Broadcaster['send'] = async (projectId, frame, options) => {
    const payload = JSON.stringify(frame)
    let delivered = 0

    for (const connection of rooms.membersOf(projectId)) {
      if (options?.exceptConnectionId === connection.id) continue

      if (!(await stillAllowed(connection))) {
        rooms.leave(projectId, connection.id)
        connection.close(WS_CLOSE.revoked, '권한이 회수되었습니다')
        continue
      }

      connection.send(payload)
      delivered += 1
    }

    return delivered
  }

  return {
    send,
    stillAllowed,
    announcePresence: async (projectId) => {
      const participants: Participant[] = rooms.membersOf(projectId).map((connection) => ({
        connectionId: connection.id,
        userId: connection.userId,
        userName: connection.userName,
      }))
      return send(projectId, { type: 'presence', projectId, participants })
    },
  }
}
