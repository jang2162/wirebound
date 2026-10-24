/**
 * **0031 — 입력폼 몸통의 필드를 폼 표로 감싼다**(`src/db/migrations/0031-entry-form-table.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `node-zones-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 문서가 사는 자리 전부(페이지 · 레이아웃 · 두 모듈 표 · 스냅샷의 `pages[]` · `layouts[]`)에서 입력폼 몸통에 바로 선 `Field` 가 0 이 된다 ·
 * 잇단 필드 묶음마다 폼 표 하나(필드가 아닌 자식은 그 자리에서 묶음을 끊는다) · 필드 노드는 그대로(id · props · 값 칸 · 몫 · 별칭 · 상태 보임 ·
 * 표지 · 상호작용) · 새 폼 표 id 는 겹치지 않는다 · 옮긴 문서가 판 4 검증(오류)을 지난다 · 옮긴 페이지만 `head_seq` · `structure_seq` 가 하나 오른다 ·
 * 한 번 더 돌려도 그대로다 · `down` 은 이 꼴의 폼 표만 풀어 옛 문서로 돌아가고 사람이 지은 표(제목)는 남긴다.
 */
import { randomUUID } from 'node:crypto'
import { installCatalog, partitionIssues, validatePage, walkNodes, type PageDocument, type WbNode } from '@wirebound/schema'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { unwrapNodes, wrapNodes } from '../src/db/migrations/0031-entry-form-table'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0031_${process.pid}_${Date.now()}`
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

const field = (id: string, label: string, more: Record<string, unknown> = {}) => ({
  id,
  type: 'Field',
  props: { label },
  children: [{ id: `${id}_i`, type: 'Input' }],
  ...more,
})
const actions = (id: string) => ({ actions: [{ id: `${id}_save`, type: 'Button', props: { label: '저장' }, variant: 'primary' }] })

/**
 * 판 4 페이지 — 입력폼 몸통: 필드 둘(몫 · 별칭 · 상태 보임 · 표지 · 상호작용) · 글(묶음을 끊는다) · 필드 하나 · 사람이 지은 폼 표(제목). 입력폼
 * 밖 필드(카드 안)와 필드 없는 입력폼은 안 감싼다.
 */
const PAGE = {
  version: 4,
  viewStates: [{ id: 's_edit', name: '수정' }],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_ef',
        type: 'EntryForm',
        props: { title: '등록' },
        children: [
          field('n_f1', '이름', { weight: 2, alias: '이름 칸', marker: 1 }),
          field('n_f2', '이메일', {
            visibility: { mode: 'only', states: ['s_edit'] },
            interactions: [{ on: 'change', actions: [{ type: 'setVisible', target: 'n_f1', value: false }] }],
          }),
          { id: 'n_note', type: 'Text', props: { content: '안내' } },
          field('n_f3', '주소'),
          { id: 'n_own', type: 'FormTable', props: { title: '계정상태 정보' }, children: [field('n_f4', '상태')] },
        ],
        zones: actions('n_ef'),
      },
      { id: 'n_card', type: 'Card', children: [field('n_out', '밖')] },
      {
        id: 'n_ef0',
        type: 'EntryForm',
        children: [{ id: 'n_t0', type: 'Text', props: { content: '필드 없음' } }],
        zones: actions('n_ef0'),
      },
    ],
  },
}
const PLAIN = { version: 4, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '폼 없음' } }] } }

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
    root: {
      id: 'l_root',
      type: 'Page',
      children: [
        { id: 'l_ef', type: 'EntryForm', children: [field('l_f', '검색')] },
        { id: 'l_slot', type: 'Slot' },
      ],
    },
  }
  await sql`insert into layouts (id, project_id, name, schema) values (${layout}, ${projectId}, '기본', ${JSON.stringify(layoutDoc)}::jsonb)`.execute(
    db,
  )
  const moduleRow = await sql<{ id: string }>`
    insert into modules (project_id, name, nodes, created_by)
    values (${projectId}, '모듈', ${JSON.stringify([{ id: 'm_ef', type: 'EntryForm', children: [field('m_f', '가')] }])}::jsonb, ${userId}) returning id
  `.execute(db)
  // 개인 모듈 — 필드만 저장한 묶음(입력폼 밖)은 그대로다.
  const personalRow = await sql<{ id: string }>`
    insert into personal_modules (owner_id, name, nodes)
    values (${userId}, '내 모듈', ${JSON.stringify([{ id: 'q_ef', type: 'EntryForm', children: [field('q_f', '나')] }, field('q_loose', '밖')])}::jsonb)
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

/** 글자 하나(JSON)에서 입력폼 노드 전부 — 문서 · 묶음 · payload 어디에 있든(키를 가리지 않고 걷는다). */
function formsIn(value: unknown, out: { children?: { type?: unknown }[] }[] = []): typeof out {
  if (Array.isArray(value)) for (const item of value) formsIn(item, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.type === 'EntryForm') out.push(record as (typeof out)[number])
    for (const child of Object.values(record)) formsIn(child, out)
  }
  return out
}

async function pageRow(id: string): Promise<{ schema: PageDocument; head_seq: string; structure_seq: string }> {
  const { rows } = await sql<{ schema: PageDocument; head_seq: string; structure_seq: string }>`
    select schema, head_seq, structure_seq from pages where id = ${id}
  `.execute(db)
  return rows[0]!
}

const find = (root: WbNode, id: string): WbNode => [...walkNodes(root)].find((visit) => visit.node.id === id)!.node
const errorsOf = (doc: PageDocument) => partitionIssues(validatePage(doc)).errors

