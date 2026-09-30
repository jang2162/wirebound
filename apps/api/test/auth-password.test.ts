/**
 * **비밀번호 바꾸기**(`POST /api/auth/password` — `src/routes/auth.ts`). 한도 · 창은 `LOGIN_LIMIT` 에서 읽는다 — 수를 손으로 적지
 * 않는다.
 *
 * 롤백 하네스(`withApi`)로 재는 판과 실커밋이 필요한 판(WS 연결 · 겹친 요청 — `withRealApi` · `withProxiedRealApi`)이 한 파일에
 * 있다. 실커밋 판은 `resetRealData` 로 앞뒤를 지운다 — 롤백 판은 남기는 것이 없다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOGIN_LIMIT } from '../src/auth/login-limit'
import { WS_CLOSE } from '../src/ws/protocol'
import {
  authCookie,
  createProject,
  resetRealData,
  signup,
  withApi,
  withProxiedRealApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

const { perAccount, perAddress } = LOGIN_LIMIT
const NEW_PASSWORD = 'newpassword5678'
const WRONG = '틀린비밀번호1234'

function changePassword(
  ctx: TestContext,
  cookie: { wb_session: string },
  body: { currentPassword: string; newPassword: string },
  remoteAddress = '10.0.0.1',
) {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/password', cookies: cookie, payload: body, remoteAddress })
}

function login(ctx: TestContext, email: string, password: string, remoteAddress = '10.0.0.2') {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress })
}

function me(ctx: TestContext, cookie: { wb_session: string }) {
  return ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: cookie })
}

/** 같은 사람의 로그인 하나 더 — 다른 세션이다. 주소를 가른다(한도의 주소 키가 케이스의 주소와 안 섞이게). */
async function anotherSession(ctx: TestContext, who: SignedUpUser): Promise<{ wb_session: string }> {
  const res = await login(ctx, who.user.email, who.password, '10.0.9.9')
  expect(res.statusCode, res.body).toBe(200)
  return authCookie(res.cookies.find((cookie) => cookie.name === 'wb_session')!.value)
}

