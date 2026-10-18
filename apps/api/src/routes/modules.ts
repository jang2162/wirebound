/**
 * 모듈 라우트 — 설계 spec `2026-10-18-modules-states-layout-design.md` 「B3. 모듈」의 서버 쪽이다. `pageRoutes`와 같은 `/api/projects`
 * prefix 로 등록한다(`app.ts`) — 파일은 갈리되 URL 네임스페이스는 공유한다(`routes/comments.ts` · `routes/snapshots.ts`와 같은 관례).
 *
 * HTTP · zod 검증만 다룬다 — SQL 은 `repos/modules.ts`, 담을 노드를 짓는 규칙은 `@wirebound/schema` 의 `moduleNodesForSave` 다.
 * **권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가 전담한다.**
 *
 * ---
 *
 * # 엔드포인트 다섯
 *
 * | 경로 | 가드 | 응답 |
 * |---|---|---|
 * | `GET /:projectId/modules` | viewer | 200 `{ modules }` — 최근 것 먼저 |
 * | `GET /:projectId/modules/:moduleId` | viewer | 200 `{ module }` — 넣기 직전에 화면이 다시 읽는다 |
 * | `POST /:projectId/modules` | **editor** | 201 `{ module }` |
 * | `PATCH /:projectId/modules/:moduleId` | **editor** | 200 `{ module }` — 이름만 바꾼다 |
 * | `DELETE /:projectId/modules/:moduleId` | **editor** | 204 |
 *
 * **editor 인 까닭은 옛 프리셋과 같다** — 모듈은 페이지 편집을 돕는 도구이고, 프로젝트 전체 외형을 한 번에 바꾸지 않는다(넣어야 바뀌고 넣기는
 * 페이지 편집 하나다). 조회는 viewer.
 *
 * **목록이 `nodes`를 함께 내는데도 상세가 있는 까닭** — 넣기는 탭을 연 뒤 한참 지나 누를 수 있다. 그 사이 남이 모듈을 지웠으면 넣지 않고
 * «이 모듈은 지워졌습니다»를 말해야 하므로(설계 spec 「B3」) 화면이 넣기 직전에 그 모듈 하나를 다시 읽고, 404 면 통지하고 목록을 다시 읽는다.
 * 목록째 다시 읽지 않는 것은 넣을 노드도 그 응답의 것을 쓰기 때문이다 — 하나를 읽으면 «지워졌나»와 «무엇을 넣나»가 한 응답이다.
 *
 * **내장 모듈(«기본 모듈»)은 이 목록에 없다** — `@wirebound/schema` 의 `BUILTIN_MODULES` 를 화면이 직접 읽는다. 서버를 거칠 까닭이 없다(읽기
 * 전용 · 모든 프로젝트에 같다).
 *
 * ---
 *
 * # 저장이 걷는 것
 *
 * `marker` · 묶음 밖 노드를 겨냥하는 액션을 **여기서도** 걷는다(`moduleNodesForSave`) — 화면의 «모듈로 저장…» 상자가 이미 걷어 보내지만,
 * 화면을 지나지 않는 본문(MCP · CLI · 손으로 낸 요청)에도 같은 규칙이 걸리게 한다. id 는 그대로 담는다 — 재발급은 넣기가 한다.
 *
 * **카탈로그 검증은 여기서 하지 않는다** — «이것을 페이지에 놓을 수 있는가»는 **넣는 시점에 결과 문서 전체로** 판정한다(옛 프리셋과 같은
 * 판단). 여기서 보는 것은 봉투(`WbNodeSchema`)와 **`Page` 하나**다 — 모듈 안의 `Page` 는 어느 자리에 넣든 페이지 안의 `Page` 라 저장되면
 * 넣을 때마다 `invalid` 다(`nestedPagesUnderRoot` — 422 `nested-page`).
 *
 * ---
 *
 * # 오류 표
 *
 * | 상황 | 상태 | 어디서 |
 * |---|---|---|
 * | 이름이 비었거나 60자 초과 · 노드 0개 · 노드 봉투 위반 · 선언되지 않은 키 | **400** | 본문 zod(`ModuleBody` · `RenameBody`) |
 * | 노드에 `Page` | **422** `nested-page` · 노드마다 이슈(`path` = `/nodes/…`) | `nestedPagesUnderRoot` |
 * | NUL(U+0000) · 짝 없는 서로게이트(이름 · 노드) | **400** | 아래 `rejectUnstorable`(라우트) · `ModuleNulByteError`(repo, 마지막 방벽) |
 * | 없는 모듈 / 남의 프로젝트의 모듈 읽기 · 이름 바꾸기 · 삭제 | **404** | repo 가 `projectId`를 함께 받는다(존재를 숨긴다) |
 *
 * **이름 중복은 오류가 아니다** — 유일 제약이 없으므로 409가 나올 자리 자체가 없다.
 *
 * # 잠금 순서
 *
 * 이름 바꾸기 · 삭제는 «모듈 행(`UPDATE` · `DELETE`) → 재확인(멤버 행 `FOR SHARE`)» 순이다. 프로젝트 삭제는 그래서 CASCADE 전에 모듈 행을
 * 먼저 잡는다(`routes/projects.ts` 의 삭제 주석 · `repos/modules.ts` 의 `lockProjectModules`). 재는 자는 `test/guard-in-lock.test.ts`의 «E15».
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { MODULE_NAME_MAX, WbNodeSchema, countModuleNodes, moduleNodesForSave, nestedPagesUnderRoot } from '@wirebound/schema'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { containsLoneSurrogate, containsNulByte } from '../db/nul-guard'
import { withTransaction } from '../db/tx'
import { badRequest, notFound, unauthenticated, validationFailed } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  ModuleNulByteError,
  deleteModule,
  findModuleById,
  insertModule,
  listModules,
  renameModule,
  type ModuleRecord,
} from '../repos/modules'
import { lockProjectShared } from '../repos/projects'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const ModuleParams = z.object({ projectId: z.uuid(), moduleId: z.uuid() })

/** 이름 — 1 ~ 60자(`MODULE_NAME_MAX`). 저장 · 이름 바꾸기가 같은 규칙이다. */
const ModuleName = z.string().min(1, '이름을 입력하세요').max(MODULE_NAME_MAX, `이름은 ${MODULE_NAME_MAX}자 이하여야 합니다`)

