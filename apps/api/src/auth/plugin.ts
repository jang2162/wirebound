/**
 * 자격 하나를 `request.currentUser`로 바꾸는 Fastify 플러그인.
 *
 * **자격이 둘이다: 세션 쿠키와 API 토큰**(P9-2 D1·D4 — 그 전까지는 쿠키 하나였다).
 * P3의 WebSocket 핸드셰이크도 같은 쿠키로 인증해야 하므로(설계 §10), 세션 조회는
 * 캐시 없이 매 요청 DB를 direct hit한다 — `resolveSession`이 그 자체로 이미 그렇다.
 *
 * ---
 *
 * # 토큰은 **프로젝트 라우트에서만** 사람을 채운다 (D4)
 *
 * §10이 *"토큰 스코프는 프로젝트 단위"*라고 적었는데, 이 훅은 **«자격이 없다»로는 던질 수 없다**
 * (아래 훅의 주석 — 여기서 던지면 `requireAuth`가 없는 공개 라우트까지 죽는다). 그래서
 * 범위 위반을 401로 던지는 대신 **채우지 않는다.**
 *
 * | 라우트 | 토큰만 든 요청 |
 * |---|---|
 * | `:projectId`를 **가진다** | `currentUser`를 채운다. 어느 프로젝트인지는 `tokenProjectId`가 나른다 |
 * | `:projectId`가 **없고** 인증이 필요하다 | 안 채운다 → **기존 `requireAuth`가 401을 낸다**(새 판정이 없다) |
 * | `:projectId`가 **없고** 공개다(`/health`) | 안 채운다 → 아무 일도 없다 |
 *
 * **훅이 자기 라우트를 아는지 쟀다**(계획서 재라 #1 — *"기억으로 썼다"*고 적힌 문장이다).
 * Fastify 5는 라우팅을 마친 뒤에 `onRequest`를 돌리므로 `request.routeOptions.url`에
 * **패턴이 그대로** 들어 있다(`/api/projects/:projectId/pages/:pageId`). 라우트를 못 찾은
 * 요청에서는 `undefined`이고 그때는 어차피 404다. `request.params`도 이 시점에 이미
 * 채워져 있지만 **패턴 쪽을 본다** — *"이 라우트가 프로젝트 라우트인가"*는 값이 아니라
 * 선언의 성질이고, 값으로 보면 `:projectId`라는 이름의 파라미터를 가진 다른 라우트가
 * 생겼을 때 둘을 가를 수 없다.
 *
 * **스코프가 어긋난 요청의 404는 여기가 아니라 `auth/roles.ts`가 낸다.** 사실 3이
 * *"권한 판정은 `requireProjectRole` 하나"*를 못박았으므로, 이 훅은 *"어느 프로젝트에
 * 묶인 자격인가"*를 값으로만 나르고 판정은 그쪽이 한다.
 *
 * **WS는 쿠키만이다.** §10이 *"WS 핸드셰이크도 같은 쿠키를 쓰므로 REST와 WS의 인증
 * 경로가 하나다"*라고 적었고, 토큰을 거기 얹으면 그 하나가 둘이 된다. `ws/routes.ts`가
 * 토큰이 든 요청을 가드 앞에서 끊는다(`requireSessionAuth`) — **재서 알았다**: 그 라우트도
 * `:projectId`를 가지므로 그것 없이는 토큰이 핸드셰이크를 통과했다.
 * `test/api-tokens.test.ts`의 *"WS는 쿠키만이다"*가 그것을 든다.
 *
 * ---
 *
 * # «자격이 없다»와 «확인하지 못했다»를 가른다 (2026-09-22 이월 W (i))
 *
 * 앞 판은 세션·토큰 조회의 **어떤 예외든** `catch {}`로 삼켜 `currentUser = null`로 두었다. 그런데 이 두 조회가
 * 던지는 것은 **DB 오류뿐이다** — 만료는 SQL 조건이라 `null`이고, 쿠키·토큰 원문은 해시로만 질의에 실려 형식을
 * 보는 자가 없다. 그래서 삼킨 것은 전부 **«확인하지 못했다»** 였고, 그것이 401 `unauthenticated`로 나갔다. 웹은
 * 401 을 «세션 끝»으로 읽어 로그인 화면으로 보내고 **세션 세대를 올려 나가 있던 쓰기를 끊는다** — 멀쩡한 세션이
 * 쓰던 게시를 잃고, 다시 들어와 같은 글을 달면 **두 행**이었다(좁은 반증 3차 a-2 · Chrome: 세션 조회만 1.2s 실패시킨
 * 판 — GET 401 · 나가 있던 POST `ERR_ABORTED` · 같은 쿠키 `/me` **200**).
 *
 * | 조회의 답 | 뜻 | 이 훅 |
 * |---|---|---|
 * | 행이 있다 | 자격이 있다 | `currentUser`를 채운다 |
 * | 행이 없다(없는 세션 · 만료 · 폐기된 토큰) | **자격이 없다** | `null`로 둔다 → 가드가 401 |
 * | **던졌다**(DB 오류) | **확인하지 못했다** | **그대로 던진다** → `http/error-handler.ts`가 가른다: 연결을 잃었으면 503, 서버가 답한 오류면 500 |
 *
 * **던지는 자리를 여기 하나로 둔다** — `currentUser`가 없으면 401 을 내는 자리는 여럿이다(`projectGuard` ·
 * `requireAuth` · 핸들러의 타입 좁히기). 그 자리마다 «확인 못 함»을 따로 들고 가르면 새 라우트 하나가 그것을
 * 잊는 순간 다시 401 이다. 여기서 던지면 **`currentUser === null`은 언제나 «자격이 없다»** 라서 그 자리들이 그대로
 * 참이다.
 *
 * **잃는 것** — DB 가 안 닿는 동안 **쿠키를 실은** 공개 라우트 요청도 실패한다. 공개 라우트는 `/health`·
 * `POST /api/auth/login` 둘이고 로그인은 어차피 DB 가 필요하다. `/health`는 DB 를 안 쓰지만 쿠키를 실어 부르는
 * 자가 없다(웹은 부르지 않는다).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fastifyCookie, { type CookieSerializeOptions } from '@fastify/cookie'
import type { ApiConfig } from '../config'
import { unauthenticated } from '../errors'
import { findApiTokenByValue } from '../repos/api-tokens'
import { hashSessionToken, resolveSession, type SessionUser } from './session'

/** 이 요청이 무엇으로 인증됐는가. 인증되지 않았으면 `null`이다. */
export type AuthKind = 'session' | 'token'

