/**
 * 자격 하나를 `request.currentUser`로 바꾸는 Fastify 플러그인.
 *
 * **자격이 둘이다: 세션 쿠키와 API 토큰.**
 * WebSocket 핸드셰이크도 같은 쿠키로 인증해야 하므로(설계서 「권한 모델」), 세션 조회는
 * 캐시 없이 매 요청 DB를 direct hit한다 — `resolveSession`이 그 자체로 이미 그렇다.
 *
 * ---
 *
 * # 토큰은 **프로젝트 라우트에서만** 사람을 채운다
 *
 * 「권한 모델」이 *"토큰 스코프는 프로젝트 단위"*라고 적었는데, 이 훅은 **«자격이 없다»로는 던질 수 없다**
 * (아래 훅의 주석 — 여기서 던지면 `requireAuth`가 없는 공개 라우트까지 죽는다). 그래서
 * 범위 위반을 401로 던지는 대신 **채우지 않는다.**
 *
 * | 라우트 | 토큰만 든 요청 |
 * |---|---|
 * | `:projectId`를 **가진다** | `currentUser`를 채운다. 어느 프로젝트인지는 `tokenProjectId`가 나른다 |
 * | `:projectId`가 **없고** 인증이 필요하다 | 안 채운다 → **`requireAuth`가 401을 낸다**(따로 판정하지 않는다) |
 * | `:projectId`가 **없고** 공개다(`/health`) | 안 채운다 → 아무 일도 없다 |
 *
 * **훅은 자기 라우트를 안다.**
 * Fastify 5는 라우팅을 마친 뒤에 `onRequest`를 돌리므로 `request.routeOptions.url`에
 * **패턴이 그대로** 들어 있다(`/api/projects/:projectId/pages/:pageId`). 라우트를 못 찾은
 * 요청에서는 `undefined`이고 그때는 어차피 404다. `request.params`도 이 시점에 이미
 * 채워져 있지만 **패턴 쪽을 본다** — *"이 라우트가 프로젝트 라우트인가"*는 값이 아니라
 * 선언의 성질이고, 값으로 보면 `:projectId`라는 이름의 파라미터를 가진 다른 라우트가
 * 생겼을 때 둘을 가를 수 없다.
 *
 * **스코프가 어긋난 요청의 404는 여기가 아니라 `auth/roles.ts`가 낸다.**
 * *"권한 판정은 `requireProjectRole` 하나"*이므로(`auth/roles.ts` 머리말), 이 훅은 *"어느 프로젝트에
 * 묶인 자격인가"*를 값으로만 나르고 판정은 그쪽이 한다.
 *
 * **WS는 쿠키만이다.** 「권한 모델」이 *"WS 핸드셰이크도 같은 쿠키를 쓰므로 REST와 WS의 인증
 * 경로가 하나다"*라고 적었고, 토큰을 거기 얹으면 그 하나가 둘이 된다. `ws/routes.ts`가
 * 토큰이 든 요청을 가드 앞에서 끊는다(`requireSessionAuth`) — 그 라우트도
 * `:projectId`를 가지므로 그것 없이는 토큰이 핸드셰이크를 통과한다.
 * `test/api-tokens.test.ts`의 *"WS는 쿠키만이다"*가 그것을 든다.
 *
 * ---
 *
 * # «자격이 없다»와 «확인하지 못했다»를 가른다
 *
 * 세션·토큰 조회가 던지는 것은 **DB 오류뿐이다** — 만료는 SQL 조건이라 `null`이고, 쿠키·토큰 원문은 해시로만
 * 질의에 실려 형식을 보는 자가 없다. 그래서 조회의 예외를 `catch {}`로 삼켜 `currentUser = null`로 두면 삼킨 것은
 * 전부 **«확인하지 못했다»** 인데 그것이 401 `unauthenticated`로 나간다. 웹은
 * 401 을 «세션 끝»으로 읽어 로그인 화면으로 보내고 **세션 세대를 올려 나가 있던 쓰기를 끊는다** — 멀쩡한 세션이
 * 쓰던 게시를 잃고, 다시 들어와 같은 글을 달면 **두 행**이 된다(Chrome 으로 세션 조회만 1.2s 실패시킨
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
 *
 * ---
 *
 * # 요청한 탭이 아는 사용자
 *
 * 쿠키는 브라우저에 하나다. 다른 탭이 다른 사람으로 로그인하면 이 탭의 쿠키도 그 사람의 것이 되는데, 탭의 화면은
 * 그 사실을 **탭 사이 알림**(웹의 `session/session-context.tsx` «탭 사이»)으로만 안다. 알림이 늦게 닿거나 아예 안
 * 오면 그 사이의 요청이 **새 사람의 이름으로** 나간다(Chrome · 이 확인이 없는 서버: 알림 없는 로그인 — 같은 브라우저의 다른 탭에서
 * raw `fetch('/api/auth/login')` — 뒤 앨리스로 믿는 탭의 코멘트가 **작성자 밥**으로 커밋 · 두 탭의 ms 안 동시 로그인
 * 20회 중 7회 어긋남 — 어긋난 탭의 쓰기 7/7 이 쿠키 쪽 사람 이름 · 재연결한 WS 가 밥으로 붙어 앨리스 탭의 잠금이
 * «밥 편집 중»). 셋 다 **서버가 요청마다 «이 탭이 아는 사용자»를 쿠키의 사용자와 견줘야** 닫힌다.
 *
 * 웹은 그 id 를 싣는다 — REST 는 머리(`KNOWN_USER_HEADER`), WS 핸드셰이크는 쿼리(`KNOWN_USER_QUERY` — 브라우저
 * `WebSocket`은 머리를 못 단다). **판정은 여기 하나다**(`knownUserOf` · 훅의 한 줄):
 *
 * | 요청 | 이 훅 |
 * |---|---|
 * | 실린 id 가 **없다**(CLI · MCP · 토큰 · 그 값을 안 싣는 옛 빌드의 탭 · `curl`) | 확인 없이 받는다 |
 * | 쿠키로 인증됐고 실린 id 가 **쿠키의 사용자와 같다** | 받는다 |
 * | 쿠키로 인증됐고 **다르다** | **409 `conflict` + 이슈 코드 `session-user-changed`** — 읽기도 쓰기도 핸드셰이크도 |
 * | 쿠키가 없다 · 만료 · 토큰 | 보지 않는다 — 401 은 가드가 낸다 |
 * | `GET /api/auth/me` · `POST /api/auth/login` | 보지 않는다 — `me`는 탭이 **쿠키의 사람을 알아내는** 길이고, 로그인은 쿠키를 바꾸는 요청이다 |
 * | `POST /api/auth/logout` | 보지 않는다 — **권리를 줄이는 쪽이다**(아래 «로그아웃을 막지 않는다») |
 * | 실린 id 가 **둘 이상**(쿼리 `knownUser`를 두 번) | **다르다**로 본다 — REST 머리 둘이 `, `로 이어져 409 인 것과 같다(`knownUserOf`) |
 *
 * **읽기도 거절한다.** 탭은 앞 사람의 화면(권리 · 초안 · 잠금)을 들고 있다 — 새 사람의 권리로 읽은 값을 앞 사람의 화면에
 * 그리지 않는다. 그리고 거절받는 첫 요청이 곧 탭이 사람이 바뀐 것을 아는 순간이다(웹은 이 코드를 받으면 `me`로 쿠키의
 * 사람을 다시 알아낸다 — `api/http-client.ts`). 쓰기만 막으면 알림 없는 판의 탭은 읽기만 하는 동안 영영 모른다.
 *
 * **로그아웃을 막지 않는다.** 면제가 `me` · 로그인 둘뿐이면 낡은 탭의 «로그아웃»이 409 로 막히고,
 * 웹이 그 거절을 받아 `me`로 쿠키의 사람을 알아낸 뒤 **나가려고 누른 사람에게 다른 사람(밥)의 목록**을 연다(Chrome: 첫 클릭
 * 409 → 머리 «밥» · `/` · 두 번째 클릭에서야 204 → `/login`). 이 확인이 막는 것은 **다른 사람의 이름으로 쓰기 · 읽기**인데 로그아웃은
 * 아무것도 쓰지 않고 권리를 거둔다. 막아서 얻는 것은 «앨리스로 믿던 탭이 밥의 세션을 끝내지 않는다» 하나이고, 쿠키는 브라우저에
 * 하나라 **어느 탭의 로그아웃이든 그 브라우저의 로그아웃**이다(밥의 탭에서 눌러도 같다). 그래서 로그아웃은 한 번에 쿠키를 지우고 로그인
 * 화면으로 간다 — 지우는 세션은 **쿠키의 사람(밥)** 의 것이고, 밥의 다른 탭은 탭 사이 알림(`signed-out`)으로 로그인 화면에 간다.
 *
 * **핸드셰이크도 같은 판정이다** — 업그레이드 요청도 이 훅을 지난다(`ws/routes.ts` 머리말). 거절은 **101 전의 HTTP 409**
 * 다 — 소켓이 서기 전이라 닫힘 코드가 없고, 브라우저에는 «열리지 못하고 닫힘»으로 보인다. 401 · 403 · 404 핸드셰이크 거절이
 * 이미 그 모양이라(`requireSessionAuth` · `projectGuard`) 새 닫힘 코드를 짓지 않는다. 웹은 그 판을 `refused`로 읽어
 * 프로젝트를 다시 읽고(`routes/editor.tsx`의 `reread`), 그 읽기가 머리 판정에 걸려 이 409 를 받는다.
 *
 * **409 인 까닭** — 401 이 아니다: 쿠키의 세션은 멀쩡하다. 401 을 내면 웹이 «세션 끝»으로 읽어 세대를 올리고 **로그인
 * 화면**으로 가는데, 브라우저는 이미 다른 사람으로 로그인해 있다. 403 도 아니다: 권한이 아니라 «누구의 요청인가»가
 * 어긋났다. 요청이 서버의 지금 상태와 부딪혔다는 409 의 뜻에 맞고, 이슈 코드로 가른다(코멘트의 `idempotency-key-reused`와
 * 같은 관례 — 웹은 문장으로 가르지 않는다).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fastifyCookie, { type CookieSerializeOptions } from '@fastify/cookie'
import type { ApiConfig } from '../config'
import { conflict, unauthenticated, type ApiError } from '../errors'
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

/**
 * 탭이 아는 사용자 id 를 싣는 머리(REST)와 쿼리 키(WS 핸드셰이크) — 머리말 «요청한 탭이 아는 사용자». **이름은 웹의
 * `api/http-client.ts`·`realtime/protocol.ts`와 같아야 한다**(연결 id 머리 `ws/notify.ts`의 `CONNECTION_ID_HEADER`와 같은 관례).
 */
