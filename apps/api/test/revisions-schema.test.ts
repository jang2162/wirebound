import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

/**
 * 마이그레이션 0005가 만든 스키마의 성질을 고정한다. 라우트가 아니라 **테이블**을
 * 검사하는 테스트다 — 제약이 실제로 DB에 걸려 있는지는 SQL을 직접 던져야만 알 수 있다.
 *
 * 제약 위반을 유발하는 조작은 전부 `withTransaction`으로 감싼다. 감싸지 않으면 그
 * 실패가 `withApi`의 트랜잭션 전체를 aborted(`25P02`)로 만들어, 같은 테스트 안의
 * 이후 단언이 실제 내용과 무관하게 전부 무너진다(`src/db/tx.ts` 참고).
 */
describe('revisions 스키마', () => {
  it('페이지를 만들면 head_seq가 0이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const row = await ctx.db
        .selectFrom('pages')
        .select('head_seq')
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()

      // pg는 int8(bigint)을 정밀도 손실을 피하려고 문자열로 준다. 이 사실이
      // db/types.ts의 컬럼 타입(`ColumnType<string, ...>`)과 repos의 Number()
      // 변환이 서 있는 근거이므로, 추측이 아니라 여기서 고정한다.
      expect(typeof row.head_seq).toBe('string')
      expect(Number(row.head_seq)).toBe(0)
    })
  })

  it('(page_id, seq)가 유니크다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const insert = (seq: number) =>
        withTransaction(ctx.db, (trx) =>
          trx
            .insertInto('revisions')
            .values({
              page_id: page.id,
              seq,
              actor_type: 'user',
              actor_id: owner.user.id,
              actor_label: owner.user.name,
              ops: JSON.stringify([]),
              inverse: JSON.stringify([]),
            })
            .execute(),
        )

      await insert(1)
      await expect(insert(1)).rejects.toThrow()

      // 위 실패가 세이브포인트로 격리됐다는 증거: 같은 트랜잭션에서 다음 문장이 산다.
      // withTransaction이 없다면 이 조회가 25P02로 죽는다.
      const rows = await ctx.db.selectFrom('revisions').select('seq').where('page_id', '=', page.id).execute()
      expect(rows).toHaveLength(1)
    })
  })

  it("actor_type이 'user'인데 actor_id가 없으면 거부한다", async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await expect(
        withTransaction(ctx.db, (trx) =>
          trx
            .insertInto('revisions')
            .values({
              page_id: page.id,
              seq: 1,
              actor_type: 'user',
              actor_id: null,
              actor_label: '이름',
              ops: JSON.stringify([]),
              inverse: JSON.stringify([]),
            })
            .execute(),
        ),
      ).rejects.toThrow()
    })
  })

  it('actor_type이 세 값 밖이면 거부한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await expect(
        withTransaction(ctx.db, (trx) =>
          sql`insert into revisions (page_id, seq, actor_type, actor_id, actor_label, ops, inverse)
              values (${page.id}, 1, 'robot', ${owner.user.id}, '이름', '[]'::jsonb, '[]'::jsonb)`.execute(trx),
        ),
      ).rejects.toThrow()
    })
  })

  it('페이지를 지우면 그 revision도 함께 사라진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await ctx.db
        .insertInto('revisions')
        .values({
          page_id: page.id,
          seq: 1,
          actor_type: 'user',
          actor_id: owner.user.id,
          actor_label: owner.user.name,
          ops: JSON.stringify([]),
          inverse: JSON.stringify([]),
        })
        .execute()

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const rows = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', page.id).execute()
      expect(rows).toHaveLength(0)
    })
  })
})
