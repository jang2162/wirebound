/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `guard-in-lock.test.ts`와 같은 부류다.
 *
 * # 무엇을 재나 — «내 토큰» 폐기의 잠금
 *
 * 전부 폐기(`repos/api-tokens.ts`의 `deleteAllUserTokens`)는 한 문장으로 **여러 토큰 행**을 잡는다. 여러 토큰 행을 잡는 다른
 * 자리 — 프로젝트 삭제의 `lockProjectTokens` · 멤버 제거의 `lockMemberTokens` — 는 id 순이다. 겹치는 행 둘을 서로 반대로
 * 잡으면 고리다. 폐기는 토큰 행 밖을 안 잡으므로 «토큰 행 → owner 행 → 멤버 행»(`repos/members.ts`)의 앞 칸에만 선다.
 *
 * **판 세우기.** 밥의 토큰 셋을 **heap 순서와 id 순서가 엇갈리게** 넣는다 — 넣는 순서 B(프로젝트 P · id 가장 큼) → D(프로젝트
 * Q · 가운데) → A(P · 가장 작음). `WHERE user_id` 만의 `DELETE`는 heap 순서(B → D → A)로, 삭제 · 제거는 id 순서(A → B)로
 * 잡는다. 테스트가 D 를 `KEY SHARE`로 쥐어(`tokenIsLive` — 쓰기의 자격 재확인과 같은 잠금) 폐기를 D 앞에 세운 뒤 상대를
 * 쏘고, 둘이 줄에 서면 푼다.
 *
 * | 판 | id 순으로 잡는 폐기 | heap 순서로 잡는 폐기(`DELETE … WHERE user_id = $1`) |
 * |---|---|---|
 * | 폐기가 먼저 · 프로젝트 삭제 | 폐기가 A 를 쥐고 D 에 선다 → 삭제는 A 에서 아무것도 안 쥔 채 선다 → 교착 0 | 폐기가 B 를 쥐고 D 에, 삭제가 A 를 쥐고 B 에 → 풀리면 폐기가 A 에 서서 고리 |
 * | 폐기가 먼저 · 멤버 제거 | 같다 | 같다(제거의 첫 잠금이 A → B) |
 * | 삭제가 먼저 | 삭제가 A 를 쥐고 B 에(테스트가 쥔 B) 선다 → 폐기는 A 에서 선다 → 교착 0 | 폐기가 B 에서 아무것도 안 쥔 채 선다 → 교착 0 |
 * | 대조군 — 하나 폐기(B) · 폐기가 먼저 · 삭제 | 한 행이라 고리가 설 수 없다 — 교착 0 | 같다 |
 *
 * **교착은 `pg_stat_database.deadlocks`로 본다**(`guard-in-lock.test.ts`의 `deadlockCount`와 같은 질의).
 *
 * | 변조(`repos/api-tokens.ts`) | 죽는 것 |
 * |---|---|
 * | `deleteAllUserTokens`를 `DELETE … WHERE user_id = $1` 한 문장으로(id 순 선잠금을 뗌) | «폐기가 먼저» 둘 — 교착 +1 · 희생자는 삭제 · 제거(500), 폐기는 200 |
 * | 하나 폐기(`deleteUserToken`)에 세션 재확인을 건다 | «재확인하지 않는다» 혼자 — 401 · 토큰이 남는다 |
 *
 * **«삭제가 먼저»와 대조군은 혼자 죽는 변조가 없다** — 옛 판(위 첫 줄)에서도 교착 0 이라는 것이 값이다. 고리가 폐기가 행을 잡는
 * 순서 탓이고 원래 있던 것이 아님을 이 둘이 가른다(`CLAUDE.md` «교착을 잴 때는 누가 먼저 잡느냐를 뒤집은 판과 옛 판을 함께
 * 세운다»). 순서 축은 «폐기가 먼저» 둘이 소유한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { hashTokenValue, randomTokenValue } from '../src/auth/token-hash'
import { tokenIsLive } from '../src/repos/api-tokens'
import { withTransaction } from '../src/db/tx'
import { addMember, createProject, getTestDb, resetRealData, signup, withRealApi, type RealApiContext, type SignedUpUser } from './helpers'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const ID = {
  A: '00000000-0000-4000-8000-00000000000a',
  D: '80000000-0000-4000-8000-00000000000d',
  B: 'ffffffff-ffff-4fff-bfff-fffffffffffb',
} as const

