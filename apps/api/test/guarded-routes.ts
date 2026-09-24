import type { RegisteredRoute } from '../src/app'
import { projectGuard } from '../src/auth/roles'
import type { ProjectRole } from '../src/db/types'
import { withApi } from './helpers'

/**
 * **`projectGuard` 가 걸린 라우트와 그 최소 역할 — 값으로 센다.** `permission-matrix.test.ts` 와
 * `restore-lock-census.test.ts` 의 분모다.
 *
 * **라우트는 Fastify 가 등록한 값이다**(`buildApp` 의 `onRoute` 이음매). 소스 글자를 정규식으로 세면
 * `preHandler: [projectGuard('editor')]`(배열) · `preHandler: guards`(변수) · `app.route({…})` · 하위 디렉터리의
 * 라우트를 조용히 못 본다 — 그 라우트는 표에 없어도 아무것도 안 죽는다.
 *
 * **최소 역할은 가드를 돌려서 읽는다.** `projectGuard(min)` 은 부를 때마다 새 클로저라 `min` 을 밖에 드러내지
 * 않는다. 그래서 가드를 탐침 요청으로 부른다 — 가드는 `request.projectGuardMin` 에 `min` 을 남긴 뒤 DB 를 부르고,
 * 탐침의 DB 는 닿는 순간 던진다.
 *
 * **탐침하는 것은 `projectGuard` 가 만든 함수뿐이다** — 클로저는 저마다 새것이어도 원문은 하나라 원문으로 알아본다.
 * 감싼 함수는 요청(본문 · 토큰 · 메서드)에 따라 다른 `min` 을 고를 수 있는데 탐침은 그 한 갈래만 지난다. 그 값을
 * 최소 역할로 읽으면 다른 갈래의 완화가 표와 맞아 지나간다(`request.tokenProjectId ? 'viewer' : 'editor'` 를 고르는
 * 가드는 탐침에 `editor` 를 남기고, 매트릭스는 세션으로만 쳐서 초록이다).
 *
 * **못 알아보는 가드는 분모에서 빠지는 대신 죽게 한다** — `:projectId` 가 든 라우트에서 가드를 못 찾으면
 * `unguardedProjectRoutes` 에 든다(부르는 쪽이 `[]` 를 단언한다). 감싼 가드 · 훅(`onRequest` · `addHook`)으로 단
 * 가드가 그렇다. **`:projectId` 가 없는 경로는 이 검사를 안 지난다** — `projectGuard` 는 그 경로에서 늘 400 이다.
 *
 * **`HEAD` 는 Fastify 가 `GET` 마다 저절로 더한 짝만 뺀다** — 그 짝은 `GET` 의 옵션을 복사해 등록되므로 같은 URL 의
 * `GET` 과 preHandler 가 **참조까지** 같다(`autoHead`). `app.head(…)` 로 명시한 라우트는 가드가 새 클로저라 남는다.
 * 명시한 `HEAD` 가 `GET` 과 같은 가드 값(변수 하나)을 나눠 쓰면 짝으로 읽혀 빠진다 — 최소 역할이 `GET` 과 같다.
 */
export interface GuardedRoute {
  method: string
  /** prefix 가 붙은 최종 패턴(`/api/projects/:projectId/pages`). */
  url: string
  min: ProjectRole
}

export interface RouteCensus {
  guarded: GuardedRoute[]
  /** `:projectId` 가 들었는데 가드를 못 찾은 라우트 — `METHOD /api/…`. */
  unguardedProjectRoutes: string[]
}

const PROBE_ID = '00000000-0000-4000-8000-000000000000'

/** `projectGuard` 가 만든 함수의 원문(머리말 «탐침하는 것은»). */
const GUARD_SOURCE = String(projectGuard('viewer'))

/** 닿는 순간 던지는 DB — 탐침이 실제 판정까지 가지 않게 한다. */
const UNREACHABLE_DB = new Proxy(
  {},
  {
    get() {
      throw new Error('탐침 요청은 DB 에 닿지 않는다')
    },
  },
)

export async function guardMinOf(preHandlers: unknown[]): Promise<ProjectRole | undefined> {
  for (const handler of preHandlers) {
    if (typeof handler !== 'function' || String(handler) !== GUARD_SOURCE) continue
    const request = {
      params: { projectId: PROBE_ID },
      headers: {},
      currentUser: { id: PROBE_ID },
      tokenProjectId: null,
      projectGuardMin: null as ProjectRole | null,
      server: { db: UNREACHABLE_DB },
    }
    try {
      await (handler as (request: unknown, reply: unknown) => unknown)(request, {})
    } catch {
      // 가드는 `min` 을 남긴 뒤 DB 에서 던진다 — 던진 것 자체는 판정이 아니다.
    }
    if (request.projectGuardMin !== null) return request.projectGuardMin
  }
  return undefined
}

/** Fastify 가 `route` 의 `GET` 짝으로 저절로 더한 `HEAD` 인가(머리말의 `HEAD` 문단). */
function autoHead(route: RegisteredRoute, routes: RegisteredRoute[]): boolean {
  return routes.some(
    (other) =>
      other !== route &&
      other.url === route.url &&
      other.method.split(',').includes('GET') &&
      other.preHandlers.length === route.preHandlers.length &&
      other.preHandlers.every((handler, index) => handler === route.preHandlers[index]),
  )
}

export async function routeCensus(): Promise<RouteCensus> {
  const routes: RegisteredRoute[] = []
  await withApi(async () => {}, { onRoute: (route) => routes.push(route) })
  const census: RouteCensus = { guarded: [], unguardedProjectRoutes: [] }
  for (const route of routes) {
    const methods = route.method.split(',').filter((method) => method !== 'HEAD' || !autoHead(route, routes))
    const min = await guardMinOf(route.preHandlers)
    for (const method of methods) {
      if (min !== undefined) census.guarded.push({ method, url: route.url, min })
      else if (route.url.includes(':projectId')) census.unguardedProjectRoutes.push(`${method} ${route.url}`)
    }
  }
  return census
}
