import { createDb, createPool } from '../src/db/client'
import { migrateToLatest } from '../src/db/migrate'
import { TEST_DATABASE_URL } from './helpers'

/** vitest가 api 프로젝트 전체 실행 전 딱 한 번 부른다. 테스트 DB를 최신 스키마로 맞춘다. */
export default async function setup(): Promise<void> {
  const pool = createPool(TEST_DATABASE_URL)
  const db = createDb(pool)
  try {
    await migrateToLatest(db)
  } finally {
    await db.destroy()
  }
}
