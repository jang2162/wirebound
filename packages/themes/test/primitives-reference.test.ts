/**
 * **스타일 값이 `primitives`를 가리킨다.**
 *
 * `--wb-container-*`·`--wb-grid-*`·`--wb-section-*`는 `:root`에 정상적으로 나가는데,
 * 스타일이 그것을 가리킬 **문법이 없으면 `primitives` 층 전체가 죽는다** — 그 이름을 읽는
 * 코드가 없게 된다(설계서 「primitives — 사이트 골격」과 「components — 구조 + 스킨」·
 * 「스타일 프로퍼티 화이트리스트」 사이의 구멍).
 *
 * 이 파일이 그 문법을 못박는다. **토큰 이름공간과 갈라 둔 것**이 요점이다 —
 * primitives는 `TokenTable`에 없으므로 `isTokenReference`가 참을 내면 토큰 해석기가
 * 없는 표를 뒤진다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { STYLE_PRIMITIVE_NAMESPACES, styleDeclarations } from '../src/resolve/style'
import { TOKEN_NAMESPACES, type TokenTable } from '../src/resolve/tokens'
import { checkPrimitives } from '../src/spec/primitives'
import { systemTheme } from '../src/system/index'

beforeAll(() => {
  installCatalog()
})

const TOKENS: TokenTable = new Map([
  ['space.6', '24px'],
  ['semantic.surface', '#ffffff'],
])

/** `admin`이 실제로 선언한 여섯 경로. `checkPrimitives`가 내는 키와 같은 꼴이다. */
const DECLARED = new Set([
  'container.maxWidth',
  'container.gutter',
  'grid.columns',
  'grid.gap',
  'section.paddingY',
  'section.paddingYCompact',
])

const decl = (prop: string, value: unknown) =>
  styleDeclarations(prop, value, TOKENS, prop, DECLARED)

