import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `personal_modules` 테이블 — 설계 spec `2026-10-20-personal-modules-design.md` 「소유와 수명」.
 *
 * 개인 모듈은 **사람 하나가 소유하는** 노드 묶음이다. 그 사람이 여는 모든 프로젝트의 «모듈» 탭에 서고, 같은 프로젝트의 다른 멤버에게는 안 보인다.
 * 모양(`nodes` · `name` · 두 시각)은 `modules`(`0024-modules`)와 같고, 다른 것은 소유자다:
 *
 * | 칸 | 무엇 |
 * |---|---|
 * | `owner_id` | `ON DELETE CASCADE` — 사람이 사라지면 그 사람의 도구함도 사라진다(지금 사용자를 지우는 길은 없다). 만든 사람 칸을 따로 두지 않는다 — 소유자가 곧 만든 사람이다 |
 * | `nodes` · `name` · `created_at` · `updated_at` | `modules` 와 같다(그 머리말의 표) |
 *
 * **프로젝트를 가리키는 칸이 없다** — 프로젝트 삭제 · 멤버에서 빠짐 · 역할 바뀜이 이 행에 닿을 길이 없게 하려는 것이다. `modules` 에 소유자 칸을
 * 더해 «프로젝트 하나 또는 사용자 하나» 를 CHECK 로 가르는 판은 프로젝트 삭제의 CASCADE · 앞 잠금(`lockProjectModules`)이 개인 행을 안 건드리는지를
 * 질의의 `where` 하나에 맡긴다. 표를 가르면 그것이 구조다.
 *
 * `down` 은 표를 지운다 — 담긴 개인 모듈은 되돌릴 수 없다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('personal_modules')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('owner_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('nodes', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()
    await db.schema.createIndex('personal_modules_owner_created_idx').on('personal_modules').columns(['owner_id', 'created_at']).execute()
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('personal_modules').execute()
  },
}
