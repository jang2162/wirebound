/**
 * **재라 #1 — 저장이 문서 키 순서를 지우는가. 이 슬라이스에서 가장 큰 자리다.**
 *
 * `compileTheme`의 계약은 **문서 키 순서가 곧 우선순위**다. 같은 CSS 프로퍼티를 건드리는
 * 선언이 둘이면 **나중에 방출된 쪽이 이긴다**(§6.11의 캐스케이드). 그 "나중"을 정하는 것이
 * 문서에 적힌 키 순서이므로, **저장이 순서를 바꾸면 이기는 쪽이 바뀐다.**
 *
 * 이 파일이 하는 일 셋:
 *
 * 1. **재는 것** — `jsonb`와 `json`이 순서에 무엇을 하는지 실제 DB에 물어본다. 산문으로
 *    적으면 아무도 다시 재지 않는다(이 저장소가 반복해 겪은 부류다).
 * 2. **판정** — 저장 → 조회 → 컴파일이 **저장 전 컴파일과 같은 CSS**를 내는가.
 * 3. **구분력** — 문서에서 순서만 바꾸면 CSS가 실제로 갈리는가. 이것이 없으면 위 판정이
 *    "무엇을 해도 같다"로도 설명된다.
 *
 * **여기서 다루는 것은 컬럼 타입의 성질이지 레포의 조립이 아니다** — 그래서 raw Kysely로
 * 넣고 뺀다. `Theme` 객체의 왕복(절이 컬럼으로 흩어졌다 조립되는 것)은 Task 4의
 * `repos-themes.test.ts`가 잰다.
 */
