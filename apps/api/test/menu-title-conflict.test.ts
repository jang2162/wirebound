/**
 * **메뉴 제목의 충돌 모델** — `PATCH …/menu/:nodeId`가 «고치기 전 제목»(`base`)을 받아 지금
 * 제목과 견준다. 페이지 메타(`page-meta-conflict.test.ts`)와 같은 모델이고 계약표는 `routes/menu.ts`의 그 핸들러 머리말이
 * 소유한다.
 *
 * **케이스마다 혼자 죽는 변조가 주석에 있다** — 둘만 빼고(«같으면 쓴다» · «바탕 없음», 그 주석이 축의 주인을 가리킨다). 역할 축(viewer
 * 403)은 `permission-matrix.test.ts`의 «메뉴 수정» 행이 소유한다.
 *
 * 첫 절은 롤백 하네스(`withApi`), 둘째 절은 실커밋 하네스다 — 잠금을 두 트랜잭션이 다투는 판은 롤백 하네스에서 지을
 * 수 없다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { withTransaction } from '../src/db/tx'
import { lockMenuTitle } from '../src/repos/menu'
import { lockProjectTree } from '../src/repos/projects'
import {
  addMember,
  createMenuNode,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

type Body = { title?: string; parentId?: string | null; sortOrder?: number; base?: { title?: string } }

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '처음 제목' })
  return { owner, project, menu }
}

function patch(ctx: TestContext, projectId: string, nodeId: string, cookie: SignedUpUser['cookie'], payload: Body) {
  return ctx.app.inject({ method: 'PATCH', url: `/api/projects/${projectId}/menu/${nodeId}`, cookies: cookie, payload })
}

async function titleOf(ctx: TestContext, nodeId: string): Promise<string> {
  return (await ctx.db.selectFrom('menu_nodes').select('title').where('id', '=', nodeId).executeTakeFirstOrThrow()).title
}

const CHANGED = '다른 사람이 이 메뉴를 먼저 바꿨습니다'

describe('PATCH …/menu/:nodeId — 고치기 전 제목(base)', () => {
  /**
   * **혼자 죽는 변조가 없다 — 늘 남과 함께 죽는다.** `lockMenuTitle`이 `id`를 제목으로 읽으면(칸을 잘못 읽는다) 바탕이 늘
   * 어긋나 409 — 아래 «바탕이 다르면 409»(지금 값이 id 다)와 실커밋 절의 «같은 바탕으로 둘이 동시에»([409, 409])도 함께
   * 죽는다. «같으면 쓴다»의 주인은 이 케이스다 — 나머지 둘은 각자의 변조(이슈 코드 · 잠금)가 따로 있다.
   */
  it('바탕이 지금 제목과 같으면 쓴다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const res = await patch(ctx, project.id, menu.id, owner.cookie, { title: '새 제목', base: { title: '처음 제목' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().title).toBe('새 제목')
      expect(await titleOf(ctx, menu.id)).toBe('새 제목')
    })
  })

  /** 혼자 죽는 변조: 409 의 이슈에서 `code`를 뗀다(`current`를 떼면 아래 동시성 케이스도 함께 죽는다). */
  it('바탕이 다르면 409 · 이슈 코드 menu-title-changed · 지금 제목을 싣고, 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      // 밥이 먼저 바꿨다 — 앨리스는 `처음 제목`에서 고치기 시작했다.
      expect((await patch(ctx, project.id, menu.id, owner.cookie, { title: '밥의 제목' })).statusCode).toBe(200)

      const res = await patch(ctx, project.id, menu.id, owner.cookie, { title: '앨리스의 제목', base: { title: '처음 제목' } })
      expect(res.statusCode).toBe(409)
      expect(res.json()).toEqual({
        error: {
          code: 'conflict',
          message: CHANGED,
          issues: [{ path: 'title', code: 'menu-title-changed', message: CHANGED, current: '밥의 제목' }],
        },
      })
      expect(await titleOf(ctx, menu.id)).toBe('밥의 제목')
    })
  })

  /**
   * **호환 — 바탕 없는 요청(바탕을 안 싣는 클라이언트 · 순서 · 부모 이동)은 나중이 이긴다**(페이지와 같은 결정).
   *
   * **혼자 죽는 변조가 없다 — 늘 남과 함께 죽는다.** 바탕을 필수로 만들면 바탕 없이 PATCH 하는 케이스(`menu.test.ts`의
   * «PATCH» 절 · 트리 동시성 · 권한 매트릭스)가 함께 죽는다. **이 축의 주인은 `menu.test.ts`의 «PATCH» 절**이다 — 여기 남기는
   * 것은 표의 한 줄로 읽히게 하려고서다.
   */
  it('바탕을 안 보내면 나중이 이긴다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      expect((await patch(ctx, project.id, menu.id, owner.cookie, { title: '앞의 것' })).statusCode).toBe(200)
      expect((await patch(ctx, project.id, menu.id, owner.cookie, { title: '뒤의 것' })).statusCode).toBe(200)
      expect(await titleOf(ctx, menu.id)).toBe('뒤의 것')
    })
  })

  /** 혼자 죽는 변조: 본문 규칙의 둘째 `refine`(바탕 칸 ⊂ 바꾸는 칸)을 지운다 — 순서만 바꾸고 200 이다. */
  it('바꾸지 않는 칸의 바탕만 오면 400 이다 — 조건부 쓰기가 아니다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const moved = await patch(ctx, project.id, menu.id, owner.cookie, { sortOrder: 0, base: { title: '처음 제목' } })
      expect(moved.statusCode).toBe(400)
      expect(moved.json().error.issues).toEqual([{ path: 'base', message: '바탕(base)은 바꾸는 칸에만 줄 수 있습니다' }])
    })
  })

  /** 혼자 죽는 변조: 본문 규칙의 셋째 `refine`(바꾸는 제목에 바탕)을 지운다 — `base: {}`가 견주지 않고 200 으로 쓴다. */
  it('빈 바탕이면 400 이다 — 견주지 않고 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const res = await patch(ctx, project.id, menu.id, owner.cookie, { title: '견주지 않은 제목', base: {} })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.issues).toEqual([{ path: 'base', message: '바탕(base)을 주면 바꾸는 제목에 바탕이 있어야 합니다' }])
      expect(await titleOf(ctx, menu.id)).toBe('처음 제목')
    })
  })

  /**
   * **바탕과 순서 · 부모 이동은 한 본문에 못 싣는다** — 잠금 순서가 거꾸로 선다(`routes/menu.ts`의 `UpdateMenuBody`). 혼자
   * 죽는 변조: 본문 규칙의 넷째 `refine`을 지운다 — 둘 다 200 으로 쓴다.
   */
  it('바탕과 순서 · 부모 이동을 한 본문에 실으면 400 이다 — 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const other = await createMenuNode(ctx, owner.cookie, project.id, { title: '다른 메뉴' })
      const message = '순서 · 부모 이동은 바탕(base)과 함께 보낼 수 없습니다 — 따로 보내십시오'

      const reordered = await patch(ctx, project.id, menu.id, owner.cookie, { title: '새 제목', sortOrder: 1, base: { title: '처음 제목' } })
      expect(reordered.statusCode).toBe(400)
      expect(reordered.json().error.issues).toEqual([{ path: 'base', message }])
      const moved = await patch(ctx, project.id, menu.id, owner.cookie, { title: '새 제목', parentId: other.id, base: { title: '처음 제목' } })
      expect(moved.statusCode).toBe(400)
      expect(moved.json().error.issues).toEqual([{ path: 'base', message }])

      const row = await ctx.db.selectFrom('menu_nodes').select(['title', 'parent_id', 'sort_order']).where('id', '=', menu.id).executeTakeFirstOrThrow()
      expect(row).toEqual({ title: '처음 제목', parent_id: null, sort_order: 0 })
    })
  })
})

