import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { compileTheme } from '../src/emit/index'
import { cssVarName } from '../src/resolve/style'
import { resolveTheme } from '../src/resolve/index'
import type { ResolvedTheme } from '../src/resolved'
import { MINIMAL_THEME } from './fixtures/minimal'

beforeAll(() => {
  installCatalog()
})

function compile(document: unknown): string {
  const { theme, issues } = resolveTheme(document)
  expect(issues, JSON.stringify(issues)).toEqual([])
  return compileTheme(theme as ResolvedTheme)
}

/** 규칙 하나의 본문. 셀렉터가 없으면 undefined. */
function ruleBody(css: string, selector: string): string | undefined {
  const at = css.indexOf(`${selector} {`)
  if (at === -1) return undefined
  return css.slice(at + selector.length + 2, css.indexOf('}', at)).trim()
}

const theme = (extra: Record<string, unknown>) => ({ ...MINIMAL_THEME, ...extra })

describe('compileTheme — :root (설계서 「컴파일」)', () => {
  it('토큰이 --wb-<경로>로 나오고 경로의 점이 하이픈이 된다', () => {
    const css = compile(MINIMAL_THEME)
    expect(css).toContain('--wb-semantic-primary: #2563eb;')
    expect(css).toContain('--wb-space-6: 24px;')
    expect(css).toContain('--wb-radius-lg: 12px;')
    expect(css).toContain('--wb-palette-blue-600: #2563eb;')
    expect(css).toContain('--wb-typography-h3-fontSize: 20px;')
  })

  it('primitives도 :root에 나온다', () => {
    const css = compile(MINIMAL_THEME)
    // 설계서 「컴파일」의 예시는 `--wb-container-max`인데 규격 경로는 `container.maxWidth`다.
    // 이름 규칙(경로의 `.`이 `-`가 된다)을 그대로 쓴다 — 근거는 소스 주석에 있다.
    expect(css).toContain('--wb-container-maxWidth: 1200px;')
    expect(css).toContain('--wb-container-gutter: var(--wb-space-6);')
  })

  it('브레이크포인트는 :root에 나오지 않는다 — @media 조건이 수를 직접 쓴다', () => {
    expect(compile(MINIMAL_THEME)).not.toContain('--wb-breakpoints')
  })
})

describe('compileTheme — 셀렉터 (「컴파일」)', () => {
  it('base는 구조를 함께 건다', () => {
    const css = compile(MINIMAL_THEME)
    expect(ruleBody(css, '[data-wb-component="List"][data-wb-structure="cardGrid"]'))
      .toBe('gap: var(--wb-space-6);')
  })

  it('parts는 자손 셀렉터다', () => {
    const css = compile(MINIMAL_THEME)
    const body = ruleBody(css, '[data-wb-component="List"] [data-wb-part="item"]')
    expect(body).toContain('background: var(--wb-semantic-surface);')
    expect(body).toContain('border-radius: var(--wb-radius-lg);')
  })

  it('variant는 [data-wb-variant]다', () => {
    const css = compile(MINIMAL_THEME)
    expect(
      ruleBody(css, '[data-wb-component="List"][data-wb-variant="featured"] [data-wb-part="item"]'),
    ).toBe('border-width: 2px;')
  })

  it('state는 ~=다 — 공백 구분 목록이라 =면 상태 둘일 때 안 맞는다', () => {
    const css = compile(MINIMAL_THEME)
    expect(
      ruleBody(css, '[data-wb-component="List"][data-wb-state~="selected"] [data-wb-part="item"]'),
    ).toBe('border-color: var(--wb-semantic-primary);')
    expect(ruleBody(css, '[data-wb-component="List"][data-wb-state~="disabled"]')).toBe('opacity: 0.5;')
    expect(css).not.toContain('[data-wb-state="')
  })

  it('테마에 없는 층은 규칙을 내지 않는다 — 빈 셀렉터·빈 @media가 없다', () => {
    const css = compile(theme({ components: { Button: { structure: 'solid' } }, patterns: {} }))
    expect(css).not.toMatch(/\{\s*\}/)
    expect(css).not.toContain('@media')
    expect(css).not.toContain('data-wb-part')
  })
})

