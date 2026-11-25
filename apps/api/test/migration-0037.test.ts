/**
 * **0037 — 페이지 문서에 레이아웃 · 문서 판 6 → 7**(`src/db/migrations/0037-page-layout.ts` · 채우는 규칙은 `@wirebound/schema` 의
 * `migrate-page-layout.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `tree-items-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 페이지 문서가 사는 자리 전부(페이지 · 스냅샷의 `pages[]`)에서 판 6 문서가 0 이 된다 · 뿌리 `Popup` 은 `popup`, 그 밖은 `blank` · 옮긴
 * 문서가 판 7 검증(오류)을 지난다 · `head_seq` · `structure_seq` 가 안 오른다 — 판 6 바탕(옮기기 전 `head_seq`)의 편집이 옮긴 뒤 그대로 적용된다 ·
 * `down` 은 `layout` 을 지우고 판 6 으로 돌아간다.
 */
import { randomUUID } from 'node:crypto'
import { installCatalog, partitionIssues, validatePage, type PageDocument } from '@wirebound/schema'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { applyEdit } from '../src/services/edit-pipeline'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0037_${process.pid}_${Date.now()}`
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

/** 판 6 화면 페이지 · 판 6 팝업 페이지(바닥 구역까지). */
const SCREEN = { version: 6, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '글' } }] } }
const POPUP = {
  version: 6,
  root: {
    id: 'n_pop',
    type: 'Popup',
    props: { title: '회원 검색' },
    children: [{ id: 'n_pt', type: 'Text', props: { content: '이름으로' } }],
    zones: { footer: [{ id: 'n_ok', type: 'Button', props: { label: '선택' } }] },
  },
  viewStates: [{ id: 's_open', name: '열림' }],
}

interface Seeded {
  userId: string
  projectId: string
  screen: string
  popup: string
  snapshot: string
}

async function seed(): Promise<Seeded> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const [screen, popup, snapshot] = [randomUUID(), randomUUID(), randomUUID()]
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`u-${userId}@example.com`}, '앨리스', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  const insertPage = async (id: string, sort: number, schema: unknown) =>
    sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version, head_seq, structure_seq)
        values (${id}, ${projectId}, ${menuId}, ${`쪽 ${sort}`}, ${sort}, ${JSON.stringify(schema)}::jsonb, 6, 7, 5)`.execute(db)
  await insertPage(screen, 0, SCREEN)
  await insertPage(popup, 1, POPUP)
  const snapshotPage = (id: string, schema: unknown) => ({
    id,
    menuNodeId: menuId,
    title: '쪽',
    description: null,
    sortOrder: 0,
    schemaVersion: 6,
    schema,
    headSeq: 0,
  })
  const layoutDoc = { version: 6, root: { id: 'l_root', type: 'Page', children: [{ id: 'l_slot', type: 'Slot' }] } }
  const payload = {
    payloadVersion: 4,
    capturedAt: '2026-11-25T00:00:00.000Z',
    menu: [{ id: menuId, parentId: null, title: '메뉴', sortOrder: 0 }],
    pages: [snapshotPage(randomUUID(), SCREEN), snapshotPage(randomUUID(), POPUP)],
    layouts: [{ id: randomUUID(), name: '기본', schema: layoutDoc }],
    comments: [],
    theme: null,
  }
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snapshot}, ${projectId}, '판', ${JSON.stringify(payload)}::jsonb, ${userId})`.execute(
    db,
  )
  return { userId, projectId, screen, popup, snapshot }
}

/** 페이지 문서가 사는 자리의 글자 — 페이지 행 · 스냅샷 payload. */
async function bodies(): Promise<string[]> {
  const rows = await sql<{ body: string }>`select schema::text as body from pages union all select payload::text from snapshots`.execute(db)
  return rows.rows.map((row) => row.body)
}

/**
 * 글자 하나(JSON)에서 **페이지 문서**의 판과 레이아웃 — `root` 를 가진 객체 가운데 레이아웃 문서(뿌리 아래 `Slot`)를 뺀 것. 키를 가리지 않고 걷는다
 * (`pages` 행 · payload 의 `pages[]` 어디에 있든).
 */
function pageDocsIn(value: unknown, out: { version: unknown; layout: unknown }[] = []): { version: unknown; layout: unknown }[] {
  if (Array.isArray(value)) for (const item of value) pageDocsIn(item, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const root = record.root as { children?: { type?: unknown }[] } | undefined
    if (root !== undefined && !(root.children ?? []).some((child) => child.type === 'Slot')) {
      out.push({ version: record.version, layout: record.layout })
    }
    for (const child of Object.values(record)) pageDocsIn(child, out)
  }
  return out
}

async function pageRow(id: string): Promise<{ schema: PageDocument; schema_version: number; head_seq: string; structure_seq: string }> {
  const { rows } = await sql<{ schema: PageDocument; schema_version: number; head_seq: string; structure_seq: string }>`
    select schema, schema_version, head_seq, structure_seq from pages where id = ${id}
  `.execute(db)
  return rows[0]!
}

describe('0037 — 페이지 레이아웃 · 판 6 → 7', () => {
  let seeded: Seeded
  let before: string[]

  it('남은 판 6 페이지 문서 0 — 페이지 행과 스냅샷 payload 둘 다 · 뿌리 Popup 은 popup, 그 밖은 blank', async () => {
    await must(NO_MIGRATIONS)
    await must('0036-common-codes')
    seeded = await seed()
    before = await bodies()
    // 카나리아 — 옛 판이 있었다: 페이지 2 · 스냅샷 페이지 2(레이아웃 문서는 세지 않는다).
    expect(before.flatMap((body) => pageDocsIn(JSON.parse(body)))).toEqual([
      { version: 6, layout: undefined },
      { version: 6, layout: undefined },
      { version: 6, layout: undefined },
      { version: 6, layout: undefined },
    ])
    await must('0037-page-layout')
    const docs = (await bodies()).flatMap((body) => pageDocsIn(JSON.parse(body)))
    expect(docs).toHaveLength(4)
    expect(docs.filter((doc) => doc.version !== 7)).toEqual([])
    expect(docs.map((doc) => doc.layout).sort()).toEqual(['blank', 'blank', 'popup', 'popup'])
  })

  it('페이지 — 판 7 · 짝인 레이아웃 · 나머지 칸 그대로 · 판 7 검증을 지난다', async () => {
    const screen = await pageRow(seeded.screen)
    const popup = await pageRow(seeded.popup)
    expect([screen.schema_version, popup.schema_version]).toEqual([7, 7])
    expect(screen.schema).toEqual({ ...SCREEN, version: 7, layout: 'blank' })
    expect(popup.schema).toEqual({ ...POPUP, version: 7, layout: 'popup' })
    expect([partitionIssues(validatePage(screen.schema)).errors, partitionIssues(validatePage(popup.schema)).errors]).toEqual([[], []])
  })

  it('스냅샷 페이지의 schemaVersion 도 7 · 레이아웃 문서는 그대로', async () => {
    const payload = (
      await sql<{ payload: { pages: { schema: PageDocument; schemaVersion: number }[]; layouts: { schema: unknown }[] } }>`
        select payload from snapshots where id = ${seeded.snapshot}
      `.execute(db)
    ).rows[0]!.payload
    expect(payload.pages.map((page) => [page.schemaVersion, page.schema.layout])).toEqual([
      [7, 'blank'],
      [7, 'popup'],
    ])
    expect(payload.layouts[0]!.schema).toEqual({
      version: 6,
      root: { id: 'l_root', type: 'Page', children: [{ id: 'l_slot', type: 'Slot' }] },
    })
  })

  it('head_seq · structure_seq 가 안 오른다', async () => {
    const rows = [await pageRow(seeded.screen), await pageRow(seeded.popup)]
    expect(rows.map((row) => [Number(row.head_seq), Number(row.structure_seq)])).toEqual([
      [7, 5],
      [7, 5],
    ])
  })

  it('down — layout 을 지우고 판 6 으로 돌아간다(글자 그대로)', async () => {
    await must('0036-common-codes')
    // 고친 행은 표 안 차례가 바뀐다 — 글자 묶음으로 견준다(jsonb 라 키 차례는 DB 가 정한다).
    expect((await bodies()).map((body) => JSON.parse(body)).sort(byText)).toEqual(before.map((body) => JSON.parse(body)).sort(byText))
  })

  it('판 6 바탕(옮기기 전 head_seq)의 편집이 올린 뒤 그대로 적용된다', async () => {
    await latest()
    const outcome = await applyEdit(db, {
      projectId: seeded.projectId,
      pageId: seeded.screen,
      baseSeq: 7,
      ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '고친 글' }],
      actor: { type: 'user', id: seeded.userId, label: '앨리스' },
    })
    expect(outcome.ok ? { seq: outcome.seq, layout: outcome.schema.layout } : outcome).toEqual({ seq: 8, layout: 'blank' })
  })
})

function byText(a: unknown, b: unknown): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b))
}
