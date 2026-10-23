/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withProxiedRealApi`를 쓴다.
 *
 * **한도(`LOST_COMMIT_PROBE_MS`)를 넘겨 늦게 커밋된 편집 · 게시는 번호 프레임이 아닌 `page-stale { pageId, seq? }`를 룸에 낸다 — `seq` 는 그 revision 의 번호 힌트(번호를 모르는 게시는 없다)**(`services/lost-commit.ts`의 «늦게 커밋된
 * 편집 · 게시» · `ws/notify.ts`의 `pageStaleOnLateCommit`). 그 revision 의 `page-changed`는 늦게 내지 않는다 — 그 사이 더 나아간 머리가 있으면 받는 쪽이 옛 `seq`를
 * «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다. COMMIT 은 `DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`으로 늦추고 api 쪽 연결만 끊는다
 * (`halfCutOnQuery`) — 커밋은 되는데 응답은 503 «모름»이다.
 *
 * **입구 × 값의 출처.** 편집은 `PATCH …/ops` · WS `patch` · `PUT …/schema`, 게시는 코멘트 `POST` · `DELETE` · `renumber` — `runEditTransaction` · `runRevisionTransaction`을
 * 부르는 자리 전부다. 복원은 `page-stale`을 내지 않는다 — 복원이 바꾸는 것은 페이지 하나가 아니라서 이 신호의 단추(그 페이지만 다시 읽는다)가 거짓이 된다. 대신
 * **제때 커밋과 같은 꼬리를 늦게 낸다**(`routes/snapshots.ts`의 `announceRestore` — 아래 «늦게 커밋된 복원»). **한도 안에 커밋이 확인됐는데 번호를 모르는 게시**(확인이
 * «모름» — `dropCommitReplyAfter`)는 503 응답 자리에서 같은 `page-stale`을 낸다(아래 «번호를 모르는 쓰기»).
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
 * | 복원 라우트가 `late`를 안 넘긴다 | 「늦게 커밋된 복원」 둘 — `restored` `[]` |
 * | `announceRestore`가 `menu-changed` · 잠금 놓기 · `theme-changed` 가운데 하나를 뺀다 | 그 프레임의 단언 **혼자**(`[]` · `'프레임 없음'`) |
 * | `runConfirmedTransaction`이 확인됐는데 «모름»인 판에 `late.onCommit`을 안 부른다 | 「번호를 모르는 쓰기」 **혼자** |
 * | `markerRevision` 이 문서를 안 바꾼 결과에 `NO_REVISION` 대신 `null`(«모름»)을 낸다(갈래를 다시 합친다) | 「문서를 안 바꾼 쓰기」 둘(한도 안 · 한도 넘김) |
 * | `runRevisionTransaction` 이 넘기는 `onCommit` 이 `NO_REVISION` 을 안 거른다 | 「문서를 안 바꾼 쓰기」 둘 — 응답 자리 · 지켜보기가 같은 `onCommit` 을 부른다 |
 * | 지켜보기 `onCommit` 이 힌트를 안 싣는다(`late.onCommit(null)`) · 틀린 번호를 싣는다 | `expectStale` 을 부르는 케이스 전부(`seq` 가 빠진 · 어긋난 프레임) · 게시 케이스는 산다(힌트가 원래 없다) |
 * | `ws/broadcast.ts` 의 `stillAllowed` 가 늘 참이다 | 「늦은 복원 · … 삭제」 둘 **만** — 닫힘 `null` · `restored` · `menu-changed` · `theme-changed` 각 1 |
 * | `deliver` 가 자격 없는 연결을 건너뛰기만 하고 안 닫는다 | 「늦은 복원 · … 삭제」 둘 **만** — 닫힘 `null` · 프레임은 `[]` 그대로 |
 * | `announceRestore` 가 잠금 놓기를 뺀다 | 「복원 — 503 …」 · 「둘째 복원이 되살린 페이지의 잠금」(빠지는 `locks` 가 `'프레임 없음'`) |
 * | `lock/store.ts` 가 `releasePages` 로 놓인 연결의 다음 `hold` 를 안 받는다 · 받되 `changed` 를 거짓으로 낸다 | 「둘째 복원이 되살린 페이지의 잠금」 **혼자** — 하트비트 뒤 `'프레임 없음'` |
 *
 * 하트비트의 되잡기는 첫 잡기와 같은 길이라(`ws/lock.ts`의 `settle`) 그 길의 알림을 통째로 떼면 판 만들기(`restoreFixture` 의 `locksWith`)부터 선다 —
 * 그래서 되잡기의 변조는 «`releasePages` 로 놓인 연결»에만 건다.
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
import { joinRoom, locksWith } from './ws-client'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function headSeq(pageId: string): Promise<number> {
  const { rows } = await sql<{ seq: number }>`select head_seq::int as seq from pages where id = ${pageId}`.execute(getTestDb())
  return rows[0]!.seq
}

/** 그 프로젝트의 스냅샷 수 — 복원이 커밋되면 안전망 스냅샷이 하나 선다. */
async function snapshotCount(projectId: string): Promise<number> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from snapshots where project_id = ${projectId}`.execute(getTestDb())
  return rows[0]!.n
}

