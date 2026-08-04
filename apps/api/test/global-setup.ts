import { createDb, createPool } from '../src/db/client'
import { migrateToLatest, migrateToNone } from '../src/db/migrate'
import { TEST_DATABASE_URL } from './helpers'

/**
 * vitest가 api 프로젝트 전체 실행 전 딱 한 번 부른다.
 *
 * latest → none → latest 한 사이클을 돈다. 단순히 최신까지 올리기만 하면
 * `down`이 있다는 것(타입 체크)만 확인될 뿐, 그 `down`이 실제로 첫 문장에서
 * 죽지 않고 끝까지 실행되는지는 아무도 확인하지 않는다. 마이그레이션이 늘어날수록
 * 그 공백이 커지므로, 매 실행마다 전체 다운을 한 번 왕복시켜
 * 깨진 `down`을 그 자리에서, 크게 실패하게 만든다. 스키마가 작아 비용은
 * 무시할 만하다.
 */
export default async function setup(): Promise<void> {
  const pool = createPool(TEST_DATABASE_URL)
  const db = createDb(pool)
  try {
    await migrateToLatest(db)
    await migrateToNone(db)
    await migrateToLatest(db)
  } finally {
    await db.destroy()
  }
}
