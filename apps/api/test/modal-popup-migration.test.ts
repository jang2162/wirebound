/**
 * **0033 — «팝업 열기» 대상 페이지를 팝업 페이지로**(`src/db/migrations/0033-modal-popup.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `node-zones-migration.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다).
 *
 * 잰 성질: 대상을 모으는 자리 전부(페이지 · 레이아웃 · 프로젝트 모듈 · 스냅샷의 `pages[]` · `layouts[]` + 그 프로젝트의 모듈)에서 한 페이지로
 * 풀리는 `openModal` 대상의 뿌리가 `Popup` 이 된다 · 둘로 풀리는 대상 · 없는 대상 · `navigate` 대상 · 남의 프로젝트의 같은 경로 · 개인 모듈만 여는
 * 대상은 안 옮긴다 · 몸통 · 번호(`head_seq` · `structure_seq`)는 그대로 · 옮긴 문서가 검증(오류)을 지난다 · 옮긴 수를 한 줄로 찍는다 · 한 번 더
 * 돌려도 그대로다 · `down` 은 옛 문서로 돌아가고 바닥 노드를 몸통 끝에 붙인다.
 *
 * **개인 모듈은 출처가 아니다** — 프로젝트에 안 매여, 두 프로젝트에 다 든 멤버(앨리스 — P owner · Q editor)가 P 에서 쓰려고 저장한 묶음이 Q 의
 * 같은 경로 페이지를 옮기게 된다. 그 판은 «개인 모듈은 출처가 아니다» 가 잰다. 같은 케이스의 밥(P 의 멤버가 아님)은 멤버 거름만 둔 판에서도 안
 * 옮겨지므로 혼자 죽지 않는다 — 개인 모듈을 거름 없이 되살린 판에서만 앨리스와 함께 죽는다.
 */
import { randomUUID } from 'node:crypto'
import { installCatalog, partitionIssues, validatePage, type PageDocument } from '@wirebound/schema'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { liftModalTargets } from '../src/db/migrations/0033-modal-popup'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { TEST_DATABASE_URL } from './helpers'

const DATABASE = `wb_migrate_0033_${process.pid}_${Date.now()}`
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

const opener = (id: string, type: 'openModal' | 'navigate', target: string) => ({
  id,
  type: 'Button',
  props: { label: id },
  interactions: [{ on: 'click', actions: [{ type, target }] }],
})
const page = (children: unknown[]) => ({ version: 5, root: { id: 'n_root', type: 'Page', children } })
const BODY = [{ id: 'n_t', type: 'Text', props: { content: '본문' } }]

/** P 의 페이지 — 제목 → 문서. 목록이 «등록» · 없는 쪽 · 둘인 «중복» 을 열고, «이동» 으로 옮긴다. */
const P_PAGES: Record<string, unknown> = {
  목록: page([
    opener('n_open', 'openModal', 'page:관리자/회원/등록'),
    opener('n_none', 'openModal', 'page:관리자/회원/없음'),
    opener('n_dup', 'openModal', 'page:관리자/회원/중복'),
    opener('n_empty', 'openModal', ''),
    opener('n_nav', 'navigate', 'page:관리자/회원/이동'),
  ]),
  등록: page(BODY),
  상세: page(BODY),
  모듈대상: page(BODY),
  개인대상: page(BODY),
  중복: page(BODY),
  이동: page(BODY),
}

interface Seeded {
  p: Record<string, string>
  dup2: string
  q: Record<string, string>
  snapshot: string
}