/** 가장 새 스냅샷의 id — 복원 뒤에는 그 복원의 안전망 스냅샷이다(`repos/snapshots.ts`의 정렬과 같은 `created_at` 내림차순). */
async function newestSnapshotId(projectId: string): Promise<string> {
  const { rows } = await sql<{
    id: string
  }>`select id from snapshots where project_id = ${projectId} order by created_at desc limit 1`.execute(getTestDb())
  return rows[0]!.id
}

/** 지금 메뉴 트리 판 번호(`project_menu_revs`) — 복원 꼬리의 `menu-changed`가 싣는 값이다. */
async function menuRev(projectId: string): Promise<number> {
  const { rows } = await sql<{ rev: number }>`select rev::int as rev from project_menu_revs where project_id = ${projectId}`.execute(
    getTestDb(),
  )
  return rows[0]!.rev
}

/** 지금 테마 바인딩 판 번호(`projects.theme_rev`). */
async function themeRev(projectId: string): Promise<number> {
  const { rows } = await sql<{ rev: number }>`select theme_rev::int as rev from projects where id = ${projectId}`.execute(getTestDb())
  return rows[0]!.rev
}

const ofType = <T extends ServerFrame['type']>(frames: readonly ServerFrame[], type: T): Extract<ServerFrame, { type: T }>[] =>
  frames.filter((frame): frame is Extract<ServerFrame, { type: T }> => frame.type === type)

/**
 * `mark` 뒤에 온 그 종류의 프레임이 `count` 개가 될 때까지 짧게 기다리고 그 목록을 돌려준다 — **던지지 않는다**(`expectStale`과 같은 까닭: 안 오면 부르는 쪽의
 * `toEqual`이 값으로 죽는다). 지켜보기 간격(`LOST_COMMIT_LATE_POLL_MS`)보다 넉넉한 창이다.
 */
