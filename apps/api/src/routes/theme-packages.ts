/**
 * **테마 패키지 읽기** — `/api/theme-packages` 아래(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「읽기 경로」).
 *
 * **로그인한 사람 누구나 · 세션 전용이다** — `:projectId` 가 없어 API 토큰은 인증되지 않는다(`auth/plugin.ts`). CLI · MCP 가 읽어야
 * 하는 것(프로젝트가 고정한 manifest)은 `:projectId` 라우트(`routes/project-theme.ts`)로 낸다.
 *
 * 숨긴 판은 목록에서 관리자에게만 실린다. manifest · 파일은 숨긴 판도 낸다 — 이미 고정한 프로젝트 · 스냅샷이 그려져야 한다.
 */
import { unzipSync } from 'fflate'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { compareVersions } from '@wirebound/themes'
import { notFound } from '../errors'
import { parseParams } from '../http/parse'
import { findThemePackage, listThemePackages, readThemePackageFiles, type ThemePackageRow } from '../repos/theme-packages'
import { isInstanceAdmin } from '../repos/users'

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

const PackageParams = z.object({ themeId: z.string().min(1), version: z.string().min(1) })
const FileParams = PackageParams.extend({ '*': z.string() })

/**
 * 패키지 안 파일의 형식. 허용 목록(`readWbtheme` 이 업로드 때 거른다)과 같은 확장자만 든다. 텍스트는 charset 을 싣는다 — 안 실으면
 * 브라우저가 한글 주석 · 문자열이 든 `theme.js` 를 지역 인코딩으로 읽는다.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

/**
 * `id@version` 의 파일은 바뀌지 않는다(행은 `hidden_at` 말고 안 바뀐다) — 한 번 받은 것을 다시 묻지 않게 한다. `private` 는 로그인한
 * 사람에게만 내는 응답이라 공유 캐시에 안 남기려는 것이다.
 */
const IMMUTABLE = 'private, max-age=31536000, immutable'

export function themePackageRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * 테마별 판 목록 — 테마 id 순, 판은 semver 가 큰 것부터. `latest` 는 숨기지 않은 판의 semver 최대(«새 버전 있음» 표시)이고,
     * 이름 · 설명은 그 판의 것이다(다 숨었으면 가장 큰 판).
     *
     * **관리자 판정은 요청마다 DB 에서 읽는다** — 강등 직후 다음 요청부터 숨긴 판이 빠진다.
     */
    app.get('/', { preHandler: app.requireAuth }, async (request) => {
      const admin = request.currentUser !== null && (await isInstanceAdmin(app.db, request.currentUser.id))
      const rows = await listThemePackages(app.db, { includeHidden: admin })
      const themes = new Map<string, ThemePackageRow[]>()
      for (const row of rows) themes.set(row.themeId, [...(themes.get(row.themeId) ?? []), row])
      return [...themes.entries()].map(([themeId, versions]) => {
        const latest = versions.filter((row) => row.hiddenAt === null).sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
        const face = latest ?? versions[0]!
        return {
          themeId,
          name: face.name,
          description: face.description,
          latest: latest?.version ?? null,
          versions: versions.map(themeVersionView),
        }
      })
    })

    app.get('/:themeId/:version/manifest', { preHandler: app.requireAuth }, async (request) => {
      const { themeId, version } = parseParams(PackageParams, request.params)
      const row = await findThemePackage(app.db, themeId, version)
      if (row === null) throw notFound('테마 패키지를 찾을 수 없습니다')
      return row.manifest
    })

    /**
     * 패키지 안의 파일 하나. **zip 안 이름과 정확히 같을 때만 낸다** — 경로를 풀거나 고치지 않으므로 `..` · `./` · 대소문자가 다른
     * 이름은 없는 파일이다(zip 안에는 업로드 검증이 `..` · 절대 경로를 막은 이름만 있다). 요청한 한 항목만 푼다.
     */
    app.get('/:themeId/:version/files/*', { preHandler: app.requireAuth }, async (request, reply) => {
      const { themeId, version, '*': path } = parseParams(FileParams, request.params)
      const bytes = await readThemePackageFiles(app.db, themeId, version)
      if (bytes === null) throw notFound('테마 패키지를 찾을 수 없습니다')
      const found = path === '' || path.endsWith('/') ? undefined : unzipSync(bytes, { filter: (file) => file.name === path })[path]
      const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
      const type = CONTENT_TYPES[extension]
      if (found === undefined || type === undefined) throw notFound('패키지에 그 파일이 없습니다')
      return reply
        .type(type)
        .header('cache-control', IMMUTABLE)
        .header('x-content-type-options', 'nosniff')
        .send(Buffer.from(found.buffer, found.byteOffset, found.byteLength))
    })
  }
}
