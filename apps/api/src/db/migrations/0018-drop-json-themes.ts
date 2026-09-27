import { sql, type Kysely, type Migration } from 'kysely'

/**
 * **옛 JSON 테마를 걷는다** — 테마는 코드 패키지가 된다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`).
 * 레이아웃의 테마 참조 · 테마 표를 지우고, 저장된 스냅샷 payload 를 판 2 로 고친다 — `themes` 를 걷고 레이아웃마다 `themeId` 를
 * 걷는다(규격이 `z.strictObject`라 남기면 판 2 규격이 옛 스냅샷을 못 읽는다 — `@wirebound/themes`의 `snapshot/payload.ts`).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    // 레이아웃의 차례는 배열 순서 그대로다(`WITH ORDINALITY`).
    await sql`
      UPDATE snapshots SET payload = jsonb_set(
        payload - 'themes',
        '{layouts}',
        coalesce(
          (SELECT jsonb_agg(layout - 'themeId' ORDER BY ord)
             FROM jsonb_array_elements(payload->'layouts') WITH ORDINALITY AS t(layout, ord)),
          '[]'::jsonb
        )
      ) || '{"payloadVersion": 2}'::jsonb
      WHERE (payload->>'payloadVersion')::int = 1
    `.execute(db)
    await db.schema.alterTable('layouts').dropColumn('theme_id').execute()
    await db.schema.dropTable('themes').execute()
  },

  // **`down` 은 모양만 되살린다** — 테마 행과 스냅샷의 테마는 돌아오지 않는다(판 1 로 되돌리며 `themes` 는 빈 배열, 레이아웃의
  // `themeId` 는 `null`). 표와 칸은 0006 · 0007 의 `up` 과 같은 모양이다 — 그래야 그 둘의 `down` 이 돈다
  // (`test/global-setup.ts`가 매 실행 latest → none → latest 를 왕복한다).
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('themes')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.references('projects.id').onDelete('cascade'))
      .addColumn('slug', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('extends_ref', 'text')
      .addColumn('version', 'text', (col) => col.notNull())
      .addColumn('preview', 'text')
      .addColumn('tokens', 'json')
      .addColumn('primitives', 'json')
      .addColumn('components', 'json')
      .addColumn('patterns', 'json')
      .addColumn('assets', 'json')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('themes_project_slug_key', ['project_id', 'slug'], (builder) => builder.nullsNotDistinct())
      .execute()
    await db.schema.createIndex('themes_project_idx').on('themes').column('project_id').execute()
    await db.schema
      .alterTable('layouts')
      .addColumn('theme_id', 'uuid', (col) => col.references('themes.id').onDelete('restrict'))
      .execute()
    await sql`
      UPDATE snapshots SET payload = jsonb_set(
        payload,
        '{layouts}',
        coalesce(
          (SELECT jsonb_agg(layout || '{"themeId": null}'::jsonb ORDER BY ord)
             FROM jsonb_array_elements(payload->'layouts') WITH ORDINALITY AS t(layout, ord)),
          '[]'::jsonb
        )
      ) || '{"payloadVersion": 1, "themes": []}'::jsonb
      WHERE (payload->>'payloadVersion')::int = 2
    `.execute(db)
  },
}
