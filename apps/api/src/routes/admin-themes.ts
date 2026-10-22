/**
 * **관리자 테마 라우트** — `/api/admin` 아래. 테마 패키지 업로드 · 버전 숨김과 되살림 · 스타터 템플릿 내려받기
 * (spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「업로드 · 버전 · 인스턴스 관리자」).
 *
 * **세션 전용이다** — `:projectId` 가 없어 API 토큰은 인증되지 않는다(`auth/plugin.ts`). 관리자 동작은 인스턴스 범위라 프로젝트
 * 범위의 토큰에 맞지 않는다(spec 「이 설계가 다루지 않는 것」 — `wb-theme publish`).
 *
 * **입구는 `requireAuth` 하나이고 관리자 판정은 핸들러 첫 줄이다**(`auth/admin.ts` 의 머리말). 쓰기(업로드 · 숨김)는 쓰는 문장
 * 뒤 같은 트랜잭션에서 자격 · 관리자 표시를 다시 본다(`recheckInstanceAdmin`).
 *
 * **프로젝트 잠금에 서지 않는다** — 쓰는 행은 `theme_packages` 하나이고 프로젝트 행을 안 잡는다(`test/guard-in-lock.test.ts` 의
 * `NOT_LOCKED`).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { SDK_VERSION } from '@wirebound/theme-sdk/version'
import { readWbtheme, satisfiesSdk, WBTHEME_LIMITS } from '@wirebound/themes'
import { recheckInstanceAdmin, requireInstanceAdmin } from '../auth/admin'
import type { ApiConfig } from '../config'
import { withTransaction } from '../db/tx'
import { badRequest, conflict, notFound, validationFailed, type ApiErrorIssue } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { DuplicatePackageError, insertThemePackage, setThemePackageHidden } from '../repos/theme-packages'
import { SYSTEM_THEME_PREFIX } from '../services/system-themes'
import { themeVersionView } from './theme-packages'

const PackageParams = z.object({ themeId: z.string().min(1), version: z.string().min(1) })
const HideBody = z.strictObject({ hidden: z.boolean() })

/** 업로드가 받는 본문 형식. 둘 다 zip 바이트 그대로다 — multipart 를 안 쓴다(새 런타임 의존 없이 웹이 `fetch(url, { body: file })` 로 보낸다). */
const ZIP_TYPES = ['application/zip', 'application/octet-stream']

const REJECTED = '테마 패키지를 받지 않았습니다'

export function adminThemeRoutes(config: ApiConfig) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * 업로드는 zip 본문만 받는 하위 플러그인에 둔다 — 이 범위의 파서를 전부 걷고 zip 둘만 건다. 그래서 JSON 본문은 핸들러에 닿기
     * 전에 Fastify 가 415 로 끊는다. 상한은 패키지 상한(`WBTHEME_LIMITS.zipBytes` — 10 MB)이고 넘으면 413 이다(앱 기본 1 MiB 를
     * 이 라우트만 넓힌다).
     */
    await app.register(async (zipOnly) => {
      zipOnly.removeAllContentTypeParsers()
      zipOnly.addContentTypeParser(ZIP_TYPES, { parseAs: 'buffer', bodyLimit: WBTHEME_LIMITS.zipBytes }, (_request, body, done) =>
        done(null, body),
      )

      zipOnly.post('/theme-packages', { preHandler: app.requireAuth, bodyLimit: WBTHEME_LIMITS.zipBytes }, async (request, reply) => {
        const userId = await requireInstanceAdmin(app.db, request)
        if (!Buffer.isBuffer(request.body)) {
          throw badRequest('본문에 .wbtheme(zip) 바이트를 싣습니다')
        }
        const bytes = request.body

        // 코드는 실행하지 않는다 — 크기 · 경로 · 허용 목록 · 링크 · manifest 를 읽기만 한다.
        const { files, issues } = readWbtheme(bytes)
        if (files === null) {
          throw validationFailed(
            REJECTED,
            issues.map((issue): ApiErrorIssue => ({
              code: issue.code,
              path: issue.path,
              message: issue.message,
              ...(issue.manifestCode === undefined ? {} : { manifestCode: issue.manifestCode }),
            })),
          )
        }
        const { manifest } = files
        if (manifest.id.startsWith(SYSTEM_THEME_PREFIX)) {
          throw validationFailed(REJECTED, [
            {
              code: 'reserved-id',
              path: 'manifest.json:id',
              message: `\`${SYSTEM_THEME_PREFIX}\` 로 시작하는 id 는 시스템 테마의 것입니다`,
            },
          ])
        }
        if (!satisfiesSdk(manifest.sdk, SDK_VERSION)) {
          throw validationFailed(REJECTED, [
            {
              code: 'sdk-incompatible',
              path: 'manifest.json:sdk',
              message: `호스트 SDK ${SDK_VERSION} 이 manifest 의 sdk 범위(${manifest.sdk}) 밖입니다`,
            },
          ])
        }

        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const row = await withTransaction(app.db, async (trx) => {
          let inserted
          try {
            inserted = await insertThemePackage(trx, { manifest, bytes, sha256, uploadedBy: userId })
          } catch (error) {
            if (error instanceof DuplicatePackageError) throw conflict(error.message)
            throw error
          }
          await recheckInstanceAdmin(trx, request)
          return inserted
        })
        return reply.status(201).send({ themeId: row.themeId, version: row.version, name: row.name, sha256: row.sha256, size: row.size })
      })
    })

    /** 숨김 · 되살림. 숨긴 판은 새로 고를 수 없고 이미 고정한 프로젝트 · 스냅샷은 그대로 쓴다(spec 「버전과 숨김」). */
    app.patch('/theme-packages/:themeId/:version', { preHandler: app.requireAuth }, async (request) => {
      await requireInstanceAdmin(app.db, request)
      const { themeId, version } = parseParams(PackageParams, request.params)
      const body = parseBody(HideBody, request.body)
      const row = await withTransaction(app.db, async (trx) => {
        const updated = await setThemePackageHidden(trx, themeId, version, body.hidden)
        if (updated === null) throw notFound('테마 패키지를 찾을 수 없습니다')
        await recheckInstanceAdmin(trx, request)
        return updated
      })
      return themeVersionView(row)
    })

    /**
     * 스타터 템플릿 zip — 저장소 빌드(`pnpm build:template` → kit 의 `pack-template`)가 지어 둔 파일을 그대로 낸다. 서버는 짓지
     * 않는다(짓는 데 SDK · kit 의 pnpm pack 이 든다).
     */
    app.get('/theme-template.zip', { preHandler: app.requireAuth }, async (request, reply) => {
      await requireInstanceAdmin(app.db, request)
      if (!existsSync(config.themeTemplateZip)) {
        throw notFound('템플릿이 빌드되지 않았습니다 — `pnpm build:template`')
      }
      return reply
        .type('application/zip')
        .header('content-disposition', 'attachment; filename="wirebound-theme-starter.zip"')
        .send(readFileSync(config.themeTemplateZip))
    })
  }
}
