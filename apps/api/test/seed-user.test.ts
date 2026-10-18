/**
 * **계정 시딩** — 가입 라우트가 없으므로 계정을 만드는 **유일한 길**이다.
 *
 * 여기서 재는 것은 넷이다:
 *
 * - 시딩은 마이그레이션이 **아니다** — `migrateToLatest`가 계정을 만들지 않고,
 *   마이그레이션 파일 어디에도 행 삽입이 없다. 그래야 `migrate:down`이 계정을 안 데려간다.
 * - 없으면 건너뛰고 · 있으면 만들고 · 이미 있으면 그대로 둔다. **셋 다 말한다.**
 *   그리고 **비밀번호를 덮어쓰지 않는다.**
 * - 어떤 갈래에서도 **비밀번호가 출력에 안 실린다.**
 * - **시딩한 계정은 로그인된다** — 만드는 자와 받는 자가 파일이 갈렸으므로
 *   (`db/seed-user.ts` vs `routes/auth.ts`) 경계값을 양쪽에서 함께 잰다.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DisplayName, LoginPassword, NewPassword } from '../src/auth/credentials'
import { migrateToLatest } from '../src/db/migrate'
import { describeSeedOutcome, readSeedUserEnv, runSeedStep, SeedUserError, seedUser, seedUserFromEnv } from '../src/db/seed-user'
import { withTransaction } from '../src/db/tx'
import { DuplicateEmailError, insertUser } from '../src/repos/users'
import { getTestDb, withApi } from './helpers'

/** 테스트용 scrypt 비용. `testConfig()`와 같은 값이다(운영 32768은 케이스마다 수십 ms를 쌓는다). */
const TEST_SCRYPT_N = 1024

/** `runSeedStep`이 낸 줄을 전부 모은다 — *"비밀번호가 출력에 안 실린다"*는 **출력 전문**을 봐야 잴 수 있다. */
function collect(): { report: { log: (line: string) => void; error: (line: string) => void }; text: () => string } {
  const lines: string[] = []
  return {
    report: { log: (line) => lines.push(line), error: (line) => lines.push(line) },
    text: () => lines.join('\n'),
  }
}

async function passwordHashOf(db: Parameters<typeof seedUser>[0], email: string): Promise<string | undefined> {
  const row = await db.selectFrom('users').select('password_hash').where('email', '=', email).executeTakeFirst()
  return row?.password_hash
}

describe('환경변수 읽기', () => {
  it('셋 다 없으면 건너뛴다 — `undefined`다', () => {
    expect(readSeedUserEnv({})).toBeUndefined()
  })

  it('빈 문자열·공백만 든 값은 "안 줬다"와 같다', () => {
    expect(readSeedUserEnv({ SEED_USER_EMAIL: '', SEED_USER_PASSWORD: '   ' })).toBeUndefined()
  })

  it('이메일만 주면 죽는다 — 조용히 건너뛰면 계정이 생긴 줄 안다', () => {
    expect(() => readSeedUserEnv({ SEED_USER_EMAIL: 'a@example.com' })).toThrow(SeedUserError)
    expect(() => readSeedUserEnv({ SEED_USER_EMAIL: 'a@example.com' })).toThrow(/SEED_USER_PASSWORD/)
  })

  it('비밀번호만 주면 죽는다', () => {
    expect(() => readSeedUserEnv({ SEED_USER_PASSWORD: 'password1234' })).toThrow(/SEED_USER_EMAIL/)
  })

  it('이름만 주면 죽는다 — 그것도 "시딩할 뜻"이다', () => {
    expect(() => readSeedUserEnv({ SEED_USER_NAME: '관리자' })).toThrow(SeedUserError)
  })

  it('이메일을 소문자로 정규화한다', () => {
    expect(readSeedUserEnv({ SEED_USER_EMAIL: 'Admin@Example.COM', SEED_USER_PASSWORD: 'password1234' })?.email).toBe('admin@example.com')
  })

  it('이름을 안 주면 이메일의 로컬 파트를 쓴다', () => {
    expect(readSeedUserEnv({ SEED_USER_EMAIL: 'Admin@Example.com', SEED_USER_PASSWORD: 'password1234' })?.name).toBe('admin')
  })

  it('로컬 파트가 80자를 넘으면 자르지 않고 죽는다 — 사람이 안 정한 이름을 남기지 않는다', () => {
    const long = `${'a'.repeat(81)}@example.com`
    expect(() => readSeedUserEnv({ SEED_USER_EMAIL: long, SEED_USER_PASSWORD: 'password1234' })).toThrow(/SEED_USER_NAME/)
  })

  it.each([
    ['이메일 형식', { SEED_USER_EMAIL: '골뱅이없음', SEED_USER_PASSWORD: 'password1234' }],
    ['짧은 비밀번호', { SEED_USER_EMAIL: 'a@example.com', SEED_USER_PASSWORD: '1234567' }],
    ['긴 비밀번호', { SEED_USER_EMAIL: 'a@example.com', SEED_USER_PASSWORD: 'a'.repeat(201) }],
    ['긴 이름', { SEED_USER_EMAIL: 'a@example.com', SEED_USER_NAME: '가'.repeat(81), SEED_USER_PASSWORD: 'password1234' }],
  ])('%s은 죽는다', (_label, env) => {
    expect(() => readSeedUserEnv(env)).toThrow(SeedUserError)
  })

  it('공백만 든 이름은 "안 줬다"라 이메일에서 만든다 — 빈 이름이 DB로 가지 않는다', () => {
    const input = readSeedUserEnv({
      SEED_USER_EMAIL: 'a@example.com',
      SEED_USER_NAME: '   ',
      SEED_USER_PASSWORD: 'password1234',
    })
    expect(input?.name).toBe('a')
  })
})

