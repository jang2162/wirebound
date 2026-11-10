/**
 * RV-WS 리뷰 — `GET /api/projects` 의 두 칸(`memberCount` · `updatedAt`)이 남의 것을 새지 않는지, 질의가 프로젝트마다 돌지 않는지, 페이지가
 * 많은 프로젝트에서 응답이 늦지 않은지(`repos/projects.ts` 의 `listProjectsForUser`). 성질이 지켜져 초록인 판이다.
 *
 * **질의 수는 `pg.Client.prototype.query` 로 센다** — 앱 모듈 그래프가 `setupFiles` 에서 먼저 적재되므로 `vi.mock` 은 닿지 않는다(`AGENTS.md`
 * «목 · 계측은 불린 수를 값으로 확인하고 …»). 프로토타입은 앱과 같은 `pg` 모듈의 것이라 적재 차례와 무관하게 앱의 질의를 센다. 하네스가 트랜잭션
 * 하나로 감싸 연결이 하나다 — 센 수에는 인증(세션 조회 · `last_seen_at`)의 질의도 든다. 그래서 견주는 것은 수의 차(1 개 · 30 개)이고, 그 차가
 * 0 이 아니면 프로젝트마다 도는 질의가 있다는 뜻이다. 셈이 0 이면 계측이 안 붙은 것이라 카나리아로 죽인다.
 */
import pg from 'pg'
import { sql } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

interface ListItem {
  id: string
  role: string
  memberCount: number
  updatedAt: string
}

async function list(ctx: TestContext, cookie: { wb_session: string }): Promise<ListItem[]> {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/projects', cookies: cookie })
  expect(res.statusCode).toBe(200)
  return res.json()
}

/** 목록 요청 하나가 낸 질의 수 — `pg.Client.prototype.query` 호출 수. */
async function queriesOfList(ctx: TestContext, cookie: { wb_session: string }): Promise<{ count: number; items: ListItem[] }> {
  const spy = vi.spyOn(pg.Client.prototype, 'query')
  try {
    const items = await list(ctx, cookie)
    return { count: spy.mock.calls.length, items }
  } finally {
    spy.mockRestore()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** 목록 줄을 `id` 오름차순으로 — uuid 글자 차례는 pg 의 `uuid` 차례와 같다(소문자 16진수 · 붙임표 자리가 고정). */
function byId(rows: Array<[string, string, number]>): Array<[string, string, number]> {
  return [...rows].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

describe('RV-WS 항목 1 — 목록의 두 칸은 내가 멤버인 프로젝트의 것만 · 그 프로젝트의 수', () => {
  it('멤버 여럿 · 프로젝트 여럿 · 내가 viewer 인 판 — 남의 프로젝트는 목록에 없고, 수는 프로젝트마다 그 프로젝트의 멤버 행 수다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const dave = await signup(ctx)

      // alice 의 프로젝트 셋 — 멤버 수를 서로 다르게(1 · 3 · 4).
      const solo = await createProject(ctx, alice.cookie)
      const three = await createProject(ctx, alice.cookie)
      const four = await createProject(ctx, alice.cookie)
      await addMember(ctx, three.id, bob.user.id, 'viewer')
      await addMember(ctx, three.id, carol.user.id, 'editor')
      await addMember(ctx, four.id, bob.user.id, 'editor')
      await addMember(ctx, four.id, carol.user.id, 'viewer')
      await addMember(ctx, four.id, dave.user.id, 'viewer')
      // bob 이 owner 인 프로젝트 — 멤버 둘(bob · dave). alice 는 멤버가 아니다.
      const bobs = await createProject(ctx, bob.cookie)
      await addMember(ctx, bobs.id, dave.user.id, 'editor')

      // 롤백 하네스라 `created_at` 이 모두 같아 목록은 `id` 차례다(`project-list-order.test.ts`) — 기대값도 그 차례로 늘어놓는다.
      const seenByAlice = await list(ctx, alice.cookie)
      expect(seenByAlice.map((p) => [p.id, p.role, p.memberCount])).toEqual(
        byId([
          [solo.id, 'owner', 1],
          [three.id, 'owner', 3],
          [four.id, 'owner', 4],
        ]),
      )

      // bob 은 three 의 viewer · four 의 editor · bobs 의 owner — solo 는 안 보인다.
      const seenByBob = await list(ctx, bob.cookie)
      expect(seenByBob.map((p) => [p.id, p.role, p.memberCount])).toEqual(
        byId([
          [three.id, 'viewer', 3],
          [four.id, 'editor', 4],
          [bobs.id, 'owner', 2],
        ]),
      )

      // dave 는 viewer · editor 둘 — 내 역할이 갈려도 수는 그 프로젝트의 것이다.
      const seenByDave = await list(ctx, dave.cookie)
      expect(seenByDave.map((p) => [p.id, p.role, p.memberCount])).toEqual(
        byId([
          [four.id, 'viewer', 4],
          [bobs.id, 'editor', 2],
        ]),
      )
    })
  })

  it('남의 프로젝트에서 일어난 편집은 내 목록의 어느 칸도 안 바꾼다(그 프로젝트가 목록에 안 서고, 내 프로젝트의 `updatedAt` 도 그대로)', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const mine = await createProject(ctx, alice.cookie)
      const theirs = await createProject(ctx, bob.cookie)

      const before = await list(ctx, alice.cookie)
      // 롤백 하네스라 `now()` 가 같다 — 남의 페이지의 `updated_at` 을 먼 앞날로 직접 올린다(새면 내 칸이 그 값이 된다).
      const menu = await createMenuNode(ctx, bob.cookie, theirs.id)
      const page = await createPage(ctx, bob.cookie, theirs.id, menu.id)
      await ctx.db
        .updateTable('pages')
        .set({ updated_at: new Date('2099-01-01T00:00:00Z') })
        .where('id', '=', page.id)
        .execute()

      const after = await list(ctx, alice.cookie)
      expect(after.map((p) => p.id)).toEqual([mine.id])
      expect(after).toEqual(before)
    })
  })
})

