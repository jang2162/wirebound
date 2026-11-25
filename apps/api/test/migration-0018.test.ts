/**
 * **0018 — 옛 JSON 테마를 걷는 마이그레이션.** 테마 표 · 레이아웃의 테마 참조를 지우고, 저장된 스냅샷 payload 를 판 2(테마 없음)로
 * 고친다(`src/db/migrations/0018-drop-json-themes.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — 마이그레이션을 오르내리면 스키마가 통째로 바뀌므로, 다른 파일이 쓰는 테스트 DB 에서 돌리면 그 파일들의
 * 판이 깨진다. 같은 서버에 일회용 DB 를 만들고 끝에 지운다.
 */
import { randomUUID } from 'node:crypto'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { SnapshotPayloadSchema } from '@wirebound/themes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { signup, TEST_DATABASE_URL, testConfig } from './helpers'

const DATABASE = `wb_migrate_0018_${process.pid}_${Date.now()}`
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

const DOC = (title: string) => ({
  version: 1,
  root: { id: 'n_root', type: 'Page', children: [{ id: 'n_text', type: 'Text', props: { content: title } }] },
})

/** 0017 판의 표에 사용자 · 프로젝트 · 레이아웃 · 메뉴 · 페이지를 넣고, 그 판 그대로의 판 1 스냅샷을 하나 넣는다. */
async function seedV1(): Promise<{ projectId: string; pageId: string; snapshotId: string }> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const layoutId = randomUUID()
  const menuId = randomUUID()
  const pageId = randomUUID()
  const snapshotId = randomUUID()
  const layoutSchema = { version: 1, root: { id: 'l_root', type: 'Page', children: [{ id: 'l_slot', type: 'Slot' }] } }
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`seed-${userId}@example.com`}, '씨앗', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '옛 프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into layouts (id, project_id, name, theme_id, schema) values (${layoutId}, ${projectId}, '기본', null, ${JSON.stringify(layoutSchema)})`.execute(
    db,
  )
  await sql`update projects set default_layout_id = ${layoutId} where id = ${projectId}`.execute(db)
  await sql`insert into project_members (project_id, user_id, role) values (${projectId}, ${userId}, 'owner')`.execute(db)
  await sql`insert into menu_nodes (id, project_id, parent_id, title, sort_order) values (${menuId}, ${projectId}, null, '회원', 0)`.execute(
    db,
  )
  await sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version) values (${pageId}, ${projectId}, ${menuId}, '원래 제목', 0, ${JSON.stringify(DOC('원문'))}, 1)`.execute(
    db,
  )
  const payload = {
    payloadVersion: 1,
    capturedAt: new Date().toISOString(),
    menu: [{ id: menuId, parentId: null, title: '회원', sortOrder: 0 }],
    pages: [
      {
        id: pageId,
        menuNodeId: menuId,
        title: '원래 제목',
        description: null,
        sortOrder: 0,
        schemaVersion: 1,
        schema: DOC('원문'),
        headSeq: 0,
      },
    ],
    layouts: [{ id: layoutId, name: '기본', themeId: null, schema: layoutSchema }],
    themes: [{ layoutId, themeId: null, theme: null }],
    comments: [],
  }
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snapshotId}, ${projectId}, 'v1', ${JSON.stringify(payload)}, ${userId})`.execute(
    db,
  )
  return { projectId, pageId, snapshotId }
}

async function readSnapshotPayload(id: string): Promise<Record<string, unknown>> {
  const row = await sql<{ payload: Record<string, unknown> }>`select payload from snapshots where id = ${id}`.execute(db)
  return row.rows[0]!.payload
}

