/**
 * **그림 라우트** — 설계 spec `2026-10-24-compose-input-design.md` «9. 그림 저장» · «10. 그림과 다른 기능의 경계». 표 · 트리거는
 * `db/migrations/0030-assets.ts`, SQL · 잠금 차례는 `repos/assets.ts`, 꼴 가르기는 `services/asset-format.ts` 다.
 *
 * | 경로 | 권한 | 하는 일 |
 * |---|---|---|
 * | `POST /api/projects/:projectId/assets` | editor · 세션 · 그 프로젝트의 토큰 | 본문이 그림 바이트 그대로(multipart 아님 — 테마 업로드와 같은 꼴) · 머리 `X-Asset-Name`(파일 이름 · `encodeURIComponent`). 새로 넣으면 201, 이미 있으면 200 · 같은 답 |
 * | `GET /api/projects/:projectId/assets` | viewer | 목록 · 쓴 용량 · 한도 |
 * | `GET /api/projects/:projectId/assets/:id` | viewer · 세션 · 토큰 | 바이트(`ASSET_HEADERS`) |
 * | `POST /api/projects/:projectId/assets/claim` | editor · **세션만** | `{ ids, from: { projectId } \| { personal: true } }` — 출처에서 읽을 수 있는 그림만 이 프로젝트에 소유 행을 더한다 |
 * | `POST /api/me/assets/claim` | 세션만 | `{ ids, from: { projectId } }` — 그 프로젝트의 멤버면 개인 몫에 더한다 |
 * | `GET /api/me/assets/:id` | 세션만 · 그 사람 | 개인 몫 바이트 |
 *
 * **해시를 안다고 읽을 수 없다** — 읽기는 그 프로젝트(사람)의 소유 행이 있어야 선다. 남의 그림 · 없는 해시 · 지워진 덩이는 같은 질의 · 같은 404 다.
 * 가져오기(`claim`)가 출처를 읽을 수 있는지 보는 것도 같은 규칙이다 — 못 옮긴 그림의 까닭(`not-readable`)은 «출처에 없음 · 출처의 멤버가 아님 ·
 * 출처가 지워짐» 을 가르지 않는다. **가져오기가 세션만인 까닭** — 토큰은 프로젝트 하나의 스코프라 출처(다른 프로젝트 · 개인 몫)를 읽을 자격이 없다.
 *
 * **쓰기는 커밋 직전에 권한을 다시 본다**(`recheckProjectRole` — 정본 「권한 모델」). 프로젝트 행을 먼저 `KEY SHARE` 로 잡는다 — FK 삽입이 프로젝트
 * 삭제 뒤에 섰다가 깨면 봉투 없는 500 이라(`repos/projects.ts` 의 `lockProjectShared`). 가져오기는 출처 프로젝트 행도 같이 잡는다 — 출처의 삭제와
 * 겹치지 않게(`0030-assets` 머리말 «①»). 잡을 출처가 없으면(지워졌다) 그림마다 `not-readable` 이다.
 *
 * **그림 바이트에는 실시간 방송이 없다** — 그림을 고르는 것은 노드 prop 편집이라 그 편집이 방송된다.
 */
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ASSET_ID_PATTERN } from '@wirebound/schema'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { requireSessionUser } from '../auth/session-only'
import type { AssetLimits } from '../config'
import { assertLocking } from '../db/locking'
import { withTransaction, type DbHandle } from '../db/tx'
import { assetQuota, notFound, tooLarge, unauthenticated, unsupportedMedia, validationFailed } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  addPersonalAsset,
  addProjectAsset,
  claimAssets,
  findProjectAsset,
  holdBlob,
  listProjectAssets,
  projectAssetBytes,
  readableFromPersonal,
  readableFromProject,
  readPersonalAsset,
  readProjectAsset,
  type AssetBytes,
  type AssetView,
} from '../repos/assets'
import { lockProjectShared } from '../repos/projects'
import { ASSET_FORMATS_LABEL, ASSET_MAX_AREA, ASSET_MAX_SIDE, detectAssetFormat } from '../services/asset-format'

/**
 * **그림 응답 머리 — 응답 전부에 싣는다**(SVG 만이 아니다 — 꼴을 가른 것은 서버지만 저장한 바이트가 다른 꼴로도 읽힐 수 있다). 주소를 직접 열어도
 * 스크립트가 안 돈다(`sandbox` · `default-src 'none'`), 브라우저가 꼴을 다시 짐작하지 않는다(`nosniff`), 다른 origin 의 문서가 `<img>` 로 싣지
 * 못한다(`same-origin`). 내용이 이름이라 바뀌지 않는다(`immutable`) — `private` 는 프록시가 멤버 아닌 사람에게 내주지 않게.
 */
export const ASSET_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'private, max-age=31536000, immutable',
})

const ProjectParams = z.object({ projectId: z.uuid() })
const AssetParams = z.object({ projectId: z.uuid(), id: z.string().regex(ASSET_ID_PATTERN) })
const MeAssetParams = z.object({ id: z.string().regex(ASSET_ID_PATTERN) })

