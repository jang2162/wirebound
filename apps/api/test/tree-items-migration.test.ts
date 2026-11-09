/**
 * **0035 — `Tree` 항목을 계층으로 · 문서 판 5 → 6**(`src/db/migrations/0035-tree-items.ts` · 옮기는 규칙은 `@wirebound/schema` 의 `migrate-tree-items.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `node-zones-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 문서가 사는 자리 전부(페이지 · 레이아웃 · 두 모듈 표 · 스냅샷의 `pages[]` · `layouts[]`)에서 판 5 꼴 트리(글 항목 · `depth`)가 0 이 된다 ·
 * 판 5 문서가 전부 판 6 이다 · 노드 id · 별칭 · 표지 · 상태 칸은 그대로이고 항목이 판 5 화면의 단대로 계층이 된다 · 항목이 없던 트리는 옛 기본값으로
 * 선다 · 옮긴 문서가 판 6 검증(오류)을 지난다 · 트리를 옮긴 페이지만 `head_seq` · `structure_seq` 가 하나 오른다 · `down` 은 옛 문서로 돌아간다.
 */
import { randomUUID } from 'node:crypto'
import { installCatalog, partitionIssues, validatePage, walkNodes, type PageDocument, type WbNode } from '@wirebound/schema'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0035_${process.pid}_${Date.now()}`
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

/** 판 5 트리 — 항목 수가 깊이 이상이라 `down` 이 같은 `depth` 를 다시 짓는다(되돌리기가 바이트 그대로 돌아오게). */
const tree = (id: string, items: string[], depth: number, more: Record<string, unknown> = {}) => ({
  id,
  type: 'Tree',
  props: { items, depth, ...((more.props as object | undefined) ?? {}) },
  ...Object.fromEntries(Object.entries(more).filter(([key]) => key !== 'props')),
})

/** 판 5 페이지 — 다 든 트리(깊이 2 · 다섯 항목 · 선택 상태 · 별칭 · 표지 · 변형) · 카드 안의 깊이 3 트리. */
const PAGE = {
  version: 5,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      tree('n_tree', ['회원', '목록', '권한', '역할', '통계'], 2, {
        props: { selected: true },
        alias: '좌측 메뉴',
        marker: 3,
        variant: 'compact',
      }),
      { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [tree('n_deep', ['가', '나', '다', '라'], 3)] },
    ],
  },
}
const PLAIN = { version: 5, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '트리 없음' } }] } }

interface Seeded {
  page: string
  plain: string
  layout: string
  module: string
  personal: string
  snapshot: string
}

async function seed(): Promise<Seeded> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const [page, plain, layout, snapshot] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`u-${userId}@example.com`}, '앨리스', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  const insertPage = async (id: string, sort: number, schema: unknown) =>
    sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version, head_seq, structure_seq)
        values (${id}, ${projectId}, ${menuId}, ${`쪽 ${sort}`}, ${sort}, ${JSON.stringify(schema)}::jsonb, 5, 7, 5)`.execute(db)
  await insertPage(page, 0, PAGE)
  await insertPage(plain, 1, PLAIN)
  const layoutDoc = {
    version: 5,
    root: { id: 'l_root', type: 'Page', children: [tree('l_tree', ['대메뉴', '중메뉴'], 2), { id: 'l_slot', type: 'Slot' }] },
  }
  await sql`insert into layouts (id, project_id, name, schema) values (${layout}, ${projectId}, '기본', ${JSON.stringify(layoutDoc)}::jsonb)`.execute(
    db,
  )
  const moduleRow = await sql<{ id: string }>`
    insert into modules (project_id, name, nodes, created_by)
    values (${projectId}, '모듈', ${JSON.stringify([tree('m_tree', ['하나'], 1)])}::jsonb, ${userId}) returning id
  `.execute(db)
  // 개인 모듈 — 탭 패널 구역 안의 트리(구역 아래로도 걷는다)와 트리 없는 글.
  const personalRow = await sql<{ id: string }>`
    insert into personal_modules (owner_id, name, nodes)
    values (${userId}, '내 모듈', ${JSON.stringify([
      { id: 'q_grid', type: 'DataGrid', zones: { headStart: [tree('q_tree', ['ㄱ', 'ㄴ'], 2)] } },
      { id: 'q_t', type: 'Text', props: { content: '글' } },
    ])}::jsonb)
    returning id
  `.execute(db)
  const snapshotPage = (id: string, schema: unknown) => ({
    id,
    menuNodeId: menuId,
    title: '쪽',
    description: null,
    sortOrder: 0,
    schemaVersion: 5,
    schema,
    headSeq: 0,
  })
  const payload = {
    payloadVersion: 3,
    capturedAt: '2026-11-03T00:00:00.000Z',
    menu: [{ id: menuId, parentId: null, title: '메뉴', sortOrder: 0 }],
    pages: [snapshotPage(randomUUID(), PAGE), snapshotPage(randomUUID(), PLAIN)],
    layouts: [{ id: layout, name: '기본', schema: layoutDoc }],
    comments: [],
    theme: null,
  }
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snapshot}, ${projectId}, '판', ${JSON.stringify(payload)}::jsonb, ${userId})`.execute(
    db,
  )
  return { page, plain, layout, module: moduleRow.rows[0]!.id, personal: personalRow.rows[0]!.id, snapshot }
}

/** 모든 표의 글자. */
async function bodies(): Promise<string[]> {
  const rows = await sql<{ body: string }>`
    select schema::text as body from pages union all select schema::text from layouts
    union all select nodes::text from modules union all select nodes::text from personal_modules
    union all select payload::text from snapshots
  `.execute(db)
  return rows.rows.map((row) => row.body)
}

/** 글자 하나(JSON)에서 `type` 이 `Tree` 인 노드 전부 — 문서 · 묶음 · payload 어디에 있든(키를 가리지 않고 걷는다). */
function treesIn(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) for (const item of value) treesIn(item, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.type === 'Tree') out.push(record)
    for (const child of Object.values(record)) treesIn(child, out)
  }
  return out
}

/** 판 5 꼴 트리인가 — `depth` 가 있거나 항목에 글이 있다. */
function oldShape(node: Record<string, unknown>): boolean {
  const props = (node.props ?? {}) as Record<string, unknown>
  return 'depth' in props || (Array.isArray(props.items) && props.items.some((item) => typeof item === 'string'))
}

/** 글자 하나(JSON)에서 문서 판(`version`) 전부 — `root` 를 가진 객체의 것. */
function versionsIn(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) versionsIn(item, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('root' in record) out.push(record.version)
    for (const child of Object.values(record)) versionsIn(child, out)
  }
  return out
}

async function pageRow(id: string): Promise<{ schema: PageDocument; schema_version: number; head_seq: string; structure_seq: string }> {
  const { rows } = await sql<{ schema: PageDocument; schema_version: number; head_seq: string; structure_seq: string }>`
    select schema, schema_version, head_seq, structure_seq from pages where id = ${id}
  `.execute(db)
  return rows[0]!
}

const find = (root: WbNode, id: string): WbNode => [...walkNodes(root)].find((visit) => visit.node.id === id)!.node
const errorsOf = (doc: PageDocument) => partitionIssues(validatePage(doc)).errors

describe('0035 — Tree 항목을 계층으로 · 판 5 → 6', () => {
  let seeded: Seeded
  let before: string[]

  it('남은 판 5 꼴 트리 0 · 판 5 문서 0 — 모든 표에서', async () => {
    await must(NO_MIGRATIONS)
    await must('0034-accounts')
    seeded = await seed()
    before = await bodies()
    // 카나리아 — 옛 꼴이 있었다: 페이지 2 · 레이아웃 1 · 모듈 1 · 개인 모듈 1 · 스냅샷 3(페이지 2 · 레이아웃 1).
    expect(before.flatMap((body) => treesIn(JSON.parse(body))).filter(oldShape)).toHaveLength(2 + 1 + 1 + 1 + 3)
    await must('0035-tree-items')
    const after = await bodies()
    expect(after).toHaveLength(6)
    const trees = after.flatMap((body) => treesIn(JSON.parse(body)))
    expect(trees).toHaveLength(8)
    expect(trees.filter(oldShape)).toEqual([])
    // 문서 판 — 페이지 2 · 레이아웃 1 · 스냅샷 3. 모듈 표에는 판이 없다.
    expect(after.flatMap((body) => versionsIn(JSON.parse(body)))).toEqual([6, 6, 6, 6, 6, 6])
  })

  it('페이지 — 같은 id · 별칭 · 표지 · 변형 · 상태 칸 · 판 5 화면의 단대로 계층 · 판 6 검증을 지난다', async () => {
    const row = await pageRow(seeded.page)
    expect(row.schema_version).toBe(6)
    expect(errorsOf(row.schema)).toEqual([])
    const node = find(row.schema.root, 'n_tree')
    expect({ alias: node.alias, marker: node.marker, variant: node.variant, props: node.props }).toEqual({
      alias: '좌측 메뉴',
      marker: 3,
      variant: 'compact',
      props: {
        selected: true,
        items: [
          { label: '회원', open: true, children: [{ label: '목록' }] },
          { label: '권한', open: true, children: [{ label: '역할' }] },
          { label: '통계' },
        ],
      },
    })
    expect(find(row.schema.root, 'n_deep').props).toEqual({
      items: [{ label: '가', open: true, children: [{ label: '나', open: true, children: [{ label: '다' }] }] }, { label: '라' }],
    })
  })

  it('트리를 옮긴 페이지만 head_seq · structure_seq 가 하나 오른다 — 판만 오른 페이지는 번호가 그대로', async () => {
    const moved = await pageRow(seeded.page)
    const plain = await pageRow(seeded.plain)
    expect([Number(moved.head_seq), Number(moved.structure_seq)]).toEqual([8, 8])
    expect([Number(plain.head_seq), Number(plain.structure_seq)]).toEqual([7, 5])
    expect({ schema: plain.schema, version: plain.schema_version }).toEqual({ schema: { ...PLAIN, version: 6 }, version: 6 })
  })

  it('레이아웃 · 두 모듈 표 · 스냅샷의 pages[] · layouts[] 도 옮긴다 — 스냅샷 페이지의 schemaVersion 도 6', async () => {
    const layout = (await sql<{ schema: { root: WbNode } }>`select schema from layouts where id = ${seeded.layout}`.execute(db)).rows[0]!
      .schema
    expect(find(layout.root, 'l_tree').props).toEqual({ items: [{ label: '대메뉴', open: true, children: [{ label: '중메뉴' }] }] })
    const shared = (await sql<{ nodes: WbNode[] }>`select nodes from modules where id = ${seeded.module}`.execute(db)).rows[0]!.nodes
    expect(shared[0]!.props).toEqual({ items: [{ label: '하나' }] })
    const personal = (await sql<{ nodes: WbNode[] }>`select nodes from personal_modules where id = ${seeded.personal}`.execute(db)).rows[0]!
      .nodes
    expect(personal[0]!.zones!.headStart![0]!.props).toEqual({ items: [{ label: 'ㄱ', open: true, children: [{ label: 'ㄴ' }] }] })
    const payload = (
      await sql<{ payload: { pages: { schema: PageDocument; schemaVersion: number }[]; layouts: { schema: { root: WbNode } }[] } }>`
      select payload from snapshots where id = ${seeded.snapshot}
    `.execute(db)
    ).rows[0]!.payload
    expect(payload.pages.map((page) => page.schemaVersion)).toEqual([6, 6])
    expect(find(payload.pages[0]!.schema.root, 'n_tree').props).toEqual(find((await pageRow(seeded.page)).schema.root, 'n_tree').props)
    expect(find(payload.layouts[0]!.schema.root, 'l_tree').props).toEqual(find(layout.root, 'l_tree').props)
  })

  it('down — 옛 문서로 돌아간다 · 옮긴 페이지는 번호가 또 오른다', async () => {
    await must('0034-accounts')
    // 고친 행은 표 안 차례가 바뀐다 — 글자 묶음으로 견준다.
    expect((await bodies()).sort()).toEqual([...before].sort())
    expect(Number((await pageRow(seeded.page)).head_seq)).toBe(9)
    expect(Number((await pageRow(seeded.plain)).head_seq)).toBe(7)
  })
})
