/**
 * **새로 들이는 입구는 중첩 `Page` 를 막고, 이미 저장된 것을 다시 읽는 길은 안 막는다**(`packages/schema` 의 `validate.ts` ·
 * `nested-page`). 이 파일이 재는 입구 둘:
 *
 * | 입구 · 길 | 새것 | 이미 저장된 것 |
 * |---|---|---|
 * | 모듈 저장 `POST …/modules` | `Page` 가 든 모듈(맨 위 포함)은 422 · 행 0 | 목록 200 · 이름 200 · 삭제 204 |
 * | 페이지 JSON 가져오기 `POST …/pages/import` | 옛 문서를 내보낸 파일은 422 — 이슈가 그 노드의 id · 경로를 짚는다 | — |
 *
 * 옛 모듈은 저장소 함수로 심는다 — 지금의 입구로는 만들 수 없다(그것이 이 규칙이다).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toPageJson, type PageDocument, type WbNode } from '@wirebound/schema'
import { insertModule } from '../src/repos/modules'
import { ensureCatalog } from '../src/schema-setup'
import { createMenuNode, createProject, signup, withApi, type TestContext } from './helpers'

beforeEach(() => {
  ensureCatalog()
})

type Issue = { code: string; path: string; message: string; nodeId?: string | null }
const issuesOf = (body: string) => (JSON.parse(body) as { error: { issues?: Issue[] } }).error.issues ?? []

describe('모듈 저장 — Page 가 든 노드', () => {
  async function fixture(ctx: TestContext) {
    const owner = await signup(ctx)
    const project = await createProject(ctx, owner.cookie)
    return { owner, project }
  }

  function post(ctx: TestContext, fx: Awaited<ReturnType<typeof fixture>>, nodes: WbNode[]) {
    return ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${fx.project.id}/modules`,
      cookies: fx.owner.cookie,
      payload: { name: '모듈', nodes },
    })
  }

  async function moduleRows(ctx: TestContext, projectId: string) {
    return ctx.db.selectFrom('modules').select('id').where('project_id', '=', projectId).execute()
  }

  it('맨 위 Page 는 422 nested-page — 넣으면 페이지 안의 Page 가 된다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, [
        { id: 'n_moduletext1', type: 'Text', props: { content: '앞' } },
        { id: 'n_modulepage1', type: 'Page', children: [] },
      ])
      expect(res.statusCode, res.body).toBe(422)
      expect(issuesOf(res.body).map((issue) => [issue.code, issue.nodeId, issue.path])).toEqual([
        ['nested-page', 'n_modulepage1', '/nodes/1'],
      ])
      // 웹 «모듈로 저장…» 상자가 이 문장을 그대로 보인다(`apps/web/test/panels/save-module.test.tsx` 의 «서버가 거절하면»).
      expect(issuesOf(res.body)[0]!.message).toBe(
        '모듈에 Page를 담을 수 없습니다 — 넣으면 페이지 안의 Page가 됩니다. Page를 빼고 고른 뒤 저장하세요',
      )
      expect(await moduleRows(ctx, fx.project.id)).toEqual([])
    })
  })

  it('깊은 Page 도 422 — 그 노드의 id · 자리', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, [{ id: 'n_modulesect1', type: 'Section', children: [{ id: 'n_modulepage2', type: 'Page' }] }])
      expect(res.statusCode, res.body).toBe(422)
      expect(issuesOf(res.body).map((issue) => [issue.code, issue.nodeId, issue.path])).toEqual([
        ['nested-page', 'n_modulepage2', '/nodes/0/children/0'],
      ])
      expect(await moduleRows(ctx, fx.project.id)).toEqual([])
    })
  })

  it('Page 가 없으면 받는다 — 카탈로그 위반(알 수 없는 타입)도 받는다(대조군 · 넣을 때 결과 문서로 본다)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, [
        { id: 'n_moduletext2', type: 'Text', props: { content: '글' } },
        { id: 'n_moduleodd01', type: '없는타입' },
      ])
      expect(res.statusCode, res.body).toBe(201)
    })
  })

  it('이미 저장된 Page 모듈(옮긴 옛 프리셋)은 목록에 오고 이름을 바꾸고 지울 수 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const old = await insertModule(ctx.db, {
        projectId: fx.project.id,
        name: '옛 모듈',
        nodes: [{ id: 'n_oldmodule01', type: 'Page', children: [{ id: 'n_oldmodule02', type: 'Text', props: { content: '안' } }] }],
        createdBy: fx.owner.user.id,
      })
      const url = `/api/projects/${fx.project.id}/modules`
      const listed = await ctx.app.inject({ method: 'GET', url, cookies: fx.owner.cookie })
      expect(listed.statusCode).toBe(200)
      expect((listed.json() as { modules: { id: string }[] }).modules.map((entry) => entry.id)).toContain(old.id)

      const renamed = await ctx.app.inject({
        method: 'PATCH',
        url: `${url}/${old.id}`,
        cookies: fx.owner.cookie,
        payload: { name: '새 이름' },
      })
      expect(renamed.statusCode, renamed.body).toBe(200)
      const gone = await ctx.app.inject({ method: 'DELETE', url: `${url}/${old.id}`, cookies: fx.owner.cookie })
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
        version: 4,
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
