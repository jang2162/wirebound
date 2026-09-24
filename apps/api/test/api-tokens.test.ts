/**
 * API 토큰 — 설계서 「권한 모델」.
 *
 * **권한 상속·역할을 얼리지 않음의 케이스는 하나짜리로 재면 안 된다.** *"editor의 토큰으로 복원이 403"*만 있으면
 * **토큰이 통째로 안 먹는 상태와 구분되지 않는다** — 같은 토큰으로 editor가 할 수 있는
 * 일(스냅샷 생성)이 **성공**하는 짝이 있어야 그 403이 역할 때문임을 말한다.
 */
import { describe, expect, it } from 'vitest'
import { hashTokenValue } from '../src/auth/token-hash'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type TestContext,
} from './helpers'

/** 토큰을 발급받아 `Authorization` 헤더 한 벌로 만든다. */
async function issueToken(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  name = '테스트 토큰',
): Promise<{ id: string; value: string; header: { authorization: string } }> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/tokens`,
    cookies: cookie,
    payload: { name },
  })
  if (res.statusCode !== 201) {
    throw new Error(`토큰 발급 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
  const body = res.json()
  return { id: body.id, value: body.value, header: { authorization: `Bearer ${body.value}` } }
}

describe('토큰 발급 — 발급은 멤버 누구나', () => {
  it('viewer도 발급받는다 — 설계서 「권한 모델」의 viewer 행', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const viewer = await signup(ctx)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: viewer.cookie,
        payload: { name: 'viewer의 토큰' },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().value).toEqual(expect.any(String))
    })
  })

  it('비멤버는 404다 — 프로젝트 존재를 숨긴다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const outsider = await signup(ctx)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: outsider.cookie,
        payload: { name: '남의 토큰' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  it('원문을 저장하지 않는다 — 표에는 sha256만 있다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      const rows = await ctx.db.selectFrom('api_tokens').selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.token_hash).toBe(hashTokenValue(token.value))
      // 행 어디에도 원문이 없다. 컬럼을 하나씩 세지 않고 통째로 훑는다 — 컬럼이 늘어도
      // 이 검사가 그대로 그것을 덮는다.
      expect(JSON.stringify(rows)).not.toContain(token.value)
    })
  })

  it('목록 응답에 원문이 없다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id, '이름 있는 토큰')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tokens`,
        cookies: owner.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([
        { id: token.id, name: '이름 있는 토큰', createdAt: expect.any(String), lastUsedAt: null },
      ])
      expect(res.body).not.toContain(token.value)
    })
  })

  /**
   * **`last_used_at`을 채우는 UPDATE를 잠그는 자리** — 이 케이스가 없으면 그 UPDATE를 통째로
   * 빼도 api 전량에서 아무것도 안 죽는다.
   * **목록 응답이 내는 필드라 사용자에게 보이는 값이다** — *"한 번도 안 쓴 토큰"*과
   * *"쓴 지 오래된 토큰"*을 가르는 것이 그 열의 쓸모다(0011의 머리말).
   *
   * 바로 위 *"목록 응답에 원문이 없다"*가 `lastUsedAt: null`을 단언하므로 그 짝이다 —
   * 앞엣것이 **안 쓴 토큰**을, 이것이 **쓴 토큰**을 든다.
   */
  it('쓰고 나면 lastUsedAt이 채워진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      const used = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tree`,
        headers: token.header,
      })
      expect(used.statusCode).toBe(200)

      const list = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tokens`,
        cookies: owner.cookie,
      })
      expect(list.json()[0].lastUsedAt).toEqual(expect.any(String))
    })
  })

  it('이름이 1~60자 밖이면 400이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      for (const name of ['', 'ㄱ'.repeat(61)]) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${project.id}/tokens`,
          cookies: owner.cookie,
          payload: { name },
        })
        expect(res.statusCode, name.length.toString()).toBe(400)
      }
    })
  })

  it('이름에 NUL이 있으면 400이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: owner.cookie,
        // 소스에 날 제어 바이트를 적지 않는다(`db/nul-guard.ts`와 같은 이유).
        payload: { name: `앞${String.fromCharCode(0)}뒤` },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})

