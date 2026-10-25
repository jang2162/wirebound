/**
 * **0032 — `List` 를 `DataGrid` 로 · 문서 판 4 → 5**(`src/db/migrations/0032-list-data-grid.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `node-zones-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 문서가 사는 자리 전부(페이지 · 레이아웃 · 두 모듈 표 · 스냅샷의 `pages[]` · `layouts[]`)에서 `List` 가 0 이 된다 · 판 4 문서가 전부 판
 * 5 다 · 노드 id · 별칭 · 표지 · 변형 · 머리 구역 · 상호작용은 그대로이고 옛 props 가 열 · 행 · 바 · `select` · 행 꼴로 간다 · 옛 기본값(props 가
 * 없는 `List`)으로 그린 화면이 그대로 선다 · `selectable` 을 바꾸던 액션이 `select` 로 간다 · 옮긴 문서가 판 5 검증(오류)을 지난다 · `List` 를
 * 옮긴 페이지만 `head_seq` · `structure_seq` 가 하나 오른다 · 한 번 더 돌려도 그대로다 · `down` 은 옛 문서로 돌아간다.
 */
import { randomUUID } from 'node:crypto'
import { installCatalog, partitionIssues, validatePage, walkNodes, type PageDocument, type WbNode } from '@wirebound/schema'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { liftNodes, lowerNodes } from '../src/db/migrations/0032-list-data-grid'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0032_${process.pid}_${Date.now()}`
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

/** 옛 `List` — `down` 이 다시 짓는 props 를 다 적은 꼴(되돌리기가 바이트 그대로 돌아오게). */
const list = (id: string, props: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  id,
  type: 'List',
  props: { pagination: false, ...props },
  ...more,
})

/**
 * 판 4 페이지 — 다 든 목록(열 둘 · 3 줄 · 바 · 체크 선택 · 고른 행 · 로딩 끔 · 변형 · 별칭 · 표지 · 머리 왼쪽 글) · 빈 목록(열 · 행 없음) · 그 목록을
 * 가리키는 단추(`selectable` · `loading` 을 바꾼다).
 */
const PAGE = {
  version: 4,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      list(
        'n_list',
        { columns: ['이름', '이메일'], items: 3, pagination: true, selectable: true, selected: true, loading: false },
        {
          variant: 'compact',
          alias: '회원 목록',
          marker: 2,
          zones: { headStart: [{ id: 'n_total', type: 'Text', props: { content: '총 3건' } }] },
        },
      ),
      list('n_empty', { columns: [], items: 0 }),
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '검색' },
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setProp', target: 'n_list', prop: 'selectable', value: false },
              { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
            ],
          },
        ],
      },
    ],
  },
}
const PLAIN = { version: 4, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '목록 없음' } }] } }

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
        values (${id}, ${projectId}, ${menuId}, ${`쪽 ${sort}`}, ${sort}, ${JSON.stringify(schema)}::jsonb, 4, 7, 5)`.execute(db)
  await insertPage(page, 0, PAGE)
  await insertPage(plain, 1, PLAIN)
  const layoutDoc = {
    version: 4,
    root: { id: 'l_root', type: 'Page', children: [list('l_list', { columns: ['가'], items: 1 }), { id: 'l_slot', type: 'Slot' }] },
  }
  await sql`insert into layouts (id, project_id, name, schema) values (${layout}, ${projectId}, '기본', ${JSON.stringify(layoutDoc)}::jsonb)`.execute(
    db,
  )
  const moduleRow = await sql<{ id: string }>`
    insert into modules (project_id, name, nodes, created_by)
    values (${projectId}, '모듈', ${JSON.stringify([list('m_list', { columns: ['나'], items: 2 })])}::jsonb, ${userId}) returning id
  `.execute(db)
  // 개인 모듈 — 카드 안의 목록(구역 · 몸통 아래로도 걷는다)과 목록 없는 글.
  const personalRow = await sql<{ id: string }>`
    insert into personal_modules (owner_id, name, nodes)
    values (${userId}, '내 모듈', ${JSON.stringify([
      { id: 'q_card', type: 'Card', children: [list('q_list', { columns: ['다'], items: 1 })] },
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
    schemaVersion: 4,
    schema,
    headSeq: 0,
  })
  const payload = {
    payloadVersion: 3,
    capturedAt: '2026-10-25T00:00:00.000Z',
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

/** 글자 하나(JSON)에서 `type` 이 `type` 인 노드 전부 — 문서 · 묶음 · payload 어디에 있든(키를 가리지 않고 걷는다). */
function nodesIn(value: unknown, type: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) for (const item of value) nodesIn(item, type, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.type === type) out.push(record)
    for (const child of Object.values(record)) nodesIn(child, type, out)
  }
  return out
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

describe('0032 — List 를 DataGrid 로 · 판 4 → 5', () => {
  let seeded: Seeded
  let before: string[]

  it('남은 List 0 · 판 4 문서 0 — 모든 표에서', async () => {
    await must(NO_MIGRATIONS)
    await must('0031-entry-form-table')
    seeded = await seed()
    before = await bodies()
    // 카나리아 — 옛 꼴이 있었다: 페이지 2 · 레이아웃 1 · 모듈 1 · 개인 모듈 1 · 스냅샷 3(페이지 2 · 레이아웃 1).
    expect(before.flatMap((body) => nodesIn(JSON.parse(body), 'List'))).toHaveLength(2 + 1 + 1 + 1 + 3)
    await must('0032-list-data-grid')
    const after = await bodies()
    expect(after).toHaveLength(6)
    expect(after.flatMap((body) => nodesIn(JSON.parse(body), 'List'))).toEqual([])
    expect(after.flatMap((body) => nodesIn(JSON.parse(body), 'DataGrid'))).toHaveLength(8)
    // 문서 판 — 페이지 2 · 레이아웃 1 · 스냅샷 3. 모듈 표에는 판이 없다.
    expect(after.flatMap((body) => versionsIn(JSON.parse(body)))).toEqual([5, 5, 5, 5, 5, 5])
  })

  it('페이지 — 같은 id 의 그리드 · 열 · 행 · 바 · select · 행 꼴 · 상호작용 · 판 5 검증을 지난다', async () => {
    const row = await pageRow(seeded.page)
    expect(row.schema_version).toBe(5)
    expect(errorsOf(row.schema)).toEqual([])
    const grid = find(row.schema.root, 'n_list')
    expect({ type: grid.type, variant: grid.variant, alias: grid.alias, marker: grid.marker, props: grid.props }).toEqual({
      type: 'DataGrid',
      variant: 'compact',
      alias: '회원 목록',
      marker: 2,
      props: { select: 'check', loading: false },
    })
    expect(grid.children!.map((column) => [column.type, column.props, column.children!.map((cell) => [cell.type, cell.props])])).toEqual([
      ['GridColumn', { label: '이름' }, [['Text', { content: '—' }]]],
      ['GridColumn', { label: '이메일' }, [['Text', { content: '—' }]]],
    ])
    expect(grid.zones!.headStart).toEqual(PAGE.root.children[0]!.zones!.headStart)
    expect(grid.zones!.rows!.map((r) => [r.type, r.props])).toEqual([['GridRow', { repeat: 3, tone: 'selected' }]])
    expect(grid.zones!.footer!.map((p) => [p.type, p.props])).toEqual([['Pagination', undefined]])
    // 빈 목록 — 열 · 행 · 바가 없다.
    expect(find(row.schema.root, 'n_empty')).toEqual({ id: 'n_empty', type: 'DataGrid', children: [] })
    // `selectable` 을 바꾸던 액션은 `select` 로 · 나머지는 그대로.
    expect(find(row.schema.root, 'n_btn').interactions![0]!.actions).toEqual([
      { type: 'setProp', target: 'n_list', prop: 'select', value: 'none' },
      { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
    ])
    // 새 id 꼴 · 겹치지 않는다.
    const ids = [...walkNodes(row.schema.root)].map((visit) => visit.node.id)
    expect(new Set(ids).size).toBe(ids.length)
    const made = ids.filter((id) => !['n_root', 'n_list', 'n_total', 'n_empty', 'n_btn'].includes(id))
    expect(made.length).toBe(2 + 2 + 1 + 1)
    expect(made.every((id) => /^n_[0-9a-f]{12}$/.test(id))).toBe(true)
  })

  it('List 를 옮긴 페이지만 head_seq · structure_seq 가 하나 오른다 — 판만 오른 페이지는 번호가 그대로', async () => {
    const moved = await pageRow(seeded.page)
    const plain = await pageRow(seeded.plain)
    expect([Number(moved.head_seq), Number(moved.structure_seq)]).toEqual([8, 8])
    expect([Number(plain.head_seq), Number(plain.structure_seq)]).toEqual([7, 5])
    expect({ schema: plain.schema, version: plain.schema_version }).toEqual({ schema: { ...PLAIN, version: 5 }, version: 5 })
  })

  it('레이아웃 · 두 모듈 표 · 스냅샷의 pages[] · layouts[] 도 옮긴다 — 스냅샷 페이지의 schemaVersion 도 5', async () => {
    const layout = (await sql<{ schema: { root: WbNode } }>`select schema from layouts where id = ${seeded.layout}`.execute(db)).rows[0]!
      .schema
    expect(find(layout.root, 'l_list').type).toBe('DataGrid')
    const personal = (await sql<{ nodes: WbNode[] }>`select nodes from personal_modules where id = ${seeded.personal}`.execute(db)).rows[0]!
      .nodes
    expect(personal.map((node) => [node.type, (node.children ?? []).map((child) => child.type)])).toEqual([
      ['Card', ['DataGrid']],
      ['Text', []],
    ])
    const payload = (
      await sql<{ payload: { pages: { schema: PageDocument; schemaVersion: number }[]; layouts: { schema: { root: WbNode } }[] } }>`
      select payload from snapshots where id = ${seeded.snapshot}
    `.execute(db)
    ).rows[0]!.payload
    expect(payload.pages.map((page) => page.schemaVersion)).toEqual([5, 5])
    expect(find(payload.pages[0]!.schema.root, 'n_list').type).toBe('DataGrid')
    expect(find(payload.layouts[0]!.schema.root, 'l_list').type).toBe('DataGrid')
  })

  it('옛 기본값 — props 가 없는 List 는 옛 화면(열 셋 · 5 줄 · 바)대로 서고 50 줄을 넘는 수는 50 에서 자른다', () => {
    const [bare, many] = liftNodes([
      { id: 'n_bare', type: 'List' },
      { id: 'n_many', type: 'List', props: { items: 80, pagination: false, disabled: true } },
    ]) as WbNode[]
    expect(bare!.children!.map((column) => column.props!.label)).toEqual(['컬럼 1', '컬럼 2', '컬럼 3'])
    expect(bare!.zones!.rows!.map((r) => r.props)).toEqual([{ repeat: 5 }])
    expect(bare!.zones!.footer!.map((p) => p.type)).toEqual(['Pagination'])
    expect(bare!.props).toBeUndefined()
    expect(many!.zones!.rows!.map((r) => r.props)).toEqual([{ repeat: 50, tone: 'dimmed' }])
    expect(many!.zones!.footer).toBeUndefined()
  })

  it('한 번 더 돌려도 그대로다', () => {
    const once = liftNodes([PAGE.root])
    expect(liftNodes(once)).toEqual(once)
  })

  it('down — 옛 문서로 돌아간다 · 옮긴 페이지는 번호가 또 오른다 · 그리드 밖의 페이지네이션은 걷는다', async () => {
    expect(lowerNodes(liftNodes([PAGE.root]))).toEqual([PAGE.root])
    expect(
      lowerNodes([
        { id: 'n_loose', type: 'Pagination' },
        { id: 'n_t', type: 'Text' },
      ]),
    ).toEqual([{ id: 'n_t', type: 'Text' }])
    await must('0031-entry-form-table')
    // 고친 행은 표 안 차례가 바뀐다 — 글자 묶음으로 견준다.
    expect((await bodies()).sort()).toEqual([...before].sort())
    expect(Number((await pageRow(seeded.page)).head_seq)).toBe(9)
    expect(Number((await pageRow(seeded.plain)).head_seq)).toBe(7)
  })
})
