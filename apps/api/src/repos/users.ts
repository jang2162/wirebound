/**
 * 사용자 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * `findUserByEmail`은 이미 소문자로 정규화된 이메일을 받는다고 가정한다(정규화는
 * `routes/auth.ts`의 zod `.transform()`이 담당하고, 이 파일은 그 결과를 그대로 쓴다).
 */
import { sql } from 'kysely'
import { DatabaseError } from 'pg'
import { destroyUserSessions } from '../auth/session'
import { assertLocking } from '../db/locking'
import { withTransaction, type DbHandle } from '../db/tx'
import { recordAdminAction } from './admin-audit'
import { deleteAllUserTokens } from './api-tokens'
import { revokeInvitesBy } from './invites'
import { blockResetsBy, blockResetsFor } from './password-resets'

export interface UserRecord {
  id: string
  email: string
  name: string
}

/** Postgres 유니크 위반 SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * `0001-users-sessions` 마이그레이션이 `email` 컬럼에 `.unique()`로 건 제약의
 * 이름. Postgres가 단일 컬럼 유니크 제약에 붙이는 기본 명명 규칙(`<table>_<column>_key`)을
 * 그대로 따른다 — 실제 DB에서 `\d users`로 확인했다.
 *
 * 오늘은 `users`의 유니크 제약이 이거 하나뿐이라 `23505` 코드만 봐도 이메일 중복이라고
 * 단정할 수 있지만, 나중에 다른 컬럼(예: 소셜 로그인 provider id)에 유니크 제약이
 * 추가되면 코드만으로는 어느 제약이 걸렸는지 구분할 수 없다 — 그 삽입도 `23505`를
 * 내기 때문이다. 제약 이름까지 맞춰 봐야 "정말 이메일 중복이 맞다"를 보장한다.
 */
const USERS_EMAIL_UNIQUE_CONSTRAINT = 'users_email_key'

/** 이메일이 이미 등록돼 있을 때 `insertUser`가 던진다. 라우트가 postgres 에러 코드를 직접 알 필요가 없도록 여기서 감싼다. */
export class DuplicateEmailError extends Error {
  constructor() {
    super('이미 가입된 이메일입니다')
    this.name = 'DuplicateEmailError'
  }
}

function isEmailUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === UNIQUE_VIOLATION && error.constraint === USERS_EMAIL_UNIQUE_CONSTRAINT
}

/**
 * 이메일로 사용자를 찾는다. `password_hash`까지 포함해 돌려준다 — 로그인 라우트가
 * 그 값을 그대로 `verifyPassword`에 넘겨야 하기 때문이다. (세션 조회 경로인
 * `resolveSession`은 반대로 해시를 절대 select하지 않는다 — 그쪽은 이미 인증된
 * 사용자를 다시 확인할 뿐 비밀번호를 검증할 필요가 없다.)
 */
export async function findUserByEmail(
  db: DbHandle,
  email: string,
): Promise<(UserRecord & { passwordHash: string; active: boolean }) | null> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'password_hash as passwordHash', 'deactivated_at as deactivatedAt'])
    .where('email', '=', email)
    .executeTakeFirst()

  if (row === undefined) return null
  return { id: row.id, email: row.email, name: row.name, passwordHash: row.passwordHash, active: row.deactivatedAt === null }
}

/**
 * 사용자를 만든다. 조회 후 삽입하지 않는다 — 그 사이에 경합이 생기면 유니크 위반이
 * 조회를 통과한 뒤에도 날 수 있다. 대신 삽입을 바로 시도하고, `email` 유니크 제약
 * 위반이면 `DuplicateEmailError`로 바꿔 던진다.
 *
 * `withTransaction`으로 감싼다 — 이 삽입 하나가 실패해도(유니크 위반) 그 실패가
 * 이 문장 안에서 회복되고, 이 함수를 호출한 바깥 트랜잭션(실제 요청이든 테스트
 * 하네스의 트랜잭션이든)은 계속 정상 상태로 남는다. 감싸지 않으면 Postgres가
 * 그 바깥 트랜잭션 전체를 aborted로 만들어, 이후의 모든 쿼리가 내용과 무관하게
 * `25P02`로 실패한다(`src/db/tx.ts` 참고).
 */
