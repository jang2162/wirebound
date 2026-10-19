/**
 * **0025 — 문서 판 1 → 2(상태 영역 → 노드 보임)**(`src/db/migrations/0025-state-visibility.ts` · 계획 Review Focus 3 «DB 의 페이지 · 모듈»).
 *
 * **이 파일은 제 DB 를 만든다** — `modules-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 판 1 페이지마다 `schema` 가 schema 의 판 1 → 2 단계와 같은 문서 · `schema_version` 2 · 판 2 페이지는 그대로 · 레이아웃은 기본
 * 가지만 · 모듈은 기본 가지만 남겨 풀고 버린 가지를 가리키던 액션을 뺀다 · 같은 id 가 둘인 페이지는 그 페이지 id 를 들고 멈추고 아무것도 안
 * 바꾼다 · `down` 은 행이 있으면 «백업에서 되돌린다»로 거절하고 비었으면 내려간다.
 */
import { randomUUID } from 'node:crypto'
import { liftStateRegions, type PageDocument } from '@wirebound/schema'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0025_${process.pid}_${Date.now()}`
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

async function migrateTo(name: string | typeof NO_MIGRATIONS): Promise<Error | undefined> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateTo(name)
  return result.error as Error | undefined
}

async function must(name: string | typeof NO_MIGRATIONS): Promise<void> {
  const error = await migrateTo(name)
  if (error !== undefined) throw error
}

const text = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Text', props: { content }, ...extra })
function region(id: string, cases: Record<string, unknown[]>): Record<string, unknown> {
  return {
    id,
    type: 'StateSwitch',
    children: Object.entries(cases).map(([state, children], index) => ({
      id: `${id}_c${index}`,
      type: 'StateCase',
      props: { state },
      children,
    })),
  }
}

const V1_PAGE: PageDocument = {
  version: 1,
  viewStates: [{ id: 's_admin', name: '관리자' }],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      text('n_head', '머리'),
      region('n_sw', {
        default: [
          text('n_def', '보기'),
          region('n_in', { default: [text('n_in_def', '안쪽 기본')], s_admin: [text('n_in_admin', '안쪽 관리자')] }),
        ],
        s_admin: [text('n_admin', '승인')],
      }),
    ],
  },
} as unknown as PageDocument

const V2_PAGE = {
  version: 2,
  viewStates: [{ id: 's_x', name: '엑스' }],
  root: { id: 'n_root', type: 'Page', children: [text('n_a', '그대로', { visibility: { mode: 'only', states: ['s_x'] } })] },
}

interface Seeded {
  projectId: string
  pageV1: string
  pageV2: string
  pagePlain: string
  layoutId: string
  moduleId: string
}

async function seed(): Promise<Seeded> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const menuId = randomUUID()
  const [pageV1, pageV2, pagePlain, layoutId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`u-${userId}@example.com`}, '앨리스', 'x')`.execute(db)
  await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
  await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${menuId}, ${projectId}, '메뉴', 0)`.execute(db)
  const page = async (id: string, sort: number, schema: unknown, version: number) =>
    sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version) values (${id}, ${projectId}, ${menuId}, ${`쪽 ${sort}`}, ${sort}, ${JSON.stringify(schema)}::jsonb, ${version})`.execute(
      db,
    )
  await page(pageV1, 0, V1_PAGE, 1)
  await page(pageV2, 1, V2_PAGE, 2)
  await page(pagePlain, 2, { version: 1, root: { id: 'n_root', type: 'Page', children: [text('n_t', '글')] } }, 1)
  const layout = {
    version: 1,
    root: {
      id: 'l_root',
      type: 'Page',
      children: [region('l_sw', { default: [text('l_def', '기본')], s_admin: [text('l_admin', '관리')] }), { id: 'l_slot', type: 'Slot' }],
    },
  }
  await sql`insert into layouts (id, project_id, name, schema) values (${layoutId}, ${projectId}, '기본', ${JSON.stringify(layout)}::jsonb)`.execute(
    db,
  )
  const nodes = [
    region('m_sw', { default: [text('m_def', '기본')], s_admin: [text('m_admin', '관리')] }),
    {
      id: 'm_btn',
      type: 'Button',
      props: { label: '열기' },
      interactions: [
        {
          on: 'click',
          actions: [
            { type: 'setVisible', target: 'm_admin', value: true },
            { type: 'setVisible', target: 'm_def', value: true },
          ],
        },
      ],
    },
  ]
  const { rows } = await sql<{ id: string }>`
    insert into modules (project_id, name, nodes, created_by) values (${projectId}, '모듈', ${JSON.stringify(nodes)}::jsonb, ${userId}) returning id
  `.execute(db)
  return { projectId, pageV1, pageV2, pagePlain, layoutId, moduleId: rows[0]!.id }
}

