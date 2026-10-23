/**
 * **COMMIT 답을 잃은 쓰기 — 편집 밖의 넷도 그 자리에서 확인한다**(`services/lost-commit.ts`).
 *
 * `PATCH .../ops` · WS `patch`는 `test/edit-lost-commit.test.ts`가 잰다. 여기는 revision(또는 복원의 안전망 스냅샷)을 남기는
 * 나머지 쓰기 넷이다 — `PUT .../schema` · 코멘트 삭제 · 재번호 · 복원. 커밋됐는데 답만 잃으면 새 연결로 그 트랜잭션의 결말을 묻고,
 * 커밋됐으면 원래 성공처럼 답하고 방송한다(편집 경로와 같은 표 — 페이지 방송은 그 revision 이 머리일 때만).
 *
 * 게시는 여기 없다 — 웹이 같은 멱등 키로 다시 보내 재생이 번호 프레임을 다시 보낸다(`test/comment-replay-broadcast.test.ts`).
 *
 * 진짜 Postgres 앞의 TCP 프록시(`pg-fault-proxy.ts`)가 COMMIT 답을 끊는다 — 커밋은 된다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'
import { DB_WRITE_NOT_APPLIED_MESSAGE } from '../src/services/lost-commit'
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

/** 노드 둘(`n_a` 가 앞)을 가진 페이지 · 방을 지켜보는 다른 멤버. */
async function fixture(ctx: ProxiedRealApi) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const pageUrl = `/api/projects/${project.id}/pages/${page.id}`
  const put = await ctx.app.inject({
    method: 'PUT',
    url: `${pageUrl}/schema`,
    cookies: owner.cookie,
    payload: {
      schema: {
        version: 3,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Text', props: {} },
            { id: 'n_b', type: 'Text', props: {} },
          ],
        },
      },
    },
  })
  expect(put.statusCode, put.body).toBe(200)
  const watcher = await joinRoom(ctx.port, project.id, peer.cookie.wb_session)
  await watcher.waitFor('joined')
  return { owner, watcher, projectId: project.id, pageId: page.id, pageUrl }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function post(ctx: ProxiedRealApi, fx: Fixture, nodeId: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `${fx.pageUrl}/comments`,
    cookies: fx.owner.cookie,
    payload: { nodeId, body: `${nodeId}의 말` },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().comment.id
}

/** 그 `seq`의 `page-changed`가 올 때까지 — `waitFor`는 이미 와 있는 첫 프레임을 돌려주므로 앞 쓰기의 것을 집는다. */
async function frameAt(watcher: Fixture['watcher'], seq: number): Promise<PageChanged> {
  await vi.waitFor(() => expect(pageChanged(watcher.received).map((frame) => frame.seq)).toContain(seq), { timeout: 5_000 })
  return pageChanged(watcher.received).find((frame) => frame.seq === seq)!
}

/** 확인 질의가 싣는 글자 — 프록시가 그 질의만 늦춘다(`repos/revisions.ts`의 `findRevisionCommitWithin`). */
const PROBE = 'as "committed"'

async function headSeq(pageId: string): Promise<number> {
  const { rows } = await sql<{ seq: number }>`select head_seq::int as seq from pages where id = ${pageId}`.execute(getTestDb())
  return rows[0]!.seq
}

