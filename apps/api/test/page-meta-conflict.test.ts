/**
 * **페이지 메타(제목 · 설명)의 충돌 모델** — `PATCH …/pages/:pageId`가 «고치기 전 값»
 * (`base`)을 받아 지금 값과 견준다. 계약표는 `routes/pages.ts`의 그 핸들러 머리말이 소유한다.
 *
 * **케이스마다 그 케이스만 죽는 변조가 있다**(둘만 빼고 — «바탕 없음»과 «교착의 판», 각 케이스의 주석이 축의 주인을
 * 이름으로 가리킨다) — 무엇을 바꾸면 누가 혼자 죽는지는 케이스의 주석에 적는다. 변조는 api 전량으로 잰다.
 * 역할 축(viewer 403)은 여기 없다 — `permission-matrix.test.ts`의 «페이지 수정» 행이 소유한다.
 *
 * 첫 절은 롤백 하네스(`withApi`), 둘째 절은 실커밋 하네스다 — 잠금을 두 트랜잭션이 다투는 판은 롤백 하네스에서
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
type Body = Meta & { base?: Meta; sortOrder?: number; menuNodeId?: string }

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
   * 여럿이 함께 죽는다. **이 축의 주인은 `pages.test.ts`의 «PATCH …/pages/:pageId» 절**(«제목을 바꾼다» 등)이다 — 여기
   * 남기는 것은 «바탕 없이 둘이 차례로 오면 뒤가 이긴다»를 이 모델의 표 한 줄로 읽히게 하려고서다.
   */
  it('바탕을 안 보내면 나중이 이긴다', async () => {
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

  /**
   * **바꾸는 제목 · 설명마다 바탕이 있어야 한다.** `base: {}`가 «바탕 있음»의 길을 타면 아무것도 견주지 않고
   * 쓴다(`every`가 빈 집합에 참). 혼자 죽는 변조: 본문 규칙의 셋째 `refine`(바꾸는 메타 칸 ⊆ 바탕 칸)을
   * 지운다 — 둘 다 200 으로 쓴다.
   */
  it('바탕이 바꾸는 제목 · 설명을 다 담지 않으면 400 이다 — 빈 바탕도', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      const message = '바탕(base)을 주면 바꾸는 제목 · 설명마다 바탕이 있어야 합니다'

      const empty = await patch(ctx, project.id, page.id, owner.cookie, { description: '견주지 않은 글', base: {} })
      expect(empty.statusCode).toBe(400)
      expect(empty.json().error.issues).toEqual([{ path: 'base', message }])

      const half = await patch(ctx, project.id, page.id, owner.cookie, {
        title: '새 제목',
        description: '견주지 않은 글',
        base: { title: '처음 제목' },
      })
      expect(half.statusCode).toBe(400)
      expect(half.json().error.issues).toEqual([{ path: 'base', message }])

      expect(await metaOf(ctx, page.id)).toEqual({ title: '처음 제목', description: null })
    })
  })

  /**
   * **바탕과 순서 · 메뉴 이동은 한 본문에 못 싣는다**(잠금 순서가 거꾸로 선다. 동시성 판은 아래 실커밋 절의
   * «바탕과 순서 이동을 한 본문에 …»). 혼자 죽는 변조: 본문 규칙의 넷째 `refine`을 지운다 — 둘 다 200 으로 쓴다.
   */
  it('바탕과 순서 · 메뉴 이동을 한 본문에 실으면 400 이다 — 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      const other = await createMenuNode(ctx, owner.cookie, project.id, { title: '다른 메뉴' })
      const message = '순서 · 메뉴 이동은 바탕(base)과 함께 보낼 수 없습니다 — 따로 보내십시오'

      const reordered = await patch(ctx, project.id, page.id, owner.cookie, { title: '새 제목', sortOrder: 0, base: { title: '처음 제목' } })
      expect(reordered.statusCode).toBe(400)
      expect(reordered.json().error.issues).toEqual([{ path: 'base', message }])

      const moved = await patch(ctx, project.id, page.id, owner.cookie, {
        description: '설명',
        menuNodeId: other.id,
        base: { description: null },
      })
      expect(moved.statusCode).toBe(400)
      expect(moved.json().error.issues).toEqual([{ path: 'base', message }])

      const row = await ctx.db
        .selectFrom('pages')
        .select(['title', 'description', 'menu_node_id'])
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()
      expect(row).toEqual({ title: '처음 제목', description: null, menu_node_id: page.menuNodeId })
    })
  })

  /**
   * **빈 설명은 `''`든 `null`이든 같은 바탕이다**(`@wirebound/schema`의 `samePageMeta`). 저장은 둘을 가른다
   * (`pages.test.ts`의 «빈 문자열은 …»). 혼자 죽는 변조: `staleMetaFields`가 `samePageMeta` 대신 `!==`로 견준다 — 둘 다
   * 409 다.
   */
  it('빈 설명은 null 이든 빈 문자열이든 같은 바탕이다 — 충돌이 아니다', async () => {
    await withApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)

      // 저장된 것은 `null`, 바탕은 `''`.
      const fromEmpty = await patch(ctx, project.id, page.id, owner.cookie, { description: '첫 글', base: { description: '' } })
      expect(fromEmpty.statusCode).toBe(200)

      // 남이 바탕 없이 `''`를 저장했다(웹은 안 보내지만 API 는 받는다) — 저장된 것은 `''`, 바탕은 `null`.
      expect((await patch(ctx, project.id, page.id, owner.cookie, { description: '' })).statusCode).toBe(200)
      expect((await metaOf(ctx, page.id)).description).toBe('')
      const fromNull = await patch(ctx, project.id, page.id, owner.cookie, { description: '둘째 글', base: { description: null } })
      expect(fromNull.statusCode).toBe(200)

      expect((await metaOf(ctx, page.id)).description).toBe('둘째 글')
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

  /**
   * `pending`이 끝나거나 잠금을 기다리는 트랜잭션이 `atLeast`개 설 때까지 — 먼저 온 쪽을 낸다. **`pending`을 기다리기만
   * 하면** 그것이 잠금 뒤에 선 판(케이스가 쥔 잠금을 풀어야 끝나는 판)에서 서로 기다려 시간 초과로 죽는다.
   */
  async function settledOrWaiting(pending: Promise<unknown>, atLeast: number): Promise<'settled' | 'waiting'> {
    let settled = false
    void pending.then(
      () => (settled = true),
      () => (settled = true),
    )
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      if (settled) return 'settled'
      const result = await sql<{ n: number }>`
        select count(*)::int as n
          from pg_locks l
          join pg_stat_activity a on a.pid = l.pid
         where not l.granted
           and a.datname = current_database()
      `.execute(db)
      if ((result.rows[0]?.n ?? 0) >= atLeast) return 'waiting'
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('끝나지도 잠금에 서지도 않았습니다 — 시나리오가 성립하지 않았습니다')
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
   *
   * **재확인을 잠금 앞으로 옮기는 변조에도 단언으로 죽는다.** 그때는 요청이 재확인의 멤버 행 `FOR SHARE`를
   * 쥔 채 페이지 잠금을 기다려 **제외가 그 뒤에 선다.** 제외의 응답을 기다린 뒤에야 잠금을 풀면 서로 기다려
   * 시간 초과로 죽는다(단언이 아니라). 그래서 제외를 **기다리지 않고** 걸고, 제외가 끝나거나 잠금 대기가 하나 더
   * 서면(`settledOrWaiting`) 잠금을 푼다 — 그 변조에서는 요청이 먼저 견줘 **409** 다(404 단언이 죽는다). 그 판은
   * 엄밀히 누출이 아니다(제외가 막혀 견주는 순간 밥은 아직 멤버다) — **제외가 요청보다 먼저 커밋하는 판**이 이
   * 케이스가 재는 것이라, 끝에 그 판이 섰는지(`'settled'`)를 따로 단언한다.
   */
  it('잠금을 기다리는 동안 멤버에서 빠지면 404 다 — 409 로 지금 값을 흘리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const { owner, project, page } = await fixture(ctx)
      const bob = await signup(ctx)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      expect((await patch(ctx, project.id, page.id, owner.cookie, { description: '앨리스가 쓴 비밀' })).statusCode).toBe(200)

      const release = await holdPageRow(project.id, page.id)
      let res
      let removal
      let removedFirst
      try {
        // 밥의 바탕은 낡았다(`null`) — 견주면 409 다.
        const sent = patch(ctx, project.id, page.id, bob.cookie, { description: '밥', base: { description: null } })
        await waitForLockWaiter(1)
        removal = ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/members/${bob.user.id}`,
          cookies: owner.cookie,
        })
        removedFirst = await settledOrWaiting(removal, 2)
        await release()
        res = await sent
      } finally {
        await release().catch(() => undefined)
      }

      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('앨리스가 쓴 비밀')
      expect((await metaOf(ctx, page.id)).description).toBe('앨리스가 쓴 비밀')
      expect((await removal).statusCode).toBe(204)
      expect(removedFirst).toBe('settled')
    })
  })

  /**
   * **교착의 판 — 바탕 있는 이름 변경 + 맨 앞 → 맨 뒤 ∥ 바탕 없는 맨 뒤 → 맨 앞**(같은 메뉴 여섯 페이지). 두 쪽이
   * 다 쓰면 잠금 순서가 거꾸로 서 교착한다(바탕 있는 쪽이 이 행 → 형제, 없는 쪽이 형제 → 이 행). 바탕 있는 쪽은
   * 트랜잭션을 열기 전에 400 이라 **자리 옮기기가 하나뿐이고 교착이 없다.** 교착은 500 으로 나간다 — 그래서 «500 이
   * 없다»로 잰다(`pg_stat_database.deadlocks`는 통계가 늦게 모여 케이스에 안 쓴다).
   *
   * 혼자 죽는 변조: 위 롤백 절의 «바탕과 순서 · 메뉴 이동을 …»과 **함께** 죽는다(같은 `refine`) — 400 이 아니다.
   * 이 케이스가 따로 재는 것은 동시성의 값(교착 0)이고, 400 의 주인은 그쪽이다.
   */
  it('바탕과 순서 이동을 한 본문에 실은 쪽이 동시에 와도 400 이고, 바탕 없는 순서 이동은 교착 없이 200 이다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      for (let index = 0; index < 6; index += 1) {
        await createPage(ctx, owner.cookie, project.id, menu.id, { title: `페이지 ${index}` })
      }

      const statuses: { withBase: number[]; plain: number[] } = { withBase: [], plain: [] }
      for (let round = 0; round < 20; round += 1) {
        const order = await ctx.db
          .selectFrom('pages')
          .select(['id', 'title'])
          .where('menu_node_id', '=', menu.id)
          .orderBy('sort_order')
          .execute()
        const first = order[0]!
        const last = order[order.length - 1]!
        const [withBase, plain] = await Promise.all([
          patch(ctx, project.id, first.id, owner.cookie, { title: `이름 ${round}`, sortOrder: 5, base: { title: first.title } }),
          patch(ctx, project.id, last.id, owner.cookie, { sortOrder: 0 }),
        ])
        statuses.withBase.push(withBase.statusCode)
        statuses.plain.push(plain.statusCode)
      }

      expect(statuses.withBase).toEqual(Array(20).fill(400))
      expect(statuses.plain).toEqual(Array(20).fill(200))
    })
  })
})
