/**
 * **RV-AC 리뷰 5 · 6 — 링크 원문이 남는 자리와 한 링크로 만드는 계정 수.**
 *
 * - **원문이 로그에 안 남는다(M1)** — 초대 · 재설정 링크 원문은 경로에 든다(`/api/auth/invites/<원문>` · `/api/auth/resets/<원문>`). 요청
 *   로그의 `url` · 오류 문장 · 문장 칸은 `src/http/log-mask.ts` 의 `maskLinkTokens` 를 지난다(왜 · 어느 칸인지는 그 머리말). 운영 기본
 *   `LOG_LEVEL` 은 `info` 라 케이스도 `info` 로 세운다.
 * - **기록(`admin_audit`)에는 원문도 해시도 없다.**
 * - **한 «여러 명» 링크로 한 주소가 만드는 계정(L1)** — 가입은 로그인 한도에 세지만 성공은 제 자리를 걷으므로(`src/auth/login-limit.ts` 머리말
 *   «성공은 두 키에서 이 시도의 자리만 걷는다») 주소 한도(`perAddress` 30)가 성공한 가입을 묶지 않는다. 그 `describe.skip` 은 지금 빨강인
 *   판이다(이월 — 아래 그 블록의 주석). 리뷰 보고 `docs/superpowers/plans/2026-10-31-rv-ac-report.md` «발견» L1 에 skip 을 뗐을 때의 실패
 *   값이 있다.
 */
import { Writable } from 'node:stream'
import Fastify from 'fastify'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { buildLoggerOptions } from '../src/app'
import { LOG_MASK, maskLinkTokens } from '../src/http/log-mask'
import { hashTokenValue } from '../src/auth/token-hash'
import { LOGIN_LIMIT } from '../src/auth/login-limit'
import { admin, adminOf, joinWith, makeInvite } from './accounts-fixtures'
import { signup, testConfig, withApi } from './helpers'

function captureLogStream(): { stream: Writable; read: () => string } {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      callback()
    },
  })
  return { stream, read: () => Buffer.concat(chunks).toString('utf8') }
}