describe('RV-WS 항목 1 — 질의가 프로젝트마다 돌지 않는다', () => {
  it('프로젝트 1 개 · 30 개의 목록 요청이 같은 수의 질의를 낸다', async () => {
    await withApi(async (ctx) => {
      const one = await signup(ctx)
      const many = await signup(ctx)
      const other = await signup(ctx)
      await createProject(ctx, one.cookie)
      for (let i = 0; i < 30; i += 1) {
        const p = await createProject(ctx, many.cookie)
        // 프로젝트마다 멤버 · 페이지가 있어야 하위 질의가 «돌 일이 있는» 판이다.
        await addMember(ctx, p.id, other.user.id, 'viewer')
        if (i % 3 === 0) {
          const menu = await createMenuNode(ctx, many.cookie, p.id)
          await createPage(ctx, many.cookie, p.id, menu.id)
        }
      }

      const small = await queriesOfList(ctx, one.cookie)
      const large = await queriesOfList(ctx, many.cookie)
      console.log(`[rv-ws] 목록 요청의 질의 수 — 프로젝트 1: ${small.count} · 30: ${large.count}`)
      // 카나리아 — 계측이 붙었고 목록이 실제로 그 수다.
      expect(small.count).toBeGreaterThan(0)
      expect(small.items).toHaveLength(1)
      expect(large.items).toHaveLength(30)
      expect(large.items.every((p) => p.memberCount === 2)).toBe(true)
      expect(large.count).toBe(small.count)
    })
  })
})

describe('RV-WS 항목 1 — 페이지 수백인 프로젝트에서 응답 시간', () => {
  it('페이지 300 개 프로젝트를 든 목록이 한 번에 200ms 안에 답한다(다섯 번 잰 가운데 값)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const big = await createProject(ctx, owner.cookie)
      await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, big.id)
      const page = await createPage(ctx, owner.cookie, big.id, menu.id)
      // 299 개를 첫 페이지 행에서 베낀다 — API 로 300 번 만들면 케이스 한도를 먹는다. 열은 표에서 읽어 짓는다(`id` 만 새로).
      const columns = await sql<{ column_name: string }>`
        select column_name from information_schema.columns
        where table_schema = current_schema() and table_name = 'pages' and column_name not in ('id', 'sort_order')
        order by ordinal_position`.execute(ctx.db)
      const names = columns.rows.map((r) => sql.ref(r.column_name))
      await sql`
        insert into pages (id, sort_order, ${sql.join(names)})
        select gen_random_uuid(), p.sort_order + g, ${sql.join(names.map((n) => sql`p.${n}`))}
        from pages p, generate_series(1, 299) as g
        where p.id = ${page.id}`.execute(ctx.db)
      const counted = await ctx.db
        .selectFrom('pages')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('project_id', '=', big.id)
        .executeTakeFirstOrThrow()
      expect(Number(counted.n)).toBe(300)

      const times: number[] = []
      for (let i = 0; i < 5; i += 1) {
        const started = performance.now()
        const items = await list(ctx, owner.cookie)
        times.push(performance.now() - started)
        expect(items).toHaveLength(2)
      }
      times.sort((a, b) => a - b)
      console.log(`[rv-ws] 목록 응답(ms) — 페이지 300: ${times.map((t) => t.toFixed(1)).join(' · ')}`)
      expect(times[2]).toBeLessThan(200)
    })
  })
})
