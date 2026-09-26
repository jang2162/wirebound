/**
 * **COMMIT 답을 잃은 편집을 서버가 그 자리에서 확인한다**(`services/lost-commit.ts`의 `runEditTransaction`).
 *
 * 편집(`PATCH .../ops` · WS `patch`)의 COMMIT 이 Postgres 에서 커밋됐는데 그 답만 잃으면 핸들러는 결과를 모른다. 그때 새 연결로
 * 그 트랜잭션의 결말(`pg_xact_status`)을 묻는다 — 커밋됐으면 **성공으로 답하고**, 그 revision 이 아직 페이지의 머리면 **방송한다.**
 * 커밋 안 됐으면 봉투 있는 500(«반영되지 않았다»), 한도 안에 결말을 모르면 원래대로 503 «모름»이다.
 *
 * 진짜 Postgres 앞의 TCP 프록시(`pg-fault-proxy.ts`)가 COMMIT 답을 끊는다 — 커밋은 된다.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { buildApp } from '../src/app'
import { createDb, createPool } from '../src/db/client'
import { DB_UNREACHABLE_WRITE_MESSAGE } from '../src/http/error-handler'
import {
  DB_WRITE_NOT_APPLIED_MESSAGE,
  LOST_COMMIT_POLL_MAX_MS,
  LOST_COMMIT_POLL_MS,
  LOST_COMMIT_PROBE_MS,
} from '../src/services/lost-commit'
import type { ServerFrame } from '../src/ws/protocol'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  testConfig,
  TEST_DATABASE_URL,
  withProxiedRealApi,
  type ProxiedRealApi,
} from './helpers'
import { startFaultProxy } from './pg-fault-proxy'
import { joinRoom } from './ws-client'

afterEach(async () => {
  await resetRealData()
})

type PageChanged = Extract<ServerFrame, { type: 'page-changed' }>
const pageChanged = (frames: ServerFrame[]): PageChanged[] => frames.filter((frame): frame is PageChanged => frame.type === 'page-changed')

/** 확인 질의가 싣는 글자 — 프록시가 그 질의만 늦추거나 끊는다(`repos/revisions.ts`의 `findRevisionCommitWithin`). */
const PROBE = 'as "committed"'
/** 커밋을 묻는 질의의 글자(`services/lost-commit.ts`의 `settleTransaction`). */
const XACT = 'pg_xact_status'
/**
 * 한도(`LOST_COMMIT_PROBE_MS`) 동안 결말을 묻는 수의 상한 — 첫 물음에 더해, 간격(`LOST_COMMIT_POLL_MS`에서 두 배씩
 * `LOST_COMMIT_POLL_MAX_MS`까지)을 쌓은 시각이 한도 안인 만큼. 질의의 왕복을 0 으로 셈한다 — 실제는 이보다 적다.
 */
function maxPolls(): number {
  let polls = 1
  let at = 0
  for (let pause = LOST_COMMIT_POLL_MS; at + pause < LOST_COMMIT_PROBE_MS; pause = Math.min(pause * 2, LOST_COMMIT_POLL_MAX_MS)) {
    at += pause
    polls += 1
  }
  return polls
}

/** 확인이 503 «모름»을 내기까지의 한도 — 확인의 한도(`LOST_COMMIT_PROBE_MS`)에 요청의 나머지 몫을 더한 것. */
const PROBE_LIMIT_MS = LOST_COMMIT_PROBE_MS + 500

/** 그 페이지의 revision 행이 설 때 COMMIT 을 `ms` 늦춘다 — `DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`. */
async function slowCommit<T>(pageId: string, ms: number, run: () => Promise<T>): Promise<T> {
  const db = getTestDb()
  await sql.raw(`create or replace function zz_slow_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(${ms / 1000}); return null; end $$`).execute(db)
  await sql.raw(
    `create constraint trigger zz_slow_commit after insert on revisions deferrable initially deferred for each row when (new.page_id = '${pageId}') execute function zz_slow_commit()`,
  ).execute(db)
  try {
    return await run()
  } finally {
    await sql`drop trigger if exists zz_slow_commit on revisions`.execute(db)
    await sql`drop function if exists zz_slow_commit()`.execute(db)
  }
}

