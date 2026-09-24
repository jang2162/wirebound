/**
 * 레이아웃과 기본 레이아웃. 설계서 「테이블 정의」의 사슬
 * `projects.default_layout_id → layouts.theme_id → themes`가 실제로 이어지는지 본다.
 */
import { sql } from 'kysely'
import { validateLayout } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { findDefaultLayout } from '../src/repos/layouts'
import { findThemeBySlug, insertTheme } from '../src/repos/themes'
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
      const row = await ctx.db
        .selectFrom('projects')
        .select('default_layout_id')
        .where('id', '=', project.id)
        .executeTakeFirstOrThrow()
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

  it('theme_id가 시스템 admin을 가리킨다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const layout = (await findDefaultLayout(ctx.db, project.id))!
      const admin = await findThemeBySlug(ctx.db, null, 'admin')

      expect(layout.themeId).toBe(admin!.id)
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

  /**
   * **`layouts.theme_id`가 `ON DELETE RESTRICT`다.**
   *
   * *"테마를 지울 때 그것을 가리키는 레이아웃이 어떻게 되는가"*의 답이다. `SET NULL`로 두면 **화면이 말없이 달라진다**(테마가 사라져 구조 기본 CSS로
   * 떨어진다). 실패하는 편이 낫고, 라우트가 그것을 409로 옮긴다.
   */
  it('쓰이고 있는 테마는 지워지지 않는다 (RESTRICT)', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const layout = (await findDefaultLayout(ctx.db, project.id))!

      await expect(
        withTransaction(ctx.db, (trx) => trx.deleteFrom('themes').where('id', '=', layout.themeId!).execute()),
      ).rejects.toThrow()
    })
  })

  it('쓰이지 않는 테마는 지워진다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const unused = await insertTheme(ctx.db, project.id, {
        meta: { id: 'unused', name: '안 쓰임', version: '1.0.0' },
      })

      await withTransaction(ctx.db, (trx) => trx.deleteFrom('themes').where('id', '=', unused.id).execute())
      const rows = await ctx.db.selectFrom('themes').select('id').where('id', '=', unused.id).execute()
      expect(rows).toHaveLength(0)
    })
  })
})

/**
 * `GET /api/projects/:projectId/theme` — 캔버스가 쓰는 형태(홀로 서는 테마 하나)를 낸다.
 */
describe('프로젝트의 현재 테마', () => {
  function get(ctx: TestContext, projectId: string, cookie: { wb_session: string }) {
    return ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/theme`, cookies: cookie })
  }

  it('기본 레이아웃이 가리키는 시스템 테마를 낸다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const res = await get(ctx, project.id, owner.cookie)
      expect(res.statusCode).toBe(200)
      expect(res.json().theme.meta.id).toBe('admin')
      expect(res.json().issues).toEqual([])
    })
  })

  /**
   * **파생 테마는 합쳐서 낸다.** 그리는 쪽은 유래가 필요 없고 `resolveTheme`이 base를
   * 요구하므로, 합치지 않고 내면 받는 쪽이 두 인자를 스스로 맞춰야 한다.
   * (편집용 형태는 `GET .../themes/:themeId`가 `base`와 함께 낸다 — 소비자가 다르다.)
   */
  it('파생 테마면 합쳐서 홀로 서는 테마를 낸다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const created = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/themes`,
        cookies: owner.cookie,
        payload: {
          theme: {
            meta: { id: 'derived', name: '파생', version: '1.0.0', extends: 'system:admin' },
            tokens: { semantic: { primary: '#ff0000' } },
          },
        } as never,
      })
      expect(created.statusCode).toBe(201)

      const layout = (await findDefaultLayout(ctx.db, project.id))!
      await ctx.db
        .updateTable('layouts')
        .set({ theme_id: created.json().id })
        .where('id', '=', layout.id)
        .execute()

      const res = await get(ctx, project.id, owner.cookie)
      expect(res.statusCode).toBe(200)
      // 합쳐졌다: 파생이 덮은 값과 base의 절이 **함께** 있다.
      expect(res.json().theme.tokens.semantic.primary).toBe('#ff0000')
      expect(res.json().theme.components).toBeDefined()
      // 홀로 선다: `extends`가 빠졌다(`mergeTheme`이 설계서 「스냅샷」의 이유로 뺀다).
      expect(res.json().theme.meta.extends).toBeUndefined()
    })
  })

  it('기본 레이아웃이 없으면 theme이 null이다 — 실패가 아니다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      await ctx.db.updateTable('projects').set({ default_layout_id: null }).where('id', '=', project.id).execute()

      const res = await get(ctx, project.id, owner.cookie)
      expect(res.statusCode).toBe(200)
      expect(res.json().theme).toBeNull()
    })
  })

  it('레이아웃이 테마를 안 고르면 theme이 null이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const layout = (await findDefaultLayout(ctx.db, project.id))!
      await ctx.db.updateTable('layouts').set({ theme_id: null }).where('id', '=', layout.id).execute()

      const res = await get(ctx, project.id, owner.cookie)
      expect(res.statusCode).toBe(200)
      expect(res.json().theme).toBeNull()
    })
  })

  it('viewer도 읽을 수 있다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const res = await get(ctx, project.id, owner.cookie)
      expect(res.statusCode).toBe(200)
    })
  })
})
