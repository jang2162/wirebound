import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `project_view_prefs` — 사람 × 프로젝트마다 편집 캔버스에서 끈 레이아웃 영역. 설계
 * `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「표시 옵션 저장」.
 *
 * | 칸 | 무엇 |
 * |---|---|
 * | `user_id` · `project_id` | 복합 PK. 둘 다 `ON DELETE CASCADE` — 프로젝트를 지우면 함께 지워진다. **멤버에서 빠져도 남는다**(끈 영역 열쇠뿐이라 다시 들어오면 그대로 받는다) |
 * | `hidden_regions` | 끈 영역의 열쇠 목록(jsonb 배열 — «<레이아웃>.<영역 id>»). 열쇠 꼴 · 개수 · 겹침은 저장 경계(`routes/view-prefs.ts`)가 지킨다 |
 *
 * **행이 없으면 다 켠 것이다** — 저장은 끈 것만 든다(테마가 영역을 더하면 켠 채로 선다). 스냅샷 payload 에 싣지 않는다 — 문서가 아니라
 * 사람의 화면 설정이다(`repos/snapshots.ts` 가 이 표를 안 읽는다).
 *
 * `down` 은 표를 지운다 — 담긴 설정은 되돌릴 수 없다(다 켠 판으로 돌아갈 뿐이다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('project_view_prefs')
      .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('hidden_regions', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addPrimaryKeyConstraint('project_view_prefs_pkey', ['user_id', 'project_id'])
      .addCheckConstraint('project_view_prefs_hidden_array', sql`jsonb_typeof(hidden_regions) = 'array'`)
      .execute()
    // 프로젝트 삭제의 CASCADE 가 이 표를 `project_id` 로 찾는다 — PK 의 머리는 `user_id` 라 그 길을 못 탄다.
    await db.schema.createIndex('project_view_prefs_project_idx').on('project_view_prefs').column('project_id').execute()
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('project_view_prefs').execute()
  },
}