async function framesSince<T extends ServerFrame['type']>(
  probe: WsProbe,
  mark: number,
  type: T,
  count: number,
): Promise<Extract<ServerFrame, { type: T }>[]> {
  const until = Date.now() + 4_000
  while (ofType(probe.received.slice(mark), type).length < count && Date.now() < until) await sleep(50)
  return ofType(probe.received.slice(mark), type)
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
        version: 4,
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
async function expectStale(fx: Fixture, probe: WsProbe, before: number, count = 1, hint: 'seq' | 'none' = 'seq'): Promise<void> {
  await committed(fx, before + count)
  const until = Date.now() + 4_000
  while (pageStale(probe.received).length < count && Date.now() < until) await sleep(50)
  // 힌트(`seq`)는 그 쓰기가 남긴 revision 의 번호다 — 번호를 모르는 쓰기(게시)는 안 싣는다. 번호순으로 견준다(늦은 커밋 둘의 신호 차례는 지켜보기가 정한다).
  const received = [...pageStale(probe.received)].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  expect(received).toEqual(
    Array.from({ length: count }, (_, index) => ({
      type: 'page-stale',
      projectId: fx.projectId,
      pageId: fx.pageId,
      ...(hint === 'seq' ? { seq: before + index + 1 } : {}),
    })),
  )
}

describe('늦게 커밋된 편집 · 게시 — 번호 없는 page-stale', () => {
  it('PATCH …/ops — 503 «모름» 뒤 커밋되면 지켜보는 사람이 page-stale 을 받는다 · 프레임은 actor 없이 그 revision 의 seq 힌트까지 넷뿐이다', async () => {
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
          payload: { schema: { version: 4, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_c', type: 'Text', props: {} }] } } },
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
      await expectStale(fx, fx.watcher, before, 1, 'none')
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

/**
 * 복원 판 — 테마를 묶고 스냅샷을 뜬 뒤, 판에 없는 페이지를 하나 더 만들어 지켜보는 사람이 그 노드를 잠그고(복원 꼬리가 놓는다), 복원이 되돌릴
 * 편집을 하나 낸다(그 페이지의 revision 이 서야 커밋 늦춤 트리거가 돈다 — `slowCommit`).
 */
async function restoreFixture(ctx: ProxiedRealApi) {
  const fx = await fixture(ctx)
  // 테마 바인딩 — 판 3 복원이 꼬리에 `theme-changed`를 싣는 조건(`services/restore.ts`의 `RestoreResult.theme`).
  const bound = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.projectId}/theme`,
    cookies: fx.owner.cookie,
    payload: {
      themeId: 'system-admin',
      version: SYSTEM_ADMIN.version,
      tokens: { [SYSTEM_ADMIN.color.key]: '#123456' },
      rev: await themeRev(fx.projectId),
    },
  })
  expect(bound.statusCode, bound.body).toBe(200)
  const snap = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.projectId}/snapshots`,
    cookies: fx.owner.cookie,
    payload: { tag: 'v1' },
  })
  expect(snap.statusCode, snap.body).toBe(201)
  const snapshotId = snap.json().id as string
  // 판에 없는 페이지 — 복원이 지운다. 지켜보는 사람(editor)이 그 노드를 잠근다.
  const extraMenu = await createMenuNode(ctx, fx.owner.cookie, fx.projectId)
  const gone = await createPage(ctx, fx.owner.cookie, fx.projectId, extraMenu.id)
  const goneRoot = (gone.schema as { root: { id: string } }).root.id
  fx.watcher.send(JSON.stringify({ type: 'lock', pageId: gone.id, nodeId: goneRoot }))
  await locksWith(fx.watcher, goneRoot)
  // 복원이 되돌릴 편집.
  const edited = await ctx.app.inject({
    method: 'PATCH',
    url: fx.opsUrl,
    cookies: fx.owner.cookie,
    payload: { baseSeq: await headSeq(fx.pageId), ops: addText('n_after') },
  })
  expect(edited.statusCode, edited.body).toBe(200)
  await fx.watcher.waitFor('page-changed')
  await fx.watcher.quiet()
  await fx.author.quiet()
  return { ...fx, snapshotId, gonePageId: gone.id, goneRoot }
}

type RestoreFixture = Awaited<ReturnType<typeof restoreFixture>>

const restoreUrl = (fx: RestoreFixture, snapshotId = fx.snapshotId) => `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`

describe('늦게 커밋된 복원 — 제때 커밋과 같은 꼬리를 늦게 낸다', () => {
  it('복원 — 503 «모름» 뒤 커밋되면 restored · menu-changed · 지운 페이지 잠금 놓기 · theme-changed 가 나가고 page-stale 은 없다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await restoreFixture(ctx)
      const mark = fx.watcher.received.length
      const authorMark = fx.author.received.length
      const snapshotsBefore = await snapshotCount(fx.projectId)
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: restoreUrl(fx),
          cookies: fx.owner.cookie,
          headers: { 'x-wb-restore-id': 'r_late' },
        })
        return res.statusCode
      })
      expect(status).toBe(503)
      // 커밋됐다 — 복원의 revision 이 머리에 섰고 안전망 스냅샷이 하나 늘었다.
      await committed(fx, before + 1)
      expect(await snapshotCount(fx.projectId)).toBe(snapshotsBefore + 1)

      expect(await framesSince(fx.watcher, mark, 'restored', 1)).toEqual([
        {
          type: 'restored',
          projectId: fx.projectId,
          snapshotId: fx.snapshotId,
          safetySnapshotId: await newestSnapshotId(fx.projectId),
          clientRestoreId: 'r_late',
        },
      ])
      expect(await framesSince(fx.watcher, mark, 'menu-changed', 1)).toEqual([
        { type: 'menu-changed', projectId: fx.projectId, rev: await menuRev(fx.projectId) },
      ])
      expect(await framesSince(fx.watcher, mark, 'theme-changed', 1)).toMatchObject([
        {
          type: 'theme-changed',
          projectId: fx.projectId,
          themeId: 'system-admin',
          version: SYSTEM_ADMIN.version,
          rev: await themeRev(fx.projectId),
        },
      ])
      // 지운 페이지의 잠금을 놓았다 — 지켜보는 사람이 쥐던 하나가 목록에서 빠진다.
      const locks = await framesSince(fx.watcher, mark, 'locks', 1)
      expect(locks.at(-1)?.locks ?? '프레임 없음').toEqual([])
      // 낸 사람의 연결도 받는다.
      expect(await framesSince(fx.author, authorMark, 'restored', 1)).toMatchObject([
        { snapshotId: fx.snapshotId, clientRestoreId: 'r_late' },
      ])
      // 복원은 `page-stale`을 안 낸다 — 페이지 하나가 아니다.
      expect(pageStale(fx.watcher.received.slice(mark))).toEqual([])
    })
  }, 40_000)

  /**
   * 전제 (c) — 늦은 복원 뒤에 다른 복원이 먼저 커밋되면 늦은 꼬리는 제 트랜잭션의 옛 번호(`menuRev` · `theme.rev`)를 싣는다. 받는 쪽은 번호로 넘긴다
   * (`apps/web`의 `use-tree-commands.tsx` · `theme/project-theme.tsx`). 두 꼬리의 차례는 지켜보기 간격에 달려 정해지지 않는다 — 집합으로 견준다.
   */
  it('늦은 복원 뒤 다른 복원이 먼저 커밋되면 — 꼬리 둘이 저마다의 번호로 나간다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await restoreFixture(ctx)
      const snap2 = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v2' },
      })
      expect(snap2.statusCode, snap2.body).toBe(201)
      const mark = fx.watcher.received.length
      const menuBefore = await menuRev(fx.projectId)
      const themeBefore = await themeRev(fx.projectId)
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({ method: 'POST', url: restoreUrl(fx), cookies: fx.owner.cookie })
        return res.statusCode
      })
      expect(status).toBe(503)
      // 늦은 복원이 프로젝트 행을 쥔 채 커밋을 기다린다 — 둘째 복원은 그 뒤에 줄 서 제때 커밋된다.
      const second = await ctx.app.inject({ method: 'POST', url: restoreUrl(fx, snap2.json().id as string), cookies: fx.owner.cookie })
      expect(second.statusCode, second.body).toBe(200)
      await committed(fx, before + 2)
      const restored = await framesSince(fx.watcher, mark, 'restored', 2)
      const menus = await framesSince(fx.watcher, mark, 'menu-changed', 2)
      const themes = await framesSince(fx.watcher, mark, 'theme-changed', 2)
      // eslint-disable-next-line no-console
      console.log(
        `[전제 c] restored ${restored.map((f) => (f.snapshotId === fx.snapshotId ? 'v1(늦음)' : 'v2')).join(' → ')} · menu-changed rev ${menus.map((f) => f.rev).join(' → ')} · theme-changed rev ${themes.map((f) => f.rev).join(' → ')}`,
      )
      expect(restored.map((frame) => frame.snapshotId).sort()).toEqual([fx.snapshotId, snap2.json().id].sort())
      expect(menus.map((frame) => frame.rev).sort((a, b) => a - b)).toEqual([menuBefore + 1, menuBefore + 2])
      expect(themes.map((frame) => frame.rev).sort((a, b) => a - b)).toEqual([themeBefore + 1, themeBefore + 2])
      expect(await menuRev(fx.projectId)).toBe(menuBefore + 2)
    })
  }, 40_000)
})