export async function insertUser(
  db: DbHandle,
  input: { email: string; name: string; passwordHash: string; isInstanceAdmin?: boolean; inviteId?: string },
): Promise<UserRecord> {
  try {
    return await withTransaction(db, (trx) =>
      trx
        .insertInto('users')
        .values({
          email: input.email,
          name: input.name,
          password_hash: input.passwordHash,
          is_instance_admin: input.isInstanceAdmin ?? false,
          invite_id: input.inviteId ?? null,
        })
        .returning(['id', 'email', 'name'])
        .executeTakeFirstOrThrow(),
    )
  } catch (error) {
    if (isEmailUniqueViolation(error)) {
      throw new DuplicateEmailError()
    }
    throw error
  }
}

/**
 * 그 사용자의 비밀번호 해시를 바꾼다(`POST /api/auth/password`). 그 행이 없으면 `false`. `UPDATE` 는 사용자 행을 잡는다 — 같은
 * 사람의 비밀번호 바꾸기 둘이 여기서 줄을 선다(차례의 까닭은 `routes/auth.ts` 의 `/password`).
 */
export async function setPasswordHash(db: DbHandle, userId: string, passwordHash: string): Promise<boolean> {
  const updated = await db
    .updateTable('users')
    .set({ password_hash: passwordHash })
    .where('id', '=', userId)
    .returning('id')
    .executeTakeFirst()
  return updated !== undefined
}

/**
 * 주어진 id 중 **실제로 있는 것**만 낸다(복원이 부른다).
 *
 * 복원은 payload의 코멘트를 되살릴 때 `author_id`를 그대로 쓰는데, 그 컬럼이
 * `ON DELETE RESTRICT`라(0008) 없는 사용자로 삽입하면 `23503`이고 그것은 `pg`의 raw
 * 예외이므로 **500**이 된다. 먼저 세어 400/409로 옮기는 것이 이 함수의 쓸모다.
 *
 * **오늘 그 상태에 도달하는 경로는 0건이다** — `deleteFrom('users')`가 `src/` 전체에
 * 없다(이 파일에도 없다: `findUserByEmail`·`insertUser`뿐이다). 그래도 두는 이유는
 * `services/restore.ts`의 6단계 주석에 있다: **payload는 이 표의 오늘 보장보다 오래 산다.**
 *
 * `ids`가 비어 있으면 질의를 돌지 않는다 — Kysely의 `in []`은 `false`로 컴파일되어
 * 결과는 같지만, 왕복을 하나 아끼고 *"물어볼 것이 없다"*를 코드가 말하게 한다.
 */
export async function countExistingUsers(db: DbHandle, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db.selectFrom('users').select('id').where('id', 'in', ids).execute()
  return rows.map((row) => row.id)
}

/** 관리자 쓰기가 잡은 사용자 행의 지금 값. */
export interface LockedUser {
  id: string
  email: string
  name: string
  isInstanceAdmin: boolean
  active: boolean
}

