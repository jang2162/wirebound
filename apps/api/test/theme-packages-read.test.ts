/**
 * **테마 패키지 읽기**(`src/routes/theme-packages.ts`) — 목록 · manifest · 패키지 안의 파일.
 *
 * 숨긴 판은 목록에서 관리자에게만 실리고, manifest · 파일은 누구에게나 나간다 — 고정한 프로젝트가 그려져야 한다(spec 「읽기 경로」).
 */
import { createHash } from 'node:crypto'
import { request } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWbtheme } from '@wirebound/themes'
import { insertApiToken } from '../src/repos/api-tokens'
import { insertThemePackage, setThemePackageHidden } from '../src/repos/theme-packages'
import { setInstanceAdmin } from '../src/repos/users'
import {
  createProject,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { manifestOf, packed } from './theme-fixtures'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

async function store(ctx: TestContext, bytes: Uint8Array, uploadedBy: string | null = null): Promise<void> {
  const { files, issues } = readWbtheme(bytes)
  if (files === null) throw new Error(`픽스처가 검증을 못 지났다: ${JSON.stringify(issues)}`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await insertThemePackage(ctx.db, { manifest: files.manifest, bytes, sha256, uploadedBy })
}

function get(ctx: TestContext, cookie: SignedUpUser['cookie'] | undefined, url: string) {
  return ctx.app.inject({ method: 'GET', url, ...(cookie ? { cookies: cookie } : {}) })
}

interface ListedTheme {
  themeId: string
  name: string
  description: string | null
  latest: string | null
  versions: { version: string; hidden: boolean; uploadedBy: { id: string; name: string } | null }[]
}

describe('GET /api/theme-packages', () => {
  async function seedLineage(ctx: TestContext, uploader: SignedUpUser) {
    await store(ctx, packed(manifestOf('lineage', '1.9.0', { name: '계보 1.9', description: '옛 설명' })), uploader.user.id)
    await store(ctx, packed(manifestOf('lineage', '1.10.0', { name: '계보', description: '지금 설명' })), uploader.user.id)
    await store(ctx, packed(manifestOf('lineage', '1.11.0', { name: '계보 1.11' })), uploader.user.id)
    await setThemePackageHidden(ctx.db, 'lineage', '1.11.0', true)
    await store(ctx, packed(manifestOf('ghost', '1.0.0')))
    await setThemePackageHidden(ctx.db, 'ghost', '1.0.0', true)
  }

  const find = (body: ListedTheme[], themeId: string) => body.find((theme) => theme.themeId === themeId)

  it('비관리자 — 숨긴 판이 없고, 판이 다 숨은 테마는 통째로 없다 · latest 는 semver 최대', async () => {
    await withApi(async (ctx) => {
      const uploader = await signup(ctx)
      await seedLineage(ctx, uploader)
      const viewer = await signup(ctx)
      const res = await get(ctx, viewer.cookie, '/api/theme-packages')
      expect(res.statusCode).toBe(200)
      const body = res.json() as ListedTheme[]
      expect(find(body, 'ghost')).toBeUndefined()
      const lineage = find(body, 'lineage')!
      expect({ name: lineage.name, description: lineage.description, latest: lineage.latest }).toEqual({
        name: '계보',
        description: '지금 설명',
        latest: '1.10.0',
      })
      expect(lineage.versions.map((v) => [v.version, v.hidden])).toEqual([
        ['1.10.0', false],
        ['1.9.0', false],
      ])
      expect(lineage.versions[0]!.uploadedBy).toEqual({ id: uploader.user.id, name: uploader.user.name })
      // 시스템 테마도 실린다 — 올린 사람 없음.
      expect(find(body, 'system-admin')?.versions[0]?.uploadedBy).toBeNull()
    })
  })

  it('관리자 — 숨긴 판이 hidden: true 로 실리고 latest 는 같다 · 판이 다 숨은 테마는 latest 가 null', async () => {
    await withApi(async (ctx) => {
      const admin = await signup(ctx)
      await setInstanceAdmin(ctx.db, admin.user.email, true)
      await seedLineage(ctx, admin)
      const body = (await get(ctx, admin.cookie, '/api/theme-packages')).json() as ListedTheme[]
      const lineage = find(body, 'lineage')!
      expect(lineage.latest).toBe('1.10.0')
      expect(lineage.versions.map((v) => [v.version, v.hidden])).toEqual([
        ['1.11.0', true],
        ['1.10.0', false],
        ['1.9.0', false],
      ])
      expect(find(body, 'ghost')).toMatchObject({ latest: null, versions: [{ version: '1.0.0', hidden: true }] })
    })
  })

  it('관리자 판정은 요청마다 DB 에서 — 강등 직후 다음 요청부터 숨긴 판이 빠진다', async () => {
    await withApi(async (ctx) => {
      const admin = await signup(ctx)
      await setInstanceAdmin(ctx.db, admin.user.email, true)
      await seedLineage(ctx, admin)
      const before = (await get(ctx, admin.cookie, '/api/theme-packages')).json() as ListedTheme[]
      expect(find(before, 'lineage')!.versions).toHaveLength(3)
      await setInstanceAdmin(ctx.db, admin.user.email, false)
      const after = (await get(ctx, admin.cookie, '/api/theme-packages')).json() as ListedTheme[]
      expect(find(after, 'lineage')!.versions).toHaveLength(2)
      expect(find(after, 'ghost')).toBeUndefined()
    })
  })

  it('테마는 id 순이다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, packed(manifestOf('zeta', '1.0.0')))
      await store(ctx, packed(manifestOf('alpha', '1.0.0')))
      const viewer = await signup(ctx)
      const ids = ((await get(ctx, viewer.cookie, '/api/theme-packages')).json() as ListedTheme[]).map((theme) => theme.themeId)
      expect(ids).toEqual([...ids].sort())
      expect(ids).toEqual(expect.arrayContaining(['alpha', 'system-admin', 'zeta']))
    })
  })
})