describe('시딩 — 없으면 만들고 이미 있으면 그대로 둔다', () => {
  it('환경변수가 없으면 건너뛰고 행을 안 만든다', async () => {
    await withApi(async ({ db }) => {
      expect(await seedUserFromEnv(db, {}, TEST_SCRYPT_N)).toEqual({ kind: 'skipped' })
      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(0)
    })
  })

  it('있으면 만든다 — 이메일은 소문자로 저장된다', async () => {
    await withApi(async ({ db }) => {
      const outcome = await seedUserFromEnv(
        db,
        { SEED_USER_EMAIL: 'Seed@Example.COM', SEED_USER_NAME: '시딩계정', SEED_USER_PASSWORD: 'password1234' },
        TEST_SCRYPT_N,
      )
      expect(outcome).toEqual({ kind: 'created', email: 'seed@example.com' })

      const rows = await db.selectFrom('users').select(['email', 'name']).execute()
      expect(rows).toEqual([{ email: 'seed@example.com', name: '시딩계정' }])
    })
  })

  it('비밀번호를 평문으로 저장하지 않는다', async () => {
    await withApi(async ({ db }) => {
      await seedUser(db, { email: 'seed@example.com', name: '시딩계정', password: 'password1234' }, TEST_SCRYPT_N)
      const hash = await passwordHashOf(db, 'seed@example.com')
      expect(hash).toBeTruthy()
      expect(hash).not.toContain('password1234')
      expect(hash).toMatch(/^scrypt\$/)
    })
  })

  it('이미 있으면 그대로 둔다 — **비밀번호를 덮어쓰지 않는다**', async () => {
    await withApi(async ({ app, db }) => {
      await seedUser(db, { email: 'seed@example.com', name: '처음이름', password: 'firstpassword' }, TEST_SCRYPT_N)
      const before = await passwordHashOf(db, 'seed@example.com')

      // 두 번째 `migrate`가 다른 비밀번호·다른 이름을 들고 왔다.
      const outcome = await seedUser(db, { email: 'Seed@Example.com', name: '나중이름', password: 'secondpassword' }, TEST_SCRYPT_N)
      expect(outcome).toEqual({ kind: 'already-exists', email: 'seed@example.com' })

      // 해시가 그대로다 — 그리고 그것이 무슨 뜻인지는 로그인이 말한다.
      expect(await passwordHashOf(db, 'seed@example.com')).toBe(before)
      expect(await db.selectFrom('users').select('name').execute()).toEqual([{ name: '처음이름' }])

      const withOld = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'seed@example.com', password: 'firstpassword' },
      })
      expect(withOld.statusCode).toBe(200)

      const withNew = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'seed@example.com', password: 'secondpassword' },
      })
      expect(withNew.statusCode).toBe(401)
    })
  })

  it('값이 나쁘면 던지고 행을 안 남긴다', async () => {
    await withApi(async ({ db }) => {
      await expect(
        seedUserFromEnv(db, { SEED_USER_EMAIL: '골뱅이없음', SEED_USER_PASSWORD: 'password1234' }, TEST_SCRYPT_N),
      ).rejects.toBeInstanceOf(SeedUserError)
      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(0)
    })
  })

  /**
   * **세이브포인트를 드는 자리는 여기뿐이다** — 실제로 유니크 위반을 유발하는 경로가
   * 이것 하나다(가입 라우트가 없다).
   *
   * 중복 삽입이 실패한 **뒤에** 같은 트랜잭션에서 `users`를 한 번 더 조회한다.
   * `insertUser`가 자기 INSERT를 `withTransaction`(세이브포인트)으로 감싸지 않으면
   * 유니크 위반이 바깥 트랜잭션 전체를 aborted로 만들어 그 조회가 내용과 무관하게
   * `25P02`로 죽는다. 이 케이스를 지우면 그 성질을 재는 자가 저장소에서 사라진다.
   */
  it('같은 이메일을 두 번 삽입하면 `DuplicateEmailError` 이고 **바깥 트랜잭션이 산다**', async () => {
    await withApi(async ({ db }) => {
      await seedUser(db, { email: 'seed@example.com', name: '시딩계정', password: 'password1234' }, TEST_SCRYPT_N)

      await expect(
        withTransaction(db, (trx) => insertUser(trx, { email: 'seed@example.com', name: '두번째', passwordHash: 'scrypt$fake' })),
      ).rejects.toBeInstanceOf(DuplicateEmailError)

      // 세이브포인트가 없다면 이 조회가 25P02로 죽는다 — 통과 자체가 증거다.
      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(1)
    })
  })

  it('환경변수를 안 지나는 호출자도 같은 게이트를 지난다', async () => {
    await withApi(async ({ db }) => {
      await expect(seedUser(db, { email: 'a@example.com', name: '짧은비번', password: '1234567' }, TEST_SCRYPT_N)).rejects.toBeInstanceOf(
        SeedUserError,
      )
      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(0)
    })
  })
})

