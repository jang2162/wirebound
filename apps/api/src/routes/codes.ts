/**
 * 공통코드 라우트 — 설계 `docs/superpowers/specs/2026-11-10-common-codes-design.md` · 정본 설계서 「도메인 모델」의 공통코드. 계약 표는
 * `apps/api/README.md` 「공통코드」.
 *
 * 노드는 표를 DB id 가 아니라 «그룹 키 · 코드값»으로 가리킨다(`WbNode.code`). 그래서 **`key` · `value` 는 경로로만 오고 본문에 실을 수 없다** —
 * 본문이 `z.strictObject` 라 실으면 400 이다. 바꾸려면 새 항목을 만들고 다시 묶는다(사용처 목록이 그 작업 목록이다).
 *
 * 권한은 `projectGuard` — 읽기 viewer · 쓰기 editor(페이지 편집과 같은 역할이다 — 표는 화면 글의 원천이다). API 토큰도 같은 가드다.
 *
 * # 잠금 순서
 *
 * 쓰기는 «프로젝트 행 `FOR NO KEY UPDATE`(`lockProjectTree`) → 코드 행 → 재확인(멤버 행 `FOR SHARE`)» 순이다. 첫 잠금이 같은 프로젝트의 코드
 * 쓰기를 한 줄로 세워 키 겹침 · 상한을 읽고 판정하는 사이에 남이 못 낀다. 복원 · 프로젝트 삭제의 `FOR UPDATE` 와 부딪혀 그 뒤에 서므로, 삭제의
 * CASCADE 가 코드 행을 지우는 동안 코드 행을 쥔 쓰기가 없다(`lockProjectShared` 머리말의 교착 판과 같은 방향). 복원은 표를 통째로 그 판으로
 * 덮는다(`services/restore.ts`) — 그래서 코드 쓰기는 복원 중에 막힌다(`test/restore-lock-census.test.ts`).
 *
 * 코드 표는 소프트 잠금 대상이 아니다 — 같은 항목을 둘이 고치면 나중 쓰기가 이긴다. 이력도 없다(스냅샷만 표를 담는다).
 *
 * # 실시간
 *
 * 쓰기는 커밋 뒤 `codes-changed { projectId }` 를 보낸다(본문 없음 · 낸 연결 제외 — `notifyCodesChanged`). 받은 화면은 표를 다시 읽는다.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  CODE_GROUPS_MAX,
  CODE_ITEMS_MAX,
  CodeKeySchema,
  CodeNameSchema,
  CodeValueSchema,
  codeUsage,
  codeUsageCounts,
  type CodeGroup,
} from '@wirebound/schema'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { withTransaction, type DbHandle } from '../db/tx'
import { badRequest, conflict, notFound } from '../errors'
import { parseBody, parseParams, parseQuery } from '../http/parse'
import {
  codeUsageSources,
  deleteCodeGroup,
  deleteCodeItem,
  insertCodeGroup,
  insertCodeItem,
  readCodeTable,
  updateCodeGroup,
  updateCodeItem,
  type CodeWriteRefusal,
} from '../repos/codes'
import { lockProjectTree } from '../repos/projects'
import { broadcastOrigin, notifyCodesChanged } from '../ws/notify'

const ProjectParams = z.object({ projectId: z.uuid() })
const GroupParams = z.object({ projectId: z.uuid(), key: CodeKeySchema })
const ItemParams = z.object({ projectId: z.uuid(), key: CodeKeySchema, value: CodeValueSchema })

const SortOrder = z.int().min(0)

const CreateGroupBody = z.strictObject({ key: CodeKeySchema, name: CodeNameSchema })
const UpdateGroupBody = z
  .strictObject({ name: CodeNameSchema.optional(), sortOrder: SortOrder.optional() })
  .refine((body) => body.name !== undefined || body.sortOrder !== undefined, '바꿀 칸(name · sortOrder)이 없습니다')
const CreateItemBody = z.strictObject({ value: CodeValueSchema, name: CodeNameSchema, active: z.boolean().optional() })
const UpdateItemBody = z
  .strictObject({ name: CodeNameSchema.optional(), sortOrder: SortOrder.optional(), active: z.boolean().optional() })
  .refine(
    (body) => body.name !== undefined || body.sortOrder !== undefined || body.active !== undefined,
    '바꿀 칸(name · sortOrder · active)이 없습니다',
  )

const UsageQuery = z.object({ group: CodeKeySchema, item: CodeValueSchema.optional() })

/** 쓰기 하나 — 잠금 순서(머리말)대로 돌리고, 바꿨으면(`wrote`) 커밋 뒤 신호를 보낸다. */
async function write<T>(
  app: FastifyInstance,
  request: FastifyRequest,
  projectId: string,
  run: (trx: DbHandle) => Promise<T>,
  wrote: (result: T) => boolean = (result) => !isRefusal(result),
): Promise<T> {
  const result = await withTransaction(app.db, async (trx) => {
    await lockProjectTree(trx, projectId)
    const out = await run(trx)
    // 거절은 아무것도 안 썼다 — 그래도 재확인은 돈다(권한을 잃은 사람에게 «없다» · «겹친다»를 말하지 않는다).
    await recheckProjectRole(trx, request)
    return out
  })
  if (wrote(result)) notifyCodesChanged(app, { projectId, origin: broadcastOrigin(request) })
  return result
}

