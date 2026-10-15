/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다** — `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **방송 프레임은 누가 했는지(사람 이름 · 토큰 이름)를 싣지 않는다**(`src/ws/protocol.ts`의 `ServerFrame` 머리말). 룸의 viewer 까지
 * 가는데 읽는 자리가 없고, 사람 이름은 `presence`가 이미 나르므로 실으면 새로 가는 것은 토큰 이름뿐이다.
 *
 * **프레임 종류 × 입구마다 한 판이다.** 쓰기는 토큰 + `x-wb-client: mcp`로 내고(토큰이 못 오는 WS `patch`만 세션) viewer 가 받은
 * 프레임을 본다 — `actor` 칸이 없고 프레임 글 어디에도 토큰 이름이 없다. 입구 하나만 재면 다른 입구가 그 칸을 다시 실어도 산다.
 *
 * **기록은 그대로다.** `revisions.actor_*`는 «누가 했나»를 들고 이력 응답이 멤버에게 나른다(`actor-census.test.ts` 「값」이 잰다).
 * revision 을 남기는 판은 여기서도 이력에 토큰 이름이 남았는지 함께 본다 — 토큰 이름이 그 판에 실제로 있었다는 카나리아다(없으면
 * «프레임에 토큰 이름이 없다»가 늘 참이다).
 *
 * 답을 잃은 트리 쓰기의 신호(`services/tree-write.ts` — 새 연결로 커밋을 확인한 뒤 낸다)도 한 판이다. 복원의 늦은 꼬리
 * (`routes/snapshots.ts`의 `announceRestore` 늦은 길)는 제때 길과 같은 함수라 여기서 따로 세우지 않는다 — `late-commit-stale.test.ts`의
 * «늦게 커밋된 복원»이 그 프레임을 `toEqual`로 견준다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { CLIENT_KIND_HEADER } from '../src/auth/actor'
import type { ServerFrame } from '../src/ws/protocol'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withProxiedRealApi,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

const TOKEN_NAME = '새면 안 되는 토큰 이름'

interface Fixture {
  owner: SignedUpUser
  projectId: string
  pageId: string
  rootId: string
  /** 토큰 + `x-wb-client: mcp` — 쓰기마다 싣는다. */
  agent: Record<string, string>
  /** 프레임을 받는 viewer 의 연결. */
  viewer: WsProbe
}

async function fixture(ctx: RealApiContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const viewerUser = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, viewerUser.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)

  const issued = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/tokens`,
    cookies: owner.cookie,
    payload: { name: TOKEN_NAME },
  })
  if (issued.statusCode !== 201) throw new Error(`토큰 발급 픽스처가 실패했습니다: ${issued.body}`)
  const token = (issued.json() as { value: string }).value

  const viewer = await joinRoom(ctx.port, project.id, viewerUser.cookie.wb_session)
  opened.push(viewer)
  return {
    owner,
    projectId: project.id,
    pageId: page.id,
    rootId: (page.schema as { root: { id: string } }).root.id,
    agent: { authorization: `Bearer ${token}`, [CLIENT_KIND_HEADER]: 'mcp' },
    viewer,
  }
}

