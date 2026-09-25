/**
 * **api 가 뜰 때 이 코드가 아는 마이그레이션과 DB 의 것을 견준다**(`src/db/schema-version.ts`의 표).
 *
 * 판정은 값으로(`schemaVerdict`), 읽기는 진짜 테스트 DB 로 잰다 — 뒤처진 · 순서가 어긋난 · 앞선 DB 는 트랜잭션 안에서 마이그레이션 표의 행을
 * 지우거나 더하고 되돌린다(테스트 DB 는 늘 최신이다 — `global-setup.ts`). `main.ts`가 그것을 `buildApp` 앞에서 부르는지는
 * 소스에서 센다 — 그 파일은 부팅해야 돈다. 진짜 프로세스 판(`tsx src/main.ts` · 종료 코드 · 찍는 줄)은 `schema-version.ts`의
 * 머리말이 든다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { emptySchemaHint } from '../src/db/describe-schema-state'
import { MIGRATIONS } from '../src/db/migrations/index'
import {
  SchemaVersionError,
  assertSchemaVersion,
  describeSchemaVerdict,
  describeTimestampOrderSlip,
  readExecutedMigrations,
  schemaVerdict,
  timestampOrderSlip,
} from '../src/db/schema-version'
import type { DbHandle } from '../src/db/tx'
import { getTestDb } from './helpers'
import { SRC_ROOT, stripComments } from './source-census'

const KNOWN = ['0001-a', '0002-b', '0003-c']
const URL = 'postgres://wirebound:secret-pass@127.0.0.1:5435/wirebound'
const LATEST = Object.keys(MIGRATIONS).at(-1)!

class Rollback extends Error {}

/** 트랜잭션 안에서 `change`를 한 뒤 `run`을 돌리고 되돌린다. */
async function withChangedTable<T>(change: (trx: DbHandle) => Promise<unknown>, run: (trx: DbHandle) => Promise<T>): Promise<T> {
  let result!: T
  await getTestDb()
    .transaction()
    .execute(async (trx) => {
      await change(trx)
      result = await run(trx)
      throw new Rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
  return result
}

describe('판정 — 머리말의 표', () => {
  it('전부 들었으면 뜬다', () => {
    expect(schemaVerdict(KNOWN, KNOWN)).toEqual({ kind: 'current' })
  })
  it('하나도 없으면 빈 DB 다', () => {
    expect(schemaVerdict([], KNOWN)).toEqual({ kind: 'empty' })
  })
  it('빠진 것이 있으면 뒤처졌다 — 빠진 것을 이름으로', () => {
    expect(schemaVerdict(['0001-a', '0002-b'], KNOWN)).toEqual({ kind: 'behind', pending: ['0003-c'] })
  })
  it('모르는 것을 들었으면 앞섰다', () => {
    expect(schemaVerdict([...KNOWN, '0004-d'], KNOWN)).toEqual({ kind: 'ahead', unknown: ['0004-d'] })
  })
  it('마지막으로 올라간 것보다 앞 이름이 빠졌으면 순서가 어긋났다 — 뒤처짐이 아니다', () => {
    expect(schemaVerdict(['0001-a', '0003-c'], KNOWN)).toEqual({ kind: 'unordered', stranded: ['0002-b'], later: ['0003-c'] })
    // 뒤에 오는 빠진 것은 함께 안 싣는다 — 그것은 순서가 맞으면 migrate 가 올린다.
    expect(schemaVerdict(['0002-b'], [...KNOWN, '0004-d'])).toEqual({ kind: 'unordered', stranded: ['0001-a'], later: ['0002-b'] })
  })
  it('빠진 것이 전부 마지막 것 뒤면 뒤처졌다 — 이름은 kysely 처럼 코드 단위로 견준다', () => {
    // kysely 가 올리는 순서(`sort()` — 코드 단위)에서는 '0002-B' 가 '0002-a' 앞이다. 로캘 비교(`localeCompare`)는 거꾸로라 두 판이 뒤집힌다.
    expect(schemaVerdict(['0001-a', '0002-a'], ['0001-a', '0002-a', '0002-B'])).toEqual({ kind: 'unordered', stranded: ['0002-B'], later: ['0002-a'] })
    expect(schemaVerdict(['0001-a', '0002-B'], ['0001-a', '0002-a', '0002-B'])).toEqual({ kind: 'behind', pending: ['0002-a'] })
  })
  it('둘 다면 갈라졌다', () => {
    expect(schemaVerdict(['0001-a', '0002-b', '0009-z'], KNOWN)).toEqual({ kind: 'diverged', pending: ['0003-c'], unknown: ['0009-z'] })
  })
})

describe('말 — 멈출지 · 경고할지', () => {
  it('뒤처졌으면 멈추고 migrate 를 권한다 · 자격 문자열은 안 싣는다', () => {
    const said = describeSchemaVerdict({ kind: 'behind', pending: ['0003-c'] }, URL)
    expect(said).toEqual({ stop: expect.stringContaining('pnpm --filter @wirebound/api migrate') })
    expect(JSON.stringify(said)).toContain('0003-c')
    expect(JSON.stringify(said)).not.toContain('secret-pass')
  })
  it('앞섰으면 멈추지 않고 경고한다 · 내리기를 권하지 않는다', () => {
    const said = describeSchemaVerdict({ kind: 'ahead', unknown: ['0004-d'] }, URL)
    expect(said).toEqual({ warn: expect.stringContaining('0004-d') })
    expect(JSON.stringify(said)).not.toMatch(/migrate:down/)
  })
  it('순서가 어긋났으면 멈추고 migrate 를 권하지 않는다 — 이 코드로는 올리기도 내리기도 안 된다', () => {
    const said = describeSchemaVerdict({ kind: 'unordered', stranded: ['0002-b'], later: ['0003-c'] }, URL)
    expect(said).toEqual({ stop: expect.stringContaining('순서가 어긋났습니다') })
    const text = (said as { stop: string }).stop
    expect(text).toContain('0002-b')
    expect(text).toContain('0003-c')
    expect(text).not.toContain('올린 뒤에 띄우십시오')
    expect(text).not.toContain('secret-pass')
  })
  it('갈라졌으면 멈춘다', () => {
    expect(describeSchemaVerdict({ kind: 'diverged', pending: ['0003-c'], unknown: ['0009-z'] }, URL)).toEqual({ stop: expect.stringContaining('0009-z') })
  })
  it('빈 DB 는 빈 DB 의 말 그대로 멈춘다', () => {
    expect(describeSchemaVerdict({ kind: 'empty' }, URL)).toEqual({ stop: emptySchemaHint(0, URL) })
  })
  it('최신이면 아무 말도 없다', () => {
    expect(describeSchemaVerdict({ kind: 'current' }, URL)).toBeNull()
  })
})

describe('올린 시각의 순서 — kysely 가 읽는 순서', () => {
  const at = (name: string, timestamp: string) => ({ name, timestamp })

  it('시각 순이 이름 순과 같으면 말할 것이 없다', () => {
    expect(timestampOrderSlip([at('0001-a', '2026-01-01T00:00:00.000Z'), at('0002-b', '2026-01-01T00:00:00.001Z')])).toBeNull()
  })
  it('뒤 이름이 앞 시각이면 처음 갈리는 자리를 든다', () => {
    const rows = [at('0001-a', '2026-01-01T00:00:00.000Z'), at('0002-b', '2026-01-01T00:00:00.001Z'), at('0003-c', '2000-01-01T00:00:00.000Z')]
    expect(timestampOrderSlip(rows)).toEqual({ index: 0, byTime: '0003-c', byName: '0001-a' })
  })
  it('시각 글자가 같으면 kysely 처럼 이름을 localeCompare 로 가른다 — 코드 단위 순과 갈리는 이름이면 어긋남이다', () => {
    const same = '2026-01-01T00:00:00.000Z'
    expect(timestampOrderSlip([at('0001-a', same), at('0002-b', same)])).toBeNull()
    // localeCompare 는 'a' 를 'B' 앞에, sort() 는 'B' 를 'a' 앞에 둔다.
    expect(timestampOrderSlip([at('0002-a', same), at('0002-B', same)])).toEqual({ index: 0, byTime: '0002-a', byName: '0002-B' })
  })
  it('말은 다음 migrate 가 죽는다는 것과 두 이름을 싣고 자격 문자열은 안 싣는다', () => {
    const text = describeTimestampOrderSlip({ index: 0, byTime: '0003-c', byName: '0001-a' }, URL)
    expect(text).toContain('corrupted migrations')
    expect(text).toContain('0003-c')
    expect(text).toContain('0001-a')
    expect(text).not.toContain('secret-pass')
  })
})

describe('진짜 DB 에서 읽는다', () => {
  it('테스트 DB 는 이 코드가 아는 것을 전부 들었다', async () => {
    const executed = await readExecutedMigrations(getTestDb())
    expect(executed).toEqual(Object.keys(MIGRATIONS))
    expect(schemaVerdict(executed!)).toEqual({ kind: 'current' })
  })

  it('마지막 것이 빠지면 뒤처졌다 — 기동이 멈춘다', async () => {
    const outcome = await withChangedTable(
      (trx) => sql`delete from kysely_migration where name = ${LATEST}`.execute(trx),
      async (trx) => {
        const warned: string[] = []
        const thrown = await assertSchemaVersion(trx, URL, (message) => warned.push(message)).catch((error: unknown) => error)
        return { thrown, warned }
      },
    )
    expect(outcome.thrown).toBeInstanceOf(SchemaVersionError)
    expect((outcome.thrown as Error).message).toContain(LATEST)
    expect(outcome.warned).toEqual([])
  })

  /** 가운데 하나를 뺀 판 — kysely 의 `migrate`는 이 DB 에서 `corrupted migrations`로 죽는다(머리말). */
  it('가운데 것이 빠지면 순서가 어긋났다 — 기동이 멈추고 migrate 를 권하지 않는다', async () => {
    const [, middle] = Object.keys(MIGRATIONS)
    const outcome = await withChangedTable(
      (trx) => sql`delete from kysely_migration where name = ${middle}`.execute(trx),
      async (trx) => {
        const warned: string[] = []
        const thrown = await assertSchemaVersion(trx, URL, (message) => warned.push(message)).catch((error: unknown) => error)
        return { thrown, warned }
      },
    )
    expect(outcome.thrown).toBeInstanceOf(SchemaVersionError)
    expect((outcome.thrown as Error).message).toContain('순서가 어긋났습니다')
    expect((outcome.thrown as Error).message).toContain(middle)
    expect((outcome.thrown as Error).message).toContain(LATEST)
    expect(outcome.warned).toEqual([])
  })

  /** 시계가 뒤처진 호스트가 마지막 것을 올린 판 — kysely 의 `migrate`는 이 DB 에서 `corrupted migrations`로 죽는다(머리말). */
  it('마지막 것의 올린 시각이 앞서면 뜨되 한 줄 경고한다 — 다음 migrate 가 죽는다고', async () => {
    const outcome = await withChangedTable(
      (trx) => sql`update kysely_migration set timestamp = '2000-01-01T00:00:00.000Z' where name = ${LATEST}`.execute(trx),
      async (trx) => {
        const warned: string[] = []
        const thrown = await assertSchemaVersion(trx, URL, (message) => warned.push(message)).catch((error: unknown) => error)
        return { thrown, warned }
      },
    )
    expect(outcome.thrown).toBeUndefined()
    expect(outcome.warned).toHaveLength(1)
    expect(outcome.warned[0]).toContain('corrupted migrations')
    expect(outcome.warned[0]).toContain(LATEST)
  })

  it('모르는 것이 하나 더 있으면 앞섰다 — 뜨되 한 줄 경고한다', async () => {
    const outcome = await withChangedTable(
      (trx) => sql`insert into kysely_migration (name, timestamp) values ('9999-from-a-newer-branch', now()::text)`.execute(trx),
      async (trx) => {
        const warned: string[] = []
        const thrown = await assertSchemaVersion(trx, URL, (message) => warned.push(message)).catch((error: unknown) => error)
        return { thrown, warned }
      },
    )
    expect(outcome.thrown).toBeUndefined()
    expect(outcome.warned).toHaveLength(1)
    expect(outcome.warned[0]).toContain('9999-from-a-newer-branch')
  })
})

describe('main.ts 가 그것을 buildApp 앞에서 부른다 — 소스에서 센다', () => {
  const main = stripComments(readFileSync(join(SRC_ROOT, 'main.ts'), 'utf8'))

  it('`assertSchemaVersion(db, config.databaseUrl, …)` 가 `listen(` 보다 앞이다', () => {
    const check = main.search(/assertSchemaVersion\s*\(\s*db\s*,\s*config\s*\.\s*databaseUrl\s*,/)
    const boot = main.search(/await\s+listen\s*\(/)
    expect(check).toBeGreaterThan(-1)
    expect(boot).toBeGreaterThan(check)
  })
})
