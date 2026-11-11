/**
 * 페이지 JSON 가져오기와 코멘트 토큰(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` «들이는 입구»). 봉투(`PageJsonPage`)에는 옛 페이지
 * id 가 없어 «가져온 페이지 안을 가리키던 토큰» 을 가를 수 없다 — 본문을 글자 그대로 들인다. 같은 프로젝트의 산 페이지를 가리키던 토큰은 그대로
 * 이어지고(번호 색인이 그 노드를 낸다), 다른 프로젝트의 것은 받는 쪽에서 끊김이다.
 */
import { describe, expect, it } from 'vitest'
import { WIREBOUND_PAGE_VERSION, type PageJson } from '@wirebound/schema'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

describe('페이지 JSON 가져오기 — 코멘트 토큰', () => {
  it('본문을 글자 그대로 들이고, 같은 프로젝트의 산 페이지를 가리키던 토큰은 색인으로 이어진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
      const live = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '산 페이지' })
      const liveRoot = (live.schema as { root: { id: string } }).root.id
      const foreign = '99999999-9999-4999-8999-999999999999'
      const body = `[옛](wb:comment/${live.id}/${liveRoot}) · [남](wb:page/${foreign}) · [옛 노드](wb:comment/${foreign}/file_list)`
      const file: PageJson = {
        wireboundVersion: WIREBOUND_PAGE_VERSION,
        page: { title: '가져온 페이지' },
        schema: { version: 5, root: { id: 'file_root', type: 'Page', children: [{ id: 'file_list', type: 'DataGrid', marker: 1 }] } },
        comments: [{ nodeId: 'file_list', body }],
      }
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages/import`,
        cookies: owner.cookie,
        payload: { menuNodeId: menu.id, file } as never,
      })
      expect(res.statusCode, res.body).toBe(201)
      const pageId = (res.json() as { page: { id: string } }).page.id

      const comments = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${pageId}/comments`,
        cookies: owner.cookie,
      })
      expect((comments.json() as { body: string }[]).map((c) => c.body)).toEqual([body])

      const index = (
        await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/comments/index`, cookies: owner.cookie })
      ).json() as {
        markers: { pageId: string; nodeId: string }[]
      }
      const keys = index.markers.map((m) => `${m.pageId}/${m.nodeId}`)
      expect(keys).toContain(`${live.id}/${liveRoot}`)
      expect(keys.some((key) => key.startsWith(foreign))).toBe(false)
    })
  })
})
