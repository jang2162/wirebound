import type { ColumnType, Generated, JSONColumnType } from 'kysely'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import type { ThemeAssets, ThemeComponent, ThemePattern, ThemePrimitives, ThemeTokens } from '@wirebound/themes'

/**
 * `Database` 스키마 인터페이스. 테이블을 만드는 마이그레이션은 대응하는 인터페이스를
 * 여기에 함께 더한다 — 아래 선언 순서가 `db/migrations/`의 번호 순서다.
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
 * 메뉴 트리 노드(`0003-menu-nodes`). `parent_id`가 `null`이면 루트 노드다.
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
 * 페이지(`0004-pages`). `menu_node_id`는 이 페이지가 매달린 메뉴 트리 리프다.
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
  /**
   * 이 페이지의 최신 revision seq. 클라이언트가 patch를 보낼 때 `baseSeq`로 쓴다
   * (설계 §4.2). `0`은 "아직 편집 이력이 없다"는 뜻이다. `seq`와 같은 이유로
   * select 타입이 `string`이고, insert는 생략 가능하다(DEFAULT 0).
   */
  head_seq: ColumnType<string, number | undefined, number>
}

/** revision을 만든 주체의 종류. 설계 §4.2. `'mcp'`·`'cli'`는 P9가 쓴다. */
export type RevisionActorType = 'user' | 'mcp' | 'cli'

/**
 * 페이지 편집 이력(`0005-revisions`). append-only다 — UPDATE도 DELETE도 하지 않는다
 * (페이지 삭제 시의 CASCADE만 예외).
 *
 * `seq`는 `bigint`다. `pg`가 int8을 문자열로 주므로 select 타입이 `string`이고,
 * insert는 `number`를 받는다(Postgres가 캐스트한다). update는 `never`다 —
 * 이 컬럼은 만들어진 뒤 절대 바뀌지 않으므로, 바꾸려는 코드를 컴파일러가 막는다.
 *
 * `ops`·`inverse`는 `JSONColumnType<PatchOp[]>`, 즉 `ColumnType<PatchOp[], string, string>`이다 —
 * `PagesTable.schema`와 같은 비대칭이다: 삽입 시엔 `JSON.stringify`한 문자열,
 * 조회 시엔 파싱된 배열.
 */
export interface RevisionsTable {
  id: Generated<string>
  page_id: string
  seq: ColumnType<string, number, never>
  actor_type: RevisionActorType
  /** `actor_type`이 `'user'`면 `users.id`. FK는 걸지 않는다(마이그레이션 0005 주석 참고). */
  actor_id: string | null
  /** 편집 시점의 표시 이름 스냅샷. 사용자가 이름을 바꿔도 이력의 표시는 그대로다. */
  actor_label: string
  ops: JSONColumnType<PatchOp[]>
  inverse: JSONColumnType<PatchOp[]>
  created_at: Generated<Date>
}

/**
 * 테마(`0006-themes`). 테마 문서(§6.1의 여섯 절)를 **절마다 컬럼 하나**로 쪼갠 것이다.
 * `meta`는 컬럼으로 흩어진다 — `meta.id`는 `slug`, `meta.extends`는 `extends_ref`,
 * 나머지는 각 컬럼이다. 다시 `Theme` 모양으로 조립하는 것은 `repos/themes.ts`다.
 *
 * **절 다섯은 `jsonb`가 아니라 `json` 컬럼이다.** 근거는 `0006-themes.ts`의 주석에 있다
 * (요지: `jsonb`가 키 순서를 정규화하는데 `compileTheme`의 계약이 문서 키 순서다).
 * TS 타입은 `JSONColumnType<…>`으로 같다 — 그 타입은 "삽입은 문자열, 조회는 파싱된
 * 객체"라는 **비대칭**을 나타낼 뿐 컬럼이 json인지 jsonb인지를 담지 않고, `pg` 드라이버가
 * 두 OID를 똑같이 `JSON.parse`한다.
 *
 * `| null`이 붙은 것은 **절이 없는 것과 빈 것을 가르기 위해서다** — `patterns`가 없는
 * 테마와 `patterns: {}`인 테마는 서로 다른 문서이고, 그 구분이 왕복에서 살아야 한다
 * (`repos-themes.test.ts`가 고정한다).
 */
export interface ThemesTable {
  id: Generated<string>
  /** `null`이면 시스템 테마다(§4.2·§6.10 — 읽기 전용, 코드가 진실이다). */
  project_id: string | null
  /** `meta.id`. `(project_id, slug)`가 유일하다(NULLS NOT DISTINCT). */
  slug: string
  name: string
  description: string | null
  /** `meta.extends`. `system:<id>` 문자열이고 FK가 아니다(0006의 주석 참고). */
  extends_ref: string | null
  version: string
  /** `meta.preview`. §4.2의 컬럼 목록에는 없다(0006의 주석 참고). */
  preview: string | null
  tokens: JSONColumnType<ThemeTokens> | null
  primitives: JSONColumnType<ThemePrimitives> | null
  components: JSONColumnType<Record<string, ThemeComponent>> | null
  patterns: JSONColumnType<Record<string, ThemePattern>> | null
  assets: JSONColumnType<ThemeAssets> | null
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
  revisions: RevisionsTable
  themes: ThemesTable
}
