/**
 * 프로젝트 멤버 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/members.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 */
import { DatabaseError } from 'pg'
import { withTransaction, type DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'

export interface MemberRecord {
  userId: string
  email: string
  name: string
  role: ProjectRole
  invitedAt: Date
}

/** Postgres 유니크(PK 포함) 위반 SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * `0002-projects-members` 마이그레이션이 `project_members`에 건 복합 PK
 * (`project_id`, `user_id`) 제약의 이름. 마이그레이션에서
 * `.addPrimaryKeyConstraint('project_members_pk', ...)`로 직접 이름을 지정했으므로
 * `users`·`projects`의 유니크 제약처럼 Postgres 기본 명명 규칙을 추측할 필요가 없다.
 */
const PROJECT_MEMBERS_PK_CONSTRAINT = 'project_members_pk'

/** 이미 멤버인 사용자를 다시 초대하려 할 때 `insertMember`가 던진다. */
export class DuplicateMemberError extends Error {
  constructor() {
    super('이미 프로젝트 멤버입니다')
    this.name = 'DuplicateMemberError'
  }
}

/**
 * 마지막 owner를 강등·제거하려 할 때 `updateMemberRole`/`removeMember`가 던진다.
 * 자기 자신을 강등·제거하는 경우도 똑같이 이 에러가 난다 — 호출자가 누구인지는
 * 이 파일이 알지 못하고, 알 필요도 없다(그냥 "이 대상 행"의 갱신/삭제가 마지막
 * owner를 없애는지만 본다).
 */
export class LastOwnerError extends Error {
  constructor() {
    super('프로젝트에는 owner가 최소 한 명 있어야 합니다')
    this.name = 'LastOwnerError'
  }
}

function isMemberPkViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === UNIQUE_VIOLATION &&
    error.constraint === PROJECT_MEMBERS_PK_CONSTRAINT
  )
}

/**
 * 프로젝트의 owner 행을 `SELECT ... FOR UPDATE`로 잠그고 그 `user_id` 집합을 돌려준다.
 *
 * **마지막 owner 불변식을 지키는 두 경로(`updateMemberRole`의 강등, `removeMember`의
 * 제거)가 반드시 이 함수를 거쳐야 한다.** 그냥 `COUNT(*)`만 세면 두 owner가 동시에
 * 서로를 강등하는 경합에서 둘 다 "owner가 2명이니 안전하다"고 잘못 판단해 통과할
 * 수 있다 — 그 사이 커밋된 남의 갱신을 보지 못하기 때문이다. `FOR UPDATE`는 이
 * 함수가 조회한 owner 행들에 배타적 잠금을 걸어, 같은 프로젝트의 owner 행을 다시
 * 잠그려는 다른 트랜잭션(예: 서로를 강등하는 두 번째 요청)을 이 트랜잭션이
 * 커밋되거나 롤백될 때까지 블록시킨다. 블록이 풀리면 그 트랜잭션은 (이미 갱신된)
 * 최신 상태를 다시 읽으므로, 첫 번째 강등이 owner를 2명에서 1명으로 줄였다면
 * 두 번째 강등 시도는 "owner가 1명뿐"이라는 사실을 정확히 보고 거부된다.
 *
 * 호출자는 이미 `withTransaction` 안에서 이 함수를 불러야 한다 — 잠금은 트랜잭션이
 * 끝날 때(COMMIT/ROLLBACK, 또는 세이브포인트 RELEASE/ROLLBACK)까지만 유지된다.
 */
async function lockOwnerIds(trx: DbHandle, projectId: string): Promise<Set<string>> {
  const rows = await trx
    .selectFrom('project_members')
    .select('user_id')
    .where('project_id', '=', projectId)
    .where('role', '=', 'owner')
    .forUpdate()
    .execute()
  return new Set(rows.map((row) => row.user_id))
}

/**
 * 프로젝트의 멤버 목록을 이메일·이름과 함께 조회한다. `password_hash`는 애초에
 * select 절에 없다 — `auth/session.ts`의 `resolveSession`과 같은 이유로, 나중에
 * `users`에 컬럼이 늘어나도 `selectAll()`이 아니므로 실수로 민감한 값이 새지 않는다.
 *
 * `invited_at` 오름차순으로 정렬한다 — 먼저 초대된 멤버(대개 owner)가 먼저 보인다.
 */
export async function listMembers(db: DbHandle, projectId: string): Promise<MemberRecord[]> {
  return db
    .selectFrom('project_members')
    .innerJoin('users', 'users.id', 'project_members.user_id')
    .where('project_members.project_id', '=', projectId)
    .select([
      'users.id as userId',
      'users.email as email',
      'users.name as name',
      'project_members.role as role',
      'project_members.invited_at as invitedAt',
    ])
    .orderBy('project_members.invited_at', 'asc')
    .execute()
}

