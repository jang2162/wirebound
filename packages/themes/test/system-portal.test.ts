/**
 * **서체는 두 층이고, 오늘 그 둘이 어긋나도 죽는 케이스가 없다.**
 *
 * P4b-3 ①이 `assets.fonts` → `@font-face` 경로를 만들었고(`test/font-face.test.ts`가 그
 * 경로 자체를 잰다), P4b-1이 `fontFamily` 어휘를 열었다(`test/style.test.ts`). **둘을 잇는
 * 것은 이름 문자열 하나뿐이다** — `@font-face`가 선언한 `family`와 토큰이 담은 폰트 스택의
 * 첫 항목이 같은 글자여야 한다. 한쪽만 고치면 폰트는 조용히 폴백으로 그려진다.
 *
 * `portal`이 그 둘을 **처음으로 함께 쓰는 테마**라 여기에 못을 박는다. `admin`은 `assets`가
 * 없고(D7이 그것을 요구한다) `fontFamily`도 안 쓴다.
 *
 * **`<button>`을 따로 보는 이유:** `font-family`는 상속되므로 문서 뿌리(`Page`)에 한 번
 * 걸면 아래가 다 받는데, **폼 컨트롤은 예외다** — UA 스타일시트가 `<button>`에 자기 폰트를
 * 박는다. 그래서 `Button.base`에 한 번 더 걸려 있어야 하고, 그 한 줄이 사라지면 버튼만
 * 다른 서체로 그려진다.
 *
 * **재지 못한 것:** 이 파일이 보는 것은 **방출된 문자열**이다. `@font-face`가 실제 시트에
 * 걸리는지와 계산된 `font-family`가 그 이름을 갖는지는 jsdom이 못 본다 — ①이 Chromium
 * 151로 한 번 쟀고(그쪽이 쟀다) 그 값은 `emit/index.ts`의 `pushFontFaces` 머리말에 있다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { PORTAL_THEME } from '../src/system/portal'

beforeAll(() => {
  installCatalog()
})

function portalCss(): string {
  const { theme, issues } = resolveTheme(PORTAL_THEME)
  // **오류만 본다**(P4c-1 T4). `portal`은 `Tree.parts.node.paddingX`로 노드 손잡이를 덮어
  // **경고 1건**을 낸다 — 그것이 정상이고 수와 자리는 `warning-channel.test.ts`가 못박는다.
  const errors = issues.filter((issue) => issue.severity === 'error')
  expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  return compileTheme(theme!)
}

/** `assets.fonts`가 선언한 이름. 문서에서 읽어 온다 — 손으로 적으면 두 벌이 따로 썩는다. */
function declaredFamilies(): string[] {
  return (PORTAL_THEME.assets?.fonts ?? []).map((font) => font.family)
}

describe('portal — 서체의 두 층이 같은 이름을 가리킨다', () => {
  it('assets.fonts가 @font-face로 나간다 — 가중치마다 블록 하나', () => {
    const css = portalCss()
    const weights = (PORTAL_THEME.assets?.fonts ?? []).reduce(
      (sum, font) => sum + Math.max(1, font.weights?.length ?? 0),
      0,
    )
    expect([...css.matchAll(/@font-face \{/g)]).toHaveLength(weights)
    for (const family of new Set(declaredFamilies())) {
      expect(css).toContain(`  font-family: ${family};`)
    }
  })

  /**
   * **이 케이스가 두 층을 잇는다.** `@font-face`의 이름과 토큰이 담은 스택의 첫 항목이
   * 같은 글자여야 한다 — 한쪽만 바꾸면 `@font-face`는 나가는데 아무도 그것을 안 가리킨다.
   */
  it('토큰의 폰트 스택 첫 항목이 @font-face가 선언한 이름이다', () => {
    const stack = PORTAL_THEME.tokens?.scale?.typography?.family?.sans
    expect(typeof stack).toBe('string')
    const first = String(stack).split(',')[0]!.trim()
    expect(declaredFamilies()).toContain(first)

    // 그 스택이 실제로 `:root` 변수로 나간다.
    expect(portalCss()).toContain(`  --wb-typography-family-sans: ${String(stack)};`)
  })

  /**
   * **거는 자리가 둘이어야 한다.** `Page`는 상속의 뿌리이고, `<button>`은 그 상속을 받지
   * 않는 유일한 요소다(UA 스타일시트). 어느 한쪽이 빠지면 화면의 일부만 서체가 바뀐다.
   */
  it('Page와 Button이 그 토큰을 font-family로 건다', () => {
    const css = portalCss()
    const declaration = '  font-family: var(--wb-typography-family-sans);'

    const rule = (selector: string): string => {
      const start = css.indexOf(`${selector} {`)
      expect(start, selector).toBeGreaterThanOrEqual(0)
      return css.slice(start, css.indexOf('\n}', start))
    }

    expect(rule('[data-wb-component="Page"][data-wb-structure="default"]')).toContain(declaration)
    expect(rule('[data-wb-component="Button"][data-wb-structure="solid"]')).toContain(declaration)
  })
})
