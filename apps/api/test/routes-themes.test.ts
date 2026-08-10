/**
 * 테마 라우트. 권한·본문 검증·상속을 고정한다.
 *
 * 역할 × 엔드포인트의 전수 판정은 `permission-matrix.test.ts`에 있다 — 여기서는 그
 * 매트릭스가 다루지 못하는 것(시스템 테마의 읽기 전용, 남의 프로젝트 테마)만 본다.
 */
import { ADMIN_THEME, type Theme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { insertTheme } from '../src/repos/themes'
import { addMember, createProject, signup, withApi, type TestContext } from './helpers'

const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

function brandTheme(overrides: Partial<Theme['meta']> = {}): Theme {
  return {
    meta: { id: 'brand', name: '브랜드', version: '1.0.0', ...overrides },
    tokens: { semantic: { primary: '#2563eb' } },
  }
}

function post(ctx: TestContext, projectId: string, cookie: { wb_session: string }, theme: unknown) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/themes`,
    cookies: cookie,
    payload: { theme } as never,
  })
}

function put(
  ctx: TestContext,
  projectId: string,
  themeId: string,
  cookie: { wb_session: string },
  theme: unknown,
) {
  return ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/themes/${themeId}`,
    cookies: cookie,
    payload: { theme } as never,
  })
}

async function ownedProject(ctx: TestContext) {
  const owner = await signup(ctx)
  return { owner, project: await createProject(ctx, owner.cookie) }
}

/** 시스템 `admin`의 행 id. 기동 동기화가 넣어 둔 것을 찾는다. */
async function systemAdminId(ctx: TestContext): Promise<string> {
  const row = await ctx.db
    .selectFrom('themes')
    .select('id')
    .where('project_id', 'is', null)
    .where('slug', '=', 'admin')
    .executeTakeFirstOrThrow()
  return row.id
}

