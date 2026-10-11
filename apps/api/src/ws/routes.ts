/**
 * WebSocket 핸드셰이크와 룸 참가·이탈. **`GET /api/projects/:projectId/ws`** 하나다.
 *
 * # 인증은 REST와 같은 경로다 (설계서 「권한 모델」)
 *
 * *"WebSocket 핸드셰이크도 같은 쿠키를 쓰므로 REST와 WS의 인증 경로가 하나다. 권한 체크는
 * REST와 WebSocket이 **동일한 가드 함수**를 쓴다."*
 *
 * 이 파일은 그 문장을 **두 벌을 만들지 않는 방식으로** 지킨다:
 *
 * | 층 | 무엇이 하나인가 |
 * |---|---|
 * | 쿠키 → 사용자 | `auth/plugin.ts`의 `onRequest` 훅. **업그레이드 요청에도 그대로 돈다** |
 * | 프로젝트 권한 | `projectGuard('viewer')`. `requireProjectRole`을 직접 감싼 WebSocket 전용 껍데기가 **필요 없다**(아래) |
 *
 * **`projectGuard`를 그대로 preHandler로 쓸 수 있다** — `@fastify/websocket`은 업그레이드
 * 요청을 평범한 라우트로 태우고 훅을 전부 돌린 뒤에야 소켓을 넘긴다. 가드가 던지면
 * 업그레이드가 성립하지 않고 클라이언트는 101 대신 HTTP 오류를 본다. 그래서 「권한 모델」의
 * *"룸 참가 시 한 번"*이 REST와 **글자 그대로 같은 함수**로 지켜진다.
 * (`test/ws-auth.test.ts`가 미로그인·비멤버·뷰어 셋을 각각 잰다.)
 *
 * # 참가 이후의 권한 — 확인 지점이 둘이다
 *
 * 「권한 모델」은 *"룸 참가 시 한 번, 각 patch 수신 시 한 번"*이라고 적는다. 회수를 실행하는 자리는 둘이다:
 *
 * 1. **프레임을 받을 때마다** — 이 파일. `ping`도 `patch`도 같은 줄을 지나고, **요구하는
 *    역할만 프레임 종류에서 온다**(`protocol.ts`의 `MIN_ROLE_FOR_FRAME`).
 * 2. **보낼 때마다** — `broadcast.ts`. 아무것도 안 보내는 연결이 있으므로 1만으로는
 *    부족하다. 그쪽 머리말에 *"즉시"*가 어디까지인지 적어 두었다.
 *
 * # 편집을 처리하는 것은 이 파일이 아니다
 *
 * `patch` 프레임의 본줄기는 `ws/patch.ts`에 있다. 이 파일은 **프레임을 읽고 자격을 보고
 * 갈래로 보내는 것**까지다 — 규칙을 여기 두면 REST와 갈린다.
 */
import type { FastifyInstance, FastifyPluginAsync, preHandlerHookHandler } from 'fastify'
import { projectGuard } from '../auth/roles'
import { hashSessionToken } from '../auth/session'
import type { ApiConfig } from '../config'
import { DbConnectionLostError } from '../db/connection-loss'
import type { ProjectRole } from '../db/types'
import { forbidden, internal, unauthenticated } from '../errors'
import { dbUnreachableFailure } from '../http/error-handler'
import { parseParams } from '../http/parse'
import { z } from 'zod'
import { nextConnectionId } from './connection-id'
import { createLockLane, denyLock, releaseLocksOf } from './lock'
import { handlePatchFrame, patchErrorFrame } from './patch'
import { MIN_ROLE_FOR_FRAME, WS_CLOSE, parseClientFrame, type ServerFrame } from './protocol'
import type { RoomConnection } from './rooms'

const WsParams = z.object({ projectId: z.uuid() })

/**
 * 룸에 **들어와 있을** 수 있는 최소 역할. 핸드셰이크 가드와, 프레임이 거절됐을 때
 * *"회수인가 권한 부족인가"*를 가르는 자리가 같은 값을 본다 — 두 곳에 리터럴로 적으면
 * 한쪽만 바뀌는 날 **권한이 없는데 연결이 남거나 있는데 끊긴다.**
 *
 * `broadcast.ts`의 `MIN_ROLE_TO_RECEIVE`와 같은 값이지만 **같은 것이 아니다**: 저쪽은
 * *"프레임을 받을 자격"*이고 이쪽은 *"방에 있을 자격"*이다. 지금 둘이 같은 이유는 「권한 모델」이
 * viewer에게 조회를 열어 두기 때문이고, 갈릴 이유가 생기면 그때 따로 움직인다.
 */
const MIN_ROLE_TO_JOIN: ProjectRole = 'viewer'