describe('primitives 참조 문법', () => {
  it('Section.parts.inner.maxWidth: container.maxWidth가 var()로 나간다', () => {
    expect(decl('maxWidth', 'container.maxWidth')).toEqual({
      css: [['max-width', 'var(--wb-container-maxWidth)']],
      issues: [],
    })
  })

  it('Grid.base.gap: grid.gap이 var()로 나간다', () => {
    expect(decl('gap', 'grid.gap')).toEqual({
      css: [['gap', 'var(--wb-grid-gap)']],
      issues: [],
    })
  })

  it('section.*도 같은 문법이다 — 셋 다 열렸다', () => {
    expect(decl('paddingY', 'section.paddingY').css).toEqual([
      ['padding-top', 'var(--wb-section-paddingY)'],
      ['padding-bottom', 'var(--wb-section-paddingY)'],
    ])
  })

  /**
   * **회귀.** 토큰 참조가 그대로 동작해야 한다 — 두 이름공간이 섞이면 토큰 해석기가
   * primitives를 뒤지거나 그 반대가 된다.
   */
  it('토큰 참조는 그대로다', () => {
    expect(decl('gap', 'space.6').css).toEqual([['gap', 'var(--wb-space-6)']])
    expect(decl('bg', 'semantic.surface').css).toEqual([['background', 'var(--wb-semantic-surface)']])
  })

  /**
   * **선언되지 않은 primitives 경로는 이슈다 — 코드는 `unknown-primitive`다.**
   *
   * `unknown-token`을 재활용하지 않은 이유 둘. (1) 그 코드의 문장이 *"없는 토큰을
   * 가리킵니다"*인데 primitives는 토큰이 아니다 — 재활용하면 **문장이 거짓이 된다.**
   * (2) 고치는 방법이 다르다: `unknown-token`은 `tokens.*`를 고치고 이것은
   * `primitives.*`를 고친다. 저작 UI가 값 편집기에서 어느 쪽을 열어야 하는지가
   * 이 코드로 갈린다.
   *
   * **`error`다.** 이름공간이 목록 안이므로 *"참조인지 리터럴인지"*가 모호하지 않다 —
   * `space.999`가 `unknown-token`으로 `error`인 것과 같은 부류다. 모호한 쪽(이름공간이
   * 목록 밖)은 `suspicious-literal` 경고가 따로 다룬다.
   */
  it('선언되지 않은 primitives 경로는 unknown-primitive다', () => {
    const { css, issues } = decl('maxWidth', 'container.nope')
    expect(css).toEqual([])
    expect(issues.map((entry) => [entry.code, entry.severity])).toEqual([
      ['unknown-primitive', 'error'],
    ])
  })

  /**
   * **`breakpoints`는 목록에 없다.** 근거는 취향이 아니라 방출이다 —
   * `compileTheme`의 `:root`는 `tokens` + `primitives.values` 둘만 돌고
   * (`emit/index.ts`), `checkPrimitives`는 브레이크포인트를 `values`가 아니라 **수로
   * 따로** 낸다. 즉 `--wb-breakpoints-md`라는 변수는 **존재하지 않는다** — 열어 주면
   * `var()`가 빈 값으로 풀려 선언이 조용히 죽는다. 「primitives — 사이트 골격」이 그 값을 `@media` 조건으로
   * 쓰는 것도 같은 이야기다(조건은 스타일 값이 아니다).
   */
  it('breakpoints는 스타일이 가리킬 수 없다 — :root에 그 변수가 없기 때문이다', () => {
    expect(STYLE_PRIMITIVE_NAMESPACES).not.toContain('breakpoints')

    const { values, breakpoints } = checkPrimitives({ breakpoints: { md: 768 } }, TOKENS)
    // 변수로 나가는 것은 `values`뿐이고 브레이크포인트는 거기 없다.
    expect([...values.keys()]).toEqual([])
    expect([...breakpoints]).toEqual([['md', 768]])
  })

  it('두 이름공간은 겹치지 않는다', () => {
    for (const namespace of STYLE_PRIMITIVE_NAMESPACES) {
      expect(TOKEN_NAMESPACES).not.toContain(namespace)
    }
  })

  /**
   * **primitives 값은 primitives를 가리킬 수 없다.**
   *
   * `checkPrimitives`가 표를 넘기지 않으므로 그 자리에서는 이 이름공간이 참조가 아니다.
   * 그런데 **리터럴로 조용히 통과시키면 스타일 층에서 닫은 그 구멍을 한 층 아래에 다시 판다** —
   * 그래서 침묵이 아니라 이슈로 낸다. 값이 `var()` 사슬을 이루면 순환을 잡을 자리가
   * 없어(6개 경로뿐이라도 `a → b → a`가 가능하다) CSS의 *"계산 시점에 무효"*로 조용히
   * 죽는데, 그 갈래를 만들지 않는 쪽을 골랐다.
   */
  it('primitives 값이 primitives를 가리키면 이슈다', () => {
    const { values, issues } = checkPrimitives({ container: { gutter: 'grid.gap' } }, TOKENS)
    expect([...values.keys()]).toEqual([])
    expect(issues.map((entry) => entry.code)).toEqual(['bad-style-value'])
  })

  /**
   * **primitives 값의 경고가 버려지면 침묵이 된다.**
   *
   * `checkPrimitives`가 `resolveStyleValue`의 이슈를 **`value === null`일 때만** 실으면
   * `suspicious-literal`은 값을 안 버리므로(그것이 `warning`인 이유다) 그 갈래를 지나지
   * 않고, `maxWidth: 'spce.4'`가 **이슈 0건으로** `:root`에 실린다.
   *
   * 스타일이 그 변수를 읽으므로 해롭다 — 그것을 가리키는
   * `max-width: var(--wb-container-maxWidth)`가 계산 시점에 무효가 되어
   * **선언 하나가 아니라 그것을 가리키는 전부가 함께 죽는다.**
   *
   * severity를 `error`로 올리지 않은 근거는 `spec/primitives.ts`의 머리말에 있다.
   */
  it('primitives 값의 경고가 버려지지 않는다', () => {
    const { values, issues } = checkPrimitives({ container: { maxWidth: 'spce.4' } }, TOKENS)

    expect(issues.map((entry) => [entry.code, entry.severity, entry.path])).toEqual([
      ['suspicious-literal', 'warning', 'primitives.container.maxWidth'],
    ])
    // **값은 그대로 실린다** — 경고라서 그렇다. 달라지는 것은 침묵하지 않는다는 것뿐이다.
    expect([...values]).toEqual([['container.maxWidth', 'spce.4']])
  })

  it('그 경고가 resolveTheme까지 올라온다', () => {
    const { theme, issues } = resolveTheme({
      meta: { id: 'p', name: '프로브', version: '1.0.0' },
      tokens: { scale: { space: { unit: '4px' } } },
      primitives: { container: { maxWidth: 'spce.4' } },
      components: { Section: { parts: { inner: { maxWidth: 'container.maxWidth' } } } },
    })

    // 경고라 테마는 선다. 그러나 **조용하지 않다.**
    expect(theme).not.toBeNull()
    expect(issues.map((entry) => [entry.severity, entry.code, entry.path])).toEqual([
      ['warning', 'suspicious-literal', 'primitives.container.maxWidth'],
    ])
    // 그리고 이것이 왜 아픈지 — 무효한 변수를 가리키는 선언이 실제로 나간다.
    expect(compileTheme(theme!)).toContain('--wb-container-maxWidth: spce.4;')
    expect(compileTheme(theme!)).toContain('max-width: var(--wb-container-maxWidth);')
  })

  it('primitives 값이 토큰을 가리키는 것은 그대로다', () => {
    const { values, issues } = checkPrimitives({ container: { gutter: 'space.6' } }, TOKENS)
    expect(issues).toEqual([])
    expect([...values]).toEqual([['container.gutter', 'var(--wb-space-6)']])
  })
})

describe('admin의 두 primitives 참조가 해석된다', () => {
  /**
   * **`admin`의 `Section.parts.inner.maxWidth`·`Grid.base.gap`.** 참조 문법이 없으면 이
   * 둘이 무효 선언으로 나간다 — 시스템 테마 전수는 `system-unresolved-literals.test.ts`가 센다.
   */
  it('admin의 두 선언이 var()로 나간다', () => {
    const { theme, issues } = resolveTheme(systemTheme('admin')!)
    expect(issues).toEqual([])
    const css = compileTheme(theme!)

    expect(css).toContain('max-width: var(--wb-container-maxWidth);')
    expect(css).toContain('gap: var(--wb-grid-gap);')
    // 무효 선언이 없는 것까지 본다 — `var()` 선언 옆에 리터럴 선언이 **함께** 나가지 않는다.
    expect(css).not.toContain('max-width: container.maxWidth;')
    expect(css).not.toContain('gap: grid.gap;')
  })
})
