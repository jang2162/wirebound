import { createDb, createPool } from '../src/db/client'
import { describeDatabaseTarget } from '../src/db/describe-target'
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
  } catch (error) {
    // **DB가 없을 때 고치는 한 줄을 여기 붙인다.** 워크트리마다 테스트 DB를 가르기로
    // 하면서(2026-08-19 D3) *"없는 DB를 가리킨 채 돌린다"*가 흔한 첫걸음이 됐다.
    // Postgres 원문(`database "…" does not exist`, SQLSTATE 3D000)은 이름은 말하지만
    // **어떻게 만드는지는 안 말한다** — 볼륨 초기화 스크립트가 처음에만 도는 함정과
    // 같은 부류다(최상위 README §6.4).
    throw new Error(`${missingDatabaseHint(error) ?? '테스트 DB 준비에 실패했습니다'}`, { cause: error })
  } finally {
    await db.destroy()
  }
}

/** `3D000`(존재하지 않는 DB)일 때만 조치를 붙인다. 다른 실패에까지 붙이면 엉뚱한 곳을 보게 된다. */
function missingDatabaseHint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || (error as { code?: unknown }).code !== '3D000') {
    return undefined
  }
  // `describeDatabaseTarget`은 `호스트:포트/이름`을 내므로 앞 조각을 떼면 이름이다.
  // **그 함수를 거치는 이유는 퍼센트 디코딩이다** — 안 거치면 한글 DB 이름이
  // `wb_%EC%95%84…`로 나와 **붙여넣을 수 없는 명령**을 권하게 된다(실측).
  const name = describeDatabaseTarget(TEST_DATABASE_URL).split('/').slice(1).join('/')
  return [
    `테스트 DB "${name}" 가 없습니다.`,
    '컨테이너 안에서 한 줄로 만든다:',
    `  docker exec wirebound-postgres psql -U wirebound -d postgres -c 'CREATE DATABASE ${name};'`,
    'TEST_DATABASE_URL 은 셸 → apps/api/.env → 기본값 순서로 정해진다.',
  ].join('\n')
}
