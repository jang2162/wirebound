import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { Database } from './types'
import type { DbHandle } from './tx'

/**
 * Postgres 커넥션 풀을 만든다.
 *
 * 풀의 생명주기는 호출자가 소유한다 — 이 함수는 풀을 만들 뿐 닫지 않는다.
 * `main.ts`(운영)와 테스트 하네스가 각각 정확히 한 번씩 만들고 정확히 한 번씩 닫는다.
 */
export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl })
}

/**
 * 풀 위에 Kysely 인스턴스를 올린다.
 *
 * `createDb`가 반환한 `Kysely`에 `destroy()`를 부르면 안의 풀이 닫힌다 —
 * 풀 자체를 직접 `pool.end()`로 닫을 필요는 없고, 대신 `db.destroy()` 쪽만
 * 정확히 한 번 부르면 된다. 호출자(운영에서는 `main.ts`, 테스트에서는 하네스)가
 * 그 "한 번"을 책임진다. `buildApp`은 자신이 만들지 않은 이 자원을 닫지 않는다.
 */
export function createDb(pool: Pool): DbHandle {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  })
}
