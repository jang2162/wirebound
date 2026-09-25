/**
 * **비밀번호는 NFC 로 정규화한 판을 해시하고 견준다**(`auth/password.ts` 머리말 «NFC»). 같은 글자가 입력기 · 붙여넣기에 따라
 * 조합형(NFD — `ㅎ ㅏ ㄴ`)이나 완성형(NFC — `한`)으로 온다. 원문 바이트를 그대로 해시하면 정할 때와 칠 때의 꼴이 갈린 사람은
 * 맞는 비밀번호로 로그인하지 못한다.
 *
 * 입구: 정하는 자리 둘(시딩 `db/seed-user.ts` · 재설정 명령 `db/reset-password.ts`)과 받는 자리 하나(`POST /api/auth/login` — 웹 ·
 * CLI `wireb login` 이 여기로 온다). **정규화 전에 해시한 옛 해시**도 로그인된다 — 원문 판 · NFC 판 · NFD 판을 차례로 견준다.
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashPassword } from '../src/auth/password'
import { SeedUserError, seedUser } from '../src/db/seed-user'
import { ResetPasswordError, resetPassword } from '../src/db/reset-password'
import { testConfig, withApi, type TestContext } from './helpers'

/** 7 음절 + 숫자 하나 — NFC 8자, NFD 18자. */
const PASSWORD = '비밀번호정규화1'
const NFC = PASSWORD.normalize('NFC')
const NFD = PASSWORD.normalize('NFD')

let counter = 0
const nextEmail = () => `nfc${++counter}-${Date.now().toString(36)}@example.com`

async function login(ctx: TestContext, email: string, password: string): Promise<number> {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
  return res.statusCode
}

