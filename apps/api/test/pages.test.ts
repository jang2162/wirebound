import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CATALOG_TYPES,
  defineComponent,
  getComponent,
  listComponents,
  registerComponent,
  resetRegistry,
} from '@wirebound/schema'
import { withTransaction } from '../src/db/tx'
import { ensureCatalog } from '../src/schema-setup'
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

/** 존재하지 않는(그리고 문법적으로 유효한) uuid. `menu.test.ts`와 같은 관례. */
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

interface PageResponse {
  id: string
  menuNodeId: string
  title: string
  description: string | null
  sortOrder: number
  schemaVersion: number
  schema: { version: number; root: { id: string; type: string; children?: unknown[] } }
}

/** POST가 만드는 기본 문서와 형태가 같은 최소 유효 문서. `rootId`는 노드 id 패턴만 지키면 아무 값이나 된다. */
function minimalValidDoc(rootId = 'n_root') {
  return { version: 1, root: { id: rootId, type: 'Page', children: [] } }
}

/** 프로젝트 하나, 메뉴 하나, 그 메뉴 밑 페이지 하나를 만들어 돌려준다. PUT .../schema 테스트가 공유하는 픽스처. */
async function createProjectWithPage(ctx: TestContext, owner: SignedUpUser) {
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
  return { project, menu, page }
}

describe('ensureCatalog', () => {
  it('빈 레지스트리에는 카탈로그 전체를 설치하고, 다시 불러도(멱등) 늘어나지 않는다', () => {
    resetRegistry()
    expect(listComponents()).toHaveLength(0)

    ensureCatalog()
    expect(listComponents()).toHaveLength(CATALOG_TYPES.length)

    // 두 번째 호출: 레지스트리가 이미 채워져 있으니 아무것도 하지 않아야 한다.
    // installCatalog 자체도 멱등하지만(이미 등록된 타입은 건너뛴다), 이 단정은
    // ensureCatalog의 길이 검사 자체가 통과 뒤에도 무해한지를 본다.
    ensureCatalog()
    expect(listComponents()).toHaveLength(CATALOG_TYPES.length)

    // 이후 다른 테스트가 실제 카탈로그를 전제하므로 정상 상태로 남겨 둔다.
  })

  it('레지스트리가 비어 있지 않으면 카탈로그를 설치하지 않는다', () => {
    resetRegistry()
    const marker = defineComponent({
      type: '__matrix_marker__',
      props: z.strictObject({}),
      editor: [],
      structures: ['default'],
      parts: [],
      variants: [],
      states: [],
      children: 'none',
    })
    registerComponent(marker)

    ensureCatalog()

    // 가드(listComponents().length === 0)가 없었다면 installCatalog이 그대로 불려
    // 'Page' 같은 실제 카탈로그 타입이 여기서 새로 등록됐을 것이다. 레지스트리가
    // 이미 비어있지 않다는 이유로 ensureCatalog이 정말 아무 일도 하지 않았는지 본다.
    expect(getComponent('Page')).toBeUndefined()
    expect(getComponent('__matrix_marker__')).toBeDefined()
    expect(listComponents()).toHaveLength(1)

    // 이후 테스트가 실제 카탈로그를 필요로 하므로 정상 상태로 되돌린다.
    resetRegistry()
    ensureCatalog()
    expect(listComponents()).toHaveLength(CATALOG_TYPES.length)
  })
})

