/**
 * 복원 — 설계서 「스냅샷」의 되돌리는 쪽.
 *
 * 권한 세 등급은 `permission-matrix.test.ts`가 전수로 친다(그 파일의 완전성 검사가
 * `src/routes/`를 훑어 새 라우트를 강제로 표에 올린다). 여기서는 **무엇이 실제로 되돌아가는지**를 잰다.
 *
 * ---
 *
 * # 재는 방식 — 라우트로 부르고 **DB를 직접 읽어** 확인한다
 *
 * 응답의 요약만 보면 *"세었다고 말하는데 안 바뀌었다"*를 못 잡는다. 그래서 각 케이스가
 * 복원 뒤 해당 표를 직접 읽는다.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { PageDocument } from '@wirebound/schema'
import { listSnapshots } from '../src/repos/snapshots'
import { SAFETY_TAG_PREFIX, restoreActorLabel, restoreSnapshot } from '../src/services/restore'
import { ensureCatalog } from '../src/schema-setup'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type TestContext,
} from './helpers'

beforeEach(() => {
  ensureCatalog()
})

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '사용자 목록' })
  return { owner, project, menu, page, nodeId: (page.schema as { root: { id: string } }).root.id }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** 지금 상태를 태그로 얼린다 — **라우트를 실제로 부른다.** */
async function snapshot(ctx: TestContext, fx: Fixture, tag: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/snapshots`,
    cookies: fx.owner.cookie,
    payload: { tag },
  })
  if (res.statusCode !== 201) throw new Error(`스냅샷 픽스처 실패 (${res.statusCode}): ${res.body}`)
  return (res.json() as { id: string }).id
}

async function restore(ctx: TestContext, fx: Fixture, snapshotId: string, cookie = fx.owner.cookie) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`,
    cookies: cookie,
  })
}

interface RestoreBody {
  summary: {
    menu: { created: number; updated: number; deleted: number }
    pages: { created: number; metaUpdated: number; schemaChanged: number; schemaUnchanged: number; deleted: number }
    comments: { created: number; updated: number; deleted: number }
    layouts: { themeRefChanged: number }
  }
  safetySnapshot: { id: string; tag: string }
  themes: Array<{ layoutId: string; themeId: string | null; differs: boolean }>
}

async function addComment(ctx: TestContext, fx: Fixture, body: string, pageId = fx.page.id, nodeId = fx.nodeId) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/pages/${pageId}/comments`,
    cookies: fx.owner.cookie,
    payload: { nodeId, body },
  })
  if (res.statusCode !== 201) throw new Error(`코멘트 픽스처 실패 (${res.statusCode}): ${res.body}`)
  return (res.json() as { comment: { id: string } }).comment.id
}

/** 페이지 문서를 실제로 고친다 — `PUT .../schema`가 파이프라인을 탄다. */
async function editPage(ctx: TestContext, fx: Fixture, sectionId: string): Promise<void> {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/schema`,
    cookies: fx.owner.cookie,
    payload: {
      schema: {
        version: 1,
        root: { id: fx.nodeId, type: 'Page', children: [{ id: sectionId, type: 'Section', props: {} }] },
      },
    },
  })
  if (res.statusCode !== 200) throw new Error(`편집 픽스처 실패 (${res.statusCode}): ${res.body}`)
}

async function readPage(ctx: TestContext, pageId: string) {
  return ctx.db
    .selectFrom('pages')
    .select(['id', 'menu_node_id', 'title', 'description', 'sort_order', 'schema', 'head_seq'])
    .where('id', '=', pageId)
    .executeTakeFirst()
}

describe('아무것도 바뀌지 않았으면 아무것도 쓰지 않는다 — 안전망만 남는다', () => {
  it('요약이 전부 0이고 그대로인 페이지가 세어진다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(200)
      const body = res.json() as RestoreBody
      expect(body.summary.menu).toEqual({ created: 0, updated: 0, deleted: 0 })
      expect(body.summary.pages).toEqual({
        created: 0,
        metaUpdated: 0,
        schemaChanged: 0,
        schemaUnchanged: 1,
        deleted: 0,
      })
      expect(body.summary.comments).toEqual({ created: 0, updated: 0, deleted: 0 })
    })
  })

  it('그래도 안전망 스냅샷은 만든다 — 계획이 틀렸을 때를 위한 보험이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      const rows = await listSnapshots(ctx.db, fx.project.id)
      expect(rows.map((row) => row.tag).sort()).toEqual([body.safetySnapshot.tag, 'v1'].sort())
    })
  })

  /**
   * **안전망 태그의 형식을 고정한다.**
   *
   * 이 자리를 `tag.startsWith(SAFETY_TAG_PREFIX)`로 재면 **앞머리를 바꾸는 변이가 안
   * 죽는다** — 케이스가 구현과 같은 상수를 읽어 변이가 양쪽을 함께 움직인다. 아래
   * *"복원이 만든 revision은 평범한 편집과 구분된다"*의 `restoreActorLabel`과 **같은 부류**다.
   *
   * 그래서 형식을 **리터럴로** 적는다. 그 명제 자체는 옳다 — 화면이 *"되돌리려면 이것"*을
   * 가리키려면 사람이 목록에서 그 줄을 알아볼 수 있어야 하고, 그러려면 앞머리가
   * 고정돼 있어야 한다.
   */
  it('안전망 태그의 형식이 고정돼 있다 — `복원 전 <capturedAt>`', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      // 앞머리와 시각 형식을 **리터럴로** 못박는다. 상수를 읽지 않는다.
      expect(body.safetySnapshot.tag).toMatch(/^복원 전 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      // 상수와 케이스가 같은 것을 뜻하는지도 본다 — 둘이 갈리면 여기가 죽는다.
      expect(SAFETY_TAG_PREFIX).toBe('복원 전 ')

      // **그 시각이 안전망 payload의 `capturedAt`이다** — 아무 시각이 아니라 그 스냅샷이
      // *"내용을 마지막으로 확인한 순간"*이어야 목록에서 그 줄이 무엇인지 읽힌다.
      const saved = await ctx.db
        .selectFrom('snapshots')
        .select(['tag', 'payload'])
        .where('id', '=', body.safetySnapshot.id)
        .executeTakeFirstOrThrow()
      expect(saved.tag).toBe(`복원 전 ${(saved.payload as { capturedAt: string }).capturedAt}`)
    })
  })

  it('안전망의 설명이 무엇으로 되돌렸는지 말한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody
      const rows = await listSnapshots(ctx.db, fx.project.id)
      const safety = rows.find((row) => row.id === body.safetySnapshot.id)

      expect(safety?.description).toContain('"v1"')
      expect(safety?.description).toContain(id)
    })
  })

  it('내용이 같으면 revision을 만들지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      await restore(ctx, fx, id)

      const rows = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(rows).toHaveLength(0)
      const page = await readPage(ctx, fx.page.id)
      expect(Number(page?.head_seq)).toBe(0)
    })
  })
})

