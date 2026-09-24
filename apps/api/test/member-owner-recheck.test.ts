/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 멤버 쓰기는 owner 행을 잡은 뒤 · 쓰기 전에 요청한 사람을 다시 본다
 *
 * 가드(`projectGuard('owner')`)는 owner 행 잠금(`repos/members.ts`의 `lockOwnerIds`) **앞**에서 읽는다. 다른 owner 가 요청한 사람을
 * 내리는 쓰기가 먼저 그 행들을 쥐었으면, 요청은 그 커밋 뒤에 서서 **이미 owner 가 아닌 사람**의 쓰기가 된다. 그래서 잠금 뒤에 다시
 * 본다(`OwnerRecheck`) — 쓰기 **전에**. 쓰기 뒤에 보면 owner 가 자기를 내리거나 빼는 정당한 요청이 자기 쓰기에 막힌다.
 *
 * | 케이스 | 혼자 죽는 변조 |
 * |---|---|
 * | 강등이 커밋 전인 동안 선 역할 변경 | `updateMemberRole`이 재확인을 안 부른다 |
 * | 강등이 커밋 전인 동안 선 제거 | `removeMember`가 재확인을 안 부른다 |
 * | owner 가 자기를 내린다 | `updateMemberRole`이 재확인을 `UPDATE` **뒤에** 부른다 |
 * | owner 가 자기를 뺀다 | `removeMember`가 재확인을 `DELETE` **뒤에** 부른다 — `members.test.ts`의 «owner가 둘이면 자기 제거는 성공한다»가 소유한다 |
 *
 * 강등은 **진짜 함수**(`updateMemberRole`)를 트랜잭션 안에서 불러 커밋 전에 세운다 — SQL 을 베끼지 않는다. 줄에 선 것은 `pg_locks`로 본다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { updateMemberRole } from '../src/repos/members'
import { addMember, createProject, getTestDb, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

const db = getTestDb()

async function lockWaiters(): Promise<number> {
  const result = await sql<{ n: number }>`
    select count(distinct l.pid)::int as n
      from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
     where not l.granted
       and a.datname = current_database()
  `.execute(db)
  return result.rows[0]?.n ?? 0
}

async function until(label: string, ready: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (await ready()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`${label} — 시나리오가 성립하지 않았습니다`)
}

async function roleOf(projectId: string, userId: string): Promise<string | null> {
  const row = await db
    .selectFrom('project_members')
    .select('role')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row?.role ?? null
}

/** 앨리스 · 밥은 owner, 채은은 editor. */
async function board(ctx: RealApiContext) {
  const alice = await signup(ctx)
  const bob = await signup(ctx)
  const chaeun = await signup(ctx)
  const project = await createProject(ctx, alice.cookie)
  await addMember(ctx, project.id, bob.user.id, 'owner')
  await addMember(ctx, project.id, chaeun.user.id, 'editor')
  return { alice, bob, chaeun, project }
}

describe('다른 owner 의 강등 뒤에 선 멤버 쓰기는 그 뒤의 권한으로 판정한다', () => {
  /**
   * 앨리스가 밥을 editor 로 내리는 쓰기를 커밋 전에 세워 두고(owner 행을 쥔다), 밥이 채은의 역할 변경 · 제거를 보낸다. 밥의 요청은 가드를
   * 지나(아직 owner 다) owner 행에 선다. 강등이 커밋되면 밥은 이미 editor 다 — 403 이고 채은은 그대로다.
   */
  async function afterDemotion(ctx: RealApiContext, request: (fx: Awaited<ReturnType<typeof board>>) => Promise<{ statusCode: number }>) {
    const fx = await board(ctx)
    let commit = (): void => {}
    const gate = new Promise<void>((resolve) => (commit = resolve))
    let held = (): void => {}
    const holding = new Promise<void>((resolve) => (held = resolve))
    const demotion = withTransaction(db, async (trx) => {
      // 요청한 사람이 없는 픽스처라 권한은 다시 보지 않는다 — 이 판이 재는 것은 뒤에 선 밥의 요청이다.
      await updateMemberRole(trx, fx.project.id, fx.bob.user.id, 'editor', async () => {})
      held()
      await gate
    })
    await holding

    const pending = request(fx)
    await until('밥의 요청이 owner 행에 선다', async () => (await lockWaiters()) >= 1)
    commit()
    await demotion
    return { fx, response: await pending }
  }

  it('강등이 커밋 전인 동안 선 역할 변경은 403 이다 — 내려간 사람이 남을 owner 로 올리지 못한다', async () => {
    await withRealApi(async (ctx) => {
      const { fx, response } = await afterDemotion(ctx, (fx) =>
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${fx.project.id}/members/${fx.chaeun.user.id}`,
          cookies: fx.bob.cookie,
          payload: { role: 'owner' },
        }),
      )
      expect(response.statusCode).toBe(403)
      expect(await roleOf(fx.project.id, fx.chaeun.user.id)).toBe('editor')
      expect(await roleOf(fx.project.id, fx.bob.user.id)).toBe('editor')
    })
  }, 30_000)

  it('강등이 커밋 전인 동안 선 제거는 403 이다 — 내려간 사람이 남을 빼지 못한다', async () => {
    await withRealApi(async (ctx) => {
      const { fx, response } = await afterDemotion(ctx, (fx) =>
        ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${fx.project.id}/members/${fx.chaeun.user.id}`,
          cookies: fx.bob.cookie,
        }),
      )
      expect(response.statusCode).toBe(403)
      expect(await roleOf(fx.project.id, fx.chaeun.user.id)).toBe('editor')
    })
  }, 30_000)
})

describe('owner 가 자기를 내리는 요청은 재확인에 막히지 않는다', () => {
  it('owner 가 자기를 내린다 — 다른 owner 가 있으면 200 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/members/${fx.alice.user.id}`,
        cookies: fx.alice.cookie,
        payload: { role: 'editor' },
      })
      expect(response.statusCode).toBe(200)
      expect(await roleOf(fx.project.id, fx.alice.user.id)).toBe('editor')
    })
  }, 30_000)
})