export const KNOWN_USER_HEADER = 'x-wb-known-user'
export const KNOWN_USER_QUERY = 'knownUser'

/** 쿠키의 사용자가 탭이 아는 사용자와 다를 때의 이슈 코드. 웹은 이 코드 하나로 가른다. */
export const SESSION_USER_CHANGED = 'session-user-changed'

/** 탭이 아는 사용자를 확인하지 않는 라우트 — 쿠키의 사람을 알아내는 길과 쿠키를 바꾸는 길(로그인 · 로그아웃 — 머리말의 표). */
const KNOWN_USER_EXEMPT = new Set(['GET /api/auth/me', 'POST /api/auth/login', 'POST /api/auth/logout'])

/**
 * 요청이 실은 «탭이 아는 사용자» — 없으면 `null`(그때는 확인 없이 받는다). 머리가 먼저고, WS 핸드셰이크(`GET` · 패턴이
 * `/ws`로 끝난다)만 쿼리를 본다 — REST 라우트의 쿼리는 라우트마다 선언된 키만 받는다(README «쿼리»). 빈 값은 없는 것이다.
 *
 * **쿼리가 둘 이상이면 `, `로 잇는다** — 쿼리 파서는 같은 키를 배열로 주는데, 문자열만 받으면 배열을 «없음»으로
 * 쳐 **확인 없이 연다**(`?knownUser=<앨리스>&knownUser=<밥>` + 앨리스 쿠키 → 101). REST 머리는 둘이면 Node 가 `, `로 이어
 * 문자열로 주므로 409 다 — 같은 규칙으로 맞춘다. 이은 값은 어떤 id 와도 같지 않으니 **둘 이상은 늘 «다름»** 이다(둘이 같아도).
 */
