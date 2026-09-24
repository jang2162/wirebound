/**
 * **사용자 행을 만드는 자리 인구조사 — *"계정을 만드는 길은 하나다"*를 드는 자.**
 *
 * **이 파일이 없으면 변이 셋이 살아남는다** — 셋 다 *"변이가 공허하다"*가 아니라
 * **런타임에서 관측이 바뀌는데** 아무도 안 죽는다:
 *
 * - 가입을 `/register` 라는 **다른 이름**으로 되살리면 api 케이스가 **전부 초록인 채**
 *   `POST /api/auth/register` 가 201 을 내고 `users` 가 하나 는다. `auth-routes.test.ts`
 *   의 404 셋이 드는 것은 **성질이 아니라 글자**다 — `/signup` 이라는 이름 하나만 본다.
 *   사용자가 시킨 것은 *"회원 가입 기능 없애기"*이지 *"그 경로 하나 지우기"*가 아니다.
 * - `migrate.ts` 의 `direction === 'latest'` 를 지우면 `migrate:down` 이 계정을 만드는데
 *   **아무도 안 죽는다**(아래 「`migrate:down` 은 계정을 안 건드린다」 묶음이 닫는다).
 * - 픽스처가 `seedUser` 를 안 지나고 직접 삽입해도 **아무도 안 죽는다**(아래 「픽스처가
 *   프로덕션 경로를 지난다」 묶음이 닫는다).
 *
 * **목록을 손으로 적지 않는다.** 분모는 `source-census.ts` 가 `src/` 전체를 재귀로 훑어
 * 만들고, **주석을 걷은 뒤에 센다**(`stripComments`) — 안 걷으면 *"옳은 줄을 주석에
 * 남기고 아래에서 뒤집는"* 우회가 통째로 지나간다.
 *
 * **왜 층마다 세는가.** 한 층만 재면 그 위로 우회할 수 있다 — `insertUser` 만 재면 새
 * 라우트가 `seedUser` 를 부르면 되고, `seedUser` 만 재면 raw SQL 을 쓰면 된다. 그래서
 * **SQL → repo → 시딩 → CLI 사슬 전체**를 층마다 잠근다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { seedAfterMigration } from '../src/db/migrate'
import { callSitesByFile, SRC_ROOT, sourceFiles, stripComments } from './source-census'
import { withApi } from './helpers'

/** `src/` 의 파일 하나를 **주석을 걷어** 읽는다. */
function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(SRC_ROOT, relative), 'utf8'))
}

/** 그 글자를 **주석 밖에서** 든 `src/` 파일 전부. */
function filesContaining(needle: string): string[] {
  return sourceFiles().filter((relative) => sourceOf(relative).includes(needle))
}

/** `callSitesByFile` 를 단언하기 좋은 평범한 객체로. */
function callSites(name: string): Record<string, number> {
  return Object.fromEntries([...callSitesByFile(name)].sort())
}

describe('분모가 헛돌지 않는다 — 카나리아', () => {
  it('`src/` 를 실제로 훑는다', () => {
    // 분모가 비면 아래가 빈 문자열에서 초록이 된다 — 그 부류를 막는다.
    expect(sourceFiles().length).toBeGreaterThan(30)
    expect(sourceFiles()).toContain('db/seed-user.ts')
    expect(sourceFiles()).toContain('repos/users.ts')
  })

  it('없는 이름으로 세면 아무것도 안 나온다 — 정규식이 아무거나 맞추지 않는다', () => {
    expect(callSites('절대없는함수이름')).toEqual({})
  })

  it('**주석을 실제로 걷는다** — 안 걷으면 아래 표가 통째로 무의미하다', () => {
    // `insertUser` 를 **주석으로만** 언급하는 파일이 있다. 그것들이 호출자로 세어지면
    // 안 된다 — 아래 단언이 *"언급한 파일 > 호출자"*로 그 차이를 잰다.
    const mentionedAnywhere = sourceFiles().filter((relative) =>
      readFileSync(join(SRC_ROOT, relative), 'utf8').includes('insertUser'),
    )
    expect(mentionedAnywhere.length).toBeGreaterThan(Object.keys(callSites('insertUser')).length)
  })
})