describe('GET …/manifest', () => {
  it('manifest 를 낸다 — 숨긴 판도 · 작성자의 키 순서 그대로', async () => {
    await withApi(async (ctx) => {
      const manifest = manifestOf('ordered', '1.0.0', {
        tokens: {
          items: {
            'z.last': { type: 'color', label: '끝', default: '#000000' },
            'a.first': { type: 'color', label: '처음', default: '#ffffff' },
          },
        },
      })
      await store(ctx, packed(manifest))
      await setThemePackageHidden(ctx.db, 'ordered', '1.0.0', true)
      const viewer = await signup(ctx)
      const res = await get(ctx, viewer.cookie, '/api/theme-packages/ordered/1.0.0/manifest')
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual(manifest)
      expect(Object.keys(res.json().tokens.items)).toEqual(['z.last', 'a.first'])
    })
  })

  it('없는 판은 404', async () => {
    await withApi(async (ctx) => {
      const viewer = await signup(ctx)
      expect((await get(ctx, viewer.cookie, '/api/theme-packages/nope/1.0.0/manifest')).statusCode).toBe(404)
    })
  })
})

describe('GET …/files/*', () => {
  const FILES = {
    themeCss: '.x{background:url(./assets/x.svg)}',
    assets: { 'assets/x.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'assets/fonts/body.woff2': 'woff2' },
  }

  it.each([
    ['theme.js', 'text/javascript; charset=utf-8', ';'],
    ['theme.css', 'text/css; charset=utf-8', FILES.themeCss],
    ['assets/x.svg', 'image/svg+xml', FILES.assets['assets/x.svg']],
    ['assets/fonts/body.woff2', 'font/woff2', 'woff2'],
  ])('%s → %s · 1 년 불변 캐시', async (path, type, body) => {
    await withApi(async (ctx) => {
      await store(ctx, packed(manifestOf('files', '1.0.0'), FILES))
      const viewer = await signup(ctx)
      const res = await get(ctx, viewer.cookie, `/api/theme-packages/files/1.0.0/files/${path}`)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.headers['content-type']).toBe(type)
      expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.body).toBe(body)
    })
  })

  it('manifest.json 도 낸다', async () => {
    await withApi(async (ctx) => {
      const manifest = manifestOf('files', '1.0.0')
      await store(ctx, packed(manifest, FILES))
      const viewer = await signup(ctx)
      const res = await get(ctx, viewer.cookie, '/api/theme-packages/files/1.0.0/files/manifest.json')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
      expect(res.json()).toEqual(manifest)
    })
  })

  it('숨긴 판의 파일도 낸다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, packed(manifestOf('files', '1.0.0'), FILES))
      await setThemePackageHidden(ctx.db, 'files', '1.0.0', true)
      const viewer = await signup(ctx)
      expect((await get(ctx, viewer.cookie, '/api/theme-packages/files/1.0.0/files/theme.css')).statusCode).toBe(200)
    })
  })

  it.each([
    ['없는 경로', 'assets/none.svg'],
    ['대소문자가 다른 이름', 'Theme.css'],
    ['빈 경로', ''],
    ['디렉터리', 'assets'],
    ['디렉터리 끝 /', 'assets/'],
  ])('%s → 404 — zip 안 이름과 정확히 같을 때만 낸다', async (_label, path) => {
    await withApi(async (ctx) => {
      await store(ctx, packed(manifestOf('files', '1.0.0'), FILES))
      const viewer = await signup(ctx)
      const res = await get(ctx, viewer.cookie, `/api/theme-packages/files/1.0.0/files/${path}`)
      expect(res.statusCode, res.body).toBe(404)
    })
  })

  it('없는 판은 404', async () => {
    await withApi(async (ctx) => {
      const viewer = await signup(ctx)
      expect((await get(ctx, viewer.cookie, '/api/theme-packages/nope/1.0.0/files/theme.js')).statusCode).toBe(404)
    })
  })
})

