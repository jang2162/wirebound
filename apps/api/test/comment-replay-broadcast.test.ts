/**
 * **COMMIT 답을 잃은 게시도 룸에 번호 프레임이 한 번은 간다** — 재생이 앞 요청이 못 한 방송을 잇는다.
 *
 * 게시가 노드에 새 번호를 붙이면 그 revision 을 `page-changed` 로 방송한다(`routes/comments.ts`의 `notifyMarkerChange`).
 * COMMIT 답을 잃으면 커밋은 됐는데 핸들러는 503 으로 끝나 방송하지 않는다. 웹은 같은 키로 다시 보내 **재생**(200)을 받는다 —
 * 재생이 방송하지 않으면 그 번호 프레임은 아무 연결에도 안 간다. 남의 화면은 다음 변경까지 낡고, 다음 프레임의 `seq` 가
 * 건너뛰어 «연결이 끊긴 사이의 변경을 놓쳐…»(웹의 `gap`)가 뜬다 — 원인이 틀린 문장이다.
 *
 * 재생은 앞 요청이 방송했는지 모른다 — 그래서 **다시 보낸다.** 받는 쪽은 `seq` 가 자기 `headSeq` 이하인 프레임을 건너뛰므로
 * (`apps/web/src/store/editor-store.ts`의 `applyRemoteChange` — `skipped`) 두 번 받아도 한 번 얹힌다.
 *
 * 진짜 Postgres 앞의 TCP 프록시(`pg-fault-proxy.ts`)가 게시의 COMMIT 답을 끊는다 — 커밋은 된다(`api-db-errors.test.ts`와 같은 절차).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { buildApp } from '../src/app'
import { createDb, createPool } from '../src/db/client'
import type { ServerFrame } from '../src/ws/protocol'
import { lockPageForEdit } from '../src/repos/pages'
import { withTransaction } from '../src/db/tx'
import {
  TEST_DATABASE_URL,
  addMember,
  getTestDb,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  testConfig,
  type RealApiContext,
} from './helpers'
import { startFaultProxy, type FaultProxy } from './pg-fault-proxy'
import { joinRoom } from './ws-client'

interface ProxiedRealApi extends RealApiContext {
  proxy: FaultProxy
}

/** 앱을 TCP 프록시 뒤의 풀 위에 세우고 **포트를 연다**(WS 가 붙는다). 쓰는 것은 진짜로 커밋된다 — 끝나면 지운다. */
async function withProxiedRealApi(fn: (ctx: ProxiedRealApi) => Promise<void>): Promise<void> {
  const proxy = await startFaultProxy(TEST_DATABASE_URL)
  const db = createDb(createPool(proxy.url, () => undefined))
  const app = await buildApp({ db, config: testConfig() })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (address === null || typeof address === 'string') throw new Error('포트를 열지 못했습니다')
  try {
    await fn({ app, db, port: address.port, proxy })
  } finally {
    await app.close()
    await db.destroy()
    await proxy.close()
  }
}

afterEach(async () => {
  await resetRealData()
})

type PageChanged = Extract<ServerFrame, { type: 'page-changed' }>

async function fixture(ctx: ProxiedRealApi) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const author = await joinRoom(ctx.port, project.id, owner.cookie.wb_session)
  const watcher = await joinRoom(ctx.port, project.id, peer.cookie.wb_session)
  return {
    owner,
    peer,
    author,
    watcher,
    url: `/api/projects/${project.id}/pages/${page.id}/comments`,
    projectId: project.id,
    pageId: page.id,
    rootNodeId: (page.schema as { root: { id: string } }).root.id,
  }
}

const pageChanged = (frames: ServerFrame[]): PageChanged[] => frames.filter((frame): frame is PageChanged => frame.type === 'page-changed')

