/**
 * WebSocket 핸드셰이크와 룸 참가·이탈. **`GET /api/projects/:projectId/ws`** 하나다.
 *
 * # 인증은 REST와 같은 경로다 (P3-1 D5 · §10)
 *
 * *"WebSocket 핸드셰이크도 같은 쿠키를 쓰므로 REST와 WS의 인증 경로가 하나다. 권한 체크는
 * REST와 WebSocket이 **동일한 가드 함수**를 쓴다."*
 *
 * 이 파일은 그 문장을 **두 벌을 만들지 않는 방식으로** 지킨다:
 *
 * | 층 | 무엇이 하나인가 |
 * |---|---|
 * | 쿠키 → 사용자 | `auth/plugin.ts`의 `onRequest` 훅. **업그레이드 요청에도 그대로 돈다** — 재서 알았다 |
 * | 프로젝트 권한 | `projectGuard('viewer')`. `auth/roles.ts`가 *"P3의 WebSocket은 `requireProjectRole`을 직접 재사용해 자신만의 껍데기를 만든다"*고 예상했지만, **껍데기가 필요 없었다**(아래) |
 *
 * **`projectGuard`를 그대로 preHandler로 쓸 수 있다** — `@fastify/websocket`은 업그레이드
 * 요청을 평범한 라우트로 태우고 훅을 전부 돌린 뒤에야 소켓을 넘긴다. 가드가 던지면
 * 업그레이드가 성립하지 않고 클라이언트는 101 대신 HTTP 오류를 본다. 그래서 §10의
 * *"룸 참가 시 한 번"*이 REST와 **글자 그대로 같은 함수**로 지켜진다.
 * (`test/ws-auth.test.ts`가 미로그인·비멤버·뷰어 셋을 각각 잰다.)
 *
 * # 참가 이후의 권한 — 확인 지점이 둘이다
 *
 * §10은 *"룸 참가 시 한 번, 각 patch 수신 시 한 번"*이라고 적었는데 **이 슬라이스에는 patch
 * 수신이 없다**(D6 — 클라이언트는 받기만 한다). 그래서 회수를 실행하는 자리를 둘로 둔다:
 *
 * 1. **프레임을 받을 때마다** — 이 파일. 오늘 그 프레임은 `ping` 하나다. §10의 *"각 patch
 *    수신 시"*가 이 슬라이스에서 설 수 있는 가장 가까운 자리이고, P3-2가 patch를 얹으면
 *    같은 줄이 그것을 덮는다.
 * 2. **보낼 때마다** — `broadcast.ts`. 아무것도 안 보내는 연결이 있으므로 1만으로는
 *    부족하다. 그쪽 머리말에 *"즉시"*가 어디까지인지 적어 두었다.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { projectGuard } from '../auth/roles'
import { hashSessionToken } from '../auth/session'
import type { ApiConfig } from '../config'
import { unauthenticated } from '../errors'
import { parseParams } from '../http/parse'
import { z } from 'zod'
import { WS_CLOSE, parseClientFrame, type ServerFrame } from './protocol'
import type { RoomConnection } from './rooms'

const WsParams = z.object({ projectId: z.uuid() })

/**
 * 연결 id를 매기는 모듈 스코프 카운터. **`crypto.randomUUID`가 아니다** — `db/tx.ts`의
 * SAVEPOINT 이름이 같은 이유로 카운터를 쓴다: 프로세스 안에서 절대 겹치지 않고, 실패를
 * 재현할 때 값이 매번 바뀌지 않아 로그를 읽을 수 있다.
 *
 * **프로세스 안에서만 유일하다**(`rooms.ts`의 단일 인스턴스 가정 표 넷째 줄).
 */
let connectionCounter = 0

function nextConnectionId(): string {
  connectionCounter += 1
  return `wsc_${connectionCounter}`
}

export function wsRoutes(config: ApiConfig): FastifyPluginAsync {
  return async (app: FastifyInstance) => {
    app.get('/:projectId/ws', { websocket: true, preHandler: projectGuard('viewer') }, (socket, request) => {
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

      const connection: RoomConnection = {
        id: nextConnectionId(),
        projectId,
        userId: currentUser.id,
        userName: currentUser.name,
        sessionId: hashSessionToken(token),
        send: (payload) => socket.send(payload),
        close: (code, reason) => socket.close(code, reason),
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

      socket.on('message', (raw: unknown) => {
        void (async () => {
          const frame = parseClientFrame(String(raw))
          if (!frame) {
            socket.close(WS_CLOSE.badFrame, '읽을 수 없는 프레임입니다')
            return
          }

          // 확인 지점 1 (머리말). 오늘 프레임은 `ping` 하나뿐이지만 검사는 프레임 종류와
          // 무관하게 **먼저** 돈다 — P3-2가 patch를 더할 때 이 줄을 다시 쓰지 않게 한다.
          if (!(await broadcast.stillAllowed(connection))) {
            rooms.leave(projectId, connection.id)
            socket.close(WS_CLOSE.revoked, '권한이 회수되었습니다')
            announce()
            return
          }

          push({ type: 'pong' })
        })().catch((error: unknown) => {
          app.log.error({ err: error, projectId }, 'WS 프레임 처리 실패')
        })
      })

      socket.on('close', () => {
        rooms.leave(projectId, connection.id)
        announce()
      })
    })
  }
}
