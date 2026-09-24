import type { RegisteredRoute } from '../src/app'
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
 * **최소 역할은 가드를 돌려서 읽는다.** `projectGuard(min)` 은 부를 때마다 새 클로저라 값으로 알아볼 수 없고
 * `min` 을 밖에 드러내지 않는다. 그래서 등록된 preHandler 를 **하나씩 따로** 탐침 요청으로 부른다 — 가드는
 * `request.projectGuardMin` 에 `min` 을 남긴 뒤 DB 를 부르고, 탐침의 DB 는 닿는 순간 던진다. 남긴 값이 있으면 그
 * preHandler 가 가드다. 다른 preHandler(`requireAuth` · `requireSessionAuth`)는 탐침에 아무것도 안 남긴다.
 *
 * **못 알아보는 가드는 분모에서 빠지는 대신 죽게 한다** — `:projectId` 가 든 라우트에서 가드를 못 찾으면
 * `unguardedProjectRoutes` 에 든다(부르는 쪽이 `[]` 를 단언한다). `min` 을 남기기 전에 던지는 감싼 가드가 그렇다.
 *
 * `HEAD` 는 Fastify 가 `GET` 마다 저절로 더하는 짝이라 뺀다(preHandler 가 같다).
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

/** 닿는 순간 던지는 DB — 탐침이 실제 판정까지 가지 않게 한다. */
const UNREACHABLE_DB = new Proxy(
  {},
  {
    get() {
      throw new Error('탐침 요청은 DB 에 닿지 않는다')
    },
  },
)

async function guardMinOf(preHandlers: unknown[]): Promise<ProjectRole | undefined> {
  for (const handler of preHandlers) {
    if (typeof handler !== 'function') continue
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

export async function routeCensus(): Promise<RouteCensus> {
  const routes: RegisteredRoute[] = []
  await withApi(async () => {}, { onRoute: (route) => routes.push(route) })
  const census: RouteCensus = { guarded: [], unguardedProjectRoutes: [] }
  for (const route of routes) {
    const methods = route.method.split(',').filter((method) => method !== 'HEAD')
    const min = await guardMinOf(route.preHandlers)
    for (const method of methods) {
      if (min !== undefined) census.guarded.push({ method, url: route.url, min })
      else if (route.url.includes(':projectId')) census.unguardedProjectRoutes.push(`${method} ${route.url}`)
    }
  }
  return census
}
