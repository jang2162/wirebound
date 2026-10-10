/**
 * **0023 — 페이지의 구조 번호**(`src/db/migrations/0023-pages-structure-seq.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `migration-0018.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 */
import { randomUUID } from 'node:crypto'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0023_${process.pid}_${Date.now()}`
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

async function seedPage(headSeq: number): Promise<string> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const pageId = randomUUID()
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`seed-${userId}@example.com`}, '씨앗', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '옛 프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  await sql`
    insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version, head_seq)
    values (${pageId}, ${projectId}, ${menuId}, '쪽', 0, '{}'::jsonb, 1, ${headSeq})
  `.execute(db)
  return pageId
}

const structureOf = async (pageId: string): Promise<number> =>
  Number((await sql<{ s: string }>`select structure_seq as s from pages where id = ${pageId}`.execute(db)).rows[0]!.s)

describe('0023 — 페이지의 구조 번호', () => {
  it('이미 있는 행은 head_seq 와 같게 채운다 — 언제 바뀌었는지 모르니 다시 판정하는 쪽으로 틀린다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0022-snapshot-kind')
    const page = await seedPage(9)
    await migrateTo('0023-pages-structure-seq')
    expect(await structureOf(page)).toBe(9)
  })

  it('왕복 — 0023 → 0022 → 0023', async () => {
    await migrateTo('0023-pages-structure-seq')
    await migrateTo('0022-snapshot-kind')
    const columns = await sql<{ n: string }>`
      select count(*) as n from information_schema.columns where table_name = 'pages' and column_name = 'structure_seq'`.execute(db)
    expect(Number(columns.rows[0]!.n)).toBe(0)
    await migrateTo('0023-pages-structure-seq')
  })
})
