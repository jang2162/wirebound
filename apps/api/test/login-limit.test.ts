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
import Fastify from 'fastify'
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

  // 계정의 앞선 실패가 성공 뒤에도 남는 것은 아래 «성공은 남의 다음 답을 안 바꾼다»가 잰다.
  it('성공은 두 키에서 제 자리만 걷는다 — 성공만 거듭하면 안 막히고, 주소의 앞선 실패는 남는다', async () => {
    await withApi(async (ctx) => {
      // 성공만 거듭하면 한도에 안 닿는다 — 성공은 제 자리를 걷는다.
      const often = await signup(ctx)
      for (let i = 0; i < perAccount + 1; i++) {
        expect((await login(ctx, often.user.email, often.password, '10.0.5.2')).statusCode, `${i + 1}번째 성공`).toBe(200)
      }

      // 주소: 한도 − 1 번 틀린 주소에서 성공해도 실패는 남아, 한 번 더 틀리면 막힌다.
      const mine = await signup(ctx)
      await failTimes(ctx, perAddress - 1, (i) => `victim${i}@example.com`, '10.0.6.1')
      expect((await login(ctx, mine.user.email, mine.password, '10.0.6.1')).statusCode).toBe(200)
      expect((await login(ctx, 'victim-last@example.com', WRONG, '10.0.6.1')).statusCode).toBe(401)
      expect((await login(ctx, 'victim-more@example.com', WRONG, '10.0.6.1')).statusCode).toBe(429)
    })
  })

  // 성공이 계정 기록을 지우면, 한도 − 1 까지 채워 둔 쪽이 뒤 두 번의 답으로 «그 사이 주인이 로그인했다 = 있는 계정»을 읽는다
  // (`src/auth/login-limit.ts` 머리말 «없는 계정도 같은 판정이다»).
  it('성공은 남의 다음 답을 안 바꾼다 — 한도 − 1 까지 채운 뒤 두 번의 답이 주인이 로그인한 계정 · 안 온 계정 · 없는 계정에서 같다', async () => {
    await withApi(async (ctx) => {
      const elsewhere = await signup(ctx)
      const sameAddress = await signup(ctx)
      const idle = await signup(ctx)

      // 두드리는 쪽은 판마다 한 주소에서 11 번 — 주소 키는 한도 밑이다.
      const probe = async (email: string, address: string, between: () => Promise<void>) => {
        await failTimes(ctx, perAccount - 1, () => email, address)
        await between()
        return [(await login(ctx, email, WRONG, address)).statusCode, (await login(ctx, email, WRONG, address)).statusCode]
      }
      const ownerLogsIn = (owner: { user: { email: string }; password: string }, address: string) => async () => {
        expect((await login(ctx, owner.user.email, owner.password, address)).statusCode).toBe(200)
      }

      const answers = {
        // 주인이 다른 주소에서 로그인했다.
        elsewhere: await probe(elsewhere.user.email, '10.0.7.1', ownerLogsIn(elsewhere, '192.0.2.77')),
        // 주인이 두드리는 쪽과 같은 주소(같은 NAT · 앞단 뒤 `TRUST_PROXY` 없음)에서 로그인했다.
        sameAddress: await probe(sameAddress.user.email, '10.0.7.2', ownerLogsIn(sameAddress, '10.0.7.2')),
        idle: await probe(idle.user.email, '10.0.7.3', async () => {}),
        ghost: await probe('nobody-probe@example.com', '10.0.7.4', async () => {}),
      }
      expect(answers).toEqual({ elsewhere: [401, 429], sameAddress: [401, 429], idle: [401, 429], ghost: [401, 429] })
    })
  })

  it('주인의 성공과 함께 몰린 틀린 요청도 — 창 안에서 틀린 비밀번호를 견주는 수는 한도 그대로다', async () => {
    await withApi(async (ctx) => {
      const { user, password } = await signup(ctx)
      // 시도마다 주소를 바꿔 주소 키는 한도 밑이다.
      let n = 0
      const address = () => `10.0.8.${++n}`

      await failTimes(ctx, 5, () => user.email, address)
      const burst = await Promise.all([
        login(ctx, user.email, password, '192.0.2.78'),
        ...Array.from({ length: 30 }, () => login(ctx, user.email, WRONG, address())),
      ])
      const after = []
      for (let i = 0; i < perAccount; i++) after.push((await login(ctx, user.email, WRONG, address())).statusCode)

      const wrongCompared = 5 + [...burst.slice(1).map((res) => res.statusCode), ...after].filter((s) => s === 401).length
      expect(wrongCompared).toBe(perAccount)
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
  // 소켓 주소는 정규 꼴로 오지만, 믿는 앞단의 `X-Forwarded-For` 는 앞단이 적은 글자 그대로 `request.ip` 가 된다 — 꼴이 갈려도 한
  // 클라이언트는 한 키, 다른 클라이언트는 다른 키여야 한다.
  it('한 클라이언트의 여러 꼴이 한 키다 — IPv4 매핑 IPv6 은 IPv4 로, IPv6 은 /64 로, 포트는 떼고 · IP 가 아니면 키가 없다', () => {
    const groups: [key: string | undefined, forms: string[]][] = [
      [
        '2001:db8:1:2::/64',
        [
          '2001:db8:1:2::5',
          '2001:0db8:0001:0002:0000:0000:0000:0005',
          '2001:DB8:1:2::5',
          '2001:db8:1:2:0:0:0:5',
          '2001:db8:1:2::5%eth0',
          '2001:db8:1:2::0.0.0.5',
          '2001:db8:1:2:ffff:ffff:ffff:ffff',
          '[2001:db8:1:2::5]',
          '[2001:db8:1:2::5]:443',
        ],
      ],
      [
        '1.2.3.4',
        [
          '1.2.3.4',
          '1.2.3.4:5678',
          '::ffff:1.2.3.4',
          '::FFFF:1.2.3.4',
          '0:0:0:0:0:ffff:1.2.3.4',
          '0000:0000:0000:0000:0000:ffff:1.2.3.4',
          '::ffff:0102:0304',
          '::ffff:102:304',
          '::ffff:1.2.3.4%eth0',
          '[::ffff:1.2.3.4]:80',
          // IPv4 변환(RFC 6145) · IPv4 호환(폐기된 꼴) · NAT64 잘 알려진 접두(RFC 6052) — `::1` 과 한 /64 로 뭉치지 않는다.
          '::ffff:0:1.2.3.4',
          '0:0:0:0:ffff:0:1.2.3.4',
          '::ffff:0:102:304',
          '::1.2.3.4',
          '0:0:0:0:0:0:1.2.3.4',
          '::102:304',
          '64:ff9b::1.2.3.4',
          '64:FF9B::102:304',
        ],
      ],
      ['5.6.7.8', ['5.6.7.8', '::ffff:5.6.7.8', '0:0:0:0:0:ffff:5.6.7.8', '::ffff:506:708', '::ffff:0:5.6.7.8', '::5.6.7.8', '64:ff9b::5.6.7.8']],
      // 첫 바이트가 0 인 IPv4 호환 꼴은 IPv4 클라이언트가 아니다(`0.0.0.0/8`) — IPv6 으로 남는다.
      ['0:0:0:0::/64', ['::1', '::', '[::1]', '::0.0.0.1', '::0.1.2.3']],
      // 운영자가 고른 NAT64 접두는 모른다 — 그 뒤의 IPv4 클라이언트는 /64 하나로 뭉친다(`src/ip-address.ts` 의 `embeddedIPv4`).
      ['64:ff9b:1:0::/64', ['64:ff9b:1::1.2.3.4', '64:ff9b:1::5.6.7.8']],
      ['2001:db8:1:3::/64', ['2001:db8:1:3::9']],
      ['fe80:0:0:0::/64', ['fe80::1%lo0', 'fe80::2%en1', 'fe80::1']],
      [undefined, ['unknown', '', ' 1.2.3.4', '01.2.3.4', '::ffff:01.2.3.4', '1.2.3.4:', '[1.2.3.4]:80x', 'proxy.example.com']],
    ]
    const table = Object.fromEntries(groups.flatMap(([, forms]) => forms.map((form) => [form, addressKey(form)])))
    const expected = Object.fromEntries(groups.flatMap(([key, forms]) => forms.map((form) => [form, key])))
    expect(table).toEqual(expected)
  })

  it('/64 로 묶인 주소들은 한 키로 센다', async () => {
    await withApi(async (ctx) => {
      await failTimes(ctx, perAddress, (i) => `v6-${i}@example.com`, (i) => `2001:db8:1:2::${(i + 1).toString(16)}`)
      const res = await login(ctx, 'v6-next@example.com', WRONG, '2001:db8:1:2:ffff:ffff:ffff:ffff')
      expect(res.statusCode).toBe(429)
      expect((await login(ctx, 'v6-next@example.com', WRONG, '2001:db8:1:3::1')).statusCode).toBe(401)
    })
  })

  // 푸는 규칙은 위 «한 클라이언트의 여러 꼴이 한 키다»가 소유한다 — 이 케이스는 Fastify 가 그 꼴의 머리를 `request.ip` 로 그대로 내는지를
  // 실물로 잰다(Fastify 의 판독기는 글자 `::a.b.c.d` 를 매핑 꼴로 읽는다).
  it('믿는 앞단이 IPv4 를 담은 IPv6 꼴을 적으면 그 IPv4 로 센다 — 꼴이 갈려도 한 키 · `::1` 과는 따로', async () => {
    const forms = ['::ffff:0:198.51.100.7', '::198.51.100.7', '64:ff9b::198.51.100.7', '::ffff:198.51.100.7']
    await withApi(
      async (ctx) => {
        const viaProxy = (email: string, xff: string) =>
          ctx.app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email, password: WRONG },
            remoteAddress: '10.9.9.9',
            headers: { 'x-forwarded-for': xff },
          })
        for (let i = 0; i < perAddress; i++) {
          const res = await viaProxy(`embedded${i}@example.com`, forms[i % forms.length] as string)
          expect(res.statusCode, `${i + 1}번째 실패`).toBe(401)
        }
        expect((await viaProxy('embedded-next@example.com', '198.51.100.7')).statusCode).toBe(429)
        expect((await viaProxy('embedded-next@example.com', '::1')).statusCode).toBe(401)
      },
      { config: { ...testConfig(), trustProxy: ['10.9.9.9'] } },
    )
  })

  it('믿는 앞단이 IP 가 아닌 글자를 적으면 소켓 주소로 센다 — 글자마다 새 키가 되지 않는다', async () => {
    await withApi(
      async (ctx) => {
        for (let i = 0; i < perAddress; i++) {
          const res = await ctx.app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: `garbled${i}@example.com`, password: WRONG },
            remoteAddress: '10.9.9.9',
            headers: { 'x-forwarded-for': `unknown-${i}` },
          })
          expect(res.statusCode, `${i + 1}번째 실패`).toBe(401)
        }
        const garbled = await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'garbled-next@example.com', password: WRONG },
          remoteAddress: '10.9.9.9',
          headers: { 'x-forwarded-for': 'unknown' },
        })
        expect(garbled.statusCode).toBe(429)
        // 앞단이 IP 를 적은 요청은 제 주소로 센다.
        const clean = await ctx.app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'garbled-next@example.com', password: WRONG },
          remoteAddress: '10.9.9.9',
          headers: { 'x-forwarded-for': '203.0.113.9' },
        })
        expect(clean.statusCode).toBe(401)
      },
      { config: { ...testConfig(), trustProxy: ['10.9.9.9'] } },
    )
  })
})

