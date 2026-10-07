/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withProxiedRealApi`를 쓴다.
 *
 * # 응답 뒤 늦은 커밋 지켜보기가 풀을 쥐지 않는다(`services/lost-commit.ts` 의 `createLateCommitWatch`)
 *
 * 판은 «확인 질의가 답을 못 받는다» 다 — 프록시가 `pg_xact_status` 를 담은 질의를 서버에 안 넘기고(`swallowQueries`) 트리 쓰기의 COMMIT 은
 * 서버에 넘긴 뒤 api 쪽 연결만 끊는다(`halfCutOnQuery`). 쓰기마다 커밋은 되는데 답은 503 «모름»이고, 그 xid 는 응답 뒤 지켜보기로 간다.
 *
 * | 성질 | 왜 |
 * |---|---|
 * | 잃은 쓰기 10 뒤에도 지켜보기가 쥔 칸은 하나까지다 · 남의 프로젝트 요청은 곧바로 200 | 지켜보기가 xid 마다 따로 묻고 한 번 묻기에 마감까지 남은 몫(최대 30s)을 주면 잃음 N 개가 칸 N 개를 쥐어 풀(10)이 차고 모든 요청이 503 이다 |
 * | 묻기를 막던 조건이 풀리면 곧 그 커밋의 신호가 간다 | 한 번 묻기가 마감까지 쥐면 조건이 풀린 뒤에도 그 묻기가 답을 못 받은 채 마감에 닿아 신호가 안 간다 |
 * | 닫기(`app.close()` → `db.destroy()`)가 답을 기다리는 묻기를 안 기다린다 | `pool.end()`는 빌려 간 연결이 돌아올 때까지 기다린다 — 걷지 않으면 종료가 묻기의 한도만큼 붙잡힌다 |
 *
 * **변조와 죽는 케이스**(백업 후 바이트 비교 복원 — 실패 값으로 죽은 것만 적는다):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 묶지 않는다 — `add` 마다 묻기 루프를 따로 띄운다(`if (running) return` 을 뗀다) | 「잃은 트리 쓰기 10」 **혼자**(쥔 칸 8) |
 * | 한 번 묻기에 마감(`LOST_COMMIT_LATE_MS`)을 준다 | 「잃은 트리 쓰기 10」 **혼자**(창 안의 묻기 0 — 묻기 하나가 칸을 쥔 채 선다) |
 * | 못 물었으면 지켜보기를 그만둔다 | 「잃은 트리 쓰기 10」 **혼자**(조건이 풀린 뒤 5s 안의 신호 없음) |
 * | `readWithin` 이 `signal` 을 안 듣는다 · 앱이 닫을 때 `stop` 을 안 부른다 | 「닫기」 **혼자**(각각 — `db.destroy` 990ms) |
 * | 지켜보지 않는다(`late.watch.add` 를 안 부른다) | 둘 다(카나리아 — 창 안의 묻기 0 · 닫기 전 칸 0) |
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOST_COMMIT_LATE_POLL_MS, LOST_COMMIT_PROBE_MS } from '../src/services/lost-commit'
import {
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withProxiedRealApi,
  type ProxiedRealApi,
  type SignedUpUser,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

/** 확인 · 지켜보기가 결말을 묻는 질의의 글자(`services/lost-commit.ts`). */
const PROBE = 'pg_xact_status'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface World {
  owner: SignedUpUser
  other: SignedUpUser
  projectId: string
  otherProjectId: string
}

async function world(ctx: ProxiedRealApi): Promise<World> {
  const owner = await signup(ctx)
  const other = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const otherProject = await createProject(ctx, other.cookie)
  return { owner, other, projectId: project.id, otherProjectId: otherProject.id }
}

const held = (ctx: ProxiedRealApi) => ctx.pool.totalCount - ctx.pool.idleCount

/** 잃은 트리 쓰기 `n` 개 — 쓰기마다 COMMIT 은 서버에 닿고 api 는 답을 잃는다. 답은 전부 503 «모름»이어야 판이 선다. */
async function lostWrites(ctx: ProxiedRealApi, w: World, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    ctx.proxy.halfCutOnQuery('commit')
    const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${w.projectId}/menu`, cookies: w.owner.cookie, payload: { parentId: null, title: `잃은 메뉴 ${i}` } })
    expect(ctx.proxy.fired, '반쪽 끊기가 쐈다').toBe(true)
    expect(res.statusCode, `잃은 쓰기 ${i} 의 답`).toBe(503)
  }
}

