/**
 * **RV-AC 리뷰 2 · 3 — 관리자가 닿는 곳.**
 *
 * - **관리자는 멤버가 아닌 프로젝트의 내용에 닿지 못한다**(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «반목표»).
 *   `:projectId` 라우트 **전부**(분모는 Fastify 의 라우트 표 — `guarded-routes.ts` 의 `routeCensus` 와 같은 이음매)를 관리자 세션으로
 *   부르고, 관리자가 아닌 남(같은 프로젝트의 비멤버)의 응답과 상태 · 몸이 같은지 본다. 관리자 라우트의 응답(목록 · 넘기기 · 기록)에
 *   페이지 이름 · 메뉴 이름 · 노드가 안 섞이는지 표지 글자로 본다.
 * - **세션 전용** — `/api/admin` 아래 전부를 관리자의 API 토큰(그 사람이 owner 인 프로젝트의 토큰)만으로 부르면 401. `/api/auth/invites` ·
 *   `/api/auth/resets` 는 로그인 없이 부르는 라우트라 토큰을 실어도 안 실은 것과 답이 같다. 두 접두 아래 `:projectId` 파라미터를 가진 라우트
 *   수(인증 훅이 그 **이름**으로 토큰을 받는다 — `src/auth/plugin.ts` 의 `PROJECT_ID_PARAM`)를 센다.
 */
import { describe, expect, it } from 'vitest'
import type { RegisteredRoute } from '../src/app'
import { PROJECT_ID_PARAM } from '../src/auth/plugin'
import { insertApiToken } from '../src/repos/api-tokens'
import { admin, adminOf } from './accounts-fixtures'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const
type Method = (typeof METHODS)[number]
const FILLER_UUID = '00000000-0000-4000-8000-000000000000'
const MARK_PAGE = 'RVAC비밀페이지'
const MARK_MENU = 'RVAC비밀메뉴'

function expand(route: RegisteredRoute): { method: Method; url: string }[] {
  return route.method
    .split(',')
    .filter((method): method is Method => (METHODS as readonly string[]).includes(method))
    .map((method) => ({ method, url: route.url }))
}

function fill(pattern: string, projectId: string): string {
  return pattern.replace(PROJECT_ID_PARAM, projectId).replace(/:[A-Za-z]+/g, FILLER_UUID)
}

async function withRoutes(fn: (ctx: TestContext, routes: RegisteredRoute[]) => Promise<void>): Promise<void> {
  const routes: RegisteredRoute[] = []
  await withApi((ctx) => fn(ctx, routes), { onRoute: (route) => routes.push(route) })
}

describe('관리자 × 멤버가 아닌 프로젝트의 내용 라우트', () => {
  it('`:projectId` 라우트 전부에서 관리자의 답이 관리자 아닌 비멤버의 답과 같다 — 404 가 아닌 줄은 그 둘이 함께 받는 것뿐', async () => {
    await withRoutes(async (ctx, routes) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: MARK_MENU })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: MARK_PAGE })
      const amy = await adminOf(ctx)
      const carl = await signup(ctx)

      const targets = routes.filter((route) => route.url.includes(PROJECT_ID_PARAM)).flatMap(expand)
      expect(targets.length).toBeGreaterThan(40)
      const differ: string[] = []
      const notFound: string[] = []
      const other: Record<string, number> = {}
      for (const target of targets) {
        const call = (cookie: { wb_session: string }) =>
          ctx.app.inject({
            method: target.method,
            url: fill(target.url, project.id),
            cookies: cookie,
            payload: target.method === 'GET' ? undefined : {},
          })
        const asAdmin = await call(amy.cookie)
        const asOutsider = await call(carl.cookie)
        const key = `${target.method} ${target.url}`
        if (asAdmin.statusCode !== asOutsider.statusCode || asAdmin.body !== asOutsider.body)
          differ.push(`${key} ${asAdmin.statusCode}/${asOutsider.statusCode}`)
        if (asAdmin.statusCode === 404) notFound.push(key)
        else other[key] = asAdmin.statusCode
        expect(asAdmin.body).not.toContain(MARK_PAGE)
        expect(asAdmin.body).not.toContain(MARK_MENU)
      }
      console.log('[rv-ac 2 census]', { targets: targets.length, notFound: notFound.length, other })
      expect(differ).toEqual([])
      // 404 가 아닌 줄은 연결 업그레이드 라우트 하나(쿠키 전용 · 업그레이드 없는 GET)뿐이다 — 남과 같은 답이다(위 `differ`).
      expect(Object.keys(other).every((key) => key.endsWith('/ws'))).toBe(true)
      expect(notFound.length).toBe(targets.length - Object.keys(other).length)
    })
  })

  it('대조 — 같은 관리자가 owner 를 넘겨받은 뒤에는 같은 프로젝트의 트리가 읽힌다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await createMenuNode(ctx, owner.cookie, project.id, { title: MARK_MENU })
      const amy = await adminOf(ctx)
      const tree = () => ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: amy.cookie })
      expect((await tree()).statusCode).toBe(404)
      expect((await admin(ctx, amy.cookie, 'POST', `/users/${owner.user.id}/deactivate`)).statusCode).toBe(200)
      expect((await admin(ctx, amy.cookie, 'POST', `/projects/${project.id}/owner`, { userId: amy.user.id })).statusCode).toBe(200)
      const after = await tree()
      expect(after.statusCode).toBe(200)
      expect(after.body).toContain(MARK_MENU)
    })
  })

  it('관리자 라우트의 응답(사용자 · 프로젝트 목록 · 넘기기 · 기록)에 페이지 · 메뉴 이름이 없다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: MARK_MENU })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: MARK_PAGE })
      const amy = await adminOf(ctx)
      const bodies: string[] = []
      const read = async (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) => {
        const res = await admin(ctx, amy.cookie, method, url, payload)
        expect(res.statusCode, `${method} ${url} ${res.body}`).toBeLessThan(300)
        bodies.push(res.body)
      }
      await read('GET', '/projects')
      await read('GET', '/users')
      await read('POST', `/users/${owner.user.id}/deactivate`)
      await read('POST', `/projects/${project.id}/owner`, { userId: amy.user.id })
      await read('GET', '/audit')
      // 카나리아 — 프로젝트 이름은 목록 · 넘기기 · 기록에 나온다(설계가 허락한 칸). 표지가 안 보이는 것이 «안 읽었다» 가 아니게.
      expect(bodies.filter((body) => body.includes(project.id)).length).toBeGreaterThanOrEqual(3)
      for (const body of bodies) {
        expect(body).not.toContain(MARK_PAGE)
        expect(body).not.toContain(MARK_MENU)
      }
    })
  })
})

