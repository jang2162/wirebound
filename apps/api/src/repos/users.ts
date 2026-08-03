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

/**
 * Postgres 유니크 위반 SQLSTATE. `users` 테이블에 있는 유니크 제약은 `email` 하나뿐이므로
 * (`id`는 PK지만 서버가 만드는 uuid라 현실적으로 충돌하지 않는다), 삽입 중 이 코드가
 * 나타나면 곧 이메일 중복이라고 봐도 된다.
 */
const UNIQUE_VIOLATION = '23505'

/** 이메일이 이미 등록돼 있을 때 `insertUser`가 던진다. 라우트가 postgres 에러 코드를 직접 알 필요가 없도록 여기서 감싼다. */
export class DuplicateEmailError extends Error {
  constructor() {
    super('이미 가입된 이메일입니다')
    this.name = 'DuplicateEmailError'
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === UNIQUE_VIOLATION
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
    if (isUniqueViolation(error)) {
      throw new DuplicateEmailError()
    }
    throw error
  }
}
