/**
 * **api 가 DB 오류를 어떻게 내는가**(2026-09-22 이월 W) — HTTP 로 잰다.
 *
 * - (ii) **결과를 모르는 실패는 503 이다** — 봉투 있는 500(«그 요청은 커밋 전»)이 아니다. 웹의 코멘트 게시가 그 둘을
 *   가른다(`apps/web`의 `comment-panel.tsx`의 `knownRejection` 표). 경계는 `src/db/connection-loss.ts`가 소유한다.
 * - (i) **세션·토큰을 «확인하지 못했다»는 401 이 아니다** — 웹은 401 을 «세션 끝»으로 읽고 나가 있던 쓰기를 끊는다.
 *   판정은 `src/auth/plugin.ts`의 머리말 «자격이 없다 · 확인하지 못했다»가 소유한다.
 *
 * 연결을 끊는 판은 진짜 커밋이 필요해 **트랜잭션 하네스(`withApi`)를 못 쓴다** — 앱을 TCP 프록시
 * (`pg-fault-proxy.ts`) 뒤의 풀 위에 세우고, 끝나면 `resetRealData`로 지운다. 세션 조회를 **서버가 답해 거절한** 판
 * (500)은 `session.test.ts`의 *"resolveSession 조회 자체가 실패하면 …"*이 갖는다.
 *
 * **잰 변조**(api 프로젝트 전량 · 백업 후 바이트 비교로 되돌렸다). 연결을 잃는 판의 넷은 `db-connection-loss.test.ts`의
 * 변조(듣는 자 · 표지 · 가르는 층)에서도 함께 죽는다 — 그 축의 주인은 그쪽 표가 적는다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 쿠키 조회가 던지면 토큰 갈래로 넘어간다 | *"쿠키 조회가 실패하면 …"* **혼자** |
 * | 토큰 조회의 예외를 앞 판처럼 삼킨다 | *"토큰 조회가 …"* **혼자** |
 * | 쿠키 조회의 예외 중 **연결을 잃은 것만** 던지고 나머지는 삼킨다 | `session.test.ts`의 *"resolveSession 조회 자체가 실패하면 …"* **혼자** |
 * | `DbConnectionLostError`를 503 으로 안 옮긴다(500 봉투) | 여기 넷 — 축의 주인은 *"게시의 COMMIT 응답이 …"* |
 * | 쿠키 조회의 예외를 앞 판처럼 삼킨다 | *"세션 조회가 연결을 잃으면 …"* · *"쿠키 조회가 실패하면 …"* · `session.test.ts`의 *"resolveSession 조회 자체가 실패하면 …"* — 셋 다 401. 축의 주인은 *"세션 조회가 연결을 잃으면 …"* |
 */
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { buildApp } from '../src/app'
import { createDb, createPool } from '../src/db/client'
import {
  TEST_DATABASE_URL,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  testConfig,
  type TestContext,
} from './helpers'
import { startFaultProxy, type FaultProxy } from './pg-fault-proxy'

/** 이 케이스 동안 난 `uncaughtException` — 앞 판에서 api 를 죽인 것이 이것이다(`db-connection-loss.test.ts`). */
const uncaught: unknown[] = []
const record = (error: unknown): void => {
  uncaught.push(error)
}

interface ProxiedApi extends TestContext {
  proxy: FaultProxy
}

/** 앱을 TCP 프록시 뒤의 풀 위에 세운다. 쓰는 것은 **진짜로 커밋된다** — 끝나면 지운다. */
async function withProxiedApi(fn: (ctx: ProxiedApi) => Promise<void>): Promise<void> {
  const proxy = await startFaultProxy(TEST_DATABASE_URL)
  const db = createDb(createPool(proxy.url, () => undefined))
  const app = await buildApp({ db, config: testConfig() })
  uncaught.length = 0
  process.prependListener('uncaughtException', record)
  try {
    await fn({ app, db, proxy })
  } finally {
    process.removeListener('uncaughtException', record)
    await app.close()
    await db.destroy()
    await proxy.close()
  }
}