describe('계정을 만드는 사슬 — 층마다 호출자가 하나다', () => {
  it('`users` 에 INSERT 하는 SQL 은 `repos/users.ts` 한 곳이다', () => {
    expect(filesContaining("insertInto('users')")).toEqual(['repos/users.ts'])
  })

  it('**`insertUser` 를 부르는 자는 `db/seed-user.ts` 하나다** — 이름을 바꾼 가입도 여기서 걸린다', () => {
    // 이름이 무엇이든(`/signup`·`/register`·`POST /api/users`) 계정을 만들려면 이 사슬을
    // 지나야 한다. 새 호출자가 생기면 여기서 죽는다.
    expect(callSites('insertUser')).toEqual({ 'db/seed-user.ts': 1 })
  })

  it('`seedUser`·`seedUserFromEnv` 를 부르는 자도 `db/seed-user.ts` 안뿐이다', () => {
    // 한 층 위로 우회하는 길(`seedUser` 를 라우트가 부르는 것)을 막는다.
    expect(callSites('seedUser')).toEqual({ 'db/seed-user.ts': 1 })
    expect(callSites('seedUserFromEnv')).toEqual({ 'db/seed-user.ts': 1 })
  })

  it('`runSeedStep`·`seedAfterMigration` 을 부르는 자는 `db/migrate.ts` **한 번씩**이다', () => {
    // 파일이 아니라 **횟수**까지 고정한다 — 같은 파일 안에 두 번째 시딩 경로가 생기는
    // 것도 막아야 한다.
    expect(callSites('runSeedStep')).toEqual({ 'db/migrate.ts': 1 })
    expect(callSites('seedAfterMigration')).toEqual({ 'db/migrate.ts': 1 })
  })

  it('비밀번호를 해시하는 자는 시딩과 로그인의 더미 해시 둘뿐이다', () => {
    // `routes/auth.ts` 의 1건은 타이밍 방어용 `dummyHash` 다. 라우트가 비밀번호를 한 번
    // 더 해시하기 시작하면(=자격을 받는 새 표면) 그 수가 늘고 여기서 죽는다.
    expect(callSites('hashPassword')).toEqual({ 'db/seed-user.ts': 1, 'routes/auth.ts': 1 })
  })
})

describe('`migrate:down` 은 계정을 안 건드린다', () => {
  const ENV = { SEED_USER_EMAIL: 'downtest@example.com', SEED_USER_PASSWORD: 'password1234' }
  const TEST_SCRYPT_N = 1024

  function sink(): { report: { log: (l: string) => void; error: (l: string) => void }; text: () => string } {
    const lines: string[] = []
    return { report: { log: (l) => lines.push(l), error: (l) => lines.push(l) }, text: () => lines.join('\n') }
  }

  it('`down` 이면 시딩이 아예 안 돈다 — 행도 없고 말도 없다', async () => {
    await withApi(async ({ db }) => {
      const out = sink()
      expect(await seedAfterMigration('down', db, ENV, TEST_SCRYPT_N, out.report)).toBe(true)

      expect(await db.selectFrom('users').selectAll().execute()).toHaveLength(0)
      expect(out.text()).toBe('')
    })
  })

  it('`latest` 면 돈다 — 대조. 이것이 없으면 위 케이스는 "아무것도 안 하는 함수"로도 통과한다', async () => {
    await withApi(async ({ db }) => {
      const out = sink()
      expect(await seedAfterMigration('latest', db, ENV, TEST_SCRYPT_N, out.report)).toBe(true)

      const rows = await db.selectFrom('users').select('email').execute()
      expect(rows).toEqual([{ email: 'downtest@example.com' }])
      expect(out.text()).toContain('downtest@example.com')
    })
  })

  it('**CLI 가 자기 `direction` 을 그대로 넘긴다** — 그 자리에 `latest` 를 박으면 위 자가 잠든다', () => {
    // 위 두 케이스는 함수를 직접 부르므로 **호출부가 무엇을 넘기는지는 못 본다.**
    // 그 한 줄만 소스에서 센다(`screen-renderer-census.test.ts` 와 같은 결이다).
    expect(sourceOf('db/migrate.ts')).toContain('seedAfterMigration(direction,')
  })
})

describe('픽스처가 프로덕션 경로를 지난다', () => {
  const HELPERS = stripComments(readFileSync(new URL('./helpers.ts', import.meta.url), 'utf8'))

  /**
   * **행동으로는 못 잰다 — 그래서 소스를 센다.** 픽스처가 `seedUser` 를 부르든
   * `hashPassword` + `insertUser` 를 직접 부르든 **만들어지는 행이 같다**(같은 두 줄이다).
   * 관측이 갈리지 않으므로 어떤 행동 케이스도 그 둘을 구분할 수 없다.
   *
   * 그런데 `helpers.ts` 의 `signup` 머리말은 *"계정을 만드는 프로덕션 경로는 `seedUser` 이고
   * 픽스처가 그것을 그대로 부른다"*를 **근거로** 적는다. 그 문장을 지키는 것이 이 케이스다.
   */
  it('`helpers.ts` 가 `seedUser` 를 부른다', () => {
    expect(HELPERS).toContain('seedUser(')
    expect(HELPERS).toMatch(/import \{[^}]*seedUser[^}]*\} from '\.\.\/src\/db\/seed-user'/)
  })

  it('그리고 그 아래 층을 **건너뛰지 않는다** — 직접 삽입·직접 해시가 없다', () => {
    expect(HELPERS).not.toContain("insertInto('users')")
    expect(HELPERS).not.toContain('insertUser(')
    expect(HELPERS).not.toContain('hashPassword(')
  })
})

