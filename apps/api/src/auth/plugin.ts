/**
 * 쿠키 한 장을 `request.currentUser`로 바꾸는 Fastify 플러그인.
 *
 * 라우트를 전혀 모른다 — 로그인/로그아웃 라우트(다음 태스크)가 이 위에 얹힌다.
 * P3의 WebSocket 핸드셰이크도 같은 쿠키로 인증해야 하므로(설계 §10), 세션 조회는
 * 캐시 없이 매 요청 DB를 direct hit한다 — `resolveSession`이 그 자체로 이미 그렇다.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fastifyCookie, { type CookieSerializeOptions } from '@fastify/cookie'
import type { ApiConfig } from '../config'
import { unauthenticated } from '../errors'
import { resolveSession, type SessionUser } from './session'

declare module 'fastify' {
  interface FastifyRequest {
    /** 로그인한 사용자. 쿠키가 없거나, 세션이 없거나 만료됐으면 `null`이다. */
    currentUser: SessionUser | null
  }

  interface FastifyInstance {
    /** `currentUser`가 없으면 401(`unauthenticated`)을 던지는 preHandler. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * 세션 쿠키를 만들 때 라우트가 옵션을 직접 조립하지 않도록 한곳에 모아 둔다.
 * `secure`는 `NODE_ENV=production`일 때만 켠다 — 로컬 개발(http)에서까지 켜면
 * 브라우저가 쿠키를 아예 보내지 않아 로그인 직후 바로 로그아웃된 것처럼 보인다.
 */
export function sessionCookieOptions(config: ApiConfig, expiresAt: Date): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    expires: expiresAt,
  }
}

/**
 * 인증 플러그인을 `app`에 직접 등록한다. `app.register()`를 거치지 않고 받은
 * 인스턴스에 바로 `decorate`/`addHook`을 건다 — `registerErrorHandler`와 같은 방식이다.
 * `app.register()`로 감쌌다면 Fastify가 새 캡슐화 컨텍스트를 만들어, 이후 `app.ts`가
 * 최상위 `app`에 직접 등록하는 라우트들이 이 훅과 데코레이터를 못 볼 뻔했다
 * (`fastify-plugin`으로 캡슐화를 깨는 방법도 있지만, 그 패키지는 `apps/api`의
 * 직접 의존성이 아니라 끌어오지 않는다).
 *
 * 순서가 중요하다: `app.db`가 이미 `decorate`돼 있어야 한다(`app.ts`가 그 순서를 지킨다).
 */
export async function registerAuthPlugin(app: FastifyInstance, config: ApiConfig): Promise<void> {
  await app.register(fastifyCookie)

  app.decorateRequest('currentUser', null)

  // 모든 요청(공개 라우트 포함)에서 돈다. 절대 던지지 않는다 — 여기서 던지면
  // `requireAuth`가 없는 공개 라우트까지 죽는다. 쿠키가 없거나, 형식이 이상하거나,
  // 세션이 없거나 만료됐으면 조용히 `currentUser`를 `null`로 둔다.
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[config.sessionCookieName]
    if (!token) {
      request.currentUser = null
      return
    }

    try {
      request.currentUser = await resolveSession(app.db, token)
    } catch {
      request.currentUser = null
    }
  })

  app.decorate('requireAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.currentUser) {
      throw unauthenticated()
    }
  })
}