describe('셋 다 말한다 · 비밀번호는 안 말한다', () => {
  const PASSWORD = 'MARKER-seed-password-9c31ff'

  it('건너뛴 갈래도 한 줄을 낸다 — 조용히 넘어가지 않는다', async () => {
    await withApi(async ({ db }) => {
      const sink = collect()
      expect(await runSeedStep(db, {}, TEST_SCRYPT_N, sink.report)).toBe(true)
      expect(sink.text()).not.toBe('')
      expect(sink.text()).toMatch(/건너뜀/)
      expect(sink.text()).toContain('SEED_USER_EMAIL')
    })
  })

  it('만든 갈래와 이미 있는 갈래가 서로 다른 말을 한다', async () => {
    await withApi(async ({ db }) => {
      const env = { SEED_USER_EMAIL: 'seed@example.com', SEED_USER_PASSWORD: PASSWORD }

      const first = collect()
      expect(await runSeedStep(db, env, TEST_SCRYPT_N, first.report)).toBe(true)
      const second = collect()
      expect(await runSeedStep(db, env, TEST_SCRYPT_N, second.report)).toBe(true)

      expect(first.text()).not.toBe(second.text())
      expect(first.text()).toContain('seed@example.com')
      expect(second.text()).toContain('seed@example.com')
    })
  })

  it('만든 갈래의 출력에 비밀번호가 없다', async () => {
    await withApi(async ({ db }) => {
      const sink = collect()
      await runSeedStep(db, { SEED_USER_EMAIL: 'seed@example.com', SEED_USER_PASSWORD: PASSWORD }, TEST_SCRYPT_N, sink.report)
      expect(sink.text()).toContain('seed@example.com') // 출력이 실제로 있었는지부터 — 공허한 통과 방지
      expect(sink.text()).not.toContain(PASSWORD)
    })
  })

  it.each([
    ['짧은 비밀번호', { SEED_USER_EMAIL: 'seed@example.com', SEED_USER_PASSWORD: 'short' }],
    ['나쁜 이메일', { SEED_USER_EMAIL: '골뱅이없음', SEED_USER_PASSWORD: 'MARKER-seed-password-9c31ff' }],
    ['비밀번호만', { SEED_USER_PASSWORD: 'MARKER-seed-password-9c31ff' }],
  ])('실패한 갈래(%s)의 출력에도 비밀번호가 없다 — 그리고 `false`다', async (_label, env) => {
    await withApi(async ({ db }) => {
      const sink = collect()
      expect(await runSeedStep(db, env, TEST_SCRYPT_N, sink.report)).toBe(false)
      expect(sink.text()).toMatch(/마이그레이션은 올렸고/) // 무엇이 됐고 무엇이 안 됐는지 말한다
      expect(sink.text()).not.toContain(env.SEED_USER_PASSWORD)
      expect(sink.text()).not.toContain('short')
    })
  })

  it('결과 셋의 문장이 전부 다르다', () => {
    const said = [
      describeSeedOutcome({ kind: 'skipped' }),
      describeSeedOutcome({ kind: 'created', email: 'a@example.com' }),
      describeSeedOutcome({ kind: 'already-exists', email: 'a@example.com' }),
    ]
    expect(new Set(said).size).toBe(3)
    expect(said.every((line) => line.trim() !== '')).toBe(true)
  })
})

