/**
 * **관리자 › 사용자** — `/api/admin` 아래(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 사용자» ·
 * «비활성화» · «관리자 지정 · 해제» · «비밀번호 재설정 링크»).
 *
 * - `GET /users` · `POST /users/:userId/deactivate` · `POST /users/:userId/activate` · `POST /users/:userId/admin` ·
 *   `DELETE /users/:userId/admin` · `POST /users/:userId/reset-links`.
 *
 * **세션 전용이다**(`routes/admin-themes.ts` 머리말 — `:projectId` 가 없어 토큰이 사람을 안 채운다). 판정은 핸들러 첫 줄
 * `requireInstanceAdmin`, 쓰기는 같은 트랜잭션에서 기록을 남기고 재확인한다.
 *
 * ## 잠금 차례 — 사용자 행(id 순) → 재확인(요청자 자격) → 링크 · 세션 · 토큰
 *
 * 쓰기마다 **대상 행(`FOR NO KEY UPDATE`)과 요청자 행(`FOR SHARE`)을 id 순으로** 먼저 잡는다(`repos/users.ts` 의 `lockUserRows`). 그다음
 * 재확인(`recheckInstanceAdmin` — 요청자 행은 이미 쥐었고 자격 행 `KEY SHARE` 를 더한다)을 **쓰기 앞에** 둔다 — 비밀번호 바꾸기 · 재설정이
 * «사용자 행 → 세션» 이므로 사용자 행이 늘 첫 칸이다. 재확인이 잡은 잠금은 커밋까지 쥐므로 판정은 커밋 순간의 것이다(테마 라우트처럼 쓰기
 * 뒤에 두면 링크 행을 쥔 뒤 사용자 행을 기다려, 사용자 행 → 링크 행으로 잡는 비활성화와 고리가 선다).
 *
 * **마지막 관리자** — 해제 · 비활성화는 요청자가 관리자이고 대상과 다를 때만 선다. 요청자 행을 `FOR SHARE` 로 쥔 채 재확인이 «관리자» 를
 * 보고 커밋하므로 커밋 순간에도 요청자는 관리자다 — 관리자가 0 이 되지 않는다. 서로를 동시에 해제하는 둘은 id 순 잠금에서 줄을 서고 뒤
 * 요청은 재확인에서 403 이다. 활성 관리자 수 검사(`LAST_ADMIN`)는 그 위의 겹이다.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { recheckInstanceAdmin, requireInstanceAdmin } from '../auth/admin'
import { withTransaction, type DbHandle } from '../db/tx'
import { conflict, notFound } from '../errors'
import { parseParams } from '../http/parse'
import { recordAdminAction } from '../repos/admin-audit'
import { createPasswordReset } from '../repos/password-resets'
import {
  activateUser,
  applyInstanceAdmin,
  deactivateUser,
  findAdminUser,
  listAdminUsers,
  lockUserRows,
  type AdminUserRecord,
  type LockedUser,
} from '../repos/users'
import { closeSessionConnections } from '../ws/notify'

const UserParams = z.object({ userId: z.uuid() })

export const USER_NOT_FOUND = '사용자를 찾을 수 없습니다'
export const SELF_DEACTIVATE = '자기 자신은 비활성화할 수 없습니다'
export const ALREADY_INACTIVE = '이미 비활성인 사용자입니다'
export const ALREADY_ACTIVE = '이미 활성인 사용자입니다'
export const LAST_ADMIN = '활성 관리자가 한 명 남습니다 — 다른 사람을 먼저 관리자로 지정하세요'
export const INACTIVE_GRANT = '비활성 사용자는 관리자로 지정할 수 없습니다'
export const ALREADY_ADMIN = '이미 관리자입니다'
export const SELF_REVOKE = '자기 자신의 관리자 권한은 해제할 수 없습니다'
export const NOT_ADMIN_TARGET = '관리자가 아닙니다'
export const RESET_INACTIVE = '비활성 사용자에게는 재설정 링크를 만들 수 없습니다'

/**
 * 대상 · 요청자 행을 id 순으로 잡고 재확인한 뒤 대상을 낸다(머리말 «잠금 차례»). 대상이 없으면 404.
 */
async function lockTarget(trx: DbHandle, request: FastifyRequest, actorId: string, targetId: string): Promise<LockedUser> {
  const locked = await lockUserRows(trx, [
    { id: targetId, mode: 'update' },
    { id: actorId, mode: 'share' },
  ])
  await recheckInstanceAdmin(trx, request)
  const target = locked.get(targetId)
  if (target === undefined) throw notFound(USER_NOT_FOUND)
  return target
}

