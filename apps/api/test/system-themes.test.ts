/**
 * 시스템 테마 동기화. **코드가 진실이고 DB는 그 사본이다**(계획서 D4).
 *
 * 마이그레이션이 아니라 **기동 시 동기화**인 이유: 마이그레이션에 박으면 테마를 고칠
 * 때마다 새 마이그레이션이 필요하다. 시스템 테마는 배포에 실려 오는 코드이지 데이터가 아니다.
 */
import { SYSTEM_THEME_IDS, systemTheme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { findThemeBySlug, insertTheme, listThemes } from '../src/repos/themes'
import { syncSystemThemes } from '../src/services/system-themes'
import { createProject, signup, withApi } from './helpers'

describe('시스템 테마 동기화', () => {
  it('기동만으로 코드의 시스템 테마가 DB에 있다', async () => {
    await withApi(async (ctx) => {
      // `withApi`가 부르는 `buildApp`이 이미 동기화를 돌렸다 — 여기서 다시 부르지 않는다.
      const rows = await ctx.db.selectFrom('themes').select('slug').where('project_id', 'is', null).execute()
      expect(rows.map((row) => row.slug).sort()).toEqual([...SYSTEM_THEME_IDS].sort())
    })
  })

  it('DB의 시스템 테마가 코드의 것과 같다', async () => {
    await withApi(async (ctx) => {
      for (const id of SYSTEM_THEME_IDS) {
        const stored = await findThemeBySlug(ctx.db, null, id)
        expect(stored, id).not.toBeNull()
        // 왕복 조립까지 포함해 **문서가 통째로** 같아야 한다 — slug·name만 보면
        // 절이 통째로 빠져도 통과한다.
        expect(stored!.theme, id).toEqual(systemTheme(id))
        expect(stored!.projectId, id).toBeNull()
      }
    })
  })

  it('두 번 돌려도 늘지 않는다 (멱등)', async () => {
    await withApi(async (ctx) => {
      await syncSystemThemes(ctx.db)
      await syncSystemThemes(ctx.db)

      const rows = await ctx.db.selectFrom('themes').select('id').where('project_id', 'is', null).execute()
      expect(rows).toHaveLength(SYSTEM_THEME_IDS.length)
    })
  })

  /**
   * **코드가 이긴다(D4).** DB의 사본을 손으로 고쳐도 다음 동기화가 코드 값으로 되돌린다.
   * 이것이 없으면 "코드가 진실"이 문장으로만 남는다.
   */
  it('DB가 코드와 갈리면 코드가 이긴다', async () => {
    await withApi(async (ctx) => {
      await ctx.db
        .updateTable('themes')
        .set({ name: '손으로 바꾼 이름', tokens: JSON.stringify({ semantic: { primary: '#000' } }) })
        .where('project_id', 'is', null)
        .where('slug', '=', 'admin')
        .execute()

      await syncSystemThemes(ctx.db)

      const stored = await findThemeBySlug(ctx.db, null, 'admin')
      expect(stored!.theme).toEqual(systemTheme('admin'))
    })
  })

  /**
   * **재라 #5 — 코드에서 시스템 테마가 사라지면 DB의 행은 어떻게 되는가.**
   *
   * 답: **지우지 않는다. 동기화는 upsert만 하고 삭제하지 않는다.**
   *
   * 근거 셋(자세한 논증은 `services/system-themes.ts`의 주석):
   * 1. `layouts.theme_id`가 `themes.id`를 FK로 참조한다(0007). 동기화가 행을 지우면
   *    그 레이아웃이 함께 깨진다 — 코드 한 줄을 지운 결과가 **사용자 데이터**에 닿는다.
   * 2. 파생 테마의 `extends_ref`가 그 slug를 가리킨다. 행이 사라지면 목록에서도 사라져
   *    사용자가 무엇이 끊겼는지 볼 수 없다.
   * 3. 되돌릴 수 있는 쪽을 고른다 — 낡은 행이 남는 것은 다음 배포가 고칠 수 있지만
   *    지워진 행에 매달렸던 것은 되살릴 수 없다.
   *
   * **대가: 코드에 없는 시스템 테마 행이 목록에 남는다.** 그 테마는 해석할 수 없다
   * (`systemTheme()`이 `undefined`를 낸다). 치우는 것은 사람이 판단할 일이라 관리
   * 경로(P6 이후)의 몫으로 남긴다.
   */
  it('코드에 없는 시스템 테마 행을 동기화가 지우지 않는다 (재라 #5)', async () => {
    await withApi(async (ctx) => {
      await insertTheme(ctx.db, null, { meta: { id: 'retired', name: '사라진 것', version: '1.0.0' } })

      await syncSystemThemes(ctx.db)

      expect(await findThemeBySlug(ctx.db, null, 'retired')).not.toBeNull()
    })
  })

  it('프로젝트 테마는 건드리지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      // 시스템 테마와 **같은 slug**를 쓰는 프로젝트 테마 — 동기화가 소유자를 무시하고
      // slug만 보면 이것을 덮어쓴다.
      await insertTheme(ctx.db, project.id, { meta: { id: 'admin', name: '내 admin', version: '9.9.9' } })

      await syncSystemThemes(ctx.db)

      const mine = await findThemeBySlug(ctx.db, project.id, 'admin')
      expect(mine!.theme.meta.name).toBe('내 admin')
      expect(mine!.theme.meta.version).toBe('9.9.9')
    })
  })

  it('동기화된 시스템 테마가 프로젝트의 목록에 함께 나온다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const list = await listThemes(ctx.db, project.id)
      expect(list.some((entry) => entry.theme.meta.id === 'admin' && entry.projectId === null)).toBe(true)
    })
  })
})
