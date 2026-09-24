/**
 * **뜰 때 어느 DB를 보는지 말하는가.**
 *
 * 조용한 갈래를 시끄럽게 만드는 자리다. 두 워크트리가 한 DB 를 보면, 워크트리 B가
 * `pnpm --filter @wirebound/api migrate:down`을 한 번 돌리는 순간 **A의 살아 있는 서버가**
 * `relation "api_tokens" does not exist`로 500을 내기 시작한다. A는 아무것도 안 했으므로
 * A의 로그에 자기가 어느 DB를 보는지가 없으면 **원인을 가를 길이 없다.**
 *
 * 그래서 둘을 잰다: 값이 자격 문자열을 흘리지 않는가, 그리고 **`main.ts`가 실제로 그것을
 * 찍는가**(소스에서 센다 — `screen-renderer-census.test.ts`와 같은 결이다).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { describeDatabaseTarget } from '../src/db/describe-target'
import { describeSchemaState, emptySchemaHint } from '../src/db/describe-schema-state'
import { createDb, createPool } from '../src/db/client'
import { countExecutedMigrations } from '../src/db/migrate'
import { migrationProvider } from '../src/db/migrations/index'
import { TEST_DATABASE_URL, getTestDb } from './helpers'
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

/**
 * **빈 DB 로 뜬 것이 조용하면 안 된다.**
 *
 * 컨테이너 이름을 고정하지 않으므로(`README.md` 「컨테이너를 못 찾는다 / 포트가 이미 잡혀 있다 / 빈 DB 가 떴다」 절)
 * 워크트리마다 컨테이너를 띄우면 **빈 볼륨으로 뜨는 것이 정상 경로**이고, 사람은 그것을 *"설계서가 사라졌다"* 로 읽는다. 데이터는 사라진
 * 것이 아니라 **다른 이름의 볼륨**에 있다.
 */
describe('describeSchemaState — 빈 DB 를 말한다', () => {
  it('0 건이면 **빈 DB 라고 말하고 볼륨을 찾는 길을 든다** — 지우지 말라는 말이 먼저다', () => {
    const said = describeSchemaState(0)
    expect(said).toContain('0건')
    expect(said).toContain('빈 DB')
    expect(said).toContain('docker volume ls')
    expect(said).toContain('지우지 말고')
  })

  it('올라가 있으면 그 수만 말한다 — 정상 상태에 경고를 붙이지 않는다', () => {
    expect(describeSchemaState(11)).toBe('마이그레이션 11건')
    expect(describeSchemaState(1)).not.toContain('빈 DB')
  })

  it('**못 읽은 것과 0 건을 가른다** — 조치가 다르다', () => {
    // "빈 볼륨" 과 "DB 가 없다/안 떠 있다" 는 다음에 칠 명령이 다르다.
    expect(describeSchemaState(undefined)).not.toContain('0건')
    expect(describeSchemaState(undefined)).toContain('읽지 못했습니다')
  })
})

/**
 * **못 떴을 때 나오는 문장.** 빈 DB 에서는 `buildApp` 이 `themes` 에 쓰다 죽으므로
 * (실측 — `relation "themes" does not exist`) *뜬 뒤에 찍는 줄*은 0 건을 못 본다.
 * 사람이 실제로 읽는 것은 이 문장이다.
 */
describe('emptySchemaHint — 빈 DB 로 못 떴을 때만 말한다', () => {
  const 주소 = 'postgres://wirebound:s3cr3t-pw@127.0.0.1:5443/wb_a'

  it('0 건일 때 조치를 든다 — 올릴 명령과 "지우지 마라" 둘 다', () => {
    const hint = emptySchemaHint(0, 주소)
    expect(hint).toContain('비어 있습니다')
    expect(hint).toContain('pnpm --filter @wirebound/api migrate')
    expect(hint).toContain('지우지 말고')
    expect(hint).toContain('docker volume ls')
  })

  it('**0 건이 아니면 안 나선다** — 다른 실패에 이 말을 붙이면 엉뚱한 곳을 보게 된다', () => {
    // `missing-database-hint.ts` 가 `3D000` 에만 붙는 것과 같은 규칙이다.
    expect(emptySchemaHint(11, 주소)).toBeUndefined()
    expect(emptySchemaHint(1, 주소)).toBeUndefined()
    expect(emptySchemaHint(undefined, 주소)).toBeUndefined()
  })

  it('**자격 문자열은 안 싣는다** — 이 문장은 터미널에 남고 붙여넣어진다', () => {
    const hint = emptySchemaHint(0, 주소)
    expect(hint).toContain('127.0.0.1:5443/wb_a')
    expect(hint).not.toContain('s3cr3t-pw')
    expect(hint).not.toContain('postgres://')
  })
})

