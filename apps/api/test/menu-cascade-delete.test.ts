/**
 * **메뉴 연쇄 삭제**(`DELETE /:projectId/menu/:nodeId` 의 `{ cascade: true, expect }` 갈래 — `routes/menu.ts`).
 *
 * 본문이 없으면 지금처럼 하위가 있는 메뉴에 409 다(MCP · CLI · 옛 클라이언트). 본문이 화면이 본 수(`expect` — 하위 메뉴 수 · 페이지 수)를
 * 실으면 한 트랜잭션에서 수를 다시 세어 같을 때만 서브트리를 지우고, 지우기 직전 안전망 스냅샷을 찍는다.
 */
import { describe, expect, it } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

interface Tree {
  owner: SignedUpUser
  projectId: string
  /** 지울 메뉴 «회원관리» — 하위 메뉴 둘(손자 하나 포함) · 페이지 셋. */
  target: string
  sub: string
  grand: string
  /** 지울 메뉴의 형제(뒤) — 재번호를 본다. */
  sibling: string
  /** 남는 메뉴 아래 페이지 — 연쇄가 밖을 안 건드리는지 본다. */
  outsidePage: string
  pages: string[]
}

/**
 * ```
 * 회원관리(target)      pages: 목록 · 상세
 * └ 등급(sub)
 *   └ 혜택(grand)       pages: 혜택 안내
 * 설정(sibling)         pages: 환경
 * ```
 */
async function tree(ctx: TestContext): Promise<Tree> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const target = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원관리' })
  const sibling = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const sub = await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '등급' })
  const grand = await createMenuNode(ctx, owner.cookie, project.id, { parentId: sub.id, title: '혜택' })
  const a = await createPage(ctx, owner.cookie, project.id, target.id, { title: '목록' })
  const b = await createPage(ctx, owner.cookie, project.id, target.id, { title: '상세' })
  const c = await createPage(ctx, owner.cookie, project.id, grand.id, { title: '혜택 안내' })
  const outside = await createPage(ctx, owner.cookie, project.id, sibling.id, { title: '환경' })
  return {
    owner,
    projectId: project.id,
    target: target.id,
    sub: sub.id,
    grand: grand.id,
    sibling: sibling.id,
    outsidePage: outside.id,
    pages: [a.id, b.id, c.id],
  }
}

function del(ctx: TestContext, t: Tree, payload?: unknown, cookie = t.owner.cookie) {
  return ctx.app.inject({
    method: 'DELETE',
    url: `/api/projects/${t.projectId}/menu/${t.target}`,
    cookies: cookie,
    ...(payload === undefined ? {} : { payload: payload as object }),
  })
}

async function menuIds(ctx: TestContext, projectId: string): Promise<string[]> {
  const rows = await ctx.db.selectFrom('menu_nodes').select('id').where('project_id', '=', projectId).execute()
  return rows.map((row) => row.id).sort()
}

async function pageIds(ctx: TestContext, projectId: string): Promise<string[]> {
  const rows = await ctx.db.selectFrom('pages').select('id').where('project_id', '=', projectId).execute()
  return rows.map((row) => row.id).sort()
}

async function snapshotTags(ctx: TestContext, projectId: string): Promise<string[]> {
  const rows = await ctx.db.selectFrom('snapshots').select('tag').where('project_id', '=', projectId).execute()
  return rows.map((row) => row.tag)
}

const EXPECT = { menus: 2, pages: 3 }

describe('메뉴 연쇄 삭제 — 본문 없는 요청은 지금 그대로', () => {
  it('하위가 있는 메뉴에 본문 없이 DELETE → 409 · 아무것도 안 지움 · 스냅샷 없음', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t)
      expect(res.statusCode, res.body).toBe(409)
      expect(res.json().error.message).toBe('하위 메뉴나 페이지가 있어 삭제할 수 없습니다')
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      expect(await pageIds(ctx, t.projectId)).toHaveLength(4)
      expect(await snapshotTags(ctx, t.projectId)).toEqual([])
    })
  })
})

