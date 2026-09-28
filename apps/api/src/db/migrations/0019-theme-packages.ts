import { sql, type Kysely, type Migration } from 'kysely'

/**
 * **코드 테마 패키지를 저장하고 프로젝트가 그 하나에 고정된다**(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 * 「업로드 · 버전 · 인스턴스 관리자」 · 「프로젝트 쪽: 선택 · 토큰 · 스냅샷」).
 *
 * | 표 · 칸 | 무엇 |
 * |---|---|
 * | `users.is_instance_admin` | 테마를 올리고 숨기는 사람. 주는 길은 서버의 명령(`db/admin.ts`) · 시딩뿐이다 — API 에 바꾸는 라우트가 없다 |
 * | `theme_packages` | 올린 `.wbtheme` 의 zip 원본(`files`)과 읽어 둔 manifest. 행은 `hidden_at` 말고 안 바뀐다 — 지우는 길이 없다 |
 * | `projects.theme_*` | 그 프로젝트가 고정한 `id@version` · 기본값과 다른 토큰 값 · 낙관적 동시성 번호 |
 *
 * **`manifest` 는 `json` 이다** — 작성자가 적은 키 순서(토큰 · variant 의 차례)가 편집 화면의 차례다. `jsonb` 는 키를 다시 늘어놓는다.
 *
 * **바인딩 칸이 null 을 받는 것이 요점이다** — 마이그레이션은 `.wbtheme` 를 못 본다. 시스템 테마는 api 가 기동할 때 넣고
 * (`services/system-themes.ts` 의 `seedSystemThemes`) 그 자리에서 null 인 프로젝트를 채운다(`backfillProjectThemes`). null 은
 * «아직 고정 안 됨» 이다. 둘 중 하나만 null 인 판은 `projects_theme_pair` 가 막는다.
 *
 * **FK 는 `RESTRICT`** — 스냅샷 · 프로젝트가 `id@version` 을 참조하므로 패키지를 지우면 «그때 그 화면» 이 깨진다.
 * `uploaded_by` 는 `SET NULL` — 사용자를 지워도 패키지는 남는다(null 은 시스템 테마와 같은 표시가 된다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('users')
      .addColumn('is_instance_admin', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute()

    await db.schema
      .createTable('theme_packages')
      .addColumn('theme_id', 'text', (col) => col.notNull())
      .addColumn('version', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('sdk_range', 'text', (col) => col.notNull())
      .addColumn('manifest', 'json', (col) => col.notNull())
      .addColumn('files', sql`bytea`, (col) => col.notNull())
      .addColumn('size', 'integer', (col) => col.notNull())
      .addColumn('sha256', 'text', (col) => col.notNull())
      .addColumn('uploaded_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
      .addColumn('uploaded_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('hidden_at', 'timestamptz')
      .addPrimaryKeyConstraint('theme_packages_pkey', ['theme_id', 'version'])
      .execute()

    await db.schema
      .alterTable('projects')
      .addColumn('theme_id', 'text')
      .addColumn('theme_version', 'text')
      .addColumn('theme_tokens', 'json', (col) => col.notNull().defaultTo(sql`'{}'`))
      .addColumn('theme_rev', 'integer', (col) => col.notNull().defaultTo(0))
      .execute()
    await db.schema
      .alterTable('projects')
      .addForeignKeyConstraint('projects_theme_fk', ['theme_id', 'theme_version'], 'theme_packages', ['theme_id', 'version'], (fk) =>
        fk.onDelete('restrict'),
      )
      .execute()
    await db.schema
      .alterTable('projects')
      .addCheckConstraint('projects_theme_pair', sql`(theme_id IS NULL) = (theme_version IS NULL)`)
      .execute()
  },

  // **`down` 은 바인딩 · 패키지 · 관리자 표시를 버린다.** `test/global-setup.ts` 가 매 실행 latest → none → latest 를 왕복한다.
  // 판 3 스냅샷 payload 는 `theme` 를 걷고 판 2 로 적는다(0018 `down` 이 판 2 를 판 1 로 되돌리는 것과 같은 꼴) — 안 걷으면 되돌린
  // 배포가 판 3 을 `payload-version` 으로 거절해, 이 판에서 찍은 스냅샷(복원의 안전망 포함)으로 돌아갈 수 없다. 바인딩은 돌아오지 않는다.
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`
      UPDATE snapshots SET payload = (payload - 'theme') || '{"payloadVersion": 2}'::jsonb
      WHERE (payload->>'payloadVersion')::int = 3
    `.execute(db)
    await db.schema.alterTable('projects').dropConstraint('projects_theme_pair').execute()
    await db.schema.alterTable('projects').dropConstraint('projects_theme_fk').execute()
    await db.schema
      .alterTable('projects')
      .dropColumn('theme_rev')
      .dropColumn('theme_tokens')
      .dropColumn('theme_version')
      .dropColumn('theme_id')
      .execute()
    await db.schema.dropTable('theme_packages').execute()
    await db.schema.alterTable('users').dropColumn('is_instance_admin').execute()
  },
}