export function knownUserOf(request: FastifyRequest): string | null {
  const header = request.headers[KNOWN_USER_HEADER]
  const raw =
    typeof header === 'string'
      ? header
      : request.method === 'GET' && request.routeOptions.url?.endsWith('/ws') === true
        ? (request.query as Record<string, unknown> | undefined)?.[KNOWN_USER_QUERY]
        : undefined
  const known = Array.isArray(raw) ? raw.join(', ') : raw
  return typeof known === 'string' && known !== '' ? known : null
}

/**
 * **판정은 이것 하나다**(머리말의 표) — 쿠키로 인증된 요청이 다른 사용자를 안다고 하면 거절할 오류, 아니면 `null`.
 * 훅이 쿠키 갈래에서 부른다(토큰 · 익명은 여기 안 온다).
 */
export function knownUserConflict(request: FastifyRequest, cookieUserId: string): ApiError | null {
  if (KNOWN_USER_EXEMPT.has(`${request.method} ${request.routeOptions.url ?? ''}`)) return null
  const known = knownUserOf(request)
  if (known === null || known === cookieUserId) return null
  const message = '다른 사람으로 로그인됐습니다 — 이 탭이 아는 사용자와 지금 로그인한 사용자가 다릅니다'
  return conflict(message, [{ path: 'session', code: SESSION_USER_CHANGED, message }])
}

