import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * 공통코드 표 둘 — 설계 `docs/superpowers/specs/2026-11-10-common-codes-design.md` 「저장」.
 *
 * | 표 | 칸 |
 * |---|---|
 * | `code_groups` | `key`(그룹 키 — 노드가 가리키는 값) · `name` · `sort_order` · UNIQUE `(project_id, key)` · `project_id` CASCADE |
 * | `code_items` | `value`(코드값) · `name` · `sort_order` · `active` · UNIQUE `(group_id, value)` · `group_id` CASCADE |
 *
 * **`key` · `value` 는 만든 뒤 안 바뀐다**(REST 가 받지 않는다) — 노드가 DB id 가 아니라 그 둘로 가리킨다. 글자 규칙은 저장 경계
 * (`routes/codes.ts` — `@wirebound/schema` 의 `CodeKeySchema` 등)가 지킨다. `sort_order` 는 차례일 뿐 유일하지 않다 — 쓰기가 다시 매긴다.
 * `created_at` · `updated_at` 은 `clock_timestamp()` — 한 트랜잭션에서 만든 행도 차례가 갈린다(`0024-modules` 와 같다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('code_groups')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('key', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('sort_order', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addUniqueConstraint('code_groups_project_key_unique', ['project_id', 'key'])
      .execute()
    await db.schema
      .createTable('code_items')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('group_id', 'uuid', (col) => col.notNull().references('code_groups.id').onDelete('cascade'))
      .addColumn('value', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('sort_order', 'integer', (col) => col.notNull())
      .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addUniqueConstraint('code_items_group_value_unique', ['group_id', 'value'])
      .execute()
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('code_items').execute()
    await db.schema.dropTable('code_groups').execute()
  },
}
