import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **레이아웃 표(`layouts`)와 `projects.default_layout_id` 를 걷고 스냅샷 payload 의 `layouts` 를 걷는다.** 페이지 레이아웃은 문서의 필드(`schema.layout`
 * — `0037-page-layout`)이고 틀은 테마가 그린다 — 사람이 짓는 레이아웃 문서(`Page > Slot`)는 편집 화면도 고르는 길도 없이 프로젝트마다 하나씩
 * 만들어지기만 했다.
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `projects.default_layout_id` | 걷는다(먼저 — `layouts` 를 가리키는 FK 다) |
 * | `layouts` | 걷는다 — 행째 |
 * | `snapshots.payload` | 판 4 이하에서 `layouts` 키만 뺀다 — 판 숫자는 그대로다 |
 *
 * **판 숫자를 5 로 올리지 않는다** — 복원이 판 숫자로 갈래를 가른다(`services/restore-plan.ts` 11 · 12단계: 판 2 이하는 `theme` 가, 판 3 이하는
 * `codes` 가 들어 있어도(손댄 payload) 바인딩 · 표를 안 건드린다). 올리면 손댄 판 3 의 `codes` 가 판 5 의 것이 되어 표를 덮는다. `layouts` 가 없는
 * 판 4 이하는 지금 규격이 읽는다(`@wirebound/themes` 의 `snapshot/payload.ts` 「레이아웃 표를 담지 않는다 — 판 5」).
 *
 * **`down` 은 표 · 칼럼을 빈 채로 다시 세우고 판 5 payload 를 판 4 로 내리며 모든 payload 에 `layouts: []` 를 싣는다 — 레이아웃 행은 다시 짓지
 * 않는다.** 걷기 전 판의 코드는 빈 표에서 그대로 돈다(그 판의 규격은 판 4 이하에 `layouts` 를 묻는다): 스냅샷 복원은 payload 와 지금의 레이아웃 id 집합(둘 다 빈 집합)을 견줘 맞고, 그 판의 프로젝트 만들기는 제
 * 기본 레이아웃을 짓는다. 행을 다시 지으면 내린 판의 복원이 `layouts: []` 와 견줘 409 로 막히고, 그 아래 `0025` · `0028` · `0029` 의 `down` 이
 * 레이아웃 행 수로 «백업에서 되돌린다» 에 멈춘다. 잃는 것은 걷기 전 레이아웃 행의 id 뿐이다(그 문서는 `Page > Slot` 이었고 아무것도 그리지 않았다).
 *
 * **이 파일은 걷는 판의 뜻으로 얼어 있다 — 고치지 않는다.**
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('projects').dropColumn('default_layout_id').execute()
    await db.schema.dropTable('layouts').execute()
    await sql`
      update snapshots set payload = payload - 'layouts'
      where (payload->>'payloadVersion')::int <= 4
    `.execute(db)
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('layouts')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('schema', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()
    await db.schema.createIndex('layouts_project_idx').on('layouts').column('project_id').execute()
    await db.schema
      .alterTable('projects')
      .addColumn('default_layout_id', 'uuid', (col) => col.references('layouts.id').onDelete('set null'))
      .execute()
    await sql`
      update snapshots set payload = payload || jsonb_build_object(
        'payloadVersion', least((payload->>'payloadVersion')::int, 4),
        'layouts', '[]'::jsonb
      )
      where (payload->>'payloadVersion')::int <= 5
    `.execute(db)
  },
}
