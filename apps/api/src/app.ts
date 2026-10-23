import type { Writable } from 'node:stream'
import Fastify, { type FastifyInstance } from 'fastify'
import { createLoginLimiter, type LoginLimiter } from './auth/login-limit'
import { registerAuthPlugin } from './auth/plugin'
import { registerProjectRoleDecorator } from './auth/roles'
import type { ApiConfig } from './config'
import type { DbHandle } from './db/tx'
import { registerErrorHandler } from './http/error-handler'
import { logDestination } from './log-destination'
import { adminThemeRoutes } from './routes/admin-themes'
import { authRoutes } from './routes/auth'
import { commentRoutes } from './routes/comments'
import { exportRoutes } from './routes/export'
import { healthRoutes } from './routes/health'
import { memberRoutes } from './routes/members'
import { moduleRoutes } from './routes/modules'
import { personalModuleRoutes } from './routes/personal-modules'
import { assetRoutes, meAssetRoutes } from './routes/assets'
import { menuRoutes } from './routes/menu'
import { pageRoutes } from './routes/pages'
import { projectThemeRoutes } from './routes/project-theme'
import { projectRoutes } from './routes/projects'
import { revisionRoutes } from './routes/revisions'
import { snapshotRoutes } from './routes/snapshots'
import { themePackageRoutes } from './routes/theme-packages'
import { myTokenRoutes, tokenRoutes } from './routes/tokens'
import { treeRoutes } from './routes/tree'
import { ensureCatalog } from './schema-setup'
import type { ScreenRenderer } from './services/screen-render'
import { readExportRuntime } from './services/export-runtime'
import { createLateCommitWatch, type LateCommitWatch } from './services/lost-commit'
import { TOO_DEEP_MESSAGE, jsonNestingExceeds } from './services/nesting'
import { badRequest } from './errors'
import { backfillProjectThemes, seedSystemThemes } from './services/system-themes'
import { withTransaction } from './db/tx'
import { registerRealtime } from './ws'

declare module 'fastify' {
  interface FastifyInstance {
    db: DbHandle
    /**
     * 이 앱의 로그인 시도 기록 — 앱마다 하나다(`auth/login-limit.ts` 머리말 «저장소는 프로세스 메모리다»). 로그인 라우트가 쓰고,
     * 막힘을 푸는 입구(`auth/unlock-socket.ts` — `main.ts` 가 연다)가 푼다.
     */
    loginLimiter: LoginLimiter
    /** 이 앱의 늦은 커밋 지켜보기 — 트리 쓰기가 답을 잃은 COMMIT 을 응답 뒤에도 본다(`services/lost-commit.ts`의 `createLateCommitWatch`). 앱을 닫을 때 걷는다. */
    lateCommits: LateCommitWatch
  }
}