async function seed(): Promise<Seeded> {
  const [alice, bob] = [randomUUID(), randomUUID()]
  for (const [id, name] of [
    [alice, '앨리스'],
    [bob, '밥'],
  ] as const) {
    await sql`insert into users (id, email, name, password_hash) values (${id}, ${`u-${id}@example.com`}, ${name}, 'x')`.execute(db)
  }
  const tree = async (projectId: string) => {
    const [root, child] = [randomUUID(), randomUUID()]
    await sql`insert into projects (id, name, slug) values (${projectId}, '프로젝트', ${`p-${projectId.slice(0, 8)}`})`.execute(db)
    await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${root}, ${projectId}, '관리자', 0)`.execute(db)
    await sql`insert into menu_nodes (id, project_id, parent_id, title, sort_order) values (${child}, ${projectId}, ${root}, ' 회원 ', 0)`.execute(
      db,
    )
    return child
  }
  const insertPage = async (projectId: string, menuId: string, title: string, sort: number, schema: unknown) => {
    const id = randomUUID()
    await sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version, head_seq, structure_seq)
        values (${id}, ${projectId}, ${menuId}, ${title}, ${sort}, ${JSON.stringify(schema)}::jsonb, 5, 7, 5)`.execute(db)
    return id
  }

  const pId = randomUUID()
  const pMenu = await tree(pId)
  await sql`insert into project_members (project_id, user_id, role) values (${pId}, ${alice}, 'owner')`.execute(db)
  const p: Record<string, string> = {}
  let sort = 0
  for (const [title, schema] of Object.entries(P_PAGES)) p[title] = await insertPage(pId, pMenu, title, sort++, schema)
  const dup2 = await insertPage(pId, pMenu, '중복', sort++, page(BODY))
  // 레이아웃은 «상세» 를 공백이 낀 글자로 연다 · 모듈은 «모듈대상». 앨리스의 개인 모듈은 «개인대상» · «등록» 을 연다 — 출처가 아니다.
  await sql`insert into layouts (project_id, name, schema)
    values (${pId}, '기본', ${JSON.stringify(page([opener('l_open', 'openModal', ' page: 관리자 / 회원 / 상세 ')]))}::jsonb)`.execute(db)
  await sql`insert into modules (project_id, name, nodes, created_by)
    values (${pId}, '모듈', ${JSON.stringify([opener('m_open', 'openModal', 'page:관리자/회원/모듈대상')])}::jsonb, ${alice})`.execute(db)
  await sql`insert into personal_modules (owner_id, name, nodes)
    values (${alice}, '내 모듈', ${JSON.stringify([{ id: 'q_card', type: 'Card', children: [opener('q_open', 'openModal', 'page:관리자/회원/개인대상'), opener('q_reg', 'openModal', 'page:관리자/회원/등록')] }])}::jsonb)`.execute(
    db,
  )
  // 밥은 P 의 멤버가 아니다 — 그의 개인 모듈이 여는 «이동» 은 P 에서 안 옮긴다.
  await sql`insert into personal_modules (owner_id, name, nodes)
    values (${bob}, '밥 모듈', ${JSON.stringify([opener('b_open', 'openModal', 'page:관리자/회원/이동')])}::jsonb)`.execute(db)

  // Q — P 와 같은 경로의 «등록» · «개인대상» 이 있지만 Q 안에서는 아무도 안 연다. 앨리스는 Q 의 멤버이기도 하다(editor).
  const qId = randomUUID()
  const qMenu = await tree(qId)
  await sql`insert into project_members (project_id, user_id, role) values (${qId}, ${bob}, 'owner'), (${qId}, ${alice}, 'editor')`.execute(
    db,
  )
  const q = { 등록: await insertPage(qId, qMenu, '등록', 0, page(BODY)), 개인대상: await insertPage(qId, qMenu, '개인대상', 1, page(BODY)) }

  // P 의 스냅샷 — 목록(«등록» 을 연다) · 등록 · 상세 · 이동 · 모듈대상. 레이아웃이 «상세» 를, P 의 프로젝트 모듈이 «모듈대상» 을 연다.
  const entry = (title: string, schema: unknown, sortOrder: number) => ({
    id: p[title],
    menuNodeId: pMenu,
    title,
    description: null,
    sortOrder,
    schemaVersion: 5,
    schema,
    headSeq: 0,
  })
  const adminMenu = randomUUID()
  const payload = {
    payloadVersion: 3,
    capturedAt: '2026-10-26T00:00:00.000Z',
    // payload 의 메뉴는 P 와 같은 트리다 — «관리자» 아래 « 회원 »(id 는 P 의 것).
    menu: [
      { id: adminMenu, parentId: null, title: '관리자', sortOrder: 0 },
      { id: pMenu, parentId: adminMenu, title: ' 회원 ', sortOrder: 0 },
    ],
    pages: [
      entry('목록', P_PAGES.목록, 0),
      entry('등록', page(BODY), 1),
      entry('상세', page(BODY), 2),
      entry('이동', page(BODY), 3),
      entry('모듈대상', page(BODY), 4),
    ],
    layouts: [{ id: randomUUID(), name: '기본', schema: page([opener('l_open', 'openModal', 'page:관리자/회원/상세')]) }],
    comments: [],
    theme: null,
  }
  const snapshot = randomUUID()
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snapshot}, ${pId}, '판', ${JSON.stringify(payload)}::jsonb, ${alice})`.execute(
    db,
  )
  return { p, dup2, q, snapshot }
}

async function pageRow(id: string): Promise<{ schema: PageDocument; head_seq: string; structure_seq: string }> {
  const { rows } = await sql<{ schema: PageDocument; head_seq: string; structure_seq: string }>`
    select schema, head_seq, structure_seq from pages where id = ${id}
  `.execute(db)
  return rows[0]!
}

/** 뿌리가 `Popup` 인 페이지 id — 페이지 표 전부. */
async function popupPages(): Promise<string[]> {
  const { rows } = await sql<{ id: string }>`select id from pages where schema->'root'->>'type' = 'Popup' order by id`.execute(db)
  return rows.map((row) => row.id)
}

async function snapshotRoots(id: string): Promise<[string, string][]> {
  const { rows } = await sql<{
    payload: { pages: { title: string; schema: PageDocument }[] }
  }>`select payload from snapshots where id = ${id}`.execute(db)
  return rows[0]!.payload.pages.map((entry) => [entry.title, entry.schema.root.type])
}

/** 모든 페이지 문서(표 · 스냅샷)의 글자 — `down` 이 바이트 그대로 돌아오는지 견준다. */
async function documents(): Promise<string[]> {
  const rows = await sql<{ body: string }>`
    select schema::text as body from pages union all select payload::text from snapshots order by body
  `.execute(db)
  return rows.rows.map((row) => row.body)
}

const errorsOf = (doc: PageDocument) => partitionIssues(validatePage(doc)).errors
const sorted = (ids: string[]) => [...ids].sort()

describe('0033 — «팝업 열기» 대상 페이지를 팝업 페이지로', () => {
  let seeded: Seeded
  let before: string[]

  it('한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 셋(페이지 · 레이아웃 · 모듈) · 옮긴 수를 한 줄로', async () => {
    await must(NO_MIGRATIONS)
    await must('0032-list-data-grid')
    seeded = await seed()
    before = await documents()
    // 카나리아 — 올리기 전에는 팝업 뿌리가 없다.
    expect(await popupPages()).toEqual([])
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await must('0033-modal-popup')
      expect(log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('0033'))).toEqual([
        '  · 0033-modal-popup: 팝업으로 옮긴 페이지 3 · 스냅샷 1 개 안의 페이지 3',
      ])
    } finally {
      log.mockRestore()
    }
    const { p } = seeded
    expect(await popupPages()).toEqual(sorted([p.등록!, p.상세!, p.모듈대상!]))
  }, 60_000)

  it('옮긴 뿌리 — 제목은 페이지 제목 · 몸통 · 번호는 그대로 · 바닥 구역은 안 만든다 · 검증을 지난다', async () => {
    const row = await pageRow(seeded.p.등록!)
    expect(row.schema).toEqual({ version: 5, root: { id: 'n_root', type: 'Popup', props: { title: '등록' }, children: BODY } })
    expect([row.head_seq, row.structure_seq]).toEqual(['7', '5'])
    expect(errorsOf(row.schema)).toEqual([])
  })

  it('안 옮기는 것 — 둘로 풀리는 대상 · 없는 대상 · 빈 대상 · navigate · 남의 프로젝트의 같은 경로', async () => {
    const { p, dup2 } = seeded
    for (const id of [p.목록!, p.중복!, dup2]) {
      expect((await pageRow(id)).schema.root.type, id).toBe('Page')
    }
  })

  it('개인 모듈은 출처가 아니다 — 두 프로젝트의 멤버(앨리스)가 P 에서 저장한 묶음이 Q 의 같은 경로 «등록» · «개인대상» 을 안 옮긴다', async () => {
    const { p, q } = seeded
    // P 의 «개인대상» 은 앨리스의 개인 모듈만 연다 · P 의 «이동» 은 navigate 와 밥(P 의 멤버가 아님)의 개인 모듈만 연다.
    const roots = await Promise.all([q.등록!, q.개인대상!, p.개인대상!, p.이동!].map(async (id) => (await pageRow(id)).schema.root.type))
    expect(roots).toEqual(['Page', 'Page', 'Page', 'Page'])
  })

  it('스냅샷 — payload 의 메뉴로 풀어 «등록»(페이지가 연다) · «상세»(레이아웃이 연다) · «모듈대상»(그 프로젝트의 모듈이 연다)만 옮긴다', async () => {
    expect(await snapshotRoots(seeded.snapshot)).toEqual([
      ['목록', 'Page'],
      ['등록', 'Popup'],
      ['상세', 'Popup'],
      ['이동', 'Page'],
      ['모듈대상', 'Popup'],
    ])
  })

  it('한 번 더 돌려도 그대로다 — 이미 팝업인 뿌리는 안 센다', async () => {
    const snapshot = await documents()
    // 마이그레이션은 표 타입을 모르는 `Kysely<unknown>` 을 받는다.
    expect(await liftModalTargets(db as never)).toEqual({ pages: 0, snapshots: 0, snapshotPages: 0 })
    expect(await documents()).toEqual(snapshot)
  })

  it('down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다', async () => {
    // 사람이 새로 만든 팝업 페이지(바닥 둘 · 몸통 하나) — `down` 이 함께 내린다.
    const made = randomUUID()
    const { rows } = await sql<{
      project_id: string
      menu_node_id: string
    }>`select project_id, menu_node_id from pages where id = ${seeded.p.등록!}`.execute(db)
    const popup = {
      version: 5,
      root: {
        id: 'n_root',
        type: 'Popup',
        props: { title: '새 팝업', size: 'small' },
        children: BODY,
        zones: {
          footer: [
            { id: 'n_c', type: 'Button', props: { label: '취소' } },
            { id: 'n_s', type: 'Button', props: { label: '저장' } },
          ],
        },
      },
    }
    await sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version)
      values (${made}, ${rows[0]!.project_id}, ${rows[0]!.menu_node_id}, '새 팝업', 99, ${JSON.stringify(popup)}::jsonb, 5)`.execute(db)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await must('0032-list-data-grid')
      expect(log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('0033'))).toEqual([
        '  · 0033-modal-popup down: 화면으로 내린 페이지 4 · 스냅샷 1 개 안의 페이지 3',
      ])
    } finally {
      log.mockRestore()
    }
    expect((await pageRow(made)).schema).toEqual({
      version: 5,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          ...BODY,
          { id: 'n_c', type: 'Button', props: { label: '취소' } },
          { id: 'n_s', type: 'Button', props: { label: '저장' } },
        ],
      },
    })
    await sql`delete from pages where id = ${made}`.execute(db)
    expect(await documents()).toEqual(before)
  }, 60_000)
})