/**
 * **WS는 쿠키만이다.**
 *
 * 「권한 모델」이 *"WS 핸드셰이크도 같은 쿠키를 쓰므로 REST와 WS의 인증 경로가 하나다"*라고 적었고,
 * API 토큰을 여기 얹으면 그 **하나가 둘**이 된다. 이 라우트는 `:projectId`를 가지므로
 * 토큰 훅이 `currentUser`를 채우고 `projectGuard`도 통과한다 — 가드 앞에서 안 끊으면
 * 101이 선 뒤 소켓 콜백의 쿠키 검사가 곧바로 닫는다: 핸드셰이크는 성공하고 연결만
 * 죽는 어중간한 상태다. 그래서 가드 **앞**에서 끊는다.
 *
 * 아래 소켓 콜백의 쿠키 검사를 지우지 않는다 — 그쪽은 `sessionId`를 만들어야 하고
 * (「권한 모델」의 *"세션 행을 지우면 권한도 즉시 회수된다"*), 마지막 방벽이기도 하다.
 *
 * **가드 앞에 도는 훅이라 허용 목록에 있다** — `test/pre-guard-hook-census.test.ts`가 참조로 견주려고 내보낸다.
 */
export const requireSessionAuth: preHandlerHookHandler = async (request) => {
  if (request.authKind === 'token') {
    throw unauthenticated('WebSocket은 세션 쿠키로만 연결할 수 있습니다')
  }
}

