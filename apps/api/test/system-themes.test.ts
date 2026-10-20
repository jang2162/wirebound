/**
 * **시스템 테마 시딩과 바인딩 채우기**(`src/services/system-themes.ts`) · 패키지 저장소(`src/repos/theme-packages.ts`).
 *
 * **이 파일은 제 DB 를 만든다** — 빈 `theme_packages` 에서 시작해야 하는데, 공유 테스트 DB 에는 기동 시딩이 넣은
 * `system-admin` 이 커밋돼 있고 다른 파일의 프로젝트가 그것을 가리킨다(`RESTRICT`).
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import { packWbtheme, type ThemeManifest } from '@wirebound/themes'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { loadConfig } from '../src/config'
import { createDb, createPool } from '../src/db/client'
import { migrateToLatest } from '../src/db/migrate'
import type { DbHandle } from '../src/db/tx'
import { latestVisibleVersion, listThemePackages, setThemePackageHidden } from '../src/repos/theme-packages'
import { backfillProjectThemes, seedSystemThemes } from '../src/services/system-themes'
import { createProject, signup, TEST_DATABASE_URL, testConfig } from './helpers'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'
import { SDK_VERSION } from '@wirebound/theme-sdk/version'

const DATABASE = `wb_system_themes_${process.pid}_${Date.now()}`
const url = (() => {
  const parsed = new URL(TEST_DATABASE_URL)
  parsed.pathname = `/${DATABASE}`
  return parsed.toString()
})()

/** 저장소의 시스템 테마 — `test/global-setup.ts` 가 이 실행에서 다시 빌드했다. */
const REPO_SYSTEM_THEMES = testConfig().systemThemesDir
const ADMIN_KEY = `${SYSTEM_ADMIN.id}@${SYSTEM_ADMIN.version}`
const ADMIN_ARTIFACT = join(REPO_SYSTEM_THEMES, 'admin', 'dist', `${SYSTEM_ADMIN.id}-${SYSTEM_ADMIN.version}.wbtheme`)
/** 저장소가 내는 시스템 테마 — 디렉터리 차례(시딩이 도는 차례)다. 판은 테마마다 제 디렉터리에서 올리므로 여기서는 id 만 적는다. */
const REPO_THEME_IDS = ['system-admin']
const idOf = (key: string) => key.slice(0, key.lastIndexOf('@'))

let admin: DbHandle
let db: DbHandle
const scratch: string[] = []

beforeAll(async () => {
  admin = createDb(createPool(TEST_DATABASE_URL))
  await sql.raw(`CREATE DATABASE "${DATABASE}"`).execute(admin)
  db = createDb(createPool(url))
  await migrateToLatest(db)
})

