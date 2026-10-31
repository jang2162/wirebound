/**
 * **RV-AC 리뷰 5 · 6 — 링크 원문이 남는 자리와 한 링크로 만드는 계정 수.**
 *
 * **이 파일의 `describe.skip` 둘은 지금 빨강인 판이다 — 고칠 트랙이 skip 을 떼고 초록으로 돌린다.** 리뷰는 소스를 안 고쳤다(보고
 * `docs/superpowers/plans/2026-10-31-rv-ac-report.md` «발견» M1 · L1 에 skip 을 뗐을 때의 실패 값이 있다).
 *
 * - **원문이 로그에 남는다(M1)** — 초대 · 재설정 링크 원문은 경로에 든다(`/api/auth/invites/<원문>` · `/api/auth/resets/<원문>`). pino 의 요청
 *   로그는 기본 `req` 시리얼라이저가 `url` 을 그대로 적는다(`src/app.ts` 의 `buildLoggerOptions` 머리말) — 운영 기본 `LOG_LEVEL` 은 `info` 다.
 *   DB 에는 해시만 두는 성질(계획 «공통 제약» «토큰 원문은 저장하지 않는다»)이 로그 파일에서 안 선다.
 * - **기록(`admin_audit`)에는 원문도 해시도 없다** — 초록이다(skip 없음).
 * - **한 «여러 명» 링크로 한 주소가 만드는 계정(L1)** — 가입은 로그인 한도에 세지만 성공은 제 자리를 걷으므로(`src/auth/login-limit.ts` 머리말
 *   «성공은 두 키에서 이 시도의 자리만 걷는다») 주소 한도(`perAddress` 30)가 성공한 가입을 묶지 않는다. 설계가 막지 않은 것이라 «낮음 · 이월»
 *   후보다 — 막기로 하면 skip 을 뗀다.
 */
import { Writable } from 'node:stream'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
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

describe.skip('M1 — 링크 원문이 요청 로그에 남지 않는다(지금 빨강 · 고칠 트랙이 skip 을 뗀다)', () => {
  it('초대 링크 원문이 로그(`LOG_LEVEL=info`)에 없다', async () => {
    const { invite, logged } = await linksAndLog()
    expect(logged.split(invite).length - 1).toBe(0)
  })

  it('재설정 링크 원문이 로그에 없다', async () => {
    const { reset, logged } = await linksAndLog()
    expect(logged.split(reset).length - 1).toBe(0)
  })
})

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
