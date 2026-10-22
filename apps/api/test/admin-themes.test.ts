/**
 * **관리자 테마 라우트**(`src/routes/admin-themes.ts`) — 업로드 · 숨김 · 템플릿.
 *
 * 관리자 판정은 핸들러 안에서 요청마다 DB 로 한다(`src/auth/admin.ts`). 쓰기는 커밋 직전에 자격 · 관리자 표시를 다시 본다 —
 * «강등과 겹친 업로드» 절이 그 재확인을 잰다.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WBTHEME_LIMITS, type ThemeManifest } from '@wirebound/themes'
import { loadConfig } from '../src/config'
import { insertApiToken } from '../src/repos/api-tokens'
import { setInstanceAdmin } from '../src/repos/users'
import {
  createProject,
  getTestDb,
  resetRealData,
  signup,
  TEST_DATABASE_URL,
  withApi,
  withProxiedRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { builtSample, manifestOf, packed } from './theme-fixtures'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

const ZIP = { 'content-type': 'application/zip' }

async function adminOf(ctx: TestContext): Promise<SignedUpUser> {
  const me = await signup(ctx)
  await setInstanceAdmin(ctx.db, me.user.email, true)
  return me
}

function upload(ctx: TestContext, cookie: SignedUpUser['cookie'] | undefined, body: Uint8Array, headers: Record<string, string> = ZIP) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/admin/theme-packages',
    headers,
    ...(cookie ? { cookies: cookie } : {}),
    payload: Buffer.from(body),
  })
}

async function packageRows(ctx: TestContext) {
  return ctx.db
    .selectFrom('theme_packages')
    .select(['theme_id', 'version', 'uploaded_by', 'hidden_at'])
    .where('theme_id', 'not like', 'system-%')
    .execute()
}

describe('업로드 — 누가', () => {
  it('비로그인 401 · 비관리자 403 · 토큰 401', async () => {
    await withApi(async (ctx) => {
      const body = await builtSample()
      expect((await upload(ctx, undefined, body)).statusCode).toBe(401)

      const plain = await signup(ctx)
      const denied = await upload(ctx, plain.cookie, body)
      expect(denied.statusCode).toBe(403)
      expect(denied.json().error.message).toBe('인스턴스 관리자만 할 수 있습니다')

      // 관리자의 토큰이어도 — 토큰은 `:projectId` 라우트에서만 인증된다(`auth/plugin.ts`).
      const admin = await adminOf(ctx)
      const project = await createProject(ctx, admin.cookie)
      const token = await insertApiToken(ctx.db, { projectId: project.id, userId: admin.user.id, name: 't' })
      const viaToken = await upload(ctx, undefined, body, { ...ZIP, authorization: `Bearer ${token.value}` })
      expect(viaToken.statusCode).toBe(401)
      expect(await packageRows(ctx)).toEqual([])
    })
  })
})

describe('업로드 — 받는 것', () => {
  it('kit 으로 빌드한 패키지를 받는다 — 201 · 행 · 올린 사람', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const body = await builtSample()
      const res = await upload(ctx, admin.cookie, body)
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toEqual({
        themeId: 'sample',
        version: '1.0.0',
        name: '샘플',
        sha256: createHash('sha256').update(body).digest('hex'),
        size: body.length,
      })
      const rows = await packageRows(ctx)
      expect(rows.map((row) => ({ ...row, hidden_at: null }))).toEqual([
        { theme_id: 'sample', version: '1.0.0', uploaded_by: admin.user.id, hidden_at: null },
      ])
    })
  })

  it('application/octet-stream 도 받는다', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, packed(manifestOf('octet', '1.0.0')), { 'content-type': 'application/octet-stream' })
      expect(res.statusCode, res.body).toBe(201)
    })
  })

  it('같은 id@version 을 다시 올리면 409', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      expect((await upload(ctx, admin.cookie, await builtSample())).statusCode).toBe(201)
      const again = await upload(ctx, admin.cookie, packed(manifestOf('sample', '1.0.0')))
      expect(again.statusCode).toBe(409)
      expect(again.json().error.message).toBe('이미 올린 버전입니다: sample@1.0.0')
    })
  })

  it('id 가 system- 로 시작하면 422 reserved-id', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, packed(manifestOf('system-fake', '1.0.0')))
      expect(res.statusCode).toBe(422)
      expect(res.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(['reserved-id'])
      expect(await packageRows(ctx)).toEqual([])
    })
  })

  it('manifest 검증 이슈(판 1.0)면 422 이고 이슈가 항목별로 실린다', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, packed(manifestOf('bad-version', '1.0')))
      expect(res.statusCode).toBe(422)
      const issues = res.json().error.issues as { code: string; path: string; manifestCode?: string }[]
      expect(issues.map((issue) => issue.code)).toContain('manifest')
      expect(issues.find((issue) => issue.code === 'manifest')?.path).toContain('version')
    })
  })

  it('patterns 를 실은 manifest 는 422 이고 까닭을 말한다 · 행이 안 남는다(대조: 빼면 201)', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const patterns = { 'hero.split': { name: '히어로', schema: { type: 'Section' } } }
      const res = await upload(
        ctx,
        admin.cookie,
        packed(manifestOf('patterned', '1.0.0', { patterns } as unknown as Partial<ThemeManifest>)),
      )
      expect(res.statusCode, res.body).toBe(422)
      const issues = res.json().error.issues as { code: string; path: string; message: string; manifestCode?: string }[]
      expect(issues.map((issue) => [issue.code, issue.manifestCode, issue.path])).toEqual([['manifest', 'shape', 'manifest.json:patterns']])
      expect(issues[0]!.message).toContain('patterns 는 더 지원하지 않습니다')
      const rows = await ctx.db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'patterned').execute()
      expect(rows).toEqual([])
      const plain = await upload(ctx, admin.cookie, packed(manifestOf('patterned', '1.0.0')))
      expect(plain.statusCode, plain.body).toBe(201)
    })
  })

  it('zip 이 아니면 422 bad-zip', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, new TextEncoder().encode('zip 이 아니다'))
      expect(res.statusCode).toBe(422)
      expect(res.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(['bad-zip'])
    })
  })

  it('sdk 범위 밖이면 422 sdk-incompatible', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, packed(manifestOf('future', '1.0.0', { sdk: '^2.0.0' })))
      expect(res.statusCode).toBe(422)
      expect(res.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(['sdk-incompatible'])
    })
  })

  it('10 MB + 1 바이트는 413', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, new Uint8Array(WBTHEME_LIMITS.zipBytes + 1))
      expect(res.statusCode).toBe(413)
      expect(res.json().error.message).toBe('요청 본문이 너무 큽니다')
    })
  })

  it('10 MB 정확히는 본문으로 받는다(검증이 zip 이 아니라고 거절한다)', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, new Uint8Array(WBTHEME_LIMITS.zipBytes))
      expect(res.statusCode).toBe(422)
    })
  })

  it('Content-Type: application/json 이면 415', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/admin/theme-packages',
        cookies: admin.cookie,
        payload: { manifest: manifestOf('json', '1.0.0') },
      })
      expect(res.statusCode).toBe(415)
      expect(await packageRows(ctx)).toEqual([])
    })
  })

  it('본문이 없으면 400', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await ctx.app.inject({ method: 'POST', url: '/api/admin/theme-packages', cookies: admin.cookie })
      expect(res.statusCode).toBe(400)
    })
  })
})

describe('숨김', () => {
  it('숨기고 되살린다 — 응답은 그 버전', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      await upload(ctx, admin.cookie, await builtSample())
      const hide = (hidden: boolean) =>
        ctx.app.inject({ method: 'PATCH', url: '/api/admin/theme-packages/sample/1.0.0', cookies: admin.cookie, payload: { hidden } })

      const hidden = await hide(true)
      expect(hidden.statusCode, hidden.body).toBe(200)
      expect(hidden.json()).toMatchObject({
        themeId: 'sample',
        version: '1.0.0',
        hidden: true,
        uploadedBy: { id: admin.user.id, name: admin.user.name },
      })
      expect((await packageRows(ctx))[0]!.hidden_at).not.toBeNull()

      const shown = await hide(false)
      expect(shown.json()).toMatchObject({ hidden: false })
      expect((await packageRows(ctx))[0]!.hidden_at).toBeNull()
    })
  })

  it('없는 판은 404 · 비관리자 403 · 본문이 틀리면 400', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const plain = await signup(ctx)
      await upload(ctx, admin.cookie, await builtSample())
      const patch = (cookie: SignedUpUser['cookie'], url: string, payload: unknown) =>
        ctx.app.inject({ method: 'PATCH', url, cookies: cookie, payload: payload as object })
      expect((await patch(admin.cookie, '/api/admin/theme-packages/sample/9.9.9', { hidden: true })).statusCode).toBe(404)
      expect((await patch(plain.cookie, '/api/admin/theme-packages/sample/1.0.0', { hidden: true })).statusCode).toBe(403)
      expect((await patch(admin.cookie, '/api/admin/theme-packages/sample/1.0.0', { hidden: 'yes' })).statusCode).toBe(400)
      expect((await packageRows(ctx))[0]!.hidden_at).toBeNull()
    })
  })

  it('시스템 테마도 숨긴다', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/admin/theme-packages/system-admin/${SYSTEM_ADMIN.version}`,
        cookies: admin.cookie,
        payload: { hidden: true },
      })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ themeId: 'system-admin', hidden: true, uploadedBy: null })
    })
  })
})

describe('템플릿', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wb-template-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const configWith = (file: string) =>
    loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, PASSWORD_SCRYPT_N: '1024', THEME_TEMPLATE_ZIP: file })

  it('파일이 있으면 200 application/zip · 내려받기 이름', async () => {
    const file = join(dir, 'starter.zip')
    writeFileSync(file, Buffer.from([0x50, 0x4b, 5, 6]))
    await withApi(
      async (ctx) => {
        const admin = await adminOf(ctx)
        const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/theme-template.zip', cookies: admin.cookie })
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe('application/zip')
        expect(res.headers['content-disposition']).toBe('attachment; filename="wirebound-theme-starter.zip"')
        expect([...res.rawPayload]).toEqual([0x50, 0x4b, 5, 6])
      },
      { config: configWith(file) },
    )
  })

  it('없으면 404 와 만드는 명령 · 비관리자는 403', async () => {
    await withApi(
      async (ctx) => {
        const admin = await adminOf(ctx)
        const missing = await ctx.app.inject({ method: 'GET', url: '/api/admin/theme-template.zip', cookies: admin.cookie })
        expect(missing.statusCode).toBe(404)
        expect(missing.json().error.message).toBe('템플릿이 빌드되지 않았습니다 — `pnpm build:template`')
        const plain = await signup(ctx)
        expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/theme-template.zip', cookies: plain.cookie })).statusCode).toBe(403)
      },
      { config: configWith(join(dir, 'nope.zip')) },
    )
  })

  it('THEME_TEMPLATE_ZIP 을 비우면 kit 의 dist 다', () => {
    const config = configWith('')
    expect(config.themeTemplateZip.endsWith('/packages/theme-kit/dist/wirebound-theme-starter.zip')).toBe(true)
  })
})

/**
 * **Review Focus 1 — 관리자를 잃는 순간과 겹친 업로드는 되돌아간다.** 판 카나리아는 붙잡힌 것(`held`)과 강등이 기다리지 않고 커밋된
 * 것(`changed`)을 값으로 본다.
 *
 * - «가드 뒤 · 쓰기 앞»: 업로드가 핸들러 첫 줄의 판정을 지나 행 삽입(`insert into "theme_packages"`)에 붙잡힌 동안 강등이 커밋된다.
 *   붙잡는 자리가 재확인과 무관하게 서므로 재확인을 뗀 변조는 여기서 **값으로**(201 · 행이 남음) 죽는다.
 * - «쓰기 뒤 · 재확인 앞»: 행을 넣고 재확인 질의(`FOR SHARE`)에 붙잡힌 동안 강등이 커밋된다 — 삽입의 FK 가 사용자 행에 건
 *   `KEY SHARE` 가 강등의 `UPDATE` 를 막지 않는다는 것까지 잰다. 재확인을 떼면 이 판은 붙잡을 질의가 없어 안 선다(`held` 가
 *   원인 문장으로 거절한다) — 그 변조의 구분력은 앞 판이 든다.
 */