/** 쓰기의 거절을 상태 코드로. */
function refuse(refusal: CodeWriteRefusal): never {
  switch (refusal) {
    case 'no-group':
      throw notFound('공통코드 그룹을 찾을 수 없습니다')
    case 'no-item':
      throw notFound('공통코드 항목을 찾을 수 없습니다')
    case 'taken':
      throw conflict('이미 있는 키입니다', [{ code: 'code-key-taken', path: '', message: '같은 키(코드값)가 이미 있습니다' }])
    case 'limit':
      throw badRequest('공통코드 상한을 넘습니다')
  }
}

function isRefusal(value: unknown): value is CodeWriteRefusal {
  return typeof value === 'string'
}

/** 사용 수 응답 — `{ [key]: { group, items: { [value]: n } } }`. */
function countsResponse(counts: ReturnType<typeof codeUsageCounts>) {
  const out: Record<string, { group: number; items: Record<string, number> }> = {}
  for (const [key, count] of counts) out[key] = { group: count.group, items: Object.fromEntries(count.items) }
  return out
}

/** `app.ts` 가 `/api/projects` 아래 등록하는 팩토리. */
export function codeRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/codes', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectParams, request.params)
      const groups: CodeGroup[] = await readCodeTable(app.db, projectId)
      return { groups }
    })

    app.get('/:projectId/codes/usage', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectParams, request.params)
      const query = parseQuery(UsageQuery, request.query)
      return { usage: codeUsage(await codeUsageSources(app.db, projectId), query.group, query.item) }
    })

    app.get('/:projectId/codes/usage-counts', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectParams, request.params)
      return { counts: countsResponse(codeUsageCounts(await codeUsageSources(app.db, projectId))) }
    })

    app.post('/:projectId/codes', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectParams, request.params)
      const body = parseBody(CreateGroupBody, request.body)
      const group = await write(app, request, projectId, (trx) => insertCodeGroup(trx, { projectId, ...body, max: CODE_GROUPS_MAX }))
      if (isRefusal(group)) refuse(group)
      return reply.status(201).send({ group })
    })

    app.patch('/:projectId/codes/:key', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, key } = parseParams(GroupParams, request.params)
      const body = parseBody(UpdateGroupBody, request.body)
      const group = await write(app, request, projectId, (trx) => updateCodeGroup(trx, { projectId, key, ...body }))
      if (isRefusal(group)) refuse(group)
      return { group }
    })

    app.delete('/:projectId/codes/:key', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, key } = parseParams(GroupParams, request.params)
      const deleted = await write(
        app,
        request,
        projectId,
        (trx) => deleteCodeGroup(trx, projectId, key),
        (done) => done,
      )
      if (!deleted) refuse('no-group')
      return reply.status(204).send()
    })

    app.post('/:projectId/codes/:key/items', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, key } = parseParams(GroupParams, request.params)
      const body = parseBody(CreateItemBody, request.body)
      const item = await write(app, request, projectId, (trx) =>
        insertCodeItem(trx, { projectId, key, value: body.value, name: body.name, active: body.active ?? true, max: CODE_ITEMS_MAX }),
      )
      if (isRefusal(item)) refuse(item)
      return reply.status(201).send({ item })
    })

    app.patch('/:projectId/codes/:key/items/:value', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, key, value } = parseParams(ItemParams, request.params)
      const body = parseBody(UpdateItemBody, request.body)
      const item = await write(app, request, projectId, (trx) => updateCodeItem(trx, { projectId, key, value, ...body }))
      if (isRefusal(item)) refuse(item)
      return { item }
    })

    app.delete('/:projectId/codes/:key/items/:value', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, key, value } = parseParams(ItemParams, request.params)
      const refusal = await write(
        app,
        request,
        projectId,
        (trx) => deleteCodeItem(trx, projectId, key, value),
        (refused) => refused === null,
      )
      if (refusal !== null) refuse(refusal)
      return reply.status(204).send()
    })
  }
}
