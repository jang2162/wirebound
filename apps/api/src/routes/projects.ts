/**
 * 프로젝트 라우트: 생성·목록·조회·수정·삭제. `/api/projects` prefix로 등록한다(`app.ts`).
 *
 * HTTP·zod 검증만 다룬다 — SQL은 전부 `repos/projects.ts`에 맡긴다. 권한 판정은
 * `auth/roles.ts`의 `projectGuard` 하나가 전담한다 — 이 파일은 역할을 비교하지
 * 않는다(`request.projectRole`을 읽기만 한다).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { conflict, notFound, unauthenticated } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  DuplicateSlugError,
  deleteProject,
  findProjectById,
  insertProject,
  listProjectsForUser,
  updateProject,
} from '../repos/projects'

/** slug 형식: 소문자·숫자·하이픈. 하이픈으로 시작하거나 끝날 수 없고 1~64자다. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

const Slug = z
  .string()
  .regex(SLUG_PATTERN, '슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다')
const Name = z.string().min(1, '이름을 입력하세요').max(120, '이름은 120자 이하여야 합니다')
const Description = z.string().max(2000, '설명은 2000자 이하여야 합니다').nullable()

/** `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다(`routes/auth.ts`와 같은 관례). */
const CreateProjectBody = z.strictObject({
  name: Name,
  slug: Slug,
  description: Description.optional(),
})

/** 필드가 전부 optional이므로, 빈 본문(`{}`)이 통과하지 않도록 `.refine`으로 따로 막는다. */
const UpdateProjectBody = z
  .strictObject({
    name: Name.optional(),
    slug: Slug.optional(),
    description: Description.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: '변경할 값이 없습니다' })

const ProjectIdParams = z.object({ projectId: z.uuid() })

/** `app.ts`가 `app.register(projectRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function projectRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/', { preHandler: app.requireAuth }, async (request, reply) => {
      const body = parseBody(CreateProjectBody, request.body)
      const user = request.currentUser
      if (!user) {
        // requireAuth가 이미 막는다. 아래는 타입을 좁히기 위한 방어적 확인이다.
        throw unauthenticated()
      }

      let project
      try {
        project = await insertProject(app.db, user.id, {
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
        })
      } catch (error) {
        if (error instanceof DuplicateSlugError) {
          throw conflict(error.message)
        }
        throw error
      }

      reply.code(201)
      return project
    })

    app.get('/', { preHandler: app.requireAuth }, async (request) => {
      const user = request.currentUser
      if (!user) {
        throw unauthenticated()
      }
      return listProjectsForUser(app.db, user.id)
    })

    app.get('/:projectId', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const project = await findProjectById(app.db, projectId)
      const role = request.projectRole
      if (!project || !role) {
        // projectGuard를 통과했다면 항상 채워져 있다(가드 통과 직후 동시 삭제되는
        // 극단적인 경합이 아닌 한). 여기 도달했다면 존재를 숨기는 404가 맞다.
        throw notFound()
      }
      return { ...project, role }
    })

    app.patch('/:projectId', { preHandler: projectGuard('owner') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(UpdateProjectBody, request.body)
      const role = request.projectRole
      if (!role) {
        throw notFound()
      }

      let project
      try {
        project = await updateProject(app.db, projectId, body)
      } catch (error) {
        if (error instanceof DuplicateSlugError) {
          throw conflict(error.message)
        }
        throw error
      }

      return { ...project, role }
    })

    app.delete('/:projectId', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      await deleteProject(app.db, projectId)
      reply.code(204).send()
    })
  }
}
