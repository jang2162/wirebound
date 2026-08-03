/**
 * 멤버 라우트: 목록·초대·역할 변경·제거. `projectRoutes`(`routes/projects.ts`)와
 * 같은 `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 분리하되 URL 네임스페이스는
 * 공유한다. `/:projectId`에 걸린 프로젝트 CRUD와 달리 이 파일의 라우트는 전부
 * `/:projectId/members`(그 아래 `/:userId`) 아래에 있다.
 *
 * HTTP·zod 검증만 다룬다 — SQL은 전부 `repos/members.ts`에 맡긴다. 권한 판정은
 * `auth/roles.ts`의 `projectGuard` 하나가 전담한다 — 이 파일은 역할을 비교하지
 * 않는다(`request.projectRole`을 읽지도 않는다 — 성공 응답에 role이 필요 없다).
 *
 * 초대는 이미 가입한 사용자만 대상으로 한다 — 미가입 이메일은 `repos/users.ts`의
 * `findUserByEmail`이 `null`을 돌려주고, 그걸 여기서 404로 매핑한다. 이메일 발송은
 * 하지 않는다(P1 범위 밖).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { conflict, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { DuplicateMemberError, LastOwnerError, insertMember, listMembers, removeMember, updateMemberRole } from '../repos/members'
import { findUserByEmail } from '../repos/users'

/**
 * `.email()`은 형식만 검증하고, 이메일 대소문자 무시(태스크 11 브리프)는 이
 * `.transform()`이 담당한다 — `routes/auth.ts`의 `NormalizedEmail`과 정확히 같은
 * 규칙이다: 사용자는 이미 소문자로 정규화되어 저장돼 있으므로, 초대 이메일도
 * 같은 방식으로 소문자화하면 대소문자와 무관하게 같은 행을 찾는다.
 */
const NormalizedEmail = z.email().transform((value) => value.toLowerCase())

const Role = z.enum(['owner', 'editor', 'viewer'])

const ProjectIdParams = z.object({ projectId: z.uuid() })
const MemberParams = z.object({ projectId: z.uuid(), userId: z.uuid() })

/** `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다(`routes/auth.ts`·`routes/projects.ts`와 같은 관례). */
const InviteBody = z.strictObject({
  email: NormalizedEmail,
  role: Role,
})

const UpdateRoleBody = z.strictObject({
  role: Role,
})

/** `app.ts`가 `app.register(memberRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function memberRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/members', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      return listMembers(app.db, projectId)
    })

    app.post('/:projectId/members', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(InviteBody, request.body)

      const user = await findUserByEmail(app.db, body.email)
      if (!user) {
        throw notFound('해당 이메일의 사용자가 없습니다')
      }

      let member
      try {
        member = await insertMember(app.db, projectId, user, body.role)
      } catch (error) {
        if (error instanceof DuplicateMemberError) {
          throw conflict(error.message)
        }
        throw error
      }

      reply.code(201)
      return member
    })

    app.patch('/:projectId/members/:userId', { preHandler: projectGuard('owner') }, async (request) => {
      const { projectId, userId } = parseParams(MemberParams, request.params)
      const body = parseBody(UpdateRoleBody, request.body)

      let member
      try {
        member = await updateMemberRole(app.db, projectId, userId, body.role)
      } catch (error) {
        if (error instanceof LastOwnerError) {
          throw conflict(error.message)
        }
        throw error
      }

      if (!member) {
        throw notFound()
      }
      return member
    })

    app.delete('/:projectId/members/:userId', { preHandler: projectGuard('owner') }, async (request, reply) => {
      const { projectId, userId } = parseParams(MemberParams, request.params)

      let result
      try {
        result = await removeMember(app.db, projectId, userId)
      } catch (error) {
        if (error instanceof LastOwnerError) {
          throw conflict(error.message)
        }
        throw error
      }

      if (result === 'not-member') {
        throw notFound()
      }
      reply.code(204).send()
    })
  }
}
