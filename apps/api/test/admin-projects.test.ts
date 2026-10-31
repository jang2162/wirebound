/**
 * **관리자 › 사용자 목록 · 프로젝트 목록 · owner 넘기기**(`src/routes/admin-users.ts` 의 `GET /users` · `src/routes/admin-projects.ts` ·
 * `src/repos/admin-projects.ts`).
 *
 * `updatedAt` 의 «편집 뒤 더 늦다» 는 실커밋 하네스로 잰다 — 롤백 하네스(`withApi`)는 케이스가 한 트랜잭션이라 `now()` 가 문장마다 같다.
 * 프로젝트 삭제와 겹친 넘기기는 두 차례를 세우고 교착을 `pg_stat_database.deadlocks` 차로 센다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertApiToken } from '../src/repos/api-tokens'
import { ACTIVE_OWNER_EXISTS, OWNER_TARGET_INACTIVE } from '../src/routes/admin-projects'
import { admin, adminOf, deadlockCount, heldBackend, joinWith, makeInvite, settledOrQueued } from './accounts-fixtures'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withProxiedRealApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

const transfer = (ctx: TestContext, cookie: SignedUpUser['cookie'], projectId: string, userId: string) =>
  admin(ctx, cookie, 'POST', `/projects/${projectId}/owner`, { userId })

const deactivate = (ctx: TestContext, cookie: SignedUpUser['cookie'], userId: string) =>
  admin(ctx, cookie, 'POST', `/users/${userId}/deactivate`)

describe('관리자 › 사용자 목록', () => {
  it('칸 — 속한 프로젝트 수 · 들어온 초대 · 마지막 접속은 세션이 지워져도 남는다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { id: inviteId, token } = await makeInvite(ctx, me.cookie, { name: '디자인팀' })
      const joined = await joinWith(ctx, token)
      const joinedId = joined.json().id as string
      const bob = await signup(ctx)
      await createProject(ctx, bob.cookie)
      await createProject(ctx, bob.cookie)
      // 인증된 요청 하나 — 세션 조회가 «마지막 접속» 을 적는다.
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })).statusCode).toBe(200)
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)

      const res = await admin(ctx, me.cookie, 'GET', '/users')
      expect(res.statusCode, res.body).toBe(200)
      const users = new Map((res.json() as { id: string }[]).map((user) => [user.id, user]))
      expect(Object.keys(users.get(bob.user.id)!).sort()).toEqual(
        ['active', 'createdAt', 'email', 'id', 'invite', 'isInstanceAdmin', 'lastSeenAt', 'name', 'projectCount'].sort(),
      )
      expect(users.get(bob.user.id)).toMatchObject({ active: false, projectCount: 2, invite: null })
      expect(users.get(bob.user.id)).toHaveProperty('lastSeenAt', expect.any(String))
      expect(users.get(joinedId)).toMatchObject({ active: true, projectCount: 0, invite: { id: inviteId, name: '디자인팀' } })
      expect(users.get(me.user.id)).toMatchObject({ isInstanceAdmin: true })
      expect(res.body).not.toContain('password')
      expect((await admin(ctx, bob.cookie, 'GET', '/users')).statusCode).toBe(401)
    })
  })
})

describe('관리자 › 프로젝트 목록', () => {
  it('관리자가 멤버가 아닌 프로젝트도 낸다 — owner(활성 여부) · 멤버 수 · 활성 owner 유무', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const project = await createProject(ctx, bob.cookie, { name: '남의 것' })
      await addMember(ctx, project.id, carol.user.id, 'viewer')
      // 관리자 자신의 프로젝트 — 멤버 수가 프로젝트마다 세지는지 가른다(하나뿐이면 «전부» 와 같다).
      await createProject(ctx, me.cookie)
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)

      const res = await admin(ctx, me.cookie, 'GET', '/projects')
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toHaveLength(2)
      const item = res.json().find((p: { id: string }) => p.id === project.id)
      expect(item).toMatchObject({
        id: project.id,
        name: '남의 것',
        slug: project.slug,
        owners: [{ id: bob.user.id, name: bob.user.name, active: false }],
        hasActiveOwner: false,
        memberCount: 2,
      })
      expect(Object.keys(item).sort()).toEqual(['hasActiveOwner', 'id', 'memberCount', 'name', 'owners', 'slug', 'updatedAt'])
      // 목록이 내용의 문을 열지 않는다 — 멤버가 아닌 관리자는 그 프로젝트를 여전히 못 연다.
      expect((await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, cookies: me.cookie })).statusCode).toBe(404)
    })
  })
})

describe('관리자 › 프로젝트 목록 — 최근 수정', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('페이지 편집 뒤 그 프로젝트의 `updatedAt` 만 늦어지고, 페이지 없는 프로젝트는 프로젝트 행의 시각이다', async () => {
    await withRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const edited = await createProject(ctx, bob.cookie)
      const quiet = await createProject(ctx, bob.cookie)
      const menu = await createMenuNode(ctx, bob.cookie, edited.id)
      const page = await createPage(ctx, bob.cookie, edited.id, menu.id)
      const read = async (): Promise<Map<string, string>> =>
        new Map((await admin(ctx, me.cookie, 'GET', '/projects')).json().map((p: { id: string; updatedAt: string }) => [p.id, p.updatedAt]))
      const before = await read()
      const quietRow = await getTestDb().selectFrom('projects').select('updated_at').where('id', '=', quiet.id).executeTakeFirstOrThrow()
      expect(before.get(quiet.id)).toBe(quietRow.updated_at.toISOString())
      await new Promise((resolve) => setTimeout(resolve, 20))
      const edit = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${edited.id}/pages/${page.id}/ops`,
        cookies: bob.cookie,
        payload: {
          baseSeq: 0,
          ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_edit', type: 'Text', props: {} } }],
        },
      })
      expect(edit.statusCode, edit.body).toBe(200)
      const after = await read()
      expect(Date.parse(after.get(edited.id)!)).toBeGreaterThan(Date.parse(before.get(edited.id)!))
      expect(after.get(quiet.id)).toBe(before.get(quiet.id))
    })
  })
})

describe('owner 넘기기', () => {
  it('활성 owner 가 있으면 409', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const res = await transfer(ctx, me.cookie, project.id, me.user.id)
      expect(res.statusCode).toBe(409)
      expect(res.json().error.message).toBe(ACTIVE_OWNER_EXISTS)
    })
  })

  it('자기에게 넘기기 200 — 넘기기 전 404 · 뒤 200, 비활성 owner 행은 그대로, 기록', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)
      const open = () => ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, cookies: me.cookie })
      expect((await open()).statusCode).toBe(404)

      const res = await transfer(ctx, me.cookie, project.id, me.user.id)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().project).toMatchObject({ hasActiveOwner: true, memberCount: 2 })
      expect((await open()).statusCode).toBe(200)
      const roles = await ctx.db
        .selectFrom('project_members')
        .select(['user_id', 'role'])
        .where('project_id', '=', project.id)
        .orderBy('user_id')
        .execute()
      expect(roles).toEqual(
        [
          { user_id: bob.user.id, role: 'owner' },
          { user_id: me.user.id, role: 'owner' },
        ].sort((a, b) => (a.user_id < b.user_id ? -1 : 1)),
      )
      const audit = (await admin(ctx, me.cookie, 'GET', '/audit?action=project.owner')).json().entries
      expect(audit[0]).toMatchObject({ project: { id: project.id }, targetUser: { id: me.user.id }, detail: { previousRole: 'none' } })
    })
  })

  it('멤버면 owner 로 올린다 · 멤버가 아니면 앞 멤버십의 토큰을 지우고 넣는다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const dave = await signup(ctx)
      const first = await createProject(ctx, bob.cookie)
      const second = await createProject(ctx, bob.cookie)
      await addMember(ctx, first.id, carol.user.id, 'viewer')
      // 멤버가 아닌 dave 의 앞 멤버십 토큰(제거가 건너뛴 행과 같은 꼴).
      await insertApiToken(ctx.db, { projectId: second.id, userId: dave.user.id, name: 'stale' })
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)

      expect((await transfer(ctx, me.cookie, first.id, carol.user.id)).statusCode).toBe(200)
      expect((await transfer(ctx, me.cookie, second.id, dave.user.id)).statusCode).toBe(200)
      const role = async (projectId: string, userId: string) =>
        (
          await ctx.db
            .selectFrom('project_members')
            .select('role')
            .where('project_id', '=', projectId)
            .where('user_id', '=', userId)
            .executeTakeFirst()
        )?.role
      expect([await role(first.id, carol.user.id), await role(second.id, dave.user.id)]).toEqual(['owner', 'owner'])
      expect(await ctx.db.selectFrom('api_tokens').select('id').where('user_id', '=', dave.user.id).execute()).toEqual([])
    })
  })

  it('비활성 대상 400 · 없는 프로젝트 404 · 관리자 아님 403', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      for (const who of [bob, carol]) expect((await deactivate(ctx, me.cookie, who.user.id)).statusCode).toBe(200)
      const inactive = await transfer(ctx, me.cookie, project.id, carol.user.id)
      expect(inactive.statusCode).toBe(400)
      expect(inactive.json().error.message).toBe(OWNER_TARGET_INACTIVE)
      expect((await transfer(ctx, me.cookie, '00000000-0000-4000-8000-000000000000', me.user.id)).statusCode).toBe(404)
      const plain = await signup(ctx)
      expect((await transfer(ctx, plain.cookie, project.id, plain.user.id)).statusCode).toBe(403)
    })
  })
})

describe('owner 넘기기는 세션 전용이다', () => {
  it('관리자의 API 토큰(그 프로젝트의 것)으로는 401 — 넘기기가 안 일어난다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      await addMember(ctx, project.id, me.user.id, 'viewer')
      const token = await insertApiToken(ctx.db, { projectId: project.id, userId: me.user.id, name: 'cli' })
      expect((await deactivate(ctx, me.cookie, bob.user.id)).statusCode).toBe(200)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/admin/projects/${project.id}/owner`,
        headers: { authorization: `Bearer ${token.value}` },
        payload: { userId: me.user.id },
      })
      expect(res.statusCode, res.body).toBe(401)
      const role = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', me.user.id)
        .executeTakeFirstOrThrow()
      expect(role.role).toBe('viewer')
    })
  })
})

describe('owner 넘기기 × 프로젝트 삭제 — 두 차례 모두 교착 0', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const remove = (ctx: TestContext, cookie: SignedUpUser['cookie'], projectId: string) =>
    ctx.app.inject({ method: 'DELETE', url: `/api/projects/${projectId}`, cookies: cookie })

  /** owner 하나(활성)가 지우고, 관리자가 같은 프로젝트를 넘기려 드는 판. 넘기기는 활성 owner 가 있어 409 거나 지워져 404 다. */
  async function scene(ctx: TestContext) {
    const me = await adminOf(ctx)
    const bob = await signup(ctx)
    const project = await createProject(ctx, bob.cookie)
    return { me, bob, project }
  }

  it('넘기기가 프로젝트 행을 쥔 판 — 삭제가 그 행에서 줄을 서고, 넘기기 409 · 삭제 204', async () => {
    await withProxiedRealApi(async (ctx) => {
      const db = getTestDb()
      const { me, bob, project } = await scene(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery('from "api_tokens"')
      const moving = transfer(ctx, me.cookie, project.id, me.user.id)
      await hold.held
      const holder = await heldBackend(db)
      const deleting = remove(ctx, bob.cookie, project.id)
      const waited = await settledOrQueued(db, deleting, holder, 'for update')
      hold.release()
      const [moved, deleted] = await Promise.all([moving, deleting])
      expect([moved.statusCode, deleted.statusCode]).toEqual([409, 204])
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(waited).toBe('queued')
    })
  })

  it('삭제가 프로젝트 행을 쥔 판 — 넘기기가 그 행에서 줄을 서고, 삭제 204 · 넘기기 404', async () => {
    await withProxiedRealApi(async (ctx) => {
      const db = getTestDb()
      const { me, bob, project } = await scene(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery('from "pages"')
      const deleting = remove(ctx, bob.cookie, project.id)
      await hold.held
      const holder = await heldBackend(db)
      const moving = transfer(ctx, me.cookie, project.id, me.user.id)
      const waited = await settledOrQueued(db, moving, holder, 'for key share')
      hold.release()
      const [deleted, moved] = await Promise.all([deleting, moving])
      expect([deleted.statusCode, moved.statusCode]).toEqual([204, 404])
      expect((await deadlockCount(db)) - before).toBe(0)
      expect(waited).toBe('queued')
      const left = await sql<{ n: string }>`select count(*)::text as n from projects where id = ${project.id}`.execute(db)
      expect(left.rows[0]!.n).toBe('0')
    })
  })
})
