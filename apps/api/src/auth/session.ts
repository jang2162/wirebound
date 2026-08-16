/**
 * 세션 저장소. HTTP도 쿠키도 모르는 순수 DB 계층이다 — 쿠키를 읽고 쓰는 일은
 * `auth/plugin.ts`(인증 훅)와 다음 태스크의 라우트가 담당한다.
 *
 * **토큰 원문을 저장하지 않는다(설계 §4.2).** 쿠키에 실리는 값은
 * `randomBytes(32).toString('base64url')`이고, `sessions.id`에는 그 sha256 hex만
 * 들어간다. DB가 유출돼도 그 자체로는 세션을 탈취할 수 없다 — 공격자가 원문 토큰을
 * 별도로 얻지 못하는 한 해시만으로는 로그인 상태를 재현할 수 없다.
 */
import { sql } from 'kysely'
import { withTransaction, type DbHandle } from '../db/tx'
import { hashTokenValue, randomTokenValue } from './token-hash'

export interface SessionUser {
  id: string
  email: string
  name: string
}

export interface CreatedSession {
  token: string
  expiresAt: Date
}

/**
 * 토큰 원문의 sha256 hex. `sessions.id`(PK)로 쓰는 값과 같은 함수로 만든다 — 쓰기·읽기가
 * 다른 해시를 쓰면 영영 못 찾는다.
 *
 * **몸통은 `auth/token-hash.ts`에 있다(P9-2 T2).** API 토큰이 같은 성질(*"원문은 저장하지
 * 않는다"*)을 갖게 되면서 그 성질을 만드는 코드가 두 벌이 될 자리였다. **수명 정책은
 * 함께 옮기지 않았다** — 그것은 아래 `resolveSession`의 SQL 조건이고 토큰에는 그 조건이
 * 없다(그쪽 파일의 표에 근거가 있다).
 */
export function hashSessionToken(token: string): string {
  return hashTokenValue(token)
}

/**
 * 세션을 만든다. 토큰 원문은 반환값에만 담고 DB에는 해시만 넣는다.
 *
 * `sessions.id`가 sha256 hex(PK)이므로 이론상 해시 충돌이 나면 유니크 위반이 난다.
 * `withTransaction`으로 감싸 그 실패가(있다면) 이 삽입 하나로 격리되게 한다 —
 * 감싸지 않으면 이 호출을 둘러싼 트랜잭션(테스트 하네스 포함) 전체가 오염된다.
 */
export async function createSession(db: DbHandle, userId: string, ttlHours: number): Promise<CreatedSession> {
  const token = randomTokenValue()
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000)

  await withTransaction(db, async (trx) => {
    await trx.insertInto('sessions')
      .values({ id: hashSessionToken(token), user_id: userId, expires_at: expiresAt })
      .execute()
  })

  return { token, expiresAt }
}

/**
 * 토큰으로 세션을 찾아 그 사용자를 돌려준다. 없거나 만료됐으면 `null`이다.
 *
 * 만료 판정은 `expires_at > now()`로 **SQL에** 넣는다 — JS에서 가져온 뒤 비교하면
 * 애플리케이션 서버와 DB의 시계가 어긋날 때 결과가 갈릴 수 있고, 이 조건 하나가
 * "만료된 세션은 존재하지 않는 것과 같다"는 성질을 DB 쿼리 자체에 고정해 둔다.
 *
 * `password_hash`는 select하지 않는다 — `users`에서 `id`·`email`·`name`만 명시적으로
 * 골라 온다. `selectAll()`로 다 가져온 뒤 필드를 지우는 방식은 나중에 `users`에
 * 컬럼이 늘어나면 실수로 민감한 값을 새어 보낼 수 있어 쓰지 않는다.
 */
export async function resolveSession(db: DbHandle, token: string): Promise<SessionUser | null> {
  const id = hashSessionToken(token)

  const row = await db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['users.id as id', 'users.email as email', 'users.name as name'])
    .where('sessions.id', '=', id)
    .where('sessions.expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst()

  if (!row) {
    return null
  }

  await db.updateTable('sessions')
    .set({ last_seen_at: new Date() })
    .where('id', '=', id)
    .execute()

  return { id: row.id, email: row.email, name: row.name }
}

/**
 * 세션 행이 아직 살아 있는지만 본다. **토큰 원문이 아니라 그 해시(=`sessions.id`)를 받는다.**
 *
 * 열려 있는 WebSocket 연결이 §10의 *"세션 행을 지우면 권한도 즉시 회수된다"*를 지키려면
 * 그 연결이 자기 세션을 다시 확인할 수 있어야 하는데, **원문 토큰을 프로세스 메모리에
 * 연결 수명만큼 들고 있지 않으려고** 해시만 들고 이 함수를 부른다(`ws/routes.ts`).
 *
 * `resolveSession`과 달리 `last_seen_at`을 건드리지 않는다 — 브로드캐스트가 나가는 것은
 * 사용자의 활동이 아니다. 그것을 활동으로 세면 아무도 안 만지는 화면의 세션이 남의 편집만으로
 * 계속 살아난다.
 */
export async function sessionIsLive(db: DbHandle, sessionId: string): Promise<boolean> {
  const row = await db
    .selectFrom('sessions')
    .select('id')
    .where('id', '=', sessionId)
    .where('expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst()

  return row !== undefined
}

/** 세션 하나를 폐기한다(로그아웃). 존재하지 않는 토큰이어도 조용히 끝난다. */
export async function destroySession(db: DbHandle, token: string): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', hashSessionToken(token)).execute()
}

/** 한 사용자의 세션을 전부 폐기한다(비밀번호 변경 등 전체 로그아웃 시). */
export async function destroyUserSessions(db: DbHandle, userId: string): Promise<void> {
  await db.deleteFrom('sessions').where('user_id', '=', userId).execute()
}
