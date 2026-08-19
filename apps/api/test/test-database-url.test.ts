/**
 * **테스트 DB 를 워크트리마다 가를 수 있는가**(2026-08-19 D3).
 *
 * 이 자를 세운 근거는 실측이다. 워크트리 둘이 **같은** 테스트 DB를 보며 동시에
 * `vitest run --project api`를 돌리면 **둘 다 종료 코드 1**이고, 가르면 **둘 다 종료 0**에
 * 전 파일·전 케이스 통과다. 구현자와 리뷰어가 각각 쟀고 **결론이 같다.**
 *
 * **깨지는 개수는 적지 않는다 — 판마다 다르다.** 경쟁 상태라 그렇다: 구현자 판은
 * 16파일/92케이스와 10파일/53케이스였고 리뷰어 판은 13파일/57케이스와 18파일/82케이스였다
 * (귀속: 리뷰 §5). 꼴도 갈린다 — 구현자 판에는 `relation "themes" does not exist`가 29건
 * 났는데 리뷰어 판에는 **한 번도 안 났다**. **안 낡는 값은 종료 코드뿐이다.**
 *
 * 비용도 재라: 리뷰어 판에서 **단독 실행 94.02초** vs **동시 두 판이 각각 90.9초**다
 * (귀속: 리뷰 §5). 공유한 판이 더 빨라 보이는 것은 **실패하는 판이라 일이 덜 들어서**이므로
 * 비교 기준이 못 된다.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  API_ENV_URL,
  DEFAULT_TEST_DATABASE_URL,
  readApiEnvFile,
  resolveTestDatabaseUrl,
  resolveTestDatabaseUrlFrom,
} from './test-database-url'
import { stripComments } from './source-census'

const A = 'postgres://wirebound:wirebound@127.0.0.1:5433/wb_feat_a'
const B = 'postgres://wirebound:wirebound@127.0.0.1:5433/wb_feat_b'

describe('TEST_DATABASE_URL 은 셸 → apps/api/.env → 기본값 순서로 온다', () => {
  it('아무 값도 없으면 오늘과 같다 — wirebound_test (D6)', () => {
    expect(resolveTestDatabaseUrl({})).toBe(DEFAULT_TEST_DATABASE_URL)
    expect(resolveTestDatabaseUrl()).toContain('/wirebound_test')
  })

  it('apps/api/.env 의 값을 따라간다 — 이 칸이 없으면 파일에 적어도 아무 일이 없다', () => {
    // `pnpm test`는 루트에서 도는 vitest라 apps/api 의 `--env-file-if-exists` 를 지나지 않는다.
    expect(resolveTestDatabaseUrl({ fileEnv: { TEST_DATABASE_URL: A } })).toBe(A)
  })

  it('셸이 파일을 이긴다 — api 의 --env-file-if-exists 와 같은 순서다', () => {
    expect(resolveTestDatabaseUrl({ shellEnv: { TEST_DATABASE_URL: B }, fileEnv: { TEST_DATABASE_URL: A } })).toBe(B)
  })

  it('빈 문자열은 "안 줬다"와 같은 뜻이다', () => {
    expect(resolveTestDatabaseUrl({ shellEnv: { TEST_DATABASE_URL: '' }, fileEnv: { TEST_DATABASE_URL: A } })).toBe(A)
    expect(resolveTestDatabaseUrl({ shellEnv: { TEST_DATABASE_URL: '' }, fileEnv: { TEST_DATABASE_URL: '' } })).toBe(
      DEFAULT_TEST_DATABASE_URL,
    )
  })

  it('**DATABASE_URL 은 건너오지 않는다** — 운영 DB 가 테스트 프로세스에 들어오면 안 된다', () => {
    // api 테스트 열넷이 `projects`·`users`를 범위 없이 지운다(`helpers.ts`의 resetRealData).
    // 파일에서 가져오는 키가 TEST_DATABASE_URL 하나뿐이라는 것이 그 사고를 막는 전부다.
    const resolved = resolveTestDatabaseUrl({
      fileEnv: { DATABASE_URL: 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound' },
    })
    expect(resolved).toBe(DEFAULT_TEST_DATABASE_URL)
    expect(resolved).not.toContain('5433/wirebound"')
  })

  it('워크트리 둘이 서로 다른 값을 갖는다 — 이 슬라이스가 사려는 것이 이것뿐이다', () => {
    expect(resolveTestDatabaseUrl({ fileEnv: { TEST_DATABASE_URL: A } })).not.toBe(
      resolveTestDatabaseUrl({ fileEnv: { TEST_DATABASE_URL: B } }),
    )
  })
})

/**
 * **여기서부터가 배선이다.** 위의 케이스들은 *"주면 순서대로 고른다"*를 재고, 아래는
 * *"진짜 파일에서 읽어다 그 순서에 넣는다"*를 잰다.
 *
 * 앞 판에는 이 자가 없었다. 리뷰가 `helpers.ts`의 조립 한 줄에서 `fileEnv` 인자를 빼자
 * **게이트 넷이 전부 초록인 채로** 스위트가 조용히 기본 DB 를 먹었다(귀속: 리뷰 §9 R4).
 * 순수 규칙 쪽에 같은 변이를 심으면 죽는다 — **덮인 쪽에만 자가 있었다.**
 */