describe('브레이크포인트 방향과 경계값', () => {
  const twoBreakpoints = theme({
    primitives: { breakpoints: { sm: 640, md: 768 } },
    components: {
      List: {
        structure: 'cardGrid',
        base: { gap: 'space.6' },
        responsive: { sm: { base: { gap: 'space.3' } }, md: { base: { gap: 'space.4' } } },
      },
    },
  })

  it('max-width이고 선언된 값을 그대로 쓴다', () => {
    const css = compile(twoBreakpoints)
    expect(css).toContain('@media (max-width: 768px)')
    expect(css).toContain('@media (max-width: 640px)')
    expect(css).not.toContain('767px')
    expect(css).not.toContain('min-width')
  })

  it('넓은 것이 먼저 나온다 — 순서가 곧 우선순위다', () => {
    // desktop-first에서 640 이하는 두 블록이 **모두** 맞는다. 겹침은 결함이 아니라 방식이고,
    // 좁은 것이 나중에 와야 이긴다. 문서에 적힌 순서(sm 먼저)와 무관하게 폭으로 정렬한다.
    const css = compile(twoBreakpoints)
    expect(css.indexOf('max-width: 768px')).toBeLessThan(css.indexOf('max-width: 640px'))
  })

  it('겹침과 틈을 폭으로 재본다', () => {
    const css = compile(twoBreakpoints)
    const widths = [...css.matchAll(/max-width: (\d+)px/g)].map((m) => Number(m[1]))
    expect(widths).toEqual([768, 640])
    // 폭 641~768은 md만, 0~640은 둘 다, 769 이상은 어느 쪽도 아니다 — 틈이 없다.
    const matching = (width: number) => widths.filter((max) => width <= max)
    expect(matching(769)).toEqual([])
    expect(matching(768)).toEqual([768])
    expect(matching(641)).toEqual([768])
    expect(matching(640)).toEqual([768, 640])
    expect(matching(1)).toEqual([768, 640])
  })

  it('@media 안쪽 셀렉터가 바깥과 같다', () => {
    const css = compile(twoBreakpoints)
    const block = css.slice(css.indexOf('@media (max-width: 640px)'))
    expect(block).toContain('[data-wb-component="List"][data-wb-structure="cardGrid"]')
    expect(block).toContain('gap: var(--wb-space-3);')
  })
})

/**
 * **이 계약은 저장을 거쳐도 성립해야 한다** — `jsonb`는 키 순서를 정규화하므로 `themes`
 * 테이블은 절을 `json` 컬럼에 담는다(설계서 「테이블 정의」). 근거와 실측은
 * `src/emit/index.ts`의 `compileTheme` 주석에 있다.
 */
describe('states가 여럿일 때 순서', () => {
  const twoStates = theme({
    components: {
      List: {
        structure: 'cardGrid',
        states: { selected: { base: { opacity: 0.9 } }, disabled: { base: { opacity: 0.5 } } },
      },
    },
  })

  it('문서에 적힌 순서가 규칙 순서다', () => {
    const css = compile(twoStates)
    expect(css.indexOf('[data-wb-state~="selected"]')).toBeLessThan(
      css.indexOf('[data-wb-state~="disabled"]'),
    )
  })

  it('순서를 뒤집으면 규칙 순서도 뒤집힌다', () => {
    const css = compile(
      theme({
        components: {
          List: {
            structure: 'cardGrid',
            states: { disabled: { base: { opacity: 0.5 } }, selected: { base: { opacity: 0.9 } } },
          },
        },
      }),
    )
    expect(css.indexOf('[data-wb-state~="disabled"]')).toBeLessThan(
      css.indexOf('[data-wb-state~="selected"]'),
    )
  })

  it('JSON을 거쳐도 같다 — 순서의 근거가 객체 키 순서다', () => {
    const source = JSON.stringify({
      meta: MINIMAL_THEME.meta,
      components: {
        List: {
          structure: 'cardGrid',
          states: { selected: { base: { opacity: 0.9 } }, disabled: { base: { opacity: 0.5 } } },
        },
      },
    })
    const css = compile(JSON.parse(source))
    expect(css.indexOf('[data-wb-state~="selected"]')).toBeLessThan(
      css.indexOf('[data-wb-state~="disabled"]'),
    )
  })

  it('상태 이름은 정수형 키가 될 수 없다 — 순서가 삽입 순서로 남는 근거다', () => {
    // 자바스크립트는 정수형 키를 먼저 오름차순으로 돌린다. 상태 이름은 카탈로그가
    // 선언한 것이므로 그 갈래에 들어가지 않는다.
    const { theme: resolved } = resolveTheme(MINIMAL_THEME)
    for (const component of resolved?.components.values() ?? []) {
      for (const name of component.states.keys()) {
        expect(String(Number.parseInt(name, 10)), name).not.toBe(name)
      }
    }
  })
})

