/**
 * 개인 모듈 라우트 — 설계 spec `2026-10-20-personal-modules-design.md`. 사람 하나가 소유하고 그 사람이 여는 모든 프로젝트의 «모듈» 탭에 서는 노드
 * 묶음이다. `app.ts` 가 `/api/me` prefix 로 등록한다 — 프로젝트 아래가 아니다(프로젝트에 매이지 않는다).
 *
 * HTTP · zod 검증만 다룬다 — SQL 은 `repos/personal-modules.ts`, 본문 · 거름 · 오류 문장은 프로젝트 모듈의 것(`routes/modules.ts` 의
 * `ModuleBody` · `RenameBody` · `rejectUnstorable` · `rejectNestedPages`, `@wirebound/schema` 의 `moduleNodesForSave`)을 그대로 쓴다.
 *
 * ---
 *
 * # 엔드포인트 다섯 — 전부 **세션으로만**, 전부 **자기 것만**
 *
 * | 경로 | 응답 |
 * |---|---|
 * | `GET /modules` | 200 `{ modules }` — 최근 것 먼저 |
 * | `GET /modules/:moduleId` | 200 `{ module }` — 넣기 · 복사 직전에 화면이 다시 읽는다 |
 * | `POST /modules` | 201 `{ module }` |
 * | `PATCH /modules/:moduleId` | 200 `{ module }` — 이름만 바꾼다 |
 * | `DELETE /modules/:moduleId` | 204 |
 *
 * 응답의 `module` 은 프로젝트 모듈과 같은 모양이다(`createdBy` 는 소유자).
 *
 * **역할이 없다** — 프로젝트 권한과 무관한 내 데이터라 viewer 도 저장한다(설계 spec «사용자가 정한 것» 6). 페이지에 넣는 것은 화면이 막고
 * (편집 모드 · editor 이상) 넣기 자체는 페이지 편집이라 그 라우트의 가드가 막는다.
 *
 * **남의 것은 «없다» 와 같은 답이다** — repo 가 소유자를 질의 조건에 두어 남의 id 와 모르는 id 가 같은 갈래(404 · 같은 문장)로 간다.
 *
 * **세션으로만이다**(`auth/session-only.ts`). API 토큰은 프로젝트 단위 스코프라 이 길에 닿지 않는다 — `:projectId` 가 없는 라우트라 토큰이
 * 사람을 안 채워 `requireAuth` 가 먼저 401 을 낸다(`auth/plugin.ts` 머리말 «토큰은 프로젝트 라우트에서만 사람을 채운다»). 403 은 그 규칙이
 * 바뀐 날의 두 번째 겹이다.
 *
 * **복사는 여기 없다** — 화면이 원본 하나를 다시 읽고 대상 쪽 저장(이 `POST` · `POST /api/projects/:projectId/modules`)으로 새로 저장한다. 그래서
 * 복사가 저장과 같은 가드(«프로젝트 모듈로 복사» 는 그 라우트의 editor 가드) · 거름 · 한도 · 재확인을 지난다.
 *
 * ---
 *
 * # 오류 표
 *
 * | 상황 | 상태 |
 * |---|---|
 * | 이름이 비었거나 60자 초과 · 노드 0개 · 노드 봉투 위반 · 선언되지 않은 키 | **400**(본문 zod) |
 * | 노드에 `Page` | **422** `nested-page` |
 * | NUL(U+0000) · 짝 없는 서로게이트(이름 · 노드) | **400** |
 * | 없는 모듈 · 남의 개인 모듈 | **404** |
 * | 자격 없음 · API 토큰 | **401** |
 *
 * # 잠금
 *
 * 쓰기가 잡는 것은 `personal_modules` 행과(삽입의 FK 가) 소유자 사용자 행의 `KEY SHARE` 뿐이다. 프로젝트 행 · 멤버 행을 안 잡고 프로젝트 삭제의
 * CASCADE 가 이 표에 닿지 않는다(`test/personal-modules.test.ts` «프로젝트 삭제를 쥔 동안»). 비밀번호 바꾸기의 사용자 행 `UPDATE`(키 아닌 칸 —
 * `NO KEY UPDATE`)는 `KEY SHARE` 와 안 부딪힌다. **재확인을 걸지 않는다** — 프로젝트 권한이 판정에 없고, 세션이 그 사이 끝나도 쓰이는 것은
 * 그 사람 자신의 행뿐이다(내 토큰 폐기와 같은 판단 — `routes/tokens.ts` 머리말).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { countModuleNodes, moduleNodesForSave } from '@wirebound/schema'
import { requireSessionUser as requireSession } from '../auth/session-only'
import { badRequest, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { ModuleNulByteError } from '../repos/modules'
import {
  deletePersonalModule,
  findPersonalModule,
  insertPersonalModule,
  listPersonalModules,
  renamePersonalModule,
  type PersonalModuleRecord,
} from '../repos/personal-modules'
import { ModuleBody, RenameBody, rejectNestedPages, rejectUnstorable } from './modules'

const ModuleParams = z.object({ moduleId: z.uuid() })

const NOT_FOUND = '모듈을 찾을 수 없습니다'

function toResponse(record: PersonalModuleRecord) {
  return {
    id: record.id,
    name: record.name,
    nodes: record.nodes,
    nodeCount: countModuleNodes(record.nodes),
    createdBy: record.ownerId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function requireSessionUser(request: Parameters<typeof requireSession>[0]) {
  return requireSession(request, 'API 토큰으로는 개인 모듈을 다룰 수 없습니다. 로그인 후 다시 시도하세요')
}

/** repo 의 마지막 방벽(`ModuleNulByteError`)을 400 으로 옮긴다 — 라우트가 먼저 거르므로 여기 오는 경로는 없다. */
async function storing<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (error instanceof ModuleNulByteError) throw badRequest(error.message)
    throw error
  }
}