interface Fx {
  alice: SignedUpUser
  bob: SignedUpUser
  /** 앨리스(owner)의 프로젝트 — 밥은 editor. 밥의 토큰 A · B 가 여기 있다. */
  p: string
  /** 밥의 프로젝트 — 토큰 D. */
  q: string
}

async function fixture(ctx: RealApiContext): Promise<Fx> {
  const alice = await signup(ctx)
  const bob = await signup(ctx)
  const p = (await createProject(ctx, alice.cookie)).id
  const q = (await createProject(ctx, bob.cookie)).id
  await addMember(ctx, p, bob.user.id, 'editor')
  // 넣는 순서가 heap 순서다(머리말 «판 세우기»).
  for (const [key, projectId] of [['B', p], ['D', q], ['A', p]] as const) {
    await db
      .insertInto('api_tokens')
      .values({ id: ID[key], project_id: projectId, user_id: bob.user.id, token_hash: hashTokenValue(randomTokenValue()), name: key })
      .execute()
  }
  return { alice, bob, p, q }
}

async function deadlockCount(): Promise<number> {
  const result = await sql<{ n: number }>`select deadlocks::int as n from pg_stat_database where datname = current_database()`.execute(db)
  return result.rows[0]!.n
}

/** 잠금을 기다리는 백엔드가 `atLeast` 이상 설 때까지 기다린다 — 5s 안에 안 서면 던진다(판이 안 섰다). */
async function waitForLockWaiters(atLeast: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await sql<{ n: number }>`
      select count(distinct l.pid)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid
       where not l.granted and a.datname = current_database()`.execute(db)
    if ((result.rows[0]?.n ?? 0) >= atLeast) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`잠금을 기다리는 백엔드가 ${atLeast}개 서지 않았습니다 — 시나리오가 성립하지 않았습니다`)
}

/** 토큰 행 하나를 `KEY SHARE`로 쥔다 — 진짜 `tokenIsLive`(쓰기의 자격 재확인)다. `release`가 커밋한다. */
async function holdToken(tokenId: string): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let markHeld: () => void = () => {}
  const acquired = new Promise<void>((resolve) => {
    markHeld = resolve
  })
  const holder = withTransaction(db, async (trx) => {
    if (!(await tokenIsLive(trx, tokenId))) throw new Error('쥘 토큰이 없습니다')
    markHeld()
    await held
  })
  await Promise.race([acquired, holder])
  return {
    release: async () => {
      release()
      await holder
    },
  }
}

type Reply = { status: number; body: string }

function fire(ctx: RealApiContext, method: 'DELETE' | 'POST', url: string, cookie: { wb_session: string }): Promise<Reply> {
  return ctx.app.inject({ method, url, cookies: cookie }).then((res) => ({ status: res.statusCode, body: res.body }))
}

async function bobTokens(userId: string): Promise<string[]> {
  const rows = await db.selectFrom('api_tokens').select('id').where('user_id', '=', userId).orderBy('id').execute()
  return rows.map((row) => row.id)
}