/** 링크를 만들고 연 뒤(확인 · 쓰기) 원문과 로그를 낸다. */
async function linksAndLog(): Promise<{ invite: string; reset: string; logged: string }> {
  const { stream, read } = captureLogStream()
  let invite = ''
  let reset = ''
  await withApi(
    async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      invite = (await makeInvite(ctx, me.cookie, { kind: 'multi' })).token
      expect((await ctx.app.inject({ method: 'GET', url: `/api/auth/invites/${invite}` })).statusCode).toBe(200)
      expect((await joinWith(ctx, invite)).statusCode).toBe(201)
      const made = await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/reset-links`)
      expect(made.statusCode).toBe(201)
      reset = made.json().token
      expect((await ctx.app.inject({ method: 'GET', url: `/api/auth/resets/${reset}` })).statusCode).toBe(200)
    },
    { config: { ...testConfig(), logLevel: 'info' as const }, loggerStream: stream },
  )
  const logged = read()
  // 카나리아 — 로그가 실제로 찍혔고 원문이 실제로 만들어졌다(빈 글자는 늘 «안 보임» 이다).
  expect(logged).toContain('/api/auth/invites/')
  expect(invite.length).toBeGreaterThan(20)
  expect(reset.length).toBeGreaterThan(20)
  return { invite, reset, logged }
}

describe('M1 — 링크 원문이 요청 로그에 남지 않는다', () => {
  it('초대 링크 원문이 로그(`LOG_LEVEL=info`)에 없다', async () => {
    const { invite, logged } = await linksAndLog()
    expect(logged.split(invite).length - 1).toBe(0)
  })

  it('재설정 링크 원문이 로그에 없다', async () => {
    const { reset, logged } = await linksAndLog()
    expect(logged.split(reset).length - 1).toBe(0)
  })

  it('요청 줄은 남고 `url` 만 가린다 — 칸은 Fastify 기본의 것뿐이고 링크가 아닌 경로는 그대로다', async () => {
    const { logged } = await linksAndLog()
    const incoming = requestLines(logged)
    expect(incoming.map((line) => `${line.method} ${line.url}`)).toEqual(
      expect.arrayContaining([
        `GET /api/auth/invites/${LOG_MASK}`,
        `POST /api/auth/invites/${LOG_MASK}`,
        `GET /api/auth/resets/${LOG_MASK}`,
        'POST /api/admin/invites',
      ]),
    )
    expect(incoming.some((line) => /^\/api\/admin\/users\/[0-9a-f-]{36}\/reset-links$/.test(String(line.url)))).toBe(true)
    // 헤더 · 본문을 싣지 않는 것이 쿠키 · 비밀번호가 로그에 안 남는 까닭이다(`test/logging.test.ts`) — 칸이 늘면 그 전제가 바뀐다.
    const fields = ['method', 'url', 'version', 'host', 'remoteAddress', 'remotePort']
    for (const line of incoming) {
      expect(Object.keys(line).filter((key) => !fields.includes(key))).toEqual([])
      expect(Object.keys(line)).toEqual(expect.arrayContaining(['method', 'url']))
    }
  })

  it('못 쓰는 링크(404) · 400 · 429 · 500 과 인코딩 · 대소문자를 바꾼 경로에서도 원문이 안 남는다', async () => {
    const { stream, read } = captureLogStream()
    const statuses: Record<string, number> = {}
    const markers: string[] = []
    await withApi(
      async (ctx) => {
        const me = await adminOf(ctx)
        const bob = await signup(ctx)
        const used = (await makeInvite(ctx, me.cookie, { kind: 'single' })).token
        expect((await joinWith(ctx, used)).statusCode).toBe(201)
        const multi = (await makeInvite(ctx, me.cookie, { kind: 'multi' })).token
        const reset = (await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/reset-links`)).json().token as string
        const bogus = 'zzBogusResetLinkMarker0123456789abcdef'
        markers.push(used, multi, reset, bogus)
        const send = async (key: string, method: 'GET' | 'POST', url: string, payload?: object) => {
          statuses[key] = (await ctx.app.inject({ method, url, payload, remoteAddress: '10.63.0.1' })).statusCode
        }
        await send('다 쓴 초대', 'GET', `/api/auth/invites/${used}`)
        await send('본문이 틀린 가입', 'POST', `/api/auth/invites/${multi}/signup`, { email: 'x' })
        for (let index = 0; index <= LOGIN_LIMIT.perAccount; index += 1) {
          await send('한도', 'POST', `/api/auth/resets/${bogus}`, { password: 'brandnew5678' })
        }
        await send('인코딩한 경로', 'GET', `/api/auth/%69nvites/${multi}`)
        await send('대소문자 · 겹친 빗금', 'GET', `/API//Auth/Invites/${multi}`)
        await send('끝 빗금', 'GET', `/api/auth/resets/${reset}/`)
        // 마지막이다 — 실패한 질의가 테스트 트랜잭션을 깨뜨린다(`withApi` 머리말 «트랜잭션 오염»).
        await sql`alter table password_resets rename to password_resets_gone`.execute(ctx.db)
        await send('저장소 오류', 'GET', `/api/auth/resets/${reset}`)
      },
      { config: { ...testConfig(), logLevel: 'info' as const }, loggerStream: stream },
    )
    const logged = read()
    // 카나리아 — 갈래마다 그 상태로 끝났고, 보낸 요청마다 요청 줄이 섰다.
    expect(statuses).toEqual({
      '다 쓴 초대': 404,
      '본문이 틀린 가입': 400,
      한도: 429,
      '인코딩한 경로': 200,
      '대소문자 · 겹친 빗금': 404,
      '끝 빗금': 404,
      '저장소 오류': 500,
    })
    expect(logged).toContain('처리되지 않은 예외')
    for (const marker of markers) {
      expect(marker.length).toBeGreaterThan(20)
      expect(logged.split(marker).length - 1).toBe(0)
    }
    expect(requestLines(logged).filter((line) => String(line.url).includes(LOG_MASK)).length).toBe(LOGIN_LIMIT.perAccount + 8)
  })

  it('Fastify 의 오류 문장 · 문장 칸(`%s` 를 채운 글자)에 실린 경로도 가린다', async () => {
    const marker = 'zzAlreadySentMarker0123456789abcdef'
    const { stream, read } = captureLogStream()
    const app = Fastify({ logger: { ...buildLoggerOptions({ ...testConfig(), logLevel: 'info' as const }), stream } })
    app.get('/api/auth/invites/:token', (_request, reply) => {
      reply.send({ first: true })
      reply.send({ second: true })
    })
    try {
      expect((await app.inject({ method: 'GET', url: `/api/auth/invites/${marker}` })).statusCode).toBe(200)
      app.log.warn('경로 %s', `/api/auth/resets/${marker}`)
      app.log.warn(`in the "/api/auth/invites/${marker}/signup" (POST) route`)
    } finally {
      await app.close()
    }
    const logged = read()
    // 카나리아 — 세 자리가 실제로 찍혔다.
    expect(logged).toContain('FST_ERR_REP_ALREADY_SENT')
    expect(logged).toContain(`경로 /api/auth/resets/${LOG_MASK}`)
    expect(logged).toContain(`in the \\"/api/auth/invites/${LOG_MASK}\\" (POST) route`)
    expect(logged.split(marker).length - 1).toBe(0)
  })

  it('링크가 아닌 경로는 받은 글자 그대로다(인코딩도 안 푼다)', () => {
    for (const url of [
      '/api/projects/%EA%B0%80?q=%2F',
      '/api/admin/invites/7d0c3f1e-0000-4000-8000-000000000000/revoke',
      '/api/auth/login',
      '/api/auth/invites',
    ]) {
      expect(maskLinkTokens(url)).toBe(url)
    }
  })
})

