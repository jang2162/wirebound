/**
 * **프로젝트의 테마 바인딩** — `/api/projects/:projectId/theme`(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「프로젝트
 * 쪽: 선택 · 토큰 · 스냅샷」). 읽기 · impact 는 viewer, 저장은 owner 다.
 *
 * **`:projectId` 라우트라 API 토큰도 닿는다** — CLI · MCP 의 lint 가 프로젝트가 고정한 manifest 를 여기서 읽는다(`/api/theme-packages`
 * 는 세션 전용이다).
 *
 * # 저장의 규칙
 *
 * - **`rev` 가 저장된 `theme_rev` 와 다르면 409** 와 지금 값(GET 과 같은 모양의 `current`). 핸들러가 읽은 바탕과 견주고, 갱신 문장이
 *   같은 조건으로 다시 거른다(`updateProjectTheme`).
 * - **숨긴 판은 지금 고정한 그 `id@version` 일 때만** 받는다 — 토큰만 고치는 저장이다. 숨긴 판으로 새로 바꾸면 422 `hidden-version`.
 * - 토큰은 대상 manifest 로 검증한다(`services/theme-tokens.ts` 의 `checkBindingTokens` — 이슈가 하나라도 있으면 422). 저장 전에
 *   기본값과 같은 값을 뺀다. 판 3 복원도 같은 함수를 지난다(그쪽은 이슈가 난 키를 버린다).
 * - 커밋 직전에 역할 · 자격을 다시 보고(`recheckProjectRole`), 커밋 뒤 `theme-changed` 를 방송한다.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { ThemeManifest } from '@wirebound/themes'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import type { DbHandle } from '../db/tx'
import { withTransaction } from '../db/tx'
import { notFound, validationFailed, type ApiErrorIssue } from '../errors'
import { parseBody, parseParams, parseQuery } from '../http/parse'
import { findProjectTheme, updateProjectTheme, type ProjectThemeBinding } from '../repos/projects'
import { findThemePackage, latestVisiblePackage } from '../repos/theme-packages'
import { computeThemeImpact } from '../services/theme-impact'
import { checkBindingTokens } from '../services/theme-tokens'
import { notifyThemeChanged } from '../ws/notify'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const ThemeBody = z.strictObject({
  themeId: z.string().min(1),
  version: z.string().min(1),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])),
  rev: z.number().int().min(0),
})
const ImpactQuery = z.object({ themeId: z.string().min(1), version: z.string().min(1) })

const REJECTED = '테마를 저장하지 않았습니다'

/**
 * GET · PUT · 409 의 `current` 가 같은 모양이다. `latestName` 은 `latest` 판의 이름 — 테마 목록의 테마 이름과 같은 판이라, 설정의 지금 테마
 * 요약이 고정한 판의 이름(옛 판이면 옛 이름) 대신 그린다.
 */
async function themeView(db: DbHandle, binding: ProjectThemeBinding, manifest?: ThemeManifest | null) {
  const resolved =
    manifest !== undefined
      ? manifest
      : binding.themeId === null || binding.version === null
        ? null
        : ((await findThemePackage(db, binding.themeId, binding.version))?.manifest ?? null)
  const latest = binding.themeId === null ? null : await latestVisiblePackage(db, binding.themeId)
  return {
    themeId: binding.themeId,
    version: binding.version,
    tokens: binding.tokens,
    rev: binding.rev,
    manifest: resolved,
    latest: latest?.version ?? null,
    latestName: latest?.name ?? null,
  }
}

/** 받은 토큰을 검증하고 기본값과 같은 것을 뺀다. 이슈가 있으면 422 로 던진다. */
function cleanTokens(manifest: ThemeManifest, tokens: Record<string, string | number>): Record<string, string | number> {
  const checked = checkBindingTokens(manifest, tokens)
  if (checked.issues.length > 0) {
    throw validationFailed(
      REJECTED,
      checked.issues.map(({ code, path, message }): ApiErrorIssue => ({ code, path, message })),
    )
  }
  return checked.tokens
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
      // 아래 판정(숨긴 판)의 바탕은 트랜잭션 밖에서 읽은 `current` 다. «바탕을 읽은 뒤 안 바뀌었다» 를 두 겹이 함께 선다 — 여기서
      // 요청의 `rev` 가 읽은 바탕의 `rev` 와 같은지 보고, 갱신 문장이 같은 `rev` 로 거른다(읽은 뒤 · 갱신 전에 남이 저장한 판).
      // 여기를 떼면 옮긴 뒤의 `rev` 를 짐작해 실은 요청이 옛 바탕으로 숨김 판정을 지나 숨긴 판을 새로 고른다(`project-theme-review.test.ts`
      // «숨긴 판을 다시 고르는 경주»). 행을 잠가 다시 읽는 길은 잠금 순서 인구조사를 넓혀 고르지 않았다.
      if (current.rev !== body.rev) return sendConflict(reply, await themeView(app.db, current))
      const pinned = current.themeId === body.themeId && current.version === body.version
      if (target.hiddenAt !== null && !pinned) {
        throw validationFailed(REJECTED, [
          { code: 'hidden-version', path: 'version', message: `숨긴 버전은 새로 고를 수 없습니다: ${body.themeId}@${body.version}` },
        ])
      }
      const tokens = cleanTokens(target.manifest, body.tokens)

      const saved = await withTransaction(app.db, async (trx) => {
        const updated = await updateProjectTheme(trx, projectId, { themeId: body.themeId, version: body.version, tokens }, body.rev)
        // **커밋 순간의 권한 — 0 행(남이 먼저 저장했다)도 재확인한다.** 갱신이 행 잠금을 기다린 사이 빠지거나 내려간 사람이 아래 409 의
        // `current`(지금 테마 · 판 · 토큰 · rev)를 받으면 처음부터 그 자리였던 사람의 가드 응답과 갈린다. 던지면 이 트랜잭션째 되돌아간다.
        await recheckProjectRole(trx, request)
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