/**
 * 늦은 커밋 지켜보기의 묻기(`createLateCommitWatch` — `unnest` 로 묶은 `pg_xact_status(x)`)에만 맞는 조각. 요청 안의 확인(`settleTransaction`의
 * `pg_xact_status($1::xid8)`)에는 안 맞는다 — 503 «모름»은 그대로 나고 늦은 꼬리만 삼키는 동안 미뤄진다.
 */
const LATE_PROBE = 'pg_xact_status(x)'

/** COMMIT 안에서 잠든(`slowCommit`의 `pg_sleep`) 백엔드 — 그 pid 와 xid8(`pg_xact_status`가 받는 꼴 · 지금 세대의 xid). */
async function sleepingCommit(): Promise<{ pid: number; xid: string }> {
  const db = getTestDb()
  let found: { pid: number; xid: string } | undefined
  await vi.waitFor(
    async () => {
      const { rows } = await sql<{ pid: number; xid: string | null }>`
        select pid, backend_xid::text as xid from pg_stat_activity
        where wait_event = 'PgSleep' and pid <> pg_backend_pid() and datname = current_database()
      `.execute(db)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.xid).not.toBeNull()
      found = { pid: rows[0]!.pid, xid: rows[0]!.xid! }
    },
    { timeout: 5_000, interval: 20 },
  )
  const { rows } = await sql<{ xid: string }>`
    select (((pg_snapshot_xmax(pg_current_snapshot())::text::bigint >> 32) << 32) + ${found!.xid}::bigint)::text as xid
  `.execute(db)
  return { pid: found!.pid, xid: rows[0]!.xid }
}

