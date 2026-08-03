import { pathToFileURL } from 'node:url'
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from 'kysely'
import { loadConfig } from '../config'
import { createDb, createPool } from './client'
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
    if (direction === 'latest') {
      await migrateToLatest(db)
    } else {
      await migrateDown(db)
    }
    console.log('마이그레이션 완료')
  } catch (error) {
    console.error('마이그레이션 실패:', error)
    process.exitCode = 1
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
