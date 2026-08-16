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
 * # 세 갈래 — **전부 이 파일이 전수로 잰다**
 *
 * | 라우트 | 토큰만 든 요청 |
 * |---|---|
 * | `:projectId`가 **있다** | 채운다. **그 토큰의 프로젝트가 아니면 404**(`/ws`만 401 — 쿠키 전용이라 가드 앞에서 끊긴다) |
 * | `:projectId`가 없고 **인증이 필요하다** | 안 채운다 → **401** |
 * | `:projectId`가 없고 **공개다** | 안 채운다 → 토큰이 없을 때와 답이 같다 — 재라 #6 |
 *
 * ## 앞 판은 첫 줄을 `api-tokens.test.ts`에 위임했고, 그 위임이 사각을 만들었다
 *
 * **리뷰가 실증했다**(P9-2 리뷰 §3.1). `:projectId`를 갖지만 `projectGuard`를 **안 단**
 * 라우트를 하나 심었더니 **api 스위트 1230건이 전부 초록인 채** 프로젝트 A의 토큰이
 * 프로젝트 B의 메뉴 제목을 **200**으로 읽었다(리뷰어 실측).
 *
 * 원인은 census 둘이 서로의 사각을 만든 것이다:
 *
 * | census | 분모 | 그 라우트가 드는가 |
 * |---|---|---|
 * | 이 파일(앞 판) | 등록된 라우트를 `:projectId` **유무**로 가르되 전수 주장은 *"**없는**"* 쪽에만 뒀다 | **안 든다** |
 * | `permission-matrix.test.ts` | 소스에서 **`projectGuard`가 걸린** 라우트를 정규식으로 뽑는다 | **안 든다** — 가드가 없어 정규식에 안 걸린다 |
 *
 * 그래서 **위임을 거뒀다.** `:projectId`가 있는 쪽도 여기서 전수로 잰다 —
 * `api-tokens.test.ts`의 하나짜리 케이스(`GET /api/projects/:projectId`)는 **남겨 둔다**:
 * 그쪽은 *"토큰이라는 자격의 성질"*을 읽는 사람이 보는 자리이고, 여기는 분모를 지키는
 * 자리다. 갈리면 이 파일이 먼저 죽는다.
 *
 * **이 저장소의 세 번째 자리다.** `permission-matrix.test.ts`의 *"표의 완전성"*이 적은
 * 사고(`GET /:projectId/theme`가 표에 빠져 가드를 없애도 0건이 죽었다)와
 * `restore-lock-census.test.ts`가 적은 사고(손으로 고른 아홉)가 같은 부류다.
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
 * 경로에서 `:projectId` 밖의 파라미터를 채울 값. **아무 uuid나 된다** — `projectGuard`가
 * `preHandler`라 **핸들러보다 먼저** 돌고, 그 가드가 보는 것은 `projectId` 하나뿐이다
 * (`auth/roles.ts`의 `ProjectParams`가 `z.object`라 나머지를 안 본다). 그래서 이 값이
 * 가리키는 자원이 실제로 있을 필요가 없다.
 */
const FILLER_UUID = '00000000-0000-4000-8000-000000000000'

/** 등록된 패턴을 실제로 쏠 수 있는 URL로. `:projectId`만 지목한 값으로 바꾼다. */
function fillParams(pattern: string, projectId: string): string {
  return pattern.replace(PROJECT_ID_PARAM, projectId).replace(/:[A-Za-z]+/g, FILLER_UUID)
}

/**
 * 하나의 앱을 세우고, 그 앱의 라우트 목록과 토큰 헤더를 함께 만들어 `fn`에 넘긴다.
 *
 * **프로젝트를 둘 만들고 같은 사람이 둘 다 owner다.** 그래야 스코프 밖의 404가
 * *"멤버가 아니다"*가 아니라 *"이 토큰의 프로젝트가 아니다"*임이 드러난다 — 남남으로
 * 만들면 스코프를 아예 안 봐도 404가 나와 케이스가 아무것도 못 잰다.
 */
async function withCensus(
  fn: (args: {
    ctx: TestContext
    routes: RegisteredRoute[]
    header: { authorization: string }
    /** `app.requireAuth`가 걸렸는가 — **참조로** 본다. */
    requiresAuth: (route: RegisteredRoute) => boolean
    /** 토큰이 묶인 프로젝트. */
    tokenProjectId: string
    /** 같은 사람이 owner인 **다른** 프로젝트. 토큰이 여기에는 닿으면 안 된다. */
    otherProjectId: string
  }) => Promise<void>,
): Promise<void> {
  const routes: RegisteredRoute[] = []
  await withApi(
    async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const other = await createProject(ctx, owner.cookie)
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
        tokenProjectId: project.id,
        otherProjectId: other.id,
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

  /**
   * **N1이 닫히는 자리.** *"토큰은 자기 프로젝트에만 닿는다"*를 **라우트 하나가 아니라
   * 전수**로 잰다. `:projectId`를 갖는데 `projectGuard`가 없는 라우트가 생기면 그 줄이
   * 200(또는 그 밖의 무엇)으로 나와 **여기가 먼저 죽는다.**
   *
   * **`/ws`만 401이다.** 그 라우트는 `requireSessionAuth`가 가드보다 **앞에서** 끊으므로
   * (§10의 *"REST와 WS의 인증 경로가 하나다"*) 404까지 가지 않는다. **그 예외를 목록에
   * 박아 두는 것이 요점이다** — 예외가 하나 늘면 사람이 *"이것이 정말 404가 아니어도
   * 되나"*를 다시 판정한다.
   */
  it('토큰의 프로젝트 밖에서는 `:projectId` 라우트가 전부 404다 — `/ws`만 401이다', async () => {
    await withCensus(async ({ ctx, routes, header, tokenProjectId, otherProjectId }) => {
      const targets = routes.filter((route) => route.url.includes(PROJECT_ID_PARAM)).flatMap(expand)
      // 분모가 0이면 아래가 공허하게 통과한다.
      expect(targets.length).toBeGreaterThan(20)

      const observed: Record<string, number> = {}
      for (const target of targets) {
        const res = await ctx.app.inject({
          method: target.method,
          url: fillParams(target.url, otherProjectId),
          headers: header,
          // 본문이 필요한 라우트에는 빈 객체를 준다. 가드가 `preHandler`라 본문 검증보다
          // 뒤에 돌지만, 이 라우트들은 Fastify 스키마를 안 걸어 빈 객체가 그냥 지나간다.
          payload: target.method === 'GET' ? undefined : {},
        })
        observed[`${target.method} ${target.url}`] = res.statusCode
      }

      // **목록을 통째로 단언한다** — 어느 줄이 새는지 실패 메시지가 그대로 말한다.
      expect(observed).toEqual(
        Object.fromEntries(Object.keys(observed).map((key) => [key, key.endsWith('/ws') ? 401 : 404])),
      )
    })
  })

  /**
   * **위 케이스의 대조.** 전부 404인 것이 *"토큰이 통째로 안 먹는다"*나 *"하네스가
   * 망가졌다"*와 구분되어야 한다 — 같은 자격으로 **자기 프로젝트**는 읽힌다.
   */
  it('같은 자격이 자기 프로젝트에서는 읽힌다 — 대조', async () => {
    await withCensus(async ({ ctx, header, tokenProjectId }) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${tokenProjectId}/tree`,
        headers: header,
      })
      expect(res.statusCode, res.body).toBe(200)
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
