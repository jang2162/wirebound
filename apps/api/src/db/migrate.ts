import { pathToFileURL } from 'node:url'
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from 'kysely'
import { loadConfig } from '../config'
import { createDb, createPool } from './client'
import { runSeedStep } from './seed-user'
import type { DbHandle } from './tx'
import { migrationProvider } from './migrations/index'

function buildMigrator(db: DbHandle): Migrator {
  return new Migrator({ db, provider: migrationProvider })
}

/**
 * 마이그레이션 결과를 사람이 읽을 수 있게 콘솔에 찍는다.
 * `resultSet.error`가 있으면(=마이그레이션 하나라도 실패) 그 값을 그대로 던진다 —
 * 호출자가 "실패했다"는 사실을 잡아 exit 코드나 상위 실패로 이어갈 수 있도록.
 */
function report(resultSet: MigrationResultSet): void {
  for (const result of resultSet.results ?? []) {
    if (result.status === 'Success') {
      console.log(`  ✓ ${result.direction} ${result.migrationName}`)
    } else if (result.status === 'Error') {
      console.error(`  ✗ ${result.direction} ${result.migrationName}`)
    }
  }
  if (resultSet.error) {
    throw resultSet.error
  }
}

/**
 * 아직 실행되지 않은 마이그레이션을 전부 최신까지 올린다.
 * 테스트 `global-setup.ts`가 이 함수를 직접 부른다 — CLI를 거치지 않는다.
 */
export async function migrateToLatest(db: DbHandle): Promise<void> {
  report(await buildMigrator(db).migrateToLatest())
}

/**
 * **이 DB 에 올라가 있는 마이그레이션이 몇 건인가.** 서버가 뜰 때 *"빈 DB 입니다"* 를
 * 말하는 근거다(2026-08-19 D3 — `db/describe-schema-state.ts`).
 *
 * **아무것도 안 바꾼다.** kysely 의 `getMigrations()` 는 마이그레이션 표가 없으면
 * 만들지 않고 `executedAt: undefined` 로 낸다(0.28.17 의 소스에서 확인했다) — 서버가
 * 뜨는 길에 스키마를 건드리지 않는다는 뜻이다.
 *
 * **못 읽으면 던지지 않고 `undefined` 다.** DB 가 없거나 안 떠 있어도 서버는 떠야 한다 —
 * 오늘도 그렇고(풀은 게으르다), 이 한 줄 때문에 그것이 바뀌면 안 된다.
 */
export async function countExecutedMigrations(db: DbHandle): Promise<number | undefined> {
  try {
    const migrations = await buildMigrator(db).getMigrations()
    return migrations.filter((migration) => migration.executedAt !== undefined).length
  } catch {
    return undefined
  }
}

/** 가장 최근에 실행된 마이그레이션 하나를 내린다. */
export async function migrateDown(db: DbHandle): Promise<void> {
  report(await buildMigrator(db).migrateDown())
}

/**
 * 실행된 마이그레이션을 전부 내린다(빈 스키마까지).
 *
 * `test/global-setup.ts`가 전체 실행 전에 latest→none→latest 한 사이클을 돌려
 * **모든** 마이그레이션의 `down`이 실제로 동작하는지 매번 검증하는 데 쓴다.
 * `down`이 있다는 것(`typeof migration.down === 'function'`)과 그 `down`이
 * 첫 문장에서 죽지 않고 끝까지 도는 것은 다른 성질이다 — 후자를 이 함수로 확인한다.
 */
export async function migrateToNone(db: DbHandle): Promise<void> {
  report(await buildMigrator(db).migrateTo(NO_MIGRATIONS))
}

async function main(): Promise<void> {
  const direction = process.argv[2]
  if (direction !== 'latest' && direction !== 'down') {
    console.error('사용법: tsx src/db/migrate.ts <latest|down>')
    process.exit(1)
  }

  const config = loadConfig()
  const pool = createPool(config.databaseUrl)
  const db = createDb(pool)
  try {
    try {
      if (direction === 'latest') {
        await migrateToLatest(db)
      } else {
        await migrateDown(db)
      }
      console.log('마이그레이션 완료')
    } catch (error) {
      console.error('마이그레이션 실패:', error)
      process.exitCode = 1
      return
    }

    // **계정 시딩은 여기다**(2026-08-20 D3). 사용자가 *"db 마이그레이션 할 때"*라고
    // 정했고, 스키마가 **다 올라간 뒤**여야 `users` 에 쓸 수 있다.
    //
    // **`down` 에서는 안 돈다.** 내리는 길에 계정을 만들 이유가 없고, 계정을 마이그레이션
    // 안에 두지 않기로 한 판정(`db/seed-user.ts` 머리말)의 짝이 이 조건이다 —
    // `migrate:down` 은 계정을 안 건드린다.
    //
    // **위 `try` 안에 넣지 않는다.** 시딩 실패를 *"마이그레이션 실패"* 로 찍으면 사람이
    // 마이그레이션을 다시 돌려야 하는지 알 수 없다 — 그 문장은 `runSeedStep` 이 소유한다.
    if (direction === 'latest' && !(await runSeedStep(db, process.env, config.passwordScryptN, console))) {
      process.exitCode = 1
    }
  } finally {
    await db.destroy()
  }
}

// CLI로 직접 실행됐을 때만 돈다 — `global-setup.ts`가 `migrateToLatest`만 import할 때는
// 이 아래가 실행되지 않는다.
// `import.meta.url`은 항상 URL로 인코딩되어 있다(공백은 `%20`, 비ASCII는 퍼센트 인코딩).
// `process.argv[1]`은 인코딩되지 않은 원시 파일시스템 경로다. 체크아웃 경로에 공백이나
// 한글이 섞여 있으면(이 저장소에서 실제로 있을 법하다) `file://${process.argv[1]}`처럼
// 문자열을 그냥 이어붙인 비교는 항상 false가 되어 `main()`이 조용히 실행되지 않는다 —
// `pnpm migrate`가 exit 0을 내고 아무것도 안 하는데, 개발자는 성공으로 오해하고 나중에
// "relation users does not exist"에서야 문제를 발견한다. `pathToFileURL`로 양쪽을 같은
// 인코딩 규칙으로 맞춰 비교한다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
