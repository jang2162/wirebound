/**
 * 표시 옵션(`routes/view-prefs.ts` · `0039-view-prefs`) — 설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「표시 옵션 저장」.
 *
 * 커밋 순간의 권한(복원을 기다리는 사이 멤버에서 빠짐)은 `guard-in-lock.test.ts` 의 `PROJECT_PROBES` 가 든다.
 */
import { describe, expect, it } from 'vitest'
import { addMember, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'

type Who = { cookies: SignedUpUser['cookie'] } | { headers: { authorization: string } }

function as(user: SignedUpUser): Who {
  return { cookies: user.cookie }
}

function prefsUrl(projectId: string): string {
  return `/api/projects/${projectId}/view-prefs`
}

function getPrefs(ctx: TestContext, who: Who, projectId: string) {
  return ctx.app.inject({ method: 'GET', url: prefsUrl(projectId), ...who })
}

function putPrefs(ctx: TestContext, who: Who, projectId: string, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'PUT', url: prefsUrl(projectId), ...who, payload })
}

async function hidden(ctx: TestContext, user: SignedUpUser, projectId: string): Promise<string[]> {
  const res = await getPrefs(ctx, as(user), projectId)
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { hiddenRegions: string[] }).hiddenRegions
}

async function saved(ctx: TestContext, user: SignedUpUser, projectId: string, hiddenRegions: string[]): Promise<void> {
  const res = await putPrefs(ctx, as(user), projectId, { hiddenRegions })
  expect(res.statusCode, res.body).toBe(200)
  expect(res.json()).toEqual({ hiddenRegions })
}

async function issueToken(ctx: TestContext, user: SignedUpUser, projectId: string): Promise<Who> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/tokens`,
    cookies: user.cookie,
    payload: { name: '토큰' },
  })
  if (res.statusCode !== 201) throw new Error(`토큰 발급 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  return { headers: { authorization: `Bearer ${(res.json() as { value: string }).value}` } }
}

async function rowCount(ctx: TestContext, projectId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('project_view_prefs')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('project_id', '=', projectId)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

describe('읽기 · 쓰기 — 사람 × 프로젝트', () => {
  it('행이 없으면 [] · PUT 뒤 GET 이 같은 값 · 통째로 바꾼다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      expect(await hidden(ctx, alice, project.id)).toEqual([])
      expect(await rowCount(ctx, project.id)).toBe(0)

      await saved(ctx, alice, project.id, ['subpage.gnb', 'subpage.lnb'])
      expect(await hidden(ctx, alice, project.id)).toEqual(['subpage.gnb', 'subpage.lnb'])

      await saved(ctx, alice, project.id, ['subpage.title'])
      expect(await hidden(ctx, alice, project.id)).toEqual(['subpage.title'])

      await saved(ctx, alice, project.id, [])
      expect(await hidden(ctx, alice, project.id)).toEqual([])
    })
  })

  it('같은 프로젝트의 다른 사람 · 같은 사람의 다른 프로젝트와 갈린다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const other = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'editor')

      await saved(ctx, alice, project.id, ['subpage.gnb'])
      await saved(ctx, bob, project.id, ['subpage.lnb', 'popup.title'])
      await saved(ctx, alice, other.id, ['subpage.breadcrumb'])

      expect(await hidden(ctx, alice, project.id)).toEqual(['subpage.gnb'])
      expect(await hidden(ctx, bob, project.id)).toEqual(['subpage.lnb', 'popup.title'])
      expect(await hidden(ctx, alice, other.id)).toEqual(['subpage.breadcrumb'])
      expect(await rowCount(ctx, project.id)).toBe(2)
    })
  })

  it('모르는 영역 id 도 꼴만 맞으면 받아 둔다 — 지금 테마가 선언했는지 안 본다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await saved(ctx, alice, project.id, ['blank.somethingElse9', 'popup.x'])
      expect(await hidden(ctx, alice, project.id)).toEqual(['blank.somethingElse9', 'popup.x'])
    })
  })
})

describe('권한 — viewer 도 자기 것 · 비멤버 404 · 토큰 403', () => {
  it('viewer 가 저장하고 읽는다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')
      await saved(ctx, viewer, project.id, ['subpage.gnb'])
      expect(await hidden(ctx, viewer, project.id)).toEqual(['subpage.gnb'])
    })
  })

  it('비멤버는 GET · PUT 둘 다 404 · 행이 안 선다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      expect((await getPrefs(ctx, as(outsider), project.id)).statusCode).toBe(404)
      expect((await putPrefs(ctx, as(outsider), project.id, { hiddenRegions: ['subpage.gnb'] })).statusCode).toBe(404)
      expect(await rowCount(ctx, project.id)).toBe(0)
    })
  })

  it('익명은 401', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      expect((await getPrefs(ctx, {} as Who, project.id)).statusCode).toBe(401)
      expect((await putPrefs(ctx, {} as Who, project.id, { hiddenRegions: [] })).statusCode).toBe(401)
    })
  })

  it('그 프로젝트의 토큰으로 부르면 GET · PUT 둘 다 403 · 행이 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const token = await issueToken(ctx, alice, project.id)
      await saved(ctx, alice, project.id, ['subpage.gnb'])

      const read = await getPrefs(ctx, token, project.id)
      expect([read.statusCode, read.body.includes('subpage.gnb')]).toEqual([403, false])
      const write = await putPrefs(ctx, token, project.id, { hiddenRegions: ['subpage.lnb'] })
      expect(write.statusCode, write.body).toBe(403)
      expect(await hidden(ctx, alice, project.id)).toEqual(['subpage.gnb'])
    })
  })
})

