/**
 * **관리자 기록 읽기** — `GET /api/admin/audit`. 관리자 누구나 전부 본다(spec `2026-10-31-workspace-admin-design.md` «관리자 › 기록»).
 * 쓰는 길은 없다 — 기록은 각 행동이 같은 트랜잭션에서 남긴다(`repos/admin-audit.ts`).
 *
 * 세션 전용이다 — `:projectId` 가 없어 API 토큰이 사람을 안 채운다(`routes/admin-themes.ts` 머리말과 같다).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireInstanceAdmin } from '../auth/admin'
import { parseQuery } from '../http/parse'
import { AUDIT_ACTIONS, listAdminActions } from '../repos/admin-audit'

const AuditQuery = z.strictObject({
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: z.uuid().optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export function adminAuditRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/audit', { preHandler: app.requireAuth }, async (request) => {
      await requireInstanceAdmin(app.db, request)
      const query = parseQuery(AuditQuery, request.query)
      return listAdminActions(app.db, query)
    })
  }
}