/** `z.strictObject`라 선언되지 않은 키(옛 프리셋의 `description` · `viewStates` 포함)는 그 자체로 400이다. 빈 묶음은 모듈이 아니다. */
const ModuleBody = z.strictObject({
  name: ModuleName,
  nodes: z.array(WbNodeSchema).min(1, '모듈에 담을 노드를 고르세요'),
})

const RenameBody = z.strictObject({ name: ModuleName })

/** 모듈 안의 `Page`를 거절하는 문장 — 웹 «모듈로 저장…» 상자가 그대로 보인다(`apps/web` 의 `api/failure.tsx` 의 `reason`). */
const MODULE_PAGE_MESSAGE = '모듈에 Page를 담을 수 없습니다 — 넣으면 페이지 안의 Page가 됩니다. Page를 빼고 고른 뒤 저장하세요'

/**
 * NUL · 짝 없는 서로게이트를 jsonb · 텍스트를 만들기 전에 끊는다(repo 도 같은 검사를 한다 — 마지막 방벽). 이름의 서로게이트도 거절한다 —
 * 텍스트 칸은 그 글자를 U+FFFD 로 바꿔 넣어 «저장한 이름과 읽은 이름이 다름»이 된다.
 */
function rejectUnstorable(name: string, nodes: unknown): void {
  if (containsNulByte(name) || containsNulByte(nodes)) throw badRequest('모듈에 NUL 문자(U+0000)를 포함할 수 없습니다')
  if (containsLoneSurrogate(name) || containsLoneSurrogate(nodes)) throw badRequest('모듈에 짝 없는 서로게이트 글자를 포함할 수 없습니다')
}

