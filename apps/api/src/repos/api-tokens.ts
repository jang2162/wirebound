/**
 * `api_tokens` 테이블의 SQL. HTTP도 zod도 여기 없다 — 그것은 `routes/tokens.ts`다.
 *
 * **원문을 저장하지 않는다.** `insertApiToken`이 원문을 **만들어서 돌려주고** 표에는
 * sha256 hex만 넣는다(`auth/token-hash.ts` — `sessions`와 같은 함수). 그래서 **원문이 실릴
 * 수 있는 자리는 발급 응답 하나뿐이고**, 목록·조회는 그것을 낼 수단 자체가 없다.
 *
 * **역할을 담지 않는다.** 이 파일이 아는 것은 *"누가"*(`user_id`)와 *"어느
 * 프로젝트"*(`project_id`)뿐이다 — 역할 판정은 요청 시점에 `auth/roles.ts`가 한다.
 */
import { sql } from 'kysely'
import { hashTokenValue, randomTokenValue } from '../auth/token-hash'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'
import { withTransaction } from '../db/tx'

/** 목록·발급 응답이 나르는 한 줄. **원문도 해시도 없다.** */
export interface ApiTokenRecord {
  id: string
  projectId: string
  userId: string
  name: string
  createdAt: Date
  lastUsedAt: Date | null
}

/**
 * 인증 훅이 쓰는 조회 결과. 자격이 누구의 것이고 어느 프로젝트에 묶였는지만 든다.
 *
 * **`tokenName`이 여기 있는 이유는 설계서 「LLM 편집 경로」다** — `actor_label='<토큰명>'`이 설계가 정한 값이고
 * 그것을 아는 것은 서버뿐이다(`auth/actor.ts`). 이 필드가 없으면 그 문장이 참이 될 수 없다.
 */
export interface ApiTokenPrincipal {
  tokenId: string
  /** 발급 때 사람이 붙인 이름. **원문도 해시도 아니다** — `revisions.actor_label`이 될 값이다. */
  tokenName: string
  projectId: string
  user: { id: string; email: string; name: string }
}

interface ApiTokenRow {
  id: string
  project_id: string
  user_id: string
  name: string
  created_at: Date
  last_used_at: Date | null
}

function toRecord(row: ApiTokenRow): ApiTokenRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

/** 발급 결과. **`value`가 원문이고 이 반환값 밖으로 나가는 경로는 발급 응답 하나뿐이다.** */
export interface IssuedApiToken {
  record: ApiTokenRecord
  value: string
}

/**
 * 토큰 하나를 발급한다. 원문은 이 함수가 만들고 **표에는 해시만** 들어간다.
 *
 * `withTransaction`으로 감싸는 것은 `createSession`과 같은 이유다 — `token_hash`에 UNIQUE가
 * 걸려 있어 (천문학적으로 드물게) 충돌하면 유니크 위반이 나는데, 감싸지 않으면 그 실패가
 * 이 호출을 둘러싼 트랜잭션(테스트 하네스 포함) 전체를 오염시킨다.
 */
export async function insertApiToken(
  db: DbHandle,
  input: { projectId: string; userId: string; name: string },
): Promise<IssuedApiToken> {
  const value = randomTokenValue()

  const record = await withTransaction(db, async (trx) => {
    const inserted = await trx
      .insertInto('api_tokens')
      .values({
        project_id: input.projectId,
        user_id: input.userId,
        token_hash: hashTokenValue(value),
        name: input.name,
      })
      .returning(['id', 'project_id', 'user_id', 'name', 'created_at', 'last_used_at'])
      .executeTakeFirstOrThrow()

    return toRecord(inserted as ApiTokenRow)
  })

  return { record, value }
}

/**
 * 그 프로젝트에서 **그 사용자가 만든** 토큰 전부. 오래된 것이 먼저다(`listPresets`와 같은
 * 이유 — *"내가 어제 만든 것"*의 자리가 움직이지 않는다).
 *
 * **`userId`로 거르는 것이 계약이다**(`routes/tokens.ts`의 «목록·폐기는 자기 것만 본다» 절). 프로젝트 단위로 열면
 * viewer가 owner의 토큰 목록을 보고 지울 수 있다.
 */
export async function listApiTokens(db: DbHandle, projectId: string, userId: string): Promise<ApiTokenRecord[]> {
  const rows = await db
    .selectFrom('api_tokens')
    .select(['id', 'project_id', 'user_id', 'name', 'created_at', 'last_used_at'])
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute()

  return rows.map((row) => toRecord(row as ApiTokenRow))
}

