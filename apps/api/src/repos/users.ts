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
  return (
    error instanceof DatabaseError &&
    error.code === UNIQUE_VIOLATION &&
    error.constraint === USERS_EMAIL_UNIQUE_CONSTRAINT
  )
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
): Promise<(UserRecord & { passwordHash: string }) | null> {
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
  input: { email: string; name: string; passwordHash: string },
): Promise<UserRecord> {
  try {
    return await withTransaction(db, (trx) =>
      trx
        .insertInto('users')
        .values({ email: input.email, name: input.name, password_hash: input.passwordHash })
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
