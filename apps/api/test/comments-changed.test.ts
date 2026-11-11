/**
 * **코멘트 행이 바뀌면 룸에 `comments-changed` 가 간다** — 번호가 그대로인 쓰기(둘째 말 · 본문 고침 · 마지막이 아닌 삭제)에도
 * (`routes/comments.ts`의 `notifyCommentsChanged` · `ws/protocol.ts`의 그 갈래).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 쓰기마다 | 달기(번호 붙음 · 그대로) · 고치기 · 지우기(마지막 아님 · 마지막) 가운데 하나라도 신호가 없다 · 프레임이 `pageId` 밖의 것(본문 · 작성자)을 싣는다 · 낸 연결이 받는다 |
 * | 재번호 | 번호를 바꾼 재번호가 신호를 안 낸다(다른 페이지의 코멘트 토큰이 옛 번호에 머문다 — RV-TK L2) · 바꿀 것이 없는 재번호가 신호를 낸다 |
 * | 가드 앞 재생 | 같은 키로 다시 보낸 게시가 신호를 안 낸다(앞 요청이 답을 잃었으면 아무 연결에도 안 갔다) · 낸 연결을 뺀다 |
 * | 답을 잃은 게시 | 503 뒤 같은 키 재생이 남에게 신호를 안 낸다 — 가드 앞 재생의 신호를 떼면 «가드 앞 재생» 과 함께 죽는다(그 축은 «가드 앞 재생» 이 소유한다) |
 * | 잠금 안 재생 | 같은 키 둘이 줄을 서 뒤의 것이 잠금 안에서 재생할 때 신호를 안 낸다 |
 * | 권한을 잃은 재생 | 강등된 사람의 재생이 룸에 신호를 낸다 |
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { ServerFrame } from '../src/ws/protocol'
import { lockPageForEdit } from '../src/repos/pages'
import { withTransaction } from '../src/db/tx'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withProxiedRealApi,
  withRealApi,
  type RealApiContext,
} from './helpers'
import { joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

type CommentsChanged = Extract<ServerFrame, { type: 'comments-changed' }>

const commentsChanged = (frames: ServerFrame[]): CommentsChanged[] =>
  frames.filter((frame): frame is CommentsChanged => frame.type === 'comments-changed')

async function fixture(ctx: RealApiContext) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const reader = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  await addMember(ctx, project.id, reader.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const author = await joinRoom(ctx.port, project.id, owner.cookie.wb_session)
  const watcher = await joinRoom(ctx.port, project.id, peer.cookie.wb_session)
  const viewer = await joinRoom(ctx.port, project.id, reader.cookie.wb_session)
  const { connectionId } = await author.waitFor('joined')
  await watcher.waitFor('joined')
  await viewer.waitFor('joined')
  const pagePath = `/api/projects/${project.id}/pages/${page.id}`
  const seeded = await ctx.app.inject({
    method: 'PATCH',
    url: `${pagePath}/ops`,
    cookies: owner.cookie,
    payload: {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/-', value: { id: 'n_1', type: 'Text', props: {} } },
        { op: 'add', path: '/root/children/-', value: { id: 'n_2', type: 'Text', props: {} } },
      ],
    },
  })
  expect(seeded.statusCode, seeded.body).toBe(200)
  return {
    owner,
    peer,
    author,
    watcher,
    viewer,
    /** 웹처럼 제 연결 id 를 싣는다 — 방송이 그 연결을 뺀다(`ws/notify.ts`의 `broadcastOrigin`). */
    headers: { 'x-wb-connection-id': connectionId },
    url: `${pagePath}/comments`,
    projectId: project.id,
    pageId: page.id,
  }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

interface Signals {
  author: CommentsChanged[]
  watcher: CommentsChanged[]
  viewer: CommentsChanged[]
}

/**
 * 표시를 찍는다 — 돌려준 함수가 창 하나(`quiet`)를 더 기다린 뒤 **표시 뒤에** 각 연결이 받은 `comments-changed` 를 낸다. 걸음 **앞에** 찍는다 —
 * `quiet()` 만으로는 요청의 답보다 먼저 닿은 프레임을 못 센다(방송은 답을 기다리지 않는다).
 */