describe('강등과 겹친 업로드', () => {
  const db = getTestDb()
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('가드 뒤 · 행 삽입 앞에서 강등이 커밋되면 403 이고 행이 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery('insert into "theme_packages"')
      const pending = upload(ctx, admin.cookie, packed(manifestOf('raced', '1.0.0')))
      await hold.held
      expect(await setInstanceAdmin(db, admin.user.email, false)).toBe('changed')
      hold.release()
      const res = await pending
      expect(res.statusCode, res.body).toBe(403)
      expect(await db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'raced').execute()).toEqual([])
    })
  })

  it('가드 뒤 · 행 삽입 앞에서 로그아웃이 커밋되면 401 이고 행이 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery('insert into "theme_packages"')
      const pending = upload(ctx, admin.cookie, packed(manifestOf('raced', '1.0.0')))
      await hold.held
      const logout = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: admin.cookie })
      expect(logout.statusCode).toBe(204)
      hold.release()
      const res = await pending
      expect(res.statusCode, res.body).toBe(401)
      expect(await db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'raced').execute()).toEqual([])
    })
  })

  it('숨김도 — 가드 뒤 · 고치기 앞에서 강등이 커밋되면 403 이고 그대로다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const admin = await adminOf(ctx)
      expect((await upload(ctx, admin.cookie, packed(manifestOf('raced', '1.0.0')))).statusCode).toBe(201)
      const hold = ctx.proxy.holdQuery('update "theme_packages"')
      const pending = ctx.app.inject({
        method: 'PATCH',
        url: '/api/admin/theme-packages/raced/1.0.0',
        cookies: admin.cookie,
        payload: { hidden: true },
      })
      await hold.held
      expect(await setInstanceAdmin(db, admin.user.email, false)).toBe('changed')
      hold.release()
      const res = await pending
      expect(res.statusCode, res.body).toBe(403)
      const row = await db.selectFrom('theme_packages').select('hidden_at').where('theme_id', '=', 'raced').executeTakeFirstOrThrow()
      expect(row.hidden_at).toBeNull()
    })
  })

  it('행 삽입 뒤 · 재확인 앞에서 강등이 커밋되면 403 이고 행이 안 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery('"is_instance_admin" from "users" where "id" = $1 for share')
      const pending = upload(ctx, admin.cookie, packed(manifestOf('raced', '1.0.0')))
      await hold.held
      // 업로드의 행 삽입은 이미 끝났다 — FK 가 사용자 행에 건 `KEY SHARE` 는 강등의 `UPDATE` 와 안 부딪힌다.
      expect(await setInstanceAdmin(db, admin.user.email, false)).toBe('changed')
      hold.release()
      const res = await pending
      expect(res.statusCode, res.body).toBe(403)
      expect(await db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'raced').execute()).toEqual([])
    })
  })

  it('대조 — 강등이 없으면 같은 판이 201', async () => {
    await withProxiedRealApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery('"is_instance_admin" from "users" where "id" = $1 for share')
      const pending = upload(ctx, admin.cookie, packed(manifestOf('raced', '1.0.0')))
      await hold.held
      hold.release()
      expect((await pending).statusCode).toBe(201)
    })
  })
})
