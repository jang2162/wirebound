import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { ThemePatchSchema, mergeTheme, type ThemePatch } from '../src/resolve/merge'
import type { ResolvedTheme } from '../src/resolved'
import { ThemeSchema, type Theme } from '../src/spec/theme'

const codes = (issues: { code: string }[]) => issues.map((i) => i.code).sort()

beforeAll(() => {
  installCatalog()
})

const BASE: Theme = {
  meta: { id: 'portal', name: '포털', version: '1.0.0' },
  tokens: {
    palette: { 'blue.600': '#2563eb', 'gray.50': '#f9fafb' },
    semantic: { primary: 'palette.blue.600', danger: '#dc2626', surface: '#ffffff' },
    scale: { space: { unit: '4px' }, radius: { sm: '4px', lg: '12px' } },
  },
  primitives: { container: { maxWidth: '1200px', gutter: 'space.6' }, breakpoints: { md: 768 } },
  components: { List: { structure: 'table', base: { gap: 'space.6' } } },
  assets: { fonts: [{ family: 'A', src: 'a' }, { family: 'B', src: 'b' }], icons: 'lucide' },
}

const patch = (extra: Record<string, unknown> = {}): ThemePatch & Record<string, unknown> => ({
  meta: { id: 'acme-portal', name: 'ACME 포털', version: '2.0.0', extends: 'system:portal' },
  ...extra,
})

describe('재라 #5 — null 삭제를 규격이 받는가', () => {
  it('ThemeSchema는 어느 층에서도 null을 받지 않는다', () => {
    // 그래서 파생 문서를 `ThemeSchema`로 검사할 수 없고 별도 규격이 필요하다.
    const base = { meta: BASE.meta }
    expect(ThemeSchema.safeParse({ ...base, tokens: { semantic: { danger: null } } }).success).toBe(false)
    expect(ThemeSchema.safeParse({ ...base, tokens: null }).success).toBe(false)
    expect(ThemeSchema.safeParse({ ...base, assets: { fonts: null } }).success).toBe(false)
    expect(ThemeSchema.safeParse({ ...base, components: { List: null } }).success).toBe(false)
  })

  it('ThemePatchSchema는 받는다', () => {
    expect(ThemePatchSchema.safeParse(patch({ tokens: { semantic: { danger: null } } })).success).toBe(true)
    expect(ThemePatchSchema.safeParse(patch({ tokens: null })).success).toBe(true)
  })

  it('파생 규격도 최상위 오타는 막는다', () => {
    expect(ThemePatchSchema.safeParse(patch({ tokns: {} })).success).toBe(false)
  })

  it('파생 규격은 meta를 그대로 요구한다 — 이름과 상속 대상이 거기 있다', () => {
    expect(ThemePatchSchema.safeParse({ tokens: {} }).success).toBe(false)
    expect(ThemePatchSchema.safeParse({ meta: { id: 'a' } }).success).toBe(false)
  })

  it('두 규격이 같은 절을 선언한다', () => {
    // 절 목록이 두 곳에 있으므로 어긋나면 파생 문서가 절 하나를 통째로 못 쓰게 된다.
    const shape = (s: unknown) => Object.keys((s as { shape: Record<string, unknown> }).shape).sort()
    expect(shape(ThemePatchSchema)).toEqual(shape(ThemeSchema))
  })
})

describe('mergeTheme — §6.9의 규칙 넷', () => {
  it('객체는 깊은 병합이다', () => {
    const { theme, issues } = mergeTheme(BASE, patch({ tokens: { semantic: { primary: '#111111' } } }))
    expect(issues).toEqual([])
    expect(theme?.tokens?.semantic).toEqual({
      primary: '#111111',
      danger: '#dc2626',
      surface: '#ffffff',
    })
    // 건드리지 않은 층은 그대로다.
    expect(theme?.tokens?.scale?.radius).toEqual({ sm: '4px', lg: '12px' })
    expect(theme?.components?.List?.base).toEqual({ gap: 'space.6' })
  })

  it('배열은 교체다 — 부분 병합하지 않는다', () => {
    const { theme } = mergeTheme(BASE, patch({ assets: { fonts: [{ family: 'C', src: 'c' }] } }))
    expect(theme?.assets?.fonts).toEqual([{ family: 'C', src: 'c' }])
    expect(theme?.assets?.icons).toBe('lucide')
  })

  it('null은 삭제다', () => {
    const { theme, issues } = mergeTheme(BASE, patch({ tokens: { semantic: { danger: null } } }))
    expect(issues).toEqual([])
    expect(theme?.tokens?.semantic).toEqual({ primary: 'palette.blue.600', surface: '#ffffff' })
    expect('danger' in (theme?.tokens?.semantic ?? {})).toBe(false)
  })

  it('절을 통째로 지울 수 있다', () => {
    const { theme } = mergeTheme(BASE, patch({ assets: null }))
    expect(theme?.assets).toBeUndefined()
    expect('assets' in (theme ?? {})).toBe(false)
  })

  it('null 삭제와 깊은 병합이 겹칠 때', () => {
    const { theme } = mergeTheme(
      BASE,
      patch({ tokens: { semantic: { danger: null, primary: '#111111' }, palette: { 'gray.50': null } } }),
    )
    expect(theme?.tokens?.semantic).toEqual({ primary: '#111111', surface: '#ffffff' })
    expect(theme?.tokens?.palette).toEqual({ 'blue.600': '#2563eb' })
  })

  it('없는 키를 지워도 조용하다', () => {
    const { theme, issues } = mergeTheme(BASE, patch({ tokens: { semantic: { 없음: null } } }))
    expect(issues).toEqual([])
    expect('없음' in (theme?.tokens?.semantic ?? {})).toBe(false)
  })

  it('파생에만 있는 키가 더해진다', () => {
    const { theme } = mergeTheme(BASE, patch({ tokens: { semantic: { accent: '#00f' } } }))
    expect(theme?.tokens?.semantic?.accent).toBe('#00f')
    expect(theme?.patterns).toBeUndefined()
    const added = mergeTheme(BASE, patch({ patterns: { 'hero.x': { name: '히어로', schema: { type: 'Section' } } } }))
    expect(Object.keys(added.theme?.patterns ?? {})).toEqual(['hero.x'])
  })
})