describe('토큰 관리는 세션으로만 — 폐기가 자격을 실제로 거둔다', () => {
  it('토큰으로 토큰을 발급할 수 없다 (403)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        headers: token.header,
        payload: { name: '토큰이 만든 토큰' },
      })

      expect(res.statusCode).toBe(403)
      // **그 토큰이 통째로 안 먹는 상태와 구분한다** — 같은 토큰으로 조회는 된다.
      const readable = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: token.header,
      })
      expect(readable.statusCode).toBe(200)
    })
  })

  it('토큰으로 목록·폐기도 할 수 없다 (403)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      const list = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tokens`,
        headers: token.header,
      })
      expect(list.statusCode).toBe(403)

      const revoke = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/tokens/${token.id}`,
        headers: token.header,
      })
      expect(revoke.statusCode).toBe(403)
    })
  })

  it('폐기하면 그 토큰이 더 이상 인증되지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      const before = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: token.header,
      })
      expect(before.statusCode).toBe(200)

      const revoked = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/tokens/${token.id}`,
        cookies: owner.cookie,
      })
      expect(revoked.statusCode).toBe(204)

      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: token.header,
      })
      // 자격이 없으므로 `requireAuth`가 아니라 `projectGuard`가 401을 낸다.
      expect(after.statusCode).toBe(401)
    })
  })

  it('남의 토큰은 지울 수 없다 — 404(존재를 숨긴다)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const viewer = await signup(ctx)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const ownerToken = await issueToken(ctx, owner.cookie, project.id, 'owner의 것')

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/tokens/${ownerToken.id}`,
        cookies: viewer.cookie,
      })
      expect(res.statusCode).toBe(404)

      // **그 404가 "권한이 없다"가 아니라 "안 보인다"임을 목록이 확인한다.**
      const list = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tokens`,
        cookies: viewer.cookie,
      })
      expect(list.json()).toEqual([])

      // owner에게는 여전히 살아 있다.
      const alive = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: ownerToken.header,
      })
      expect(alive.statusCode).toBe(200)
    })
  })
})

describe('토큰은 발급자의 권한을 상속한다 — 둘이 짝이다', () => {
  it('editor의 토큰은 복원(owner)에 403, 스냅샷 생성(editor)에는 성공한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const editor = await signup(ctx)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })

      const token = await issueToken(ctx, editor.cookie, project.id, 'editor의 토큰')

      // ① editor가 할 수 있는 일 — 성공해야 한다. 이것이 없으면 아래 403이
      //    *"토큰이 통째로 안 먹는다"*와 구분되지 않는다.
      const created = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots`,
        headers: token.header,
        payload: { tag: '토큰이 만든 태그' },
      })
      expect(created.statusCode, created.body).toBe(201)
      const snapshotId = created.json().id

      // ② owner 전용 — 403이어야 한다.
      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots/${snapshotId}/restore`,
        headers: token.header,
      })
      expect(restored.statusCode).toBe(403)
    })
  })

  it('viewer의 토큰은 조회만 된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const viewer = await signup(ctx)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const token = await issueToken(ctx, viewer.cookie, project.id)

      const read = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tree`,
        headers: token.header,
      })
      expect(read.statusCode).toBe(200)

      const write = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/menu`,
        headers: token.header,
        payload: { parentId: null, title: '쓰기 시도' },
      })
      expect(write.statusCode).toBe(403)
    })
  })
})

