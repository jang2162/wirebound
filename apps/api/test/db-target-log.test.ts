/**
 * **뜰 때 어느 DB를 보는지 말하는가**(2026-08-19 D4).
 *
 * 조용한 갈래를 시끄럽게 만드는 자리다. 실측(같은 날 보고 §2.3): 워크트리 B가
 * `pnpm --filter @wirebound/api migrate:down`을 한 번 돌리자 **A의 살아 있는 서버가**
 * `relation "api_tokens" does not exist`로 500을 내기 시작했다. A는 아무것도 안 했고
 * A의 로그에는 자기가 어느 DB를 보는지가 **한 줄도 없었다.**
 *
 * 그래서 둘을 잰다: 값이 자격 문자열을 흘리지 않는가, 그리고 **`main.ts`가 실제로 그것을
 * 찍는가**(소스에서 센다 — `screen-renderer-census.test.ts`와 같은 결이다).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeDatabaseTarget } from '../src/db/describe-target'
import { SRC_ROOT, stripComments } from './source-census'

describe('describeDatabaseTarget — 사람이 가를 만큼만 낸다', () => {
  it('호스트·포트·DB 이름을 낸다', () => {
    expect(describeDatabaseTarget('postgres://wirebound:wirebound@127.0.0.1:5433/wirebound')).toBe(
      '127.0.0.1:5433/wirebound',
    )
  })

  it('워크트리마다 다른 DB 이름이 그 자리에서 갈린다 — 이 값 하나로 터미널 둘을 가른다', () => {
    const a = describeDatabaseTarget('postgres://wirebound:wirebound@127.0.0.1:5433/wb_feat_a')
    const b = describeDatabaseTarget('postgres://wirebound:wirebound@127.0.0.1:5433/wb_feat_b')
    expect(a).not.toBe(b)
    expect(a).toBe('127.0.0.1:5433/wb_feat_a')
  })

  it('**비밀번호도 사용자 이름도 안 나온다** — 로그는 파일로 남고 붙여넣어진다', () => {
    const described = describeDatabaseTarget('postgres://someone:s3cr3t-pw@db.example:5432/prod')
    expect(described).not.toContain('s3cr3t-pw')
    expect(described).not.toContain('someone')
    expect(described).toBe('db.example:5432/prod')
  })

  it('ASCII 가 아닌 DB 이름을 퍼센트 인코딩된 채로 내지 않는다 — 붙여넣을 수 있어야 한다', () => {
    // `URL`은 경로를 인코딩해서 들고 있다. 안 되돌리면 `global-setup`이 권하는
    // `CREATE DATABASE wb_%EC%95%84…` 가 실제로 못 쓰는 명령이 된다(실측).
    expect(describeDatabaseTarget('postgres://u:p@127.0.0.1:5433/wb_아직없다')).toBe('127.0.0.1:5433/wb_아직없다')
  })

  it('포트가 없으면 호스트만, DB 이름이 없으면 호스트만 낸다', () => {
    expect(describeDatabaseTarget('postgres://u:p@db.example/wirebound')).toBe('db.example/wirebound')
    expect(describeDatabaseTarget('postgres://u:p@db.example:5432')).toBe('db.example:5432')
  })

  it('해석에 실패해도 원문을 되돌려주지 않는다 — 그 문자열에도 비밀번호가 있다', () => {
    const described = describeDatabaseTarget('이건 URL이 아니다 password=s3cr3t')
    expect(described).not.toContain('s3cr3t')
    expect(described).toBe('(DATABASE_URL을 해석할 수 없습니다)')
  })
})

describe('main.ts 가 그것을 실제로 찍는가 — 소스에서 센다', () => {
  const main = stripComments(readFileSync(join(SRC_ROOT, 'main.ts'), 'utf8'))

  it('`describeDatabaseTarget` 을 부르는 자리가 `main.ts` 에 있다', () => {
    expect(main).toContain('describeDatabaseTarget(config.databaseUrl)')
  })

  it('`config.databaseUrl` 을 받는 자가 둘뿐이다 — 붙는 자와 가려서 찍는 자', () => {
    // **목록을 손으로 적지 않고 소스에서 센다.** `app.log.info(config.databaseUrl)`가
    // 들어오면 여기 `info`가 하나 더 붙어 이 케이스가 죽는다.
    const receivers = [...main.matchAll(/(\w+)\(config\.databaseUrl\)/g)].map((match) => match[1]).sort()
    expect(receivers).toEqual(['createPool', 'describeDatabaseTarget'])
  })

  it('템플릿 문자열에 그대로 끼워 넣지도 않는다', () => {
    expect(main).not.toMatch(/\$\{\s*config\.databaseUrl\s*\}/)
  })
})
