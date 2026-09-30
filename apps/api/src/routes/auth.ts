/**
 * 인증 라우트: 로그인·로그아웃·내 정보. `/api/auth` prefix로 등록한다(`app.ts`).
 *
 * HTTP·쿠키·zod 검증은 여기서 다루고, SQL은 전부 `repos/users.ts`와 `auth/session.ts`에
 * 맡긴다 — 이 파일은 postgres 에러 코드도 세션 테이블 구조도 알지 못한다.
 *
 * **계정을 만드는 라우트는 없다.** 그 부재(`POST /signup`)를
 * `test/auth-routes.test.ts`가 **404로 든다** — 부재를 잠그는 케이스가 없으면 다음 사람이
 * 조용히 되살린다. 계정을 만드는 길은 `db/seed-user.ts`(마이그레이션 뒤의 시딩)
 * 하나이고, 이미 계정이 있는 사람을 프로젝트에 넣는 길이 멤버 초대다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { LoginPassword, NewPassword, NormalizedEmail } from '../auth/credentials'
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from '../auth/password'
import { sessionCookieOptions } from '../auth/plugin'
import { requestAddressKey, type LoginLimiter } from '../auth/login-limit'
import { recheckCredential, requestCredential } from '../auth/roles'
import { createLoginSession, destroyOtherSessions, destroySession, hashSessionToken } from '../auth/session'
import { requireSessionUser } from '../auth/session-only'
import type { ApiConfig } from '../config'
import { rateLimited, unauthenticated } from '../errors'
import { parseBody } from '../http/parse'
import { withTransaction } from '../db/tx'
import { findUserByEmail, isInstanceAdmin, setPasswordHash } from '../repos/users'
import { closeSessionConnections } from '../ws/notify'

/**
 * 로그인 실패 메시지. "없는 이메일"과 "틀린 비밀번호"가 정확히 같은 문자열을 써야
 * 한다(설계 결정 — 로그인은 이메일 존재 여부를 구분하지 않는다). 딱 하나로 고정해
 * 두 경로가 몰래 갈라지는 사고를 막는다.
 */
const LOGIN_FAILURE_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다'

/** 로그인 시도 제한의 문장. 막힌 키가 계정인지 주소인지 말하지 않는다 — 사람이 할 일(기다림)이 같다. */
function loginLimitedMessage(retryAfterSeconds: number): string {
  return `로그인 시도가 너무 많습니다 — ${Math.ceil(retryAfterSeconds / 60)}분 뒤 다시 시도하세요`
}

/**
 * 로그인 본문. `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다.
 *
 * **규격 자체는 `auth/credentials.ts`가 소유한다.** 계정을 만드는 자(시딩)와 받는 자(여기)가
 * 파일이 갈렸으므로, 두 벌이 되면 *"만들어졌는데 로그인 본문 검증에서 400 나는 계정"*이
 * 생긴다 — 그 갈림을 없애려고 규격을 한 자리로 모았다.
 */
const LoginBody = z.strictObject({
  email: NormalizedEmail,
  password: LoginPassword,
})

/**
 * 비밀번호 바꾸기 본문. 새 비밀번호는 정하는 규칙(`NewPassword` — 시딩 · 재설정 명령과 같다), 지금 비밀번호는 받는 규칙
 * (`LoginPassword` — 로그인과 같다)이다. 규칙 밖은 400 이고 한도에 안 센다(견주지 않았다 — 로그인의 400 과 같다).
 */
const PasswordBody = z.strictObject({
  currentPassword: LoginPassword,
  newPassword: NewPassword,
})

/**
 * 지금 비밀번호가 틀렸을 때의 이슈 코드. 봉투는 로그인 실패와 같은 `unauthenticated`(401) · 같은 문장이다 — 웹은 이 코드로
 * «세션이 끝났다»(401 의 다른 판)와 가른다. 세션은 그대로다.
 */
export const WRONG_PASSWORD = 'wrong-password'

/** 이 서버가 쓰는 scrypt 비용 파라미터. `config.passwordScryptN`만 환경별로 달라지고(운영 32768, 테스트 1024), r·p는 고정값을 쓴다. */
function scryptParams(config: ApiConfig) {
  return { ...DEFAULT_SCRYPT_PARAMS, N: config.passwordScryptN }
}

/**
 * `config`를 받아 Fastify 플러그인을 만드는 팩토리. `app.ts`가
 * `app.register(authRoutes(config, app.loginLimiter), { prefix: '/api/auth' })`로 등록한다. `limiter` 는 이 앱의 로그인 시도
 * 기록이다 — 앱마다 하나이고(`auth/login-limit.ts` 머리말 «저장소는 프로세스 메모리다»), 막힘을 푸는 입구(`auth/unlock-socket.ts`)가
 * 같은 것을 푼다.
 */
