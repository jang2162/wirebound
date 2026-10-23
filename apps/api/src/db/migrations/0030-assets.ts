import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * 그림 저장 — 설계 spec `2026-10-24-compose-input-design.md` «9. 그림 저장». **내용 주소(sha256) 덩이 + 소유 행**이다.
 *
 * | 표 | 무엇 |
 * |---|---|
 * | `asset_blobs` | 바이트 한 벌. `sha256` 이 이름이다(같은 그림은 한 행). `mime` · `size` 와 올릴 때 잰 원래 크기(`width` · `height` — SVG 는 viewBox) |
 * | `project_assets` | 프로젝트가 가진 그림. 프로젝트와 함께 지워진다(`ON DELETE CASCADE`). 올린 사람이 지워지면 `uploaded_by` 만 빈다 |
 * | `personal_assets` | 사람이 가진 그림(개인 모듈이 든 그림 — Q6). 사람과 함께 지워진다 |
 *
 * **권한은 소유 행이 가른다** — 해시를 안다고 읽을 수 없다. 프로젝트 P 의 읽기는 `project_assets(P, sha)` 가 있어야 선다. 소유 행 → 덩이는
 * `RESTRICT` 다(덩이를 먼저 지울 수 없다).
 *
 * **덩이는 마지막 소유 행과 함께 지워진다**(Q5 — 그림은 프로젝트 · 사람과 함께만 지운다). 두 소유 표의 `AFTER DELETE` 행 트리거가 그 해시의 소유
 * 행이 더 없으면 덩이를 지운다 — 프로젝트 삭제의 CASCADE · 사람 삭제 · 손으로 지운 행이 같은 길을 지난다.
 *
 * 트리거의 차례: ① 다른 소유 행이 보이면 아무것도 안 잡고 끝낸다 ② 안 보이면 덩이 행을 잡고(`FOR UPDATE`) ③ 새 문장에서 다시 세어 그래도 없으면
 * 지운다. ②③ 이 따로인 까닭 — 같은 덩이에 남이 소유 행을 넣는 중이면(그 쪽이 덩이에 `KEY SHARE` — `repos/assets.ts` 의 `holdBlob`) 그 커밋을
 * 기다린 뒤 센 수에 그 행이 든다. 잡지 않고 지우면 커밋 전의 스냅샷으로 «없음» 을 보고 지워 그 삽입이 FK 위반(23503)이 된다. 거꾸로 트리거가
 * 먼저 잡았으면 넣는 쪽이 기다렸다가 덩이가 없는 것을 보고 다시 넣는다(올리기) · «못 읽는 그림» 으로 답한다(가져오기).
 * ① 이 앞에 있는 까닭 — 프로젝트 삭제가 다른 프로젝트와 나눠 가진 덩이까지 잡으면, 그 덩이 여럿을 다른 차례로 잡는 가져오기와 고리를 만든다. 남이
 * 가진 덩이는 잡지 않는다. 가져오기는 출처 프로젝트 행을 먼저 `KEY SHARE` 로 잡아 그 출처의 삭제와 겹치지 않는다(`routes/assets.ts`).
 *
 * 바이트는 DB `bytea` 다 — 테마 패키지(`theme_packages.files`)와 같은 자리. 배포 compose 에 볼륨이 안 늘고 `pg_dump` 백업이 그림을 함께 든다.
 *
 * `down` 은 표 셋과 트리거 함수를 지운다 — 담긴 그림은 되돌릴 수 없다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('asset_blobs')
      .addColumn('sha256', 'text', (col) => col.primaryKey().check(sql`sha256 ~ '^[0-9a-f]{64}$'`))
      .addColumn('bytes', 'bytea', (col) => col.notNull())
      .addColumn('mime', 'text', (col) => col.notNull())
      .addColumn('size', 'integer', (col) => col.notNull())
      .addColumn('width', 'integer', (col) => col.notNull())
      .addColumn('height', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()
    await db.schema
      .createTable('project_assets')
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('sha256', 'text', (col) => col.notNull().references('asset_blobs.sha256').onDelete('restrict'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('uploaded_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addPrimaryKeyConstraint('project_assets_pkey', ['project_id', 'sha256'])
      .execute()
    await db.schema.createIndex('project_assets_sha256_idx').on('project_assets').column('sha256').execute()
    await db.schema
      .createTable('personal_assets')
      .addColumn('owner_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('sha256', 'text', (col) => col.notNull().references('asset_blobs.sha256').onDelete('restrict'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addPrimaryKeyConstraint('personal_assets_pkey', ['owner_id', 'sha256'])
      .execute()
    await db.schema.createIndex('personal_assets_sha256_idx').on('personal_assets').column('sha256').execute()

    await sql`
      CREATE FUNCTION wb_release_asset_blob() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM project_assets WHERE sha256 = OLD.sha256)
           OR EXISTS (SELECT 1 FROM personal_assets WHERE sha256 = OLD.sha256) THEN
          RETURN NULL;
        END IF;
        PERFORM 1 FROM asset_blobs WHERE sha256 = OLD.sha256 FOR UPDATE;
        IF NOT EXISTS (SELECT 1 FROM project_assets WHERE sha256 = OLD.sha256)
           AND NOT EXISTS (SELECT 1 FROM personal_assets WHERE sha256 = OLD.sha256) THEN
          DELETE FROM asset_blobs WHERE sha256 = OLD.sha256;
        END IF;
        RETURN NULL;
      END
      $$
    `.execute(db)
    await sql`CREATE TRIGGER project_assets_release AFTER DELETE ON project_assets FOR EACH ROW EXECUTE FUNCTION wb_release_asset_blob()`.execute(
      db,
    )
    await sql`CREATE TRIGGER personal_assets_release AFTER DELETE ON personal_assets FOR EACH ROW EXECUTE FUNCTION wb_release_asset_blob()`.execute(
      db,
    )
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('personal_assets').execute()
    await db.schema.dropTable('project_assets').execute()
    await db.schema.dropTable('asset_blobs').execute()
    await sql`DROP FUNCTION wb_release_asset_blob()`.execute(db)
  },
}