/**
 * **수를 산문에 적기 전에 케이스가 들 수 있는지 본다.**
 *
 * *"`helpers.ts` 에서 `signup` 을 import 하는 파일 수"*를 한 줄 grep 으로 세면 **틀린다** —
 * `import { … } from './helpers'` 가 **여러 줄에 걸친** 파일을 놓친다.
 *
 * 그래서 **수를 적는 대신 성질을 든다** — *"`signup` 을 든 테스트 파일은 전부 그것을
 * 픽스처에서 가져온다"*. 수를 박지 않으므로 파일이 늘어도 안 낡고, 누가 픽스처를 안
 * 지나는 두 번째 길을 만들면 죽는다.
 *
 * **«든다» · «가져온다» 둘 다 주석을 걷은 소스로 잰다**(`stripComments`) — 원문으로 재면 주석 속
 * `import { signup } from './helpers'` 가 픽스처로 읽혀 지역 `signup` 을 쓰는 파일이 초록이다.
 *
 * **못 보는 것 — 글자로 재는 자의 한계다.** 이 자는 «파일이 그 import 글자를 가졌나»만 보고, 쓰는 `signup` 이
 * 그 import 의 것인지는 안 본다. 그래서 셋이 지역 `signup` 을 쓰면서 초록이다: ① 안 불리는 함수 안의
 * `const { signup } = await import('./helpers')`(죽은 스코프) ② `import { signup as fixture } from './helpers'`(별칭 —
 * 가져온 이름은 `fixture` 인데 `signup` 글자가 든다) ③ 문자열 속의 import 글자. 주석은 파서가 걷지만(`stripComments` —
 * `@wirebound/test-support`) 이 셋은 그대로다 — 걷는 것은 주석뿐이라 스코프 · 별칭 · 문자열을 안 본다(① · ③을 심어
 * 쟀다: 둘 다 초록). 닫으려면 import 선언을 구문 트리로 읽고 쓰이는 `signup` 을 그 바인딩에 묶어야 한다 — 이 자를 한 판
 * 더 짓지 않는다.
 */
describe('`signup` 을 든 테스트는 전부 픽스처를 지난다', () => {
  const TEST_ROOT = fileURLToPath(new URL('.', import.meta.url))

  /**
   * **자기 자신은 뺀다.** 이 파일은 `signup` 이라는 낱말을 케이스 제목과 설명으로 들면서
   * 픽스처를 안 쓴다 — 재는 자가 분모에 들어가면 자기 때문에 죽는다
   * (`write-path-invariant.test.ts` 가 정의 파일을 빼는 것과 같은 자리다).
   * **빼는 것은 이 하나뿐이고, 그렇다는 것도 아래에서 단언한다.**
   */
  const SELF = 'user-creation-census.test.ts'

  const testFiles = sourceFiles(TEST_ROOT).filter((name) => name.endsWith('.test.ts') && name !== SELF)

  /**
   * `import … from './helpers'` 문장 전문. **여러 줄에 걸친 것을 이어서** 잡는다. 동적 적재의 구조 분해
   * (`const { … } = await import('./helpers')` — 모듈 목을 먹이려고 `vi.resetModules()` 뒤에 다시 적재하는 파일)도 같은 픽스처다.
   * 그 꼴은 중괄호 안에 중괄호가 없는 것만 잡는다(`[^}]*` — 게으른 `[\s\S]*?`면 앞의 다른 `const {`부터 삼킨다).
   */
  const HELPERS_IMPORT =
    /import\s+(?:type\s+)?\{[\s\S]*?\}\s*from\s+'\.\/helpers'|const\s+\{[^}]*\}\s*=\s*await\s+import\(\s*'\.\/helpers'\s*\)/g

  /** **주석을 걷은** 소스를 받는다(위 머리말). */
  function importsSignupFixture(stripped: string): boolean {
    return [...stripped.matchAll(HELPERS_IMPORT)].some((match) => /\bsignup\b/.test(match[0]))
  }

  it('분모가 헛돌지 않는다 — 파일도 여러 줄 import 도 실제로 있다', () => {
    expect(testFiles.length).toBeGreaterThan(50)
    const multiline = testFiles.filter((name) => {
      const source = readFileSync(join(TEST_ROOT, name), 'utf8')
      return [...source.matchAll(HELPERS_IMPORT)].some((match) => match[0].includes('\n'))
    })
    // 한 줄 grep 이 놓치는 바로 그 부류가 실재한다는 것을 먼저 세운다.
    expect(multiline.length).toBeGreaterThan(10)
  })

  it('`signup` 을 든 파일 집합 == 픽스처에서 가져오는 파일 집합', () => {
    const mentions: string[] = []
    const imports: string[] = []
    for (const name of testFiles) {
      const stripped = stripComments(readFileSync(join(TEST_ROOT, name), 'utf8'))
      if (/\bsignup\b/.test(stripped)) mentions.push(name)
      if (importsSignupFixture(stripped)) imports.push(name)
    }
    expect(mentions.length).toBeGreaterThan(40)
    // 집합으로 단언한다 — 어느 파일이 어긋났는지 실패 메시지가 그대로 말한다.
    expect(mentions).toEqual(imports)
  })

  it('분모에서 뺀 것은 이 파일 하나다 — 예외를 늘려 자를 재우는 길을 막는다', () => {
    const all = sourceFiles(TEST_ROOT).filter((name) => name.endsWith('.test.ts'))
    expect(all.filter((name) => !testFiles.includes(name))).toEqual([SELF])
  })
})