afterEach(async () => {
  await resetRealData()
})

async function pageWithRoot(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  return {
    owner,
    projectId: project.id,
    pageId: page.id,
    rootNodeId: (page.schema as { root: { id: string } }).root.id,
  }
}

/** 오류 봉투(`http/error-handler.ts`)를 읽는다. 없으면 `undefined`다. */
function envelope(body: string): { code: string; message: string } | undefined {
  try {
    return (JSON.parse(body) as { error?: { code: string; message: string } }).error
  } catch {
    return undefined
  }
}

describe('결과를 모르는 실패는 503 이다 — 봉투 있는 500 이 아니다', () => {
  it('게시의 COMMIT 응답이 유실되면 503 이고 api 는 산다 — 커밋은 됐고(1행) 같은 키로 다시 보내면 그 행이 재생된다', async () => {
    await withProxiedApi(async (ctx) => {
      const fx = await pageWithRoot(ctx)
      const url = `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`
      const payload = { nodeId: fx.rootNodeId, body: '닿았던 말', idempotencyKey: 'commit-loss-1' }

      ctx.proxy.dropCommitReplyAfter('insert into "comments"')
      const first = await ctx.app.inject({ method: 'POST', url, cookies: fx.owner.cookie, payload })

      expect(ctx.proxy.fired).toBe(true)
      expect(first.statusCode, first.body).toBe(503)
      expect(envelope(first.body)?.code).toBe('internal')
      expect(uncaught).toEqual([])
      const { rows } = await sql<{ body: string }>`select body from comments where page_id = ${fx.pageId}`.execute(ctx.db)
      expect(rows).toEqual([{ body: '닿았던 말' }])

      // 웹의 «다시 확인»이 하는 것 — 같은 키로 다시 보낸다. 풀은 새 연결로 받는다.
      const again = await ctx.app.inject({ method: 'POST', url, cookies: fx.owner.cookie, payload })
      expect(again.statusCode, again.body).toBe(200)
      const { rows: after } = await sql<{ n: string }>`select count(*) as n from comments where page_id = ${fx.pageId}`.execute(ctx.db)
      expect(after).toEqual([{ n: '1' }])
    })
  })
})

describe('세션·토큰을 확인하지 못했으면 401 이 아니다 — 자격이 없는 것과 다르다', () => {
  it('세션 조회가 연결을 잃으면 503 이다 — 같은 쿠키는 다음 요청에 산다', async () => {
    await withProxiedApi(async (ctx) => {
      const alice = await signup(ctx)

      ctx.proxy.dropOnQuery('from "sessions"')
      const lost = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: alice.cookie })
      expect(ctx.proxy.fired).toBe(true)
      expect(lost.statusCode, lost.body).toBe(503)

      const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: alice.cookie })
      expect(me.statusCode, me.body).toBe(200)
    })
  })

  it('토큰 조회가 연결을 잃으면 503 이다', async () => {
    await withProxiedApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const issued = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: owner.cookie,
        payload: { name: '도구' },
      })
      expect(issued.statusCode, issued.body).toBe(201)
      const authorization = `Bearer ${(issued.json() as { value: string }).value}`

      ctx.proxy.dropOnQuery('from "api_tokens"')
      const lost = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: { authorization } })
      expect(ctx.proxy.fired).toBe(true)
      expect(lost.statusCode, lost.body).toBe(503)

      const ok = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: { authorization } })
      expect(ok.statusCode, ok.body).toBe(200)
    })
  })

  it('쿠키 조회가 실패하면 토큰으로 넘어가지 않는다 — 쿠키가 먼저인데 그 쿠키를 모른다', async () => {
    await withProxiedApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const issued = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: owner.cookie,
        payload: { name: '도구' },
      })
      const authorization = `Bearer ${(issued.json() as { value: string }).value}`

      ctx.proxy.dropOnQuery('from "sessions"')
      const lost = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
        headers: { authorization },
      })
      expect(ctx.proxy.fired).toBe(true)
      expect(lost.statusCode, lost.body).toBe(503)
    })
  })
})
