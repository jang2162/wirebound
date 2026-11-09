/**
 * **판 5 라고 적힌 문서의 판 6 꼴 트리 항목 — REST 문서 쓰기(`PUT …/schema`)가 남긴다.** 런타임 사슬의 판 5 → 6 단계가 글 항목만 옮기고 이미
 * 판 6 꼴인 항목(이름이 글인 객체)은 제 꼴 · 제 자리 그대로 둔다(`packages/schema/src/migrate-tree-items.ts` 머리말). 섞인 목록의 차례 ·
 * 중첩 규칙 자체는 `packages/schema/test/migrate-tree-items.test.ts` 가 잰다 — 여기는 그 사슬이 쓰기 입구에서 돌아 저장된 문서에 남는지다.
 */
import { describe, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION } from '@wirebound/schema'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

const KEPT = { label: '주문', open: false, children: [{ label: '목록' }, { label: '통계' }] }

describe('PUT …/schema — 판 5 문서의 판 6 꼴 트리 항목', () => {
  it('판 6 꼴 항목은 저장된 문서에 제 꼴 그대로 · 글 항목은 판 5 화면대로 옮겨진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
      const schema = {
        version: 5,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [{ id: 'n_tree', type: 'Tree', props: { items: [KEPT, '회원', '가입'], depth: 2 } }],
        },
      }

      const put = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/pages/${page.id}/schema`,
        cookies: owner.cookie,
        payload: { schema },
      })
      expect(put.statusCode).toBe(200)

      const row = await ctx.db.selectFrom('pages').select(['schema', 'schema_version']).where('id', '=', page.id).executeTakeFirstOrThrow()
      expect(row.schema_version).toBe(CURRENT_DOCUMENT_VERSION)
      const stored = row.schema as { root: { children: { props: unknown }[] } }
      expect(stored.root.children[0]?.props).toEqual({ items: [KEPT, { label: '회원', open: true, children: [{ label: '가입' }] }] })
    })
  })
})