export function wsRoutes(config: ApiConfig): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    const guards = [requireSessionAuth, projectGuard(MIN_ROLE_TO_JOIN)]
    app.get('/:projectId/ws', { websocket: true, preHandler: guards }, (socket, request) => {
      const { projectId } = parseParams(WsParams, request.params)
      const currentUser = request.currentUser
      const role = request.projectRole
      // 가드를 통과했으면 둘 다 있다. `as`로 좁히지 않는 이유는 `routes/pages.ts`의 같은
      // 자리와 같다 — 가드가 빠지는 순간 `null` 역참조로 죽는 대신 401이 나가야 한다.
      if (!currentUser || !role) {
        socket.close(WS_CLOSE.unauthorized, '로그인이 필요합니다')
        throw unauthenticated()
      }

      const token = request.cookies[config.sessionCookieName]
      if (!token) {
        socket.close(WS_CLOSE.unauthorized, '로그인이 필요합니다')
        return
      }

      /** 도는 프레임 수와, 그것이 0 이 되면 닫을 사유(`RoomConnection.closeWhenIdle`). */
      let inflight = 0
      let closeWhenIdle: { code: number; reason: string } | null = null

      const connection: RoomConnection = {
        // **무작위다** — 재기동을 넘어 겹치지 않는다(`connection-id.ts`).
        id: nextConnectionId(),
        projectId,
        userId: currentUser.id,
        userName: currentUser.name,
        sessionId: hashSessionToken(token),
        membershipEpoch: 0,
        send: (payload) => socket.send(payload),
        close: (code, reason) => socket.close(code, reason),
        closeWhenIdle: (code, reason) => {
          // 먼저 정한 사유가 남는다 — 로그아웃한 연결의 `ping`이 회수 갈래로 와도 «로그아웃했습니다»로 닫는다.
          closeWhenIdle ??= { code, reason }
          if (inflight === 0) socket.close(code, reason)
        },
      }

      const { rooms, broadcast } = app.realtime
      rooms.join(connection)

      const push = (frame: ServerFrame): void => socket.send(JSON.stringify(frame))
      push({ type: 'joined', projectId, connectionId: connection.id, userId: currentUser.id, role })

      // **참가·이탈 알림은 던지지 않는다.** 소켓 콜백은 동기이므로 여기서 새어 나간
      // rejection은 unhandled가 된다. 알림이 실패해도 연결 자체는 살아 있어야 한다.
      const announce = (): void => {
        void broadcast.announcePresence(projectId).catch((error: unknown) => {
          app.log.error({ err: error, projectId }, 'presence 알림 실패')
        })
      }
      announce()
      // **참가할 때 잠금 목록을 한 번 흘린다.** 잠금은 바뀔 때만 흐르므로, 여기서 안
      // 흘리면 들어온 화면의 배지가 **다음 누군가의 선택까지** 비어 있다 — 그동안 설계서 「소프트 잠금」의
      // 1차 방어가 서지 않는다. 이탈에서는 부르지 않는다: 그 연결이 잠금을 들고 있었으면
      // `releaseLocksOf`가 알리고, 안 들고 있었으면 목록이 안 바뀌었다.
      void broadcast.announceLocks(projectId).catch((error: unknown) => {
        app.log.error({ err: error, projectId }, 'locks 알림 실패')
      })

      /**
       * 이 연결이 받은 `lock`·`unlock`의 차례. **받는 순간 매긴다** — 끝나는 순서는 await 가 정하므로 받은 순서와 다를 수 있다
       * (`ws/lock.ts`의 «뒤에 온 것이 이긴다»).
       */
      let lockTurns = 0
      /** 이 연결의 `lock` 트랜잭션 줄 — 한 번에 하나다(`ws/lock.ts`의 «연결 하나가 쥐는 풀 칸은 하나다»). */
      const lockLane = createLockLane(app, connection)

      socket.on('message', (raw: unknown) => {
        // **읽기는 동기이므로 IIFE 밖에서 한다.** 아래 `catch`가 *"어느 편집이 실패했나"*를
        // 알려면 프레임을 손에 쥐고 있어야 한다.
        //
        // **여기서 던지면 감싸는 `catch`가 없어 unhandled가 된다.**
        // 던지는 입력은 알려져 있지 않다: `JSON.parse`는 `parseClientFrame` 안에서 막혀 있고
        // `ClientFrameSchema`에 재귀 멤버가 없어 zod가 스택으로 던질 자리도 없다.
        // **프레임 갈래에 재귀 스키마를 더하면 그 전제가 깨진다.**
        const frame = parseClientFrame(String(raw))
        if (!frame) {
          socket.close(WS_CLOSE.badFrame, '읽을 수 없는 프레임입니다')
          return
        }

        const turn = frame.type === 'lock' || frame.type === 'unlock' ? ++lockTurns : 0
        const current = (): boolean => turn === lockTurns

        inflight += 1
        void (async () => {
          // **자격을 보기 전의 멤버십 세대**(`RoomConnection.membershipEpoch`). 아래 `lock` 갈래가 본다.
          const epoch = connection.membershipEpoch
          // 확인 지점 1 (머리말). 검사는 프레임 종류와 무관하게 **먼저** 돌고, 요구하는
          // 역할만 종류에서 온다(`MIN_ROLE_FOR_FRAME`).
          const minRole = MIN_ROLE_FOR_FRAME[frame.type]
          if (!(await broadcast.stillAllowed(connection, minRole))) {
            // **왜 한 번 더 보는가.** 검사 하나로는 *"권한이 회수됐다"*와 *"뷰어가 편집을
            // 냈다"*가 같은 값이 된다. 클라이언트가 할 일은 정반대다 — 앞의 것은 연결이
            // 끊기고 다시 로그인해야 하는 것이고, 뒤의 것은 **연결이 살아 있는 것이
            // 맞다**(뷰어는 계속 받아야 한다 — `broadcast.ts`의 `MIN_ROLE_TO_RECEIVE`).
            //
            // **두 번째 조회는 거절된 프레임에만 붙는다.** 통과하는 프레임의 비용은
            // 조회 두 건 그대로다.
            if (minRole !== MIN_ROLE_TO_JOIN && (await broadcast.stillAllowed(connection, MIN_ROLE_TO_JOIN))) {
              if (frame.type === 'patch') {
                push(patchErrorFrame(projectId, frame, forbidden('편집 권한이 없습니다')))
              }
              return
            }
            rooms.leave(projectId, connection.id)
            // **소켓은 도는 프레임이 끝난 뒤에 닫는다**(`RoomConnection.closeWhenIdle`) — 이 프레임 앞에 잠금에 줄 선
            // `patch`가 있으면 곧바로 닫을 때 그 답(커밋 순간의 재확인이 낸 401 · 404)이 길을 잃어, 낸 쪽은 확정된 거절을
            // «모름»으로 받는다. 웹의 `ping`(25초) · 잠금 하트비트의 `lock`이 로그아웃 · 제거 뒤 이 갈래로 온다
            // (`test/logout-realtime.test.ts`의 «그 연결이 ping 를 보내도»). 룸에서 뺐으므로 그동안 방송은 안 나간다.
            connection.closeWhenIdle(WS_CLOSE.revoked, '권한이 회수되었습니다')
            // **회수도 연결 종료다** — 「소프트 잠금」의 *"연결 종료 시 즉시 해제"*가 여기도 선다. 닫힘은 도는 프레임을
            // 기다리므로 그 사이 남의 화면에 잠금이 남지 않게 여기서 놓는다. 도는 것이 없으면 곧바로 닫혀 `close` 이벤트가
            // 같은 일을 하고, 그 자리에서 다시 놓아도 조용히 지난다.
            releaseLocksOf(app, connection)
            announce()
            return
          }

          switch (frame.type) {
            case 'ping':
              push({ type: 'pong' })
              return
            case 'patch':
              push(await handlePatchFrame(app, connection, frame))
              return
            case 'lock':
              // **자격을 보는 동안 멤버십이 바뀌었으면 잡지 않는다.** 위 await 사이에 강등이 커밋되고
              // `notifyMembershipChanged`가 먼저 놓으면(놓을 것이 아직 없다) 여기서 잡은 잠금은 **TTL 까지** 남는다 —
              // viewer 가 된 주인의 `unlock`은 editor 문턱에 걸린다. 세대는 **쥘 수 없게 된 변경에만** 오른다(`ws/notify.ts`의
              // `canHold`) — 그 판정과 답(`lock-denied`)은 `ws/lock.ts`의 표가 소유한다(끝나는 순간에 본다 —
              // 문서를 읽는 await 가 하나 더 있을 수 있다).
              // **`patch`는 여기서 거르지 않는다** — 커밋 순간에 권한을 다시 본다(`ws/patch.ts`).
              await lockLane.run(frame, { epoch, current })
              return
            case 'unlock':
              // 뒤에 받은 `lock`이 이미 끝났으면 이 `unlock`은 그것을 놓으면 안 된다(`ws/lock.ts`의 «뒤에 온 것이 이긴다»).
              if (current()) releaseLocksOf(app, connection)
              return
          }
        })()
          .catch((error: unknown) => {
            app.log.error({ err: error, projectId }, 'WS 프레임 처리 실패')
            // **낸 사람에게 답한다.** 예상 밖 예외에 아무것도 안 내면 그 편집의 응답이 영영 안
            // 오고, 클라이언트의 in-flight가 매달려 **다음 편집도 안 나간다**(펌프의 가드가 계속
            // 서 있다 — `apps/web`의 `edit-channel.ts` 머리말이 그 부류를 적었다). REST 경로는
            // 같은 예외에 500 봉투가 나가 복구가 돈다 — **두 진입점의 결말을 맞춘다.** DB 가 답하지 않았으면(COMMIT 답을 잃었을 수
            // 있다) REST 와 같은 503 «모름»이다(`http/error-handler.ts`의 `dbUnreachableFailure`) — 500 은 «커밋 전»이라는 약속이다.
            //
            // **`lock`도 답한다** — 서버는 아무것도 안 쥐었는데 답이 없으면 화면은 쥔 줄 안다. 거절과 같은 답을 낸다(`ws/lock.ts`의
            // 표 «DB 오류로 끝내지 못했다»). **이 프레임이 아직 마지막일 때만** — 뒤 프레임이 있으면 그것이 자기 답을 한다.
            // `unlock`·`ping`은 답하지 않는다: `unlock`은 답 대신 놓고(아래), `pong`이 없으면 화면이 연결을 닫는다(닫힘이 놓는다).
            //
            // **끝내지 못한 `unlock`은 놓는다**(이 프레임이 아직 마지막일 때만) — 놓기는 자격이 필요 없는 일이다(연결 종료도 자격 없이
            // 놓는다). 안 놓으면 화면이 놓은 자리의 배지가 TTL 까지 남아 남이 그 자리를 못 잡는다.
            if (frame.type === 'unlock') {
              if (current()) releaseLocksOf(app, connection)
              return
            }
            if (frame.type !== 'patch' && frame.type !== 'lock') return
            try {
              if (frame.type === 'patch') {
                push(patchErrorFrame(projectId, frame, error instanceof DbConnectionLostError ? dbUnreachableFailure(false) : internal()))
              } else if (current()) denyLock(app, connection, frame)
            } catch (pushError: unknown) {
              // 소켓이 이미 죽었으면 보낼 수 없다. 여기서 던지면 unhandled가 된다.
              //
              // **이 안쪽 `catch`를 지워도 죽는 케이스가 없다.** 그것이 도는 판은 *"핸들러가
              // 던졌고 **그 순간 소켓도 이미 죽어** `push`까지 던진다"*인데, 그 둘을 함께
              // 만드는 케이스가 없다. `connection.ts`의 `stopped`·`ackEdit`의 접기 실패와 같은
              // 부류다 — **지워도 되는 신호로 읽지 마라.** 지금 안 죽는 이유는 두 사건이 겹치는
              // 판을 아무도 안 만들기 때문이지 겹칠 수 없어서가 아니다.
              app.log.error({ err: pushError, projectId }, 'WS 실패 통지 실패')
            }
          })
          .finally(() => {
            inflight -= 1
            // 닫기로 한 연결의 마지막 답이 나갔다(`RoomConnection.closeWhenIdle`).
            if (closeWhenIdle !== null && inflight === 0) socket.close(closeWhenIdle.code, closeWhenIdle.reason)
          })
      })

      socket.on('close', () => {
        rooms.leave(projectId, connection.id)
        // **「소프트 잠금」의 *"WS 연결 종료 시 즉시 해제"*가 서는 자리다.** 룸에서 뺀 **뒤에** 놓는다 —
        // 그래야 나가는 연결이 자기 해제 프레임을 받지 않는다.
        releaseLocksOf(app, connection)
        announce()
      })
    })
  }
}
