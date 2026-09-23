/**
 * 실시간 층의 조립 지점. `app.ts`가 이것 하나를 부른다.
 *
 * `app.realtime`으로 데코레이트해 두는 이유: 브로드캐스트를 내는 것은 **라우트 핸들러**이고
 * (P3-1 D3 — `services/`는 전송을 모른다), 라우트 핸들러가 손에 쥐고 있는 것은 `app`이다.
 * 모듈 전역 싱글턴으로 두면 테스트가 앱을 여럿 세울 때 룸이 섞인다 — 이 저장소의 api
 * 스위트는 케이스마다 `buildApp`을 부른다.
 */
import websocketPlugin from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { ApiConfig } from '../config'
import { LOCK_SWEEP_MS, createLockStore, type LockStore } from '../lock/store'
import { createBroadcaster, type Broadcaster } from './broadcast'
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
   * §7.2의 소프트 잠금 저장소. **룸과 나란히 앱에 걸린다** — 잠금을 확인하는 것은 라우트
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
  const broadcast = createBroadcaster(app.db, rooms, locks, (error, connection) =>
    app.log.warn({ err: error, projectId: connection.projectId, connectionId: connection.id }, '방송 — 권한을 재지 못해 한 연결을 건너뜀'),
  )
  app.decorate('realtime', { rooms, locks, broadcast })

  // **읽는 자가 없는 방도 만료가 걷혀야 알린다** — 스위퍼는 걷기만 한다(알림은 위 한 갈래). `unref` — 이것 때문에 프로세스가 남지 않는다.
  const sweeper = setInterval(() => locks.sweep(), LOCK_SWEEP_MS)
  sweeper.unref()
  app.addHook('onClose', async () => clearInterval(sweeper))

  await app.register(wsRoutes(config), { prefix: '/api/projects' })
}
