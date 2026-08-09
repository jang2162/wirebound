import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
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

describe('compileTheme — :root (§6.11)', () => {
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
    // §6.11의 예시는 `--wb-container-max`인데 규격 경로는 `container.maxWidth`다.
    // D6의 규칙(경로의 `.`이 `-`가 된다)을 그대로 쓴다 — 근거는 소스 주석에 있다.
    expect(css).toContain('--wb-container-maxWidth: 1200px;')
    expect(css).toContain('--wb-container-gutter: var(--wb-space-6);')
  })

  it('브레이크포인트는 :root에 나오지 않는다 — @media 조건이 수를 직접 쓴다', () => {
    expect(compile(MINIMAL_THEME)).not.toContain('--wb-breakpoints')
  })
})

describe('compileTheme — 셀렉터 (§6.11)', () => {
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

describe('재라 #3 — 브레이크포인트 방향과 경계값', () => {
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
 * **이 계약은 메모리 안에서만 성립한다** — §4.2의 `jsonb`가 키 순서를 정규화한다.
 * 근거와 실측은 `src/emit/index.ts`의 `compileTheme` 주석에 있고, P4a-3이 재서 정한다.
 */
describe('재라 #6 — states가 여럿일 때 순서', () => {
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

describe('재라 #7 — variants와 states가 같은 조각을 건드릴 때', () => {
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

describe('compileTheme — 결정적이다 (§6.11)', () => {
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

  it('!important를 쓰지 않는다 (D9)', () => {
    // P0 이월의 inline style 결함을 코드에 새기지 않는다 — P4a-2가 그것을 걷어낸다.
    expect(compile(MINIMAL_THEME)).not.toContain('!important')
  })

  it('빈 테마도 문자열을 낸다', () => {
    const css = compile({ meta: MINIMAL_THEME.meta })
    expect(css).not.toContain('{')
  })
})