async function fixture(ctx: ProxiedRealApi) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const author = await joinRoom(ctx.port, project.id, owner.cookie.wb_session)
  const watcher = await joinRoom(ctx.port, project.id, peer.cookie.wb_session)
  await author.waitFor('joined')
  await watcher.waitFor('joined')
  return {
    owner,
    peer,
    author,
    watcher,
    projectId: project.id,
    pageId: page.id,
    opsUrl: `/api/projects/${project.id}/pages/${page.id}/ops`,
  }
}

function addText(id: string) {
  return [{ op: 'add', path: '/root/children/-', value: { id, type: 'Text', props: {} } }]
}

async function revisionSeqs(pageId: string): Promise<number[]> {
  const { rows } = await sql<{ seq: number }>`select seq::int as seq from revisions where page_id = ${pageId} order by seq`.execute(getTestDb())
  return rows.map((row) => row.seq)
}

describe('COMMIT 답을 잃은 편집', () => {
  it('REST — 커밋을 확인하면 200 이고 룸이 그 revision 을 한 번 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: fx.opsUrl,
        cookies: fx.owner.cookie,
        payload: { baseSeq: 0, ops: addText('n_lost'), clientOpId: 'op_lost' },
      })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ seq: 1, clientOpId: 'op_lost', inverse: [{ op: 'remove', path: '/root/children/0' }] })
      expect(await revisionSeqs(fx.pageId)).toEqual([1])

      const frame = await fx.watcher.waitFor('page-changed')
      expect(frame).toMatchObject({ pageId: fx.pageId, seq: 1, ops: addText('n_lost'), clientOpId: 'op_lost' })
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
      expect(pageChanged(fx.watcher.received)).toHaveLength(1)
    })
  })

  it('WS — 커밋을 확인하면 patch-ack 이고 룸이 그 revision 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      fx.author.send(JSON.stringify({ type: 'patch', pageId: fx.pageId, clientOpId: 'op_ws_lost', baseSeq: 0, ops: addText('n_ws') }))
      const answer = await fx.author.waitFor('patch-ack')
      expect(ctx.proxy.fired).toBe(true)
      expect(answer).toMatchObject({ clientOpId: 'op_ws_lost', seq: 1 })
      expect(await fx.watcher.waitFor('page-changed')).toMatchObject({ seq: 1, ops: addText('n_ws') })
    })
  })

  /**
   * **COMMIT 이 서버에 안 닿았으면 «안 됐다»를 안다** — 프록시가 COMMIT 을 넘기지 않고 두 쪽을 끊으면 백엔드가 끊김을 보고 트랜잭션을
   * 되돌린다. 확인이 `aborted`를 받아 봉투 있는 500 으로 답한다 — 웹은 그것을 «커밋 전»으로 읽는다(`apps/web`의 `refusedBeforeCommit`).
   */
  it('COMMIT 이 서버에 안 닿았으면 revision 이 없다 — 봉투 있는 500 «반영되지 않았다» · 방송 없음', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropOnQuery('commit')
      const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_gone') } })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(500)
      expect(res.json()).toEqual({ error: { code: 'internal', message: DB_WRITE_NOT_APPLIED_MESSAGE } })
      expect(await revisionSeqs(fx.pageId)).toEqual([])
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })

  it('WS — COMMIT 이 서버에 안 닿았으면 500 patch-error «반영되지 않았다»', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropOnQuery('commit')
      fx.author.send(JSON.stringify({ type: 'patch', pageId: fx.pageId, clientOpId: 'op_ws_gone', baseSeq: 0, ops: addText('n_ws_gone') }))
      const answer = await fx.author.waitFor('patch-error')
      expect(ctx.proxy.fired).toBe(true)
      expect(answer).toMatchObject({ clientOpId: 'op_ws_gone', status: 500, code: 'internal', message: DB_WRITE_NOT_APPLIED_MESSAGE })
      expect(await revisionSeqs(fx.pageId)).toEqual([])
    })
  })

  /**
   * **끊긴 연결의 COMMIT 이 아직 돌면 끝날 때까지 본다**(`services/lost-commit.ts`의 «커밋이 끝날 때까지 본다»). COMMIT 을 서버에
   * 넘기자마자 api 쪽 연결만 끊기면(`halfCutOnQuery`) 확인이 그 COMMIT 보다 먼저 닿는다 — 끊긴 연결의 COMMIT 이 아직 돈다. COMMIT 을
   * 500ms 늦춘다. revision 행이 보이는지로만 가르면 503 «모름»이다.
   */
  it('끊긴 연결의 COMMIT 이 한도 안에 끝나면 기다린다 — 커밋되면 200 이고 룸이 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await slowCommit(fx.pageId, 500, async () => {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_late') } })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toMatchObject({ seq: 1 })
        expect(await fx.watcher.waitFor('page-changed')).toMatchObject({ seq: 1 })
      })
    })
  })

  it('끊긴 연결의 COMMIT 이 한도를 넘겨 돌면 503 «모름»이다 — 한도에서 멈춘다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await slowCommit(fx.pageId, 3_000, async () => {
        ctx.proxy.halfCutOnQuery('commit')
        const started = Date.now()
        const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_long') } })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode, res.body).toBe(503)
        expect(res.json().error.message).toBe(DB_UNREACHABLE_WRITE_MESSAGE)
        expect(Date.now() - started).toBeLessThan(PROBE_LIMIT_MS)
        expect(pageChanged(await fx.watcher.quiet())).toEqual([])
      })
    })
  })

  /**
   * **결말을 묻는 간격은 늘어난다**(`services/lost-commit.ts`의 «커밋이 끝날 때까지 본다») — 잃은 COMMIT 여럿이 한꺼번에 돌 때 묻는
   * 질의가 풀을 덜 채우게. 한도를 넘겨 도는 COMMIT 하나에서 결말을 묻는 질의를 센다. 간격이 `LOST_COMMIT_POLL_MS`에서 두 배씩
   * `LOST_COMMIT_POLL_MAX_MS`까지 늘면 한도 동안 묻는 수는 `maxPolls()`(왕복을 0 으로 셈) 이하다 — 간격이 늘지 않으면(10ms 고정)
   * 한 건에 80 번 넘게 묻는다. 네 번 밑이면 간격이 상한에 닿기 전에 묻기를 멈췄거나 세는 자가 질의를 못 본 것이다.
   */
  it('결말을 묻는 간격은 늘어난다 — 한도를 넘겨 도는 COMMIT 하나에 묻는 수가 늘어나는 간격의 몫 이하다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await slowCommit(fx.pageId, 3_000, async () => {
        ctx.proxy.halfCutOnQuery('commit')
        const polls = ctx.proxy.countQueries(XACT)
        await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_poll') } })
        expect(ctx.proxy.fired).toBe(true)
        expect(polls.count).toBeGreaterThanOrEqual(4)
        expect(polls.count).toBeLessThanOrEqual(maxPolls())
      })
    })
  })

  /**
   * **확인의 한도는 두 단계(결말 · 머리)가 한 마감을 나눠 쓴다**(`services/lost-commit.ts`의 «확인의 시간 한도»). 결말을 한도
   * 끝 가까이에서 알면 머리를 읽을 몫은 남은 만큼뿐이다 — 단계마다 한도를 새로 주면 응답이 한도의 두 배까지 늦는다. COMMIT 을
   * 950ms 늦춰 결말을 한도 끝에서 알게 하고, 머리를 읽는 질의를 붙잡는다.
   */
  it('결말을 한도 끝에서 알면 머리를 읽는 몫은 남은 만큼이다 — 503 이 한도 안에 난다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await slowCommit(fx.pageId, 950, async () => {
        ctx.proxy.halfCutOnQuery('commit')
        const probe = ctx.proxy.holdQuery(PROBE, 5_000)
        let probed = false
        void probe.held.then(
          () => {
            probed = true
          },
          () => undefined,
        )
        try {
          const started = Date.now()
          const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_edge') } })
          const elapsed = Date.now() - started
          expect(ctx.proxy.fired).toBe(true)
          // 결말(`committed`)을 한도 안에 알고 머리를 읽으러 갔다 — 판이 섰다.
          expect(probed).toBe(true)
          expect(res.statusCode, res.body).toBe(503)
          expect(elapsed).toBeLessThan(PROBE_LIMIT_MS)
          expect(await revisionSeqs(fx.pageId)).toEqual([1])
        } finally {
          probe.release()
        }
      })
    })
  })

  it.each([
    ['커밋을 묻는 질의', XACT],
    ['머리를 읽는 질의', PROBE],
  ])('확인이 1초 안에 안 끝나면 503 «모름»이다 — %s', async (_, fragment) => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      ctx.proxy.delayQuery(fragment, 3_000)
      const started = Date.now()
      const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_slow') } })
      const elapsed = Date.now() - started
      expect(res.statusCode, res.body).toBe(503)
      expect(elapsed).toBeLessThan(PROBE_LIMIT_MS)
      // 커밋은 됐다 — 그래서 «모름»이 참이다(«확정 실패»가 아니다).
      expect(await revisionSeqs(fx.pageId)).toEqual([1])
    })
  })

  /**
   * **확인이 한도를 넘기면 그 연결째 버린다**(`db/client.ts`의 `readWithin`). 기다리기만 멈추면 그 연결이 응답 뒤에도 풀 칸을
   * 쥐고, 되풀이되면 풀이 차서 모든 요청이 503 이다. 확인 질의를 프록시가 **붙잡는다**(분할의 흉내 — 죽은 연결에 보낸 질의는 답이
   * 없다). 칸은 앱의 풀을 직접 읽는다 — `withProxiedRealApi`는 풀을 내놓지 않아 여기서 앱을 세운다.
   */
  it('확인이 한도를 넘기면 그 연결을 버린다 — 응답 뒤에 풀 칸을 쥐지 않는다', async () => {
    const proxy = await startFaultProxy(TEST_DATABASE_URL)
    const pool = createPool(proxy.url, () => undefined)
    const db = createDb(pool)
    const app = await buildApp({ db, config: testConfig() })
    const held: { release: () => void }[] = []
    try {
      const ctx = { app, db }
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const opsUrl = `/api/projects/${project.id}/pages/${page.id}/ops`
      // 두 확인 질의를 번갈아 붙잡는다 — 커밋을 묻는 질의 · 머리를 읽는 질의.
      for (let seq = 0; seq < 4; seq += 1) {
        proxy.dropCommitReplyAfter('insert into "revisions"')
        held.push(proxy.holdQuery(seq % 2 === 0 ? XACT : PROBE))
        const res = await app.inject({ method: 'PATCH', url: opsUrl, cookies: owner.cookie, payload: { baseSeq: seq, ops: addText(`n_${seq}`) } })
        expect(res.statusCode, res.body).toBe(503)
        // 응답이 나간 뒤 쥔 칸이 없다 — 붙잡힌 확인 질의의 연결은 풀을 떠났다.
        expect(pool.totalCount - pool.idleCount).toBe(0)
      }
      expect(await revisionSeqs(page.id)).toEqual([1, 2, 3, 4])
    } finally {
      for (const hold of held) hold.release()
      await app.close()
      await db.destroy()
      await proxy.close()
    }
  })

  /**
   * **확인했을 때 그 revision 이 머리가 아니면 방송하지 않는다.** 그 사이 남의 revision(2)이 커밋돼 방송됐으면 룸은 2 에서
   * 이미 1 을 놓친 것을 안다(`gap`) — 늦게 온 1 을 웹은 «다음 번호»로 얹어, 2 가 빠진 화면을 최신으로 둔다(`routes/comments.ts`의
   * `rebroadcastPostRevision`과 같은 조건). 확인 질의를 늦춰 그 사이에 남의 편집을 커밋시킨다.
   */
  it('확인 전에 남의 revision 이 머리가 되면 200 이지만 옛 revision 을 방송하지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      ctx.proxy.delayQuery(PROBE, 700)
      const mine = ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_mine') } })
      const deadline = Date.now() + 5_000
      while ((await revisionSeqs(fx.pageId)).length === 0) {
        if (Date.now() > deadline) throw new Error('내 편집이 커밋되지 않았다 — 시나리오가 성립하지 않았다')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      const peer = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.peer.cookie, payload: { baseSeq: 1, ops: addText('n_peer') } })
      expect(peer.statusCode, peer.body).toBe(200)

      const res = await mine
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ seq: 1 })
      await fx.watcher.quiet()
      expect(pageChanged(fx.watcher.received).map((frame) => frame.seq)).toEqual([2])
    })
  })
})
