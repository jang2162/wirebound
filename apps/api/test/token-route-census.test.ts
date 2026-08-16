/**
 * **D4의 인구조사.** *"토큰이 인증한 요청은 그 라우트가 `:projectId`를 가질 때만
 * `currentUser`를 채운다"*가 실제로 **등록된 라우트 전부**에 대해 참인가.
 *
 * ---
 *
 * # 분모를 손으로 적지 않는다
 *
 * `buildApp`의 `onRoute` 이음매가 Fastify에게 **자기가 아는 라우트 목록**을 받아 온다
 * (그 이음매의 머리말에 `printRoutes`를 되파싱하지 않은 이유가 있다). 그래서 이 파일은
 * 라우트를 열거하지 않고 **가른다** — 앞으로 생길 프로젝트 밖 라우트가 여기서 **먼저
 * 죽는다.**
 *
 * `permission-matrix.test.ts`가 소스를 훑어 같은 부류의 census를 만드는데, 그쪽이 세는
 * 것은 *"`projectGuard`가 걸린 라우트"*라 정규식으로 충분했다. 여기서 필요한 것은
 * **가드가 없는 라우트까지 포함한 전부**이고, 소스 정규식은 *"등록되지 않은 라우트"*를
 * 놓쳤는지 알 방법이 없다.
 *
 * **앱을 하나만 세운다.** 목록과 요청이 같은 인스턴스에서 나와야 `app.requireAuth`를
 * **참조로** 비교할 수 있다(문자열로 훑으면 그 함수의 본문이 바뀌는 날 조용히 어긋난다).
 *
 * # 세 갈래
 *
 * | 라우트 | 토큰만 든 요청 | 어디서 재나 |
 * |---|---|---|
 * | `:projectId`가 있다 | 채운다 | `api-tokens.test.ts` |
 * | `:projectId`가 없고 **인증이 필요하다** | 안 채운다 → **401**(전수) | 이 파일 |
 * | `:projectId`가 없고 **공개다** | 안 채운다 → 토큰이 없을 때와 같다(전수) | 이 파일 — 재라 #6 |
 */
import { describe, expect, it } from 'vitest'
import type { RegisteredRoute } from '../src/app'
import { PROJECT_ID_PARAM } from '../src/auth/plugin'
import { insertApiToken } from '../src/repos/api-tokens'
import { createProject, signup, withApi, type TestContext } from './helpers'

/** `HEAD`는 Fastify가 `GET`마다 자동으로 다는 것이라 따로 세지 않는다. */
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const
type Method = (typeof METHODS)[number]

interface Target {
  method: Method
  url: string
}

/** 라우트 한 줄을 (메서드 × 경로)로 편다. */
function expand(route: RegisteredRoute): Target[] {
  return route.method
    .split(',')
    .filter((method): method is Method => (METHODS as readonly string[]).includes(method))
    .map((method) => ({ method, url: route.url }))
}

/**
 * 하나의 앱을 세우고, 그 앱의 라우트 목록과 토큰 헤더를 함께 만들어 `fn`에 넘긴다.
 */
async function withCensus(
  fn: (args: {
    ctx: TestContext
    routes: RegisteredRoute[]
    header: { authorization: string }
    /** `app.requireAuth`가 걸렸는가 — **참조로** 본다. */
    requiresAuth: (route: RegisteredRoute) => boolean
  }) => Promise<void>,
): Promise<void> {
  const routes: RegisteredRoute[] = []
  await withApi(
    async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const issued = await insertApiToken(ctx.db, {
        projectId: project.id,
        userId: owner.user.id,
        name: '인구조사용',
      })

      const requireAuth = ctx.app.requireAuth
      await fn({
        ctx,
        routes,
        header: { authorization: `Bearer ${issued.value}` },
        requiresAuth: (route) => route.preHandlers.includes(requireAuth),
      })
    },
    { onRoute: (route) => routes.push(route) },
  )
}

describe('D4 인구조사 — 토큰이 닿지 않는 라우트', () => {
  it('분모를 실제로 만든다 — 라우트 목록이 비어 있지 않고 양쪽이 다 있다', async () => {
    await withCensus(async ({ routes, requiresAuth }) => {
      // 이음매가 어긋나면 **빈 집합에서 아래가 조용히 통과한다**(이 저장소가 겪은 부류).
      expect(routes.length).toBeGreaterThan(30)
      expect(routes.filter((route) => route.url.includes(PROJECT_ID_PARAM)).length).toBeGreaterThan(20)

      const outside = routes.filter((route) => !route.url.includes(PROJECT_ID_PARAM))
      expect(outside.length).toBeGreaterThan(4)
      // 술어가 실제로 가르는지. 한쪽이 0이면 아래 두 케이스 중 하나가 공허해진다.
      expect(outside.filter(requiresAuth).length).toBeGreaterThan(0)
      expect(outside.filter((route) => !requiresAuth(route)).length).toBeGreaterThan(0)
    })
  })

  it('`:projectId`가 없고 인증이 필요한 라우트는 전부 401이다', async () => {
    await withCensus(async ({ ctx, routes, header, requiresAuth }) => {
      const targets = routes
        .filter((route) => !route.url.includes(PROJECT_ID_PARAM) && requiresAuth(route))
        .flatMap(expand)
      expect(targets.length).toBeGreaterThan(0)

      const observed: Record<string, number> = {}
      for (const target of targets) {
        const res = await ctx.app.inject({ method: target.method, url: target.url, headers: header })
        observed[`${target.method} ${target.url}`] = res.statusCode
      }

      // **목록을 통째로 단언한다** — 어느 줄이 어긋났는지 실패 메시지가 그대로 말한다.
      expect(observed).toEqual(Object.fromEntries(Object.keys(observed).map((key) => [key, 401])))
    })
  })

  it('`:projectId`가 없고 공개인 라우트는 토큰이 실려도 답이 달라지지 않는다 — 재라 #6', async () => {
    await withCensus(async ({ ctx, routes, header, requiresAuth }) => {
      const targets = routes
        .filter((route) => !route.url.includes(PROJECT_ID_PARAM) && !requiresAuth(route))
        .flatMap(expand)
      expect(targets.length).toBeGreaterThan(0)

      for (const target of targets) {
        // 본문이 필요한 라우트(`POST /api/auth/login` 등)에는 빈 객체를 준다. 어느 쪽이든
        // **같은 본문**을 보내므로 비교가 성립한다.
        const payload = target.method === 'GET' ? undefined : {}
        const withToken = await ctx.app.inject({ method: target.method, url: target.url, headers: header, payload })
        const without = await ctx.app.inject({ method: target.method, url: target.url, payload })

        // **같은 답이 나온다**가 *"아무 일이 없다"*의 뜻이다. 상태 코드 자체는 라우트마다
        // 다르다(`/health`는 200, 본문이 빈 `POST /api/auth/login`은 400).
        const label = `${target.method} ${target.url}`
        expect(withToken.statusCode, label).toBe(without.statusCode)
        expect(withToken.statusCode, label).not.toBe(401)
      }
    })
  })
})