export interface BuildAppOptions {
  db: DbHandle
  config: ApiConfig
  /**
   * 테스트 전용: pino가 쓸 목적지 스트림을 주입한다. 운영 코드(`main.ts`)는 절대
   * 채우지 않는다 — 생략하면 표준출력으로 가는 `logDestination()`을 쓴다(`log-destination.ts`).
   *
   * 이 필드가 존재하는 유일한 이유는 `test/logging.test.ts`다. `buildApp`이
   * `@fastify/cookie`와 세션 인증 훅을 등록해 매 요청 쿠키를 읽으므로, 로그 리다크션이
   * 실제로 지켜야 할 파이프라인은 로거 옵션·에러 핸들러·라우트를 "직접 조립한 미니 앱"이
   * 아니라 이 `buildApp`이다 — 미니 앱으로 재면 쿠키를 만지는 층이 빠져 실제 앱과의
   * 차이를 못 본다. `loggerStream`은 그 실제
   * 파이프라인을 그대로 쓰면서 로그만 메모리로 가로챌 수 있게 해 준다.
   */
  loggerStream?: Writable
  /**
   * 테스트 전용: 등록되는 라우트를 하나도 빠짐없이 흘려보낸다. 운영 코드(`main.ts`)는
   * 절대 채우지 않는다 — `loggerStream`과 같은 부류의 이음매다.
   *
   * **왜 이것이 없으면 잴 수 없는가.** 인구조사(`test/token-route-census.test.ts` 등)는
   * *"`:projectId`가 없는 라우트 중 인증이 필요한 것 **전부**가 토큰만 든 요청에 401을
   * 낸다"*를 주장한다. 그 명제의 **분모**는 등록된 라우트 전부이고, 그것을 손으로 적으면
   * 앞으로 생길 프로젝트 밖 라우트가 **조용히 빠진다** — 손으로 적은 권한 매트릭스가
   * 새 라우트를 놓치는 것과 같은 꼴이다.
   *
   * **Fastify가 아는 목록을 쓴다.** `printRoutes()`는 라딕스 트리를 사람이 읽는 글자로
   * 그리는 것이라(`/members` 와 `/modules` 가 공통 접두 `/m` 아래로 갈라지는 식으로 마디가 쪼개진다) 그것을
   * 되파싱하면 자가 대상보다 약해진다. `onRoute` 훅은 Fastify가 라우트를 등록할 때마다
   * 부르므로 **경로 패턴과 preHandler 목록을 그대로** 준다.
   *
   * **`buildApp` 밖에서는 걸 수 없다.** 훅은 자기보다 **뒤에** 등록된 라우트만 보는데
   * 라우트 등록은 전부 이 함수 안에서 끝난다.
   */
  onRoute?: (route: RegisteredRoute) => void
  /**
   * PPTX에 실을 화면 이미지를 그리는 자.
   *
   * **위의 둘과 방향이 반대다.** `loggerStream`·`onRoute`는 생략이 운영이고 채우는 것이
   * 테스트인데, 이것은 **채우는 것이 운영**이다 — 생략하면 pptx가 이미지 없이 나가고
   * `screenless`가 그 사실을 말한다.
   *
   * **`buildApp`이 스스로 만들지 않는다.** 만들면 `pnpm test`의 케이스 전부가 진짜
   * 브라우저를 띄우게 된다(`services/screen-render.ts`의 머리말). 운영에서 이것을 채우는 자리는 `main.ts` 하나이고
   * `test/screen-renderer-census.test.ts`가 그것을 소스에서 센다.
   */
  screenRenderer?: ScreenRenderer
  /**
   * 테스트 전용: 내보내기 런타임(`runtime.js`)을 읽을 자리. 운영 코드(`main.ts`)는 채우지 않는다 — 생략하면 `@wirebound/exporter` 가 낸
   * 파일이다(`services/export-runtime.ts`). 이 필드가 있는 유일한 이유는 «없으면 기동이 멈춘다» 를 재는 `test/export-runtime.test.ts` 다.
   */
  exportRuntimePath?: string
}

/** `BuildAppOptions.onRoute`가 흘리는 한 줄. 인구조사가 쓰는 것만 담는다. */
export interface RegisteredRoute {
  method: string
  /** prefix가 붙은 최종 패턴(`/api/projects/:projectId/pages`). */
  url: string
  /** 이 라우트에 걸린 preHandler들. 인증이 필요한지를 여기서 본다. */
  preHandlers: unknown[]
  /**
   * 이 라우트에 **라우트 옵션으로** 걸린 훅 중 `preHandler`보다 먼저 도는 단계의 것 — 값 그대로다
   * (`test/pre-guard-hook-census.test.ts`가 허용 목록과 **참조로** 견준다). **플러그인의 `addHook`은 안 든다** —
   * Fastify 는 그것을 이 훅이 불린 뒤(`preReady`)에 라우트 옵션과 합친다.
   */
  beforePreHandler: { onRequest: unknown[]; preParsing: unknown[]; preValidation: unknown[] }
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
 * **지금 비밀이 로그에 남지 않는 실제 이유는 이 `redact`가 아니다.** Fastify의
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
 * **닫는 중에 나가는 답은 그 연결도 닫는다**(`Connection: close`) — 도는 요청은 끝까지 답한다.
 *
 * `app.close()`가 닫는 것은 **그때 쉬고 있는** keep-alive 연결뿐이다(Node 의 `server.close()`). 닫기 **전에** 들어와
 * 닫는 중에 답한 요청의 연결은 답한 뒤 keep-alive 로 남아, Fastify 의 `keepAliveTimeout`(72s)이 끝낼 때까지 `close()`가
 * 안 끝난다. 잰 값(api 테스트 하네스 · 진짜 포트 · keep-alive 에이전트 · 내보내기 하나를 보내고 5ms 뒤 `close()`): 요청은
 * 0.2s 에 200 · `close()` **73.2s**. 이것이 있으면 같은 절차의 `close()`가 요청이 끝나는 대로 끝난다
 * (`test/close-while-inflight.test.ts`).
 *
 * **`forceCloseConnections: true`를 고르지 않은 이유:** 그것은 도는 요청의 연결까지 끊는다 — 36MB 내보내기를 받던
 * 사람이 반쯤 받은 파일을 얻는다. Fastify 가 닫는 중에 **새로** 들어온 요청에 붙이는 것도 같은 머리다(그 뒤에 503).
 *
 * 누가 이 값을 먹나 — **api 에 keep-alive 로 바로 붙어 답을 받은 뒤 그 연결로 더 보내지 않는 클라이언트**(같은 연결로 또
 * 보내면 Fastify 가 닫는 중이라 503 + `Connection: close`로 끊는다). 신호를 받은 서버는 `app.close()`를 기다린 뒤
 * 끝나고(`shutdown.ts`), `pnpm dev`(tsx watch)는 다시 띄울 때 앞 프로세스를 5s 기다린 뒤 SIGKILL 한다. 잰 값(tsx watch · 그런 클라이언트가
 * pptx 미리보기를 받는 중에 소스를 건드림): 새 서버가 답하기까지 5.7s · «Process didn't exit in 5s. Force killing...»(DB 풀을
 * 닫지 못하고 죽는다) → 이것이 있으면 1.0s. 웹 → api 는 이 값을 안 먹는다 — Vite 프록시(http-proxy 의 `agent: false`)가
 * 요청마다 `Connection: close`를 싣는다.
 */