/**
 * 라우트 패턴에 프로젝트 파라미터가 있는지 보는 술어. **글자를 한 자리에 둔다** —
 * 훅과 케이스(`test/token-route-census.test.ts`)가 같은 판정을 쓰게 하려는 것이다.
 */
export const PROJECT_ID_PARAM = ':projectId'

/** `Authorization: Bearer <값>`에서 값만. 그 꼴이 아니면 `null`이다. */
export function bearerValue(header: string | undefined): string | null {
  if (header === undefined) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

declare module 'fastify' {
  interface FastifyRequest {
    /** 인증된 사용자. 자격이 없거나, 세션이 만료됐거나, 토큰이 이 라우트에 안 닿으면 `null`이다. */
    currentUser: SessionUser | null

    /**
     * `currentUser`를 채운 자격의 종류. 없으면 `null`이다.
     *
     * **토큰 관리 라우트가 이것을 읽는다**(`routes/tokens.ts`) — 토큰으로 토큰을 더 만들
     * 수 있으면 폐기가 자격을 거두지 못한다.
     */
    authKind: AuthKind | null

    /**
     * 이 요청의 자격이 묶인 프로젝트. **세션은 묶이지 않으므로 `null`이다.**
     * `projectGuard`가 이 값을 `requireProjectRole`에 넘겨 스코프 밖을 404로 만든다.
     */
    tokenProjectId: string | null

    /**
     * 이 요청을 채운 **토큰 행의 신원**. 세션으로 들어왔으면 `null`이다.
     *
     * **`revisions.actor_id`·`actor_label`이 여기서 온다**(§7.4 · `auth/actor.ts`).
     * `currentUser`만으로는 그 값을 만들 수 없다 — 토큰은 발급자의 권한을 상속하므로
     * 사람은 같고 **자격이 다르다.**
     */
    tokenActor: { tokenId: string; tokenName: string } | null

    /**
     * 이 요청을 채운 **세션 행의 id**(`sessions.id` — 쿠키 원문의 sha256, `auth/session.ts`). 토큰으로
     * 들어왔거나 자격이 없으면 `null`이다.
     *
     * **방송의 발신자 제외가 이것을 본다**(`ws/broadcast.ts`의 `sentBy`) — 요청이 실은 연결 id 가 **이
     * 세션의** 연결일 때만 뺀다. 없으면(토큰) 아무도 안 뺀다. WS 연결이 드는 `RoomConnection.sessionId`와
     * 같은 함수로 만든 값이다.
     */
    sessionId: string | null
  }

  interface FastifyInstance {
    /** `currentUser`가 없으면 401(`unauthenticated`)을 던지는 preHandler. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/**
 * 세션 쿠키를 만들 때 라우트가 옵션을 직접 조립하지 않도록 한곳에 모아 둔다.
 * `secure`는 `NODE_ENV=production`일 때만 켠다 — 로컬 개발(http)에서까지 켜면
 * 브라우저가 쿠키를 아예 보내지 않아 로그인 직후 바로 로그아웃된 것처럼 보인다.
 */
export function sessionCookieOptions(config: ApiConfig, expiresAt: Date): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    expires: expiresAt,
  }
}

/**
 * 인증 플러그인을 `app`에 직접 등록한다. `app.register()`를 거치지 않고 받은
 * 인스턴스에 바로 `decorate`/`addHook`을 건다 — `registerErrorHandler`와 같은 방식이다.
 * `app.register()`로 감쌌다면 Fastify가 새 캡슐화 컨텍스트를 만들어, 이후 `app.ts`가
 * 최상위 `app`에 직접 등록하는 라우트들이 이 훅과 데코레이터를 못 볼 뻔했다
 * (`fastify-plugin`으로 캡슐화를 깨는 방법도 있지만, 그 패키지는 `apps/api`의
 * 직접 의존성이 아니라 끌어오지 않는다).
 *
 * 순서가 중요하다: `app.db`가 이미 `decorate`돼 있어야 한다(`app.ts`가 그 순서를 지킨다).
 */
export async function registerAuthPlugin(app: FastifyInstance, config: ApiConfig): Promise<void> {
  await app.register(fastifyCookie)

  app.decorateRequest('currentUser', null)
  app.decorateRequest('authKind', null)
  app.decorateRequest('tokenProjectId', null)
  app.decorateRequest('tokenActor', null)
  app.decorateRequest('sessionId', null)

  // 모든 요청(공개 라우트 포함)에서 돈다. **«자격이 없다»로는 던지지 않는다** — 여기서 401 을 던지면
  // `requireAuth`가 없는 공개 라우트까지 죽는다. 쿠키가 없거나, 세션이 없거나 만료됐으면 조용히
  // `currentUser`를 `null`로 둔다. 토큰도 같다.
  //
  // **«확인하지 못했다»면 던진다**(2026-09-22 이월 W (i)) — 머리말 «자격이 없다 · 확인하지 못했다».
  app.addHook('onRequest', async (request) => {
    request.currentUser = null
    request.authKind = null
    request.tokenProjectId = null
    request.tokenActor = null
    request.sessionId = null

    // **쿠키가 먼저다.** 둘 다 실린 요청(브라우저에서 도구를 부르는 경우)에서 사람이
    // 앉아 있는 쪽을 고른다 — 그쪽이 스코프에 묶이지 않아 더 넓고, 토큰이 이기면
    // 브라우저가 자기 프로젝트 밖에서 조용히 404를 받는다.
    const cookie = request.cookies[config.sessionCookieName]
    if (cookie) {
      // **잡지 않는다.** 이 조회가 던지는 것은 DB 오류뿐이다(만료는 SQL 조건이라 `null` · 쿠키 원문은 해시로만
      // 질의에 실린다). 던지면 아래 토큰 갈래로도 넘어가지 않는다 — 쿠키가 먼저인데 그 쿠키를 모른다.
      const user = await resolveSession(app.db, cookie)
      if (user) {
        request.currentUser = user
        request.authKind = 'session'
        request.sessionId = hashSessionToken(cookie)
        return
      }
    }

    const bearer = bearerValue(request.headers.authorization)
    if (bearer === null) return

    // **D4의 자리다.** 프로젝트 라우트가 아니면 조회조차 하지 않는다 — 채우지 않을 값을
    // 위해 DB를 때릴 이유가 없고, `/health`에 토큰을 실은 요청이 **아무 일도 하지 않는
    // 것**(재라 #6)이 이 한 줄에서 나온다.
    if (!request.routeOptions.url?.includes(PROJECT_ID_PARAM)) return

    // **잡지 않는다** — 쿠키 갈래와 같다. 형식을 보는 자가 없고(해시만 질의에 실린다) 던지는 것은 DB 오류뿐이다.
    const principal = await findApiTokenByValue(app.db, bearer)
    if (!principal) return
    request.currentUser = principal.user
    request.authKind = 'token'
    // 판정은 `auth/roles.ts`가 한다 — 여기는 값만 나른다.
    request.tokenProjectId = principal.projectId
    // **§7.4의 `actor_label='<토큰명>'`이 이 두 줄에 매여 있다**(`auth/actor.ts`).
    request.tokenActor = { tokenId: principal.tokenId, tokenName: principal.tokenName }
  })

  app.decorate('requireAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.currentUser) {
      throw unauthenticated()
    }
  })
}
