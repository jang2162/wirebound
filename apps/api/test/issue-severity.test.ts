/**
 * **severity가 설계서 「정방향 흐름」의 게이트에서 실제로 갈리는가.**
 *
 * `edit-pipeline` 6단계가 `validatePage(after)`로 **문서 전체**를 검증하므로, 경고를
 * `error`처럼 막으면 경고 하나(`ignored-variant`)가 문서 어딘가에 있을 때 **그 노드와
 * 무관한 편집까지** 거부된다. 그 도달 경로를 그대로 재현한다.
 *
 * 이 파일이 고정하는 것 넷:
 * 1. 경고만 있는 문서는 `PUT .../schema`를 통과한다(422가 아니다).
 * 2. 그 문서 위의 **무관한** 편집이 `PATCH .../ops`를 통과한다 — 위 도달 경로 그 자체다.
 * 3. 통과한 응답이 경고를 **싣는다**(삼키면 severity를 만든 이유가 사라진다).
 * 4. `error`는 여전히 422이고, 그 응답의 `issues`에 **경고까지 함께** 실린다.
 */
import { describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'

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
 * `Text`는 `variantFrom: 'role'`이라 `node.variant`가 버려진다 — 그것이 `warning`인
 * `ignored-variant`다(`ISSUE_SEVERITY`). 둘째 자식(`n_other`)이 편집 대상이고 첫째와 아무 관계가 없다.
 */
function docWithWarning(content = '처음') {
  return {
    version: 3,
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

describe('경고는 편집을 막지 않는다', () => {
  it('PUT .../schema — 경고만 있는 문서는 200이고 저장된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await putSchema(ctx, project.id, page.id, owner.cookie, docWithWarning())
      expect(res.statusCode).toBe(200)

      // 저장까지 갔는가 — 200만 보면 "게이트는 통과했는데 안 썼다"와 구별되지 않는다.
      const stored = await ctx.db.selectFrom('pages').select('schema').where('id', '=', page.id).executeTakeFirstOrThrow()
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
   * **머리말의 도달 경로 그 자체다.** 경고를 문서에 심어 두고, 그것과 아무 관계 없는
   * 노드의 `content`만 바꾼다. 경고를 막으면 6단계가 문서 전체를 보고 이 편집을 422로 거부한다.
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

      const stored = await ctx.db.selectFrom('pages').select('schema').where('id', '=', page.id).executeTakeFirstOrThrow()
      const children = (stored.schema as { root: { children: { props?: { content?: string } }[] } }).root.children
      expect(children[1]!.props!.content).toBe('바꿈')
    })
  })

  it('경고가 없으면 warnings 키가 아예 없다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const put = await putSchema(ctx, project.id, page.id, owner.cookie, {
        version: 3,
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
          version: 3,
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
        const stored = await ctx.db.selectFrom('pages').select('schema').where('id', '=', page.id).executeTakeFirstOrThrow()
        const children = (stored.schema as { root: { children: { props?: { content?: string } }[] } }).root.children
        expect(children[1]!.props!.content).toBe('처음')
      })
    })
  })
})

/**
 * **상호작용 이슈가 `warning`인 것이 여기서 값을 갖는다.**
 *
 * 상호작용의 `target`은 **다른 노드를 가리키는 참조**라 그 노드가 사라지는 순간 이슈가
 * 된다 — 노드를 지우면 그것을 가리키는 상호작용은 다른 노드에 그대로 남고 타겟만
 * 끊긴다. 그것을 `error`로 두면 **노드를 지우는 편집 자체가 422가 되어 사용자가
 * 자기 문서를 못 고친다** — 위 `docWithWarning`이 잰 것과 같은 부류이고, 이쪽은 경고를
 * **편집이 만들어 낸다**는 점이 다르다.
 *
 * **이 파일이 그 인과를 재는 자리다.** `packages/schema`의 케이스는 `partitionIssues`의
 * 결과를 보지만, 실제로 편집을 거부하는 것은 `edit-pipeline`의 6단계다.
 */
describe('상호작용 타겟이 끊겨도 편집을 막지 않는다', () => {
  /** `n_button`이 `n_list`를 가리킨다. 둘째 자식을 지우면 그 참조가 끊긴다. */
  function docWithInteraction() {
    return {
      version: 3,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          {
            id: 'n_button',
            type: 'Button',
            props: { label: '검색' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
          },
          { id: 'n_list', type: 'List' },
        ],
      },
    }
  }

  it('타겟이 된 노드를 지우는 편집이 200이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const put = await putSchema(ctx, project.id, page.id, owner.cookie, docWithInteraction())
      expect(put.statusCode).toBe(200)
      // 타겟이 살아 있는 동안에는 경고도 없다.
      expect(Object.keys(put.json())).not.toContain('warnings')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}/ops`,
        cookies: owner.cookie,
        payload: { baseSeq: put.json().headSeq, ops: [{ op: 'remove', path: '/root/children/1' }] },
      })

      expect(res.statusCode).toBe(200)
      // **삭제가 실제로 저장됐는가** — 200만 보면 "게이트는 통과했는데 안 썼다"와 갈리지 않는다.
      const stored = await ctx.db.selectFrom('pages').select('schema').where('id', '=', page.id).executeTakeFirstOrThrow()
      expect((stored.schema as { root: { children: unknown[] } }).root.children).toHaveLength(1)
    })
  })

  it('그 응답이 끊긴 타겟을 경고로 싣는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const put = await putSchema(ctx, project.id, page.id, owner.cookie, docWithInteraction())
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}/ops`,
        cookies: owner.cookie,
        payload: { baseSeq: put.json().headSeq, ops: [{ op: 'remove', path: '/root/children/1' }] },
      })

      // **막지 않는 것과 말하지 않는 것은 다르다.** 조용히 지나가면 사용자는 자기 문서에
      // 끊긴 규칙이 생긴 것을 모른다.
      expect(res.json().warnings).toHaveLength(1)
      expect(res.json().warnings[0]).toMatchObject({
        code: 'missing-interaction-target',
        severity: 'warning',
        nodeId: 'n_button',
      })
    })
  })
})
