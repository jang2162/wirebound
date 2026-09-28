/**
 * **프로젝트의 테마 바인딩** — `/api/projects/:projectId/theme`(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「프로젝트
 * 쪽: 선택 · 토큰 · 스냅샷」). 읽기 · impact 는 viewer, 저장은 owner 다.
 *
 * **`:projectId` 라우트라 API 토큰도 닿는다** — CLI · MCP 의 lint 가 프로젝트가 고정한 manifest 를 여기서 읽는다(`/api/theme-packages`
 * 는 세션 전용이다).
 *
 * # 저장의 규칙
 *
 * - **`rev` 가 저장된 `theme_rev` 와 다르면 409** 와 지금 값(GET 과 같은 모양의 `current`). 조건은 갱신 문장에 있다(`updateProjectTheme`).
 * - **숨긴 판은 지금 고정한 그 `id@version` 일 때만** 받는다 — 토큰만 고치는 저장이다. 숨긴 판으로 새로 바꾸면 422 `hidden-version`.
 * - 토큰은 대상 manifest 로 검증한다(`tokensCss` 의 이슈면 422). 저장 전에 기본값과 같은 값을 뺀다. 값 하나 `TOKEN_VALUE_MAX` 글자 ·
 *   전체 `TOKENS_JSON_MAX` 바이트가 상한이다.
 * - 커밋 직전에 역할 · 자격을 다시 보고(`recheckProjectRole`), 커밋 뒤 `theme-changed` 를 방송한다.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { tokensCss, type ThemeManifest } from '@wirebound/themes'
import { requestEventActor } from '../auth/actor'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import type { DbHandle } from '../db/tx'
import { withTransaction } from '../db/tx'
import { notFound, validationFailed, type ApiErrorIssue } from '../errors'
import { parseBody, parseParams, parseQuery } from '../http/parse'
import { findProjectTheme, updateProjectTheme, type ProjectThemeBinding } from '../repos/projects'
import { findThemePackage, latestVisibleVersion } from '../repos/theme-packages'
import { computeThemeImpact } from '../services/theme-impact'
import { notifyThemeChanged } from '../ws/notify'

/**
 * 토큰 값 하나의 상한(글자 — UTF-16 단위). 여섯 타입의 정당한 값(색 · 길이 · 글꼴 목록 · 그림자)은 이보다 훨씬 짧다 — 상한은 한 값이
 * `:root` 블록 · 방송 프레임을 부풀리지 못하게 하는 자리다.
 */
export const TOKEN_VALUE_MAX = 200
/** 저장하는 토큰 JSON 전체의 상한(UTF-8 바이트). 바인딩은 `theme-changed` 프레임에 통째로 실린다. */
export const TOKENS_JSON_MAX = 16_384

const ProjectIdParams = z.object({ projectId: z.uuid() })
const ThemeBody = z.strictObject({
  themeId: z.string().min(1),
  version: z.string().min(1),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])),
  rev: z.number().int().min(0),
})
const ImpactQuery = z.object({ themeId: z.string().min(1), version: z.string().min(1) })

const REJECTED = '테마를 저장하지 않았습니다'

/** GET · PUT · 409 의 `current` 가 같은 모양이다. */
async function themeView(db: DbHandle, binding: ProjectThemeBinding, manifest?: ThemeManifest | null) {
  const resolved =
    manifest !== undefined
      ? manifest
      : binding.themeId === null || binding.version === null
        ? null
        : ((await findThemePackage(db, binding.themeId, binding.version))?.manifest ?? null)
  return {
    themeId: binding.themeId,
    version: binding.version,
    tokens: binding.tokens,
    rev: binding.rev,
    manifest: resolved,
    latest: binding.themeId === null ? null : await latestVisibleVersion(db, binding.themeId),
  }
}

