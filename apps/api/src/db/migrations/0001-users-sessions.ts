import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `users`·`sessions` 테이블을 만든다.
 *
 * `gen_random_uuid()`는 Postgres 13+ 내장 함수라 확장(`pgcrypto` 등)을 켤 필요가 없다.
 * `sessions.id`는 uuid가 아니라 text다 — 쿠키 토큰의 sha256 hex를 저장한다(설계 §4.2).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('users')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('password_hash', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createTable('sessions')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('last_seen_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema.createIndex('sessions_user_id_idx').on('sessions').column('user_id').execute()
    await db.schema.createIndex('sessions_expires_at_idx').on('sessions').column('expires_at').execute()
  },

  // 모든 마이그레이션은 down을 갖는다. 역순(sessions → users)으로 DROP한다 —
  // sessions.user_id가 users.id를 참조하므로 순서를 바꾸면 FK 위반으로 실패한다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('sessions').execute()
    await db.schema.dropTable('users').execute()
  },
}
