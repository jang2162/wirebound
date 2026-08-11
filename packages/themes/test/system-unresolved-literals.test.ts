/**
 * **시스템 테마가 내는 CSS에 미해석 리터럴이 몇 개인가** (P4b-3 ③ → P4c-1이 고쳐 씀).
 *
 * ---
 *
 * **2026-08-11(P4c-1): 이 파일의 머리말이 통째로 낡았다. 지우지 않고 무엇이 언제 왜
 * 바뀌었는지 남긴다** (P4b-2의 `structures-data.test.tsx`가 쓴 형식이다).
 *
 * **P4b-3이 적었던 것:** *"`TOKEN_NAMESPACES`는 일곱이고 `container`·`grid`·`section`이
 * 없다. 그래서 `maxWidth: 'container.maxWidth'`처럼 적으면 참조로 인식되지 않고 리터럴로
 * 그대로 통과한다 — `resolveTheme`이 이슈를 0건 내고, 브라우저는 그 선언을 버린다.
 * 오늘 2건이고 둘 다 `admin`이다."*
 *
 * **오늘 그것이 거짓이 됐다.** P4c-1 T1이 `STYLE_PRIMITIVE_NAMESPACES`
 * (`container`·`grid`·`section`)를 열었다. `admin`의 두 선언은 이제
 * `max-width: var(--wb-container-maxWidth)`·`gap: var(--wb-grid-gap)`으로 나가고
 * **전수 미해석은 0건이다.**
 *
 * **그날 무엇이 죽었나 — 그것이 구멍이 닫힌 증거다.** 어휘를 열자 이 파일의
 * 케이스 넷 중 **둘**이 죽었다(`전수 — 오늘 2건` · `가드가 무뎌지지 않았다`), 그리고
 * 저장소 전체에서 죽은 케이스는 **정확히 넷**이었다 — 나머지 둘은
 * `apps/web/test/theme/docs-theme.test.tsx`와 `saas-marketing.test.tsx`가 같은 구멍을
 * 단언하던 자리다. **넷 다 *"이 구멍이 있다"*를 못박던 케이스이고 다른 것은 하나도
 * 죽지 않았다**(P4c-1이 쟀다).
 *
 * ---
 *
 * **왜 파일을 지우지 않았나 — 재라 #5의 답.**
 *
 * 앞 머리말이 *"0이 되는 날은 규격의 구멍이 닫힌 날이다. 그때 이 절과 그 파일을 함께
 * 지운다"*고 적어 두었다. **그 지시를 따르지 않는다.** 근거는 P4b-3 자신이 남긴 교훈이다 —
 * *"이 부류의 방어는 산문이 아니라 케이스다"*(산문 경고를 20줄 써 둔 `docs.ts`가 같은
 * 파일 200줄 아래에서 같은 줄을 복사했다). 어휘를 연 것은 **오늘의 다섯**을 고쳤을 뿐이고,
 * 다음 둘 중 하나가 일어나면 미해석 리터럴은 그대로 돌아온다:
 *
 * - 여섯째 테마가 **목록 밖 이름공간**을 쓴다(`layout.maxWidth`). 그것은
 *   `suspicious-literal` **경고**라 저장을 막지 않는다 — 즉 CSS에는 그대로 실린다.
 * - 누군가 `STYLE_PRIMITIVE_NAMESPACES`에서 이름 하나를 뺀다. 그러면 그 이름을 쓰던
 *   선언이 **다시 조용히 리터럴이 된다.**
 *
 * 그래서 케이스를 **0을 지키는 가드**로 바꿔 남긴다. 수가 늘면 둘 중 하나가 일어난 것이다.
 *
 * **Chromium 151로 확인했던 것**(P4b-3의 ③이 쟀다. jsdom은 선언을 버리는지 못 본다):
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
   * **앞 케이스의 이름이 *"참조 이름공간에 container·grid·section이 없다 — 이것이
   * 원인이다"*였다.** 단언 자체는 오늘도 참이지만(그 셋은 여전히 `TOKEN_NAMESPACES` 밖이다)
   * **문장이 거짓이 됐다** — 그 셋은 이제 **스타일 전용 이름공간**으로 따로 산다.
   * 표가 갈려 있는 것이 요점이므로 그것을 단언한다.
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
      // 경고는 난다(`portal`·`docs`의 손잡이 1건씩 — T4). 여기서 보는 것은 오류다.
      expect(issues.filter((entry) => entry.severity === 'error'), id).toEqual([])
      const hits = unresolved(compileTheme(theme!))
      if (hits.length > 0) found[id] = hits
    }

    expect(found).toEqual({})
  })

  /**
   * **0은 *"검사가 아무것도 못 찾는다"*로도 설명된다.** 그래서 어휘가 실제로 열려
   * 값이 `var()`로 나가는 것까지 함께 본다 — `admin`이 P4b-3까지 무효 선언 2건을
   * 갖고 있던 바로 그 두 자리다(`admin.ts:111`·`119`).
   */
  it('admin의 두 자리가 이제 var()로 나간다 — 0의 내용이 이것이다', () => {
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
