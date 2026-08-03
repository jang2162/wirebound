import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { MIGRATIONS } from '../src/db/migrations/index'
import { withTransaction } from '../src/db/tx'
import { getTestDb, withApi } from './helpers'

describe('마이그레이션 레지스트리', () => {
  it('키가 오름차순으로 정렬되어 있다', () => {
    const keys = Object.keys(MIGRATIONS)
    expect(keys).toEqual([...keys].sort())
  })

  it('모든 마이그레이션이 up과 down을 갖는다', () => {
    for (const [name, migration] of Object.entries(MIGRATIONS)) {
      expect(typeof migration.up, `${name}의 up`).toBe('function')
      expect(typeof migration.down, `${name}의 down`).toBe('function')
    }
  })
})

describe('스키마', () => {
  it('users와 sessions 테이블이 있다', async () => {
    await withApi(async ({ db }) => {
      const rows = await sql<{ table_name: string }>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      `.execute(db)
      const names = rows.rows.map((r) => r.table_name)
      expect(names).toContain('users')
      expect(names).toContain('sessions')
    })
  })

  it('users.email에 UNIQUE 제약이 걸려 있다', async () => {
    await withApi(async ({ db }) => {
      await db.insertInto('users')
        .values({ email: 'dup@example.com', name: '갑', password_hash: 'x' })
        .execute()
      await expect(
        db.insertInto('users')
          .values({ email: 'dup@example.com', name: '을', password_hash: 'y' })
          .execute(),
      ).rejects.toThrow()
    })
  })

  it('사용자를 지우면 세션이 함께 지워진다', async () => {
    await withApi(async ({ db }) => {
      const user = await db.insertInto('users')
        .values({ email: 'cascade@example.com', name: '병', password_hash: 'x' })
        .returning('id').executeTakeFirstOrThrow()
      await db.insertInto('sessions')
        .values({ id: 'sess-1', user_id: user.id, expires_at: new Date(Date.now() + 3_600_000) })
        .execute()

      await db.deleteFrom('users').where('id', '=', user.id).execute()

      const left = await db.selectFrom('sessions').selectAll().execute()
      expect(left).toHaveLength(0)
    })
  })
})

describe('withApi 격리', () => {
  it('한 테스트가 넣은 행이 다음 테스트에 보이지 않는다', async () => {
    await withApi(async ({ db }) => {
      await db.insertInto('users')
        .values({ email: '격리@example.com', name: '정', password_hash: 'x' })
        .execute()
      const found = await db.selectFrom('users').selectAll().where('email', '=', '격리@example.com').execute()
      expect(found).toHaveLength(1)
    })

    // 앞의 withApi가 롤백되었으므로 새 트랜잭션에서는 없어야 한다.
    await withApi(async ({ db }) => {
      const found = await db.selectFrom('users').selectAll().where('email', '=', '격리@example.com').execute()
      expect(found).toHaveLength(0)
    })
  })

  it('앱이 db 데코레이터로 같은 트랜잭션을 본다', async () => {
    await withApi(async ({ app, db }) => {
      expect(app.db).toBe(db)
      expect(app.db.isTransaction).toBe(true)
    })
  })
})

describe('withTransaction', () => {
  it('이미 트랜잭션 안이면 새 트랜잭션을 열지 않는다', async () => {
    await withApi(async ({ db }) => {
      let inner: unknown
      await withTransaction(db, async (trx) => {
        inner = trx
      })
      expect(inner).toBe(db)
    })
  })

  it('트랜잭션 밖에서는 새로 연다', async () => {
    // getTestDb()는 트랜잭션이 아니다.
    const root = getTestDb()
    expect(root.isTransaction).toBe(false)
    await withTransaction(root, async (trx) => {
      expect(trx.isTransaction).toBe(true)
      // 아무것도 쓰지 않는다. 이 테스트는 커밋된다.
    })
  })

  it('중첩 상태에서 제약 위반이 나도 세이브포인트가 트랜잭션을 오염되지 않게 지킨다', async () => {
    // withTransaction 없이 raw db로 이 위반을 직접 냈다면, 이후 이 트랜잭션 위의
    // 모든 쿼리가 실제 내용과 무관하게 `25P02 current transaction is aborted`로
    // 실패했을 것이다 — SAVEPOINT 없이는 이 테스트 자체가 통과할 수 없는 대목이다.
    await withApi(async ({ db }) => {
      await db.insertInto('users')
        .values({ email: 'savepoint@example.com', name: '무', password_hash: 'x' })
        .execute()

      await expect(
        withTransaction(db, async (trx) => {
          await trx.insertInto('users')
            .values({ email: 'savepoint@example.com', name: '중복', password_hash: 'y' })
            .execute()
        }),
      ).rejects.toThrow()

      // 복구됐다면 이 쿼리는 정상 실행되고, 세이브포인트 이전에 넣은 행 하나만 보여야 한다.
      const rows = await db.selectFrom('users').selectAll()
        .where('email', '=', 'savepoint@example.com').execute()
      expect(rows).toHaveLength(1)
    })
  })
})

describe('withApi 에러 전파', () => {
  it('테스트가 던진 진짜 에러는 그대로 밖으로 나온다', async () => {
    // withApi 내부의 `catch (error) { if (!(error instanceof Rollback)) throw error }`가
    // 언젠가 `catch {}`처럼 전부 삼키는 코드로 퇴행하면, 이 테스트를 포함해 withApi를
    // 쓰는 모든 테스트의 실패가 조용히 사라진다 — 그런 퇴행을 여기서 잡는다.
    await expect(
      withApi(async () => {
        throw new Error('의도된 실패')
      }),
    ).rejects.toThrow('의도된 실패')
  })
})
