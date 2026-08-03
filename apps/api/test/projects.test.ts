import { describe, expect, it } from 'vitest'
import { addMember, createProject, signup, withApi } from './helpers'

describe('POST /api/projects', () => {
  it('201과 role: owner를 반환한다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '프로젝트', slug: 'my-project', description: '설명' },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body).toMatchObject({ name: '프로젝트', slug: 'my-project', description: '설명', role: 'owner' })
      expect(typeof body.id).toBe('string')
    })
  })

  it('생성자가 project_members에 owner로 들어간다', async () => {
    await withApi(async (ctx) => {
      const { user, cookie } = await signup(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '프로젝트', slug: 'owner-check' },
      })
      expect(res.statusCode).toBe(201)
      const projectId = res.json().id

      const member = await ctx.db
        .selectFrom('project_members')
        .select('role')
        .where('project_id', '=', projectId)
        .where('user_id', '=', user.id)
        .executeTakeFirst()
      expect(member?.role).toBe('owner')
    })
  })

  it('미인증은 401이다', async () => {
    await withApi(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        payload: { name: '프로젝트', slug: 'no-auth' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  it.each([
    ['대문자', 'Invalid-Slug'],
    ['공백 포함', 'invalid slug'],
    ['하이픈으로 시작', '-invalid'],
    ['하이픈으로 끝남', 'invalid-'],
    ['65자', 'a'.repeat(65)],
  ])('slug 형식 위반(%s)은 400이다', async (_label, slug) => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '프로젝트', slug },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('slug 중복은 409이고, 실패해도 트랜잭션은 오염되지 않는다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const first = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '프로젝트1', slug: 'dup-slug' },
      })
      expect(first.statusCode).toBe(201)
      const projectId = first.json().id

      const second = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '프로젝트2', slug: 'dup-slug' },
      })
      expect(second.statusCode).toBe(409)
      expect(second.json().error.code).toBe('conflict')

      // 세이브포인트가 없다면 여기서부터 바깥(withApi) 트랜잭션이 이미 aborted라
      // 25P02로 실패한다(src/db/tx.ts) — 통과한다는 것 자체가 세이브포인트가
      // 실제로 동작했다는 증거다.
      const projects = await ctx.db.selectFrom('projects').selectAll().where('slug', '=', 'dup-slug').execute()
      expect(projects).toHaveLength(1)
      expect(projects[0]?.id).toBe(projectId)

      // 실패한 두 번째 시도가 owner 멤버 행을 추가로 남기지 않았다 — 프로젝트
      // 삽입과 멤버 삽입이 정말로 한 단위(세이브포인트 하나)로 롤백됐는지 확인한다.
      const members = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', projectId)
        .execute()
      expect(members).toHaveLength(1)
    })
  })

  it('name이 빈 문자열이면 400이다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '', slug: 'empty-name' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('선언되지 않은 키가 있으면 400이다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/projects',
        cookies: cookie,
        payload: { name: '프로젝트', slug: 'extra-key', role: 'owner' },
      })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('GET /api/projects', () => {
  it('내가 멤버인 프로젝트만 나온다 (다른 사람 프로젝트는 안 나온다)', async () => {
    await withApi(async (ctx) => {
      const me = await signup(ctx)
      const stranger = await signup(ctx)
      const mine = await createProject(ctx, me.cookie)
      await createProject(ctx, stranger.cookie)

      const res = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: me.cookie })
      expect(res.statusCode).toBe(200)
      const body: Array<{ id: string }> = res.json()
      expect(body).toHaveLength(1)
      expect(body[0]?.id).toBe(mine.id)
    })
  })

  it('각 항목에 내 role이 실린다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const ownerRes = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: owner.cookie })
      expect(ownerRes.json()[0]?.role).toBe('owner')

      const editorRes = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: editor.cookie })
      expect(editorRes.json()[0]?.role).toBe('editor')
    })
  })

  it('멤버인 프로젝트가 없으면 빈 배열이다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: cookie })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  it('미인증은 401이다', async () => {
    await withApi(async (ctx) => {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/projects' })
      expect(res.statusCode).toBe(401)
    })
  })
})

describe('GET /api/projects/:projectId', () => {
  it('viewer가 조회할 수 있다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: viewer.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: project.id, name: project.name, slug: project.slug, role: 'viewer' })
    })
  })

  it('비멤버는 404다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: outsider.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('없는 uuid는 404다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/projects/00000000-0000-0000-0000-000000000000',
        cookies: cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('uuid가 아닌 경로는 400이다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx)
      const res = await ctx.app.inject({ method: 'GET', url: '/api/projects/not-a-uuid', cookies: cookie })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('PATCH /api/projects/:projectId', () => {
  it('owner가 이름을 바꾼다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
        payload: { name: '바뀐 이름' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('바뀐 이름')

      const row = await ctx.db
        .selectFrom('projects')
        .select('name')
        .where('id', '=', project.id)
        .executeTakeFirstOrThrow()
      expect(row.name).toBe('바뀐 이름')
    })
  })

  it('editor는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: editor.cookie,
        payload: { name: '바뀐 이름' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  it('viewer는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: viewer.cookie,
        payload: { name: '바뀐 이름' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  it('비멤버는 403이 아니라 404다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: outsider.cookie,
        payload: { name: '바뀐 이름' },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('다른 프로젝트의 slug로 바꾸면 409이고, 실패해도 트랜잭션은 오염되지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie, { slug: 'slug-a-patch' })
      const projectB = await createProject(ctx, owner.cookie, { slug: 'slug-b-patch' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectB.id}`,
        cookies: owner.cookie,
        payload: { slug: 'slug-a-patch' },
      })
      expect(res.statusCode).toBe(409)

      // 세이브포인트가 없다면 여기서부터 25P02로 실패한다 — 통과 자체가 증거다.
      // slug가 실제로 바뀌지 않았는지도 함께 확인한다(부분 갱신 방지).
      const row = await ctx.db
        .selectFrom('projects')
        .select('slug')
        .where('id', '=', projectB.id)
        .executeTakeFirstOrThrow()
      expect(row.slug).toBe('slug-b-patch')

      const stillA = await ctx.db
        .selectFrom('projects')
        .select('slug')
        .where('id', '=', projectA.id)
        .executeTakeFirstOrThrow()
      expect(stillA.slug).toBe('slug-a-patch')
    })
  })

  it('빈 본문은 400이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('DELETE /api/projects/:projectId', () => {
  it('owner가 지운다 (204, 이후 조회는 404)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
      })
      expect(after.statusCode).toBe(404)
    })
  })

  it('editor는 403이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        cookies: editor.cookie,
      })
      expect(res.statusCode).toBe(403)
    })
  })

  it('비멤버는 403이 아니라 404다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        cookies: outsider.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('멤버 행이 함께 지워진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const editor = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const members = await ctx.db
        .selectFrom('project_members')
        .selectAll()
        .where('project_id', '=', project.id)
        .execute()
      expect(members).toHaveLength(0)
    })
  })
})
