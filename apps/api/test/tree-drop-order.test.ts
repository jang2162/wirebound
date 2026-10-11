/**
 * **트리 드래그가 싣는 `sortOrder`의 뜻** — 웹의 드래그(`apps/web/src/tree/tree-drop.ts`)는 놓을 자리를 «옮긴 뒤 그 부모 안
 * 차례»(결과 기준) 하나로 내고 그 값을 그대로 싣는다. 그 값이 서버에서 같은 뜻인지를 두 갈래로 잰다.
 *
 * | 갈래 | 서버 길(`repos/menu.ts` · `repos/pages.ts`) | 싣는 값 |
 * |---|---|---|
 * | 부모가 바뀐다 | 새 형제 그룹에 끼운다(`openGap`) — 끼울 자리 = 새 부모 안 차례 | 새 부모의 형제 몇 앞인가 |
 * | 부모가 그대로다 | 같은 그룹 안 재정렬(`reorderWithinSiblings`) — 결과 배열에서의 자리 | 옮긴 뒤의 자리 |
 *
 * 둘이 같은 뜻(«옮긴 뒤 그 부모 안 차례»)이라 웹이 한 값으로 둘을 부른다. **같은 부모를 `parentId` · `menuNodeId`로 함께
 * 실어도 재정렬로 읽힌다** — 웹은 부모가 같으면 그 키를 싣지 않지만(페이지의 `move`가 소속을 안 싣는 까닭과 같다), 실어도 뜻이
 * 바뀌지 않는다는 것을 함께 잰다. 부모를 바꾸는 가운데 자리의 메뉴 판은 `menu.test.ts`의 «기존 형제 그룹의 중간 위치로 옮기면
 * …»가 갖는다.
 */
import { describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

interface TreeNode {
  id: string
  title: string
  sortOrder: number
  pages: { id: string; title: string; sortOrder: number }[]
  children: TreeNode[]
}

async function readTree(ctx: TestContext, cookie: { wb_session: string }, projectId: string): Promise<TreeNode[]> {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/tree`, cookies: cookie })
  expect(res.statusCode).toBe(200)
  return (res.json() as { menu: TreeNode[] }).menu
}

/** 형제 배열을 `sortOrder` 순 제목으로 — 화면이 그리는 차례(`panels/menu-tree.tsx`의 `byOrder`). */
function titles(items: readonly { title: string; sortOrder: number }[]): string[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.title)
}

async function patch(ctx: TestContext, cookie: { wb_session: string }, url: string, payload: Record<string, unknown>): Promise<void> {
  const res = await ctx.app.inject({ method: 'PATCH', url, cookies: cookie, payload })
  expect(res.statusCode).toBe(200)
}

describe('메뉴 — 드래그가 싣는 sortOrder', () => {
  it('부모를 바꾸며 싣는 값은 새 부모 안 차례다 — 맨 앞 · 맨 뒤', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const target = await createMenuNode(ctx, owner.cookie, project.id, { title: '대상' })
      await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '가' })
      await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '나' })
      const first = await createMenuNode(ctx, owner.cookie, project.id, { title: '앞으로' })
      const last = await createMenuNode(ctx, owner.cookie, project.id, { title: '뒤로' })
      const menuUrl = (id: string): string => `/api/projects/${project.id}/menu/${id}`

      await patch(ctx, owner.cookie, menuUrl(first.id), { parentId: target.id, sortOrder: 0 })
      // 새 부모에 셋(앞으로 · 가 · 나)이 있다 — 맨 뒤는 3.
      await patch(ctx, owner.cookie, menuUrl(last.id), { parentId: target.id, sortOrder: 3 })

      const tree = await readTree(ctx, owner.cookie, project.id)
      expect(titles(tree)).toEqual(['대상'])
      expect(titles(tree[0]?.children ?? [])).toEqual(['앞으로', '가', '나', '뒤로'])
    })
  })

  it('자식을 뿌리로 올리며 싣는 값도 뿌리 안 차례다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const a = await createMenuNode(ctx, owner.cookie, project.id, { title: 'A' })
      await createMenuNode(ctx, owner.cookie, project.id, { title: 'B' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: a.id, title: '자식' })

      await patch(ctx, owner.cookie, `/api/projects/${project.id}/menu/${child.id}`, { parentId: null, sortOrder: 1 })

      expect(titles(await readTree(ctx, owner.cookie, project.id))).toEqual(['A', '자식', 'B'])
    })
  })

  it('같은 부모를 실어도 결과 기준 재정렬이다 — 앞에서 뒤로 · 뒤에서 앞으로', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const parent = await createMenuNode(ctx, owner.cookie, project.id, { title: '부모' })
      const a = await createMenuNode(ctx, owner.cookie, project.id, { parentId: parent.id, title: 'A' })
      await createMenuNode(ctx, owner.cookie, project.id, { parentId: parent.id, title: 'B' })
      const c = await createMenuNode(ctx, owner.cookie, project.id, { parentId: parent.id, title: 'C' })
      await createMenuNode(ctx, owner.cookie, project.id, { parentId: parent.id, title: 'D' })
      const menuUrl = (id: string): string => `/api/projects/${project.id}/menu/${id}`

      // A 를 C 뒤에 놓는다 — 옮긴 뒤 [B C A D], A 의 자리는 2.
      await patch(ctx, owner.cookie, menuUrl(a.id), { parentId: parent.id, sortOrder: 2 })
      expect(titles((await readTree(ctx, owner.cookie, project.id))[0]?.children ?? [])).toEqual(['B', 'C', 'A', 'D'])

      // C 를 맨 앞에 — 부모 키 없이.
      await patch(ctx, owner.cookie, menuUrl(c.id), { sortOrder: 0 })
      expect(titles((await readTree(ctx, owner.cookie, project.id))[0]?.children ?? [])).toEqual(['C', 'B', 'A', 'D'])
    })
  })
})

describe('페이지 — 드래그가 싣는 sortOrder', () => {
  it('소속을 바꾸며 싣는 값은 새 메뉴 안 차례다 — 가운데', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const from = await createMenuNode(ctx, owner.cookie, project.id, { title: '보낸 메뉴' })
      const to = await createMenuNode(ctx, owner.cookie, project.id, { title: '받는 메뉴' })
      const moving = await createPage(ctx, owner.cookie, project.id, from.id, { title: '옮길 것' })
      await createPage(ctx, owner.cookie, project.id, from.id, { title: '남는 것' })
      await createPage(ctx, owner.cookie, project.id, to.id, { title: 'T1' })
      await createPage(ctx, owner.cookie, project.id, to.id, { title: 'T2' })

      await patch(ctx, owner.cookie, `/api/projects/${project.id}/pages/${moving.id}`, {
        menuNodeId: to.id,
        sortOrder: 1,
      })

      const tree = await readTree(ctx, owner.cookie, project.id)
      expect(titles(tree.find((node) => node.id === to.id)?.pages ?? [])).toEqual(['T1', '옮길 것', 'T2'])
      expect(titles(tree.find((node) => node.id === from.id)?.pages ?? [])).toEqual(['남는 것'])
    })
  })

  it('같은 메뉴를 실어도 결과 기준 재정렬이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      const a = await createPage(ctx, owner.cookie, project.id, menu.id, { title: 'A' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: 'B' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: 'C' })

      // A 를 B 뒤에 — 옮긴 뒤 [B A C], A 의 자리는 1.
      await patch(ctx, owner.cookie, `/api/projects/${project.id}/pages/${a.id}`, { menuNodeId: menu.id, sortOrder: 1 })

      expect(titles((await readTree(ctx, owner.cookie, project.id))[0]?.pages ?? [])).toEqual(['B', 'A', 'C'])
    })
  })
})