describe('전부 폐기가 여러 토큰 행을 잡는 쓰기와 겹쳐도 교착 0 — id 순으로 잡는다', () => {
  it('전부 폐기가 프로젝트 삭제와 겹치면(폐기가 먼저 줄에): 교착 0 · 폐기 셋 · 삭제 204', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await deadlockCount()
      const hold = await holdToken(ID.D)
      let revoke: Promise<Reply> | undefined
      let deletion: Promise<Reply> | undefined
      try {
        revoke = fire(ctx, 'DELETE', '/api/auth/tokens', fx.bob.cookie)
        await waitForLockWaiters(1)
        deletion = fire(ctx, 'DELETE', `/api/projects/${fx.p}`, fx.alice.cookie)
        await waitForLockWaiters(2)
      } finally {
        await hold.release()
      }
      const [revoked, deleted] = await Promise.all([revoke, deletion])

      expect(await deadlockCount()).toBe(before)
      expect(revoked.status, revoked.body).toBe(200)
      expect(JSON.parse(revoked.body)).toEqual({ revoked: 3 })
      expect(deleted.status, deleted.body).toBe(204)
    })
  }, 60_000)

  it('전부 폐기가 멤버 제거와 겹치면(폐기가 먼저 줄에): 교착 0 · 폐기 셋 · 제거 204', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await deadlockCount()
      const hold = await holdToken(ID.D)
      let revoke: Promise<Reply> | undefined
      let removal: Promise<Reply> | undefined
      try {
        revoke = fire(ctx, 'DELETE', '/api/auth/tokens', fx.bob.cookie)
        await waitForLockWaiters(1)
        removal = fire(ctx, 'DELETE', `/api/projects/${fx.p}/members/${fx.bob.user.id}`, fx.alice.cookie)
        await waitForLockWaiters(2)
      } finally {
        await hold.release()
      }
      const [revoked, removed] = await Promise.all([revoke, removal])

      expect(await deadlockCount()).toBe(before)
      expect(revoked.status, revoked.body).toBe(200)
      expect(JSON.parse(revoked.body)).toEqual({ revoked: 3 })
      expect(removed.status, removed.body).toBe(204)
    })
  }, 60_000)

  it('프로젝트 삭제가 먼저 줄에 서면: 교착 0 · 삭제 204 · 폐기는 남은 하나(D)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await deadlockCount()
      const hold = await holdToken(ID.B)
      let revoke: Promise<Reply> | undefined
      let deletion: Promise<Reply> | undefined
      try {
        deletion = fire(ctx, 'DELETE', `/api/projects/${fx.p}`, fx.alice.cookie)
        await waitForLockWaiters(1)
        revoke = fire(ctx, 'DELETE', '/api/auth/tokens', fx.bob.cookie)
        await waitForLockWaiters(2)
      } finally {
        await hold.release()
      }
      const [deleted, revoked] = await Promise.all([deletion, revoke])

      expect(await deadlockCount()).toBe(before)
      expect(deleted.status, deleted.body).toBe(204)
      // A · B 는 삭제의 CASCADE 로 사라졌고 폐기는 그 행을 건너뛴다.
      expect(JSON.parse(revoked.body)).toEqual({ revoked: 1 })
      expect(await bobTokens(fx.bob.user.id)).toEqual([])
    })
  }, 60_000)

  it('대조군 — 하나 폐기(B)가 프로젝트 삭제와 겹치면: 교착 0 · 폐기 204 · 삭제 204', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await deadlockCount()
      const hold = await holdToken(ID.B)
      let revoke: Promise<Reply> | undefined
      let deletion: Promise<Reply> | undefined
      try {
        revoke = fire(ctx, 'DELETE', `/api/auth/tokens/${ID.B}`, fx.bob.cookie)
        await waitForLockWaiters(1)
        deletion = fire(ctx, 'DELETE', `/api/projects/${fx.p}`, fx.alice.cookie)
        await waitForLockWaiters(2)
      } finally {
        await hold.release()
      }
      const [revoked, deleted] = await Promise.all([revoke, deletion])

      expect(await deadlockCount()).toBe(before)
      expect(revoked.status, revoked.body).toBe(204)
      expect(deleted.status, deleted.body).toBe(204)
      expect(await bobTokens(fx.bob.user.id)).toEqual([ID.D])
    })
  }, 60_000)
})

describe('폐기는 재확인하지 않는다 — 권한을 줄이는 쓰기다', () => {
  it('토큰 행에 선 폐기는 그 사이 로그아웃해도 지운다(204 · 토큰 0)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 쓰는 중인 요청의 자격 재확인이 B 를 쥐고 있다 — 폐기는 그 뒤에 선다.
      const hold = await holdToken(ID.B)
      let revoke: Promise<Reply> | undefined
      try {
        revoke = fire(ctx, 'DELETE', `/api/auth/tokens/${ID.B}`, fx.bob.cookie)
        await waitForLockWaiters(1)
        const loggedOut = await fire(ctx, 'POST', '/api/auth/logout', fx.bob.cookie)
        expect(loggedOut.status, loggedOut.body).toBe(204)
      } finally {
        await hold.release()
      }
      const revoked = await revoke

      expect(revoked.status, revoked.body).toBe(204)
      expect(await bobTokens(fx.bob.user.id)).toEqual([ID.D, ID.A].sort())
    })
  }, 60_000)
})
