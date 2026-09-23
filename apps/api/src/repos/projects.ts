/**
 * 프로젝트 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/projects.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 */
import { DatabaseError } from 'pg'
import { sql } from 'kysely'
import { assertLocking } from '../db/locking'
import { assertNoNulBytes } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'
import { DEFAULT_LAYOUT_NAME, defaultLayoutDocument, insertLayout } from './layouts'
import { findThemeBySlug } from './themes'

export interface ProjectRecord {
  id: string
  name: string
  slug: string
  description: string | null
}

export interface ProjectWithRole extends ProjectRecord {
  role: ProjectRole
}

/** Postgres 유니크 위반 SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * `0002-projects-members` 마이그레이션이 `slug` 컬럼에 `.unique()`로 건 제약의 이름.
 * Postgres가 단일 컬럼 유니크 제약에 붙이는 기본 명명 규칙(`<table>_<column>_key`)을
 * 그대로 따른다 — 실제 DB에서 `\d projects`로 확인했다(`repos/users.ts`의
 * `USERS_EMAIL_UNIQUE_CONSTRAINT`와 같은 근거).
 */
const PROJECTS_SLUG_UNIQUE_CONSTRAINT = 'projects_slug_key'

/** 이름·설명의 NUL 을 거절할 때 문장이 부르는 이름(`db/nul-guard.ts`의 `NulByteError`). */
const PROJECT_TEXT = '프로젝트 이름·설명'

/** slug가 이미 다른 프로젝트에서 쓰이고 있을 때 `insertProject`/`updateProject`가 던진다. */
export class DuplicateSlugError extends Error {
  constructor() {
    super('이미 사용 중인 슬러그입니다')
    this.name = 'DuplicateSlugError'
  }
}

function isSlugUniqueViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === UNIQUE_VIOLATION &&
    error.constraint === PROJECTS_SLUG_UNIQUE_CONSTRAINT
  )
}

/**
 * 기본 레이아웃이 가리킬 시스템 테마의 slug. `packages/themes`의 `SYSTEM_THEME_IDS`에
 * 있는 이름이고 오늘 시스템 테마는 이것 하나다(P4a-2의 D7).
 *
 * `apps/web`의 `DEFAULT_THEME_ID`와 같은 값인데 **두 상수를 잇지 않는다** — 서버가
 * 고르는 것은 *"새 프로젝트의 기본값"*이고 웹의 것은 *"서버가 테마를 주지 못할 때의
 * 폴백"*이다. 둘이 우연히 같을 뿐 다른 질문에 답한다.
 */
const DEFAULT_THEME_SLUG = 'admin'

/**
 * 프로젝트를 만들고, 생성자를 owner로 넣고, **기본 레이아웃을 함께 만든다** —
 * 전부 같은 트랜잭션 안에서다.
 *
 * 셋 중 하나만 성공하는 상태가 생기면 안 된다. 주인 없는 프로젝트는 아무도 접근할 수
 * 없는 채로 영원히 남고(설계 §10), 레이아웃 없는 프로젝트는 테마를 가리킬 방법이 없는데
 * **레이아웃을 만들어 주는 다른 경로가 없다**(레이아웃 에디터는 D7로 빠졌다).
 *
 * ---
 *
 * **순환 참조를 여는 순서(계획서 D5).** `projects.default_layout_id`와
 * `layouts.project_id`가 서로를 가리키므로 어느 쪽도 먼저 완성될 수 없다. 그래서
 * **세 문장**으로 닫는다:
 *
 * 1. `projects` INSERT — `default_layout_id`를 비워 둔다(그래서 그 컬럼이 nullable이다).
 * 2. `layouts` INSERT — 이제 `project_id`가 가리킬 행이 있다.
 * 3. `projects` UPDATE — `default_layout_id`를 채운다.
 *
 * 한 트랜잭션 안이므로 밖에서는 세 문장이 보이지 않는다. 이 순서가 아니면(레이아웃을
 * 먼저 만들려 하면) `project_id`의 NOT NULL FK를 만족시킬 수 없다.
 *
 * **`repos`가 `repos`를 부르는 것이 여기서 처음은 아니다.** 이 함수는 이미
 * `project_members`를 함께 넣고 있었다 — *"프로젝트가 만들어질 때 반드시 함께 서야 하는
 * 것"*을 한 트랜잭션에 모으는 것이 이 함수의 일이고, 기본 레이아웃이 그 목록에 하나
 * 늘었을 뿐이다. (README의 계층 규칙은 여러 repo를 조율하는 로직을 `services/`에 두라고
 * 하는데, 그 규칙과 이 함수의 기존 형태가 부딪힌다. 조율을 밖으로 빼면 "프로젝트 생성"이
 * 두 자리로 갈라져 한쪽만 부르는 경로가 생길 수 있어 여기 둔다.)
 *
 * **기본 레이아웃의 `theme_id`는 시스템 `admin`을 가리킨다.** 그 행은 기동 동기화가
 * 넣는다(`services/system-themes.ts`) — `buildApp`이 라우트를 세우기 전에 돌므로 이
 * 함수가 도달할 때는 반드시 있다. 그래도 없으면 `null`로 두고 진행한다: 테마를 못 고른
 * 프로젝트는 구조 기본 CSS로 그려질 뿐이지만(정상 경로다), 프로젝트 생성 자체가
 * 실패하면 사용자가 할 수 있는 것이 없다.
 *
 * 조회 후 삽입하지 않는다(`repos/users.ts`의 `insertUser`와 같은 이유) — slug
 * 유니크 위반은 삽입을 시도해 보고 그 실패로 감지한다. 이 실패가 이 함수를 호출한
 * 바깥 트랜잭션(실제 요청이든 테스트 하네스의 트랜잭션이든)을 오염시키지 않도록
 * `withTransaction`으로 감싼다(`src/db/tx.ts` 참고) — 감싸지 않으면 트랜잭션 전체가
 * aborted(`25P02`)로 빠져 이후 문장이 전부 실패한다.
 */
