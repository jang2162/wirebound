/**
 * **0038 — 레이아웃 표 · `projects.default_layout_id` 걷기 · 스냅샷 payload 판 5**(`src/db/migrations/0038-drop-layouts.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `migration-0037.test.ts` 와 같은 까닭.
 *
 * 잰 성질: 올린 뒤 표 · 칼럼이 없다 · 판 4 payload(`layouts[]` 든) 스냅샷이 판 5 로 읽히고(키 없음) 지금 코드로 복원된다 · 판 5 payload 는
 * 그대로다 · 올린 뒤 만든 프로젝트에 레이아웃 행이 없다(표가 없다) · `down` 은 표 · 칼럼을 빈 채로 다시 세우고 payload 를 판 4 · `layouts: []` 로
 * 내린다.
 */
import { randomUUID } from 'node:crypto'
import { CURRENT_DOCUMENT_VERSION, installCatalog } from '@wirebound/schema'
import { SnapshotPayloadSchema } from '@wirebound/themes'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { insertProject } from '../src/repos/projects'
import { restoreSnapshot } from '../src/services/restore'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0038_${process.pid}_${Date.now()}`
const url = (() => {
  const parsed = new URL(TEST_DATABASE_URL)
  parsed.pathname = `/${DATABASE}`
  return parsed.toString()
})()

let admin: DbHandle
let db: DbHandle

beforeAll(async () => {
  installCatalog()
  admin = createDb(createPool(TEST_DATABASE_URL))
  await sql.raw(`CREATE DATABASE "${DATABASE}"`).execute(admin)
  db = createDb(createPool(url))
})

afterAll(async () => {
  await db?.destroy()
  await sql.raw(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`).execute(admin)
  await admin?.destroy()
})

async function must(name: string | typeof NO_MIGRATIONS): Promise<void> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateTo(name)
  if (result.error !== undefined) throw result.error as Error
}

async function latest(): Promise<void> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateToLatest()
  if (result.error !== undefined) throw result.error as Error
}

/** 지금 판(7) 화면 문서 — 0037 뒤라 페이지 행의 문서는 이 꼴이다. */
const PAGE_DOC = {
  version: CURRENT_DOCUMENT_VERSION,
  layout: 'blank',
  root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '얼린 글' } }] },
}

interface Seeded {
  userId: string
  projectId: string
  pageId: string
  layoutId: string
  v4: string
  v5: string
}

async function seed(): Promise<Seeded> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const [pageId, layoutId, v4, v5] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`u-${userId}@example.com`}, '앨리스', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into project_members (project_id, user_id, role) values (${projectId}, ${userId}, 'owner')`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  await sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version, head_seq, structure_seq)
      values (${pageId}, ${projectId}, ${menuId}, '쪽', 0, ${JSON.stringify(PAGE_DOC)}::jsonb, 7, 0, 0)`.execute(db)
  const layoutDoc = { version: 7, root: { id: 'l_root', type: 'Page', children: [{ id: 'l_slot', type: 'Slot' }] } }
  await sql`insert into layouts (id, project_id, name, schema) values (${layoutId}, ${projectId}, '기본 레이아웃', ${JSON.stringify(layoutDoc)}::jsonb)`.execute(
    db,
  )
  await sql`update projects set default_layout_id = ${layoutId} where id = ${projectId}`.execute(db)
  const payload = (payloadVersion: number, extra: Record<string, unknown>) => ({
    payloadVersion,
    capturedAt: '2026-11-25T00:00:00.000Z',
    menu: [{ id: menuId, parentId: null, title: '메뉴', sortOrder: 0 }],
    pages: [
      {
        id: pageId,
        menuNodeId: menuId,
        title: '쪽',
        description: null,
        sortOrder: 0,
        schemaVersion: 7,
        schema: { ...PAGE_DOC, root: { ...PAGE_DOC.root, children: [{ id: 'n_t', type: 'Text', props: { content: '그때 글' } }] } },
        headSeq: 0,
      },
    ],
    comments: [],
    theme: null,
    codes: [],
    ...extra,
  })
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${v4}, ${projectId}, '판4', ${JSON.stringify(
    payload(4, { layouts: [{ id: layoutId, name: '기본 레이아웃', schema: layoutDoc }] }),
  )}::jsonb, ${userId})`.execute(db)
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${v5}, ${projectId}, '판5', ${JSON.stringify(payload(5, {}))}::jsonb, ${userId})`.execute(
    db,
  )
  return { userId, projectId, pageId, layoutId, v4, v5 }
}