describe('배선 — 진짜 파일을 읽어 그 순서에 넣는가', () => {
  let dir: string
  let envFile: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wb-env-'))
    envFile = join(dir, '.env')
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('파일에 적힌 값을 실제로 읽어 온다 — 기본값이 아니다', () => {
    writeFileSync(envFile, `TEST_DATABASE_URL=${A}\nPORT=3011\n`)
    expect(resolveTestDatabaseUrlFrom({}, envFile)).toBe(A)
  })

  it('셸이 그 파일을 이긴다 — 두 실행자가 같은 순서를 지켜야 한다', () => {
    writeFileSync(envFile, `TEST_DATABASE_URL=${A}\n`)
    expect(resolveTestDatabaseUrlFrom({ TEST_DATABASE_URL: B }, envFile)).toBe(B)
  })

  it('파일이 없으면 기본값이다 — .env 를 안 만든 사람이 깨지면 안 된다 (D6)', () => {
    expect(resolveTestDatabaseUrlFrom({}, join(dir, '없는파일.env'))).toBe(DEFAULT_TEST_DATABASE_URL)
  })

  it('그 키가 없는 파일이면 기본값이다', () => {
    writeFileSync(envFile, 'DATABASE_URL=postgres://wirebound:wirebound@127.0.0.1:5433/wirebound\nPORT=3001\n')
    expect(resolveTestDatabaseUrlFrom({}, envFile)).toBe(DEFAULT_TEST_DATABASE_URL)
  })

  it('**운영 DATABASE_URL 은 안 건너온다** — 파일에서 가져가는 키가 하나뿐이다', () => {
    const 운영 = 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound'
    writeFileSync(envFile, `DATABASE_URL=${운영}\n`)
    // api 테스트 열넷이 projects·users 를 범위 없이 지운다. 이 한 줄이 그 사고를 막는 전부다.
    expect(resolveTestDatabaseUrlFrom({}, envFile)).not.toBe(운영)
    expect(resolveTestDatabaseUrlFrom({}, envFile)).toBe(DEFAULT_TEST_DATABASE_URL)
  })

  it('readApiEnvFile 이 진짜로 파일을 읽는다 — 빈 객체만 내면 위 케이스가 통째로 헛돈다', () => {
    writeFileSync(envFile, 'PORT=3011\nTEST_DATABASE_URL=x\n')
    expect(readApiEnvFile(envFile)).toMatchObject({ PORT: '3011', TEST_DATABASE_URL: 'x' })
    expect(readApiEnvFile(join(dir, '없는파일.env'))).toEqual({})
  })
})

describe('helpers.ts 가 그 배선을 지나는가 — 소스에서 센다', () => {
  // **주석을 걷고 센다.** 안 걷으면 옳은 줄을 주석에 남기고 아래에서 경로를 바꾸는 우회가
  // 지나간다(귀속: 리뷰 델타 R4e — 15/15 통과했다).
  const source = stripComments(readFileSync(new URL('./helpers.ts', import.meta.url), 'utf8'))

  it('TEST_DATABASE_URL 을 `resolveTestDatabaseUrlFrom(process.env)` 로 정한다', () => {
    expect(source).toContain('export const TEST_DATABASE_URL = resolveTestDatabaseUrlFrom(process.env)')
  })

  it('그 자리에서 순서를 다시 조립하지 않는다 — 조립이 둘이면 한쪽만 고쳐진다', () => {
    expect(source).not.toContain('fileEnv')
    expect(source).not.toContain('shellEnv')
  })

  it('기본값 문자열을 여기 베껴 두지 않는다', () => {
    expect(source).not.toContain('wirebound_test')
  })
})

/**
 * **배선이 가리키는 자리 자체를 잰다.**
 *
 * 리뷰어가 이 자리를 열어 뒀다(귀속: 리뷰 델타 R4c·R4d): `API_ENV_URL`을 없는 파일이나
 * 엉뚱한 진짜 파일로 바꿔도 **api 프로젝트가 전부 통과하고 종료 0**이며, 행동으로는
 * `.env`가 무시되어 **스위트가 조용히 공용 `wirebound_test`를 먹는다.**
 *
 * **그것이 이 슬라이스의 부류다** — 없애려던 것이 *"공유 자원으로 조용히 떨어지는 것"*이고
 * 이건 그 정의에 그대로 맞는다. 다만 **런타임에서 시끄럽게 할 수는 없다**: 파일이 없는 것은
 * D6이 지키기로 한 정상 상태다(`.env`를 안 만든 사람은 기본값으로 돌아야 한다).
 *
 * **그래서 가르는 축을 바꿨다.** *"파일이 있나"*가 아니라 ***"가리키는 디렉터리가
 * `apps/api` 인가"*** 다. 파일은 없어도 되고 디렉터리는 틀리면 안 된다 — 자연히 깨지는 길이
 * 그 파일을 옮기는 리팩터이므로, 옮긴 사람이 여기서 걸린다.
 */
describe('배선이 가리키는 자리', () => {
  it('`apps/api/.env` 를 가리킨다 — 파일 이름과 디렉터리 둘 다', () => {
    expect(API_ENV_URL.pathname.endsWith('/apps/api/.env')).toBe(true)
  })

  it('그 디렉터리가 **실재하는 api 패키지**다 — 문자열만 맞는 것이 아니다', () => {
    // `.env` 자체는 gitignore 라 없을 수 있다(D6). 옆의 `.env.example` 은 추적되므로 늘 있다.
    expect(existsSync(new URL('.env.example', API_ENV_URL))).toBe(true)
    expect(existsSync(new URL('package.json', API_ENV_URL))).toBe(true)
  })

  it('읽는 자가 기본값으로 그 경로를 쓴다 — 인자를 안 주면 진짜 자리를 봐야 한다', () => {
    // 인자를 주는 갈래는 위 임시 파일 케이스가 잰다. 여기서 재는 것은 **기본값**이다.
    expect(readApiEnvFile()).toEqual(readApiEnvFile(API_ENV_URL))
  })
})