describe('늦은 커밋 지켜보기 — 확인 질의가 답을 못 받는 판', () => {
  it('잃은 트리 쓰기 10 — 지켜보기는 칸 하나까지 · 남의 프로젝트 GET 200 · 조건이 풀리면 곧 신호', async () => {
    await withProxiedRealApi(async (ctx) => {
      const w = await world(ctx)
      const room = await joinRoom(ctx.port, w.projectId, w.owner.cookie.wb_session)
      opened.push(room)
      await room.waitFor('joined')
      const swallow = ctx.proxy.swallowQueries(PROBE)
      await lostWrites(ctx, w, 10)

      // 지켜보기가 묻는 동안의 칸 — 한 번 묻기(`LOST_COMMIT_PROBE_MS`)와 쉼(`LOST_COMMIT_LATE_POLL_MS`)을 두 번 넘게 덮는 창.
      const probesBefore = swallow.count
      let maxHeld = 0
      const until = Date.now() + 2 * (LOST_COMMIT_PROBE_MS + LOST_COMMIT_LATE_POLL_MS)
      while (Date.now() < until) {
        maxHeld = Math.max(maxHeld, held(ctx))
        await sleep(20)
      }
      // `probedInWindow` 는 카나리아 — 그 창에 지켜보기가 실제로 물었다(안 지켜보면 칸도 0 이라 칸 단언이 아무것도 안 잰다).
      const probedInWindow = swallow.count - probesBefore
      expect({ heldAtMostOne: maxHeld <= 1, probedInWindow: probedInWindow > 0 }, `쥔 칸 최대 ${maxHeld} · 창 안의 묻기 ${probedInWindow}`).toEqual({
        heldAtMostOne: true,
        probedInWindow: true,
      })

      const t0 = performance.now()
      const otherGet = await ctx.app.inject({ method: 'GET', url: `/api/projects/${w.otherProjectId}/tree`, cookies: w.other.cookie })
      const otherMs = performance.now() - t0
      expect({ status: otherGet.statusCode, fast: otherMs < 1_000 }, `남의 프로젝트 GET(${Math.round(otherMs)}ms)`).toEqual({ status: 200, fast: true })

      // 묻기를 막던 조건이 풀린다 — 그 커밋들의 신호가 곧 와야 한다.
      const committed = await sql<{ n: number }>`select count(*)::int as n from menu_nodes where project_id = ${w.projectId}`.execute(db)
      expect(committed.rows[0]!.n, '잃은 쓰기는 전부 커밋됐다').toBe(10)
      const rev = (await ctx.app.inject({ method: 'GET', url: `/api/projects/${w.projectId}/tree`, cookies: w.owner.cookie })).json().rev as number
      expect(room.received.some((frame) => frame.type === 'menu-changed'), '조건이 풀리기 전의 신호').toBe(false)
      swallow.stop()
      const s0 = Date.now()
      const deadline = s0 + 5_000
      while (Date.now() < deadline && !room.received.some((frame) => frame.type === 'menu-changed' && frame.rev === rev)) {
        await room.quiet(50)
      }
      const signalMs = Date.now() - s0
      expect(
        room.received.filter((frame) => frame.type === 'menu-changed').map((frame) => frame.rev).at(-1) ?? null,
        `조건이 풀린 뒤 ${signalMs}ms 안의 마지막 신호`,
      ).toBe(rev)
    })
  }, 60_000)

  it('닫기 — 답을 기다리는 묻기가 있어도 `db.destroy` 가 곧바로 끝나고, 닫은 뒤에는 묻지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const w = await world(ctx)
      const swallow = ctx.proxy.swallowQueries(PROBE)
      const sent = ctx.proxy.countQueries(PROBE)
      await lostWrites(ctx, w, 1)
      // 응답을 붙잡는 확인의 묻기 하나 뒤에 지켜보기의 묻기가 나가 칸을 쥘 때까지 — 그 묻기가 답을 기다리는 동안 닫는다.
      const settled = Date.now() + 2_000
      while (Date.now() < settled && !(swallow.count >= 2 && held(ctx) === 1)) await sleep(5)
      expect({ probes: swallow.count >= 2, held: held(ctx) }, '닫기 전 — 지켜보기의 묻기가 칸을 쥐었다').toEqual({ probes: true, held: 1 })
      const closed = await ctx.close()
      const atClose = sent.count
      await sleep(LOST_COMMIT_PROBE_MS + LOST_COMMIT_LATE_POLL_MS)
      expect({ dbFast: closed.dbMs < 300, probesAfterClose: sent.count - atClose }, `닫기 ${JSON.stringify(closed)}`).toEqual({
        dbFast: true,
        probesAfterClose: 0,
      })
    })
  }, 60_000)
})
