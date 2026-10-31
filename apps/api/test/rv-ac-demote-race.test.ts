/**
 * **RV-AC 리뷰 1 — 재확인을 쓰기 앞으로 옮긴 것 · «마지막 관리자» 를 관리자 행 전부 잠금 없이 지키는 것**(보고
 * `docs/superpowers/plans/2026-10-31-ac-report.md` «결정과 이유» 2 · 3).
 *
 * - **재확인을 지난 뒤 · 커밋 전의 강등.** 관리자 쓰기를 재확인 **뒤**의 문장 앞에 붙잡고, 다른 관리자의 해제 · 비활성화나 서버 명령의
 *   해제(`setInstanceAdmin` — `db/admin.ts` 가 부르는 함수)를 보낸다. 강등은 요청자 행(`FOR SHARE`)에서 줄을 서고, 쓰기가 먼저
 *   커밋된 뒤에 커밋된다 — 그래서 강등이 그 쓰기가 남긴 링크까지 거둔다. 반대 차례(강등이 먼저 행을 쥔 판)는 쓰기가 403 으로 안 남는다.
 * - **셋이 고리로 서로를 해제 · 비활성화.** 관리자 셋(id 순 a < b < c)이 a→b · b→c · c→a(또는 거꾸로)로 겹친 판. 한 요청을 재확인 앞에
 *   붙잡고 나머지 둘이 그 뒤 사슬로 줄 선 것을 본 뒤 놓는다. 관리자가 남는지 · 교착(`pg_stat_database.deadlocks`)이 0 인지 센다.
 *
 * 판은 `admin-deactivate-race.test.ts` 와 같은 꼴이다 — 붙잡은 뒤 상대가 끝났는지 붙잡힌 백엔드 뒤에 줄 섰는지 보고(둘 다 아니면 던진다), 놓는다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setInstanceAdmin } from '../src/repos/users'
import { admin, adminOf, deadlockCount, heldBackend, queueBehind, settledOrQueued } from './accounts-fixtures'
import { getTestDb, resetRealData, signup, withProxiedRealApi, type SignedUpUser } from './helpers'

const db = getTestDb()
const ADMIN_RECHECK = '"is_instance_admin" from "users" where "id" = $1 for share'
const INVITE_INSERT = 'insert into "invites"'
const RESET_INSERT = 'insert into "password_resets"'

beforeEach(resetRealData)
afterEach(resetRealData)

async function admins(): Promise<string[]> {
  const rows = await db
    .selectFrom('users')
    .select('id')
    .where('is_instance_admin', '=', true)
    .where('deactivated_at', 'is', null)
    .orderBy('id')
    .execute()
  return rows.map((row) => row.id)
}

async function inviteStates(): Promise<{ revoked: boolean }[]> {
  const rows = await db.selectFrom('invites').select('revoked_at').execute()
  return rows.map((row) => ({ revoked: row.revoked_at !== null }))
}

describe('재확인을 지난 뒤 · 커밋 전의 강등 — 강등이 그 커밋 뒤로 밀린다', () => {
  it('다른 관리자의 API 해제 — 해제가 요청자 행에서 줄을 서고, 초대 201 뒤 해제 200 이 그 링크까지 거둔다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const amy = await adminOf(ctx)
      const ben = await adminOf(ctx)
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(INVITE_INSERT)
      const writing = admin(ctx, amy.cookie, 'POST', '/invites', { name: '강등 직전', kind: 'multi' })
      await hold.held
      const holder = await heldBackend(db)
      const demote = admin(ctx, ben.cookie, 'DELETE', `/users/${amy.user.id}/admin`)
      const waited = await settledOrQueued(db, demote, holder, 'for no key update')
      hold.release()
      const [made, revoked] = await Promise.all([writing, demote])
      console.log('[rv-ac 1a api]', waited, made.statusCode, revoked.statusCode, revoked.body)
      expect(waited).toBe('queued')
      expect([made.statusCode, revoked.statusCode]).toEqual([201, 200])
      expect(revoked.json().revokedLinks).toBe(1)
      expect(await inviteStates()).toEqual([{ revoked: true }])
      expect(await admins()).toEqual([ben.user.id])
      expect((await deadlockCount(db)) - before).toBe(0)
    })
  })

  it('서버 명령의 해제(`setInstanceAdmin`) — 같은 행에서 줄을 서고, 초대 201 뒤 «changed» 가 그 링크까지 거둔다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const amy = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery(INVITE_INSERT)
      const writing = admin(ctx, amy.cookie, 'POST', '/invites', { name: '명령 직전', kind: 'multi' })
      await hold.held
      const holder = await heldBackend(db)
      const command = setInstanceAdmin(db, amy.user.email, false)
      const waited = await settledOrQueued(db, command, holder, 'for no key update')
      hold.release()
      const [made, outcome] = await Promise.all([writing, command])
      console.log('[rv-ac 1a cli]', waited, made.statusCode, outcome)
      expect(waited).toBe('queued')
      expect(made.statusCode).toBe(201)
      expect(outcome).toBe('changed')
      expect(await inviteStates()).toEqual([{ revoked: true }])
    })
  })

  it('요청자의 비활성화 — 비활성화가 요청자 행에서 줄을 서고, 재설정 링크 201 뒤 비활성화 200 이 그 링크를 막는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const amy = await adminOf(ctx)
      const ben = await adminOf(ctx)
      const carl = await signup(ctx)
      const hold = ctx.proxy.holdQuery(RESET_INSERT)
      const writing = admin(ctx, amy.cookie, 'POST', `/users/${carl.user.id}/reset-links`)
      await hold.held
      const holder = await heldBackend(db)
      const off = admin(ctx, ben.cookie, 'POST', `/users/${amy.user.id}/deactivate`)
      const waited = await settledOrQueued(db, off, holder, 'for no key update')
      hold.release()
      const [made, res] = await Promise.all([writing, off])
      console.log('[rv-ac 1a deactivate]', waited, made.statusCode, res.statusCode, res.body)
      expect(waited).toBe('queued')
      expect([made.statusCode, res.statusCode]).toEqual([201, 200])
      expect(res.json().revokedLinks).toBe(1)
      const link = await ctx.app.inject({ method: 'GET', url: `/api/auth/resets/${made.json().token}` })
      expect(link.statusCode).toBe(404)
    })
  })

  it('반대 차례 — 서버 명령의 해제가 요청자 행을 쥔 동안 보낸 쓰기는 재확인에서 줄을 서고 403 · 링크 0', async () => {
    await withProxiedRealApi(async (ctx) => {
      const amy = await adminOf(ctx)
      let commit!: () => void
      const gate = new Promise<void>((resolve) => (commit = resolve))
      let changed!: (outcome: string) => void
      const ran = new Promise<string>((resolve) => (changed = resolve))
      const command = db.transaction().execute(async (trx) => {
        changed(await setInstanceAdmin(trx, amy.user.email, false))
        await gate
      })
      expect(await ran).toBe('changed')
      const holder = Number(
        (
          await sql<{
            pid: number
          }>`select pid from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'idle in transaction'`.execute(
            db,
          )
        ).rows[0]!.pid,
      )
      const writing = admin(ctx, amy.cookie, 'POST', '/invites', { name: '명령 뒤', kind: 'multi' })
      const waited = await settledOrQueued(db, writing, holder, ADMIN_RECHECK)
      commit()
      await command
      const made = await writing
      console.log('[rv-ac 1a cli first]', waited, made.statusCode)
      expect(waited).toBe('queued')
      expect(made.statusCode).toBe(403)
      expect(await db.selectFrom('invites').select('id').execute()).toEqual([])
    })
  })
})

/**
 * 셋이 고리로 — 관리자 셋을 만들고 id 순으로 a · b · c 라 부른다. `plan` 의 세 줄은 (요청자, 대상, 행동)이고 `heldIndex` 의 요청을 재확인
 * 앞에 붙잡는다. 붙잡힌 요청은 제 두 행을 쥐었고, 나머지 둘은 id 순 잠금에서 그 뒤 사슬로 선다(두 줄이 `for no key update` · `for share`
 * 로 사슬에 있는지 본다).
 */
