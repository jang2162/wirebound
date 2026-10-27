/**
 * **팝업 페이지의 서버 길** — 만들기의 종류(`POST …/pages` 의 `kind`) · 트리 응답의 `kind` · 내보내기 미리보기의 `kind`. 페이지의 종류는
 * 문서 뿌리 타입이다(`Popup` = 팝업) — 행에 열이 없다.
 */
import { describe, expect, it } from 'vitest'
import { installCatalog, validatePage, type PageDocument } from '@wirebound/schema'
import { createMenuNode, createProject, signup, withApi, type TestContext } from './helpers'

async function makePage(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  menuNodeId: string,
  body: Record<string, unknown>,
) {
  return ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages`, cookies: cookie, payload: { menuNodeId, ...body } })
}

describe('POST /api/projects/:projectId/pages — kind', () => {
  it('kind: popup 이면 뿌리가 Popup 이고 제목이 페이지 이름 · 바닥이 [취소][저장] — «취소» 는 «팝업 닫기» 를 든다', async () => {
    await withApi(async (ctx) => {
      installCatalog()
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })

      const res = await makePage(ctx, owner.cookie, project.id, menu.id, { title: '사용자 검색', kind: 'popup' })

      expect(res.statusCode).toBe(201)
      const schema = (res.json() as { schema: PageDocument }).schema
      expect(schema.root).toMatchObject({
        type: 'Popup',
        props: { title: '사용자 검색' },
        children: [],
        zones: {
          footer: [
            { type: 'Button', props: { label: '취소' }, interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] },
            { type: 'Button', props: { label: '저장' }, variant: 'primary' },
          ],
        },
      })
      const ids = [schema.root.id, ...(schema.root.zones?.footer ?? []).map((node) => node.id)]
      for (const id of ids) expect(id).toMatch(/^n_[0-9a-f]{12}$/)
      expect(new Set(ids).size).toBe(3)
      expect(validatePage(schema)).toEqual([])
    })
  })

  it('kind 를 빼면 화면 페이지 · 모르는 종류는 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)

      const plain = await makePage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })
      expect((plain.json() as { schema: PageDocument }).schema.root).toMatchObject({ type: 'Page', children: [] })
      const page = await makePage(ctx, owner.cookie, project.id, menu.id, { title: '상세', kind: 'page' })
      expect((page.json() as { schema: PageDocument }).schema.root.type).toBe('Page')

      const bogus = await makePage(ctx, owner.cookie, project.id, menu.id, { title: '팝', kind: 'modal' })
      expect(bogus.statusCode).toBe(400)
    })
  })
})

describe('트리 · 내보내기 미리보기의 kind', () => {
  /** 메뉴 «회원» 아래 화면 «목록» · 팝업 «검색». */
  async function twoPages(ctx: Parameters<Parameters<typeof withApi>[0]>[0]) {
    const owner = await signup(ctx)
    const project = await createProject(ctx, owner.cookie)
    const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
    await makePage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })
    await makePage(ctx, owner.cookie, project.id, menu.id, { title: '검색', kind: 'popup' })
    return { owner, project }
  }

  it('트리 응답의 페이지마다 종류를 문서 뿌리에서 읽는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await twoPages(ctx)
      const tree = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: owner.cookie })
      const pages = (tree.json() as { menu: { pages: { title: string; kind: string }[] }[] }).menu[0]!.pages
      expect(pages.map((page) => [page.title, page.kind])).toEqual([
        ['목록', 'page'],
        ['검색', 'popup'],
      ])
    })
  })

  for (const format of ['html', 'pptx'] as const) {
    it(`내보내기 미리보기(${format})의 pages[] 가 종류를 싣는다`, async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await twoPages(ctx)
        const preview = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/export/preview?format=${format}`,
          cookies: owner.cookie,
        })
        expect(preview.statusCode).toBe(200)
        expect((preview.json() as { pages: { title: string; kind: string }[] }).pages.map((page) => [page.title, page.kind])).toEqual([
          ['회원 목록', 'page'],
          ['회원 검색', 'popup'],
        ])
      })
    })
  }
})