describe('키 수의 상한', () => {
  /** 시각이 부를 때마다 1ms 씩 가는 제한기 — 마지막 기록의 차례가 서게. */
  function tickingLimiter(rule: { perAccount: number; maxKeys: number }) {
    let t = 0
    return createLoginLimiter({ windowMs: 1_000_000, perAddress: 1_000_000, ...rule }, () => t++)
  }

  // 새 키로 상한을 채워 앞선 기록을 씻지 못한다 — 막힌 키만 건너뛰면 한도 − 1 까지 찬 키가 밀려 한도만큼 더 대 본다.
  it('상한에서 버리는 것은 기록이 가장 적은 키다 — 새 키로 채워도 막힌 키 · 한도 − 1 까지 찬 키가 안 밀린다', () => {
    const maxKeys = 50
    const limiter = tickingLimiter({ perAccount: 3, maxKeys })

    for (let i = 0; i < 3; i++) limiter.begin('blocked@x', 'ip')
    for (let i = 0; i < 2; i++) limiter.begin('nearly@x', 'ip')
    for (let i = 0; i < maxKeys * 2; i++) limiter.begin(`fill${i}@x`, 'ip')

    expect(limiter.begin('blocked@x', 'ip').kind).toBe('limited')
    expect([limiter.begin('nearly@x', 'ip').kind, limiter.begin('nearly@x', 'ip').kind]).toEqual(['admitted', 'limited'])
  })

  // 넣은 차례로 버리면 주인의 성공이 그 키를 맨 뒤로 옮겨 — 기록은 안 남겨도 — 밀리는 키가 갈린다. 남이 한 번 틀려 둔 이메일이
  // 채우기 뒤에 남아 있으면 «그 사이 주인이 로그인했다 = 있는 계정»이다.
  it('주인의 성공은 버리는 차례를 안 바꾼다 — 채우기 뒤의 답이 주인이 로그인한 계정 · 안 온 계정에서 같다', () => {
    const answers = (ownerLogsIn: boolean) => {
      const maxKeys = 20
      const limiter = tickingLimiter({ perAccount: 2, maxKeys })
      limiter.begin('victim@x', 'ip')
      for (let i = 0; i < maxKeys / 2; i++) limiter.begin(`fill${i}@x`, 'ip')
      if (ownerLogsIn) {
        const owner = limiter.begin('victim@x', 'owner-ip')
        if (owner.kind !== 'admitted') throw new Error('주인이 막혔다 — 판이 안 섰다')
        owner.succeeded()
      }
      for (let i = maxKeys / 2; i < maxKeys; i++) limiter.begin(`fill${i}@x`, 'ip')
      return [limiter.begin('victim@x', 'ip').kind, limiter.begin('victim@x', 'ip').kind]
    }
    expect(answers(true)).toEqual(answers(false))
  })

  // 모든 키가 막혔으면 메모리 상한을 지키려 막힌 키도 버린다(`src/auth/login-limit.ts` 머리말 «키 수에 상한이 있다»).
  it('모든 키가 막혔으면 마지막 기록이 가장 오래된 키를 버린다', () => {
    const limiter = tickingLimiter({ perAccount: 1, maxKeys: 2 })

    limiter.begin('a@x', 'ip')
    limiter.begin('b@x', 'ip')
    expect(limiter.begin('a@x', 'ip').kind).toBe('limited')
    // 셋째 키가 들어오면 마지막 기록이 가장 오래된 a 가 밀린다 — b · c 는 남는다.
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

  it('모든 IPv4 를 덮는 IPv6 대역 · 접두 0 은 기동 거절이다 — 까닭을 문장으로 말한다', () => {
    // IPv6 대역이 `::ffff:0:0/96`(IPv4 매핑 주소)을 통째로 덮으면 IPv4 로 붙는 클라이언트를 모두 믿는다.
    // 글자 `::a.b.c.d` 는 Fastify 가 매핑 꼴로 읽는다 — `::0.0.0.0/96` 은 `::ffff:0.0.0.0/96` 이다.
    for (const bad of ['::ffff:10.0.0.0/8', '0:0:0:0:0:ffff:10.0.0.0/8', '::ffff:a00:0/8', '::ffff:0:0/96', '::/64', '::/8', '::0.0.0.0/96', '::1.2.3.4/96', '::0.0.0.0/80']) {
      expect(() => loadConfig({ ...base, TRUST_PROXY: `10.0.0.2,${bad}` }), bad).toThrow(/모든 IPv4 주소를 믿습니다 — IPv4 대역은 IPv4 꼴/)
    }
    // 접두 0 은 Fastify(proxy-addr)가 기동에서 제 문장으로 던진다 — 설정에서 먼저 거절한다.
    for (const bad of ['0.0.0.0/0', '::/0']) {
      expect(() => loadConfig({ ...base, TRUST_PROXY: bad }), bad).toThrow(/접두 0 이라 모든 주소를 믿습니다/)
    }
  })

  // 설정이 받아 준 값을 실물(Fastify 의 `trustProxy`)에 물려, 대역 밖의 IPv4 클라이언트가 적은 머리를 안 믿는지 본다.
  it('받아 준 값은 Fastify 가 받고, 대역 안의 앞단만 믿는다 — 대역 밖의 IPv4 · IPv4 매핑 클라이언트는 제 주소다', async () => {
    const accepted: [value: string, inside: string][] = [
      ['10.0.0.0/8', '10.1.1.1'],
      ['10.0.0.2', '10.0.0.2'],
      ['::ffff:10.0.0.0/104', '10.1.1.1'],
      ['::ffff:10.0.0.2', '10.0.0.2'],
      ['::ffff:10.0.0.2/128', '::ffff:10.0.0.2'],
      ['2001:db8::/32', '2001:db8::5'],
      ['::/96', '::5'],
      ['::1', '::1'],
      ['fe80::1%eth0/64', 'fe80::5'],
      // 글자 `::a.b.c.d` 는 매핑 꼴 — 10/8 이다. 값이 같은 긴 꼴은 IPv6 대역이다.
      ['::10.0.0.0/104', '10.1.1.1'],
      ['0:0:0:0:0:0:10.0.0.0/104', '0:0:0:0:0:0:10.1.1.1'],
      // IPv4 변환 · NAT64 대역은 그 꼴로 오는 주소만 믿는다 — IPv4 로 붙는 클라이언트는 아니다.
      ['::ffff:0:0:0/96', '::ffff:0:1.2.3.4'],
      ['64:ff9b::/96', '64:ff9b::1.2.3.4'],
      // IPv4 의 절반(0.0.0.0/1)은 받는다 — 양 끝을 둘 다 믿어야 «IPv4 전부»다(`src/config.ts` 의 `trustProxyItemError`).
      ['::ffff:0.0.0.0/97', '10.1.1.1'],
    ]
    for (const [value, inside] of accepted) {
      const { trustProxy } = loadConfig({ ...base, TRUST_PROXY: value })
      const app = Fastify({ trustProxy })
      app.get('/', async (request) => ({ ip: request.ip }))
      try {
        const ipFrom = async (remoteAddress: string) =>
          (await app.inject({ url: '/', remoteAddress, headers: { 'x-forwarded-for': '6.6.6.6' } })).json().ip
        expect(await ipFrom(inside), `${value} 안`).toBe('6.6.6.6')
        expect(await ipFrom('203.0.113.9'), `${value} 밖`).toBe('203.0.113.9')
        expect(await ipFrom('::ffff:203.0.113.9'), `${value} 밖(매핑)`).toBe('::ffff:203.0.113.9')
      } finally {
        await app.close()
      }
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