describe('되돌아가는 것들', () => {
  it('메뉴 제목이 되돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/menu/${fx.menu.id}`,
        cookies: fx.owner.cookie,
        payload: { title: '바뀐 제목' },
      })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.menu.updated).toBe(1)
      const row = await ctx.db.selectFrom('menu_nodes').select('title').where('id', '=', fx.menu.id).executeTakeFirst()
      expect(row?.title).toBe('설정')
    })
  })

  /**
   * **메타 갱신이 `description`을 실제로 쓰는가.** 계획 층의 케이스
   * (`페이지 설명만 달라도 메타를 갱신한다`)는 **repo가 그 값을 썼는지는 재지 않는다** —
   * 이 케이스가 없으면 그 값을 안 쓰는 변이가 산다. *"갱신한다고 계획했다"*와 *"그 값이 DB에
   * 들어갔다"*는 다른 명제다.
   */
  it('페이지 설명이 되돌아온다 — 계획이 아니라 DB에서 잰다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
        payload: { description: '그때 설명' },
      })
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
        payload: { description: '지금 설명' },
      })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.pages.metaUpdated).toBe(1)
      expect((await readPage(ctx, fx.page.id))?.description).toBe('그때 설명')
    })
  })

  /**
   * **부활한 메뉴의 `sort_order`.** 갱신 쪽은 `메뉴 순서가 되돌아온다`가 잡고 **생성
   * 쪽은 이 케이스가 잡는다.** 지운 메뉴가 되살아날 때 순서를 함께
   * 되돌리지 않으면 형제 그룹의 불변식(0부터 연속)이 깨진다.
   */
  it('되살아난 메뉴가 그때의 순서로 돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const second = await createMenuNode(ctx, fx.owner.cookie, fx.project.id, { title: '두 번째' })
      const third = await createMenuNode(ctx, fx.owner.cookie, fx.project.id, { title: '셋째' })
      const id = await snapshot(ctx, fx, 'v1')

      // 가운데를 지운다 — 라우트가 뒤를 당겨 셋째가 1이 된다.
      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/menu/${second.id}`,
        cookies: fx.owner.cookie,
      })
      const shifted = await ctx.db
        .selectFrom('menu_nodes')
        .select(['id', 'sort_order'])
        .where('id', '=', third.id)
        .executeTakeFirstOrThrow()
      expect(shifted.sort_order).toBe(1)

      await restore(ctx, fx, id)

      const rows = await ctx.db
        .selectFrom('menu_nodes')
        .select(['id', 'sort_order'])
        .where('project_id', '=', fx.project.id)
        .orderBy('sort_order', 'asc')
        .execute()
      expect(rows.map((row) => row.id)).toEqual([fx.menu.id, second.id, third.id])
      expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2])
    })
  })

  /**
   * **제목만 재면 `sort_order`를 쓰는지 알 수 없다** — 그 컬럼을 안 쓰는 변이가 **산다.**
   * 그래서 순서 자체를 잰다.
   */
  it('메뉴 순서가 되돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const second = await createMenuNode(ctx, fx.owner.cookie, fx.project.id, { title: '두 번째' })
      const id = await snapshot(ctx, fx, 'v1')

      // 두 번째를 맨 앞으로 옮긴다 — 제목은 아무것도 안 바뀐다.
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/menu/${second.id}`,
        cookies: fx.owner.cookie,
        payload: { sortOrder: 0 },
      })
      const moved = await ctx.db
        .selectFrom('menu_nodes')
        .select(['id', 'sort_order'])
        .where('project_id', '=', fx.project.id)
        .orderBy('sort_order', 'asc')
        .execute()
      expect(moved.map((row) => row.id)).toEqual([second.id, fx.menu.id])

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.menu.updated).toBe(2)
      const rows = await ctx.db
        .selectFrom('menu_nodes')
        .select(['id', 'sort_order'])
        .where('project_id', '=', fx.project.id)
        .orderBy('sort_order', 'asc')
        .execute()
      expect(rows.map((row) => row.id)).toEqual([fx.menu.id, second.id])
      expect(rows.map((row) => row.sort_order)).toEqual([0, 1])
    })
  })

  it('스냅샷 뒤에 만든 페이지가 지워진다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      const extra = await createPage(ctx, fx.owner.cookie, fx.project.id, fx.menu.id, { title: '새 페이지' })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.pages.deleted).toBe(1)
      expect(await readPage(ctx, extra.id)).toBeUndefined()
    })
  })

  it('스냅샷 뒤에 지운 페이지가 **같은 id로** 되살아난다 — 복원이지 복제가 아니다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      // **설명과 순서를 기본값에서 벗겨 둔다** — 둘 다 기본값이면 되살리지 않아도 우연히
      // 맞아 그 필드를 안 되살리는 변이가 산다.
      await createPage(ctx, fx.owner.cookie, fx.project.id, fx.menu.id, { title: '앞자리 페이지' })
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
        payload: { description: '되살아나야 하는 설명', sortOrder: 1 },
      })
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
      })
      expect(await readPage(ctx, fx.page.id)).toBeUndefined()

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.pages.created).toBe(1)
      const page = await readPage(ctx, fx.page.id)
      // **id가 같다.** 새 id를 발급하면 사람이 공유한 URL이 죽는다.
      expect(page?.id).toBe(fx.page.id)
      // **제목만 재면 나머지 필드를 되살리는지 알 수 없다** — 설명·순서·메뉴 셋이 안 잰
      // 축으로 남는다. 부활한 행 **전체**를 그때 값과 맞댄다.
      expect({
        title: page?.title,
        description: page?.description,
        sortOrder: page?.sort_order,
        menuNodeId: page?.menu_node_id,
      }).toEqual({
        title: '사용자 목록',
        description: '되살아나야 하는 설명',
        sortOrder: 1,
        menuNodeId: fx.menu.id,
      })
    })
  })

  /**
   * **되살아난 페이지의 `head_seq`는 그 id 가 쓴 마지막 번호 다음이다**(`repos/pages.ts`의 `insertPageWithId`) — 스냅샷이 적은 번호가
   * 아니라 지울 때의 번호다. 그 번호에는 revision 행이 없다 — 그 페이지가 지워질 때 `revisions.page_id`의 CASCADE가 이력을
   * 데려갔다. **복원이 되살릴 수 있는 것은 문서이지 이력이 아니다.**
   */
  it('되살아난 페이지는 지울 때의 번호 다음에서 센다 — 이력은 되살아나지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      // 스냅샷 뒤의 편집 — 스냅샷이 적은 번호(1)보다 지울 때의 번호(2)가 크다.
      await editPage(ctx, fx, 'n_sec2')
      expect(Number((await readPage(ctx, fx.page.id))?.head_seq)).toBe(2)

      await deletePageRoute(ctx, fx, fx.page.id)
      await restore(ctx, fx, id)

      const page = await readPage(ctx, fx.page.id)
      expect(Number(page?.head_seq)).toBe(3)
      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(0)
      // 문서는 그때 그것이다.
      expect((page?.schema as PageDocument).root.children?.[0]?.id).toBe('n_sec1')
    })
  })

  it('페이지 문서가 되돌아오고 그 되돌림이 revision으로 남는다 — 설계서 「스냅샷」', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      await editPage(ctx, fx, 'n_sec2')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.pages.schemaChanged).toBe(1)
      const page = await readPage(ctx, fx.page.id)
      expect((page?.schema as PageDocument).root.children?.[0]?.id).toBe('n_sec1')
      // 이력을 지우지 않는다 — 되돌림이 **새 revision**으로 append된다(설계서 「스냅샷」).
      expect(Number(page?.head_seq)).toBe(3)
    })
  })

  it('복원이 만든 revision은 평범한 편집과 구분된다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await editPage(ctx, fx, 'n_sec2')

      await restore(ctx, fx, id)

      const rows = await ctx.db
        .selectFrom('revisions')
        .select(['actor_type', 'actor_id', 'actor_label', 'seq'])
        .where('page_id', '=', fx.page.id)
        .orderBy('seq', 'asc')
        .execute()

      // **형식을 리터럴로 적는다 — `restoreActorLabel('v1')`로 적으면 이 케이스가 죽지 않는다.**
      // 그 함수가 `tag`를 그대로 내도록 변이를 심어도 **안 죽는다** — 케이스가 구현과 같은
      // 함수를 불러 양쪽이 함께 움직이기 때문이다. *"불변량을 재는 케이스는 그 불변량이
      // 고정하지 않는 축을 잴 수 없다"*와 같은 부류다.
      expect(rows.map((row) => row.actor_label)).toEqual([fx.owner.user.name, '복원: v1'])
      // 형식을 만드는 쪽과 케이스가 같은 값을 뜻하는지도 함께 본다(둘이 갈리면 여기가 죽는다).
      expect(restoreActorLabel('v1')).toBe('복원: v1')
      expect(rows.at(-1)?.actor_type).toBe('user')
      expect(rows.at(-1)?.actor_id).toBe(fx.owner.user.id)
    })
  })
})

