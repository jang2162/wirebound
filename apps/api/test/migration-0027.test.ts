/**
 * **0027 — 걷은 시스템 테마 넷을 쓰던 프로젝트를 `system-admin` 으로 옮기고 그 패키지를 숨긴다**(`src/db/migrations/0027-retire-system-themes.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — `migration-0018.test.ts` 와 같은 까닭(마이그레이션을 오르내리면 다른 파일의 판이 깨진다). 케이스마다 빈 DB
 * 에서 `0025` 까지 올리고 판을 세운다.
 */
import { createHash, randomUUID } from 'node:crypto'
import { Migrator, NO_MIGRATIONS, sql } from 'kysely'
import { readWbtheme, type ThemeManifest } from '@wirebound/themes'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { migrationProvider } from '../src/db/migrations/index'
import type { DbHandle } from '../src/db/tx'
import { insertSnapshot } from '../src/repos/snapshots'
import { insertThemePackage } from '../src/repos/theme-packages'
import { restoreSnapshot } from '../src/services/restore'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { TEST_DATABASE_URL } from './helpers'
import { manifestOf, packed } from './theme-fixtures'

const DATABASE = `wb_migrate_0027_${process.pid}_${Date.now()}`
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

beforeEach(async () => {
  await migrateTo(NO_MIGRATIONS)
  await migrateTo('0025-state-visibility')
})

async function migrateTo(name: string | typeof NO_MIGRATIONS): Promise<void> {
  const result = await new Migrator({ db, provider: migrationProvider }).migrateTo(name)
  if (result.error !== undefined) throw result.error
}

const TARGET_TOKENS = {
  items: {
    'semantic.primary': { type: 'color', label: '주색', default: '#2563eb' },
    'semantic.surface': { type: 'color', label: '면', default: '#ffffff' },
    'radius.sm': { type: 'length', label: '모서리', default: '4px' },
  },
} as ThemeManifest['tokens']

/** 걷은 테마 — 키 · 타입이 겹치는 것(주색 · 면), 타입이 다른 것(모서리), 없는 것(`commerce.only`)을 든다. */
const RETIRED_TOKENS = {
  items: {
    'semantic.primary': { type: 'color', label: '주색', default: '#111111' },
    'semantic.surface': { type: 'color', label: '면', default: '#fafafa' },
    'radius.sm': { type: 'color', label: '모서리 색', default: '#000000' },
    'commerce.only': { type: 'color', label: '가격', default: '#e11d48' },
  },
} as ThemeManifest['tokens']

async function store(manifest: ThemeManifest, hiddenAt?: string): Promise<void> {
  const bytes = packed(manifest)
  await insertThemePackage(db, {
    manifest: readWbtheme(bytes).files!.manifest,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedBy: null,
  })
  if (hiddenAt !== undefined) {
    await sql`update theme_packages set hidden_at = ${hiddenAt} where theme_id = ${manifest.id} and version = ${manifest.version}`.execute(
      db,
    )
  }
}

async function project(themeId: string, version: string, tokens: Record<string, string>, rev: number): Promise<string> {
  const id = randomUUID()
  await sql`
    insert into projects (id, name, slug, theme_id, theme_version, theme_tokens, theme_rev)
    values (${id}, '옛 프로젝트', ${`p-${id.slice(0, 8)}`}, ${themeId}, ${version}, ${JSON.stringify(tokens)}, ${rev})
  `.execute(db)
  return id
}

async function bindingOf(id: string) {
  const rows = await sql<{ theme_id: string | null; theme_version: string | null; theme_tokens: unknown; theme_rev: number }>`
    select theme_id, theme_version, theme_tokens, theme_rev from projects where id = ${id}
  `.execute(db)
  return rows.rows[0]!
}

async function hiddenOf(): Promise<Record<string, string | null>> {
  const rows = await sql<{ key: string; hidden_at: Date | null }>`
    select theme_id || '@' || version as key, hidden_at from theme_packages order by theme_id, version
  `.execute(db)
  return Object.fromEntries(rows.rows.map((row) => [row.key, row.hidden_at === null ? null : row.hidden_at.toISOString()]))
}

const EARLIER = '2026-01-02T03:04:05.000Z'

