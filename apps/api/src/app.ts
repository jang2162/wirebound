import type { Writable } from 'node:stream'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerAuthPlugin } from './auth/plugin'
import { registerProjectRoleDecorator } from './auth/roles'
import type { ApiConfig } from './config'
import type { DbHandle } from './db/tx'
import { registerErrorHandler } from './http/error-handler'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { memberRoutes } from './routes/members'
import { menuRoutes } from './routes/menu'
import { projectRoutes } from './routes/projects'

declare module 'fastify' {
  interface FastifyInstance {
    db: DbHandle
  }
}

export interface BuildAppOptions {
  db: DbHandle
  config: ApiConfig
  /**
   * 테스트 전용: pino가 쓸 목적지 스트림을 주입한다. 운영 코드(`main.ts`)는 절대
   * 채우지 않는다 — 생략하면 pino가 원래 목적지(표준출력)를 그대로 쓴다.
   *
   * 이 필드가 존재하는 유일한 이유는 `test/logging.test.ts`다. 태스크 7 전까지는
   * 그 테스트가 `buildApp`을 거치지 않고 로거 옵션·에러 핸들러·health 라우트를
   * 직접 조립해 로그를 캡처했다 — 그때는 실제 앱과의 차이가 문제되지 않았다(아무것도
   * 쿠키를 만지지 않았으므로). 이제 `buildApp`이 `@fastify/cookie`와 세션 인증 훅을
   * 등록해 매 요청 쿠키를 읽으므로, 로그 리다크션이 실제로 지켜야 할 파이프라인은
   * "직접 조립한 미니 앱"이 아니라 이 `buildApp`이다. `loggerStream`은 그 실제
   * 파이프라인을 그대로 쓰면서 로그만 메모리로 가로챌 수 있게 해 준다.
   */
  loggerStream?: Writable
}

/**
 * `buildLoggerOptions`가 반환하는 실제 옵션의 형태.
 * `FastifyServerOptions['logger']`는 `boolean | (...)` 유니온이라 스프레드가 안 되므로,
 * 회귀 테스트가 `stream`을 얹어 스프레드할 수 있도록 구체적인 객체 타입으로 좁혀 둔다.
 */
interface ApiLoggerOptions {
  level: ApiConfig['logLevel']
  redact: { paths: string[]; censor: string }
}

/**
 * Fastify pino 로거 옵션을 만든다. `buildApp`과 로그 리다크션 회귀 테스트
 * (`test/logging.test.ts`)가 이 함수 하나를 함께 쓴다 — 테스트가 실제 앱과
 * 다른 레시피를 검증하는 일이 없도록 하기 위해서다.
 *
 * **오늘 시점에 비밀이 로그에 남지 않는 실제 이유는 이 `redact`가 아니다.** Fastify의
 * 기본 `req` 시리얼라이저(`fastify/lib/logger-pino.js`)는 method·url·version·host·
 * remoteAddress·remotePort만 골라 담고 `headers`는 애초에 로그 객체에 넣지 않는다.
 * pino는 시리얼라이저를 먼저 돌리고 그 결과에 redact를 적용하므로, `req.headers.cookie`
 * 경로는 지금 아무 것도 가리지 않는다 — 애초에 그 경로에 값이 없기 때문이다.
 *
 * 그래도 이 `redact`를 남겨 두는 이유는 방어선(defense-in-depth)이다: 나중에 누군가
 * `req`용 커스텀 시리얼라이저를 추가해 `headers`를 로그에 포함시키는 순간, 그 시리얼라이저가
 * 헤더를 `req.headers.*` 아래 유지하는 한 이 규칙이 즉시 실제로 값을 가리기 시작한다.
 * 그런 시리얼라이저를 추가하는 사람은 헤더를 `req.headers.*` 아래 두거나, 그게 아니면
 * 이 paths를 새 위치에 맞게 넓혀야 한다. `test/logging.test.ts`는 "세션 토큰이 로그에
 * 나타나지 않는다"는 성질 자체를 고정해 두므로, 이 계약이 깨지면 그 테스트가 실패한다.
 */
export function buildLoggerOptions(config: ApiConfig): ApiLoggerOptions {
  return {
    level: config.logLevel,
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization'],
      censor: '[REDACTED]',
    },
  }
}

/**
 * Fastify 인스턴스를 조립해 반환한다.
 *
 * `listen`은 절대 호출하지 않는다 — 포트를 여는 것은 `main.ts`만의 책임이고,
 * 테스트는 `app.inject()`로 핸들러를 직접 호출하므로 포트가 필요 없다.
 * 이 함수가 만들지 않은 자원(DB 풀 등)은 닫지 않는다 — 그 자원의 생애주기는 호출자의 것이다.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { db, config, loggerStream } = options

  const loggerOptions = buildLoggerOptions(config)
  const app = Fastify({
    logger: loggerStream ? { ...loggerOptions, stream: loggerStream } : loggerOptions,
  })

  app.decorate('db', db)
  registerErrorHandler(app)
  await registerAuthPlugin(app, config)
  registerProjectRoleDecorator(app)
  await app.register(authRoutes(config), { prefix: '/api/auth' })
  await app.register(projectRoutes(), { prefix: '/api/projects' })
  await app.register(memberRoutes(), { prefix: '/api/projects' })
  await app.register(menuRoutes(), { prefix: '/api/projects' })
  await app.register(healthRoutes)

  return app
}