describe('코멘트', () => {
  it('스냅샷 뒤에 단 코멘트가 지워지고, 지운 코멘트가 같은 id로 되살아난다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const kept = await addComment(ctx, fx, '남을 코멘트')
      const id = await snapshot(ctx, fx, 'v1')
      const extra = await addComment(ctx, fx, '지워질 코멘트')
      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments/${kept}`,
        cookies: fx.owner.cookie,
      })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.comments).toEqual({ created: 1, updated: 0, deleted: 1 })
      const rows = await ctx.db.selectFrom('comments').select(['id', 'body']).where('page_id', '=', fx.page.id).execute()
      expect(rows.map((row) => row.id)).toEqual([kept])
      expect(rows.map((row) => row.body)).toEqual(['남을 코멘트'])
      expect(rows.map((row) => row.id)).not.toContain(extra)
    })
  })

  it('본문이 되돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const commentId = await addComment(ctx, fx, '그때')
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments/${commentId}`,
        cookies: fx.owner.cookie,
        payload: { body: '지금' },
      })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.comments.updated).toBe(1)
      const row = await ctx.db.selectFrom('comments').select('body').where('id', '=', commentId).executeTakeFirst()
      expect(row?.body).toBe('그때')
    })
  })

  /**
   * **되살아난 코멘트의 `created_at`이 그때의 값이어야 한다.** 컬럼 기본값
   * (`clock_timestamp()`)에 맡기면 복원된 코멘트가 전부 복원 시각을 갖고, 이 표의 스레드
   * 순서는 시각뿐이므로(0008) *"먼저 단 말이 먼저 나온다"*가 깨진다.
   */
  it('되살아난 코멘트가 그때의 순서를 지킨다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const first = await addComment(ctx, fx, '첫째')
      const second = await addComment(ctx, fx, '둘째')
      const id = await snapshot(ctx, fx, 'v1')
      // 둘 다 지운 뒤 복원한다 — 되살아나는 순서가 삽입 순서가 아니라 payload의 시각을 따라야 한다.
      for (const commentId of [first, second]) {
        await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments/${commentId}`,
          cookies: fx.owner.cookie,
        })
      }

      await restore(ctx, fx, id)

      const rows = await ctx.db
        .selectFrom('comments')
        .select(['id', 'body', 'created_at'])
        .where('page_id', '=', fx.page.id)
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .execute()
      expect(rows.map((row) => row.body)).toEqual(['첫째', '둘째'])

      // **순서만 재면 이 케이스는 아무것도 고정하지 못한다.** 시각을 심지 않는
      // 변이(컬럼 기본값 `clock_timestamp()`에 맡긴다)를 심어도 **안 죽는다**:
      // 복원이 payload 순서대로 넣으므로 기본값도 같은 순서를 만든다. 순서는 두 선택지가
      // **동시에 만족하는 불변량**이라 선택을 고정하지 못한다.
      //
      // **그래서 값 자체를 본다.** 복원된 `created_at`이 payload의 그 값이어야 한다.
      const payload = (
        await ctx.db.selectFrom('snapshots').select('payload').where('id', '=', id).executeTakeFirstOrThrow()
      ).payload as { comments: Array<{ id: string; createdAt: string }> }
      const wantById = new Map(payload.comments.map((entry) => [entry.id, entry.createdAt]))
      expect(rows.map((row) => row.created_at.toISOString())).toEqual(rows.map((row) => wantById.get(row.id)))
    })
  })

  /**
   * **문서의 `marker`와 코멘트 행이 같은 payload에서 온다.**
   * 코멘트의 규칙(*"삭제 뒤 세어 0이면 문서에서 marker를 지운다"*)이 복원 경로에서도 깨지지
   * 않는지 본다 — 코멘트를 되살렸는데 문서에 번호가 없으면 설계서 「페이지 스키마 노드」의 *"없으면 코멘트 없음"*이
   * 거짓이 된다.
   */
  it('코멘트를 되살리면 문서의 marker도 함께 돌아온다 — 같은 payload에서 온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const commentId = await addComment(ctx, fx, '코멘트')
      const id = await snapshot(ctx, fx, 'v1')

      // 마지막 코멘트를 지우면 라우트가 문서에서 marker를 지운다.
      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments/${commentId}`,
        cookies: fx.owner.cookie,
      })
      const cleared = await readPage(ctx, fx.page.id)
      expect((cleared?.schema as { root: { marker?: number } }).root.marker).toBeUndefined()

      await restore(ctx, fx, id)

      const page = await readPage(ctx, fx.page.id)
      expect((page?.schema as { root: { marker?: number } }).root.marker).toBe(1)
      const rows = await ctx.db.selectFrom('comments').select('id').where('page_id', '=', fx.page.id).execute()
      expect(rows.map((row) => row.id)).toEqual([commentId])
    })
  })
})

