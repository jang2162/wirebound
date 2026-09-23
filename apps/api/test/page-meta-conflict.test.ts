/**
 * **페이지 메타(제목 · 설명)의 충돌 모델**(이월 P = AB · 2026-09-23) — `PATCH …/pages/:pageId`가 «고치기 전 값»
 * (`base`)을 받아 지금 값과 견준다. 계약표는 `routes/pages.ts`의 그 핸들러 머리말이 소유한다.
 *
 * **케이스마다 그 케이스만 죽는 변조가 있다**(«바탕 없음» 하나만 빼고 — 그 케이스의 주석) — 무엇을 바꾸면 누가
 * 혼자 죽는지는 케이스의 주석에 적는다. 변조는 전부 api 전량(1562)으로 쟀다.
 * 역할 축(viewer 403)은 여기 없다 — `permission-matrix.test.ts`의 «페이지 수정» 행이 소유한다.
 *
 * 앞 넷은 롤백 하네스(`withApi`), 뒤 둘은 실커밋 하네스다 — 잠금을 두 트랜잭션이 다투는 판은 롤백 하네스에서
 * 지을 수 없다(요청이 한 트랜잭션을 나눠 쓴다).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { withTransaction } from '../src/db/tx'
import { lockPageMeta } from '../src/repos/pages'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

type Meta = { title?: string; description?: string | null }
type Body = Meta & { base?: Meta }

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '처음 제목' })
  return { owner, project, page }
}

function patch(ctx: TestContext, projectId: string, pageId: string, cookie: SignedUpUser['cookie'], payload: Body) {
  return ctx.app.inject({ method: 'PATCH', url: `/api/projects/${projectId}/pages/${pageId}`, cookies: cookie, payload })
}

async function metaOf(ctx: TestContext, pageId: string) {
  return ctx.db.selectFrom('pages').select(['title', 'description']).where('id', '=', pageId).executeTakeFirstOrThrow()
}

describe('PATCH …/pages/:pageId — 고치기 전 값(base)', () => {
  /**
   * 혼자 죽는 변조: `lockPageMeta`가 `title`에 설명을 싣는다(칸을 잘못 읽는다) — 제목 바탕이 늘 어긋나 409.
   * 아래 409 케이스는 설명만 쓰고, 동시성 케이스도 설명만 써서 안 죽는다.
   */
  it('바탕이 지금 값과 같으면 쓴다 — 제목도 설명도', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)

      const titled = await patch(ctx, project.id, page.id, owner.cookie, { title: '새 제목', base: { title: '처음 제목' } })
      expect(titled.statusCode).toBe(200)
      // 설명의 바탕은 `null`(아직 없음)이다 — `null`도 값으로 견준다.
      const described = await patch(ctx, project.id, page.id, owner.cookie, { description: '첫 설명', base: { description: null } })
      expect(described.statusCode).toBe(200)

      expect(await metaOf(ctx, page.id)).toEqual({ title: '새 제목', description: '첫 설명' })
    })
  })

  /**
   * 혼자 죽는 변조: 409 의 이슈에서 `code`를 뗀다. `current`를 떼면 이 케이스와 동시성 케이스가 함께 죽는다(그쪽도
   * 진 쪽이 받은 값을 본다).
   */
  it('바탕이 다르면 409 · 이슈 코드 page-meta-changed · 지금 값을 싣고, 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      // 밥이 먼저 저장했다 — 앨리스는 `null`에서 고치기 시작했다.
      expect((await patch(ctx, project.id, page.id, owner.cookie, { description: '밥의 설명' })).statusCode).toBe(200)

      const res = await patch(ctx, project.id, page.id, owner.cookie, { description: '앨리스의 설명', base: { description: null } })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toEqual({
        error: {
          code: 'conflict',
          message: '다른 사람이 이 페이지를 먼저 바꿨습니다',
          issues: [
            {
              path: 'description',
              code: 'page-meta-changed',
              message: '다른 사람이 이 페이지를 먼저 바꿨습니다',
              current: '밥의 설명',
            },
          ],
        },
      })
      expect(await metaOf(ctx, page.id)).toEqual({ title: '처음 제목', description: '밥의 설명' })
    })
  })

  /**
   * **호환 — CLI · MCP · 가져오기 · 트리의 순서 · 메뉴 이동은 바탕을 안 보낸다**(`routes/pages.ts` 머리말).
   *
   * **혼자 죽는 변조가 없다 — 늘 남과 함께 죽는다.** 바탕을 필수로 만들면(`base: MetaBase`) 바탕 없이 PATCH 하는 케이스
   * 쉰둘이 함께 죽는다. **이 축의 주인은 `pages.test.ts`의 «PATCH …/pages/:pageId» 절**(«제목을 바꾼다» 등)이다 — 여기
   * 남기는 것은 «바탕 없이 둘이 차례로 오면 뒤가 이긴다»를 이 모델의 표 한 줄로 읽히게 하려고서다.
   */
  it('바탕을 안 보내면 오늘처럼 나중이 이긴다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      expect((await patch(ctx, project.id, page.id, owner.cookie, { description: '앞의 것' })).statusCode).toBe(200)
      expect((await patch(ctx, project.id, page.id, owner.cookie, { description: '뒤의 것', title: '뒤 제목' })).statusCode).toBe(200)
      expect(await metaOf(ctx, page.id)).toEqual({ title: '뒤 제목', description: '뒤의 것' })
    })
  })

  /** 혼자 죽는 변조: 본문 규칙의 둘째 `refine`(바탕 칸 ⊂ 바꾸는 칸)을 지운다. */
  it('바꾸지 않는 칸의 바탕만 오면 400 이다 — 조건부 쓰기가 아니다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      const res = await patch(ctx, project.id, page.id, owner.cookie, { description: '설명', base: { title: '처음 제목' } })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.issues).toEqual([{ path: 'base', message: '바탕(base)은 바꾸는 칸에만 줄 수 있습니다' }])
      expect(await metaOf(ctx, page.id)).toEqual({ title: '처음 제목', description: null })
    })
  })
})