describe('시딩한 계정은 로그인된다', () => {
  it('시딩 → 로그인 → `/api/auth/me` 가 한 줄로 이어진다', async () => {
    await withApi(async ({ app, db }) => {
      await seedUser(db, { email: 'seed@example.com', name: '시딩계정', password: 'password1234' }, TEST_SCRYPT_N)

      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'seed@example.com', password: 'password1234' },
      })
      expect(login.statusCode).toBe(200)
      const token = login.cookies.find((c) => c.name === 'wb_session')?.value
      expect(token).toBeTruthy()

      const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { wb_session: token as string } })
      expect(me.statusCode).toBe(200)
      expect(me.json()).toMatchObject({ email: 'seed@example.com', name: '시딩계정' })
    })
  })

  it('대소문자가 달라도 로그인된다 — 양쪽이 같은 정규화를 쓴다', async () => {
    await withApi(async ({ app, db }) => {
      await seedUser(db, { email: 'Seed@Example.COM', name: '시딩계정', password: 'password1234' }, TEST_SCRYPT_N)
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'SEED@example.com', password: 'password1234' },
      })
      expect(login.statusCode).toBe(200)
    })
  })

  /**
   * **경계값을 양쪽에서 함께 잰다.** 시딩이 로그인보다 넓으면 *"만들어졌는데 못 쓰는
   * 계정"*이 남는다 — 그 갈림은 규격이 두 벌이 되는 순간에만 생기므로 규격 자체를 잰다.
   */
  it.each([
    ['7자', 'a'.repeat(7), false],
    ['8자', 'a'.repeat(8), true],
    ['200자', 'a'.repeat(200), true],
    ['201자', 'a'.repeat(201), false],
  ])('비밀번호 %s 를 시딩과 로그인이 같게 판정한다', (_label, password, ok) => {
    expect([NewPassword.safeParse(password).success, LoginPassword.safeParse(password).success]).toEqual([ok, ok])
  })

  /**
   * **위의 규격 비교보다 강한 자다.** 저것은 규격 객체(`NewPassword` · `LoginPassword`)를 직접 물어
   * 보므로, 누군가 `seed-user.ts` 에 **자기 규격을 새로 적으면**(공유를 끊으면) 통과한
   * 채로 갈린다 — 시딩이 5자를 받고 로그인이 400 을 내는 계정이 그렇게 생긴다.
   *
   * 그래서 여기서는 **실제로 시딩해 보고 실제로 로그인해 본다**: 시딩이 받은 비밀번호는
   * 로그인도 받아야 하고, 시딩이 거절한 것은 로그인도 거절해야 한다. 길이를 훑는 이유는
   * 경계가 어디로 옮겨가든 걸리게 하기 위해서다.
   */
  it.each([4, 6, 7, 8, 9, 20])('비밀번호 %i자 — 시딩이 받으면 로그인도 받는다', async (length) => {
    await withApi(async ({ app, db }) => {
      const email = `len${length}@example.com`
      const password = 'a'.repeat(length)

      let seeded = true
      try {
        await seedUser(db, { email, name: '길이검증', password }, TEST_SCRYPT_N)
      } catch (error) {
        if (!(error instanceof SeedUserError)) throw error
        seeded = false
      }

      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })

      // 시딩됐으면 200, 안 됐으면 400(본문 검증) — 어느 쪽이든 **"만들어졌는데 못 쓰는"**
      // 조합(시딩 성공 + 로그인 400)이 나오면 안 된다.
      expect({ seeded, login: login.statusCode }).toEqual(seeded ? { seeded: true, login: 200 } : { seeded: false, login: 400 })
    })
  })

  it('시딩이 쓰는 이름 규격이 곧 `users.name` 이 받는 것이다', () => {
    expect(DisplayName.safeParse('').success).toBe(false)
    expect(DisplayName.safeParse('가'.repeat(80)).success).toBe(true)
    expect(DisplayName.safeParse('가'.repeat(81)).success).toBe(false)
  })
})

