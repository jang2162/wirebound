/**
 * `POST /:projectId/pages/import` — 페이지 JSON 가져오기(설계서 「페이지 JSON」).
 *
 * **이 파일이 지키는 핵심은 하나다: *"실패했다고 말하는데 페이지는 남았다"*가 성립하지
 * 않는다.** 가져오기는 복원보다 앞 단계 쓰기가 많아 그 함정이 더 크다 — 아래
 * `실패하면 아무것도 남지 않는다` 무리가 그것을 실행으로 잰다.
 *
 * **수를 산문에 적지 않는다** — 세야 하는 것은 케이스가 질의로 만든다.
 */
import { describe, expect, it } from 'vitest'
import type { KyselyPlugin } from 'kysely'
import { WIREBOUND_PAGE_VERSION, type PageJson } from '@wirebound/schema'
import type { DbHandle } from '../src/db/tx'
import { listComments } from '../src/repos/comments'
import { importPage as runImport } from '../src/services/page-import'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 파일 하나. 파일의 id는 **일부러 `n_` 형식이 아니다** — 재발급을 눈으로 가르기 위해서다. */
function file(patch: Partial<PageJson> = {}): PageJson {
  return {
    wireboundVersion: WIREBOUND_PAGE_VERSION,
    page: { title: '가져온 회원 목록', description: '남의 프로젝트에서 온 페이지' },
    schema: {
      version: 5,
      root: {
        id: 'file_root',
        type: 'Page',
        children: [
          { id: 'file_form', type: 'SearchForm', marker: 2 },
          { id: 'file_list', type: 'List', marker: 1 },
        ],
      },
    },
    comments: [{ nodeId: 'file_list', body: '목록은 10개씩' }],
    ...patch,
  }
}

interface Fixture {
  projectId: string
  menuNodeId: string
  cookie: { wb_session: string }
}

async function fixture(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
  return { projectId: project.id, menuNodeId: menu.id, cookie: owner.cookie }
}