afterAll(async () => {
  await db?.destroy()
  await sql.raw(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`).execute(admin)
  await admin?.destroy()
})

beforeEach(async () => {
  await db.deleteFrom('projects').execute()
  await db.deleteFrom('theme_packages').execute()
  await db.deleteFrom('users').execute()
})

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function manifest(id: string, version: string, sdk = '^1.0.0'): ThemeManifest {
  return { id, name: id, version, sdk, tokens: { items: {} } } as ThemeManifest
}

/** 임시 디렉터리에 `<id>/package.json` 과 `<id>/dist/<id>-<version>.wbtheme` 를 쓴다. `body` 가 다르면 바이트가 다르다. */
function artifactDir(entries: { manifest: ThemeManifest; body?: string }[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-system-themes-'))
  scratch.push(dir)
  writeArtifacts(dir, entries)
  return dir
}

/** `withPackage` 가 거짓이면 `package.json` 을 안 쓴다 — 저장소에서 걷은 테마의 남은 `dist` 꼴이다. */
function writeArtifacts(dir: string, entries: { manifest: ThemeManifest; body?: string; withPackage?: false }[]): void {
  for (const { manifest: m, body, withPackage } of entries) {
    const dist = join(dir, m.id, 'dist')
    mkdirSync(dist, { recursive: true })
    if (withPackage !== false) writeFileSync(join(dir, m.id, 'package.json'), '{}')
    writeFileSync(join(dist, `${m.id}-${m.version}.wbtheme`), packWbtheme({ manifest: m, themeJs: body ?? ';' }))
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('seedSystemThemes', () => {
  it('빈 표에 저장소의 시스템 테마(system-admin 하나)를 넣는다 — 올린 사람 없음 · sha256 이 산출물과 같다', async () => {
    const outcome = await seedSystemThemes(db, REPO_SYSTEM_THEMES)
    expect(outcome.inserted.map(idOf)).toEqual(REPO_THEME_IDS)
    expect(outcome.inserted).toContain(ADMIN_KEY)
    expect(outcome.kept).toEqual([])
    const rows = await db.selectFrom('theme_packages').selectAll().orderBy('theme_id').execute()
    expect(rows.map((row) => row.theme_id)).toEqual(REPO_THEME_IDS)
    expect(rows.map((row) => row.uploaded_by)).toEqual(REPO_THEME_IDS.map(() => null))
    const row = rows[0]!
    expect({ themeId: row.theme_id, version: row.version, uploadedBy: row.uploaded_by, manifestId: row.manifest.id }).toEqual({
      themeId: 'system-admin',
      version: SYSTEM_ADMIN.version,
      uploadedBy: null,
      manifestId: 'system-admin',
    })
    const file = readFileSync(ADMIN_ARTIFACT)
    expect(row.sha256).toBe(sha256(file))
    expect(sha256(row.files)).toBe(sha256(file))
    expect(row.size).toBe(file.length)
  })

  it('두 번 시딩하면 넣지 않는다 — 멱등', async () => {
    const first = await seedSystemThemes(db, REPO_SYSTEM_THEMES)
    expect(await seedSystemThemes(db, REPO_SYSTEM_THEMES)).toEqual({ inserted: [], kept: first.inserted })
    expect(await db.selectFrom('theme_packages').select('theme_id').execute()).toHaveLength(REPO_THEME_IDS.length)
  })

  it('같은 id@version 인데 바이트가 바뀌면 던진다 — 문장에 id@version 이 있다', async () => {
    const dir = artifactDir([{ manifest: manifest('system-x', '1.0.0'), body: 'first' }])
    await seedSystemThemes(db, dir)
    writeArtifacts(dir, [{ manifest: manifest('system-x', '1.0.0'), body: 'second' }])
    await expect(seedSystemThemes(db, dir)).rejects.toThrow('이미 올린 버전의 내용이 바뀌었습니다: system-x@1.0.0 — 판을 올리십시오')
  })

  it('id 가 system- 로 안 시작하면 던진다', async () => {
    const dir = artifactDir([{ manifest: manifest('acme', '1.0.0') }])
    await expect(seedSystemThemes(db, dir)).rejects.toThrow('시스템 테마의 id 는 `system-` 로 시작해야 합니다: acme@1.0.0')
    expect(await db.selectFrom('theme_packages').select('theme_id').execute()).toEqual([])
  })

  it('sdk 범위 밖이면 던진다', async () => {
    const dir = artifactDir([{ manifest: manifest('system-future', '1.0.0', '^2.0.0') }])
    await expect(seedSystemThemes(db, dir)).rejects.toThrow(
      `호스트 SDK ${SDK_VERSION} 과 맞지 않습니다: system-future@1.0.0 의 sdk 는 ^2.0.0`,
    )
  })

  it('package.json 이 없는 디렉터리의 산출물은 안 넣는다 — 저장소에서 걷은 테마가 체크아웃에 남긴 dist', async () => {
    const dir = artifactDir([{ manifest: manifest('system-kept', '1.0.0') }])
    writeArtifacts(dir, [{ manifest: manifest('system-retired', '1.0.0'), withPackage: false }])
    expect(await seedSystemThemes(db, dir)).toEqual({ inserted: ['system-kept@1.0.0'], kept: [] })
    expect((await db.selectFrom('theme_packages').select('theme_id').execute()).map((row) => row.theme_id)).toEqual(['system-kept'])
  })

  it('산출물이 하나도 없으면 던지고 `pnpm build` 를 말한다', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'wb-system-themes-empty-'))
    scratch.push(empty)
    await expect(seedSystemThemes(db, empty)).rejects.toThrow('시스템 테마 산출물이 없습니다')
    await expect(seedSystemThemes(db, empty)).rejects.toThrow('`pnpm build`')
    await expect(seedSystemThemes(db, join(empty, 'nope'))).rejects.toThrow('시스템 테마 산출물이 없습니다')
  })

  it('산출물이 package.json 없는 디렉터리에만 있으면 던지고 그 규칙을 말한다 — SYSTEM_THEMES_DIR 에 산출물만 옮긴 판', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-system-themes-bare-'))
    scratch.push(dir)
    writeArtifacts(dir, [{ manifest: manifest('system-bare', '1.0.0'), withPackage: false }])
    await expect(seedSystemThemes(db, dir)).rejects.toThrow('`package.json` 이 있는 테마 디렉터리만')
  })
})

describe('backfillProjectThemes', () => {
  async function bareProject(): Promise<string> {
    const id = randomUUID()
    await sql`insert into projects (id, name, slug) values (${id}, '빈 프로젝트', ${`p-${id.slice(0, 8)}`})`.execute(db)
    return id
  }

  async function bindingOf(id: string) {
    return db
      .selectFrom('projects')
      .select(['theme_id', 'theme_version', 'theme_tokens', 'theme_rev'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  }

  it('테마가 빈 프로젝트를 system-admin 의 최신(semver)으로 채운다 — 숨긴 판은 최신에서 빠진다', async () => {
    const dir = artifactDir([
      { manifest: manifest('system-admin', '1.9.0') },
      { manifest: manifest('system-admin', '1.10.0') },
      { manifest: manifest('system-admin', '1.11.0') },
    ])
    await seedSystemThemes(db, dir)
    await setThemePackageHidden(db, 'system-admin', '1.11.0', true)
    expect(await latestVisibleVersion(db, 'system-admin')).toBe('1.10.0')

    const [a, b] = [await bareProject(), await bareProject()]
    expect(await backfillProjectThemes(db)).toBe(2)
    for (const id of [a, b]) {
      expect(await bindingOf(id)).toEqual({ theme_id: 'system-admin', theme_version: '1.10.0', theme_tokens: {}, theme_rev: 0 })
    }
    expect(await backfillProjectThemes(db)).toBe(0)
  })

  it('system-admin 이 없으면 아무것도 안 채운다', async () => {
    const id = await bareProject()
    expect(await backfillProjectThemes(db)).toBe(0)
    expect((await bindingOf(id)).theme_id).toBeNull()
  })
})

describe('listThemePackages', () => {
  it('테마 id 순, 한 테마 안에서는 semver 가 큰 것부터 — 숨긴 판은 청할 때만', async () => {
    const dir = artifactDir([
      { manifest: manifest('system-b', '1.9.0') },
      { manifest: manifest('system-b', '1.10.0') },
      { manifest: manifest('system-a', '2.0.0') },
    ])
    await seedSystemThemes(db, dir)
    await setThemePackageHidden(db, 'system-b', '1.9.0', true)
    const key = (rows: { themeId: string; version: string }[]) => rows.map((row) => `${row.themeId}@${row.version}`)
    expect(key(await listThemePackages(db, { includeHidden: true }))).toEqual(['system-a@2.0.0', 'system-b@1.10.0', 'system-b@1.9.0'])
    expect(key(await listThemePackages(db, { includeHidden: false }))).toEqual(['system-a@2.0.0', 'system-b@1.10.0'])
  })
})

describe('기동', () => {
  it('buildApp 이 저장소의 시스템 테마를 시딩하고 새 프로젝트가 system-admin 의 지금 판에 고정된다', async () => {
    const app = await buildApp({ db, config: { ...testConfig(), databaseUrl: url } })
    try {
      expect((await db.selectFrom('theme_packages').select('theme_id').orderBy('theme_id').execute()).map((row) => row.theme_id)).toEqual(
        REPO_THEME_IDS,
      )
      const owner = await signup({ app, db })
      const project = await createProject({ app, db }, owner.cookie)
      const row = await db
        .selectFrom('projects')
        .select(['theme_id', 'theme_version', 'theme_tokens', 'theme_rev'])
        .where('id', '=', project.id)
        .executeTakeFirstOrThrow()
      expect(row).toEqual({ theme_id: 'system-admin', theme_version: SYSTEM_ADMIN.version, theme_tokens: {}, theme_rev: 0 })
    } finally {
      await app.close()
    }
  })

  it('buildApp 이 테마가 빈 프로젝트를 채운다', async () => {
    const id = randomUUID()
    await sql`insert into projects (id, name, slug) values (${id}, '옛 프로젝트', ${`p-${id.slice(0, 8)}`})`.execute(db)
    const app = await buildApp({ db, config: testConfig() })
    await app.close()
    const row = await db.selectFrom('projects').select(['theme_id', 'theme_version']).where('id', '=', id).executeTakeFirstOrThrow()
    expect(row).toEqual({ theme_id: 'system-admin', theme_version: SYSTEM_ADMIN.version })
  })

  it('산출물 없는 SYSTEM_THEMES_DIR 로는 buildApp 이 던진다', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'wb-system-themes-empty-'))
    scratch.push(empty)
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PASSWORD_SCRYPT_N: '1024', SYSTEM_THEMES_DIR: empty })
    await expect(buildApp({ db, config })).rejects.toThrow('시스템 테마 산출물이 없습니다')
  })

  it('SYSTEM_THEMES_DIR 을 비우면 저장소의 system-themes 다', () => {
    expect(loadConfig({ DATABASE_URL: url, SYSTEM_THEMES_DIR: '' }).systemThemesDir).toBe(REPO_SYSTEM_THEMES)
    expect(REPO_SYSTEM_THEMES.endsWith('/system-themes')).toBe(true)
  })
})
