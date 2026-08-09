import { installCatalog, listComponents } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { ComponentsSchema, checkThemeComponents } from '../src/spec/components'
import { PrimitivesSchema, checkPrimitives } from '../src/spec/primitives'
import { STYLE_PROPERTIES } from '../src/resolve/style'
import type { TokenTable } from '../src/resolve/tokens'

const TOKENS: TokenTable = new Map([
  ['semantic.primary', '#2563eb'],
  ['semantic.surface', '#ffffff'],
  ['space.3', '12px'],
  ['space.4', '16px'],
  ['space.6', '24px'],
  ['radius.lg', '12px'],
  ['shadow.sm', '0 1px 2px #0001'],
  ['shadow.lg', '0 10px 24px #0002'],
])

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()

beforeAll(() => {
  // 레지스트리는 전역이고 이 패키지는 카탈로그를 설치하지 않는다 —
  // `schema`의 `validatePage`가 `getComponent`를 그냥 부르는 것과 같은 자리다.
  installCatalog()
})

describe('전제', () => {
  it('installCatalog은 멱등하다', () => {
    // 다른 테스트 파일이 이미 설치했을 수 있으므로 여기서 다시 부른다.
    const before = listComponents().length
    installCatalog()
    installCatalog()
    expect(listComponents().length).toBe(before)
  })

  it('base·parts는 §6.8의 스타일 프로퍼티 이름이 아니다', () => {
    // 층 안에서 스타일 프로퍼티를 바로 쓰는 축약(§6.5의 `states.disabled`)이
    // 모호하지 않은 근거다. 두 집합이 겹치면 그 축약을 쓸 수 없다.
    expect(Object.keys(STYLE_PROPERTIES)).not.toContain('base')
    expect(Object.keys(STYLE_PROPERTIES)).not.toContain('parts')
  })
})

