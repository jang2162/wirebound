/**
 * **이 슬라이스의 급소** — `docker compose` 가 여는 호스트 포트와 접속 문자열 안에 박힌
 * 포트가 어긋나면 **서버가 남의 컨테이너에 붙는다**(2026-08-19 D2).
 *
 * 앞 슬라이스가 프록시에서 닫은 것과 **같은 부류**다: 어긋나면 연결이 *실패*하는 게 아니라
 * **성공한다** — 그래서 조용하다(그때의 실측: B 의 에디터에서 B 의 계정이 401, A 의 계정이
 * 200 이었고 아무도 안 울었다. 귀속: 2026-08-19 보고 §2.2). 이번엔 DB 다.
 *
 * **한 자리로 못 모은다 — 재고 확인했다.** compose 는 URL 에서 포트를 뽑을 수 없고,
 * Node 의 `--env-file` 도 `util.parseEnv` 도 `${...}` 를 펴지 않으므로(이 판이 쟀다:
 * `DATABASE_URL=…:${POSTGRES_PORT}/db` 가 **문자 그대로** 들어온다) `DATABASE_URL` 안에서
 * `POSTGRES_PORT` 를 참조할 수도 없다. 그래서 D2 의 두 번째 길을 간다: **어긋남을 자가 잡는다.**
 *
 * 재는 축이 셋이다.
 * 1. **규칙** — `portAgreementError` 자체
 * 2. **배선** — `loadConfig` 와 `resolveTestDatabaseUrlFrom` 이 그 규칙을 **실제로 지나는가**
 *    (여기서는 인구조사가 아니라 **행동으로** 잰다 — 둘 다 부를 수 있는 함수다)
 * 3. **기본값** — `docker-compose.yml` 과 `.env.example` 이 **같은 수**를 드는가(D6).
 *    이 둘은 실행할 수 없어 인구조사로 잰다. **주석을 걷고 센다.**
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { COMPOSE_DEFAULT_POSTGRES_PORT, portAgreementError } from '../src/db/port-agreement'
import { defaultTestDatabaseUrl, resolveTestDatabaseUrl, resolveTestDatabaseUrlFrom } from './test-database-url'
import { stripYamlComments } from './source-census'

const 로컬 = (port: string, name = 'wirebound') => `postgres://wirebound:wirebound@127.0.0.1:${port}/${name}`

describe('규칙 — POSTGRES_PORT 와 접속 문자열의 포트가 같은가', () => {
  it('없으면 아무것도 재지 않는다 — 자기 Postgres 를 쓰는 사람이 깨지면 안 된다', () => {
    expect(portAgreementError({ urls: { DATABASE_URL: 로컬('5432') } })).toBeUndefined()
    expect(portAgreementError({ postgresPort: undefined, urls: { DATABASE_URL: 로컬('9999') } })).toBeUndefined()
    // 빈 문자열은 "안 줬다"와 같은 뜻이다 — 이 저장소의 다른 값들과 같은 규칙이다.
    expect(portAgreementError({ postgresPort: '', urls: { DATABASE_URL: 로컬('9999') } })).toBeUndefined()
  })

  it('같으면 조용하다', () => {
    expect(portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: 로컬('5443') } })).toBeUndefined()
  })

  it('**다르면 문장을 낸다 — 그리고 두 수를 다 보여 준다**', () => {
    const message = portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: 로컬('5433') } })
    expect(message).toBeDefined()
    expect(message).toContain('POSTGRES_PORT=5443')
    expect(message).toContain('DATABASE_URL → 127.0.0.1:5433/wirebound')
  })

  it('**자격 문자열은 안 싣는다** — 이 문장은 터미널에 남고 붙여넣어진다 (D4)', () => {
    // 같은 규칙을 지키는 자가 `describeDatabaseTarget` 에만 걸려 있어서 변이가 살아남은
    // 적이 있다(귀속: 리뷰 §9 R6). 새 경로를 열 때마다 이 자를 함께 세운다.
    const message = portAgreementError({
      postgresPort: '5443',
      urls: { DATABASE_URL: 'postgres://someone:s3cr3t-pw@127.0.0.1:5433/prod' },
    })
    expect(message).toBeDefined()
    expect(message).not.toContain('s3cr3t-pw')
    expect(message).not.toContain('someone')
    expect(message).not.toContain('postgres://')
  })

  it('여러 값을 한 번에 잰다 — 어긋난 것만 든다', () => {
    const message = portAgreementError({
      postgresPort: '5443',
      urls: { DATABASE_URL: 로컬('5443'), TEST_DATABASE_URL: 로컬('5433', 'wirebound_test') },
    })
    expect(message).toContain('TEST_DATABASE_URL → 127.0.0.1:5433/wirebound_test')
    expect(message).not.toContain('DATABASE_URL → 127.0.0.1:5443')
  })

  it('**다른 호스트는 안 잰다** — POSTGRES_PORT 는 이 기계에 여는 포트다', () => {
    expect(
      portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: 'postgres://u:p@db.example:5432/prod' } }),
    ).toBeUndefined()
  })

  it('루프백의 여러 표기를 다 잰다 — localhost 로 적은 사람이 빠져나가면 안 된다', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]', '0.0.0.0']) {
      expect(portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: `postgres://u:p@${host}:5433/x` } })).toBeDefined()
    }
  })

  it('포트를 안 적은 접속 문자열은 5432 로 친다 — Postgres 의 기본값이다', () => {
    expect(portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: 'postgres://u:p@127.0.0.1/x' } })).toContain(
      'DATABASE_URL → 127.0.0.1/x',
    )
    expect(
      portAgreementError({ postgresPort: '5432', urls: { DATABASE_URL: 'postgres://u:p@127.0.0.1/x' } }),
    ).toBeUndefined()
  })

  it('해석 못 하는 값에는 이 자가 안 나선다 — 그 자리는 zod 가 든다', () => {
    expect(portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: '이건 URL 이 아니다' } })).toBeUndefined()
    expect(portAgreementError({ postgresPort: '5443', urls: { DATABASE_URL: undefined } })).toBeUndefined()
  })

  it('POSTGRES_PORT 가 숫자가 아니면 그것부터 말한다 — compose 도 그 값을 거부한다', () => {
    const message = portAgreementError({ postgresPort: '오사사삼', urls: { DATABASE_URL: 로컬('5433') } })
    expect(message).toContain('POSTGRES_PORT')
    expect(message).toContain('오사사삼')
  })
})

/**
 * **배선 — 규칙을 세워 두고 안 꽂으면 아무 일도 안 일어난다.**
 *
 * 앞 슬라이스가 정확히 그 자리에서 변이 넷을 살렸다(귀속: 리뷰 §9). 여기서는 두 배선을
 * **행동으로** 잰다 — `loadConfig` 도 `resolveTestDatabaseUrlFrom` 도 인자를 받는 함수라
 * 글자를 세지 않고 실제로 부를 수 있다.
 */