function toResponse(record: ModuleRecord) {
  return {
    id: record.id,
    name: record.name,
    nodes: record.nodes,
    nodeCount: countModuleNodes(record.nodes),
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** `app.ts`가 `app.register(moduleRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function moduleRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/modules', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const records = await listModules(app.db, projectId)
      return { modules: records.map(toResponse) }
    })

    /** 모듈 하나 — 넣기 직전의 다시 읽기(머리말 «목록이 `nodes`를 함께 내는데도 상세가 있는 까닭»). */
    app.get('/:projectId/modules/:moduleId', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, moduleId } = parseParams(ModuleParams, request.params)
      const record = await findModuleById(app.db, projectId, moduleId)
      if (record === null) throw notFound('모듈을 찾을 수 없습니다')
      return { module: toResponse(record) }
    })

    /**
     * **고른 노드를 모듈로 남긴다.** 본문이 나르는 것은 노드 배열이고, 무엇을 골랐는지 읽는 것은 화면이다 — 서버가 페이지를 읽어 담으면 사람이
     * 화면에서 보고 있는 것(낙관적 편집이 얹힌 문서)과 저장되는 것이 갈릴 수 있다.
     */
    app.post('/:projectId/modules', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(ModuleBody, request.body)
      rejectUnstorable(body.name, body.nodes)

      const nested = nestedPagesUnderRoot(body.nodes)
      if (nested.length > 0) {
        throw validationFailed(
          '모듈을 저장할 수 없습니다',
          nested.map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            nodeId: issue.nodeId,
            path: `/nodes${issue.path}`,
            message: MODULE_PAGE_MESSAGE,
          })),
        )
      }

      // `projectGuard('editor')`가 이미 인증을 요구한다. `as`로 좁히지 않고 던지는 것은 아래에서 `.id`를 반드시 읽기 때문이다 — 가드가 빠지는
      // 순간 `as` 판은 미인증 요청에 `null` 역참조로 500을 낸다.
      const currentUser = request.currentUser
      if (!currentUser) throw unauthenticated()

      let record: ModuleRecord
      try {
        record = await withTransaction(app.db, async (trx) => {
          // **프로젝트 행이 먼저다**(`repos/projects.ts`의 `lockProjectShared`). 삽입의 FK 도 같은 `KEY SHARE`를 걸지만 그것은 프로젝트 삭제
          // 뒤에 섰다가 깨면 23503 — 봉투 없는 500 이다. 먼저 잡으면 0 행 → 404.
          await lockProjectShared(trx, projectId)
          const inserted = await insertModule(trx, {
            projectId,
            name: body.name,
            nodes: moduleNodesForSave(body.nodes).nodes,
            createdBy: currentUser.id,
          })
          // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 삽입의 FK 가 프로젝트 행에 거는 `KEY SHARE`가 복원 · 프로젝트 삭제의
          // `FOR UPDATE` 뒤에 섰을 수 있다 — 그 대기 뒤의 역할로 판정한다.
          await recheckProjectRole(trx, request)
          return inserted
        })
      } catch (error) {
        // repo 의 마지막 방벽에 걸렸다. 위에서 이미 걸렀으므로 여기 오는 경로는 없다.
        if (error instanceof ModuleNulByteError) throw badRequest(error.message)
        throw error
      }
      return reply.status(201).send({ module: toResponse(record) })
    })

    /**
     * 이름을 바꾼다 — 모듈에서 고칠 수 있는 것은 이름 하나다(내용을 바꾸려면 새로 저장하고 옛것을 지운다).
     * «모듈 행(`UPDATE`) → 재확인» 순이다(머리말 «잠금 순서»).
     */
    app.patch('/:projectId/modules/:moduleId', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, moduleId } = parseParams(ModuleParams, request.params)
      const body = parseBody(RenameBody, request.body)
      rejectUnstorable(body.name, null)
      let renamed: ModuleRecord | null
      try {
        renamed = await withTransaction(app.db, async (trx) => {
          const record = await renameModule(trx, projectId, moduleId, body.name)
          // **커밋 순간의 권한.** 행을 잡은 **뒤**에 본다 — 멤버 행 `FOR SHARE`가 그 뒤의 역할 변경을 이 커밋 뒤로 세운다. «이미 없다»(404)도
          // 지난다 — 행을 기다린 사이 지워졌다는 사실이다.
          await recheckProjectRole(trx, request)
          return record
        })
      } catch (error) {
        // repo 의 마지막 방벽 — 저장과 같이 400 으로 옮긴다. 안 옮기면 위 검사가 빠진 판에서 500 이다(`test/lone-surrogate-inputs.test.ts` 의 이름 케이스).
        if (error instanceof ModuleNulByteError) throw badRequest(error.message)
        throw error
      }
      // 남의 프로젝트의 모듈 id 도 같은 404 다 — 존재를 숨긴다(설계서 「권한 모델」).
      if (renamed === null) throw notFound('모듈을 찾을 수 없습니다')
      return { module: toResponse(renamed) }
    })

    /** 모듈 하나를 지운다. «모듈 행(`DELETE`) → 재확인» 순이다(머리말 «잠금 순서»). */
    app.delete('/:projectId/modules/:moduleId', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, moduleId } = parseParams(ModuleParams, request.params)
      const deleted = await withTransaction(app.db, async (trx) => {
        const gone = await deleteModule(trx, projectId, moduleId)
        // **커밋 순간의 권한** — 가드와 `DELETE` 사이에 viewer 로 내려가거나 빠졌으면 가드와 같은 403 · 404 로 되돌린다(`test/guard-in-lock.test.ts`의
        // «모듈 삭제 — 가드와 커밋 사이»). 이름 바꾸기와 같은 까닭으로 행을 잡은 뒤에 본다.
        await recheckProjectRole(trx, request)
        return gone
      })
      if (!deleted) throw notFound('모듈을 찾을 수 없습니다')
      return reply.status(204).send()
    })
  }
}
