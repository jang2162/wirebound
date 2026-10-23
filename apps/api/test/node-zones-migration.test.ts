/**
 * **0028 — 문서 판 2 → 3(노드 구역 · 탭 패널)**(`src/db/migrations/0028-node-zones.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `state-visibility-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 판 2 페이지 · 레이아웃 · 모듈 · 개인 모듈 · 스냅샷(판 1 · 2 문서)이 판 3 이 되고 판 2 가 하나도 안 남는다 · 옛 탭은 이름마다 패널 ·
 * 옛 자식은 `active` 자리 패널에 · `switchTab` 은 그 패널을 가리킨다 · 폼에 기본 단추(카탈로그 `initial` 과 같은 노드 — 낱말 · 차례 · 주 단추
 * `primary`) · 옮긴 문서가 판 3 검증(오류)을 지난다 · 스냅샷은 payload 규격을
 * 지난다 · 상태 보임 · 코멘트 번호 · 별칭은 그대로다 · `down` 은 행이 있으면 거절하고 비었으면 내려간다.
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
import { liftDocument, liftNodes } from '../src/db/migrations/0028-node-zones'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0028_${process.pid}_${Date.now()}`
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

const text = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Text', props: { content }, ...extra })

/** 판 2 페이지 — 탭(이름 셋 · 둘째 활성 · 자식 둘) · 그 탭을 바꾸는 단추 셋(범위 안 · 밖 · 문서 밖 대상) · 검색폼 · 입력폼 · 접힌 검색폼 · 상태 보임 · 번호 · 별칭. */
const V2_PAGE = {
  version: 2,
  viewStates: [{ id: 's_admin', name: '관리자' }],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_tabs',
        type: 'Tabs',
        alias: '회원 탭',
        props: { tabs: ['기본정보', '상세정보', '이력'], active: 1 },
        children: [text('n_in1', '안 하나', { marker: 2 }), text('n_in2', '안 둘', { visibility: { mode: 'only', states: ['s_admin'] } })],
      },
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '이력 보기' },
        marker: 1,
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'switchTab', target: 'n_tabs', tab: 2 },
              { type: 'switchTab', target: 'n_tabs', tab: 7 },
              { type: 'switchTab', target: 'n_gone', tab: 0 },
              { type: 'setVisible', target: 'n_in1', value: false },
            ],
          },
        ],
      },
      { id: 'n_sf', type: 'SearchForm', props: { columns: 2 }, children: [{ id: 'n_f1', type: 'Field', props: { label: '검색어' } }] },
      { id: 'n_sf2', type: 'SearchForm', props: { collapsed: true } },
      { id: 'n_ef', type: 'EntryForm', props: { title: '등록' }, children: [{ id: 'n_f2', type: 'Field', props: { label: '이름' } }] },
      // `tabs` 를 안 적은 탭(기본값 «탭 1» · «탭 2») · 자식 없음.
      { id: 'n_tabs2', type: 'Tabs' },
    ],
  },
}

const V3_PAGE = { version: 3, root: { id: 'n_root', type: 'Page', children: [text('n_t', '이미 판 3')] } }

/** 판 1 스냅샷 페이지 — 상태 영역이 든 문서(스냅샷은 `0025` 가 안 옮겼다). */
const V1_SNAPSHOT_PAGE = {
  version: 1,
  viewStates: [{ id: 's_admin', name: '관리자' }],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_sw',
        type: 'StateSwitch',
        children: [
          { id: 'n_c0', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'n_e', type: 'EntryForm' }] },
          { id: 'n_c1', type: 'StateCase', props: { state: 's_admin' }, children: [text('n_a', '관리자')] },
        ],
      },
    ],
  },
}

interface Seeded {
  projectId: string
  pageV2: string
  pageV3: string
  layoutId: string
  moduleId: string
  personalId: string
  snapshotId: string
}

