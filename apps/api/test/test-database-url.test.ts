/**
 * **테스트 DB 를 워크트리마다 가를 수 있는가**(2026-08-19 D3).
 *
 * 이 자를 세운 근거는 실측이다(같은 날 보고 §2.4). 워크트리 둘이 **같은** 테스트 DB를
 * 보며 동시에 `vitest run --project api`를 돌리자:
 *
 * | | 파일 | 케이스 | 종료 코드 |
 * |---|---|---|---|
 * | 공유 A | **16 실패** / 52 통과 | **92 실패** / 1226 통과 | 1 |
 * | 공유 B | **10 실패** / 58 통과 | **53 실패** / 1265 통과 | 1 |
 * | 가른 A | 68 통과 | 1318 통과 | **0** |
 * | 가른 B | 68 통과 | 1318 통과 | **0** |
 *
 * 벽시계는 가른 쪽이 오히려 짧았다(91.2s·91.1s vs 98.1s·91.8s) — 값을 가르는 비용이
 * 사실상 0이라 `CLAUDE.md`의 *"api 테스트를 동시에 돌리지 않는다"*가 풀린다.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_TEST_DATABASE_URL, resolveTestDatabaseUrl } from './test-database-url'

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
