import { describe, expect, it } from 'vitest'
import { buildMenuTree, type MenuRow, type PageRow, type TreeMenuNode } from '../src/repos/menu'
import { addMember, createMenuNode, createPage, createProject, signup, withApi } from './helpers'

/** `menuRow`/`pageRow`가 채우지 않는 필드에 쓰는 기본값. 테스트마다 필요한 필드만 덮어쓴다. */
function menuRow(overrides: Partial<MenuRow> & Pick<MenuRow, 'id' | 'title'>): MenuRow {
  return { parent_id: null, sort_order: 0, ...overrides }
}
function pageRow(overrides: Partial<PageRow> & Pick<PageRow, 'id' | 'title' | 'menu_node_id'>): PageRow {
  return { sort_order: 0, ...overrides }
}

/** 결과 트리에 실제로 나타나는 노드 id를 전부 모은다(깊이 우선). 고아·순환 테스트가 "어떤 노드가 빠졌는지"를 짚는 데 쓴다. */
function collectIds(nodes: TreeMenuNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    ids.push(node.id)
    ids.push(...collectIds(node.children))
  }
  return ids
}

describe('buildMenuTree (순수 함수, DB 없이)', () => {
  it('빈 입력은 빈 배열이다', () => {
    expect(buildMenuTree([], [])).toEqual([])
  })

  it('평평한 루트 노드들이 sortOrder 순으로 나온다', () => {
    // 입력 배열 순서와 sortOrder 순서를 일부러 어긋나게 둔다 — 함수가 입력 순서가
    // 아니라 sort_order 값 자체를 기준으로 정렬하는지 확인하기 위해서다.
    const nodes: MenuRow[] = [
      menuRow({ id: 'c', title: '다', sort_order: 2 }),
      menuRow({ id: 'a', title: '가', sort_order: 0 }),
      menuRow({ id: 'b', title: '나', sort_order: 1 }),
    ]

    const result = buildMenuTree(nodes, [])

    expect(result.map((n) => n.title)).toEqual(['가', '나', '다'])
  })

  it('3단 중첩이 올바르게 조립된다', () => {
    const nodes: MenuRow[] = [
      menuRow({ id: 'root', title: '루트' }),
      menuRow({ id: 'child', title: '자식', parent_id: 'root' }),
      menuRow({ id: 'grand', title: '손자', parent_id: 'child' }),
    ]

    const result = buildMenuTree(nodes, [])

    expect(result).toEqual([
      {
        id: 'root',
        title: '루트',
        sortOrder: 0,
        pages: [],
        children: [
          {
            id: 'child',
            title: '자식',
            sortOrder: 0,
            pages: [],
            children: [{ id: 'grand', title: '손자', sortOrder: 0, pages: [], children: [] }],
          },
        ],
      },
    ])
  })

  it('페이지가 해당 메뉴 노드의 pages에 sortOrder 순으로 붙는다', () => {
    const nodes: MenuRow[] = [menuRow({ id: 'm', title: '메뉴' })]
    // 입력 순서와 sortOrder 순서를 어긋나게 둔다 — 위 노드 테스트와 같은 이유.
    const pages: PageRow[] = [
      pageRow({ id: 'p2', title: '둘', menu_node_id: 'm', sort_order: 1 }),
      pageRow({ id: 'p1', title: '하나', menu_node_id: 'm', sort_order: 0 }),
    ]

    const result = buildMenuTree(nodes, pages)

    expect(result[0]?.pages).toEqual([
      { id: 'p1', title: '하나', sortOrder: 0 },
      { id: 'p2', title: '둘', sortOrder: 1 },
    ])
  })

  it('페이지가 없는 노드의 pages는 빈 배열이다', () => {
    const nodes: MenuRow[] = [menuRow({ id: 'm', title: '메뉴' })]

    const result = buildMenuTree(nodes, [])

    expect(result[0]?.pages).toEqual([])
  })

  it('부모가 목록에 없는 고아 노드는 결과에서 빠지고 예외를 던지지 않는다', () => {
    const nodes: MenuRow[] = [
      menuRow({ id: 'root', title: '루트' }),
      // 'ghost'는 입력 어디에도 없는 id다.
      menuRow({ id: 'orphan', title: '고아', parent_id: 'ghost' }),
    ]

    let result: TreeMenuNode[] = []
    expect(() => {
      result = buildMenuTree(nodes, [])
    }).not.toThrow()

    // "예외를 던지지 않는다"만 확인하면 orphan이 루트로 승격돼(=listMenuTree와 같은
    // 동작으로 퇴행해) 결과에 남아 있어도 통과해 버린다. 어떤 노드가 실제로 빠졌는지를
    // 직접 짚는다: orphan은 루트 배열에도, 다른 노드의 children 안에도 없어야 한다.
    expect(collectIds(result)).toEqual(['root'])
  })

  it('부모 참조가 순환하는 입력에도 무한 루프에 빠지지 않는다', () => {
    const nodes: MenuRow[] = [
      menuRow({ id: 'normal', title: '정상 루트' }),
      // a와 b가 서로를 부모로 가리킨다. DB의 재귀 CTE 검사(assertParentValid)와
      // FK가 이런 데이터가 실제로 만들어지는 것을 막지만, buildMenuTree는 순수
      // 함수이므로 그 보장 밖에서도 방어해야 한다.
      menuRow({ id: 'a', title: 'A', parent_id: 'b' }),
      menuRow({ id: 'b', title: 'B', parent_id: 'a' }),
    ]

    // 무한 루프에 빠진다면 이 호출 자체가 끝나지 않아 테스트가 타임아웃으로 실패한다 —
    // 별도 타이머 없이 "이 줄 다음으로 넘어간다"는 사실 자체가 증거다.
    let result: TreeMenuNode[] = []
    expect(() => {
      result = buildMenuTree(nodes, [])
    }).not.toThrow()

    // 순환에 갇힌 a·b는 어느 루트에서도 도달할 수 없으므로 반환값에 나타나지 않고,
    // 순환과 무관한 정상 루트는 그대로 살아남는다.
    expect(collectIds(result)).toEqual(['normal'])
  })
})

