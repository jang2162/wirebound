/**
 * **시스템 테마가 내는 CSS에 미해석 리터럴이 몇 개인가** (P4b-3 ③).
 *
 * `TOKEN_NAMESPACES`는 일곱이고 **`container`·`grid`·`section`이 없다.** 그래서
 * `maxWidth: 'container.maxWidth'`처럼 적으면 참조로 인식되지 않고 **리터럴로 그대로
 * 통과한다** — `resolveTheme`이 이슈를 0건 내고, 브라우저는 그 선언을 버린다.
 *
 * **§6.4와 §6.5/§6.8 사이의 구멍이다.** §6.4가 primitives를 *"사이트 골격 상수"*로 정의하고
 * §6.11이 그것을 `:root` 변수(`--wb-container-maxWidth` 등)로 내보내지만, **컴포넌트
 * 스타일이 그 변수를 가리킬 문법이 규격 어디에도 없다** — §6.8의 값 예시가 전부
 * `semantic.*`·`space.*`·`radius.*`이고 primitives를 가리키는 예시는 0개다.
 * 게다가 그 `:root` 변수를 **읽는 코드가 저장소 전체에 0건**이라, 오늘 primitives는
 * 선언되고 방출될 뿐 화면에 닿지 않는다.
 *
 * **여기서 고치지 않았다** — 어휘를 넓히는 것은 §6.8을 넓히는 판단이고 D7이 이 슬라이스에서
 * `admin`의 CSS 불변을 요구한다. 이월(`2026-08-11-p4b3-carryforward.md` §A)이 후보와 비용을
 * 적었다. **이 파일은 그 결함을 수로 못박아 둔다** — 산문으로만 적으면 여섯째 테마가
 * 같은 줄을 또 복사한다. 실제로 그렇게 됐다: `docs`가 그 함정을 규탄하는 주석을 쓰면서
 * `admin`의 `gap: 'grid.gap'`을 그대로 옮겼다.
 *
 * **이 케이스가 깨지는 두 가지 방향이 둘 다 뜻이 있다.**
 * - 수가 **늘면** 새 테마가 같은 함정에 빠진 것이다.
 * - 수가 **줄면** 누가 고친 것이다 — 그때 이 파일과 이월을 함께 지운다.
 *
 * **Chromium 151로 확인했다**(③이 쟀다. jsdom은 선언을 버리는지 못 본다):
 * `[data-wb-component="Grid"][data-wb-structure="default"]`의 `cssText`가
 * **`{ }` — 선언이 하나도 없는 빈 규칙**이고, `Section [inner]`에는 `max-width`가 아예 없다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
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
  it('참조 이름공간에 container·grid·section이 없다 — 이것이 원인이다', () => {
    expect(TOKEN_NAMESPACES).not.toContain('container')
    expect(TOKEN_NAMESPACES).not.toContain('grid')
    expect(TOKEN_NAMESPACES).not.toContain('section')
  })

  /**
   * **다섯을 손으로 적지 않는다** — 여섯째가 생기면 이 케이스가 저절로 함께 본다
   * (`repos-themes.test.ts`가 같은 이유로 `SYSTEM_THEME_IDS`에서 파생한다).
   */
  it('전수 — 오늘 3건이고 어디인지까지 못박는다', () => {
    const found: Record<string, string[]> = {}
    for (const id of SYSTEM_THEME_IDS) {
      const { theme, issues } = resolveTheme(systemTheme(id)!)
      // **이슈가 0건이라는 것이 결함의 핵심이다.** 무효한 선언이 나가는데 아무도 안 막는다.
      expect(issues).toEqual([])
      const hits = unresolved(compileTheme(theme!))
      if (hits.length > 0) found[id] = hits
    }

    expect(found).toEqual({
      // `Section.parts.inner.maxWidth` · `Grid.base.gap` (admin.ts:111·119)
      admin: ['max-width: container.maxWidth', 'gap: grid.gap'],
      // `Grid.base.gap` (docs.ts:238) — `admin`에서 옮겨 온 줄이다.
      docs: ['gap: grid.gap'],
    })
  })

  /**
   * **구분력.** 위 케이스가 초록인 것은 *"검사가 3건을 찾았다"*로도 *"검사가 아무것도 못
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
