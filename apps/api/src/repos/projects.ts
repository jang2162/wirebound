/**
 * 프로젝트 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/projects.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 */
import { DatabaseError } from 'pg'
import { sql } from 'kysely'
import { withTransaction, type DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'

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
 * 프로젝트를 만들고, 생성자를 **같은 트랜잭션 안에서** owner로 `project_members`에
 * 넣는다. 둘 중 하나만 성공하는 상태가 생기면 안 된다 — 주인 없는 프로젝트는
 * 아무도 접근할 수 없는 채로 영원히 남는다(설계 §10).
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
  try {
    return await withTransaction(db, async (trx) => {
      const project = await trx
        .insertInto('projects')
        .values({ name: input.name, slug: input.slug, description: input.description })
        .returning(['id', 'name', 'slug', 'description'])
        .executeTakeFirstOrThrow()

      await trx
        .insertInto('project_members')
        .values({ project_id: project.id, user_id: ownerId, role: 'owner' })
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