async function seed(): Promise<Seeded> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const [pageV2, pageV3, layoutId, snapshotId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`u-${userId}@example.com`}, '앨리스', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  const page = async (id: string, sort: number, schema: unknown, version: number) =>
    sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version) values (${id}, ${projectId}, ${menuId}, ${`쪽 ${sort}`}, ${sort}, ${JSON.stringify(schema)}::jsonb, ${version})`.execute(
      db,
    )
  await page(pageV2, 0, V2_PAGE, 2)
  await page(pageV3, 1, V3_PAGE, 3)
  const layout = {
    version: 2,
    root: {
      id: 'l_root',
      type: 'Page',
      children: [
        { id: 'l_ef', type: 'EntryForm' },
        { id: 'l_slot', type: 'Slot' },
      ],
    },
  }
  await sql`insert into layouts (id, project_id, name, schema) values (${layoutId}, ${projectId}, '기본', ${JSON.stringify(layout)}::jsonb)`.execute(
    db,
  )
  const nodes = [
    { id: 'm_tabs', type: 'Tabs', props: { tabs: ['가', '나'] }, children: [text('m_t', '글')] },
    { id: 'm_btn', type: 'Button', interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: 'm_tabs', tab: 1 }] }] },
  ]
  const moduleRow = await sql<{ id: string }>`
    insert into modules (project_id, name, nodes, created_by) values (${projectId}, '모듈', ${JSON.stringify(nodes)}::jsonb, ${userId}) returning id
  `.execute(db)
  const personal = [{ id: 'q_sf', type: 'SearchForm', children: [{ id: 'q_f', type: 'Field' }] }]
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
    capturedAt: '2026-10-22T00:00:00.000Z',
    menu: [{ id: menuId, parentId: null, title: '메뉴', sortOrder: 0 }],
    pages: [snapshotPage(randomUUID(), V2_PAGE), snapshotPage(randomUUID(), V1_SNAPSHOT_PAGE), snapshotPage(randomUUID(), V3_PAGE)],
    layouts: [{ id: layoutId, name: '기본', schema: layout }],
    comments: [],
    theme: null,
  }
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snapshotId}, ${projectId}, '판2', ${JSON.stringify(payload)}::jsonb, ${userId})`.execute(
    db,
  )
  return { projectId, pageV2, pageV3, layoutId, moduleId: moduleRow.rows[0]!.id, personalId: personalRow.rows[0]!.id, snapshotId }
}

async function pageRow(id: string): Promise<{ schema: PageDocument; schema_version: number }> {
  const { rows } = await sql<{
    schema: PageDocument
    schema_version: number
  }>`select schema, schema_version from pages where id = ${id}`.execute(db)
  return rows[0]!
}

const find = (root: WbNode, id: string): WbNode => [...walkNodes(root)].find((visit) => visit.node.id === id)!.node

/** 폼 단추 구역의 꼴 — 낱말 · 차례 · 주 단추(`variant`). 새로 만드는 폼(카탈로그 `initial`)과 같아야 한다. */
const FORM_BUTTONS: Record<string, [string, string | null][]> = {
  SearchForm: [
    ['초기화', null],
    ['검색', 'primary'],
  ],
  EntryForm: [
    ['저장', 'primary'],
    ['취소', null],
  ],
}
const buttonsOf = (form: { zones?: Record<string, unknown> }): [unknown, unknown][] =>
  ((form.zones?.actions ?? []) as WbNode[]).map((node) => [node.props?.label, node.variant ?? null])

/** 글자 하나(JSON)에서 폼 노드 전부 — 문서 · 묶음 · payload 어디에 있든(키를 가리지 않고 걷는다). */
function formsIn(value: unknown, out: { type: string; zones?: Record<string, unknown> }[] = []): typeof out {
  if (Array.isArray(value)) for (const item of value) formsIn(item, out)
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.type === 'string' && record.type in FORM_BUTTONS) out.push(record as (typeof out)[number])
    for (const child of Object.values(record)) formsIn(child, out)
  }
  return out
}
const errorsOf = (doc: PageDocument) => partitionIssues(validatePage(doc)).errors

