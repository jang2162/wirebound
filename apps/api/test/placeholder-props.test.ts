/**
 * **자리표시자의 그리기 값은 꼴이 좁다** — 색은 소문자 `#rrggbb` 또는 빈 값(`@wirebound/schema` 의 `PLACEHOLDER_COLOR`). 뷰가 값을 인라인 변수로
 * 싣기 때문에 자유 글자를 받으면 `url(…)` 이 캔버스 · 번들에서 바깥 요청을 내고 `;` · `}` 로 꾸밈을 넘긴다. 서버의 두 쓰기 입구(문서 통째 `PUT` ·
 * 편집 `PATCH …/ops`)가 다 422 로 거절하는지 잰다. 다른 컴포넌트는 그리기 값을 안 받는다(봉투가 거절 — 정본 「페이지 스키마 노드」).
 */
import { describe, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION } from '@wirebound/schema'
import { createMenuNode, createPage, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'

const BAD_COLORS = ['url(https://example.com/x.png)', '#2563eb;color:red', '#2563eb}', 'var(--wb-x)', '#2563EB', 'red', '#fff']

async function fixture(ctx: TestContext): Promise<{ owner: SignedUpUser; projectId: string; pageId: string }> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
  return { owner, projectId: project.id, pageId: page.id }
}

function docWith(props: Record<string, unknown>, type = 'Placeholder') {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    layout: 'blank',
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_ph', type, props }] },
  }
}

describe('자리표시자 그리기 값 — 서버가 꼴 밖을 거절한다', () => {
  it('PUT …/schema — 꼴 밖의 색은 422 invalid-props · 소문자 #rrggbb 와 빈 값은 200', async () => {
    await withApi(async (ctx) => {
      const { owner, projectId, pageId } = await fixture(ctx)
      const put = (schema: unknown) =>
        ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${projectId}/pages/${pageId}/schema`,
          cookies: owner.cookie,
          payload: { schema } as never,
        })
      for (const prop of ['background', 'borderColor', 'color']) {
        for (const bad of BAD_COLORS) {
          const res = await put(docWith({ [prop]: bad }))
          expect(res.statusCode, `${prop}=${bad}`).toBe(422)
          expect(res.json().error.issues[0].code, `${prop}=${bad}`).toBe('invalid-props')
        }
      }
      expect((await put(docWith({ background: '#2563eb', borderColor: '', color: '#ffffff', radius: 999, padding: 4 }))).statusCode).toBe(
        200,
      )
      // 다른 컴포넌트는 그리기 값을 모른다 — 모르는 prop 이라 거절한다.
      const other = await put(docWith({ content: '글', background: '#2563eb' }, 'Text'))
      expect(other.statusCode).toBe(422)
      expect(other.json().error.issues[0].code).toBe('invalid-props')
    })
  })

  it('PATCH …/ops — 꼴 밖의 색을 넣는 편집은 422 · 문서는 그대로다', async () => {
    await withApi(async (ctx) => {
      const { owner, projectId, pageId } = await fixture(ctx)
      const put = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${projectId}/pages/${pageId}/schema`,
        cookies: owner.cookie,
        payload: { schema: docWith({ label: '칩' }) } as never,
      })
      expect(put.statusCode).toBe(200)
      const page = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/pages/${pageId}`, cookies: owner.cookie })
      const baseSeq = page.json().headSeq as number
      for (const bad of BAD_COLORS) {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${projectId}/pages/${pageId}/ops`,
          cookies: owner.cookie,
          payload: { baseSeq, ops: [{ op: 'add', path: '/root/children/0/props/background', value: bad }] },
        })
        expect(res.statusCode, bad).toBe(422)
      }
      const after = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/pages/${pageId}`, cookies: owner.cookie })
      expect(after.json().schema.root.children[0].props).toEqual({ label: '칩' })
      expect(after.json().headSeq).toBe(baseSeq)
    })
  })
})
