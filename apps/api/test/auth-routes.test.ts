import { describe, expect, it } from 'vitest'
import { withApi } from './helpers'

const 가입본문 = { email: 'Signup@Example.com', name: '가입자', password: 'password1234' }

describe('POST /api/auth/signup', () => {
  it('201과 쿠키를 준다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ email: 'signup@example.com', name: '가입자' })
      expect(res.json().id).toMatch(/^[0-9a-f-]{36}$/)
      expect(res.cookies.find((c) => c.name === 'wb_session')?.value).toBeTruthy()
    })
  })

  it('비밀번호 해시를 응답에 싣지 않는다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      expect(Object.keys(res.json()).sort()).toEqual(['email', 'id', 'name'])
      expect(res.body).not.toContain('password')
    })
  })

  it('쿠키가 HttpOnly이고 SameSite=Lax다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const cookie = res.cookies.find((c) => c.name === 'wb_session')
      expect(cookie?.httpOnly).toBe(true)
      expect(cookie?.sameSite?.toLowerCase()).toBe('lax')
    })
  })

  it('이메일을 소문자로 저장한다', async () => {
    await withApi(async ({ app, db }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const rows = await db.selectFrom('users').select('email').execute()
      expect(rows[0]?.email).toBe('signup@example.com')
    })
  })

  it('중복 이메일은 409다 (대소문자 무시)', async () => {
    await withApi(async ({ app }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const res = await app.inject({
        method: 'POST', url: '/api/auth/signup',
        payload: { ...가입본문, email: 'SIGNUP@EXAMPLE.COM' },
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('conflict')
      expect(res.json().error.message).toMatch(/[가-힣]/)
    })
  })

  it.each([
    ['이메일 형식', { ...가입본문, email: '골뱅이없음' }],
    ['이메일 없음', { name: '가입자', password: 'password1234' }],
    ['짧은 비밀번호', { ...가입본문, password: '1234567' }],
    ['빈 이름', { ...가입본문, name: '' }],
    ['긴 이름', { ...가입본문, name: '가'.repeat(81) }],
    ['본문이 배열', []],
  ])('%s은 400이다', async (_label, payload) => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('bad-request')
      expect(Array.isArray(res.json().error.issues)).toBe(true)
    })
  })

  it('선언되지 않은 키를 무시하지 않고 400을 낸다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/signup',
        payload: { ...가입본문, role: 'owner' },
      })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('POST /api/auth/login', () => {
  it('맞는 자격이면 200과 새 쿠키다', async () => {
    await withApi(async ({ app }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().email).toBe('signup@example.com')
      expect(res.cookies.find((c) => c.name === 'wb_session')?.value).toBeTruthy()
    })
  })

  it('대소문자가 달라도 로그인된다', async () => {
    await withApi(async ({ app }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'SIGNUP@example.COM', password: 'password1234' },
      })
      expect(res.statusCode).toBe(200)
    })
  })

  it.each([
    ['틀린 비밀번호', { email: 'signup@example.com', password: '틀린비밀번호1234' }],
    ['없는 이메일', { email: '없는사람@example.com', password: 'password1234' }],
  ])('%s은 401이고 메시지가 같다', async (_label, payload) => {
    await withApi(async ({ app }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.message).toBe('이메일 또는 비밀번호가 올바르지 않습니다')
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
    await withApi(async ({ app }) => {
      const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const token = signup.cookies.find((c) => c.name === 'wb_session')!.value
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: token } })
      expect(res.statusCode).toBe(200)
      expect(res.json().email).toBe('signup@example.com')
    })
  })
})

describe('POST /api/auth/logout', () => {
  it('204를 내고 세션을 무효화한다', async () => {
    await withApi(async ({ app, db }) => {
      const signup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const token = signup.cookies.find((c) => c.name === 'wb_session')!.value

      const logout = await app.inject({
        method: 'POST', url: '/api/auth/logout', cookies: { wb_session: token },
      })
      expect(logout.statusCode).toBe(204)

      expect(await db.selectFrom('sessions').selectAll().execute()).toHaveLength(0)

      const after = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: token } })
      expect(after.statusCode).toBe(401)
    })
  })

  it('로그아웃은 그 세션만 지운다', async () => {
    await withApi(async ({ app, db }) => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: 가입본문 })
      const first = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      const second = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { email: 'signup@example.com', password: 'password1234' },
      })
      const tokenA = first.cookies.find((c) => c.name === 'wb_session')!.value
      const tokenB = second.cookies.find((c) => c.name === 'wb_session')!.value

      await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { wb_session: tokenA } })

      expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: tokenA } })).statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: tokenB } })).statusCode).toBe(200)
      expect(await db.selectFrom('sessions').selectAll().execute()).toHaveLength(1)
    })
  })

  it('쿠키 없이 로그아웃하면 401이다', async () => {
    await withApi(async ({ app }) => {
      expect((await app.inject({ method: 'POST', url: '/api/auth/logout' })).statusCode).toBe(401)
    })
  })
})