describe('ComponentsSchema', () => {
  it('설계 §6.5의 예시가 그대로 통과한다', () => {
    const parsed = ComponentsSchema.safeParse({
      List: {
        structure: 'cardGrid',
        base: { gap: 'space.6' },
        parts: {
          item: { bg: 'semantic.surface', radius: 'radius.lg', shadow: 'shadow.sm', padding: 'space.5' },
          media: { aspectRatio: '16/9', objectFit: 'cover', radius: 'radius.md' },
          title: { typography: 'h3' },
        },
        variants: {
          featured: { parts: { item: { shadow: 'shadow.lg' } } },
          compact: { parts: { item: { padding: 'space.3' } } },
        },
        states: {
          selected: { parts: { item: { borderColor: 'semantic.primary', borderWidth: '2px' } } },
          disabled: { opacity: 0.5 },
        },
        responsive: { md: { base: { gap: 'space.4' } } },
      },
    })
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('컴포넌트 항목의 최상위 키는 여섯 층뿐이다', () => {
    expect(ComponentsSchema.safeParse({ List: { skin: {} } }).success).toBe(false)
  })

  it('상태·변형은 base·parts 밖에 스타일 프로퍼티를 바로 쓸 수 있다', () => {
    // §6.5의 `states.disabled`가 `{ "opacity": 0.5 }`다 — base로 감싸지 않았다.
    // `base`·`parts`는 §6.8의 프로퍼티 이름과 겹치지 않으므로(아래 케이스가 그것을 잰다)
    // 이 축약에 모호함이 없다.
    expect(ComponentsSchema.safeParse({ List: { states: { disabled: { opacity: 0.5 } } } }).success)
      .toBe(true)
  })
})

describe('checkThemeComponents — 카탈로그 대조 (D1)', () => {
  const check = (components: unknown, breakpoints: string[] = ['md']) =>
    checkThemeComponents(components as never, TOKENS, breakpoints)

  it('카탈로그에 없는 컴포넌트 이름은 이슈다', () => {
    expect(codes(check({ Carousel: {} }).issues)).toEqual(['unknown-component'])
  })

  it('그 컴포넌트가 선언하지 않은 structure는 이슈다', () => {
    expect(check({ List: { structure: 'cardGrid' } }).issues).toEqual([])
    expect(codes(check({ List: { structure: 'masonry' } }).issues)).toEqual(['unknown-structure'])
    // 다른 컴포넌트의 구조를 빌려 쓸 수 없다 — `accordion`은 Tree의 것이다.
    expect(codes(check({ List: { structure: 'accordion' } }).issues)).toEqual(['unknown-structure'])
  })

  it('선언하지 않은 part는 이슈다', () => {
    expect(check({ List: { parts: { item: { gap: 'space.6' } } } }).issues).toEqual([])
    expect(codes(check({ List: { parts: { footer: { gap: 'space.6' } } } }).issues)).toEqual([
      'unknown-part',
    ])
  })

  it('선언하지 않은 variant는 이슈다', () => {
    expect(check({ List: { variants: { featured: { opacity: 1 } } } }).issues).toEqual([])
    expect(codes(check({ List: { variants: { hero: { opacity: 1 } } } }).issues)).toEqual([
      'unknown-variant',
    ])
  })

  it('선언하지 않은 state는 이슈다', () => {
    expect(check({ List: { states: { selected: { opacity: 1 } } } }).issues).toEqual([])
    expect(codes(check({ List: { states: { hovered: { opacity: 1 } } } }).issues)).toEqual([
      'unknown-state',
    ])
  })

  it('변형·상태 안쪽의 parts도 대조한다', () => {
    expect(codes(check({ List: { variants: { featured: { parts: { footer: {} } } } } }).issues))
      .toEqual(['unknown-part'])
    expect(codes(check({ List: { states: { selected: { parts: { footer: {} } } } } }).issues))
      .toEqual(['unknown-part'])
  })

  it('structure를 생략하면 structures의 첫 번째가 기본이다', () => {
    const { structures, issues } = check({ List: {}, Card: { structure: 'elevated' } })
    expect(issues).toEqual([])
    expect(structures.get('List')).toBe('table')
    expect(structures.get('Card')).toBe('elevated')
  })

  it('base·parts의 값이 화이트리스트를 지난다', () => {
    expect(codes(check({ List: { base: { cursor: 'pointer' } } }).issues)).toEqual([
      'unknown-style-prop',
    ])
    expect(codes(check({ List: { parts: { item: { padding: 'calc(1px + 1px)' } } } }).issues))
      .toEqual(['bad-style-value'])
    expect(codes(check({ List: { base: { gap: 'space.99' } } }).issues)).toEqual(['unknown-token'])
  })

  it('responsive의 키는 선언된 브레이크포인트여야 한다', () => {
    expect(check({ List: { responsive: { md: { base: { gap: 'space.4' } } } } }).issues).toEqual([])
    expect(codes(check({ List: { responsive: { xxl: { base: { gap: 'space.4' } } } } }).issues))
      .toEqual(['unknown-breakpoint'])
  })

  it('이슈에 어느 자리인지가 실린다', () => {
    const { issues } = check({ List: { parts: { footer: {} } } })
    expect(issues[0]?.path).toBe('components.List.parts.footer')
  })

  it('첫 이슈에서 멈추지 않는다', () => {
    const { issues } = check({
      Carousel: {},
      List: { structure: 'masonry', parts: { footer: {} }, states: { hovered: {} } },
    })
    expect(codes(issues)).toEqual([
      'unknown-component',
      'unknown-part',
      'unknown-state',
      'unknown-structure',
    ])
  })
})

describe('카탈로그 전체가 테마 규격을 지난다', () => {
  it('listComponents()를 훑어 각 컴포넌트의 최소 항목이 이슈 0으로 통과한다', () => {
    // **분모를 손으로 적지 않는다.** 카탈로그가 늘면 새 컴포넌트가 여기 그대로 들어오고,
    // 그것이 규격을 통과하지 못하면 이 케이스가 죽는다.
    const style = { opacity: 1 }
    const components: Record<string, unknown> = {}
    for (const def of listComponents()) {
      components[def.type] = {
        structure: def.structures[0],
        base: style,
        parts: Object.fromEntries(def.parts.map((part) => [part, style])),
        variants: Object.fromEntries(def.variants.map((name) => [name, { base: style }])),
        states: Object.fromEntries(def.states.map((name) => [name, { base: style }])),
      }
    }

    expect(listComponents().length).toBeGreaterThan(0)
    expect(ComponentsSchema.safeParse(components).error?.issues ?? []).toEqual([])
    expect(checkThemeComponents(components as never, TOKENS, []).issues).toEqual([])
  })

  it('카탈로그의 모든 구조를 하나씩 골라도 통과한다', () => {
    for (const def of listComponents()) {
      for (const structure of def.structures) {
        const issues = checkThemeComponents(
          { [def.type]: { structure } } as never,
          TOKENS,
          [],
        ).issues
        expect(issues, `${def.type}:${structure}`).toEqual([])
      }
    }
  })
})

describe('PrimitivesSchema — §6.4', () => {
  it('설계 §6.4의 예시가 그대로 통과한다', () => {
    const parsed = PrimitivesSchema.safeParse({
      container: { maxWidth: '1200px', gutter: 'space.6' },
      grid: { columns: 12, gap: 'space.6' },
      section: { paddingY: 'space.20', paddingYCompact: 'space.10' },
      breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
    })
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('선언되지 않은 키는 그 자체로 실패다', () => {
    expect(PrimitivesSchema.safeParse({ container: { minWidth: '1px' } }).success).toBe(false)
    expect(PrimitivesSchema.safeParse({ rhythm: {} }).success).toBe(false)
  })

  it('breakpoints의 값은 수다', () => {
    expect(PrimitivesSchema.safeParse({ breakpoints: { md: '768px' } }).success).toBe(false)
    expect(PrimitivesSchema.safeParse({ breakpoints: { md: 768.5 } }).success).toBe(false)
    expect(PrimitivesSchema.safeParse({ breakpoints: { md: -1 } }).success).toBe(false)
  })

  it('breakpoints의 이름은 자유다 — 근거는 소스 주석에 있다', () => {
    expect(PrimitivesSchema.safeParse({ breakpoints: { wide: 1600, phone: 375 } }).success).toBe(true)
    // 이름이 CSS·JS 식별자로 쓸 수 없는 모양이면 막는다.
    expect(PrimitivesSchema.safeParse({ breakpoints: { 'a b': 100 } }).success).toBe(false)
  })

  it('grid.columns는 수다', () => {
    expect(PrimitivesSchema.safeParse({ grid: { columns: '12' } }).success).toBe(false)
  })
})

describe('checkPrimitives', () => {
  it('토큰 참조를 받아 푼다', () => {
    const { values, issues } = checkPrimitives({ container: { gutter: 'space.6' } }, TOKENS)
    expect(issues).toEqual([])
    expect(values.get('container.gutter')).toBe('var(--wb-space-6)')
  })

  it('리터럴은 그대로 남는다', () => {
    const { values } = checkPrimitives({ container: { maxWidth: '1200px' } }, TOKENS)
    expect(values.get('container.maxWidth')).toBe('1200px')
  })

  it('없는 토큰은 이슈다', () => {
    const { values, issues } = checkPrimitives({ grid: { gap: 'space.99' } }, TOKENS)
    expect(codes(issues)).toEqual(['unknown-token'])
    expect(values.has('grid.gap')).toBe(false)
  })

  it('함수는 이슈다 — primitives에는 허용 함수가 없다', () => {
    expect(codes(checkPrimitives({ container: { maxWidth: 'calc(100% - 1px)' } }, TOKENS).issues))
      .toEqual(['bad-style-value'])
  })

  it('breakpoints가 이름과 함께 실린다', () => {
    const { values, breakpoints } = checkPrimitives({ breakpoints: { md: 768 } }, TOKENS)
    expect(values.get('breakpoints.md')).toBe('768')
    expect(breakpoints).toEqual(['md'])
  })
})

describe('프로토타입 키 — 층 축약이 조용히 사라지지 않는다', () => {
  it('직접 만든 층 객체의 __proto__ 키가 이슈로 나온다', () => {
    // **가르는 입력이 여기뿐인 이유를 재서 적는다.** zod는 `__proto__`를 출력에서 지운다
    // (`ComponentsSchema.safeParse`를 지나면 그 키가 없다 — 아래 케이스가 그것을 잰다).
    // 그래서 이 자리를 가르려면 `ThemeLayer`를 직접 만들어야 한다. 중간 객체에 모았다가
    // 넘기면 `shorthand['__proto__'] = '1px'`이 자기 키를 만들지 않아 **이슈도 선언도 없이**
    // 사라진다.
    const layer = { ['__proto__' as string]: '1px' }
    expect(Object.hasOwn(layer, '__proto__')).toBe(true)
    const { issues } = checkThemeComponents(
      { List: { states: { disabled: layer } } } as never,
      TOKENS,
      [],
    )
    expect(issues.map((i) => `${i.code}@${i.path}`)).toEqual([
      'unknown-style-prop@components.List.states.disabled.__proto__',
    ])
  })

  it('zod는 __proto__를 출력에서 지운다 — 위 케이스의 전제다', () => {
    const source = JSON.parse('{"List":{"states":{"disabled":{"__proto__":"1px","toString":"1px"}}}}')
    expect(Object.keys(source.List.states.disabled)).toEqual(['__proto__', 'toString'])
    const parsed = ComponentsSchema.safeParse(source)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const layer = (parsed.data.List as never as { states: { disabled: object } }).states.disabled
    expect(Object.keys(layer)).toEqual(['toString'])
    // 남은 `toString`은 던지지 않고 이슈가 된다(own 가드).
    expect(codes(checkThemeComponents(parsed.data, TOKENS, []).issues)).toEqual(['unknown-style-prop'])
  })
})