import { sql } from 'kysely'
import { compileTheme, resolveTheme, type Theme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { ensureCatalog } from '../src/schema-setup'
import { withTransaction } from '../src/db/tx'
import { withApi, type TestContext } from './helpers'

/**
 * 순서가 실제로 승자를 정하는 테마.
 *
 * - `states`: `selected`와 `disabled`가 **같은 프로퍼티**(`opacity`)를 건드린다. 문서에
 *   적힌 순서대로 방출되므로 뒤에 온 `disabled`가 이긴다.
 * - `base`: `bgGradient`와 `bgImage`가 **같은 CSS 프로퍼티**(`background-image`)로 간다
 *   (P4a-2가 그렇게 정했다 — 이슈로 내지 않고 문서 키 순서가 이긴다).
 *
 * 두 이름 쌍 모두 **jsonb가 뒤집는 쌍**이다: `selected`/`disabled`는 길이가 같아 바이트
 * 순으로 `disabled`가 앞서고, `bgImage`(7)는 `bgGradient`(10)보다 짧아 앞선다.
 */
function orderedTheme(): Theme {
  return {
    meta: { id: 'ordered', name: '순서', version: '1.0.0' },
    components: {
      List: {
        base: { bgGradient: 'linear-gradient(#fff, #000)', bgImage: 'url(a.png)' },
        states: {
          selected: { opacity: 0.9 },
          disabled: { opacity: 0.5 },
        },
      },
    },
  }
}

/**
 * 같은 테마인데 두 자리의 **순서만** 뒤집은 것. 구분력 실증에 쓴다.
 *
 * `meta.id`만 다르다 — 한 테스트에서 둘을 함께 저장하는데 `(project_id, slug)`가
 * 유일하기 때문이다(0006의 NULLS NOT DISTINCT). `compileTheme`은 `meta`를 방출하지
 * 않으므로 이 차이가 CSS 비교를 오염시키지 않는다.
 */
function reversedTheme(): Theme {
  return {
    meta: { id: 'reversed', name: '순서', version: '1.0.0' },
    components: {
      List: {
        base: { bgImage: 'url(a.png)', bgGradient: 'linear-gradient(#fff, #000)' },
        states: {
          disabled: { opacity: 0.5 },
          selected: { opacity: 0.9 },
        },
      },
    },
  }
}

/** 테마 하나를 CSS로. 이슈가 있으면 그 자리에서 죽는다 — 조용히 빈 문자열을 내면 비교가 공허해진다. */
function css(theme: Theme): string {
  ensureCatalog()
  const { theme: resolved, issues } = resolveTheme(theme)
  expect(issues).toEqual([])
  return compileTheme(resolved!)
}

/** `themes` 행 하나를 넣고 그 절들을 그대로 되읽는다. 조립은 여기서 최소한만 한다. */
async function roundTrip(ctx: TestContext, theme: Theme): Promise<Theme> {
  const inserted = await withTransaction(ctx.db, (trx) =>
    trx
      .insertInto('themes')
      .values({
        slug: theme.meta.id,
        name: theme.meta.name,
        version: theme.meta.version,
        components: JSON.stringify(theme.components),
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  )

  const row = await ctx.db
    .selectFrom('themes')
    .select(['slug', 'name', 'version', 'components'])
    .where('id', '=', inserted.id)
    .executeTakeFirstOrThrow()

  return {
    meta: { id: row.slug, name: row.name, version: row.version },
    ...(row.components === null ? {} : { components: row.components }),
  }
}

describe('재라 #1 — 저장과 키 순서', () => {
  describe('무엇이 실제로 노출되는지 잰다', () => {
    /**
     * **jsonb는 키를 (길이, 바이트)로 정규화한다.** 순서를 어떻게 적어 넣든 같은 결과가
     * 나오므로 원래 순서를 **복원할 수 없다** — 이것이 갈래 셋 중 `jsonb`를 못 쓰는 이유다.
     */
    it('jsonb는 순서를 지운다 — 반대로 적어도 같은 결과다', async () => {
      await withApi(async (ctx) => {
        const forward = await sql<{ v: Record<string, number> }>`
          select '{"selected":1,"disabled":2,"loading":3,"empty":4}'::jsonb as v
        `.execute(ctx.db)
        const backward = await sql<{ v: Record<string, number> }>`
          select '{"empty":4,"loading":3,"disabled":2,"selected":1}'::jsonb as v
        `.execute(ctx.db)

        // (길이, 바이트) 정렬. 넣은 순서와 무관하다.
        expect(Object.keys(forward.rows[0]!.v)).toEqual(['empty', 'loading', 'disabled', 'selected'])
        expect(Object.keys(backward.rows[0]!.v)).toEqual(Object.keys(forward.rows[0]!.v))
      })
    })

    it('jsonb는 중첩 안쪽과 스타일 맵의 프로퍼티 순서도 지운다', async () => {
      await withApi(async (ctx) => {
        const res = await sql<{ v: { base: Record<string, string> } }>`
          select '{"base":{"bgGradient":"g","bgImage":"i"}}'::jsonb as v
        `.execute(ctx.db)
        // bgImage(7자)가 bgGradient(10자)보다 짧아 앞으로 온다 — 작성자가 무엇을 적었든
        // bgGradient가 뒤에 남아 늘 이긴다(P4a-2가 이월에 적은 그 결과다).
        expect(Object.keys(res.rows[0]!.v.base)).toEqual(['bgImage', 'bgGradient'])
      })
    })

    it('json은 원문을 그대로 보관한다', async () => {
      await withApi(async (ctx) => {
        const res = await sql<{ v: { base: Record<string, string>; states: Record<string, number> } }>`
          select '{"states":{"selected":1,"disabled":2},"base":{"bgGradient":"g","bgImage":"i"}}'::json as v
        `.execute(ctx.db)
        expect(Object.keys(res.rows[0]!.v.states)).toEqual(['selected', 'disabled'])
        expect(Object.keys(res.rows[0]!.v.base)).toEqual(['bgGradient', 'bgImage'])
      })
    })
  })

  describe('판정 — 저장을 거쳐도 같은 CSS가 나온다', () => {
    it('저장 → 조회 → 컴파일이 저장 전 컴파일과 글자까지 같다', async () => {
      await withApi(async (ctx) => {
        const before = css(orderedTheme())
        const after = css(await roundTrip(ctx, orderedTheme()))
        expect(after).toBe(before)
      })
    })

    it('왕복 뒤에도 상태 순서가 문서대로다 — 뒤에 온 disabled가 이긴다', async () => {
      await withApi(async (ctx) => {
        const out = css(await roundTrip(ctx, orderedTheme()))
        const selectedAt = out.indexOf('[data-wb-state~="selected"]')
        const disabledAt = out.indexOf('[data-wb-state~="disabled"]')
        expect(selectedAt).toBeGreaterThanOrEqual(0)
        expect(disabledAt).toBeGreaterThan(selectedAt)
      })
    })

    it('왕복 뒤에도 한 규칙 안의 프로퍼티 순서가 문서대로다', async () => {
      await withApi(async (ctx) => {
        const out = css(await roundTrip(ctx, orderedTheme()))
        // 같은 프로퍼티(background-image) 선언이 둘 나가고, 뒤엣것(bgImage)이 이긴다.
        const gradientAt = out.indexOf('linear-gradient')
        const imageAt = out.indexOf('url(a.png)')
        expect(gradientAt).toBeGreaterThanOrEqual(0)
        expect(imageAt).toBeGreaterThan(gradientAt)
      })
    })
  })

  describe('구분력 — 순서를 바꾸면 CSS가 갈린다', () => {
    /**
     * **이 케이스가 없으면 위 판정이 "무엇을 해도 같다"로도 설명된다.** 두 문서는 키와 값이
     * 전부 같고 **순서만** 다른데, 컴파일 결과가 달라야 한다.
     */
    it('순서만 뒤집은 테마는 다른 CSS를 낸다', () => {
      expect(css(reversedTheme())).not.toBe(css(orderedTheme()))
    })

    it('그 차이는 왕복을 거쳐도 남는다 — 저장이 둘을 같은 것으로 만들지 않는다', async () => {
      await withApi(async (ctx) => {
        const a = css(await roundTrip(ctx, orderedTheme()))
        const b = css(await roundTrip(ctx, reversedTheme()))
        expect(a).not.toBe(b)
        expect(a).toBe(css(orderedTheme()))
        expect(b).toBe(css(reversedTheme()))
      })
    })
  })
})
