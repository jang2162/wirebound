/**
 * 룸에 프레임을 흘리는 자리. **`services/`가 아니라 `ws/`에 있다** —
 * `services/edit-pipeline.ts`의 머리말이 *"`services/`는 SQL을 직접 쓰지 않고 HTTP도
 * 모른다"*고 못박았고, 브로드캐스트는 전송이다. 그 계약을 깨면 `applyEdit`이 소켓을 알게
 * 된다.
 *
 * **그래서 호출자가 빠뜨릴 수 있다 — 그것이 이 배치의 대가다.** 대가를 갚는 것은
 * `test/broadcast-census.test.ts`다: `applyEdit`을 부르는 자리를 소스에서 세어, 새 호출자가
 * 생기면 그 파일이 **먼저 죽는다.**
 *
 * # 보내기 직전에 권한을 다시 본다 (설계서 「권한 모델」의 *"즉시 회수"*를 실행하는 것)
 *
 * 「권한 모델」은 *"세션 행을 지우면 열려 있는 WS 연결의 권한도 즉시 회수된다"*와 *"WS는 룸 참가 시
 * 한 번, 각 patch 수신 시 한 번 확인한다"*를 함께 적는다. 수신 시 확인은 `ws/routes.ts`가 하지만
 * **아무것도 안 보내는 연결**은 참가 이후로 그 확인을 한 번도 안 거친다 — 그래서 이 함수가
 * 보내는 쪽에서 그 회수를 실행한다.
 *
 * **판정: 회수를 실행하는 것은 이 함수다.** 프레임 하나를 흘릴 때마다 룸의 각 연결에 대해
 * 세션 행과 멤버십을 **다시** 본다. 못 넘긴 연결은 아무것도 받지 못하고 룸에서 빠지며
 * `WS_CLOSE.revoked`로 닫힌다 — 아래 «회수는 프레임 쪽 회수와 같은 순서다».
 *
 * # 회수는 프레임 쪽 회수와 같은 순서다
 *
 * 룸에서 빼고 · 소켓은 **도는 프레임이 끝난 뒤에** 닫고(`RoomConnection.closeWhenIdle`) · 잠금과 참가자 목록은 곧바로 거둔다
 * (`onRevoked` — `ws/index.ts`가 `releaseLocksOf`와 `presence` 알림을 준다). `ws/routes.ts`의 «권한이 회수되었습니다» 갈래와 같다.
 * 곧바로 닫으면 페이지 행에 줄 선 `patch`의 답(커밋 순간의 재확인이 낸 401 · 404)이 닫힌 소켓에서 길을 잃어 낸 쪽은 확정된 거절을
 * «모름»으로 받는다 — 잠금을 쥔 채 멤버에서 빠지면 놓는 `locks` 방송이 이 자리로 회수한다(`test/ws-membership.test.ts`의 «잠금을
 * 쥔 채 제거돼도»). 닫기를 기다리는 동안 잠금 · 참가자를 닫힘 이벤트에 맡기면 그 편집이 끝날 때까지 남의 화면에 «편집 중»과 그
 * 사람이 남는다(`test/ws-auth.test.ts`의 «남의 방송이 지나가면»).
 *
 * **그 판정이 *"즉시"*를 어떻게 좁히는지 적어 둔다.** 세션이 사라진 뒤 그 연결로 나가는
 * 다음 바이트가 없으면 소켓은 열린 채 남는다 — 다만 **그 연결로 프로젝트의 무엇도 나가지
 * 않는다.** 관측 가능한 뜻에서의 회수는 지켜지고, 소켓이 즉시 끊기는 것까지는 아니다.
 * `ws/routes.ts`가 두 번째 확인 지점을 갖는다(클라이언트가 보내는 프레임마다). **그쪽이
 * `patch`까지 덮으므로 지금은 편집을 내는 연결에 대해서는 회수가 곧바로 실행된다** —
 * 남는 창은 *"아무것도 안 보내고 아무것도 안 받는"* 연결뿐이다.
 *
 * **비용은 룸 참가자 수만큼의 조회 두 건 × 브로드캐스트 한 번이다.** 캐시하지 않는다 —
 * `auth/plugin.ts`가 매 요청 DB를 direct hit하는 것과 같은 자세다. 캐시하면 그 TTL이 곧
 * *"회수가 늦는 창"*이 되고, 그 창은 아무 데도 적혀 있지 않게 된다.
 */
