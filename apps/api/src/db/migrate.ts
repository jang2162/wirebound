import { Migrator, type MigrationResultSet } from 'kysely'
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
if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
