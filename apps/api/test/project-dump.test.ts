/**
 * **읽기 전용 프로젝트 덤프**(`GET .../snapshot` 단수).
 *
 * 이 라우트가 존재하는 이유는 *"부를 것이 없었다"*이므로, 케이스가 먼저 드는 것은
 * **복수(태그)와 갈리는 성질**이다: 행을 쓰지 않고, viewer가 부를 수 있고, payload가
 * 복수 쪽과 **같은 함수**에서 나온다.
 */
import { describe, expect, it } from 'vitest'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { SNAPSHOT_PAYLOAD_VERSION } from '@wirebound/themes'
import { insertApiToken } from '../src/repos/api-tokens'
import { addMember, createMenuNode, createPage, createProject, signup, withApi } from './helpers'

describe('GET /api/projects/:projectId/snapshot — 행을 쓰지 않는다', () => {
  it('부르기 전후로 snapshots 행 수가 그대로다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '관리자' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })

      const countRows = async (): Promise<number> =>
        (await ctx.db.selectFrom('snapshots').select('id').execute()).length

      const before = await countRows()
      // **한 번으로 재지 않는다** — 한 번이면 *"부르면 하나 는다"*와 구분되지 않는 판이
      // 우연히 통과할 수 있다. 세 번 부르고도 그대로여야 한다.
      for (let i = 0; i < 3; i += 1) {
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/snapshot`,
          cookies: owner.cookie,
        })
        expect(res.statusCode, res.body).toBe(200)
      }
      expect(await countRows()).toBe(before)

      // 대조: 복수(태그)는 실제로 는다. 이것이 없으면 위 0이 *"세는 자가 고장났다"*와
      // 구분되지 않는다.
      const tagged = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots`,
        cookies: owner.cookie,
        payload: { tag: '대조군' },
      })
      expect(tagged.statusCode, tagged.body).toBe(201)
      expect(await countRows()).toBe(before + 1)
    })
  })

  it('viewer가 부를 수 있다 — 복수의 생성은 editor다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const viewer = await signup(ctx)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const dump = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/snapshot`,
        cookies: viewer.cookie,
      })
      expect(dump.statusCode).toBe(200)

      const tagged = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots`,
        cookies: viewer.cookie,
        payload: { tag: 'viewer가 얼리려 한다' },
      })
      expect(tagged.statusCode).toBe(403)
    })
  })

  it('응답이 payload 그 자체다 — 감싸지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '관리자' })
      const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/snapshot`,
        cookies: owner.cookie,
      })
      const body = res.json()

      expect(body.payloadVersion).toBe(SNAPSHOT_PAYLOAD_VERSION)
      expect(body.capturedAt).toEqual(expect.any(String))
      expect(body.menu.map((node: { title: string }) => node.title)).toEqual(['관리자'])
      expect(body.pages.map((entry: { id: string }) => entry.id)).toEqual([page.id])
      expect(body.layouts).toHaveLength(1)
      expect('themes' in body).toBe(false)
      expect(body.comments).toEqual([])
    })
  })

  /**
   * **새 수집 코드가 생기면 그것이 실패다.** 같은 함수를 부르는지를 결과의 모양으로
   * 잰다 — `captureSnapshot`을 직접 불러 만든 payload와 절 구성이 같아야 한다.
   * `capturedAt`은 두 호출의 순간이 달라 값이 다르므로 그 키만 뺀다.
   */
  it('복수(태그)의 payload와 같은 절을 낸다 — 수집 코드가 하나다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '관리자' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })

      const direct = await captureSnapshot(ctx.db, project.id)
      if (direct.kind !== 'captured') throw new Error('픽스처: 캡처가 실패했다')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/snapshot`,
        cookies: owner.cookie,
      })

      const strip = (value: Record<string, unknown>): Record<string, unknown> => {
        const { capturedAt: _ignored, ...rest } = value
        return rest
      }
      // 값까지 그대로여야 한다 — 절 이름만 비교하면 `pages`에 다른 것을 담아도 통과한다.
      expect(strip(res.json())).toEqual(strip(JSON.parse(JSON.stringify(direct.payload))))
    })
  })

  it('비멤버는 404, 미인증은 401이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const outsider = await signup(ctx)

      const anonymous = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/snapshot`,
      })
      expect(anonymous.statusCode).toBe(401)

      const stranger = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/snapshot`,
        cookies: outsider.cookie,
      })
      expect(stranger.statusCode).toBe(404)
    })
  })

  it('API 토큰으로 부를 수 있다 — `wireb pull`이 지날 길이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const issued = await insertApiToken(ctx.db, {
        projectId: project.id,
        userId: owner.user.id,
        name: 'pull',
      })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/snapshot`,
        headers: { authorization: `Bearer ${issued.value}` },
      })

      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().payloadVersion).toBe(SNAPSHOT_PAYLOAD_VERSION)
    })
  })
})
