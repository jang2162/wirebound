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
  app.decorate('realtime', { rooms, broadcast: createBroadcaster(app.db, rooms) })

  await app.register(wsRoutes(config), { prefix: '/api/projects' })
}
