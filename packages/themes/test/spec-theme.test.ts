import { describe, expect, it } from 'vitest'
// 경로가 어긋나면 여기서 죽는다. 아래 `「테마 규격」을 실제로 읽는다`가 내용까지 확인한다.
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { ThemeSchema } from '../src/spec/theme'

const MINIMAL = { meta: { id: 'acme-portal', name: 'ACME 포털', version: '1.2.0' } }

/**
 * 설계서 「테마 규격」의 트리 블록에서 절 이름을 뽑는다.
 *
 * 「스타일 프로퍼티 화이트리스트」를 읽는 `style.test.ts`와 같은 이유다 — **손으로 옮긴 규격이 그 절을 덮는지 기계가
 * 보게 한다.** 설계에 절이 늘면 아래 대조가 죽는다.
 */
function sectionsInSpec(): string[] {
  const section = designDoc.split('### 6.1 테마 규격')[1] ?? ''
  const block = section.split('```')[1] ?? ''
  return block
    .split('\n')
    .map((line) => /^[├└]──\s+(\S+)/.exec(line.trim())?.[1])
    .filter((name): name is string => name !== undefined)
}

/** zod 객체 스키마가 실제로 선언한 키. 상수를 따로 두면 스키마와 어긋날 수 있어 반사로 읽는다. */
function sectionsInSchema(): string[] {
  return Object.keys((ThemeSchema as unknown as { shape: Record<string, unknown> }).shape)
}

describe('설계서 「테마 규격」 대조', () => {
  it('「테마 규격」을 실제로 읽는다', () => {
    // 파싱이 깨지면 목록이 비고 빈 집합끼리 조용히 통과한다. 첫 절과 마지막 절을 카나리아로 둔다.
    const names = sectionsInSpec()
    expect(names[0]).toBe('meta')
    expect(names.at(-1)).toBe('assets')
  })

  it('ThemeSchema의 절이 「테마 규격」과 정확히 같다', () => {
    expect([...sectionsInSchema()].sort()).toEqual([...sectionsInSpec()].sort())
  })
})

describe('ThemeSchema', () => {
  it('여섯 절을 다 갖춘 문서가 통과한다', () => {
    const parsed = ThemeSchema.safeParse({
      ...MINIMAL,
      tokens: { semantic: { primary: '#2563eb' }, scale: { space: { unit: '4px' } } },
      primitives: { container: { maxWidth: '1200px' }, breakpoints: { md: 768 } },
      components: { List: { structure: 'cardGrid', base: { gap: 'space.6' } } },
      patterns: {
        'hero.split': { name: '히어로', slots: { title: 'text' }, schema: { type: 'Text', slot: 'title' } },
      },
      assets: { icons: 'lucide', placeholder: { style: 'skeleton' } },
    })
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('meta만 있는 문서가 통과한다 — 파생 테마의 모양이다', () => {
    expect(ThemeSchema.safeParse(MINIMAL).success).toBe(true)
    expect(
      ThemeSchema.safeParse({
        meta: { ...MINIMAL.meta, extends: 'system:portal' },
        tokens: { semantic: { primary: '#111111' } },
      }).success,
    ).toBe(true)
  })

  it('meta가 없으면 실패다', () => {
    expect(ThemeSchema.safeParse({ tokens: {} }).success).toBe(false)
    expect(ThemeSchema.safeParse({}).success).toBe(false)
  })

  it('최상위의 오타가 이슈다 — 이 자리가 없으면 막을 곳이 없었다', () => {
    for (const key of ['tokns', 'component', 'pattern', 'asset', 'primitive', 'Meta']) {
      expect(ThemeSchema.safeParse({ ...MINIMAL, [key]: {} }).success, key).toBe(false)
    }
  })

  it('절 안쪽의 규격이 그대로 붙어 있다', () => {
    expect(ThemeSchema.safeParse({ ...MINIMAL, tokens: { colors: {} } }).success).toBe(false)
    expect(ThemeSchema.safeParse({ ...MINIMAL, assets: { icons: 'heroicons' } }).success).toBe(false)
    expect(ThemeSchema.safeParse({ ...MINIMAL, primitives: { rhythm: {} } }).success).toBe(false)
    expect(ThemeSchema.safeParse({ ...MINIMAL, components: { List: { skin: {} } } }).success).toBe(false)
  })

  it('해석하지 않는다 — 없는 토큰을 가리켜도 규격은 통과한다', () => {
    // 토큰 참조를 푸는 것도 카탈로그와 대조하는 것도 resolveTheme의 몫이다.
    const parsed = ThemeSchema.safeParse({
      ...MINIMAL,
      components: { List: { base: { gap: 'space.99' } } },
      primitives: { container: { gutter: 'palette.blue.500' } },
    })
    expect(parsed.success).toBe(true)
  })
})