describe('0027 — 걷은 시스템 테마', () => {
  it('넷에 고정한 프로젝트를 system-admin 최신(숨기지 않은 판의 semver 최대)으로 옮기고 이어지는 토큰만 남긴다 · rev 를 올린다', async () => {
    await store(manifestOf('system-admin', '1.9.0', { tokens: TARGET_TOKENS }))
    await store(manifestOf('system-admin', '1.10.0', { tokens: TARGET_TOKENS }))
    await store(manifestOf('system-admin', '1.11.0', { tokens: TARGET_TOKENS }), EARLIER)
    await store(manifestOf('system-commerce', '1.0.0', { tokens: RETIRED_TOKENS }))
    await store(manifestOf('system-portal', '1.2.0', { tokens: RETIRED_TOKENS }))
    const moved = await project(
      'system-commerce',
      '1.0.0',
      // 주색은 잇는다 · 면은 새 기본값과 같아 뺀다 · 모서리는 타입이 달라 버린다 · `commerce.only` 는 새 테마에 없어 버린다.
      { 'semantic.primary': '#ff0000', 'semantic.surface': '#ffffff', 'radius.sm': '#abcdef', 'commerce.only': '#123456' },
      3,
    )
    const plain = await project('system-portal', '1.2.0', {}, 0)
    const kept = await project('system-admin', '1.9.0', { 'semantic.primary': '#00ff00' }, 7)

    await migrateTo('0027-retire-system-themes')

    expect(await bindingOf(moved)).toEqual({
      theme_id: 'system-admin',
      theme_version: '1.10.0',
      theme_tokens: { 'semantic.primary': '#ff0000' },
      theme_rev: 4,
    })
    expect(await bindingOf(plain)).toEqual({ theme_id: 'system-admin', theme_version: '1.10.0', theme_tokens: {}, theme_rev: 1 })
    // 넷 밖의 바인딩은 안 건드린다 — 옛 판에 고정한 것도 그대로다.
    expect(await bindingOf(kept)).toEqual({
      theme_id: 'system-admin',
      theme_version: '1.9.0',
      theme_tokens: { 'semantic.primary': '#00ff00' },
      theme_rev: 7,
    })
  })

  it('넷의 판을 숨긴다 — 이미 숨긴 판은 처음 숨긴 때 그대로 · system-admin 은 안 숨긴다 · 행은 지우지 않는다', async () => {
    await store(manifestOf('system-admin', '1.0.0'))
    for (const id of ['system-commerce', 'system-docs', 'system-portal', 'system-saas-marketing']) await store(manifestOf(id, '1.0.0'))
    await store(manifestOf('system-docs', '0.9.0'), EARLIER)

    await migrateTo('0027-retire-system-themes')

    const hidden = await hiddenOf()
    expect(Object.keys(hidden)).toEqual([
      'system-admin@1.0.0',
      'system-commerce@1.0.0',
      'system-docs@0.9.0',
      'system-docs@1.0.0',
      'system-portal@1.0.0',
      'system-saas-marketing@1.0.0',
    ])
    expect(hidden['system-admin@1.0.0']).toBeNull()
    expect(hidden['system-docs@0.9.0']).toBe(EARLIER)
    for (const key of ['system-commerce@1.0.0', 'system-docs@1.0.0', 'system-portal@1.0.0', 'system-saas-marketing@1.0.0']) {
      expect(hidden[key], key).not.toBeNull()
      expect(hidden[key], key).not.toBe(EARLIER)
    }
  })

  it('system-admin 에 숨기지 않은 판이 없으면 바인딩을 비운다 — 기동이 채운다', async () => {
    await store(manifestOf('system-admin', '1.0.0', { tokens: TARGET_TOKENS }), EARLIER)
    await store(manifestOf('system-docs', '1.0.0', { tokens: RETIRED_TOKENS }))
    const moved = await project('system-docs', '1.0.0', { 'semantic.primary': '#ff0000' }, 2)

    await migrateTo('0027-retire-system-themes')

    expect(await bindingOf(moved)).toEqual({ theme_id: null, theme_version: null, theme_tokens: {}, theme_rev: 3 })
  })

  it('옮기기 전에 찍은 스냅샷(넷 가운데 하나를 가리킨다)은 옮긴 뒤에도 복원된다 — 숨긴 그 판으로 돌아간다', async () => {
    await store(manifestOf('system-admin', '1.0.0', { tokens: TARGET_TOKENS }))
    await store(manifestOf('system-saas-marketing', '1.0.0', { tokens: RETIRED_TOKENS }))
    const actorId = randomUUID()
    await sql`insert into users (id, email, name, password_hash) values (${actorId}, ${`a-${actorId}@example.com`}, '복원자', 'x')`.execute(
      db,
    )
    const projectId = await project('system-saas-marketing', '1.0.0', { 'commerce.only': '#123456' }, 0)
    const captured = await captureSnapshot(db, projectId)
    if (captured.kind !== 'captured') throw new Error('캡처 실패')
    expect(captured.payload.theme).toEqual({ themeId: 'system-saas-marketing', version: '1.0.0', tokens: { 'commerce.only': '#123456' } })
    const snapshot = await insertSnapshot(db, {
      projectId,
      tag: '옮기기 전',
      description: null,
      payload: captured.payload,
      createdBy: actorId,
    })

    await migrateTo('0027-retire-system-themes')
    expect((await bindingOf(projectId)).theme_id).toBe('system-admin')

    const outcome = await restoreSnapshot(db, { projectId, snapshotId: snapshot.id, actorId })
    expect(outcome.kind).toBe('restored')
    expect(await bindingOf(projectId)).toEqual({
      theme_id: 'system-saas-marketing',
      theme_version: '1.0.0',
      theme_tokens: { 'commerce.only': '#123456' },
      theme_rev: 2,
    })
  })

  it('down 은 되돌리지 않는다 — 바인딩 · 숨김이 그대로이고 다시 올려도 옮긴 프로젝트를 또 건드리지 않는다', async () => {
    await store(manifestOf('system-admin', '1.0.0', { tokens: TARGET_TOKENS }))
    await store(manifestOf('system-commerce', '1.0.0', { tokens: RETIRED_TOKENS }))
    const moved = await project('system-commerce', '1.0.0', {}, 0)
    await migrateTo('0027-retire-system-themes')
    const after = { binding: await bindingOf(moved), hidden: await hiddenOf() }

    await migrateTo('0025-state-visibility')
    expect({ binding: await bindingOf(moved), hidden: await hiddenOf() }).toEqual(after)
    await migrateTo('0027-retire-system-themes')
    expect({ binding: await bindingOf(moved), hidden: await hiddenOf() }).toEqual(after)
  })
})
