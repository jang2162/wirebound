import { describe, expect, it } from 'vitest'
import { signup, withApi } from './helpers'

/** 이 파일이 쓰는 계정. 이메일에 대문자를 섞어 두는 것은 정규화가 실제로 도는지 함께 보기 위해서다. */
const 계정 = { email: 'Signup@Example.com', name: '가입자', password: 'password1234' } as const

/**
 * **가입 라우트의 부재를 자가 든다**(2026-08-20 D1).
 *
 * 그냥 지우기만 하면 다음 사람이 조용히 되살린다 — 지운 것을 지운 채로 두는 힘은
 * 코드가 아니라 케이스에 있다(P9-2가 `--password` 플래그의 부재를 케이스로 든 것과
 * 같은 자리다). 계정을 만드는 길은 `db/seed-user.ts`의 시딩 하나이고,
 * `test/seed-user.test.ts`가 그쪽을 잰다.
 */
describe('POST /api/auth/signup — 없다', () => {
  it('그 경로가 404다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 계정 })
      expect(res.statusCode).toBe(404)
    })
  })

  it('본문이 멀쩡해도 계정이 안 생긴다 — 404가 "검증 실패"가 아니다', async () => {
    await withApi(async ({ app, db }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 계정 })
      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(0)
    })
  })

  it('GET·PUT 으로도 열리지 않는다', async () => {
    await withApi(async ({ app }) => {
      const get = await app.inject({ method: 'GET', url: '/api/auth/signup' })
      const put = await app.inject({ method: 'PUT', url: '/api/auth/signup', payload: 계정 })
      expect([get.statusCode, put.statusCode]).toEqual([404, 404])
    })
  })
})

describe('POST /api/auth/login', () => {
  it('맞는 자격이면 200과 새 쿠키다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, 계정)
      const res = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().email).toBe('signup@example.com')
      expect(res.cookies.find((c) => c.name === 'wb_session')?.value).toBeTruthy()
      expect(Object.keys(res.json()).sort()).toEqual(['email', 'id', 'name'])
    })
  })

  it('대소문자가 달라도 로그인된다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, 계정)
      const res = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'SIGNUP@example.COM', password: 'password1234' },
      })
      expect(res.statusCode).toBe(200)
    })
  })

  /**
   * **가입 라우트가 들고 있던 케이스가 여기로 옮겨 왔다**(2026-08-20). 쿠키를 내는 자리가
   * 로그인 하나가 됐으므로 쿠키의 성질을 재는 자리도 여기다.
   */
  it('쿠키가 HttpOnly이고 SameSite=Lax다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, 계정)
      const res = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      const cookie = res.cookies.find((c) => c.name === 'wb_session')
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.sameSite?.toLowerCase()).toBe('lax')
    })
  })

  it('비밀번호 해시를 응답에 싣지 않는다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, 계정)
      const res = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      expect(Object.keys(res.json()).sort()).toEqual(['email', 'id', 'name'])
      expect(res.body).not.toContain('password')
      expect(res.body).not.toContain('scrypt')
    })
  })

  it.each([
    ['틀린 비밀번호', { email: 'signup@example.com', password: '틀린비밀번호1234' }],
    ['없는 이메일', { email: 'nosuchuser@example.com', password: 'password1234' }],
  ])('%s은 401이고 메시지가 같다', async (_label, payload) => {
    await withApi(async (ctx) => {
      await signup(ctx, 계정)
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.message).toBe('이메일 또는 비밀번호가 올바르지 않습니다')
    })
  })

  it.each([
    ['이메일 형식', { email: '골뱅이없음', password: 'password1234' }],
    ['이메일 없음', { password: 'password1234' }],
    ['짧은 비밀번호', { email: 'signup@example.com', password: '1234567' }],
    ['본문이 배열', []],
  ])('%s은 400이다', async (_label, payload) => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('bad-request')
      expect(Array.isArray(res.json().error.issues)).toBe(true)
    })
  })

  it('선언되지 않은 키를 무시하지 않고 400을 낸다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234', role: 'owner' },
      })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('GET /api/auth/me', () => {
  it('쿠키가 없으면 401이다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
      expect(res.statusCode).toBe(401)
    })
  })

  it('로그인 쿠키로 내 정보를 준다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx, 계정)
      const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: cookie })
      expect(res.statusCode).toBe(200)
      expect(res.json().email).toBe('signup@example.com')
      expect(Object.keys(res.json()).sort()).toEqual(['email', 'id', 'name'])
    })
  })
})

describe('POST /api/auth/logout', () => {
  it('204를 내고 세션을 무효화한다', async () => {
    await withApi(async (ctx) => {
      const { cookie } = await signup(ctx, 계정)

      const logout = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: cookie })
      expect(logout.statusCode).toBe(204)

      expect(await ctx.db.selectFrom('sessions').selectAll().execute()).toHaveLength(0)

      const after = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: cookie })
      expect(after.statusCode).toBe(401)
    })
  })

  it('로그아웃은 그 세션만 지운다', async () => {
    await withApi(async (ctx) => {
      // 픽스처가 세션 하나를 만들고(로그인), 아래 로그인 둘이 둘을 더한다 = 셋.
      await signup(ctx, 계정)
      const first = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      const second = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      const tokenA = first.cookies.find((c) => c.name === 'wb_session')!.value
      const tokenB = second.cookies.find((c) => c.name === 'wb_session')!.value

      // 로그아웃 직전에는 tokenA가 아직 살아 있어야 한다 — 그래야 뒤이은 401이
      // "애초에 죽어 있던 토큰"이 아니라 로그아웃이 실제로 무효화한 결과임을 증명한다.
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: tokenA } })).statusCode).toBe(200)

      await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { wb_session: tokenA } })

      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: tokenA } })).statusCode).toBe(401)
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: tokenB } })).statusCode).toBe(200)
      // 픽스처 1 + login 2 = 세션 3개, 로그아웃으로 tokenA(1개)만 지워 2개가 남는다.
      expect(await ctx.db.selectFrom('sessions').selectAll().execute()).toHaveLength(2)
    })
  })

  it('쿠키 없이 로그아웃하면 401이다', async () => {
    await withApi(async ({ app }) => {
      expect((await app.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(401)
    })
  })
})

/**
 * **이 변경은 만드는 길만 없앤다**(2026-08-20 D7). 이미 DB에 있는 계정은 그대로
 * 로그인되고, 로그인 뒤에 할 수 있던 것도 그대로다.
 */
describe('이미 있는 계정은 그대로 쓴다 (D7)', () => {
  it('로그인 → me → logout 이 그대로 이어진다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx, 계정)

      const login = await ctx.app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      expect(login.statusCode).toBe(200)
      expect(login.json().id).toBe(user.id)

      const cookie = { wb_session: login.cookies.find((c) => c.name === 'wb_session')!.value }
      expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: cookie })).statusCode).toBe(200)
      expect((await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: cookie })).statusCode).toBe(204)
    })
  })
})
