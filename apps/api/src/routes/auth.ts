/**
 * 인증 라우트: 회원가입·로그인·로그아웃·내 정보. `/api/auth` prefix로 등록한다(`app.ts`).
 *
 * HTTP·쿠키·zod 검증은 여기서 다루고, SQL은 전부 `repos/users.ts`와 `auth/session.ts`에
 * 맡긴다 — 이 파일은 postgres 에러 코드도 세션 테이블 구조도 알지 못한다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from '../auth/password'
import { sessionCookieOptions } from '../auth/plugin'
import { createSession, destroySession } from '../auth/session'
import type { ApiConfig } from '../config'
import { conflict, unauthenticated } from '../errors'
import { parseBody } from '../http/parse'
import { DuplicateEmailError, findUserByEmail, insertUser } from '../repos/users'

/**
 * 로그인 실패 메시지. "없는 이메일"과 "틀린 비밀번호"가 정확히 같은 문자열을 써야
 * 한다(설계 결정 — 로그인은 이메일 존재 여부를 구분하지 않는다). 딱 하나로 고정해
 * 두 경로가 몰래 갈라지는 사고를 막는다.
 */
const LOGIN_FAILURE_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다'

/**
 * `.email()`은 형식만 검증한다 — 정규화(소문자화)는 이 스키마의 `.transform()`이 한다.
 * 이후 `repos/users.ts`는 이미 정규화된 이메일만 받는다고 가정한다.
 *
 * zod 기본 정규식(`regexes.email`)을 그대로 쓴다 — 로컬 파트를 ASCII로 제한한다.
 * 국제화 로컬 파트 지원은 이 도구가 메일을 보내지도 않는 P1 시점에 저장 데이터의
 * 게이트만 느슨하게 할 뿐 실질적인 이득이 없는 별도의 제품 결정이라, 여기서
 * 임의로 넓히지 않는다.
 */
const NormalizedEmail = z.email().transform((value) => value.toLowerCase())

/** 회원가입 본문. `z.strictObject`라 선언되지 않은 키(예: `role`)가 오면 그 자체로 400이다 — 권한 상승 필드를 조용히 무시하지 않는다. */
const SignupBody = z.strictObject({
  email: NormalizedEmail,
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
})

const LoginBody = z.strictObject({
  email: NormalizedEmail,
  password: z.string().min(8).max(200),
})

/** 이 서버가 쓰는 scrypt 비용 파라미터. `config.passwordScryptN`만 환경별로 달라지고(운영 32768, 테스트 1024), r·p는 고정값을 쓴다. */
function scryptParams(config: ApiConfig) {
  return { ...DEFAULT_SCRYPT_PARAMS, N: config.passwordScryptN }
}

/**
 * `config`를 받아 Fastify 플러그인을 만드는 팩토리. `app.ts`가
 * `app.register(authRoutes(config), { prefix: '/api/auth' })`로 등록한다.
 */
export function authRoutes(config: ApiConfig) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * 타이밍 공격 방어용 더미 해시. 존재하지 않는 이메일로 로그인해도 이 해시로
     * `verifyPassword`를 한 번 돌려, 실제 사용자를 찾아 비밀번호를 검증하는 경로와
     * 응답 시간이 같아지게 한다 — 그렇지 않으면 "이 이메일은 가입돼 있지 않아
     * 해시 계산을 건너뛴다"는 사실이 응답 속도 차이로 새어 나간다.
     *
     * 플러그인 등록 시(서버 기동 시) 딱 한 번만 계산해 둔다 — 요청마다 새로
     * 만들 필요가 없다(내용은 절대 실사용 비밀번호와 일치하지 않으면 그만이고,
     * 매 요청 같은 값과 비교해도 안전에 영향이 없다).
     */
    const dummyHash = await hashPassword('타이밍-방어-전용-더미-비밀번호', scryptParams(config))

    app.post('/signup', async (request, reply) => {
      const body = parseBody(SignupBody, request.body)
      const passwordHash = await hashPassword(body.password, scryptParams(config))

      let user
      try {
        user = await insertUser(app.db, { email: body.email, name: body.name, passwordHash })
      } catch (error) {
        if (error instanceof DuplicateEmailError) {
          throw conflict(error.message)
        }
        throw error
      }

      const { token, expiresAt } = await createSession(app.db, user.id, config.sessionTtlHours)
      reply.setCookie(config.sessionCookieName, token, sessionCookieOptions(config, expiresAt))
      reply.code(201)
      return { id: user.id, email: user.email, name: user.name }
    })

    app.post('/login', async (request, reply) => {
      const body = parseBody(LoginBody, request.body)
      const found = await findUserByEmail(app.db, body.email)

      if (!found) {
        // 존재하지 않는 이메일이어도 검증을 한 번 돈다 — 위 dummyHash 설명 참고.
        // verifyPassword는 형식이 멀쩡한 dummyHash에는 절대 던지지 않는다.
        await verifyPassword(body.password, dummyHash)
        throw unauthenticated(LOGIN_FAILURE_MESSAGE)
      }

      const ok = await verifyPassword(body.password, found.passwordHash)
      if (!ok) {
        throw unauthenticated(LOGIN_FAILURE_MESSAGE)
      }

      // 로그인은 새 세션을 만들 뿐, 그 계정의 다른 세션에는 손대지 않는다 — 한
      // 계정이 동시에 여러 기기·탭에서 로그인해 있을 수 있다(설계 §10, P3의
      // WebSocket 인증도 이를 전제한다). "전부 로그아웃"이 필요하면
      // `destroyUserSessions`를 별도 경로(예: 비밀번호 변경)에서 명시적으로 쓴다.
      const { token, expiresAt } = await createSession(app.db, found.id, config.sessionTtlHours)
      reply.setCookie(config.sessionCookieName, token, sessionCookieOptions(config, expiresAt))
      return { id: found.id, email: found.email, name: found.name }
    })

    app.post('/logout', { preHandler: app.requireAuth }, async (request, reply) => {
      // requireAuth를 통과했다는 것은 onRequest 훅이 이 쿠키로 세션을 실제로 찾았다는
      // 뜻이므로 토큰은 항상 존재한다. 그래도 없는 경우를 조용히 넘기지 않고 확인한다.
      const token = request.cookies[config.sessionCookieName]
      if (token) {
        await destroySession(app.db, token)
      }
      reply.clearCookie(config.sessionCookieName, { path: '/' })
      reply.code(204).send()
    })

    app.get('/me', { preHandler: app.requireAuth }, async (request) => {
      // requireAuth가 이미 currentUser가 없으면 401을 던지고 여기까지 오지 못하게
      // 막는다. 아래 확인은 그 보장을 다시 검증하는 게 아니라 타입을 좁히기 위함이다.
      const user = request.currentUser
      if (!user) {
        throw unauthenticated()
      }
      return { id: user.id, email: user.email, name: user.name }
    })
  }
}
