/**
 * **0022 — 스냅샷의 kind**(`src/db/migrations/0022-snapshot-kind.ts`).
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

const DATABASE = `wb_migrate_0022_${process.pid}_${Date.now()}`
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

/** 0021 판의 표에 사용자 · 프로젝트를 넣고, 스냅샷 행을 넣는 함수를 낸다. */
async function seedBefore(): Promise<(tag: string, createdAt: string) => Promise<string>> {
  const userId = randomUUID()
  const projectId = randomUUID()
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`seed-${userId}@example.com`}, '씨앗', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '옛 프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  return async (tag, createdAt) => {
    const id = randomUUID()
    await sql`
      insert into snapshots (id, project_id, tag, payload, created_by, created_at)
      values (${id}, ${projectId}, ${tag}, '{}'::jsonb, ${userId}, ${createdAt}::timestamptz)
    `.execute(db)
    return id
  }
}

async function kindOf(id: string): Promise<string> {
  return (await sql<{ kind: string }>`select kind from snapshots where id = ${id}`.execute(db)).rows[0]!.kind
}

describe('0022 — 스냅샷의 kind', () => {
  it('이미 있는 행은 태그가 안전망의 꼴이고 끝의 시각이 그 행의 created_at(ISO 밀리초)일 때만 안전망이다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0021-preset-view-states')
    const row = await seedBefore()
    const at = '2026-01-02T03:04:05.678Z'
    const cascade = await row(`메뉴 "회원 "관리"" 삭제 전 ${at}`, at)
    const cut = await row(`메뉴 "아주 긴 제목…" 삭제 전 ${at}`, at)
    const restore = await row(`복원 전 ${at}`, at)
    const cascadeOtherTime = await row('메뉴 "흉내" 삭제 전 2026-01-02T03:04:05.679Z', at)
    const restoreOtherTime = await row('복원 전 2020-01-01T00:00:00.000Z', at)
    const noPrefix = await row(`흉내" 삭제 전 ${at}`, at)
    const plain = await row('v1', at)
    await migrateTo('0022-snapshot-kind')

    expect({
      cascade: await kindOf(cascade),
      cut: await kindOf(cut),
      restore: await kindOf(restore),
      cascadeOtherTime: await kindOf(cascadeOtherTime),
      restoreOtherTime: await kindOf(restoreOtherTime),
      noPrefix: await kindOf(noPrefix),
      plain: await kindOf(plain),
    }).toEqual({
      cascade: 'cascade-safety',
      cut: 'cascade-safety',
      restore: 'restore-safety',
      cascadeOtherTime: 'tag',
      restoreOtherTime: 'tag',
      noPrefix: 'tag',
      plain: 'tag',
    })
  })

  it('새 행의 기본값은 tag 이고, 셋 밖의 값은 거절된다(23514)', async () => {
    await migrateTo('0022-snapshot-kind')
    const row = await seedBefore()
    const id = await row('새 것', '2026-01-02T03:04:05.678Z')
    expect(await kindOf(id)).toBe('tag')
    const caught = await sql`update snapshots set kind = 'other' where id = ${id}`.execute(db).catch((error: unknown) => error)
    expect((caught as { code?: string }).code).toBe('23514')
  })

  it('왕복 — 0022 → 0021 → 0022', async () => {
    await migrateTo('0022-snapshot-kind')
    await migrateTo('0021-preset-view-states')
    const columns = await sql<{ n: string }>`
      select count(*) as n from information_schema.columns where table_name = 'snapshots' and column_name = 'kind'`.execute(db)
    expect(Number(columns.rows[0]!.n)).toBe(0)
    await migrateTo('0022-snapshot-kind')
  })
})
