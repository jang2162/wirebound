/**
 * **`.env.example` 이 드는 키가 실제와 맞는가.**
 *
 * 이 파일이 없으면 `.env.example`에서 `#TEST_DATABASE_URL=` 줄을 지워도 **저장소 어디도 안 운다.**
 * 그런데 `README.md` 「워크트리를 여럿 띄울 때」 절의 절차는 *"주석 처리되어 있다. 주석을 푼다"*라고 **그 줄의 존재를
 * 전제한다** — 줄이 사라지면 절차가 성립하지 않는데 게이트는 전부 초록이다.
 *
 * **목록을 손으로 적지 않는다.** `src/config.ts`의 `EnvSchema`와 `src/db/seed-user.ts`의
 * `SeedEnvSchema`에서 세고(둘 다 export 되지 않으므로 소스에서 센다 —
 * `screen-renderer-census.test.ts`와 같은 결이다), 남는 하나(`TEST_DATABASE_URL`)는 이
 * 저장소에서 그것을 읽는 자가 `test/test-database-url.ts` 뿐이라 여기서 이름으로 든다.
 *
 * **읽는 자는 셋이다**(서버 · 계정 시딩 · 테스트). 시딩 값은 `migrate`
 * CLI 만 쓰고 서버는 안 쓰므로 `EnvSchema` 에 얹지 않는다 — 서버가 안 쓰는 값 때문에
 * 서버가 안 뜨면 그것대로 잘못이다(`TEST_DATABASE_URL` 과 같은 판정). 그래서 **분모를
 * 두 소스의 합집합으로 넓힌다** — 예외 목록으로 밀어 두면 새 시딩 키가 조용히 빠진다.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const EXAMPLE = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
const CONFIG_SOURCE = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')
const SEED_SOURCE = readFileSync(new URL('../src/db/seed-user.ts', import.meta.url), 'utf8')

/** `.env.example`이 드는 키. 주석으로 든 것(`#KEY=`)도 **든 것으로 친다.** */
function keysInExample(): string[] {
  return [...EXAMPLE.matchAll(/^#?([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1] as string).sort()
}

/** `<이름> = z.object({ ... })` 안에서 대문자 키를 센다. */
function keysInObjectSchema(source: string, name: string): string[] {
  const body = source.split(`const ${name} = z.object({`)[1]?.split('\n})')[0] ?? ''
  return [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] as string).sort()
}

/** **env 를 읽겠다고 선언한 자 전부.** 한 소스만 보면 다른 소스의 새 키가 조용히 빠진다. */
function declaredKeys(): string[] {
  return [...keysInObjectSchema(CONFIG_SOURCE, 'EnvSchema'), ...keysInObjectSchema(SEED_SOURCE, 'SeedEnvSchema')].sort()
}

describe('.env.example 이 무엇을 드나', () => {
  it('센 것이 비어 있지 않다 — 정규식이 헛돌면 아래 표가 통째로 무의미하다', () => {
    // 정규식이 헛돌아 빈 집합으로 초록이 되는 부류를 막는 카나리아다(`shell-css.test.ts`와 같은 부류).
    expect(keysInExample().length).toBeGreaterThan(5)
    expect(keysInObjectSchema(CONFIG_SOURCE, 'EnvSchema').length).toBeGreaterThan(5)
    // 시딩 스키마는 넷뿐이라 분모가 작다 — 그래도 0 이면 정규식이 헛돈 것이다.
    expect(keysInObjectSchema(SEED_SOURCE, 'SeedEnvSchema')).toEqual([
      'SEED_USER_ADMIN',
      'SEED_USER_EMAIL',
      'SEED_USER_NAME',
      'SEED_USER_PASSWORD',
    ])
  })

  it('**읽는 자가 선언한 키를 하나도 빠뜨리지 않는다** — 새 env 를 열고 안 적는 것을 막는다', () => {
    const missing = declaredKeys().filter((key) => !keysInExample().includes(key))
    expect(missing).toEqual([])
  })

  it('아무도 선언하지 않은 키를 드는 것은 `TEST_DATABASE_URL` 하나다', () => {
    // 그것 하나만 예외인 이유: pnpm test 는 루트에서 도는 vitest 라 이 패키지의
    // `--env-file-if-exists` 를 안 지나므로 `test/test-database-url.ts` 가 따로 읽는다.
    const extra = keysInExample().filter((key) => !declaredKeys().includes(key))
    expect(extra).toEqual(['TEST_DATABASE_URL'])
  })

  it('**시딩 값 셋이 전부 값 없이 들어 있다** — 비밀번호 예시를 커밋하지 않는다 (D5)', () => {
    // 이 파일은 저장소에 있다. 여기 값을 적어 두면 그것이 그대로 운영 비밀번호가 되는
    // 길이 열린다 — `.env.example` 을 복사해 쓰는 것이 `README.md` 「세우기 — 다섯 걸음」 절의 첫 걸음이기 때문이다.
    expect(EXAMPLE).toMatch(/^#SEED_USER_EMAIL=$/m)
    expect(EXAMPLE).toMatch(/^#SEED_USER_NAME=$/m)
    expect(EXAMPLE).toMatch(/^#SEED_USER_PASSWORD=$/m)
    expect(EXAMPLE).toMatch(/^#SEED_USER_ADMIN=$/m)
    expect(EXAMPLE).not.toMatch(/^#?SEED_USER_PASSWORD=.+$/m)
  })

  it('워크트리마다 갈라야 하는 값 **넷**이 전부 있다 — README 「워크트리를 여럿 띄울 때」의 절차가 이 줄들을 든다', () => {
    // `POSTGRES_PORT` 가 없으면 워크트리마다 컨테이너를 가르는 길 자체가 없다 — compose 가 읽는 유일한 값이다.
    expect(EXAMPLE).toMatch(/^POSTGRES_PORT=/m)
    expect(EXAMPLE).toMatch(/^DATABASE_URL=/m)
    expect(EXAMPLE).toMatch(/^PORT=/m)
    expect(EXAMPLE).toMatch(/^#TEST_DATABASE_URL=/m)
  })

  it('`POSTGRES_PORT` 는 **주석이 아닌 채로** 있다 — compose 가 그 줄을 읽는다', () => {
    // 주석으로 두면 `--env-file` 로 줘도 compose 가 기본값으로 물러나고, 그때 어긋남을
    // 재는 자(`port-agreement`)도 함께 잠든다 — 검사가 꺼지는 길을 만들지 않는다.
    expect(EXAMPLE).not.toMatch(/^#POSTGRES_PORT=/m)
  })

  it('개발 DB 를 부르는 한 줄이 이 파일 안에 있다 — 그 스크립트가 이 파일을 compose 에 준다', () => {
    // `docker compose` 는 이 파일을 스스로 못 찾는다(프로젝트 디렉터리의 `.env` 만 본다) — 루트 `package.json` 의 `db` 가
    // `--env-file` 로 준다. 그 사실이 이 파일의 존재 이유를 바꾸므로 템플릿이 그 명령을 들고 있어야 한다.
    expect(EXAMPLE).toContain('pnpm db up -d')
  })

  it('`TEST_DATABASE_URL` 은 **주석 처리된 채로** 있다 — 절차가 "주석을 푼다"이다', () => {
    // 주석을 풀어 둔 채 커밋하면 아무것도 안 고친 사람이 그 값을 그대로 쓰게 된다.
    expect(EXAMPLE).not.toMatch(/^TEST_DATABASE_URL=/m)
  })
})
