/**
 * `GET /api/projects` 의 차례 — `created_at` 이 같은 프로젝트끼리는 `id` 오름차순이다(`repos/projects.ts` 의 `listProjectsForUser`).
 *
 * 판은 프로젝트 행을 직접 넣어 세운다 — id 를 내림차순으로 넣으면 힙 차례(넣은 차례)가 id 차례의 거꾸로라, 둘째 열쇠가 없는 정렬은 넣은 차례를
 * 그대로 내 이 케이스가 값으로 죽는다. `withApi` 는 한 트랜잭션이라 `created_at`(`now()`)이 모두 같다 — 카나리아로 확인한다.
 */
import { describe, expect, it } from 'vitest'
import { signup, withApi } from './helpers'

/** 넣는 차례 — id 내림차순. */
const IDS = [
  'ffffffff-0000-4000-8000-000000000005',
  'cccccccc-0000-4000-8000-000000000004',
  '99999999-0000-4000-8000-000000000003',
  '66666666-0000-4000-8000-000000000002',
  '33333333-0000-4000-8000-000000000001',
]

describe('`GET /api/projects` 의 차례', () => {
  it('`created_at` 이 같은 프로젝트는 넣은 차례가 아니라 `id` 오름차순으로 선다', async () => {
    await withApi(async (ctx) => {
      const me = await signup(ctx)
      for (const [i, id] of IDS.entries()) {
        await ctx.db
          .insertInto('projects')
          .values({ id, name: `차례 ${i}`, slug: `order-${i}` })
          .execute()
        await ctx.db.insertInto('project_members').values({ project_id: id, user_id: me.user.id, role: 'owner' }).execute()
      }

      // 카나리아 — 다섯 행의 `created_at` 이 하나다(아니면 첫 열쇠가 차례를 정해 둘째 열쇠를 안 잰다).
      const stamps = await ctx.db.selectFrom('projects').select('created_at').where('id', 'in', IDS).execute()
      expect(new Set(stamps.map((r) => r.created_at.toISOString())).size).toBe(1)

      const res = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: me.cookie })
      expect(res.statusCode).toBe(200)
      const ids = (res.json() as Array<{ id: string }>).map((p) => p.id)
      expect(ids).toEqual([...IDS].reverse())
    })
  })
})
