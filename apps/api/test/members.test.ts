import { describe, expect, it } from 'vitest'
import { addMember, createProject, signup, withApi } from './helpers'

describe('GET /api/projects/:projectId/members', () => {
  it('owner가 목록을 본다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      const body: Array<{ userId: string; role: string }> = res.json()
      expect(body).toHaveLength(1)
      expect(body[0]).toMatchObject({ userId: owner.user.id, role: 'owner' })
    })
  })

  it('editor가 목록을 본다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/members`,
        cookies: editor.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(2)
    })
  })

  it('viewer가 목록을 본다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/members`,
        cookies: viewer.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(2)
    })
  })

  it('비멤버는 404다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/members`,
        cookies: outsider.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('이메일과 이름이 실린다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx, { email: 'owner-fields@example.com', name: '오너이름' })
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
      })
      expect(res.json()[0]).toMatchObject({ email: 'owner-fields@example.com', name: '오너이름' })
    })
  })

  it('비밀번호 해시가 실리지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
      })
      const member = res.json()[0]
      expect(member).not.toHaveProperty('passwordHash')
      expect(member).not.toHaveProperty('password_hash')
      expect(Object.keys(member).sort()).toEqual(['email', 'invitedAt', 'name', 'role', 'userId'].sort())
    })
  })
})

describe('POST /api/projects/:projectId/members', () => {
  it('owner가 editor를 초대한다 (201)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const target = await signup(ctx, { email: 'invitee@example.com' })
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: 'invitee@example.com', role: 'editor' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ userId: target.user.id, email: 'invitee@example.com', role: 'editor' })

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', target.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('editor')
    })
  })

  it('초대된 사용자가 실제로 프로젝트에 접근 가능해진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const target = await signup(ctx, { email: 'invitee-access@example.com' })
      const project = await createProject(ctx, owner.cookie)

      const inviteRes = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: 'invitee-access@example.com', role: 'viewer' },
      })
      expect(inviteRes.statusCode).toBe(201)

      const accessRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: target.cookie,
      })
      expect(accessRes.statusCode).toBe(200)
      expect(accessRes.json()).toMatchObject({ id: project.id, role: 'viewer' })
    })
  })

  it('editor는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const target = await signup(ctx, { email: 'invitee-editor-403@example.com' })
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: editor.cookie,
        payload: { email: 'invitee-editor-403@example.com', role: 'viewer' },
      })
      expect(res.statusCode).toBe(403)

      const row = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('user_id', '=', target.user.id)
        .executeTakeFirst()
      expect(row).toBeUndefined()
    })
  })

  it('viewer는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: viewer.cookie,
        payload: { email: 'nobody@example.com', role: 'viewer' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  it('미가입 이메일은 404다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: 'never-signed-up@example.com', role: 'viewer' },
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.message).toBe('해당 이메일의 사용자가 없습니다')
    })
  })

  it('이미 멤버면 409이고, 실패해도 트랜잭션은 오염되지 않으며 기존 멤버 행은 그대로다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const existing = await signup(ctx, { email: 'already-member@example.com' })
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, existing.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: 'already-member@example.com', role: 'editor' },
      })
      expect(res.statusCode).toBe(409)

      // 세이브포인트가 없다면 여기서부터 바깥(withApi) 트랜잭션이 이미 aborted라
      // 25P02로 실패한다(src/db/tx.ts) — 통과한다는 것 자체가 세이브포인트가
      // 실제로 동작했다는 증거다. 기존 행이 여전히 하나뿐이고 역할도 바뀌지
      // 않았는지까지 확인해야 "그냥 409를 냈다"가 아니라 "삽입 자체가 실패해
      // 원래 상태로 복구됐다"를 증명한다.
      const rows = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('user_id', '=', existing.user.id)
        .execute()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.role).toBe('viewer')
    })
  })

  it('알 수 없는 역할은 400이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: 'someone@example.com', role: 'admin' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('이메일 대소문자를 무시한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const target = await signup(ctx, { email: 'case-test@example.com' })
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: 'CASE-TEST@EXAMPLE.COM', role: 'viewer' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().userId).toBe(target.user.id)
    })
  })
})

