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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_TEST_DATABASE_URL,
  readApiEnvFile,
  resolveTestDatabaseUrl,
  resolveTestDatabaseUrlFrom,
} from './test-database-url'

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
  const source = readFileSync(new URL('./helpers.ts', import.meta.url), 'utf8')

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