describe('본문 — 꼴 밖 · 33 개 · 겹침은 400', () => {
  const thirtyTwo = Array.from({ length: 32 }, (_, i) => `subpage.r${i}`)

  it('32 개는 받는다(경계)', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await saved(ctx, alice, project.id, thirtyTwo)
    })
  })

  it('33 개는 400 · 앞 값이 그대로다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await saved(ctx, alice, project.id, ['subpage.gnb'])
      const res = await putPrefs(ctx, as(alice), project.id, { hiddenRegions: [...thirtyTwo, 'subpage.r32'] })
      expect(res.statusCode, res.body).toBe(400)
      expect(await hidden(ctx, alice, project.id)).toEqual(['subpage.gnb'])
    })
  })

  it('겹친 열쇠는 400', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const res = await putPrefs(ctx, as(alice), project.id, { hiddenRegions: ['subpage.gnb', 'subpage.lnb', 'subpage.gnb'] })
      expect(res.statusCode, res.body).toBe(400)
      expect(await rowCount(ctx, project.id)).toBe(0)
    })
  })

  // 열쇠 꼴 ^(blank|popup|subpage)\.[a-z][A-Za-z0-9]{0,31}$ 의 경계 — 대조로 맞는 꼴 하나를 함께 둔다(위 «32 개» · 아래 33 자 id 의 짝).
  const bad: Array<[string, unknown]> = [
    ['모르는 레이아웃', ['modal.gnb']],
    ['점 없음', ['subpagegnb']],
    ['영역 id 가 대문자로 시작', ['subpage.Gnb']],
    ['영역 id 가 숫자로 시작', ['subpage.1gnb']],
    ['영역 id 에 하이픈', ['subpage.g-nb']],
    ['영역 id 가 33 자', [`subpage.a${'b'.repeat(32)}`]],
    ['빈 영역 id', ['subpage.']],
    ['앞뒤 공백', [' subpage.gnb']],
    ['줄바꿈 꼬리', ['subpage.gnb\n']],
    ['NUL', [`subpage.gnb${String.fromCharCode(0)}`]],
    ['글자가 아닌 항목', [1]],
    ['배열이 아님', 'subpage.gnb'],
    ['null', null],
  ]
  for (const [label, value] of bad) {
    it(`${label} → 400`, async () => {
      await withApi(async (ctx) => {
        const alice = await signup(ctx)
        const project = await createProject(ctx, alice.cookie)
        const res = await putPrefs(ctx, as(alice), project.id, { hiddenRegions: value })
        expect(res.statusCode, res.body).toBe(400)
        expect(await rowCount(ctx, project.id)).toBe(0)
      })
    })
  }

  it('영역 id 32 자는 받는다(위 33 자의 짝)', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await saved(ctx, alice, project.id, [`subpage.a${'b'.repeat(31)}`])
    })
  })

  it('선언되지 않은 키 · 키 없음은 400', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      expect((await putPrefs(ctx, as(alice), project.id, { hiddenRegions: [], extra: 1 })).statusCode).toBe(400)
      expect((await putPrefs(ctx, as(alice), project.id, {})).statusCode).toBe(400)
      expect(await rowCount(ctx, project.id)).toBe(0)
    })
  })
})

describe('수명 — 프로젝트 삭제 · 멤버 빠짐 · 스냅샷', () => {
  it('프로젝트를 지우면 행도 지워진다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'viewer')
      await saved(ctx, alice, project.id, ['subpage.gnb'])
      await saved(ctx, bob, project.id, ['subpage.lnb'])
      expect(await rowCount(ctx, project.id)).toBe(2)

      const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: alice.cookie })
      expect(removed.statusCode, removed.body).toBe(204)
      expect(await rowCount(ctx, project.id)).toBe(0)
    })
  })

  it('멤버에서 빠져도 행은 남고, 다시 들어오면 그대로 읽는다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      await saved(ctx, bob, project.id, ['subpage.gnb'])

      const out = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${bob.user.id}`,
        cookies: alice.cookie,
      })
      expect(out.statusCode, out.body).toBe(204)
      expect((await getPrefs(ctx, as(bob), project.id)).statusCode).toBe(404)
      expect(await rowCount(ctx, project.id)).toBe(1)

      await addMember(ctx, project.id, bob.user.id, 'viewer')
      expect(await hidden(ctx, bob, project.id)).toEqual(['subpage.gnb'])
    })
  })

  it('스냅샷 payload 에 안 실리고, 복원이 행을 안 바꾼다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await saved(ctx, alice, project.id, ['subpage.snapshotTimeKey'])

      const snap = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots`,
        cookies: alice.cookie,
        payload: { tag: '판' },
      })
      expect(snap.statusCode, snap.body).toBe(201)
      const snapshotId = (snap.json() as { id: string }).id
      const stored = await ctx.db.selectFrom('snapshots').select('payload').where('id', '=', snapshotId).executeTakeFirstOrThrow()
      const payloadText = JSON.stringify(stored.payload)
      // 카나리아 — payload 를 실제로 읽었다(빈 값과 견주면 아래가 늘 참이다).
      expect(payloadText.length).toBeGreaterThan(10)
      expect(payloadText).not.toContain('snapshotTimeKey')
      expect(payloadText).not.toMatch(/hidden_?regions|view_?prefs/i)

      await saved(ctx, alice, project.id, ['subpage.afterSnapshot'])
      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots/${snapshotId}/restore`,
        cookies: alice.cookie,
      })
      expect(restored.statusCode, restored.body).toBe(200)
      expect(await hidden(ctx, alice, project.id)).toEqual(['subpage.afterSnapshot'])
    })
  })
})