describe('COMMIT 답을 잃은 쓰기', () => {
  it('PUT .../schema — 커밋을 확인하면 200 이고 룸이 그 revision 을 한 번 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      await fx.watcher.quiet()
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `${fx.pageUrl}/schema`,
        cookies: fx.owner.cookie,
        payload: { schema: { version: 3, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_c', type: 'Text', props: {} }] } } },
      })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ headSeq: before + 1 })
      expect(await frameAt(fx.watcher, before + 1)).toMatchObject({ pageId: fx.pageId, seq: before + 1 })
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })

  it('코멘트 삭제 — 마지막 코멘트의 번호를 지운 revision 을 확인하면 200 이고 룸이 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await post(ctx, fx, 'n_a')
      const before = await headSeq(fx.pageId)
      await fx.watcher.quiet()
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      const res = await ctx.app.inject({ method: 'DELETE', url: `${fx.pageUrl}/comments/${id}`, cookies: fx.owner.cookie })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toEqual({ seq: before + 1, markerOps: [{ op: 'remove', path: '/root/children/0/marker' }] })
      expect(await frameAt(fx.watcher, before + 1)).toMatchObject({ ops: [{ op: 'remove', path: '/root/children/0/marker' }] })
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })

  it('재번호 — 커밋을 확인하면 200 이고 룸이 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 뒤 노드에 먼저 달아 문서 순서와 번호가 어긋나게 한다(n_a = 2 · n_b = 1).
      await post(ctx, fx, 'n_b')
      await post(ctx, fx, 'n_a')
      const before = await headSeq(fx.pageId)
      await fx.watcher.quiet()
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      const res = await ctx.app.inject({ method: 'POST', url: `${fx.pageUrl}/comments/renumber`, cookies: fx.owner.cookie })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ seq: before + 1 })
      expect((await frameAt(fx.watcher, before + 1)).ops).toEqual(res.json().markerOps)
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })

  it('복원 — 커밋을 확인하면 200 이고 룸이 `restored` 를 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snap = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })
      expect(snap.statusCode, snap.body).toBe(201)
      await post(ctx, fx, 'n_a')
      await fx.watcher.quiet()
      ctx.proxy.dropCommitReplyAfter('insert into "snapshots"')
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${snap.json().id}/restore`,
        cookies: fx.owner.cookie,
      })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().safetySnapshot).toMatchObject({ id: expect.any(String) })
      expect(await fx.watcher.waitFor('restored')).toMatchObject({ projectId: fx.projectId, snapshotId: snap.json().id })
    })
  })

  /**
   * **확인했을 때 그 revision 이 머리가 아니면 방송하지 않는다** — 편집 경로와 같은 조건이다(`test/edit-lost-commit.test.ts`의
   * «확인 전에 남의 revision 이 머리가 되면»). 확인 질의를 늦춰 그 사이에 남의 편집을 커밋시킨다.
   */
  it('코멘트 삭제 — 확인 전에 남의 revision 이 머리가 되면 200 이지만 옛 revision 을 방송하지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await post(ctx, fx, 'n_a')
      const before = await headSeq(fx.pageId)
      await fx.watcher.quiet()
      const mark = fx.watcher.received.length
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      ctx.proxy.delayQuery(PROBE, 700)
      const mine = ctx.app.inject({ method: 'DELETE', url: `${fx.pageUrl}/comments/${id}`, cookies: fx.owner.cookie })
      const deadline = Date.now() + 5_000
      while ((await headSeq(fx.pageId)) === before) {
        if (Date.now() > deadline) throw new Error('삭제가 커밋되지 않았다 — 시나리오가 성립하지 않았다')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      const peer = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.pageUrl}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: before + 1, ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_peer', type: 'Text', props: {} } }] },
      })
      expect(peer.statusCode, peer.body).toBe(200)

      const res = await mine
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ seq: before + 1 })
      await fx.watcher.quiet()
      expect(pageChanged(fx.watcher.received.slice(mark)).map((frame) => frame.seq)).toEqual([before + 2])
    })
  })

  it('PUT .../schema — 확인 전에 남의 revision 이 머리가 되면 200 이지만 옛 revision 을 방송하지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      await fx.watcher.quiet()
      const mark = fx.watcher.received.length
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      ctx.proxy.delayQuery(PROBE, 700)
      const mine = ctx.app.inject({
        method: 'PUT',
        url: `${fx.pageUrl}/schema`,
        cookies: fx.owner.cookie,
        payload: { schema: { version: 3, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_c', type: 'Text', props: {} }] } } },
      })
      const deadline = Date.now() + 5_000
      while ((await headSeq(fx.pageId)) === before) {
        if (Date.now() > deadline) throw new Error('교체가 커밋되지 않았다 — 시나리오가 성립하지 않았다')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      const peer = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.pageUrl}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: before + 1, ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_peer', type: 'Text', props: {} } }] },
      })
      expect(peer.statusCode, peer.body).toBe(200)

      const res = await mine
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ headSeq: before + 1 })
      await fx.watcher.quiet()
      expect(pageChanged(fx.watcher.received.slice(mark)).map((frame) => frame.seq)).toEqual([before + 2])
    })
  })

  it('COMMIT 이 서버에 안 닿았으면 봉투 있는 500 «반영되지 않았다» · 방송 없음 — 코멘트 삭제', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await post(ctx, fx, 'n_a')
      const before = await headSeq(fx.pageId)
      await fx.watcher.quiet()
      ctx.proxy.dropOnQuery('commit')
      const res = await ctx.app.inject({ method: 'DELETE', url: `${fx.pageUrl}/comments/${id}`, cookies: fx.owner.cookie })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(500)
      expect(res.json()).toEqual({ error: { code: 'internal', message: DB_WRITE_NOT_APPLIED_MESSAGE } })
      expect(await headSeq(fx.pageId)).toBe(before)
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })
})
