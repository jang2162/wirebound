/**
 * «내 토큰» — 로그인한 사람의 토큰 전부를 프로젝트를 가로질러 보고 거둔다(`routes/tokens.ts`의 «내 토큰은 프로젝트를
 * 가로지른다»). 잠금 순서 · 교착은 실커밋이 필요해 `my-tokens-lock.test.ts`가 잰다.
 *
 * **비멤버 프로젝트의 토큰은 DB 로 만든다** — 멤버 제거는 토큰을 함께 지우므로(`deleteMemberTokens`) API 로는 제거와 겹친
 * 발급(`SKIP LOCKED`) 판에서만 남는다. 여기서 재는 것은 «남은 토큰을 보고 거두는가»라 멤버 행을 직접 지워 그 상태를 세운다.
 *
 * | 변조 | 혼자 죽는 케이스 |
 * |---|---|
 * | 목록 순서를 뒤집음 | «두 프로젝트의 내 토큰이 …» |
 * | 비멤버에도 이름을 붙임 · 멤버 여부를 늘 참 · 목록이 멤버 프로젝트만 | «멤버가 아닌 프로젝트의 토큰도 보인다» |
 * | 하나 폐기가 멤버 프로젝트의 것만 지움 | «멤버가 아닌 프로젝트의 토큰을 하나 폐기하면» |
 * | 하나 폐기가 `user_id`를 안 봄 | «남의 토큰 id · 없는 id 는 404» |
 * | 전부 폐기가 `user_id`를 안 봄 | «전부 폐기» |
 * | 목록 라우트의 `requireAuth` · `requireSessionUser`를 뗌 | «세션으로만» — `token-route-census`는 가드가 없는 라우트를 «공개»로 읽어 안 죽는다 |
 */
