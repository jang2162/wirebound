/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withProxiedRealApi`를 쓴다.
 *
 * **한도(`LOST_COMMIT_PROBE_MS`)를 넘겨 늦게 커밋된 편집 · 게시는 번호 없는 `page-stale { pageId }`를 룸에 낸다**(`services/lost-commit.ts`의 «늦게 커밋된
 * 편집 · 게시» · `ws/notify.ts`의 `pageStaleOnLateCommit`). 그 revision 의 `page-changed`는 늦게 내지 않는다 — 그 사이 더 나아간 머리가 있으면 받는 쪽이 옛 `seq`를
 * «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다. COMMIT 은 `DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`으로 늦추고 api 쪽 연결만 끊는다
 * (`halfCutOnQuery`) — 커밋은 되는데 응답은 503 «모름»이다.
 *
 * **입구 × 값의 출처.** 편집은 `PATCH …/ops` · WS `patch` · `PUT …/schema`, 게시는 코멘트 `POST` · `DELETE` · `renumber` — `runEditTransaction` · `runRevisionTransaction`을
 * 부르는 자리 전부다. 복원은 `page-stale`을 내지 않는다 — 복원이 바꾸는 것은 페이지 하나가 아니라서 이 신호의 단추(그 페이지만 다시 읽는다)가 거짓이 된다.
 *
 * **변조와 죽는 케이스**(백업 → 한 곳 치환 → 이 파일만 → `cmp` 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `services/lost-commit.ts` 의 늦은 커밋 갈래(`late.watch.add`)를 뗀다 | 늦은 커밋 케이스 전부(`page-stale`이 안 온다) · 제때 커밋 대조군은 산다 |
 * | `ws/notify.ts` 의 `pageStaleOnLateCommit` 이 아무 것도 안 보낸다 | 늦은 커밋 케이스 전부 |
 * | `notifyPageStale` 이 낸 연결을 뺀다(`except`를 단다) | 「낸 연결도 받는다」 |
 * | `routes/pages.ts` 의 `PATCH …/ops` 가 `late` 를 안 넘긴다 | 「PATCH …/ops」 **혼자** |
 * | 같은 모양으로 `PUT …/schema` · `ws/patch.ts` · 코멘트 `runWrite` | 각각의 입구 케이스 **혼자** |
 * | 늦은 커밋이 `page-changed`도 낸다(번호 프레임을 늦게 보낸다) | 「번호 이음 프레임은 안 나간다」 |
 * | 제때 커밋에도 `page-stale`을 낸다 | 「제때 커밋은 안 낸다」 |
 */
import { sql } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOST_COMMIT_PROBE_MS } from '../src/services/lost-commit'
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
import type { WsProbe } from './ws-client'
import { joinRoom } from './ws-client'

afterEach(async () => {
  await resetRealData()
})

type PageStale = Extract<ServerFrame, { type: 'page-stale' }>
const pageStale = (frames: readonly ServerFrame[]): PageStale[] => frames.filter((frame): frame is PageStale => frame.type === 'page-stale')
const pageChanged = (frames: readonly ServerFrame[]) => frames.filter((frame) => frame.type === 'page-changed')

/** 한도를 넘기되 지켜보기(`LOST_COMMIT_LATE_MS`) 안에서 커밋되는 늦춤. */
const LATE_COMMIT_MS = LOST_COMMIT_PROBE_MS + 1_000
/** 늦은 커밋을 지켜보는 간격(`LOST_COMMIT_LATE_POLL_MS`)까지 얹은, `page-stale` 을 기다리는 한도. */
const STALE_WAIT_MS = LATE_COMMIT_MS + 6_000

/** 그 페이지의 revision 행이 설 때 COMMIT 을 `ms` 늦춘다 — `DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`. */
async function slowCommit<T>(pageId: string, ms: number, run: () => Promise<T>): Promise<T> {
  const db = getTestDb()
  await sql
    .raw(
      `create or replace function zz_slow_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(${ms / 1000}); return null; end $$`,
    )
    .execute(db)
  await sql
    .raw(
      `create constraint trigger zz_slow_commit after insert on revisions deferrable initially deferred for each row when (new.page_id = '${pageId}') execute function zz_slow_commit()`,
    )
    .execute(db)
  try {
    return await run()
  } finally {
    await sql`drop trigger if exists zz_slow_commit on revisions`.execute(db)
    await sql`drop function if exists zz_slow_commit()`.execute(db)
  }
}

async function headSeq(pageId: string): Promise<number> {
  const { rows } = await sql<{ seq: number }>`select head_seq::int as seq from pages where id = ${pageId}`.execute(getTestDb())
  return rows[0]!.seq
}

/** 노드 둘이 든 페이지 · 낸 사람(방에 붙음) · 지켜보는 사람(방에 붙음) · 같은 프로젝트의 viewer · 다른 프로젝트의 구경꾼. */
async function fixture(ctx: ProxiedRealApi) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const viewer = await signup(ctx)
  const stranger = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  const strangerProject = await createProject(ctx, stranger.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const pageUrl = `/api/projects/${project.id}/pages/${page.id}`
  const put = await ctx.app.inject({
    method: 'PUT',
    url: `${pageUrl}/schema`,
    cookies: owner.cookie,
    payload: {
      schema: {
        version: 1,
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
  const author = await joinRoom(ctx.port, project.id, owner.cookie.wb_session)
  const watcher = await joinRoom(ctx.port, project.id, peer.cookie.wb_session)
  const viewerTab = await joinRoom(ctx.port, project.id, viewer.cookie.wb_session)
  const outsider = await joinRoom(ctx.port, strangerProject.id, stranger.cookie.wb_session)
  return {
    owner,
    author,
    watcher,
    viewerTab,
    outsider,
    projectId: project.id,
    pageId: page.id,
    pageUrl,
    opsUrl: `${pageUrl}/ops`,
    authorConnectionId: (await author.waitFor('joined')).connectionId,
  }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

const addText = (id: string) => [{ op: 'add', path: '/root/children/-', value: { id, type: 'Text', props: {} } }]

/** 늦은 커밋을 만든다 — 응답은 503 이고 커밋은 `LATE_COMMIT_MS` 뒤에 된다. `run`은 그 요청을 낸다. */
async function lateWrite(ctx: ProxiedRealApi, fx: Fixture, run: () => Promise<number>): Promise<{ status: number; before: number }> {
  const before = await headSeq(fx.pageId)
  return slowCommit(fx.pageId, LATE_COMMIT_MS, async () => {
    ctx.proxy.halfCutOnQuery('commit')
    const status = await run()
    expect(ctx.proxy.fired).toBe(true)
    return { status, before }
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 그 페이지의 머리가 `seq` 가 될 때까지 — 늦은 커밋이 닿았는지를 DB 의 값으로 기다린다(프레임을 기다리지 않는다). */
async function committed(fx: Fixture, seq: number): Promise<void> {
  await vi.waitFor(async () => expect(await headSeq(fx.pageId)).toBe(seq), { timeout: STALE_WAIT_MS, interval: 50 })
}

/**
 * 늦게 커밋돼 `page-stale` 이 오기까지 기다린 뒤 값을 확인한다 — 커밋됐고(머리가 올랐고) 프레임이 정확히 이 모양이다.
 *
 * **프레임을 던지는 기다림으로 기다리지 않는다** — 신호가 안 오는 고장이 «프레임이 N 개까지 차지 않았습니다» 시간 초과로 죽으면 단언 값이 아니다. 커밋은 DB 의 값으로 기다리고
 * (`committed`), 그 뒤 지켜보기가 낼 몫만 짧게 기다린 다음 프레임 목록을 견준다 — 안 오면 `[]` 와 견준 값 차이로 죽는다.
 */
async function expectStale(fx: Fixture, probe: WsProbe, before: number, count = 1): Promise<void> {
  await committed(fx, before + count)
  const until = Date.now() + 4_000
  while (pageStale(probe.received).length < count && Date.now() < until) await sleep(50)
  expect(pageStale(probe.received)).toEqual(
    Array.from({ length: count }, () => ({ type: 'page-stale', projectId: fx.projectId, pageId: fx.pageId })),
  )
}

describe('늦게 커밋된 편집 · 게시 — 번호 없는 page-stale', () => {
  it('PATCH …/ops — 503 «모름» 뒤 커밋되면 지켜보는 사람이 page-stale 을 받는다 · 프레임은 번호 · actor 없이 그 셋뿐이다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await fx.watcher.quiet()
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: fx.opsUrl,
          cookies: fx.owner.cookie,
          payload: { baseSeq: await headSeq(fx.pageId), ops: addText('n_late') },
        })
        return res.statusCode
      })
      expect(status).toBe(503)
      await expectStale(fx, fx.watcher, before)
    })
  }, 40_000)

  it('PATCH …/ops — 번호 이음 프레임(page-changed)은 늦게도 안 나간다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const mark = fx.watcher.received.length
      const { before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: fx.opsUrl,
          cookies: fx.owner.cookie,
          payload: { baseSeq: await headSeq(fx.pageId), ops: addText('n_late') },
        })
        return res.statusCode
      })
      await expectStale(fx, fx.watcher, before)
      // 커밋 뒤 지켜보기가 다음 묻기까지 돈 뒤에도 번호 프레임이 없다.
      await fx.watcher.quiet(1_200)
      expect(pageChanged(fx.watcher.received.slice(mark))).toEqual([])
    })
  }, 40_000)

  it('낸 사람의 연결도 받는다 — 발신 연결 id 를 실어도 빠지지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const { before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: fx.opsUrl,
          cookies: fx.owner.cookie,
          headers: { 'x-wb-connection-id': fx.authorConnectionId },
          payload: { baseSeq: await headSeq(fx.pageId), ops: addText('n_late') },
        })
        return res.statusCode
      })
      await expectStale(fx, fx.author, before)
      await expectStale(fx, fx.watcher, before)
    })
  }, 40_000)

  it('viewer 도 받고 다른 프로젝트의 연결은 못 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const { before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: fx.opsUrl,
          cookies: fx.owner.cookie,
          payload: { baseSeq: await headSeq(fx.pageId), ops: addText('n_late') },
        })
        return res.statusCode
      })
      await expectStale(fx, fx.viewerTab, before)
      expect(pageStale(await fx.outsider.quiet(500))).toEqual([])
    })
  }, 40_000)

  it('PUT …/schema — 503 «모름» 뒤 커밋되면 page-stale 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'PUT',
          url: `${fx.pageUrl}/schema`,
          cookies: fx.owner.cookie,
          payload: { schema: { version: 1, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_c', type: 'Text', props: {} }] } } },
        })
        return res.statusCode
      })
      expect(status).toBe(503)
      await expectStale(fx, fx.watcher, before)
    })
  }, 40_000)

  it('WS patch — 503 patch-error 뒤 커밋되면 page-stale 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      await slowCommit(fx.pageId, LATE_COMMIT_MS, async () => {
        ctx.proxy.halfCutOnQuery('commit')
        fx.author.send(
          JSON.stringify({ type: 'patch', pageId: fx.pageId, baseSeq: before, ops: addText('n_ws_late'), clientOpId: 'op_ws_late' }),
        )
        const error = await fx.author.waitFor('patch-error', 10_000)
        expect(ctx.proxy.fired).toBe(true)
        expect(error).toMatchObject({ clientOpId: 'op_ws_late', status: 503 })
      })
      await expectStale(fx, fx.watcher, before)
      // 낸 사람의 연결도 받는다.
      await expectStale(fx, fx.author, before)
    })
  }, 40_000)

  it('코멘트 게시 — 503 «모름» 뒤 커밋되면 page-stale 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `${fx.pageUrl}/comments`,
          cookies: fx.owner.cookie,
          payload: { nodeId: 'n_a', body: '말' },
        })
        return res.statusCode
      })
      expect(status).toBe(503)
      await expectStale(fx, fx.watcher, before)
    })
  }, 40_000)

  it('코멘트 삭제 — 마지막 코멘트의 번호를 지우는 revision 이 늦게 커밋되면 page-stale 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const posted = await ctx.app.inject({
        method: 'POST',
        url: `${fx.pageUrl}/comments`,
        cookies: fx.owner.cookie,
        payload: { nodeId: 'n_a', body: '말' },
      })
      expect(posted.statusCode, posted.body).toBe(201)
      const commentId = posted.json().comment.id as string
      await fx.watcher.waitFor('page-changed')
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({ method: 'DELETE', url: `${fx.pageUrl}/comments/${commentId}`, cookies: fx.owner.cookie })
        return res.statusCode
      })
      expect(status).toBe(503)
      await expectStale(fx, fx.watcher, before)
    })
  }, 40_000)

  it('코멘트 재번호 — 503 «모름» 뒤 커밋되면 page-stale 을 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 뒤 노드에 먼저 달아 문서 순서와 번호가 어긋나게 한다(n_a = 2 · n_b = 1).
      for (const nodeId of ['n_b', 'n_a']) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `${fx.pageUrl}/comments`,
          cookies: fx.owner.cookie,
          payload: { nodeId, body: `${nodeId}의 말` },
        })
        expect(res.statusCode, res.body).toBe(201)
      }
      await fx.watcher.waitForCount('page-changed', 2)
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({ method: 'POST', url: `${fx.pageUrl}/comments/renumber`, cookies: fx.owner.cookie })
        return res.statusCode
      })
      expect(status).toBe(503)
      await expectStale(fx, fx.watcher, before)
    })
  }, 40_000)

  it('늦은 커밋이 둘이면 page-stale 도 둘이다 — 늦은 커밋마다 한 번', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      await slowCommit(fx.pageId, LATE_COMMIT_MS, async () => {
        for (const id of ['n_one', 'n_two']) {
          ctx.proxy.halfCutOnQuery('commit')
          const res = await ctx.app.inject({
            method: 'PATCH',
            url: fx.opsUrl,
            cookies: fx.owner.cookie,
            payload: { baseSeq: await headSeq(fx.pageId), ops: addText(id) },
          })
          expect(ctx.proxy.fired).toBe(true)
          expect(res.statusCode).toBe(503)
          // 첫 커밋이 끝나야 둘째가 이어 선다(같은 페이지 행) — 둘째 요청의 `baseSeq` 도 그 뒤 번호여야 한다.
          await committed(fx, before + (id === 'n_one' ? 1 : 2))
        }
      })
      await expectStale(fx, fx.watcher, before, 2)
    })
  }, 60_000)
})

describe('page-stale 이 안 나가는 판 — 대조군', () => {
  it('한도 안에 커밋이 확인된 편집은 page-changed 만 나가고 page-stale 은 없다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      await slowCommit(fx.pageId, 300, async () => {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: fx.opsUrl,
          cookies: fx.owner.cookie,
          payload: { baseSeq: before, ops: addText('n_timely') },
        })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode, res.body).toBe(200)
      })
      expect(await fx.watcher.waitFor('page-changed')).toMatchObject({ seq: before + 1 })
      expect(pageStale(await fx.watcher.quiet(LATE_COMMIT_MS + 1_000))).toEqual([])
    })
  }, 40_000)

  it('답을 안 잃은 편집(제때 커밋)은 page-stale 이 없다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: fx.opsUrl,
        cookies: fx.owner.cookie,
        payload: { baseSeq: await headSeq(fx.pageId), ops: addText('n_plain') },
      })
      expect(res.statusCode, res.body).toBe(200)
      await fx.watcher.waitFor('page-changed')
      expect(pageStale(await fx.watcher.quiet(1_200))).toEqual([])
    })
  }, 40_000)

  it('커밋 안 된 것을 확인한 편집(500 «반영되지 않았다»)은 page-stale 이 없다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      ctx.proxy.dropOnQuery('commit')
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: fx.opsUrl,
        cookies: fx.owner.cookie,
        payload: { baseSeq: before, ops: addText('n_gone') },
      })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(500)
      expect(pageStale(await fx.watcher.quiet(1_500))).toEqual([])
      expect(await headSeq(fx.pageId)).toBe(before)
    })
  }, 40_000)

  it('한도 안에 결말이 안 났고 끝내 커밋도 안 된 판(되돌려짐)은 page-stale 이 없다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeq(fx.pageId)
      // COMMIT 을 늦추되 그 안에서 던져 되돌린다 — 늦은 커밋이 아니라 늦은 되돌림이다.
      const db = getTestDb()
      await sql
        .raw(
          `create or replace function zz_slow_fail() returns trigger language plpgsql as $$ begin perform pg_sleep(${LATE_COMMIT_MS / 1000}); raise exception 'zz late rollback'; end $$`,
        )
        .execute(db)
      await sql
        .raw(
          `create constraint trigger zz_slow_fail after insert on revisions deferrable initially deferred for each row when (new.page_id = '${fx.pageId}') execute function zz_slow_fail()`,
        )
        .execute(db)
      try {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: fx.opsUrl,
          cookies: fx.owner.cookie,
          payload: { baseSeq: before, ops: addText('n_rolled') },
        })
        expect(res.statusCode).toBeGreaterThanOrEqual(500)
        expect(pageStale(await fx.watcher.quiet(LATE_COMMIT_MS + 1_500))).toEqual([])
        expect(await headSeq(fx.pageId)).toBe(before)
      } finally {
        await sql`drop trigger if exists zz_slow_fail on revisions`.execute(db)
        await sql`drop function if exists zz_slow_fail()`.execute(db)
      }
    })
  }, 40_000)
})