describe('FK 순서가 DB에서도 참인가', () => {
  /**
   * 계획의 케이스는 `steps`의 순서를 보고, 이 케이스는 **그 순서로 실제 SQL이 통과하는지**를
   * 본다. 순서를 뒤집으면 `menu_nodes_parent_id_fkey`로 죽는다.
   */
  it('지울 부모 밑에 살아남는 자식이 있어도 복원이 통과한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 스냅샷 시점: 자식 메뉴가 루트다.
      const child = await createMenuNode(ctx, fx.owner.cookie, fx.project.id, { title: '자식' })
      const id = await snapshot(ctx, fx, 'v1')

      // 그 뒤 부모를 만들고 자식을 그 밑으로 옮긴다.
      const parent = await createMenuNode(ctx, fx.owner.cookie, fx.project.id, { title: '나중에 생긴 부모' })
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/menu/${child.id}`,
        cookies: fx.owner.cookie,
        payload: { parentId: parent.id },
      })

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(200)
      const rows = await ctx.db
        .selectFrom('menu_nodes')
        .select(['id', 'parent_id'])
        .where('project_id', '=', fx.project.id)
        .execute()
      expect(rows.map((row) => row.id).sort()).toEqual([fx.menu.id, child.id].sort())
      expect(rows.find((row) => row.id === child.id)?.parent_id).toBeNull()
    })
  })

  it('지울 메뉴 밑에 살아남는 페이지가 있어도 복원이 통과한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const other = await createMenuNode(ctx, fx.owner.cookie, fx.project.id, { title: '나중에 생긴 메뉴' })
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
        payload: { menuNodeId: other.id },
      })

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(200)
      const page = await readPage(ctx, fx.page.id)
      expect(page?.menu_node_id).toBe(fx.menu.id)
      const rows = await ctx.db.selectFrom('menu_nodes').select('id').where('project_id', '=', fx.project.id).execute()
      expect(rows.map((row) => row.id)).toEqual([fx.menu.id])
    })
  })
})

describe('테마', () => {
  it('테마 행을 건드리지 않고 참조만 되돌린다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const layout = await ctx.db
        .selectFrom('layouts')
        .select(['id', 'theme_id'])
        .where('project_id', '=', fx.project.id)
        .executeTakeFirstOrThrow()
      const themesBefore = await ctx.db.selectFrom('themes').select(['id', 'updated_at']).execute()

      // 참조를 떼어 놓는다.
      await ctx.db.updateTable('layouts').set({ theme_id: null }).where('id', '=', layout.id).execute()

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.layouts.themeRefChanged).toBe(1)
      const after = await ctx.db.selectFrom('layouts').select('theme_id').where('id', '=', layout.id).executeTakeFirst()
      expect(after?.theme_id).toBe(layout.theme_id)
      // 테마 **행**은 그대로다 — 복원이 문서를 되돌리지 않는다.
      const themesAfter = await ctx.db.selectFrom('themes').select(['id', 'updated_at']).execute()
      expect(themesAfter).toEqual(themesBefore)
    })
  })

  it('지금 테마가 동결본과 다르면 응답이 말한다 — 되돌리지는 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const layout = await ctx.db
        .selectFrom('layouts')
        .select(['id', 'theme_id'])
        .where('project_id', '=', fx.project.id)
        .executeTakeFirstOrThrow()
      // 그 레이아웃이 가리키는 테마 문서를 바꾼다(시스템 테마라 라우트로는 못 고친다 — 설계서 「테마 관리」).
      await ctx.db
        .updateTable('themes')
        .set({ tokens: sql`'{"semantic":{"primary":"#123456"}}'::json` })
        .where('id', '=', layout.theme_id)
        .execute()

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.themes).toHaveLength(1)
      expect(body.themes[0]).toMatchObject({ layoutId: layout.id, themeId: layout.theme_id, differs: true })
      // 되돌리지 않았다 — 파생 테마의 상속을 평탄화하는 것은 복원이 아니라 파괴다.
      const theme = await ctx.db
        .selectFrom('themes')
        .select('tokens')
        .where('id', '=', layout.theme_id)
        .executeTakeFirst()
      expect(JSON.stringify(theme?.tokens)).toContain('#123456')
    })
  })

  it('같으면 differs가 false다 — 음성 대조', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.themes.map((entry) => entry.differs)).toEqual([false])
    })
  })
})

describe('막는 갈래 — 오류 표', () => {
  it('없는 스냅샷은 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await restore(ctx, fx, '00000000-0000-4000-8000-000000000000')
      expect(res.statusCode).toBe(404)
    })
  })

  it('남의 프로젝트의 스냅샷 id도 404다 — 존재를 숨긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      const id = await snapshot(ctx, other, 'v1')

      const res = await restore(ctx, fx, id)
      expect(res.statusCode).toBe(404)
    })
  })

  it('모르는 payloadVersion은 400이다 — 게이트가 서는 자리', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: sql`jsonb_set(payload, '{payloadVersion}', '99')` })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('형식 99')
      // **조회는 여전히 열려 있다** — 스냅샷은 삭제 없는 태그다(설계서 「스냅샷」).
      const get = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/snapshots/${id}`,
        cookies: fx.owner.cookie,
      })
      expect(get.statusCode).toBe(200)
    })
  })

  it('레이아웃 개수가 다르면 409다 — 조용히 맞추지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      // `layouts`에 `project_id` 유니크가 없어 두 번째가 실제로 들어간다.
      await ctx.db
        .insertInto('layouts')
        .values({
          project_id: fx.project.id,
          name: '두 번째 레이아웃',
          theme_id: null,
          schema: JSON.stringify({ version: 1, root: { id: 'n_l', type: 'Page', children: [] } }),
        })
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(409)
      expect(res.body).toContain('레이아웃')
    })
  })

  /** 미지원 버전의 두 방향. **설계서 「스키마 마이그레이션」의 탈출구를 만들지 않는다.** */
  it('저장된 문서가 미지원 버전이면 400이고 어느 페이지인지 말한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.db
        .updateTable('pages')
        .set({ schema_version: 999, schema: sql`jsonb_set(schema, '{version}', '999')` })
        .where('id', '=', fx.page.id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('사용자 목록')
      expect(res.body).toContain('999')
      expect(res.body).toContain('현재')
    })
  })

  it('payload의 문서가 미지원 버전이면 400이고 어느 페이지인지 말한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: sql`jsonb_set(payload, '{pages,0,schema,version}', '999')` })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('사용자 목록')
      expect(res.body).toContain('스냅샷')
    })
  })

  /**
   * **만들어지는 페이지의 문서는 아무도 검증하지 않는 유일한 쓰기다** — 갱신 쪽은
   * `applyEdit` 6단계가 본다. 계획이 그 구멍을 `validatePage`로 막고, 이 케이스가 그것을
   * 고정한다(이 케이스가 없으면 그 검사를 지우는 변이가 **산다**).
   *
   * **`applyEdit`이 내는 422와 문장이 다르다** — 어느 경로가 막았는지 화면이 알 수 있어야 한다.
   */
  it('되살릴 페이지의 문서가 카탈로그 검증에 걸리면 422다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      // **지운다** — 그래야 복원이 `create-page`를 타고 `validatePage`에 닿는다.
      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
      })
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: sql`jsonb_set(payload, '{pages,0,schema,root,children,0,type}', '"없는타입"')` })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(422)
      expect(res.body).toContain('복원할 페이지의 스키마 검증에 실패했습니다')
      expect(res.body).toContain('사용자 목록')
      // 아무것도 쓰지 않았다 — 페이지는 여전히 없다.
      expect(await readPage(ctx, fx.page.id)).toBeUndefined()
    })
  })

  /**
   * **좁힘의 둘째 칸을 DB에서 잰다**(계획 케이스가 값으로 잰 것을 라우트로 다시 잰다).
   *
   * 저장된 문서와 payload의 문서가 **둘 다 999이고 내용이 같다** — 복원이 그 페이지에
   * 아무것도 쓰지 않으므로 막지 않는다. 막으면 그 프로젝트는 **어떤 복원도 못 하게 된다.**
   */
  it('양쪽이 같아 쓸 것이 없는 999 페이지는 복원을 막지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      // 저장된 문서와 payload의 문서를 **함께** 999로 심는다 — 둘이 같은 상태를 만든다.
      await ctx.db
        .updateTable('pages')
        .set({ schema_version: 999, schema: sql`jsonb_set(schema, '{version}', '999')` })
        .where('id', '=', fx.page.id)
        .execute()
      await ctx.db
        .updateTable('snapshots')
        .set({
          payload: sql`jsonb_set(jsonb_set(payload, '{pages,0,schema,version}', '999'), '{pages,0,schemaVersion}', '999')`,
        })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(200)
      const body = res.json() as RestoreBody
      expect(body.summary.pages.schemaUnchanged).toBe(1)
      expect(body.summary.pages.schemaChanged).toBe(0)
      // 그 페이지는 여전히 999다 — 복원이 고쳐 주지 않는다. 다만 **막지도 않는다.**
      const page = await readPage(ctx, fx.page.id)
      expect((page?.schema as PageDocument).version).toBe(999)
    })
  })

  /**
   * **좁힘이 다른 갈래를 흔들지 않는다.** 같은 판에서 payload만 되돌려 내용이 갈리게 하면
   * 다시 400이다 — 그때는 복원이 그 페이지를 **쓰기** 때문이다.
   */
  it('같은 999라도 복원이 그 페이지를 쓰면 다시 막는다 — 음성 대조', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      await editPage(ctx, fx, 'n_sec2')

      await ctx.db
        .updateTable('pages')
        .set({ schema_version: 999, schema: sql`jsonb_set(schema, '{version}', '999')` })
        .where('id', '=', fx.page.id)
        .execute()
      await ctx.db
        .updateTable('snapshots')
        .set({
          payload: sql`jsonb_set(jsonb_set(payload, '{pages,0,schema,version}', '999'), '{pages,0,schemaVersion}', '999')`,
        })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('사용자 목록')
    })
  })

  /**
   * **`fingerprint-mismatch` 갈래.** 이 케이스가 없으면 이 갈래를 지우는 변이가 산다.
   *
   * 잠금이 대부분을 막는데도 이 갈래가 살아 있는 이유는 **복원이 테마 표를 잠그지 않기**
   * 때문이다(테마 **행**을 쓰지 않으므로). 그런데 지문에는 담기는 테마가 들어 있다.
   * 그래서 *"복원이 도는 동안 누가 테마를 고친다"*가 실제로 이 갈래를 낸다.
   *
   * **레이스로 재면 성패가 테마를 고치는 속도를 따라간다**: 복원을 쏜 뒤 한 번만
   * 커밋하면 **가끔**, 복원이 끝날 때까지 쉬지 않고 고치면 **늘** 이 갈래가 서고, 레이아웃이
   * **가리키지 않는** 테마를 고치면 **안 선다**(지문의 테마 절이 `layouts`를 조인한다). 그래서
   * 레이스는 케이스가 될 수 없고, `captureHooks`로 결정적으로 만든다.
   *
   * **끼어드는 자리가 `afterPages`인 것이 요점이다** — 수집의 한가운데여야 두 지문이 갈린다.
   */
  it('복원 도중 테마가 바뀌면 409다 — 잠금이 막지 못하는 유일한 창', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      const layout = await ctx.db
        .selectFrom('layouts')
        .select(['id', 'theme_id'])
        .where('project_id', '=', fx.project.id)
        .executeTakeFirstOrThrow()

      const outcome = await restoreSnapshot(ctx.db, {
        projectId: fx.project.id,
        snapshotId: id,
        actorId: fx.owner.user.id,
        captureHooks: {
          afterPages: async () => {
            await ctx.db
              .updateTable('themes')
              .set({ tokens: sql`'{"semantic":{"primary":"#123456"}}'::json` })
              .where('id', '=', layout.theme_id)
              .execute()
          },
        },
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
      // **되돌릴 것이 없다** — 이 갈래는 첫 쓰기(안전망 삽입)보다 앞이다.
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(1)
    })
  })

  it('아무도 끼어들지 않으면 복원된다 — 음성 대조', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const outcome = await restoreSnapshot(ctx.db, {
        projectId: fx.project.id,
        snapshotId: id,
        actorId: fx.owner.user.id,
        captureHooks: { afterPages: async () => {} },
      })

      expect(outcome.kind).toBe('restored')
    })
  })

  it('payload 안의 참조가 끊겨 있으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.db
        .updateTable('snapshots')
        .set({
          payload: sql`jsonb_set(payload, '{pages,0,menuNodeId}', '"00000000-0000-4000-8000-000000000000"')`,
        })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('참조')
    })
  })

  it('코멘트 작성자가 없으면 409다 — 500이 아니다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const commentId = await addComment(ctx, fx, '코멘트')
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments/${commentId}`,
        cookies: fx.owner.cookie,
      })
      // 사용자를 지우는 경로가 없으므로 payload의 작성자 id를 없는 것으로 바꿔 같은
      // 상태를 만든다 — 프로덕션을 고치지 않는다.
      await ctx.db
        .updateTable('snapshots')
        .set({
          payload: sql`jsonb_set(payload, '{comments,0,authorId}', '"00000000-0000-4000-8000-000000000000"')`,
        })
        .where('id', '=', id)
        .execute()

      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(409)
      expect(res.body).toContain('사용자')
    })
  })
})

describe('부분 성공을 만들지 않는다', () => {
  /**
   * **실패하는 복원이 무엇도 남기지 않는가.** 실패를 값으로 돌려주면 `withTransaction`의
   * 콜백이 정상 종료해 **바깥 트랜잭션이 커밋된다** — 부분 성공이 조용히 남는다.
   *
   * 여기서 고르는 실패는 **첫 쓰기보다 뒤**여야 뜻이 있다. 안전망 스냅샷이 이미 들어간 뒤
   * `applyEdit`이 죽는 판을 만든다: payload의 문서를 카탈로그가 거부하는 모양으로 바꿔
   * 두면 6단계(`validatePage`)가 죽는다.
   */
  it('applyEdit이 죽으면 안전망 스냅샷까지 되돌아간다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      await editPage(ctx, fx, 'n_sec2')

      // payload의 문서를 카탈로그가 모르는 타입으로 바꾼다 — 계획은 통과하고
      // (`create-page`가 아니라 `write-page-schema`라 `validatePage`를 안 탄다)
      // `applyEdit` 6단계가 죽는다.
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: sql`jsonb_set(payload, '{pages,0,schema,root,children,0,type}', '"없는타입"')` })
        .where('id', '=', id)
        .execute()

      const before = await listSnapshots(ctx.db, fx.project.id)
      const res = await restore(ctx, fx, id)

      expect(res.statusCode).toBe(422)
      // **어느 페이지인지 말한다.** `pageId`를 들고도 문장에서 버리면, 프로젝트 전체가
      // 막혔는데 어느 페이지 때문인지 알 수 없다.
      expect(res.body).toContain('사용자 목록')
      // **안전망 스냅샷이 남지 않았다** — 그것이 첫 쓰기였는데 트랜잭션이 되돌렸다.
      const after = await listSnapshots(ctx.db, fx.project.id)
      expect(after.map((row) => row.tag)).toEqual(before.map((row) => row.tag))
      // 문서도 그대로다.
      const page = await readPage(ctx, fx.page.id)
      expect((page?.schema as PageDocument).root.children?.[0]?.id).toBe('n_sec2')
    })
  })

  it('막힌 복원은 아무것도 바꾸지 않는다 — 레이아웃 불일치 판', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/menu/${fx.menu.id}`,
        cookies: fx.owner.cookie,
        payload: { title: '바뀐 제목' },
      })
      await ctx.db
        .insertInto('layouts')
        .values({
          project_id: fx.project.id,
          name: '두 번째 레이아웃',
          theme_id: null,
          schema: JSON.stringify({ version: 1, root: { id: 'n_l', type: 'Page', children: [] } }),
        })
        .execute()

      expect((await restore(ctx, fx, id)).statusCode).toBe(409)

      const row = await ctx.db.selectFrom('menu_nodes').select('title').where('id', '=', fx.menu.id).executeTakeFirst()
      expect(row?.title).toBe('바뀐 제목')
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(1)
    })
  })
})