/** 정규화 전의 `hashPassword` 가 만든 해시 — 받은 글자를 그대로 해시한다(형식은 `auth/password.ts` 의 `scrypt$N$r$p$salt$hash`). */
function legacyHash(raw: string): string {
  const N = testConfig().passwordScryptN
  const salt = randomBytes(16)
  const key = scryptSync(raw, salt, 32, { N, r: 8, p: 1 })
  return ['scrypt', N, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$')
}

async function seedLegacy(ctx: TestContext, raw: string): Promise<string> {
  const email = nextEmail()
  await ctx.db.insertInto('users').values({ email, name: '옛 해시', password_hash: legacyHash(raw) }).execute()
  return email
}

describe('비밀번호 NFC', () => {
  it('조합형(NFD)과 완성형(NFC)은 다른 글자다 — 이 케이스의 전제', () => {
    expect(NFC).not.toBe(NFD)
    expect([NFC.length, NFD.length]).toEqual([8, 18])
  })

  /**
   * 정한 꼴과 다른 꼴의 로그인은 **장치 둘이 겹쳐 지킨다** — 정할 때의 NFC(`NewPassword` · `hashPassword`)와 견줄 때의 NFD 판. 하나만
   * 떼면 다른 하나가 받아 초록이다(고치기 전 소스에서는 빨강). 장치마다 혼자 죽는 케이스는 «해시는 NFC 판의 것»(정규화) · «옛
   * 해시도 로그인된다»(NFD 판)다.
   */
  it('시딩한 꼴과 다른 꼴로 쳐도 로그인된다 — 두 방향', async () => {
    await withApi(async (ctx) => {
      const scryptN = testConfig().passwordScryptN
      const byNfd = nextEmail()
      expect((await seedUser(ctx.db, { email: byNfd, name: 'NFD 로 정함', password: NFD }, scryptN)).kind).toBe('created')
      const byNfc = nextEmail()
      expect((await seedUser(ctx.db, { email: byNfc, name: 'NFC 로 정함', password: NFC }, scryptN)).kind).toBe('created')

      expect([await login(ctx, byNfd, NFC), await login(ctx, byNfd, NFD)]).toEqual([200, 200])
      expect([await login(ctx, byNfc, NFD), await login(ctx, byNfc, NFC)]).toEqual([200, 200])
      expect([await login(ctx, byNfd, `${NFC}x`), await login(ctx, byNfc, `${NFD}x`)]).toEqual([401, 401])
    })
  })

  it('재설정 명령으로 정한 꼴과 다른 꼴로 쳐도 로그인된다', async () => {
    await withApi(async (ctx) => {
      const email = nextEmail()
      expect((await seedUser(ctx.db, { email, name: '재설정', password: 'password1234' }, testConfig().passwordScryptN)).kind).toBe('created')
      expect((await resetPassword(ctx.db, email, NFD, testConfig().passwordScryptN)).kind).toBe('updated')
      expect([await login(ctx, email, NFC), await login(ctx, email, NFD)]).toEqual([200, 200])
    })
  })

  it('정규화 전의 옛 해시도 로그인된다 — 정할 때의 꼴이 NFD 여도 NFC 여도', async () => {
    await withApi(async (ctx) => {
      const oldNfd = await seedLegacy(ctx, NFD)
      const oldNfc = await seedLegacy(ctx, NFC)
      expect([await login(ctx, oldNfd, NFC), await login(ctx, oldNfd, NFD)]).toEqual([200, 200])
      expect([await login(ctx, oldNfc, NFD), await login(ctx, oldNfc, NFC)]).toEqual([200, 200])
      expect([await login(ctx, oldNfd, `${NFC}x`), await login(ctx, oldNfd, `${NFD}x`)]).toEqual([401, 401])
    })
  })

  /** 앞은 완성형 · 뒤는 조합형으로 섞어 정한 옛 해시 — NFC 판도 NFD 판도 아니다. 친 그대로의 꼴만 맞는다. */
  it('섞인 꼴로 정한 옛 해시는 그 꼴 그대로 치면 로그인된다', async () => {
    await withApi(async (ctx) => {
      const mixed = `${'비밀번호'.normalize('NFC')}${'정규화1'.normalize('NFD')}`
      expect(new Set([mixed, mixed.normalize('NFC'), mixed.normalize('NFD')]).size).toBe(3)
      const email = await seedLegacy(ctx, mixed)
      expect(await login(ctx, email, mixed)).toBe(200)
    })
  })

  /** 정규화 전의 규칙은 받은 글자로 8자를 쟀다 — NFC 로 5자인 조합형 비밀번호가 옛 해시로 있을 수 있다. */
  it('NFC 로 8자가 안 되는 옛 NFD 비밀번호도 조합형으로 치면 로그인된다', async () => {
    await withApi(async (ctx) => {
      const short = '한글비번1'.normalize('NFD')
      const email = await seedLegacy(ctx, short)
      expect(await login(ctx, email, short)).toBe(200)
    })
  })

  /** 받은 글자의 상한 200 을 NFC 판으로 잰다 — 완성형 100자는 조합형으로 300자다. */
  it('완성형으로 200자 안인 비밀번호는 조합형으로 200자를 넘겨 쳐도 로그인된다', async () => {
    await withApi(async (ctx) => {
      const long = '한'.repeat(100)
      expect(long.normalize('NFD').length).toBe(300)
      const email = nextEmail()
      expect((await seedUser(ctx.db, { email, name: '긴 것', password: long }, testConfig().passwordScryptN)).kind).toBe('created')
      expect(await login(ctx, email, long.normalize('NFD'))).toBe(200)
    })
  })

  /**
   * 정한 해시는 NFC 판의 해시다 — 견줄 때의 옛 꼴 갈래(NFD 판 · 받은 글자)는 옛 해시를 위한 것이고, 새 해시는 첫 견줌에 맞는다.
   * 방벽이 둘이라 둘 다 잰다: 정하는 규칙(`NewPassword`)이 NFC 를 내고, `hashPassword`도 NFC 판을 해시한다.
   */
  it('조합형으로 정해도 해시는 NFC 판의 것이다 — 시딩 · `hashPassword` 둘 다', async () => {
    await withApi(async (ctx) => {
      const email = nextEmail()
      expect((await seedUser(ctx.db, { email, name: 'NFD 로 정함', password: NFD }, testConfig().passwordScryptN)).kind).toBe('created')
      const row = await ctx.db.selectFrom('users').select('password_hash').where('email', '=', email).executeTakeFirstOrThrow()
      const direct = await hashPassword(NFD, { N: testConfig().passwordScryptN, r: 8, p: 1 })
      for (const encoded of [row.password_hash, direct]) {
        const [, n, r, p, salt, key] = encoded.split('$')
        const of = (raw: string) => scryptSync(raw, Buffer.from(salt!, 'base64url'), 32, { N: Number(n), r: Number(r), p: Number(p) }).toString('base64url')
        expect(key).toBe(of(NFC))
        expect(key).not.toBe(of(NFD))
      }
    })
  })

  /**
   * **정하는 길이는 NFC 로 센다** — 로그인 본문은 받은 글자로 8자 이상을 본다(`auth/credentials.ts` 의 `RawPassword`). NFD 로
   * 8자를 넘지만 NFC 로 모자라는 비밀번호를 받으면, 그 사람이 완성형으로 칠 때 로그인이 400 이다(아무도 못 쓰는 계정).
   */
  it('NFC 로 8자가 안 되는 비밀번호는 정하지 않는다 — NFD 로는 8자를 넘어도', async () => {
    await withApi(async (ctx) => {
      const short = '한글비번1'.normalize('NFD')
      expect(short.length).toBeGreaterThanOrEqual(8)
      expect(short.normalize('NFC').length).toBeLessThan(8)
      await expect(seedUser(ctx.db, { email: nextEmail(), name: '짧음', password: short }, testConfig().passwordScryptN)).rejects.toThrow(SeedUserError)
      await expect(resetPassword(ctx.db, nextEmail(), short, testConfig().passwordScryptN)).rejects.toThrow(ResetPasswordError)
    })
  })
})
