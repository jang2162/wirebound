/**
 * **메뉴 연쇄 삭제**(`DELETE /:projectId/menu/:nodeId` 의 `{ cascade: true, expect }` 갈래 — `routes/menu.ts`).
 *
 * 본문이 없으면 지금처럼 하위가 있는 메뉴에 409 다(MCP · CLI · 옛 클라이언트). 본문이 화면이 본 id 집합(`expect` — 밑의 메뉴 id · 페이지
 * id)을 실으면 한 트랜잭션에서 서브트리를 다시 읽어 집합이 같을 때만 지우고, 지우기 직전 안전망 스냅샷을 찍는다.
 */
import { describe, expect, it } from 'vitest'
import { CASCADE_ID_LIMIT } from '../src/routes/menu'
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

/** 화면이 본 것 — `tree`의 밑 전부. */
function seen(t: Tree): { menuIds: string[]; pageIds: string[] } {
  return { menuIds: [t.sub, t.grand], pageIds: [...t.pages] }
}

const COUNTS = { menus: 2, pages: 3 }

/** 목록 불일치 409 의 지금 목록. 다른 답이면 던진다. */
function listing(res: { statusCode: number; body: string }): unknown {
  expect(res.statusCode, res.body).toBe(409)
  const error = JSON.parse(res.body).error as { code: string; issues: { path: string; code: string; subtree?: unknown }[] }
  expect(error.code).toBe('conflict')
  expect(error.issues).toHaveLength(1)
  expect(error.issues[0]).toEqual(expect.objectContaining({ path: 'expect', code: 'menu-subtree-changed' }))
  return error.issues[0]!.subtree
}

