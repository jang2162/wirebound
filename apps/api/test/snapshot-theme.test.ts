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
import { restoreSnapshot } from '../src/services/restore'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { createProject, resetRealData, signup, withApi, withRealApi, type SignedUpUser, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'
import { joinRoom, type WsProbe } from './ws-client'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

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
      await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#123456' } })
      const outcome = await captureSnapshot(ctx.db, fx.projectId)
      if (outcome.kind !== 'captured') throw new Error(outcome.kind)
      expect(SNAPSHOT_PAYLOAD_VERSION).toBe(3)
      expect(outcome.payload.payloadVersion).toBe(3)
      expect(outcome.payload.theme).toEqual({ themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#123456' } })
    })
  })

  it('수집 도중 바인딩을 저장하면 지문 불일치다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const outcome = await captureSnapshot(ctx.db, fx.projectId, {
        afterPages: async () => {
          await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#654321' } })
        },
      })
      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })

  it('수집 도중 토큰 값만 바꿔도 불일치다 — 지문이 바인딩을 덮는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#111111' } })
      const outcome = await captureSnapshot(ctx.db, fx.projectId, {
        afterPages: async () => {
          await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#222222' } })
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
      await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: { [SYSTEM_ADMIN.color.key]: '#123456' } })
      const snapshotId = await snapshot(ctx, fx, '테마 전')
      await putTheme(ctx, fx, { themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#000000' } })
      const before = await themeRev(ctx, fx)

      const res = await restore(ctx, fx, snapshotId)
      expect(res.statusCode, res.body).toBe(200)
      expect(await binding(ctx, fx)).toEqual({
        theme_id: 'system-admin',
        theme_version: SYSTEM_ADMIN.version,
        theme_tokens: { [SYSTEM_ADMIN.color.key]: '#123456' },
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
      await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: {} })
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
      expect(res.json().error.message).toBe(`스냅샷의 테마 패키지가 이 서버에 없습니다: gone@${SYSTEM_ADMIN.version} — 복원하지 않았습니다`)
      expect(await binding(ctx, fx)).toEqual(before)
      // 안전망 스냅샷도 안 남는다 — 첫 쓰기보다 앞에서 거절했다.
      expect(await ctx.db.selectFrom('snapshots').select('id').where('project_id', '=', fx.projectId).execute()).toHaveLength(
        snapshotsBefore.length,
      )
    })
  })
})

describe('복원 — 판 3 토큰이 그 판의 manifest 를 못 지나면', () => {
  // payload 는 서버만 짓는다 — 이 판들은 DB 의 payload 를 손으로 고쳐 세운다(다른 인스턴스 · 옛 판에서 온 DB 의 모양). 복원은 PUT 과 같은
  // 검사(`services/theme-tokens.ts`)를 지나 이슈가 난 키를 버리고(기본값으로 선다) 나머지를 쓴다 — 거절하지 않는다.
  const MULTI = manifestOf('multi', '1.0.0', {
    tokens: {
      items: {
        'color.a': { type: 'color', label: 'a', default: '#e11d48' },
        'color.b': { type: 'color', label: 'b', default: '#e11d48' },
        'font.body': { type: 'font', label: '본문', default: 'serif' },
      },
    },
  })

  async function tamper(ctx: TestContext, snapshotId: string, theme: object) {
    await sql`update snapshots set payload = jsonb_set(payload, '{theme}', ${JSON.stringify(theme)}::jsonb) where id = ${snapshotId}`.execute(ctx.db)
  }

  it('이슈가 난 키(없는 키 · 한도 밖 · 문법 밖)만 버리고 나머지를 쓴다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, MULTI)
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'multi', version: '1.0.0', tokens: {} })
      const snapshotId = await snapshot(ctx, fx, '손댄 토큰')
      await tamper(ctx, snapshotId, {
        themeId: 'multi',
        version: '1.0.0',
        tokens: {
          'color.a': '#000000',
          'color.b': 'x'.repeat(5000),
          'font.body': 'a;}body{display:none',
          'no.such': 'x',
        },
      })
      await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: {} })

      const outcome = await restoreSnapshot(ctx.db, { projectId: fx.projectId, snapshotId, actorId: fx.owner.user.id })
      if (outcome.kind !== 'restored') throw new Error(outcome.kind)
      expect([...outcome.result.droppedThemeTokens].sort()).toEqual(['color.b', 'font.body', 'no.such'])
      const after = await binding(ctx, fx)
      expect({ id: after.theme_id, version: after.theme_version, tokens: after.theme_tokens }).toEqual({
        id: 'multi',
        version: '1.0.0',
        tokens: { 'color.a': '#000000' },
      })
    })
  })

  it('남긴 것이 전체 한도를 넘으면 모두 기본값으로 선다', async () => {
    await withApi(async (ctx) => {
      const items = Object.fromEntries(
        Array.from({ length: 90 }, (_, i) => [`font.f${i}`, { type: 'font', label: `f${i}`, default: 'serif' }]),
      )
      await store(ctx, manifestOf('wide', '1.0.0', { tokens: { items } } as Partial<ThemeManifest>))
      const fx = await fixture(ctx)
      const snapshotId = await snapshot(ctx, fx, '큰 토큰')
      const long = `"${'a'.repeat(190)}"`
      await tamper(ctx, snapshotId, {
        themeId: 'wide',
        version: '1.0.0',
        tokens: Object.fromEntries(Object.keys(items).map((key) => [key, long])),
      })

      const outcome = await restoreSnapshot(ctx.db, { projectId: fx.projectId, snapshotId, actorId: fx.owner.user.id })
      if (outcome.kind !== 'restored') throw new Error(outcome.kind)
      expect(outcome.result.droppedThemeTokens).toHaveLength(90)
      const after = await binding(ctx, fx)
      expect({ id: after.theme_id, tokens: after.theme_tokens }).toEqual({ id: 'wide', tokens: {} })
    })
  })

  it('서버가 지은 판 3 payload 는 아무것도 버리지 않는다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, MULTI)
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'multi', version: '1.0.0', tokens: { 'color.a': '#000000', 'font.body': '"Noto Sans KR", serif' } })
      const snapshotId = await snapshot(ctx, fx, '그대로')
      const outcome = await restoreSnapshot(ctx.db, { projectId: fx.projectId, snapshotId, actorId: fx.owner.user.id })
      if (outcome.kind !== 'restored') throw new Error(outcome.kind)
      expect(outcome.result.droppedThemeTokens).toEqual([])
      expect((await binding(ctx, fx)).theme_tokens).toEqual({ 'color.a': '#000000', 'font.body': '"Noto Sans KR", serif' })
    })
  })
})

describe('복원 — 판 2(테마 없음)', () => {
  it('판 2 payload 에 theme 가 있어도(손댄 DB) 바인딩을 안 건드린다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      await putTheme(ctx, fx, { themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#111111' } })
      const snapshotId = await snapshot(ctx, fx, '판 2 + theme')
      await sql`update snapshots set payload = payload || '{"payloadVersion": 2}'::jsonb where id = ${snapshotId}`.execute(ctx.db)
      await putTheme(ctx, fx, { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: {} })
      const before = await binding(ctx, fx)

      const res = await restore(ctx, fx, snapshotId)
      expect(res.statusCode, res.body).toBe(200)
      expect(await binding(ctx, fx)).toEqual(before)
    })
  })

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
        version: SYSTEM_ADMIN.version,
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