describe('PATCH …/menu/:nodeId — 견주기와 쓰기가 한 잠금 안이다 (실커밋)', () => {
  const db = getTestDb()
  beforeEach(resetRealData)
  afterEach(resetRealData)

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

  /** `grab`으로 잠금을 잡고 쥔다 — 돌려준 함수를 부르면 커밋한다. */
  async function hold(grab: (trx: Parameters<Parameters<typeof withTransaction>[1]>[0]) => Promise<void>): Promise<() => Promise<void>> {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      acquired = resolve
    })
    const holder = withTransaction(db, async (trx) => {
      await grab(trx)
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
   * 같은 바탕으로 둘이 동시에 — 하나는 200, 다른 하나는 이긴 쪽이 커밋한 제목을 싣고 409.
   *
   * 혼자 죽는 변조: `lockMenuTitle`의 `.forNoKeyUpdate()`를 뗀다 — 둘 다 옛 값을 읽고 통과해 **[200, 200]**(조용한 덮어쓰기).
   * 아래 «멤버에서 빠지면»도 함께 죽는다 — 잠금을 안 기다리면 그 판이 안 선다. 원자성의 **주인은 이 케이스다**.
   */
  it('같은 바탕으로 둘이 동시에 오면 하나만 쓰고 다른 하나는 이긴 쪽의 제목을 받는다', async () => {
    await withRealApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const release = await hold(async (trx) => {
        if ((await lockMenuTitle(trx, project.id, menu.id)) === null) throw new Error('잡을 메뉴가 없습니다')
      })
      let answers
      try {
        const alice = patch(ctx, project.id, menu.id, owner.cookie, { title: '앨리스', base: { title: '처음 제목' } })
        const bob = patch(ctx, project.id, menu.id, owner.cookie, { title: '밥', base: { title: '처음 제목' } })
        await waitForLockWaiter(2)
        await release()
        answers = await Promise.all([alice, bob])
      } finally {
        await release().catch(() => undefined)
      }

      expect(answers.map((res) => res.statusCode).sort()).toEqual([200, 409])
      const winner = answers.find((res) => res.statusCode === 200)!.json().title
      const loser = answers.find((res) => res.statusCode === 409)!.json()
      expect(loser.error.issues[0].current).toBe(winner)
      expect(await titleOf(ctx, menu.id)).toBe(winner)
    })
  })

  /**
   * 잠금을 기다리는 동안 멤버에서 빠지면 **404** — 409 로 지금 제목을 흘리지 않는다. 순서는 «행 잠금 → 재확인 → 견줌 →
   * 씀»이다.
   *
   * 혼자 죽는 변조: 핸들러에서 재확인(`recheckProjectRole`)을 비교 **뒤로** 옮긴다 — 밥이 409 와 지금 제목을 받는다.
   */
  it('잠금을 기다리는 동안 멤버에서 빠지면 404 다 — 409 로 지금 제목을 흘리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const bob = await signup(ctx)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      expect((await patch(ctx, project.id, menu.id, owner.cookie, { title: '앨리스가 쓴 비밀' })).statusCode).toBe(200)

      const release = await hold(async (trx) => {
        await lockMenuTitle(trx, project.id, menu.id)
      })
      let res
      try {
        // 밥의 바탕은 낡았다 — 견주면 409 다.
        const sent = patch(ctx, project.id, menu.id, bob.cookie, { title: '밥', base: { title: '처음 제목' } })
        await waitForLockWaiter(1)
        // 제외는 메뉴 행을 안 기다린다 — 요청보다 먼저 커밋한다.
        const removal = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/members/${bob.user.id}`,
          cookies: owner.cookie,
        })
        expect(removal.statusCode).toBe(204)
        await release()
        res = await sent
      } finally {
        await release().catch(() => undefined)
      }

      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('앨리스가 쓴 비밀')
      expect(await titleOf(ctx, menu.id)).toBe('앨리스가 쓴 비밀')
    })
  })

  /**
   * **바탕 없는 경로도 커밋 순간의 권한으로 판정한다** — 자리 옮기기가 트리 쓰기의 첫 잠금(프로젝트 행)을 기다리는 동안
   * viewer 로 강등되면 403 · 순서가 안 바뀐다. 재확인이 없으면 강등된 뒤에 커밋된다.
   *
   * 혼자 죽는 변조: 바탕 없는 경로의 `if (updated) await recheckProjectRole(…)`를 지운다 — 200 이고 순서가 바뀐다.
   */
  it('자리 옮기기가 잠금을 기다리는 동안 viewer 로 강등되면 403 이고 순서가 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const { owner, project, menu } = await fixture(ctx)
      const second = await createMenuNode(ctx, owner.cookie, project.id, { title: '둘째' })
      const bob = await signup(ctx)
      await addMember(ctx, project.id, bob.user.id, 'editor')

      const release = await hold(async (trx) => {
        await lockProjectTree(trx, project.id)
      })
      let res
      try {
        const sent = patch(ctx, project.id, second.id, bob.cookie, { sortOrder: 0 })
        await waitForLockWaiter(1)
        const demoted = await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${project.id}/members/${bob.user.id}`,
          cookies: owner.cookie,
          payload: { role: 'viewer' },
        })
        expect(demoted.statusCode).toBe(200)
        await release()
        res = await sent
      } finally {
        await release().catch(() => undefined)
      }

      expect(res.statusCode).toBe(403)
      const order = await ctx.db
        .selectFrom('menu_nodes')
        .select('id')
        .where('project_id', '=', project.id)
        .where('parent_id', 'is', null)
        .orderBy('sort_order')
        .execute()
      expect(order.map((row) => row.id)).toEqual([menu.id, second.id])
    })
  })
})
