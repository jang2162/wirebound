/**
 * 실시간 층의 조립 지점. `app.ts`가 이것 하나를 부른다.
 *
 * `app.realtime`으로 데코레이트해 두는 이유: 브로드캐스트를 내는 것은 **라우트 핸들러**이고
 * (`services/`는 전송을 모른다 — `broadcast.ts`의 머리말), 라우트 핸들러가 손에 쥐고 있는 것은 `app`이다.
 * 모듈 전역 싱글턴으로 두면 테스트가 앱을 여럿 세울 때 룸이 섞인다 — 이 저장소의 api
 * 스위트는 케이스마다 `buildApp`을 부른다.
 */
import websocketPlugin from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { ApiConfig } from '../config'
import { LOCK_SWEEP_MS, createLockStore, type LockStore } from '../lock/store'
import { createBroadcaster, type Broadcaster } from './broadcast'
import { releaseLocksOf } from './lock'
import { wsRoutes } from './routes'
import { InMemoryRoomRegistry, type RoomRegistry } from './rooms'

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Realtime
  }
}

export interface Realtime {
  rooms: RoomRegistry
  broadcast: Broadcaster
  /**
   * 설계서 「소프트 잠금」의 소프트 잠금 저장소. **룸과 나란히 앱에 걸린다** — 잠금을 확인하는 것은 라우트
   * 핸들러이고(`lock/check.ts`를 `ws/patch.ts`·`routes/pages.ts`가 부른다), 라우트 핸들러가
   * 손에 쥐고 있는 것은 `app`이다. 모듈 전역으로 두면 앱을 여럿 세우는 테스트가 잠금을 섞는다.
   */
  locks: LockStore
}

export type { Broadcaster } from './broadcast'
export type { RoomConnection, RoomRegistry } from './rooms'
export { InMemoryRoomRegistry } from './rooms'
export * from './protocol'

/**
 * **닫는 중에 닫힘 핸드셰이크에 답하지 않는 연결을 기다리는 한도.**
 *
 * `@fastify/websocket`의 기본 `preClose`는 연결마다 `close()`(닫힘 프레임)를 보내고, `ws`는 상대의 닫힘 프레임을 30s
 * (`closeTimeout`) 기다린 뒤에야 소켓을 끊는다 — 그동안 `app.close()`가 안 끝난다. 잠든 노트북 · 끊긴 망의 연결 하나가 종료를
 * 30s 붙잡고, 종료의 한도(`shutdown.ts`의 `SHUTDOWN_GRACE_MS`)와 같은 값이라 한도가 이겨 «도는 요청을 버리고» 종료 1 로 끝난다.
 * 잰 값(서버를 띄워 SIGTERM · 핸드셰이크 뒤 아무것도 안 읽는 연결 하나): 30 053ms · 종료 1. 답하는 연결 하나: 52ms.
 *
 * 답하는 연결은 한도 안에 닫힘을 주고받는다 — 기본 `preClose`를 바꾸지 않고, 그 뒤에 한도가 지나도 안 닫힌 연결만
 * `terminate()`한다. `app.close()` 앞에서 곧바로 끊지 않는 것은 답하는 연결의 닫힘 핸드셰이크를 지키려는 것이다.
 */
export const WS_CLOSE_GRACE_MS = 2_000

function cutUnansweredClosesAfter(app: FastifyInstance, graceMs: number): void {
  // `@fastify/websocket`이 제 `preClose`(연결마다 `close()`)를 먼저 걸었다 — 이 훅은 그 뒤에 돈다.
  app.addHook('preClose', async () => {
    for (const client of app.websocketServer.clients) {
      const cut = setTimeout(() => client.terminate(), graceMs)
      cut.unref()
      client.once('close', () => clearTimeout(cut))
    }
  })
}

/**
 * `@fastify/websocket`을 붙이고 룸·브로드캐스터를 만들어 `app.realtime`에 건다.
 *
 * **`app.register()`로 감싸지 않는다** — `registerAuthPlugin`과 같은 이유다. 감싸면
 * Fastify가 새 캡슐화 컨텍스트를 만들어, 최상위 `app`에 직접 등록되는 라우트들이
 * 데코레이터를 못 본다(`auth/plugin.ts` 머리말).
 *
 * `@fastify/websocket` 자체는 내부적으로 `fastify-plugin`을 쓰므로 최상위에 붙는다 —
 * 그래서 `wsRoutes`를 prefix 붙여 따로 등록해도 `{ websocket: true }`가 먹는다.
 */
export async function registerRealtime(app: FastifyInstance, config: ApiConfig): Promise<void> {
  await app.register(websocketPlugin)
  cutUnansweredClosesAfter(app, WS_CLOSE_GRACE_MS)

  const rooms = new InMemoryRoomRegistry()
  /**
   * **만료로 걷힌 잠금을 그 방에 알린다**(`lock/store.ts`의 «걷은 것은 알린다»). 한 번 훑는 동안 여럿이
   * 걷혀도 방마다 한 번 — 모았다가 다음 마이크로태스크에 알린다(걷는 도중에 목록을 다시 읽지 않는다).
   */
  const expiredIn = new Set<string>()
  const onExpired = (projectId: string): void => {
    if (expiredIn.size === 0) {
      queueMicrotask(() => {
        const projects = [...expiredIn]
        expiredIn.clear()
        for (const expired of projects) {
          void broadcast.announceLocks(expired).catch((error: unknown) => {
            app.log.error({ err: error, projectId: expired }, 'locks 알림 실패(만료)')
          })
        }
      })
    }
    expiredIn.add(projectId)
  }
  const locks = createLockStore(undefined, undefined, onExpired)
  // 권한을 못 잰 연결은 그 프레임만 건너뛴다(`broadcast.ts`의 `createBroadcaster` 머리말) — 한 줄 남긴다.
  const broadcast = createBroadcaster(
    app.db,
    rooms,
    locks,
    (error, connection) =>
      app.log.warn(
        { err: error, projectId: connection.projectId, connectionId: connection.id },
        '방송 — 권한을 재지 못해 한 연결을 건너뜀',
      ),
    // 방송이 회수한 연결 — 닫힘은 도는 프레임을 기다리므로 잠금 · 참가자는 여기서 거둔다(`broadcast.ts`의 «회수는 프레임 쪽 회수와 같은 순서다»).
    (connection) => {
      releaseLocksOf(app, connection)
      void broadcast.announcePresence(connection.projectId).catch((error: unknown) => {
        app.log.error({ err: error, projectId: connection.projectId }, 'presence 알림 실패(방송의 회수)')
      })
    },
  )
  app.decorate('realtime', { rooms, locks, broadcast })

  // **읽는 자가 없는 방도 만료가 걷혀야 알린다** — 스위퍼는 걷기만 한다(알림은 위 한 갈래). `unref` — 이것 때문에 프로세스가 남지 않는다.
  const sweeper = setInterval(() => locks.sweep(), LOCK_SWEEP_MS)
  sweeper.unref()
  app.addHook('onClose', async () => clearInterval(sweeper))

  await app.register(wsRoutes(config), { prefix: '/api/projects' })
}