type Act = 'revoke' | 'deactivate'
type Step = { actor: 0 | 1 | 2; target: 0 | 1 | 2; act: Act }

async function ring(plan: Step[], heldIndex: number): Promise<{ codes: number[]; admins: number[]; deadlocks: number; queued: number }> {
  let out!: { codes: number[]; admins: number[]; deadlocks: number; queued: number }
  await withProxiedRealApi(async (ctx) => {
    const made: SignedUpUser[] = [await adminOf(ctx), await adminOf(ctx), await adminOf(ctx)]
    const byId = [...made].sort((x, y) => (x.user.id < y.user.id ? -1 : 1))
    const send = (step: Step) =>
      step.act === 'revoke'
        ? admin(ctx, byId[step.actor]!.cookie, 'DELETE', `/users/${byId[step.target]!.user.id}/admin`)
        : admin(ctx, byId[step.actor]!.cookie, 'POST', `/users/${byId[step.target]!.user.id}/deactivate`)
    const before = await deadlockCount(db)
    const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
    const pending: Promise<{ statusCode: number }>[] = []
    pending[heldIndex] = send(plan[heldIndex]!)
    await hold.held
    const holder = await heldBackend(db)
    for (let index = 0; index < plan.length; index += 1) {
      if (index === heldIndex) continue
      pending[index] = send(plan[index]!)
      // 차례대로 보낸다 — 앞의 것이 사슬에 선 뒤 다음 것을 보내야 id 순 잠금의 줄이 정해진다.
      const until = Date.now() + 5_000
      while ((await queueBehind(db, holder)).length < (index < heldIndex ? index + 1 : index)) {
        if (Date.now() > until) throw new Error(`요청 ${index} 가 사슬에 서지 않았다 — 판이 안 섰다`)
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }
    const queued = (await queueBehind(db, holder)).length
    hold.release()
    const results = await Promise.all(pending)
    const left = await admins()
    out = {
      codes: results.map((res) => res.statusCode),
      admins: left.map((id) => byId.findIndex((user) => user.user.id === id)),
      deadlocks: (await deadlockCount(db)) - before,
      queued,
    }
  })
  return out
}

describe('셋이 고리로 서로를 해제 · 비활성화 — 관리자가 남고 교착 0', () => {
  it('a→b · b→c · c→a 해제(b→c 를 붙잡음) — [200, 200, 403] · 남은 관리자 a · 교착 0', async () => {
    const got = await ring(
      [
        { actor: 0, target: 1, act: 'revoke' },
        { actor: 1, target: 2, act: 'revoke' },
        { actor: 2, target: 0, act: 'revoke' },
      ],
      1,
    )
    console.log('[rv-ac 1b ring forward]', got)
    expect(got.queued).toBe(2)
    expect(got.deadlocks).toBe(0)
    expect(got.admins.length).toBeGreaterThanOrEqual(1)
    expect(got).toEqual({ codes: [200, 200, 403], admins: [0], deadlocks: 0, queued: 2 })
  })

  it('a→c · c→b · b→a 해제(a→c 를 붙잡음) — [200, 403, 200] · 남은 관리자 b · 교착 0', async () => {
    const got = await ring(
      [
        { actor: 0, target: 2, act: 'revoke' },
        { actor: 2, target: 1, act: 'revoke' },
        { actor: 1, target: 0, act: 'revoke' },
      ],
      0,
    )
    console.log('[rv-ac 1b ring reverse]', got)
    expect(got.queued).toBe(2)
    expect(got.deadlocks).toBe(0)
    expect(got.admins.length).toBeGreaterThanOrEqual(1)
    expect(got).toEqual({ codes: [200, 403, 200], admins: [1], deadlocks: 0, queued: 2 })
  })

  it('비활성화 · 해제를 섞은 고리 a⊘b · b→c · c⊘a(b→c 를 붙잡음) — 관리자가 남고 교착 0', async () => {
    const got = await ring(
      [
        { actor: 0, target: 1, act: 'deactivate' },
        { actor: 1, target: 2, act: 'revoke' },
        { actor: 2, target: 0, act: 'deactivate' },
      ],
      1,
    )
    console.log('[rv-ac 1b ring mixed]', got)
    expect(got.queued).toBe(2)
    expect(got.deadlocks).toBe(0)
    expect(got.admins.length).toBeGreaterThanOrEqual(1)
    expect(got).toEqual({ codes: [200, 200, 403], admins: [0], deadlocks: 0, queued: 2 })
  })

  it('비활성화만의 거꾸로 고리 a⊘c · c⊘b · b⊘a(a⊘c 를 붙잡음) — [200, 401, 200] · 남은 관리자 b · 교착 0', async () => {
    const got = await ring(
      [
        { actor: 0, target: 2, act: 'deactivate' },
        { actor: 2, target: 1, act: 'deactivate' },
        { actor: 1, target: 0, act: 'deactivate' },
      ],
      0,
    )
    console.log('[rv-ac 1b ring deactivate reverse]', got)
    expect(got.queued).toBe(2)
    expect(got.deadlocks).toBe(0)
    expect(got.admins.length).toBeGreaterThanOrEqual(1)
    // 가운데 요청은 401 이다 — 요청자 c 가 앞 비활성화로 세션을 잃었고, 재확인은 자격을 관리자 판정보다 먼저 던진다.
    expect(got).toEqual({ codes: [200, 401, 200], admins: [1], deadlocks: 0, queued: 2 })
  })
})