/** **이 파일의 단언 하나.** `actor` 칸이 없고, 프레임 글 어디에도 토큰 이름이 없다. */
function expectNoActor(frame: ServerFrame): void {
  expect(frame).not.toHaveProperty('actor')
  expect(JSON.stringify(frame)).not.toContain(TOKEN_NAME)
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

/** 카나리아 — 그 판의 마지막 revision 이 토큰 이름을 들었다(기록은 걷지 않았다). */
async function lastRevisionLabel(pageId: string): Promise<string> {
  const row = await db
    .selectFrom('revisions')
    .select('actor_label')
    .where('page_id', '=', pageId)
    .orderBy('seq', 'desc')
    .executeTakeFirstOrThrow()
  return row.actor_label
}

let nodeCounter = 0

function addNode(): PatchOp[] {
  nodeCounter += 1
  return [{ op: 'add', path: '/root/children/-', value: { id: `n_frame${nodeCounter}`, type: 'Text', props: {} } } as PatchOp]
}

describe('page-changed 는 actor 를 싣지 않는다 — 입구마다', () => {
  it('PATCH …/ops(토큰 · mcp)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        headers: fx.agent,
        payload: { baseSeq: await headSeqOf(fx.pageId), ops: addNode() },
      })
      expect(res.statusCode, res.body).toBe(200)

      expectNoActor(await fx.viewer.waitFor('page-changed'))
      expect(await lastRevisionLabel(fx.pageId)).toBe(TOKEN_NAME)
    })
  }, 30_000)

  it('PUT …/schema(토큰 · mcp)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const current = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        cookies: fx.owner.cookie,
      })
      const schema = (current.json() as { schema: { root: { children?: unknown[] } } }).schema
      schema.root.children = [...(schema.root.children ?? []), { id: 'n_put', type: 'Text', props: {} }]

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/schema`,
        headers: fx.agent,
        payload: { schema },
      })
      expect(res.statusCode, res.body).toBe(200)

      expectNoActor(await fx.viewer.waitFor('page-changed'))
      expect(await lastRevisionLabel(fx.pageId)).toBe(TOKEN_NAME)
    })
  }, 30_000)

  it('코멘트 게시가 번호를 붙인 판 · 같은 키의 재생이 다시 보낸 판(토큰 · mcp)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const post = () =>
        ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
          headers: fx.agent,
          payload: { nodeId: fx.rootId, body: '번호를 붙이는 말', idempotencyKey: 'frame-no-actor' },
        })

      const first = await post()
      expect(first.statusCode, first.body).toBe(201)
      expect((first.json() as { markerOps: unknown[] }).markerOps.length).toBeGreaterThan(0)
      expect(await lastRevisionLabel(fx.pageId)).toBe(TOKEN_NAME)

      // 재생은 그 revision 이 머리면 번호 프레임을 다시 보낸다(`routes/comments.ts`의 `rebroadcastPostRevision`).
      const again = await post()
      expect(again.statusCode, again.body).toBe(200)

      const frames = await fx.viewer.waitForCount('page-changed', 2)
      expect(frames).toHaveLength(2)
      for (const frame of frames) expectNoActor(frame)
    })
  }, 30_000)

  it('WS patch 프레임(세션 — 토큰은 핸드셰이크를 못 지난다)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const author = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(author)
      author.send(
        JSON.stringify({ type: 'patch', pageId: fx.pageId, baseSeq: await headSeqOf(fx.pageId), ops: addNode(), clientOpId: 'op_frame' }),
      )
      await author.waitFor('patch-ack')

      const frame = await fx.viewer.waitFor('page-changed')
      expectNoActor(frame)
      // 세션 판의 사람 이름도 안 싣는다 — 그 이름은 `presence`가 나른다.
      expect(JSON.stringify(frame)).not.toContain(fx.owner.user.name)
    })
  }, 30_000)
})

describe('menu-changed 는 actor 를 싣지 않는다', () => {
  it('메뉴 · 페이지를 만드는 트리 쓰기(토큰 · mcp)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const menu = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/menu`,
        headers: fx.agent,
        payload: { parentId: null, title: '토큰이 만든 메뉴' },
      })
      expect(menu.statusCode, menu.body).toBe(201)
      const menuId = (menu.json() as { id: string }).id
      const page = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages`,
        headers: fx.agent,
        payload: { menuNodeId: menuId, title: '토큰이 만든 페이지' },
      })
      expect(page.statusCode, page.body).toBe(201)

      const frames = await fx.viewer.waitForCount('menu-changed', 2)
      expect(frames).toHaveLength(2)
      for (const frame of frames) expectNoActor(frame)
    })
  }, 30_000)

  it('COMMIT 답을 잃은 트리 쓰기가 커밋을 확인하고 낸 신호(토큰 · mcp)', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      ctx.proxy.dropCommitReplyAfter('insert into "project_menu_revs"')
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/menu`,
        headers: fx.agent,
        payload: { parentId: null, title: '답을 잃은 메뉴' },
      })
      expect(ctx.proxy.fired).toBe(true)
      expect(res.statusCode, res.body).toBe(201)

      await fx.viewer.waitFor('menu-changed')
      await fx.viewer.quiet()
      const frames = fx.viewer.received.filter((frame) => frame.type === 'menu-changed')
      // 확인한 쪽(`runTreeTransaction`)과 라우트가 하나씩 낸다 — 둘 다 본다.
      expect(frames).toHaveLength(2)
      for (const frame of frames) expectNoActor(frame)
    })
  }, 30_000)
})

describe('theme-changed · restored 는 actor 를 싣지 않는다', () => {
  async function themeRev(projectId: string): Promise<number> {
    const { rows } = await sql<{ rev: number }>`select theme_rev::int as rev from projects where id = ${projectId}`.execute(db)
    return rows[0]!.rev
  }

  async function currentTheme(ctx: RealApiContext, fx: Fixture): Promise<{ themeId: string; version: string }> {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/theme`, cookies: fx.owner.cookie })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as { themeId: string; version: string }
  }

  it('테마 바인딩 저장(토큰 · mcp)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const theme = await currentTheme(ctx, fx)
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.projectId}/theme`,
        headers: fx.agent,
        payload: { themeId: theme.themeId, version: theme.version, tokens: {}, rev: await themeRev(fx.projectId) },
      })
      expect(res.statusCode, res.body).toBe(200)

      expectNoActor(await fx.viewer.waitFor('theme-changed'))
    })
  }, 30_000)

  it('복원이 내는 restored · menu-changed · theme-changed(토큰 · mcp)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: '되돌아갈 판' },
      })
      expect(snapshot.statusCode, snapshot.body).toBe(201)
      const snapshotId = (snapshot.json() as { id: string }).id
      await fx.viewer.quiet()
      const before = fx.viewer.received.length

      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`,
        headers: fx.agent,
      })
      expect(restored.statusCode, restored.body).toBe(200)

      const tail = (type: ServerFrame['type']): Promise<ServerFrame> =>
        fx.viewer
          .waitForCount(type, fx.viewer.received.slice(0, before).filter((frame) => frame.type === type).length + 1)
          .then((frames) => frames.at(-1)!)
      for (const type of ['restored', 'menu-changed', 'theme-changed'] as const) expectNoActor(await tail(type))
    })
  }, 30_000)
})
