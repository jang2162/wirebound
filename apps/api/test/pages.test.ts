import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CATALOG_TYPES,
  CURRENT_DOCUMENT_VERSION,
  applyOps,
  defineComponent,
  getComponent,
  listComponents,
  registerComponent,
  resetRegistry,
  PAGE_DESCRIPTION_MAX_LENGTH,
  type PageDocument,
} from '@wirebound/schema'
import { withTransaction } from '../src/db/tx'
import { ensureCatalog } from '../src/schema-setup'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type SignedUpUser, type TestContext } from './helpers'

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

/** POST가 만드는 빈 기본 문서와 확실히 다른(자식이 하나 있는) 유효 문서. revision 테스트들이 공유한다. */
function docWithText(content = '안녕') {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_text', type: 'Text', props: { content } }] },
  }
}

/** `PUT .../schema` 한 번. 아래 revision 테스트들이 공유한다. */
function putSchema(ctx: TestContext, projectId: string, pageId: string, cookie: { wb_session: string }, schema: unknown) {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/pages/${pageId}/schema`,
    cookies: cookie,
    payload: { schema } as never,
  })
}

/** 페이지의 `revisions` 행 전부를 seq 순으로 읽는다. */
function revisionRows(ctx: TestContext, pageId: string) {
  return ctx.db
    .selectFrom('revisions')
    .select(['id', 'seq', 'actor_type', 'actor_id', 'actor_label', 'ops', 'inverse'])
    .where('page_id', '=', pageId)
    .orderBy('seq')
    .execute()
}

/** 페이지의 현재 `head_seq`. `pg`가 int8을 문자열로 주므로 여기서 숫자로 바꾼다(`repos/pages.ts`의 `toRecord`와 같은 이유). */
async function headSeqOf(ctx: TestContext, pageId: string): Promise<number> {
  const row = await ctx.db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
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
      // 사람이 읽을 축은 필수다 — 이 표식은 화면에 서지 않지만 계약은 지나야 한다.
      label: '표식',
      description: '레지스트리 표식.',
      group: 'document',
      props: z.strictObject({}),
      editor: [],
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
      expect(body.schemaVersion).toBe(CURRENT_DOCUMENT_VERSION)
      expect(body.schema.version).toBe(CURRENT_DOCUMENT_VERSION)
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

  it('페이지 응답은 계약된 키만 담는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(Object.keys(res.json()).sort()).toEqual(
        ['description', 'headSeq', 'id', 'menuNodeId', 'schema', 'schemaVersion', 'sortOrder', 'title'].sort(),
      )
      // projectId가 새어 나가지 않는다 — 경로에 이미 있고, 응답 계약에 없다.
      expect(res.json()).not.toHaveProperty('projectId')
      expect(res.json().headSeq).toBe(0)
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

      // @wirebound/schema의 MIGRATIONS가 비어 있어 실제 마이그레이션으로
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

  it('저장된 문서 버전이 지원 범위를 넘으면 500이 아니라 400이다 (PUT과 같은 취급)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      // PUT은 저장 시점에 지원하지 않는 버전(migrateDocument가 던지는 경우)을 이미
      // 400으로 막으므로, 이런 문서는 정상 쓰기 경로로 생기지 않는다 —
      // 재현되는 상황은 배포 롤백이나, 여러 버전이 같은 DB를 공유하는 롤링 배포처럼
      // "이 프로세스보다 새 버전이 저장한 문서를 되읽는" 경우다. 그 상황을 DB에
      // 직접 만든다(위 테스트가 schema_version 컬럼만 어긋낸 것과 달리, 여기서는
      // 문서 안(root)의 version 자체를 올린다 — migrateDocument가 실제로 던지는
      // 조건은 `doc.version > target`이다).
      await ctx.db
        .updateTable('pages')
        .set({
          schema: JSON.stringify({ version: 999, root: { id: 'n_root', type: 'Page', children: [] } }),
          schema_version: 999,
        })
        .where('id', '=', page.id)
        .execute()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      // GET이 migrateDocument를 try/catch 없이 부르면 이 경로가 처리되지 않은 예외로
      // 500이 된다 — PUT의 동일 조건(위 '지원하지 않는 버전(현재보다 큼)이면 400')과
      // 다르게 취급되는 불일치다.
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('bad-request')

      // 500이 아니라는 것만으로는 부족하다 — 이 GET 자체가 그 페이지를 영구히
      // 막지 않는다는 것도 같이 본다: 트랜잭션이 살아 있어야 뒤이은 요청도 통과한다.
      const listRes = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
      })
      expect(listRes.statusCode).toBe(200)
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

  /**
   * ## 설명 갱신
   *
   * **`description` 갱신을 재는 것은 이 다섯이다.** 라우트의 `UpdatePageBody`가 그 키를 받고
   * `repos/pages.ts`가 그것을 쓰는데, 이 다섯이 없으면 그 이음이 자유롭다 —
   * `UpdatePageBody`에서 `description` 줄을 지워도, `repos/pages.ts`의
   * `patch.description !== undefined` 갈래를 지워도 아무것도 죽지 않는다.
   *
   * **역할 축은 여기 없다.** `permission-matrix.test.ts`의 *"페이지 수정"* 행이 소유한다
   * (`allowed: ['owner','editor']`) — 여기 한 벌 더 두면 그것이 두 벌이다.
   *
   * ### NUL 경계는 여기 없다 — `nul-text-inputs.test.ts`가 소유한다
   *
   * 아래 *"상한은 받고 상한+1은 400이다"*가 **길이** 경계를 소유한다. **NUL(`U+0000`)은
   * 그 옆의 다른 경계다:** `description`도 `title`도 400 이고 아무것도 안 바뀐다 — 막는
   * 자리는 저장소의 쓰기 함수다(`src/db/nul-guard.ts`의 `NulByteError` 머리말). 그 케이스는
   * `nul-text-inputs.test.ts`의 *"PATCH …/pages/:pageId title"* · *"PATCH …/pages/:pageId
   * description"*이 갖는다 — 여기 한 벌 더 두면 그것이 두 벌이다. 이 표를 읽는 사람이
   * «길이만 재면 되는구나»로 읽지 않게 적어 둔다.
   */
  it('설명을 바꾸고 되읽는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
        payload: { description: '회원을 찾고 고치는 화면' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().description).toBe('회원을 찾고 고치는 화면')

      // **응답만 보면 안 된다** — 응답을 요청 본문으로 만드는 구현도 그것을 통과한다.
      const read = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(read.json().description).toBe('회원을 찾고 고치는 화면')
    })
  })

  it('description: null은 설명을 지우고, 키가 없으면 그대로 둔다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)
      const patch = (payload: { title?: string; description?: string | null }) =>
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${project.id}/pages/${page.id}`,
          cookies: owner.cookie,
          payload,
        })

      await patch({ description: '있던 설명' })

      // **키가 없는 것은 "바꾸지 않는다"다.** 제목만 보내도 설명이 살아 있어야 한다 —
      // `updateMenu`의 `parentId`와 같은 계약이고, 이 갈래가 없으면 제목만 고쳐도
      // 설명이 조용히 지워진다.
      const kept = await patch({ title: '제목만 바꾼다' })
      expect(kept.json().description).toBe('있던 설명')

      const cleared = await patch({ description: null })
      expect(cleared.statusCode).toBe(200)
      expect(cleared.json().description).toBeNull()
    })
  })

  it('빈 문자열은 null로 접히지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
        payload: { description: '' },
      })
      expect(res.statusCode).toBe(200)
      // **`''`와 `null`은 다른 값이다**(`projects.description`과 같은 취급). 서버가 둘을
      // 합치면 화면이 "설명 없음"과 "빈 설명"을 가를 수 없다.
      expect(res.json().description).toBe('')
    })
  })

  it('상한은 받고 상한+1은 400이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)
      const patch = (description: string) =>
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${project.id}/pages/${page.id}`,
          cookies: owner.cookie,
          payload: { description },
        })

      // **수를 박지 않고 상수에서 만든다**(`comments.test.ts`의 본문 길이 케이스와 같은
      // 이유). 박으면 라우트가 그 상수에서 떨어져 나가도 이 케이스가 안 죽는다.
      expect((await patch('가'.repeat(PAGE_DESCRIPTION_MAX_LENGTH))).statusCode).toBe(200)

      const over = await patch('가'.repeat(PAGE_DESCRIPTION_MAX_LENGTH + 1))
      expect(over.statusCode).toBe(400)
      expect(over.json().error.issues[0].path).toBe('description')
    })
  })

  it('남이 그 페이지의 노드를 잠근 동안에도 설명은 바뀐다 — 잠금은 문서 안만 본다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)
      const other = await signup(ctx)
      await addMember(ctx, project.id, other.user.id, 'editor')

      const doc = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      const rootId = (doc.json().schema as PageDocument).root.id

      // 남이 이 페이지의 루트 노드를 쥔다. `PATCH .../ops`였다면 423이 날 자리다.
      ctx.app.realtime.locks.hold({
        projectId: project.id,
        pageId: page.id,
        nodeIds: [rootId],
        connectionId: 'conn-other',
        userId: other.user.id,
        userName: '남',
      })

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
        payload: { description: '남이 잠근 동안' },
      })
      // **소프트 잠금(설계서 「소프트 잠금」)의 `findLockConflict`는 문서 안 포인터를 본다.** `pages.description`은 문서
      // 밖 컬럼이라 이 라우트는 `lockConflictError`를 아예 지나지 않는다. **화면의 판정이
      // 이 값에 달려 있다** — 423이 나기 시작하면 화면이 말할 것이 생긴 것이고 이 케이스가
      // 먼저 죽는다.
      expect(res.statusCode).toBe(200)
      expect(res.json().description).toBe('남이 잠근 동안')
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
        version: CURRENT_DOCUMENT_VERSION,
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
          payload: { schema: { version: CURRENT_DOCUMENT_VERSION + 1, root: { id: 'n_root', type: 'Page', children: [] } } },
        })
        // 이 케이스는 1단계(zod 파싱)를 통과한다 — 지금보다 높은 판은 그 자체로 유효한
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

      const row = await ctx.db.selectFrom('pages').select(['schema', 'schema_version']).where('id', '=', page.id).executeTakeFirstOrThrow()
      expect(row.schema).toEqual(originalSchema)
      expect(row.schema_version).toBe(page.schemaVersion)
    })
  })

  it('NUL 문자(U+0000)가 담긴 props는 400이고, 트랜잭션이 오염되지 않아 다음 요청도 그대로 통과한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      // 'a b'의 가운데는 공백이 아니라 실제 NUL 문자다. `Text.content`는
      // `z.string()`(길이·패턴 제약 없음)이라 이 값은 봉투 검증(1단계, 타입만
      // 봄)과 카탈로그 검증(3단계, `props 타입 오류면 422` 테스트와 달리 타입은
      // 맞으므로 통과)을 둘 다 통과한다 — 그래서 실제 API 사용자가 흔히 만들
      // 수 있는 입력이다. 그런데도 `schema::jsonb` 캐스팅이 Postgres에서
      // 22P05로 죽는다 — 막지 않으면 이 요청이 500이다.
      const nul = String.fromCharCode(0)
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
              children: [{ id: 'n_text', type: 'Text', props: { content: `a${nul}b` } }],
            },
          },
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.message).toContain('NUL')

      // 이 뒤의 GET이 무엇을 증명하지 **않는지**만 적는다.
      //
      // 세이브포인트가 아니다. 여기서는 실패하는 SQL 자체가 없으므로
      // `withTransaction`이 있든 없든 이 단언은 통과한다. 저장 함수를 감싼
      // 세이브포인트가 실제로 바깥 트랜잭션을 지키는지는 라우트를 건너뛰고 저장소
      // 함수를 직접 부르는 `repos-revisions.test.ts`의 *"writePageSchemaAtSeq가 NUL 문자로
      // 인한 22P05로 실패해도, withTransaction의 세이브포인트가 바깥 트랜잭션을 지킨다"*만이
      // 증명한다.
      //
      // "라우트가 DB에 닿기 전에 막는다"도 아니다. 라우트 3.5단계와 파이프라인
      // 8단계가 같은 문안의 `badRequest`를 던지므로(`routes/pages.ts`의 3.5단계와
      // `toApiError`의 `nul-byte` 분기), 위 400과 이 200만으로는 둘 중 어느 쪽이
      // 걸렀는지 구분되지 않는다.
      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(after.statusCode).toBe(200)
      expect(after.json().schema).toEqual(page.schema)
    })
  })

  it('NUL 문자(U+0000)가 객체 "키"에 있어도 400이고, 트랜잭션이 오염되지 않는다 (interactions[].actions[].value)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const { project, page } = await createProjectWithPage(ctx, owner)

      // SetPropActionSchema의 value는 z.unknown()(packages/schema/src/envelope.ts)이고,
      // validateTree(packages/schema/src/validate.ts)는 액션의 value 내용을 전혀
      // 들여다보지 않는다 — 그래서 value가 아니라 그 안 객체의 "키"에 NUL을 심으면
      // 봉투 검증도 카탈로그 검증도 둘 다 통과한다. containsNulByte가 Object.values만
      // 훑으면 이 키는 보이지 않아 저장까지 도달해 22P05로 500이 난다 — 위 props 값
      // 테스트와 서로 다른 코드 경로(값 vs 키)를 확인한다.
      const nul = String.fromCharCode(0)
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
                {
                  id: 'n_text',
                  type: 'Text',
                  interactions: [
                    {
                      on: 'click',
                      actions: [{ type: 'setProp', target: 'n_text', prop: 'x', value: { [`a${nul}b`]: 1 } }],
                    },
                  ],
                },
              ],
            },
          },
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.message).toContain('NUL')

      // 값 테스트와 같은 이유로 트랜잭션 생존도 함께 본다.
      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(after.statusCode).toBe(200)
      expect(after.json().schema).toEqual(page.schema)
    })
  })

  /**
   * **`pages.schema`를 바꾸는 모든 경로가 revision을 남긴다. 예외 없다.**
   *
   * 이 절이 그 불변식을 `PUT .../schema`에 대해 고정한다. 예외를 두지 않는 이유:
   * PUT이 revision 없이 문서를 갈아 끼우면 `head_seq`는 그대로인데 문서만 달라져,
   * 그 뒤 클라이언트가 보내는 undo(=저장된 inverse의 재적용)가 **교체된 문서** 위에서
   * 돈다. 경로가 어긋나면 409로 튕기지만 우연히 살아 있으면 조용히 엉뚱한 값이
   * 들어간다 — 실패가 눈에 보이지 않는 종류라 코드가 아니라 이 테스트들이 막는다.
   */
  describe('revision을 남긴다', () => {
    it('PUT .../schema도 revision을 남긴다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        // 양성 대조: PUT 전에는 이력이 없다. 이 단언이 없으면 "원래부터 1행이었다"와
        // "PUT이 남겼다"를 구별하지 못한다.
        expect(await revisionRows(ctx, page.id)).toHaveLength(0)
        expect(await headSeqOf(ctx, page.id)).toBe(0)

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText())
        expect(res.statusCode, res.body).toBe(200)

        const rows = await revisionRows(ctx, page.id)
        expect(rows).toHaveLength(1)
        expect(Number(rows[0]?.seq)).toBe(1)
        expect(await headSeqOf(ctx, page.id)).toBe(1)
      })
    })

    it('그 revision의 ops는 replace /root와 replace /version 둘이다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)
        const doc = docWithText()

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, doc)
        expect(res.statusCode, res.body).toBe(200)

        const rows = await revisionRows(ctx, page.id)
        // 경로만 보면 값이 엉뚱해도(예: /version에 옛 버전을 싣거나 /root에 빈
        // 문서를 싣거나) 초록이므로 ops 전체를 못박는다. `/version`이 같은 값이어도
        // 생략하지 않는다는 규칙도 여기서 고정된다 — 빼면 배열 길이가 1이 된다.
        expect(rows[0]?.ops).toEqual([
          { op: 'replace', path: '/root', value: doc.root },
          { op: 'replace', path: '/version', value: doc.version },
        ])
      })
    })

    it('그 revision의 inverse를 적용하면 이전 문서로 돌아온다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)
        const before = page.schema

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText())
        expect(res.statusCode, res.body).toBe(200)

        const rows = await revisionRows(ctx, page.id)
        const inverse = rows[0]?.inverse
        expect(inverse).toBeDefined()

        // 저장된 문서(응답이 아니라 DB 원본)에 inverse를 적용해 원본으로 돌아오는지
        // 본다 — 이것이 undo가 실제로 기대는 성질이다. 응답을 쓰면 라우트가 응답에
        // 실은 문서와 DB에 쓴 문서가 갈라져도 초록이다.
        const stored = await ctx.db.selectFrom('pages').select('schema').where('id', '=', page.id).executeTakeFirstOrThrow()
        expect(stored.schema).not.toEqual(before)
        expect(applyOps(stored.schema as PageDocument, inverse ?? [])).toEqual(before)
      })
    })

    it('PUT 후 ops로 편집하려면 baseSeq가 1이어야 한다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const put = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText())
        expect(put.statusCode, put.body).toBe(200)

        const opsUrl = `/api/projects/${project.id}/pages/${page.id}/ops`
        const op = { op: 'add', path: '/root/children/1', value: { id: 'n_text2', type: 'Text', props: { content: 'x' } } }

        // PUT이 revision을 남기지 않았다면 head_seq가 0에 머물러 이 요청이 200이 된다.
        const stale = await ctx.app.inject({
          method: 'PATCH',
          url: opsUrl,
          cookies: owner.cookie,
          payload: { baseSeq: 0, ops: [op] },
        })
        expect(stale.statusCode, stale.body).toBe(409)

        // 양성 대조: baseSeq만 바꾼 같은 요청은 200이다 — 위 409가 ops 자체가
        // 잘못돼서 나온 것이 아님을 증명한다.
        const fresh = await ctx.app.inject({
          method: 'PATCH',
          url: opsUrl,
          cookies: owner.cookie,
          payload: { baseSeq: 1, ops: [op] },
        })
        expect(fresh.statusCode, fresh.body).toBe(200)
        expect(fresh.json().seq).toBe(2)
      })
    })

    it('봉투가 깨지면 400이고 revision을 남기지 않는다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, {
          version: 1,
          root: { id: null, type: 'Page', children: [] },
        })
        expect(res.statusCode, res.body).toBe(400)
        expect(await revisionRows(ctx, page.id)).toHaveLength(0)
        expect(await headSeqOf(ctx, page.id)).toBe(0)

        // 양성 대조 겸 더 강한 단언: 같은 URL에 유효한 문서를 보내면 200이고 그
        // revision의 seq는 **1**이다. 위 400이 조용히 head_seq를 올렸다면 여기서 2가 된다.
        const ok = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText())
        expect(ok.statusCode, ok.body).toBe(200)
        const rows = await revisionRows(ctx, page.id)
        expect(rows).toHaveLength(1)
        expect(Number(rows[0]?.seq)).toBe(1)
      })
    })

    it('카탈로그 위반이면 422이고 revision을 남기지 않는다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, {
          version: 1,
          root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Bogus' }] },
        })
        expect(res.statusCode, res.body).toBe(422)
        expect(await revisionRows(ctx, page.id)).toHaveLength(0)
        expect(await headSeqOf(ctx, page.id)).toBe(0)

        // 봉투 케이스와 같은 이유의 양성 대조.
        const ok = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText())
        expect(ok.statusCode, ok.body).toBe(200)
        const rows = await revisionRows(ctx, page.id)
        expect(rows).toHaveLength(1)
        expect(Number(rows[0]?.seq)).toBe(1)
      })
    })

    it('응답의 headSeq가 새 seq와 같다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const first = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText('첫째'))
        expect(first.statusCode, first.body).toBe(200)
        expect(first.json().headSeq).toBe(1)

        // 두 번 보내 2까지 확인한다. 1만 보면 라우트가 `headSeq: 1`을 상수로 박아도
        // 통과한다. 응답 조립이 편집 **전** 레코드의 headSeq를 흘려보내면 여기서 1이다.
        const second = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText('둘째'))
        expect(second.statusCode, second.body).toBe(200)
        expect(second.json().headSeq).toBe(2)
        expect(await headSeqOf(ctx, page.id)).toBe(2)
      })
    })

    it('revision의 actor가 PUT을 보낸 사용자다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const editor = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)
        await addMember(ctx, project.id, editor.user.id, 'editor')

        const res = await putSchema(ctx, project.id, page.id, editor.cookie, docWithText())
        expect(res.statusCode, res.body).toBe(200)

        const rows = await revisionRows(ctx, page.id)
        expect(rows[0]?.actor_type).toBe('user')
        // 라우트가 actor를 세션이 아니라 페이지 소유자에서 가져오면 이 단언이
        // 실패한다 — 그래서 owner가 아닌 editor로 편집한다(`revisions.test.ts`와 같은 이유).
        expect(rows[0]?.actor_id).toBe(editor.user.id)
        expect(rows[0]?.actor_label).toBe(editor.user.name)
        expect(rows[0]?.actor_id).not.toBe(owner.user.id)
      })
    })

    it('응답은 계약된 키만 담는다 (파이프라인 결과가 새어 나오지 않는다)', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText())
        expect(res.statusCode, res.body).toBe(200)

        // 응답 형태는 파이프라인을 타도 **바뀌지 않는다**. 파이프라인 결과(`seq`·
        // `revisionId`·`inverse`)를 그대로 스프레드하면 여기서 걸린다.
        expect(Object.keys(res.json()).sort()).toEqual([
          'description',
          'headSeq',
          'id',
          'menuNodeId',
          'schema',
          'schemaVersion',
          'sortOrder',
          'title',
        ])
        // 응답의 나머지 필드는 편집 전 레코드에서 온다 — 조립하다 뒤바뀌지 않았는지 본다.
        expect(res.json().title).toBe(page.title)
        expect(res.json().menuNodeId).toBe(page.menuNodeId)
        expect(res.json().sortOrder).toBe(page.sortOrder)
      })
    })
  })

  /**
   * **저장된 문서가 지원 범위 밖 버전일 때.** 이 절이 두 가지를 동시에 고정한다.
   *
   * 1. **라우트가 파이프라인 실패를 그대로 매핑한다.** `EditOutcome`의 여섯 사유 중
   *    다섯은 `PUT` 경로에서 그 앞 단계에 가려진다(`not-found`는 `findPageById`,
   *    `invalid`는 라우트 3단계, `nul-byte`는 3.5단계, `patch-failed`는 `/root`·
   *    `/version`이 항상 존재하는 경로라 발생 불가, `stale`은 `withApi`의 단일
   *    트랜잭션에서 만들 수 없다). `unsupported-version`만이 실제로 `toApiError`
   *    호출부까지 도달하므로, 이 절이 없으면 그 줄을 아무 에러로 바꿔도 스위트가 초록이다.
   * 2. **탈출구가 없다.** PUT도 파이프라인을 타고 그 2단계가 **저장된** 문서를
   *    마이그레이션하므로 GET·`PATCH .../ops`·`PUT .../schema` 셋이 전부 400이다 —
   *    **들어온** 문서만 마이그레이션해 저장된 문서를 통째로 덮어쓰는 길은 없다. 인지된 결과이고,
   *    복구 경로를 어떻게 줄지는 별도 설계 결정이다(`routes/pages.ts`의 GET 주석 참고).
   */
  describe('저장된 문서가 미지원 버전이면', () => {
    /** 저장된 `schema`의 버전만 지원 범위 밖으로 바꾼다. `edit-pipeline.test.ts`의 같은 기법(제약 위반 가능 경로라 withTransaction으로 감싼다). */
    async function seedUnsupportedVersion(ctx: TestContext, pageId: string): Promise<void> {
      await withTransaction(ctx.db, (trx) =>
        trx
          .updateTable('pages')
          .set({
            schema: JSON.stringify({
              version: CURRENT_DOCUMENT_VERSION + 1,
              root: { id: 'n_root', type: 'Page', children: [] },
            }),
          })
          .where('id', '=', pageId)
          .execute(),
      )
    }

    it('유효한 문서를 PUT해도 400이고 revision을 남기지 않는다', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)

        // 양성 대조: 심기 **전에는** 같은 문서가 200이고 revision이 1행 생긴다.
        // 이게 없으면 라우트가 아예 죽어도(모든 PUT이 400) 아래 단언이 통과한다.
        const beforeSeed = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText('심기 전'))
        expect(beforeSeed.statusCode, beforeSeed.body).toBe(200)
        expect(await revisionRows(ctx, page.id)).toHaveLength(1)

        await seedUnsupportedVersion(ctx, page.id)

        const res = await putSchema(ctx, project.id, page.id, owner.cookie, docWithText('심은 뒤'))
        expect(res.statusCode, res.body).toBe(400)
        expect(res.json().error.code).toBe('bad-request')
        // 메시지까지 못박는 이유: 400만 보면 `toApiError` 호출부를 아무 400짜리
        // 에러로 바꿔도 통과한다. 이 메시지는 파이프라인이 돌려준 `outcome.message`가
        // 그대로 실려야만 나온다(`migrateDocument`가 던지는 문구).
        expect(res.json().error.message).toBe(`지원하지 않는 문서 버전: ${CURRENT_DOCUMENT_VERSION + 1}`)

        // 아무것도 쓰이지 않았다 — 심기 전의 1행에서 늘지 않는다.
        expect(await revisionRows(ctx, page.id)).toHaveLength(1)
        expect(await headSeqOf(ctx, page.id)).toBe(1)
      })
    })

    it('들어온 문서가 카탈로그 위반이면 422다 (라우트의 사전 검증이 파이프라인보다 먼저다)', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)
        await seedUnsupportedVersion(ctx, page.id)

        // 이 픽스처에서만 라우트 3단계(`validatePage`)의 존재가 관측된다. 사전 검증이
        // 있으면 422(카탈로그 위반), 지우면 파이프라인 2단계가 먼저 죽어 400(미지원
        // 버전)이 된다. 다른 어떤 테스트도 이 차이를 보지 못한다 — 저장 문서가
        // 정상이면 라우트와 파이프라인이 바이트 단위로 같은 422를 내기 때문이다.
        const res = await putSchema(ctx, project.id, page.id, owner.cookie, {
          version: 1,
          root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Bogus' }] },
        })
        expect(res.statusCode, res.body).toBe(422)
        expect(res.json().error.code).toBe('validation-failed')
        expect(res.json().error.issues[0].code).toBe('unknown-type')
      })
    })

    it('들어온 문서에 NUL 문자가 있으면 400 NUL이다 (라우트의 3.5단계가 파이프라인보다 먼저다)', async () => {
      await withApi(async (ctx) => {
        const owner = await signup(ctx)
        const { project, page } = await createProjectWithPage(ctx, owner)
        await seedUnsupportedVersion(ctx, page.id)

        // 위와 같은 이유. 3.5단계를 지우면 파이프라인 2단계가 먼저 죽어 **같은
        // 400이지만 다른 메시지**('지원하지 않는 문서 버전')가 나온다 — 그래서
        // 상태 코드가 아니라 메시지가 판별력을 낸다.
        const nul = String.fromCharCode(0)
        const res = await putSchema(ctx, project.id, page.id, owner.cookie, {
          version: 1,
          root: { id: 'n_root', type: 'Page', children: [{ id: 'n_text', type: 'Text', props: { content: `a${nul}b` } }] },
        })
        expect(res.statusCode, res.body).toBe(400)
        expect(res.json().error.message).toContain('NUL')
      })
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
      await expect(withTransaction(ctx.db, (trx) => trx.deleteFrom('menu_nodes').where('id', '=', menu.id).execute())).rejects.toThrow()

      // 세이브포인트가 없다면 여기서부터 25P02로 실패한다 — 통과 자체가 증거다.
      const row = await ctx.db.selectFrom('menu_nodes').select('id').where('id', '=', menu.id).executeTakeFirst()
      expect(row).toBeDefined()
    })
  })
})