/**
 * 토큰 하나를 폐기한다. 지운 것이 없으면 `false`(라우트가 404로 옮긴다).
 *
 * **`projectId`·`userId`를 조건에 함께 둔다** — 남의 토큰 id를 실은 요청이 통하면 안 된다.
 * id로 찾고 나서 비교하는 대신 질의 조건에 두는 것은 비교를 빠뜨린 판이 조용히 통과하기
 * 때문이다(`findPresetById`·`findSnapshotById`와 같다).
 */
export async function deleteApiToken(
  db: DbHandle,
  projectId: string,
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom('api_tokens')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .where('id', '=', tokenId)
    .executeTakeFirst()

  return (result.numDeletedRows ?? 0n) > 0n
}

/**
 * **멤버 제거의 첫 잠금** — 빠지는 사람의 그 프로젝트 토큰과, 토큰으로 들어온 요청이면 **그 요청의 토큰**을 한 문장으로 id 순
 * `FOR UPDATE`. 멤버 제거(`repos/members.ts`의 `removeMember`)가 owner 행보다 먼저 부르고, 지우는 것은 멤버 행을 지운 뒤의
 * `deleteMemberTokens`다.
 *
 * **여러 행을 잡는 두 트랜잭션은 같은 순서로 잡아야 서로를 기다리는 고리가 안 선다.** 같은 행들을 잡는 다른 자리는 프로젝트
 * 삭제의 `lockProjectTokens`(그 프로젝트 토큰 전부 · id 순)다. **요청의 토큰을 따로 잡으면 이 순서가 깨진다** — 자격 재확인은
 * 그 행을 `KEY SHARE`로 잡는데(`auth/roles.ts`의 `recheckAtCommit`), 빠지는 사람의 토큰과 요청의 토큰을 두 문장으로 잡으면
 * 앞 문장의 행을 쥔 채 뒤 문장의 행을 기다리고, 삭제는 id 순으로 잡다가 그 반대 쪽을 쥔 채 선다 — [api] 밥이 **토큰으로**
 * 캐럴을 빼는 제거를 owner 행 앞에 세워 둔 채 프로젝트를 지우면, 두 토큰의 id 순서 한쪽에서 교착 +1 · 삭제 500(재는 자:
 * `test/guard-in-lock.test.ts`의 «토큰으로 낸 멤버 쓰기»). 요청의 토큰이 이 문장에서 `FOR UPDATE`로 잡히므로 그 토큰의 다른
 * 요청은 이 제거가 끝날 때까지 인증(`last_used_at` 갱신)에서 기다린다 — 그 사람이 토큰으로 멤버를 빼는 동안뿐이다.
 */
export async function lockMemberTokens(trx: DbHandle, projectId: string, userId: string, requestTokenId: string | null): Promise<void> {
  assertLocking(trx, 'lockMemberTokens')
  await trx
    .selectFrom('api_tokens')
    .select('id')
    .where('project_id', '=', projectId)
    .where((eb) => (requestTokenId === null ? eb('user_id', '=', userId) : eb.or([eb('user_id', '=', userId), eb('id', '=', requestTokenId)])))
    .orderBy('id')
    .forUpdate()
    .execute()
}

/**
 * **멤버에서 빠지는 사람의 그 프로젝트 토큰을 지운다** — 멤버 제거(`repos/members.ts`의 `removeMember`)가 같은 트랜잭션에서
 * **멤버 행을 지운 뒤** 부른다. 남겨 두면 비멤버인 동안은 404 로 잠들었다가 **다시 멤버가 되는 순간 되살아난다** — 거둔 줄 안
 * 자격이 돌아온다. 그 사람의 다른 프로젝트 토큰은 안 건드린다(스코프가 프로젝트다).
 *
 * **멤버 행을 지운 뒤인 까닭 — 제거가 도는 사이 발급된 토큰.** 제거가 토큰을 잡은(`lockMemberTokens`) 뒤 owner 행을 기다리는
 * 동안 그 사람이 새 토큰을 발급하면, 발급은 멤버 행을 `SHARE`로 재확인할 뿐이라 막히지 않고 커밋된다 — 첫 잠금의 목록에 없던
 * 행이다. 멤버 행을 지운 뒤면 그 뒤의 발급은 재확인에서 기다렸다가 404 로 되돌아가고, 그 전에 커밋된 발급은 이 문장이 본다.
 * [api] 제거를 owner 행 질의 앞에 세운 채 세션으로 발급(201): 이 문장이 없으면 그 토큰이 남아 다시 멤버가 되면 200.
 *
 * **남이 잡고 있는 행은 건너뛴다(`SKIP LOCKED`).** 제거가 먼저 잡은 행은 제 것이라 건너뛰지 않는다. 남이 잡고 있는 행은 그
 * 사이 발급된 토큰을 **쓰는 중인** 요청의 재확인(`KEY SHARE`)뿐이다 — 그 요청은 토큰 행을 쥔 채 이 제거가 지운 멤버 행을
 * 기다리므로, 기다리면 고리다. 건너뛴 토큰은 남는다(그 요청은 멤버 행이 없어 404) — «발급하자마자 쓰는 요청이 이 문장과
 * 겹친» 판뿐이다.
 */
