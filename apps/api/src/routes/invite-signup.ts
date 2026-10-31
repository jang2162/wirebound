/**
 * **초대 링크로 가입** — `/api/auth` 아래, 로그인하지 않은 요청이 부른다(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * «가입 화면»). **웹 · API 에서 계정을 만드는 길은 이것 하나다** — 링크 없이 만드는 라우트는 없다(`test/user-creation-census.test.ts`).
 *
 * - `GET /invites/:token` — 쓸 수 있으면 200 `{ usable: true }`.
 * - `POST /invites/:token/signup` — 계정을 만들고 곧바로 세션을 낸다(`/login` 과 같은 몸 · 같은 쿠키). 201.
 *
 * **못 쓰는 링크 넷(없음 · 만료 · 거둠 · 다 씀)은 같은 404 · 같은 문장이다** — 링크가 있었는지를 바깥에 가르지 않는다.
 *
 * **가입은 로그인 한도에 센다**(`auth/login-limit.ts` — 계정 키는 본문 이메일, 주소 키는 로그인과 같다). 링크 원문을 맞혀 보는 판과
 * 이메일이 있는지(409) 대 보는 판을 같은 한도가 묶는다. 404 · 409 는 실패로 남고, 성공은 제 자리만 걷는다. 본문이 틀린 요청(400)은 견주기
 * 전이라 안 센다. 링크는 잠그지 않고 먼저 보고(`findUsableInvite`) 쓸 수 있을 때만 scrypt 를 돈다 — 못 쓰는 링크로 scrypt 를 돌리게 하지 않는다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DisplayName, NewPassword, NormalizedEmail } from '../auth/credentials'
import { requestAddressKey, type LoginLimiter } from '../auth/login-limit'
import { DEFAULT_SCRYPT_PARAMS, hashPassword } from '../auth/password'
import { sessionCookieOptions } from '../auth/plugin'
import { createSession } from '../auth/session'
import type { ApiConfig } from '../config'
import { withTransaction } from '../db/tx'
import { ApiError, conflict, notFound, rateLimited } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { recordAdminAction } from '../repos/admin-audit'
import { findUsableInvite, InviteUnusableError, signupWithInvite } from '../repos/invites'
import { DuplicateEmailError } from '../repos/users'

/** 못 쓰는 링크 넷의 한 문장(계획 «공통 제약»). */
export const INVITE_UNUSABLE = '이 초대 링크는 더 쓸 수 없습니다 — 관리자에게 새 링크를 받으세요'
export const EMAIL_TAKEN = '이미 계정이 있는 이메일입니다 — 로그인하세요'

/** 링크 원문 — 길이만 막는다(꼴이 틀린 원문도 «없는 링크» 와 같은 404 다). */
export const LinkParams = z.object({ token: z.string().min(1).max(256) })

const SignupBody = z.strictObject({
  email: NormalizedEmail,
  name: DisplayName,
  password: NewPassword,
})

/** 시도 한도의 문장 — 로그인과 같은 꼴이다(`routes/auth.ts` 의 `loginLimitedMessage`). */
export function attemptsLimitedMessage(retryAfterSeconds: number): string {
  return `시도가 너무 많습니다 — ${Math.ceil(retryAfterSeconds / 60)}분 뒤 다시 시도하세요`
}

export function inviteSignupRoutes(config: ApiConfig, limiter: LoginLimiter) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/invites/:token', async (request) => {
      const { token } = parseParams(LinkParams, request.params)
      if ((await findUsableInvite(app.db, token)) === null) throw notFound(INVITE_UNUSABLE)
      return { usable: true }
    })

    app.post('/invites/:token/signup', async (request, reply) => {
      const { token } = parseParams(LinkParams, request.params)
      const body = parseBody(SignupBody, request.body)
      const admission = limiter.begin(body.email, requestAddressKey(request.ip, request.socket.remoteAddress))
      if (admission.kind === 'limited') {
        reply.header('retry-after', String(admission.retryAfterSeconds))
        throw rateLimited(attemptsLimitedMessage(admission.retryAfterSeconds))
      }

      let created
      try {
        if ((await findUsableInvite(app.db, token)) === null) throw notFound(INVITE_UNUSABLE)
        // 해시는 트랜잭션 밖에서 — scrypt 동안 링크 행을 쥐지 않는다.
        const passwordHash = await hashPassword(body.password, { ...DEFAULT_SCRYPT_PARAMS, N: config.passwordScryptN })
        created = await withTransaction(app.db, async (trx) => {
          let signup
          try {
            signup = await signupWithInvite(trx, { token, email: body.email, name: body.name, passwordHash })
          } catch (error) {
            if (error instanceof InviteUnusableError) throw notFound(INVITE_UNUSABLE)
            if (error instanceof DuplicateEmailError) throw conflict(EMAIL_TAKEN)
            throw error
          }
          await recordAdminAction(trx, {
            action: 'invite.signup',
            actorId: signup.user.id,
            targetUserId: signup.user.id,
            inviteId: signup.inviteId,
            detail: {
              inviteName: signup.inviteName,
              targetName: signup.user.name,
              targetEmail: signup.user.email,
              inviteCreatedBy: signup.createdBy,
            },
          })
          const session = await createSession(trx, signup.user.id, config.sessionTtlHours)
          return { user: signup.user, session }
        })
      } catch (error) {
        // 링크 · 이메일을 대 본 거절(404 · 409)은 실패로 남긴다. 그 밖(DB 오류)은 대 본 것이 아니라 자리를 걷는다.
        if (!(error instanceof ApiError && (error.status === 404 || error.status === 409))) admission.abandoned()
        throw error
      }
      admission.succeeded()
      reply.setCookie(config.sessionCookieName, created.session.token, sessionCookieOptions(config, created.session.expiresAt))
      return reply.status(201).send({ id: created.user.id, email: created.user.email, name: created.user.name, isInstanceAdmin: false })
    })
  }
}
