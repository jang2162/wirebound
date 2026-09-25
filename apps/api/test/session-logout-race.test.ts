/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다**(`withProxiedRealApi`).
 *
 * **로그아웃과 겹친 요청은 지워진 세션으로 서지 않는다**(`src/auth/session.ts`의 `resolveSession`).
 *
 * 세션 인증은 «행을 읽는다(`SELECT`) → `last_seen_at`을 갱신한다» 두 문장이다. 로그아웃의 `DELETE`가 그 사이에 커밋되면 갱신은
 * 0 행으로 끝난다 — 그 결과를 안 보면 지워진 세션으로 인증이 서고, 읽기에는 커밋 순간의 재확인이 없어 그 요청이 답한다.
 * 판은 프록시로 세운다: 요청의 갱신 질의를 붙잡고(`holdQuery`) 그 사이 로그아웃을 커밋한 뒤 푼다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, resetRealData, signup, withProxiedRealApi } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

/** `resolveSession`의 갱신 질의 — 로그아웃 요청의 인증도 같은 질의를 내므로 요청을 먼저 쏘아 붙잡는다(한 번 쏘면 풀린다). */
const TOUCH_SESSION = 'update "sessions" set "last_seen_at"'

describe('로그아웃과 겹친 세션 인증', () => {
  it('행을 읽은 뒤 로그아웃이 커밋되면 그 요청은 401 이다 — 지워진 세션으로 답하지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const hold = ctx.proxy.holdQuery(TOUCH_SESSION)
      const read = ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, cookies: owner.cookie })
      await hold.held

      const logout = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: owner.cookie })
      expect(logout.statusCode, logout.body).toBe(204)
      hold.release()

      const res = await read
      expect({ status: res.statusCode, body: res.json() }).toMatchObject({ status: 401, body: { error: { code: 'unauthenticated' } } })
    })
  })

  it('대조: 로그아웃이 안 끼면 같은 판의 요청은 200 이다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const hold = ctx.proxy.holdQuery(TOUCH_SESSION)
      const read = ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, cookies: owner.cookie })
      await hold.held
      hold.release()

      expect((await read).statusCode).toBe(200)
    })
  })
})
