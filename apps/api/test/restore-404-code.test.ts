/**
 * **복원의 «스냅샷 없음»(`snapshot-gone`)은 가드를 지난 멤버(owner)에게만 나간다**(`routes/snapshots.ts` 의 `restoreOutcomeToApiError` — L-312).
 *
 * 웹의 스냅샷 상자는 이 코드일 때만 «이미 지워졌다 · 목록을 다시 받는다» 를 한다. 같은 404 라도 프로젝트가 없거나 이 사람이 멤버가 아닌 판은 `not-found` 다 — 가드(`projectGuard`)가 둘을
 * 같은 응답으로 숨긴다. 비멤버가 «그 프로젝트에 그 스냅샷이 있는지» 를 이 코드로 알 수 있으면 안 된다: 비멤버에게는 어떤 스냅샷 id 든 · 어떤 프로젝트든 **상태 · 본문 · 헤더가 같은** 응답이다.
 */
import { randomUUID } from 'node:crypto'
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  type ProxiedRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

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

/**
 * **가드를 지난 뒤 멤버에서 빠진(또는 강등된) 사람은 실패 갈래에서도 가드와 같은 응답을 받는다**(`routes/snapshots.ts` 의 복원 — N39).
 *
 * 복원은 `restoreSnapshot` 이 돌아온 뒤 **갈래와 무관하게** 같은 트랜잭션에서 `recheckProjectRole` 을 부른다. 실패 갈래가 재확인 앞에서 나가면,
 * 잠금을 기다리는 사이 빠진 사람이 «그 id 의 스냅샷이 없다»(`snapshot-gone`) · «그 스냅샷의 형식이 몇이다»(400) 같은 프로젝트 안의 사실을 받는다.
 *
 * 판: 밥(owner)의 복원을 **가드 뒤 · 첫 잠금 앞**(프로젝트 행 `FOR UPDATE` — `lockProjectRow`)의 질의에서 붙잡고(`holdQuery`), 그 사이
 * 앨리스가 밥을 빼거나 내린 뒤 놓는다. 견주는 것은 처음부터 그 자리였던 사람(비멤버 · editor)의 가드 응답이다 — 상태 · 본문 · 헤더(`date` 만 뺌).
 * 카나리아: 같은 요청을 멤버일 때 보내면 그 갈래의 응답이 실제로 나온다(재확인이 없는 판이면 그것이 새는 값이다).
 */
