/**
 * **인스턴스 관리자 명령**(`src/db/admin.ts`) · 시딩의 `SEED_USER_ADMIN` · `GET /api/auth/me` 의 `isInstanceAdmin`.
 *
 * 관리자를 주고 거두는 길은 서버에 손이 닿는 사람의 명령 · 시딩뿐이다 — API 에 그 라우트가 없다(spec 「인스턴스 관리자」).
 */
import { describe, expect, it } from 'vitest'
import { runAdmin, type AdminIo } from '../src/db/admin'
import { isInstanceAdmin, setInstanceAdmin } from '../src/repos/users'
import { describeSeedOutcome, seedUser, seedUserFromEnv } from '../src/db/seed-user'
import { signup, testConfig, withApi, type TestContext } from './helpers'

const TEST_SCRYPT_N = testConfig().passwordScryptN
const DATABASE_URL = 'postgres://u:비밀@127.0.0.1:5999/wb_admin'

function terminal() {
  const out: string[] = []
  const err: string[] = []
  const io: AdminIo = { log: (line) => out.push(line), error: (line) => err.push(line) }
  return { io, out, err }
}

function target(ctx: TestContext) {
  return { db: ctx.db, databaseUrl: DATABASE_URL }
}

async function adminFlag(ctx: TestContext, email: string): Promise<boolean> {
  const row = await ctx.db.selectFrom('users').select('is_instance_admin').where('email', '=', email).executeTakeFirstOrThrow()
  return row.is_instance_admin
}

describe('admin grant · revoke · list', () => {
  it('grant 는 대상 DB 를 먼저 말하고 켠다 — 다시 grant 하면 1 이고 아무것도 안 바꾼다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'a@example.com' })
      const first = terminal()
      expect(await runAdmin(['grant', 'a@example.com'], target(ctx), first.io)).toBe(0)
      expect(first.out[0]).toBe('인스턴스 관리자 대상 DB: 127.0.0.1:5999/wb_admin')
      expect(first.out.join('\n')).not.toContain('비밀')
      expect(await adminFlag(ctx, 'a@example.com')).toBe(true)

      const again = terminal()
      expect(await runAdmin(['grant', 'a@example.com'], target(ctx), again.io)).toBe(1)
      expect(again.err).toEqual(['이미 관리자입니다 — 아무것도 바꾸지 않았습니다.'])
    })
  })

  it('revoke 는 끈다 — 다시 revoke 하면 1', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'a@example.com' })
      await runAdmin(['grant', 'a@example.com'], target(ctx), terminal().io)

      const first = terminal()
      expect(await runAdmin(['revoke', 'a@example.com'], target(ctx), first.io)).toBe(0)
      expect(await adminFlag(ctx, 'a@example.com')).toBe(false)

      const again = terminal()
      expect(await runAdmin(['revoke', 'a@example.com'], target(ctx), again.io)).toBe(1)
      expect(again.err).toEqual(['관리자가 아닙니다 — 아무것도 바꾸지 않았습니다.'])
    })
  })

  it('없는 이메일은 1 이고 그렇다고 말한다', async () => {
    await withApi(async (ctx) => {
      for (const verb of ['grant', 'revoke']) {
        const t = terminal()
        expect(await runAdmin([verb, 'nobody@example.com'], target(ctx), t.io)).toBe(1)
        expect(t.err).toEqual(['그 이메일의 계정이 없습니다(nobody@example.com) — 아무것도 바꾸지 않았습니다.'])
      }
    })
  })

  it('이메일은 서버와 같은 정규화로 찾는다 — 대소문자가 달라도 같은 계정이다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'mixed@example.com' })
      expect(await runAdmin(['grant', '  Mixed@Example.COM '], target(ctx), terminal().io)).toBe(0)
      expect(await adminFlag(ctx, 'mixed@example.com')).toBe(true)
    })
  })

  it('list 는 관리자 이메일을 줄마다 낸다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'b@example.com' })
      await signup(ctx, { email: 'a@example.com' })
      await signup(ctx, { email: 'c@example.com' })
      await runAdmin(['grant', 'b@example.com'], target(ctx), terminal().io)
      await runAdmin(['grant', 'a@example.com'], target(ctx), terminal().io)

      const t = terminal()
      expect(await runAdmin(['list'], target(ctx), t.io)).toBe(0)
      expect(t.out).toEqual(['인스턴스 관리자 대상 DB: 127.0.0.1:5999/wb_admin', 'a@example.com', 'b@example.com'])
    })
  })

  it('관리자가 없으면 list 가 그렇다고 한 줄로 말한다', async () => {
    await withApi(async (ctx) => {
      const t = terminal()
      expect(await runAdmin(['list'], target(ctx), t.io)).toBe(0)
      expect(t.out.at(-1)).toBe('관리자가 없습니다')
    })
  })

  it.each([
    ['동사 없음', []],
    ['모르는 동사', ['promote', 'a@example.com']],
    ['grant 에 이메일 없음', ['grant']],
    ['grant 에 인자 둘', ['grant', 'a@example.com', 'b@example.com']],
    ['list 에 인자', ['list', 'a@example.com']],
  ])('%s → 2 와 사용법 · DB 를 안 건드린다', async (_label, args) => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'a@example.com' })
      const t = terminal()
      expect(await runAdmin(args, target(ctx), t.io)).toBe(2)
      expect(t.err[0]).toBe('사용법: pnpm --filter @wirebound/api admin grant <이메일> | revoke <이메일> | list')
      expect(t.out).toEqual([])
      expect(await adminFlag(ctx, 'a@example.com')).toBe(false)
    })
  })

  it('pnpm 인자 관습의 `--` 는 인자가 아니다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'a@example.com' })
      expect(await runAdmin(['--', 'grant', 'a@example.com'], target(ctx), terminal().io)).toBe(0)
      expect(await adminFlag(ctx, 'a@example.com')).toBe(true)
    })
  })

  it('이메일 형식이 아니면 1 이고 아무것도 안 바꾼다', async () => {
    await withApi(async (ctx) => {
      const t = terminal()
      expect(await runAdmin(['grant', 'not-an-email'], target(ctx), t.io)).toBe(1)
      expect(t.err).toEqual(['이메일 형식이 아닙니다: not-an-email — 아무것도 바꾸지 않았습니다.'])
    })
  })
})

