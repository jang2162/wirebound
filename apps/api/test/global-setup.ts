import { createDb, createPool } from '../src/db/client'
import { migrateToLatest, migrateToNone } from '../src/db/migrate'
import { TEST_DATABASE_URL } from './helpers'
import { missingDatabaseHint } from './missing-database-hint'

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
  } catch (error) {
    // **DB가 없을 때 고치는 한 줄을 붙인다.** 워크트리마다 테스트 DB를 가르기로
    // 하면서(2026-08-19 D3) *"없는 DB를 가리킨 채 돌린다"*가 흔한 첫걸음이 됐다.
    // Postgres 원문(`database "…" does not exist`)은 이름은 말하지만 **어떻게 만드는지는
    // 안 말한다** — 볼륨 초기화 스크립트가 처음에만 도는 함정과 같은 부류다(README §6.4).
    //
    // **문구를 만드는 자는 `missing-database-hint.ts`이고 그쪽에 자가 있다.** 이 `catch`는
    // 마이그레이션이 실패해야만 지나는 길이라 케이스가 여기 못 닿는다 — 앞 판이 여기 두었다가
    // 변이 둘이 살아남았다(귀속: 리뷰 §9 R5·R6).
    //
    // `cause`로 원문을 매단다. `3D000`이 아닌 실패는 겉면이 일반 문장이지만
    // `Caused by:`가 원인을 그대로 낸다(리뷰가 비밀번호 오류로 확인했다 — 리뷰 §4.2).
    throw new Error(missingDatabaseHint(error, TEST_DATABASE_URL) ?? '테스트 DB 준비에 실패했습니다', {
      cause: error,
    })
  } finally {
    await db.destroy()
  }
}