/**
 * **관리자 쓰기의 첫 잠금 — 사용자 행들을 id 순으로.** 고치는 행은 `'update'`(`FOR NO KEY UPDATE`), 그대로 있어야 하는 행은 `'share'`
 * (`FOR SHARE`)다. 같은 id 가 둘이면 센 쪽을 잡는다. 없는 id 는 결과에 없다.
 *
 * **id 순인 까닭** — 관리자 둘이 서로를 해제 · 비활성화하면 둘 다 «요청자 행 + 대상 행» 을 잡는다. 요청자부터 잡으면 «A: A → B · B: B →
 * A» 로 고리다. id 순이면 둘이 같은 행에서 줄을 서고, 뒤 요청은 앞 커밋 뒤의 값을 본다(재확인이 403 · 대상이 이미 바뀌어 409).
 *
 * **사용자 행이 관리자 쓰기의 첫 잠금이다** — 재확인(`auth/admin.ts` 의 `recheckInstanceAdmin`)이 «사용자 행 → 자격» 이고, 비밀번호
 * 바꾸기 · 재설정이 «사용자 행 → 세션» 이다. 그 뒤에 링크 · 세션 · 토큰 · 프로젝트 행을 잡는다. 링크를 잡는 쓰기(가입 · 거두기 · 재설정
 * 쓰기)는 만든 사람의 행을 잠그지 않고 읽는다(`repos/invites.ts` · `repos/password-resets.ts` 머리말 «잠금»).
 *
 * **`FOR UPDATE` 가 아니라 `FOR NO KEY UPDATE` 다** — 그 사람이 낸 편집 · 코멘트의 FK 검사(`KEY SHARE`)와 안 부딪혀, 비활성화가 그 사람의
 * 진행 중인 쓰기를 사용자 행에서 기다리지 않는다(세션 `DELETE` 에서 기다린다 — 그 쓰기가 사용자 행을 기다리지 않으니 고리가 없다).
 */
export async function lockUserRows(trx: DbHandle, rows: { id: string; mode: 'update' | 'share' }[]): Promise<Map<string, LockedUser>> {
  assertLocking(trx, 'lockUserRows')
  const modes = new Map<string, 'update' | 'share'>()
  for (const row of rows) modes.set(row.id, modes.get(row.id) === 'update' ? 'update' : row.mode)
  const locked = new Map<string, LockedUser>()
  for (const id of [...modes.keys()].sort()) {
    const query = trx
      .selectFrom('users')
      .select(['id', 'email', 'name', 'is_instance_admin as isInstanceAdmin', 'deactivated_at as deactivatedAt'])
      .where('id', '=', id)
    const row = await (modes.get(id) === 'update' ? query.forNoKeyUpdate() : query.forShare()).executeTakeFirst()
    if (row !== undefined) {
      locked.set(id, {
        id: row.id,
        email: row.email,
        name: row.name,
        isInstanceAdmin: row.isInstanceAdmin,
        active: row.deactivatedAt === null,
      })
    }
  }
  return locked
}

/** 그 사람이 만든 아직 쓸 수 있는 링크(초대 · 재설정)를 거둔다 — 비활성화 · 관리자 해제. 거둔 수. */
async function revokeLinksMadeBy(trx: DbHandle, userId: string): Promise<number> {
  return (await revokeInvitesBy(trx, userId)) + (await blockResetsBy(trx, userId))
}

/**
 * **관리자 표시를 바꾼다 — 지정 · 해제의 몸통**(API `routes/admin-users.ts` 와 명령 `db/admin.ts` 가 함께 부른다). 부르는 쪽이 대상 행을
 * `lockUserRows` 로 `'update'` 로 잡고 조건(활성 · 이미 그 값 아님)을 봤다. 해제면 그 사람이 만든 쓸 수 있는 링크를 거둔다. 기록을 남긴다
 * (`actorId` 가 `null` 이면 서버 명령). 거둔 링크 수를 낸다.
 */
export async function applyInstanceAdmin(
  trx: DbHandle,
  target: LockedUser,
  value: boolean,
  actorId: string | null,
): Promise<{ revokedLinks: number }> {
  assertLocking(trx, 'applyInstanceAdmin')
  await trx.updateTable('users').set({ is_instance_admin: value }).where('id', '=', target.id).execute()
  const revokedLinks = value ? 0 : await revokeLinksMadeBy(trx, target.id)
  await recordAdminAction(trx, {
    action: value ? 'admin.grant' : 'admin.revoke',
    actorId,
    targetUserId: target.id,
    detail: { targetName: target.name, targetEmail: target.email, ...(value ? {} : { revokedLinks }) },
  })
  return { revokedLinks }
}