describe('테마 라우트', () => {
  describe('목록·조회', () => {
    it('목록에 시스템 테마와 이 프로젝트의 테마가 함께 나온다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        await insertTheme(ctx.db, project.id, brandTheme())

        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/themes`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(200)

        const body: { id: string; system: boolean; theme: Theme }[] = res.json()
        expect(body.map((entry) => entry.theme.meta.id)).toEqual(['admin', 'brand'])
        expect(body.map((entry) => entry.system)).toEqual([true, false])
      })
    })

    it('남의 프로젝트 테마는 404다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const other = await ownedProject(ctx)
        const theirs = await insertTheme(ctx.db, other.project.id, brandTheme())

        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/themes/${theirs.id}`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(404)
      })
    })

    it('시스템 테마는 어느 프로젝트에서나 조회된다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)

        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/themes/${await systemAdminId(ctx)}`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().system).toBe(true)
        expect(res.json().theme).toEqual(ADMIN_THEME)
      })
    })

    it('없는 id는 404다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/themes/${NONEXISTENT_UUID}`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(404)
      })
    })
  })

  describe('생성', () => {
    it('만들면 201이고 그대로 왕복한다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)

        const res = await post(ctx, project.id, owner.cookie, brandTheme())
        expect(res.statusCode).toBe(201)
        expect(res.json().theme).toEqual(brandTheme())
        expect(res.json().system).toBe(false)
      })
    })

    it('같은 id를 두 번 만들면 409다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        expect((await post(ctx, project.id, owner.cookie, brandTheme())).statusCode).toBe(201)

        const res = await post(ctx, project.id, owner.cookie, brandTheme())
        expect(res.statusCode).toBe(409)
        expect(res.json().error.code).toBe('conflict')
      })
    })
  })

  /**
   * **§7.1 게이트와 같은 갈래다** — 봉투(400)와 의미(422)가 다른 성질이다(설계 §13).
   */
  describe('본문 검증 — 400과 422가 갈린다', () => {
    it('봉투가 깨지면 400이다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)

        // `meta`가 없다 — `ThemePatchSchema`가 거부한다.
        expect((await post(ctx, project.id, owner.cookie, { tokens: {} })).statusCode).toBe(400)
        // 선언되지 않은 절 이름 — `z.strictObject`가 거부한다.
        expect(
          (await post(ctx, project.id, owner.cookie, { meta: { id: 'a', name: '가', version: '1' }, tokns: {} }))
            .statusCode,
        ).toBe(400)
        // `meta.id`가 `THEME_ID_PATTERN` 밖이다(`.`이 들어갔다).
        expect(
          (await post(ctx, project.id, owner.cookie, { meta: { id: 'a.b', name: '가', version: '1' } })).statusCode,
        ).toBe(400)
      })
    })

    it('선언되지 않은 본문 키는 400이다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${project.id}/themes`,
          cookies: owner.cookie,
          payload: { theme: brandTheme(), 몰라: 1 } as never,
        })
        expect(res.statusCode).toBe(400)
      })
    })

    it('봉투는 멀쩡한데 내용이 처리 불가하면 422이고 issues를 싣는다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)

        const res = await post(ctx, project.id, owner.cookie, {
          meta: { id: 'bad', name: '나쁨', version: '1.0.0' },
          // 없는 토큰을 가리킨다 — 절 안쪽은 봉투가 `unknown`으로 통과시키므로 여기서 잡힌다.
          tokens: { semantic: { primary: '{palette.없다}' } },
        })

        expect(res.statusCode).toBe(422)
        expect(res.json().error.code).toBe('validation-failed')
        const issues: { code: string; severity: string; path: string }[] = res.json().error.issues
        expect(issues.length).toBeGreaterThan(0)
        // severity가 실려 나간다(Task 1). 오늘 테마 이슈는 전부 error다(재라 #3).
        expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
      })
    })

    it('422면 아무것도 저장되지 않는다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        await post(ctx, project.id, owner.cookie, {
          meta: { id: 'bad', name: '나쁨', version: '1.0.0' },
          tokens: { semantic: { primary: '{palette.없다}' } },
        })

        const rows = await ctx.db.selectFrom('themes').select('id').where('slug', '=', 'bad').execute()
        expect(rows).toHaveLength(0)
      })
    })

    it('NUL이 든 테마는 400이다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const nul = String.fromCharCode(0)

        const res = await post(ctx, project.id, owner.cookie, {
          meta: { id: 'nul', name: `이름${nul}`, version: '1.0.0' },
        })
        expect(res.statusCode).toBe(400)
      })
    })
  })

  describe('수정·삭제', () => {
    it('PUT은 문서를 통째로 갈아 끼운다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const created = (await post(ctx, project.id, owner.cookie, brandTheme())).json()

        const next: Theme = { meta: { id: 'brand', name: '새 이름', version: '2.0.0' } }
        const res = await put(ctx, project.id, created.id, owner.cookie, next)
        expect(res.statusCode).toBe(200)
        // 옛 `tokens`가 남지 않는다.
        expect(res.json().theme).toEqual(next)
      })
    })

    it('DELETE는 204이고 다시 부르면 404다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const created = (await post(ctx, project.id, owner.cookie, brandTheme())).json()

        const res = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/themes/${created.id}`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(204)

        const again = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/themes/${created.id}`,
          cookies: owner.cookie,
        })
        expect(again.statusCode).toBe(404)
      })
    })

    /**
     * **시스템 테마는 owner도 못 고친다(§6.10).** 403이지 404가 아닌 이유는
     * `routes/themes.ts`의 주석에 있다 — 목록·조회가 이미 그 존재를 보여 주므로
     * 숨길 것이 없고, 말해야 하는 것은 *"읽기 전용이다"*다.
     */
    it('시스템 테마 수정은 owner도 403이다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const res = await put(ctx, project.id, await systemAdminId(ctx), owner.cookie, brandTheme())
        expect(res.statusCode).toBe(403)
        expect(res.json().error.code).toBe('forbidden')
      })
    })

    it('시스템 테마 삭제도 403이고 행이 남는다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const adminId = await systemAdminId(ctx)

        const res = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/themes/${adminId}`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(403)

        const rows = await ctx.db.selectFrom('themes').select('id').where('id', '=', adminId).execute()
        expect(rows).toHaveLength(1)
      })
    })

    it('남의 프로젝트 테마 수정은 404다 — 존재를 숨긴다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const other = await ownedProject(ctx)
        const theirs = await insertTheme(ctx.db, other.project.id, brandTheme())

        const res = await put(ctx, project.id, theirs.id, owner.cookie, brandTheme())
        expect(res.statusCode).toBe(404)
      })
    })

    it('editor는 만들 수 없지만 읽을 수는 있다', async () => {
      await withApi(async (ctx) => {
        const { project } = await ownedProject(ctx)
        const editor = await signup(ctx)
        await addMember(ctx, project.id, editor.user.id, 'editor')

        expect((await post(ctx, project.id, editor.cookie, brandTheme())).statusCode).toBe(403)

        const list = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/themes`,
          cookies: editor.cookie,
        })
        expect(list.statusCode).toBe(200)
      })
    })
  })
})

/**
 * **Task 7 — 파생 테마(`extends_ref`).**
 *
 * 저장되는 것은 **파생 그대로**다(계획서 D2) — `mergeTheme`이 내는 홀로 서는 결과는
 * 저장하지 않는다. 그 결과가 저장될 자리는 §4.5의 스냅샷 하나뿐이고 이 슬라이스 밖이다.
 */
