/**
 * **초대 링크** — 관리자가 만들고, 받은 사람이 그 링크로 스스로 계정을 만든다(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * «초대 링크»). SQL 만 안다.
 *
 * **원문을 저장하지 않는다** — `createInvite` 가 원문을 만들어 돌려주고 표에는 sha256 hex 만 넣는다(`auth/token-hash.ts` — 세션 · API
 * 토큰과 같은 함수). 원문이 실리는 자리는 만들기 응답 하나다 — 목록은 원문을 낼 수단이 없다.
 *
 * ## 쓸 수 있는가 — 넷이 다 참일 때
 *
 * 거두지 않았다 · 만료 전이다 · `single` 이면 그 링크로 가입한 사람이 0 이다 · **만든 사람이 지금 활성 관리자다.** 마지막 것은 비활성화 ·
 * 관리자 해제가 그 사람의 링크를 같은 트랜잭션에서 거두므로(`revokeInvitesBy`) 겹으로 둔다 — 거두기 없이 관리자 표시만 바뀐 행(옛 판의
 * 해제)도 막는다. 못 쓰는 넷(없음 · 만료 · 거둠 · 다 씀)은 바깥에 가르지 않는다(라우트가 한 문장을 낸다).
 *
 * ## 잠금 — 가입은 링크 행 하나를 잡는다
 *
 * 가입(`signupWithInvite`)은 링크 행을 `FOR UPDATE` 로 잡은 **뒤** 새 문장으로 가입 수 · 만든 사람을 읽는다 — 같은 `single` 링크로 둘이
 * 겹치면 뒤 사람이 그 행에서 앞 사람의 커밋을 기다리고, 기다린 뒤의 가입 수 읽기(새 스냅숏)가 앞 사람을 센다. 만든 사람의 사용자 행은
 * **잠그지 않고** 읽는다 — 비활성화 · 해제는 «사용자 행 → 링크 행» 으로 잡으므로(`revokeInvitesBy`) 여기서 «링크 행 → 사용자 행» 으로
 * 잡으면 고리다. 잠그지 않아도 차례는 링크 행이 세운다: 가입이 먼저 쥐면 거두기가 그 커밋을 기다리고(가입이 앞선 판), 거두기가 먼저면
 * 가입이 기다린 뒤 거둔 행을 읽는다.
 */
import { sql } from 'kysely'
import { hashTokenValue, randomTokenValue } from '../auth/token-hash'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'
import { insertUser, type UserRecord } from './users'

export type InviteKind = 'single' | 'multi'
export type InviteState = 'usable' | 'expired' | 'revoked' | 'used-up'

export interface AdminInvite {
  id: string
  name: string
  kind: InviteKind
  expiresAt: Date
  state: InviteState
  signups: number
  createdAt: Date
  createdBy: { id: string; name: string }
}

/** 가입 · 만들기가 못 쓰는 링크를 만났다 — 라우트가 404 한 문장으로 옮긴다(머리말 «쓸 수 있는가»). */
export class InviteUnusableError extends Error {
  constructor() {
    super('초대 링크를 쓸 수 없습니다')
    this.name = 'InviteUnusableError'
  }
}

/** 상태 — 거둠이 먼저, 그다음 다 씀, 그다음 만료. 만든 사람의 지금 권한은 상태로 안 낸다(거두기가 함께 돈다). */
const STATE_SQL = sql<InviteState>`case
  when i.revoked_at is not null then 'revoked'
  when i.kind = 'single' and (select count(*) from users u where u.invite_id = i.id) > 0 then 'used-up'
  when i.expires_at <= statement_timestamp() then 'expired'
  else 'usable' end`

/** 목록 · 만들기 · 거두기 응답의 한 줄을 읽는다. */
function inviteRows(db: DbHandle) {
  return db
    .selectFrom('invites as i')
    .innerJoin('users as maker', 'maker.id', 'i.created_by')
    .select([
      'i.id',
      'i.name',
      'i.kind',
      'i.expires_at as expiresAt',
      STATE_SQL.as('state'),
      sql<string>`(select count(*) from users u where u.invite_id = i.id)`.as('signups'),
      'i.created_at as createdAt',
      'maker.id as makerId',
      'maker.name as makerName',
    ])
}

type InviteRow = Awaited<ReturnType<ReturnType<typeof inviteRows>['executeTakeFirstOrThrow']>>

function toInvite(row: InviteRow): AdminInvite {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    expiresAt: row.expiresAt,
    state: row.state,
    signups: Number(row.signups),
    createdAt: row.createdAt,
    createdBy: { id: row.makerId, name: row.makerName },
  }
}

/** 초대 목록 — 최신이 위. 원문 · 해시는 없다. */
export async function listInvites(db: DbHandle): Promise<AdminInvite[]> {
  const rows = await inviteRows(db).orderBy('i.created_at', 'desc').orderBy('i.id', 'desc').execute()
  return rows.map(toInvite)
}

export async function findInvite(db: DbHandle, inviteId: string): Promise<AdminInvite | null> {
  const row = await inviteRows(db).where('i.id', '=', inviteId).executeTakeFirst()
  return row === undefined ? null : toInvite(row)
}