async function pageRow(id: string): Promise<{ schema: unknown; schema_version: number }> {
  const { rows } = await sql<{
    schema: unknown
    schema_version: number
  }>`select schema, schema_version from pages where id = ${id}`.execute(db)
  return rows[0]!
}

describe('0025 — 문서 판 1 → 2', () => {
  it('페이지 · 레이아웃 · 모듈을 옮긴다 — 페이지는 schema 의 판 1 → 2 단계와 같은 문서', async () => {
    await must(NO_MIGRATIONS)
    await must('0024-modules')
    const seeded = await seed()
    await must('0025-state-visibility')

    const v1 = await pageRow(seeded.pageV1)
    expect(v1.schema_version).toBe(2)
    expect(v1.schema).toEqual({ ...liftStateRegions(V1_PAGE).doc, version: 2 })
    // 값으로도 — 성질은 schema 의 `migrate-document.test.ts` 가 잰다.
    expect((v1.schema as PageDocument).root.children!.map((node) => [node.id, node.visibility ?? null])).toEqual([
      ['n_head', null],
      ['n_def', { mode: 'except', states: ['s_admin'] }],
      ['n_in_def', { mode: 'only', states: ['default'] }],
      ['n_admin', { mode: 'only', states: ['s_admin'] }],
    ])
    expect(await pageRow(seeded.pageV2)).toEqual({ schema: V2_PAGE, schema_version: 2 })
    expect(await pageRow(seeded.pagePlain)).toEqual({
      schema: { version: 2, root: { id: 'n_root', type: 'Page', children: [text('n_t', '글')] } },
      schema_version: 2,
    })

    const layout = (await sql<{ schema: unknown }>`select schema from layouts where id = ${seeded.layoutId}`.execute(db)).rows[0]!.schema
    expect(layout).toEqual({
      version: 2,
      root: { id: 'l_root', type: 'Page', children: [text('l_def', '기본'), { id: 'l_slot', type: 'Slot' }] },
    })

    const nodes = (await sql<{ nodes: unknown }>`select nodes from modules where id = ${seeded.moduleId}`.execute(db)).rows[0]!.nodes
    expect(nodes).toEqual([
      text('m_def', '기본'),
      {
        id: 'm_btn',
        type: 'Button',
        props: { label: '열기' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'm_def', value: true }] }],
      },
    ])
  })

  it('down — 행이 있으면 «백업에서 되돌린다»로 거절하고 아무것도 안 바꾼다', async () => {
    const before = (await sql<{ n: number }>`select count(*)::int as n from pages where schema_version = 2`.execute(db)).rows[0]!.n
    const error = await migrateTo('0024-modules')
    expect(error?.message).toContain('되돌릴 수 없습니다')
    expect(error?.message).toContain('백업에서 되돌린다')
    expect((await sql<{ n: number }>`select count(*)::int as n from pages where schema_version = 2`.execute(db)).rows[0]!.n).toBe(before)
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0025-state-visibility')
  })

  it('down — 페이지 · 모듈 · 레이아웃이 비면 내려간다', async () => {
    await sql`delete from projects`.execute(db)
    await must('0024-modules')
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0024-modules')
  })

  it('같은 노드 id 가 둘인 페이지는 그 페이지 id 를 들고 멈추고 아무것도 안 바꾼다', async () => {
    await must('0024-modules')
    const seeded = await seed()
    const twin = randomUUID()
    const menu = (await sql<{ id: string }>`select id from menu_nodes where project_id = ${seeded.projectId}`.execute(db)).rows[0]!.id
    const broken = {
      version: 1,
      root: { id: 'n_root', type: 'Page', children: [text('n_a', '하나'), region('n_sw', { default: [text('n_a', '둘')] })] },
    }
    await sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version) values (${twin}, ${seeded.projectId}, ${menu}, '쌍둥이', 9, ${JSON.stringify(broken)}::jsonb, 1)`.execute(
      db,
    )

    const error = await migrateTo('0025-state-visibility')
    expect(error?.message).toContain(twin)
    expect(error?.message).toContain('n_a')
    // 트랜잭션째 되돌렸다 — 앞서 옮길 수 있던 페이지도 판 1 그대로다.
    expect((await pageRow(seeded.pageV1)).schema_version).toBe(1)
    expect(await pageRow(twin)).toEqual({ schema: broken, schema_version: 1 })
    const { rows } = await sql<{ name: string }>`select name from kysely_migration order by name desc limit 1`.execute(db)
    expect(rows[0]!.name).toBe('0024-modules')
  })
})
