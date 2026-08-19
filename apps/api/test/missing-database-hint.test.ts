/**
 * **없는 DB 힌트에 자를 댄다** — 앞 판에 없던 자리다.
 *
 * 이 파일이 있는 이유는 리뷰가 심은 변이 둘이 **살아남았기** 때문이다(귀속: 리뷰 §9 R5·R6).
 * 로직이 `global-setup.ts`의 `catch` 안에 있었고 그 길은 마이그레이션이 실패해야만
 * 지나므로, 관문을 바꿔도 자격 문자열을 통째로 실어도 **게이트 넷이 전부 초록이었다.**
 *
 * 두 갈래를 나눠 잰다: **언제 붙나**(관문)와 **무엇이 실리나**(유출).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MISSING_DATABASE_SQLSTATE, missingDatabaseHint } from './missing-database-hint'

/** 없는 DB 일 때 Postgres 가 내는 것과 같은 꼴의 에러. */
function missingDatabaseError(): unknown {
  return Object.assign(new Error('database "wb_없는DB" does not exist'), {
    code: MISSING_DATABASE_SQLSTATE,
    severity: 'FATAL',
  })
}

const URL_WITH_SECRET = 'postgres://wirebound:s3cr3t-pw@127.0.0.1:5433/wb_feat_a'

describe('언제 붙나 — 3D000 일 때만', () => {
  it('없는 DB 면 만드는 한 줄을 낸다', () => {
    const hint = missingDatabaseHint(missingDatabaseError(), URL_WITH_SECRET)
    expect(hint).toContain('테스트 DB "wb_feat_a" 가 없습니다.')
    expect(hint).toContain("psql -U wirebound -d postgres -c 'CREATE DATABASE wb_feat_a;'")
  })

  it('**다른 실패에는 안 붙는다** — 비밀번호가 틀렸는데 "DB 를 만들어라"를 권하면 안 된다', () => {
    const authFailure = Object.assign(new Error('password authentication failed'), { code: '28P01' })
    expect(missingDatabaseHint(authFailure, URL_WITH_SECRET)).toBeUndefined()
    // 표가 없는 경우(42P01)도 DB 가 없는 것과 다르다.
    expect(missingDatabaseHint(Object.assign(new Error('x'), { code: '42P01' }), URL_WITH_SECRET)).toBeUndefined()
  })

  it('code 가 없거나 에러가 아닌 것에도 안 붙는다', () => {
    expect(missingDatabaseHint(new Error('그냥 에러'), URL_WITH_SECRET)).toBeUndefined()
    expect(missingDatabaseHint(undefined, URL_WITH_SECRET)).toBeUndefined()
    expect(missingDatabaseHint(null, URL_WITH_SECRET)).toBeUndefined()
    expect(missingDatabaseHint('3D000', URL_WITH_SECRET)).toBeUndefined()
  })

  it('관문이 진짜 3D000 이다 — 이 값이 바뀌면 힌트가 조용히 사라진다', () => {
    expect(MISSING_DATABASE_SQLSTATE).toBe('3D000')
  })
})

describe('무엇이 실리나 — **자격 문자열이 안 실린다**(D4)', () => {
  it('비밀번호도 사용자 이름도 접속 문자열 원문도 안 나온다', () => {
    const hint = missingDatabaseHint(missingDatabaseError(), URL_WITH_SECRET)
    expect(hint).toBeDefined()
    expect(hint).not.toContain('s3cr3t-pw')
    expect(hint).not.toContain('wirebound:')
    expect(hint).not.toContain(URL_WITH_SECRET)
    expect(hint).not.toContain('postgres://')
  })

  it('권하는 명령이 **붙여넣을 수 있는 것**이다 — DB 이름 하나만 들어간다', () => {
    // 원문을 그대로 쓰면 `CREATE DATABASE postgres://…;` 가 되어 못 쓰는 명령이 된다.
    const line = (missingDatabaseHint(missingDatabaseError(), URL_WITH_SECRET) ?? '')
      .split('\n')
      .find((row) => row.includes('CREATE DATABASE'))
    expect(line).toBe(
      "  docker compose exec postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wb_feat_a;'",
    )
  })

  it('ASCII 가 아닌 이름을 퍼센트 인코딩된 채로 권하지 않는다', () => {
    const hint = missingDatabaseHint(missingDatabaseError(), 'postgres://u:p@127.0.0.1:5433/wb_아직없다')
    expect(hint).toContain("CREATE DATABASE wb_아직없다;")
    expect(hint).not.toContain('%EC%95%84')
  })
})

describe('global-setup 이 그 자를 실제로 지난다 — 소스에서 센다', () => {
  const source = readFileSync(new URL('./global-setup.ts', import.meta.url), 'utf8')

  it('`missingDatabaseHint` 를 부르고 그 인자가 TEST_DATABASE_URL 이다', () => {
    expect(source).toContain('missingDatabaseHint(error, TEST_DATABASE_URL)')
  })

  it('문구를 그 자리에서 다시 조립하지 않는다 — 두 벌이면 한쪽만 고쳐진다', () => {
    expect(source).not.toContain('CREATE DATABASE')
  })

  it('원인을 `cause` 로 매단다 — 3D000 이 아닌 실패의 원문이 사라지면 안 된다', () => {
    expect(source).toContain('cause: error')
  })
})