describe('0031 — 입력폼 몸통의 필드를 폼 표로', () => {
  let seeded: Seeded
  let before: string[]

  it('남은 옛 꼴 0 — 모든 표에서 입력폼 몸통에 바로 선 필드가 없다', async () => {
    await must(NO_MIGRATIONS)
    await must('0030-assets')
    seeded = await seed()
    before = await bodies()
    // 카나리아 — 옛 꼴이 있었다(입력폼 몸통의 필드).
    const direct = (texts: string[]) =>
      texts.flatMap((body) => formsIn(JSON.parse(body))).filter((form) => (form.children ?? []).some((child) => child.type === 'Field'))
    expect(direct(before).length).toBe(1 + 1 + 1 + 1 + 1 + 1)
    await must('0031-entry-form-table')
    const after = await bodies()
    expect(after).toHaveLength(6)
    // 입력폼 수 — 페이지 2 · 레이아웃 1 · 모듈 1 · 개인 모듈 1 · 스냅샷 3(페이지 2 · 레이아웃 1).
    expect(after.flatMap((body) => formsIn(JSON.parse(body)))).toHaveLength(8)
    expect(direct(after)).toEqual([])
  })

  it('페이지 — 잇단 필드마다 폼 표 하나 · 글은 묶음을 끊는다 · 필드 노드는 그대로 · 판 4 검증을 지난다', async () => {
    const { schema } = await pageRow(seeded.page)
    expect(errorsOf(schema)).toEqual([])
    const body = find(schema.root, 'n_ef').children!
    expect(body.map((node) => [node.type, (node.children ?? []).map((child) => child.id)])).toEqual([
      ['FormTable', ['n_f1', 'n_f2']],
      ['Text', []],
      ['FormTable', ['n_f3']],
      ['FormTable', ['n_f4']],
    ])
    // 새 폼 표는 props · 구역이 없다(1 열) · id 꼴 · 겹치지 않는다 · 사람이 지은 표는 그대로다.
    const made = [body[0]!, body[2]!]
    expect(made.map((node) => Object.keys(node).sort())).toEqual([
      ['children', 'id', 'type'],
      ['children', 'id', 'type'],
    ])
    expect(made.every((node) => /^n_[0-9a-f]{12}$/.test(node.id))).toBe(true)
    const ids = [...walkNodes(schema.root)].map((visit) => visit.node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(body[3]).toEqual(PAGE.root.children[0]!.children![4])
    // 필드 노드는 바이트 그대로 옮겼다.
    for (const id of ['n_f1', 'n_f2', 'n_f3']) {
      expect(find(schema.root, id)).toEqual(PAGE.root.children[0]!.children!.find((node) => node.id === id))
    }
    // 입력폼 밖 필드 · 필드 없는 입력폼은 그대로다.
    expect(find(schema.root, 'n_card')).toEqual(PAGE.root.children[1])
    expect(find(schema.root, 'n_ef0')).toEqual(PAGE.root.children[2])
  })

  it('옮긴 페이지만 head_seq · structure_seq 가 하나 오른다 — 안 옮긴 페이지는 번호 · 문서가 그대로', async () => {
    const moved = await pageRow(seeded.page)
    const plain = await pageRow(seeded.plain)
    expect([Number(moved.head_seq), Number(moved.structure_seq)]).toEqual([8, 8])
    expect([Number(plain.head_seq), Number(plain.structure_seq)]).toEqual([7, 5])
    expect(plain.schema).toEqual(PLAIN)
  })

  it('레이아웃 · 두 모듈 표 · 스냅샷의 pages[] · layouts[] 도 옮긴다 — 입력폼 밖 필드 묶음은 그대로', async () => {
    const layout = (await sql<{ schema: { root: WbNode } }>`select schema from layouts where id = ${seeded.layout}`.execute(db)).rows[0]!
      .schema
    expect(find(layout.root, 'l_ef').children!.map((node) => node.type)).toEqual(['FormTable'])
    const personal = (await sql<{ nodes: WbNode[] }>`select nodes from personal_modules where id = ${seeded.personal}`.execute(db)).rows[0]!
      .nodes
    expect(personal.map((node) => [node.type, (node.children ?? []).map((child) => child.type)])).toEqual([
      ['EntryForm', ['FormTable']],
      ['Field', ['Input']],
    ])
    const payload = (
      await sql<{ payload: { pages: { schema: PageDocument }[]; layouts: { schema: { root: WbNode } }[] } }>`
      select payload from snapshots where id = ${seeded.snapshot}
    `.execute(db)
    ).rows[0]!.payload
    expect(find(payload.pages[0]!.schema.root, 'n_ef').children!.map((node) => node.type)).toEqual([
      'FormTable',
      'Text',
      'FormTable',
      'FormTable',
    ])
    expect(payload.pages[1]!.schema).toEqual(PLAIN)
    expect(find(payload.layouts[0]!.schema.root, 'l_ef').children!.map((node) => node.type)).toEqual(['FormTable'])
  })

  it('한 번 더 돌려도 그대로다', () => {
    const once = wrapNodes([PAGE.root])
    expect(wrapNodes(once)).toEqual(once)
  })

  it('down — 이 꼴의 폼 표만 풀어 옛 문서로 돌아간다 · 사람이 지은 표(제목)는 남는다 · 옮긴 페이지는 번호가 또 오른다', async () => {
    expect(unwrapNodes(wrapNodes([PAGE.root]))).toEqual([PAGE.root])
    await must('0030-assets')
    // 고친 행은 표 안 차례가 바뀐다 — 글자 묶음으로 견준다.
    expect((await bodies()).sort()).toEqual([...before].sort())
    const moved = await pageRow(seeded.page)
    expect(Number(moved.head_seq)).toBe(9)
    expect(Number((await pageRow(seeded.plain)).head_seq)).toBe(7)
  })
})
