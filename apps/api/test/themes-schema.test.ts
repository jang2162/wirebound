import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { createProject, signup, withApi, type TestContext } from './helpers'

/**
 * 마이그레이션 0006이 만든 `themes` 스키마의 성질을 고정한다. 라우트가 아니라 **테이블**을
 * 검사한다 — 제약이 실제로 DB에 걸려 있는지는 SQL을 직접 던져야만 알 수 있다
 * (`revisions-schema.test.ts`와 같은 형식).
 *
 * 제약 위반을 유발하는 조작은 전부 `withTransaction`으로 감싼다. 감싸지 않으면 그 실패가
 * `withApi`의 트랜잭션 전체를 aborted(`25P02`)로 만들어 이후 단언이 전부 무너진다.
 */

/**
  * 절을 하나도 안 채운 최소 행. `insertInto`가 요구하는 NOT NULL 컬럼만 담는다.
  *
  * **slug가 `admin`이 아닌 이유:** `buildApp`이 기동마다 시스템 테마를 동기화하므로
  * (`services/system-themes.ts`) `(NULL, 'admin')` 행이 이미 있다. 그 이름을 쓰면 이
  * 파일의 첫 삽입부터 유니크 위반이 나서 스키마가 아니라 동기화를 재게 된다.
  */
function minimalRow(overrides: Record<string, unknown> = {}) {
  return { slug: 'probe', name: '탐침', version: '1.0.0', ...overrides }
}

function insertTheme(ctx: TestContext, values: Record<string, unknown>) {
  return withTransaction(ctx.db, (trx) =>
    trx.insertInto('themes').values(values as never).returningAll().executeTakeFirstOrThrow(),
  )
}

