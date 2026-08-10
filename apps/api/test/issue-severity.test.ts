/**
 * **severity가 §7.1 게이트에서 실제로 갈리는가 (P4a-3 Task 1).**
 *
 * P4a-2가 남긴 이월의 도달 경로를 그대로 재현한다: `edit-pipeline` 6단계가
 * `validatePage(after)`로 **문서 전체**를 검증하므로, 경고 하나(`ignored-variant`)가
 * 문서 어딘가에 있으면 **그 노드와 무관한 편집까지** 거부됐다.
 *
 * 이 파일이 고정하는 것 넷:
 * 1. 경고만 있는 문서는 `PUT .../schema`를 통과한다(전에는 422였다).
 * 2. 그 문서 위의 **무관한** 편집이 `PATCH .../ops`를 통과한다 — 이월이 지목한 그 경로다.
 * 3. 통과한 응답이 경고를 **싣는다**(삼키면 severity를 만든 이유가 사라진다).
 * 4. `error`는 여전히 422이고, 그 응답의 `issues`에 **경고까지 함께** 실린다.
 */
import { describe, expect, it } from 'vitest'
import {
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

/** `pages.test.ts`의 같은 이름 픽스처와 같다 — 프로젝트·메뉴·페이지 하나씩. */
async function createProjectWithPage(ctx: TestContext, owner: SignedUpUser) {
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
  return { project, page }
}

/**
 * 경고 하나(`ignored-variant`)와 **그것과 무관한 노드 하나**를 담은 문서.
 *
 * `Text`는 `variantFrom: 'role'`이라 `node.variant`가 버려진다 — 그것이 오늘 유일한
 * 경고다(`ISSUE_SEVERITY`). 둘째 자식(`n_other`)이 편집 대상이고 첫째와 아무 관계가 없다.
 */
function docWithWarning(content = '처음') {
  return {
    version: 1,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_warned', type: 'Text', variant: 'caption', props: { role: 'h2' } },
        { id: 'n_other', type: 'Text', props: { content } },
      ],
    },
  }
}

function putSchema(ctx: TestContext, projectId: string, pageId: string, cookie: { wb_session: string }, schema: unknown) {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/pages/${pageId}/schema`,
    cookies: cookie,
    payload: { schema } as never,
  })
}

describe('경고는 편집을 막지 않는다 (P4a-2 이월)', () => {
  it('PUT .../schema — 경고만 있는 문서는 200이고 저장된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await putSchema(ctx, project.id, page.id, owner.cookie, docWithWarning())
      expect(res.statusCode).toBe(200)

      // 저장까지 갔는가 — 200만 보면 "게이트는 통과했는데 안 썼다"와 구별되지 않는다.
      const stored = await ctx.db
        .selectFrom('pages')
        .select('schema')
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()
      expect((stored.schema as { root: { children: unknown[] } }).root.children.length).toBe(2)
    })
  })

  it('PUT .../schema — 응답이 경고를 싣는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const body = (await putSchema(ctx, project.id, page.id, owner.cookie, docWithWarning())).json()
      expect(body.warnings).toHaveLength(1)
      expect(body.warnings[0]).toMatchObject({
        code: 'ignored-variant',
        severity: 'warning',
        nodeId: 'n_warned',
      })
    })
  })

  /**
   * **이월이 지목한 바로 그 경로다.** 경고를 문서에 심어 두고, 그것과 아무 관계 없는
   * 노드의 `content`만 바꾼다. 전에는 6단계가 문서 전체를 보고 이 편집을 422로 거부했다.
   */
  it('PATCH .../ops — 경고와 무관한 편집이 통과한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const put = await putSchema(ctx, project.id, page.id, owner.cookie, docWithWarning())
      expect(put.statusCode).toBe(200)
      const baseSeq = put.json().headSeq

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}/ops`,
        cookies: owner.cookie,
        payload: {
          baseSeq,
          ops: [{ op: 'replace', path: '/root/children/1/props/content', value: '바꿈' }],
        },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().seq).toBe(baseSeq + 1)
      // 경고는 편집 뒤에도 문서에 그대로 있으므로 응답에도 그대로 실린다.
      expect(res.json().warnings).toHaveLength(1)
      expect(res.json().warnings[0].code).toBe('ignored-variant')

      const stored = await ctx.db
        .selectFrom('pages')
        .select('schema')
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()
      const children = (stored.schema as { root: { children: { props?: { content?: string } }[] } }).root.children
      expect(children[1]!.props!.content).toBe('바꿈')
    })
  })

  it('경고가 없으면 warnings 키가 아예 없다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const put = await putSchema(ctx, project.id, page.id, owner.cookie, {
        version: 1,
        root: { id: 'n_root', type: 'Page', children: [{ id: 'n_other', type: 'Text', props: { content: '가' } }] },
      })
      expect(put.statusCode).toBe(200)
      expect(Object.keys(put.json())).not.toContain('warnings')

      const patch = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}/ops`,
        cookies: owner.cookie,
        payload: {
          baseSeq: put.json().headSeq,
          ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '나' }],
        },
      })
      expect(patch.statusCode).toBe(200)
      expect(Object.keys(patch.json())).not.toContain('warnings')
    })
  })

  describe('오류는 그대로 막는다', () => {
    it('PUT .../schema — error가 하나라도 있으면 422다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, {
          version: 1,
          root: {
            id: 'n_root',
            type: 'Page',
            children: [
              { id: 'n_warned', type: 'Text', variant: 'caption', props: { role: 'h2' } },
              { id: 'n_bad', type: 'Bogus' },
            ],
          },
        })

        expect(res.statusCode).toBe(422)
        // 거부할 때도 경고를 함께 싣는다 — 빼면 사용자가 한 번에 고칠 것을 두 번에 나눠 본다.
        const issues: { code: string; severity: string }[] = res.json().error.issues
        expect(issues.map((issue) => issue.code).sort()).toEqual(['ignored-variant', 'unknown-type'])
        expect(issues.find((issue) => issue.code === 'ignored-variant')!.severity).toBe('warning')
        expect(issues.find((issue) => issue.code === 'unknown-type')!.severity).toBe('error')
      })
    })

    it('PATCH .../ops — error를 만드는 편집은 422이고 문서가 그대로다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const put = await putSchema(ctx, project.id, page.id, owner.cookie, docWithWarning())
        const baseSeq = put.json().headSeq

        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${project.id}/pages/${page.id}/ops`,
          cookies: owner.cookie,
          // content는 문자열이어야 한다 — 숫자를 넣으면 invalid-props(error)다.
          payload: { baseSeq, ops: [{ op: 'replace', path: '/root/children/1/props/content', value: 123 }] },
        })

        expect(res.statusCode).toBe(422)
        const stored = await ctx.db
          .selectFrom('pages')
          .select('schema')
          .where('id', '=', page.id)
          .executeTakeFirstOrThrow()
        const children = (stored.schema as { root: { children: { props?: { content?: string } }[] } }).root.children
        expect(children[1]!.props!.content).toBe('처음')
      })
    })
  })
})
