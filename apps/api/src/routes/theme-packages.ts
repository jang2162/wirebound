/**
 * **테마 패키지 읽기** — `/api/theme-packages` 아래(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「읽기 경로」).
 */
import type { ThemePackageRow } from '../repos/theme-packages'

/** 버전 한 줄의 응답 모양 — 목록의 `versions[]` 와 관리자 숨김(`routes/admin-themes.ts`)의 응답이 같다. */
export function themeVersionView(row: ThemePackageRow) {
  return {
    themeId: row.themeId,
    version: row.version,
    name: row.name,
    preview: row.manifest.preview ?? null,
    hidden: row.hiddenAt !== null,
    size: row.size,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedBy: row.uploadedBy === null ? null : { id: row.uploadedBy, name: row.uploaderName ?? '' },
  }
}