describe('0018 — 옛 JSON 테마 걷기', () => {
  it('판 1 스냅샷을 마이그레이션이 판 2 로 고친다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0017-page-seq-floors')
    const { snapshotId } = await seedV1()
    await migrateTo('0018-drop-json-themes')

    const payload = await readSnapshotPayload(snapshotId)
    expect(payload.payloadVersion).toBe(2)
    expect('themes' in payload).toBe(false)
    // 레이아웃의 테마 참조도 걷힌다 — 칸이 사라졌고 규격이 `z.strictObject`다.
    expect((payload.layouts as Record<string, unknown>[]).map((layout) => 'themeId' in layout)).toEqual([false])
    // 그 판 payload 의 `layouts` 는 지금 규격(판 5)에 없다 — 걷고 읽는다(레이아웃 문서는 아래에서 날것으로 본다).
    const { layouts: _layouts, ...rest } = payload as Record<string, unknown>
    expect(SnapshotPayloadSchema.safeParse(rest).success).toBe(true)
  })

  it('0018 은 테마 표와 레이아웃의 테마 칸을 지운다', async () => {
    await migrateTo('0018-drop-json-themes')
    const tables = await sql<{
      name: string
    }>`select table_name as name from information_schema.tables where table_schema = 'public' and table_name = 'themes'`.execute(db)
    const columns = await sql<{
      name: string
    }>`select column_name as name from information_schema.columns where table_name = 'layouts' and column_name = 'theme_id'`.execute(db)
    expect({ themes: tables.rows.length, themeId: columns.rows.length }).toEqual({ themes: 0, themeId: 0 })
  })

  it('0018 왕복 — down 뒤 0006 · 0007 의 down 이 돈다', async () => {
    await migrateTo('0018-drop-json-themes')
    await migrateTo('0005-revisions')
    await migrateTo('0018-drop-json-themes')
  })

  it('down 은 테마 표 · 레이아웃의 테마 칸을 되살리고 판 2 스냅샷을 판 1 모양으로 되돌린다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0017-page-seq-floors')
    const { snapshotId } = await seedV1()
    await migrateTo('0018-drop-json-themes')
    await migrateTo('0017-page-seq-floors')

    const payload = await readSnapshotPayload(snapshotId)
    expect(payload.payloadVersion).toBe(1)
    expect(payload.themes).toEqual([])
    expect((payload.layouts as Record<string, unknown>[]).map((layout) => layout.themeId)).toEqual([null])
    // 되살린 칸은 0007 의 모양 그대로다 — `themes.id` 를 `restrict` 로 가리킨다.
    const fk = await sql<{ rule: string }>`
      select rc.delete_rule as rule from information_schema.referential_constraints rc
      join information_schema.key_column_usage k on k.constraint_name = rc.constraint_name
      where k.table_name = 'layouts' and k.column_name = 'theme_id'`.execute(db)
    expect(fk.rows.map((row) => row.rule)).toEqual(['RESTRICT'])
  })

  it('고친 스냅샷을 복원한다 — 스냅샷 뒤에 고친 페이지 제목이 스냅샷의 값으로 돌아온다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0017-page-seq-floors')
    const { projectId, pageId, snapshotId } = await seedV1()
    await migrateTo('0018-drop-json-themes')
    // 앱은 기동 때 시스템 테마를 넣는다(`services/system-themes.ts`) — 그 표는 뒤 마이그레이션이 만든다. 판 1 → 2 로 고친 payload 를
    // 오늘의 스키마에서 복원하는 것이 이 케이스다.
    const latest = await new Migrator({ db, provider: migrationProvider }).migrateToLatest()
    if (latest.error !== undefined) throw latest.error

    const app = await buildApp({ db, config: testConfig() })
    try {
      const owner = await signup({ app, db })
      await sql`insert into project_members (project_id, user_id, role) values (${projectId}, ${owner.user.id}, 'owner')`.execute(db)

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}/pages/${pageId}`,
        cookies: owner.cookie,
        payload: { title: '나중 제목' },
      })
      expect(renamed.statusCode).toBe(200)

      const listed = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/snapshots`, cookies: owner.cookie })
      expect(listed.statusCode).toBe(200)

      const restored = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/snapshots/${snapshotId}/restore`,
        cookies: owner.cookie,
      })
      expect(restored.statusCode, restored.body).toBe(200)

      const page = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/pages/${pageId}`, cookies: owner.cookie })
      expect(page.json().title).toBe('원래 제목')
    } finally {
      await app.close()
    }
  })
})
