import { beforeAll, describe, expect, it } from 'vitest'
import { getComponent, installCatalog, listComponents } from '@wirebound/schema'
import { DOCS_THEME, DOCS_THEME_CSS } from '@wirebound/system-theme-docs'

beforeAll(() => installCatalog())

const manifest = DOCS_THEME.manifest

describe('system-docs manifest', () => {
  it('id · 판 · sdk 범위', () => {
    expect(manifest.id).toBe('system-docs')
    expect(manifest.version).toBe('1.2.0')
    expect(manifest.sdk).toBe('^1.2.0')
  })

  /** 토큰 폼이 수십 칸이 되지 않게 사람이 고칠 만한 것만 낸다 — 나머지는 `theme.css` 의 상수다. */
  it('토큰은 12 ~ 30 개이고, 모두 선언한 무리에 들고 한국어 이름을 갖는다', () => {
    const items = Object.entries(manifest.tokens.items)
    expect(items.length).toBeGreaterThanOrEqual(12)
    expect(items.length).toBeLessThanOrEqual(30)
    const groups = new Set((manifest.tokens.groups ?? []).map((g) => g.id))
    for (const [key, decl] of items) {
      expect(groups.has(decl.group ?? ''), key).toBe(true)
      expect(decl.label, key).toMatch(/[가-힣]/)
    }
  })

  it('토큰마다 CSS 의 :root 에 같은 이름 · 같은 기본값의 변수가 있다', () => {
    for (const [key, decl] of Object.entries(manifest.tokens.items)) {
      expect(DOCS_THEME_CSS, key).toContain(`--wb-${key.replaceAll('.', '-')}: ${decl.default};`)
    }
  })

  it('components 선언은 카탈로그의 이름만 쓰고, 변형이 prop 에서 오는 컴포넌트는 선언하지 않는다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(manifest.components ?? {})) {
      expect(catalog.has(type), type).toBe(true)
      expect(getComponent(type)?.variantFrom, type).toBeUndefined()
    }
  })

  /**
   * 옛 테마가 컴포넌트 타입마다 고른 구조(`git show b2766e8c^:packages/themes/src/system/docs.ts` 의 `components.*.structure`)가
   * `defaultVariant` 다 — variant 를 안 고른 노드는 옛 모습으로 선다.
   */
  it('옛 구조 선택이 defaultVariant 다', () => {
    const defaults = Object.fromEntries(Object.entries(manifest.components ?? {}).map(([type, decl]) => [type, decl.defaultVariant]))
    expect(defaults).toEqual({
      Section: 'default',
      Card: 'default',
      Tabs: 'enclosed',
      EntryForm: 'labelTop',
      List: 'default',
      Tree: 'accordion',
      KeyValue: 'definition',
      Button: 'default',
      Link: 'default',
      Placeholder: 'code',
    })
  })

  /** 옛 구조가 못 싣던 쪽을 같은 문서에 둘 수 있다 — 기본 뷰의 모양이 variant 하나로 남는다. */
  it('옛 선택 밖의 모양도 variant 로 고를 수 있다', () => {
    const ids = (type: string) => manifest.components?.[type]?.variants.map((v) => v.id) ?? []
    expect(ids('Card')).toEqual(expect.arrayContaining(['default', 'featured', 'plain']))
    expect(ids('List')).toEqual(expect.arrayContaining(['default', 'compact', 'table']))
    expect(ids('Tree')).toEqual(expect.arrayContaining(['accordion', 'indent']))
    expect(ids('KeyValue')).toEqual(expect.arrayContaining(['definition', 'table']))
    expect(ids('Tabs')).toEqual(expect.arrayContaining(['enclosed', 'underline']))
    expect(ids('EntryForm')).toEqual(expect.arrayContaining(['labelTop', 'labelLeft']))
    expect(ids('Placeholder')).toEqual(expect.arrayContaining(['code', 'blank']))
  })

  /** 줄 목록 · 정의 목록은 열을 읽지 않는다 — 속성 패널이 그 칸을 감춘다. 표 모양은 읽으므로 감추지 않는다. */
  it('열을 안 읽는 variant 는 columns 를 감춘다', () => {
    const hidden = (type: string, id: string) => manifest.components?.[type]?.variants.find((v) => v.id === id)?.hideProps ?? []
    expect(hidden('List', 'default')).toEqual(['columns'])
    expect(hidden('List', 'compact')).toEqual(['columns'])
    expect(hidden('List', 'table')).toEqual([])
    expect(hidden('KeyValue', 'definition')).toEqual(['columns'])
    expect(hidden('KeyValue', 'table')).toEqual([])
  })
})