function mark(fx: Fixture): () => Promise<Signals> {
  const at = { author: fx.author.received.length, watcher: fx.watcher.received.length, viewer: fx.viewer.received.length }
  return async () => {
    await Promise.all([fx.author.quiet(), fx.watcher.quiet(), fx.viewer.quiet()])
    return {
      author: commentsChanged(fx.author.received.slice(at.author)),
      watcher: commentsChanged(fx.watcher.received.slice(at.watcher)),
      viewer: commentsChanged(fx.viewer.received.slice(at.viewer)),
    }
  }
}

describe('comments-changed', () => {
  it('달기 · 고치기 · 지우기마다 남의 연결이 신호 하나를 받고, 낸 연결은 안 받는다 — 신호는 페이지만 싣는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const one = { type: 'comments-changed', projectId: fx.projectId, pageId: fx.pageId }
      let since = mark(fx)
      const expectOne = async (step: string): Promise<void> => {
        expect({ step, ...(await since()) }).toEqual({ step, author: [], watcher: [one], viewer: [one] })
        since = mark(fx)
      }
      const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
        ctx.app.inject({ method, url, cookies: fx.owner.cookie, headers: fx.headers, ...(payload === undefined ? {} : { payload }) })

      const first = await send('POST', fx.url, { nodeId: 'n_1', body: '첫 말' })
      expect(first.statusCode, first.body).toBe(201)
      expect(first.json().markerOps).not.toEqual([])
      await expectOne('달기 · 번호 붙음')

      const second = await send('POST', fx.url, { nodeId: 'n_1', body: '둘째 말' })
      expect(second.statusCode, second.body).toBe(201)
      expect(second.json().markerOps).toEqual([])
      await expectOne('달기 · 번호 그대로')

      const firstId = first.json().comment.id as string
      const secondId = second.json().comment.id as string
      const edited = await send('PATCH', `${fx.url}/${firstId}`, { body: '첫 말 고침' })
      expect(edited.statusCode, edited.body).toBe(200)
      await expectOne('고치기')

      const notLast = await send('DELETE', `${fx.url}/${secondId}`)
      expect(notLast.statusCode, notLast.body).toBe(200)
      expect(notLast.json().markerOps).toEqual([])
      await expectOne('지우기 · 마지막 아님')

      const last = await send('DELETE', `${fx.url}/${firstId}`)
      expect(last.statusCode, last.body).toBe(200)
      expect(last.json().markerOps).not.toEqual([])
      await expectOne('지우기 · 마지막')
    })
  })

  it('번호를 바꾼 재번호는 신호를 낸다 — 다른 페이지의 토큰이 번호 색인을 다시 읽는다 · 바꿀 것이 없으면 안 낸다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 문서 차례와 거꾸로 번호를 붙인다 — `n_2` 가 1, `n_1` 이 2.
      for (const nodeId of ['n_2', 'n_1']) {
        const posted = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.peer.cookie, payload: { nodeId, body: nodeId } })
        expect(posted.statusCode, posted.body).toBe(201)
      }
      await fx.watcher.quiet()
      const since = mark(fx)
      const renumbered = await ctx.app.inject({ method: 'POST', url: `${fx.url}/renumber`, cookies: fx.peer.cookie })
      expect(renumbered.statusCode, renumbered.body).toBe(200)
      // 카나리아 — 재번호가 문서를 바꿨다.
      expect(renumbered.json().markerOps).not.toEqual([])
      await fx.watcher.waitFor('page-changed')
      const one = [{ type: 'comments-changed', projectId: fx.projectId, pageId: fx.pageId }]
      expect(await since()).toEqual({ author: one, watcher: one, viewer: one })

      // 다시 누르면 바꿀 것이 없다 — 신호도 없다.
      await fx.watcher.quiet()
      const again = mark(fx)
      const nothing = await ctx.app.inject({ method: 'POST', url: `${fx.url}/renumber`, cookies: fx.peer.cookie })
      expect(nothing.statusCode, nothing.body).toBe(200)
      expect(nothing.json().markerOps).toEqual([])
      expect(await again()).toEqual({ author: [], watcher: [], viewer: [] })
    })
  })

  it('같은 키로 다시 보낸 게시(가드 앞 재생)는 낸 연결까지 신호를 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: 'n_1', body: '두 번 보낸 말', idempotencyKey: 'comments-changed-replay' }
      const first = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers: fx.headers, payload })
      expect(first.statusCode, first.body).toBe(201)
      await fx.watcher.waitFor('comments-changed')
      await fx.watcher.quiet()
      const since = mark(fx)
      const again = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers: fx.headers, payload })
      expect(again.statusCode, again.body).toBe(200)
      const one = [{ type: 'comments-changed', projectId: fx.projectId, pageId: fx.pageId }]
      expect(await since()).toEqual({ author: one, watcher: one, viewer: one })
    })
  })

  it('COMMIT 답을 잃은 게시는 신호가 없고, 같은 키의 재생이 그것을 낸다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: 'n_1', body: '닿았던 말', idempotencyKey: 'comments-changed-lost' }
      let since = mark(fx)
      ctx.proxy.dropCommitReplyAfter('insert into "comments"')
      const first = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers: fx.headers, payload })
      expect(ctx.proxy.fired).toBe(true)
      expect(first.statusCode, first.body).toBe(503)
      expect((await since()).watcher).toEqual([])
      since = mark(fx)
      const again = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers: fx.headers, payload })
      expect(again.statusCode, again.body).toBe(200)
      expect((await since()).watcher).toEqual([{ type: 'comments-changed', projectId: fx.projectId, pageId: fx.pageId }])
    })
  })

  it('잠금 안에서 찾은 재생도 신호를 낸다 — 같은 키 둘이 줄을 서면 뒤의 것이 잠금 안에서 재생한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: 'n_1', body: '겹친 말', idempotencyKey: 'comments-changed-in-lock' }
      const since = mark(fx)
      const admin = getTestDb()
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
      // 연결 id 를 싣는다 — 201 의 신호는 낸 연결을 빼고, 잠금 안 재생의 신호는 안 뺀다. 낸 연결이 받은 수가 잠금 안 재생의 몫이다.
      const posts = [0, 1].map(() =>
        ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.owner.cookie, headers: fx.headers, payload }),
      )
      const deadline = Date.now() + 5_000
      for (;;) {
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid
           where not l.granted and a.datname = current_database() and a.pid <> pg_backend_pid()
        `.execute(admin)
        if ((rows[0]?.n ?? 0) >= 2) break
        if (Date.now() > deadline) throw new Error('게시 둘이 잠금 앞에 서지 않았다 — 판이 안 섰다')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      release()
      await holder
      expect((await Promise.all(posts)).map((res) => res.statusCode).sort()).toEqual([200, 201])
      const seen = await since()
      expect({ author: seen.author.length, watcher: seen.watcher.length }).toEqual({ author: 1, watcher: 2 })
    })
  })

  it('viewer 로 강등된 사람의 재생은 200 이고 룸에 신호를 안 낸다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const payload = { nodeId: 'n_1', body: '강등 전의 말', idempotencyKey: 'comments-changed-demoted' }
      const posted = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.peer.cookie, payload })
      expect(posted.statusCode, posted.body).toBe(201)
      const demoted = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/members/${fx.peer.user.id}`,
        cookies: fx.owner.cookie,
        payload: { role: 'viewer' },
      })
      expect(demoted.statusCode, demoted.body).toBe(200)
      await fx.author.waitFor('comments-changed')
      await fx.author.quiet()
      const since = mark(fx)
      const again = await ctx.app.inject({ method: 'POST', url: fx.url, cookies: fx.peer.cookie, payload })
      expect(again.statusCode, again.body).toBe(200)
      expect((await since()).author).toEqual([])
    })
  })
})
