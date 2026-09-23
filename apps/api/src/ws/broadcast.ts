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
 * 한 번, 각 patch 수신 시 한 번 확인한다"*를 함께 적었다. **P3-1에는 patch 수신이 없어서**
 * (클라이언트가 받기만 했다) 참가 이후로는 아무것도 그 회수를 실행하지 않았고, 그래서 이
 * 함수가 그 자리를 맡았다. **P3-2가 patch 수신을 얹으면서 §10의 문장이 글자 그대로 참이
 * 됐다** — 그래도 이 함수는 그대로 남는다(아무것도 안 보내는 연결이 있다).
 *
 * **판정: 회수를 실행하는 것은 이 함수다.** 프레임 하나를 흘릴 때마다 룸의 각 연결에 대해
 * 세션 행과 멤버십을 **다시** 본다. 못 넘긴 연결은 아무것도 받지 못하고 그 자리에서
 * 닫힌다(`WS_CLOSE.revoked`).
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
   * §7.1이 *"[본인] ack 수신 / [타인] ops 수신"*으로 갈라 둔 그 자리다.
   *
   * 안 가르면 자기 편집이 자기에게 되돌아오고, 그 프레임이 **HTTP 응답보다 먼저 도착할 수
   * 있다.** 그때 받는 쪽은 이미 낙관적으로 적용한 ops를 한 번 더 적용하게 된다.
   *
   * **빠지는 것은 그 요청의 세션이 든 연결뿐이다**(`sentBy`). 앞 판은 id 만 견줬다 — 그러면 요청이 실은
   * id 가 **남의 연결**이어도 그 연결이 빠졌다(좁은 반증 3차: 재기동 뒤 옛 id 를 받은 캐럴이 앨리스의 게시
   * 방송을 못 받았다). id 는 룸의 모두에게 보인다(`presence`의 `participants`) — 그래서 이 확인이 없으면
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
 * Chrome(리뷰 (c-1) 절차 — 앨리스의 게시 중 api 를 죽였다 띄우고, 앨리스의 «다시 확인»이 싣는 옛 id 를 route 에서
 * **캐럴의 지금 id** 로 바꿔 끼웠다 = 캐럴이 그 id 를 받은 판):
 *
 * | 이 함수 | 캐럴이 받은 `page-changed` | 캐럴의 번호 칸 | 밥이 다음 게시를 단 뒤 |
 * |---|---|---|---|
 * | 세션 확인을 끄면(id 만 견줌 — 변조) | 없음 | `[]`(앨리스·밥 `["1"]`) | `[]` · «연결이 끊긴 사이의 변경을 놓쳐 …» |
 * | 지금 | seq 2 · 3 | `["1"]` | `["1","2"]` · 통지 없음 |
 *
 * **토큰 요청은 아무도 안 뺀다**(`broadcastOrigin`이 세션 없는 요청에 `undefined`를 준다). 요청을 «낸 셸»이
 * 없기 때문이다: WS 는 쿠키로만 열리고(`ws/routes.ts`의 `requireSessionAuth`) 웹은 쿠키로만 부르므로, 쿠키 없이
 * 토큰만 든 요청(MCP · `wireb`)은 **어떤 연결의 셸에서도 나오지 않았다.** 그 요청이 같은 사람의 연결 id 를
 * 실었다고 그 연결을 빼면, 에이전트가 낸 편집을 **그 사람의 브라우저가 못 받는다.** (오늘 토큰 클라이언트는 이
 * 헤더를 안 싣는다.)
 */
function sentBy(connection: RoomConnection, origin: BroadcastOrigin): boolean {
  return connection.id === origin.connectionId && connection.sessionId === origin.sessionId
}