/**
 * 이미 가입한 사용자를 프로젝트 멤버로 추가한다. 호출자(`routes/members.ts`)가
 * `repos/users.ts`의 `findUserByEmail`로 먼저 사용자를 찾아 그 레코드를 넘긴다 —
 * 이 함수는 이메일을 모르고, "이미 가입한 사용자만 초대 대상"이라는 규칙도 몰라도 된다.
 *
 * 조회 후 삽입하지 않는다(`repos/users.ts`의 `insertUser`와 같은 이유) — 이미
 * 멤버인지는 삽입을 시도해 보고 복합 PK 위반으로 감지한다. `withTransaction`으로
 * 감싸 그 실패가 호출자의 트랜잭션(실제 요청이든 테스트 하네스든) 전체를
 * 오염시키지 않게 한다(`src/db/tx.ts` 참고).
 */
export async function insertMember(
  db: DbHandle,
  projectId: string,
  user: { id: string; email: string; name: string },
  role: ProjectRole,
): Promise<MemberRecord> {
  try {
    return await withTransaction(db, async (trx) => {
      const inserted = await trx
        .insertInto('project_members')
        .values({ project_id: projectId, user_id: user.id, role })
        .returning('invited_at')
        .executeTakeFirstOrThrow()

      return { userId: user.id, email: user.email, name: user.name, role, invitedAt: inserted.invited_at }
    })
  } catch (error) {
    if (isMemberPkViolation(error)) {
      throw new DuplicateMemberError()
    }
    throw error
  }
}

/**
 * 멤버의 역할을 바꾼다. 대상이 멤버가 아니면 `null`을 돌려준다 — 호출자가 404로
 * 매핑한다.
 *
 * 마지막 owner 검사와 갱신은 **한 트랜잭션 안**에서, owner 행을 잠근 뒤 순서대로
 * 한다(`lockOwnerIds` 문서 참고). 대상이 owner인데 새 역할이 owner가 아니고,
 * 잠근 owner 집합이 대상 하나뿐이면(`size <= 1`) 갱신 전에 `LastOwnerError`를
 * 던진다 — 갱신문을 먼저 날려보고 결과를 되돌리는 방식이 아니다: 이 검사부터
 * 갱신까지 같은 트랜잭션·같은 잠금 아래서 끊기지 않아야 경합 시나리오(설계 §10,
 * 태스크 11 브리프)가 실제로 막힌다.
 */
export async function updateMemberRole(
  db: DbHandle,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<MemberRecord | null> {
  return withTransaction(db, async (trx) => {
    const ownerIds = await lockOwnerIds(trx, projectId)

    const current = await trx
      .selectFrom('project_members')
      .select('role')
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!current) return null

    const wouldRemoveLastOwner = current.role === 'owner' && role !== 'owner' && ownerIds.size <= 1
    if (wouldRemoveLastOwner) {
      throw new LastOwnerError()
    }

    const updated = await trx
      .updateTable('project_members')
      .set({ role })
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId)
      .returning('invited_at')
      .executeTakeFirstOrThrow()

    const user = await trx
      .selectFrom('users')
      .select(['email', 'name'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()

    return { userId, email: user.email, name: user.name, role, invitedAt: updated.invited_at }
  })
}

/**
 * 멤버를 제거한다. 대상이 멤버가 아니면 `'not-member'`를 돌려준다(호출자가 404로
 * 매핑한다). 마지막 owner 검사는 `updateMemberRole`과 완전히 같은 방식(같은
 * 트랜잭션 안에서 `lockOwnerIds`로 owner 행을 먼저 잠근 뒤 판단)이다 — 강등과
 * 제거 두 경로가 같은 불변식을 같은 방법으로 지킨다.
 */
export async function removeMember(
  db: DbHandle,
  projectId: string,
  userId: string,
): Promise<'removed' | 'not-member'> {
  return withTransaction(db, async (trx) => {
    const ownerIds = await lockOwnerIds(trx, projectId)

    const current = await trx
      .selectFrom('project_members')
      .select('role')
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    if (!current) return 'not-member'

    const wouldRemoveLastOwner = current.role === 'owner' && ownerIds.size <= 1
    if (wouldRemoveLastOwner) {
      throw new LastOwnerError()
    }

    await trx
      .deleteFrom('project_members')
      .where('project_id', '=', projectId)
      .where('user_id', '=', userId)
      .execute()

    return 'removed'
  })
}
