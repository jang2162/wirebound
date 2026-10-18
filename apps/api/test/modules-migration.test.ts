/**
 * **0024 — 프리셋을 모듈로 옮긴다**(`src/db/migrations/0024-modules.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `migration-0022.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 프리셋 행마다 같은 프로젝트 · 이름 · 만든 사람 · `created_at` 의 모듈 하나 · 상태 영역은 기본 가지의 자식만 남아 풀린다(안쪽 영역도) ·
 * 버린 가지 안을 겨냥하던 노드 액션은 빠지고 묶음 안 · 페이지 액션은 남는다 · `marker` 없음 · `description` · `view_states` 는 버린다 ·
 * `presets` 표가 없다 · `down` 은 빈 `presets`(0021 판의 칸)를 짓고 `modules` 를 지운다.
 */
import { randomUUID } from 'node:crypto'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0024_${process.pid}_${Date.now()}`
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

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await sql<{ n: number }>`select count(*)::int as n from information_schema.tables where table_name = ${name}`.execute(db)
  return rows[0]!.n === 1
}

/** 상태 영역 — 기본 가지 · 상태 가지들. 가지의 자식은 그대로 싣는다. */
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

const text = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Text', props: { content }, ...extra })

describe('0024 — 프리셋을 모듈로', () => {
  it('행마다 모듈 하나 — 상태 영역은 기본 가지만 · 버린 가지 안을 겨냥하던 액션은 빠진다 · presets 표가 없다', async () => {
    await migrateTo(NO_MIGRATIONS)
    await migrateTo('0023-pages-structure-seq')
    const userId = randomUUID()
    const otherUserId = randomUUID()
    const projectId = randomUUID()
    const otherProjectId = randomUUID()
    await sql`insert into users (id, email, name, password_hash) values (${userId}, ${`a-${userId}@example.com`}, '앨리스', 'x'), (${otherUserId}, ${`b-${otherUserId}@example.com`}, '밥', 'x')`.execute(
      db,
    )
    await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`}), (${otherProjectId}, '남의 것', ${`p-${otherProjectId.slice(0, 8)}`})`.execute(
      db,
    )

    const withStates = [
      text('n_head', '머리', { marker: 3 }),
      region('n_region', {
        default: [
          text('n_def1', '기본 하나'),
          region('n_inner', { s_admin: [text('n_inner_admin', '안쪽 관리자')], default: [text('n_inner_def', '안쪽 기본')] }),
        ],
        s_admin: [text('n_admin', '관리자만')],
      }),
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '보기' },
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setVisible', target: 'n_admin', value: true },
              { type: 'setVisible', target: 'n_def1', value: true },
              { type: 'navigate', target: 'page-other' },
            ],
          },
          { on: 'change', actions: [{ type: 'setVisible', target: 'n_inner_admin', value: false }] },
        ],
      },
      region('n_nodefault', { s_admin: [text('n_only_admin', '기본 가지 없음')] }),
    ]
    const insert = async (project: string, user: string, name: string, schema: unknown, at: string, viewStates: unknown) => {
      await sql`
        insert into presets (project_id, name, description, schema, view_states, created_by, created_at)
        values (${project}, ${name}, '옛 설명', ${JSON.stringify(schema)}::jsonb, ${viewStates === null ? null : JSON.stringify(viewStates)}::jsonb, ${user}, ${at}::timestamptz)
      `.execute(db)
    }
    await insert(projectId, userId, '상태 품은 것', withStates, '2026-01-02T03:04:05.000Z', [{ id: 's_admin', name: '관리자' }])
    await insert(projectId, otherUserId, '빈 것', [], '2026-01-03T00:00:00.000Z', null)
    await insert(otherProjectId, userId, '남의 프로젝트', [text('n_x', '글')], '2026-01-04T00:00:00.000Z', null)

    await migrateTo('0024-modules')

    const { rows } = await sql<{
      project_id: string
      name: string
      nodes: unknown
      created_by: string
      created_at: Date
      updated_at: Date
    }>`
      select project_id, name, nodes, created_by, created_at, updated_at from modules order by created_at asc
    `.execute(db)
    expect(
      rows.map((row) => [row.project_id, row.name, row.created_by, row.created_at.toISOString(), row.updated_at.toISOString()]),
    ).toEqual([
      [projectId, '상태 품은 것', userId, '2026-01-02T03:04:05.000Z', '2026-01-02T03:04:05.000Z'],
      [projectId, '빈 것', otherUserId, '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z'],
      [otherProjectId, '남의 프로젝트', userId, '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z'],
    ])
    expect(rows[0]!.nodes).toEqual([
      text('n_head', '머리'),
      text('n_def1', '기본 하나'),
      text('n_inner_def', '안쪽 기본'),
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '보기' },
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setVisible', target: 'n_def1', value: true },
              { type: 'navigate', target: 'page-other' },
            ],
          },
        ],
      },
    ])
    expect(rows[1]!.nodes).toEqual([])
    expect(rows[2]!.nodes).toEqual([text('n_x', '글')])
    expect(await tableExists('presets')).toBe(false)
  })

  it('down — 빈 presets(0021 판의 칸)를 짓고 modules 를 지운다 · 다시 올리면 빈 modules', async () => {
    await migrateTo('0024-modules')
    await migrateTo('0023-pages-structure-seq')

    expect(await tableExists('modules')).toBe(false)
    const { rows } = await sql<{ column_name: string }>`
      select column_name from information_schema.columns where table_name = 'presets' order by column_name
    `.execute(db)
    expect(rows.map((row) => row.column_name)).toEqual([
      'created_at',
      'created_by',
      'description',
      'id',
      'name',
      'project_id',
      'schema',
      'updated_at',
      'view_states',
    ])
    expect((await sql<{ n: number }>`select count(*)::int as n from presets`.execute(db)).rows[0]!.n).toBe(0)

    // 0021 · 0010 의 `down` 이 그 위에서 돈다(global-setup 의 왕복과 같은 길).
    await migrateTo('0020-project-menu-revs')
    await migrateTo('0024-modules')
    expect((await sql<{ n: number }>`select count(*)::int as n from modules`.execute(db)).rows[0]!.n).toBe(0)
  })
})
