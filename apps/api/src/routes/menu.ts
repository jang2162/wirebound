/**
 * 메뉴 트리 라우트: 조회·생성·수정·삭제. `projectRoutes`(`routes/projects.ts`)와
 * 같은 `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 분리하되 URL
 * 네임스페이스는 공유한다. 이 파일의 라우트는 전부 `/:projectId/menu`
 * (그 아래 `/:nodeId`) 아래에 있다.
 *
 * HTTP·zod 검증만 다룬다 — SQL과 정렬·이동 불변식은 전부 `repos/menu.ts`에
 * 맡긴다. 권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가 전담한다 — 이
 * 파일은 역할을 비교하지 않는다.
 *
 * 페이지 라우트(`/:projectId/pages`)는 이 태스크의 범위가 아니다 — 태스크 13이
 * 이 트리의 리프에 매단다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { badRequest, conflict, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  DescendantParentError,
  HasChildrenError,
  ParentNotFoundError,
  SelfParentError,
  deleteMenuNode,
  insertMenuNode,
  listMenuTree,
  updateMenuNode,
} from '../repos/menu'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const NodeParams = z.object({ projectId: z.uuid(), nodeId: z.uuid() })

const Title = z.string().min(1, '제목을 입력하세요').max(200, '제목은 200자 이하여야 합니다')

/**
 * `sortOrder`는 `z.int().min(0)`이다 — 음수는 여기서 400으로 걸러지고, 형제
 * 수보다 큰 값은 `repos/menu.ts`가 클램프한다(브리프 "정렬 규칙" 절: 큰 값은
 * "맨 뒤로 보내라"는 흔한 의도라 오류로 다루지 않는다).
 */
const SortOrder = z.int().min(0)

/** `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다(`routes/projects.ts`·`routes/members.ts`와 같은 관례). */
const CreateMenuBody = z.strictObject({
  parentId: z.uuid().nullable().optional(),
  title: Title,
})

/** 필드가 전부 optional이므로, 빈 본문(`{}`)이 통과하지 않도록 `.refine`으로 따로 막는다(`routes/projects.ts`의 `UpdateProjectBody`와 같은 관례). */
const UpdateMenuBody = z
  .strictObject({
    title: Title.optional(),
    parentId: z.uuid().nullable().optional(),
    sortOrder: SortOrder.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: '변경할 값이 없습니다' })

/** `app.ts`가 `app.register(menuRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function menuRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/menu', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      return listMenuTree(app.db, projectId)
    })

    app.post('/:projectId/menu', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(CreateMenuBody, request.body)

      let node
      try {
        node = await insertMenuNode(app.db, projectId, { parentId: body.parentId ?? null, title: body.title })
      } catch (error) {
        if (error instanceof ParentNotFoundError) {
          throw notFound(error.message)
        }
        throw error
      }

      reply.code(201)
      return node
    })

    app.patch('/:projectId/menu/:nodeId', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, nodeId } = parseParams(NodeParams, request.params)
      const body = parseBody(UpdateMenuBody, request.body)

      let node
      try {
        node = await updateMenuNode(app.db, projectId, nodeId, body)
      } catch (error) {
        if (error instanceof ParentNotFoundError) {
          throw notFound(error.message)
        }
        if (error instanceof SelfParentError || error instanceof DescendantParentError) {
          throw badRequest(error.message)
        }
        throw error
      }

      if (!node) {
        throw notFound()
      }
      return node
    })

    app.delete('/:projectId/menu/:nodeId', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, nodeId } = parseParams(NodeParams, request.params)

      let result
      try {
        result = await deleteMenuNode(app.db, projectId, nodeId)
      } catch (error) {
        if (error instanceof HasChildrenError) {
          throw conflict(error.message)
        }
        throw error
      }

      if (result === 'not-found') {
        throw notFound()
      }
      reply.code(204).send()
    })
  }
}
