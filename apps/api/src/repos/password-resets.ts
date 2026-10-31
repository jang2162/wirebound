/**
 * **비밀번호 재설정 링크** — 관리자가 활성 사용자 한 사람에게 만든다(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * «비밀번호 재설정 링크»). SQL 만 안다. 원문은 저장하지 않는다(`auth/token-hash.ts`).
 *
 * **쓸 수 있는가** — 안 썼다(`used_at` 이 비었다) · 만료 전이다(만든 뒤 24 시간) · 대상이 활성이다 · 만든 사람이 지금 활성 관리자다. 새
 * 링크 · 대상의 비활성화 · 만든 사람의 비활성화 · 해제는 `used_at` 을 채워 막는다(그 시각에 «쓰였다»가 아니라 «더 못 쓴다»는 뜻이다 —
 * 막은 줄은 기록이 말한다).
 *
 * ## 잠금 — 대상의 사용자 행 → 링크 행
 *
 * 만들기 · 쓰기 · 대상의 비활성화가 모두 **대상의 사용자 행을 먼저** 잡는다. 같은 사람의 링크 둘이 동시에 만들어져도 하나만 산다(뒤 만들기가
 * 사용자 행에서 기다린 뒤 앞 링크를 막는다). 쓰기는 대상을 모르는 채 오므로 링크를 잠그지 않고 읽어 대상을 알아낸 뒤 그 행부터 잡는다
 * (`lockResetForUse`) — 링크 행을 먼저 잡으면 대상의 비활성화(«사용자 행 → 링크 행»)와 고리다.
 */
import { sql } from 'kysely'
import { hashTokenValue, randomTokenValue } from '../auth/token-hash'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'

/** 링크의 수명 — 계획 «공통 제약» 의 24 시간. */
export const RESET_LINK_HOURS = 24

const USABLE = sql<boolean>`r.used_at is null and r.expires_at > statement_timestamp()`

/**
 * 링크를 만든다 — 그 사람의 안 쓴 앞 링크를 먼저 막는다. 부르는 쪽이 대상의 사용자 행을 잡았다(머리말 «잠금»). 원문은 돌려주는 값에만 있다.
 */
export async function createPasswordReset(
  trx: DbHandle,
  input: { userId: string; createdBy: string },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  assertLocking(trx, 'createPasswordReset')
  await blockResetsFor(trx, input.userId)
  const token = randomTokenValue()
  const row = await trx
    .insertInto('password_resets')
    .values({
      user_id: input.userId,
      token_hash: hashTokenValue(token),
      expires_at: sql<Date>`clock_timestamp() + make_interval(hours => ${RESET_LINK_HOURS})`,
      created_by: input.createdBy,
    })
    .returning(['id', 'expires_at as expiresAt'])
    .executeTakeFirstOrThrow()
  return { id: row.id, token, expiresAt: row.expiresAt }
}

/** 그 사람에게 만든 안 쓴 링크를 막는다(새 링크 · 대상의 비활성화). 막은 수를 낸다. */
export async function blockResetsFor(trx: DbHandle, userId: string): Promise<number> {
  assertLocking(trx, 'blockResetsFor')
  const rows = await trx
    .updateTable('password_resets')
    .set({ used_at: sql<Date>`clock_timestamp()` })
    .where('user_id', '=', userId)
    .where('used_at', 'is', null)
    .returning('id')
    .execute()
  return rows.length
}

/** 그 사람이 만든 **아직 쓸 수 있는** 링크를 막는다(만든 사람의 비활성화 · 해제). 막은 수를 낸다. */
export async function blockResetsBy(trx: DbHandle, creatorId: string): Promise<number> {
  assertLocking(trx, 'blockResetsBy')
  const rows = await trx
    .updateTable('password_resets as r')
    .set({ used_at: sql<Date>`clock_timestamp()` })
    .where('r.created_by', '=', creatorId)
    .where(USABLE)
    .returning('r.id')
    .execute()
  return rows.length
}

export interface UsableReset {
  id: string
  userId: string
  email: string
  name: string
  createdBy: string
}

/** 원문으로 링크를 찾아 **지금 쓸 수 있으면** 그 대상. 잠그지 않는다(머리말 «쓸 수 있는가»). */
export async function findUsableReset(db: DbHandle, token: string): Promise<UsableReset | null> {
  const row = await db
    .selectFrom('password_resets as r')
    .innerJoin('users as target', 'target.id', 'r.user_id')
    .innerJoin('users as maker', 'maker.id', 'r.created_by')
    .select(['r.id', 'r.user_id as userId', 'target.email', 'target.name', 'r.created_by as createdBy'])
    .where('r.token_hash', '=', hashTokenValue(token))
    .where(USABLE)
    .where('target.deactivated_at', 'is', null)
    .where('maker.is_instance_admin', '=', true)
    .where('maker.deactivated_at', 'is', null)
    .executeTakeFirst()
  return row ?? null
}

/**
 * **쓰기의 잠금** — 대상의 사용자 행(`FOR NO KEY UPDATE`) → 링크 행(`FOR UPDATE`) 뒤 다시 본다(머리말 «잠금»). 쓸 수 있으면 그 대상,
 * 아니면 `null`. 만든 사람의 사용자 행은 잠그지 않고 읽는다 — 만든 사람의 비활성화 · 해제가 이 링크 행을 막으므로 링크 행이 차례를 세운다.
 */
export async function lockResetForUse(trx: DbHandle, reset: UsableReset): Promise<UsableReset | null> {
  assertLocking(trx, 'lockResetForUse')
  await trx.selectFrom('users').select('id').where('id', '=', reset.userId).forNoKeyUpdate().execute()
  await trx.selectFrom('password_resets').select('id').where('id', '=', reset.id).forUpdate().execute()
  const row = await trx
    .selectFrom('password_resets as r')
    .innerJoin('users as target', 'target.id', 'r.user_id')
    .innerJoin('users as maker', 'maker.id', 'r.created_by')
    .select(['r.id', 'r.user_id as userId', 'target.email', 'target.name', 'r.created_by as createdBy'])
    .where('r.id', '=', reset.id)
    .where(USABLE)
    .where('target.deactivated_at', 'is', null)
    .where('maker.is_instance_admin', '=', true)
    .where('maker.deactivated_at', 'is', null)
    .executeTakeFirst()
  return row ?? null
}

/** 쓴 링크를 막는다 — `lockResetForUse` 가 잡은 행이다. */
export async function markResetUsed(trx: DbHandle, resetId: string): Promise<void> {
  await trx
    .updateTable('password_resets')
    .set({ used_at: sql<Date>`clock_timestamp()` })
    .where('id', '=', resetId)
    .execute()
}