describe('안전망이 실제로 되돌릴 수 있는가', () => {
  it('복원을 복원하면 그 직전 상태로 돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      const extra = await createPage(ctx, fx.owner.cookie, fx.project.id, fx.menu.id, { title: '나중에 만든 페이지' })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody
      expect(await readPage(ctx, extra.id)).toBeUndefined()

      // **안전망으로 되돌린다.** 설계서 「스냅샷」의 *"복원을 다시 되돌릴 수도 있다"*가 참인 자리다.
      const back = await restore(ctx, fx, body.safetySnapshot.id)

      expect(back.statusCode).toBe(200)
      const page = await readPage(ctx, extra.id)
      expect(page?.id).toBe(extra.id)
      expect(page?.title).toBe('나중에 만든 페이지')
    })
  })
})

describe('권한 — 설계서 「권한 모델」', () => {
  it('editor는 복원하지 못한다 (403) — 생성만 한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      const member = await signup(ctx)
      await addMember(ctx, fx.project.id, member.user.id, 'editor')

      const res = await restore(ctx, fx, id, member.cookie)

      expect(res.statusCode).toBe(403)
    })
  })
})

/**
 * **한 페이지 id 에서 번호가 같으면 문서도 같다** — 복원이 지운 페이지를 같은 id 로 되살려도 옛 판본이 쓴 번호를 다시 쓰지 않는다
 * (`0017-page-seq-floors`). 서버는 편집의 자리 경로를 `baseSeq` 판에 그대로 적용하므로, 번호가 겹치면 옛 판본을 든 탭의 편집이 되살린
 * 문서의 다른 노드에 적용된다(Chrome 판은 `apps/web/build-test/editor-page-version.test.ts`).
 */