export async function deleteMemberTokens(trx: DbHandle, projectId: string, userId: string): Promise<void> {
  assertLocking(trx, 'deleteMemberTokens')
  await trx
    .deleteFrom('api_tokens')
    .where('id', 'in', (eb) =>
      eb.selectFrom('api_tokens').select('id').where('project_id', '=', projectId).where('user_id', '=', userId).forUpdate().skipLocked(),
    )
    .execute()
}

/**
 * 프로젝트의 토큰 행 전부를 id 순으로 `FOR UPDATE`로 잠근다. **부르는 자리는 프로젝트 삭제 하나다**(`routes/projects.ts` —
 * 멤버 제거의 `lockMemberTokens`와 고리를 만들지 않으려고 CASCADE 보다 먼저 잡는다). `lockProjectPresets`와 같은 모양이다.
 */
export async function lockProjectTokens(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectTokens')
  await trx.selectFrom('api_tokens').select('id').where('project_id', '=', projectId).orderBy('id').forUpdate().execute()
}

/**
 * 원문으로 토큰을 찾아 그 주체를 낸다. 없으면 `null`이다.
 *
 * **만료 조건이 없다 — `resolveSession`과 갈리는 자리이고 의도한 것이다**(0011의 머리말).
 * 이 표에는 `expires_at`이 없고, 자격을 거두는 수단은 폐기(DELETE)와 멤버십 제거(그 프로젝트 토큰을 함께 지운다 —
 * `deleteMemberTokens`) 둘이다.
 *
 * **`password_hash`를 select하지 않는다** — `resolveSession`과 같은 이유로 `users`에서
 * 세 컬럼만 명시적으로 고른다.
 *
 * `last_used_at`을 갱신하는 것도 `resolveSession`이 `last_seen_at`을 만지는 것과 같은 자리다.
 */
export async function findApiTokenByValue(db: DbHandle, value: string): Promise<ApiTokenPrincipal | null> {
  const hash = hashTokenValue(value)

  const row = await db
    .selectFrom('api_tokens')
    .innerJoin('users', 'users.id', 'api_tokens.user_id')
    .select([
      'api_tokens.id as token_id',
      'api_tokens.name as token_name',
      'api_tokens.project_id as project_id',
      'users.id as user_id',
      'users.email as email',
      'users.name as name',
    ])
    .where('api_tokens.token_hash', '=', hash)
    .executeTakeFirst()

  if (!row) return null

  await db
    .updateTable('api_tokens')
    .set({ last_used_at: sql<Date>`clock_timestamp()` })
    .where('token_hash', '=', hash)
    .execute()

  return {
    tokenId: row.token_id,
    tokenName: row.token_name,
    projectId: row.project_id,
    user: { id: row.user_id, email: row.email, name: row.name },
  }
}

/**
 * 토큰 행이 아직 있는지만 본다 — 커밋 순간의 재확인이 쓴다(`auth/roles.ts`의 `recheckAtCommit`). **토큰의 생사는 행의 있고
 * 없음이다** — 만료가 없고 거두는 수단은 폐기(`deleteApiToken`)와 프로젝트 삭제의 CASCADE 다(`findApiTokenByValue` 머리말).
 *
 * 행을 `FOR KEY SHARE`로 잡는다 — 재확인 뒤 커밋까지 폐기가 이 커밋을 기다린다. 인증마다 도는 `last_used_at` 갱신과는 안
 * 부딪힌다.
 */
export async function tokenIsLive(trx: DbHandle, tokenId: string): Promise<boolean> {
  assertLocking(trx, 'tokenIsLive')
  const row = await trx.selectFrom('api_tokens').select('id').where('id', '=', tokenId).forKeyShare().executeTakeFirst()
  return row !== undefined
}
