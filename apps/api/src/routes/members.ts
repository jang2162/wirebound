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
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { withTransaction } from '../db/tx'
import { conflict, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { DuplicateMemberError, LastOwnerError, insertMember, listMembers, removeMember, updateMemberRole } from '../repos/members'
import { findUserByEmail } from '../repos/users'
import { lockProjectShared } from '../repos/projects'
import { notifyMembershipChanged } from '../ws/notify'

/**
 * `.email()`은 형식만 검증하고, 이메일 대소문자 무시는 이
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
        member = await withTransaction(app.db, async (trx) => {
          // **프로젝트 행이 먼저다**(`repos/projects.ts`의 `lockProjectShared`). 삽입의 FK 도 같은 `KEY SHARE`를 걸지만
          // 그것은 프로젝트 삭제 뒤에 섰다가 깨면 23503 — 봉투 없는 500 이다(이월 AA′ 남는 틈 2). 먼저 잡으면 0 행 → 404.
          await lockProjectShared(trx, projectId)
          const inserted = await insertMember(trx, projectId, user, body.role)
          // **커밋 순간의 권한**(이월 AA′ — `auth/roles.ts`의 `recheckProjectRole`). 삽입의 FK 가 프로젝트 행에 거는
          // `KEY SHARE`가 복원 · 프로젝트 삭제의 `FOR UPDATE` 뒤에 섰을 수 있다 — 그 사이 owner 에서 내려갔으면 403 이다.
          await recheckProjectRole(trx, request)
          return inserted
        })
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
      // **커밋 뒤에** 그 사람의 켜 둔 화면에 알린다(이월 5차 — `ws/notify.ts`). 화면이 역할을 다시 읽는다.
      notifyMembershipChanged(app, { projectId, userId, role: member.role })
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
      notifyMembershipChanged(app, { projectId, userId, role: null })
      reply.code(204).send()
    })
  }
}
