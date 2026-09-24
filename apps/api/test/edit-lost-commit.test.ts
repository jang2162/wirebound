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
  withProxiedRealApi,
  type ProxiedRealApi,
} from './helpers'
import { joinRoom } from './ws-client'

afterEach(async () => {
  await resetRealData()
})

type PageChanged = Extract<ServerFrame, { type: 'page-changed' }>
const pageChanged = (frames: ServerFrame[]): PageChanged[] => frames.filter((frame): frame is PageChanged => frame.type === 'page-changed')

/** 확인 질의가 싣는 글자 — 프록시가 그 질의만 늦추거나 끊는다(`repos/revisions.ts`의 `findRevisionCommit`). */
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
