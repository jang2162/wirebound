/**
 * `GET /api/projects` 의 두 칸 — `memberCount` · `updatedAt`(`repos/projects.ts` 의 `listProjectsForUser` 머리말이 정의를 갖는다).
 *
 * **실커밋 하네스다.** 롤백 하네스(`withApi`)는 케이스 전체가 한 트랜잭션이라 `now()` 가 문장마다 같은 값이다 — 편집이 `pages.updated_at`
 * 을 고쳐도 값이 안 바뀌어 «편집 뒤 더 늦다» 를 못 잰다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

interface ListItem {
  id: string
  name: string
  slug: string
  description: string | null
  role: string
  memberCount: number
  updatedAt: string
}

async function list(ctx: RealApiContext, cookie: { wb_session: string }): Promise<ListItem[]> {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: cookie })
  expect(res.statusCode).toBe(200)
  return res.json()
}

function itemOf(items: ListItem[], id: string): ListItem {
  const item = items.find((p) => p.id === id)
  if (item === undefined) throw new Error(`목록에 프로젝트가 없다: ${id}`)
  return item
}

async function headSeqOf(ctx: RealApiContext, pageId: string): Promise<number> {
  const row = await ctx.db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

describe('`GET /api/projects` 의 멤버 수 · 최근 수정', () => {
  it('멤버 수가 멤버 추가 · 제거를 따라간다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const other = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      expect(itemOf(await list(ctx, owner.cookie), project.id).memberCount).toBe(1)

      const added = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: other.user.email, role: 'viewer' },
      })
      expect(added.statusCode).toBe(201)
      expect(itemOf(await list(ctx, owner.cookie), project.id).memberCount).toBe(2)
      // 멤버가 보는 목록도 같은 수다 — 수는 «내 행» 이 아니라 그 프로젝트의 멤버 행 전부다.
      const seenByOther = itemOf(await list(ctx, other.cookie), project.id)
      expect(seenByOther.memberCount).toBe(2)
      expect(seenByOther.role).toBe('viewer')

      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${other.user.id}`,
        cookies: owner.cookie,
      })
      expect(removed.statusCode).toBe(204)
      expect(itemOf(await list(ctx, owner.cookie), project.id).memberCount).toBe(1)
    })
  })

  it('페이지 편집(ops 하나) 뒤 그 프로젝트의 `updatedAt` 은 편집 전보다 늦고 다른 프로젝트의 것은 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const edited = await createProject(ctx, owner.cookie)
      const untouched = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, edited.id)
      const page = await createPage(ctx, owner.cookie, edited.id, menu.id)

      const before = await list(ctx, owner.cookie)
      const editedBefore = itemOf(before, edited.id).updatedAt
      const untouchedBefore = itemOf(before, untouched.id).updatedAt

      const ops: PatchOp[] = [{ op: 'add', path: '/root/children/-', value: { id: 'n_listfield1', type: 'Text', props: {} } } as PatchOp]
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${edited.id}/pages/${page.id}/ops`,
        cookies: owner.cookie,
        payload: { baseSeq: await headSeqOf(ctx, page.id), ops },
      })
      expect(res.statusCode).toBe(200)

      const after = await list(ctx, owner.cookie)
      expect(Date.parse(itemOf(after, edited.id).updatedAt)).toBeGreaterThan(Date.parse(editedBefore))
      expect(itemOf(after, untouched.id).updatedAt).toBe(untouchedBefore)
    })
  })

  it('페이지가 없는 프로젝트는 `projects.updated_at` 이다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const row = await ctx.db.selectFrom('projects').select('updated_at').where('id', '=', project.id).executeTakeFirstOrThrow()

      const item = itemOf(await list(ctx, owner.cookie), project.id)
      expect(item.updatedAt).toBe(row.updated_at.toISOString())
    })
  })

  it('프로젝트를 내는 응답 넷의 키 집합 — 목록만 두 칸, 상세만 `themeRev` 가 더 있다(웹 `api/types.ts` 의 `ProjectDetail` 표)', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const created = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: owner.cookie,
        payload: { name: '키', slug: 'keys' },
      })
      expect(created.statusCode).toBe(201)
      const id = (created.json() as { id: string }).id
      const listed = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: owner.cookie })
      const detail = await ctx.app.inject({ method: 'GET', url: `/api/projects/${id}`, cookies: owner.cookie })
      const patched = await ctx.app.inject({ method: 'PATCH', url: `/api/projects/${id}`, cookies: owner.cookie, payload: { name: '키2' } })
      const keys = (value: unknown): string[] => Object.keys(value as object).sort()

      const base = ['description', 'id', 'name', 'role', 'slug']
      expect(keys(created.json())).toEqual(base)
      expect((listed.json() as unknown[]).map(keys)).toEqual([[...base, 'memberCount', 'updatedAt'].sort()])
      expect(keys(detail.json())).toEqual([...base, 'themeRev'].sort())
      expect(keys(patched.json())).toEqual(base)
    })
  })

  it('프로젝트 행이 페이지보다 늦게 바뀌면 그 시각이다 — 둘 가운데 늦은 것', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      await createPage(ctx, owner.cookie, project.id, menu.id)

      const renamed = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
        payload: { name: '새 이름' },
      })
      expect(renamed.statusCode).toBe(200)
      const row = await ctx.db.selectFrom('projects').select('updated_at').where('id', '=', project.id).executeTakeFirstOrThrow()

      expect(itemOf(await list(ctx, owner.cookie), project.id).updatedAt).toBe(row.updated_at.toISOString())
    })
  })
})
