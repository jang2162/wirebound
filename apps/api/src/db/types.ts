import type { ColumnType, Generated, JSONColumnType } from 'kysely'
import type { LayoutDocument, PageDocument, PatchOp, WbNode } from '@wirebound/schema'
import type { SnapshotPayload, ThemeManifest } from '@wirebound/themes'

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
  /** 테마를 올리고 숨기는 사람(`0019-theme-packages`). 바꾸는 길은 `db/admin.ts` 명령 · 시딩뿐이다. */
  is_instance_admin: Generated<boolean>
}

export interface SessionsTable {
  /** 쿠키 토큰의 sha256 hex. 토큰 원문은 저장하지 않는다 (설계서 「테이블 정의」). */
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
  /**
   * 이 프로젝트의 기본 레이아웃(`0007-layouts`). **nullable인 것이 요점이다** —
   * `projects`와 `layouts`가 서로를 가리키는 순환이라 어느 쪽도 먼저 만들 수 없으므로,
   * `insertProject`가 프로젝트를 먼저 넣고(참조 없음) 레이아웃을 만든 뒤 이 컬럼을
   * 채운다(같은 트랜잭션). 0007 이전에 만들어진 프로젝트는 `null`로 남는다(`0007-layouts.ts` 머리말
   * «이미 있는 프로젝트에 기본 레이아웃을 만들어 주지 않는다»).
   */
  default_layout_id: ColumnType<string | null, string | null | undefined, string | null>
  created_at: Generated<Date>
  updated_at: Generated<Date>
  /**
   * 고정한 테마 패키지(`0019-theme-packages`). 둘이 함께 null 이면 «아직 고정 안 됨» — 기동 시딩이 채운다
   * (`services/system-themes.ts` 의 `backfillProjectThemes`).
   */
  theme_id: ColumnType<string | null, string | null | undefined, string | null>
  theme_version: ColumnType<string | null, string | null | undefined, string | null>
  /** 기본값과 다른 토큰 값만. `PagesTable.schema` 와 같은 비대칭(쓸 때 문자열 · 읽을 때 객체)이다. */
  theme_tokens: ColumnType<Record<string, string | number>, string | undefined, string>
  /** 바인딩 저장의 낙관적 동시성 번호. 저장 · 판 3 복원마다 1 오른다. */
  theme_rev: ColumnType<number, number | undefined, number>
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
   * (설계서 「테이블 정의」). `0`은 "아직 편집 이력이 없다"는 뜻이다. `seq`와 같은 이유로
   * select 타입이 `string`이고, insert는 생략 가능하다(DEFAULT 0).
   */
  head_seq: ColumnType<string, number | undefined, number>
  /**
   * 구조(노드 추가 · 삭제 · 옮김)가 마지막으로 바뀐 편집의 seq(`0023-pages-structure-seq`). `head_seq` 와 같은 이유로 select 타입이 `string`이다.
   * 새 행은 `head_seq` 와 같게 넣고, 편집은 구조가 바뀐 때만 올린다.
   */
  structure_seq: ColumnType<string, number | undefined, number>
}

/** revision을 만든 주체의 종류. 설계서 「테이블 정의」. `'mcp'`·`'cli'`는 API 토큰으로 들어온 편집이다(`auth/actor.ts`). */
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
 * 레이아웃(`0007-layouts`). **`Slot`을 담는 최소본이다** — 편집 화면이 없으므로 쓰기는 생성뿐이다.
 *
 * `schema`는 `jsonb`다 — 노드 트리의 순서는 `children` 배열이 나르므로 `jsonb`도 보존한다. `pages.schema`와 같은 선택이다.
 *
 * `schema_version` 컬럼이 없다 — 설계서 「테이블 정의」의 `layouts` 목록에 없고 버전은 봉투 안에 있다.
 */
