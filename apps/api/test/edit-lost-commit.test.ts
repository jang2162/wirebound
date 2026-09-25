/**
 * **COMMIT 답을 잃은 편집을 서버가 그 자리에서 확인한다**(`services/lost-commit.ts`의 `runEditTransaction`).
 *
 * 편집(`PATCH .../ops` · WS `patch`)의 COMMIT 이 Postgres 에서 커밋됐는데 그 답만 잃으면 핸들러는 결과를 모른다. 그때 새 연결로
 * 그 편집의 revision(트랜잭션 안에서 이미 id 를 안다)이 보이는지 본다 — 보이면 커밋됐으므로 **성공으로 답하고**, 그 revision 이
 * 아직 페이지의 머리면 **방송한다.** 안 보이거나 확인하지 못하면 원래대로 503 «모름»이다.
 *
 * 진짜 Postgres 앞의 TCP 프록시(`pg-fault-proxy.ts`)가 COMMIT 답을 끊는다 — 커밋은 된다.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { buildApp } from '../src/app'
import { createDb, createPool } from '../src/db/client'
import { DB_UNREACHABLE_WRITE_MESSAGE } from '../src/http/error-handler'
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

  it('COMMIT 이 서버에 안 닿았으면 revision 이 없다 — 503 «모름» 그대로 · 방송 없음', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropOnQuery('commit')
      const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_gone') } })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(503)
      expect(res.json().error.message).toBe(DB_UNREACHABLE_WRITE_MESSAGE)
      expect(await revisionSeqs(fx.pageId)).toEqual([])
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })

  /**
   * **«안 보인다»면 한 번 더 본다**(`services/lost-commit.ts`의 `probeCommit`). COMMIT 을 서버에 넘기자마자 api 쪽 연결만
   * 끊기면(`halfCutOnQuery`) 확인이 그 COMMIT 보다 먼저 닿을 수 있다 — 끊긴 연결의 COMMIT 이 아직 돈다. COMMIT 을 20ms 늦춘다
   * (그 페이지의 revision 에만 거는 `DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`). 한 번만 보면 503 «모름»이다.
   */
  it('끊긴 연결의 COMMIT 이 아직 돌면 한 번 더 본다 — 커밋되면 200 이고 룸이 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const db = getTestDb()
      await sql.raw(`create or replace function zz_slow_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(0.02); return null; end $$`).execute(db)
      await sql.raw(
        `create constraint trigger zz_slow_commit after insert on revisions deferrable initially deferred for each row when (new.page_id = '${fx.pageId}') execute function zz_slow_commit()`,
      ).execute(db)
      try {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_late') } })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toMatchObject({ seq: 1 })
        expect(await fx.watcher.waitFor('page-changed')).toMatchObject({ seq: 1 })
      } finally {
        await sql`drop trigger if exists zz_slow_commit on revisions`.execute(db)
        await sql`drop function if exists zz_slow_commit()`.execute(db)
      }
    })
  })

  it('확인이 1초 안에 안 끝나면 503 «모름»이다 — 확인이 답을 붙잡지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      ctx.proxy.delayQuery(PROBE, 3_000)
      const started = Date.now()
      const res = await ctx.app.inject({ method: 'PATCH', url: fx.opsUrl, cookies: fx.owner.cookie, payload: { baseSeq: 0, ops: addText('n_slow') } })
      const elapsed = Date.now() - started
      expect(res.statusCode, res.body).toBe(503)
      expect(elapsed).toBeLessThan(2_500)
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
      for (let seq = 0; seq < 3; seq += 1) {
        proxy.dropCommitReplyAfter('insert into "revisions"')
        held.push(proxy.holdQuery(PROBE))
        const res = await app.inject({ method: 'PATCH', url: opsUrl, cookies: owner.cookie, payload: { baseSeq: seq, ops: addText(`n_${seq}`) } })
        expect(res.statusCode, res.body).toBe(503)
        // 응답이 나간 뒤 쥔 칸이 없다 — 붙잡힌 확인 질의의 연결은 풀을 떠났다.
        expect(pool.totalCount - pool.idleCount).toBe(0)
      }
      expect(await revisionSeqs(page.id)).toEqual([1, 2, 3])
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
