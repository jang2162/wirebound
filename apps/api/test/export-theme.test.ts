/**
 * **내보낸 번들이 프로젝트가 고정한 테마를 싣는다** — 패키지 파일(바이트 그대로) · 토큰 CSS · 페이지 JSON 의 테마 칸 · 미리보기의
 * `themeId`, 그리고 **api 가 테마 코드를 실행하지 않는다**(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「내보내기와
 * PPTX」 의 «테마 코드는 브라우저에서만 돈다»).
 *
 * 라우트(워커)의 zip 을 푼다 — 운영이 내는 것이 그것이다. 워커와 같은 스레드의 산출물이 바이트로 같은 것은 `export-worker.test.ts`.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { sql } from 'kysely'
import { stripComments } from '@wirebound/test-support'
import { readWbtheme, tokensCss, type ThemeManifest } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { insertThemePackage, readThemePackageFiles } from '../src/repos/theme-packages'
import { createMenuNode, createPage, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

interface Fixture {
  owner: SignedUpUser
  projectId: string
  slug: string
}

let slugs = 0

async function fixture(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  slugs += 1
  const slug = `theme-export-${slugs}`
  const project = await createProject(ctx, owner.cookie, { name: '테마 내보내기', slug })
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
  await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })
  return { owner, projectId: project.id, slug }
}

/** 라우트가 낸 zip 을 풀어 번들 뿌리 기준 경로 → 바이트. */
async function zipOf(ctx: TestContext, fx: Fixture): Promise<Map<string, Uint8Array>> {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/export`, cookies: fx.owner.cookie })
  expect(res.statusCode).toBe(200)
  const root = `wirebound-export-${fx.slug}/`
  return new Map(Object.entries(unzipSync(new Uint8Array(res.rawPayload))).map(([name, bytes]) => [name.slice(root.length), bytes]))
}

async function preview(ctx: TestContext, fx: Fixture): Promise<{ themeId: string | null; themeWarning: string | null }> {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/export/preview`, cookies: fx.owner.cookie })
  expect(res.statusCode).toBe(200)
  return res.json()
}

function pageData(zip: Map<string, Uint8Array>): { themeRef: unknown; manifest: unknown; tokens: unknown } {
  const html = strFromU8(zip.get('pages/회원-목록.html')!)
  const match = /<script type="application\/json" id="wb-export-page">(.*?)<\/script>/s.exec(html)
  if (match === null) throw new Error('페이지 JSON 이 없습니다')
  return JSON.parse(match[1]!)
}

function sheets(zip: Map<string, Uint8Array>): string[] {
  return [...strFromU8(zip.get('pages/회원-목록.html')!).matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]!)
}

async function store(ctx: TestContext, bytes: Uint8Array): Promise<ThemeManifest> {
  const { files, issues } = readWbtheme(bytes)
  if (files === null) throw new Error(`픽스처가 검증을 못 지났다: ${JSON.stringify(issues)}`)
  await insertThemePackage(ctx.db, {
    manifest: files.manifest,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedBy: null,
  })
  return files.manifest
}

/** 고정한 판 · 토큰을 바꾼다 — owner 의 PUT(지금 rev 로). */
async function bind(
  ctx: TestContext,
  fx: Fixture,
  themeId: string,
  version: string,
  tokens: Record<string, string | number>,
): Promise<void> {
  const current = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/theme`, cookies: fx.owner.cookie })
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.projectId}/theme`,
    cookies: fx.owner.cookie,
    payload: { themeId, version, tokens, rev: current.json().rev },
  })
  expect(res.statusCode, res.body).toBe(200)
}

describe('system-admin 에 고정한 프로젝트', () => {
  it('패키지의 theme.js · theme.css 를 바이트 그대로 · 저장한 토큰의 tokens.css 를 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const theme = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/theme`, cookies: fx.owner.cookie })
      const view = theme.json() as { themeId: string; version: string; manifest: ThemeManifest }
      expect([view.themeId, view.version]).toEqual(['system-admin', SYSTEM_ADMIN.version])
      // 색 토큰 하나를 기본값과 다르게 저장한다.
      const colorKey = Object.entries(view.manifest.tokens.items).find(([, decl]) => decl.type === 'color')![0]
      await bind(ctx, fx, 'system-admin', SYSTEM_ADMIN.version, { [colorKey]: '#123456' })

      const zip = await zipOf(ctx, fx)
      const pkg = readWbtheme((await readThemePackageFiles(ctx.db, 'system-admin', SYSTEM_ADMIN.version))!).files!
      expect(strFromU8(zip.get('assets/theme/theme.js')!)).toBe(pkg.themeJs)
      expect(pkg.themeCss).not.toBeNull()
      expect(strFromU8(zip.get('assets/theme/theme.css')!)).toBe(pkg.themeCss)
      expect(strFromU8(zip.get('assets/tokens.css')!)).toBe(tokensCss(view.manifest, { [colorKey]: '#123456' }).css)
      expect(strFromU8(zip.get('assets/tokens.css')!)).toContain('#123456')
      expect(pageData(zip)).toEqual({
        ...pageData(zip),
        themeRef: { themeId: 'system-admin', version: SYSTEM_ADMIN.version },
        manifest: view.manifest,
        tokens: { [colorKey]: '#123456' },
      })
      expect(sheets(zip)).toEqual(['../assets/shell.css', '../assets/views.css', '../assets/theme/theme.css', '../assets/tokens.css'])
    })
  })

  it('미리보기의 themeId 가 "id@판" 이고 경고가 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect(await preview(ctx, fx)).toMatchObject({ themeId: `system-admin@${SYSTEM_ADMIN.version}`, themeWarning: null })
    })
  })
})