describe('mergeTheme — meta는 병합하지 않는다', () => {
  it('파생의 meta가 그대로이되 extends는 빠진다', () => {
    // 병합 결과는 더 이상 파생 테마가 아니다 — 홀로 선다. `extends`를 지닌 채 저장하면
    // 그것은 여전히 참조이고, 복원이 그때의 base를 다시 요구한다(§4.5가 막으려던 일이다).
    const { theme } = mergeTheme(BASE, patch())
    expect(theme?.meta).toEqual({ id: 'acme-portal', name: 'ACME 포털', version: '2.0.0' })
    expect('extends' in (theme?.meta ?? {})).toBe(false)
  })

  it('base의 meta 항목이 새어 들어오지 않는다', () => {
    const withPreview: Theme = { ...BASE, meta: { ...BASE.meta, description: '내장', preview: 'BASE썸네일' } }
    const { theme } = mergeTheme(withPreview, patch())
    expect(theme?.meta.preview).toBeUndefined()
    expect(theme?.meta.description).toBeUndefined()
  })
})

describe('mergeTheme — 상속 관계', () => {
  it('상속 깊이는 1단계다 — base가 extends를 가지면 이슈다', () => {
    const derivedBase: Theme = { ...BASE, meta: { ...BASE.meta, extends: 'system:other' } }
    const { theme, issues } = mergeTheme(derivedBase, patch())
    expect(codes(issues)).toEqual(['bad-extends'])
    expect(theme).toBeNull()
  })

  it('extends를 선언하지 않은 문서는 병합 대상이 아니다', () => {
    const { theme, issues } = mergeTheme(BASE, {
      meta: { id: 'x', name: 'x', version: '1.0.0' },
    })
    expect(codes(issues)).toEqual(['bad-extends'])
    expect(theme).toBeNull()
  })

  it('extends가 가리키는 것과 다른 base를 주면 이슈다', () => {
    const other: Theme = { ...BASE, meta: { id: 'admin', name: '관리자', version: '1.0.0' } }
    const { theme, issues } = mergeTheme(other, patch())
    expect(codes(issues)).toEqual(['bad-extends'])
    expect(theme).toBeNull()
    expect(issues[0]?.message).toContain('system:admin')
  })
})

