/**
 * 프로젝트 라우트: 생성·목록·조회·수정·삭제. `/api/projects` prefix로 등록한다(`app.ts`).
 *
 * HTTP·zod 검증만 다룬다 — SQL은 전부 `repos/projects.ts`에 맡긴다. 권한 판정은
 * `auth/roles.ts`의 `projectGuard` 하나가 전담한다 — 이 파일은 역할을 비교하지
 * 않는다(`request.projectRole`을 읽기만 한다).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { withTransaction } from '../db/tx'
import { lockProjectPages } from '../repos/pages'
import { conflict, notFound, unauthenticated } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  DuplicateSlugError,
  deleteProject,
  findProjectById,
  insertProject,
  listProjectsForUser,
  lockProjectRow,
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
        project = await withTransaction(app.db, async (trx) => {
          const updated = await updateProject(trx, projectId, body)
          // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). `UPDATE projects`가 복원 · 프로젝트 삭제의
          // `FOR UPDATE`와 트리 쓰기의 첫 잠금(`FOR NO KEY UPDATE`) 뒤에 섰을 수 있다 — 그 대기 뒤의 역할로 판정한다.
          if (updated) await recheckProjectRole(trx, request)
          return updated
        })
      } catch (error) {
        if (error instanceof DuplicateSlugError) {
          throw conflict(error.message)
        }
        throw error
      }

      if (!project) {
        // projectGuard의 권한 확인과 updateProject의 UPDATE 사이에 프로젝트가
        // 삭제되는 경합이다 — GET /:projectId(위)가 같은 경합을 다루는 방식과 같다.
        throw notFound()
      }
      return { ...project, role }
    })

    app.delete('/:projectId', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      await withTransaction(app.db, async (trx) => {
        // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 삭제는 CASCADE 로 페이지 행
        // 잠금에 서는데, 재확인을 **삭제 뒤에** 두면 CASCADE 가 이 사람의 멤버 행까지 지운 뒤라 404 가 된다.
        // 그래서 기다릴 것을 **먼저** 다 잡고 → 권한을 보고 → 지운다. 잡는 순서는 **프로젝트 행 → 페이지**다.
        //
        // **페이지를 CASCADE 보다 먼저 잡는 까닭.** CASCADE 는 멤버 행을 페이지보다 **먼저** 지운다 — 그대로 두면
        // 페이지 잠금을 기다리는 동안 그 프로젝트의 멤버 행이 전부 이 트랜잭션에 잡혀 있어, **역할 변경이 이
        // 삭제를 기다린다.** 그리고 그 순서는 페이지를 쥔 쓰기의 재확인(`FOR SHARE`)과
        // 서로를 기다리는 교착이 된다(`40P01` — 희생자는 삭제다).
        //
        // **프로젝트 행을 페이지보다 먼저 잡는 까닭 — 복원과 같은 순서다**(`repos/projects.ts`의 `lockProjectRow`).
        // 페이지만 먼저 잡으면 교착이 둘 난다:
        //
        // | 판 | 페이지 → 재확인 → 프로젝트 행이면 | 이 순서면 |
        // |---|---|---|
        // | 남의 페이지 쓰기가 진행 중일 때 복원 | 복원이 프로젝트 행을 쥔 채 페이지를, 삭제가 페이지를 쥔 채 프로젝트 행을 기다린다 → 한쪽이 500 · `deadlocks` +1 | 복원이 프로젝트 행에서 기다렸다가 404 |
        // | FK 삽입이 진행 중일 때 다른 owner 의 역할 변경 | 삭제가 제 멤버 행을 `FOR SHARE`로 쥔 채 프로젝트 행을 기다린다 → 역할 변경(`lockOwnerIds`)이 그 행에 서고, 삭제의 CASCADE 가 역할 변경이 쥔 다른 owner 행에 선다 → 한쪽이 500 · +1 | 역할 변경이 안 기다린다 — 프로젝트 행 대기가 재확인 **앞**이다 |
        //
        // 둘을 재는 자는 `test/guard-in-lock.test.ts`의 «잠금 순서» 절이다.
        //
        // **대가 — 페이지를 기다리는 동안 프로젝트 행을 쥔다.** 그 사이 프로젝트 행을 잡는 쓰기가 이 삭제의 커밋을
        // 기다린다: FK 삽입(프로젝트 행에 `FOR KEY SHARE` — 초대 · 메뉴 · 페이지 · 스냅샷 · 토큰 생성)과 프로젝트
        // 수정. 삭제가 커밋되면 FK 삽입은 **500**(FK 위반을 봉투로 안 바꾼다), 프로젝트 수정은 404 다.
        // 다른 순서도 이 대가를 못 피한다 — 프로젝트 행을 먼저 지우고 CASCADE 에서 페이지를 기다리면
        // **같은 것이 같은 답으로 서고** 메뉴 수정까지 선다(CASCADE 가 메뉴 행을 페이지보다 먼저 지운다). 페이지만
        // 먼저 잡으면 안 서지만 — 대신 201 로 만든 것이 곧 CASCADE 로 사라진다.
        await lockProjectRow(trx, projectId)
        await lockProjectPages(trx, projectId)
        await recheckProjectRole(trx, request)
        await deleteProject(trx, projectId)
      })
      reply.code(204).send()
    })
  }
}