/** 한 번에 가져오는 그림의 상한 — 붙이기 · 모듈 하나가 드는 그림 수보다 넉넉하다. */
const CLAIM_MAX = 200
const ClaimIds = z.array(z.string().regex(ASSET_ID_PATTERN, '그림 id 는 소문자 16진수 64 자입니다')).min(1).max(CLAIM_MAX)
const ProjectClaimBody = z.strictObject({
  ids: ClaimIds,
  from: z.union([z.strictObject({ projectId: z.uuid() }), z.strictObject({ personal: z.literal(true) })]),
})
const MeClaimBody = z.strictObject({ ids: ClaimIds, from: z.strictObject({ projectId: z.uuid() }) })

/** 이름의 상한(코드 포인트) — 목록 한 줄에 든다. */
const NAME_MAX = 120

const NOT_FOUND = '그림을 찾을 수 없습니다'
const TOKEN_REFUSAL = 'API 토큰으로는 다른 프로젝트 · 개인 몫의 그림을 가져올 수 없습니다. 로그인 후 다시 시도하세요'

/**
 * 바이트를 사람이 읽는 크기(1024 단위) — 소수 한 자리, 끝의 `.0` 은 뗀다. MB 로 쓰면 «0 MB» 가 될 크기(0.05 MB 밑 — 한도를 env 로 줄인 판)는 KB,
 * 1 KB 밑은 바이트로 쓴다. 웹의 그림 칸이 쓴 용량을 쓰는 꼴(`panels/controls/image-control.tsx` 의 `sizeLabel`)과 단위 이름이 같다.
 */
export function byteSize(bytes: number): string {
  const one = (value: number) => Number(value.toFixed(1))
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 0.05 * 1024 * 1024) return `${one(bytes / 1024)} KB`
  return `${one(bytes / (1024 * 1024))} MB`
}

/** `X-Asset-Name` — `encodeURIComponent` 한 글. 못 풀거나 비면 `image.<ext>`. 제어 글자를 걷고 상한에서 자른다. */
function assetName(header: unknown, ext: string): string {
  let name = ''
  if (typeof header === 'string') {
    try {
      name = decodeURIComponent(header)
    } catch {
      name = ''
    }
  }
  name = [...name.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, NAME_MAX).join('')
  if (/[\ud800-\udfff]/.test(name.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''))) name = ''
  return name === '' ? `image.${ext}` : name
}

function view(record: AssetView) {
  return {
    id: record.id,
    name: record.name,
    mime: record.mime,
    size: record.size,
    width: record.width,
    height: record.height,
    createdAt: record.createdAt,
  }
}

/** `Content-Disposition` — ASCII 대체 이름 + RFC 5987 의 UTF-8 이름. */
function disposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

function sendAsset(reply: import('fastify').FastifyReply, asset: AssetBytes) {
  for (const [name, value] of Object.entries(ASSET_HEADERS)) reply.header(name, value)
  return reply.type(asset.mime).header('content-disposition', disposition(asset.name)).send(asset.bytes)
}

/** 출처 프로젝트 행을 `KEY SHARE` 로 잡는다 — 없으면(지워졌다) `false`. 출처의 삭제가 이 가져오기와 겹치지 않는다(머리말). */
async function holdSourceProject(trx: DbHandle, projectId: string): Promise<boolean> {
  assertLocking(trx, 'holdSourceProject')
  const row = await trx.selectFrom('projects').select('id').where('id', '=', projectId).forKeyShare().executeTakeFirst()
  return row !== undefined
}