/** 활성 관리자 수 — 해제 · 비활성화의 «마지막 관리자» 겹(머리말). */
async function activeAdminCount(trx: DbHandle): Promise<number> {
  const row = await trx
    .selectFrom('users')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('is_instance_admin', '=', true)
    .where('deactivated_at', 'is', null)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

async function userView(trx: DbHandle, userId: string): Promise<AdminUserRecord> {
  const user = await findAdminUser(trx, userId)
  if (user === null) throw notFound(USER_NOT_FOUND)
  return user
}

export function adminUserRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/users', { preHandler: app.requireAuth }, async (request) => {
      await requireInstanceAdmin(app.db, request)
      return listAdminUsers(app.db)
    })

    /**
     * 비활성화 — 세션 · API 토큰 전부 삭제, 그 사람이 만든 링크 거둠, 관리자 표시 지움(`repos/users.ts` 의 `deactivateUser`). 커밋 뒤 지운
     * 세션의 WS 를 닫는다(비밀번호 바꾸기와 같은 길). `ownerlessProjects` 는 이 사람이 마지막 활성 owner 였던 프로젝트 수다 — 막지 않고 알린다.
     */
    app.post('/users/:userId/deactivate', { preHandler: app.requireAuth }, async (request) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { userId } = parseParams(UserParams, request.params)
      if (userId === actorId) throw conflict(SELF_DEACTIVATE)
      const result = await withTransaction(app.db, async (trx) => {
        const target = await lockTarget(trx, request, actorId, userId)
        if (!target.active) throw conflict(ALREADY_INACTIVE)
        if (target.isInstanceAdmin && (await activeAdminCount(trx)) <= 1) throw conflict(LAST_ADMIN)
        const { revokedLinks, endedSessions } = await deactivateUser(trx, target, actorId)
        const ownerless = await trx
          .selectFrom('project_members as mine')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('mine.user_id', '=', userId)
          .where('mine.role', '=', 'owner')
          .where(({ not, exists, selectFrom }) =>
            not(
              exists(
                selectFrom('project_members as other')
                  .innerJoin('users as u', 'u.id', 'other.user_id')
                  .select('other.user_id')
                  .whereRef('other.project_id', '=', 'mine.project_id')
                  .where('other.role', '=', 'owner')
                  .where('u.deactivated_at', 'is', null),
              ),
            ),
          )
          .executeTakeFirstOrThrow()
        return { user: await userView(trx, userId), revokedLinks, ownerlessProjects: Number(ownerless.n), endedSessions }
      })
      for (const sessionId of result.endedSessions) closeSessionConnections(app, sessionId)
      return { user: result.user, revokedLinks: result.revokedLinks, ownerlessProjects: result.ownerlessProjects }
    })

    app.post('/users/:userId/activate', { preHandler: app.requireAuth }, async (request) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { userId } = parseParams(UserParams, request.params)
      const user = await withTransaction(app.db, async (trx) => {
        const target = await lockTarget(trx, request, actorId, userId)
        if (target.active) throw conflict(ALREADY_ACTIVE)
        await activateUser(trx, target, actorId)
        return userView(trx, userId)
      })
      return { user }
    })

    app.post('/users/:userId/admin', { preHandler: app.requireAuth }, async (request) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { userId } = parseParams(UserParams, request.params)
      const user = await withTransaction(app.db, async (trx) => {
        const target = await lockTarget(trx, request, actorId, userId)
        if (!target.active) throw conflict(INACTIVE_GRANT)
        if (target.isInstanceAdmin) throw conflict(ALREADY_ADMIN)
        await applyInstanceAdmin(trx, target, true, actorId)
        return userView(trx, userId)
      })
      return { user }
    })

    app.delete('/users/:userId/admin', { preHandler: app.requireAuth }, async (request) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { userId } = parseParams(UserParams, request.params)
      if (userId === actorId) throw conflict(SELF_REVOKE)
      return withTransaction(app.db, async (trx) => {
        const target = await lockTarget(trx, request, actorId, userId)
        if (!target.isInstanceAdmin) throw conflict(NOT_ADMIN_TARGET)
        if ((await activeAdminCount(trx)) <= 1) throw conflict(LAST_ADMIN)
        const { revokedLinks } = await applyInstanceAdmin(trx, target, false, actorId)
        return { user: await userView(trx, userId), revokedLinks }
      })
    })

    /** 재설정 링크 — 24 시간 · 한 번. 원문은 이 응답에만 있다. 그 사람의 안 쓴 앞 링크는 막힌다(`repos/password-resets.ts`). */
    app.post('/users/:userId/reset-links', { preHandler: app.requireAuth }, async (request, reply) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { userId } = parseParams(UserParams, request.params)
      const created = await withTransaction(app.db, async (trx) => {
        const target = await lockTarget(trx, request, actorId, userId)
        if (!target.active) throw conflict(RESET_INACTIVE)
        const reset = await createPasswordReset(trx, { userId, createdBy: actorId })
        await recordAdminAction(trx, {
          action: 'reset.create',
          actorId,
          targetUserId: userId,
          detail: { targetName: target.name, targetEmail: target.email },
        })
        return reset
      })
      return reply.status(201).send({ token: created.token, expiresAt: created.expiresAt })
    })
  }
}
