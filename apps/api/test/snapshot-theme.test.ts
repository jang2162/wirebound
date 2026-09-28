/**
 * **스냅샷 payload 판 3 — 프로젝트의 테마 바인딩을 얼린다**(`@wirebound/themes` 의 `snapshot/payload.ts`) · 복원이 되돌린다
 * (`src/services/restore.ts` 의 `set-theme`).
 *
 * 판 3 복원은 값이 같아도 `theme_rev` 를 올리고 `theme-changed` 를 보낸다(spec 「스냅샷」 — 늘). 판 2(테마 없음)는 바인딩을 안 건드린다.
 */
import { createHash } from 'node:crypto'
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWbtheme, SNAPSHOT_PAYLOAD_VERSION, type ThemeManifest } from '@wirebound/themes'
import { insertThemePackage, setThemePackageHidden } from '../src/repos/theme-packages'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { createProject, resetRealData, signup, withApi, withRealApi, type SignedUpUser, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'
import { joinRoom, type WsProbe } from './ws-client'

const SAMPLE = manifestOf('sample', '1.0.0', {
  tokens: { items: { 'color.accent': { type: 'color', label: '강조', default: '#e11d48' } } },
})

async function store(ctx: TestContext, manifest: ThemeManifest): Promise<void> {
  const bytes = packed(manifest)
  const { files } = readWbtheme(bytes)
  await insertThemePackage(ctx.db, {
    manifest: files!.manifest,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedBy: null,
  })
}

interface Fixture {
  owner: SignedUpUser
  projectId: string
}

async function fixture(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { owner, projectId: project.id }
}

async function putTheme(ctx: TestContext, fx: Fixture, body: { themeId: string; version: string; tokens: object }) {
  const rev = await themeRev(ctx, fx)
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.projectId}/theme`,
    cookies: fx.owner.cookie,
    payload: { ...body, rev },
  })
  if (res.statusCode !== 200) throw new Error(`테마 저장 실패 (${res.statusCode}): ${res.body}`)
}

async function themeRev(ctx: TestContext, fx: Fixture): Promise<number> {
  return (await binding(ctx, fx)).theme_rev
}

async function binding(ctx: TestContext, fx: Fixture) {
  return ctx.db
    .selectFrom('projects')
    .select(['theme_id', 'theme_version', 'theme_tokens', 'theme_rev'])
    .where('id', '=', fx.projectId)
    .executeTakeFirstOrThrow()
}

async function snapshot(ctx: TestContext, fx: Fixture, tag: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.projectId}/snapshots`,
    cookies: fx.owner.cookie,
    payload: { tag },
  })
  if (res.statusCode !== 201) throw new Error(`스냅샷 실패 (${res.statusCode}): ${res.body}`)
  return (res.json() as { id: string }).id
}

