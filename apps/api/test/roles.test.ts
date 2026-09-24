import { describe, expect, it } from 'vitest'
import type { ProjectRole } from '../src/db/types'
import { findMembership, projectGuard, requireProjectRole, roleAtLeast, ROLE_RANK } from '../src/auth/roles'
import { withApi, signup } from './helpers'
import { withTransaction, type DbHandle } from '../src/db/tx'

async function seedProject(db: DbHandle, ownerId: string): Promise<string> {
  const project = await db.insertInto('projects')
    .values({ name: '테스트 프로젝트', slug: `p-${ownerId.slice(0, 8)}`, description: null })
    .returning('id').executeTakeFirstOrThrow()
  await db.insertInto('project_members')
    .values({ project_id: project.id, user_id: ownerId, role: 'owner' }).execute()
  return project.id
}

describe('roleAtLeast', () => {
  it('설계 §10의 순위를 지킨다', () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.editor)
    expect(ROLE_RANK.editor).toBeLessThan(ROLE_RANK.owner)
  })

  it.each<[ProjectRole, ProjectRole, boolean]>([
    ['owner', 'owner', true], ['owner', 'editor', true], ['owner', 'viewer', true],
    ['editor', 'owner', false], ['editor', 'editor', true], ['editor', 'viewer', true],
    ['viewer', 'owner', false], ['viewer', 'editor', false], ['viewer', 'viewer', true],
  ])('%s가 %s 이상인가 → %s', (actual, min, expected) => {
    expect(roleAtLeast(actual, min)).toBe(expected)
  })
})

describe('findMembership', () => {
  it('멤버의 역할을 준다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      const projectId = await seedProject(ctx.db, user.id)
      expect(await findMembership(ctx.db, projectId, user.id)).toBe('owner')
    })
  })

  it('비멤버에게는 null이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const projectId = await seedProject(ctx.db, owner.user.id)
      expect(await findMembership(ctx.db, projectId, outsider.user.id)).toBeNull()
    })
  })
})

describe('requireProjectRole', () => {
  it('충분한 역할이면 그 역할을 돌려준다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      const projectId = await seedProject(ctx.db, user.id)
      expect(await requireProjectRole(ctx.db, projectId, user.id, 'editor')).toBe('owner')
    })
  })

  it('역할이 모자라면 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const projectId = await seedProject(ctx.db, owner.user.id)
      await ctx.db.insertInto('project_members')
        .values({ project_id: projectId, user_id: viewer.user.id, role: 'viewer' }).execute()

      await expect(requireProjectRole(ctx.db, projectId, viewer.user.id, 'editor'))
        .rejects.toMatchObject({ status: 403, code: 'forbidden' })
    })
  })

  it('비멤버에게는 403이 아니라 404다 (존재를 숨긴다)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const projectId = await seedProject(ctx.db, owner.user.id)

      await expect(requireProjectRole(ctx.db, projectId, outsider.user.id, 'viewer'))
        .rejects.toMatchObject({ status: 404, code: 'not-found' })
    })
  })

  it('없는 프로젝트도 404이며 비멤버와 구분되지 않는다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      await expect(
        requireProjectRole(ctx.db, '00000000-0000-0000-0000-000000000000', user.id, 'viewer'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})

describe('role CHECK 제약', () => {
  it('알 수 없는 역할을 DB가 거부한다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      const projectId = await seedProject(ctx.db, user.id)
      const other = await signup(ctx)

      // 제약 위반(CHECK)을 직접 유발하는 조작이므로 `withTransaction`으로 감싼다 —
      // 감싸지 않으면 이 실패가 `withApi`의 바깥 트랜잭션 전체를 aborted로 만들어
      // 이후 문장이 내용과 무관하게 `25P02`로 실패한다(`src/db/tx.ts`, `repos/users.ts` 참고).
      // `23514`는 Postgres의 CHECK 위반 SQLSTATE다 — 임의의 실패가 아니라 이
      // 제약이 실제로 걸렸다는 것까지 확인한다.
      await expect(
        withTransaction(ctx.db, (trx) =>
          trx.insertInto('project_members')
            .values({ project_id: projectId, user_id: other.user.id, role: 'admin' as never })
            .execute(),
        ),
      ).rejects.toMatchObject({ code: '23514' })
    })
  })
})