describe('세션 전용 — 관리자의 API 토큰', () => {
  it('`/api/admin` 아래 전부가 토큰만으로는 401 · `/api/auth/invites` · `/api/auth/resets` 는 토큰을 실어도 안 실은 것과 같다', async () => {
    await withRoutes(async (ctx, routes) => {
      const amy = await adminOf(ctx)
      const project = await createProject(ctx, amy.cookie)
      const issued = await insertApiToken(ctx.db, { projectId: project.id, userId: amy.user.id, name: 'rv-ac' })
      const bearer = { authorization: `Bearer ${issued.value}` }
      // 대조 — 같은 토큰이 제 프로젝트에는 닿는다(토큰이 통째로 죽은 판과 가르려고).
      expect((await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, headers: bearer })).statusCode).toBe(200)

      const adminTargets = routes.filter((route) => route.url.startsWith('/api/admin/')).flatMap(expand)
      const linkTargets = routes.filter((route) => /^\/api\/auth\/(invites|resets)\//.test(route.url)).flatMap(expand)
      expect(adminTargets.length).toBeGreaterThanOrEqual(15)
      expect(linkTargets.length).toBe(4)

      const adminCodes: Record<string, number> = {}
      for (const target of adminTargets) {
        const res = await ctx.app.inject({
          method: target.method,
          url: fill(target.url, project.id),
          headers: bearer,
          // 본문을 싣지 않는다 — 올리기 라우트는 JSON 본문을 내용 형식에서 415 로 끊어(인증 앞) 그 줄을 못 잰다.
        })
        adminCodes[`${target.method} ${target.url}`] = res.statusCode
      }
      console.log('[rv-ac 3 admin routes]', adminCodes)
      expect(adminCodes).toEqual(Object.fromEntries(Object.keys(adminCodes).map((key) => [key, 401])))

      const differ: string[] = []
      for (const target of linkTargets) {
        const call = (headers: Record<string, string>) =>
          ctx.app.inject({
            method: target.method,
            url: target.url.replace(':token', 'not-a-real-link'),
            headers,
            payload: target.method === 'GET' ? undefined : { email: 'x@example.com', name: '엑스', password: 'password1234' },
            remoteAddress: '10.99.0.1',
          })
        const withToken = await call(bearer)
        const without = await call({})
        if (withToken.statusCode !== without.statusCode || withToken.body !== without.body) differ.push(`${target.method} ${target.url}`)
      }
      expect(differ).toEqual([])
    })
  })

  it('`/api/admin` · `/api/auth` 아래에 `:projectId` 파라미터를 가진 라우트는 0 개다', async () => {
    await withRoutes(async (_ctx, routes) => {
      const sessionOnly = routes.filter((route) => route.url.startsWith('/api/admin/') || route.url.startsWith('/api/auth/'))
      expect(sessionOnly.length).toBeGreaterThan(15)
      const named = sessionOnly.filter((route) => route.url.includes(PROJECT_ID_PARAM)).map((route) => `${route.method} ${route.url}`)
      console.log('[rv-ac 3 projectId params]', named.length, sessionOnly.length)
      expect(named).toEqual([])
    })
  })
})