describe('배선 ① — 서버가 뜨기 전에 죽는가 (loadConfig)', () => {
  const 기본환경 = { NODE_ENV: 'test' as const }

  it('어긋나면 **던진다** — 조용히 뜨면 남의 DB 를 열어 놓고 "잘 떴다"고 읽는다', () => {
    expect(() => loadConfig({ ...기본환경, DATABASE_URL: 로컬('5433'), POSTGRES_PORT: '5443' })).toThrow(
      /POSTGRES_PORT=5443/,
    )
  })

  it('맞으면 뜬다', () => {
    expect(loadConfig({ ...기본환경, DATABASE_URL: 로컬('5443'), POSTGRES_PORT: '5443' }).databaseUrl).toBe(로컬('5443'))
  })

  it('POSTGRES_PORT 가 없으면 오늘과 같다 — 아무도 안 깨진다 (D6)', () => {
    expect(loadConfig({ ...기본환경, DATABASE_URL: 로컬('5432') }).databaseUrl).toBe(로컬('5432'))
  })

  it('그 값이 `ApiConfig` 에 실리지 않는다 — 이 서버가 쓰는 값이 아니라 재기만 하는 값이다', () => {
    const config = loadConfig({ ...기본환경, DATABASE_URL: 로컬('5443'), POSTGRES_PORT: '5443' })
    // `databaseUrl` 안에는 당연히 그 수가 있다. 재는 것은 **따로 실리지 않는다**는 것이다.
    expect(Object.keys(config)).toEqual(Object.keys(loadConfig({ ...기본환경, DATABASE_URL: 로컬('5443') })))
    expect(Object.entries(config).some(([, value]) => value === '5443' || value === 5443)).toBe(false)
  })

  it('**TEST_DATABASE_URL 은 여기서 안 잰다** — 테스트 값 때문에 도는 서버가 죽으면 안 된다', () => {
    expect(() =>
      loadConfig({
        ...기본환경,
        DATABASE_URL: 로컬('5443'),
        TEST_DATABASE_URL: 로컬('5433', 'wirebound_test'),
        POSTGRES_PORT: '5443',
      }),
    ).not.toThrow()
  })
})

