/**
 * `GET /api/projects/:projectId/comments/index` — 코멘트 토큰을 푸는 프로젝트 전체의 번호 색인(설계 «풀 자료»).
 * 재번호 뒤의 새 번호(Review Focus 1) · 남의 프로젝트 페이지가 안 섞임(Review Focus 2) · 번호가 걷힌 노드가 토큰이 가리키면 남음(Review Focus 5).
 */
import { describe, expect, it } from 'vitest'
import { formatCommentToken, type PageDocument } from '@wirebound/schema'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

function doc(): PageDocument {
  return {
    version: 5,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Text', props: { content: '가' } },
        { id: 'n_b', type: 'Button', props: { label: '저장' } },
        { id: 'n_c', type: 'Text', props: { content: '다' } },
      ],
    },
  }
}

async function setup(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
  const list = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '회원 목록' })
  const detail = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '회원 상세' })
  for (const page of [list, detail]) {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/pages/${page.id}/schema`,
      cookies: owner.cookie,
      payload: { schema: doc() },
    })
    expect(res.statusCode, res.body).toBe(200)
  }
  return { owner, project, menu, list, detail }
}

async function comment(ctx: TestContext, cookie: { wb_session: string }, projectId: string, pageId: string, nodeId: string, body: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/pages/${pageId}/comments`,
    cookies: cookie,
    payload: { nodeId, body },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { comment: { id: string } }).comment
}

async function index(ctx: TestContext, cookie: { wb_session: string }, projectId: string) {
  return ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/comments/index`, cookies: cookie })
}

describe('GET .../comments/index', () => {
  it('페이지 둘의 코멘트 달린 노드를 낸다 — 번호 · 노드 이름 · 가장 이른 코멘트 앞 40 자', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const long = '가'.repeat(50)
      await comment(ctx, fx.owner.cookie, fx.project.id, fx.list.id, 'n_b', long)
      await comment(ctx, fx.owner.cookie, fx.project.id, fx.list.id, 'n_b', '둘째')
      await comment(ctx, fx.owner.cookie, fx.project.id, fx.detail.id, 'n_a', '상세 첫')

      const res = await index(ctx, fx.owner.cookie, fx.project.id)
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json()
      expect(body.pages).toEqual(
        expect.arrayContaining([
          { id: fx.list.id, title: '회원 목록', menuPath: '회원' },
          { id: fx.detail.id, title: '회원 상세', menuPath: '회원' },
        ]),
      )
      expect(body.pages).toHaveLength(2)
      const key = (m: { pageId: string; nodeId: string }) => `${m.pageId}/${m.nodeId}`
      expect([...body.markers].sort((x, y) => key(x).localeCompare(key(y)))).toEqual(
        [
          { pageId: fx.list.id, nodeId: 'n_b', marker: 1, nodeName: expect.stringContaining('저장'), firstComment: '가'.repeat(40) },
          { pageId: fx.detail.id, nodeId: 'n_a', marker: 1, nodeName: expect.any(String), firstComment: '상세 첫' },
        ].sort((x, y) => key(x).localeCompare(key(y))),
      )
    })
  })

  it('첫 코멘트 앞머리는 토큰을 푼 글이다 — 토큰 원문 · 날 id 가 안 보인다(RV-TK L3)', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const page = formatCommentToken('옛', { kind: 'page', pageId: fx.detail.id })
      const gone = formatCommentToken('사라진 쪽', { kind: 'page', pageId: '99999999-9999-4999-8999-999999999999' })
      await comment(ctx, fx.owner.cookie, fx.project.id, fx.list.id, 'n_a', `저기 ${page} 와 ${gone} 보세요`)

      const body = (await index(ctx, fx.owner.cookie, fx.project.id)).json()
      const first = body.markers.find((m: { nodeId: string; pageId: string }) => m.pageId === fx.list.id && m.nodeId === 'n_a').firstComment
      expect(first).toBe('저기 회원 상세 와 사라진 쪽 (찾을 수 없음) 보세요')
    })
  })

  it('재번호 뒤에는 새 번호다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await comment(ctx, fx.owner.cookie, fx.project.id, fx.list.id, 'n_c', 'c')
      await comment(ctx, fx.owner.cookie, fx.project.id, fx.list.id, 'n_a', 'a')
      const before = (await index(ctx, fx.owner.cookie, fx.project.id)).json()
      expect(before.markers.find((m: { nodeId: string }) => m.nodeId === 'n_c').marker).toBe(1)

      const renumber = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/pages/${fx.list.id}/comments/renumber`,
        cookies: fx.owner.cookie,
      })
      expect(renumber.statusCode, renumber.body).toBe(200)

      const after = (await index(ctx, fx.owner.cookie, fx.project.id)).json()
      const byNode = Object.fromEntries(after.markers.map((m: { nodeId: string; marker: number }) => [m.nodeId, m.marker]))
      expect(byNode).toEqual({ n_a: 1, n_c: 2 })
    })
  })

  it('코멘트가 다 지워져 번호가 걷힌 노드도 토큰이 가리키면 남는다 — 번호 null', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const gone = await comment(ctx, fx.owner.cookie, fx.project.id, fx.list.id, 'n_b', '곧 지움')
      await comment(
        ctx,
        fx.owner.cookie,
        fx.project.id,
        fx.detail.id,
        'n_a',
        `보세요 ${formatCommentToken('#1', { kind: 'comment', pageId: fx.list.id, nodeId: 'n_b' })}`,
      )
      const del = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.list.id}/comments/${gone.id}`,
        cookies: fx.owner.cookie,
      })
      expect(del.statusCode, del.body).toBe(200)

      const body = (await index(ctx, fx.owner.cookie, fx.project.id)).json()
      expect(body.markers.find((m: { pageId: string; nodeId: string }) => m.pageId === fx.list.id && m.nodeId === 'n_b')).toEqual({
        pageId: fx.list.id,
        nodeId: 'n_b',
        marker: null,
        nodeName: expect.stringContaining('저장'),
        firstComment: '',
      })
    })
  })

  it('다른 프로젝트의 페이지 · 노드는 없다 — 토큰이 그 id 를 들어도', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const other = await createProject(ctx, fx.owner.cookie)
      const otherMenu = await createMenuNode(ctx, fx.owner.cookie, other.id, { title: '남' })
      const otherPage = await createPage(ctx, fx.owner.cookie, other.id, otherMenu.id, { title: '남의 비밀 페이지' })
      await comment(ctx, fx.owner.cookie, other.id, otherPage.id, (otherPage.schema as { root: { id: string } }).root.id, '남의 것')
      await comment(
        ctx,
        fx.owner.cookie,
        fx.project.id,
        fx.list.id,
        'n_a',
        formatCommentToken('x', { kind: 'comment', pageId: otherPage.id, nodeId: (otherPage.schema as { root: { id: string } }).root.id }),
      )

      const res = await index(ctx, fx.owner.cookie, fx.project.id)
      expect(res.body).not.toContain(otherPage.id)
      expect(res.body).not.toContain('남의 비밀 페이지')
      expect(res.json().pages).toHaveLength(2)
    })
  })

  it('비멤버 404 · viewer 200', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const viewer = await signup(ctx)
      const stranger = await signup(ctx)
      await addMember(ctx, fx.project.id, viewer.user.id, 'viewer')
      expect((await index(ctx, viewer.cookie, fx.project.id)).statusCode).toBe(200)
      expect((await index(ctx, stranger.cookie, fx.project.id)).statusCode).toBe(404)
    })
  })
})
