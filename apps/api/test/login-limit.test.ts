/**
 * **로그인 시도 제한**(`src/auth/login-limit.ts` · `src/routes/auth.ts`). 한도 · 창은 `LOGIN_LIMIT` 에서 읽는다 — 수를 손으로 적지
 * 않는다.
 *
 * 한 에러 코드(`rate-limited`)가 두 키(계정 · 주소)의 이유를 나르므로 케이스마다 **다른 키는 한도 밑**이게 판을 세운다 — 계정을 재는
 * 판은 주소 시도가 주소 한도보다 적고, 주소를 재는 판은 계정마다 한 번씩만 틀린다.
 *
 * 주소는 `inject` 의 `remoteAddress` 로 가른다(믿는 앞단이 없으면 `request.ip` 가 그것이다).
 *
 * 비밀번호 검증 · 사용자 조회의 호출 수는 `vi.spyOn` 으로 센다 — `vi.mock` 은 `setupFiles` 가 먼저 적재한 그래프에 안 닿는다
 * (`auth-timing.test.ts` 머리말).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as passwordModule from '../src/auth/password'
import { addressKey, createLoginLimiter, LOGIN_LIMIT } from '../src/auth/login-limit'
import { loadConfig } from '../src/config'
import * as usersModule from '../src/repos/users'
import { signup, testConfig, TEST_DATABASE_URL, withApi, type TestContext } from './helpers'

const { perAccount, perAddress, windowMs } = LOGIN_LIMIT
const WRONG = '틀린비밀번호1234'

let verifySpy: MockInstance<typeof passwordModule.verifyPassword>
let findSpy: MockInstance<typeof usersModule.findUserByEmail>

beforeEach(() => {
  verifySpy = vi.spyOn(passwordModule, 'verifyPassword')
  findSpy = vi.spyOn(usersModule, 'findUserByEmail')
})

afterEach(() => {
  verifySpy.mockRestore()
  findSpy.mockRestore()
  vi.useRealTimers()
})

function login(ctx: TestContext, email: string, password: string, remoteAddress = '10.0.0.1') {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress })
}

async function failTimes(
  ctx: TestContext,
  times: number,
  email: (i: number) => string,
  remoteAddress: string | ((i: number) => string) = '10.0.0.1',
) {
  for (let i = 0; i < times; i++) {
    const res = await login(ctx, email(i), WRONG, typeof remoteAddress === 'string' ? remoteAddress : remoteAddress(i))
    expect(res.statusCode, `${i + 1}번째 실패`).toBe(401)
  }
}

describe('로그인 시도 제한', () => {
  // 막힌 판이 DB · scrypt 를 안 거치는 것은 «없는 계정과 있는 계정이 같은 판정» 케이스가 잰다.
  it('한 계정이 한도만큼 틀리면 그 계정은 429 + Retry-After 다 — 옳은 비밀번호도 429 다', async () => {
    await withApi(async (ctx) => {
      const { user, password } = await signup(ctx)
      await failTimes(ctx, perAccount, () => user.email)

      const wrong = await login(ctx, user.email, WRONG)
      const right = await login(ctx, user.email, password)

      for (const res of [wrong, right]) {
        expect(res.statusCode).toBe(429)
        expect(res.json()).toEqual({
          error: { code: 'rate-limited', message: '로그인 시도가 너무 많습니다 — 15분 뒤 다시 시도하세요' },
        })
        expect(Number(res.headers['retry-after'])).toBe(windowMs / 1000)
      }
    })
  })

  it('한 주소가 계정을 바꿔 가며 한도만큼 틀리면 그 주소의 새 계정도 429 다', async () => {
    await withApi(async (ctx) => {
      // 계정마다 한 번씩만 틀린다 — 계정 키는 한도 밑이다.
      await failTimes(ctx, perAddress, (i) => `spray${i}@example.com`)

      const res = await login(ctx, 'spray-next@example.com', WRONG)
      expect(res.statusCode).toBe(429)
      expect(res.json().error.code).toBe('rate-limited')
    })
  })

  it('없는 계정과 있는 계정이 같은 판정을 받는다 — 막히기 전 401 · 막힌 뒤 429 가 코드 · 문장 · 머리 · 조회 수까지 같다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      const ghost = 'nobody-here@example.com'

      // 주소를 갈라 주소 키가 한도에 안 닿게 한다.
      const before: { status: number; body: string }[] = []
      for (const [email, address] of [
        [user.email, '10.0.1.1'],
        [ghost, '10.0.2.1'],
      ] as const) {
        for (let i = 0; i < perAccount; i++) {
          const res = await login(ctx, email, WRONG, address)
          if (i === 0) before.push({ status: res.statusCode, body: res.body })
        }
      }
      expect(before[0]).toEqual(before[1])
      expect(before[0]?.status).toBe(401)

      const after = []
      for (const [email, address] of [
        [user.email, '10.0.1.2'],
        [ghost, '10.0.2.2'],
      ] as const) {
        verifySpy.mockClear()
        findSpy.mockClear()
        const res = await login(ctx, email, WRONG, address)
        after.push({
          status: res.statusCode,
          body: res.body,
          retryAfter: res.headers['retry-after'],
          verify: verifySpy.mock.calls.length,
          find: findSpy.mock.calls.length,
        })
      }
      expect(after[0]).toEqual(after[1])
      expect(after[0]).toMatchObject({ status: 429, verify: 0, find: 0 })
    })
  })

  it('막힌 계정 · 막힌 주소 밖은 그대로다 — 다른 계정은 같은 주소에서, 다른 주소는 새 계정으로 들어온다', async () => {
    await withApi(async (ctx) => {
      const locked = await signup(ctx)
      const other = await signup(ctx)
      await failTimes(ctx, perAccount, () => locked.user.email, '10.0.3.1')

      // 같은 주소의 다른 계정 — 주소 키는 한도 밑이다.
      expect((await login(ctx, other.user.email, other.password, '10.0.3.1')).statusCode).toBe(200)
      // 막힌 계정은 다른 주소에서도 막힌다(계정 키).
      expect((await login(ctx, locked.user.email, locked.password, '10.0.3.9')).statusCode).toBe(429)

      // 이제 주소 하나를 막는다 — 계정마다 한 번씩.
      await failTimes(ctx, perAddress, (i) => `spray${i}@example.com`, '10.0.4.1')
      expect((await login(ctx, other.user.email, other.password, '10.0.4.1')).statusCode).toBe(429)
      // 다른 주소의 같은 계정은 들어온다.
      expect((await login(ctx, other.user.email, other.password, '10.0.4.2')).statusCode).toBe(200)
    })
  })

  it('창이 지나면 풀린다 — 가장 오래된 실패가 창을 벗어나기 1s 전까지는 429 다', async () => {
    await withApi(async (ctx) => {
      const { user, password } = await signup(ctx)
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-25T00:00:00Z'))
      await failTimes(ctx, perAccount, () => user.email)

      vi.setSystemTime(new Date(Date.parse('2026-09-25T00:00:00Z') + windowMs - 1000))
      const still = await login(ctx, user.email, password)
      expect(still.statusCode).toBe(429)
      expect(still.headers['retry-after']).toBe('1')

      vi.setSystemTime(new Date(Date.parse('2026-09-25T00:00:00Z') + windowMs))
      expect((await login(ctx, user.email, password)).statusCode).toBe(200)
    })
  })

  it('동시에 몰린 틀린 로그인도 한도 수만큼만 비밀번호를 견준다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      verifySpy.mockClear()

      const burst = await Promise.all(Array.from({ length: perAccount + 6 }, () => login(ctx, user.email, WRONG)))
      const statuses = burst.map((res) => res.statusCode)

      expect(statuses.filter((s) => s === 401)).toHaveLength(perAccount)
      expect(statuses.filter((s) => s === 429)).toHaveLength(6)
      expect(verifySpy).toHaveBeenCalledTimes(perAccount)
    })
  })

  it('성공은 그 계정의 실패를 지우고, 주소에서는 제 자리만 걷는다 — 주소의 앞선 실패는 남는다', async () => {
    await withApi(async (ctx) => {
      const { user, password } = await signup(ctx)

      // 계정: 한도 − 1 번 틀리고 성공하면 다시 한도만큼 틀릴 수 있다.
      await failTimes(ctx, perAccount - 1, () => user.email, '10.0.5.1')
      expect((await login(ctx, user.email, password, '10.0.5.1')).statusCode).toBe(200)
      await failTimes(ctx, perAccount, () => user.email, '10.0.5.2')
      expect((await login(ctx, user.email, WRONG, '10.0.5.2')).statusCode).toBe(429)

      // 주소: 한도 − 1 번 틀린 주소에서 성공해도 실패는 남아, 한 번 더 틀리면 막힌다.
      const mine = await signup(ctx)
      await failTimes(ctx, perAddress - 1, (i) => `victim${i}@example.com`, '10.0.6.1')
      expect((await login(ctx, mine.user.email, mine.password, '10.0.6.1')).statusCode).toBe(200)
      expect((await login(ctx, 'victim-last@example.com', WRONG, '10.0.6.1')).statusCode).toBe(401)
      expect((await login(ctx, 'victim-more@example.com', WRONG, '10.0.6.1')).statusCode).toBe(429)
    })
  })

  it('비밀번호를 견주기 전에 끝난 요청(사용자 조회 실패)은 세지 않는다', async () => {
    await withApi(async (ctx) => {
      const { user, password } = await signup(ctx)
      findSpy.mockRejectedValue(new Error('조회 실패'))
      for (let i = 0; i < perAccount + 1; i++) {
        expect((await login(ctx, user.email, WRONG)).statusCode).toBe(500)
      }
      findSpy.mockRestore()
      expect((await login(ctx, user.email, password)).statusCode).toBe(200)
    })
  })

  it('본문이 틀린 요청(400)은 세지 않는다', async () => {
    await withApi(async (ctx) => {
      const { user, password } = await signup(ctx)
      for (let i = 0; i < perAccount + 1; i++) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: user.email, password: 'short' },
          remoteAddress: '10.0.0.1',
        })
        expect(res.statusCode).toBe(400)
      }
      expect((await login(ctx, user.email, password)).statusCode).toBe(200)
    })
  })
})

describe('주소 키', () => {
  it('IPv4 에 매핑된 IPv6 은 IPv4 로, IPv6 은 /64 로 묶는다', () => {
    expect(addressKey('::ffff:10.1.2.3')).toBe('10.1.2.3')
    expect(addressKey('10.1.2.3')).toBe('10.1.2.3')
    expect(addressKey('2001:db8:1:2:3:4:5:6')).toBe(addressKey('2001:0db8:0001:0002::9'))
    expect(addressKey('2001:db8:1:2::9')).toBe('2001:db8:1:2::/64')
    expect(addressKey('2001:db8:1:3::9')).not.toBe(addressKey('2001:db8:1:2::9'))
    expect(addressKey('::1')).toBe('0:0:0:0::/64')
    expect(addressKey('fe80::1%lo0')).toBe('fe80:0:0:0::/64')
    expect(addressKey('::0102:0304')).toBe(addressKey('::1.2.3.4'))
  })

  it('/64 로 묶인 주소들은 한 키로 센다', async () => {
    await withApi(async (ctx) => {
      await failTimes(ctx, perAddress, (i) => `v6-${i}@example.com`, (i) => `2001:db8:1:2::${(i + 1).toString(16)}`)
      const res = await login(ctx, 'v6-next@example.com', WRONG, '2001:db8:1:2:ffff:ffff:ffff:ffff')
      expect(res.statusCode).toBe(429)
      expect((await login(ctx, 'v6-next@example.com', WRONG, '2001:db8:1:3::1')).statusCode).toBe(401)
    })
  })
})

describe('키 수의 상한', () => {
  it('상한에 닿으면 가장 오래 기록한 키를 버린다', () => {
    const limiter = createLoginLimiter({ windowMs: 1000, perAccount: 1, perAddress: 100, maxKeys: 2 }, () => 0)

    limiter.begin('a@x', 'ip')
    limiter.begin('b@x', 'ip')
    expect(limiter.begin('a@x', 'ip').kind).toBe('limited')
    // 셋째 키가 들어오면 가장 오래 기록한 a 가 밀린다 — b · c 는 남는다.
    limiter.begin('c@x', 'ip')
    expect(limiter.begin('b@x', 'ip').kind).toBe('limited')
    expect(limiter.begin('c@x', 'ip').kind).toBe('limited')
    expect(limiter.begin('a@x', 'ip').kind).toBe('admitted')
  })
})

describe('믿는 앞단(TRUST_PROXY)', () => {
  const base = { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, PASSWORD_SCRYPT_N: '1024' }

  it('비면 아무도 안 믿는다 · 주소와 CIDR 을 받는다 · true 와 홉 수는 기동 거절이다', () => {
    expect(loadConfig(base).trustProxy).toEqual([])
    expect(loadConfig({ ...base, TRUST_PROXY: '' }).trustProxy).toEqual([])
    expect(loadConfig({ ...base, TRUST_PROXY: ' 10.0.0.2, 172.16.0.0/12,::1 ' }).trustProxy).toEqual([
      '10.0.0.2',
      '172.16.0.0/12',
      '::1',
    ])
    for (const bad of ['true', '1', '10.0.0.0/33', 'proxy.example.com', '10.0.0.1/8/1']) {
      expect(() => loadConfig({ ...base, TRUST_PROXY: bad }), bad).toThrow(/TRUST_PROXY/)
    }
  })

  it('안 믿으면 X-Forwarded-For 를 무시하고, 믿는 앞단에서 온 요청은 그 머리의 주소로 센다', async () => {
    const spray = async (ctx: TestContext) => {
      for (let i = 0; i < perAddress; i++) {
        await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: `xff${i}@example.com`, password: WRONG },
          remoteAddress: '10.9.9.9',
          headers: { 'x-forwarded-for': `203.0.113.${i + 1}` },
        })
      }
      return ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'xff-next@example.com', password: WRONG },
        remoteAddress: '10.9.9.9',
        headers: { 'x-forwarded-for': '203.0.113.250' },
      })
    }

    await withApi(async (ctx) => {
      expect((await spray(ctx)).statusCode).toBe(429)
    })
    await withApi(
      async (ctx) => {
        expect((await spray(ctx)).statusCode).toBe(401)
      },
      { config: { ...testConfig(), trustProxy: ['10.9.9.9'] } },
    )
  })
})