import { findMembership, roleAtLeast } from '../auth/roles'
import { sessionIsLive } from '../auth/session'
import type { DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'
import type { LockStore } from '../lock/store'
import { WS_CLOSE, type Participant, type ServerFrame } from './protocol'
import type { RoomConnection, RoomRegistry } from './rooms'

/**
 * 방송을 일으킨 요청이 **어느 세션의 어느 연결**에서 왔는가. 연결 id 는 요청이 자기 입으로 말한 값이고
 * (`x-wb-connection-id` — `ws/notify.ts`), 세션은 서버가 그 요청의 쿠키에서 읽은 값이다(`request.sessionId`).
 */
export interface BroadcastOrigin {
  connectionId: string
  sessionId: string
}

export interface BroadcastOptions {
  /**
   * 이 요청을 낸 연결에는 보내지 않는다. **REST로 편집을 낸 사람 자신의 연결**이 여기 온다 —
   * 설계서 「정방향 흐름」이 *"[본인] ack 수신 / [타인] ops 수신"*으로 갈라 둔 그 자리다.
   *
   * 안 가르면 자기 편집이 자기에게 되돌아오고, 그 프레임이 **HTTP 응답보다 먼저 도착할 수
   * 있다.** 그때 받는 쪽은 이미 낙관적으로 적용한 ops를 한 번 더 적용하게 된다.
   *
   * **빠지는 것은 그 요청의 세션이 든 연결뿐이다**(`sentBy`). id 만 견주면 요청이 실은
   * id 가 **남의 연결**이어도 그 연결이 빠진다(재기동 뒤 옛 id 를 받은 캐럴이 앨리스의 게시
   * 방송을 못 받는다). id 는 룸의 모두에게 보인다(`presence`의 `participants`) — 그래서 이 확인이 없으면
   * 위조로도 같은 일이 난다.
   */
  except?: BroadcastOrigin
}

/**
 * 이 연결이 그 요청을 낸 연결인가. **id 가 같고 세션도 같아야 한다.** 아니면 **아무도 안 뺀다**: 덜 빼는 쪽의
 * 대가는 자기 편집이 자기에게 한 번 더 오는 것이고 헤더를 안 싣는 클라이언트와 같은 판이다(`ws/notify.ts`의 머리말 —
 * 문서 편집은 `clientOpId`로 알아보고, 코멘트 번호는 같은 `add`라 끝의 문서가 같다 — `apps/web`의
 * `write-ledger.tsx` «두 번 얹힘»). 더 빼는 쪽의 대가는 **남의 화면이 조용히 낡는 것**이다.
 *
 * Chrome(재는 법 — 앨리스의 게시 중 api 를 죽였다 띄우고, 앨리스의 «다시 확인»이 싣는 옛 id 를 route 에서
 * **캐럴의 지금 id** 로 바꿔 끼운다 = 캐럴이 그 id 를 받은 판):
 *
 * | 이 함수 | 캐럴이 받은 `page-changed` | 캐럴의 번호 칸 | 밥이 다음 게시를 단 뒤 |
 * |---|---|---|---|
 * | 세션 확인을 끄면(id 만 견줌 — 변조) | 없음 | `[]`(앨리스·밥 `["1"]`) | `[]` · «연결이 끊긴 사이의 변경을 놓쳐 …» |
 * | 지금 | seq 2 · 3 | `["1"]` | `["1","2"]` · 통지 없음 |
 *
 * **토큰 요청은 아무도 안 뺀다**(`broadcastOrigin`이 세션 없는 요청에 `undefined`를 준다). 요청을 «낸 셸»이
 * 없기 때문이다: WS 는 쿠키로만 열리고(`ws/routes.ts`의 `requireSessionAuth`) 웹은 쿠키로만 부르므로, 쿠키 없이
 * 토큰만 든 요청(MCP · `wireb`)은 **어떤 연결의 셸에서도 나오지 않았다.** 그 요청이 같은 사람의 연결 id 를
 * 실었다고 그 연결을 빼면, 에이전트가 낸 편집을 **그 사람의 브라우저가 못 받는다.** (지금 토큰 클라이언트는 이
 * 헤더를 안 싣는다.)
 */
function sentBy(connection: RoomConnection, origin: BroadcastOrigin): boolean {
  return connection.id === origin.connectionId && connection.sessionId === origin.sessionId
}

export interface Broadcaster {
  /** 룸 전체에 프레임 하나를 흘린다. **보낸 연결 수**를 돌려준다 — 케이스가 그 수를 쓴다. */
  send(projectId: string, frame: ServerFrame, options?: BroadcastOptions): Promise<number>
  /** 지금 룸에 있는 사람을 룸 전체에 알린다(연결·참가·이탈 때). */
  announcePresence(projectId: string): Promise<number>
  /**
   * 지금 살아 있는 잠금을 룸 전체에 알린다(설계서 「소프트 잠금」).
   *
   * **`announcePresence`와 같은 모양이다** — 전부를 싣고, 낸 사람도 받는다. 잠금이
   * 바뀔 때마다와 **누가 들어올 때** 부른다: 들어오는 쪽이 지금 상태를 알 길이 이것뿐이고,
   * 그것이 없으면 다시 붙은 화면의 배지가 다음 누군가의 선택까지 비어 있다.
   */
  announceLocks(projectId: string): Promise<number>
  /**
   * 연결 하나가 아직 **그 역할 이상**인지 본다. `ws/routes.ts`가 프레임을 받을 때마다,
   * 아래 `send`가 프레임을 흘릴 때마다 부른다.
   *
   * # 최소 역할을 인자로 받는다
   *
   * 이 함수가 `MIN_ROLE_TO_RECEIVE`를 안에 박고 프레임 수신 검사도 그것을 그대로 쓰면
   * **받는 기준과 보내는 기준이 한 함수에 겹친다** — 그러면 설계서 「권한 모델」이
   * *"조회 전용"*으로 못박은 viewer가 `patch`로 편집을 낸다.
   *
   * 대안 셋(조회를 하나 더 하기 · 역할을 돌려주게 하기 · 최소 역할을 인자로
   * 받기) 중 **셋째다.** 근거: 그러면 두 기준이 **같은 함수의 두 호출**로 남아
   * `roleAtLeast` 하나가 계속 유일한 비교 지점이 된다. 역할을 돌려주게 하는 판(둘째)도
   * 조회 수는 같지만, 부르는 쪽마다 *"이 역할이면 되는가"*를 다시 쓰게 되므로 비교가
   * 자리 수만큼 늘어난다 — `partitionIssues`·`gatePageImport`가 판정을 한 자리로 묶는 것과
   * 같은 형태다.
   */
  stillAllowed(connection: RoomConnection, minRole: ProjectRole): Promise<boolean>
}

/**
 * 브로드캐스트를 받을 수 있는 최소 역할. **`viewer`다** — 조회 전용 사용자도 남이 고친
 * 화면을 봐야 한다. `editor`를 요구하면 뷰어의 화면은 새로고침해야만 갱신되고, 그것은
 * 설계서 「확정된 설계 결정」의 *"실시간 동시편집"*이 뜻하는 바가 아니다.
 *
 * **보내는 쪽의 최소 역할은 여기 없다** — 프레임 종류마다 다르고, 그 표는 `protocol.ts`의
 * `MIN_ROLE_FOR_FRAME`이다.
 */
const MIN_ROLE_TO_RECEIVE: ProjectRole = 'viewer'

/** 한 연결의 권한을 못 재서 그 연결을 건너뛴 것을 적는 자리 — `ws/index.ts`가 앱 로거를 준다. */
export type BroadcastSkipSink = (error: unknown, connection: RoomConnection) => void

/** 회수한 연결의 잠금 · 참가자 목록을 거두는 자리(머리말 «회수는 프레임 쪽 회수와 같은 순서다») — `ws/index.ts`가 준다. */
export type BroadcastRevokeSink = (connection: RoomConnection) => void

function writeSkipToStderr(error: unknown, connection: RoomConnection): void {
  console.error(`방송 — 연결 ${connection.id}의 권한을 재지 못해 이 프레임을 건너뛴다:`, error)
}

/**
 * # 한 연결의 권한을 못 재면 그 연결만 건너뛴다
 *
 * `stillAllowed`는 연결마다 질의 둘이다 — 풀이 다 차 풀 대기 시간 제한(`createPool`의 `connectionTimeoutMillis`)에 걸리거나
 * DB 연결을 잃으면 **던진다.** 그 던짐이 루프를 통째로 끝내면 **방의 나머지 연결 모두가 그 프레임을 잃는다**(재는 법 — 모듈
 * 스크립트: 가짜 연결 6 · 둘째가 받는 순간 풀 10 칸을 3s 쥠 · 풀 대기 1.5s → 던짐을 안 가르면 `send`가 1.5s 에 던지고 c0 c1 만 받는다).
 *
 * **판정은 «못 쟀으면 안 보낸다»다** — 건너뛴 연결에 보내면 회수된 세션이 프레임을 받는 길(인가 우회)이 열린다. 닫지도 않는다
 * (회수가 확인된 것이 아니다). 그 연결은 다음 프레임의 `seq`로 빈 것을 안다(`apps/web`의 `applyRemoteChange` → `'gap'`).
 * 그 프레임이 마지막이면 다음 편집까지 낡은 화면이다 — 남는 틈.
 */
export function createBroadcaster(
  db: DbHandle,
  rooms: RoomRegistry,
  locks: LockStore,
  onSkip: BroadcastSkipSink = writeSkipToStderr,
  onRevoked: BroadcastRevokeSink = () => {},
): Broadcaster {
  const stillAllowed: Broadcaster['stillAllowed'] = async (connection, minRole) => {
    if (!(await sessionIsLive(db, connection.sessionId))) return false
    const role = await findMembership(db, connection.projectId, connection.userId)
    return role !== null && roleAtLeast(role, minRole)
  }

  /**
   * 룸을 돌며 연결마다 자격을 보고 보낸다. **싣는 것은 보내는 순간 짓는다**(`payload`) — `announceLocks`가 그 자리를 쓴다
   * (아래 그 줄).
   */
  const deliver = async (projectId: string, payload: () => string, options?: BroadcastOptions): Promise<number> => {
    let delivered = 0

    for (const connection of rooms.membersOf(projectId)) {
      if (options?.except !== undefined && sentBy(connection, options.except)) continue

      let allowed: boolean
      try {
        allowed = await stillAllowed(connection, MIN_ROLE_TO_RECEIVE)
      } catch (error) {
        onSkip(error, connection)
        continue
      }
      if (!allowed) {
        rooms.leave(projectId, connection.id)
        connection.closeWhenIdle(WS_CLOSE.revoked, '권한이 회수되었습니다')
        onRevoked(connection)
        continue
      }

      connection.send(payload())
      delivered += 1
    }

    return delivered
  }

  const send: Broadcaster['send'] = async (projectId, frame, options) => {
    const payload = JSON.stringify(frame)
    return deliver(projectId, () => payload, options)
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
    // **목록은 연결마다 보내는 순간 짓는다.** 부를 때 한 번 짓고 연결마다 자격을 await 한 뒤 보내면
    // 앞서 지은(낡은) 목록이 뒤에 지은 목록을 한 연결에서 **추월해 마지막 프레임으로 남는다**(raw WS 로 잠금을 잇달아 바꾸고
    // 250ms 뒤 구경꾼의 마지막 목록을 보면 선 잠금이 빠진 판이 난다). 보내는 순간 지으면 한 연결이 받는 목록은 **지은 순서대로 닿고**, 짓기와
    // 보내기 사이에 await 가 없으므로 마지막 것이 가장 새 것이다.
    announceLocks: async (projectId) =>
      deliver(projectId, () => JSON.stringify({ type: 'locks', projectId, locks: locks.liveIn(projectId) } satisfies ServerFrame)),
  }
}