export interface Broadcaster {
  /** 룸 전체에 프레임 하나를 흘린다. **보낸 연결 수**를 돌려준다 — 케이스가 그 수를 쓴다. */
  send(projectId: string, frame: ServerFrame, options?: BroadcastOptions): Promise<number>
  /** 지금 룸에 있는 사람을 룸 전체에 알린다(D4의 셋째 — 연결·참가·이탈). */
  announcePresence(projectId: string): Promise<number>
  /**
   * 지금 살아 있는 잠금을 룸 전체에 알린다(§7.2).
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
   * # 최소 역할을 인자로 받는 것이 P3-2 D1의 판정이다
   *
   * 앞 슬라이스의 이 함수는 `MIN_ROLE_TO_RECEIVE`를 안에 박고 있었고, 프레임 수신 검사도
   * 그것을 그대로 썼다 — **받는 기준과 보내는 기준이 한 함수에 겹쳐 있었다.** 그대로
   * `patch`를 얹으면 §10이 *"조회 전용"*으로 못박은 viewer가 편집을 낸다.
   *
   * 이월이 적어 둔 셋(조회를 하나 더 하기 · 역할을 돌려주게 하기 · 최소 역할을 인자로
   * 받기) 중 **셋째다.** 근거: 그러면 두 기준이 **같은 함수의 두 호출**로 남아
   * `roleAtLeast` 하나가 계속 유일한 비교 지점이 된다. 역할을 돌려주게 하는 판(둘째)도
   * 조회 수는 같지만, 부르는 쪽마다 *"이 역할이면 되는가"*를 다시 쓰게 되므로 비교가
   * 자리 수만큼 늘어난다 — 이 저장소가 `partitionIssues`·`gatePageImport`에서 반복해 닫아
   * 온 형태다.
   */
  stillAllowed(connection: RoomConnection, minRole: ProjectRole): Promise<boolean>
}

/**
 * 브로드캐스트를 받을 수 있는 최소 역할. **`viewer`다** — 조회 전용 사용자도 남이 고친
 * 화면을 봐야 한다. `editor`를 요구하면 뷰어의 화면은 새로고침해야만 갱신되고, 그것은
 * §1의 *"실시간 동시편집"*이 뜻하는 바가 아니다.
 *
 * **보내는 쪽의 최소 역할은 여기 없다** — 프레임 종류마다 다르고, 그 표는 `protocol.ts`의
 * `MIN_ROLE_FOR_FRAME`이다(P3-2 D1).
 */
const MIN_ROLE_TO_RECEIVE: ProjectRole = 'viewer'

/** 한 연결의 권한을 못 재서 그 연결을 건너뛴 것을 적는 자리 — `ws/index.ts`가 앱 로거를 준다. */
export type BroadcastSkipSink = (error: unknown, connection: RoomConnection) => void

function writeSkipToStderr(error: unknown, connection: RoomConnection): void {
  console.error(`방송 — 연결 ${connection.id}의 권한을 재지 못해 이 프레임을 건너뛴다:`, error)
}

/**
 * # 한 연결의 권한을 못 재면 그 연결만 건너뛴다 (2026-09-23 W′ 리뷰 F5)
 *
 * `stillAllowed`는 연결마다 질의 둘이다 — 풀이 다 차 풀 대기 시간 제한(`createPool`의 `connectionTimeoutMillis`)에 걸리거나
 * DB 연결을 잃으면 **던진다.** 앞 판은 그 던짐이 루프를 통째로 끝내 **방의 나머지 연결 모두가 그 프레임을 잃었다**(모듈
 * 스크립트: 가짜 연결 6 · 둘째가 받는 순간 풀 10 칸을 3s 쥠 · 풀 대기 1.5s → `send`가 1.5s 에 던지고 c0 c1 만 받음).
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
): Broadcaster {
  const stillAllowed: Broadcaster['stillAllowed'] = async (connection, minRole) => {
    if (!(await sessionIsLive(db, connection.sessionId))) return false
    const role = await findMembership(db, connection.projectId, connection.userId)
    return role !== null && roleAtLeast(role, minRole)
  }

  const send: Broadcaster['send'] = async (projectId, frame, options) => {
    const payload = JSON.stringify(frame)
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
    announceLocks: async (projectId) => send(projectId, { type: 'locks', projectId, locks: locks.liveIn(projectId) }),
  }
}