describe('mergeTheme — 원본을 변형하지 않는다', () => {
  it('두 번 병합해도 같은 결과다', () => {
    const first = mergeTheme(BASE, patch({ tokens: { semantic: { danger: null } } }))
    const second = mergeTheme(BASE, patch({ tokens: { semantic: { danger: null } } }))
    expect(second.theme).toEqual(first.theme)
    expect(BASE.tokens?.semantic?.danger).toBe('#dc2626')
  })

  it('결과를 깊이 고쳐도 base가 따라 바뀌지 않는다 — 구조를 공유하지 않는다', () => {
    // 시스템 테마는 읽기 전용이고(§6.10) P4b가 모듈 상수로 둘 것이므로,
    // 결과가 base의 하위 객체를 그대로 물고 있으면 한 번의 실수가 그것을 오염시킨다.
    const { theme } = mergeTheme(BASE, patch())
    expect(theme).not.toBeNull()
    const semantic = theme?.tokens?.semantic as Record<string, string>
    semantic.primary = '오염'
    ;(theme?.assets?.fonts as { family: string }[])[0]!.family = '오염'
    ;(theme?.components?.List as { base: Record<string, string> }).base.gap = '오염'
    expect(BASE.tokens?.semantic?.primary).toBe('palette.blue.600')
    expect(BASE.assets?.fonts?.[0]?.family).toBe('A')
    expect(BASE.components?.List?.base?.gap).toBe('space.6')
  })

  it('zod가 복사하지 않는 자리도 공유하지 않는다', () => {
    // `ThemeSchema.safeParse`가 객체 그래프를 새로 짓는 것은 쟀지만, **`z.unknown()` 잎은
    // 참조로 그대로 지나간다**(패턴 노드의 `props` 값이 그 자리다 — 재서 확인했다).
    // 병합이 복사하지 않으면 그 잎이 base·patch와 공유된다.
    const shared = { deep: 1 }
    const withPattern: Theme = {
      ...BASE,
      patterns: { 'hero.x': { name: '히어로', schema: { type: 'Grid', props: { columns: shared } } } },
    }
    const { theme } = mergeTheme(withPattern, patch())
    const columns = (theme?.patterns?.['hero.x']?.schema.props?.['columns'] ?? {}) as { deep: number }
    expect(columns).toEqual({ deep: 1 })
    columns.deep = 999
    expect(shared.deep).toBe(1)

    const fromPatch = { deep: 1 }
    const merged = mergeTheme(
      BASE,
      patch({ patterns: { 'hero.y': { name: '히어로', schema: { type: 'Grid', props: { columns: fromPatch } } } } }),
    )
    const patchColumns = (merged.theme?.patterns?.['hero.y']?.schema.props?.['columns'] ?? {}) as { deep: number }
    patchColumns.deep = 999
    expect(fromPatch.deep).toBe(1)
  })

  it('patch도 변형하지 않는다', () => {
    const p = patch({ tokens: { semantic: { primary: '#111111' } } })
    const { theme } = mergeTheme(BASE, p)
    ;(theme?.tokens?.semantic as Record<string, string>).primary = '오염'
    expect((p.tokens as { semantic: Record<string, string> }).semantic.primary).toBe('#111111')
  })
})

describe('mergeTheme — 결과가 규격을 지키는지 본다', () => {
  it('병합 결과가 ThemeSchema를 통과하지 못하면 theme이 null이고 이슈다', () => {
    const { theme, issues } = mergeTheme(BASE, patch({ tokens: { semantic: { primary: 42 } } }))
    expect(codes(issues)).toEqual(['bad-spec'])
    expect(theme).toBeNull()
  })

  it('이슈에 어느 자리인지가 실린다', () => {
    const { issues } = mergeTheme(BASE, patch({ tokens: { semantic: { primary: 42 } } }))
    expect(issues[0]?.path).toBe('tokens.semantic.primary')
  })

  it('여러 자리가 틀리면 여러 이슈가 난다', () => {
    const { issues } = mergeTheme(
      BASE,
      patch({ tokens: { semantic: { primary: 42, surface: 43 } } }),
    )
    expect(issues.length).toBeGreaterThanOrEqual(2)
  })
})

describe('§4.5 — 병합 결과가 홀로 서서 왕복한다', () => {
  const compile = (document: unknown, base?: Theme) => {
    const { theme, issues } = resolveTheme(document, base)
    expect(issues, JSON.stringify(issues)).toEqual([])
    return compileTheme(theme as ResolvedTheme)
  }

  it('병합 결과를 base 없이 해석할 수 있다', () => {
    const { theme, issues } = mergeTheme(BASE, patch({ tokens: { semantic: { primary: '#111111' } } }))
    expect(issues).toEqual([])
    expect(resolveTheme(theme).issues).toEqual([])
  })

  it('직렬화 → 되읽기 → 해석 → 컴파일이 같은 CSS를 낸다', () => {
    const { theme } = mergeTheme(BASE, patch({ tokens: { semantic: { primary: '#111111' } } }))
    const json = JSON.stringify(theme)
    expect(JSON.stringify(JSON.parse(json))).toBe(json)
    expect(compile(JSON.parse(json))).toBe(compile(theme))
  })

  it('병합-단독 경로와 base+patch 경로가 같은 CSS를 낸다 — 유래를 뺐는데 결과가 같다', () => {
    const derived = patch({ tokens: { semantic: { primary: '#111111', danger: null } } })
    const { theme: merged } = mergeTheme(BASE, derived)
    expect(compile(merged)).toBe(compile(derived, BASE))
  })

  it('상속 없는 평범한 테마는 영향받지 않는다', () => {
    const back = JSON.parse(JSON.stringify(BASE)) as Theme
    expect(compile(back)).toBe(compile(BASE))
  })

  it('ResolvedTheme은 저장 대상이 아니다 — 직렬화하면 절이 비고 컴파일이 던진다', () => {
    // D2가 "ResolvedTheme이 그 자체로 §4.5의 산출물"이라고 적었던 자리다.
    const { theme } = resolveTheme(BASE)
    const back = JSON.parse(JSON.stringify(theme)) as ResolvedTheme
    for (const section of ['tokens', 'primitives', 'breakpoints', 'components', 'patterns'] as const) {
      expect(Object.keys(back[section] as unknown as object), section).toEqual([])
    }
    expect(() => compileTheme(back)).toThrow()
  })
})