/** 받은 토큰을 검증하고 기본값과 같은 것을 뺀다. 이슈가 있으면 422 로 던진다. */
function cleanTokens(manifest: ThemeManifest, tokens: Record<string, string | number>): Record<string, string | number> {
  const tooLong: ApiErrorIssue[] = Object.entries(tokens)
    .filter(([, value]) => typeof value === 'string' && value.length > TOKEN_VALUE_MAX)
    .map(([key, value]) => ({
      code: 'token-too-long',
      path: `tokens.${key}`,
      message: `토큰 값은 ${TOKEN_VALUE_MAX} 글자까지입니다(${String(value).length})`,
    }))
  if (tooLong.length > 0) throw validationFailed(REJECTED, tooLong)

  const { issues } = tokensCss(manifest, tokens)
  if (issues.length > 0) {
    throw validationFailed(
      REJECTED,
      issues.map((issue) => ({ code: issue.code, path: issue.path.replace(/^values\./, 'tokens.'), message: issue.message })),
    )
  }

  const items = manifest.tokens.items
  const kept = Object.fromEntries(Object.entries(tokens).filter(([key, value]) => value !== items[key]!.default))
  const bytes = Buffer.byteLength(JSON.stringify(kept), 'utf8')
  if (bytes > TOKENS_JSON_MAX) {
    throw validationFailed(REJECTED, [
      { code: 'token-too-large', path: 'tokens', message: `토큰 전체는 ${TOKENS_JSON_MAX} 바이트까지입니다(${bytes})` },
    ])
  }
  return kept
}

function sendConflict(reply: FastifyReply, current: Awaited<ReturnType<typeof themeView>>) {
  return reply
    .status(409)
    .send({ error: { code: 'conflict', message: '다른 곳에서 테마를 먼저 저장했습니다 — 지금 값을 보고 다시 저장합니다' }, current })
}

export function projectThemeRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/theme', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const binding = await findProjectTheme(app.db, projectId)
      if (binding === null) throw notFound('프로젝트를 찾을 수 없습니다')
      return themeView(app.db, binding)
    })

    app.put('/:projectId/theme', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(ThemeBody, request.body)

      const target = await findThemePackage(app.db, body.themeId, body.version)
      if (target === null) throw notFound('테마 패키지를 찾을 수 없습니다')
      const current = await findProjectTheme(app.db, projectId)
      if (current === null) throw notFound('프로젝트를 찾을 수 없습니다')
      // 숨긴 판은 새로 고를 수 없다 — 지금 고정한 판이면 토큰만 고치는 저장이다. 이 판정의 바탕(`current`)은 트랜잭션 밖에서 읽었지만
      // 바인딩이 바뀌면 `theme_rev` 도 바뀌므로, 그 사이의 저장은 아래 갱신이 `rev` 로 걸러 409 가 된다.
      const pinned = current.themeId === body.themeId && current.version === body.version
      if (target.hiddenAt !== null && !pinned) {
        throw validationFailed(REJECTED, [
          { code: 'hidden-version', path: 'version', message: `숨긴 버전은 새로 고를 수 없습니다: ${body.themeId}@${body.version}` },
        ])
      }
      const tokens = cleanTokens(target.manifest, body.tokens)

      const saved = await withTransaction(app.db, async (trx) => {
        const updated = await updateProjectTheme(trx, projectId, { themeId: body.themeId, version: body.version, tokens }, body.rev)
        if (updated !== null) await recheckProjectRole(trx, request)
        return updated
      })
      if (saved === null) {
        const now = await findProjectTheme(app.db, projectId)
        if (now === null) throw notFound('프로젝트를 찾을 수 없습니다')
        return sendConflict(reply, await themeView(app.db, now))
      }

      notifyThemeChanged(app, {
        projectId,
        themeId: body.themeId,
        version: body.version,
        tokens: saved.tokens,
        rev: saved.rev,
        actor: requestEventActor(request),
      })
      return themeView(app.db, saved, target.manifest)
    })

    app.get('/:projectId/theme/impact', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const query = parseQuery(ImpactQuery, request.query)
      const target = await findThemePackage(app.db, query.themeId, query.version)
      if (target === null) throw notFound('테마 패키지를 찾을 수 없습니다')
      const binding = await findProjectTheme(app.db, projectId)
      if (binding === null) throw notFound('프로젝트를 찾을 수 없습니다')
      const manifest =
        binding.themeId === null || binding.version === null
          ? null
          : ((await findThemePackage(app.db, binding.themeId, binding.version))?.manifest ?? null)
      return computeThemeImpact(app.db, projectId, { binding, manifest }, target.manifest)
    })
  }
}