interface TreeResponse {
  menu: Array<{
    id: string
    title: string
    sortOrder: number
    pages: Array<Record<string, unknown>>
    children: unknown[]
  }>
}

describe('GET /api/projects/:projectId/tree', () => {
  it('빈 프로젝트는 { menu: [] }', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: owner.cookie })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ menu: [] })
    })
  })

  it('메뉴 2단 + 페이지 3개가 정확한 형태로 온다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const parent = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원관리' })
      const child = await createMenuNode(ctx, owner.cookie, project.id, { parentId: parent.id, title: '권한' })
      const p1 = await createPage(ctx, owner.cookie, project.id, parent.id, { title: '목록' })
      const p2 = await createPage(ctx, owner.cookie, project.id, parent.id, { title: '상세' })
      const p3 = await createPage(ctx, owner.cookie, project.id, child.id, { title: '권한 목록' })

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: owner.cookie })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        menu: [
          {
            id: parent.id,
            title: '회원관리',
            sortOrder: 0,
            pages: [
              { id: p1.id, title: '목록', sortOrder: 0 },
              { id: p2.id, title: '상세', sortOrder: 1 },
            ],
            children: [
              {
                id: child.id,
                title: '권한',
                sortOrder: 0,
                pages: [{ id: p3.id, title: '권한 목록', sortOrder: 0 }],
                children: [],
              },
            ],
          },
        ],
      })
    })
  })

  it('다른 프로젝트의 메뉴·페이지가 섞이지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie)
      const projectB = await createProject(ctx, owner.cookie)
      const menuA = await createMenuNode(ctx, owner.cookie, projectA.id, { title: 'A 메뉴' })
      await createPage(ctx, owner.cookie, projectA.id, menuA.id, { title: 'A 페이지' })
      const menuB = await createMenuNode(ctx, owner.cookie, projectB.id, { title: 'B 메뉴' })
      await createPage(ctx, owner.cookie, projectB.id, menuB.id, { title: 'B 페이지' })

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectA.id}/tree`, cookies: owner.cookie })

      expect(res.statusCode).toBe(200)
      const body = res.json() as TreeResponse
      expect(body.menu.map((n) => n.title)).toEqual(['A 메뉴'])
      expect(body.menu[0]?.pages.map((p) => p.title)).toEqual(['A 페이지'])
    })
  })

  it('viewer 조회 가능', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: viewer.cookie })

      expect(res.statusCode).toBe(200)
    })
  })

  it('비멤버는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const outsider = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: outsider.cookie })

      expect(res.statusCode).toBe(404)
    })
  })

  it('미인증은 401', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree` })

      expect(res.statusCode).toBe(401)
    })
  })

  it('페이지 스키마는 트리에 실리지 않는다 (목록이 무거워지면 안 된다)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, cookies: owner.cookie })

      const body = res.json() as TreeResponse
      const page = body.menu[0]?.pages[0]
      expect(page).toBeDefined()
      // schema가 없다는 것만으로는 "혹시 다른 이름으로 새는가"를 못 잡는다 — 페이지
      // 응답의 키 집합 전체를 고정해, id·title·sortOrder 외에는 아무것도 없음을 본다.
      expect(Object.keys(page as object).sort()).toEqual(['id', 'sortOrder', 'title'])
    })
  })
})

