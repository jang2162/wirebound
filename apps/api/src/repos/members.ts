/**
 * 프로젝트 멤버 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/members.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 */
import { DatabaseError } from 'pg'
import { withTransaction, type DbHandle } from '../db/tx'
import { deleteMemberTokens, deleteStaleMemberTokens, lockMemberTokens } from './api-tokens'
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
  return error instanceof DatabaseError && error.code === UNIQUE_VIOLATION && error.constraint === PROJECT_MEMBERS_PK_CONSTRAINT
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
 *
 * **요청한 사람의 역할도 이 잠금 뒤에 다시 본다 — 자격은 이 잠금 앞이다**(`OwnerRecheck`의 «잠금 순서»). 가드는 이 잠금
 * **앞**에서 읽었으므로, 다른 owner 가 요청한 사람을 내리는 쓰기가 먼저 이 행들을 쥐었으면 그 커밋 뒤에 여기 서는 요청은
 * **이미 owner 가 아닌 사람**의 것이다.
 *
 * **프로젝트 삭제도 이 함수로 owner 행을 잡는다**(`routes/projects.ts` — 페이지 뒤 · 재확인 앞). 같은 함수라 같은 문장 · 같은 순서(힙
 * 순서)다 — **`ORDER BY`를 달지 않는다**: `test/guard-in-lock.test.ts`의 F3 · F3′가 «넣은 순서로 잡는다»에 기대 고리를 세우므로, 순서를
 * `user_id`로 바꾸면 그 두 판이 uuid 에 따라 뜻한 순서를 못 세운다(고친 순서를 재는 케이스도 없다). 삭제는 재확인에서
 * 삭제자의 멤버 행을 `FOR SHARE`로 쥐고 CASCADE 에서 멤버 행 전부를 지우므로, 삭제가 이것 없이 재확인부터 하면 **먼저 들어온
 * owner 가 쓰고 나중 owner 가 지우는** 판에서 쓰기는 자기 행을 쥔 채 삭제자 행에 서고 CASCADE 는 그 쥔 행에 서서 교착이다 — [api]
 * 두 요청을 −2…+4ms 간격으로 280 라운드(역할 변경 · 제거 넷을 돌려 가며): 교착 32 · 500 32(재는 자: `test/guard-in-lock.test.ts`의
 * «E12»). 같은 함수 · 같은 순서로 잡으면 owner 행에서 먼저 잡은 쪽이 이기고, 진 쪽은 아무것도 안 쥔 채 선다. **멤버 쓰기의 첫 잠금을
 * 프로젝트 행(`lockProjectShared`)으로 두어 닫지 않는 까닭** — 그러면 멤버 수정 · 삭제가 복원 · 삭제가 쥔 프로젝트 행 뒤에 서서, 복원이
 * 도는 동안 회수가 서지 않는다(`test/restore-lock-census.test.ts`의 «막히지 않는 줄의 목록이 고정돼 있다»).
 */
