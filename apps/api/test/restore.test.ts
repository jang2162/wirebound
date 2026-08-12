/**
 * 복원 — 설계 §4.5의 되돌리는 쪽(P6-2 T2~T6).
 *
 * 권한 세 등급은 `permission-matrix.test.ts`가 전수로 친다(그 파일의 완전성 검사가
 * `src/routes/`를 훑어 새 라우트를 강제로 표에 올린다 — 이 라우트를 만들자 그것이 먼저
 * 죽었다). 여기서는 **무엇이 실제로 되돌아가는지**를 잰다.
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
import { SAFETY_TAG_PREFIX, restoreActorLabel } from '../src/services/restore'
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

  it('그래도 안전망 스냅샷은 만든다 — 계획이 틀렸을 때를 위한 보험이다 (D2)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.safetySnapshot.tag.startsWith(SAFETY_TAG_PREFIX)).toBe(true)
      const rows = await listSnapshots(ctx.db, fx.project.id)
      expect(rows.map((row) => row.tag).sort()).toEqual([body.safetySnapshot.tag, 'v1'].sort())
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

  it('내용이 같으면 revision을 만들지 않는다 — D4', async () => {
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

  it('스냅샷 뒤에 지운 페이지가 **같은 id로** 되살아난다 — D3(복원이지 복제가 아니다)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
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
      // **id가 같다.** 새 id를 발급하면 사람이 공유한 URL이 죽는다(D3).
      expect(page?.id).toBe(fx.page.id)
      expect(page?.title).toBe('사용자 목록')
    })
  })

  /**
   * **되살아난 페이지의 `head_seq`는 0이다.** payload의 값을 심으면 행이 없는 seq를
   * 가리킨다 — 그 페이지가 지워질 때 `revisions.page_id`의 CASCADE가 이력을 데려갔기
   * 때문이다(재라 #3 실측). **복원이 되살릴 수 있는 것은 문서이지 이력이 아니다.**
   */
  it('되살아난 페이지는 head_seq 0에서 다시 시작한다 — 이력은 되살아나지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      const before = await readPage(ctx, fx.page.id)
      expect(Number(before?.head_seq)).toBe(1)

      await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}`,
        cookies: fx.owner.cookie,
      })
      await restore(ctx, fx, id)

      const page = await readPage(ctx, fx.page.id)
      expect(Number(page?.head_seq)).toBe(0)
      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(0)
      // 문서는 그때 그것이다.
      expect((page?.schema as PageDocument).root.children?.[0]?.id).toBe('n_sec1')
    })
  })

  it('페이지 문서가 되돌아오고 그 되돌림이 revision으로 남는다 — §4.5', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await editPage(ctx, fx, 'n_sec1')
      const id = await snapshot(ctx, fx, 'v1')
      await editPage(ctx, fx, 'n_sec2')

      const body = (await restore(ctx, fx, id)).json() as RestoreBody

      expect(body.summary.pages.schemaChanged).toBe(1)
      const page = await readPage(ctx, fx.page.id)
      expect((page?.schema as PageDocument).root.children?.[0]?.id).toBe('n_sec1')
      // 이력을 지우지 않는다 — 되돌림이 **새 revision**으로 append된다(§4.5).
      expect(Number(page?.head_seq)).toBe(3)
    })
  })

  it('복원이 만든 revision은 평범한 편집과 구분된다 — D10', async () => {
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

      expect(rows.map((row) => row.actor_label)).toEqual([fx.owner.user.name, restoreActorLabel('v1')])
      expect(rows.at(-1)?.actor_type).toBe('user')
      expect(rows.at(-1)?.actor_id).toBe(fx.owner.user.id)
    })
  })
})

describe('코멘트 — T4', () => {
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
      expect(rows[0]!.created_at.getTime()).toBeLessThan(rows[1]!.created_at.getTime())
    })
  })

  /**
   * **문서의 `marker`와 코멘트 행이 같은 payload에서 온다**(T4가 확인을 요구한 자리).
   * P5-1의 규칙(*"삭제 뒤 세어 0이면 문서에서 marker를 지운다"*)이 복원 경로에서도 깨지지
   * 않는지 본다 — 코멘트를 되살렸는데 문서에 번호가 없으면 §4.3의 *"없으면 코멘트 없음"*이
   * 거짓이 된다.
   */
  it('코멘트를 되살리면 문서의 marker도 함께 돌아온다 — 같은 payload에서 온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const commentId = await addComment(ctx, fx, '코멘트')
      const id = await snapshot(ctx, fx, 'v1')

      // 마지막 코멘트를 지우면 라우트가 문서에서 marker를 지운다(P5-1 D3).
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

describe('FK 순서가 DB에서도 참인가 — 계획서 T1', () => {
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

describe('테마 — D6', () => {
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
      // 그 레이아웃이 가리키는 테마 문서를 바꾼다(시스템 테마라 라우트로는 못 고친다 — §6.10).
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

  it('모르는 payloadVersion은 400이다 — 게이트가 서는 자리(이월 §3)', async () => {
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
      // **조회는 여전히 열려 있다** — 태그는 지워지지 않는 기록이다(§4.5).
      const get = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/snapshots/${id}`,
        cookies: fx.owner.cookie,
      })
      expect(get.statusCode).toBe(200)
    })
  })

  it('레이아웃 개수가 다르면 409다 — 조용히 맞추지 않는다 (D7)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      // 이월 §1: `layouts`에 `project_id` 유니크가 없어 두 번째가 실제로 들어간다.
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

  /** D5의 두 방향. **§13.1을 여기서 닫는다 — 탈출구를 만들지 않는다.** */
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
      // 오늘 사용자를 지우는 경로는 0건이므로 payload의 작성자 id를 없는 것으로 바꿔 같은
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

describe('부분 성공을 만들지 않는다 — D1', () => {
  /**
   * **실패하는 복원이 무엇도 남기지 않는가.** 실패를 값으로 돌려주면 `withTransaction`의
   * 콜백이 정상 종료해 **바깥 트랜잭션이 커밋된다** — P5-1의 B5가 정확히 그 사고였다.
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

describe('안전망이 실제로 되돌릴 수 있는가 — D2', () => {
  it('복원을 복원하면 그 직전 상태로 돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await snapshot(ctx, fx, 'v1')
      const extra = await createPage(ctx, fx.owner.cookie, fx.project.id, fx.menu.id, { title: '나중에 만든 페이지' })

      const body = (await restore(ctx, fx, id)).json() as RestoreBody
      expect(await readPage(ctx, extra.id)).toBeUndefined()

      // **안전망으로 되돌린다.** §4.5의 *"복원을 다시 되돌릴 수도 있다"*가 참인 자리다.
      const back = await restore(ctx, fx, body.safetySnapshot.id)

      expect(back.statusCode).toBe(200)
      const page = await readPage(ctx, extra.id)
      expect(page?.id).toBe(extra.id)
      expect(page?.title).toBe('나중에 만든 페이지')
    })
  })
})

describe('권한 — §10', () => {
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
