import type { ColumnType, Generated } from 'kysely'

/**
 * `Database` 스키마 인터페이스. P1이 만드는 테이블 중 이 태스크가 먼저 넣는
 * 것은 `users`·`sessions` 두 개뿐이다 — 이후 태스크(9·12·13)가 각자의 테이블
 * 인터페이스를 여기에 추가한다.
 */
export interface UsersTable {
  id: Generated<string>
  email: string
  name: string
  password_hash: string
  created_at: Generated<Date>
}

export interface SessionsTable {
  /** 쿠키 토큰의 sha256 hex. 토큰 원문은 저장하지 않는다 (설계 §4.2). */
  id: string
  user_id: string
  expires_at: ColumnType<Date, Date, Date>
  created_at: Generated<Date>
  last_seen_at: ColumnType<Date, Date | undefined, Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
}
