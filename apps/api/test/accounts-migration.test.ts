/**
 * **0034 — 계정**(`src/db/migrations/0034-accounts.ts`). 올리면 표 셋 · `users` 의 칸 셋이 서고, 내리면 다 걷힌다.
 *
 * **이 파일은 제 DB 를 만든다** — `migration-0018.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 */
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0034_${process.pid}_${Date.now()}`
const url = (() => {
  const parsed = new URL(TEST_DATABASE_URL)
  parsed.pathname = `/${DATABASE}`
  return parsed.toString()
})()

let admin: DbHandle
let db: DbHandle

beforeAll(async () => {
  admin = createDb(createPool(TEST_DATABASE_URL))
  await sql.raw(`CREATE DATABASE "${DATABASE}"`).execute(admin)
  db = createDb(createPool(url))
})

afterAll(async () => {
  await db?.destroy()
  await sql.raw(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`).execute(admin)
  await admin?.destroy()
})

async function migrateTo(name: string | typeof NO_MIGRATIONS): Promise<void> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateTo(name)
  if (result.error !== undefined) throw result.error
}

const TABLES = ['invites', 'password_resets', 'admin_audit']
const USER_COLUMNS = ['deactivated_at', 'invite_id', 'last_seen_at']

async function tablesPresent(): Promise<string[]> {
  const rows = await sql<{ name: string }>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_name in (${sql.join(TABLES)}) order by table_name`.execute(db)
  return rows.rows.map((row) => row.name)
}

async function userColumnsPresent(): Promise<string[]> {
  const rows = await sql<{ name: string }>`
    select column_name as name from information_schema.columns
    where table_name = 'users' and column_name in (${sql.join(USER_COLUMNS)}) order by column_name`.execute(db)
  return rows.rows.map((row) => row.name)
}

describe('0034 — 계정', () => {
  it('올리면 표 셋 · 사용자 칸 셋이 선다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0033-modal-popup')
    expect(await tablesPresent()).toEqual([])
    expect(await userColumnsPresent()).toEqual([])
    await migrateTo('0034-accounts')
    expect(await tablesPresent()).toEqual(['admin_audit', 'invites', 'password_resets'])
    expect(await userColumnsPresent()).toEqual(['deactivated_at', 'invite_id', 'last_seen_at'])
  })

  it('이미 있는 사용자는 활성 · 초대 없음 · 접속 기록 없음으로 선다', async () => {
    await migrateTo('0033-modal-popup')
    await sql`insert into users (email, name, password_hash) values ('old@example.com', '옛 사람', 'x')`.execute(db)
    await migrateTo('0034-accounts')
    const row = await sql<{ deactivated_at: Date | null; invite_id: string | null; last_seen_at: Date | null }>`
      select deactivated_at, invite_id, last_seen_at from users where email = 'old@example.com'`.execute(db)
    expect(row.rows).toEqual([{ deactivated_at: null, invite_id: null, last_seen_at: null }])
  })

  it('초대 링크를 지우면 들어온 사람의 `invite_id` 만 비고 사람은 남는다', async () => {
    await migrateTo('0034-accounts')
    const maker = await sql<{ id: string }>`
      insert into users (email, name, password_hash) values ('maker@example.com', '만든 이', 'x') returning id`.execute(db)
    const invite = await sql<{ id: string }>`
      insert into invites (name, kind, token_hash, expires_at, created_by)
      values ('디자인팀', 'multi', 'h-1', now() + interval '1 day', ${maker.rows[0]!.id}) returning id`.execute(db)
    await sql`insert into users (email, name, password_hash, invite_id) values ('joined@example.com', '들어온 이', 'x', ${invite.rows[0]!.id})`.execute(
      db,
    )
    await sql`delete from invites where id = ${invite.rows[0]!.id}`.execute(db)
    const row = await sql<{ invite_id: string | null }>`select invite_id from users where email = 'joined@example.com'`.execute(db)
    expect(row.rows).toEqual([{ invite_id: null }])
  })

  it('종류는 `single` · `multi` 둘만 받는다', async () => {
    await migrateTo('0034-accounts')
    const maker = await sql<{ id: string }>`select id from users where email = 'maker@example.com'`.execute(db)
    await expect(
      sql`insert into invites (name, kind, token_hash, expires_at, created_by)
        values ('틀린 종류', 'many', 'h-2', now(), ${maker.rows[0]!.id})`.execute(db),
    ).rejects.toThrow(/check/)
  })

  it('내리면 표 셋 · 사용자 칸 셋이 걷히고, 다시 올라간다', async () => {
    await migrateTo('0034-accounts')
    await migrateTo('0033-modal-popup')
    expect(await tablesPresent()).toEqual([])
    expect(await userColumnsPresent()).toEqual([])
    await migrateTo('0034-accounts')
    expect(await tablesPresent()).toEqual(['admin_audit', 'invites', 'password_resets'])
  })
})