describe('0028 — 문서 판 2 → 3', () => {
  let seeded: Seeded

  it('판 2 가 하나도 안 남는다 — 페이지 · 레이아웃 · 스냅샷 문서 · 두 모듈 표(옛 탭 · 옛 탭 번호 · 단추 없는 폼)', async () => {
    await must(NO_MIGRATIONS)
    await must('0027-retire-system-themes')
    seeded = await seed()
    await must('0028-node-zones')

    const left = await sql<{ pages: number; layouts: number; snapshots: number }>`
      select
        (select count(*)::int from pages where schema_version <> 3 or (schema->>'version')::int <> 3) as pages,
        (select count(*)::int from layouts where (schema->>'version')::int <> 3) as layouts,
        (select count(*)::int from snapshots s, jsonb_array_elements(s.payload->'pages') p
          where (p->>'schemaVersion')::int <> 3 or (p->'schema'->>'version')::int <> 3) as snapshots
    `.execute(db)
    expect(left.rows[0]).toEqual({ pages: 0, layouts: 0, snapshots: 0 })
    // 옛 꼴의 흔적 — `tabs` prop · `tab` 칸 · 단추 없는 폼 — 을 모든 표의 글자에서 센다.
    const texts = await sql<{ body: string }>`
      select schema::text as body from pages union all select schema::text from layouts
      union all select nodes::text from modules union all select nodes::text from personal_modules
      union all select payload::text from snapshots
    `.execute(db)
    expect(texts.rows).toHaveLength(6)
    for (const { body } of texts.rows) {
      expect(body).not.toContain('"tabs":')
      expect(body).not.toContain('"tab":')
      expect(body).not.toContain('"StateSwitch"')
    }
    // 단추 없는 폼 — 모든 표의 폼이 기본 단추 둘을 든다(낱말 · 차례 · 주 단추까지). 폼 수는 카나리아다: 페이지 3 · 레이아웃 1 · 개인 모듈 1 ·
    // 스냅샷 5(판 2 페이지 3 · 판 1 페이지 1 · 레이아웃 1). 판 3 페이지 · 모듈 표에는 폼이 없다.
    const forms = texts.rows.flatMap(({ body }) => formsIn(JSON.parse(body)))
    expect(forms).toHaveLength(10)
    expect(forms.filter((form) => JSON.stringify(buttonsOf(form)) !== JSON.stringify(FORM_BUTTONS[form.type]))).toEqual([])
  })

  it('페이지 — 탭은 이름마다 패널 · 옛 자식은 active 자리 패널 · switchTab 은 그 패널 · 폼에 기본 단추 · 판 3 검증을 지난다', async () => {
    const { schema, schema_version } = await pageRow(seeded.pageV2)
    expect(schema_version).toBe(3)
    expect(schema.version).toBe(3)
    expect(errorsOf(schema)).toEqual([])

    const tabs = find(schema.root, 'n_tabs')
    expect(tabs.props).toEqual({ active: 1 })
    expect(tabs.alias).toBe('회원 탭')
    expect(tabs.children!.map((panel) => [panel.type, panel.props, (panel.children ?? []).map((child) => child.id)])).toEqual([
      ['TabPanel', { label: '기본정보' }, []],
      ['TabPanel', { label: '상세정보' }, ['n_in1', 'n_in2']],
      ['TabPanel', { label: '이력' }, []],
    ])
    // 옮긴 노드의 번호 · 보임은 그대로다.
    expect(find(schema.root, 'n_in1').marker).toBe(2)
    expect(find(schema.root, 'n_in2').visibility).toEqual({ mode: 'only', states: ['s_admin'] })
    expect(schema.viewStates).toEqual([{ id: 's_admin', name: '관리자' }])

    const actions = find(schema.root, 'n_btn').interactions![0]!.actions
    expect(actions).toEqual([
      { type: 'switchTab', target: tabs.children![2]!.id },
      // 범위 밖 번호 · 문서 밖 대상은 대상 그대로(검증 경고) — `tab` 은 걷는다.
      { type: 'switchTab', target: 'n_tabs' },
      { type: 'switchTab', target: 'n_gone' },
      { type: 'setVisible', target: 'n_in1', value: false },
    ])

    // 단추는 새로 만드는 폼과 같은 노드다 — 타입 · props · 주 단추 `variant`(그 밖의 키 없음 — id 만 새로).
    const buttons = (id: string) => (find(schema.root, id).zones?.actions ?? []).map(({ id: _id, ...rest }) => rest)
    expect(buttons('n_sf')).toEqual([
      { type: 'Button', props: { label: '초기화' } },
      { type: 'Button', props: { label: '검색' }, variant: 'primary' },
    ])
    expect(buttons('n_sf2')).toEqual(buttons('n_sf'))
    expect(buttons('n_ef')).toEqual([
      { type: 'Button', props: { label: '저장' }, variant: 'primary' },
      { type: 'Button', props: { label: '취소' } },
    ])
    expect(find(schema.root, 'n_tabs2').children!.map((panel) => panel.props)).toEqual([{ label: '탭 1' }, { label: '탭 2' }])

    // 새 id 는 겹치지 않고 노드 id 꼴이다.
    const ids = [...walkNodes(schema.root)].map((visit) => visit.node.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids.filter((id) => !JSON.stringify(V2_PAGE).includes(`"${id}"`))) expect(id).toMatch(/^n_[0-9a-f]{12}$/)
  })

  it('판 3 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷', async () => {
    expect(await pageRow(seeded.pageV3)).toEqual({ schema: V3_PAGE, schema_version: 3 })

    const layout = (await sql<{ schema: LayoutDocument }>`select schema from layouts where id = ${seeded.layoutId}`.execute(db)).rows[0]!
      .schema
    expect(layout.version).toBe(3)
    expect(partitionIssues(validateLayout(layout)).errors).toEqual([])
    expect(buttonsOf(find(layout.root, 'l_ef'))).toEqual(FORM_BUTTONS.EntryForm)

    const nodes = (await sql<{ nodes: WbNode[] }>`select nodes from modules where id = ${seeded.moduleId}`.execute(db)).rows[0]!.nodes
    const panels = nodes[0]!.children!
    expect(panels.map((panel) => [panel.props!.label, (panel.children ?? []).map((child) => child.id)])).toEqual([
      ['가', ['m_t']],
      ['나', []],
    ])
    expect(nodes[1]!.interactions![0]!.actions).toEqual([{ type: 'switchTab', target: panels[1]!.id }])

    const personal = (await sql<{ nodes: WbNode[] }>`select nodes from personal_modules where id = ${seeded.personalId}`.execute(db))
      .rows[0]!.nodes
    expect(buttonsOf(personal[0]!)).toEqual(FORM_BUTTONS.SearchForm)

    const payload = (await sql<{ payload: unknown }>`select payload from snapshots where id = ${seeded.snapshotId}`.execute(db)).rows[0]!
      .payload
    const parsed = SnapshotPayloadSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    const [v2, v1, v3] = parsed.data!.pages
    expect(v2!.schema).toEqual({ ...(await pageRow(seeded.pageV2)).schema, root: v2!.schema.root })
    expect(errorsOf(v2!.schema)).toEqual([])
    // 판 1 문서는 얼린 판 1 → 2(상태 영역 → 보임)를 지나 판 3 이 된다.
    expect(v1!.schema.version).toBe(3)
    expect(errorsOf(v1!.schema)).toEqual([])
    expect(v1!.schema.root.children!.map((node) => [node.id, node.visibility ?? null])).toEqual([
      ['n_e', { mode: 'except', states: ['s_admin'] }],
      ['n_a', { mode: 'only', states: ['s_admin'] }],
    ])
    expect(find(v1!.schema.root, 'n_e').zones!.actions).toHaveLength(2)
    expect(v3).toMatchObject({ schemaVersion: 3, schema: V3_PAGE })
  })

  it('한 번 더 돌려도 그대로다 — 판 3 문서 · 이미 옮긴 묶음', () => {
    const v3 = liftDocument(V2_PAGE, null) as PageDocument
    expect(liftDocument(v3, null)).toBeNull()
    const nodes = liftNodes([{ id: 'x', type: 'Tabs', props: { tabs: ['가'] } }])
    expect(liftNodes(nodes)).toEqual(nodes)
  })

  it('down — 행이 있으면 «백업에서 되돌린다»로 거절하고 아무것도 안 바꾼다', async () => {
    const error = await migrateTo('0027-retire-system-themes')
    expect(error?.message).toContain('되돌릴 수 없습니다')
    expect(error?.message).toContain('백업에서 되돌린다')
    expect((await pageRow(seeded.pageV2)).schema_version).toBe(3)
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0028-node-zones')
  })

  it('down — 페이지 · 모듈 · 레이아웃 · 스냅샷이 비면 내려간다', async () => {
    await sql`delete from projects`.execute(db)
    await sql`delete from users`.execute(db)
    await must('0027-retire-system-themes')
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0027-retire-system-themes')
  })
})