describe('themes 스키마 (0006)', () => {
  it('project_id가 NULL인 행 — 시스템 테마 — 을 받는다', async () => {
    await withApi(async (ctx) => {
      const row = await insertTheme(ctx, minimalRow())
      expect(row.project_id).toBeNull()
      expect(row.extends_ref).toBeNull()
      // 절은 전부 선택이다. **없는 것과 빈 것을 가르기 위해** NULL을 허용한다.
      expect(row.tokens).toBeNull()
      expect(row.components).toBeNull()
    })
  })

  /**
   * **Postgres에서 NULL은 서로 같지 않다.**
   *
   * 관찰: 평범한 `UNIQUE (project_id, slug)`를 건 임시 테이블에 `(NULL, 'admin')`을
   * 두 번 넣으니 **둘 다 남았다**(컨테이너에서 직접 쟀다, PostgreSQL 16.14).
   * 원인: SQL의 NULL은 자기 자신과도 같지 않으므로 그 쌍이 애초에 충돌로 판정되지 않는다.
   * 즉 평범한 UNIQUE로는 **시스템 테마의 slug 중복이 전혀 막히지 않는다.**
   *
   * 결정: `UNIQUE NULLS NOT DISTINCT (project_id, slug)`(PG15+). 부분 인덱스를 따로 두는
   * 대신 제약 하나로 두는 이유 둘 — (1) 뜻이 하나다("slug는 소유자 안에서 유일하고,
   * 시스템 테마의 소유자는 '없음'이다"), (2) 기동 동기화가
   * `ON CONFLICT (project_id, slug)` 하나로 시스템·프로젝트 테마를 함께 다룰 수 있다
   * (부분 인덱스면 `ON CONFLICT (slug) WHERE project_id IS NULL`로 갈라 적어야 한다).
   */
  it('시스템 테마의 slug 중복을 막는다 (NULLS NOT DISTINCT)', async () => {
    await withApi(async (ctx) => {
      await insertTheme(ctx, minimalRow())
      await expect(insertTheme(ctx, minimalRow())).rejects.toThrow()

      // slug로 좁혀 센다 — 기동 동기화가 넣어 둔 시스템 테마가 함께 있기 때문이다.
      const rows = await ctx.db.selectFrom('themes').select('id').where('slug', '=', 'probe').execute()
      expect(rows).toHaveLength(1)
    })
  })

  it('프로젝트가 다르면 같은 slug를 쓸 수 있다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const a = await createProject(ctx, owner.cookie)
      const b = await createProject(ctx, owner.cookie)

      await insertTheme(ctx, minimalRow({ project_id: a.id, slug: 'brand' }))
      await insertTheme(ctx, minimalRow({ project_id: b.id, slug: 'brand' }))

      const rows = await ctx.db.selectFrom('themes').select('id').where('slug', '=', 'brand').execute()
      expect(rows).toHaveLength(2)
    })
  })

  it('같은 프로젝트 안에서는 slug가 유일하다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      await insertTheme(ctx, minimalRow({ project_id: project.id, slug: 'brand' }))
      await expect(insertTheme(ctx, minimalRow({ project_id: project.id, slug: 'brand' }))).rejects.toThrow()
    })
  })

  it('프로젝트를 지우면 그 테마도 함께 사라진다 (CASCADE)', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await insertTheme(ctx, minimalRow({ project_id: project.id, slug: 'brand' }))

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      // **`project_id`로 좁혀 세지 않는다.** `ON DELETE SET NULL`이었다면 그 행은 살아남아
      // 시스템 테마가 되는데, 좁혀 세면 0건이라 그 갈래가 통과해 버린다(심어서 확인했다).
      const rows = await ctx.db.selectFrom('themes').select('id').where('slug', '=', 'brand').execute()
      expect(rows).toHaveLength(0)
    })
  })

  /**
   * **절 컬럼이 `jsonb`가 아니라 `json`이다.**
   *
   * `compileTheme`의 계약은 **문서 키 순서가 곧 우선순위**인데 `jsonb`는 키를
   * (길이, 바이트)로 정규화한다(컨테이너에서 직접 쟀다). `json`은 원문을 그대로 보관한다.
   * 자세한 근거·대가는 `0006-themes.ts`의 주석과 `theme-order.test.ts`에 있다.
   *
   * 이 케이스는 **컬럼 타입 그 자체**를 고정한다 — 누군가 `jsonb`로 되돌리면 여기서 죽는다.
   * 왕복이 실제로 순서를 지키는지는 `theme-order.test.ts`가 따로 잰다.
   */
  it('절 컬럼이 json이다 (jsonb가 아니다)', async () => {
    await withApi(async (ctx) => {
      const rows = await sql<{ column_name: string; data_type: string }>`
        select column_name, data_type from information_schema.columns
        where table_name = 'themes' and column_name in ('tokens','primitives','components','patterns','assets')
        order by column_name
      `.execute(ctx.db)

      expect(rows.rows.map((row) => row.column_name)).toEqual([
        'assets',
        'components',
        'patterns',
        'primitives',
        'tokens',
      ])
      expect(rows.rows.map((row) => row.data_type)).toEqual(rows.rows.map(() => 'json'))
    })
  })

  /**
   * **`json`은 NUL을 입구에서 막아 주지 않는다.**
   *
   * `jsonb`는 `\u0000`이 든 값을 **삽입 시점에** 거부한다(`22P05 unsupported Unicode
   * escape sequence`). `json`은 원문을 그대로 보관하므로 **삽입이 성공하고**, 나중에
   * `->>`로 텍스트를 뽑을 때에야 같은 에러가 난다(둘 다 컨테이너에서 직접 쟀다).
   *
   * 즉 `json`을 고른 대가로 **DB가 대신 잡아 주던 방벽 하나가 없다.** 그래서
   * `repos/themes.ts`가 `containsNulByte`로 직접 막는다(그 파일의 주석 참고).
   * 이 케이스는 "DB는 안 막는다"는 관찰 자체를 고정한다 — 이것이 참이므로 레포의 가드가
   * 필요하다는 논리가 선다.
   */
  it('json 컬럼은 NUL이 든 값을 삽입 시점에 막지 않는다 (그래서 레포가 막는다)', async () => {
    await withApi(async (ctx) => {
      const nul = String.fromCharCode(0)
      const row = await insertTheme(
        ctx,
        minimalRow({ tokens: JSON.stringify({ semantic: { primary: `#00${nul}0` } }) }),
      )
      // 삽입 자체는 성공한다 — jsonb였다면 여기서 22P05로 죽는다.
      expect(row.id).toBeTruthy()

      // 그런데 그 값을 텍스트로 뽑으려 하면 그때 죽는다.
      await expect(
        withTransaction(ctx.db, (trx) =>
          sql`select tokens->'semantic'->>'primary' from themes where id = ${row.id}`.execute(trx),
        ),
      ).rejects.toThrow()
    })
  })

  it('down이 테이블을 지운다 — global-setup의 latest→none→latest 왕복이 이것을 돈다', async () => {
    await withApi(async (ctx) => {
      // 왕복 자체는 `test/global-setup.ts`가 매 실행 한 번 돈다. 여기서는 그 왕복 뒤에도
      // 테이블이 살아 있다는 것(=up이 다시 만들었다)만 확인한다.
      const rows = await sql<{ count: string }>`
        select count(*)::text as count from information_schema.tables where table_name = 'themes'
      `.execute(ctx.db)
      expect(rows.rows[0]!.count).toBe('1')
    })
  })
})