export async function insertProject(
  db: DbHandle,
  ownerId: string,
  input: { name: string; slug: string; description: string | null },
): Promise<ProjectWithRole> {
  // 이름·설명의 NUL — 판정과 번역자는 `db/nul-guard.ts`의 `NulByteError`가 소유한다.
  assertNoNulBytes(PROJECT_TEXT, input.name, input.description)
  try {
    return await withTransaction(db, async (trx) => {
      // 1단계: 프로젝트. `default_layout_id`는 아직 비어 있다.
      const project = await trx
        .insertInto('projects')
        .values({ name: input.name, slug: input.slug, description: input.description })
        .returning(['id', 'name', 'slug', 'description'])
        .executeTakeFirstOrThrow()

      await trx
        .insertInto('project_members')
        .values({ project_id: project.id, user_id: ownerId, role: 'owner' })
        .execute()

      // 2단계: 기본 레이아웃. 문서는 `Page` 하나와 `Slot` 하나다(D5) — 참조(`theme_id`)를
      // 나르는 그릇의 최소본이다. **그 `schema`를 오늘 그리는 코드는 없다**(D6 반증 —
      // `repos/layouts.ts`의 `defaultLayoutDocument` 주석 참고).
      const theme = await findThemeBySlug(trx, null, DEFAULT_THEME_SLUG)
      const layout = await insertLayout(trx, {
        projectId: project.id,
        name: DEFAULT_LAYOUT_NAME,
        themeId: theme?.id ?? null,
        schema: defaultLayoutDocument(),
      })

      // 3단계: 순환을 닫는다.
      await trx
        .updateTable('projects')
        .set({ default_layout_id: layout.id })
        .where('id', '=', project.id)
        .execute()

      return { ...project, role: 'owner' as const }
    })
  } catch (error) {
    if (isSlugUniqueViolation(error)) {
      throw new DuplicateSlugError()
    }
    throw error
  }
}

/**
 * 사용자가 멤버인 프로젝트만 조회한다(`project_members`를 조인한다). 각 행에
 * 그 사용자 자신의 역할을 함께 싣는다 — `GET /api/projects` 응답이 메뉴를
 * 그리려면 role이 필요하다(설계 §10).
 */
export async function listProjectsForUser(db: DbHandle, userId: string): Promise<ProjectWithRole[]> {
  return db
    .selectFrom('projects')
    .innerJoin('project_members', 'project_members.project_id', 'projects.id')
    .where('project_members.user_id', '=', userId)
    .select(['projects.id', 'projects.name', 'projects.slug', 'projects.description', 'project_members.role'])
    .orderBy('projects.created_at', 'asc')
    .execute()
}

/**
 * id로 프로젝트 하나를 조회한다. 없으면 `null`이다.
 * 멤버십 확인은 이 함수의 일이 아니다 — 호출자(`projectGuard`)가 이미 확인했다고 가정한다.
 */