function importPage(ctx: TestContext, fx: Fixture, payload: unknown) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.projectId}/pages/import`,
    cookies: fx.cookie,
    payload: payload as never,
  })
}

/** 그 프로젝트의 페이지 행 전부. **응답이 아니라 DB를 본다** — "남았는가"를 묻는 자리다. */
async function pageRows(ctx: TestContext, projectId: string) {
  return ctx.db
    .selectFrom('pages')
    .select(['id', 'title', 'sort_order', 'head_seq'])
    .where('project_id', '=', projectId)
    .orderBy('sort_order', 'asc')
    .execute()
}

async function commentRows(ctx: TestContext, projectId: string) {
  return ctx.db
    .selectFrom('comments')
    .innerJoin('pages', 'pages.id', 'comments.page_id')
    .select(['comments.node_id', 'comments.body'])
    .where('pages.project_id', '=', projectId)
    .execute()
}

describe('페이지 JSON 가져오기', () => {
  it('파일로 페이지를 만들고 문서·번호를 그대로 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file() })

      expect(res.statusCode, res.body).toBe(201)
      const body = res.json() as {
        page: {
          id: string
          title: string
          description: string | null
          schema: { root: { children: { type: string; marker?: number; id: string }[] } }
          headSeq: number
        }
      }
      expect(body.page.title).toBe('가져온 회원 목록')
      expect(body.page.description).toBe('남의 프로젝트에서 온 페이지')
      expect(body.page.schema.root.children.map((node) => node.type)).toEqual(['SearchForm', 'List'])
      expect(body.page.schema.root.children.map((node) => node.marker)).toEqual([2, 1])
      // **id는 전부 새것이다** — 파일의 id가 하나도 남지 않는다(설계서 「페이지 JSON」).
      expect(JSON.stringify(body.page.schema)).not.toContain('file_')
    })
  })

  it('코멘트가 함께 들어가고 nodeId가 새 문서의 노드를 가리킨다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file() })
      expect(res.statusCode, res.body).toBe(201)

      const body = res.json() as {
        page: { id: string; schema: { root: { children: { id: string; type: string }[] } } }
        comments: { inserted: number; dangling: number }
      }
      const listId = body.page.schema.root.children.find((node) => node.type === 'List')?.id
      const rows = await commentRows(ctx, fx.projectId)

      expect(rows).toEqual([{ node_id: listId, body: '목록은 10개씩' }])
      expect(body.comments).toEqual({ inserted: 1, dangling: 0 })
    })
  })

  it('문서 쓰기가 편집 파이프라인을 지나 revision을 남긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file() })
      expect(res.statusCode, res.body).toBe(201)
      const pageId = (res.json() as { page: { id: string } }).page.id

      const revisions = await ctx.db.selectFrom('revisions').select(['seq', 'actor_type']).where('page_id', '=', pageId).execute()

      expect(revisions.map((row) => Number(row.seq))).toEqual([1])
      expect(revisions.map((row) => row.actor_type)).toEqual(['user'])
      expect((await pageRows(ctx, fx.projectId)).map((row) => Number(row.head_seq))).toEqual([1])
    })
  })

  it('대상 메뉴의 형제 끝에 붙고 sort_order가 연속이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await createPage(ctx, fx.cookie, fx.projectId, fx.menuNodeId, { title: '먼저 있던 페이지' })

      const first = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file() })
      const second = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file() })
      expect([first.statusCode, second.statusCode]).toEqual([201, 201])

      const rows = await pageRows(ctx, fx.projectId)
      expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2])
      expect(rows.map((row) => row.title)).toEqual(['먼저 있던 페이지', '가져온 회원 목록', '가져온 회원 목록'])
      // **같은 파일을 두 번 가져와도 충돌하지 않는다** — id를 그대로 넣는
      // `insertPageWithId`를 쓰면 두 번째 가져오기가 id 충돌로 죽는다.
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    })
  })

  it('제목을 덮어쓸 수 있다 — 같은 파일을 두 번 가져오면 트리에서 못 가른다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file(),
        title: '회원 목록 (사본)',
      })

      expect(res.statusCode, res.body).toBe(201)
      expect((res.json() as { page: { title: string } }).page.title).toBe('회원 목록 (사본)')
    })
  })

  it('파일의 트리에 없는 노드를 가리킨 코멘트는 들어가고, 응답이 그것을 갈라 센다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({
          comments: [
            { nodeId: 'file_list', body: '목록은 10개씩' },
            { nodeId: 'file_gone', body: '지워진 노드에 붙어 있던 말' },
          ],
        }),
      })

      expect(res.statusCode, res.body).toBe(201)
      expect((res.json() as { comments: unknown }).comments).toEqual({ inserted: 2, dangling: 1 })
      // 본문이 사라지지 않는다.
      expect((await commentRows(ctx, fx.projectId)).map((row) => row.body)).toContain('지워진 노드에 붙어 있던 말')
    })
  })

  it('번호 없는 노드를 가리킨 코멘트는 번호 없이 들어간다', async () => {
    // **번호를 새로 매기지 않는다.** 매기면 *"번호를 부여하는 자리"*가 `routes/comments.ts`
    // 말고 하나 더 생긴다 — 그 자리는 하나여야 한다. 그 상태는 화면이 이미
    // 갈라 보이는 정상 상태다 — 코멘트 탭의 무리 셋 중 *"번호가 없는 노드"*.
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({
          schema: {
            version: 5,
            root: { id: 'file_root', type: 'Page', children: [{ id: 'file_list', type: 'List' }] },
          },
          comments: [{ nodeId: 'file_list', body: '번호 없는 말' }],
        }),
      })

      expect(res.statusCode, res.body).toBe(201)
      const body = res.json() as {
        page: { schema: { root: { children: { marker?: number }[] } } }
        comments: { inserted: number; dangling: number }
      }
      expect(body.comments).toEqual({ inserted: 1, dangling: 0 })
      expect(body.page.schema.root.children[0]?.marker).toBeUndefined()
      expect((await commentRows(ctx, fx.projectId)).map((row) => row.body)).toEqual(['번호 없는 말'])
    })
  })

  it('layoutRef를 쓰지 않고, 쓰지 않았다고 말한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({ page: { title: '가져온 회원 목록', layoutRef: 'admin-lnb' } }),
      })

      expect(res.statusCode, res.body).toBe(201)
      const body = res.json() as { ignoredLayoutRef?: string }
      expect(body.ignoredLayoutRef).toBe('admin-lnb')
    })
  })

  it('layoutRef가 없으면 그 키를 만들지 않는다 — 없는 것을 흉내 내지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file() })

      expect(res.statusCode, res.body).toBe(201)
      expect('ignoredLayoutRef' in (res.json() as object)).toBe(false)
    })
  })
})

describe('가져오기가 거절하는 것', () => {
  it('모르는 wireboundVersion은 400이고 그 값을 말한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: { ...file(), wireboundVersion: '2' },
      })

      expect(res.statusCode, res.body).toBe(400)
      expect((res.json() as { error: { message: string } }).error.message).toContain('2')
    })
  })

  it('봉투가 규격이 아니면 400이고 **파일의 자리**를 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: { ...file(), comments: [{ marker: 1, nodeId: 'file_list', body: '가' }] },
      })

      expect(res.statusCode, res.body).toBe(400)
      const error = (res.json() as { error: { message: string; issues?: { path: string }[] } }).error
      expect(error.message).toContain('marker')
      expect(error.issues?.map((issue) => issue.path)).toContain('comments.0.marker')
    })
  })

  it('지원하지 않는 문서 버전은 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({ schema: { version: 999, root: { id: 'file_root', type: 'Page', children: [] } } }),
      })

      expect(res.statusCode, res.body).toBe(400)
      expect((res.json() as { error: { message: string } }).error.message).toContain('999')
    })
  })

  it('카탈로그 검증에 걸리면 422이고 이슈가 **파일의 노드 id**를 가리킨다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({
          schema: {
            version: 5,
            root: { id: 'file_root', type: 'Page', children: [{ id: 'file_odd', type: '없는타입' }] },
          },
          comments: [],
        }),
      })

      expect(res.statusCode, res.body).toBe(422)
      const error = (res.json() as { error: { issues?: { path: string; nodeId?: string | null }[] } }).error
      // 사용자에게 남는 것은 파일뿐이므로 **파일에서 찾을 수 있는 id**를 말해야 한다.
      expect(error.issues?.map((issue) => issue.nodeId)).toContain('file_odd')
      expect(error.issues?.every((issue) => issue.path.startsWith('/root'))).toBe(true)
    })
  })

  it('duplicate-id도 422다 — 미리보기가 막는 셋 중 하나', async () => {
    // **세 층이 같은 파일을 본다:** 게이트(`packages/schema`) · 여기(서버 상태) ·
    // 미리보기(`apps/web`). 셋이 같은 함수를 부르므로 갈릴 자리가 없다.
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({
          schema: {
            version: 5,
            root: {
              id: 'file_root',
              type: 'Page',
              children: [
                { id: 'same', type: 'List' },
                { id: 'same', type: 'List' },
              ],
            },
          },
          comments: [],
        }),
      })

      expect(res.statusCode, res.body).toBe(422)
      const error = (res.json() as { error: { issues?: { code?: string }[] } }).error
      expect(error.issues?.map((issue) => issue.code)).toContain('duplicate-id')
      expect(await pageRows(ctx, fx.projectId)).toEqual([])
    })
  })

  it('없는 메뉴 노드는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: '00000000-0000-4000-8000-000000000000',
        file: file(),
      })

      expect(res.statusCode, res.body).toBe(404)
    })
  })

  it('본문에 선언되지 않은 키가 있으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: file(), 알수없는키: 1 })

      expect(res.statusCode, res.body).toBe(400)
    })
  })
})

describe('파일 크기 — 상한은 이미 하나 있다', () => {
  /**
   * **가져오기는 파일 크기를 사용자가 정한다.** 그래도 우리 상한을 새로 두지 않는다. Fastify의 기본 본문
   * 상한(1MiB)이 이미 있고 **우리 코드에 닿기 전에** 끊는다 — 두 벌이 되면 어느 쪽이
   * 끊었는지가 응답에서 갈리지 않는다.
   *
   * 경계의 양쪽은 아래 두 케이스가 잰다. **413은 크기 때문이라고 말한다** — *"요청 형식이
   * 올바르지 않습니다"*를 내면 형식은 멀쩡하고 크기가 넘은 것이라 그 문장이 거짓이다.
   */
  it('1MiB를 넘는 본문은 413이고 **크기 때문이라고 말한다**', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const huge = file({
        schema: {
          version: 5,
          root: {
            id: 'file_root',
            type: 'Page',
            children: Array.from({ length: 5000 }, (_unused, index) => ({
              id: `file_${index}`,
              type: 'List',
              props: { columns: ['ㄱ'.repeat(200)] },
            })),
          },
        },
        comments: [],
      })

      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: huge })

      expect(res.statusCode).toBe(413)
      expect((res.json() as { error: { message: string } }).error.message).toContain('너무 큽니다')
      // **끊긴 자리가 우리 코드보다 앞이므로 아무것도 남지 않는다.**
      expect(await pageRows(ctx, fx.projectId)).toEqual([])
    })
  })

  it('상한 아래는 그대로 들어간다 — 음성 대조', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const big = file({
        schema: {
          version: 5,
          root: {
            id: 'file_root',
            type: 'Page',
            children: Array.from({ length: 1000 }, (_unused, index) => ({
              id: `file_${index}`,
              type: 'List',
              props: { columns: ['ㄱ'.repeat(200)] },
            })),
          },
        },
        comments: [],
      })

      const res = await importPage(ctx, fx, { menuNodeId: fx.menuNodeId, file: big })

      expect(res.statusCode, res.body.slice(0, 200)).toBe(201)
    })
  })
})

describe('실패하면 아무것도 남지 않는다', () => {
  /**
   * **문서의 NUL은 파이프라인이 잡는다.** `PUT .../schema`처럼 라우트에서 미리 끊지 않는
   * 것이 판정이다 — 그쪽은 실패 시점에 되돌릴 것이 없지만 여기는 **페이지가 이미 들어가
   * 있다.** 미리 끊으면 그 되돌림이 한 번도 실행되지 않아, 규칙이 지켜지는지 아무도 확인할
   * 수 없다(라우트 머리말의 근거).
   */
  it('문서에 NUL이 있으면 400이고 페이지가 남지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({
          schema: {
            version: 5,
            root: {
              id: 'file_root',
              type: 'Page',
              children: [{ id: 'file_list', type: 'List', props: { columns: ['없\u0000음'] } }],
            },
          },
          comments: [],
        }),
      })

      expect(res.statusCode, res.body).toBe(400)
      expect(await pageRows(ctx, fx.projectId)).toEqual([])
    })
  })

  it('코멘트에 NUL이 있으면 400이고 페이지도 문서도 남지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({ comments: [{ nodeId: 'file_list', body: '없\u0000음' }] }),
      })

      expect(res.statusCode, res.body).toBe(400)
      // **코멘트는 문서 쓰기 *뒤*에 들어간다** — 되돌리지 않으면 페이지와 revision이 남는다.
      expect(await pageRows(ctx, fx.projectId)).toEqual([])
      expect(await commentRows(ctx, fx.projectId)).toEqual([])
      const revisions = await ctx.db.selectFrom('revisions').select('id').execute()
      expect(revisions).toEqual([])
    })
  })

  /**
   * **제목·설명은 `insertPage`가 막는다**(`src/db/nul-guard.ts`의 `NulByteError` 머리말). 문서는
   * 파이프라인의 8단계가, 코멘트는 `repos/comments.ts`가 막는다 — 막지 않으면 `pg`의 raw 예외가
   * **500**으로 나간다(사용자가 보낸 글자 때문에 나는 실패는 500이 아니라 400이다 —
   * `repos/comments.ts` 머리말과 같은 판단).
   */
  it('제목에 NUL이 있으면 400이고(500이 아니다) 페이지가 남지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({ page: { title: '제\u0000목' } }),
      })

      expect(res.statusCode, res.body).toBe(400)
      expect(await pageRows(ctx, fx.projectId)).toEqual([])
    })
  })
})

/**
 * **가져오기는 트리 쓰기다** — `insertPage`가 프로젝트 행을 잡고(`lockProjectTree`) 트랜잭션 끝까지 쥔다. 그 동안 같은 프로젝트의
 * 다른 트리 쓰기가 줄을 서므로, 잠금 안의 일이 댓글 수를 따라가면 댓글 많은 파일 하나가 트리를 수 초 세운다(`repos/projects.ts`의
 * `lockProjectTree` 머리말 «대가»). **시간이 아니라 문장 수로 잰다** — 시간은 기계 부하에 흔들린다.
 */
describe('트리 잠금을 쥔 동안의 일이 댓글 수를 따라가지 않는다', () => {
  /** 서비스를 직접 부른다 — 트리 잠금을 잡고 쥐는 구간이 전부 `importPage` 안이다. 실행된 문장마다 `transformResult`가 한 번 불린다. */
  async function statementsFor(ctx: TestContext, commentCount: number): Promise<number> {
    const owner = await signup(ctx)
    const project = await createProject(ctx, owner.cookie)
    const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원' })
    let executed = 0
    const counter: KyselyPlugin = {
      transformQuery: (args) => args.node,
      transformResult: async (args) => {
        executed += 1
        return args.result
      },
    }
    const comments = Array.from({ length: commentCount }, (_unused, index) => ({ nodeId: 'file_list', body: `말 ${index}` }))
    const outcome = await runImport(ctx.db.withPlugin(counter) as DbHandle, {
      projectId: project.id,
      menuNodeId: menu.id,
      file: file({ comments }),
      actor: { type: 'user', id: owner.user.id, label: owner.user.name },
      authorId: owner.user.id,
    })
    expect(outcome.kind).toBe('imported')
    return executed
  }

  it('댓글 2 개와 40 개의 가져오기가 같은 수의 문장을 낸다', async () => {
    await withApi(async (ctx) => {
      const few = await statementsFor(ctx, 2)
      const many = await statementsFor(ctx, 40)

      expect(few).toBeGreaterThan(0)
      expect(many).toBe(few)
    })
  })

  /**
   * **한 문장으로 넣어도 순서가 파일의 순서다**(`repos/comments.ts`의 `insertImportedComments` 머리말 — `created_at`을 직접 매긴다).
   * 문장의 시각 하나를 모두에게 주면 동률이 나고 랜덤 `id`가 순서를 섞는다 — 이 케이스가 죽는다. 기본값 `clock_timestamp()`에
   * 맡기는 판은 한 행이 1µs 넘게 걸리는 기계에서 이 케이스를 통과한다(그 판이 틀리는 기계를 여기서 만들 수 없다).
   */
  it('코멘트 200 개가 파일의 순서대로 읽힌다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const bodies = Array.from({ length: 200 }, (_unused, index) => `말 ${index}`)
      const res = await importPage(ctx, fx, {
        menuNodeId: fx.menuNodeId,
        file: file({ comments: bodies.map((body, index) => ({ nodeId: index % 2 === 0 ? 'file_list' : 'file_form', body })) }),
      })
      expect(res.statusCode, res.body).toBe(201)

      const pageId = (res.json() as { page: { id: string } }).page.id
      const read = await listComments(ctx.db, pageId)
      expect(read.map((comment) => comment.body)).toEqual(bodies)
    })
  })
})
