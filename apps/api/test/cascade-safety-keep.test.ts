/**
 * **연쇄 삭제의 안전망 스냅샷은 프로젝트마다 `CASCADE_SAFETY_KEEP`개까지만 남는다**(`services/menu-cascade.ts` 머리말 «안전망 스냅샷»).
 *
 * 연쇄마다 프로젝트 전체 payload 가 하나씩 쌓였다 — 상한이 없으면 행 수 · 바이트가 연쇄 횟수에 비례한다. 넘으면 새 안전망을 넣은
 * 그 트랜잭션에서 오래된 것부터 지운다. 세는 것은 `kind = 'cascade-safety'` 뿐이다 — 사람이 붙인 태그와 복원의 안전망은 세지도
 * 지우지도 않는다(태그 글자는 사람이 아무 꼴로나 적을 수 있다).
 */
import { describe, expect, it } from 'vitest'
import { CASCADE_SAFETY_KEEP } from '../src/services/menu-cascade'
import { createMenuNode, createPage, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'

interface Board {
  owner: SignedUpUser
  projectId: string
}

async function board(ctx: TestContext): Promise<Board> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { owner, projectId: project.id }
}

/** 페이지 하나 든 메뉴를 만들어 연쇄로 지운다 — 남은 안전망의 id. */
async function cascadeOnce(ctx: TestContext, b: Board, title: string): Promise<string> {
  const menu = await createMenuNode(ctx, b.owner.cookie, b.projectId, { title })
  const page = await createPage(ctx, b.owner.cookie, b.projectId, menu.id, { title: `${title} 페이지` })
  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/api/projects/${b.projectId}/menu/${menu.id}`,
    cookies: b.owner.cookie,
    payload: { cascade: true, expect: { menuIds: [], pageIds: [page.id] } },
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { safetySnapshot: { id: string } }).safetySnapshot.id
}

async function cascadeTimes(ctx: TestContext, b: Board, times: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < times; i++) ids.push(await cascadeOnce(ctx, b, `지울 ${i}`))
  return ids
}

async function snapshotIds(ctx: TestContext, projectId: string, kind?: string): Promise<string[]> {
  let query = ctx.db.selectFrom('snapshots').select('id').where('project_id', '=', projectId)
  if (kind !== undefined) query = query.where('kind', '=', kind as never)
  return (await query.execute()).map((row) => row.id).sort()
}

describe('연쇄 삭제의 안전망 스냅샷 상한', () => {
  it(`상한(${CASCADE_SAFETY_KEEP})을 넘으면 오래된 것부터 지워 그 수로 남는다 — 지운 id 의 조회 · 복원은 404`, async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const made = await cascadeTimes(ctx, b, CASCADE_SAFETY_KEEP + 2)

      const kept = made.slice(2)
      expect(await snapshotIds(ctx, b.projectId)).toEqual([...kept].sort())

      for (const gone of made.slice(0, 2)) {
        const read = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.projectId}/snapshots/${gone}`, cookies: b.owner.cookie })
        expect(read.statusCode, read.body).toBe(404)
        const restore = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${b.projectId}/snapshots/${gone}/restore`,
          cookies: b.owner.cookie,
        })
        expect(restore.statusCode, restore.body).toBe(404)
        expect(restore.json().error.message).toBe('스냅샷을 찾을 수 없습니다')
      }
    })
  })

  it('상한까지는 지우지 않는다 — 그 수째의 연쇄도 앞의 것을 다 남긴다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const made = await cascadeTimes(ctx, b, CASCADE_SAFETY_KEEP)
      expect(await snapshotIds(ctx, b.projectId)).toEqual([...made].sort())
    })
  })

  it('사람이 붙인 태그 · 복원의 안전망은 세지도 지우지도 않는다 — 안전망 태그의 꼴로 적은 것도', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const taken = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${b.projectId}/snapshots`,
        cookies: b.owner.cookie,
        payload: { tag: '메뉴 "흉내" 삭제 전 2020-01-01T00:00:00.000Z' },
      })
      expect(taken.statusCode, taken.body).toBe(201)
      const manual = (taken.json() as { id: string }).id
      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${b.projectId}/snapshots/${manual}/restore`,
        cookies: b.owner.cookie,
      })
      expect(restored.statusCode, restored.body).toBe(200)
      const restoreSafety = (restored.json() as { safetySnapshot: { id: string } }).safetySnapshot.id

      const made = await cascadeTimes(ctx, b, CASCADE_SAFETY_KEEP + 1)

      expect(await snapshotIds(ctx, b.projectId, 'tag')).toEqual([manual])
      expect(await snapshotIds(ctx, b.projectId, 'restore-safety')).toEqual([restoreSafety])
      expect(await snapshotIds(ctx, b.projectId, 'cascade-safety')).toEqual(made.slice(1).sort())
    })
  })

  it('거절된 연쇄(목록 바뀜 409)는 상한에 닿아 있어도 하나도 안 지운다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const made = await cascadeTimes(ctx, b, CASCADE_SAFETY_KEEP)
      const menu = await createMenuNode(ctx, b.owner.cookie, b.projectId, { title: '남을 메뉴' })
      await createPage(ctx, b.owner.cookie, b.projectId, menu.id, { title: '본 적 없는 페이지' })
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${b.projectId}/menu/${menu.id}`,
        cookies: b.owner.cookie,
        payload: { cascade: true, expect: { menuIds: [], pageIds: [] } },
      })
      expect(res.statusCode, res.body).toBe(409)
      expect(await snapshotIds(ctx, b.projectId)).toEqual([...made].sort())
    })
  })

  it('다른 프로젝트의 안전망은 세지 않는다', async () => {
    await withApi(async (ctx) => {
      const a = await board(ctx)
      const other = { owner: a.owner, projectId: (await createProject(ctx, a.owner.cookie)).id }
      const theirs = await cascadeTimes(ctx, other, 1)
      await cascadeTimes(ctx, a, CASCADE_SAFETY_KEEP + 1)
      expect(await snapshotIds(ctx, other.projectId)).toEqual(theirs)
    })
  })
})