/** 링크를 만든다 — 원문은 돌려주는 값에만 있다. */
export async function createInvite(
  trx: DbHandle,
  input: { name: string; kind: InviteKind; expiresAt: Date; createdBy: string },
): Promise<{ id: string; token: string }> {
  const token = randomTokenValue()
  const row = await trx
    .insertInto('invites')
    .values({
      name: input.name,
      kind: input.kind,
      token_hash: hashTokenValue(token),
      expires_at: input.expiresAt,
      created_by: input.createdBy,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id, token }
}

/**
 * 링크 하나를 거둔다. 없으면 `null`, 이미 못 쓰는 링크(만료 · 거둠 · 다 씀)면 `'unusable'`. 그 행을 `FOR UPDATE` 로 잡고 상태를 본 뒤
 * 고친다 — 같은 링크로 도는 가입과 그 행에서 줄을 선다.
 */
export async function revokeInvite(trx: DbHandle, inviteId: string): Promise<'revoked' | 'unusable' | null> {
  assertLocking(trx, 'revokeInvite')
  const locked = await trx.selectFrom('invites').select('id').where('id', '=', inviteId).forUpdate().executeTakeFirst()
  if (locked === undefined) return null
  const row = await inviteRows(trx).where('i.id', '=', inviteId).executeTakeFirstOrThrow()
  if (row.state !== 'usable') return 'unusable'
  await trx
    .updateTable('invites')
    .set({ revoked_at: sql<Date>`clock_timestamp()` })
    .where('id', '=', inviteId)
    .execute()
  return 'revoked'
}

/**
 * **그 사람이 만든 아직 쓸 수 있는 링크를 거둔다** — 비활성화 · 관리자 해제가 같은 트랜잭션에서 부른다(spec «비활성화 · 관리자 해제는 그
 * 사람이 만든 … 링크를 … 거둔다»). 거둔 수를 낸다. 부르는 쪽이 그 사람의 사용자 행을 먼저 잡았다(머리말 «잠금»).
 */
export async function revokeInvitesBy(trx: DbHandle, userId: string): Promise<number> {
  assertLocking(trx, 'revokeInvitesBy')
  const rows = await trx
    .updateTable('invites as i')
    .set({ revoked_at: sql<Date>`clock_timestamp()` })
    .where('i.created_by', '=', userId)
    .where(sql<boolean>`${STATE_SQL} = 'usable'`)
    .returning('i.id')
    .execute()
  return rows.length
}

/** 원문으로 링크를 찾아 **지금 쓸 수 있으면** 그 id. 잠그지 않는다 — 가입이 scrypt 를 돌기 전에 못 쓰는 링크를 거른다. */
export async function findUsableInvite(db: DbHandle, token: string): Promise<string | null> {
  const row = await db
    .selectFrom('invites as i')
    .innerJoin('users as maker', 'maker.id', 'i.created_by')
    .select(['i.id', STATE_SQL.as('state'), 'maker.is_instance_admin as makerAdmin', 'maker.deactivated_at as makerOff'])
    .where('i.token_hash', '=', hashTokenValue(token))
    .executeTakeFirst()
  if (row === undefined || row.state !== 'usable' || !row.makerAdmin || row.makerOff !== null) return null
  return row.id
}

export interface InviteSignup {
  inviteId: string
  inviteName: string
  createdBy: string
  user: UserRecord
}

/**
 * **링크로 계정을 만든다** — 링크 행 `FOR UPDATE` → 쓸 수 있는지(머리말 «쓸 수 있는가») → 사용자 삽입(`invite_id`). 못 쓰면
 * `InviteUnusableError`, 이메일이 있으면 `DuplicateEmailError`(`insertUser`). 기록 · 세션은 부르는 쪽이 같은 트랜잭션에서 남긴다.
 */
export async function signupWithInvite(
  trx: DbHandle,
  input: { token: string; email: string; name: string; passwordHash: string },
): Promise<InviteSignup> {
  assertLocking(trx, 'signupWithInvite')
  const invite = await trx
    .selectFrom('invites')
    .select(['id', 'name', 'created_by'])
    .where('token_hash', '=', hashTokenValue(input.token))
    .forUpdate()
    .executeTakeFirst()
  if (invite === undefined) throw new InviteUnusableError()
  // 잡은 **뒤** 새 문장으로 본다 — 기다리는 동안 앞 가입이 커밋됐으면 이 읽기가 그 사람을 센다(머리말 «잠금»).
  const state = await trx
    .selectFrom('invites as i')
    .innerJoin('users as maker', 'maker.id', 'i.created_by')
    .select([STATE_SQL.as('state'), 'maker.is_instance_admin as makerAdmin', 'maker.deactivated_at as makerOff'])
    .where('i.id', '=', invite.id)
    .executeTakeFirstOrThrow()
  if (state.state !== 'usable' || !state.makerAdmin || state.makerOff !== null) throw new InviteUnusableError()
  const user = await insertUser(trx, { email: input.email, name: input.name, passwordHash: input.passwordHash, inviteId: invite.id })
  return { inviteId: invite.id, inviteName: invite.name, createdBy: invite.created_by, user }
}
