/**
 * **`.env.example` 이 드는 키가 실제와 맞는가.**
 *
 * 이 파일이 있는 이유는 리뷰가 심은 변이 하나가 **살아남았기** 때문이다(귀속: 리뷰 §9 R7):
 * `.env.example`에서 `#TEST_DATABASE_URL=` 줄을 지워도 **저장소 어디도 안 운다.**
 * 그런데 README §3.1의 4번은 *"주석 처리되어 있다. 주석을 푼다"*라고 **그 줄의 존재를
 * 전제한다** — 줄이 사라지면 절차가 성립하지 않는데 게이트는 전부 초록이다.
 *
 * **목록을 손으로 적지 않는다.** 값 하나는 `src/config.ts`의 `EnvSchema`에서 세고
 * (`EnvSchema`가 export 되지 않으므로 소스에서 센다 — `screen-renderer-census.test.ts`와
 * 같은 결이다), 나머지 하나(`TEST_DATABASE_URL`)는 이 저장소에서 그것을 읽는 자가
 * `test/test-database-url.ts` 뿐이라 여기서 이름으로 든다.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const EXAMPLE = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
const CONFIG_SOURCE = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')

/** `.env.example`이 드는 키. 주석으로 든 것(`#KEY=`)도 **든 것으로 친다.** */
function keysInExample(): string[] {
  return [...EXAMPLE.matchAll(/^#?([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1] as string).sort()
}

/** `EnvSchema = z.object({ ... })` 안에서 키를 센다. */
function keysInEnvSchema(): string[] {
  const body = CONFIG_SOURCE.split('const EnvSchema = z.object({')[1]?.split('\n})')[0] ?? ''
  return [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] as string).sort()
}

describe('.env.example 이 무엇을 드나', () => {
  it('센 것이 비어 있지 않다 — 정규식이 헛돌면 아래 표가 통째로 무의미하다', () => {
    // `shell-css.test.ts`가 빈 문자열로 초록이 됐던 사고와 같은 부류를 막는 카나리아다.
    expect(keysInExample().length).toBeGreaterThan(5)
    expect(keysInEnvSchema().length).toBeGreaterThan(5)
  })

  it('**`EnvSchema` 가 아는 키를 하나도 빠뜨리지 않는다** — 새 env 를 열고 안 적는 것을 막는다', () => {
    const missing = keysInEnvSchema().filter((key) => !keysInExample().includes(key))
    expect(missing).toEqual([])
  })

  it('`EnvSchema` 가 모르는 키를 드는 것은 `TEST_DATABASE_URL` 하나다', () => {
    // 그것 하나만 예외인 이유: pnpm test 는 루트에서 도는 vitest 라 이 패키지의
    // `--env-file-if-exists` 를 안 지나므로 `test/test-database-url.ts` 가 따로 읽는다.
    const extra = keysInExample().filter((key) => !keysInEnvSchema().includes(key))
    expect(extra).toEqual(['TEST_DATABASE_URL'])
  })

  it('워크트리마다 갈라야 하는 값 **넷**이 전부 있다 — README 3.1 의 절차가 이 줄들을 든다', () => {
    // 2026-08-19(워크트리마다 컨테이너)에서 `POSTGRES_PORT` 가 더해져 셋이 넷이 됐다.
    // 그 값이 없으면 컨테이너를 가르는 길 자체가 없다 — compose 가 읽는 유일한 값이다.
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

  it('compose 를 부르는 한 줄이 이 파일 안에 있다 — 플래그를 빼면 기본 포트로 되돌아간다', () => {
    // `docker compose` 는 이 파일을 스스로 못 찾는다(프로젝트 디렉터리의 `.env` 만 본다).
    // 그 사실이 이 파일의 존재 이유를 바꾸므로 템플릿이 그 명령을 들고 있어야 한다.
    expect(EXAMPLE).toContain('docker compose --env-file apps/api/.env up -d')
  })

  it('`TEST_DATABASE_URL` 은 **주석 처리된 채로** 있다 — 절차가 "주석을 푼다"이다', () => {
    // 주석을 풀어 둔 채 커밋하면 아무것도 안 고친 사람이 그 값을 그대로 쓰게 된다.
    expect(EXAMPLE).not.toMatch(/^TEST_DATABASE_URL=/m)
  })
})
