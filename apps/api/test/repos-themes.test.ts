/**
 * 테마 저장소의 왕복. **`meta`가 컬럼으로 흩어졌다 다시 조립되므로** 이
 * 왕복이 그 조립을 지킨다 — 컬럼 하나를 빠뜨리면 그 필드가 말없이 사라진다.
 */
import { SYSTEM_THEME_IDS, type Theme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import {
  ThemeNulByteError,
  deleteTheme,
  findThemeById,
  findThemeBySlug,
  insertTheme,
  listThemes,
  updateTheme,
} from '../src/repos/themes'
import { createProject, signup, withApi, type TestContext } from './helpers'

/** 절 여섯을 **전부** 채운 테마. 하나라도 조립에서 빠지면 왕복이 죽는다. */
function fullTheme(): Theme {
  return {
    meta: {
      id: 'brand',
      name: '브랜드',
      description: '설명',
      version: '2.1.0',
      preview: 'data:image/png;base64,AAA',
    },
    tokens: { semantic: { primary: '#2563eb' } },
    primitives: { breakpoints: { md: 768 } },
    components: { List: { base: { opacity: 0.9 } } },
    patterns: { 'hero.split': { name: '히어로', schema: { type: 'Section' } } },
    assets: { icons: 'lucide' },
  }
}

/** `meta`만 있는 최소 테마. `ThemeSchema`가 나머지 다섯을 선택으로 두었다(설계서 「상속과 병합」의 파생 테마). */
function minimalTheme(): Theme {
  return { meta: { id: 'min', name: '최소', version: '1.0.0' } }
}

async function ownedProject(ctx: TestContext) {
  const owner = await signup(ctx)
  return { owner, project: await createProject(ctx, owner.cookie) }
}

describe('repos/themes — Theme ↔ 행', () => {
  it('절을 전부 채운 테마가 그대로 왕복한다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const inserted = await insertTheme(ctx.db, project.id, fullTheme())

      expect(inserted.projectId).toBe(project.id)
      expect(inserted.theme).toEqual(fullTheme())

      const read = await findThemeById(ctx.db, inserted.id)
      expect(read!.theme).toEqual(fullTheme())
    })
  })

  it('meta만 있는 테마도 그대로 왕복한다 — 선택 필드가 되살아나지 않는다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const inserted = await insertTheme(ctx.db, project.id, minimalTheme())

      // `description`·`preview`·`extends`가 **키 자체로** 없어야 한다. `undefined`가
      // 들어 있으면 `toEqual`은 통과하지만 JSON 직렬화에서 갈린다.
      expect(Object.keys(inserted.theme.meta).sort()).toEqual(['id', 'name', 'version'])
      expect(Object.keys(inserted.theme).sort()).toEqual(['meta'])
    })
  })

  /**
   * **빈 절과 없는 절을 가르는가.**
   *
   * 답: **가른다.** NULL 컬럼이 "그 절이 없다", `'{}'`가 "있는데 비었다"다.
   *
   * 구별해야 하는 이유: `mergeTheme`이 파생 테마의 절을 base와 합칠 때 **없는 절은
   * 건드리지 않고 빈 절은 그 절을 다룬다**로 갈린다. 둘을 같은 것으로 접으면
   * 사용자가 저장한 문서와 되읽은 문서가 달라지고, 그 차이가 병합 결과에서야 드러난다.
   * 값이 두 상태를 이미 담을 수 있는데(컬럼이 nullable이다) 굳이 접을 이유가 없다.
   */
  it('빈 절과 없는 절이 왕복 후에도 구별된다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)

      const withEmpty = await insertTheme(ctx.db, project.id, {
        meta: { id: 'empty', name: '빈 절', version: '1.0.0' },
        patterns: {},
      })
      const without = await insertTheme(ctx.db, project.id, {
        meta: { id: 'absent', name: '없는 절', version: '1.0.0' },
      })

      expect(withEmpty.theme.patterns).toEqual({})
      expect('patterns' in withEmpty.theme).toBe(true)
      expect('patterns' in without.theme).toBe(false)
    })
  })

  it('파생 테마는 extends를 지닌 채 왕복한다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const derived: Theme = {
        meta: { id: 'derived', name: '파생', version: '1.0.0', extends: 'system:admin' },
        tokens: { semantic: { primary: '#f00' } },
      }
      const inserted = await insertTheme(ctx.db, project.id, derived)
      expect(inserted.theme).toEqual(derived)

      // 컬럼에도 실제로 들어갔는가 — 조립만 보면 조립이 값을 지어내도 통과한다.
      const row = await ctx.db
        .selectFrom('themes')
        .select('extends_ref')
        .where('id', '=', inserted.id)
        .executeTakeFirstOrThrow()
      expect(row.extends_ref).toBe('system:admin')
    })
  })

  it('project_id가 null이면 시스템 테마다', async () => {
    await withApi(async (ctx) => {
      const inserted = await insertTheme(ctx.db, null, minimalTheme())
      expect(inserted.projectId).toBeNull()
    })
  })

  describe('조회', () => {
    it('findThemeBySlug는 프로젝트 안에서 찾는다', async () => {
      await withApi(async (ctx) => {
        const { project } = await ownedProject(ctx)
        await insertTheme(ctx.db, project.id, fullTheme())

        const found = await findThemeBySlug(ctx.db, project.id, 'brand')
        expect(found!.theme.meta.name).toBe('브랜드')
        expect(await findThemeBySlug(ctx.db, project.id, '없다')).toBeNull()
      })
    })

    it('findThemeBySlug(null, …)은 시스템 테마를 찾는다', async () => {
      await withApi(async (ctx) => {
        const { project } = await ownedProject(ctx)
        // 시스템 쪽은 기동 동기화가 이미 넣었다(`services/system-themes.ts`) — 여기서
        // 다시 넣으면 유니크 위반이다. 프로젝트 쪽에만 **같은 slug**를 하나 더 만든다.
        await insertTheme(ctx.db, project.id, { meta: { id: 'admin', name: '프로젝트 것', version: '1.0.0' } })

        // 같은 slug가 둘인데 소유자로 갈린다 — `project_id = null`을 `= NULL`로 쓰면
        // 아무것도 안 나온다(SQL의 NULL 비교). 그 갈래를 이 케이스가 잡는다.
        expect((await findThemeBySlug(ctx.db, null, 'admin'))!.projectId).toBeNull()
        expect((await findThemeBySlug(ctx.db, null, 'admin'))!.theme.meta.name).not.toBe('프로젝트 것')
        expect((await findThemeBySlug(ctx.db, project.id, 'admin'))!.theme.meta.name).toBe('프로젝트 것')
      })
    })

    /**
     * **`listThemes`는 그 프로젝트의 테마와 시스템 테마를 함께 낸다.**
     *
     * 이유: 목록의 쓸모가 "이 프로젝트에서 고를 수 있는 테마"인데, 시스템 테마는 어느
     * 프로젝트에서나 고를 수 있다(설계서 「테마 관리」). 시스템 테마를 빼면 부르는 쪽이 매번 두 번
     * 조회해 합쳐야 하고, 그 합치는 규칙이 호출자마다 갈린다.
     */
    it('listThemes는 시스템 테마와 그 프로젝트 테마를 함께 낸다', async () => {
      await withApi(async (ctx) => {
        const { project } = await ownedProject(ctx)
        const other = await createProject(ctx, (await signup(ctx)).cookie)

        // 시스템 `admin`은 기동 동기화가 이미 넣어 두었다.
        await insertTheme(ctx.db, project.id, { meta: { id: 'mine', name: '내 것', version: '1.0.0' } })
        await insertTheme(ctx.db, other.id, { meta: { id: 'theirs', name: '남의 것', version: '1.0.0' } })

        const list = await listThemes(ctx.db, project.id)
        // **기대값을 `SYSTEM_THEME_IDS`에서 파생한다 — 손으로 적지 않는다.**
        // `['admin', 'mine']`처럼 리터럴로 적으면 시스템 테마가 하나 늘 때 이 케이스가
        // **그 테마와 아무 상관 없는 이유로** 죽는다. 그러면 시스템 테마를 만드는 사람마다
        // 남의 테스트 파일을 고치게 되고 병합에서 다시 부딪힌다.
        expect(list.map((entry) => entry.theme.meta.id).sort()).toEqual(
          [...SYSTEM_THEME_IDS, 'mine'].sort(),
        )
        // 정렬 계약: 시스템 테마가 먼저다.
        expect(list[0]!.projectId).toBeNull()
        // 남의 프로젝트 것은 안 나온다 — 위 파생이 넓어져도 이 줄은 그대로 지킨다.
        expect(list.map((entry) => entry.theme.meta.id)).not.toContain('theirs')
      })
    })
  })

  describe('갱신·삭제', () => {
    it('updateTheme이 테마 문서를 통째로 갈아 끼운다', async () => {
      await withApi(async (ctx) => {
        const { project } = await ownedProject(ctx)
        const inserted = await insertTheme(ctx.db, project.id, fullTheme())

        const next: Theme = { meta: { id: 'brand', name: '바뀐 이름', version: '3.0.0' } }
        const updated = await updateTheme(ctx.db, inserted.id, next)
        expect(updated!.theme).toEqual(next)

        // **절이 실제로 비워졌는가.** 통째 교체인데 옛 절이 남으면 "지울 수 없는 절"이 생긴다.
        const read = await findThemeById(ctx.db, inserted.id)
        expect('tokens' in read!.theme).toBe(false)
        expect('components' in read!.theme).toBe(false)
      })
    })

    it('updateTheme은 없는 id에 null을 낸다', async () => {
      await withApi(async (ctx) => {
        expect(
          await updateTheme(ctx.db, '00000000-0000-0000-0000-000000000000', minimalTheme()),
        ).toBeNull()
      })
    })

    it('deleteTheme이 지우고, 없으면 false다', async () => {
      await withApi(async (ctx) => {
        const { project } = await ownedProject(ctx)
        const inserted = await insertTheme(ctx.db, project.id, fullTheme())

        expect(await deleteTheme(ctx.db, inserted.id)).toBe(true)
        expect(await findThemeById(ctx.db, inserted.id)).toBeNull()
        expect(await deleteTheme(ctx.db, inserted.id)).toBe(false)
      })
    })
  })

  /**
   * **테마 문자열 값의 NUL 바이트.**
   *
   * 답: **레포가 막아야 한다.** 근거는 컬럼 타입이 `json`인 대가다 —
   * `jsonb`는 ` `을 **삽입 시점에** 거부하지만(`22P05`) `json`은 받아 두었다가
   * 텍스트로 뽑을 때에야 죽는다(`themes-schema.test.ts`가 그 관찰을 고정한다).
   * 즉 막지 않으면 **저장은 성공하고 나중에 알 수 없는 자리에서 터진다.**
   *
   * `pages`가 파이프라인 8단계에서 같은 검사를 하는 것과 같은 자리다.
   */
  it('NUL이 든 값은 저장하지 않고 던진다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const nul = String.fromCharCode(0)

      await expect(
        insertTheme(ctx.db, project.id, {
          meta: { id: 'nul', name: '널', version: '1.0.0' },
          tokens: { semantic: { primary: `#00${nul}0` } },
        }),
      ).rejects.toThrow(ThemeNulByteError)

      const rows = await ctx.db.selectFrom('themes').select('id').where('slug', '=', 'nul').execute()
      expect(rows).toHaveLength(0)
    })
  })

  it('meta 안의 NUL도 막는다 — 값이 절 밖에도 있다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const nul = String.fromCharCode(0)

      await expect(
        insertTheme(ctx.db, project.id, {
          meta: { id: 'nul2', name: `이름${nul}`, version: '1.0.0' },
        }),
      ).rejects.toThrow(ThemeNulByteError)
    })
  })

  it('updateTheme도 같은 검사를 한다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const inserted = await insertTheme(ctx.db, project.id, minimalTheme())
      const nul = String.fromCharCode(0)

      await expect(
        updateTheme(ctx.db, inserted.id, {
          meta: { id: 'min', name: `이름${nul}`, version: '1.0.0' },
        }),
      ).rejects.toThrow(ThemeNulByteError)
    })
  })

  /**
   * slug 중복은 DB 제약이 낸다 — 레포는 그것을 도메인 에러로 바꾼다
   * (`repos/projects.ts`의 `DuplicateSlugError`와 같은 형식).
   *
   * **`withTransaction`으로 감싸는 것이 요점이다** — 감싸지 않으면 이 실패가 호출자의
   * 트랜잭션 전체를 `25P02`로 오염시켜 그 뒤 문장이 전부 죽는다. 아래 조회가 사는 것이
   * 그 격리의 증거다.
   */
  it('같은 프로젝트에 같은 slug는 던지고, 그 실패가 트랜잭션을 오염시키지 않는다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      await insertTheme(ctx.db, project.id, fullTheme())

      await expect(insertTheme(ctx.db, project.id, fullTheme())).rejects.toThrow()

      const rows = await ctx.db.selectFrom('themes').select('id').where('slug', '=', 'brand').execute()
      expect(rows).toHaveLength(1)
    })
  })

  it('updated_at이 갱신 때 올라간다', async () => {
    await withApi(async (ctx) => {
      const { project } = await ownedProject(ctx)
      const inserted = await insertTheme(ctx.db, project.id, fullTheme())

      // `now()`는 트랜잭션 시작 시각으로 고정되므로 같은 트랜잭션 안에서는 값이 같다.
      // 그래서 시각 비교가 아니라 **컬럼이 UPDATE에 실렸는지**를 본다.
      const before = await ctx.db
        .selectFrom('themes')
        .select('updated_at')
        .where('id', '=', inserted.id)
        .executeTakeFirstOrThrow()

      await withTransaction(ctx.db, async () => {
        await updateTheme(ctx.db, inserted.id, minimalTheme())
      })

      const after = await ctx.db
        .selectFrom('themes')
        .select('updated_at')
        .where('id', '=', inserted.id)
        .executeTakeFirstOrThrow()
      expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime())
    })
  })
})
