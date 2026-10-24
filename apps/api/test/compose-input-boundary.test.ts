/**
 * **조합 입력의 저장 경계** — 선택지의 «하나만» (`refine`) · 상한 · 하나 이상이 422 로 막히고, «종류 바꾸기» 의 op(`apps/web/src/edit/change-kind.ts` 가 짓는
 * 꼴 — `type` · `props` · `variant` 필드 연산)이 editor 에게는 서고 viewer 에게는 403 이다. 화면 판은 `apps/web/test/panels/change-kind.test.tsx` ·
 * `apps/web/test/panels/option-list.test.tsx`.
 */
import { OPTIONS_MAX } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

interface Board {
  owner: Awaited<ReturnType<typeof signup>>
  viewer: Awaited<ReturnType<typeof signup>>
  projectId: string
  pageId: string
}

/** 값 칸에 `Input` 하나(번호 · 별칭)와 `RadioGroup` 하나를 든 필드. */
async function board(ctx: TestContext): Promise<Board> {
  const owner = await signup(ctx)
  const viewer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${project.id}/pages/${page.id}/ops`,
    cookies: owner.cookie,
    payload: {
      baseSeq: 0,
      ops: [
        {
          op: 'add',
          path: '/root/children/0',
          value: {
            id: 'n_f',
            type: 'Field',
            props: { label: '여부', required: true },
            children: [
              { id: 'n_in', type: 'Input', props: { placeholder: '입력', kind: 'number' }, marker: 1, alias: '숫자 칸' },
              { id: 'n_rg', type: 'RadioGroup', variant: 'radio', props: { options: [{ label: 'Y', selected: true }, { label: 'N' }] } },
            ],
          },
        },
      ],
    },
  })
  expect(res.statusCode, res.body).toBe(200)
  return { owner, viewer, projectId: project.id, pageId: page.id }
}

async function patch(ctx: TestContext, fx: Board, cookie: { wb_session: string }, ops: unknown[]) {
  const head = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`, cookies: fx.owner.cookie })
  const baseSeq = (head.json() as { headSeq: number }).headSeq
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
    cookies: cookie,
    payload: { baseSeq, ops },
  })
}

async function schema(ctx: TestContext, fx: Board) {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`, cookies: fx.owner.cookie })
  return (res.json() as { schema: { root: { children: { children: Record<string, unknown>[] }[] } } }).schema
}

const RADIO = '/root/children/0/children/1/props/options'

describe('선택지 — 저장 경계', () => {
  it('하나만 고르는 타입에 둘을 고른 배열은 422 이고 그 prop 경로를 말한다 · 하나는 200', async () => {
    await withApi(async (ctx) => {
      const fx = await board(ctx)
      const two = await patch(ctx, fx, fx.owner.cookie, [
        {
          op: 'replace',
          path: RADIO,
          value: [
            { label: 'Y', selected: true },
            { label: 'N', selected: true },
          ],
        },
      ])
      expect(two.statusCode, two.body).toBe(422)
      expect(two.body).toContain('하나만 고를 수 있습니다')
      const one = await patch(ctx, fx, fx.owner.cookie, [
        { op: 'replace', path: RADIO, value: [{ label: 'Y' }, { label: 'N', selected: true }] },
      ])
      expect(one.statusCode, one.body).toBe(200)
    })
  })

  it(`빈 배열 · ${OPTIONS_MAX + 1} 개는 422`, async () => {
    await withApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await patch(ctx, fx, fx.owner.cookie, [{ op: 'replace', path: RADIO, value: [] }])).statusCode).toBe(422)
      const many = Array.from({ length: OPTIONS_MAX + 1 }, (_, index) => ({ label: `${index}` }))
      expect((await patch(ctx, fx, fx.owner.cookie, [{ op: 'replace', path: RADIO, value: many }])).statusCode).toBe(422)
      const full = Array.from({ length: OPTIONS_MAX }, (_, index) => ({ label: `${index}` }))
      expect((await patch(ctx, fx, fx.owner.cookie, [{ op: 'replace', path: RADIO, value: full }])).statusCode).toBe(200)
    })
  })
})

describe('종류 바꾸기 — 권한', () => {
  /** `changeKindOps(document, 'n_in', 'Select')` 가 짓는 꼴(`apps/web/test/edit/change-kind.test.ts`). */
  const TO_SELECT = [
    { op: 'replace', path: '/root/children/0/children/0/type', value: 'Select' },
    { op: 'replace', path: '/root/children/0/children/0/props', value: { placeholder: '입력' } },
  ]

  it('editor 이상은 200 — 같은 id · 번호 · 별칭으로 셀렉트가 된다', async () => {
    await withApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await patch(ctx, fx, fx.owner.cookie, TO_SELECT)
      expect(res.statusCode, res.body).toBe(200)
      expect((await schema(ctx, fx)).root.children[0]!.children[0]).toEqual({
        id: 'n_in',
        type: 'Select',
        props: { placeholder: '입력' },
        marker: 1,
        alias: '숫자 칸',
      })
    })
  })

  it('viewer 는 403 이고 문서가 그대로다', async () => {
    await withApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await patch(ctx, fx, fx.viewer.cookie, TO_SELECT)
      expect(res.statusCode, res.body).toBe(403)
      expect((await schema(ctx, fx)).root.children[0]!.children[0]!.type).toBe('Input')
    })
  })
})