export async function findProjectById(db: DbHandle, projectId: string): Promise<ProjectRecord | null> {
  const row = await db
    .selectFrom('projects')
    .select(['id', 'name', 'slug', 'description'])
    .where('id', '=', projectId)
    .executeTakeFirst()

  return row ?? null
}

/**
 * 프로젝트 행을 `FOR UPDATE`로 잠근다. **프로젝트를 통째로 다루는 트랜잭션이 맨 먼저 잡는 잠금이다** — 부르는
 * 자리가 둘이다: 복원(`repos/snapshots.ts`의 `lockProjectForRestore`)과 프로젝트 삭제(`routes/projects.ts`).
 * 둘 다 이것을 **페이지보다 먼저** 잡는다. 한쪽이라도 페이지를 먼저 잡으면 «프로젝트 행을 쥐고 페이지를 기다림 ↔
 * 페이지를 쥐고 프로젝트 행을 기다림»이 된다(잰 값은 `routes/projects.ts`의 삭제 주석).
 *
 * `FOR UPDATE`여야 한다 — `FOR NO KEY UPDATE`는 FK 삽입이 부모 행에 거는 `FOR KEY SHARE`와 충돌하지 않아, 그 삽입을
 * 막지 못하고 그 대기를 뒤로 미룬다(복원은 그 삽입을 막는 것이 몫이다 — `lockProjectForRestore` 머리말).
 */
export async function lockProjectRow(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectRow')
  await trx.selectFrom('projects').select('id').where('id', '=', projectId).forUpdate().execute()
}

/**
 * **트리 쓰기의 첫 잠금** — 프로젝트 행을 `FOR NO KEY UPDATE`로 잡는다(이월 5차 · 2026-09-23). 형제의 `sort_order`를
 * 다시 매기는 쓰기는 **전부 이것을 맨 먼저** 잡는다: 메뉴 · 페이지의 생성 · 순서 이동 · 소속 이동 · 삭제
 * (`repos/menu.ts` · `repos/pages.ts`). 제목 · 설명만 바꾸는 쓰기는 안 잡는다 — 형제를 안 건드린다.
 *
 * **왜 형제 행이 아니라 프로젝트 행인가 — 고치기 전 값**(api · 실커밋 하네스 · 같은 메뉴 여섯 · 60 회 · 둘이 동시에):
 *
 * | 판 | 교착(`pg_stat_database.deadlocks`) · 500 |
 * |---|---|
 * | 페이지 맨 앞 → 맨 뒤 ∥ 맨 뒤 → 맨 앞 | 11 |
 * | 메뉴(루트) 같은 판 | 35 |
 * | 페이지 두 메뉴 사이 맞바꿈(가 → 나 ∥ 나 → 가) | 51 |
 * | 페이지 순서 이동 ∥ 같은 메뉴의 페이지 삭제 | 21 |
 * | 같은 메뉴에 페이지 생성 둘 | 0 — 대신 **`sort_order`가 겹쳤다**(둘 다 형제 수를 세고 같은 자리에 넣는다) |
 *
 * 원인은 하나다 — 형제를 다시 매기는 `UPDATE … WHERE sort_order BETWEEN …`이 **범위의 행을 스캔 순서로** 잠그고, 옮기는
 * 행은 **맨 끝에** 따로 잠근다. 맨 앞 → 맨 뒤는 «1–5 를 잡고 0 을 기다리고», 맨 뒤 → 맨 앞은 «0–4 를 잡고 5 를
 * 기다린다». 두 메뉴 사이 이동은 «옛 형제 → 새 형제» 순이라 맞바꾸면 거꾸로 선다. 형제 행을 id 순으로 먼저 잡는 길은
 * **빈 형제**(아직 행이 없는 메뉴 — 생성 · 옮겨 넣기)를 못 잠그고, 옮기는 사이 소속이 바뀐 행을 놓친다. 그래서 형제
 * 무리 전부의 위에 있는 행 하나 — 프로젝트 행 — 를 먼저 잡는다. 트리 쓰기끼리는 **줄을 선다**(프로젝트 하나에
 * 하나씩). 오래 걸리는 쓰기가 아니다(수 ms — `write-ledger.tsx`의 표).
 *
 * **잠금 순서는 «프로젝트 행 → 메뉴 · 페이지 행 → 멤버 행(재확인)»이다** — 복원(`lockProjectForRestore`) · 프로젝트
 * 삭제(`routes/projects.ts`)와 같은 방향이다. 그 둘의 `FOR UPDATE`와는 충돌해 **기다린다**(고리가 아니다 — 그쪽도
 * 프로젝트 행이 먼저다).
 *
 * **`FOR NO KEY UPDATE`인 까닭** — FK 삽입(코멘트 · 스냅샷 · 초대 · 토큰)이 부모 행에 거는 `FOR KEY SHARE`와 충돌하지
 * 않는다. `FOR UPDATE`면 트리 쓰기 하나가 그 프로젝트의 모든 FK 삽입을 세운다. 프로젝트 수정(`UPDATE projects`)과는
 * 서로 기다린다.
 *
 * 대상이 없으면(그 사이 지워졌다) 아무것도 안 잡는다 — 뒤의 조회가 `null`을 보고 404 가 된다.
 */