describe('되살린 페이지의 번호', () => {
  it('옛 판본의 번호로 낸 편집은 되살린 판에서 409 다 — 되살린 번호로 낸 것은 받는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      await editPage(ctx, fx, 'n_sec2')
      await deletePageRoute(ctx, fx, fx.page.id)
      await restore(ctx, fx, id)

      const add = (baseSeq: number) =>
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
          cookies: fx.owner.cookie,
          payload: { baseSeq, ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_late', type: 'Section', props: {} } }] },
        })
      // 옛 판본이 쓴 번호 전부 — 0(만든 때) · 1(스냅샷 때) · 2(지울 때).
      expect([(await add(0)).statusCode, (await add(1)).statusCode, (await add(2)).statusCode]).toEqual([409, 409, 409])
      const accepted = await add(3)
      expect(accepted.statusCode).toBe(200)
      expect((accepted.json() as { seq: number }).seq).toBe(4)
    })
  })

  it('복원이 지운 페이지도 번호를 남긴다 — 그 페이지를 되살리면 그 다음에서 센다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      // 스냅샷에 없는 페이지 — 복원의 `delete-page`가 지운다.
      const extra = await createPage(ctx, fx.owner.cookie, fx.project.id, fx.menu.id, { title: '나중 페이지' })
      await editPageById(ctx, fx, extra.id, (extra.schema as { root: { id: string } }).root.id, 'n_x1')
      await editPageById(ctx, fx, extra.id, (extra.schema as { root: { id: string } }).root.id, 'n_x2')

      const first = (await restore(ctx, fx, id)).json() as RestoreBody
      expect(first.summary.pages.deleted).toBe(1)
      expect(await readPage(ctx, extra.id)).toBeUndefined()
      const floor = await ctx.db.selectFrom('page_seq_floors').select('head_seq').where('page_id', '=', extra.id).executeTakeFirst()
      expect(Number(floor?.head_seq)).toBe(2)

      // 안전망이 그 페이지를 든다 — 되돌리면 되살아난다.
      await restore(ctx, fx, first.safetySnapshot.id)
      const back = await readPage(ctx, extra.id)
      expect(Number(back?.head_seq)).toBe(3)
      expect((back?.schema as PageDocument).root.children?.[0]?.id).toBe('n_x2')
    })
  })

  it('지웠다 되살리기를 거듭해도 번호가 내려가지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      await deletePageRoute(ctx, fx, fx.page.id)
      await restore(ctx, fx, id)
      // 번호를 쓴 적 없는 페이지(0)를 지웠다 되살리면 1 이다.
      expect(Number((await readPage(ctx, fx.page.id))?.head_seq)).toBe(1)

      await editPage(ctx, fx, 'n_sec1')
      await editPage(ctx, fx, 'n_sec2')
      await deletePageRoute(ctx, fx, fx.page.id)
      await restore(ctx, fx, id)
      expect(Number((await readPage(ctx, fx.page.id))?.head_seq)).toBe(4)
    })
  })

  it('프로젝트를 지우면 남긴 번호도 간다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await deletePageRoute(ctx, fx, fx.page.id)
      const count = async () =>
        Number(
          (
            await ctx.db
              .selectFrom('page_seq_floors')
              .select((eb) => eb.fn.countAll().as('n'))
              .where('project_id', '=', fx.project.id)
              .executeTakeFirstOrThrow()
          ).n,
        )
      expect(await count()).toBe(1)

      const res = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.project.id}`, cookies: fx.owner.cookie })
      expect(res.statusCode).toBe(204)
      expect(await count()).toBe(0)
    })
  })
})

async function deletePageRoute(ctx: TestContext, fx: Fixture, pageId: string): Promise<void> {
  const res = await ctx.app.inject({
    method: 'DELETE',
    url: `/api/projects/${fx.project.id}/pages/${pageId}`,
    cookies: fx.owner.cookie,
  })
  if (res.statusCode !== 204) throw new Error(`페이지 삭제 픽스처 실패 (${res.statusCode}): ${res.body}`)
}

/** `editPage`와 같은 편집을 다른 페이지에. */
async function editPageById(ctx: TestContext, fx: Fixture, pageId: string, rootId: string, sectionId: string): Promise<void> {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.project.id}/pages/${pageId}/schema`,
    cookies: fx.owner.cookie,
    payload: { schema: { version: 1, root: { id: rootId, type: 'Page', children: [{ id: sectionId, type: 'Section', props: {} }] } } },
  })
  if (res.statusCode !== 200) throw new Error(`편집 픽스처 실패 (${res.statusCode}): ${res.body}`)
}