/** `app.ts` 가 `/api/projects` 로 등록한다. */
export function assetRoutes(limits: AssetLimits) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * 올리기는 본문을 **꼴을 가리지 않고 바이트로** 받는 하위 플러그인에 둔다 — 꼴은 바이트로 가르므로(`services/asset-format.ts`) 머리의
     * `Content-Type` 으로 파서에서 끊지 않는다. 그래야 가드가 먼저 답한다(JSON 본문 · 모르는 꼴도 권한 · `x-wb-client` 가 먼저 — `test/actor-census.test.ts`).
     * 본문 상한은 파일 한도다. 넘으면 Fastify 가 `content-length` 를 보고 읽기 전에 끊고, 전역 에러 처리가 `config.tooLarge` 의 문장으로 답한다
     * (한도와 그 파일의 크기 — `http/error-handler.ts`). 가드 앞 훅을 두지 않는다(`test/pre-guard-hook-census.test.ts`).
     */
    await app.register(async (bytesOnly) => {
      bytesOnly.removeAllContentTypeParsers()
      bytesOnly.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: limits.fileBytes }, (_request, body, done) => done(null, body))
      const tooLargeMessage = (length: number | null) =>
        `그림은 ${byteSize(limits.fileBytes)} 까지 올릴 수 있습니다${length === null ? '' : `(이 파일 ${byteSize(length)})`}`
      bytesOnly.post(
        '/:projectId/assets',
        { bodyLimit: limits.fileBytes, config: { tooLarge: tooLargeMessage }, preHandler: projectGuard('editor') },
        async (request, reply) => {
          const { projectId } = parseParams(ProjectParams, request.params)
          const currentUser = request.currentUser
          if (!currentUser) throw unauthenticated()
          const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0)
          if (bytes.byteLength > limits.fileBytes) throw tooLarge(tooLargeMessage(bytes.byteLength))
          const detected = detectAssetFormat(bytes)
          if (!detected.ok) {
            if (detected.reason === 'unsupported') throw unsupportedMedia(`${ASSET_FORMATS_LABEL} 만 올릴 수 있습니다`)
            throw validationFailed('그림이 너무 큽니다', [
              {
                code: 'asset-dimensions',
                path: '',
                message: `그림은 가로 · 세로 ${ASSET_MAX_SIDE}px · 넓이 ${ASSET_MAX_AREA.toLocaleString('en-US')}px 까지입니다`,
              },
            ])
          }
          const { format } = detected
          const sha256 = createHash('sha256').update(bytes).digest('hex')
          const name = assetName(request.headers['x-asset-name'], format.ext)
          const outcome = await withTransaction(app.db, async (trx) => {
            await lockProjectShared(trx, projectId)
            await holdBlob(trx, sha256, bytes, format)
            const added = await addProjectAsset(trx, {
              projectId,
              sha256,
              size: bytes.byteLength,
              name,
              uploadedBy: currentUser.id,
              limit: limits.projectBytes,
            })
            if (added === 'quota') throw assetQuota(`이 프로젝트의 그림 공간 ${byteSize(limits.projectBytes)} 가 찼습니다`)
            await recheckProjectRole(trx, request)
            const record = await findProjectAsset(trx, projectId, sha256)
            if (record === null) throw new Error('넣은 그림을 다시 읽지 못했습니다')
            return { added, record }
          })
          return reply.status(outcome.added === 'added' ? 201 : 200).send(view(outcome.record))
        },
      )
    })

    app.get('/:projectId/assets', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectParams, request.params)
      const assets = await listProjectAssets(app.db, projectId)
      return {
        assets: assets.map(view),
        usedBytes: await projectAssetBytes(app.db, projectId),
        limitBytes: limits.projectBytes,
        fileLimitBytes: limits.fileBytes,
      }
    })

    app.get('/:projectId/assets/:id', { preHandler: projectGuard('viewer') }, async (request, reply) => {
      const { projectId, id } = parseParams(AssetParams, request.params)
      const asset = await readProjectAsset(app.db, projectId, id)
      if (asset === null) throw notFound(NOT_FOUND)
      return sendAsset(reply, asset)
    })

    app.post('/:projectId/assets/claim', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId } = parseParams(ProjectParams, request.params)
      const currentUser = requireSessionUser(request, TOKEN_REFUSAL)
      const body = parseBody(ProjectClaimBody, request.body)
      return withTransaction(app.db, async (trx) => {
        await lockProjectShared(trx, projectId)
        const from = body.from
        const readable =
          'personal' in from
            ? await readableFromPersonal(trx, currentUser.id, body.ids)
            : (await holdSourceProject(trx, from.projectId))
              ? await readableFromProject(trx, currentUser.id, from.projectId, body.ids)
              : new Map()
        const result = await claimAssets(trx, body.ids, readable, (sha256, entry) =>
          addProjectAsset(trx, {
            projectId,
            sha256,
            size: entry.size,
            name: entry.name,
            uploadedBy: currentUser.id,
            limit: limits.projectBytes,
          }),
        )
        await recheckProjectRole(trx, request)
        return result
      })
    })
  }
}

/** `app.ts` 가 `/api/me` 로 등록한다 — 사람의 몫. 세션으로만(토큰은 프로젝트 하나의 스코프다). */
export function meAssetRoutes(limits: AssetLimits) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/assets/claim', { preHandler: app.requireAuth }, async (request) => {
      const currentUser = requireSessionUser(request, TOKEN_REFUSAL)
      const body = parseBody(MeClaimBody, request.body)
      return withTransaction(app.db, async (trx) => {
        const readable = (await holdSourceProject(trx, body.from.projectId))
          ? await readableFromProject(trx, currentUser.id, body.from.projectId, body.ids)
          : new Map()
        return claimAssets(trx, body.ids, readable, (sha256, entry) =>
          addPersonalAsset(trx, { ownerId: currentUser.id, sha256, size: entry.size, name: entry.name, limit: limits.personalBytes }),
        )
      })
    })

    app.get('/assets/:id', { preHandler: app.requireAuth }, async (request, reply) => {
      const { id } = parseParams(MeAssetParams, request.params)
      const currentUser = requireSessionUser(request, TOKEN_REFUSAL)
      const asset = await readPersonalAsset(app.db, currentUser.id, id)
      if (asset === null) throw notFound(NOT_FOUND)
      return sendAsset(reply, asset)
    })
  }
}
