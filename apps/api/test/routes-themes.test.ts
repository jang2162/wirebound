/**
 * 테마 라우트. 권한·본문 검증·상속을 고정한다.
 *
 * 역할 × 엔드포인트의 전수 판정은 `permission-matrix.test.ts`에 있다 — 여기서는 그
 * 매트릭스가 다루지 못하는 것(시스템 테마의 읽기 전용, 남의 프로젝트 테마)만 본다.
 */
import { ADMIN_THEME, SYSTEM_THEME_IDS, THEME_ISSUE_SEVERITY, themeIssue, type Theme } from '@wirebound/themes'
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
        // **기대값을 `SYSTEM_THEME_IDS`에서 파생한다** — 이유는 `repos-themes.test.ts`의
        // 같은 자리에 적었다. 정렬 계약이 *"시스템 테마가 먼저, 각 무리 안에서는 slug 순"*
        // 이므로(`repos/themes.ts`의 `listThemes`) 파생한 목록도 정렬한다.
        expect(body.map((entry) => entry.theme.meta.id)).toEqual([
          ...[...SYSTEM_THEME_IDS].sort(),
          'brand',
        ])
        expect(body.map((entry) => entry.system)).toEqual([
          ...SYSTEM_THEME_IDS.map(() => true),
          false,
        ])
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

    /**
     * `layouts.theme_id`가 `ON DELETE RESTRICT`이므로 쓰이고 있는 테마는 지워지지 않는다.
     * 500이 아니라 409로 나가야 사용자가 무엇을 먼저 해야 하는지 안다.
     */
    it('레이아웃이 쓰고 있는 테마 삭제는 409다', async () => {
      await withApi(async (ctx) => {
        const { owner, project } = await ownedProject(ctx)
        const created = (await post(ctx, project.id, owner.cookie, brandTheme())).json()

        // 기본 레이아웃이 이 테마를 가리키게 한다.
        await ctx.db
          .updateTable('layouts')
          .set({ theme_id: created.id })
          .where('project_id', '=', project.id)
          .execute()

        const res = await ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${project.id}/themes/${created.id}`,
          cookies: owner.cookie,
        })
        expect(res.statusCode).toBe(409)
        expect(res.json().error.code).toBe('conflict')

        const rows = await ctx.db.selectFrom('themes').select('id').where('id', '=', created.id).execute()
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

  /**
   * **이 이슈는 `themes` 패키지 밖에서 만들어진다** — 저장 경계가 *"상속 대상이 코드에
   * 없다"*를 낸다. 그래서 `severity`가 표를 지나는지 **여기서** 지켜야 한다.
   *
   * 처음에 객체 리터럴로 짓고 `severity: 'error'`를 손으로 박았는데, 리뷰가 그 자리를
   * `'warning'`으로 바꿔도 **api 599케이스가 전부 통과했다**(구분력 0). 아래 단언이
   * 그 변이를 죽인다 — 표와 실제 값을 맞대므로 어느 한쪽만 바뀌어도 갈린다.
   */
  it('없는 상속 대상 이슈가 severity 표를 지난다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const res = await post(ctx, project.id, owner.cookie, derived({ extends: 'system:missing' }))

      expect(res.statusCode).toBe(422)
      const [issue] = res.json().error.issues
      // **표에서 온 값과 맞댄다.** 손으로 박은 값이 표와 갈리는 순간 죽는다.
      expect(issue.severity).toBe(THEME_ISSUE_SEVERITY['bad-extends'])
      // 팩토리가 지은 것과 **모양까지** 같다 — `code`와 `severity`가 어긋날 자리를 없앤다.
      expect(issue).toEqual(themeIssue('bad-extends', 'meta.extends', issue.message))
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

/**
 * **고르개 — `PUT /:projectId/theme`**(P4b-3 계획서 D2).
 *
 * 오늘 프로젝트의 테마를 바꾸는 경로가 **없었다**. 사슬
 * `projects.default_layout_id → layouts.theme_id → themes` 중 가운데를 바꾸는 수단이
 * 없어 DB를 직접 고쳐야 테마가 캔버스에 실렸다(P4a-3 이월의 *"테마를 화면에 거는 경로가
 * 없다"*). 레이아웃 CRUD를 만들지 않고 **그 한 필드**만 여는 라우트다.
 */
describe('테마 고르기 (PUT /:projectId/theme)', () => {
  function choose(
    ctx: TestContext,
    projectId: string,
    cookie: { wb_session: string },
    body: unknown,
  ) {
    return ctx.app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/theme`,
      cookies: cookie,
      payload: body as never,
    })
  }

  function derived(): Theme {
    return {
      meta: { id: 'derived', name: '파생', version: '1.0.0', extends: 'system:admin' },
      tokens: { semantic: { primary: '#ff0000' } },
    }
  }

  function currentTheme(ctx: TestContext, projectId: string, cookie: { wb_session: string }) {
    return ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/theme`,
      cookies: cookie,
    })
  }

  it('고른 테마가 GET에 그대로 나온다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const brand = await insertTheme(ctx.db, project.id, brandTheme())

      const res = await choose(ctx, project.id, owner.cookie, { themeId: brand.id })
      expect(res.statusCode).toBe(200)
      expect(res.json().theme.meta.id).toBe('brand')
      // **`themeId`가 함께 나온다** — 고르개가 *"지금 무엇이 골라져 있는가"*를 알 유일한
      // 길이다. `theme.meta.id`(slug)로는 못 맞댄다: 시스템 테마와 프로젝트 테마가 같은
      // slug를 가질 수 있다(`(project_id, slug)`가 유일성 단위다).
      expect(res.json().themeId).toBe(brand.id)

      // **이것이 이 라우트의 쓸모다** — 고른 것이 캔버스가 읽는 자리에 실린다.
      expect((await currentTheme(ctx, project.id, owner.cookie)).json().theme.meta.id).toBe('brand')
    })
  })

  it('응답이 GET과 글자까지 같은 꼴이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const brand = await insertTheme(ctx.db, project.id, brandTheme())

      const put = (await choose(ctx, project.id, owner.cookie, { themeId: brand.id })).json()
      const get = (await currentTheme(ctx, project.id, owner.cookie)).json()
      // 꼴이 갈리면 고르개 UI가 응답을 그대로 쓸 수 없어 한 번 더 조회하게 된다.
      expect(put).toEqual(get)
    })
  })

  it('시스템 테마를 고를 수 있다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const adminId = await systemAdminId(ctx)

      const res = await choose(ctx, project.id, owner.cookie, { themeId: adminId })
      expect(res.statusCode).toBe(200)
      expect(res.json().theme.meta.id).toBe('admin')
    })
  })

  it('파생 테마를 고르면 GET이 합쳐서 낸다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const created = (await post(ctx, project.id, owner.cookie, derived())).json()

      const res = await choose(ctx, project.id, owner.cookie, { themeId: created.id })
      expect(res.statusCode).toBe(200)
      // 파생이어도 `themeId`는 **저장된 파생 테마의 행 id**다 — base의 것이 아니다.
      expect(res.json().themeId).toBe(created.id)
      // base(`admin`)의 값이 실려 있다 — 합치지 않으면 파생이 더한 것만 나온다.
      expect(res.json().theme.tokens.semantic.primary).toBeDefined()
      expect(res.json().theme.meta.extends).toBeUndefined()
    })
  })

  /**
   * **`null`은 정상 상태다**(D2). `layouts.theme_id`가 `NULL`을 받고
   * (`0007-layouts.ts`), 그때 화면은 구조 기본 CSS만으로 그려진다. 고르개에
   * *"없음"*이 있어야 그 상태를 눈으로 확인할 수 있다.
   */
  it('null로 테마를 벗길 수 있다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const brand = await insertTheme(ctx.db, project.id, brandTheme())
      await choose(ctx, project.id, owner.cookie, { themeId: brand.id })

      const res = await choose(ctx, project.id, owner.cookie, { themeId: null })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ themeId: null, theme: null, issues: [] })
      expect((await currentTheme(ctx, project.id, owner.cookie)).json().theme).toBeNull()
    })
  })

  /**
   * **목록 밖의 `themeId`는 거절한다**(D2). `GET /:projectId/themes`가 이미
   * *"이 프로젝트에서 고를 수 있는 것"*을 뜻한다(`repos/themes.ts`의 `listThemes` 주석).
   *
   * **404인 것이 요점이다** — 남의 프로젝트 테마는 존재를 숨긴다(설계 §10,
   * `requireWritableTheme`이 같은 판정을 한다). 403이면 *"그런 테마가 있다"*를 말한다.
   */
  it('남의 프로젝트 테마는 고를 수 없다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const other = await ownedProject(ctx)
      const theirs = await insertTheme(ctx.db, other.project.id, brandTheme())

      const res = await choose(ctx, project.id, owner.cookie, { themeId: theirs.id })
      expect(res.statusCode).toBe(404)
      // 고르기 전 상태가 그대로다 — 거절이 부분적으로 반영되지 않는다.
      // 새 프로젝트의 기본 레이아웃은 시스템 `admin`을 가리킨다(`repos/projects.ts`).
      expect((await currentTheme(ctx, project.id, owner.cookie)).json().theme.meta.id).toBe('admin')
    })
  })

  it('없는 테마 id는 404다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const res = await choose(ctx, project.id, owner.cookie, { themeId: NONEXISTENT_UUID })
      expect(res.statusCode).toBe(404)
    })
  })

  /**
   * **기본 레이아웃이 없는 프로젝트는 409다 — 재라 #1의 답.**
   *
   * 0007 이전에 만들어진 프로젝트가 그 상태이고 P4a-3 재라 #8이 *"만들어 주지 않는다"*로
   * 닫았다. 그래서 이 라우트가 그 상태를 **소리 내야** 한다(D2).
   *
   * **404가 아닌 이유:** `projectGuard`가 outsider에게 이미 404를 낸다(§10 — 프로젝트
   * 존재를 숨긴다). 같은 코드를 쓰면 owner가 받은 404가 *"내 프로젝트가 사라졌다"*로
   * 읽힌다. **409인 이유:** 이 저장소에서 409는 *"요청은 옳은데 지금 상태가 그것을
   * 허락하지 않는다"*이다(자식 있는 메뉴 삭제·쓰이고 있는 테마 삭제 — README 에러 표).
   * 그리고 이 상태는 **고쳐질 수 있는 상태**다 — 404는 "없다"로 끝나지만 409는
   * "지금은 안 된다"를 말한다.
   *
   * **GET은 조용한 채로 둔다.** 없는 것을 읽는 것은 정상이고(`{theme:null}`),
   * 없는 것에 쓰는 것만 실패한다.
   */
  it('기본 레이아웃이 없는 프로젝트는 409다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const brand = await insertTheme(ctx.db, project.id, brandTheme())
      // 0007 이전 프로젝트를 재현한다 — 그 상태를 만드는 API가 없다.
      await ctx.db.updateTable('projects').set({ default_layout_id: null }).where('id', '=', project.id).execute()

      const res = await choose(ctx, project.id, owner.cookie, { themeId: brand.id })
      expect(res.statusCode).toBe(409)
      // GET은 같은 상태에서 조용하다.
      expect((await currentTheme(ctx, project.id, owner.cookie)).json()).toEqual({
        themeId: null,
        theme: null,
        issues: [],
      })
    })
  })

  it('선언하지 않은 키와 uuid가 아닌 값은 400이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      expect((await choose(ctx, project.id, owner.cookie, { themeId: null, extra: 1 })).statusCode).toBe(400)
      expect((await choose(ctx, project.id, owner.cookie, { themeId: 'admin' })).statusCode).toBe(400)
      expect((await choose(ctx, project.id, owner.cookie, {})).statusCode).toBe(400)
    })
  })

  /**
   * **editor는 고를 수 없다** — 테마 편집과 같은 등급이다(§10·§6.10). 역할 × 엔드포인트의
   * 전수 판정은 `permission-matrix.test.ts`가 하고, 여기서는 *"거절이 상태를 안 바꾼다"*를
   * 함께 본다.
   */
  it('editor가 고르면 403이고 상태가 안 바뀐다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const brand = await insertTheme(ctx.db, project.id, brandTheme())
      const member = await signup(ctx)
      await addMember(ctx, project.id, member.user.id, 'editor')

      expect((await choose(ctx, project.id, member.cookie, { themeId: brand.id })).statusCode).toBe(403)
      expect((await currentTheme(ctx, project.id, owner.cookie)).json().theme.meta.id).toBe('admin')
    })
  })
})