describe('파생 테마', () => {
  function derived(overrides: Partial<Theme['meta']> = {}): Theme {
    return {
      meta: { id: 'derived', name: '파생', version: '1.0.0', extends: 'system:admin', ...overrides },
      tokens: { semantic: { primary: '#ff0000' } },
    }
  }

  it('만들면 extends를 지닌 채 왕복한다 (D2)', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      const res = await post(ctx, project.id, owner.cookie, derived())
      expect(res.statusCode).toBe(201)
      expect(res.json().theme).toEqual(derived())
      expect(res.json().theme.meta.extends).toBe('system:admin')

      // 병합 결과가 저장되지 않았다는 증거: base의 절들이 따라 들어오지 않았다.
      expect(res.json().theme.components).toBeUndefined()
    })
  })

  it('extends_ref 컬럼에 실제로 들어간다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const created = (await post(ctx, project.id, owner.cookie, derived())).json()

      const row = await ctx.db
        .selectFrom('themes')
        .select('extends_ref')
        .where('id', '=', created.id)
        .executeTakeFirstOrThrow()
      expect(row.extends_ref).toBe('system:admin')
    })
  })

  /**
   * **없는 상속 대상은 422다** — 재서 정했다(`routes/themes.ts`의 주석에 근거).
   * 형식 위반은 400이 따로 잡으므로 여기 남는 것은 *"꼴은 맞는데 그런 테마가 없다"*이고,
   * 그것은 페이지의 `unknown-type`과 같은 부류다.
   */
  it('없는 시스템 테마를 상속하면 422다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      // 이름은 ASCII다 — `EXTENDS_PATTERN`이 `[A-Za-z0-9_-]`만 받으므로 한글을 쓰면
      // 봉투(400)에서 걸려 이 케이스가 재려는 갈래(422)에 도달하지 못한다.
      const res = await post(ctx, project.id, owner.cookie, derived({ extends: 'system:missing' }))
      expect(res.statusCode).toBe(422)
      expect(res.json().error.issues[0].code).toBe('bad-extends')
      expect(res.json().error.issues[0].path).toBe('meta.extends')
    })
  })

  it('extends 형식이 틀리면 400이다 — 422와 갈린다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      // `system:` 접두어가 없다 — `EXTENDS_PATTERN`(봉투)이 거부한다.
      const res = await post(ctx, project.id, owner.cookie, derived({ extends: 'admin' }))
      expect(res.statusCode).toBe(400)
    })
  })

  /**
   * **깊이 2를 막는다(§6.9).** 파생 테마를 상속하려 해도 `extends`가 가리키는 것은
   * 언제나 **코드의 시스템 테마**이므로 그런 이름이 없어 422가 된다.
   */
  it('파생 테마를 다시 상속하면 422다 (깊이 1단계)', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      expect((await post(ctx, project.id, owner.cookie, derived())).statusCode).toBe(201)

      const res = await post(ctx, project.id, owner.cookie, {
        meta: { id: 'grand', name: '손자', version: '1.0.0', extends: 'system:derived' },
      })
      expect(res.statusCode).toBe(422)
      expect(res.json().error.issues[0].code).toBe('bad-extends')
    })
  })

  it('상속을 선언하지 않았는데 base가 필요한 값을 쓰면 422다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      // base 없이 해석되므로 `{semantic.…}` 참조가 자기 문서 안에서 풀려야 한다.
      const res = await post(ctx, project.id, owner.cookie, {
        meta: { id: 'lonely', name: '홀로', version: '1.0.0' },
        components: { List: { base: { bg: '{semantic.primary}' } } },
      })
      expect(res.statusCode).toBe(422)
    })
  })

  /**
   * **재라 #6 — 파생 테마 조회가 base를 함께 주는가.**
   *
   * 답: **준다(상세 조회에만).**
   *
   * 근거: `resolveTheme(document, base)`가 base 없이는 파생 문서를 **해석 자체를 거부한다**
   * (`bad-extends` — "상속을 선언한 문서를 해석하려면 상속 대상 테마가 필요합니다").
   * base를 빼고 내면 클라이언트가 **쓸 수 없는 것**을 받는다. 서버는 이미 둘 다 갖고
   * 있으므로 라운드트립 하나로 끝낸다.
   *
   * **목록에는 싣지 않는다** — 목록의 모든 파생 항목마다 시스템 테마 전문이 붙어 응답이
   * 항목 수만큼 부푼다. 목록의 쓸모는 고르기이지 그리기가 아니다.
   */
  it('상세 조회가 base를 함께 준다 (재라 #6)', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const created = (await post(ctx, project.id, owner.cookie, derived())).json()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/themes/${created.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().base).toEqual(ADMIN_THEME)
    })
  })

  it('상속하지 않는 테마의 상세에는 base 키가 없다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const created = (await post(ctx, project.id, owner.cookie, brandTheme())).json()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/themes/${created.id}`,
        cookies: owner.cookie,
      })
      expect(Object.keys(res.json())).not.toContain('base')
    })
  })

  it('목록에는 base를 싣지 않는다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      await post(ctx, project.id, owner.cookie, derived())

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/themes`,
        cookies: owner.cookie,
      })
      for (const entry of res.json()) {
        expect(Object.keys(entry)).not.toContain('base')
      }
    })
  })
})