describe('올린 테마에 고정한 프로젝트', () => {
  /** 글꼴은 바이트다 — UTF-8 로 못 읽는 바이트를 넣어 글자로 옮기면 깨지는 것을 잰다. */
  const FONT = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0xfe, 0x80, 0x01, 0xc3])

  it('자산을 assets/theme/assets/ 아래에 바이트 그대로 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await store(
        ctx,
        packed(manifestOf('fonty', '1.0.0'), {
          themeCss: '@font-face { font-family: F; src: url(./assets/f.woff2) }',
          assets: { 'assets/f.woff2': FONT },
        }),
      )
      await bind(ctx, fx, 'fonty', '1.0.0', {})
      const zip = await zipOf(ctx, fx)
      expect([...(zip.get('assets/theme/assets/f.woff2') ?? [])]).toEqual([...FONT])
      expect(pageData(zip).themeRef).toEqual({ themeId: 'fonty', version: '1.0.0' })
    })
  })

  it('theme.css 가 없는 패키지는 그 파일도 link 도 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await store(ctx, packed(manifestOf('plain', '1.0.0')))
      await bind(ctx, fx, 'plain', '1.0.0', {})
      const zip = await zipOf(ctx, fx)
      expect(zip.has('assets/theme/theme.js')).toBe(true)
      expect(zip.has('assets/theme/theme.css')).toBe(false)
      expect(sheets(zip)).toEqual(['../assets/shell.css', '../assets/views.css', '../assets/tokens.css'])
    })
  })

  /** 업로드 검증을 지난 행이라 일어나지 않아야 하지만, 패키지를 못 읽으면 내보내기를 멈추지 않고 기본 뷰로 내보내며 까닭을 말한다. */
  it('패키지를 못 읽으면 테마 없이 내보내고 미리보기가 까닭을 한 줄로 말한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await store(ctx, packed(manifestOf('broken', '1.0.0')))
      await bind(ctx, fx, 'broken', '1.0.0', {})
      await sql`update theme_packages set files = ${Buffer.from('zip 이 아니다')} where theme_id = 'broken'`.execute(ctx.db)
      const said = await preview(ctx, fx)
      expect(said.themeId).toBeNull()
      expect(String(said.themeWarning)).toMatch(/^테마 패키지를 읽지 못해 기본 뷰로 내보냅니다\(broken@1\.0\.0\): /)
      const zip = await zipOf(ctx, fx)
      expect([...zip.keys()].filter((path) => path.startsWith('assets/theme') || path === 'assets/tokens.css')).toEqual([])
      expect(pageData(zip).themeRef).toBeNull()
    })
  })
})

/**
 * **api 의 Node 프로세스는 테마 코드를 실행하지 않는다** — 내보내기 경로의 소스에 코드를 글자에서 짓는 수단(`new Function` · `vm` ·
 * `eval` · 동적 `import(`)이 없는지 센다. 주석은 TypeScript 파서로 걷는다(`stripComments` — 주석 속 인용이 거짓 빨강이 되지 않게).
 *
 * **이 자가 못 보는 것**: 이름을 조립해 부르는 길(`globalThis['ev' + 'al']`)과 그 파일들이 부르는 다른 모듈. 분모는 파일 이름
 * (`export-*` · `screen-render*` · `routes/export.ts`)으로 고른 소스다 — 새 내보내기 파일이 그 이름 밖에 서면 빠진다.
 */
describe('api 는 테마 코드를 실행하지 않는다', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url))
  const FILES = [
    ...readdirSync(join(SRC, 'services'))
      .filter((name) => /^(export-|screen-render)/.test(name))
      .map((name) => join('services', name)),
    join('routes', 'export.ts'),
  ]
  const CODE_FROM_TEXT = /\bnew\s+Function\s*\(|\bFunction\s*\(|\beval\s*\(|['"]node:vm['"]|\bimport\s*\(/

  it('세는 파일을 실제로 읽는다 — 카나리아', () => {
    expect(FILES).toContain(join('services', 'export-bundle.ts'))
    expect(FILES).toContain(join('services', 'export-source.ts'))
    expect(FILES).toContain(join('services', 'screen-render-chromium.ts'))
    expect(FILES.length).toBeGreaterThanOrEqual(10)
  })

  it.each(FILES)('%s 에 글자에서 코드를 짓는 자리가 없다', (file) => {
    const code = stripComments(readFileSync(join(SRC, file), 'utf8'), file)
    expect(code.match(CODE_FROM_TEXT)?.[0] ?? null).toBeNull()
  })

  /** 자가 정말 무엇을 잡는지 — 걸려야 할 꼴이 걸리고 주석 속 인용은 안 걸린다. */
  it('자가 잡는 꼴과 안 잡는 꼴 — 카나리아', () => {
    const caught = (text: string): boolean => CODE_FROM_TEXT.test(stripComments(text, 'probe.ts'))
    expect(['new Function("x")', "import vm from 'node:vm'", 'eval(code)', 'await import(url)', 'Function ("x")'].map(caught)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
    expect(['// new Function(x)', '/* eval(x) */', "const s = 'text'"].map(caught)).toEqual([false, false, false])
  })
})
