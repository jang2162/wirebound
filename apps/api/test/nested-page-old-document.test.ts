/**
 * **`nested-page` 규칙을 들이기 전에 저장된 문서** — 뿌리 밖에 `Page` 가 선 페이지(`packages/schema` 의 `validate.ts` ·
 * `excuseStandingNestedPages`). 그 문서를 열고 · 그 중첩과 무관한 편집을 하고 · 통째로 다시 올리고 · 내보내고 · 복원하는 길이 막히지 않고,
 * **새로 넣는 중첩만** 같은 입구에서 422 로 막히는지 잰다.
 *
 * 옛 문서는 SQL 로 심는다 — 지금의 입구로는 그 문서를 만들 수 없다(그것이 이 규칙이다).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { CURRENT_DOCUMENT_VERSION, type PageDocument, type WbNode } from '@wirebound/schema'
import { ensureCatalog } from '../src/schema-setup'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

beforeEach(() => {
  ensureCatalog()
})

const OLD_PAGE: WbNode = {
  id: 'n_oldnested01',
  type: 'Page',
  children: [{ id: 'n_oldinside01', type: 'Text', props: { content: '안쪽' } }],
}

function oldDocument(rootId: string): PageDocument {
  return {
    version: 5,
    root: {
      id: rootId,
      type: 'Page',
      children: [{ id: 'n_oldtext0001', type: 'Text', props: { content: '바깥' } }, OLD_PAGE],
    },
  }
}

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '옛 페이지' })
  const rootId = (page.schema as { root: { id: string } }).root.id
  await ctx.db
    .updateTable('pages')
    .set({ schema: JSON.stringify(oldDocument(rootId)) })
    .where('id', '=', page.id)
    .execute()
  return { owner, project, page, rootId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function openPage(ctx: TestContext, fx: Fixture) {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`, cookies: fx.owner.cookie })
  return { status: res.statusCode, body: res.json() as { headSeq: number; schema: PageDocument } }
}

async function patchOps(ctx: TestContext, fx: Fixture, ops: unknown[]) {
  const { body } = await openPage(ctx, fx)
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
    cookies: fx.owner.cookie,
    payload: { baseSeq: body.headSeq, ops },
  })
}

async function putSchema(ctx: TestContext, fx: Fixture, schema: PageDocument) {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/schema`,
    cookies: fx.owner.cookie,
    payload: { schema },
  })
}

const codes = (body: string) => (JSON.parse(body) as { error: { issues?: { code: string; nodeId: string | null }[] } }).error.issues ?? []

describe('옛 문서 — 이미 저장된 중첩 Page', () => {
  it('연다 — 문서가 그대로 온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const { status, body } = await openPage(ctx, fx)
      expect(status).toBe(200)
      expect(body.schema.root.children?.[1]).toEqual(OLD_PAGE)
    })
  })

  it('그 중첩과 무관한 편집이 된다 — 다른 노드의 글자 · 앞에 형제 넣기(옛 Page 의 경로가 밀린다)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const text = await patchOps(ctx, fx, [{ op: 'replace', path: '/root/children/0/props', value: { content: '바뀐 바깥' } }])
      expect(text.statusCode, text.body).toBe(200)
      const sibling = await patchOps(ctx, fx, [
        { op: 'add', path: '/root/children/0', value: { id: 'n_newsect0001', type: 'Section', props: {} } },
      ])
      expect(sibling.statusCode, sibling.body).toBe(200)
      // 옛 Page 안을 고치는 편집도 그 Page 를 새로 넣는 것이 아니다.
      const inside = await patchOps(ctx, fx, [
        { op: 'replace', path: '/root/children/2/children/0/props', value: { content: '바뀐 안쪽' } },
      ])
      expect(inside.statusCode, inside.body).toBe(200)
    })
  })

  it('새 중첩 Page 를 넣는 편집은 422 nested-page — 옛 것 곁이어도', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, [{ op: 'add', path: '/root/children/0', value: { id: 'n_newpage0001', type: 'Page' } }])
      expect(res.statusCode).toBe(422)
      expect(codes(res.body)).toContainEqual(expect.objectContaining({ code: 'nested-page', nodeId: 'n_newpage0001' }))
      expect(codes(res.body).filter((issue) => issue.code === 'nested-page')).toHaveLength(1)
    })
  })

  it('PUT 으로 옛 문서를 다시 올리면 된다 · 새 중첩을 실으면 422', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const same = oldDocument(fx.rootId)
      same.root.children![0] = { id: 'n_oldtext0001', type: 'Text', props: { content: 'PUT 으로 바꿈' } }
      const kept = await putSchema(ctx, fx, same)
      expect(kept.statusCode, kept.body).toBe(200)

      const grown = oldDocument(fx.rootId)
      grown.root.children!.push({ id: 'n_newpage0002', type: 'Page' })
      const refused = await putSchema(ctx, fx, grown)
      expect(refused.statusCode).toBe(422)
      expect(codes(refused.body)).toContainEqual(expect.objectContaining({ code: 'nested-page', nodeId: 'n_newpage0002' }))
    })
  })

  it('내보낸다 — 미리보기 · zip 이 그 페이지를 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const preview = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/export/preview`,
        cookies: fx.owner.cookie,
      })
      expect(preview.statusCode, preview.body).toBe(200)
      expect((preview.json() as { errors: unknown[] }).errors).toEqual([])

      const zip = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.project.id}/export`, cookies: fx.owner.cookie })
      expect(zip.statusCode).toBe(200)
      const html = Object.entries(unzipSync(new Uint8Array(zip.rawPayload)))
        .filter(([name]) => name.endsWith('.html'))
        .map(([, bytes]) => strFromU8(bytes))
      expect(html.some((text) => text.includes('n_oldnested01'))).toBe(true)
    })
  })

  it('복원한다 — 지운 페이지를 되살리기(create) · 고친 페이지를 되돌리기(rewrite)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const taken = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: '옛 문서' },
      })
      expect(taken.statusCode, taken.body).toBe(201)
      const snapshotId = (taken.json() as { id: string }).id
      const restore = () =>
        ctx.app.inject({ method: 'POST', url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`, cookies: fx.owner.cookie })

      // rewrite — 페이지는 살아 있고 문서만 바뀌었다.
      const edited = await patchOps(ctx, fx, [{ op: 'remove', path: '/root/children/0' }])
      expect(edited.statusCode, edited.body).toBe(200)
      const rewritten = await restore()
      expect(rewritten.statusCode, rewritten.body).toBe(200)
      // 복원은 옛 판 문서를 지금 판으로 옮겨 쓴다(`services/restore.ts` 의 `currentVersionPages`) — 중첩 Page 는 그대로다.
      expect((await openPage(ctx, fx)).body.schema).toEqual({
        ...oldDocument(fx.rootId),
        version: CURRENT_DOCUMENT_VERSION,
        layout: 'blank',
      })

      // create — 페이지를 지운 뒤 되살린다.
      const gone = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
      })
      expect(gone.statusCode).toBe(204)
      const created = await restore()
      expect(created.statusCode, created.body).toBe(200)
      expect((created.json() as { summary: { pages: { created: number } } }).summary.pages.created).toBe(1)
      // 복원은 옛 판 문서를 지금 판으로 옮겨 쓴다(`services/restore.ts` 의 `currentVersionPages`) — 중첩 Page 는 그대로다.
      expect((await openPage(ctx, fx)).body.schema).toEqual({
        ...oldDocument(fx.rootId),
        version: CURRENT_DOCUMENT_VERSION,
        layout: 'blank',
      })

      // 되살린 뒤의 무관한 편집도 된다.
      const after = await patchOps(ctx, fx, [{ op: 'replace', path: '/root/children/0/props', value: { content: '되살린 뒤' } }])
      expect(after.statusCode, after.body).toBe(200)
    })
  })
})
