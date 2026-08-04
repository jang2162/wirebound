import type { ColumnType, Generated, JSONColumnType } from 'kysely'
import type { PageDocument } from '@wirebound/schema'

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

/**
 * 메뉴 트리 노드(태스크 12). `parent_id`가 `null`이면 루트 노드다.
 * `sort_order`는 형제(같은 `project_id`·`parent_id`) 안에서 0부터 시작하는
 * 연속 정수다 — 불변식은 `repos/menu.ts`가 지킨다(`db/types.ts`는 컬럼 타입만 안다).
 */
export interface MenuNodesTable {
  id: Generated<string>
  project_id: string
  parent_id: string | null
  title: string
  sort_order: number
  created_at: Generated<Date>
}

/**
 * 페이지(태스크 13). `menu_node_id`는 이 페이지가 매달린 메뉴 트리 리프다.
 * `sort_order`는 형제(같은 `project_id`·`menu_node_id`) 안에서 0부터 시작하는
 * 연속 정수다 — `menu_nodes`와 같은 불변식, 지키는 것은 `repos/pages.ts`다.
 *
 * `schema`는 `JSONColumnType<PageDocument>`, 즉 `ColumnType<PageDocument, string, string>`이다.
 * 셋 다 같은 타입이 아니다 — **삽입·갱신 시엔 `JSON.stringify`한 문자열**을 넘겨야
 * 하고(Postgres가 jsonb로 캐스트한다), **조회 시엔 파싱된 `PageDocument` 객체**가
 * 온다(`pg`가 jsonb OID를 기본으로 파싱한다). 이 비대칭은 실수를 유도하는 함정이
 * 아니라 명시적인 설계다 — `repos/pages.ts`의 모든 삽입·갱신 경로가 이 사실을 안다.
 */
export interface PagesTable {
  id: Generated<string>
  project_id: string
  menu_node_id: string
  title: string
  sort_order: number
  description: string | null
  schema: JSONColumnType<PageDocument>
  schema_version: number
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  projects: ProjectsTable
  project_members: ProjectMembersTable
  menu_nodes: MenuNodesTable
  pages: PagesTable
}
