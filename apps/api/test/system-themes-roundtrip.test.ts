/**
 * **시스템 테마 다섯이 저장·조회를 왕복해도 같은 CSS를 내는가** (P4b-3 계획서 *"재지 않은 것 2"*).
 *
 * P4a-3이 `json` 컬럼으로 문서 키 순서를 지켰고 `theme-order.test.ts`가 그것을 **손으로 만든
 * 테마 하나**로 못박았다. 그 판정이 실제 시스템 테마로 확인된 것은 **`admin` 하나뿐이었고**,
 * `admin`은 다섯 중 `variants`·`states`·`responsive`·`assets`를 가장 적게 쓰는 테마다 —
 * 즉 **순서가 실제로 승자를 정하는 절들이 admin에서는 거의 안 나온다.**
 *
 * ③이 다섯으로 넓힌 이유 셋:
 *
 * 1. **`assets`가 이 슬라이스에서 처음으로 CSS가 됐다**(D5의 `@font-face`). 그 전까지
 *    `assets`는 저장돼도 아무 데도 안 쓰였으므로 왕복이 깨져도 화면이 같았다. 이제는
 *    다르다 — 넷 중 셋이 `assets.fonts`를 싣고 그것이 시트 맨 앞의 블록이 된다.
 * 2. **`responsive`가 폭으로 재정렬된다**(`pushResponsive`). 그 절이 왕복에서 살아 있는지는
 *    브레이크포인트를 여럿 선언한 테마라야 보이고, `admin`은 그 자리가 얇다.
 * 3. **깨지면 조용하다.** 컬럼 하나를 빠뜨리거나 `json`이 `jsonb`로 바뀌면 이슈도 예외도
 *    없이 **CSS의 한 규칙이 다른 규칙 앞뒤로 옮겨 갈 뿐**이다.
 *
 * **`compileTheme`의 결과를 글자로 비교한다** — `toEqual`로 객체를 비교하면 키 순서를
 * 안 본다(`{a:1,b:2}`와 `{b:2,a:1}`이 같다). 순서가 이 케이스의 전부이므로 문자열이라야 한다.
 */
import { SYSTEM_THEME_IDS, compileTheme, resolveTheme, systemTheme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { findThemeById, insertTheme } from '../src/repos/themes'
import { ensureCatalog } from '../src/schema-setup'
import { createProject, signup, withApi, type TestContext } from './helpers'

function css(theme: Parameters<typeof resolveTheme>[0]): string {
  ensureCatalog()
  const { theme: resolved, issues } = resolveTheme(theme)
  // 오류만 본다 — `portal`·`docs`는 손잡이 경고를 1건씩 낸다(P4c-1 T4). 경고는 CSS를
  // 바꾸지 않으므로 아래 글자 대조는 그대로 유효하다.
  const errors = issues.filter((entry) => entry.severity === 'error')
  expect(errors.map((entry) => `${entry.path}: ${entry.message}`)).toEqual([])
  return compileTheme(resolved!)
}

async function ownedProject(ctx: TestContext) {
  const owner = await signup(ctx)
  return createProject(ctx, owner.cookie)
}

describe('시스템 테마 다섯 — 저장·조회 왕복', () => {
  /** 다섯을 손으로 적지 않는다 — 여섯째가 생기면 이 파일이 저절로 함께 본다. */
  it('다섯이 실제로 돌고 있다', () => {
    expect(SYSTEM_THEME_IDS.length).toBe(5)
  })

  for (const id of SYSTEM_THEME_IDS) {
    it(`${id}: 저장 → 조회 → 컴파일이 저장 전과 글자까지 같다`, async () => {
      await withApi(async (ctx) => {
        const project = await ownedProject(ctx)
        const original = systemTheme(id)!
        const before = css(original)

        const inserted = await insertTheme(ctx.db, project.id, original)
        const read = await findThemeById(ctx.db, inserted.id)
        expect(read).not.toBeNull()

        expect(css(read!.theme)).toBe(before)
      })
    })
  }

  /**
   * **구분력.** 위 다섯이 전부 초록인 것은 *"왕복이 순서를 지킨다"*로도, *"이 테마들에는
   * 순서가 걸린 자리가 아예 없다"*로도 설명된다. 그러므로 **다섯 각각에 순서가 실제로
   * 걸린 자리가 있는지**를 따로 센다 — 없으면 위 케이스들은 아무것도 안 지키고 있다.
   */
  it('다섯 다 순서가 승자를 정하는 자리를 실제로 갖는다', () => {
    const rows = SYSTEM_THEME_IDS.map((id) => {
      const theme = systemTheme(id)!
      const components = Object.values(theme.components ?? {})
      const count = (pick: (c: (typeof components)[number]) => object | undefined) =>
        components.reduce((n, c) => n + Object.keys(pick(c) ?? {}).length, 0)
      return {
        id,
        variants: count((c) => c.variants),
        states: count((c) => c.states),
        responsive: count((c) => c.responsive),
        fonts: theme.assets?.fonts?.length ?? 0,
      }
    })
    // 눈으로 볼 값이다 — 어느 테마가 어느 절에서 얇은지가 이 케이스의 산출물이다.
    console.table(rows)

    for (const row of rows) {
      // 한 테마 안에서 층이 둘 이상이라야 "뒤엣것이 이긴다"가 뜻을 갖는다.
      expect(row.variants + row.states + row.responsive).toBeGreaterThan(0)
    }
    // `assets.fonts`가 CSS가 되는 것은 이 슬라이스에서 생겼다. 넷 중 하나도 안 실으면
    // 위 다섯 케이스는 `@font-face` 왕복을 하나도 안 지킨다.
    expect(rows.filter((row) => row.fonts > 0).length).toBeGreaterThan(0)
  })

  /**
   * **`@font-face`가 왕복을 지나는지 따로 본다.** 위 글자 대조에 이미 들어 있지만,
   * 그 케이스가 죽을 때 *"폰트가 사라졌다"*를 이름으로 말하는 자리가 있어야 한다 —
   * `assets` 컬럼은 P4a-3이 만들었고 그때는 아무도 안 읽는 절이었다.
   */
  it('assets.fonts를 실은 테마는 왕복 뒤에도 @font-face를 낸다', async () => {
    await withApi(async (ctx) => {
      const project = await ownedProject(ctx)
      const withFonts = SYSTEM_THEME_IDS.filter(
        (id) => (systemTheme(id)!.assets?.fonts?.length ?? 0) > 0,
      )
      expect(withFonts.length).toBeGreaterThan(0)

      for (const id of withFonts) {
        const original = systemTheme(id)!
        const inserted = await insertTheme(ctx.db, project.id, original)
        const read = await findThemeById(ctx.db, inserted.id)
        const out = css(read!.theme)

        const faces = out.match(/@font-face/g) ?? []
        expect(faces.length).toBe((css(original).match(/@font-face/g) ?? []).length)
        expect(faces.length).toBeGreaterThan(0)
        // 시트 맨 앞이어야 한다 — `pushFontFaces`가 그 자리를 계약으로 잡았다.
        expect(out.startsWith('@font-face {')).toBe(true)
      }
    })
  })
})
