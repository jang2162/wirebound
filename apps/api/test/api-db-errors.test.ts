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
 * **잰 변조**(api 프로젝트 전량 · 백업 후 바이트 비교로 되돌렸다). 연결을 잃는 판의 넷과 *"게시의 COMMIT 이 클라이언트 쪽
 * 시간 제한으로 …"*는 `db-connection-loss.test.ts`의 변조(듣는 자 · 표지 · 가르는 층 · COMMIT 줄)에서도 함께 죽는다 — 그 축의
 * 주인은 그쪽 표가 적는다. 아래 표의 **503 줄은 2026-09-22 리뷰 (e) 후속에서 다시 쟀고**, 인증 훅의 네 줄은 `ce4f6d7`에서 잰
 * 것이다(이 판은 `auth/plugin.ts`를 안 건드렸다).
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 쿠키 조회가 던지면 토큰 갈래로 넘어간다 | *"쿠키 조회가 실패하면 …"* **혼자** |
 * | 토큰 조회의 예외를 앞 판처럼 삼킨다 | *"토큰 조회가 …"* **혼자** |
 * | 쿠키 조회의 예외 중 **연결을 잃은 것만** 던지고 나머지는 삼킨다 | `session.test.ts`의 *"resolveSession 조회 자체가 실패하면 …"* **혼자** |
 * | `DbConnectionLostError`를 503 으로 안 옮긴다(500 봉투) | 여기 다섯 — 축의 주인은 *"게시의 COMMIT 응답이 …"*. *"게시의 COMMIT 이 클라이언트 쪽 시간 제한으로 …"*는 **혼자 죽는 변조가 없다** — 이것과 COMMIT 줄(그쪽 주인 *"COMMIT 이 서버의 답 없이 …"*)에서 늘 함께 죽는다. 남긴 것은 리뷰 (e)의 절차를 HTTP·재생·행 수까지 한 판으로 재기 때문이다 |
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
  getTestDb,
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

describe('COMMIT 에 서버의 답이 아닌 거절이 오면 503 이다 — 표지(연결의 `\'error\'`)가 없어도', () => {
  it('게시의 COMMIT 이 클라이언트 쪽 시간 제한으로 거절되면 503 이다 — 커밋은 됐고(1행) 같은 키로 다시 보내면 재생된다', async () => {
    // 리뷰 (e)의 절차 — COMMIT 을 서버 안에서 걸리게 하는 지연 제약 트리거 + `query_timeout`. `createPool`은 그 설정을
    // 거절하므로 **만든 뒤 풀에 넣는다**(COMMIT 줄만 잰다 — `db-connection-loss.test.ts`의 머리말). 값: COMMIT 1.3s ·
    // 타이머 1.0s — 뒤따른 ROLLBACK 이 COMMIT 뒤에 답을 받으므로 던져지는 것은 COMMIT 의 거절이다.
    const admin = getTestDb()
    await sql
      .raw(
        `create function zz_slow_comment_commit() returns trigger language plpgsql as $$ begin if new.body like 'zz-slow-commit%' then perform pg_sleep(1.3); end if; return null; end $$`,
      )
      .execute(admin)
    await sql`create constraint trigger zz_slow_comment_commit after insert on comments deferrable initially deferred for each row execute function zz_slow_comment_commit()`.execute(
      admin,
    )
    const pool = createPool(TEST_DATABASE_URL, () => undefined)
    pool.options.query_timeout = 1000
    const db = createDb(pool)
    const app = await buildApp({ db, config: testConfig() })
    uncaught.length = 0
    process.prependListener('uncaughtException', record)
    try {
      const fx = await pageWithRoot({ app, db })
      const url = `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`
      const payload = { nodeId: fx.rootNodeId, body: 'zz-slow-commit 원문', idempotencyKey: 'slow-commit-1' }

      const first = await app.inject({ method: 'POST', url, cookies: fx.owner.cookie, payload })
      expect(first.statusCode, first.body).toBe(503)
      expect(envelope(first.body)?.code).toBe('internal')
      expect(uncaught).toEqual([])
      // 앞 판은 여기서 봉투 500 이었다 — 웹이 «확정 안 달림»으로 읽고 고쳐 달면 두 행(리뷰 (e)).
      const { rows } = await sql<{ body: string }>`select body from comments where page_id = ${fx.pageId}`.execute(admin)
      expect(rows).toEqual([{ body: 'zz-slow-commit 원문' }])

      const again = await app.inject({ method: 'POST', url, cookies: fx.owner.cookie, payload })
      expect(again.statusCode, again.body).toBe(200)
      const { rows: after } = await sql<{ n: string }>`select count(*) as n from comments where page_id = ${fx.pageId}`.execute(admin)
      expect(after).toEqual([{ n: '1' }])
    } finally {
      process.removeListener('uncaughtException', record)
      await app.close()
      await db.destroy()
      await sql`drop trigger if exists zz_slow_comment_commit on comments`.execute(admin)
      await sql`drop function if exists zz_slow_comment_commit()`.execute(admin)
    }
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