/**
 * 인스턴스 관리자 표시를 바꾼다(`db/admin.ts` 명령). 이메일은 정규화된 값을 받는다(`findUserByEmail` 과 같다).
 *
 * **한 트랜잭션 — 그 행을 `FOR NO KEY UPDATE` 로 잡고 바꾼다**(`applyInstanceAdmin`). 관리자 쓰기가 커밋 직전에 `FOR SHARE` 로 다시 읽는 것
 * (`auth/admin.ts` 의 `recheckInstanceAdmin`)과 줄을 선다 — 강등이 먼저 커밋되면 그 쓰기는 거짓을 읽고 되돌아간다. 해제는 API 와 같이 그
 * 사람의 링크를 거두고, 둘 다 기록에 «서버 명령» 으로 남는다. 비활성 계정은 지정하지 않는다(`'inactive'`).
 */
export async function setInstanceAdmin(
  db: DbHandle,
  email: string,
  value: boolean,
): Promise<'changed' | 'unchanged' | 'missing' | 'inactive'> {
  return withTransaction(db, async (trx) => {
    const found = await trx.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst()
    if (found === undefined) return 'missing'
    const target = (await lockUserRows(trx, [{ id: found.id, mode: 'update' }])).get(found.id)
    if (target === undefined) return 'missing'
    if (target.isInstanceAdmin === value) return 'unchanged'
    if (value && !target.active) return 'inactive'
    await applyInstanceAdmin(trx, target, value, null)
    return 'changed'
  })
}

/**
 * **비활성화의 몸통** — 부르는 쪽(`routes/admin-users.ts`)이 대상 행을 `'update'` 로 잡고(`lockUserRows`) 조건을 봤다. 표시를 세우고
 * 관리자 표시를 지우고(spec «비활성화하면 관리자 표시도 지운다»), 그 사람이 만든 링크를 거두고, 그 사람에게 만든 재설정 링크를 막고,
 * 세션 · API 토큰을 전부 지운다. 지운 세션 id 를 낸다 — 커밋 뒤 부르는 쪽이 그 WS 를 닫는다(`ws/notify.ts` 의 `closeSessionConnections`).
 *
 * **세션 · 토큰은 사용자 행 뒤다**(`lockUserRows` 머리말). 토큰은 id 순으로 잡는다 — 여러 토큰 행을 잡는 다른 자리(전부 폐기 · 프로젝트
 * 삭제 · 멤버 제거)와 같은 순서다(`repos/api-tokens.ts` 의 `deleteAllUserTokens`).
 */
export async function deactivateUser(
  trx: DbHandle,
  target: LockedUser,
  actorId: string,
): Promise<{ revokedLinks: number; endedSessions: string[] }> {
  assertLocking(trx, 'deactivateUser')
  await trx
    .updateTable('users')
    .set({ deactivated_at: sql<Date>`clock_timestamp()`, is_instance_admin: false })
    .where('id', '=', target.id)
    .execute()
  const revokedLinks = await revokeLinksMadeBy(trx, target.id)
  await blockResetsFor(trx, target.id)
  const endedSessions = await destroyUserSessions(trx, target.id)
  const tokens = await deleteAllUserTokens(trx, target.id)
  await recordAdminAction(trx, {
    action: 'user.deactivate',
    actorId,
    targetUserId: target.id,
    detail: {
      targetName: target.name,
      targetEmail: target.email,
      revokedLinks,
      sessions: endedSessions.length,
      tokens,
      ...(target.isInstanceAdmin ? { wasAdmin: true } : {}),
    },
  })
  return { revokedLinks, endedSessions }
}

