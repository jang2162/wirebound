/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **지운 페이지의 잠금은 놓인다**(`ws/lock.ts` 의 `releaseLocksOnPages`) — 페이지 삭제 · 메뉴 연쇄 삭제가 커밋 뒤에 부른다. 안 놓으면 그 잠금이
 * 룸의 `locks` 목록에 TTL(30s)이나 쥔 화면이 놓을 때까지 남는다.
 *
 * **변조와 죽는 케이스**(백업 후 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `routes/pages.ts` 의 `releaseLocksOnPages` 줄을 지운다 | 「페이지 삭제」 **혼자** |
 * | `routes/menu.ts` 의 줄을 지운다 | 「연쇄 삭제」 **혼자** |
 * | `store.releasePages` 가 아무것도 안 놓는다 | 위 둘 + 저장소 케이스(`lock-store.test.ts`) |
 * | 다른 페이지의 잠금까지 놓는다(`gone.has` 를 뗀다) | 「남은 페이지의 잠금은 그대로」 **혼자** |
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'
import { WsProbe, joinRoom, locksUntil } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function world(ctx: RealApiContext) {
  const owner = await signup(ctx)
  const bora = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, bora.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const keep = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '남는 페이지' })
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
})
