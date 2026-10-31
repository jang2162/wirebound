/**
 * **사용자 행을 만드는 자리 인구조사 — *"계정을 만드는 길은 둘이다"*를 드는 자.**
 *
 * 둘은 서버 운영자의 시딩(`db/seed-user.ts` — 마이그레이션 뒤)과 관리자가 만든 초대 링크로 하는 가입(`repos/invites.ts` 의
 * `signupWithInvite` ← `routes/invite-signup.ts`)이다(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «비목표» — 링크 없이
 * 계정을 만드는 웹 · API 길은 두지 않는다).
 *
 * **이 파일이 없으면 변이 셋이 살아남는다** — 셋 다 *"변이가 공허하다"*가 아니라
 * **런타임에서 관측이 바뀌는데** 아무도 안 죽는다:
 *
 * - 링크 없는 가입을 `/register` 라는 **다른 이름**으로 세우면 api 케이스가 **전부 초록인 채**
 *   `POST /api/auth/register` 가 201 을 내고 `users` 가 하나 는다. `auth-routes.test.ts`
 *   의 404 셋이 드는 것은 **성질이 아니라 글자**다 — `/signup` 이라는 이름 하나만 본다.
 *   지키는 것은 *"링크 없이는 계정이 안 생긴다"*이지 *"그 경로 하나가 없다"*가 아니다.
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
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
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
    const mentionedAnywhere = sourceFiles().filter((relative) => readFileSync(join(SRC_ROOT, relative), 'utf8').includes('insertUser'))
    expect(mentionedAnywhere.length).toBeGreaterThan(Object.keys(callSites('insertUser')).length)
  })
})

describe('계정을 만드는 사슬 — 층마다 호출자가 정해져 있다', () => {
  it('`users` 에 INSERT 하는 SQL 은 `repos/users.ts` 한 곳이다', () => {
    expect(filesContaining("insertInto('users')")).toEqual(['repos/users.ts'])
  })

  it('**`insertUser` 를 부르는 자는 시딩과 초대 가입 둘이다** — 이름을 바꾼 셋째 길도 여기서 걸린다', () => {
    // 이름이 무엇이든(`/signup`·`/register`·`POST /api/users`) 계정을 만들려면 이 사슬을
    // 지나야 한다. 새 호출자가 생기면 여기서 죽는다.
    expect(callSites('insertUser')).toEqual({ 'db/seed-user.ts': 1, 'repos/invites.ts': 1 })
  })

  it('초대 가입의 몸통(`signupWithInvite`)을 부르는 자는 가입 라우트 하나다 — 링크를 건너뛰는 호출자가 없다', () => {
    // 링크 행을 잡고 쓸 수 있는지 본 뒤에야 `insertUser` 에 닿는다(`repos/invites.ts`). 그 함수를 부르는 둘째 자리가 생기면 여기서 죽는다.
    expect(callSites('signupWithInvite')).toEqual({ 'routes/invite-signup.ts': 1 })
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

  it('비밀번호를 해시하는 자는 시딩 · 재설정 명령 · 로그인의 더미 해시 · 비밀번호 바꾸기 · 초대 가입 · 재설정 링크 여섯뿐이다', () => {
    // `routes/auth.ts` 의 2건은 타이밍 방어용 `dummyHash` 와 `/password`(로그인한 사람이 지금 비밀번호를 견준 뒤 — 로그인 한도에 센다)다.
    // `db/reset-password.ts` 는 서버에 손이 닿는 사람의 CLI 다. 초대 가입 · 재설정 링크는 관리자가 만든 링크 원문을 쥔 요청이다(로그인 한도에
    // 센다). 라우트가 비밀번호를 한 번 더 해시하기 시작하면(=자격을 받는 새 표면) 그 수가 늘고 여기서 죽는다.
    expect(callSites('hashPassword')).toEqual({
      'db/reset-password.ts': 1,
      'db/seed-user.ts': 1,
      'routes/auth.ts': 2,
      'routes/invite-signup.ts': 1,
      'routes/password-reset.ts': 1,
    })
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
    expect(sourceOf('db/migrate.ts')).toMatch(/\bseedAfterMigration\s*\(\s*direction\s*,/)
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
    expect(HELPERS).toMatch(/\bseedUser\s*\(/)
    expect(HELPERS).toMatch(/import \{[^}]*seedUser[^}]*\} from '\.\.\/src\/db\/seed-user'/)
  })

  it('그리고 그 아래 층을 **건너뛰지 않는다** — 직접 삽입·직접 해시가 없다', () => {
    // **글자가 아니라 정규식이다** — 걷은 주석은 공백으로 남으므로(`insertUser /* 직접 */ (` → `insertUser        (`)
    // 글자 `insertUser(` 로 재면 주석 하나 · 줄바꿈 하나로 비켜 간다.
    expect(HELPERS).not.toMatch(/\binsertInto\s*\(\s*['"`]users['"`]\s*\)/)
    expect(HELPERS).not.toMatch(/\binsertUser\s*\(/)
    expect(HELPERS).not.toMatch(/\bhashPassword\s*\(/)
  })
})

/**
 * **수를 산문에 적기 전에 케이스가 들 수 있는지 본다.**
 *
 * *"`helpers.ts` 에서 `signup` 을 import 하는 파일 수"*를 한 줄 grep 으로 세면 **틀린다** —
 * `import { … } from './helpers'` 가 **여러 줄에 걸친** 파일을 놓친다.
 *
 * 그래서 **수를 적는 대신 성질을 든다** — *"테스트가 쓰는 `signup` 은 전부 픽스처의 것이다"*. 수를 박지 않으므로
 * 파일이 늘어도 안 낡고, 누가 `signup` 이라는 이름으로 픽스처를 안 지나는 두 번째 길을 만들면 죽는다(다른 이름의 길은
 * 아래 «못 보는 것»).
 *
 * **글자가 아니라 바인딩으로 잰다.** 쓰이는 `signup` 이름 하나하나를 TypeScript 검사기로 선언에 묶고
 * (`getSymbolAtLocation`), 그 선언이 `./helpers` 의 `signup` 을 가져오는 자리인지 본다 — 정적 import 의 지정자이거나
 * `const { signup } = await import('./helpers')`(모듈 목을 먹이려고 `vi.resetModules()` 뒤에 다시 적재하는 파일)의
 * 구조 분해다. 지정자는 **그 파일 자리에서 풀어** `test/helpers` 인지 보고, 구조 분해는 **`const` 만** 받는다 — 검사기는
 * 값이 아니라 선언을 주므로 `let` · `var` 로 받은 뒤 지역 함수를 넣는 꼴이 선언만 보고 지나간다. 글자로 재면 «파일이 그 import 글자를 가졌나»만 보여서, 지역 `signup` 을 쓰면서 초록인 꼴이 셋 있었다 —
 * 안 불리는 함수 안의 동적 import(죽은 스코프) · `import { signup as fixture }`(별칭) · 문자열 속의 import 글자.
 * 셋 다 쓰이는 이름이 지역 선언에 묶이므로 여기서 죽는다(아래 «술어가 실제로 가른다»). 주석 · 문자열은 구문 트리에
 * 이름으로 안 나오므로 걷을 것도 없다.
 *
 * **모듈 목은 목을 거는 자리를 센다** — `vi.mock` · `vi.doMock` 이 `./helpers` 를 겨누면 그 줄이 픽스처가 아닌 자리다. 그 뒤의
 * `signup` 은 구문상 픽스처에 묶이지만 값은 목이기 때문이다.
 *
 * **못 보는 것 — 셋은 거짓 초록 쪽이다:**
 * - **속성으로 부르는 `signup`** — `h.signup(…)`(네임스페이스) · `api.signup(…)`(지역 객체)은 이름이 아니라 속성이라
 *   세지 않는다(픽스처로도 위반으로도).
 * - **다른 이름의 길** — `register()` 가 `users` 에 직접 넣어도 이 자는 `signup` 이라는 이름만 본다.
 * - **`helpers.ts` 안의 다시 내보내기** — 모듈을 풀지 않으므로 `helpers.ts` 가 `export { signup } from '…'` 로 다른 모듈의
 *   함수를 내보내도 픽스처로 읽힌다. `helpers.ts` 자신이 `seedUser` 를 지나는지는 «픽스처가 프로덕션 경로를 지난다»가
 *   그 파일의 글자로만 본다.
 *
 * `eval` · 조립한 이름처럼 구문 트리에 이름이 안 나오는 호출도 못 본다. 다른 모듈이 `./helpers` 를 다시 내보내고 거기서
 * 가져오면 선언이 `test/helpers` 가 아니라 죽는다(거짓 빨강 쪽).
 */
describe('테스트가 쓰는 `signup` 은 전부 픽스처의 것이다', () => {
  const TEST_ROOT = fileURLToPath(new URL('.', import.meta.url))
  const testFiles = sourceFiles(TEST_ROOT).filter((name) => name.endsWith('.test.ts'))

  /** 파일 이름 → 원문을 한 프로그램으로 읽는다. 모듈은 풀지 않는다 — 가져온 이름은 지정자 선언에서 멈춘다. */
  function programOf(sources: Map<string, string>): ts.Program {
    const options: ts.CompilerOptions = { noResolve: true, noLib: true, types: [], target: ts.ScriptTarget.Latest }
    const host = ts.createCompilerHost(options)
    host.getSourceFile = (name, target) => {
      const text = sources.get(name)
      return text === undefined ? undefined : ts.createSourceFile(name, text, target, true, ts.ScriptKind.TS)
    }
    host.fileExists = (name) => sources.has(name)
    host.readFile = (name) => sources.get(name)
    return ts.createProgram({ rootNames: [...sources.keys()], options, host })
  }

  /**
   * 그 지정자가 **그 파일에서 풀었을 때** `test/helpers` 인가. 글자 `'./helpers'` 만 보면 하위 디렉터리의 테스트가 자기 옆의
   * 다른 `helpers.ts` 를 가져와도 픽스처로 읽힌다(분모가 하위 디렉터리까지 훑는다).
   */
  function isHelpersModule(specifier: ts.Expression, fileName: string): boolean {
    return ts.isStringLiteral(specifier) && posix.join(posix.dirname(fileName), specifier.text) === 'helpers'
  }

  /** 그 선언이 `./helpers` 의 `signup` 을 가져오는 자리인가 — 정적 지정자 · 동적 import 의 `const` 구조 분해. */
  function isFixture(declaration: ts.Declaration): boolean {
    const fileName = declaration.getSourceFile().fileName
    if (ts.isImportSpecifier(declaration)) {
      const module = declaration.parent.parent.parent.moduleSpecifier
      return (declaration.propertyName ?? declaration.name).text === 'signup' && isHelpersModule(module, fileName)
    }
    if (ts.isBindingElement(declaration)) {
      const imported = declaration.propertyName ?? declaration.name
      const variable = declaration.parent.parent
      if (!ts.isIdentifier(imported) || imported.text !== 'signup' || !ts.isVariableDeclaration(variable)) return false
      // **`const` 만 픽스처다.** `let` · `var` 는 선언이 픽스처여도 뒤에 지역 값을 넣을 수 있고, 검사기는 값이 아니라
      // 선언을 준다 — `let { signup } = await import('./helpers')` 뒤 `signup = rawSignup` 이 초록으로 지난다.
      if ((variable.parent.flags & ts.NodeFlags.Const) === 0) return false
      const awaited = variable.initializer
      const call = awaited !== undefined && ts.isAwaitExpression(awaited) ? awaited.expression : undefined
      const [specifier] = call !== undefined && ts.isCallExpression(call) ? call.arguments : []
      return (
        call !== undefined &&
        ts.isCallExpression(call) &&
        call.expression.kind === ts.SyntaxKind.ImportKeyword &&
        specifier !== undefined &&
        isHelpersModule(specifier, fileName)
      )
    }
    return false
  }

  /**
   * `vi.mock` · `vi.doMock` 이 `./helpers` 를 겨누는 자리인가 — 그 뒤의 `signup` 은 구문상 픽스처에 묶여도 값은 목이다.
   * 지정자는 문자열이거나 `import('./helpers')` 다. **일부만 덮는 목도 센다**(`signup` 을 원래 것으로 둔 목 — 거짓 빨강 쪽).
   */
  function mocksHelpers(node: ts.Node, fileName: string): boolean {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
    const { expression: target, name: method } = node.expression
    if (!ts.isIdentifier(target) || target.text !== 'vi' || (method.text !== 'mock' && method.text !== 'doMock')) return false
    const [first] = node.arguments
    const specifier =
      first !== undefined && ts.isCallExpression(first) && first.expression.kind === ts.SyntaxKind.ImportKeyword
        ? first.arguments[0]
        : first
    return specifier !== undefined && isHelpersModule(specifier, fileName)
  }

  /** 그 `signup` 이 **쓰이는** 자리인가 — 선언의 이름 · 속성 이름 · 가져오는 지정자의 이름은 뺀다. */
  function isUse(name: ts.Identifier): boolean {
    const parent = name.parent
    if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false
    if (ts.isBindingElement(parent)) return false
    if (ts.isShorthandPropertyAssignment(parent)) return true
    return !(
      (ts.isPropertyAccessExpression(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isMethodSignature(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) ||
        ts.isVariableDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isClassDeclaration(parent)) &&
      parent.name === name
    )
  }

  /** 파일마다 쓰이는 `signup` 의 자리 — `fixture` 는 그 이름이 `./helpers` 의 것에 묶였는가. */
  function signupUses(sources: Map<string, string>): Map<string, { line: number; fixture: boolean }[]> {
    const program = programOf(sources)
    const checker = program.getTypeChecker()
    const found = new Map<string, { line: number; fixture: boolean }[]>()
    for (const name of sources.keys()) {
      const file = program.getSourceFile(name)!
      const uses: { line: number; fixture: boolean }[] = []
      const visit = (node: ts.Node): void => {
        if (mocksHelpers(node, name)) {
          uses.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, fixture: false })
        }
        if (ts.isIdentifier(node) && node.text === 'signup' && isUse(node)) {
          const symbol = ts.isShorthandPropertyAssignment(node.parent)
            ? checker.getShorthandAssignmentValueSymbol(node.parent)
            : checker.getSymbolAtLocation(node)
          const declarations = symbol?.declarations ?? []
          uses.push({
            line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
            fixture: declarations.length > 0 && declarations.every(isFixture),
          })
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
      found.set(name, uses)
    }
    return found
  }

  /** 픽스처가 아닌 `signup` 을 쓰는 자리 — `파일:줄`. */
  function strayUses(sources: Map<string, string>): string[] {
    return [...signupUses(sources)].flatMap(([name, uses]) => uses.filter((use) => !use.fixture).map((use) => `${name}:${use.line}`))
  }

  const REAL = new Map(testFiles.map((name) => [name, readFileSync(join(TEST_ROOT, name), 'utf8')]))

  it('분모가 헛돌지 않는다 — 파일도 픽스처를 쓰는 자리도 실제로 있다', () => {
    expect(testFiles.length).toBeGreaterThan(50)
    const usingFixture = [...signupUses(REAL)].filter(([, uses]) => uses.some((use) => use.fixture))
    expect(usingFixture.length).toBeGreaterThan(40)
  })

  it('쓰이는 `signup` 이 전부 `./helpers` 의 것에 묶인다', () => {
    // 목록으로 단언한다 — 어느 파일 어느 줄이 어긋났는지 실패 메시지가 그대로 말한다.
    expect(strayUses(REAL)).toEqual([])
  })

  it('술어가 실제로 가른다 — 반대편', () => {
    const LOCAL = 'async function signup() { return 1 }\n'
    const verdict = (text: string): string[] => strayUses(new Map([['case.test.ts', text]]))

    // 픽스처 — 한 줄 · 여러 줄 · 동적 적재 · 줄여 쓴 속성.
    expect(verdict("import { signup } from './helpers'\nawait signup()")).toEqual([])
    expect(verdict("import {\n  withApi,\n  signup,\n} from './helpers'\nconst f = { signup }")).toEqual([])
    expect(verdict("const { signup } = await import('./helpers')\nawait signup()")).toEqual([])
    expect(verdict("import { signup as fixture } from './helpers'\nawait fixture()")).toEqual([])

    // 지역 `signup` 을 쓰는 꼴 — 글자로 재면 셋 다 초록이었다.
    expect(verdict(`${LOCAL}async function dead() { const { signup } = await import('./helpers') }\nawait signup()`)).toEqual([
      'case.test.ts:3',
    ])
    expect(verdict(`import { signup as fixture } from './helpers'\n${LOCAL}await signup()`)).toEqual(['case.test.ts:3'])
    expect(verdict(`const note = "import { signup } from './helpers'"\n${LOCAL}await signup()`)).toEqual(['case.test.ts:3'])
    // 가져오기가 아예 없는 꼴.
    expect(verdict(`${LOCAL}await signup()`)).toEqual(['case.test.ts:2'])
    // `let` 으로 받아 지역 함수를 넣는 꼴 — 선언은 픽스처다.
    expect(verdict("const raw = async () => 1\nlet { signup } = await import('./helpers')\nsignup = raw\nawait signup()")).toEqual([
      'case.test.ts:3',
      'case.test.ts:4',
    ])

    // 모듈 목 — 이름은 `./helpers` 의 것에 묶이지만 값은 목이다. 목을 거는 자리를 센다(정적 · 동적 · `import()` 로 준 지정자).
    const MOCKED = "const { signup } = await import('./helpers')\nawait signup()"
    expect(verdict(`vi.doMock('./helpers', () => ({ signup: async () => 1 }))\n${MOCKED}`)).toEqual(['case.test.ts:1'])
    expect(verdict(`vi.mock('./helpers')\nimport { signup } from './helpers'\nawait signup()`)).toEqual(['case.test.ts:1'])
    expect(verdict(`vi.doMock(import('./helpers'), () => ({}))\n${MOCKED}`)).toEqual(['case.test.ts:1'])
    expect(verdict(`vi.doMock('../src/repos/layouts', () => ({}))\n${MOCKED}`)).toEqual([])

    // 지정자는 그 파일 자리에서 푼다 — 하위 디렉터리의 `./helpers` 는 다른 모듈이고 `../helpers` 가 픽스처다.
    const inSub = (text: string): string[] => strayUses(new Map([['sub/case.test.ts', text]]))
    expect(inSub("import { signup } from './helpers'\nawait signup()")).toEqual(['sub/case.test.ts:2'])
    expect(inSub("import { signup } from '../helpers'\nawait signup()")).toEqual([])
    expect(inSub("const { signup } = await import('./helpers')\nawait signup()")).toEqual(['sub/case.test.ts:2'])
  })
})