describe('POST /api/projects/:projectId/pages', () => {
  it('201로 페이지가 생성된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages`,
        cookies: owner.cookie,
        payload: { menuNodeId: menu.id, title: '새 페이지' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ menuNodeId: menu.id, title: '새 페이지', description: null, sortOrder: 0 })

      const row = await ctx.db.selectFrom('pages').select('id').where('menu_node_id', '=', menu.id).executeTakeFirst()
      expect(row).toBeDefined()
    })
  })

  it('루트가 Page이고 유효한 노드 id를 갖는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages`,
        cookies: owner.cookie,
        payload: { menuNodeId: menu.id, title: '새 페이지' },
      })
      const body = res.json() as PageResponse
      expect(body.schema.root.type).toBe('Page')
      expect(body.schema.root.id).toMatch(/^n_[0-9a-f]{12}$/)
      expect(body.schema.root.children).toEqual([])
    })
  })

  it('schemaVersion이 CURRENT_DOCUMENT_VERSION이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages`,
        cookies: owner.cookie,
        payload: { menuNodeId: menu.id, title: '새 페이지' },
      })
      const body = res.json() as PageResponse
      expect(body.schemaVersion).toBe(1)
      expect(body.schema.version).toBe(1)
    })
  })

  it('같은 메뉴 안에서 sortOrder가 0,1,2로 부여된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const first = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '첫' })
      const second = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '둘' })
      const third = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '셋' })

      expect([first.sortOrder, second.sortOrder, third.sortOrder]).toEqual([0, 1, 2])
    })
  })

  it('없는 menuNodeId는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages`,
        cookies: owner.cookie,
        payload: { menuNodeId: NONEXISTENT_UUID, title: '페이지' },
      })
      expect(res.statusCode).toBe(404)

      const rows = await ctx.db.selectFrom('pages').selectAll().where('project_id', '=', project.id).execute()
      expect(rows).toHaveLength(0)
    })
  })

  it('다른 프로젝트의 menuNodeId는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie)
      const projectB = await createProject(ctx, owner.cookie)
      const menuInB = await createMenuNode(ctx, owner.cookie, projectB.id, { title: 'B 메뉴' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${projectA.id}/pages`,
        cookies: owner.cookie,
        payload: { menuNodeId: menuInB.id, title: '페이지' },
      })
      expect(res.statusCode).toBe(404)

      const rows = await ctx.db.selectFrom('pages').selectAll().where('project_id', '=', projectA.id).execute()
      expect(rows).toHaveLength(0)
    })
  })

  it('빈 title은 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages`,
        cookies: owner.cookie,
        payload: { menuNodeId: menu.id, title: '' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('viewer는 403', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages`,
        cookies: viewer.cookie,
        payload: { menuNodeId: menu.id, title: '페이지' },
      })
      expect(res.statusCode).toBe(403)
    })
  })
})

describe('GET /api/projects/:projectId/pages/:pageId', () => {
  it('저장한 스키마를 그대로 돌려준다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as PageResponse
      expect(body).toMatchObject({
        id: page.id,
        menuNodeId: page.menuNodeId,
        title: page.title,
        schemaVersion: page.schemaVersion,
      })
      expect(body.schema).toEqual(page.schema)
    })
  })

  it('다른 프로젝트의 pageId는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const projectA = await createProject(ctx, owner.cookie)
      const { page: pageInB } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${projectA.id}/pages/${pageInB.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('없는 id는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${NONEXISTENT_UUID}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('viewer도 조회 가능', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: viewer.cookie,
      })
      expect(res.statusCode).toBe(200)
    })
  })

  it('schemaVersion은 항상 schema.version과 같다 (컬럼이 문서 안 버전과 어긋나 있어도)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      // 오늘은 @wirebound/schema의 MIGRATIONS가 비어 있어 실제 마이그레이션으로
      // schema.version을 끌어올릴 방법이 없다 — 라우트도 migrateDocument를 기본
      // 인자(내장 MIGRATIONS·CURRENT_DOCUMENT_VERSION)로만 부르므로 이 테스트에서
      // 다른 마이그레이션 체인을 주입할 수도 없다. 대신 "저장된 schema_version
      // 컬럼이 문서 내부 버전과 어긋난" 상태를 DB에 직접 만들어 같은 모양의
      // 불일치를 재현한다 — 실제 마이그레이션이 문서를 올렸는데 컬럼 갱신이
      // 따라가지 못한 상황과 관찰 가능한 결과가 동일하다: "응답의 schemaVersion이
      // 컬럼값을 그대로 흘려보내는가, 아니면 방금 만든 migrated 결과에서
      // 파생되는가"라는, 이 버그가 실제로 갈리는 지점을 정확히 건드린다.
      await ctx.db.updateTable('pages').set({ schema_version: 999 }).where('id', '=', page.id).execute()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as PageResponse
      expect(body.schemaVersion).toBe(body.schema.version)
      expect(body.schemaVersion).not.toBe(999)
    })
  })
})

describe('PATCH /api/projects/:projectId/pages/:pageId', () => {
  it('제목을 바꾼다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
        payload: { title: '바뀐 제목' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().title).toBe('바뀐 제목')

      const row = await ctx.db.selectFrom('pages').select('title').where('id', '=', page.id).executeTakeFirstOrThrow()
      expect(row.title).toBe('바뀐 제목')
    })
  })

  it('다른 메뉴로 이동 시 양쪽 메뉴의 sortOrder가 재번호된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menuA = await createMenuNode(ctx, owner.cookie, project.id, { title: 'A' })
      const menuB = await createMenuNode(ctx, owner.cookie, project.id, { title: 'B' })
      const a = await createPage(ctx, owner.cookie, project.id, menuA.id, { title: '가' })
      // 가운데를 옮겨서 재번호가 "빠진 자리를 당긴다"를 정말 하는지 본다
      // (끝을 옮기면 재번호할 대상 자체가 없어 이 테스트가 공허해진다).
      const b = await createPage(ctx, owner.cookie, project.id, menuA.id, { title: '나' })
      const c = await createPage(ctx, owner.cookie, project.id, menuA.id, { title: '다' })
      const pB = await createPage(ctx, owner.cookie, project.id, menuB.id, { title: 'B의 페이지' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${b.id}`,
        cookies: owner.cookie,
        payload: { menuNodeId: menuB.id },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: b.id, menuNodeId: menuB.id, sortOrder: 1 })

      const aRows = await ctx.db
        .selectFrom('pages')
        .select(['id', 'sort_order'])
        .where('menu_node_id', '=', menuA.id)
        .orderBy('sort_order', 'asc')
        .execute()
      expect(aRows.map((r) => r.id)).toEqual([a.id, c.id])
      expect(aRows.map((r) => r.sort_order)).toEqual([0, 1])

      const bRows = await ctx.db
        .selectFrom('pages')
        .select(['id', 'sort_order'])
        .where('menu_node_id', '=', menuB.id)
        .orderBy('sort_order', 'asc')
        .execute()
      expect(bRows.map((r) => r.id)).toEqual([pB.id, b.id])
      expect(bRows.map((r) => r.sort_order)).toEqual([0, 1])
    })
  })

  it('다른 프로젝트의 menuNodeId로 이동은 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project: projectA, page } = await createProjectWithPage(ctx, owner)
      const projectB = await createProject(ctx, owner.cookie)
      const menuInB = await createMenuNode(ctx, owner.cookie, projectB.id, { title: 'B 메뉴' })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectA.id}/pages/${page.id}`,
        cookies: owner.cookie,
        payload: { menuNodeId: menuInB.id },
      })
      expect(res.statusCode).toBe(404)

      const row = await ctx.db.selectFrom('pages').select('menu_node_id').where('id', '=', page.id).executeTakeFirstOrThrow()
      expect(row.menu_node_id).toBe(page.menuNodeId)
    })
  })
})

describe('PUT /api/projects/:projectId/pages/:pageId/schema', () => {
  it('유효한 문서를 저장하고 GET으로 되읽는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const doc = {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [{ id: 'n_text', type: 'Text', props: { content: '안녕' } }],
        },
      }

      const putRes = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: owner.cookie,
        payload: { schema: doc },
      })
      expect(putRes.statusCode).toBe(200)
      expect(putRes.json().schema).toEqual(doc)

      const getRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(getRes.statusCode).toBe(200)
      expect(getRes.json().schema).toEqual(doc)
    })
  })

  describe('봉투 위반 → 400', () => {
    it('root.id가 null이면 400', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: { schema: { version: 1, root: { id: null, type: 'Page', children: [] } } },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('bad-request')
      })
    })

    it('version이 없으면 400', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: { schema: { root: { id: 'n_root', type: 'Page', children: [] } } },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('bad-request')
      })
    })

    it('선언되지 않은 키(예: style)가 있으면 400', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: {
            schema: {
              version: 1,
              root: { id: 'n_root', type: 'Page', children: [], style: { color: 'red' } },
            },
          },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('bad-request')
      })
    })

    it('지원하지 않는 버전(현재보다 큼)이면 400', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: { schema: { version: 2, root: { id: 'n_root', type: 'Page', children: [] } } },
        })
        // 이 케이스는 1단계(zod 파싱)를 통과한다 — version:2는 그 자체로 유효한
        // 양의 정수다. 400은 2단계(migrateDocument가 지원하지 않는 버전에 대해
        // 던짐)에서 나온다 — 1단계와는 다른 코드 경로지만 같은 400이다.
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('bad-request')
      })
    })
  })

  describe('카탈로그 위반 → 422', () => {
    it('알 수 없는 type이면 422', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: {
            schema: {
              version: 1,
              root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Bogus' }] },
            },
          },
        })
        expect(res.statusCode).toBe(422)
        expect(res.json().error.code).toBe('validation-failed')
        expect(res.json().error.issues[0].code).toBe('unknown-type')
      })
    })

    it('props 타입 오류면 422', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: {
            schema: {
              version: 1,
              root: {
                id: 'n_root',
                type: 'Page',
                children: [{ id: 'n_text', type: 'Text', props: { content: 123 } }],
              },
            },
          },
        })
        expect(res.statusCode).toBe(422)
        expect(res.json().error.issues[0].code).toBe('invalid-props')
      })
    })

    it('Slot을 포함하면 422', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: {
            schema: {
              version: 1,
              root: { id: 'n_root', type: 'Page', children: [{ id: 'n_slot', type: 'Slot' }] },
            },
          },
        })
        expect(res.statusCode).toBe(422)
        expect(res.json().error.issues[0].code).toBe('slot-count')
      })
    })

    it('id가 중복되면 422', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: {
            schema: {
              version: 1,
              root: {
                id: 'n_root',
                type: 'Page',
                children: [
                  { id: 'n_dup', type: 'Text' },
                  { id: 'n_dup', type: 'Text' },
                ],
              },
            },
          },
        })
        expect(res.statusCode).toBe(422)
        expect(res.json().error.issues[0].code).toBe('duplicate-id')
      })
    })

    it('루트가 Page가 아니면 422', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${project.id}/pages/${page.id}/schema`,
          cookies: owner.cookie,
          payload: { schema: { version: 1, root: { id: 'n_root', type: 'Section', children: [] } } },
        })
        expect(res.statusCode).toBe(422)
        expect(res.json().error.issues[0].code).toBe('bad-root')
      })
    })
  })

  it('422 응답의 issues[0]에 code·nodeId·path·message가 있다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: owner.cookie,
        payload: {
          schema: {
            version: 1,
            root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Bogus' }] },
          },
        },
      })
      expect(res.statusCode).toBe(422)
      const issue = res.json().error.issues[0]
      expect(issue).toMatchObject({
        code: 'unknown-type',
        nodeId: 'n_x',
        path: '/root/children/0',
      })
      expect(typeof issue.message).toBe('string')
      expect(issue.message.length).toBeGreaterThan(0)
    })
  })

  it('422 메시지가 한국어다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: owner.cookie,
        payload: {
          schema: {
            version: 1,
            root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Bogus' }] },
          },
        },
      })
      expect(res.json().error.message).toMatch(/[가-힣]/)
      expect(res.json().error.issues[0].message).toMatch(/[가-힣]/)
    })
  })

  it('실패해도 기존 스키마가 그대로다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)
      const originalSchema = page.schema

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: owner.cookie,
        payload: {
          schema: {
            version: 1,
            root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Bogus' }] },
          },
        },
      })
      expect(res.statusCode).toBe(422)

      // 응답(GET)과 DB 원본 둘 다 확인한다 — 이 게이트가 존재하는 핵심 이유다.
      const getRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(getRes.json().schema).toEqual(originalSchema)

      const row = await ctx.db
        .selectFrom('pages')
        .select(['schema', 'schema_version'])
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()
      expect(row.schema).toEqual(originalSchema)
      expect(row.schema_version).toBe(page.schemaVersion)
    })
  })

  it('없는 pageId는 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${NONEXISTENT_UUID}/schema`,
        cookies: owner.cookie,
        payload: { schema: minimalValidDoc() },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('viewer는 403', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const viewer = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: viewer.cookie,
        payload: { schema: minimalValidDoc() },
      })
      expect(res.statusCode).toBe(403)
    })
  })
})

