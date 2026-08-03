import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import type { ApiConfig } from '../src/config'
import { loadConfig } from '../src/config'
import { createDb, createPool } from '../src/db/client'
import type { DbHandle } from '../src/db/tx'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test'

export interface TestContext {
  app: FastifyInstance
  db: DbHandle
}

let testDb: DbHandle | undefined

/** 테스트 전체가 공유하는 DB 핸들을 모듈 스코프에 지연 생성해 재사용한다. */
export function getTestDb(): DbHandle {
  if (!testDb) {
    testDb = createDb(createPool(TEST_DATABASE_URL))
  }
  return testDb
}

/** `getTestDb()`가 만든 풀을 닫는다. 테스트 파일 하나가 끝날 때(`afterAll`) 한 번 부른다. */
export async function closeTestDb(): Promise<void> {
  if (testDb) {
    await testDb.destroy()
    testDb = undefined
  }
}

/** `PASSWORD_SCRYPT_N`을 1024로 낮춘 테스트용 `ApiConfig`.
 * 기본값(32768)은 scrypt 해시 한 번에 50ms 이상 걸려, 로그인이 등장하는
 * 테스트마다 그 비용이 누적되면 스위트 전체가 느려진다. */
export function testConfig(): ApiConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    PASSWORD_SCRYPT_N: '1024',
  })
}

/** 롤백 신호 전용 에러. `withApi` 밖으로 새어 나가지 않고 아래에서 삼켜진다. */
class Rollback extends Error {}

/**
 * 테스트 하나를 트랜잭션으로 감싸고 끝나면 롤백한다.
 * 앱은 그 트랜잭션 핸들을 db로 받으므로 커밋되는 것이 없다.
 *
 * Kysely의 `transaction().execute()`는 콜백이 정상 반환하면 커밋하므로, 롤백하려면
 * 던지는 수밖에 없다 — `fn`이 끝나면 항상 `Rollback`을 던지고, 그 트랜잭션을 감싼
 * `catch`가 `Rollback`만 골라 삼킨다. `fn`이 진짜 에러를 던졌다면 그 에러가 트랜잭션의
 * 롤백을 유발한 뒤 `Rollback`이 아니므로 그대로 다시 던져져 호출자에게 보인다.
 *
 * `app.ready()`를 부르지 않는다. Fastify 5는 ready 이후 라우트 등록을 거부하는데,
 * 여러 테스트가 인증 훅 같은 것을 확인하려고 임시 라우트를 등록한다.
 * `inject()`가 첫 호출에서 알아서 ready를 태우므로 미리 부를 이유도 없다.
 */
export async function withApi(fn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const db = getTestDb()
  try {
    await db.transaction().execute(async (trx) => {
      const app = await buildApp({ db: trx, config: testConfig() })
      try {
        await fn({ app, db: trx })
      } finally {
        await app.close()
      }
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}
