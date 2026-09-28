import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildTheme } from '@wirebound/theme-kit'
import { DEFAULT_SYSTEM_THEMES_DIR } from '../src/config'
import { createDb, createPool } from '../src/db/client'
import { migrateToLatest, migrateToNone } from '../src/db/migrate'
import { seedSystemThemes } from '../src/services/system-themes'
import { TEST_DATABASE_URL } from './helpers'
import { missingDatabaseHint } from './missing-database-hint'

/**
 * **시스템 테마를 실행마다 다시 빌드한다** — 모든 테스트 앱이 `buildApp` 의 기동 시딩을 지나고, 시딩은 `system-themes/*\/dist` 를 읽는다.
 * 앞에 남은 산출물을 믿으면 소스를 고친 뒤 옛 판으로 잰다(생성물이 gitignore 라 아무 경고가 없다). 빌드는 같은 입력이면 같은 바이트다.
 * **`dist` 를 먼저 비운다** — 패키지의 `build` 스크립트와 같다(`system-themes/admin/package.json`). 판을 올린 뒤 옛 판 이름의 산출물이
 * 남으면 시딩이 그것까지 읽는다(A3 리뷰 5b′ · 5c′).
 */
async function buildSystemThemes(): Promise<void> {
  const started = Date.now()
  const root = join(DEFAULT_SYSTEM_THEMES_DIR, 'admin')
  rmSync(join(root, 'dist'), { recursive: true, force: true })
  await buildTheme({ root, entry: 'src/theme.tsx' })
  console.log(`[global-setup] system-admin 빌드 ${Date.now() - started}ms`)
}

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
  await buildSystemThemes()
  const pool = createPool(TEST_DATABASE_URL)
  const db = createDb(pool)
  try {
    await migrateToLatest(db)
    await migrateToNone(db)
    await migrateToLatest(db)
    // **시딩을 여기서 한 번 커밋해 둔다.** 안 해 두면 첫 `withApi` 앱이 제 트랜잭션 안에서 system-admin 을 넣고, 그 트랜잭션이 열린
    // 동안 풀 위에 선 다른 앱의 시딩이 같은 키에서 줄을 서 — 한 케이스가 두 앱을 세우면 스스로를 기다린다.
    await seedSystemThemes(db, DEFAULT_SYSTEM_THEMES_DIR)
  } catch (error) {
    // **DB가 없을 때 고치는 한 줄을 붙인다.** 워크트리마다 테스트 DB가 갈리므로
    // *"없는 DB를 가리킨 채 돌린다"*가 흔한 첫걸음이다.
    // Postgres 원문(`database "…" does not exist`)은 이름은 말하지만 **어떻게 만드는지는
    // 안 말한다** — 볼륨 초기화 스크립트가 처음에만 도는 함정과 같은 부류다(README.md
    // 「테스트가 이유를 알기 어려운 접속 에러로 죽는다」 절).
    //
    // **문구를 만드는 자는 `missing-database-hint.ts`이고 그쪽에 자가 있다.** 이 `catch`는
    // 마이그레이션이 실패해야만 지나는 길이라 케이스가 여기 못 닿는다 — 문구 로직을 여기
    // 두면 관문을 바꾸든 자격 문자열을 싣든 어떤 케이스도 죽지 않는다.
    //
    // `cause`로 원문을 매단다. `3D000`이 아닌 실패(비밀번호 오류 등)는 겉면이 일반 문장이지만
    // `Caused by:`가 원인을 그대로 낸다.
    throw new Error(missingDatabaseHint(error, TEST_DATABASE_URL) ?? '테스트 DB 준비에 실패했습니다', {
      cause: error,
    })
  } finally {
    await db.destroy()
  }
}