export function authRoutes(config: ApiConfig, limiter: LoginLimiter) {
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
     *
     * 견준 뒤 그 해시가 바뀐 판(아래 `createLoginSession` 이 0 행)도 같은 401 · 같은 문장이다. 그 판은 성공과 같은 길(관리자 표시
     * 읽기 · 삽입 문장)을 더 돌아 틀린 비밀번호보다 질의 둘만큼 늦다 — 그 차이가 말하는 것은 «견줄 때는 맞았다»뿐이라 200 이 말할
     * 것 이상을 새지 않는다(없는 계정과 있는 계정은 그 전에 갈리지 않는다).
     */
    const dummyHash = await hashPassword('타이밍-방어-전용-더미-비밀번호', scryptParams(config))

    app.post('/login', async (request, reply) => {
      const body = parseBody(LoginBody, request.body)
      // **본문을 읽은 뒤 · 첫 `await` 전에 자리를 잡는다** — 동시에 온 요청도 한 틱 안에서 차례로 세이고, 막힌 판은 DB 도 scrypt 도
      // 안 거친다(`auth/login-limit.ts` 머리말 «방식»).
      const admission = limiter.begin(body.email, requestAddressKey(request.ip, request.socket.remoteAddress))
      if (admission.kind === 'limited') {
        reply.header('retry-after', String(admission.retryAfterSeconds))
        throw rateLimited(loginLimitedMessage(admission.retryAfterSeconds))
      }

      // 견준 뒤의 401 은 실패로 남긴다. 견주기 전에 끝났으면(DB 오류) 맞혀 본 것이 아니라 자리를 걷는다.
      let found: Awaited<ReturnType<typeof findUserByEmail>>
      try {
        found = await findUserByEmail(app.db, body.email)
      } catch (error) {
        admission.abandoned()
        throw error
      }

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
      // 계정이 동시에 여러 기기·탭에서 로그인해 있을 수 있다(설계서 「권한 모델」,
      // WebSocket 인증도 이를 전제한다). 다른 세션을 끝내는 길은 비밀번호 바꾸기(`/password` — 바꾼 세션만 남긴다)와
      // 재설정 명령(`db/reset-password.ts` — 전부)이다.
      // `/me` 와 같은 모양이다 — 로그인 직후 화면이 목록 머리의 관리자 링크를 `/me` 를 다시 부르지 않고 세운다. 세션을 만들기 전에
      // 읽는다 — 이 읽기가 실패한 500 이 쿠키를 싣고 나가지 않게.
      //
      // **세션은 견준 해시가 아직 그 사람의 해시일 때만 선다**(`auth/session.ts` 의 `createLoginSession`) — 견주는 사이 비밀번호 바꾸기 ·
      // 재설정이 커밋됐으면 옛 비밀번호로 낸 세션이 그 쓰기의 «다른 세션을 끝낸다» 뒤에 남는다. 그 판은 틀린 비밀번호와 같은 401 ·
      // 같은 문장이고 **한도에는 실패로 남긴다** — 낸 비밀번호가 세션을 낼 때 이미 그 사람의 것이 아니다. 성공으로 세면(자리를 걷으면)
      // 옛 비밀번호를 쥔 쪽이 바꾸기와 겹쳐 되풀이하는 시도가 한도에 안 걸린다.
      let admin: boolean
      let session: Awaited<ReturnType<typeof createLoginSession>>
      try {
        admin = await isInstanceAdmin(app.db, found.id)
        session = await createLoginSession(app.db, found.id, found.passwordHash, config.sessionTtlHours)
      } catch (error) {
        admission.abandoned()
        throw error
      }
      if (session === null) throw unauthenticated(LOGIN_FAILURE_MESSAGE)
      admission.succeeded()
      const { token, expiresAt } = session
      reply.setCookie(config.sessionCookieName, token, sessionCookieOptions(config, expiresAt))
      return { id: found.id, email: found.email, name: found.name, isInstanceAdmin: admin }
    })

    app.post('/logout', { preHandler: app.requireAuth }, async (request, reply) => {
      // requireAuth를 통과했다는 것은 onRequest 훅이 이 쿠키로 세션을 실제로 찾았다는
      // 뜻이므로 토큰은 항상 존재한다. 그래도 없는 경우를 조용히 넘기지 않고 확인한다.
      const token = request.cookies[config.sessionCookieName]
      if (token) {
        await destroySession(app.db, token)
        // **그 세션의 WS 연결을 닫고 잠금을 놓는다** — 안 하면 다음 확인까지 열려 잠금이 남의 화면에 남는다(`ws/notify.ts`의
        // `closeSessionConnections`).
        closeSessionConnections(app, hashSessionToken(token))
      }
      reply.clearCookie(config.sessionCookieName, { path: '/' })
      reply.code(204).send()
    })

    /**
     * **자기 비밀번호를 바꾼다** — 세션으로만(토큰은 401 · 이 라우트는 프로젝트 밖이라 토큰이 사람을 안 채운다), 지금 비밀번호를
     * 견줘서. 바꾸면 이 세션만 남기고 그 사람의 다른 세션을 지우고 그 세션들의 WS 를 닫는다. API 토큰은 그대로다(spec
     * `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「비밀번호 바꾸기」).
     *
     * **지금 비밀번호를 견주는 시도는 로그인 한도에 센다** — 계정 키 · 주소 키가 로그인과 같다(`auth/login-limit.ts` 머리말 «방식»).
     * 안 세면 훔친 세션이 한도 없이 비밀번호를 맞혀 보는 창구가 된다. 자리를 잡는 자리 · 걷는 자리는 `/login` 과 같다.
     */
    app.post('/password', { preHandler: app.requireAuth }, async (request, reply) => {
      const user = requireSessionUser(request, 'API 토큰으로는 비밀번호를 바꿀 수 없습니다. 로그인 후 다시 시도하세요')
      const credential = requestCredential(request)
      const body = parseBody(PasswordBody, request.body)
      const admission = limiter.begin(user.email, requestAddressKey(request.ip, request.socket.remoteAddress))
      if (admission.kind === 'limited') {
        reply.header('retry-after', String(admission.retryAfterSeconds))
        throw rateLimited(loginLimitedMessage(admission.retryAfterSeconds))
      }

      let found: Awaited<ReturnType<typeof findUserByEmail>>
      try {
        found = await findUserByEmail(app.db, user.email)
      } catch (error) {
        admission.abandoned()
        throw error
      }
      if (!found) {
        admission.abandoned()
        throw unauthenticated()
      }
      if (!(await verifyPassword(body.currentPassword, found.passwordHash))) {
        throw unauthenticated(LOGIN_FAILURE_MESSAGE, [
          { path: 'currentPassword', code: WRONG_PASSWORD, message: '지금 비밀번호가 맞지 않습니다' },
        ])
      }
      admission.succeeded()

      // 해시는 트랜잭션 밖에서 — scrypt 동안 사용자 행을 쥐지 않는다.
      const passwordHash = await hashPassword(body.newPassword, scryptParams(config))
      // **사용자 행 → 자격 재확인 → 다른 세션 삭제 차례다.** 재확인(세션 행 `KEY SHARE`)이 먼저면 같은 사람의 두 세션이 함께 바꿀 때
      // «앞: 자기 세션 → 사용자 행 대기 · 뒤: 사용자 행 → 앞 세션 삭제 대기»로 고리가 선다. 사용자 행을 먼저 잡으면 둘이 거기서
      // 줄을 서고, 뒤는 앞이 지운 자기 세션을 재확인에서 보고 401 로 되돌아간다([api] `auth-password.test.ts` «두 세션이 겹쳐»).
      // 같은 사람의 다른 세션이 낸 관리자 쓰기도 사용자 행을 먼저 잡는다(`auth/admin.ts` 의 `recheckInstanceAdmin` 머리말).
      const ended = await withTransaction(app.db, async (trx) => {
        if (!(await setPasswordHash(trx, user.id, passwordHash))) throw unauthenticated()
        await recheckCredential(trx, credential)
        return destroyOtherSessions(trx, user.id, credential.id)
      })
      // 지운 세션의 WS 는 로그아웃과 같은 길로 닫는다 — 안 닫으면 그 연결의 다음 확인(프레임 · 방송)까지 열려 있다.
      for (const sessionId of ended) closeSessionConnections(app, sessionId)
      reply.code(204).send()
    })

    app.get('/me', { preHandler: app.requireAuth }, async (request) => {
      // requireAuth가 이미 currentUser가 없으면 401을 던지고 여기까지 오지 못하게
      // 막는다. 아래 확인은 그 보장을 다시 검증하는 게 아니라 타입을 좁히기 위함이다.
      const user = request.currentUser
      if (!user) {
        throw unauthenticated()
      }
      // 관리자 표시는 요청마다 DB 에서 읽는다 — 세션에 얼리면 강등이 로그아웃까지 안 먹는다(`repos/users.ts` 의 `isInstanceAdmin`).
      return { id: user.id, email: user.email, name: user.name, isInstanceAdmin: await isInstanceAdmin(app.db, user.id) }
    })
  }
}
