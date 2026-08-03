import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `projects`·`project_members` 테이블을 만든다.
 *
 * `project_members.role`은 `text`에 `CHECK` 제약을 걸어 `ProjectRole`
 * (`db/types.ts`)과 값 집합을 맞춘다 — Postgres에 별도 enum 타입을 만들지 않는
 * 이유는 이 세 값이 하나뿐인 애플리케이션 상수(auth/roles.ts의 `ROLE_RANK`)에
 * 이미 고정돼 있어, enum이 늘면 `ALTER TYPE ... ADD VALUE`라는 트랜잭션 제약이
 * 있는 별도 마이그레이션 절차가 필요해지기 때문이다. text + CHECK가 다루기 쉽다.
 *
 * PK는 `(project_id, user_id)` 복합키다 — 한 사용자가 같은 프로젝트에 두 개의
 * 역할로 동시에 속할 수 없다는 불변식을 DB가 직접 강제한다.
 *
 * `project_members(user_id)`에 별도 인덱스를 만든다 — PK는 `(project_id, user_id)`
 * 순서라 `user_id`만으로 조회("내가 멤버인 프로젝트 목록")할 때는 이 인덱스를
 * 타지 못한다(PK 인덱스는 project_id가 선두 컬럼이다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('projects')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('slug', 'text', (col) => col.notNull().unique())
      .addColumn('description', 'text')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createTable('project_members')
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('role', 'text', (col) =>
        col.notNull().check(sql`role in ('owner', 'editor', 'viewer')`),
      )
      .addColumn('invited_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addPrimaryKeyConstraint('project_members_pk', ['project_id', 'user_id'])
      .execute()

    await db.schema.createIndex('project_members_user_id_idx').on('project_members').column('user_id').execute()
  },

  // 역순(project_members → projects)으로 DROP한다 — project_members.project_id가
  // projects.id를 참조하므로 순서를 바꾸면 FK 위반으로 실패한다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('project_members').execute()
    await db.schema.dropTable('projects').execute()
  },
}
