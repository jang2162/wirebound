/**
 * 레이아웃과 기본 레이아웃. 설계서 「테이블 정의」의 `projects.default_layout_id → layouts`가 실제로 이어지는지 본다.
 */
import { sql } from 'kysely'
import { validateLayout } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { findDefaultLayout } from '../src/repos/layouts'
import { createProject, signup, withApi, type TestContext } from './helpers'

async function ownedProject(ctx: TestContext) {
  const owner = await signup(ctx)
  return { owner, project: await createProject(ctx, owner.cookie) }
}

describe('기본 레이아웃 (0007)', () => {
  it('프로젝트를 만들면 기본 레이아웃이 함께 생기고 default_layout_id가 그것을 가리킨다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)

      const layout = await findDefaultLayout(ctx.db, project.id)
      expect(layout).not.toBeNull()
      expect(layout!.projectId).toBe(project.id)

      // 프로젝트 쪽 컬럼도 실제로 채워졌는가 — 조인만 보면 조인이 다른 행을 집어도 통과한다.
      const row = await ctx.db.selectFrom('projects').select('default_layout_id').where('id', '=', project.id).executeTakeFirstOrThrow()
      expect(row.default_layout_id).toBe(layout!.id)
    })
  })

  /**
   * **`Page` 하나와 `Slot` 하나**다. 그래야 `renderComposed(layout, page)`의
   * 결과가 `renderDocument(page)`와 같고, 기본 레이아웃이 화면의 외형을 건드리지 않는다.
   */
  it('기본 레이아웃의 schema가 Page 하나와 Slot 하나이고 validateLayout을 통과한다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const layout = (await findDefaultLayout(ctx.db, project.id))!

      expect(validateLayout(layout.schema)).toEqual([])
      expect(layout.schema.root.type).toBe('Page')
      expect(layout.schema.root.children).toHaveLength(1)
      expect(layout.schema.root.children![0]!.type).toBe('Slot')
    })
  })

  it('노드 id가 프로젝트마다 다르다 — 상수로 박히지 않았다', async () => {
    await withApi(async (ctx) => {
      const a = await ownedProject(ctx)
      const b = await ownedProject(ctx)

      const first = (await findDefaultLayout(ctx.db, a.project.id))!
      const second = (await findDefaultLayout(ctx.db, b.project.id))!
      expect(first.schema.root.id).not.toBe(second.schema.root.id)
    })
  })

  it('프로젝트를 지우면 레이아웃도 지워진다 (CASCADE)', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const rows = await ctx.db.selectFrom('layouts').select('id').where('project_id', '=', project.id).execute()
      expect(rows).toHaveLength(0)
    })
  })

  /**
   * **순환 참조 — `projects.default_layout_id`와 `layouts.project_id`가 서로를 가리킨다.**
   *
   * 프로젝트 삭제가 성립하려면 `default_layout_id`가 `ON DELETE SET NULL`이어야 한다.
   * RESTRICT였다면 CASCADE로 사라지는 레이아웃이 자기를 가리키는 프로젝트를 막아
   * 위 케이스가 죽는다. 여기서는 **컬럼이 nullable이라는 것 자체**를 고정한다 — 그것이
   * 순환을 세 문장으로 여는 전제다(`insertProject`).
   */
  it('default_layout_id가 nullable이다 — 순환을 여는 전제', async () => {
    await withApi(async (ctx) => {
      const rows = await sql<{ is_nullable: string }>`
        select is_nullable from information_schema.columns
        where table_name = 'projects' and column_name = 'default_layout_id'
      `.execute(ctx.db)
      expect(rows.rows[0]!.is_nullable).toBe('YES')
    })
  })

  it('기본 레이아웃이 없는 프로젝트는 findDefaultLayout이 null이다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      // 0007 이전에 만들어진 프로젝트를 흉내 낸다 — 그 상태를 재현할 다른 방법이 없다.
      await ctx.db.updateTable('projects').set({ default_layout_id: null }).where('id', '=', project.id).execute()

      expect(await findDefaultLayout(ctx.db, project.id)).toBeNull()
    })
  })
})
