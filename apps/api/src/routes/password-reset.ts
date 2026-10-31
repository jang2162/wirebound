/**
 * **재설정 링크 쓰기** — `/api/auth` 아래, 로그인하지 않은 요청이 부른다(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * «비밀번호 재설정 화면»). 링크는 관리자가 만든다(`routes/admin-users.ts` 의 `POST /users/:userId/reset-links`).
 *
 * - `GET /resets/:token` — 쓸 수 있으면 200 `{ email, name }`.
 * - `POST /resets/:token` — 비밀번호를 바꾸고 그 사람의 세션을 전부 지운 뒤 WS 를 닫는다. 204.
 *
 * **쓰기 몸통은 재설정 명령과 같은 함수다**(`db/reset-password.ts` 의 `replacePassword`) — «사용자 행 → 세션». 그 앞에 대상의 사용자 행 →
 * 링크 행을 잡는다(`repos/password-resets.ts` 머리말 «잠금»). API 토큰은 그대로다(재설정 명령과 같다).
 *
 * **못 쓰는 링크(없음 · 만료 · 이미 씀 · 막힘)는 같은 404 · 같은 문장이다.** 쓰기는 로그인 한도에 센다 — 계정 키는 링크의 대상 이메일이고,
 * 못 쓰는 링크면 원문의 해시를 계정 키로 쓴다(대상이 없다). 404 는 실패로 남는다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { NewPassword } from '../auth/credentials'
import { requestAddressKey, type LoginLimiter } from '../auth/login-limit'
import { DEFAULT_SCRYPT_PARAMS, hashPassword } from '../auth/password'
import { hashTokenValue } from '../auth/token-hash'
import type { ApiConfig } from '../config'
import { replacePassword } from '../db/reset-password'
import { withTransaction } from '../db/tx'
import { ApiError, notFound, rateLimited } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { recordAdminAction } from '../repos/admin-audit'
import { findUsableReset, lockResetForUse, markResetUsed } from '../repos/password-resets'
import { closeSessionConnections } from '../ws/notify'
import { attemptsLimitedMessage, LinkParams } from './invite-signup'

export const RESET_UNUSABLE = '이 재설정 링크는 더 쓸 수 없습니다 — 관리자에게 새 링크를 받으세요'

const ResetBody = z.strictObject({ password: NewPassword })

export function passwordResetRoutes(config: ApiConfig, limiter: LoginLimiter) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/resets/:token', async (request) => {
      const { token } = parseParams(LinkParams, request.params)
      const reset = await findUsableReset(app.db, token)
      if (reset === null) throw notFound(RESET_UNUSABLE)
      return { email: reset.email, name: reset.name }
    })

    app.post('/resets/:token', async (request, reply) => {
      const { token } = parseParams(LinkParams, request.params)
      const body = parseBody(ResetBody, request.body)
      const found = await findUsableReset(app.db, token)
      const admission = limiter.begin(
        found?.email ?? `reset:${hashTokenValue(token)}`,
        requestAddressKey(request.ip, request.socket.remoteAddress),
      )
      if (admission.kind === 'limited') {
        reply.header('retry-after', String(admission.retryAfterSeconds))
        throw rateLimited(attemptsLimitedMessage(admission.retryAfterSeconds))
      }

      let ended: string[]
      try {
        if (found === null) throw notFound(RESET_UNUSABLE)
        const passwordHash = await hashPassword(body.password, { ...DEFAULT_SCRYPT_PARAMS, N: config.passwordScryptN })
        ended = await withTransaction(app.db, async (trx) => {
          const reset = await lockResetForUse(trx, found)
          if (reset === null) throw notFound(RESET_UNUSABLE)
          const replaced = await replacePassword(trx, { id: reset.userId }, passwordHash)
          if (replaced === null) throw notFound(RESET_UNUSABLE)
          await markResetUsed(trx, reset.id)
          await recordAdminAction(trx, {
            action: 'reset.use',
            actorId: reset.userId,
            targetUserId: reset.userId,
            detail: {
              targetName: reset.name,
              targetEmail: reset.email,
              resetCreatedBy: reset.createdBy,
              sessions: replaced.endedSessions.length,
            },
          })
          return replaced.endedSessions
        })
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) admission.abandoned()
        throw error
      }
      admission.succeeded()
      // 지운 세션의 WS 는 로그아웃 · 비밀번호 바꾸기와 같은 길로 닫는다.
      for (const sessionId of ended) closeSessionConnections(app, sessionId)
      reply.code(204).send()
    })
  }
}
