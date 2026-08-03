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
 */
export async function updateProject(
  db: DbHandle,
  projectId: string,
  patch: { name?: string; slug?: string; description?: string | null },
): Promise<ProjectRecord> {
  try {
    return await withTransaction(db, (trx) =>
      trx
        .updateTable('projects')
        .set({ ...patch, updated_at: sql`now()` })
        .where('id', '=', projectId)
        .returning(['id', 'name', 'slug', 'description'])
        .executeTakeFirstOrThrow(),
    )
  } catch (error) {
    if (isSlugUniqueViolation(error)) {
      throw new DuplicateSlugError()
    }
    throw error
  }
}

/**
 * 프로젝트를 지운다. `ON DELETE CASCADE`가 `project_members`(그리고 이후 태스크가
 * 추가할 메뉴·페이지)를 함께 지운다 — 이 함수는 그 사실을 알 필요 없이 `projects`
 * 행 하나만 지우면 된다.
 */
export async function deleteProject(db: DbHandle, projectId: string): Promise<void> {
  await db.deleteFrom('projects').where('id', '=', projectId).execute()
}
