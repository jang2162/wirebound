import Fastify, { type FastifyInstance } from 'fastify'
import type { ApiConfig } from './config'
import { registerErrorHandler } from './http/error-handler'
import { healthRoutes } from './routes/health'

/**
 * 이 태스크에서 `BuildAppOptions`는 `{ config }`뿐이다.
 * 태스크 5가 여기에 `db`를 추가한다.
 */
export interface BuildAppOptions {
  config: ApiConfig
}

/**
 * Fastify 인스턴스를 조립해 반환한다.
 *
 * `listen`은 절대 호출하지 않는다 — 포트를 여는 것은 `main.ts`만의 책임이고,
 * 테스트는 `app.inject()`로 핸들러를 직접 호출하므로 포트가 필요 없다.
 * 이 함수가 만들지 않은 자원(DB 풀 등)은 닫지 않는다 — 그 자원의 생애주기는 호출자의 것이다.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options

  const app = Fastify({
    logger: {
      level: config.logLevel,
      // 세션 쿠키·인증 헤더는 절대 로그에 남기지 않는다.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization'],
        censor: '[REDACTED]',
      },
    },
  })

  registerErrorHandler(app)
  await app.register(healthRoutes)

  return app
}
