/**
 * **복원의 «스냅샷 없음»(`snapshot-gone`)은 가드를 지난 멤버(owner)에게만 나간다**(`routes/snapshots.ts` 의 `restoreOutcomeToApiError` — L-312).
 *
 * 웹의 스냅샷 상자는 이 코드일 때만 «이미 지워졌다 · 목록을 다시 받는다» 를 한다. 같은 404 라도 프로젝트가 없거나 이 사람이 멤버가 아닌 판은 `not-found` 다 — 가드(`projectGuard`)가 둘을
 * 같은 응답으로 숨긴다. 비멤버가 «그 프로젝트에 그 스냅샷이 있는지» 를 이 코드로 알 수 있으면 안 된다: 비멤버에게는 어떤 스냅샷 id 든 · 어떤 프로젝트든 **상태 · 본문 · 헤더가 같은** 응답이다.
 */
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { addMember, createProject, signup, withApi, type TestContext } from './helpers'

/** 응답마다 달라지는 헤더 — 이것만 빼고 견준다(아래 카나리아가 «이것뿐» 임을 센다). */
const VOLATILE_HEADERS = new Set(['date'])

async function restoreAs(ctx: TestContext, cookie: { wb_session: string }, projectId: string, snapshotId: string) {
  const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/snapshots/${snapshotId}/restore`, cookies: cookie })
  const headers = Object.fromEntries(Object.entries(res.headers).filter(([name]) => !VOLATILE_HEADERS.has(name)))
  return {
    status: res.statusCode,
    body: res.body,
    headers,
    volatile: Object.keys(res.headers).filter((name) => VOLATILE_HEADERS.has(name)),
  }
}

async function saveSnapshot(ctx: TestContext, cookie: { wb_session: string }, projectId: string, tag: string): Promise<string> {
  const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/snapshots`, cookies: cookie, payload: { tag } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { id: string }).id
}

describe('복원 404 — snapshot-gone 은 멤버에게만', () => {
  it('owner 가 없는 스냅샷을 되돌리면 404 · code snapshot-gone', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const res = await restoreAs(ctx, owner.cookie, project.id, randomUUID())
      expect(res.status).toBe(404)
      expect(JSON.parse(res.body)).toEqual({ error: { code: 'snapshot-gone', message: '스냅샷을 찾을 수 없습니다' } })
    })
  })

  it('비멤버는 스냅샷이 있든 없든 · 프로젝트가 있든 없든 같은 응답이다 — 상태 · 본문 · 헤더까지', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const stranger = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const snapshotId = await saveSnapshot(ctx, owner.cookie, project.id, 'v1')

      const existingSnapshot = await restoreAs(ctx, stranger.cookie, project.id, snapshotId)
      const missingSnapshot = await restoreAs(ctx, stranger.cookie, project.id, randomUUID())
      const missingProject = await restoreAs(ctx, stranger.cookie, randomUUID(), randomUUID())

      // 카나리아 — 견주는 것이 «본문이 비었다» 가 아니다: 404 · `not-found` 본문이 실제로 있고, 빼고 견준 헤더는 `date` 뿐이다.
      expect(existingSnapshot.status).toBe(404)
      expect(JSON.parse(existingSnapshot.body).error.code).toBe('not-found')
      expect(existingSnapshot.volatile).toEqual(['date'])

      expect(missingSnapshot).toEqual(existingSnapshot)
      expect(missingProject).toEqual(existingSnapshot)
      // 그 스냅샷이 실제로 있었다 — 비멤버의 404 는 «없음» 이 아니라 «가드가 숨김» 이다(owner 에게는 같은 id 가 복원된다).
      const restored = await restoreAs(ctx, owner.cookie, project.id, snapshotId)
      expect(restored.status).toBe(200)
    })
  })

  it('멤버에서 빠진 사람도 비멤버와 같다 — snapshot-gone 이 아니다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const former = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, former.user.id, 'owner')
      const missing = randomUUID()

      // 멤버일 때는 «스냅샷 없음» 이다.
      const asMember = await restoreAs(ctx, former.cookie, project.id, missing)
      expect(JSON.parse(asMember.body).error.code).toBe('snapshot-gone')

      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/members/${former.user.id}`,
        cookies: owner.cookie,
      })
      expect(removed.statusCode, removed.body).toBe(204)

      const stranger = await signup(ctx)
      const asFormer = await restoreAs(ctx, former.cookie, project.id, missing)
      const asStranger = await restoreAs(ctx, stranger.cookie, project.id, missing)
      expect(JSON.parse(asFormer.body).error.code).toBe('not-found')
      expect(asFormer).toEqual(asStranger)
    })
  })

  it('프로젝트가 지워진 뒤에는 그 owner 였던 사람에게도 not-found 다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const snapshotId = await saveSnapshot(ctx, owner.cookie, project.id, 'v1')
      const deleted = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: owner.cookie })
      expect(deleted.statusCode, deleted.body).toBe(204)

      const res = await restoreAs(ctx, owner.cookie, project.id, snapshotId)
      expect(res.status).toBe(404)
      expect(JSON.parse(res.body)).toEqual({ error: { code: 'not-found', message: '프로젝트를 찾을 수 없습니다' } })
    })
  })
})