describe('가드 뒤에 빠진 사람 — 실패 갈래도 재확인한다', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  /** 복원의 첫 잠금(`repos/projects.ts` 의 `lockProjectRow`). 가드는 잠그지 않는다 — 이 글자는 가드 뒤에만 온다. */
  const PROJECT_ROW_LOCK = 'from "projects" where "id" = $1 for update'
  /** 재확인의 멤버 행(`auth/roles.ts` 의 `findMembership` 의 `share` 판). */
  const MEMBER_SHARE = '"user_id" = $2 for share'

  interface Board {
    alice: SignedUpUser
    bob: SignedUpUser
    projectId: string
    /** 스냅샷 뒤에 제목을 바꿔 둔 진짜 스냅샷 — 복원이 실제로 쓰는 판. */
    snapshotId: string
    /** 이 서버가 못 읽는 형식(`payloadVersion` 99)의 스냅샷 — `payload-version` 갈래. */
    futureSnapshotId: string
  }

  async function board(ctx: ProxiedRealApi): Promise<Board> {
    const alice = await signup(ctx)
    const bob = await signup(ctx)
    const project = await createProject(ctx, alice.cookie)
    await addMember(ctx, project.id, bob.user.id, 'owner')
    // 페이지가 하나 있어야 «페이지 행을 쥐었나» 가 0 행을 재지 않는다(아래 «재확인 자리의 잠금»).
    const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '설정' })
    await createPage(ctx, alice.cookie, project.id, menu.id, { title: '사용자 목록' })
    const snapshotId = await saveSnapshot(ctx, alice.cookie, project.id, 'v1')
    const renamed = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      cookies: alice.cookie,
      payload: { name: '스냅샷 뒤에 바꾼 이름' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)
    const future = await getTestDb()
      .insertInto('snapshots')
      .values({
        project_id: project.id,
        tag: 'future',
        description: null,
        payload: JSON.stringify({
          payloadVersion: 99,
          capturedAt: new Date().toISOString(),
          menu: [],
          pages: [],
          layouts: [],
          comments: [],
        }),
        created_by: alice.user.id,
        kind: 'tag',
        created_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return { alice, bob, projectId: project.id, snapshotId, futureSnapshotId: future.id }
  }

  type Change = 'remove' | 'demote'

  async function change(ctx: ProxiedRealApi, b: Board, kind: Change): Promise<void> {
    const url = `/api/projects/${b.projectId}/members/${b.bob.user.id}`
    const res =
      kind === 'remove'
        ? await ctx.app.inject({ method: 'DELETE', url, cookies: b.alice.cookie })
        : await ctx.app.inject({ method: 'PATCH', url, cookies: b.alice.cookie, payload: { role: 'editor' } })
    expect(res.statusCode, res.body).toBe(kind === 'remove' ? 204 : 200)
  }

  /** 처음부터 그 자리였던 사람 — 빠진 판은 비멤버, 내린 판은 editor. */
  async function bystander(ctx: ProxiedRealApi, b: Board, kind: Change): Promise<SignedUpUser> {
    const user = await signup(ctx)
    if (kind === 'demote') await addMember(ctx, b.projectId, user.user.id, 'editor')
    return user
  }

  const CASES: { name: string; target: (b: Board) => string; change: Change; asMember: { status: number; code: string } }[] = [
    { name: 'not-found · 뺌', target: () => randomUUID(), change: 'remove', asMember: { status: 404, code: 'snapshot-gone' } },
    { name: 'payload-version · 뺌', target: (b) => b.futureSnapshotId, change: 'remove', asMember: { status: 400, code: 'bad-request' } },
    { name: 'not-found · 내림', target: () => randomUUID(), change: 'demote', asMember: { status: 404, code: 'snapshot-gone' } },
    { name: 'restored · 뺌(성공 갈래 대조)', target: (b) => b.snapshotId, change: 'remove', asMember: { status: 200, code: '' } },
  ]

  it.each(CASES)(
    '$name — 가드와 같은 응답',
    async ({ target, change: kind, asMember }) => {
      await withProxiedRealApi(async (ctx) => {
        const b = await board(ctx)
        const snapshotId = target(b)

        // 카나리아 — 멤버일 때 이 요청은 그 갈래에 닿는다(성공 갈래는 상태를 바꾸므로 대조 판에서는 안 보낸다).
        if (asMember.status !== 200) {
          const before = await restoreAs(ctx, b.bob.cookie, b.projectId, snapshotId)
          expect(before.status, before.body).toBe(asMember.status)
          expect(JSON.parse(before.body).error.code).toBe(asMember.code)
        }

        const hold = ctx.proxy.holdQuery(PROJECT_ROW_LOCK)
        const pending = restoreAs(ctx, b.bob.cookie, b.projectId, snapshotId)
        await hold.held
        await change(ctx, b, kind)
        hold.release()
        const held = await pending

        const other = await bystander(ctx, b, kind)
        const guard = await restoreAs(ctx, other.cookie, b.projectId, snapshotId)
        expect(guard.status).toBe(kind === 'remove' ? 404 : 403)
        expect(guard.volatile).toEqual(['date'])
        expect(held).toEqual(guard)
      })
    },
    30_000,
  )

  /**
   * **실패 갈래의 재확인은 복원의 잠금을 쥐지 않은 채 돈다** — `restoreSnapshot` 은 바깥 트랜잭션 안의 세이브포인트라(`db/tx.ts` 의
   * `withTransaction`) 실패하면 `ROLLBACK TO SAVEPOINT` 가 그 안에서 잡은 행 잠금(프로젝트 · 메뉴 · 페이지 · 레이아웃 · 코멘트)을 함께
   * 놓는다. 그래서 실패 갈래가 새로 잡는 것은 재확인의 «자격 행 → 멤버 행» 뿐이고, 이것은 성공 갈래(복원 잠금 → 자격 행 → 멤버 행)의
   * 뒤쪽과 같은 차례다 — 새 고리가 없다. 대조: 성공 갈래는 같은 자리에서 프로젝트 행 · 페이지 행을 쥐고 있다.
   */
  it.each([
    { name: '실패 갈래(not-found)', success: false },
    { name: '성공 갈래(대조)', success: true },
  ])(
    '재확인 자리의 잠금 — $name',
    async ({ success }) => {
      await withProxiedRealApi(async (ctx) => {
        const b = await board(ctx)
        const hold = ctx.proxy.holdQuery(MEMBER_SHARE)
        const pending = restoreAs(ctx, b.bob.cookie, b.projectId, success ? b.snapshotId : randomUUID())
        await hold.held
        const projectRowFree = await lockableNow(sql`select id from projects where id = ${b.projectId} for update nowait`)
        const pageRowsFree = await lockableNow(sql`select id from pages where project_id = ${b.projectId} for update nowait`)
        hold.release()
        const res = await pending
        expect({ projectRowFree, pageRowsFree }).toEqual({ projectRowFree: !success, pageRowsFree: !success })
        expect(res.status, res.body).toBe(success ? 200 : 404)
      })
    },
    30_000,
  )

  /**
   * **자격(세션 · 토큰)이 기다리는 사이 죽은 복원은 가드의 401 과 같은 응답을 받는다**(N39-N2). 재확인의 앞 절(`recheckAtCommit` — 자격 행
   * `FOR KEY SHARE` 가 멤버 행보다 먼저)이 실패 갈래에서도 돈다. 문으로 쓰는 것은 세션 · 토큰 행이 아니라 복원의 첫 잠금 앞의 질의다 —
   * 그 행을 쥐면 요청이 인증에서 서서 재려던 자리까지 안 간다. 견주는 것은 **죽은 자격으로 처음부터 보낸** 같은 요청의 가드 응답이다.
   */
  type Dying = 'session' | 'token'

  async function restoreWith(
    ctx: ProxiedRealApi,
    auth: { cookie: { wb_session: string } } | { bearer: string },
    projectId: string,
    snapshotId: string,
  ) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/snapshots/${snapshotId}/restore`,
      ...('cookie' in auth ? { cookies: auth.cookie } : { headers: { authorization: auth.bearer } }),
    })
    const headers = Object.fromEntries(Object.entries(res.headers).filter(([name]) => !VOLATILE_HEADERS.has(name)))
    return {
      status: res.statusCode,
      body: res.body,
      headers,
      volatile: Object.keys(res.headers).filter((name) => VOLATILE_HEADERS.has(name)),
    }
  }

  it.each([
    { dying: 'session' as Dying, name: '실패 갈래(not-found)', success: false },
    { dying: 'session' as Dying, name: '성공 갈래', success: true },
    { dying: 'token' as Dying, name: '실패 갈래(not-found)', success: false },
    { dying: 'token' as Dying, name: '성공 갈래', success: true },
  ])(
    '$dying 이 죽음 · $name — 가드의 401 과 같은 응답',
    async ({ dying, success }) => {
      await withProxiedRealApi(async (ctx) => {
        const b = await board(ctx)
        const snapshotId = success ? b.snapshotId : randomUUID()
        let auth: { cookie: { wb_session: string } } | { bearer: string } = { cookie: b.bob.cookie }
        let tokenId = ''
        if (dying === 'token') {
          const issued = await ctx.app.inject({
            method: 'POST',
            url: `/api/projects/${b.projectId}/tokens`,
            cookies: b.bob.cookie,
            payload: { name: '밥의 토큰' },
          })
          expect(issued.statusCode, issued.body).toBe(201)
          tokenId = (issued.json() as { id: string }).id
          auth = { bearer: `Bearer ${(issued.json() as { value: string }).value}` }
        }

        // 카나리아 — 자격이 살아 있을 때 이 요청은 그 갈래에 닿는다(성공 갈래는 상태를 바꾸므로 보내지 않는다).
        if (!success) {
          const alive = await restoreWith(ctx, auth, b.projectId, snapshotId)
          expect(alive.status, alive.body).toBe(404)
          expect(JSON.parse(alive.body).error.code).toBe('snapshot-gone')
        }

        const hold = ctx.proxy.holdQuery(PROJECT_ROW_LOCK)
        const pending = restoreWith(ctx, auth, b.projectId, snapshotId)
        await hold.held
        const killed =
          dying === 'session'
            ? await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: b.bob.cookie })
            : await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${b.projectId}/tokens/${tokenId}`, cookies: b.bob.cookie })
        expect(killed.statusCode, killed.body).toBe(204)
        hold.release()
        const held = await pending

        // 죽은 자격으로 처음부터 보낸 같은 요청 — 가드의 401.
        const guard = await restoreWith(ctx, auth, b.projectId, snapshotId)
        expect(guard.status, guard.body).toBe(401)
        expect(guard.volatile).toEqual(['date'])
        expect(held).toEqual(guard)
      })
    },
    30_000,
  )
})

/** 다른 연결에서 그 행을 지금 잡을 수 있는가(`NOWAIT` — 쥔 사람이 있으면 `55P03`). 문장 하나라 끝나면 놓는다. */
async function lockableNow(query: ReturnType<typeof sql>): Promise<boolean> {
  try {
    await query.execute(getTestDb())
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03') return false
    throw error
  }
}
