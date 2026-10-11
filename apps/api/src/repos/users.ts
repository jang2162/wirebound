/**
 * 사용자 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * `findUserByEmail`은 이미 소문자로 정규화된 이메일을 받는다고 가정한다(정규화는
 * `routes/auth.ts`의 zod `.transform()`이 담당하고, 이 파일은 그 결과를 그대로 쓴다).
 */
import { DatabaseError } from 'pg'
import { withTransaction, type DbHandle } from '../db/tx'

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
export async function findUserByEmail(db: DbHandle, email: string): Promise<(UserRecord & { passwordHash: string }) | null> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'password_hash as passwordHash'])
    .where('email', '=', email)
    .executeTakeFirst()

  return row ?? null
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
  input: { email: string; name: string; passwordHash: string; isInstanceAdmin?: boolean },
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

/**
 * 인스턴스 관리자 표시를 바꾼다(`db/admin.ts` 명령). 이메일은 정규화된 값을 받는다(`findUserByEmail` 과 같다).
 *
 * **바꾸는 것은 `UPDATE` 한 문장이다** — 그 행에 잠금을 잡아, 관리자 쓰기가 커밋 직전에 `FOR SHARE` 로 다시 읽는 것
 * (`auth/admin.ts` 의 `recheckInstanceAdmin`)과 줄을 선다. 강등이 먼저 커밋되면 그 쓰기는 거짓을 읽고 되돌아간다.
 */
export async function setInstanceAdmin(db: DbHandle, email: string, value: boolean): Promise<'changed' | 'unchanged' | 'missing'> {
  const changed = await db
    .updateTable('users')
    .set({ is_instance_admin: value })
    .where('email', '=', email)
    .where('is_instance_admin', '<>', value)
    .returning('id')
    .executeTakeFirst()
  if (changed !== undefined) return 'changed'
  const found = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst()
  return found === undefined ? 'missing' : 'unchanged'
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