async function xactStatus(xid: string): Promise<string | null> {
  const { rows } = await sql<{ status: string | null }>`select pg_xact_status(${xid}::xid8) as status`.execute(getTestDb())
  return rows[0]!.status
}

async function rowCount(table: 'projects' | 'pages', id: string): Promise<number> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from ${sql.table(table)} where id = ${id}`.execute(getTestDb())
  return rows[0]!.n
}

/**
 * L-292 전제 (c) 의 두 판 — 늦은 복원 뒤에 프로젝트가 지워지는 판과, 둘째 복원이 되살린 페이지의 잠금을 늦은 꼬리가 놓는 판. **늦은 꼬리의 차례는
 * 지켜보기의 묻기를 삼켜(`swallowQueries(LATE_PROBE)`) 붙잡는다** — 시간이 아니라 질의로 판을 세우고, 판이 선 뒤 `stop()`으로 꼬리를 보낸다.
 */
describe('늦은 복원 뒤의 두 판 — 프로젝트 삭제 · 되살린 페이지의 잠금', () => {
  /**
   * 프로젝트 삭제는 룸에 아무것도 안 보낸다(`routes/projects.ts`) — 지운 뒤 처음 나가는 방송이 늦은 꼬리다. 그 방송은 연결마다 자격을 다시 보고
   * (`ws/broadcast.ts`의 `stillAllowed`) 멤버가 사라진 연결을 4403 으로 닫는다. 그래서 꼬리를 풀기 전에는 구경꾼이 열려 있어야 한다(카나리아).
   *
   * - **커밋 전에 줄 선 삭제** — 복원이 COMMIT 안에서 자는 동안 삭제를 보낸다. 삭제는 복원이 쥔 프로젝트 행에 줄 선다(`pg_blocking_pids`).
   * - **커밋과 꼬리 사이의 삭제** — 복원의 커밋을 xid 로 확인한 뒤(꼬리는 묻기를 삼키는 중) 삭제를 보낸다.
   */
  for (const when of ['커밋 전에 줄 선 삭제', '커밋과 꼬리 사이의 삭제'] as const) {
    it(`늦은 복원 · ${when} — 구경꾼은 4403 으로 닫히고 restored 를 0 개 받는다`, async () => {
      await withProxiedRealApi(async (ctx) => {
        const fx = await restoreFixture(ctx)
        const mark = fx.watcher.received.length
        const gate = ctx.proxy.swallowQueries(LATE_PROBE)
        const remove = () =>
          ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.owner.cookie }).then((res) => res.statusCode)
        let deleted: Promise<number> | undefined
        let restoreXid = ''
        // 삭제가 줄 설 틈을 넉넉히 둔다 — 503 은 한도(1s) 뒤에 나고 COMMIT 은 그 뒤로도 잔다.
        await slowCommit(fx.pageId, LATE_COMMIT_MS + 2_000, async () => {
          ctx.proxy.halfCutOnQuery('commit')
          const res = await ctx.app.inject({ method: 'POST', url: restoreUrl(fx), cookies: fx.owner.cookie })
          expect(ctx.proxy.fired).toBe(true)
          expect(res.statusCode).toBe(503)
          const sleeping = await sleepingCommit()
          restoreXid = sleeping.xid
          if (when === '커밋 전에 줄 선 삭제') {
            deleted = remove()
            // 삭제가 복원의 백엔드 뒤에 줄 섰다 — 그때 복원은 아직 커밋 전이다.
            await vi.waitFor(
              async () => {
                const { rows } = await sql<{ n: number }>`
                  select count(*)::int as n from pg_stat_activity
                  where pid <> pg_backend_pid() and ${sleeping.pid}::int = any(pg_blocking_pids(pid))
                `.execute(getTestDb())
                expect(rows[0]!.n).toBe(1)
              },
              { timeout: 5_000, interval: 20 },
            )
            expect(await xactStatus(restoreXid)).toBe('in progress')
          }
        })
        // 복원이 커밋됐다(되돌려지지 않았다) — 꼬리는 아직이다(지켜보기의 묻기를 삼키는 중).
        await vi.waitFor(async () => expect(await xactStatus(restoreXid)).toBe('committed'), { timeout: STALE_WAIT_MS, interval: 50 })
        if (when === '커밋과 꼬리 사이의 삭제') deleted = remove()
        // 삭제가 커밋됐다.
        expect(await deleted).toBe(204)
        expect(await rowCount('projects', fx.projectId)).toBe(0)
        // 판이 섰다 — 지켜보기는 물으려 했고(삼킨 수) 구경꾼은 아직 열려 있다(닫는 것이 꼬리여야 한다).
        expect(gate.count).toBeGreaterThan(0)
        expect(fx.watcher.closeInfo).toBeNull()

        gate.stop()
        // 꼬리를 기다린다 — 닫힘이나 `restored` 가 올 때까지(던지지 않는다 · 안 오면 아래 `toEqual`이 값으로 죽는다).
        const until = Date.now() + 4_000
        while (fx.watcher.closeInfo === null && ofType(fx.watcher.received.slice(mark), 'restored').length === 0 && Date.now() < until)
          await sleep(50)
        // 꼬리의 나머지 프레임(`menu-changed` · 잠금 놓기 · `theme-changed`)이 닿을 몫.
        await sleep(300)
        const frames = fx.watcher.received.slice(mark)
        expect({
          close: fx.watcher.closeInfo?.code ?? null,
          restored: ofType(frames, 'restored'),
          menu: ofType(frames, 'menu-changed'),
          theme: ofType(frames, 'theme-changed'),
        }).toEqual({ close: 4403, restored: [], menu: [], theme: [] })
      })
    }, 40_000)
  }

  /**
   * 늦은 복원(판 v1 — 그 페이지가 없다)이 그 페이지를 지우고, 그 뒤에 줄 선 둘째 복원(판 v2 — 그 페이지가 있다)이 같은 id 로 되살린다. 늦은 꼬리는
   * 제 트랜잭션이 지운 페이지(`deletedPageIds`)의 잠금을 놓으므로 되살아난 페이지에서 쥔 잠금도 놓는다. 쥔 쪽의 다음 하트비트(같은 집합)가 되잡는다
   * (`ws/lock.ts`의 `handleLockFrame` — 지운 페이지가 아니면 판정하고 잡는다).
   */
  it('둘째 복원이 되살린 페이지의 잠금 — 늦은 꼬리가 목록에서 빼고 쥔 쪽의 다음 하트비트가 되살린다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await restoreFixture(ctx)
      const snap2 = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v2' },
      })
      expect(snap2.statusCode, snap2.body).toBe(201)
      const snap2Id = snap2.json().id as string
      const gate = ctx.proxy.swallowQueries(LATE_PROBE)
      const { status, before } = await lateWrite(ctx, fx, async () => {
        const res = await ctx.app.inject({ method: 'POST', url: restoreUrl(fx), cookies: fx.owner.cookie })
        return res.statusCode
      })
      expect(status).toBe(503)
      // 늦은 복원이 커밋됐다 — 그 페이지가 없다.
      await committed(fx, before + 1)
      expect(await rowCount('pages', fx.gonePageId)).toBe(0)
      const mark = fx.watcher.received.length
      const second = await ctx.app.inject({ method: 'POST', url: restoreUrl(fx, snap2Id), cookies: fx.owner.cookie })
      expect(second.statusCode, second.body).toBe(200)
      await committed(fx, before + 2)
      // 되살렸다 — 같은 id 의 페이지 행이 다시 섰다.
      expect(await rowCount('pages', fx.gonePageId)).toBe(1)
      // 판이 섰다 — 둘째 꼬리는 나갔고(그 `restored`) 늦은 꼬리는 아직이다(묻기를 삼키는 중) · 잠금은 목록에 그대로다.
      expect((await framesSince(fx.watcher, mark, 'restored', 1)).map((frame) => frame.snapshotId)).toEqual([snap2Id])
      expect(gate.count).toBeGreaterThan(0)
      const held = (locks: readonly { pageId: string; nodeId: string }[] | undefined) =>
        locks?.map((lock) => [lock.pageId, lock.nodeId]) ?? '프레임 없음'
      expect(held(ofType(fx.watcher.received, 'locks').at(-1)?.locks)).toEqual([[fx.gonePageId, fx.goneRoot]])

      const tail = fx.watcher.received.length
      gate.stop()
      // 늦은 꼬리 — 그 `restored`가 오고 잠금이 목록에서 빠진다.
      expect((await framesSince(fx.watcher, tail, 'restored', 1)).map((frame) => frame.snapshotId)).toEqual([fx.snapshotId])
      expect(held((await framesSince(fx.watcher, tail, 'locks', 1)).at(-1)?.locks)).toEqual([])

      // 다음 하트비트 — 쥔 쪽이 같은 집합을 다시 보낸다.
      const beat = fx.watcher.received.length
      fx.watcher.send(JSON.stringify({ type: 'lock', pageId: fx.gonePageId, nodeId: fx.goneRoot }))
      expect(held((await framesSince(fx.watcher, beat, 'locks', 1)).at(-1)?.locks)).toEqual([[fx.gonePageId, fx.goneRoot]])
    })
  }, 40_000)
})

describe('한도 안에 커밋이 확인됐는데 번호를 모르는 쓰기 — page-stale 을 그 자리에서', () => {
  /**
   * 게시는 확인이 «모름»이다(`routes/comments.ts`의 `runWrite` — `revisionOf`를 안 준다). 커밋 답만 잃으면 결말은 한도 안에 `committed`인데 번호 프레임을
   * 못 내므로 503 «모름» 그 자리에서 `page-stale`을 낸다. 웹은 같은 키로 다시 보내 재생이 번호 프레임을 더한다 — 두 프레임이 다 간다.
   */
  it('코멘트 게시 — COMMIT 답만 잃어 503 «모름»이면 응답 자리에서 page-stale 이 나가고, 같은 키의 재생은 번호 프레임을 더한다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await fx.watcher.quiet()
      const mark = fx.watcher.received.length
      const before = await headSeq(fx.pageId)
      ctx.proxy.dropCommitReplyAfter('insert into "revisions"')
      const payload = { nodeId: 'n_a', body: '말', idempotencyKey: 'k_unknown' }
      const first = await ctx.app.inject({ method: 'POST', url: `${fx.pageUrl}/comments`, cookies: fx.owner.cookie, payload })
      const answered = Date.now()
      expect(ctx.proxy.fired).toBe(true)
      expect(first.statusCode, first.body).toBe(503)
      // 커밋은 됐다 — 한도 안에 확인된 판이라 지켜보기를 안 탄다.
      expect(await headSeq(fx.pageId)).toBe(before + 1)
      const stale = await framesSince(fx.watcher, mark, 'page-stale', 1)
      // eslint-disable-next-line no-console
      console.log(`[게시 «모름»] page-stale 이 응답 뒤 ${Date.now() - answered}ms 안에 ${stale.length}개`)
      expect(stale).toEqual([{ type: 'page-stale', projectId: fx.projectId, pageId: fx.pageId }])
      expect(pageChanged(fx.watcher.received.slice(mark))).toEqual([])

      // 웹의 판정 — 같은 키로 다시 보내면 재생이 앞 게시의 번호 프레임을 다시 보낸다(`rebroadcastPostRevision`). 신호는 하나 그대로다.
      const replay = await ctx.app.inject({ method: 'POST', url: `${fx.pageUrl}/comments`, cookies: fx.owner.cookie, payload })
      expect(replay.statusCode, replay.body).toBe(200)
      expect(await framesSince(fx.watcher, mark, 'page-changed', 1)).toMatchObject([{ seq: before + 1 }])
      expect(pageStale(fx.watcher.received.slice(mark))).toHaveLength(1)
    })
  }, 40_000)
})

describe('한도 안에 커밋이 확인됐고 문서를 안 바꾼 쓰기 — page-stale 이 없다', () => {
  /**
   * 마지막이 아닌 코멘트 삭제는 문서를 안 바꾼다(revision 이 안 선다) — 커밋이 한도 안에 확인되면 «번호 프레임이 없는 revision» 자체가 없어 알릴 것이 없다.
   * 응답은 그대로 503 «모름»이다(응답 계약은 안 바꾼다). **게시와 가르는 것**: 게시는 `revisionOf` 를 안 줘 «모름»(`null`)이고, 이 삭제는 «revision 없음»(`NO_REVISION`)이다.
   */
  it('마지막이 아닌 코멘트 삭제 — COMMIT 답만 잃어도 page-stale 은 없고 응답은 503 · 삭제는 커밋됐다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const ids: string[] = []
      for (const body of ['첫째', '둘째']) {
        const posted = await ctx.app.inject({
          method: 'POST',
          url: `${fx.pageUrl}/comments`,
          cookies: fx.owner.cookie,
          payload: { nodeId: 'n_a', body },
        })
        expect(posted.statusCode, posted.body).toBe(201)
        ids.push(posted.json().comment.id as string)
      }
      await fx.watcher.quiet()
      const mark = fx.watcher.received.length
      const before = await headSeq(fx.pageId)
      ctx.proxy.dropCommitReplyAfter('delete from comments')
      const res = await ctx.app.inject({ method: 'DELETE', url: `${fx.pageUrl}/comments/${ids[0]}`, cookies: fx.owner.cookie })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(503)
      // 삭제는 커밋됐고(행이 없다) 문서는 안 바뀌었다(머리 그대로).
      const { rows } = await sql<{ n: number }>`select count(*)::int as n from comments where page_id = ${fx.pageId}`.execute(getTestDb())
      expect(rows[0]!.n).toBe(1)
      expect(await headSeq(fx.pageId)).toBe(before)
      // 지켜보기가 낼 몫(500ms 간격)보다 넉넉히 기다린 뒤 견준다 — 안 올 신호라 던지지 않는 기다림이다.
      await fx.watcher.quiet(2_000)
      const frames = fx.watcher.received.slice(mark)
      expect(pageStale(frames)).toEqual([])
      expect(pageChanged(frames)).toEqual([])
    })
  }, 40_000)

  /**
   * 같은 쓰기가 **한도를 넘겨** 늦게 커밋되는 판 — 지켜보기(`LateCommitWatch`)가 커밋을 알아본다. 문서를 안 바꿨으니 이쪽도 알릴 것이 없다(`runRevisionTransaction` 이
   * `NO_REVISION` 인 결과의 `onCommit` 을 걸러낸다). 늦춤은 `revisions` 가 아니라 **지우는 `comments` 행**에 건다 — 이 쓰기는 revision 을 안 남긴다.
   */
  it('마지막이 아닌 코멘트 삭제 — 한도를 넘겨 늦게 커밋돼도 page-stale 은 없다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const ids: string[] = []
      for (const body of ['첫째', '둘째']) {
        const posted = await ctx.app.inject({
          method: 'POST',
          url: `${fx.pageUrl}/comments`,
          cookies: fx.owner.cookie,
          payload: { nodeId: 'n_a', body },
        })
        expect(posted.statusCode, posted.body).toBe(201)
        ids.push(posted.json().comment.id as string)
      }
      await fx.watcher.quiet()
      const mark = fx.watcher.received.length
      const before = await headSeq(fx.pageId)
      const db = getTestDb()
      await sql
        .raw(
          `create or replace function zz_slow_delete() returns trigger language plpgsql as $$ begin perform pg_sleep(${LATE_COMMIT_MS / 1000}); return null; end $$`,
        )
        .execute(db)
      await sql
        .raw(
          `create constraint trigger zz_slow_delete after delete on comments deferrable initially deferred for each row when (old.page_id = '${fx.pageId}') execute function zz_slow_delete()`,
        )
        .execute(db)
      try {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({ method: 'DELETE', url: `${fx.pageUrl}/comments/${ids[0]}`, cookies: fx.owner.cookie })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode, res.body).toBe(503)
        // 커밋은 DB 의 값으로 기다린다(프레임을 기다리지 않는다) — 행이 하나 남으면 늦은 커밋이 닿았다.
        await vi.waitFor(
          async () => {
            const { rows } = await sql<{ n: number }>`select count(*)::int as n from comments where page_id = ${fx.pageId}`.execute(db)
            expect(rows[0]!.n).toBe(1)
          },
          { timeout: STALE_WAIT_MS, interval: 50 },
        )
        // 지켜보기가 낼 몫(500ms 간격)보다 넉넉히 기다린 뒤 견준다.
        await fx.watcher.quiet(2_500)
        const frames = fx.watcher.received.slice(mark)
        expect(pageStale(frames)).toEqual([])
        expect(pageChanged(frames)).toEqual([])
        expect(await headSeq(fx.pageId)).toBe(before)
      } finally {
        await sql`drop trigger if exists zz_slow_delete on comments`.execute(db)
        await sql`drop function if exists zz_slow_delete()`.execute(db)
      }
    })
  }, 40_000)
})
