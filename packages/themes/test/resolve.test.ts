import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveTheme } from '../src/resolve/index'
import { cssVarName } from '../src/resolve/style'
import type { ResolvedTheme } from '../src/resolved'
import { DERIVED_PATCH, MINIMAL_THEME } from './fixtures/minimal'

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()

beforeAll(() => {
  installCatalog()
})

/** 해석 결과에 실린 `var(--wb-…)` 이름을 전부 모은다. */
function emittedVars(theme: ResolvedTheme): string[] {
  const found: string[] = []
  const scan = (declarations: readonly (readonly [string, string])[]) => {
    for (const [, value] of declarations) {
      for (const match of value.matchAll(/var\((--wb-[A-Za-z0-9_-]+)\)/g)) found.push(match[1] as string)
    }
  }
  const layer = (l: { base: readonly (readonly [string, string])[]; parts: ReadonlyMap<string, readonly (readonly [string, string])[]> }) => {
    scan(l.base)
    for (const declarations of l.parts.values()) scan(declarations)
  }
  for (const component of theme.components.values()) {
    layer(component)
    for (const group of [component.variants, component.states, component.responsive]) {
      for (const l of group.values()) layer(l)
    }
  }
  scan([...theme.primitives])
  return found
}

describe('resolveTheme — 픽스처', () => {
  it('최소 테마가 이슈 0으로 해석된다', () => {
    const { theme, issues } = resolveTheme(MINIMAL_THEME)
    expect(issues).toEqual([])
    expect(theme).not.toBeNull()
    expect(theme?.meta.id).toBe('portal')
    expect(theme?.tokens.get('space.6')).toBe('24px')
    expect(theme?.tokens.get('semantic.primary')).toBe('#2563eb')
    expect(theme?.primitives.get('container.maxWidth')).toBe('1200px')
    expect(theme?.primitives.get('container.gutter')).toBe('var(--wb-space-6)')
    expect([...(theme?.breakpoints ?? [])]).toEqual([['md', 768], ['sm', 640]])
    expect(theme?.components.get('List')?.structure).toBe('cardGrid')
    expect(theme?.patterns.has('hero.split')).toBe(true)
    expect(theme?.assets?.icons).toBe('lucide')
  })

  it('파생 픽스처가 base와 병합돼 해석된다', () => {
    const { theme, issues } = resolveTheme(DERIVED_PATCH, MINIMAL_THEME)
    expect(issues).toEqual([])
    expect(theme?.meta.id).toBe('acme-portal')
    // 덮어쓴 것
    expect(theme?.tokens.get('semantic.primary')).toBe('#111111')
    expect(theme?.tokens.get('typography.family.sans')).toBe('Inter, sans-serif')
    // 지운 것
    expect(theme?.tokens.has('semantic.danger')).toBe(false)
    // 물려받은 것
    expect(theme?.tokens.get('semantic.surface')).toBe('#ffffff')
    expect(theme?.components.get('List')?.structure).toBe('cardGrid')
  })

  it('extends가 있는데 base를 안 주면 이슈다', () => {
    const { theme, issues } = resolveTheme(DERIVED_PATCH)
    expect(codes(issues)).toEqual(['bad-extends'])
    expect(theme).toBeNull()
  })

  it('extends가 없는데 base를 주면 이슈다 — 병합할 관계가 없다', () => {
    const { theme, issues } = resolveTheme(MINIMAL_THEME, MINIMAL_THEME)
    expect(codes(issues)).toEqual(['bad-extends'])
    expect(theme).toBeNull()
  })
})

describe('resolveTheme — 해석과 방출을 가른 성질', () => {
  it('해석 결과의 var(--wb-…)가 전부 자기 tokens·primitives 안이다', () => {
    // **이것이 해석과 방출을 가른 이유다.** 검증을 지나지 않은 참조가 남아 있으면
    // 방출이 그것을 var()로 내보내고 정의되지 않은 변수가 CSS에 실린다.
    const { theme } = resolveTheme(MINIMAL_THEME)
    expect(theme).not.toBeNull()
    const defined = new Set([
      ...[...(theme?.tokens.keys() ?? [])].map(cssVarName),
      ...[...(theme?.primitives.keys() ?? [])].map(cssVarName),
    ])
    const used = emittedVars(theme as ResolvedTheme)
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(defined, name).toContain(name)
  })

  it('토큰 참조 문법이 결과에 남아 있지 않다', () => {
    const { theme } = resolveTheme(MINIMAL_THEME)
    const values: string[] = []
    for (const component of theme?.components.values() ?? []) {
      for (const [, value] of component.base) values.push(value)
      for (const declarations of component.parts.values()) {
        for (const [, value] of declarations) values.push(value)
      }
    }
    values.push(...(theme?.primitives.values() ?? []))
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(/(^|[\s,(])(semantic|space|radius|shadow|typography|motion|palette)\./.test(value), value)
        .toBe(false)
    }
  })

  /**
   * **케이스가 쓰는 값(`space.99` → `unknown-token`)은 `error`라, `null`의 기준
   * (`resolve/index.ts`)이 *"이슈가 있으면"*이든 *"`error`가 있으면"*이든 단언은 통과한다** —
   * 기준이 바뀌어도 이름만 조용히 거짓이 된다. 경고만 있는 갈래는
   * `warning-channel.test.ts`가 따로 본다.
   */
  it('error가 하나라도 있으면 theme이 null이다 — 반쯤 해석된 것을 내보내지 않는다', () => {
    const { theme, issues } = resolveTheme({
      ...MINIMAL_THEME,
      components: { List: { base: { gap: 'space.99' } } },
    })
    expect(issues.length).toBeGreaterThan(0)
    expect(theme).toBeNull()
  })

  it('첫 이슈에서 멈추지 않는다 — 서로 다른 층의 이슈가 함께 나온다', () => {
    const { issues } = resolveTheme({
      ...MINIMAL_THEME,
      tokens: { ...MINIMAL_THEME.tokens, palette: { bad: 'semantic.primary' } },
      primitives: { ...MINIMAL_THEME.primitives, container: { maxWidth: 'calc(1px)' } },
      components: { Carousel: {} },
      patterns: { 'banner.x': { name: 'x', schema: { type: 'Section' } } },
    })
    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'bad-pattern-name',
        'bad-style-value',
        'bad-token-value',
        'unknown-component',
      ]),
    )
  })

  it('이슈에 경로가 실린다', () => {
    const { issues } = resolveTheme({
      ...MINIMAL_THEME,
      components: { List: { base: { gap: 'space.99' } } },
    })
    expect(issues[0]?.path).toBe('components.List.base.gap')
  })
})