/** `app.ts`가 `app.register(personalModuleRoutes(), { prefix: '/api/me' })`로 등록하는 팩토리. */
export function personalModuleRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/modules', { preHandler: app.requireAuth }, async (request) => {
      const currentUser = requireSessionUser(request)
      return { modules: (await listPersonalModules(app.db, currentUser.id)).map(toResponse) }
    })

    app.get('/modules/:moduleId', { preHandler: app.requireAuth }, async (request) => {
      const { moduleId } = parseParams(ModuleParams, request.params)
      const currentUser = requireSessionUser(request)
      const record = await findPersonalModule(app.db, currentUser.id, moduleId)
      if (record === null) throw notFound(NOT_FOUND)
      return { module: toResponse(record) }
    })

    app.post('/modules', { preHandler: app.requireAuth }, async (request, reply) => {
      const currentUser = requireSessionUser(request)
      const body = parseBody(ModuleBody, request.body)
      rejectUnstorable(body.name, body.nodes)
      rejectNestedPages(body.nodes)
      const record = await storing(() =>
        insertPersonalModule(app.db, { ownerId: currentUser.id, name: body.name, nodes: moduleNodesForSave(body.nodes).nodes }),
      )
      return reply.status(201).send({ module: toResponse(record) })
    })

    app.patch('/modules/:moduleId', { preHandler: app.requireAuth }, async (request) => {
      const { moduleId } = parseParams(ModuleParams, request.params)
      const currentUser = requireSessionUser(request)
      const body = parseBody(RenameBody, request.body)
      rejectUnstorable(body.name, null)
      const renamed = await storing(() => renamePersonalModule(app.db, currentUser.id, moduleId, body.name))
      if (renamed === null) throw notFound(NOT_FOUND)
      return { module: toResponse(renamed) }
    })

    app.delete('/modules/:moduleId', { preHandler: app.requireAuth }, async (request, reply) => {
      const { moduleId } = parseParams(ModuleParams, request.params)
      const currentUser = requireSessionUser(request)
      if (!(await deletePersonalModule(app.db, currentUser.id, moduleId))) throw notFound(NOT_FOUND)
      return reply.status(204).send()
    })
  }
}