function restore(ctx: TestContext, fx: Fixture, snapshotId: string) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`,
    cookies: fx.owner.cookie,
  })
}

describe('캡처', () => {
  it('판 3 이고 지금 바인딩을 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#123456' } })
      const outcome = await captureSnapshot(ctx.db, fx.projectId)
      if (outcome.kind !== 'captured') throw new Error(outcome.kind)
      expect(SNAPSHOT_PAYLOAD_VERSION).toBe(3)
      expect(outcome.payload.payloadVersion).toBe(3)
      expect(outcome.payload.theme).toEqual({ themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#123456' } })
    })
  })

  it('수집 도중 바인딩을 저장하면 지문 불일치다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const outcome = await captureSnapshot(ctx.db, fx.projectId, {
        afterPages: async () => {
          await putTheme(ctx, fx, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#654321' } })
        },
      })
      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })

  it('수집 도중 토큰 값만 바꿔도 불일치다 — 지문이 바인딩을 덮는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#111111' } })
      const outcome = await captureSnapshot(ctx.db, fx.projectId, {
        afterPages: async () => {
          await putTheme(ctx, fx, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#222222' } })
        },
      })
      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })
})

describe('복원 — 판 3', () => {
  it('바인딩 · 토큰을 되돌리고 rev 를 올린다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#123456' } })
      const snapshotId = await snapshot(ctx, fx, '테마 전')
      await putTheme(ctx, fx, { themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#000000' } })
      const before = await themeRev(ctx, fx)

      const res = await restore(ctx, fx, snapshotId)
      expect(res.statusCode, res.body).toBe(200)
      expect(await binding(ctx, fx)).toEqual({
        theme_id: 'system-admin',
        theme_version: '0.1.0',
        theme_tokens: { 'semantic.primary': '#123456' },
        theme_rev: before + 1,
      })
    })
  })

  it('바인딩이 같아도 rev 를 올린다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshotId = await snapshot(ctx, fx, '그대로')
      const before = await themeRev(ctx, fx)
      expect((await restore(ctx, fx, snapshotId)).statusCode).toBe(200)
      expect(await themeRev(ctx, fx)).toBe(before + 1)
    })
  })

  it('스냅샷이 가리킨 판을 숨겨도 복원한다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'sample', version: '1.0.0', tokens: {} })
      const snapshotId = await snapshot(ctx, fx, '샘플')
      await putTheme(ctx, fx, { themeId: 'system-admin', version: '0.1.0', tokens: {} })
      await setThemePackageHidden(ctx.db, 'sample', '1.0.0', true)

      const res = await restore(ctx, fx, snapshotId)
      expect(res.statusCode, res.body).toBe(200)
      expect(await binding(ctx, fx)).toMatchObject({ theme_id: 'sample', theme_version: '1.0.0' })
    })
  })

  it('가리킨 패키지가 없으면 409 missing-theme 이고 아무것도 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshotId = await snapshot(ctx, fx, '없는 테마')
      await sql`update snapshots set payload = jsonb_set(payload, '{theme,themeId}', '"gone"') where id = ${snapshotId}`.execute(ctx.db)
      const before = await binding(ctx, fx)
      const snapshotsBefore = await ctx.db.selectFrom('snapshots').select('id').where('project_id', '=', fx.projectId).execute()

      const res = await restore(ctx, fx, snapshotId)
      expect(res.statusCode, res.body).toBe(409)
      expect(res.json().error.message).toBe('스냅샷의 테마 패키지가 이 서버에 없습니다: gone@0.1.0 — 복원하지 않았습니다')
      expect(await binding(ctx, fx)).toEqual(before)
      // 안전망 스냅샷도 안 남는다 — 첫 쓰기보다 앞에서 거절했다.
      expect(await ctx.db.selectFrom('snapshots').select('id').where('project_id', '=', fx.projectId).execute()).toHaveLength(
        snapshotsBefore.length,
      )
    })
  })
})

describe('복원 — 판 2(테마 없음)', () => {
  it('바인딩을 건드리지 않는다 — rev 도 그대로', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      const snapshotId = await snapshot(ctx, fx, '판 2')
      await sql`update snapshots set payload = (payload - 'theme') || '{"payloadVersion": 2}'::jsonb where id = ${snapshotId}`.execute(ctx.db)
      await putTheme(ctx, fx, { themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#000000' } })
      const before = await binding(ctx, fx)

      const res = await restore(ctx, fx, snapshotId)
      expect(res.statusCode, res.body).toBe(200)
      expect(await binding(ctx, fx)).toEqual(before)
    })
  })
})

describe('복원의 방송', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)
  const opened: WsProbe[] = []
  afterEach(() => {
    for (const probe of opened.splice(0)) probe.close()
  })

  it('판 3 복원은 restored 에 더해 theme-changed 를 보낸다 — 바인딩이 같아도', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshotId = await snapshot(ctx, fx, '방송')
      const rev = await themeRev(ctx, fx)
      const watcher = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(watcher)
      expect((await restore(ctx, fx, snapshotId)).statusCode).toBe(200)
      await watcher.waitFor('restored')
      expect(await watcher.waitFor('theme-changed')).toMatchObject({
        type: 'theme-changed',
        projectId: fx.projectId,
        themeId: 'system-admin',
        version: '0.1.0',
        tokens: {},
        rev: rev + 1,
      })
    })
  })

  it('판 2 복원은 theme-changed 를 안 보낸다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshotId = await snapshot(ctx, fx, '판 2 방송')
      await sql`update snapshots set payload = (payload - 'theme') || '{"payloadVersion": 2}'::jsonb where id = ${snapshotId}`.execute(ctx.db)
      const watcher = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(watcher)
      expect((await restore(ctx, fx, snapshotId)).statusCode).toBe(200)
      await watcher.waitFor('restored')
      // 조용한 창을 지난 뒤 받은 것 전부를 본다 — `quiet()` 의 반환은 창 안의 것뿐이라 먼저 닿은 프레임을 못 본다.
      await watcher.quiet()
      expect(watcher.received.filter((frame) => frame.type === 'theme-changed')).toEqual([])
    })
  })
})
