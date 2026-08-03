import type { ColumnType, Generated } from 'kysely'

/**
 * `Database` 스키마 인터페이스. `users`·`sessions`는 태스크 1이 넣었고,
 * `projects`·`project_members`는 태스크 9(이 태스크)가 추가한다 — 이후
 * 태스크(12·13)가 각자의 테이블 인터페이스를 여기에 더 얹는다.
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

/** 프로젝트 멤버의 역할. 순위는 `auth/roles.ts`의 `ROLE_RANK`가 정의한다(viewer < editor < owner). */
export type ProjectRole = 'owner' | 'editor' | 'viewer'

export interface ProjectsTable {
  id: Generated<string>
  name: string
  slug: string
  description: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ProjectMembersTable {
  project_id: string
  user_id: string
  role: ProjectRole
  invited_at: Generated<Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  projects: ProjectsTable
  project_members: ProjectMembersTable
}
