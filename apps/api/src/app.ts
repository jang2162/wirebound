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
import { pageRoutes } from './routes/pages'
import { projectRoutes } from './routes/projects'
import { revisionRoutes } from './routes/revisions'
import { themeRoutes } from './routes/themes'
import { treeRoutes } from './routes/tree'
import { ensureCatalog } from './schema-setup'
import { syncSystemThemes } from './services/system-themes'

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
   * 이 필드가 존재하는 유일한 이유는 `test/logging.test.ts`다. 전에는
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

  // validatePage(routes/pages.ts의 PUT .../schema 게이트)가 기대하는 컴포넌트
  // 레지스트리를 채운다. ensureCatalog는 멱등하다 — 이 스위트가 buildApp을
  // 수백 번 부르므로 필수다(schema-setup.ts 참고).
  ensureCatalog()

  // 시스템 테마를 코드에서 DB로 동기화한다(계획서 D4 — 코드가 진실, DB는 사본).
  //
  // **`main.ts`가 아니라 여기인 이유:** 이 뒤의 경로들이 그 행의 존재에 기댄다 —
  // 프로젝트를 만들면 기본 레이아웃이 생기고 그 `theme_id`가 시스템 `admin`을
  // 가리켜야 한다(`repos/projects.ts`). `main.ts`에만 두면 `buildApp`으로 앱을
  // 세우는 모든 경로(테스트 전부)에서 그 행이 없어 프로젝트 생성이 깨진다.
  //
  // 매 `buildApp`마다 도는 비용은 시스템 테마 수만큼의 upsert 한 문장씩이다(오늘 하나).
  // `ensureCatalog`가 멱등한 것과 같은 이유로 이것도 멱등해야 하고, `ON CONFLICT`가
  // 그것을 보장한다(`repos/themes.ts`의 `upsertSystemTheme`).
  await syncSystemThemes(db)

  app.decorate('db', db)
  registerErrorHandler(app)
  await registerAuthPlugin(app, config)
  registerProjectRoleDecorator(app)
  await app.register(authRoutes(config), { prefix: '/api/auth' })
  await app.register(projectRoutes(), { prefix: '/api/projects' })
  await app.register(memberRoutes(), { prefix: '/api/projects' })
  await app.register(menuRoutes(), { prefix: '/api/projects' })
  await app.register(pageRoutes(), { prefix: '/api/projects' })
  await app.register(treeRoutes(), { prefix: '/api/projects' })
  await app.register(revisionRoutes(), { prefix: '/api/projects' })
  await app.register(themeRoutes(), { prefix: '/api/projects' })
  await app.register(healthRoutes)

  return app
}