/** 로그의 «incoming request» 줄마다 `req`. */
function requestLines(logged: string): Record<string, unknown>[] {
  return logged
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as { msg?: string; req?: Record<string, unknown> })
    .filter((line) => line.msg === 'incoming request' && line.req !== undefined)
    .map((line) => line.req as Record<string, unknown>)
}

describe('기록에는 링크 원문도 해시도 없다', () => {
  it('`admin_audit` 의 어느 칸에도 초대 · 재설정 원문과 그 해시가 없다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const invite = await makeInvite(ctx, me.cookie, { kind: 'single' })
      expect((await joinWith(ctx, invite.token)).statusCode).toBe(201)
      const made = await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/reset-links`)
      const reset = made.json().token as string
      expect(
        (
          await ctx.app.inject({
            method: 'POST',
            url: `/api/auth/resets/${reset}`,
            payload: { password: 'brandnew5678' },
            remoteAddress: '10.61.0.1',
          })
        ).statusCode,
      ).toBe(204)
      const rows = (await sql<{ row: string }>`select a::text as row from admin_audit a`.execute(ctx.db)).rows.map((row) => row.row)
      const actions = (await sql<{ action: string }>`select action from admin_audit`.execute(ctx.db)).rows.map((row) => row.action)
      // 카나리아 — 링크를 다룬 기록 넷이 실제로 있다.
      expect(actions).toEqual(expect.arrayContaining(['invite.create', 'invite.signup', 'reset.create', 'reset.use']))
      for (const needle of [invite.token, hashTokenValue(invite.token), reset, hashTokenValue(reset)]) {
        expect(rows.filter((row) => row.includes(needle))).toEqual([])
      }
    })
  })
})

// 이월(2026-10-31 사내 공용 운영 — 가입 성공 수 한도). 막기로 하면 skip 을 뗀다 — 가입만의 셈을 따로 둔다(로그인과 같은 `LoginLimiter` 의
// `succeeded` 를 바꾸면 «주인이 로그인했다» 신호가 다시 선다 — 리뷰 보고 L1 «그 방향을 그대로 짜면 죽을 것»).
describe.skip('L1 — 한 «여러 명» 링크로 한 주소가 한 창에 만드는 계정은 주소 한도 안이다(설계가 막지 않음 · 이월 후보 · 막기로 하면 skip 을 뗀다)', () => {
  it(`같은 주소에서 다른 이메일로 ${LOGIN_LIMIT.perAddress + 10} 번 가입하면 ${LOGIN_LIMIT.perAddress} 번을 넘게 서지 않는다`, async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const { token } = await makeInvite(ctx, me.cookie, { kind: 'multi' })
      const codes: number[] = []
      for (let index = 0; index < LOGIN_LIMIT.perAddress + 10; index += 1) {
        codes.push((await joinWith(ctx, token, { email: `farm${index}@example.com` }, '10.62.0.1')).statusCode)
      }
      const created = codes.filter((code) => code === 201).length
      console.log('[rv-ac 6 multi farm]', { sent: codes.length, created, limited: codes.filter((code) => code === 429).length })
      expect(created).toBeLessThanOrEqual(LOGIN_LIMIT.perAddress)
    })
  })
})