/** **다시 활성화** — 표시만 지운다. 비밀번호 · 관리자 표시는 그대로다(관리자는 비활성화가 이미 지웠다). 부르는 쪽이 대상 행을 잡았다. */
export async function activateUser(trx: DbHandle, target: LockedUser, actorId: string): Promise<void> {
  assertLocking(trx, 'activateUser')
  await trx.updateTable('users').set({ deactivated_at: null }).where('id', '=', target.id).execute()
  await recordAdminAction(trx, {
    action: 'user.activate',
    actorId,
    targetUserId: target.id,
    detail: { targetName: target.name, targetEmail: target.email },
  })
}

/**
 * 관리자 화면의 사용자 한 줄. `lastSeenAt` 은 `users.last_seen_at` 과 그 사람의 세션 `last_seen_at` 중 늦은 것이다 — 사용자 행은 세션
 * 조회가 묶어서(1 분에 한 번) 고치므로(`auth/session.ts` 의 `resolveSession`) 살아 있는 세션의 값이 더 늦을 수 있다.
 */
export interface AdminUserRecord {
  id: string
  email: string
  name: string
  isInstanceAdmin: boolean
  active: boolean
  createdAt: Date
  lastSeenAt: Date | null
  projectCount: number
  invite: { id: string; name: string } | null
}

function adminUserRows(db: DbHandle) {
  return db
    .selectFrom('users as u')
    .leftJoin('invites as i', 'i.id', 'u.invite_id')
    .select([
      'u.id',
      'u.email',
      'u.name',
      'u.is_instance_admin as isInstanceAdmin',
      'u.deactivated_at as deactivatedAt',
      'u.created_at as createdAt',
      sql<Date | null>`greatest(u.last_seen_at, (select max(s.last_seen_at) from sessions s where s.user_id = u.id))`.as('lastSeenAt'),
      sql<string>`(select count(*) from project_members m where m.user_id = u.id)`.as('projectCount'),
      'i.id as inviteId',
      'i.name as inviteName',
    ])
}

type AdminUserRow = Awaited<ReturnType<ReturnType<typeof adminUserRows>['executeTakeFirstOrThrow']>>

function toAdminUser(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isInstanceAdmin: row.isInstanceAdmin,
    active: row.deactivatedAt === null,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    projectCount: Number(row.projectCount),
    invite: row.inviteId === null || row.inviteName === null ? null : { id: row.inviteId, name: row.inviteName },
  }
}

/** 사용자 전부 — 가입 차례(먼저 만든 사람이 위). 비밀번호 해시는 없다. */
export async function listAdminUsers(db: DbHandle): Promise<AdminUserRecord[]> {
  const rows = await adminUserRows(db).orderBy('u.created_at', 'asc').orderBy('u.id', 'asc').execute()
  return rows.map(toAdminUser)
}

export async function findAdminUser(db: DbHandle, userId: string): Promise<AdminUserRecord | null> {
  const row = await adminUserRows(db).where('u.id', '=', userId).executeTakeFirst()
  return row === undefined ? null : toAdminUser(row)
}

/**
 * 그 사용자가 지금 인스턴스 관리자인가. 없는 사용자는 `false`. **요청마다 부른다** — 세션에 얼려 두면 강등이 그 세션이 끝날
 * 때까지 안 먹는다. `lock: 'share'` 는 커밋 직전 재확인이 쓴다(`setInstanceAdmin` 의 머리말).
 */
export async function isInstanceAdmin(db: DbHandle, userId: string, lock?: 'share'): Promise<boolean> {
  let query = db.selectFrom('users').select('is_instance_admin').where('id', '=', userId)
  if (lock === 'share') query = query.forShare()
  const row = await query.executeTakeFirst()
  return row?.is_instance_admin ?? false
}

/** 인스턴스 관리자 이메일 전부 — 이메일의 코드 포인트 순이다(콜레이션에 안 기댄다 · 출력이 기계마다 같다). */
export async function listInstanceAdmins(db: DbHandle): Promise<string[]> {
  const rows = await db.selectFrom('users').select('email').where('is_instance_admin', '=', true).execute()
  return rows.map((row) => row.email).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