/**
 * `requireProjectRole`은 위에서 직접(순수 함수로) 검증했다. 여기서는 `projectGuard`가
 * 실제로 그 함수를 Fastify preHandler로 얇게 감싸는지를 확인한다 — `test/session.test.ts`의
 * "인증 훅" 블록과 같은 방식으로, 임시 라우트를 등록하고 `app.inject()`로 실제 HTTP
 * 요청을 보낸다. 가드 자체만 재도록 `__test`로 시작하는 임시 라우트만 쓴다.
 *
 * **라우트는 `signup()`보다 먼저 등록한다.** `signup()`은 내부에서
 * `/api/auth/login`에 `app.inject()`를 한 번 호출하는데, Fastify 5는 첫 `inject`
 * 호출에서 인스턴스를 "시작된" 상태로 만들고 그 뒤로는 새 라우트 등록을 거부한다
 * (`FastifyError: Fastify instance is already listening`). 그래서 임시 라우트를
 * 먼저 등록해 두고, 그다음에 `signup()`으로 로그인 쿠키를 발급받는다.
 */
describe('projectGuard', () => {
  it('로그인하지 않았으면 401이다', async () => {
    await withApi(async (ctx) => {
      ctx.app.get('/__test/projects/:projectId', { preHandler: projectGuard('viewer') }, async (request) => ({
        role: request.projectRole,
      }))
      const { user } = await signup(ctx)
      const projectId = await seedProject(ctx.db, user.id)

      const res = await ctx.app.inject({ method: 'GET', url: `/__test/projects/${projectId}` })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('unauthenticated')
    })
  })

  it('충분한 역할이면 request.projectRole을 채우고 통과시킨다', async () => {
    await withApi(async (ctx) => {
      ctx.app.get('/__test/projects/:projectId', { preHandler: projectGuard('editor') }, async (request) => ({
        role: request.projectRole,
      }))
      const { user, cookie } = await signup(ctx)
      const projectId = await seedProject(ctx.db, user.id)

      const res = await ctx.app.inject({ method: 'GET', url: `/__test/projects/${projectId}`, cookies: cookie })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ role: 'owner' })
    })
  })

  it('역할이 모자라면 403이다', async () => {
    await withApi(async (ctx) => {
      ctx.app.get('/__test/projects/:projectId', { preHandler: projectGuard('editor') }, async () => ({ ok: true }))
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const projectId = await seedProject(ctx.db, owner.user.id)
      await ctx.db.insertInto('project_members')
        .values({ project_id: projectId, user_id: viewer.user.id, role: 'viewer' }).execute()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/__test/projects/${projectId}`,
        cookies: viewer.cookie,
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('forbidden')
    })
  })

  it('비멤버·없는 프로젝트 모두 404다', async () => {
    await withApi(async (ctx) => {
      ctx.app.get('/__test/projects/:projectId', { preHandler: projectGuard('viewer') }, async () => ({ ok: true }))
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const projectId = await seedProject(ctx.db, owner.user.id)

      const memberRes = await ctx.app.inject({
        method: 'GET',
        url: `/__test/projects/${projectId}`,
        cookies: outsider.cookie,
      })
      expect(memberRes.statusCode).toBe(404)

      const missingRes = await ctx.app.inject({
        method: 'GET',
        url: '/__test/projects/00000000-0000-0000-0000-000000000000',
        cookies: outsider.cookie,
      })
      expect(missingRes.statusCode).toBe(404)
    })
  })

  it('projectId가 uuid 형식이 아니면 400이다', async () => {
    await withApi(async (ctx) => {
      ctx.app.get('/__test/projects/:projectId', { preHandler: projectGuard('viewer') }, async () => ({ ok: true }))
      const { cookie } = await signup(ctx)

      const res = await ctx.app.inject({ method: 'GET', url: '/__test/projects/not-a-uuid', cookies: cookie })
      expect(res.statusCode).toBe(400)
    })
  })

  it('가드를 거치지 않은 요청은 projectRole이 null이다(데코레이터 기본값)', async () => {
    await withApi(async (ctx) => {
      ctx.app.get('/__test/open', async (request) => ({ role: request.projectRole }))
      const res = await ctx.app.inject({ method: 'GET', url: '/__test/open' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ role: null })
    })
  })
})