describe('variants와 states가 같은 조각을 건드릴 때', () => {
  const both = theme({
    components: {
      List: {
        structure: 'cardGrid',
        variants: { featured: { parts: { item: { borderColor: 'semantic.surface' } } } },
        states: { selected: { parts: { item: { borderColor: 'semantic.primary' } } } },
      },
    },
  })

  it('state 규칙이 variant 규칙보다 뒤에 나온다', () => {
    const css = compile(both)
    expect(css.indexOf('[data-wb-variant="featured"]')).toBeLessThan(
      css.indexOf('[data-wb-state~="selected"]'),
    )
  })

  it('두 셀렉터의 특이도가 같다 — 그래서 순서가 결정한다', () => {
    // 특이도는 속성 셀렉터의 개수로 정해진다. 둘을 세어 같은지 본다.
    // 뒤에 온 것이 실제로 이기는 것은 `test/emit-parse.test.ts`가 jsdom으로 잰다.
    const css = compile(both)
    const count = (selector: string) => (selector.match(/\[/g) ?? []).length
    const variant = '[data-wb-component="List"][data-wb-variant="featured"] [data-wb-part="item"]'
    const state = '[data-wb-component="List"][data-wb-state~="selected"] [data-wb-part="item"]'
    expect(css).toContain(variant)
    expect(css).toContain(state)
    expect(count(state)).toBe(count(variant))
  })

  it('responsive가 마지막이다', () => {
    const css = compile(MINIMAL_THEME)
    expect(css.indexOf('[data-wb-state~="selected"]')).toBeLessThan(css.indexOf('@media'))
  })
})

describe('compileTheme — 결정적이다 (「컴파일」)', () => {
  it('같은 입력이 같은 출력을 낸다', () => {
    expect(compile(MINIMAL_THEME)).toBe(compile(MINIMAL_THEME))
  })

  it('JSON 문자열을 거쳐도 같다 — 내보낸 번들과 웹의 CSS가 같아야 한다', () => {
    const source = JSON.stringify(MINIMAL_THEME)
    expect(compile(JSON.parse(source))).toBe(compile(JSON.parse(source)))
    expect(compile(JSON.parse(source))).toBe(compile(MINIMAL_THEME))
  })
})

describe('compileTheme — 얕은 성질만 본다', () => {
  it('중괄호가 균형을 이루고 선언마다 세미콜론이 있고 따옴표 짝이 맞는다', () => {
    // **CSS 파서를 들이지 않는다.** 여기서 보는 것은 문자열의 얕은 성질뿐이고,
    // 이것이 통과한다고 유효한 CSS라는 뜻은 아니다.
    //
    // 따옴표 짝을 더한 이유는 그것이 **중괄호도 세미콜론도 건드리지 않으면서** 스타일시트를
    // 통째로 못 쓰게 만드는 것을 재서 봤기 때문이다(`test/emit-parse.test.ts`).
    // 줄을 CSS 개행 전부로 가르는 것도 같은 이유다 — 값에 든 개행이 줄을 쪼갠다.
    const css = compile(MINIMAL_THEME)
    let depth = 0
    for (const char of css) {
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      expect(depth).toBeGreaterThanOrEqual(0)
    }
    expect(depth).toBe(0)
    for (const line of css.split(/[\n\r\f]/)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.endsWith('{') || trimmed === '}') continue
      expect(trimmed.endsWith(';'), trimmed).toBe(true)
    }
    let open: string | null = null
    for (const char of css) {
      if (open === null) {
        if (char === '"' || char === "'") open = char
      } else if (char === open) open = null
    }
    expect(open).toBeNull()
  })

  it('!important를 쓰지 않는다', () => {
    // 테마는 구조 기본 CSS를 **순서로** 이긴다 — `!important`로 덮으면 이기는지를 잴 수
    // 없게 된다(`src/emit/index.ts`의 `compileTheme` 주석).
    expect(compile(MINIMAL_THEME)).not.toContain('!important')
  })

  it('빈 테마도 문자열을 낸다', () => {
    const css = compile({ meta: MINIMAL_THEME.meta })
    expect(css).not.toContain('{')
  })
})