describe('메뉴 연쇄 삭제 — cascade', () => {
  it('화면이 본 수와 같으면 서브트리(메뉴 · 페이지)를 지우고 밖은 그대로 · 형제를 당긴다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: EXPECT })
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as { deleted: { menus: number; pages: number }; safetySnapshot: { id: string; tag: string } }
      expect(body.deleted).toEqual(EXPECT)
      expect(await menuIds(ctx, t.projectId)).toEqual([t.sibling])
      expect(await pageIds(ctx, t.projectId)).toEqual([t.outsidePage])
      const sibling = await ctx.db.selectFrom('menu_nodes').select('sort_order').where('id', '=', t.sibling).executeTakeFirstOrThrow()
      expect(sibling.sort_order).toBe(0)
      // 딸린 행 — 이력은 CASCADE 로, 번호 바닥은 페이지마다 남는다(`0017-page-seq-floors`).
      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', 'in', t.pages).execute()
      expect(revisions).toEqual([])
      const floors = await ctx.db.selectFrom('page_seq_floors').select('page_id').where('page_id', 'in', t.pages).execute()
      expect(floors.map((row) => row.page_id).sort()).toEqual([...t.pages].sort())
    })
  })

  it('수가 다르면 409 menu-subtree-changed · 지금 수를 싣고 · 아무것도 안 지우고 · 스냅샷도 안 남는다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: { menus: 2, pages: 2 } })
      expect(res.statusCode, res.body).toBe(409)
      const error = res.json().error as { code: string; issues: { path: string; code: string; subtree?: unknown }[] }
      expect(error.code).toBe('conflict')
      expect(error.issues).toEqual([
        expect.objectContaining({ path: 'expect', code: 'menu-subtree-changed', subtree: EXPECT }),
      ])
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      expect(await pageIds(ctx, t.projectId)).toHaveLength(4)
      expect(await snapshotTags(ctx, t.projectId)).toEqual([])
    })
  })

  it('하위 메뉴 수만 달라도 409 — 두 수를 따로 견준다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: { menus: 1, pages: 3 } })
      expect(res.statusCode, res.body).toBe(409)
      expect(res.json().error.issues[0].subtree).toEqual(EXPECT)
    })
  })

  it('지우기 직전 안전망 스냅샷을 찍고 — 그것으로 복원하면 서브트리가 되살아난다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: EXPECT })
      expect(res.statusCode, res.body).toBe(200)
      const safety = (res.json() as { safetySnapshot: { id: string; tag: string } }).safetySnapshot
      expect(safety.tag).toMatch(/^메뉴 "회원관리" 삭제 전 \d{4}-\d{2}-\d{2}T/)

      const list = await ctx.app.inject({ method: 'GET', url: `/api/projects/${t.projectId}/snapshots`, cookies: t.owner.cookie })
      expect(list.statusCode, list.body).toBe(200)
      const listed = (list.json() as { id: string; tag: string; description: string | null }[]).find((row) => row.id === safety.id)
      expect(listed?.tag).toBe(safety.tag)
      expect(listed?.description).toContain('회원관리')

      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${t.projectId}/snapshots/${safety.id}/restore`,
        cookies: t.owner.cookie,
      })
      expect(restored.statusCode, restored.body).toBe(200)
      expect(await menuIds(ctx, t.projectId)).toEqual([t.target, t.sub, t.grand, t.sibling].sort())
      expect(await pageIds(ctx, t.projectId)).toEqual([...t.pages, t.outsidePage].sort())
    })
  })

  it('긴 제목은 태그 상한(60자) 안으로 줄인다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const title = '가'.repeat(150)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title })
      await createPage(ctx, owner.cookie, project.id, menu.id)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${menu.id}`,
        cookies: owner.cookie,
        payload: { cascade: true, expect: { menus: 0, pages: 1 } },
      })
      expect(res.statusCode, res.body).toBe(200)
      const tag = (res.json() as { safetySnapshot: { tag: string } }).safetySnapshot.tag
      expect(tag.length).toBeLessThanOrEqual(60)
      expect(tag).toContain('…" 삭제 전 ')
      expect(tag.startsWith('메뉴 "가')).toBe(true)
    })
  })

  it('editor 도 지운다 · viewer 는 403', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const viewer = await signup(ctx)
      const editor = await signup(ctx)
      await addMember(ctx, t.projectId, viewer.user.id, 'viewer')
      await addMember(ctx, t.projectId, editor.user.id, 'editor')
      const denied = await del(ctx, t, { cascade: true, expect: EXPECT }, viewer.cookie)
      expect(denied.statusCode, denied.body).toBe(403)
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      const done = await del(ctx, t, { cascade: true, expect: EXPECT }, editor.cookie)
      expect(done.statusCode, done.body).toBe(200)
    })
  })

  it('본문의 꼴이 틀리면 400 — cascade 가 참이 아님 · expect 없음 · 모르는 키', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      for (const payload of [
        { cascade: false, expect: EXPECT },
        { cascade: true },
        { cascade: true, expect: { menus: 2 } },
        { cascade: true, expect: { menus: -1, pages: 3 } },
        { cascade: true, expect: EXPECT, extra: 1 },
      ]) {
        const res = await del(ctx, t, payload)
        expect(res.statusCode, `${JSON.stringify(payload)} ${res.body}`).toBe(400)
      }
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
    })
  })

  it('없는 메뉴는 404', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${t.projectId}/menu/00000000-0000-0000-0000-000000000000`,
        cookies: t.owner.cookie,
        payload: { cascade: true, expect: EXPECT },
      })
      expect(res.statusCode, res.body).toBe(404)
    })
  })

  it('하위가 없는 메뉴도 cascade 로 지울 수 있다(수 0 · 0)', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${t.projectId}/menu/${t.grand}`,
        cookies: t.owner.cookie,
        payload: { cascade: true, expect: { menus: 0, pages: 1 } },
      })
      expect(res.statusCode, res.body).toBe(200)
      expect(await menuIds(ctx, t.projectId)).toEqual([t.target, t.sub, t.sibling].sort())
    })
  })

  it('키 있는 코멘트는 묘비를 남긴다 — 페이지 삭제와 같은 길', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const page = await ctx.db.selectFrom('pages').select('schema').where('id', '=', t.pages[0]!).executeTakeFirstOrThrow()
      const nodeId = (page.schema as { root: { id: string } }).root.id
      const posted = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${t.projectId}/pages/${t.pages[0]}/comments`,
        cookies: t.owner.cookie,
        payload: { nodeId, body: '확인 부탁', idempotencyKey: 'k-1' },
      })
      expect(posted.statusCode, posted.body).toBe(201)
      const res = await del(ctx, t, { cascade: true, expect: EXPECT })
      expect(res.statusCode, res.body).toBe(200)
      const comments = await ctx.db.selectFrom('comments').select('id').where('page_id', 'in', t.pages).execute()
      expect(comments).toEqual([])
      const tombstones = await ctx.db.selectFrom('comment_tombstones').select('page_id').where('page_id', '=', t.pages[0]!).execute()
      expect(tombstones).toHaveLength(1)
    })
  })
})
