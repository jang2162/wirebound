/**
 * **새로 들이는 입구는 중첩 `Page` 를 막고, 이미 저장된 것을 다시 읽는 길은 안 막는다**(`packages/schema` 의 `validate.ts` ·
 * `nested-page`). 이 파일이 재는 입구 둘과 길 셋:
 *
 * | 입구 · 길 | 새것 | 이미 저장된 것 |
 * |---|---|---|
 * | 테마 업로드 `POST /api/admin/theme-packages` | `Page` 가 든 패턴은 422 · 행 0 | — |
 * | 내보내기가 저장된 패키지를 다시 읽는다(`services/export-source.ts`) | — | 200 · 그 테마로 내보낸다(경고 없음) |
 * | 프리셋 저장 `POST …/presets` | `Page` 가 든 프리셋(맨 위 포함)은 422 · 행 0 | 목록 200 · 삭제 204 |
 * | 페이지 JSON 가져오기 `POST …/pages/import` | 옛 문서를 내보낸 파일은 422 — 이슈가 그 노드의 id · 경로를 짚는다 | — |
 *
 * 옛 패키지 · 옛 프리셋은 저장소 함수 · SQL 로 심는다 — 지금의 입구로는 만들 수 없다(그것이 이 규칙이다).
 */
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { toPageJson, type PageDocument, type WbNode } from '@wirebound/schema'
import { readWbtheme, type ThemeManifest } from '@wirebound/themes'
import { insertPreset } from '../src/repos/presets'
import { insertThemePackage } from '../src/repos/theme-packages'
import { setInstanceAdmin } from '../src/repos/users'
import { ensureCatalog } from '../src/schema-setup'
import { createMenuNode, createPage, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'

beforeEach(() => {
  ensureCatalog()
})

/** `Page` 가 든 패턴 — 맨 위 · 깊이 둘. 패턴은 넣으면 페이지 뿌리 아래에 전개된다. */
const PAGE_PATTERNS = {
  'content.page': { name: '페이지째', schema: { type: 'Page', children: [{ type: 'Text', props: { content: '안' } }] } },
  'content.deep': { name: '깊은 페이지', schema: { type: 'Section', children: [{ type: 'Card', children: [{ type: 'Page' }] }] } },
}

const PLAIN_PATTERNS = {
  'content.plain': { name: '글', schema: { type: 'Section', children: [{ type: 'Text', props: { content: '글' } }] } },
}

function themeWith(id: string, patterns: Record<string, unknown>): ThemeManifest {
  return manifestOf(id, '1.0.0', { patterns } as Partial<ThemeManifest>)
}

async function adminOf(ctx: TestContext): Promise<SignedUpUser> {
  const me = await signup(ctx)
  await setInstanceAdmin(ctx.db, me.user.email, true)
  return me
}

function upload(ctx: TestContext, cookie: SignedUpUser['cookie'], body: Uint8Array) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/admin/theme-packages',
    headers: { 'content-type': 'application/zip' },
    cookies: cookie,
    payload: Buffer.from(body),
  })
}

type Issue = { code: string; path: string; message: string; nodeId?: string | null; manifestCode?: string }
const issuesOf = (body: string) => (JSON.parse(body) as { error: { issues?: Issue[] } }).error.issues ?? []

describe('테마 업로드 — Page 가 든 패턴', () => {
  it('맨 위 · 깊은 Page 둘 다 422 — 패턴마다 그 노드의 자리 · 행 0', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, packed(themeWith('paged', PAGE_PATTERNS)))
      expect(res.statusCode, res.body).toBe(422)
      const issues = issuesOf(res.body)
      expect(issues.map((issue) => [issue.manifestCode, issue.path])).toEqual([
        ['pattern', 'manifest.json:patterns.content.page.schema'],
        ['pattern', 'manifest.json:patterns.content.deep.schema.children.0.children.0'],
      ])
      expect(issues[0]!.message).toContain('Page')
      const rows = await ctx.db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'paged').execute()
      expect(rows).toEqual([])
    })
  })

  it('Page 가 없는 패턴은 받는다 — 201(대조군)', async () => {
    await withApi(async (ctx) => {
      const admin = await adminOf(ctx)
      const res = await upload(ctx, admin.cookie, packed(themeWith('plain', PLAIN_PATTERNS)))
      expect(res.statusCode, res.body).toBe(201)
    })
  })
})