export async function lockOwnerIds(trx: DbHandle, projectId: string): Promise<Set<string>> {
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
 * **이미 멤버인지 먼저 읽고, 멤버면 토큰을 건드리지 않고 409 다**(`DuplicateMemberError`). 아래 토큰 지우기는 행을 `FOR UPDATE`로
 * 잡으므로, 읽지 않고 곧장 지우면 이미 멤버인 사람의 다시 넣기가 그 사람의 토큰으로 도는 요청을 기다린 뒤에야 PK 위반으로 409 가
 * 되고, 잡은 동안은 그 토큰의 요청(인증의 `last_used_at` 갱신)을 세운다 — [api] 토큰으로 역할을 바꾸는 쓰기가 owner 행 줄에 선
 * 동안 그 사람을 다시 넣으면 1s 안에 안 끝났다(고치기 전) → 곧바로 409.
 *
 * **읽기는 잠그지 않는다** — 새 잠금이 없으니 새 고리도 없다. 읽은 뒤 · 넣기 전에 다른 초대가 끼면 삽입의 복합 PK 위반이 여전히
 * 409 로 잡는다(아래 `catch`). 대가: 그 사람을 빼는 제거가 도는 중이면 제거가 커밋하기 전의 판을 읽어 409 다(다시 보내면 201 —
 * 읽지 않던 판은 토큰 행에서 제거를 기다린 뒤 201 이었다). 잰 값은 `test/guard-in-lock.test.ts`의 «이미 멤버인 사람을 다시 넣으면».
 * `withTransaction`으로 감싸 PK 위반이 호출자의 트랜잭션(실제 요청이든 테스트 하네스든) 전체를 오염시키지 않게 한다
 * (`src/db/tx.ts` 참고).
 *
 * **넣기 전에 그 사람의 이 프로젝트 토큰을 지운다**(`deleteStaleMemberTokens`) — 멤버가 아닌 사람은 토큰을 못 만들므로(발급이 커밋
 * 순간 멤버 행을 재확인한다 — `routes/tokens.ts`) 지금 남은 것은 **앞 멤버십의 것**이다. 제거가 지우지만 발급하자마자 쓰는 요청과
 * 겹친 토큰은 건너뛴다(`api-tokens.ts`의 `deleteMemberTokens` «`SKIP LOCKED`») — 남겨 두면 다시 넣는 순간 되살아난다. [api] 그
 * 판을 세운 뒤 다시 넣으면 남은 토큰의 읽기 · 쓰기가 200(고치기 전) → 인증 401.
 */
export async function insertMember(
  db: DbHandle,
  projectId: string,
  user: { id: string; email: string; name: string },
  role: ProjectRole,
): Promise<MemberRecord> {
  try {
    return await withTransaction(db, async (trx) => {
      const existing = await trx
        .selectFrom('project_members')
        .select('user_id')
        .where('project_id', '=', projectId)
        .where('user_id', '=', user.id)
        .executeTakeFirst()
      if (existing !== undefined) throw new DuplicateMemberError()
      await deleteStaleMemberTokens(trx, projectId, user.id)
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
 * 멤버 쓰기(역할 변경 · 제거)가 요청한 사람을 다시 보는 자리 — 부르는 쪽(`routes/members.ts`)이 `auth/roles.ts`의
 * `memberWriteRecheck`를 넘긴다. **자격과 역할을 나눠 부른다.** 거절은 던진다(자격이 죽었으면 401 · 역할이 모자라면 403 ·
 * 멤버가 아니면 404).
 *
 * ## 잠금 순서 — 자격 행 → owner 행 → 멤버 행
 *
 * **자격(세션 · 토큰 행 `KEY SHARE`)은 첫 잠금이다 — owner 행보다 먼저.** 멤버 제거는 빠지는 사람의 토큰 행을 owner 행보다 먼저
 * 잡는다(`removeMember`). 역할 변경이 owner 행을 쥔 **뒤에** 자기 토큰을 재확인하면, 그 토큰의 주인을 빼는 제거와 두 행을 반대
 * 순서로 잡는다 — [api] 밥(owner)이 **토큰으로** 캐럴의 역할을 바꾸거나 캐럴을 빼는 쓰기를 owner 행을 쥔 채 재확인 앞에 세우고
 * 앨리스가 밥을 빼면 교착 +1 · 한쪽 500. 같은 쓰기를 세션으로 내면 0 이다(세션 행은 제거가 안 잡는다). 프로젝트 삭제도 토큰
 * 행 전부를 owner 행 앞에서 잡으므로(`routes/projects.ts`) 토큰 역할 변경과 같은 고리였다. 재는 자: `test/guard-in-lock.test.ts`의
 * «토큰으로 낸 멤버 쓰기».
 *
 * **자격을 앞에서 봐도 판정은 커밋 순간의 것이다** — 그 행을 `KEY SHARE`로 잡은 채 커밋까지 쥐므로, 확인 뒤의 로그아웃 · 폐기는
 * 이 커밋을 기다린다(`auth/roles.ts`의 `recheckAtCommit` 머리말). 대가는 그 **기다림이 길어지는 것**이다: 이 쓰기가 owner 행을
 * 기다리는 동안에도 자격 행을 쥐므로, 그 사이의 로그아웃 · 폐기 · 그 사람을 빼는 제거가 owner 행 대기만큼 더 선다(앞 판에서는
 * 그것들이 먼저 커밋하고 이 쓰기가 401 이었다).
 *
 * **역할은 owner 행을 잡은 뒤 · 쓰기 전에 본다.** 가드는 이 잠금 **앞**에서 읽었으므로, 다른 owner 가 요청한 사람을 내리는 쓰기가
 * 먼저 owner 행을 쥐었으면 그 커밋 뒤에 여기 서는 요청은 **이미 owner 가 아닌 사람**의 것이다. 다른 쓰기처럼 쓰기 **뒤에** 보면
 * owner 가 자기를 내리거나 빼는 정당한 요청이 자기 쓰기에 막힌다. 쓰기 전이어도 판정은 최종이다 — 요청한 사람이 owner 면 그 행은
 * `lockOwnerIds`가 이미 쥐어 커밋까지 아무도 못 바꾼다. 없으면(가드 뒤 강등 · 제거 — [api] A 가 B 를 내리는 요청과 B 가 C 를 owner
 * 로 올리는 요청을 함께 보내 30회 중 24회, B 가 내려간 뒤에 C 가 owner 가 됐다) 이미 owner 가 아닌 사람이 멤버를 바꾼다.
 */
export interface OwnerRecheck {
  /** 토큰으로 들어온 요청의 토큰 행 id(세션이면 `null`) — 제거가 빠지는 사람의 토큰과 한 문장으로 잡는다(`lockMemberTokens`). */
  tokenId: string | null
  /** 자격 행을 잡고 본다 — 첫 잠금(제거는 토큰 행 다음). */
  credential: (trx: DbHandle) => Promise<unknown>
  /** 역할을 본다 — owner 행을 잡은 뒤 · 쓰기 전. */
  role: (trx: DbHandle) => Promise<unknown>
}

/**
 * 멤버의 역할을 바꾼다. 대상이 멤버가 아니면 `null`을 돌려준다 — 호출자가 404로
 * 매핑한다.
 *
 * 마지막 owner 검사와 갱신은 **한 트랜잭션 안**에서, owner 행을 잠근 뒤 순서대로
 * 한다(`lockOwnerIds` 문서 참고). 대상이 owner인데 새 역할이 owner가 아니고,
 * 잠근 owner 집합이 대상 하나뿐이면(`size <= 1`) 갱신 전에 `LastOwnerError`를
 * 던진다 — 갱신문을 먼저 날려보고 결과를 되돌리는 방식이 아니다: 이 검사부터
 * 갱신까지 같은 트랜잭션·같은 잠금 아래서 끊기지 않아야 경합 시나리오(설계서 「권한 모델」)가
 * 실제로 막힌다.
 */
export async function updateMemberRole(
  db: DbHandle,
  projectId: string,
  userId: string,
  role: ProjectRole,
  recheck: OwnerRecheck,
): Promise<MemberRecord | null> {
  return withTransaction(db, async (trx) => {
    // 자격 → owner 행 → 역할(`OwnerRecheck`의 «잠금 순서»).
    await recheck.credential(trx)
    const ownerIds = await lockOwnerIds(trx, projectId)
    await recheck.role(trx)

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

    const user = await trx.selectFrom('users').select(['email', 'name']).where('id', '=', userId).executeTakeFirstOrThrow()

    return { userId, email: user.email, name: user.name, role, invitedAt: updated.invited_at }
  })
}

/**
 * 멤버를 제거한다. 대상이 멤버가 아니면 `'not-member'`를 돌려준다(호출자가 404로
 * 매핑한다). 마지막 owner 검사는 `updateMemberRole`과 완전히 같은 방식(같은
 * 트랜잭션 안에서 `lockOwnerIds`로 owner 행을 먼저 잠근 뒤 판단)이다 — 강등과
 * 제거 두 경로가 같은 불변식을 같은 방법으로 지킨다. 요청한 사람의 권한도 같은 자리에서 본다(`OwnerRecheck`).
 */
export async function removeMember(
  db: DbHandle,
  projectId: string,
  userId: string,
  recheck: OwnerRecheck,
): Promise<'removed' | 'not-member'> {
  return withTransaction(db, async (trx) => {
    // **토큰 행이 첫 잠금이다** — 빠지는 사람의 이 프로젝트 토큰과 요청의 토큰(토큰 요청이면)을 한 문장으로 id 순
    // (`repos/api-tokens.ts`의 `lockMemberTokens`). 지우는 것은 멤버 행을 지운 뒤다(`deleteMemberTokens`). 거절되면(마지막 owner ·
    // 재확인 · 멤버 아님) 트랜잭션째 되돌아가 토큰도 남는다.
    //
    // **owner 행보다 먼저인 까닭 — 토큰으로 쓰는 사람의 재확인은 «토큰 행(`KEY SHARE`) → 멤버 행(`SHARE`)» 순이다**
    // (`auth/roles.ts`의 `recheckAtCommit`). owner 행(`lockOwnerIds` — `FOR UPDATE`) 뒤에 잡으면, 빠지는 사람이 owner 이고
    // 그 토큰으로 쓰는 중일 때 그 쓰기는 토큰 행을 쥔 채 이 제거가 쥔 제 멤버 행을, 이 제거는 그 토큰 행을 기다린다.
    // 잰 값은 `test/guard-in-lock.test.ts`의 «멤버 제거가 토큰을 지운다».
    await lockMemberTokens(trx, projectId, userId, recheck.tokenId)
    // 자격 → owner 행 → 역할(`OwnerRecheck`의 «잠금 순서»). 토큰 요청이면 그 행은 위에서 이미 쥐었다.
    await recheck.credential(trx)
    const ownerIds = await lockOwnerIds(trx, projectId)
    await recheck.role(trx)

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

    await trx.deleteFrom('project_members').where('project_id', '=', projectId).where('user_id', '=', userId).execute()

    // **멤버 행을 지운 뒤에 지운다** — 이 제거가 도는 사이 발급된 토큰까지(`deleteMemberTokens`의 머리말).
    await deleteMemberTokens(trx, projectId, userId)

    return 'removed'
  })
}
