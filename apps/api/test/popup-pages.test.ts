/**
 * **페이지 레이아웃 · 팝업 페이지의 서버 길** — 만들기의 레이아웃 · 종류(`POST …/pages` 의 `layout` · `kind`) · 트리 응답의 `layout` · `kind` ·
 * 내보내기 미리보기의 `kind`. 레이아웃은 문서의 필드다(`schema.layout`) — 행에 열이 없다.
 *
 * **트리 응답이 뿌리 타입을 읽게 되돌린 변조는 응답 값으로는 산다** — 저장된 문서는 레이아웃과 뿌리가 짝이라 같은 `kind` 가 나온다. 그 축은
 * `packages/schema/test/page-layout-census.test.ts`(뿌리 타입을 판정으로 읽는 자리를 센다)가 소유한다. `layout` 칸의 `subpage` 는 뿌리로 못 짓는
 * 값이라 아래 케이스가 잡는다.
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

describe('POST /api/projects/:projectId/pages — layout', () => {
  const layoutOf = (res: { json: () => unknown }) => {
    const schema = (res.json() as { schema: PageDocument }).schema
    return [schema.layout, schema.root.type]
  }

  it('layout 이 없으면 blank · kind: popup 이면 popup · layout: subpage 는 뿌리 Page · 셋 다 검증을 지난다', async () => {
    await withApi(async (ctx) => {
      installCatalog()
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const made = [
        await makePage(ctx, owner.cookie, project.id, menu.id, { title: '빈' }),
        await makePage(ctx, owner.cookie, project.id, menu.id, { title: '팝', kind: 'popup' }),
        await makePage(ctx, owner.cookie, project.id, menu.id, { title: '서브', layout: 'subpage' }),
        await makePage(ctx, owner.cookie, project.id, menu.id, { title: '팝2', layout: 'popup', kind: 'popup' }),
      ]
      expect(made.map((res) => res.statusCode)).toEqual([201, 201, 201, 201])
      expect(made.map(layoutOf)).toEqual([
        ['blank', 'Page'],
        ['popup', 'Popup'],
        ['subpage', 'Page'],
        ['popup', 'Popup'],
      ])
      for (const res of made) expect(validatePage((res.json() as { schema: PageDocument }).schema)).toEqual([])
    })
  })

  it('kind 와 layout 이 어긋나면 400 · 모르는 레이아웃도 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const codes = [
        (await makePage(ctx, owner.cookie, project.id, menu.id, { title: 'a', kind: 'popup', layout: 'subpage' })).statusCode,
        (await makePage(ctx, owner.cookie, project.id, menu.id, { title: 'b', kind: 'page', layout: 'popup' })).statusCode,
        (await makePage(ctx, owner.cookie, project.id, menu.id, { title: 'c', layout: 'modal' })).statusCode,
        // 대조 — 짝이 맞으면 받는다.
        (await makePage(ctx, owner.cookie, project.id, menu.id, { title: 'd', kind: 'page', layout: 'subpage' })).statusCode,
      ]
      expect(codes).toEqual([400, 400, 400, 201])
    })
  })
})

describe('PATCH …/ops — /layout 편집', () => {
  it('빈 → 서브페이지는 /layout 하나 · 짝이 어긋나는 바꿈(뿌리 Page 에 popup)은 422 layout-root-mismatch', async () => {
    await withApi(async (ctx) => {
      installCatalog()
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const made = (await makePage(ctx, owner.cookie, project.id, menu.id, { title: '빈' })).json() as { id: string; headSeq: number }
      const patch = (baseSeq: number, ops: unknown[]) =>
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${project.id}/pages/${made.id}/ops`,
          cookies: owner.cookie,
          payload: { baseSeq, ops },
        })
      const ok = await patch(made.headSeq, [
        { op: 'test', path: '/layout', value: 'blank' },
        { op: 'replace', path: '/layout', value: 'subpage' },
      ])
      expect(ok.statusCode, ok.body).toBe(200)
      const bad = await patch((ok.json() as { seq: number }).seq, [{ op: 'replace', path: '/layout', value: 'popup' }])
      expect(bad.statusCode).toBe(422)
      expect(bad.body).toContain('layout-root-mismatch')
      const read = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/pages/${made.id}`, cookies: owner.cookie })
      expect((read.json() as { schema: PageDocument }).schema.layout).toBe('subpage')
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

  it('트리 응답의 페이지마다 레이아웃과 그것에서 지은 종류를 싣는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await twoPages(ctx)
      const menuId = (
        (await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: owner.cookie })).json() as {
          menu: { id: string }[]
        }
      ).menu[0]!.id
      await makePage(ctx, owner.cookie, project.id, menuId, { title: '상세', layout: 'subpage' })
      const tree = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: owner.cookie })
      const pages = (tree.json() as { menu: { pages: { title: string; layout: string; kind: string }[] }[] }).menu[0]!.pages
      expect(pages.map((page) => [page.title, page.layout, page.kind])).toEqual([
        ['목록', 'blank', 'page'],
        ['검색', 'popup', 'popup'],
        ['상세', 'subpage', 'page'],
      ])
    })
  })

  it('트리 응답의 페이지마다 종류를 싣는다', async () => {
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
