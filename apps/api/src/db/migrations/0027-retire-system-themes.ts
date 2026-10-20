import { sql, type Kysely, type Migration } from 'kysely'
import { compareVersions, migrateTokens, type ThemeManifest } from '@wirebound/themes'

/**
 * **저장소가 더는 내지 않는 시스템 테마 넷을 쓰던 프로젝트를 `system-admin` 으로 옮기고 그 패키지를 숨긴다.**
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `projects.theme_*` | 넷 가운데 하나에 고정한 프로젝트 → `system-admin` 의 최신(숨기지 않은 판의 semver 최대) · 토큰은 이어지는 것만 · `theme_rev` + 1 |
 * | `theme_packages.hidden_at` | 넷의 판 가운데 숨기지 않은 것을 지금 시각으로 숨긴다 |
 *
 * **패키지 행은 지우지 않는다** — 행은 불변이고 지우는 길이 없다(`0019` 머리말). 판 3 스냅샷이 넷 가운데 하나를 가리키면 복원은 그 행이
 * 있어야 선다(없으면 `missing-theme` 로 복원 전체가 멈춘다 — `services/restore.ts` 의 6′단계). 숨김은 새로 고르기만 막는다.
 *
 * **토큰은 owner 가 화면에서 테마를 바꿀 때와 같은 값이다** — `migrateTokens`(설정 화면 · `GET …/theme/impact` 가 부르는 한 함수)로 키 ·
 * 타입이 같은 값을 잇고, `PUT …/theme` 처럼 새 기본값과 같은 값을 뺀다. 옛 토큰은 이미 길이 · 전체 한도를 지난 값이라 그 부분집합도 지난다.
 *
 * `system-admin` 에 숨기지 않은 판이 없으면(시딩 전의 DB) 바인딩을 비운다 — api 기동이 `system-admin` 최신으로 채운다
 * (`services/system-themes.ts` 의 `backfillProjectThemes`).
 *
 * **`down` 은 되돌리지 않는다.** 옮기기 전의 바인딩 · 토큰과 «원래 숨겼던 판» 을 적어 두지 않았다 — 숨김을 다 풀면 관리자가 마이그레이션
 * 전에 숨긴 판이 고를 수 있게 된다. 되돌린 배포에서 넷을 다시 쓰려면 관리자가 테마 관리 화면에서 판을 되살린다.
 */
const RETIRED = ['system-commerce', 'system-docs', 'system-portal', 'system-saas-marketing']
const TARGET = 'system-admin'

export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const targets = await sql<{ version: string; manifest: ThemeManifest }>`
      select version, manifest from theme_packages where theme_id = ${TARGET} and hidden_at is null
    `.execute(db)
    const latest = targets.rows.reduce<{ version: string; manifest: ThemeManifest } | null>(
      (best, row) => (best === null || compareVersions(row.version, best.version) > 0 ? row : best),
      null,
    )

    const projects = await sql<{ id: string; manifest: ThemeManifest; tokens: Record<string, string | number> }>`
      select p.id, t.manifest, p.theme_tokens as tokens
      from projects p join theme_packages t on t.theme_id = p.theme_id and t.version = p.theme_version
      where p.theme_id in (${sql.join(RETIRED)})
      order by p.id
    `.execute(db)
    for (const project of projects.rows) {
      if (latest === null) {
        await sql`
          update projects set theme_id = null, theme_version = null, theme_tokens = '{}', theme_rev = theme_rev + 1 where id = ${project.id}
        `.execute(db)
        continue
      }
      const items = latest.manifest.tokens.items
      const tokens = Object.fromEntries(
        Object.entries(migrateTokens(project.manifest, latest.manifest, project.tokens).tokens).filter(
          ([key, value]) => value !== items[key]!.default,
        ),
      )
      await sql`
        update projects
        set theme_id = ${TARGET}, theme_version = ${latest.version}, theme_tokens = ${JSON.stringify(tokens)}, theme_rev = theme_rev + 1
        where id = ${project.id}
      `.execute(db)
    }

    await sql`update theme_packages set hidden_at = now() where theme_id in (${sql.join(RETIRED)}) and hidden_at is null`.execute(db)
  },

  async down(): Promise<void> {},
}
