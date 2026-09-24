/**
 * **시스템 테마가 내는 CSS에 미해석 리터럴이 몇 개인가 — 0을 지키는 가드.**
 *
 * 스타일 값이 참조 이름공간 밖의 점 찍힌 이름을 쓰면 참조로 인식되지 않고 리터럴로 그대로
 * CSS에 실린다 — `resolveTheme`이 오류를 내지 않고, 브라우저는 그 선언을 버린다.
 * `container`·`grid`·`section`은 `STYLE_PRIMITIVE_NAMESPACES`로 참조가 되므로
 * `admin`의 두 선언이 `max-width: var(--wb-container-maxWidth)`·`gap: var(--wb-grid-gap)`으로
 * 나가고 **전수 미해석은 0건이다.**
 *
 * ---
 *
 * **0인데 왜 케이스로 남기나.** 이 부류의 방어는 산문이 아니라 케이스다 — 산문 경고를 길게
 * 써 둔 파일도 같은 파일 아래에서 경고한 그 줄을 복사한다. 어휘가 열려 있는 것은 **지금의
 * 다섯**이 맞다는 것뿐이고, 다음 둘 중 하나가 일어나면 미해석 리터럴은 그대로 돌아온다:
 *
 * - 여섯째 테마가 **목록 밖 이름공간**을 쓴다(`layout.maxWidth`). 그것은
 *   `suspicious-literal` **경고**라 저장을 막지 않는다 — 즉 CSS에는 그대로 실린다.
 * - 누군가 `STYLE_PRIMITIVE_NAMESPACES`에서 이름 하나를 뺀다. 그러면 그 이름을 쓰던
 *   선언이 **다시 조용히 리터럴이 된다.**
 *
 * 그래서 케이스를 **0을 지키는 가드**로 둔다. 수가 늘면 둘 중 하나가 일어난 것이다.
 *
 * **Chromium 151로 확인한 것**(jsdom은 선언을 버리는지 못 본다):
 * 미해석 리터럴이 실린 규칙은 브라우저에서 그 선언이 **통째로 사라진다** —
 * `[data-wb-component="Grid"][data-wb-structure="default"]`의 `cssText`가 `{ }`였다.
 * **그 관측이 이 가드가 지키는 값의 뜻이다.**
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { STYLE_PRIMITIVE_NAMESPACES } from '../src/resolve/style'
import { TOKEN_NAMESPACES } from '../src/resolve/tokens'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'

beforeAll(() => {
  installCatalog()
})

/**
 * 선언 값에서 `var()` 밖에 남은 **점 찍힌 맨 식별자**. 미해석 참조가 정확히 이 꼴로 남는다.
 * `var(--wb-a-b)`에는 점이 없고, 소수(`1.5`)·단위(`0.5rem`)는 첫 글자가 알파벳이 아니라 안 걸린다.
 */
const BARE_DOTTED = /(?<![-\w.(])([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)(?![-\w.])/g

function unresolved(css: string): string[] {
  const hits: string[] = []
  for (const line of css.split('\n')) {
    const match = /^\s*([-a-zA-Z]+):\s*(.+);$/.exec(line)
    if (match === null) continue
    const [, property, value] = match as unknown as [string, string, string]
    // `url(…)` 안은 경로일 수 있으므로 통째로 가린다(`resolveReferences`의 `urlSpans`와 같은 이유).
    for (const found of value.replace(/url\([^)]*\)/gi, 'URL').matchAll(BARE_DOTTED)) {
      hits.push(`${property}: ${found[1]}`)
    }
  }
  return hits
}

describe('시스템 테마의 미해석 리터럴', () => {
  /**
   * **`container`·`grid`·`section`은 `TOKEN_NAMESPACES` 밖이고 스타일 전용 이름공간으로
   * 따로 산다.** 표가 갈려 있는 것이 요점이므로 그것을 단언한다.
   */
  it('두 이름공간이 갈려 있다 — primitives는 TokenTable에 없기 때문이다', () => {
    for (const namespace of STYLE_PRIMITIVE_NAMESPACES) {
      expect(TOKEN_NAMESPACES).not.toContain(namespace)
    }
    expect([...STYLE_PRIMITIVE_NAMESPACES]).toEqual(['container', 'grid', 'section'])
  })

  /**
   * **다섯을 손으로 적지 않는다** — 여섯째가 생기면 이 케이스가 저절로 함께 본다
   * (`repos-themes.test.ts`가 같은 이유로 `SYSTEM_THEME_IDS`에서 파생한다).
   */
  it('전수 — 0건이다', () => {
    const found: Record<string, string[]> = {}
    for (const id of SYSTEM_THEME_IDS) {
      const { theme, issues } = resolveTheme(systemTheme(id)!)
      // 경고는 난다(`portal`·`docs`의 손잡이 1건씩). 여기서 보는 것은 오류다.
      expect(issues.filter((entry) => entry.severity === 'error'), id).toEqual([])
      const hits = unresolved(compileTheme(theme!))
      if (hits.length > 0) found[id] = hits
    }

    expect(found).toEqual({})
  })

  /**
   * **0은 *"검사가 아무것도 못 찾는다"*로도 설명된다.** 그래서 어휘가 실제로 열려
   * 값이 `var()`로 나가는 것까지 함께 본다 — `admin`의 `Section.parts.inner.maxWidth`·
   * `Grid.base.gap`, 참조가 안 풀리면 무효 선언이 되는 바로 그 두 자리다.
   */
  it('admin의 두 자리가 var()로 나간다 — 0의 내용이 이것이다', () => {
    const { theme, issues } = resolveTheme(systemTheme('admin')!)
    expect(issues).toEqual([])
    const css = compileTheme(theme!)  // `admin`은 경고도 0건이다.

    expect(css).toContain('max-width: var(--wb-container-maxWidth);')
    expect(css).toContain('gap: var(--wb-grid-gap);')
    expect(css).toContain('--wb-container-maxWidth: 1440px;')
    expect(css).toContain('--wb-grid-gap: var(--wb-space-5);')
  })

  /**
   * **구분력.** 위 케이스가 초록인 것은 *"검사가 0건을 찾았다"*로도 *"검사가 아무것도 못
   * 찾는다"*로도 설명된다. 검사기에 실제로 그 꼴을 먹여 본다.
   */
  it('검사기가 미해석 꼴을 실제로 잡고, 해석된 것은 안 잡는다', () => {
    expect(unresolved('  max-width: container.maxWidth;')).toEqual([
      'max-width: container.maxWidth',
    ])
    expect(unresolved('  gap: var(--wb-space-6);')).toEqual([])
    expect(unresolved('  opacity: 0.5;')).toEqual([])
    expect(unresolved('  aspect-ratio: 16/9;')).toEqual([])
    expect(unresolved('  background: url(a.b.png);')).toEqual([])
    expect(unresolved('  font-family: var(--wb-typography-body-family);')).toEqual([])
  })
})