describe('완료 판정: 한 줄기 시나리오', () => {
  it('가입 → 프로젝트 → 초대 → 메뉴 → 페이지 → 스키마 저장 → 트리 조회가 한 줄기로 된다', async () => {
    await withApi(async (ctx) => {
      // 1. owner 가입, 프로젝트 생성
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie, { name: '관리자 화면' })

      // 2. editor 가입 후 초대 (실제 초대 API를 거친다 — DB 직접 삽입이 아니다)
      const editor = await signup(ctx)
      const inviteEditorRes = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: editor.user.email, role: 'editor' },
      })
      expect(inviteEditorRes.statusCode).toBe(201)

      // 3. editor가 메뉴 2단을 만든다
      const parentMenu = await createMenuNode(ctx, editor.cookie, project.id, { title: '회원관리' })
      const childMenu = await createMenuNode(ctx, editor.cookie, project.id, {
        parentId: parentMenu.id,
        title: '권한',
      })

      // 4. editor가 페이지를 만든다
      const page = await createPage(ctx, editor.cookie, project.id, childMenu.id, { title: '권한 목록' })

      // 5. editor가 실제 컴포넌트가 든 스키마를 PUT 한다 (SearchForm + List) — 빈
      // Page 하나만 넣으면 카탈로그 게이트를 진짜로 통과시키는지 검증하지 못한다.
      const schema = {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_search', type: 'SearchForm', props: { collapsed: false }, children: [] },
            {
              id: 'n_list',
              type: 'List',
              props: { items: 10, columns: ['이름', '이메일', '역할'], pagination: true },
            },
          ],
        },
      }
      const putSchemaRes = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: editor.cookie,
        payload: { schema },
      })
      expect(putSchemaRes.statusCode).toBe(200)
      expect(putSchemaRes.json().schema).toEqual(schema)

      // 6. owner가 트리를 조회해 메뉴·페이지가 보이는지 확인한다
      const treeRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tree`,
        cookies: owner.cookie,
      })
      expect(treeRes.statusCode).toBe(200)
      expect(treeRes.json()).toEqual({
        menu: [
          {
            id: parentMenu.id,
            title: '회원관리',
            sortOrder: 0,
            pages: [],
            children: [
              {
                id: childMenu.id,
                title: '권한',
                sortOrder: 0,
                pages: [{ id: page.id, title: '권한 목록', sortOrder: 0 }],
                children: [],
              },
            ],
          },
        ],
      })

      // 7. owner가 페이지를 조회해 스키마가 그대로인지 확인한다
      const getPageRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(getPageRes.statusCode).toBe(200)
      expect(getPageRes.json().schema).toEqual(schema)

      // 8. viewer 가입 후 초대 → 조회는 되고 스키마 PUT은 403인지 확인한다
      const viewer = await signup(ctx)
      const inviteViewerRes = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/members`,
        cookies: owner.cookie,
        payload: { email: viewer.user.email, role: 'viewer' },
      })
      expect(inviteViewerRes.statusCode).toBe(201)

      const viewerTreeRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tree`,
        cookies: viewer.cookie,
      })
      expect(viewerTreeRes.statusCode).toBe(200)

      const viewerGetPageRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: viewer.cookie,
      })
      expect(viewerGetPageRes.statusCode).toBe(200)

      const viewerPutSchemaRes = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: viewer.cookie,
        payload: { schema },
      })
      expect(viewerPutSchemaRes.statusCode).toBe(403)
    })
  })
})