describe('배선 ② — 스위트가 남의 판을 지우기 전에 죽는가 (resolveTestDatabaseUrlFrom)', () => {
  let dir: string
  let envFile: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wb-port-'))
    envFile = join(dir, '.env')
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('**어긋나면 던진다** — 안 던지면 `resetRealData` 가 남의 컨테이너를 지운다', () => {
    writeFileSync(envFile, `POSTGRES_PORT=5443\nTEST_DATABASE_URL=${로컬('5433', 'wirebound_test')}\n`)
    expect(() => resolveTestDatabaseUrlFrom({}, envFile)).toThrow(/POSTGRES_PORT=5443/)
  })

  it('맞으면 그 값을 낸다', () => {
    writeFileSync(envFile, `POSTGRES_PORT=5443\nTEST_DATABASE_URL=${로컬('5443', 'wb_a_test')}\n`)
    expect(resolveTestDatabaseUrlFrom({}, envFile)).toBe(로컬('5443', 'wb_a_test'))
  })

  it('셸의 POSTGRES_PORT 도 잰다 — 두 값이 같은 순서를 지킨다', () => {
    writeFileSync(envFile, `TEST_DATABASE_URL=${로컬('5433', 'wb_a_test')}\n`)
    expect(() => resolveTestDatabaseUrlFrom({ POSTGRES_PORT: '5443' }, envFile)).toThrow(/POSTGRES_PORT=5443/)
  })
})

/**
 * **기본값이 POSTGRES_PORT 를 따라간다** — 이 슬라이스가 새로 막는 조용한 자리다.
 *
 * 옛 기본값은 5433 을 박고 있었다. 자기 컨테이너를 5443 에 띄운 사람이 `TEST_DATABASE_URL`
 * 을 **안 적으면** 스위트가 5433, 즉 **남의 컨테이너**의 `wirebound_test` 를 지우며 돈다 —
 * 그 판은 아무 에러도 안 낸다(그쪽에도 같은 이름의 DB 가 있으므로).
 */
describe('안 적은 사람의 기본값', () => {
  it('POSTGRES_PORT 를 따라간다 — 자기 컨테이너의 wirebound_test 를 본다', () => {
    expect(resolveTestDatabaseUrl({ fileEnv: { POSTGRES_PORT: '5443' } })).toBe(로컬('5443', 'wirebound_test'))
  })

  it('아무것도 없으면 오늘과 같다 (D6)', () => {
    expect(resolveTestDatabaseUrl({})).toBe(로컬(COMPOSE_DEFAULT_POSTGRES_PORT, 'wirebound_test'))
    expect(defaultTestDatabaseUrl()).toContain(`:${COMPOSE_DEFAULT_POSTGRES_PORT}/`)
  })

  it('기본값은 어긋날 수가 없다 — 따라가므로 검사도 통과한다', () => {
    expect(
      portAgreementError({
        postgresPort: '5443',
        urls: { TEST_DATABASE_URL: resolveTestDatabaseUrl({ fileEnv: { POSTGRES_PORT: '5443' } }) },
      }),
    ).toBeUndefined()
  })
})

/**
 * **인구조사 — 실행할 수 없는 두 파일이 같은 수를 드는가.**
 *
 * `docker-compose.yml` 은 `docker` 없이는 실행할 수 없고 `.env.example` 은 템플릿이다.
 * 그런데 **D6 이 서 있는 자리가 정확히 이 둘의 일치**다: 아무것도 안 바꾼 사람은
 * compose 의 기본값(5433)으로 컨테이너를 띄우고 `.env.example` 의 접속 문자열로 붙는다.
 * 한쪽만 움직이면 **어제까지 되던 것이 조용히 안 된다.**
 */