/**
 * **이 훅이 던진 WS 업그레이드는 답을 보낸 뒤 소켓을 닫는다** — 409(`session-user-changed`)만이 아니라 던짐 전부다
 * («확인하지 못했다»의 503/500 도 같은 기전으로 열린 채 남는다: DB 를 내린 채 쿠키 실은 업그레이드 → 503 을 1–2ms 에 보내고
 * **10 000ms 에도 안 닫힘** · 쿠키 없는 업그레이드는 가드의 401 을 1ms 에 닫음). 업그레이드 소켓을 닫는 것은 `@fastify/websocket`의
 * `onResponse` 훅인데, 그 훅은 **자기 `onRequest`가 돈 요청만** 닫는다(`request.ws`). 그 `onRequest`는 이 훅보다 뒤에
 * 등록되므로(`app.ts` — 인증이 먼저다) 여기서 던지면 돌지 않고, 409 는 나가지만 TCP 소켓이 열린 채 남는다 —
 * `withRealApi`의 `close`가 그 소켓을 기다려 케이스가 시간 초과로 죽는다(`test/known-user.test.ts`). 브라우저는
 * 실패한 핸드셰이크의 소켓을 스스로 닫지만 서버가 그것에 기대지 않는다.
 */
function closeUpgradeAfterReply(request: FastifyRequest, reply: FastifyReply): void {
  if (request.headers.upgrade?.toLowerCase() !== 'websocket') return
  reply.raw.once('finish', () => request.raw.socket.destroy())
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
     * **`revisions.actor_id`·`actor_label`이 여기서 온다**(설계서 「LLM 편집 경로」 · `auth/actor.ts`).
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
 * `app.register()`로 감싸면 Fastify가 새 캡슐화 컨텍스트를 만들어, 이후 `app.ts`가
 * 최상위 `app`에 직접 등록하는 라우트들이 이 훅과 데코레이터를 못 본다
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
  // **«확인하지 못했다»면 던진다** — 머리말 «자격이 없다 · 확인하지 못했다».
  app.addHook('onRequest', async (request, reply) => {
    try {
      await authenticate(request)
    } catch (caught) {
      // **이 훅이 던진 업그레이드는 여기서 닫는다**(`closeUpgradeAfterReply` — 409 · 503 · 500 전부).
      closeUpgradeAfterReply(request, reply)
      throw caught
    }
  })

  /** 위 훅의 몸 — 자격 하나를 `request`에 채운다. **던지면** 훅이 업그레이드 소켓을 닫고 다시 던진다. */
  async function authenticate(request: FastifyRequest): Promise<void> {
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
        // **요청한 탭이 다른 사람을 안다면 거절한다**(머리말 «요청한 탭이 아는 사용자»). 쿠키 갈래에서만 —
        // 쿠키가 먼저이고, 쿠키가 없으면 견줄 «쿠키의 사용자»가 없다.
        const changed = knownUserConflict(request, user.id)
        if (changed !== null) throw changed
        request.currentUser = user
        request.authKind = 'session'
        request.sessionId = hashSessionToken(cookie)
        return
      }
    }

    const bearer = bearerValue(request.headers.authorization)
    if (bearer === null) return

    // **토큰은 프로젝트 라우트에서만 사람을 채운다**(머리말). 프로젝트 라우트가 아니면 조회조차
    // 하지 않는다 — 채우지 않을 값을 위해 DB를 때릴 이유가 없고, `/health`에 토큰을 실은 요청이
    // **아무 일도 하지 않는 것**이 이 한 줄에서 나온다.
    if (!request.routeOptions.url?.includes(PROJECT_ID_PARAM)) return

    // **잡지 않는다** — 쿠키 갈래와 같다. 형식을 보는 자가 없고(해시만 질의에 실린다) 던지는 것은 DB 오류뿐이다.
    const principal = await findApiTokenByValue(app.db, bearer)
    if (!principal) return
    request.currentUser = principal.user
    request.authKind = 'token'
    // 판정은 `auth/roles.ts`가 한다 — 여기는 값만 나른다.
    request.tokenProjectId = principal.projectId
    // **설계서 「LLM 편집 경로」의 `actor_label='<토큰명>'`이 이 두 줄에 매여 있다**(`auth/actor.ts`).
    request.tokenActor = { tokenId: principal.tokenId, tokenName: principal.tokenName }
  }

  app.decorate('requireAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.currentUser) {
      throw unauthenticated()
    }
  })
}