describe('PATCH /api/projects/:projectId/members/:userId', () => {
  it('owner가 viewer를 editor로 올린다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${viewer.user.id}`,
        cookies: owner.cookie,
        payload: { role: 'editor' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ userId: viewer.user.id, role: 'editor' })

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', viewer.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('editor')
    })
  })

  it('대상이 멤버가 아니면 404다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${outsider.user.id}`,
        cookies: owner.cookie,
        payload: { role: 'editor' },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('editor는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${viewer.user.id}`,
        cookies: editor.cookie,
        payload: { role: 'editor' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  it('마지막 owner 강등은 409이고 역할이 바뀌지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${owner.user.id}`,
        cookies: owner.cookie,
        payload: { role: 'editor' },
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.message).toBe('프로젝트에는 owner가 최소 한 명 있어야 합니다')

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', owner.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('owner')
    })
  })

  it('owner가 둘이면 한 명 강등은 성공한다', async () => {
    await withApi(async (ctx) => {
      const ownerA = await signup(ctx)
      const ownerB = await signup(ctx)
      const project = await createProject(ctx, ownerA.cookie)
      await addMember(ctx, project.id, ownerB.user.id, 'owner')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${ownerB.user.id}`,
        cookies: ownerA.cookie,
        payload: { role: 'editor' },
      })
      expect(res.statusCode).toBe(200)

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', ownerB.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('editor')
    })
  })
})

describe('DELETE /api/projects/:projectId/members/:userId', () => {
  it('owner가 멤버를 뺀다 (204)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${editor.user.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const row = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('user_id', '=', editor.user.id)
        .executeTakeFirst()
      expect(row).toBeUndefined()
    })
  })

  it('뺀 사용자는 이후 프로젝트 조회에서 404를 받는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const delRes = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${editor.user.id}`,
        cookies: owner.cookie,
      })
      expect(delRes.statusCode).toBe(204)

      const afterRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: editor.cookie,
      })
      expect(afterRes.statusCode).toBe(404)
    })
  })

  it('마지막 owner 제거는 409다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${owner.user.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(409)

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', owner.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('owner')
    })
  })

  it('owner가 둘이면 자기 제거는 성공한다', async () => {
    await withApi(async (ctx) => {
      const ownerA = await signup(ctx)
      const ownerB = await signup(ctx)
      const project = await createProject(ctx, ownerA.cookie)
      await addMember(ctx, project.id, ownerB.user.id, 'owner')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${ownerA.user.id}`,
        cookies: ownerA.cookie,
      })
      expect(res.statusCode).toBe(204)

      const remaining = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .execute()
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.user_id).toBe(ownerB.user.id)
    })
  })

  it('editor는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${viewer.user.id}`,
        cookies: editor.cookie,
      })
      expect(res.statusCode).toBe(403)

      const row = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('user_id', '=', viewer.user.id)
        .executeTakeFirst()
      expect(row).toBeDefined()
    })
  })
})

describe('owner 불변식', () => {
  it('owner 둘 중 하나를 강등하면 성공하고, 이어서 남은 하나를 강등하면 409다', async () => {
    await withApi(async (ctx) => {
      const ownerA = await signup(ctx)
      const ownerB = await signup(ctx)
      const project = await createProject(ctx, ownerA.cookie)
      await addMember(ctx, project.id, ownerB.user.id, 'owner')

      const demoteB = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${ownerB.user.id}`,
        cookies: ownerA.cookie,
        payload: { role: 'editor' },
      })
      expect(demoteB.statusCode).toBe(200)

      const demoteA = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${ownerA.user.id}`,
        cookies: ownerA.cookie,
        payload: { role: 'editor' },
      })
      expect(demoteA.statusCode).toBe(409)

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', ownerA.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('owner')
    })
  })

  it('강등과 제거 양쪽 경로가 같은 불변식을 지킨다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const demote = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${owner.user.id}`,
        cookies: owner.cookie,
        payload: { role: 'viewer' },
      })
      expect(demote.statusCode).toBe(409)

      const remove = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${owner.user.id}`,
        cookies: owner.cookie,
      })
      expect(remove.statusCode).toBe(409)

      const row = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', project.id)
        .where('user_id', '=', owner.user.id)
        .executeTakeFirstOrThrow()
      expect(row.role).toBe('owner')
    })
  })

  it('409가 난 뒤에도 역할이 바뀌지 않았고, 트랜잭션도 오염되지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${owner.user.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(409)

      // 세이브포인트가 없다면 이 조회 자체가 25P02로 실패한다 — 통과 자체가 증거다.
      const members = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .execute()
      expect(members).toHaveLength(1)
      expect(members[0]?.role).toBe('owner')
      expect(members[0]?.user_id).toBe(owner.user.id)
    })
  })
})