describe('시딩은 마이그레이션이 아니다', () => {
  const MIGRATIONS_DIR = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))

  /**
   * **옛 행을 새 표로 옮기는 마이그레이션은 행을 넣는다** — 계정이 아니라 그 표의 행이다. 파일 이름과 그 파일이 넣을 수 있는 표 하나를 적고,
   * 그 파일의 삽입이 전부 그 표인지(그리고 계정 · 시딩 글자가 없는지)를 잰다. `0024-modules` 는 `presets` 행마다 모듈 하나를 짓는다.
   */
  const DATA_MOVES: Record<string, string> = { '0024-modules.ts': 'modules' }

  function onlyInsertsInto(source: string, table: string): boolean {
    if (/insertInto\(|seed-user|seedUser/i.test(source)) return false
    const targets = [...source.matchAll(/INSERT\s+INTO\s+([a-z_]+)/gi)].map((match) => match[1]!.toLowerCase())
    return targets.length > 0 && targets.every((target) => target === table)
  }

  it('마이그레이션 파일 어디에도 행 삽입이 없다 — `migrate:down` 이 계정을 데려가지 않는다', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.ts') && name !== 'index.ts')
    expect(files.length).toBeGreaterThan(5) // 분모가 헛돌면 아래 단언이 공허하다

    const offenders = files.filter((name) => {
      const source = readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
      if (name in DATA_MOVES) return !onlyInsertsInto(source, DATA_MOVES[name]!)
      return /insertInto\(|INSERT\s+INTO|seed-user|seedUser/i.test(source)
    })
    expect(offenders).toEqual([])
    // 허락한 파일이 실제로 있고 그 표의 삽입을 든다 — 이름이 바뀌어 허락이 헛돌면 여기서 죽는다.
    for (const [name, table] of Object.entries(DATA_MOVES)) {
      expect(files, name).toContain(name)
      expect(onlyInsertsInto(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'), table), name).toBe(true)
    }
  })

  it('`migrateToLatest` 는 환경변수가 있어도 계정을 안 만든다 — 부르는 자는 CLI 다', async () => {
    // 이 DB는 `global-setup`이 이미 최신까지 올려 뒀다. 그래도 한 번 더 부르는 것은
    // 안전하다(올릴 것이 없으면 아무것도 안 한다) — 재려는 것은 "이 함수가 계정에
    // 손을 대는가"이지 마이그레이션 결과가 아니다.
    const db = getTestDb()
    const before = await db.selectFrom('users').select('id').execute()

    process.env.SEED_USER_EMAIL = 'never-seeded-by-migrator@example.com'
    process.env.SEED_USER_PASSWORD = 'password1234'
    try {
      await migrateToLatest(db)
    } finally {
      delete process.env.SEED_USER_EMAIL
      delete process.env.SEED_USER_PASSWORD
    }

    expect(await db.selectFrom('users').select('id').execute()).toHaveLength(before.length)
    const seeded = await db.selectFrom('users').select('id').where('email', '=', 'never-seeded-by-migrator@example.com').execute()
    expect(seeded).toEqual([])
  })
})