describe('DELETE /api/projects/:projectId/pages/:pageId', () => {
  it('204로 지운다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const row = await ctx.db.selectFrom('pages').selectAll().where('id', '=', page.id).executeTakeFirst()
      expect(row).toBeUndefined()
    })
  })

  it('이후 GET은 404', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(404)
    })
  })

  it('메뉴의 남은 페이지가 재번호된다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      const a = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '가' })
      const b = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '나' })
      const c = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '다' })

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/pages/${b.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const rows = await ctx.db
        .selectFrom('pages')
        .select(['id', 'sort_order'])
        .where('menu_node_id', '=', menu.id)
        .orderBy('sort_order', 'asc')
        .execute()
      expect(rows.map((r) => r.id)).toEqual([a.id, c.id])
      expect(rows.map((r) => r.sort_order)).toEqual([0, 1])
    })
  })
})

describe('메뉴 연동', () => {
  it('페이지가 달린 메뉴는 삭제할 때 409다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/menu/${menu.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(409)

      const menuRow = await ctx.db.selectFrom('menu_nodes').select('id').where('id', '=', menu.id).executeTakeFirst()
      const pageRow = await ctx.db.selectFrom('pages').select('id').where('id', '=', page.id).executeTakeFirst()
      expect(menuRow).toBeDefined()
      expect(pageRow).toBeDefined()
    })
  })

  it('DB의 RESTRICT 제약도 페이지 있는 메뉴 삭제를 막는다 (앱 사전 검사를 거치지 않아도)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })

      // 라우트·리포지토리(=사전 확인)를 거치지 않고 DB에 직접 DELETE를 보낸다 —
      // `0004-pages` 마이그레이션의 `menu_node_id ... ON DELETE RESTRICT`가
      // 애플리케이션 검사 없이도 실제로 막아 서는지 확인한다. `withTransaction`으로
      // 감싸 이 의도된 위반이 `withApi`의 바깥 트랜잭션을 오염시키지 않게 한다.
      await expect(
        withTransaction(ctx.db, (trx) => trx.deleteFrom('menu_nodes').where('id', '=', menu.id).execute()),
      ).rejects.toThrow()

      // 세이브포인트가 없다면 여기서부터 25P02로 실패한다 — 통과 자체가 증거다.
      const row = await ctx.db.selectFrom('menu_nodes').select('id').where('id', '=', menu.id).executeTakeFirst()
      expect(row).toBeDefined()
    })
  })
})