describe('countExecutedMigrations — 진짜 DB 에서 센다', () => {
  it('올라간 판에서 **올라간 수**를 낸다 — 파일 수가 아니라 실행된 수다', async () => {
    // 이 스위트가 도는 DB 는 `globalSetup` 이 latest 까지 올려 둔 것이라 **둘이 같다.**
    // 수를 손으로 적지 않는다 — 마이그레이션이 늘어도 안 낡는 불변식으로 잰다.
    const 전체 = Object.keys(await migrationProvider.getMigrations()).length
    expect(전체).toBeGreaterThan(0)
    expect(await countExecutedMigrations(getTestDb())).toBe(전체)
  })

  it('**올라간 것이 없으면 0 이다** — 파일 수(열하나)를 그대로 내면 빈 DB 를 못 알아본다', async () => {
    // 마이그레이션 표가 아예 없는 DB 로 잰다. 컨테이너의 관리용 `postgres` DB 가 그것이다 —
    // 읽기만 한다(`getMigrations()` 는 표가 없으면 만들지 않는다).
    const 관리용 = new URL(TEST_DATABASE_URL)
    관리용.pathname = '/postgres'
    const pool = createPool(관리용.toString())
    const db = createDb(pool)
    try {
      expect(await countExecutedMigrations(db)).toBe(0)
    } finally {
      await db.destroy()
    }
  })

  it('**아무것도 안 바꾼다** — 서버가 뜨는 길에 스키마를 건드리면 안 된다', async () => {
    const 표수 = async (): Promise<number> => {
      const { rows } = await sql<{
        n: number
      }>`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`.execute(getTestDb())
      return rows[0]?.n ?? -1
    }
    const 전 = await 표수()
    await countExecutedMigrations(getTestDb())
    expect(await 표수()).toBe(전)
  })
})

describe('main.ts 가 그것을 실제로 찍는가 — 소스에서 센다', () => {
  const main = stripComments(readFileSync(join(SRC_ROOT, 'main.ts'), 'utf8'))

  it('`describeDatabaseTarget` 을 부르는 자리가 `main.ts` 에 있다', () => {
    expect(main).toContain('describeDatabaseTarget(config.databaseUrl)')
  })

  it('`config.databaseUrl` 을 받는 자가 둘뿐이다 — 붙는 자와 가려서 찍는 자', () => {
    // **목록을 손으로 적지 않고 소스에서 센다.** `app.log.info(config.databaseUrl)`가
    // 들어오면 여기 `info`가 하나 더 붙어 이 케이스가 죽는다. **뒤에 인자가 더 붙어도 센다** —
    // `createPool`이 시간 제한을 둘째·셋째로 받는다. 끝을 `\)`로 못박으면 그 호출을 못 봐 빨강이 되고,
    // 거꾸로 `app.log.info(config.databaseUrl, …)`도 못 본다.
    const receivers = [...main.matchAll(/(\w+)\(config\.databaseUrl[,)]/g)].map((match) => match[1]).sort()
    expect(receivers).toEqual(['createPool', 'describeDatabaseTarget'])
  })

  it('템플릿 문자열에 그대로 끼워 넣지도 않는다', () => {
    expect(main).not.toMatch(/\$\{\s*config\.databaseUrl\s*\}/)
  })

  it('**스키마 상태를 같은 줄에 붙인다** — 뜬 뒤에 세는 자를 실제로 지난다', () => {
    // 규칙(`describeSchemaState`)에는 자가 촘촘한데 **꽂는 한 줄에 자가 없으면** 회귀가
    // 게이트 넷을 초록으로 지나간다. 여기는 서버를 띄워야만 도는 길이라 행동으로 못 재고 글자로 잰다.
    expect(main).toContain('describeSchemaState(')
    expect(main).toContain('await countExecutedMigrations(db)')
    expect(main).toMatch(/이 서버가 보는 DB:[^\n]*describeDatabaseTarget/)
    // 세어 놓고 안 쓰면 소용이 없다 — 두 조각이 **한 줄**에 있어야 사람이 함께 읽는다.
    const 찍는줄 = main.slice(main.indexOf('이 서버가 보는 DB:'))
    expect(찍는줄.slice(0, 240)).toContain('describeSchemaState(')
  })

  it('**못 떴을 때의 문장도 배선한다** — 이 줄이 빠지면 원문만 남는다', () => {
    // 이 케이스가 없으면 이 세 줄을 빼도 위의 케이스들이 전부 초록이다.
    // 빈 DB 는 워크트리마다 컨테이너를 띄우면 **정상 경로**라 여기가 조용하면 안 된다.
    expect(main).toContain('emptySchemaHint(await countExecutedMigrations(db), config.databaseUrl)')
    // 다른 실패는 원문 그대로 올라가야 한다 — 이 자가 모든 실패를 삼키면 안 된다.
    expect(main).toMatch(/if \(hint === undefined\) \{\s*throw error/)
    expect(main).toContain('new Error(hint, { cause: error })')
  })
})
