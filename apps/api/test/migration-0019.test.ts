/**
 * **0019 — 테마 패키지 표 · 인스턴스 관리자 칸 · 프로젝트의 테마 바인딩**(`src/db/migrations/0019-theme-packages.ts`).
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

const DATABASE = `wb_migrate_0019_${process.pid}_${Date.now()}`
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

/** 0018 판의 표에 사용자 하나 · 프로젝트 하나를 넣는다. */
async function seedBefore(): Promise<{ userId: string; projectId: string }> {
  const userId = randomUUID()
  const projectId = randomUUID()
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`seed-${userId}@example.com`}, '씨앗', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '옛 프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  return { userId, projectId }
}

async function insertPackage(themeId: string, version: string, uploadedBy: string | null): Promise<void> {
  await sql`
    insert into theme_packages (theme_id, version, name, sdk_range, manifest, files, size, sha256, uploaded_by)
    values (${themeId}, ${version}, '시험', '^1.0.0', '{}', ${Buffer.from([1, 2, 3])}, 3, 'x', ${uploadedBy})
  `.execute(db)
}

/** 거절된 문장의 SQLSTATE. 통과하면 `null`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? 'no-code'
  }
}

describe('0019 — 테마 패키지 · 관리자 칸 · 바인딩', () => {
  it('이미 있는 프로젝트는 바인딩이 null · 토큰 {} · rev 0 이고, 사용자는 관리자가 아니다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0018-drop-json-themes')
    const { userId, projectId } = await seedBefore()
    await migrateTo('0019-theme-packages')

    const project = await sql<{ theme_id: string | null; theme_version: string | null; theme_tokens: unknown; theme_rev: number }>`
      select theme_id, theme_version, theme_tokens, theme_rev from projects where id = ${projectId}`.execute(db)
    expect(project.rows[0]).toEqual({ theme_id: null, theme_version: null, theme_tokens: {}, theme_rev: 0 })
    const user = await sql<{ is_instance_admin: boolean }>`select is_instance_admin from users where id = ${userId}`.execute(db)
    expect(user.rows[0]!.is_instance_admin).toBe(false)
  })

  it('theme_id 만 채우면 거절된다(projects_theme_pair — 23514)', async () => {
    await migrateTo('0019-theme-packages')
    const { projectId } = await seedBefore()
    await insertPackage('system-pair', '1.0.0', null)
    expect(await sqlState(() => sql`update projects set theme_id = 'system-pair' where id = ${projectId}`.execute(db))).toBe('23514')
    expect(await sqlState(() => sql`update projects set theme_version = '1.0.0' where id = ${projectId}`.execute(db))).toBe('23514')
  })

  it('없는 패키지를 가리키면 거절되고(23503), 가리켜진 패키지는 못 지운다(RESTRICT)', async () => {
    await migrateTo('0019-theme-packages')
    const { projectId } = await seedBefore()
    expect(
      await sqlState(() => sql`update projects set theme_id = 'nope', theme_version = '9.9.9' where id = ${projectId}`.execute(db)),
    ).toBe('23503')

    await insertPackage('system-fk', '1.0.0', null)
    expect(
      await sqlState(() => sql`update projects set theme_id = 'system-fk', theme_version = '1.0.0' where id = ${projectId}`.execute(db)),
    ).toBeNull()
    expect(await sqlState(() => sql`delete from theme_packages where theme_id = 'system-fk'`.execute(db))).toBe('23503')
  })

  it('올린 사람을 지우면 uploaded_by 가 NULL 이 된다', async () => {
    await migrateTo('0019-theme-packages')
    const { userId } = await seedBefore()
    await insertPackage('by-user', '1.0.0', userId)
    await sql`delete from users where id = ${userId}`.execute(db)
    const row = await sql<{ uploaded_by: string | null }>`select uploaded_by from theme_packages where theme_id = 'by-user'`.execute(db)
    expect(row.rows).toEqual([{ uploaded_by: null }])
  })

  it('files 는 바이트를 그대로 돌려준다(bytea)', async () => {
    await migrateTo('0019-theme-packages')
    await insertPackage('bytes', '1.0.0', null)
    const row = await sql<{ files: Buffer }>`select files from theme_packages where theme_id = 'bytes'`.execute(db)
    expect([...row.rows[0]!.files]).toEqual([1, 2, 3])
  })

  it('왕복 — 0019 → 0018 → 0019', async () => {
    await migrateTo('0019-theme-packages')
    await migrateTo('0018-drop-json-themes')
    const tables = await sql<{
      n: string
    }>`select count(*) as n from information_schema.tables where table_name = 'theme_packages'`.execute(db)
    const columns = await sql<{ name: string }>`
      select column_name as name from information_schema.columns
      where (table_name = 'projects' and column_name like 'theme_%') or (table_name = 'users' and column_name = 'is_instance_admin')`.execute(
      db,
    )
    expect({ tables: Number(tables.rows[0]!.n), columns: columns.rows.length }).toEqual({ tables: 0, columns: 0 })
    await migrateTo('0019-theme-packages')
  })
})