describe('기본값 — docker-compose.yml 과 .env.example 이 같은 수를 든다 (D6)', () => {
  const REPO_ROOT = new URL('../../../', import.meta.url)
  const COMPOSE = stripYamlComments(readFileSync(new URL('docker-compose.yml', REPO_ROOT), 'utf8'))
  const EXAMPLE = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')

  it('자가 진짜 파일을 읽는다 — 빈 문자열이면 아래가 통째로 헛돈다', () => {
    // `shell-css.test.ts` 가 빈 문자열로 초록이 됐던 사고와 같은 부류를 막는 카나리아다.
    expect(existsSync(new URL('pnpm-workspace.yaml', REPO_ROOT))).toBe(true)
    expect(COMPOSE).toContain('services:')
    expect(COMPOSE.length).toBeGreaterThan(200)
    expect(EXAMPLE.length).toBeGreaterThan(200)
  })

  it('**컨테이너 이름을 고정하지 않는다** — 고정하면 워크트리 둘째가 안 뜬다', () => {
    // 이 한 줄이 이 슬라이스의 시작이다. 주석으로 남긴 설명은 위에서 걷었다.
    expect(COMPOSE).not.toContain('container_name')
  })

  it('호스트 포트가 `POSTGRES_PORT` 에서 온다 — 수를 박아 두지 않는다', () => {
    const ports = COMPOSE.split('\n').filter((line) => /:5432'/.test(line))
    expect(ports).toHaveLength(1)
    expect(ports[0]).toContain('${POSTGRES_PORT:-')
  })

  it('그 기본값이 `COMPOSE_DEFAULT_POSTGRES_PORT` 와 같다 — 코드가 그 수를 알아야 한다', () => {
    const 기본값 = COMPOSE.match(/\$\{POSTGRES_PORT:-(\d+)\}/)?.[1]
    expect(기본값).toBe(COMPOSE_DEFAULT_POSTGRES_PORT)
  })

  it('`.env.example` 의 POSTGRES_PORT 도 그 수다 — 복사만 한 사람이 오늘처럼 돈다', () => {
    expect(EXAMPLE).toMatch(new RegExp(`^POSTGRES_PORT=${COMPOSE_DEFAULT_POSTGRES_PORT}$`, 'm'))
  })

  it('`.env.example` 의 접속 문자열 **둘 다** 그 포트를 든다 — 어긋난 템플릿을 배포하지 않는다', () => {
    // 주석으로 든 `#TEST_DATABASE_URL=` 도 센다. 사람이 주석만 풀면 그 값이 그대로 선다.
    const urls = [...EXAMPLE.matchAll(/^#?(?:TEST_)?DATABASE_URL=(\S+)$/gm)].map((match) => match[1] as string)
    expect(urls).toHaveLength(2)
    for (const url of urls) {
      expect(new URL(url).port).toBe(COMPOSE_DEFAULT_POSTGRES_PORT)
    }
    expect(portAgreementError({ postgresPort: COMPOSE_DEFAULT_POSTGRES_PORT, urls: { a: urls[0], b: urls[1] } })).toBeUndefined()
  })

  it('초기화 스크립트가 만드는 DB 를 기본 테스트 URL 이 가리킨다 — 손으로 만드는 걸음을 없앤 근거다', () => {
    // 볼륨을 처음 만들 때만 도는 스크립트다. 워크트리마다 볼륨이 새로 생기면 **매번 돈다**
    // (이 판이 쟀다: 새 볼륨의 psql `\l` 에 `wirebound_test` 가 있다).
    const initSql = readFileSync(new URL('docker/postgres-init/01-test-db.sql', REPO_ROOT), 'utf8')
    const 만드는이름 = initSql.match(/CREATE DATABASE (\w+);/)?.[1]
    expect(만드는이름).toBeDefined()
    expect(defaultTestDatabaseUrl()).toContain(`/${만드는이름 as string}`)
  })
})