const OTHER_ID = '00000000-0000-4000-8000-000000000000'

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
  it('화면이 본 id 집합과 같으면 서브트리(메뉴 · 페이지)를 지우고 밖은 그대로 · 형제를 당긴다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: seen(t) })
      expect(res.statusCode, res.body).toBe(200)
      const body = res.json() as { deleted: { menus: number; pages: number }; safetySnapshot: { id: string; tag: string } }
      expect(body.deleted).toEqual(COUNTS)
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

  it('집합이 다르면 409 menu-subtree-changed · 지금 목록(트리 차례 · 이름 · id)을 싣고 · 아무것도 안 지우고 · 스냅샷도 안 남는다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: { menuIds: [t.sub, t.grand], pageIds: t.pages.slice(0, 2) } })
      expect(listing(res)).toEqual({
        title: '회원관리',
        menus: [
          { id: t.sub, title: '등급' },
          { id: t.grand, title: '혜택' },
        ],
        pages: [
          { id: t.pages[0], title: '목록' },
          { id: t.pages[1], title: '상세' },
          { id: t.pages[2], title: '혜택 안내' },
        ],
      })
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      expect(await pageIds(ctx, t.projectId)).toHaveLength(4)
      expect(await snapshotTags(ctx, t.projectId)).toEqual([])
    })
  })

  it('수가 같아도 id 가 다르면 409 — 페이지 하나를 다른 id 로 · 메뉴 하나를 다른 id 로 · 밖의 id 로 바꿔 끼움', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      for (const swapped of [
        { menuIds: [t.sub, t.grand], pageIds: [t.pages[0]!, t.pages[1]!, OTHER_ID] },
        { menuIds: [t.sub, OTHER_ID], pageIds: [...t.pages] },
        { menuIds: [t.sub, t.grand], pageIds: [t.pages[0]!, t.pages[1]!, t.outsidePage] },
        { menuIds: [t.sub, t.sibling], pageIds: [...t.pages] },
      ]) {
        const res = await del(ctx, t, { cascade: true, expect: swapped })
        expect((listing(res) as { pages: unknown[] }).pages, JSON.stringify(swapped)).toHaveLength(3)
      }
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      expect(await pageIds(ctx, t.projectId)).toHaveLength(4)
      expect(await snapshotTags(ctx, t.projectId)).toEqual([])
    })
  })

  it('다른 프로젝트의 메뉴 · 페이지 id 를 실으면 409 · 그 프로젝트도 이 프로젝트도 그대로', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const other = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: { menuIds: [other.sub, other.grand], pageIds: [...other.pages] } })
      listing(res)
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      expect(await menuIds(ctx, other.projectId)).toHaveLength(4)
      expect(await pageIds(ctx, other.projectId)).toHaveLength(4)
    })
  })

  it('409 가 실은 목록으로 다시 보내면 200 — 지우는 것은 그 목록 그대로다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const stale = await del(ctx, t, { cascade: true, expect: { menuIds: [], pageIds: [] } })
      const now = listing(stale) as { menus: { id: string }[]; pages: { id: string }[] }
      const res = await del(ctx, t, {
        cascade: true,
        expect: { menuIds: now.menus.map((menu) => menu.id), pageIds: now.pages.map((page) => page.id) },
      })
      expect(res.statusCode, res.body).toBe(200)
      expect(await menuIds(ctx, t.projectId)).toEqual([t.sibling])
      expect(await pageIds(ctx, t.projectId)).toEqual([t.outsidePage])
    })
  })

  it('이름만 바뀐 판은 지나간다 — 같은 행이다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      for (const [path, title] of [
        [`/menu/${t.sub}`, '등급(새 이름)'],
        [`/pages/${t.pages[0]}`, '목록(새 이름)'],
      ] as const) {
        const renamed = await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${t.projectId}${path}`,
          cookies: t.owner.cookie,
          payload: { title },
        })
        expect(renamed.statusCode, renamed.body).toBe(200)
      }
      const res = await del(ctx, t, { cascade: true, expect: seen(t) })
      expect(res.statusCode, res.body).toBe(200)
      expect(await pageIds(ctx, t.projectId)).toEqual([t.outsidePage])
    })
  })

  it('지우기 직전 안전망 스냅샷을 찍고 — 그것으로 복원하면 서브트리가 되살아난다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await del(ctx, t, { cascade: true, expect: seen(t) })
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
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${menu.id}`,
        cookies: owner.cookie,
        payload: { cascade: true, expect: { menuIds: [], pageIds: [page.id] } },
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
      const denied = await del(ctx, t, { cascade: true, expect: seen(t) }, viewer.cookie)
      expect(denied.statusCode, denied.body).toBe(403)
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      const done = await del(ctx, t, { cascade: true, expect: seen(t) }, editor.cookie)
      expect(done.statusCode, done.body).toBe(200)
    })
  })

  it('본문의 꼴이 틀리면 400 — cascade 가 참이 아님 · expect 없음 · 옛 수 본문 · 겹친 id · 비문자열 · uuid 아님 · 모르는 키', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const ok = seen(t)
      for (const payload of [
        { cascade: false, expect: ok },
        { cascade: true },
        { cascade: true, expect: COUNTS },
        { cascade: true, expect: { menuIds: ok.menuIds } },
        { cascade: true, expect: { ...ok, pageIds: [...ok.pageIds, ok.pageIds[0]] } },
        { cascade: true, expect: { ...ok, menuIds: [t.sub, t.sub] } },
        { cascade: true, expect: { ...ok, pageIds: [1, 2, 3] } },
        { cascade: true, expect: { ...ok, pageIds: [null] } },
        { cascade: true, expect: { ...ok, pageIds: [{ id: t.pages[0] }] } },
        { cascade: true, expect: { ...ok, pageIds: ['목록'] } },
        { cascade: true, expect: { ...ok, pageIds: t.pages.join(',') } },
        { cascade: true, expect: { ...ok, menuIds: null } },
        { cascade: true, expect: { ...ok, extra: [] } },
        { cascade: true, expect: ok, extra: 1 },
      ]) {
        const res = await del(ctx, t, payload)
        expect(res.statusCode, `${JSON.stringify(payload)} ${res.body}`).toBe(400)
      }
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
      expect(await snapshotTags(ctx, t.projectId)).toEqual([])
    })
  })

  it(`목록 하나가 ${CASCADE_ID_LIMIT}개를 넘으면 400 — 상한 그 수는 받는다(집합이 달라 409)`, async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const fill = (n: number): string[] =>
        Array.from({ length: n }, (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`)
      for (const [key, n, status] of [
        ['pageIds', CASCADE_ID_LIMIT, 409],
        ['menuIds', CASCADE_ID_LIMIT, 409],
        ['pageIds', CASCADE_ID_LIMIT + 1, 400],
        ['menuIds', CASCADE_ID_LIMIT + 1, 400],
      ] as const) {
        const res = await del(ctx, t, { cascade: true, expect: { ...seen(t), [key]: fill(n) } })
        expect(res.statusCode, `${key} ${n} ${res.body.slice(0, 200)}`).toBe(status)
      }
      // 두 목록이 다 넘쳐도 본문 상한(413)보다 앞에서 400 이다.
      const both = await del(ctx, t, { cascade: true, expect: { menuIds: fill(CASCADE_ID_LIMIT + 1), pageIds: fill(CASCADE_ID_LIMIT + 1) } })
      expect(both.statusCode, both.body.slice(0, 200)).toBe(400)
      expect(await menuIds(ctx, t.projectId)).toHaveLength(4)
    })
  })

  it('빈 목록 둘은 하위가 없는 메뉴에만 맞는다', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const empty = { cascade: true, expect: { menuIds: [], pageIds: [] } }
      listing(await del(ctx, t, empty))
      const leaf = await createMenuNode(ctx, t.owner.cookie, t.projectId, { title: '빈 메뉴' })
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${t.projectId}/menu/${leaf.id}`,
        cookies: t.owner.cookie,
        payload: empty,
      })
      expect(res.statusCode, res.body).toBe(200)
      expect((res.json() as { deleted: unknown }).deleted).toEqual({ menus: 0, pages: 0 })
    })
  })

  it('없는 메뉴는 404', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${t.projectId}/menu/00000000-0000-0000-0000-000000000000`,
        cookies: t.owner.cookie,
        payload: { cascade: true, expect: seen(t) },
      })
      expect(res.statusCode, res.body).toBe(404)
    })
  })

  it('하위 메뉴가 없는 메뉴도 cascade 로 지울 수 있다(메뉴 0 · 페이지 1)', async () => {
    await withApi(async (ctx) => {
      const t = await tree(ctx)
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${t.projectId}/menu/${t.grand}`,
        cookies: t.owner.cookie,
        payload: { cascade: true, expect: { menuIds: [], pageIds: [t.pages[2]] } },
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
      const res = await del(ctx, t, { cascade: true, expect: seen(t) })
      expect(res.statusCode, res.body).toBe(200)
      const comments = await ctx.db.selectFrom('comments').select('id').where('page_id', 'in', t.pages).execute()
      expect(comments).toEqual([])
      const tombstones = await ctx.db.selectFrom('comment_tombstones').select('page_id').where('page_id', '=', t.pages[0]!).execute()
      expect(tombstones).toHaveLength(1)
    })
  })
})