describe('resolveTheme — 입력의 모양', () => {
  it('규격을 지키지 않는 문서는 이슈다 — 던지지 않는다', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { meta: {} }, { meta: MINIMAL_THEME.meta, tokns: {} }]) {
      const { theme, issues } = resolveTheme(bad)
      // `{ meta: {} }`은 빠진 필드마다 하나씩 내므로 개수가 아니라 종류를 본다.
      expect(issues.length, JSON.stringify(bad)).toBeGreaterThan(0)
      expect([...new Set(codes(issues))], JSON.stringify(bad)).toEqual(['bad-spec'])
      expect(theme, JSON.stringify(bad)).toBeNull()
    }
  })

  it('절이 없는 테마도 해석된다', () => {
    const { theme, issues } = resolveTheme({ meta: MINIMAL_THEME.meta })
    expect(issues).toEqual([])
    expect(theme?.tokens.size).toBe(0)
    expect(theme?.components.size).toBe(0)
  })

  it('null은 파생 문서에서만 뜻이 있다', () => {
    const { issues } = resolveTheme({
      meta: MINIMAL_THEME.meta,
      tokens: { semantic: { danger: null } },
    })
    expect(codes(issues)).toEqual(['bad-spec'])
  })
})

describe('resolveTheme — 결정적이다', () => {
  it('같은 입력이 같은 결과를 낸다', () => {
    const first = resolveTheme(MINIMAL_THEME)
    const second = resolveTheme(MINIMAL_THEME)
    expect(JSON.stringify([...(second.theme?.tokens ?? [])])).toBe(
      JSON.stringify([...(first.theme?.tokens ?? [])]),
    )
    expect([...(second.theme?.components.keys() ?? [])]).toEqual([
      ...(first.theme?.components.keys() ?? []),
    ])
  })
})

describe('서로 다른 경로가 같은 CSS 변수 이름을 내면 이슈다', () => {
  const meta = MINIMAL_THEME.meta

  it('점과 대시가 같은 이름으로 접힌다', () => {
    // `cssVarName`이 `.`을 `-`로 바꾸므로 `blue.500`과 `blue-500`이 같은 변수가 된다.
    // 조용히 두면 `:root`에 같은 이름이 두 번 나가고 나중 것이 이긴다 — 아무도 모른다.
    for (const palette of [
      { 'blue.500': '#1', 'blue-500': '#2' },
      { 'a.b.c': '#1', 'a-b-c': '#2' },
    ]) {
      const { theme, issues } = resolveTheme({ meta, tokens: { palette } })
      expect(codes(issues), JSON.stringify(palette)).toEqual(['duplicate-variable'])
      expect(theme, JSON.stringify(palette)).toBeNull()
    }
  })

  it('이슈 문안이 두 경로를 다 말한다', () => {
    const { issues } = resolveTheme({ meta, tokens: { palette: { 'blue.500': '#1', 'blue-500': '#2' } } })
    expect(issues[0]?.message).toContain('palette.blue.500')
    expect(issues[0]?.message).toContain('palette.blue-500')
    expect(issues[0]?.message).toContain('--wb-palette-blue-500')
  })

  it('층이 달라도 본다', () => {
    const { issues } = resolveTheme({
      meta,
      tokens: { semantic: { 'a.b': '#1' }, scale: { radius: { x: '1px' } } },
      primitives: { container: { gutter: '2px' } },
    })
    // 토큰은 이름공간이 앞에 붙고 primitives는 container·grid·section으로 시작하므로
    // 이 조합에서는 겹치지 않는다. 검사는 두 층을 합친 집합에서 돈다.
    expect(issues).toEqual([])
  })

  it('과도 차단이 없다 — 픽스처 테마가 충돌을 내지 않는다', () => {
    const { theme, issues } = resolveTheme(MINIMAL_THEME)
    expect(issues).toEqual([])
    const names = [...(theme?.tokens.keys() ?? []), ...(theme?.primitives.keys() ?? [])].map(cssVarName)
    expect(names.length).toBeGreaterThan(0)
    expect(new Set(names).size).toBe(names.length)
  })
})