function closeConnectionsAfterReplyWhileClosing(app: FastifyInstance): void {
  let closing = false
  app.addHook('preClose', async () => {
    closing = true
  })
  app.addHook('onSend', async (request, reply) => {
    if (closing && request.raw.httpVersionMajor < 2) reply.header('connection', 'close')
  })
}

/**
 * Fastify 인스턴스를 조립해 반환한다.
 *
 * `listen`은 절대 호출하지 않는다 — 포트를 여는 것은 `main.ts`만의 책임이고,
 * 테스트는 `app.inject()`로 핸들러를 직접 호출하므로 포트가 필요 없다.
 * 이 함수가 만들지 않은 자원(DB 풀 등)은 닫지 않는다 — 그 자원의 생애주기는 호출자의 것이다.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { db, config, loggerStream, onRoute, screenRenderer } = options

  const loggerOptions = buildLoggerOptions(config)
  const app = Fastify({
    // 쓰기 오류(닫힌 터미널의 EIO)에 멈추지 않는 목적지를 건다 — 그 까닭은 `log-destination.ts`의 머리말.
    logger: { ...loggerOptions, stream: loggerStream ?? logDestination() },
    // 믿는 앞단이 없으면 `request.ip`는 소켓 주소다 — 로그인 제한의 주소 키(`auth/login-limit.ts`)가 읽는다.
    trustProxy: config.trustProxy.length > 0 ? config.trustProxy : false,
  })

  // validatePage(routes/pages.ts의 PUT .../schema 게이트)가 기대하는 컴포넌트
  // 레지스트리를 채운다. ensureCatalog는 멱등하다 — 이 스위트가 buildApp을
  // 수백 번 부르므로 필수다(schema-setup.ts 참고).
  ensureCatalog()

  // 내보내기 런타임을 읽어 쥔다 — 없으면 기동을 멈춘다(`services/export-runtime.ts` 의 머리말). 내보낸 번들의 목업을 브라우저가 이것으로 그린다.
  readExportRuntime(options.exportRuntimePath)

  // 시스템 테마를 넣고 테마가 빈 프로젝트를 채운다 — 산출물이 없거나 이미 올린 판의 내용이 바뀌었으면 던져 기동을 멈춘다
  // (`services/system-themes.ts` 의 머리말). 한 트랜잭션이다 — 여러 판 가운데 뒤의 것이 걸리면 앞의 것도 안 남는다.
  await withTransaction(db, async (trx) => {
    await seedSystemThemes(trx, config.systemThemesDir)
    await backfillProjectThemes(trx)
  })

  // **라우트 등록보다 앞이어야 한다** — `onRoute` 훅은 자기보다 뒤에 등록된 것만 본다.
  if (onRoute) {
    const list = (hook: unknown): unknown[] => (hook === undefined ? [] : Array.isArray(hook) ? [...hook] : [hook])
    app.addHook('onRoute', (route) => {
      onRoute({
        method: Array.isArray(route.method) ? route.method.join(',') : route.method,
        url: route.url,
        preHandlers: list(route.preHandler),
        beforePreHandler: {
          onRequest: list(route.onRequest),
          preParsing: list(route.preParsing),
          preValidation: list(route.preValidation),
        },
      })
    })
  }

  app.decorate('db', db)
  app.decorate('loginLimiter', createLoginLimiter())
  app.decorate('lateCommits', createLateCommitWatch(db))
  app.addHook('onClose', async () => app.lateCommits.stop())
  closeConnectionsAfterReplyWhileClosing(app)
  registerErrorHandler(app)
  // **본문의 중첩이 한도를 넘으면 라우트에 닿기 전에 400 이다**(`services/nesting.ts`) — PUT · 가져오기 · 모듈 · REST ops 가 모두 같은 자리를 지난다. 파일(Buffer)은 안 본다.
  app.addHook('preValidation', async (request) => {
    const body: unknown = request.body
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body) && jsonNestingExceeds(body)) throw badRequest(TOO_DEEP_MESSAGE)
  })
  await registerAuthPlugin(app, config)
  registerProjectRoleDecorator(app)
  // 실시간 층. **인증·역할 데코레이터 뒤여야 한다** — WS 라우트가
  // `projectGuard`를 preHandler로 달고, 그 가드가 `request.currentUser`·
  // `request.projectRole`을 쓴다. 라우트보다 **앞**인 것은 `app.realtime`을
  // 데코레이트해야 라우트 핸들러가 그것으로 알릴 수 있기 때문이다.
  await registerRealtime(app, config)
  await app.register(authRoutes(config, app.loginLimiter), { prefix: '/api/auth' })
  await app.register(projectRoutes(), { prefix: '/api/projects' })
  await app.register(memberRoutes(), { prefix: '/api/projects' })
  await app.register(menuRoutes(), { prefix: '/api/projects' })
  await app.register(pageRoutes(), { prefix: '/api/projects' })
  await app.register(treeRoutes(), { prefix: '/api/projects' })
  await app.register(revisionRoutes(), { prefix: '/api/projects' })
  // 코멘트도 페이지 아래에 산다(`/:projectId/pages/:pageId/comments`) — 파일은 분리하되
  // URL 네임스페이스는 `pageRoutes`와 공유한다.
  await app.register(commentRoutes(), { prefix: '/api/projects' })
  // 스냅샷도 프로젝트 아래에 산다(`/:projectId/snapshots`). **인자 없이 부른다** — 그
  // 팩토리의 `captureHooks`는 테스트 전용 이음매다(`routes/snapshots.ts`의 머리말).
  await app.register(snapshotRoutes(), { prefix: '/api/projects' })
  // 모듈도 프로젝트 아래에 산다(`/:projectId/modules`) — 모듈은 프로젝트가 소유한다(설계서 「모듈」). 개인 모듈은 사람이 소유해 프로젝트
  // 밖에 산다(`/api/me/modules` — `routes/personal-modules.ts`). 세션으로만 부른다.
  await app.register(moduleRoutes(), { prefix: '/api/projects' })
  await app.register(personalModuleRoutes(), { prefix: '/api/me' })
  // 그림 — 프로젝트의 그림(올리기 · 목록 · 읽기 · 가져오기)과 사람의 몫(`routes/assets.ts` 머리말).
  await app.register(assetRoutes(config.assetLimits), { prefix: '/api/projects' })
  await app.register(meAssetRoutes(config.assetLimits), { prefix: '/api/me' })
  // 내보내기도 프로젝트 아래에 산다(`/:projectId/export`). **URL에 파일 이름이 없다** —
  // 파일 이름은 안정한 열쇠가 아니라 페이지를 하나 더하면 번호가 밀린다.
  await app.register(exportRoutes({ screenRenderer, renderLimit: config.exportRenderLimit }), { prefix: '/api/projects' })
  // API 토큰도 프로젝트 아래에 산다(`/:projectId/tokens`) — 설계서 「권한 모델」이 *"토큰 스코프는
  // 프로젝트 단위"*라고 적었으므로 그 밖에 둘 자리가 없다. 발급은 viewer 이상 누구나이고,
  // 이 셋은 **세션으로만** 부를 수 있다 — 근거는 `routes/tokens.ts`의 머리말에 있다.
  await app.register(tokenRoutes(), { prefix: '/api/projects' })
  // 프로젝트가 고정한 테마(`/:projectId/theme`) — 토큰으로도 닿는다(CLI · MCP 의 lint 가 manifest 를 읽는다).
  await app.register(projectThemeRoutes(), { prefix: '/api/projects' })
  // **로그인한 사람의 토큰 전부**는 프로젝트 밖(`/api/auth/tokens`)이다 — 멤버가 아닌 프로젝트의 토큰도 거둬야 한다
  // (`routes/tokens.ts`의 «내 토큰은 프로젝트를 가로지른다»).
  await app.register(myTokenRoutes(), { prefix: '/api/auth' })
  // 인스턴스 관리자의 테마 패키지 동작(`/api/admin/theme-packages` · `/api/admin/theme-template.zip`) — 세션 전용이고 판정은 핸들러
  // 안이다(`routes/admin-themes.ts`의 머리말).
  await app.register(adminThemeRoutes(config), { prefix: '/api/admin' })
  // 테마 패키지 읽기 — 로그인한 사람 누구나 · 세션 전용(`routes/theme-packages.ts`의 머리말).
  await app.register(themePackageRoutes(), { prefix: '/api/theme-packages' })
  await app.register(healthRoutes)

  return app
}