import { describe, expect, it } from 'vitest'
import { addMember, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'

async function issueToken(ctx: TestContext, who: SignedUpUser, projectId: string, name: string) {
  const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/tokens`, cookies: who.cookie, payload: { name } })
  if (res.statusCode !== 201) throw new Error(`토큰 발급 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  const body = res.json() as { id: string; value: string }
  return { id: body.id, header: { authorization: `Bearer ${body.value}` } }
}

/** 멤버 행만 지운다 — 토큰은 남는다(머리말). */
async function dropMembership(ctx: TestContext, projectId: string, userId: string): Promise<void> {
  const result = await ctx.db
    .deleteFrom('project_members')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (result.numDeletedRows !== 1n) throw new Error('멤버 행을 못 지웠습니다')
}

function readProject(ctx: TestContext, projectId: string, header: { authorization: string }) {
  return ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}`, headers: header })
}

describe('내 토큰 목록 — 프로젝트를 가로지른다', () => {
  it('두 프로젝트의 내 토큰이 멤버 여부 · 이름과 함께 나오고, 원문 · 남의 토큰은 없다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const mine = await createProject(ctx, bob.cookie, { name: '밥의 설계서' })
      const shared = await createProject(ctx, alice.cookie, { name: '앨리스의 설계서' })
      await addMember(ctx, shared.id, bob.user.id, 'viewer')

      const first = await issueToken(ctx, bob, mine.id, 'CI')
      const second = await issueToken(ctx, bob, shared.id, '노트북')
      await issueToken(ctx, alice, shared.id, '앨리스 것')

      const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/tokens', cookies: bob.cookie })
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as Array<Record<string, unknown>>
      expect(body.map((row) => [row.id, row.name, row.projectId, row.projectName, row.member])).toEqual([
        [first.id, 'CI', mine.id, '밥의 설계서', true],
        [second.id, '노트북', shared.id, '앨리스의 설계서', true],
      ])
      // 칸은 이것뿐이다 — 원문(`value`) · 해시가 없다.
      expect(Object.keys(body[0]!).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'member', 'name', 'projectId', 'projectName'])
      expect(res.body).not.toContain(first.header.authorization.slice('Bearer '.length))
    })
  })

  it('멤버가 아닌 프로젝트의 토큰도 보인다 — 이름은 싣지 않는다(빠진 뒤 바꾼 이름이 안 샌다)', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie, { name: '옛 이름' })
      await addMember(ctx, project.id, bob.user.id, 'editor')
      const token = await issueToken(ctx, bob, project.id, '떠난 곳')
      await dropMembership(ctx, project.id, bob.user.id)
      const renamed = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}`,
        cookies: alice.cookie,
        payload: { name: '빠진 뒤 지은 이름' },
      })
      expect(renamed.statusCode, renamed.body).toBe(200)

      // 그 프로젝트 아래의 목록은 가드가 404 라 못 본다 — 이 목록이 있어야 하는 까닭.
      const scoped = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tokens`, cookies: bob.cookie })
      expect(scoped.statusCode).toBe(404)

      const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/tokens', cookies: bob.cookie })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toEqual([
        {
          id: token.id,
          name: '떠난 곳',
          createdAt: expect.any(String),
          lastUsedAt: null,
          projectId: project.id,
          projectName: null,
          member: false,
        },
      ])
      expect(res.body).not.toContain('빠진 뒤 지은 이름')
      expect(res.body).not.toContain('옛 이름')
    })
  })
})

describe('내 토큰 폐기 — 어느 프로젝트의 것이든', () => {
  it('멤버가 아닌 프로젝트의 토큰을 하나 폐기하면 다시 멤버가 돼도 401 이다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      const token = await issueToken(ctx, bob, project.id, '떠난 곳')
      const kept = await issueToken(ctx, bob, project.id, '남길 것')
      await dropMembership(ctx, project.id, bob.user.id)

      // 그 프로젝트 아래의 폐기는 가드가 404 다.
      const scoped = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}/tokens/${token.id}`, cookies: bob.cookie })
      expect(scoped.statusCode).toBe(404)

      const revoked = await ctx.app.inject({ method: 'DELETE', url: `/api/auth/tokens/${token.id}`, cookies: bob.cookie })
      expect(revoked.statusCode, revoked.body).toBe(204)

      await addMember(ctx, project.id, bob.user.id, 'editor')
      expect((await readProject(ctx, project.id, token.header)).statusCode).toBe(401)
      // 하나만 지웠다.
      expect((await readProject(ctx, project.id, kept.header)).statusCode).toBe(200)
    })
  })

  it('남의 토큰 id · 없는 id 는 404 이고 그 토큰은 산다 · id 가 uuid 가 아니면 400', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'viewer')
      const alices = await issueToken(ctx, alice, project.id, '앨리스 것')

      const other = await ctx.app.inject({ method: 'DELETE', url: `/api/auth/tokens/${alices.id}`, cookies: bob.cookie })
      expect(other.statusCode).toBe(404)
      const missing = await ctx.app.inject({
        method: 'DELETE',
        url: '/api/auth/tokens/00000000-0000-4000-8000-000000000000',
        cookies: bob.cookie,
      })
      expect(missing.statusCode).toBe(404)
      const malformed = await ctx.app.inject({ method: 'DELETE', url: '/api/auth/tokens/not-a-uuid', cookies: bob.cookie })
      expect(malformed.statusCode).toBe(400)

      expect((await readProject(ctx, project.id, alices.header)).statusCode).toBe(200)
    })
  })

  it('전부 폐기 — 멤버 · 비멤버 프로젝트의 내 토큰이 다 죽고, 남의 토큰과 내 세션은 산다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const mine = await createProject(ctx, bob.cookie)
      const left = await createProject(ctx, alice.cookie)
      await addMember(ctx, left.id, bob.user.id, 'editor')
      const ci = await issueToken(ctx, bob, mine.id, 'CI')
      const laptop = await issueToken(ctx, bob, mine.id, '노트북')
      const gone = await issueToken(ctx, bob, left.id, '떠난 곳')
      const alices = await issueToken(ctx, alice, left.id, '앨리스 것')
      await dropMembership(ctx, left.id, bob.user.id)

      const res = await ctx.app.inject({ method: 'DELETE', url: '/api/auth/tokens', cookies: bob.cookie })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toEqual({ revoked: 3 })

      expect((await readProject(ctx, mine.id, ci.header)).statusCode).toBe(401)
      expect((await readProject(ctx, mine.id, laptop.header)).statusCode).toBe(401)
      await addMember(ctx, left.id, bob.user.id, 'editor')
      expect((await readProject(ctx, left.id, gone.header)).statusCode).toBe(401)
      expect((await readProject(ctx, left.id, alices.header)).statusCode).toBe(200)
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })).statusCode).toBe(200)

      const again = await ctx.app.inject({ method: 'DELETE', url: '/api/auth/tokens', cookies: bob.cookie })
      expect(again.json()).toEqual({ revoked: 0 })
    })
  })
})

describe('내 토큰은 세션으로만 — 토큰으로는 401', () => {
  it('목록 · 하나 폐기 · 전부 폐기를 토큰으로 부르면 401 이고 아무것도 안 지운다', async () => {
    await withApi(async (ctx) => {
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const token = await issueToken(ctx, bob, project.id, 'CI')

      for (const [method, url] of [
        ['GET', '/api/auth/tokens'],
        ['DELETE', `/api/auth/tokens/${token.id}`],
        ['DELETE', '/api/auth/tokens'],
      ] as const) {
        const res = await ctx.app.inject({ method, url, headers: token.header })
        expect(res.statusCode, `${method} ${url}`).toBe(401)
      }
      expect((await readProject(ctx, project.id, token.header)).statusCode).toBe(200)
    })
  })
})
