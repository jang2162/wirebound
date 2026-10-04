/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * 노드 별칭(`alias`)이 저장 경계를 지나는가 — 문서 통째 저장(`PUT …/schema`) · 편집(`PATCH …/ops` · WS `patch`).
 * 모양 규칙(앞뒤 공백 · 1 ~ 60자 · 한 줄)은 봉투(`@wirebound/schema` 의 `WbNodeSchema`)가 소유하고 그 칸마다의 케이스는
 * `packages/schema/test/node-alias.test.ts` 가 갖는다. 여기는 서버가 그 봉투를 **부르는지**만 잰다 — 받음 하나 · 거절 하나.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

async function fixture(ctx: RealApiContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const base = `/api/projects/${project.id}/pages/${page.id}`
  return { owner, projectId: project.id, pageId: page.id, base }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function docWith(alias: string) {
  return {
    version: 1,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_save', type: 'Button', alias, props: { label: '저장' } }] },
  }
}

async function savedChildren(ctx: RealApiContext, fx: Fixture): Promise<Array<Record<string, unknown>>> {
  const res = await ctx.app.inject({ method: 'GET', url: fx.base, cookies: fx.owner.cookie })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { schema: { root: { children?: Array<Record<string, unknown>> } } }).schema.root.children ?? []
}

/** 뿌리 아래 첫 자식으로 Button 하나를 넣는다(편집 길로). */
async function addButton(ctx: RealApiContext, fx: Fixture): Promise<void> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `${fx.base}/ops`,
    cookies: fx.owner.cookie,
    payload: {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_save', type: 'Button', props: { label: '저장' } } }],
    },
  })
  expect(res.statusCode, res.body).toBe(200)
}

describe('노드 별칭 — 저장 경계', () => {
  it('PUT …/schema 가 별칭이 든 문서를 저장하고 되읽는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `${fx.base}/schema`,
        cookies: fx.owner.cookie,
        payload: { schema: docWith('머리 저장') } as never,
      })
      expect(res.statusCode, res.body).toBe(200)
      expect((await savedChildren(ctx, fx))[0]).toMatchObject({ id: 'n_save', alias: '머리 저장' })
    })
  })

  it('PUT …/schema 는 61자 별칭을 400 으로 거절하고 저장하지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `${fx.base}/schema`,
        cookies: fx.owner.cookie,
        payload: { schema: docWith('가'.repeat(61)) } as never,
      })
      expect(res.statusCode, res.body).toBe(400)
      expect(await savedChildren(ctx, fx)).toEqual([])
    })
  })

  it('PATCH …/ops — `add /…/alias` 는 커밋되고 61자는 거절된다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await addButton(ctx, fx)

      const long = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: 1, ops: [{ op: 'add', path: '/root/children/0/alias', value: '가'.repeat(61) }] },
      })
      expect(long.statusCode, long.body).toBe(422)
      expect(long.json()).toMatchObject({ error: { issues: [{ code: 'bad-document', path: '/root/children/0/alias' }] } })
      expect((await savedChildren(ctx, fx))[0]).not.toHaveProperty('alias')

      const ok = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: 1, ops: [{ op: 'add', path: '/root/children/0/alias', value: '머리 저장' }] },
      })
      expect(ok.statusCode, ok.body).toBe(200)
      expect(ok.json()).toMatchObject({ seq: 2, inverse: [{ op: 'remove', path: '/root/children/0/alias' }] })
      expect((await savedChildren(ctx, fx))[0]).toMatchObject({ alias: '머리 저장' })
    })
  })

  it('WS `patch` — 웹이 보내는 `add /…/alias` 가 patch-ack 으로 커밋된다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await addButton(ctx, fx)
      const author = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(author)

      author.send(
        JSON.stringify({
          type: 'patch',
          pageId: fx.pageId,
          clientOpId: 'op_alias',
          baseSeq: 1,
          ops: [{ op: 'add', path: '/root/children/0/alias', value: '머리 저장' }],
        }),
      )
      const answer = await author.waitFor('patch-ack')
      expect(answer).toMatchObject({ clientOpId: 'op_alias', seq: 2 })
      expect((await savedChildren(ctx, fx))[0]).toMatchObject({ alias: '머리 저장' })

      author.send(
        JSON.stringify({
          type: 'patch',
          pageId: fx.pageId,
          clientOpId: 'op_alias_long',
          baseSeq: 2,
          ops: [{ op: 'replace', path: '/root/children/0/alias', value: '가'.repeat(61) }],
        }),
      )
      const refused = await author.waitFor('patch-error')
      expect(refused).toMatchObject({ clientOpId: 'op_alias_long', status: 422 })
      expect((await savedChildren(ctx, fx))[0]).toMatchObject({ alias: '머리 저장' })
    })
  })
})
