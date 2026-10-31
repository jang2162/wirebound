/**
 * **관리자 › 초대 링크** — `/api/admin` 아래(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 초대 링크»).
 *
 * - `GET /invites` · `POST /invites` · `POST /invites/:inviteId/revoke`.
 *
 * **원문은 만들기 응답 하나에만 실린다** — 목록에는 원문도 해시도 없다(`repos/invites.ts` 머리말). 세션 전용 · 첫 줄 판정 · 같은 트랜잭션의
 * 기록은 `routes/admin-users.ts` 와 같다. **재확인을 쓰기 앞에 둔다** — 요청자 사용자 행을 링크 행보다 먼저 잡는다(그 머리말 «잠금 차례»).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { recheckInstanceAdmin, requireInstanceAdmin } from '../auth/admin'
import { HIDDEN_CHAR_IN_NAME, hasHiddenChar } from '../auth/hidden-chars'
import { withTransaction } from '../db/tx'
import { conflict, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { recordAdminAction } from '../repos/admin-audit'
import { createInvite, findInvite, listInvites, revokeInvite } from '../repos/invites'

/** 만료 기본 7 일 · 고를 수 있는 범위 1 – 90 일(계획 «공통 제약»). */
export const INVITE_DEFAULT_DAYS = 7

const CreateBody = z.strictObject({
  // 링크 이름도 사람이 지은 글이라 화면의 문장 · 표 · 기록 줄에 선다 — 사용자 이름과 같은 표로 숨는 글자를 거절한다(`auth/hidden-chars.ts`).
  name: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((name) => !hasHiddenChar(name), { error: HIDDEN_CHAR_IN_NAME }),
  kind: z.enum(['single', 'multi']),
  expiresInDays: z.number().int().min(1).max(90).default(INVITE_DEFAULT_DAYS),
})

const InviteParams = z.object({ inviteId: z.uuid() })

export const INVITE_NOT_FOUND = '초대 링크를 찾을 수 없습니다'
export const INVITE_ALREADY_UNUSABLE = '이미 쓸 수 없는 링크입니다'

export function adminInviteRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/invites', { preHandler: app.requireAuth }, async (request) => {
      await requireInstanceAdmin(app.db, request)
      return listInvites(app.db)
    })

    app.post('/invites', { preHandler: app.requireAuth }, async (request, reply) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const body = parseBody(CreateBody, request.body)
      const created = await withTransaction(app.db, async (trx) => {
        await recheckInstanceAdmin(trx, request)
        const expiresAt = new Date(Date.now() + body.expiresInDays * 86_400_000)
        const { id, token } = await createInvite(trx, { name: body.name, kind: body.kind, expiresAt, createdBy: actorId })
        await recordAdminAction(trx, {
          action: 'invite.create',
          actorId,
          inviteId: id,
          detail: { inviteName: body.name, kind: body.kind, expiresInDays: body.expiresInDays },
        })
        const invite = await findInvite(trx, id)
        if (invite === null) throw notFound(INVITE_NOT_FOUND)
        return { invite, token }
      })
      return reply.status(201).send(created)
    })

    app.post('/invites/:inviteId/revoke', { preHandler: app.requireAuth }, async (request) => {
      const actorId = await requireInstanceAdmin(app.db, request)
      const { inviteId } = parseParams(InviteParams, request.params)
      const invite = await withTransaction(app.db, async (trx) => {
        await recheckInstanceAdmin(trx, request)
        const outcome = await revokeInvite(trx, inviteId)
        if (outcome === null) throw notFound(INVITE_NOT_FOUND)
        if (outcome === 'unusable') throw conflict(INVITE_ALREADY_UNUSABLE)
        const revoked = await findInvite(trx, inviteId)
        if (revoked === null) throw notFound(INVITE_NOT_FOUND)
        await recordAdminAction(trx, { action: 'invite.revoke', actorId, inviteId, detail: { inviteName: revoked.name } })
        return revoked
      })
      return { invite }
    })
  }
}