describe('이미 저장된 테마 패키지 — Page 가 든 패턴', () => {
  async function storeOld(ctx: TestContext): Promise<void> {
    const bytes = packed(themeWith('oldpaged', PAGE_PATTERNS))
    const { files, issues } = readWbtheme(bytes)
    if (files === null) throw new Error(`다시 읽기가 옛 패키지를 거절했다: ${JSON.stringify(issues)}`)
    await insertThemePackage(ctx.db, {
      manifest: files.manifest,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      uploadedBy: null,
    })
  }

  it('고정한 프로젝트를 그 테마로 내보낸다 — 미리보기 경고 없음 · zip 200', async () => {
    await withApi(async (ctx) => {
      await storeOld(ctx)
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })
      const current = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/theme`, cookies: owner.cookie })
      const bound = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/theme`,
        cookies: owner.cookie,
        payload: { themeId: 'oldpaged', version: '1.0.0', tokens: {}, rev: current.json().rev },
      })
      expect(bound.statusCode, bound.body).toBe(200)

      const preview = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/export/preview`, cookies: owner.cookie })
      expect(preview.statusCode, preview.body).toBe(200)
      expect(preview.json()).toMatchObject({ themeId: 'oldpaged@1.0.0', themeWarning: null })

      const zip = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/export`, cookies: owner.cookie })
      expect(zip.statusCode).toBe(200)

      // CLI `wireb lint` 가 다시 읽는 manifest(`packages/cli` 의 `fetchLintTheme`)도 그 패턴째 온다.
      const theme = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/theme`, cookies: owner.cookie })
      expect(Object.keys((theme.json() as { manifest: ThemeManifest }).manifest.patterns ?? {})).toEqual(Object.keys(PAGE_PATTERNS))
    })
  })
})

describe('프리셋 저장 — Page 가 든 노드', () => {
  async function fixture(ctx: TestContext) {
    const owner = await signup(ctx)
    const project = await createProject(ctx, owner.cookie)
    return { owner, project }
  }

  function post(ctx: TestContext, fx: Awaited<ReturnType<typeof fixture>>, schema: WbNode[]) {
    return ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${fx.project.id}/presets`,
      cookies: fx.owner.cookie,
      payload: { name: '프리셋', schema },
    })
  }

  async function presetRows(ctx: TestContext, projectId: string) {
    return ctx.db.selectFrom('presets').select('id').where('project_id', '=', projectId).execute()
  }

  it('맨 위 Page 는 422 nested-page — 적용하면 뿌리의 자식이 된다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, [
        { id: 'n_presettext1', type: 'Text', props: { content: '앞' } },
        { id: 'n_presetpage1', type: 'Page', children: [] },
      ])
      expect(res.statusCode, res.body).toBe(422)
      expect(issuesOf(res.body).map((issue) => [issue.code, issue.nodeId, issue.path])).toEqual([
        ['nested-page', 'n_presetpage1', '/schema/1'],
      ])
      // 웹 «프리셋으로 저장» 이 이 문장을 그대로 보인다(`apps/web/test/panels/structure-preset.test.tsx` 의 «옛 문서 …에서 저장하면»).
      expect(issuesOf(res.body)[0]!.message).toBe(
        '프리셋에 Page를 담을 수 없습니다 — 적용하면 페이지 안의 Page가 됩니다. 이 페이지 안의 Page를 지우거나 그 안의 노드를 밖으로 옮긴 뒤 저장하세요',
      )
      expect(await presetRows(ctx, fx.project.id)).toEqual([])
    })
  })

  it('깊은 Page 도 422 — 그 노드의 id · 자리', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, [{ id: 'n_presetsect1', type: 'Section', children: [{ id: 'n_presetpage2', type: 'Page' }] }])
      expect(res.statusCode, res.body).toBe(422)
      expect(issuesOf(res.body).map((issue) => [issue.code, issue.nodeId, issue.path])).toEqual([
        ['nested-page', 'n_presetpage2', '/schema/0/children/0'],
      ])
      expect(await presetRows(ctx, fx.project.id)).toEqual([])
    })
  })

  it('Page 가 없으면 받는다 — 카탈로그 위반(알 수 없는 타입)도 지금처럼 받는다(대조군)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, [
        { id: 'n_presettext2', type: 'Text', props: { content: '글' } },
        { id: 'n_presetodd01', type: '없는타입' },
      ])
      expect(res.statusCode, res.body).toBe(201)
    })
  })

  it('이미 저장된 Page 프리셋은 목록에 오고 지울 수 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const old = await insertPreset(ctx.db, {
        projectId: fx.project.id,
        name: '옛 프리셋',
        description: null,
        nodes: [{ id: 'n_oldpreset01', type: 'Page', children: [{ id: 'n_oldpreset02', type: 'Text', props: { content: '안' } }] }],
        viewStates: [],
        createdBy: fx.owner.user.id,
      })
      const listed = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.project.id}/presets`, cookies: fx.owner.cookie })
      expect(listed.statusCode).toBe(200)
      expect((listed.json() as { id: string }[]).map((preset) => preset.id)).toContain(old.id)

      const gone = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/presets/${old.id}`,
        cookies: fx.owner.cookie,
      })
      expect(gone.statusCode).toBe(204)
    })
  })
})

describe('페이지 JSON 가져오기 — 옛 문서를 내보낸 파일', () => {
  it('422 — 이슈가 그 중첩 Page 의 id · 파일 안의 자리를 짚는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
      const document: PageDocument = {
        version: 1,
        root: {
          id: 'n_oldroot0001',
          type: 'Page',
          children: [
            { id: 'n_oldtext0001', type: 'Text', props: { content: '바깥' } },
            { id: 'n_oldnested01', type: 'Page', children: [{ id: 'n_oldinside01', type: 'Text', props: { content: '안쪽' } }] },
          ],
        },
      }
      const file = toPageJson({ page: { title: '옛 페이지' }, document, comments: [] })
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages/import`,
        cookies: owner.cookie,
        payload: { menuNodeId: menu.id, file },
      })
      expect(res.statusCode, res.body).toBe(422)
      const nested = issuesOf(res.body).filter((issue) => issue.code === 'nested-page')
      expect(nested.map((issue) => [issue.nodeId, issue.path, issue.message])).toEqual([
        ['n_oldnested01', '/root/children/1', 'Page는 루트에만 둘 수 있습니다 — 페이지 안에 Page를 넣을 수 없습니다'],
      ])
    })
  })
})