async function payloadOf(id: string): Promise<Record<string, unknown>> {
  return (await sql<{ payload: Record<string, unknown> }>`select payload from snapshots where id = ${id}`.execute(db)).rows[0]!.payload
}

async function hasTable(name: string): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from information_schema.tables where table_name = ${name}`.execute(db)
  return rows[0]!.n > 0
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from information_schema.columns where table_name = ${table} and column_name = ${column}
  `.execute(db)
  return rows[0]!.n > 0
}

describe('0038 — 레이아웃 표 걷기 · payload 판 5', () => {
  let seeded: Seeded

  it('표 · 칼럼을 걷고 판 4 payload 를 판 5 로 — layouts 키가 없고 지금 규격으로 읽힌다', async () => {
    await must(NO_MIGRATIONS)
    await must('0037-page-layout')
    seeded = await seed()
    // 카나리아 — 걷기 전에는 있었다.
    expect([
      await hasTable('layouts'),
      await hasColumn('projects', 'default_layout_id'),
      'layouts' in (await payloadOf(seeded.v4)),
    ]).toEqual([true, true, true])
    await must('0038-drop-layouts')
    expect([await hasTable('layouts'), await hasColumn('projects', 'default_layout_id')]).toEqual([false, false])
    const v4 = await payloadOf(seeded.v4)
    expect([v4.payloadVersion, 'layouts' in v4]).toEqual([5, false])
    expect(SnapshotPayloadSchema.safeParse(v4).success).toBe(true)
  })

  it('판 5 payload 는 그대로다', async () => {
    const v5 = await payloadOf(seeded.v5)
    expect([v5.payloadVersion, 'layouts' in v5, SnapshotPayloadSchema.safeParse(v5).success]).toEqual([5, false, true])
  })

  it('옮긴 판 4 스냅샷이 지금 코드로 복원된다 — 레이아웃 개수와 무관하다', async () => {
    await latest()
    const outcome = await restoreSnapshot(db, { projectId: seeded.projectId, snapshotId: seeded.v4, actorId: seeded.userId })
    expect(outcome.kind, JSON.stringify(outcome)).toBe('restored')
    const page = (
      await sql<{ schema: { root: { children: { props: { content: string } }[] } } }>`
      select schema from pages where id = ${seeded.pageId}
    `.execute(db)
    ).rows[0]!.schema
    expect(page.root.children[0]!.props.content).toBe('그때 글')
  })

  it('올린 뒤 만든 프로젝트는 레이아웃 없이 선다', async () => {
    const made = await insertProject(db, seeded.userId, { name: '새 것', slug: `n-${randomUUID().slice(0, 8)}`, description: null })
    expect(made.role).toBe('owner')
    expect(await hasTable('layouts')).toBe(false)
  })

  it('down — 표 · 칼럼을 빈 채로 다시 세우고(행은 안 짓는다) payload 는 판 4 · layouts: []', async () => {
    await must('0037-page-layout')
    expect([await hasTable('layouts'), await hasColumn('projects', 'default_layout_id')]).toEqual([true, true])
    expect((await sql<{ n: number }>`select count(*)::int as n from layouts`.execute(db)).rows[0]!.n).toBe(0)
    for (const id of [seeded.v4, seeded.v5]) {
      const payload = await payloadOf(id)
      expect([payload.payloadVersion, payload.layouts]).toEqual([4, []])
    }
  })
})
