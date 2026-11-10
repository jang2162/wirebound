/**
 * **판 5 라고 적힌 스냅샷 문서의 판 6 꼴 트리 항목 — 복원이 남긴다.** 복원은 대상 payload 의 옛 판 페이지를 런타임 사슬(`migratePageDocument`)로 올린 뒤
 * 쓴다(`services/restore.ts` 의 `currentVersionPages`). 그 사슬의 판 5 → 6 단계가 이미 판 6 꼴인 항목을 제 꼴 · 제 자리 그대로 두는지는
 * `packages/schema/test/migrate-tree-items.test.ts` 가, 쓰기 입구(`PUT …/schema`)는 `./tree-items-v5-carry.test.ts` 가 잰다 — 여기는 복원 입구다.
 *
 * 판 5 로 적힌 섞인 payload 는 운영에서 새로 생기지 않는다(스냅샷은 저장된 문서에서 짓고, 판 5 payload 는 `0035-tree-items` 가 옮겼다) — 그래서 판은 찍은
 * 스냅샷의 payload 를 DB 에서 바꿔 세운다.
 */
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION } from '@wirebound/schema'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

const KEPT = { label: '주문', open: false, children: [{ label: '목록' }, { label: '통계' }] }

describe('스냅샷 복원 — 판 5 문서의 판 6 꼴 트리 항목', () => {
  it('판 6 꼴 항목은 복원된 문서에 제 꼴 그대로 · 글 항목은 판 5 화면대로 옮겨진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
      const rootId = (page.schema as { root: { id: string } }).root.id

      const taken = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots`,
        cookies: owner.cookie,
        payload: { tag: 'v1' },
      })
      expect(taken.statusCode).toBe(201)
      const snapshotId = (taken.json() as { id: string }).id

      // 스냅샷의 그 페이지 문서를 판 5 · 섞인 목록으로 — 지금 문서(빈 페이지)와 달라 복원이 그 문서를 다시 쓴다.
      const v5 = {
        version: 5,
        root: { id: rootId, type: 'Page', children: [{ id: 'n_tree', type: 'Tree', props: { items: [KEPT, '회원', '가입'], depth: 2 } }] },
      }
      const row = await ctx.db.selectFrom('snapshots').select('payload').where('id', '=', snapshotId).executeTakeFirstOrThrow()
      const pages = (row.payload as { pages: { id: string }[] }).pages
      const at = pages.findIndex((entry) => entry.id === page.id)
      expect(at).toBeGreaterThanOrEqual(0)
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: sql`jsonb_set(payload, ${sql.lit(`{pages,${at},schema}`)}, ${JSON.stringify(v5)}::jsonb)` })
        .where('id', '=', snapshotId)
        .execute()

      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/snapshots/${snapshotId}/restore`,
        cookies: owner.cookie,
      })
      expect(restored.statusCode).toBe(200)

      const stored = await ctx.db
        .selectFrom('pages')
        .select(['schema', 'schema_version'])
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()
      expect(stored.schema_version).toBe(CURRENT_DOCUMENT_VERSION)
      const tree = (stored.schema as { root: { children: { id: string; props: unknown }[] } }).root.children[0]
      expect({ id: tree?.id, props: tree?.props }).toEqual({
        id: 'n_tree',
        props: { items: [KEPT, { label: '회원', open: true, children: [{ label: '가입' }] }] },
      })
    })
  })
})