/**
 * **`assets.fonts`가 `@font-face`로 나간다 — 그 대가로 값이 검증을 지난다.**
 *
 * 정적 번들이 폰트 URL을 다시 써야 해도 CSS를 후처리할 이유가 없다 — `compileTheme`은
 * 순수 함수라 `Theme` **문서**의 `src`를 고쳐 다시 컴파일하면 된다(`같은 입력이 같은
 * 출력을 낸다`가 그 성질이다).
 *
 * CSS로 내는 순간 `family`·`src`의 값 규칙이 있어야 한다. 설계서 「assets」는 그 모양을
 * 한 글자도 규정하지 않고 「스타일 프로퍼티 화이트리스트」의 값 규칙은 **스타일
 * 프로퍼티**의 것이라 이 자리에 닿지 않는다. **어휘를 여는 것과 값 규칙을 새로 만드는 것은
 * 다른 일이다** — 그래서 `checkAssets`가 따로 막고, 아래 넷째 케이스가 그 자리를 잰다.
 */
describe('assets.fonts가 CSS로 나간다', () => {
  it('컴파일 결과에 @font-face가 있다', () => {
    // 픽스처가 `assets.fonts`를 실제로 갖고 있다 — 비어 있으면 이 케이스가 아무것도 안 지킨다.
    expect(MINIMAL_THEME.assets?.fonts?.length).toBeGreaterThan(0)
    expect(compile(MINIMAL_THEME)).toContain('@font-face')
  })

  it('폰트 이름과 src가 그 블록 안에 실린다', () => {
    // **픽스처의 `Pretendard`로는 잴 수 없다** — 그 글자는 `assets`가 아니라
    // **토큰** `scale.typography.family.sans`에서도 나온다(`:root`의
    // `--wb-typography-family-sans`). 두 출처가 겹치면 무엇이 실렸는지 구별되지 않으므로
    // 토큰에 없는 이름을 쓴다.
    const css = compile({
      ...MINIMAL_THEME,
      assets: { fonts: [{ family: 'FontFaceProbe', src: 'local("probe-only")' }] },
    })

    expect(css).toContain('@font-face {\n  font-family: FontFaceProbe;\n  src: local("probe-only");\n}')
  })

  it('음성 대조 — typography.family 토큰은 여전히 :root로 나간다', () => {
    // **폰트를 거는 길은 여전히 이쪽이다.** `@font-face`는 폰트를 **싣고**, 컴포넌트에
    // **거는** 것은 `fontFamily` 어휘가 이 변수를 가리키는 것이다(`test/style.test.ts`).
    // 둘이 갈린 채 둘 다 있어야 폰트가 실제로 보인다 — 새 층이 이 층을 대신하지 않는다.
    expect(compile(MINIMAL_THEME)).toContain('--wb-typography-family-sans: Pretendard, sans-serif;')
  })

  it('그 대가 — assets.fonts의 값이 검증을 지난다', () => {
    // **방출이 이 값을 읽으므로 검증하지 않으면 임의 CSS 주입이 된다** — CSS를 통째로
    // 깨는 문자열이 `family`·`src`에 실리면 선언과 블록을 끝내고 나간다. `checkAssets`가
    // `bgImage`와 **같은 규칙**(`rejectFunctions`)으로 막는다.
    const evil = 'a.woff2) } body { display: none } @font-face { src: url(b'
    const { theme, issues } = resolveTheme({
      ...MINIMAL_THEME,
      assets: { fonts: [{ family: 'X; } .a { b: c', src: evil }] },
    })

    expect(issues.map((issue) => issue.path)).toEqual(['assets.fonts.0.family', 'assets.fonts.0.src'])
    // **`error`가 있으면** 테마가 통째로 못 쓰인다 — 반쯤 해석된 것이 방출로 가지 않는다.
    // 여기 둘은 `checkAssets`가 내는 `error`라 그대로 `null`이다.
    expect(theme).toBeNull()
  })
})

