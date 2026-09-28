/**
 * **A3 리뷰 — 0019 `down` 은 판 3 스냅샷 payload 를 판 2 로 되돌리지 않는다**(`docs/superpowers/plans/2026-09-28-a3-review.md` 항목 6).
 * 리뷰어는 고치지 않았다 — 고칠 때까지 빨강이다.
 *
 * 0018 의 `down` 은 판 2 payload 를 판 1 모양으로 되돌린다(`0018-drop-json-themes.ts`). 0019 의 `down` 은 칸과 표를 걷지만 판 3
 * payload(`payloadVersion: 3` · `theme`)는 그대로 둔다 — 그 뒤의 0018 `down` 도 판 2 만 고치므로 판 3 은 끝까지 남는다. 되돌린 배포
 * (main)는 판 3 을 `payload-version` 400 으로 거절해, A3 에서 찍은 스냅샷(안전망 포함)을 복원하지 못한다.
 *
 * **이 파일은 제 DB 를 만든다** — `migration-0019.test.ts` 와 같은 까닭.
 */
import { randomUUID } from 'node:crypto'
import { Migrator, sql } from 'kysely'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0019_down_${process.pid}_${Date.now()}`
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

async function migrateTo(name: string): Promise<void> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateTo(name)
  if (result.error !== undefined) throw result.error
}

it('0019 → 0018 — 판 3 payload 가 판 2 모양(theme 없음)으로 돌아온다', async () => {
  await migrateTo('0019-theme-packages')
  const userId = randomUUID()
  const projectId = randomUUID()
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`down-${userId}@example.com`}, '씨앗', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  const payload = {
    payloadVersion: 3,
    capturedAt: new Date(0).toISOString(),
    menu: [],
    pages: [],
    layouts: [],
    comments: [],
    theme: { themeId: 'system-admin', version: '0.1.0', tokens: {} },
  }
  await sql`insert into snapshots (project_id, tag, payload, created_by) values (${projectId}, '판3', ${JSON.stringify(payload)}, ${userId})`.execute(db)

  await migrateTo('0018-drop-json-themes')

  const rows = await sql<{ version: number; theme: boolean }>`
    select (payload->>'payloadVersion')::int as version, payload ? 'theme' as theme from snapshots`.execute(db)
  expect(rows.rows).toEqual([{ version: 2, theme: false }])
})