export interface LayoutsTable {
  id: Generated<string>
  project_id: string
  name: string
  schema: JSONColumnType<LayoutDocument>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

/**
 * 코멘트(`0008-comments`). 설계서 「설계서 화면 구조」의 우측 코멘트 탭이 담는 말이다.
 *
 * **`marker` 컬럼이 없는 것이 요점이다** — 번호는 페이지 문서의 노드가
 * 든다(`WbNode.marker`). 근거는 0008의 주석에 있다(요지: 설계서 「페이지 스키마 노드」의 *"없으면 코멘트 없음"*
 * 때문에 문서만 봐도 마커를 그릴 수 있어야 한다).
 *
 * `node_id`는 `pages.schema` 안의 노드 id다 — **테이블이 아니라 jsonb 문서 안의 값이라
 * FK가 없다.** 그래서 "문서에 없는 `node_id`를 가진 행"이 존재할 수 있고, 그것을 만드는
 * 것을 막는 자리는 라우트다(`routes/comments.ts`).
 *
 * `created_at`·`updated_at`의 기본값이 `now()`가 아니라 `clock_timestamp()`다 —
 * 스레드 순서를 정하는 것이 시각뿐이라 한 트랜잭션 안에서
 * 만든 행이 같은 값을 가지면 안 되기 때문이다(0008의 주석에 고장 조건이 있다).
 */
export interface CommentsTable {
  id: Generated<string>
  page_id: string
  node_id: string
  body: string
  author_id: string
  created_at: Generated<Date>
  /** 본문을 고치면 `repos/comments.ts`가 `clock_timestamp()`로 함께 갱신한다. */
  updated_at: ColumnType<Date, Date | undefined, Date>
  /**
   * 게시를 실은 클라이언트가 지은 멱등 키(`0012-comment-idempotency-key`). 없으면 `null`이다 —
   * 키 없는 게시·가져오기·복원. **고치지 않는다** — 같은 게시를 가리키는 이름이다.
   */
  idempotency_key: ColumnType<string | null, string | null | undefined, never>
  /**
   * 그 게시가 번호를 붙이며 만든 revision 의 `seq`(`0015-comment-revision-seq`). 번호를 새로 붙이지 않은 게시 · 가져오기 ·
   * 복원은 `null`이다. 읽는 자리는 게시의 재생뿐이다. `bigint`라 pg 가 문자열로 준다(`revisions.seq`와 같다).
   */
  revision_seq: ColumnType<string | null, number | null | undefined, never>
}

/**
 * 지운 게시의 키(`0013-comment-tombstones`). `comments`에서 키가 있는 행을 지울 때
 * `repos/comments.ts`의 `deleteComment`가 한 줄을 남기고, 복원이 같은 id 로 되살리면
 * `insertCommentWithId`가 그 줄을 지우며 키를 되붙인다. 읽는 자리는 게시의 키 판정뿐이다. 페이지를 지우면
 * CASCADE 전에 그 페이지의 키 있는 행도 같은 문장으로 묻는다(`deletePageComments` — `0014`).
 */
export interface CommentTombstonesTable {
  /** 지운 코멘트의 id. FK 가 아니다 — 가리키는 행이 이미 없다. */
  comment_id: string
  /**
   * 판정이 찾는 칸이다. **FK 가 아니다**(`0014-comment-tombstones-project`) — 페이지가 지워져도 묘비는 남는다. 복원이
   * 그 페이지를 같은 id 로 되살릴 수 있기 때문이다.
   */
  page_id: string
  /** 묘비의 수명(`0014` — `ON DELETE CASCADE`). 복원이 되살릴 수 있는 것의 바깥 경계가 프로젝트다. */
  project_id: string
  author_id: string
  idempotency_key: string
  deleted_at: Generated<Date>
}

/**
 * 지운 페이지 id 가 쓴 마지막 번호(`0017-page-seq-floors`). 페이지를 지우는 두 길(`repos/pages.ts`의 `deletePage` ·
 * `deletePageRow`)이 `recordPageSeqFloor`로 남기고, 복원이 같은 id 로 되살릴 때 `insertPageWithId`가 그 다음부터 센다.
 */
export interface PageSeqFloorsTable {
  /** 지운 페이지의 id. FK 가 아니다 — 가리키는 행이 지금 없다. */
  page_id: string
  /** 수명(`ON DELETE CASCADE`). */
  project_id: string
  /** 그 id 가 쓴 가장 큰 번호. `head_seq`와 같은 이유로 select 타입이 `string`이다. */
  head_seq: ColumnType<string, number, number>
}

/**
 * 프로젝트 메뉴 트리의 판 번호(`0020-project-menu-revs`). 올리는 자리는 `repos/menu.ts`의 `bumpMenuRev` 하나다.
 */
export interface ProjectMenuRevsTable {
  /** 프로젝트. FK 가 아니다(마이그레이션 머리말 «잠금»). */
  project_id: string
  /** `bigint`라 `pg`가 글자로 준다 — `head_seq`와 같다. */
  rev: ColumnType<string, number, number>
}

/**
 * 스냅샷(`0009-snapshots`). 설계서 「스냅샷」의 **삭제 없는 태그**다 — 메뉴 연쇄 삭제의 안전망만 개수 상한으로 지워진다(`kind`).
 *
 * `payload`는 `JSONColumnType<SnapshotPayload>` — `PagesTable.schema`와 **같은 비대칭**이다:
 * 삽입 시엔 `JSON.stringify`한 문자열, 조회 시엔 파싱된 객체. 그 규격을 소유하는 것은
 * `@wirebound/themes`의 `snapshot/payload.ts`이고, 이 파일은 컬럼 타입만 안다.
 *
 * `tag`는 `(project_id, tag)`가 유일하다. `description`은 `NULL`이면 적지 않은 것이다.
 * `created_by`는 `ON DELETE RESTRICT`이고 이유는 0009의 주석에 있다.
 */
export interface SnapshotsTable {
  id: Generated<string>
  project_id: string
  tag: string
  description: string | null
  payload: JSONColumnType<SnapshotPayload>
  created_by: string
  created_at: Generated<Date>
  /** 누가 왜 찍었나(`0022-snapshot-kind`) — 연쇄 삭제의 안전망만 개수 상한이 있다. */
  kind: Generated<SnapshotKind>
}

/** `snapshots.kind` 의 값 — 뜻은 `0022-snapshot-kind` 의 표. */
export type SnapshotKind = 'tag' | 'restore-safety' | 'cascade-safety'

/**
 * 모듈(`0024-modules`). 설계 spec `2026-10-18-modules-states-layout-design.md` 「B3. 모듈」 — 프로젝트의 모든 페이지에 넣는 노드 묶음이다.
 *
 * `nodes`는 `JSONColumnType<WbNode[]>` — `PagesTable.schema`와 **같은 비대칭**이다: 삽입 시엔 `JSON.stringify`한 문자열, 조회 시엔 파싱된 배열.
 * **`name`에 유일 제약이 없다**(근거는 0024 머리말). `updated_at`은 이름 바꾸기가 고친다.
 */
export interface ModulesTable {
  id: Generated<string>
  project_id: string
  name: string
  nodes: JSONColumnType<WbNode[]>
  created_by: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

/**
 * 개인 모듈(`0026-personal-modules`). 설계 spec `2026-10-20-personal-modules-design.md` — 사람 하나가 소유하는 노드 묶음이다. 칸의 뜻은
 * `ModulesTable` 과 같고, 프로젝트 칸 · 만든 사람 칸 대신 소유자(`owner_id`)가 있다.
 */
export interface PersonalModulesTable {
  id: Generated<string>
  owner_id: string
  name: string
  nodes: JSONColumnType<WbNode[]>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

/**
 * API 토큰(`0011-api-tokens`). 설계서 「권한 모델」의 *"발급자의 권한을 상속 … 스코프는 프로젝트 단위"*.
 *
 * **`token_hash`가 원문의 sha256 hex다 — 원문은 어디에도 저장되지 않는다**(`sessions.id`와
 * 같은 규칙, 만드는 함수도 하나다: `auth/token-hash.ts`). `id`는 그것과 별개인 uuid이고,
 * 목록·폐기가 지목하는 것이 그쪽이다(0011의 머리말).
 *
 * **역할 컬럼이 없다.** 토큰은 *"누가"*와 *"어느 프로젝트"*만 들고, 역할은 요청
 * 시점의 `project_members` 행이 정한다 — 얼리면 판정이 두 벌이 된다.
 */
export interface ApiTokensTable {
  id: Generated<string>
  project_id: string
  user_id: string
  token_hash: string
  name: string
  created_at: Generated<Date>
  /** 한 번도 쓰지 않았으면 `null`이다. 인증이 성공할 때마다 갱신된다. */
  last_used_at: ColumnType<Date | null, Date | null | undefined, Date>
}

/**
 * 올린 코드 테마 패키지(`0019-theme-packages`). 행은 `hidden_at` 말고 안 바뀐다 — 지우는 길이 없다.
 *
 * `files` 는 `.wbtheme` zip 원본이다. 읽을 때 `pg` 가 `Buffer` 로 준다. `manifest` 는 `json`(키 순서를 지킨다)이고 쓸 때 문자열이다.
 */
export interface ThemePackagesTable {
  theme_id: string
  version: string
  name: string
  description: string | null
  sdk_range: string
  manifest: ColumnType<ThemeManifest, string, never>
  files: ColumnType<Buffer, Buffer | Uint8Array, never>
  size: ColumnType<number, number, never>
  sha256: ColumnType<string, string, never>
  /** 올린 사람. null 이면 시스템 테마이거나 올린 사람이 지워졌다. */
  uploaded_by: ColumnType<string | null, string | null, string | null>
  uploaded_at: Generated<Date>
  hidden_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}

/**
 * 그림 바이트 한 벌(`0030-assets`) — 이름이 내용의 sha256 이다. 마지막 소유 행이 지워지면 트리거가 함께 지운다(그 마이그레이션의 머리말).
 * `bytes` 는 읽을 때 `pg` 가 `Buffer` 로 준다.
 */
export interface AssetBlobsTable {
  sha256: string
  bytes: ColumnType<Buffer, Buffer | Uint8Array, never>
  mime: string
  size: number
  width: number
  height: number
  created_at: Generated<Date>
}

/** 프로젝트가 가진 그림(`0030-assets`). 행이 있어야 그 프로젝트에서 그 그림을 읽는다. */
export interface ProjectAssetsTable {
  project_id: string
  sha256: string
  /** 올린 파일 이름(`X-Asset-Name`) — 화면의 «올린 그림에서» 목록이 보인다. 가져온 그림(`claim`)은 출처의 이름이다. */
  name: string
  uploaded_by: string | null
  created_at: Generated<Date>
}

/** 사람이 가진 그림(`0030-assets`) — 개인 모듈이 든 그림. 프로젝트에 매이지 않는다. */
export interface PersonalAssetsTable {
  owner_id: string
  sha256: string
  name: string
  created_at: Generated<Date>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  projects: ProjectsTable
  project_members: ProjectMembersTable
  menu_nodes: MenuNodesTable
  pages: PagesTable
  revisions: RevisionsTable
  layouts: LayoutsTable
  comments: CommentsTable
  comment_tombstones: CommentTombstonesTable
  page_seq_floors: PageSeqFloorsTable
  project_menu_revs: ProjectMenuRevsTable
  snapshots: SnapshotsTable
  modules: ModulesTable
  personal_modules: PersonalModulesTable
  api_tokens: ApiTokensTable
  theme_packages: ThemePackagesTable
  asset_blobs: AssetBlobsTable
  project_assets: ProjectAssetsTable
  personal_assets: PersonalAssetsTable
}