describe('저장소 함수', () => {
  it('setInstanceAdmin 은 changed · unchanged · missing 을 가른다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'a@example.com' })
      expect(await setInstanceAdmin(ctx.db, 'a@example.com', true)).toBe('changed')
      expect(await setInstanceAdmin(ctx.db, 'a@example.com', true)).toBe('unchanged')
      expect(await setInstanceAdmin(ctx.db, 'a@example.com', false)).toBe('changed')
      expect(await setInstanceAdmin(ctx.db, 'none@example.com', true)).toBe('missing')
    })
  })

  it('isInstanceAdmin 은 없는 사용자에게 false', async () => {
    await withApi(async (ctx) => {
      expect(await isInstanceAdmin(ctx.db, '00000000-0000-4000-8000-000000000000')).toBe(false)
    })
  })
})

describe('시딩의 SEED_USER_ADMIN', () => {
  const BASE = { SEED_USER_EMAIL: 'seed@example.com', SEED_USER_PASSWORD: 'password1234' }

  it('1 이면 새로 만든 계정을 관리자로 만든다', async () => {
    await withApi(async (ctx) => {
      const outcome = await seedUserFromEnv(ctx.db, { ...BASE, SEED_USER_ADMIN: '1' }, TEST_SCRYPT_N)
      expect(outcome).toEqual({ kind: 'created', email: 'seed@example.com', admin: true })
      expect(await adminFlag(ctx, 'seed@example.com')).toBe(true)
      expect(describeSeedOutcome(outcome)).toBe('계정 시딩: 만들었습니다 — seed@example.com (인스턴스 관리자)')
    })
  })

  it('없으면 관리자가 아니다', async () => {
    await withApi(async (ctx) => {
      expect(await seedUserFromEnv(ctx.db, BASE, TEST_SCRYPT_N)).toEqual({ kind: 'created', email: 'seed@example.com' })
      expect(await adminFlag(ctx, 'seed@example.com')).toBe(false)
    })
  })

  it('이미 있는 계정은 바꾸지 않고 명령을 말한다', async () => {
    await withApi(async (ctx) => {
      await seedUser(ctx.db, { email: 'seed@example.com', name: '처음', password: 'password1234' }, TEST_SCRYPT_N)
      const outcome = await seedUserFromEnv(ctx.db, { ...BASE, SEED_USER_ADMIN: '1' }, TEST_SCRYPT_N)
      expect(outcome).toEqual({ kind: 'already-exists', email: 'seed@example.com', adminNotChanged: true })
      expect(await adminFlag(ctx, 'seed@example.com')).toBe(false)
      expect(describeSeedOutcome(outcome)).toContain(
        '관리자로 만들려면 `pnpm --filter @wirebound/api admin grant seed@example.com`',
      )
    })
  })

  it('1 도 빈 값도 아니면 던진다 — 계정도 안 만든다', async () => {
    await withApi(async (ctx) => {
      await expect(seedUserFromEnv(ctx.db, { ...BASE, SEED_USER_ADMIN: 'yes' }, TEST_SCRYPT_N)).rejects.toThrow(
        'SEED_USER_ADMIN 은 1 이거나 비워 둡니다',
      )
      expect(await ctx.db.selectFrom('users').select('id').execute()).toEqual([])
    })
  })

  it('SEED_USER_ADMIN 만 주면 이메일 · 비밀번호가 없다고 죽는다 — 시딩할 뜻이다', async () => {
    await withApi(async (ctx) => {
      await expect(seedUserFromEnv(ctx.db, { SEED_USER_ADMIN: '1' }, TEST_SCRYPT_N)).rejects.toThrow(
        '계정 시딩에 필요한 환경변수가 없습니다',
      )
    })
  })
})

describe('GET /api/auth/me', () => {
  it('isInstanceAdmin 을 싣는다 — 켠 뒤 다음 요청부터 true', async () => {
    await withApi(async (ctx) => {
      const me = await signup(ctx, { email: 'a@example.com' })
      const before = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: me.cookie })
      expect(before.json()).toMatchObject({ email: 'a@example.com', isInstanceAdmin: false })

      await runAdmin(['grant', 'a@example.com'], target(ctx), terminal().io)
      const after = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: me.cookie })
      expect(after.json()).toMatchObject({ email: 'a@example.com', isInstanceAdmin: true })
    })
  })
})