describe('COMMIT 답을 잃은 게시의 번호 프레임', () => {
  it('재생이 앞 요청의 번호 프레임을 룸에 보낸다 — 남(과 쓴 사람)의 화면이 그 revision 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: fx.rootNodeId, body: '닿았던 말', idempotencyKey: 'replay-broadcast-1' }

      // 웹처럼 제 연결 id 를 싣는다 — 번호를 붙인 게시의 방송은 그 연결을 뺀다(`ws/notify.ts`의 `broadcastOrigin`).
      const { connectionId } = await fx.author.waitFor('joined')
      const headers = { 'x-wb-connection-id': connectionId }
      ctx.proxy.dropCommitReplyAfter('insert into "comments"')
      const first = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers, payload })
      expect(ctx.proxy.fired).toBe(true)
      expect(first.statusCode, first.body).toBe(503)
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])

      const again = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers, payload })
      expect(again.statusCode, again.body).toBe(200)

      const { rows } = await sql<{ seq: string; ops: unknown }>`select seq, ops from revisions where page_id = ${fx.pageId}`.execute(ctx.db)
      expect(rows).toHaveLength(1)
      const [revision] = rows
      for (const probe of [fx.watcher, fx.author]) {
        const frame = await probe.waitFor('page-changed')
        expect(frame).toMatchObject({ pageId: fx.pageId, seq: Number(revision?.seq), ops: revision?.ops })
      }
      // 한 번이다 — 재생 하나에 프레임 하나.
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
      expect(pageChanged(fx.watcher.received)).toHaveLength(1)
    })
  })

  /**
   * **뒤에 남의 revision 이 있으면 옛 번호 프레임을 다시 보내지 않는다.** 그 프레임을 놓친 연결은 남의 프레임(`seq` 2)에서 이미
   * `gap`이다 — 늦게 온 1 을 웹은 «다음 번호»로 얹고 `gap`을 풀어, 2 가 빠진 화면을 최신으로 둔다. 머리 조건(`routes/comments.ts`의
   * `rebroadcastPostRevision`)을 떼면 룸이 `[2, 1]`을 받는다. 위 첫 케이스가 그 조건이 «늘 안 보낸다»로 무너지는 것을 잡는다.
   */
  it('뒤에 남의 revision 이 있으면 재생은 옛 번호 프레임을 보내지 않는다 — 룸은 남의 것만 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: fx.rootNodeId, body: '닿았던 말', idempotencyKey: 'replay-broadcast-behind' }

      ctx.proxy.dropCommitReplyAfter('insert into "comments"')
      const first = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, payload })
      expect(first.statusCode, first.body).toBe(503)
      const edited = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.peer.cookie,
        payload: { baseSeq: 1, ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_peer', type: 'Text', props: {} } }] },
      })
      expect(edited.statusCode, edited.body).toBe(200)
      for (const probe of [fx.watcher, fx.author]) expect((await probe.waitFor('page-changed')).seq).toBe(2)

      const again = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, payload })
      expect(again.statusCode, again.body).toBe(200)
      for (const probe of [fx.watcher, fx.author]) {
        await probe.quiet()
        expect(pageChanged(probe.received).map((frame) => frame.seq)).toEqual([2])
      }
    })
  })

  /**
   * **권한을 잃은 사람의 재생은 200 이지만 룸에 프레임을 안 낸다** — 프레임을 내는 것은 룸에 쓰는 일이다(`routes/comments.ts`의
   * `passesPostGuardNow`). 앞 게시가 번호를 붙였고 그 revision 이 머리라, 이 판정을 떼면 재생마다 프레임이 하나씩 나간다.
   */
  it.each(['viewer 로 강등', '멤버에서 제외'] as const)('%s된 사람의 재생은 200 이고 룸에 프레임을 안 낸다', async (loss) => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: fx.rootNodeId, body: '빠지기 전의 말', idempotencyKey: 'replay-broadcast-lost' }
      const posted = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.peer.cookie, payload })
      expect(posted.statusCode, posted.body).toBe(201)
      await fx.author.waitFor('page-changed')

      const members = `/api/projects/${fx.projectId}/members/${fx.peer.user.id}`
      const lost = await ctx.app.inject(
        loss === 'viewer 로 강등'
          ? { method: 'PATCH', url: members, cookies: fx.owner.cookie, payload: { role: 'viewer' } }
          : { method: 'DELETE', url: members, cookies: fx.owner.cookie },
      )
      expect(lost.statusCode, lost.body).toBe(loss === 'viewer 로 강등' ? 200 : 204)
      await fx.author.quiet()

      const again = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.peer.cookie, payload })
      expect(again.statusCode, again.body).toBe(200)
      expect(pageChanged(await fx.author.quiet())).toEqual([])
      expect(pageChanged(fx.author.received)).toHaveLength(1)
    })
  })

  it('번호를 새로 붙이지 않은 게시의 재생은 아무것도 보내지 않는다 — 앞 요청이 문서를 안 바꿨다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 먼저 번호를 붙여 둔다 — 둘째 게시는 같은 노드라 번호가 이미 있다.
      const seed = await ctx.app.inject({
        method: 'POST',
        url: fx.url,
        cookies: fx.owner.cookie,
        payload: { nodeId: fx.rootNodeId, body: '먼저 단 말', idempotencyKey: 'replay-broadcast-seed' },
      })
      expect(seed.statusCode, seed.body).toBe(201)
      await fx.watcher.waitFor('page-changed')

      const payload = { nodeId: fx.rootNodeId, body: '닿았던 둘째 말', idempotencyKey: 'replay-broadcast-2' }
      ctx.proxy.dropCommitReplyAfter('insert into "comments"')
      expect((await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, payload })).statusCode).toBe(503)
      expect((await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, payload })).statusCode).toBe(200)

      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
      expect(pageChanged(fx.watcher.received)).toHaveLength(1)
    })
  })

  it('잠금 안에서 찾은 재생도 보낸다 — 같은 키 둘이 가드를 함께 지나 줄을 서면 뒤의 것이 잠금 안에서 재생한다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: fx.rootNodeId, body: '겹친 말', idempotencyKey: 'replay-broadcast-3' }
      const admin = getTestDb()

      // 페이지 행을 쥐어 둘을 줄에 세운다 — 둘 다 가드 앞 재생에서 행을 못 찾고 잠금 앞에 선다.
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      let acquired: () => void = () => {}
      const holding = new Promise<void>((resolve) => {
        acquired = resolve
      })
      const holder = withTransaction(admin, async (trx) => {
        await lockPageForEdit(trx, fx.projectId, fx.pageId)
        acquired()
        await held
      })
      await holding
      const posts = [0, 1].map(() => ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, payload }))
      const deadline = Date.now() + 5_000
      for (;;) {
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid
           where not l.granted and a.datname = current_database()
        `.execute(admin)
        if ((rows[0]?.n ?? 0) >= 2) break
        if (Date.now() > deadline) throw new Error('게시 둘이 잠금 앞에 서지 않았다 — 시나리오가 성립하지 않았다')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      release()
      await holder

      const statuses = (await Promise.all(posts)).map((res) => res.statusCode).sort()
      expect(statuses).toEqual([200, 201])
      // 201 이 한 번(발신 연결이 없으니 둘 다 받는다) · 잠금 안 재생이 한 번 더 — 같은 seq 둘이다.
      const frames = await fx.watcher.waitForCount('page-changed', 2)
      expect(new Set(frames.map((frame) => frame.seq)).size).toBe(1)
      expect(pageChanged(await fx.watcher.quiet())).toEqual([])
    })
  })
})
