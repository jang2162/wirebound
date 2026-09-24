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
 * 원문으로 토큰을 찾아 그 주체를 낸다. 없으면 `null`이다.
 *
 * **만료 조건이 없다 — `resolveSession`과 갈리는 자리이고 의도한 것이다**(0011의 머리말).
 * 이 표에는 `expires_at`이 없고, 자격을 거두는 수단은 폐기(DELETE)와 멤버십 제거 둘이다.
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