/**
 * **「컴파일」 예시의 `--wb-container-max`.**
 *
 * 그 절의 컴파일 예시에 `--wb-container-max`가 있는데 **규격 경로에서 어느 규칙으로도
 * 나오지 않는다** — 설계서 「primitives — 사이트 골격」이 그 값을 `container.maxWidth`라 부르고 이름 규칙
 * (`--wb-` + 경로의 `.`을 `-`로)이 `--wb-container-maxWidth`를 만든다.
 *
 * **판정: 예시가 줄여 쓴 것이다. 이름 규칙에 예외를 두지 않는다.**
 *
 * 근거는 **같은 예시 안에서 센 것**이다(아래 첫 케이스) — 그 `:root` 블록의 변수 넷 중
 * **셋은 규칙과 정확히 일치하고 그 하나만 어긋난다.** 규칙이 틀렸다면 넷이 다 어긋나야 한다.
 *
 * 예외를 두지 않는 이유 둘:
 *
 * 1. `cssVarName`은 **경로 → 이름의 순수 규칙**이다. 예외를 하나 두면 그것이 표가 되고,
 *    표는 「primitives — 사이트 골격」의 `primitives`가 늘 때 낡는다. *"절대값을 계약에
 *    적지 않는다"*와 같은 부류다.
 * 2. 예외를 두면 **테마 작성자가 `container.max`를 쓸 수 있다고 읽는다** — 규격은
 *    `maxWidth`이므로 그 문서는 `unknown-token`이 된다.
 *
 * **설계서의 예시는 고치지 않는다** — 규격과 예시가 갈리면 규격이 이기고 예시가 틀린 것으로 본다.
 */
describe('「컴파일」 예시의 --wb-container-max', () => {
  /** 「컴파일」의 `:root` 블록에서 변수 이름을 뽑는다. 손으로 인용하지 않는다. */
  function rootVarsInSpec(): string[] {
    const section = designDoc.split('### 6.11 컴파일')[1] ?? ''
    const block = section.split(':root {')[1]?.split('}')[0] ?? ''
    return [...block.matchAll(/--wb-[A-Za-z0-9-]+/g)].map((m) => m[0])
  }

  it('「컴파일」의 :root 예시를 실제로 읽는다 — 카나리아', () => {
    const names = rootVarsInSpec()
    expect(names).toContain('--wb-container-max')
    expect(names.length).toBeGreaterThan(3)
  })

  it('예시의 변수 넷 중 셋은 규칙과 일치하고 하나만 어긋난다', () => {
    // **이것이 "규칙이 아니라 예시가 틀렸다"의 근거다.** 규칙이 틀렸다면 넷이 다 어긋난다.
    const css = compile(MINIMAL_THEME)
    const missing = rootVarsInSpec().filter((name) => !css.includes(`${name}:`))

    expect(missing).toEqual(['--wb-container-max'])
  })

  it('나오는 것은 --wb-container-maxWidth다', () => {
    const css = compile(MINIMAL_THEME)

    expect(css).toContain('--wb-container-maxWidth: 1200px;')
    expect(css).not.toContain('--wb-container-max:')
  })

  it('이름 규칙에 예외가 없다 — primitives 전부가 같은 규칙을 지난다', () => {
    // 예외를 하나 두면 그것이 표가 되고 표는 낡는다. `primitives`의 경로 전부를 훑어
    // **`cssVarName`이 만든 이름 그대로** 나오는지 본다.
    const { theme } = resolveTheme(MINIMAL_THEME)
    const css = compile(MINIMAL_THEME)
    const paths = [...(theme as ResolvedTheme).primitives.keys()]

    expect(paths.length).toBeGreaterThan(3)
    for (const path of paths) {
      expect(css, path).toContain(`${cssVarName(path)}:`)
    }
  })
})