describe('토큰은 역할을 얼리지 않는다', () => {
  it('발급 뒤 owner→editor로 강등하면 그 토큰의 복원이 403이 된다', async () => {
    await withApi(async (ctx) => {
      const first = await signup(ctx)
      const project = await createProject(ctx, first.cookie)
      // 마지막 owner는 강등할 수 없으므로 owner를 하나 더 둔다.
      const second = await signup(ctx)
      await addMember(ctx, project.id, second.user.id, 'owner')

      const menu = await createMenuNode(ctx, first.cookie, project.id, { title: '메뉴' })
      await createPage(ctx, first.cookie, project.id, menu.id, { title: '페이지' })
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots`,
        cookies: first.cookie,
        payload: { tag: '기준' },
      })
      const snapshotId = snapshot.json().id

      const token = await issueToken(ctx, second.cookie, project.id, '강등될 사람의 토큰')

      const before = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots/${snapshotId}/restore`,
        headers: token.header,
      })
      expect(before.statusCode, before.body).toBe(200)

      const demoted = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${second.user.id}`,
        cookies: first.cookie,
        payload: { role: 'editor' },
      })
      expect(demoted.statusCode, demoted.body).toBe(200)

      const after = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots/${snapshotId}/restore`,
        headers: token.header,
      })
      expect(after.statusCode).toBe(403)
    })
  })

  it('발급 뒤 멤버에서 제거하면 404가 된다 — 403이 아니다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const editor = await signup(ctx)
      await addMember(ctx, project.id, editor.user.id, 'editor')

      const token = await issueToken(ctx, editor.cookie, project.id)

      const before = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: token.header,
      })
      expect(before.statusCode).toBe(200)

      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${editor.user.id}`,
        cookies: owner.cookie,
      })
      expect(removed.statusCode).toBe(204)

      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: token.header,
      })
      // 설계서 「권한 모델」의 *"비멤버에게 프로젝트 존재를 숨긴다"*. 토큰 행은 아직 살아 있다.
      expect(after.statusCode).toBe(404)
    })
  })
})

describe('토큰의 범위는 프로젝트다', () => {
  it('다른 프로젝트에 쓰면 404다 — 403이 아니다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie, { slug: 'scope-a' })
      const projectB = await createProject(ctx, owner.cookie, { slug: 'scope-b' })

      // **같은 사람이 둘 다 owner다.** 그래야 404가 *"멤버가 아니다"*가 아니라
      // *"이 토큰의 프로젝트가 아니다"*임이 드러난다 — 스코프를 안 보면 200이 된다.
      const token = await issueToken(ctx, owner.cookie, projectA.id)

      const own = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${projectA.id}`,
        headers: token.header,
      })
      expect(own.statusCode).toBe(200)

      const other = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${projectB.id}`,
        headers: token.header,
      })
      expect(other.statusCode).toBe(404)
    })
  })

  it('WS는 쿠키만이다 — 토큰으로는 핸드셰이크가 안 된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      // 업그레이드가 아닌 평범한 GET에도 같은 가드가 먼저 돈다(README). 쿠키로는
      // 그 가드를 지나 400(업그레이드가 아니다)까지 가고, 토큰으로는 401에서 끝난다.
      const withCookie = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/ws`,
        cookies: owner.cookie,
      })
      const withToken = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/ws`,
        headers: token.header,
      })

      expect(withToken.statusCode).toBe(401)
      expect(withCookie.statusCode).not.toBe(401)
    })
  })

  it('망가진 Authorization 헤더는 조용히 무시된다 — 던지지 않는다', async () => {
    await withApi(async (ctx) => {
      for (const authorization of ['Bearer', 'Basic abc', 'Bearer 없는토큰', 'bearer']) {
        const res = await ctx.app.inject({
          method: 'GET',
          url: '/health',
          headers: { authorization },
        })
        expect(res.statusCode, authorization).toBe(200)
      }
    })
  })

  /**
   * **`bearerValue`의 정규식의 `i` 플래그를 잠그는 자리** — 이 케이스가 없으면 그 플래그를
   * 빼도 api 전량에서 아무것도 안 죽는다.
   *
   * RFC 7235가 인증 스킴을 **대소문자 무시**로 정하므로 `i`가 있는 지금이 옳다. 지우면
   * `authorization: bearer <값>`을 보내는 클라이언트가 **조용히 401을 받는다** — 자기
   * 자격은 멀쩡한데.
   *
   * **네 꼴을 다 먹인다** — 하나만 재면 그 하나만 지키게 된다.
   */
  it('Bearer 스킴은 대소문자를 가리지 않는다 (RFC 7235)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await issueToken(ctx, owner.cookie, project.id)

      for (const scheme of ['Bearer', 'bearer', 'BEARER', 'BeArEr']) {
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}`,
          headers: { authorization: `${scheme} ${token.value}` },
        })
        expect(res.statusCode, scheme).toBe(200)
      }
    })
  })
})

describe('쿠키와 토큰이 함께 실리면 쿠키가 이긴다', () => {
  it('토큰의 프로젝트 밖에서도 쿠키로 통과한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie, { slug: 'both-a' })
      const projectB = await createProject(ctx, owner.cookie, { slug: 'both-b' })
      const token = await issueToken(ctx, owner.cookie, projectA.id)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${projectB.id}`,
        cookies: owner.cookie,
        headers: token.header,
      })

      expect(res.statusCode).toBe(200)
    })
  })
})