async function issueToken(ctx: TestContext, who: SignedUpUser, projectId: string) {
  const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/tokens`, cookies: who.cookie, payload: { name: 'CI' } })
  expect(res.statusCode, res.body).toBe(201)
  return { authorization: `Bearer ${(res.json() as { value: string }).value}` }
}

/** 그 사람의 비밀번호가 무엇인지 로그인으로 잰다(주소를 가른다 — 한도에 섞이지 않게). */
async function passwordIs(ctx: TestContext, email: string, password: string): Promise<boolean> {
  const res = await login(ctx, email, password, '10.0.7.7')
  return res.statusCode === 200
}

describe('비밀번호 바꾸기', () => {
  it('옳은 지금 비밀번호와 규칙에 맞는 새 비밀번호면 204 — 새 비밀번호로 로그인되고 옛 것은 401', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const res = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      expect(res.statusCode, res.body).toBe(204)
      expect((await login(ctx, alice.user.email, NEW_PASSWORD)).statusCode).toBe(200)
      expect((await login(ctx, alice.user.email, alice.password)).statusCode).toBe(401)
    })
  })

  it('이 세션만 남는다 — 같은 사람의 다른 세션은 401, 남의 세션 · 그 사람의 API 토큰은 그대로', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const token = await issueToken(ctx, alice, project.id)
      const second = await anotherSession(ctx, alice)
      const third = await anotherSession(ctx, alice)

      const res = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      expect(res.statusCode, res.body).toBe(204)

      expect((await me(ctx, alice.cookie)).statusCode).toBe(200)
      expect((await me(ctx, second)).statusCode).toBe(401)
      expect((await me(ctx, third)).statusCode).toBe(401)
      expect((await me(ctx, bob.cookie)).statusCode).toBe(200)
      const byToken = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: token })
      expect(byToken.statusCode, byToken.body).toBe(200)
    })
  })

  it('틀린 지금 비밀번호는 401 `wrong-password` — 세션은 그대로, 비밀번호는 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const second = await anotherSession(ctx, alice)
      const res = await changePassword(ctx, alice.cookie, { currentPassword: WRONG, newPassword: NEW_PASSWORD })
      expect(res.statusCode, res.body).toBe(401)
      expect(res.json()).toMatchObject({
        error: { code: 'unauthenticated', message: '이메일 또는 비밀번호가 올바르지 않습니다', issues: [{ path: 'currentPassword', code: 'wrong-password' }] },
      })
      expect((await me(ctx, alice.cookie)).statusCode).toBe(200)
      expect((await me(ctx, second)).statusCode).toBe(200)
      expect(await passwordIs(ctx, alice.user.email, alice.password)).toBe(true)
    })
  })

  it('새 비밀번호가 규칙 밖이면 400 과 이유 — 비밀번호는 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const res = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: 'short7!' })
      expect(res.statusCode, res.body).toBe(400)
      expect(res.json()).toMatchObject({ error: { code: 'bad-request', issues: [{ path: 'newPassword' }] } })
      expect(await passwordIs(ctx, alice.user.email, alice.password)).toBe(true)
    })
  })

  it('로그인하지 않았으면 401 이다', async () => {
    await withApi(async (ctx) => {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/password', payload: { currentPassword: 'password1234', newPassword: NEW_PASSWORD } })
      expect(res.statusCode).toBe(401)
    })
  })

  /**
   * **토큰으로는 부를 수 없다** — 프로젝트 밖 라우트라 토큰이 사람을 안 채우고 `requireAuth` 가 401 을 낸다(`auth/plugin.ts` 머리말
   * «토큰은 프로젝트 라우트에서만 사람을 채운다» — `/api/auth/tokens` 와 같은 답).
   */
  it('API 토큰으로 부르면 401 이고 비밀번호는 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const token = await issueToken(ctx, alice, project.id)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: token,
        payload: { currentPassword: alice.password, newPassword: NEW_PASSWORD },
      })
      expect(res.statusCode, res.body).toBe(401)
      expect(await passwordIs(ctx, alice.user.email, alice.password)).toBe(true)
    })
  })
})

/**
 * **지금 비밀번호를 견주는 시도는 로그인 한도에 함께 센다**(spec «비밀번호 바꾸기» — 훔친 세션으로 맞혀 보는 창구가 안 되게).
 * 한 에러 코드(`rate-limited`)가 두 키의 이유를 나르므로 케이스마다 다른 키는 한도 밑이게 판을 세운다(`login-limit.test.ts` 머리말).
 */
describe('비밀번호 바꾸기 — 로그인 한도', () => {
  it('틀린 시도가 계정 한도에 닿으면 옳은 지금 비밀번호도 429 + Retry-After — 비밀번호는 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      for (let i = 0; i < perAccount; i++) {
        const res = await changePassword(ctx, alice.cookie, { currentPassword: WRONG, newPassword: NEW_PASSWORD })
        expect(res.statusCode, `${i + 1}번째 실패`).toBe(401)
      }
      const res = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      expect(res.statusCode, res.body).toBe(429)
      expect(res.json()).toMatchObject({ error: { code: 'rate-limited' } })
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
      // 세션은 그대로다 — 429 는 로그아웃이 아니다.
      expect((await me(ctx, alice.cookie)).statusCode).toBe(200)
    })
  })

  it('비밀번호 바꾸기의 실패가 같은 계정의 로그인 한도에 세인다 — 옳은 로그인이 429', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      for (let i = 0; i < perAccount; i++) {
        expect((await changePassword(ctx, alice.cookie, { currentPassword: WRONG, newPassword: NEW_PASSWORD })).statusCode).toBe(401)
      }
      const res = await login(ctx, alice.user.email, alice.password)
      expect(res.statusCode, res.body).toBe(429)
      expect(res.json()).toMatchObject({ error: { code: 'rate-limited' } })
    })
  })

  it('로그인의 실패도 비밀번호 바꾸기에 세인다 — 옳은 지금 비밀번호가 429', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      for (let i = 0; i < perAccount; i++) {
        expect((await login(ctx, alice.user.email, WRONG)).statusCode).toBe(401)
      }
      const res = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      expect(res.statusCode, res.body).toBe(429)
      expect((await me(ctx, alice.cookie)).statusCode).toBe(200)
    })
  })

  it('주소 키도 같다 — 그 주소가 한도에 닿으면 429, 다른 주소면 204', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      // 없는 계정마다 한 번씩 — 계정 키는 어느 것도 한도 밑이다.
      for (let i = 0; i < perAddress; i++) {
        expect((await login(ctx, `nobody${i}@example.com`, WRONG, '10.0.3.3')).statusCode).toBe(401)
      }
      const blocked = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD }, '10.0.3.3')
      expect(blocked.statusCode, blocked.body).toBe(429)
      const other = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD }, '10.0.4.4')
      expect(other.statusCode, other.body).toBe(204)
    })
  })
})

describe('비밀번호 바꾸기 — 실커밋', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const opened: WsProbe[] = []
  afterEach(() => {
    for (const probe of opened) probe.close()
    opened.length = 0
  })

  /** 지운 세션의 WS 는 곧바로 닫힌다(로그아웃과 같은 길 — `ws/notify.ts` 의 `closeSessionConnections`). 이 세션의 WS 는 그대로다. */
  it('지운 세션의 WS 연결은 1초 안에 4403 으로 닫히고, 이 세션의 연결은 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const second = await anotherSession(ctx, alice)
      const staying = await joinRoom(ctx.port, project.id, alice.cookie.wb_session)
      const leaving = await joinRoom(ctx.port, project.id, second.wb_session)
      opened.push(staying, leaving)

      const res = await changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      expect(res.statusCode, res.body).toBe(204)

      expect(await leaving.waitClosed(1_000)).toMatchObject({ code: WS_CLOSE.revoked })
      expect(staying.closeInfo).toBeNull()
      staying.send(JSON.stringify({ type: 'ping' }))
      await staying.waitFor('pong')
    })
  })

  /** 재확인이 잡는 질의 — 세션 행을 `FOR KEY SHARE` 로 본다(`auth/session.ts` 의 `sessionIsLive`). 요청의 인증은 이 글자를 안 낸다. */
  const RECHECK_SESSION = '"sessions" where "id" = $1 and "expires_at" > statement_timestamp() for key share'

  it('재확인 질의에 선 사이 그 세션이 지워지면 401 — 비밀번호도 다른 세션도 그대로다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery(RECHECK_SESSION)
      const pending = changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      await hold.held
      const logout = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: alice.cookie })
      expect(logout.statusCode, logout.body).toBe(204)
      hold.release()

      const res = await pending
      expect(res.statusCode, res.body).toBe(401)
      expect(res.json()).toMatchObject({ error: { code: 'unauthenticated' } })
      expect(await passwordIs(ctx, alice.user.email, alice.password)).toBe(true)
      expect((await me(ctx, second)).statusCode).toBe(200)
    })
  })

  it('대조 — 로그아웃이 안 끼면 같은 판이 204', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const hold = ctx.proxy.holdQuery(RECHECK_SESSION)
      const pending = changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: NEW_PASSWORD })
      await hold.held
      hold.release()
      expect((await pending).statusCode).toBe(204)
    })
  })

  /**
   * **같은 사람의 두 세션이 함께 바꾸면 하나만 선다 — 교착이 없다.** 앞 요청을 사용자 행 갱신 앞에 세우고 뒤 요청을 끝까지 보낸다.
   * 뒤 요청이 앞 세션을 지우므로 앞 요청은 재확인에서 401 이다. 재확인(세션 행 `KEY SHARE`)을 사용자 행 갱신 앞에 두면 «앞: 자기
   * 세션 → 사용자 행 대기 · 뒤: 사용자 행 → 앞 세션 삭제 대기»로 고리가 선다(`src/routes/auth.ts` 의 `/password` 주석).
   */
  it('같은 사람의 두 세션이 겹쳐 바꾸면 뒤에 끝난 쪽만 204, 앞은 401 — 500(교착) 없음', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const second = await anotherSession(ctx, alice)
      const hold = ctx.proxy.holdQuery('update "users" set "password_hash"')
      const first = changePassword(ctx, alice.cookie, { currentPassword: alice.password, newPassword: 'firstpassword1' })
      await hold.held
      const res = await changePassword(ctx, second, { currentPassword: alice.password, newPassword: 'secondpassword2' }, '10.0.0.8')
      expect(res.statusCode, res.body).toBe(204)
      hold.release()

      const late = await first
      expect(late.statusCode, late.body).toBe(401)
      expect(await passwordIs(ctx, alice.user.email, 'secondpassword2')).toBe(true)
      expect((await me(ctx, alice.cookie)).statusCode).toBe(401)
      expect((await me(ctx, second)).statusCode).toBe(200)
    })
  })
})