/**
 * **점 구간은 정규화하지 않은 요청으로 잰다.** `inject` 와 브라우저는 URL 을 WHATWG 규칙으로 풀어 `./` · `../` · `%2e%2e` 를 보내기
 * 전에 없앤다 — 그 판에서는 서버가 점 구간을 받지 않는다. 서버가 받는 원시 경로(`curl --path-as-is` 부류)는 소켓으로 보낸다.
 */
describe('GET …/files/* — 원시 경로', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  function rawGet(port: number, path: string, cookie: SignedUpUser['cookie']): Promise<number> {
    return new Promise((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path, headers: { cookie: `wb_session=${cookie.wb_session}` } },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.on('error', reject)
      req.end()
    })
  }

  it.each([
    ['../ 로 올라감', '../theme.css'],
    ['안에서 ../', 'assets/../theme.css'],
    ['%2e%2e 로 올라감', '%2e%2e/theme.css'],
    ['앞의 ./', './theme.css'],
  ])('%s → 404', async (_label, path) => {
    await withRealApi(async (ctx) => {
      await store(ctx, packed(manifestOf('files', '1.0.0'), { themeCss: '.x{}' }))
      const viewer = await signup(ctx)
      const base = '/api/theme-packages/files/1.0.0/files/'
      // 판 카나리아 — 같은 소켓 길로 정확한 이름은 200 이다.
      expect(await rawGet(ctx.port, `${base}theme.css`, viewer.cookie)).toBe(200)
      expect(await rawGet(ctx.port, `${base}${path}`, viewer.cookie)).toBe(404)
    })
  })
})

describe('누가', () => {
  it.each([
    ['목록', '/api/theme-packages'],
    ['manifest', `/api/theme-packages/system-admin/${SYSTEM_ADMIN.version}/manifest`],
    ['파일', `/api/theme-packages/system-admin/${SYSTEM_ADMIN.version}/files/theme.js`],
  ])('%s — 비로그인 401 · 토큰 401 · 로그인 200', async (_label, url) => {
    await withApi(async (ctx) => {
      expect((await get(ctx, undefined, url)).statusCode).toBe(401)
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const token = await insertApiToken(ctx.db, { projectId: project.id, userId: owner.user.id, name: 't' })
      expect((await ctx.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token.value}` } })).statusCode).toBe(401)
      expect((await get(ctx, owner.cookie, url)).statusCode).toBe(200)
    })
  })
})
