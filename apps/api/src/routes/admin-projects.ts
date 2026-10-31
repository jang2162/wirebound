/**
 * **관리자 › 프로젝트** — `/api/admin` 아래(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 프로젝트»).
 *
 * - `GET /projects` — 모든 프로젝트(관리자가 멤버가 아닌 것도). 이름 · 슬러그 · owner · 멤버 수 · 최근 수정뿐이다.
 * - `POST /projects/:id/owner` `{ userId }` — **활성 owner 가 없는 프로젝트만** 그 사람을 owner 로 만든다(자기 자신도 된다).
 *
 * **파라미터 이름이 `:projectId` 가 아니다** — 인증 훅은 그 이름을 가진 라우트에서 API 토큰을 받는다(`auth/plugin.ts` 머리말 표).
 * 그 이름이면 관리자의 그 프로젝트 토큰으로 이 쓰기가 섰다. 다른 이름이면 토큰은 사람을 안 채워 `requireAuth` 가 401 이다 —
 * [api] `admin-projects.test.ts` «owner 넘기기는 세션 전용이다».
 *
 * **관리자가 하는 프로젝트 쓰기는 이것 하나다** — 내용 라우트는 `projectGuard`(멤버만)가 막고, 이 파일은 그것을 안 바꾼다(spec «반목표»).
 *
 * ## 잠금 차례 — 사용자 행(요청자 · 대상, id 순 `FOR SHARE`) → 재확인 → 프로젝트 행(`KEY SHARE`) → 대상 토큰 → owner 행
 *
 * 사용자 행이 첫 칸인 것은 `routes/admin-users.ts` 머리말 «잠금 차례» 와 같다 — 대상의 비활성화(대상 행 `FOR NO KEY UPDATE`)와 그 행에서
 * 줄을 서, 넘긴 owner 가 커밋 순간에도 활성이다. 프로젝트 행은 `KEY SHARE` 다 — 삭제(`FOR UPDATE`)가 먼저면 기다린 뒤 0 행으로 404,
 * 여기가 먼저면 삭제가 이 커밋을 기다린다. 토큰 → owner 행은 `repos/admin-projects.ts` 의 `transferOwner` 머리말.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { recheckInstanceAdmin, requireInstanceAdmin } from '../auth/admin'
import { withTransaction } from '../db/tx'
import { badRequest, conflict, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { recordAdminAction } from '../repos/admin-audit'
import { ActiveOwnerExistsError, findAdminProject, listAdminProjects, transferOwner } from '../repos/admin-projects'
import { lockProjectShared } from '../repos/projects'
import { lockUserRows } from '../repos/users'
import { notifyMembershipChanged } from '../ws/notify'

const ProjectParams = z.object({ id: z.uuid() })
const OwnerBody = z.strictObject({ userId: z.uuid() })

export const PROJECT_NOT_FOUND = '프로젝트를 찾을 수 없습니다'
export const ACTIVE_OWNER_EXISTS = '이 프로젝트에는 이미 활성 owner 가 있습니다'
export const OWNER_TARGET_INACTIVE = '활성 사용자만 owner 로 만들 수 있습니다'

export function adminProjectRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/projects', { preHandler: app.requireAuth }, async (request) => {
      await requireInstanceAdmin(app.db, request)
      return listAdminProjects(app.db)
    })

    app.post('/projects/:id/owner', { preHandler: app.requireAuth }, async (request) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { id: projectId } = parseParams(ProjectParams, request.params)
      const { userId } = parseBody(OwnerBody, request.body)
      const project = await withTransaction(app.db, async (trx) => {
        const locked = await lockUserRows(trx, [
          { id: actorId, mode: 'share' },
          { id: userId, mode: 'share' },
        ])
        await recheckInstanceAdmin(trx, request)
        await lockProjectShared(trx, projectId)
        const target = locked.get(userId)
        if (target === undefined || !target.active) throw badRequest(OWNER_TARGET_INACTIVE)
        let previousRole: string | null
        try {
          ;({ previousRole } = await transferOwner(trx, projectId, userId))
        } catch (error) {
          if (error instanceof ActiveOwnerExistsError) throw conflict(ACTIVE_OWNER_EXISTS)
          throw error
        }
        const view = await findAdminProject(trx, projectId)
        if (view === null) throw notFound(PROJECT_NOT_FOUND)
        await recordAdminAction(trx, {
          action: 'project.owner',
          actorId,
          targetUserId: userId,
          projectId,
          detail: { projectName: view.name, targetName: target.name, targetEmail: target.email, previousRole: previousRole ?? 'none' },
        })
        return view
      })
      notifyMembershipChanged(app, { projectId, userId, role: 'owner' })
      return { project }
    })
  }
}
