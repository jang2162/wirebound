/**
 * **0029 — 문서 판 3 → 4(조합 입력)**(`src/db/migrations/0029-compose-field.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `node-zones-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 판 3 페이지 · 레이아웃 · 모듈 · 개인 모듈 · 스냅샷(판 2 · 3 문서)이 판 4 가 되고 판 3 이 하나도 안 남는다 · 옛 `control` 아홉이 표대로 조각이
 * 된다(타입 · 차례 · 옮긴 prop · 변형) · 빈 안내 문구는 안 옮긴다 · 구역 안의 필드도 옮긴다 · 노드 수는 옛 수 + 새 조각 수 · 옛 노드 id · 번호 · 별칭 ·
 * 보임은 그대로 · 코멘트가 가리키는 노드가 남는다 · `setProp` 은 그 prop 을 가진 조각으로 · 옮긴 문서가 판 4 검증(오류)을 지난다 · `down` 은 행이
 * 있으면 거절하고 비었으면 내려간다.
 */
import { randomUUID } from 'node:crypto'
import {
  installCatalog,
  partitionIssues,
  validateLayout,
  validatePage,
  walkNodes,
  type LayoutDocument,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { SnapshotPayloadSchema } from '@wirebound/themes'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { liftDocument, liftNodes } from '../src/db/migrations/0029-compose-field'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0029_${process.pid}_${Date.now()}`
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

async function migrateTo(name: string | typeof NO_MIGRATIONS): Promise<Error | undefined> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateTo(name)
  return result.error as Error | undefined
}

async function must(name: string | typeof NO_MIGRATIONS): Promise<void> {
  const error = await migrateTo(name)
  if (error !== undefined) throw error
}

const field = (id: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, type: 'Field', props, ...extra })

/**
 * 판 3 페이지 — `control` 아홉(+ 안 적은 것) · 안내 문구 · 비활성 · 오류 · 필수 · 번호 · 별칭 · 보임 · 구역(검색폼 단추 구역) 안의 필드 · 그 필드의
 * prop 을 바꾸는 `setProp` 넷.
 */
const V3_PAGE = {
  version: 3,
  viewStates: [{ id: 's_admin', name: '관리자' }],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_sf',
        type: 'SearchForm',
        children: [
          field('n_text', { label: '이름', control: 'text', placeholder: '이름을 입력', required: true }, { marker: 1, alias: '이름 칸' }),
          field('n_none', { label: '기본' }),
          field('n_num', { label: '나이', control: 'number', placeholder: '', invalid: true }),
          field('n_sel', { label: '상태', control: 'select', placeholder: '고르세요', disabled: true }),
        ],
        zones: {
          actions: [
            field('n_zone', { label: '구역 안', control: 'date', placeholder: 'YYYY-MM-DD' }),
            { id: 'n_b1', type: 'Button', props: { label: '검색' }, variant: 'primary' },
          ],
        },
      },
      {
        id: 'n_ef',
        type: 'EntryForm',
        props: { title: '등록' },
        children: [
          field('n_range', { label: '기간', control: 'dateRange', placeholder: '기간', disabled: true, invalid: true }),
          field('n_chk', { label: '동의', control: 'checkbox', placeholder: '무시', disabled: true, invalid: true }),
          field('n_rad', { label: '여부', control: 'radio', invalid: true }, { visibility: { mode: 'only', states: ['s_admin'] } }),
          field('n_area', { label: '소개', control: 'textarea', placeholder: '소개를 입력' }),
          field('n_file', { label: '첨부', control: 'file', placeholder: '옛 안내', disabled: true }),
        ],
        zones: { actions: [{ id: 'n_save', type: 'Button', props: { label: '저장' }, variant: 'primary' }] },
      },
      {
        id: 'n_go',
        type: 'Button',
        props: { label: '바꾸기' },
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setProp', target: 'n_text', prop: 'placeholder', value: '새 안내' },
              { type: 'setProp', target: 'n_chk', prop: 'disabled', value: false },
              { type: 'setProp', target: 'n_range', prop: 'invalid', value: false },
              { type: 'setProp', target: 'n_sel', prop: 'control', value: 'text' },
              { type: 'setProp', target: 'n_text', prop: 'label', value: '성명' },
            ],
          },
        ],
      },
    ],
  },
}

/** 판 3 페이지의 노드 수 — 카나리아(옮긴 뒤 이 수 + 새 조각 수). */
const V3_NODES = [...walkNodes(V3_PAGE.root as WbNode)].length

/** 새 조각 수 — text · 안 적음 · number · select · date · dateRange 셋 · checkbox · radio · textarea · file 둘. */
const NEW_PIECES = 13

/** 판 2 스냅샷 페이지 — 판 2 → 3(얼린 `0028`) 뒤 판 3 → 4. 옛 탭 · 단추 없는 폼 · 옛 필드. */
const V2_SNAPSHOT_PAGE = {
  version: 2,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [{ id: 'n_ef2', type: 'EntryForm', children: [field('n_f2', { label: '이름', control: 'select' })] }],
  },
}

const V4_PAGE = {
  version: 4,
  root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '이미 판 4' } }] },
}

interface Seeded {
  pageV3: string
  pageV4: string
  layoutId: string
  moduleId: string
  personalId: string
  snapshotId: string
  commentId: string
}

async function seed(): Promise<Seeded> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const [pageV3, pageV4, layoutId, snapshotId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`u-${userId}@example.com`}, '앨리스', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  const page = async (id: string, sort: number, schema: unknown, version: number) =>
    sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version) values (${id}, ${projectId}, ${menuId}, ${`쪽 ${sort}`}, ${sort}, ${JSON.stringify(schema)}::jsonb, ${version})`.execute(
      db,
    )
  await page(pageV3, 0, V3_PAGE, 3)
  await page(pageV4, 1, V4_PAGE, 4)
  const comment = await sql<{ id: string }>`
    insert into comments (page_id, node_id, body, author_id) values (${pageV3}, 'n_text', '이름 칸 확인', ${userId}) returning id
  `.execute(db)
  const layout = {
    version: 3,
    root: {
      id: 'l_root',
      type: 'Page',
      children: [field('l_f', { label: '검색', control: 'text', placeholder: '검색어' }), { id: 'l_slot', type: 'Slot' }],
    },
  }
  await sql`insert into layouts (id, project_id, name, schema) values (${layoutId}, ${projectId}, '기본', ${JSON.stringify(layout)}::jsonb)`.execute(
    db,
  )
  const nodes = [
    field('m_f', { label: '고르기', control: 'radio' }),
    {
      id: 'm_btn',
      type: 'Button',
      interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'm_f', prop: 'disabled', value: true }] }],
    },
  ]
  const moduleRow = await sql<{ id: string }>`
    insert into modules (project_id, name, nodes, created_by) values (${projectId}, '모듈', ${JSON.stringify(nodes)}::jsonb, ${userId}) returning id
  `.execute(db)
  const personal = [{ id: 'q_sf', type: 'SearchForm', children: [field('q_f', { label: '숫자', control: 'number' })] }]
  const personalRow = await sql<{ id: string }>`
    insert into personal_modules (owner_id, name, nodes) values (${userId}, '내 모듈', ${JSON.stringify(personal)}::jsonb) returning id
  `.execute(db)
  const snapshotPage = (id: string, schema: { version: number }) => ({
    id,
    menuNodeId: menuId,
    title: '쪽',
    description: null,
    sortOrder: 0,
    schemaVersion: schema.version,
    schema,
    headSeq: 0,
  })
  const payload = {
    payloadVersion: 3,
    capturedAt: '2026-10-24T00:00:00.000Z',
    menu: [{ id: menuId, parentId: null, title: '메뉴', sortOrder: 0 }],
    pages: [snapshotPage(randomUUID(), V3_PAGE), snapshotPage(randomUUID(), V2_SNAPSHOT_PAGE), snapshotPage(randomUUID(), V4_PAGE)],
    layouts: [{ id: layoutId, name: '기본', schema: layout }],
    comments: [],
    theme: null,
  }
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snapshotId}, ${projectId}, '판3', ${JSON.stringify(payload)}::jsonb, ${userId})`.execute(
    db,
  )
  return {
    pageV3,
    pageV4,
    layoutId,
    moduleId: moduleRow.rows[0]!.id,
    personalId: personalRow.rows[0]!.id,
    snapshotId,
    commentId: comment.rows[0]!.id,
  }
}

async function pageRow(id: string): Promise<{ schema: PageDocument; schema_version: number }> {
  const { rows } = await sql<{
    schema: PageDocument
    schema_version: number
  }>`select schema, schema_version from pages where id = ${id}`.execute(db)
  return rows[0]!
}

const find = (root: WbNode, id: string): WbNode => [...walkNodes(root)].find((visit) => visit.node.id === id)!.node

/** 필드 하나의 값 칸 — 타입 · props · 변형(id 는 뺀다). */
const piecesOf = (root: WbNode, id: string) =>
  (find(root, id).children ?? []).map((piece) => ({
    type: piece.type,
    ...(piece.props === undefined ? {} : { props: piece.props }),
    ...(piece.variant === undefined ? {} : { variant: piece.variant }),
  }))

/** 글자 하나(JSON)에서 `Field` 노드 전부 — 문서 · 묶음 · payload 어디에 있든(키를 가리지 않고 걷는다). */
function fieldsIn(value: unknown, out: Record<string, unknown>[] = []): typeof out {
  if (Array.isArray(value)) for (const item of value) fieldsIn(item, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.type === 'Field') out.push(record)
    for (const child of Object.values(record)) fieldsIn(child, out)
  }
  return out
}
const errorsOf = (doc: PageDocument) => partitionIssues(validatePage(doc)).errors

describe('0029 — 문서 판 3 → 4', () => {
  let seeded: Seeded

  it('판 3 이 하나도 안 남는다 — 페이지 · 레이아웃 · 스냅샷 문서 · 두 모듈 표(옛 필드 prop · 값 칸 없는 필드)', async () => {
    await must(NO_MIGRATIONS)
    await must('0028-node-zones')
    seeded = await seed()
    await must('0029-compose-field')

    const left = await sql<{ pages: number; layouts: number; snapshots: number; snapshotLayouts: number }>`
      select
        (select count(*)::int from pages where schema_version <> 4 or (schema->>'version')::int <> 4) as pages,
        (select count(*)::int from layouts where (schema->>'version')::int <> 4) as layouts,
        (select count(*)::int from snapshots s, jsonb_array_elements(s.payload->'pages') p
          where (p->>'schemaVersion')::int <> 4 or (p->'schema'->>'version')::int <> 4) as snapshots,
        (select count(*)::int from snapshots s, jsonb_array_elements(s.payload->'layouts') l
          where (l->'schema'->>'version')::int <> 4) as "snapshotLayouts"
    `.execute(db)
    expect(left.rows[0]).toEqual({ pages: 0, layouts: 0, snapshots: 0, snapshotLayouts: 0 })
    const texts = await sql<{ body: string }>`
      select schema::text as body from pages union all select schema::text from layouts
      union all select nodes::text from modules union all select nodes::text from personal_modules
      union all select payload::text from snapshots
    `.execute(db)
    expect(texts.rows).toHaveLength(6)
    // 옛 꼴의 흔적 — 필드의 `control` · 안내 · 비활성 · 오류, 값 칸이 빈 필드 — 을 모든 표에서 센다. 필드 수는 카나리아다: 판 3 페이지 10 · 레이아웃 1 ·
    // 모듈 1 · 개인 모듈 1 · 스냅샷 12(판 3 페이지 10 · 판 2 페이지 1 · 레이아웃 1). 판 4 페이지에는 필드가 없다.
    const fields = texts.rows.flatMap(({ body }) => fieldsIn(JSON.parse(body)))
    expect(fields).toHaveLength(10 + 1 + 1 + 1 + (10 + 1 + 1))
    const leftover = fields.filter((node) => {
      const props = (node.props ?? {}) as Record<string, unknown>
      const children = node.children
      return (
        ['control', 'placeholder', 'disabled', 'invalid'].some((key) => key in props) || !Array.isArray(children) || children.length === 0
      )
    })
    expect(leftover).toEqual([])
  })

  it('페이지 — control 마다 표대로 조각 · 노드 수 · 옛 id · 번호 · 별칭 · 보임 · 판 4 검증을 지난다', async () => {
    const { schema, schema_version } = await pageRow(seeded.pageV3)
    expect(schema_version).toBe(4)
    expect(schema.version).toBe(4)
    expect(errorsOf(schema)).toEqual([])
    expect(schema.viewStates).toEqual([{ id: 's_admin', name: '관리자' }])

    const after = [...walkNodes(schema.root)].map((visit) => visit.node.id)
    expect(after).toHaveLength(V3_NODES + NEW_PIECES)
    expect(new Set(after).size).toBe(after.length)
    const old = [...walkNodes(V3_PAGE.root as WbNode)].map((visit) => visit.node.id)
    // 옛 노드는 전부 남고 차례도 같다 — 새 조각이 사이에 끼었을 뿐이다.
    expect(after.filter((id) => old.includes(id))).toEqual(old)
    for (const id of after.filter((id) => !old.includes(id))) expect(id).toMatch(/^n_[0-9a-f]{12}$/)

    expect(find(schema.root, 'n_text')).toMatchObject({ props: { label: '이름', required: true }, marker: 1, alias: '이름 칸' })
    expect(find(schema.root, 'n_rad').visibility).toEqual({ mode: 'only', states: ['s_admin'] })
    expect(find(schema.root, 'n_none').props).toEqual({ label: '기본' })

    expect(piecesOf(schema.root, 'n_text')).toEqual([{ type: 'Input', props: { placeholder: '이름을 입력' } }])
    expect(piecesOf(schema.root, 'n_none')).toEqual([{ type: 'Input' }])
    expect(piecesOf(schema.root, 'n_num')).toEqual([{ type: 'Input', props: { kind: 'number', invalid: true } }])
    expect(piecesOf(schema.root, 'n_sel')).toEqual([{ type: 'Select', props: { placeholder: '고르세요', disabled: true } }])
    expect(piecesOf(schema.root, 'n_zone')).toEqual([{ type: 'DateInput', props: { placeholder: 'YYYY-MM-DD' } }])
    expect(piecesOf(schema.root, 'n_range')).toEqual([
      { type: 'DateInput', props: { disabled: true, invalid: true } },
      { type: 'Affix', props: { text: '~' } },
      { type: 'DateInput', props: { disabled: true, invalid: true } },
    ])
    expect(piecesOf(schema.root, 'n_chk')).toEqual([{ type: 'CheckboxGroup', props: { disabled: true } }])
    expect(piecesOf(schema.root, 'n_rad')).toEqual([{ type: 'RadioGroup', variant: 'radio' }])
    expect(piecesOf(schema.root, 'n_area')).toEqual([{ type: 'TextArea', props: { placeholder: '소개를 입력' } }])
    expect(piecesOf(schema.root, 'n_file')).toEqual([
      { type: 'Input', props: { readonly: true, placeholder: '선택된 파일 없음', disabled: true } },
      { type: 'Button', props: { label: '파일 선택', disabled: true } },
    ])
    // 구역(단추 구역) 안의 차례는 그대로다.
    expect(find(schema.root, 'n_sf').zones!.actions!.map((node) => node.id)).toEqual(['n_zone', 'n_b1'])
  })

  it('setProp — 옮긴 prop 은 그 prop 을 가진 첫 조각으로 · control 과 남은 prop 은 그대로', async () => {
    const { schema } = await pageRow(seeded.pageV3)
    const firstPiece = (id: string) => find(schema.root, id).children![0]!.id
    expect(find(schema.root, 'n_go').interactions![0]!.actions).toEqual([
      { type: 'setProp', target: firstPiece('n_text'), prop: 'placeholder', value: '새 안내' },
      { type: 'setProp', target: firstPiece('n_chk'), prop: 'disabled', value: false },
      { type: 'setProp', target: firstPiece('n_range'), prop: 'invalid', value: false },
      { type: 'setProp', target: 'n_sel', prop: 'control', value: 'text' },
      { type: 'setProp', target: 'n_text', prop: 'label', value: '성명' },
    ])
    // `control` 을 바꾸던 액션은 경고로 남는다(오류가 아니다).
    const warnings = partitionIssues(validatePage(schema)).warnings.map((issue) => issue.code)
    expect(warnings).toContain('invalid-interaction-prop')
  })

  it('코멘트가 가리키는 노드가 남는다 — id 가 그대로라 코멘트가 안 끊긴다', async () => {
    const { rows } = await sql<{ node_id: string }>`select node_id from comments where id = ${seeded.commentId}`.execute(db)
    expect(rows[0]!.node_id).toBe('n_text')
    const { schema } = await pageRow(seeded.pageV3)
    expect(find(schema.root, rows[0]!.node_id).type).toBe('Field')
  })

  it('판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃)', async () => {
    expect(await pageRow(seeded.pageV4)).toEqual({ schema: V4_PAGE, schema_version: 4 })

    const layout = (await sql<{ schema: LayoutDocument }>`select schema from layouts where id = ${seeded.layoutId}`.execute(db)).rows[0]!
      .schema
    expect(layout.version).toBe(4)
    expect(partitionIssues(validateLayout(layout)).errors).toEqual([])
    expect(piecesOf(layout.root, 'l_f')).toEqual([{ type: 'Input', props: { placeholder: '검색어' } }])

    const nodes = (await sql<{ nodes: WbNode[] }>`select nodes from modules where id = ${seeded.moduleId}`.execute(db)).rows[0]!.nodes
    expect(piecesOf(nodes[0]!, 'm_f')).toEqual([{ type: 'RadioGroup', variant: 'radio' }])
    expect(nodes[1]!.interactions![0]!.actions).toEqual([
      { type: 'setProp', target: nodes[0]!.children![0]!.id, prop: 'disabled', value: true },
    ])

    const personal = (await sql<{ nodes: WbNode[] }>`select nodes from personal_modules where id = ${seeded.personalId}`.execute(db))
      .rows[0]!.nodes
    expect(piecesOf(personal[0]!, 'q_f')).toEqual([{ type: 'Input', props: { kind: 'number' } }])

    const payload = (await sql<{ payload: unknown }>`select payload from snapshots where id = ${seeded.snapshotId}`.execute(db)).rows[0]!
      .payload
    const parsed = SnapshotPayloadSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    const [v3, v2, v4] = parsed.data!.pages
    expect(v3!.schema.version).toBe(4)
    expect(errorsOf(v3!.schema)).toEqual([])
    expect(piecesOf(v3!.schema.root, 'n_range').map((piece) => piece.type)).toEqual(['DateInput', 'Affix', 'DateInput'])
    // 판 2 문서는 얼린 판 2 → 3(폼 단추)을 지나 판 4 가 된다.
    expect(v2!.schema.version).toBe(4)
    expect(errorsOf(v2!.schema)).toEqual([])
    expect(find(v2!.schema.root, 'n_ef2').zones!.actions).toHaveLength(2)
    expect(piecesOf(v2!.schema.root, 'n_f2')).toEqual([{ type: 'Select' }])
    expect(v4).toMatchObject({ schemaVersion: 4, schema: V4_PAGE })
    expect(parsed.data!.layouts[0]!.schema.version).toBe(4)
  })

  it('한 번 더 돌려도 그대로다 — 판 4 문서 · 값 칸이 든 필드', () => {
    const v4 = liftDocument(V3_PAGE, null) as PageDocument
    expect(liftDocument(v4, null)).toBeNull()
    const nodes = liftNodes([field('x', { label: '가', control: 'select' })])
    expect(liftNodes(nodes)).toEqual(nodes)
  })

  it('down — 행이 있으면 «백업에서 되돌린다»로 거절하고 아무것도 안 바꾼다', async () => {
    const error = await migrateTo('0028-node-zones')
    expect(error?.message).toContain('되돌릴 수 없습니다')
    expect(error?.message).toContain('백업에서 되돌린다')
    expect((await pageRow(seeded.pageV3)).schema_version).toBe(4)
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0029-compose-field')
  })

  it('down — 페이지 · 모듈 · 레이아웃 · 스냅샷이 비면 내려간다', async () => {
    await sql`delete from projects`.execute(db)
    await sql`delete from users`.execute(db)
    await must('0028-node-zones')
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0028-node-zones')
  })
})