describe('PATCH …/pages/:pageId — 견주기와 쓰기가 한 잠금 안이다 (실커밋)', () => {
  const db = getTestDb()
  beforeEach(resetRealData)
  afterEach(resetRealData)

  /** 잠금을 기다리는 트랜잭션이 `atLeast`개 설 때까지 — 질의의 까닭은 `revisions-concurrency.test.ts`의 머리말. */
  async function waitForLockWaiter(atLeast: number): Promise<void> {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const result = await sql<{ n: number }>`
        select count(*)::int as n
          from pg_locks l
          join pg_stat_activity a on a.pid = l.pid
         where not l.granted
           and a.datname = current_database()
      `.execute(db)
      if ((result.rows[0]?.n ?? 0) >= atLeast) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('잠금을 기다리는 트랜잭션이 나타나지 않았습니다 — 시나리오가 성립하지 않았습니다')
  }

  /** 페이지 행을 **진짜 잠금 함수로** 잡고 쥔다 — 돌려준 함수를 부르면 커밋한다. */
  async function holdPageRow(projectId: string, pageId: string): Promise<() => Promise<void>> {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      acquired = resolve
    })
    const holder = withTransaction(db, async (trx) => {
      if (!(await lockPageMeta(trx, projectId, pageId))) throw new Error('잡을 페이지가 없습니다')
      acquired()
      await held
    })
    await Promise.race([ready, holder])
    return async () => {
      release()
      await holder
    }
  }

  /**
   * 혼자 죽는 변조: `lockPageMeta`의 `.forUpdate()`를 뗀다 — 둘 다 옛 값을 읽고 통과해 **[200, 200]**, DB 는 나중
   * 것(고치려던 바로 그것 — 조용한 덮어쓰기). 아래 «멤버에서 빠지면» 케이스도 함께 죽는다 — 잠금을 안 기다리면 그
   * 판이 안 선다. 원자성의 **주인은 이 케이스다**(그쪽의 혼자 죽는 변조는 재확인의 순서다).
   */
  it('둘이 같은 바탕으로 동시에 오면 하나만 200 이고, 다른 하나는 앞의 것이 커밋한 값을 보고 409 다', async () => {
    await withRealApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      const release = await holdPageRow(project.id, page.id)
      let answers
      try {
        const alice = patch(ctx, project.id, page.id, owner.cookie, { description: '앨리스', base: { description: null } })
        const bob = patch(ctx, project.id, page.id, owner.cookie, { description: '밥', base: { description: null } })
        await waitForLockWaiter(2)
        await release()
        answers = await Promise.all([alice, bob])
      } finally {
        await release().catch(() => undefined)
      }

      const statuses = answers.map((res) => res.statusCode).sort()
      expect(statuses).toEqual([200, 409])
      const winner = answers.find((res) => res.statusCode === 200)!.json().description
      const loser = answers.find((res) => res.statusCode === 409)!.json()
      // 진 쪽이 받은 «지금 값»은 이긴 쪽이 커밋한 값이다 — 잠금 뒤에 읽었다.
      expect(loser.error.issues[0].current).toBe(winner)
      expect((await metaOf(ctx, page.id)).description).toBe(winner)
    })
  })

  /**
   * 혼자 죽는 변조: 핸들러에서 재확인(`recheckProjectRole`)을 비교 **뒤로** 옮긴다 — 잠금을 기다리는 동안 멤버에서
   * 빠진 밥이 409 와 함께 **지금 값**을 받는다. 순서는 «행 잠금 → 재확인 → 견줌 → 씀»이다(`routes/pages.ts` 머리말).
   */
  it('잠금을 기다리는 동안 멤버에서 빠지면 404 다 — 409 로 지금 값을 흘리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      const bob = await signup(ctx)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      expect((await patch(ctx, project.id, page.id, owner.cookie, { description: '앨리스가 쓴 비밀' })).statusCode).toBe(200)

      const release = await holdPageRow(project.id, page.id)
      let res
      try {
        // 밥의 바탕은 낡았다(`null`) — 견주면 409 다.
        const sent = patch(ctx, project.id, page.id, bob.cookie, { description: '밥', base: { description: null } })
        await waitForLockWaiter(1)
        const removed = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/members/${bob.user.id}`,
          cookies: owner.cookie,
        })
        expect(removed.statusCode).toBe(204)
        await release()
        res = await sent
      } finally {
        await release().catch(() => undefined)
      }

      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('앨리스가 쓴 비밀')
      expect((await metaOf(ctx, page.id)).description).toBe('앨리스가 쓴 비밀')
    })
  })
})
