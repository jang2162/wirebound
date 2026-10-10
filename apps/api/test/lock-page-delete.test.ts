/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **지운 페이지의 잠금은 놓인다**(`ws/lock.ts` 의 `releaseLocksOnPages`) — 페이지 삭제 · 메뉴 연쇄 삭제 · 복원이 커밋 뒤에 부른다. 안 놓으면 그 잠금이
 * 룸의 `locks` 목록에 TTL(30s)이나 쥔 화면이 놓을 때까지 남는다. **놓은 뒤 쥔 화면이 같은 집합을 다시 보내도 다시 서지 않는다**(`handleLockFrame` — 없는 페이지).
 *
 * **변조와 죽는 케이스**(백업 후 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `routes/pages.ts` 의 삭제 라우트가 `runTreeTransaction` 에 `goneOf`(지운 페이지 id)를 안 넘긴다 | 「페이지 삭제」 · 「남은 페이지」 · 「같은 집합을 다시 보내도」 · 「답을 잃은 삭제 COMMIT」의 페이지 삭제(넷 — 앞 셋은 페이지 삭제 라우트로 판을 세운다) |
 * | `routes/menu.ts` 의 연쇄 삭제가 `goneOf` 를 안 넘긴다 | 「연쇄 삭제」 · 「답을 잃은 삭제 COMMIT」의 연쇄 삭제 |
 * | `services/tree-write.ts` 의 늦은 커밋 갈래(`releaseGone(body)`)를 지운다 | 「답을 잃은 삭제 COMMIT」 둘 **(제때 커밋된 앞 케이스는 산다)** |
 * | `services/tree-write.ts` 의 제때 커밋 갈래(`releaseGone(result)`)를 지운다 | 「페이지 삭제」 · 「연쇄 삭제」 · 「남은 페이지」 · 「같은 집합을 다시 보내도」 |
 * | `store.releasePages` 가 아무것도 안 놓는다 | 위 둘 + 저장소 케이스(`lock-store.test.ts`) |
 * | 다른 페이지의 잠금까지 놓는다(`gone.has` 를 뗀다) | 「남은 페이지의 잠금은 그대로」 **혼자** |
 * | `ws/lock.ts` 의 `handleLockFrame` 이 없는 페이지도 잡는다(`structureSeq === null` 갈래를 뗀다) | 「같은 집합을 다시 보내도」 **혼자**(지운 페이지의 잠금이 다시 섬 · 보라가 목록을 한 번 더 받음) |
 * | `routes/snapshots.ts` 의 `releaseLocksOnPages` 줄을 지운다 · `services/restore.ts` 가 지운 id 를 안 모은다 | 「복원이 지운 페이지」 **혼자**(각각) |
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withProxiedRealApi,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { WsProbe, joinRoom, locksUntil } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** `beforeGone` — 지울 페이지를 만들기 직전에 부른다(그 페이지가 없는 스냅샷을 뜨는 자리). */
async function world(ctx: RealApiContext, beforeGone?: (made: { owner: SignedUpUser; projectId: string }) => Promise<void>) {
  const owner = await signup(ctx)
  const bora = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, bora.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const keep = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '남는 페이지' })
  await beforeGone?.({ owner, projectId: project.id })
  const gone = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '지울 페이지' })
  const ownerTab = await joinRoom(ctx.port, project.id, owner.cookie.wb_session)
  const boraTab = await joinRoom(ctx.port, project.id, bora.cookie.wb_session)
  opened.push(ownerTab, boraTab)
  const rootOf = async (pageId: string): Promise<string> =>
    ((await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/pages/${pageId}`, cookies: owner.cookie })).json() as { schema: { root: { id: string } } }).schema.root.id
  const goneRoot = await rootOf(gone.id)
  const keepRoot = await rootOf(keep.id)
  // 보라가 지울 페이지 · 남는 페이지를 쥐고, 두 사람 다 목록에 둘이 보일 때까지 기다린다.
  ownerTab.send(JSON.stringify({ type: 'lock', pageId: gone.id, nodeIds: [goneRoot], lockId: 1 }))
  boraTab.send(JSON.stringify({ type: 'lock', pageId: keep.id, nodeIds: [keepRoot], lockId: 1 }))
  await locksUntil(boraTab, (locks) => locks.length === 2, '두 잠금이 섰다')
  return { owner, project, menu, keep, gone, keepRoot, goneRoot, ownerTab, boraTab }
}

describe('지운 페이지의 잠금은 놓인다', () => {
  it('페이지 삭제 — 그 페이지의 잠금만 사라지고 룸에 알린다', async () => {
    await withRealApi(async (ctx) => {
      const w = await world(ctx)

      const res = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${w.project.id}/pages/${w.gone.id}`, cookies: w.owner.cookie })
      expect(res.statusCode).toBe(204)

      const list = await locksUntil(w.boraTab, (locks) => locks.length === 1, '지운 페이지의 잠금이 사라진다')
      expect(list.map((lock) => lock.nodeId)).toEqual([w.keepRoot])
      expect(ctx.app.realtime.locks.liveIn(w.project.id).map((lock) => lock.pageId)).toEqual([w.keep.id])
    })
  })

  it('메뉴 연쇄 삭제 — 서브트리 페이지의 잠금이 전부 사라진다', async () => {
    await withRealApi(async (ctx) => {
      const w = await world(ctx)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${w.project.id}/menu/${w.menu.id}`,
        cookies: w.owner.cookie,
        payload: { cascade: true, expect: { menuIds: [], pageIds: [w.keep.id, w.gone.id] } },
      })
      expect(res.statusCode, res.body).toBe(200)

      await locksUntil(w.boraTab, (locks) => locks.length === 0, '연쇄 삭제가 두 페이지의 잠금을 다 놓는다')
      expect(ctx.app.realtime.locks.liveCount()).toBe(0)
    })
  })

  it('남은 페이지의 잠금은 그대로다 — 대조군(삭제가 다른 페이지를 안 건드린다)', async () => {
    await withRealApi(async (ctx) => {
      const w = await world(ctx)

      await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${w.project.id}/pages/${w.gone.id}`, cookies: w.owner.cookie })
      await locksUntil(w.boraTab, (locks) => locks.length === 1, '지운 페이지의 잠금이 사라진다')
      await sleep(50)

      expect(ctx.app.realtime.locks.liveIn(w.project.id)).toHaveLength(1)
      expect(ctx.app.realtime.locks.liveIn(w.project.id)[0]!.nodeId).toBe(w.keepRoot)
    })
  })

  it('지운 페이지를 쥔 화면이 같은 집합을 다시 보내도(편집 직전 하트비트) 잠금이 다시 서지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const w = await world(ctx)
      await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${w.project.id}/pages/${w.gone.id}`, cookies: w.owner.cookie })
      await locksUntil(w.boraTab, (locks) => locks.length === 1, '지운 페이지의 잠금이 사라진다')

      // 그 프레임이 저장소까지 닿았다는 카나리아 — 안 닿으면 «안 섰다»가 «아직 안 돌았다»와 같다.
      const store = ctx.app.realtime.locks
      const { hold, release } = store
      let reached = 0
      store.hold = (...args: Parameters<typeof hold>) => {
        reached += 1
        return hold.apply(store, args)
      }
      store.release = (...args: Parameters<typeof release>) => {
        reached += 1
        return release.apply(store, args)
      }
      const locksBefore = w.boraTab.received.filter((frame) => frame.type === 'locks').length
      w.ownerTab.send(JSON.stringify({ type: 'lock', pageId: w.gone.id, nodeIds: [w.goneRoot], lockId: 2 }))
      const deadline = Date.now() + 3_000
      while (reached === 0 && Date.now() < deadline) await sleep(10)
      await w.boraTab.quiet()

      expect({
        reached: reached > 0,
        pages: [...new Set(store.liveIn(w.project.id).map((lock) => lock.pageId))],
        boraFrames: w.boraTab.received.filter((frame) => frame.type === 'locks').length - locksBefore,
      }).toEqual({ reached: true, pages: [w.keep.id], boraFrames: 0 })
    })
  })

  it('복원이 지운 페이지(판에 없던 것)의 잠금도 놓인다 — 남는 페이지의 잠금은 그대로', async () => {
    await withRealApi(async (ctx) => {
      let snapshotId = ''
      const w = await world(ctx, async ({ owner, projectId }) => {
        const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/snapshots`, cookies: owner.cookie, payload: { tag: '지울 페이지 전' } })
        snapshotId = (res.json() as { id: string }).id
      })

      const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${w.project.id}/snapshots/${snapshotId}/restore`, cookies: w.owner.cookie })
      expect(res.statusCode, res.body).toBe(200)
      // 놓기는 응답 전에 끝난다(라우트가 커밋 뒤 동기로 부른다) — 방송을 기다리기 전에 저장소의 값으로 잰다.
      expect(ctx.app.realtime.locks.liveIn(w.project.id).map((lock) => lock.pageId)).toEqual([w.keep.id])

      const list = await locksUntil(w.boraTab, (locks) => locks.length === 1, '복원이 지운 페이지의 잠금이 사라진다')
      expect(list.map((lock) => lock.nodeId)).toEqual([w.keepRoot])
    })
  })
})

/**
 * **답을 잃은 삭제 COMMIT 이 한도(`LOST_COMMIT_PROBE_MS`) 뒤에 커밋돼도 지운 페이지의 잠금은 놓인다**(`services/tree-write.ts` 의 `runTreeTransaction` —
 * 늦은 커밋 지켜보기가 신호(`menu-changed`)와 함께 놓기를 잇는다). 응답은 503 «모름»이라 라우트의 놓기 줄은 안 돈다 — 지켜보기가 잇지 않으면 잠금이
 * TTL(30s)이나 쥔 화면이 놓을 때까지 룸의 `locks` 목록에 남는다.
 *
 * COMMIT 을 3s 늦추고(`DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep` — `menu-changed.test.ts` «한도를 넘겨 커밋된 잃은 COMMIT» 과 같은 장치) api 쪽
 * 연결만 끊는다(`halfCutOnQuery`).
 */
describe('답을 잃은 삭제 COMMIT 이 늦게 커밋돼도 잠금이 놓인다', () => {
  const slowCommit = async (db: RealApiContext['db']): Promise<() => Promise<void>> => {
    await sql.raw(`create or replace function zz_slow_rev() returns trigger language plpgsql as $$ begin perform pg_sleep(3); return null; end $$`).execute(db)
    await sql.raw(`create constraint trigger zz_slow_rev after insert or update on project_menu_revs deferrable initially deferred for each row execute function zz_slow_rev()`).execute(db)
    return async () => {
      await sql`drop trigger if exists zz_slow_rev on project_menu_revs`.execute(db)
      await sql`drop function if exists zz_slow_rev()`.execute(db)
    }
  }

  it('페이지 삭제 — 503 «모름» 뒤 커밋되면 그 페이지의 잠금만 사라진다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const w = await world(ctx)
      const restore = await slowCommit(ctx.db)
      try {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${w.project.id}/pages/${w.gone.id}`, cookies: w.owner.cookie })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode).toBe(503)
        const list = await locksUntil(w.boraTab, (locks) => locks.length === 1, '늦게 커밋된 삭제가 그 페이지의 잠금을 놓는다')
        expect(list.map((lock) => lock.nodeId)).toEqual([w.keepRoot])
        expect(ctx.app.realtime.locks.liveIn(w.project.id).map((lock) => lock.pageId)).toEqual([w.keep.id])
      } finally {
        await restore()
      }
    })
  }, 40_000)

  it('메뉴 연쇄 삭제 — 503 «모름» 뒤 커밋되면 서브트리 페이지의 잠금이 전부 사라진다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const w = await world(ctx)
      const restore = await slowCommit(ctx.db)
      try {
        ctx.proxy.halfCutOnQuery('commit')
        const res = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${w.project.id}/menu/${w.menu.id}`,
          cookies: w.owner.cookie,
          payload: { cascade: true, expect: { menuIds: [], pageIds: [w.keep.id, w.gone.id] } },
        })
        expect(ctx.proxy.fired).toBe(true)
        expect(res.statusCode).toBe(503)
        await locksUntil(w.boraTab, (locks) => locks.length === 0, '늦게 커밋된 연쇄 삭제가 두 페이지의 잠금을 다 놓는다')
        expect(ctx.app.realtime.locks.liveCount()).toBe(0)
      } finally {
        await restore()
      }
    })
  }, 40_000)
})