export async function lockProjectTree(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectTree')
  await trx.selectFrom('projects').select('id').where('id', '=', projectId).forNoKeyUpdate().execute()
}

/**
 * 프로젝트를 갱신한다. `patch`에 있는 필드만 바뀐다 — 나머지는 기존 값을 유지한다.
 * 호출자(`routes/projects.ts`)가 이미 "적어도 하나는 있다"를 검증했다고 가정한다.
 *
 * slug를 바꿀 때 다른 프로젝트가 이미 그 slug를 쓰고 있으면 유니크 위반이 나므로,
 * `insertProject`와 같은 이유로 `withTransaction`에 감싸 그 실패를 격리한 뒤
 * `DuplicateSlugError`로 바꿔 던진다.
 *
 * `executeTakeFirst`를 쓴다(`OrThrow`가 아니다) — `projectGuard`의 권한 확인과 이
 * UPDATE 사이에 그 프로젝트가 삭제되는 경합이 나면 대상 행이 없어 정상적으로
 * 아무것도 갱신하지 못한다. 이때 `null`을 돌려준다: `GET /:projectId`
 * (`routes/projects.ts`)가 같은 경합을 `notFound()`로 다루는 것과 같은 취급이다 —
 * `OrThrow`로 던지게 두면 호출자가 잡지 않는 예외가 되어 500이 났다.
 */
export async function updateProject(
  db: DbHandle,
  projectId: string,
  patch: { name?: string; slug?: string; description?: string | null },
): Promise<ProjectRecord | null> {
  assertNoNulBytes(PROJECT_TEXT, patch.name, patch.description)
  try {
    const row = await withTransaction(db, (trx) =>
      trx
        .updateTable('projects')
        .set({ ...patch, updated_at: sql`now()` })
        .where('id', '=', projectId)
        .returning(['id', 'name', 'slug', 'description'])
        .executeTakeFirst(),
    )
    return row ?? null
  } catch (error) {
    if (isSlugUniqueViolation(error)) {
      throw new DuplicateSlugError()
    }
    throw error
  }
}

/**
 * 프로젝트를 지운다. `ON DELETE CASCADE`가 `project_members`·`menu_nodes`·`pages`를
 * 함께 지운다 — 이 함수는 그 사실을 알 필요 없이 `projects` 행 하나만 지우면 된다.
 *
 * `withTransaction`으로 감싼다. 이 함수가 처음 쓰였을 때는 `projects`를 RESTRICT로
 * 참조하는 테이블이 없어 실제로 감쌀 이유가 없었지만, 이후 `menu_nodes.parent_id`·
 * `pages.menu_node_id`에 `ON DELETE RESTRICT` FK가 생겼다(`0003-menu-nodes`·
 * `0004-pages`). 이 DELETE 자체는 여전히 살아 있다 — `menu_nodes`/`pages`는
 * `project_id`를 통해 CASCADE로 참조하므로, Postgres가 그 CASCADE로 큐에 넣은
 * 삭제들을 RESTRICT 제약 검사보다 먼저 처리해 실측으로도 매번 성공한다(중첩
 * 메뉴 트리·페이지가 있어도). 그래도 감싸는 이유는 `repos/`의 다른 쓰기 경로와
 * 같다 — 이 문장이 실패할 수 있는 경로(FK 제약)가 이제 존재하는 이상, 세이브포인트
 * 없이 실패하면 호출자의 트랜잭션이 `25P02`로 오염된다는 사실 자체가 이 함수를
 * 예외로 둘 근거를 없앤다(`src/db/tx.ts` 참고).
 */
export async function deleteProject(db: DbHandle, projectId: string): Promise<void> {
  await withTransaction(db, (trx) => trx.deleteFrom('projects').where('id', '=', projectId).execute())
}
