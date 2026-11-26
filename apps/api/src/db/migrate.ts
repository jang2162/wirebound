import { pathToFileURL } from 'node:url'
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from 'kysely'
import { loadConfig } from '../config'
import { createDb, createPool, verifyDbTimeLimits } from './client'
import { describeDatabaseTarget } from './describe-target'
import { runSeedStep, type SeedReporter } from './seed-user'
import type { DbHandle } from './tx'
import { migrationProvider } from './migrations/index'

/** CLI 가 받는 방향. `migrate latest` 와 `migrate:down` 둘뿐이다. */
export type MigrateDirection = 'latest' | 'down'

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
 * 말하는 근거다(`db/describe-schema-state.ts`).
 *
 * **아무것도 안 바꾼다.** kysely 의 `getMigrations()` 는 마이그레이션 표가 없으면
 * 만들지 않고 `executedAt: undefined` 로 낸다(0.28.17 의 소스에서 확인했다) — 서버가
 * 뜨는 길에 스키마를 건드리지 않는다는 뜻이다.
 *
 * **못 읽으면 던지지 않고 `undefined` 다.** DB 가 없거나 안 떠 있어도 서버는 떠야 한다 —
 * 풀은 게으르므로 그렇게 뜨고, 이 한 줄 때문에 그것이 바뀌면 안 된다.
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

/**
 * **마이그레이션 뒤의 계정 시딩 — `latest` 에서만 돈다**.
 *
 * 계정은 `migrate` 가 만들고(설계서 「권한 모델」), 스키마가 **다 올라간 뒤**여야 `users` 에
 * 쓸 수 있다. **`down` 에서는 안 돈다** — 내리는 길에 계정을 만들 이유가 없고, 계정을
 * 마이그레이션 안에 두지 않기로 한 판정(`db/seed-user.ts` 머리말)의 짝이 이 조건이다.
 *
 * **`main()` 안의 `if` 한 줄이 아니라 함수로 빼 둔 것은 자를 세우기 위해서다.** 그 조건이
 * 호출부에 인라인으로 있으면 **그 조건을 지우고도 스위트 전체가 초록이다** — `down` 이
 * 계정을 만들어도 아무 케이스도 안 죽는다. `test/user-creation-census.test.ts` 가 이 함수를
 * **양쪽 방향으로 실제로 불러** 잰다.
 *
 * 성공이면 `true`. `false` 면 호출자가 종료 코드 1을 낸다.
 */
export async function seedAfterMigration(
  direction: MigrateDirection,
  db: DbHandle,
  env: NodeJS.ProcessEnv,
  scryptN: number,
  report: SeedReporter,
): Promise<boolean> {
  if (direction !== 'latest') {
    return true
  }
  return runSeedStep(db, env, scryptN, report)
}

/**
 * **시작할 때 어느 DB 를 바꾸는지 한 줄로 말한다** — `main()` 의 첫 출력이다.
 *
 * 워크트리마다 DB 가 갈리므로 «어느 DB 였나»가 사람이 가장 먼저 물을 것인데, 성공한 `migrate` 는 그것을 어디에도
 * 안 남긴다 — 옆 워크트리의 `.env` 로 돌았어도 `마이그레이션 완료` 만 보인다. 서버가 뜰 때 찍는 `이 서버가 보는 DB:`
 * (`main.ts`)와 같은 값이다. **자격 문자열은 안 싣는다** — `describeDatabaseTarget` 이 `호스트:포트/이름`만 낸다.
 *
 * **이 줄이 못 보는 것:** 같은 컨테이너 안에서 두 워크트리의 DB 이름이 겹치는 판 · 에디터의 프록시가 옆 워크트리
 * api 에 붙는 판. 둘 다 이 줄이 «옳은 값»을 찍는 채로 일어나고, 워크트리 둘을 실제로 띄워야 보인다(docs/guides/development.md
 * 「워크트리를 여럿 띄울 때」).
 */
export function migrationTargetLine(direction: MigrateDirection, databaseUrl: string): string {
  return `마이그레이션(${direction}) 대상 DB: ${describeDatabaseTarget(databaseUrl)}`
}

async function main(): Promise<void> {
  const direction = process.argv[2]
  if (direction !== 'latest' && direction !== 'down') {
    console.error('사용법: tsx src/db/migrate.ts <latest|down>')
    process.exit(1)
  }

  const config = loadConfig()
  console.log(migrationTargetLine(direction, config.databaseUrl))
  const pool = createPool(config.databaseUrl, undefined, config.dbTimeLimits)
  const db = createDb(pool)
  try {
    try {
      // 실은 시간 제한이 걸리는지 한 번 잰다 — 앞단이 거절하면 마이그레이션 전에 멈춘다(`client.ts`의 `verifyDbTimeLimits`).
      await verifyDbTimeLimits(pool, config.dbTimeLimits, (message) => console.warn(message))
    } catch (error) {
      console.error(error)
      process.exitCode = 1
      return
    }
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

    // **계정 시딩은 여기다**. `latest` 냐 `down` 이냐를 가르는 것은
    // `seedAfterMigration` 이고 그쪽에 근거와 자가 있다 — **여기서 다시 가르지 않는다.**
    //
    // **`direction` 을 그대로 넘긴다.** 이 자리에 `'latest'` 를 박으면 `migrate:down` 이
    // 계정을 만든다 — `user-creation-census.test.ts` 가 이 줄을 소스에서 센다.
    //
    // **위 `try` 안에 넣지 않는다.** 시딩 실패를 *"마이그레이션 실패"* 로 찍으면 사람이
    // 마이그레이션을 다시 돌려야 하는지 알 수 없다 — 그 문장은 `runSeedStep` 이 소유한다.
    if (!(await seedAfterMigration(direction, db, process.env, config.passwordScryptN, console))) {
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
