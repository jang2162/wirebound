// @vitest-environment jsdom
/**
 * system-commerce — 선언 · 옛 테마의 성질 · variant 마다 뷰의 DOM · 마커 자리 · CSS 의 셀렉터 규칙.
 *
 * **CSS 는 jsdom 의 CSSOM 으로 읽는다**(`<style>` 의 `sheet.cssRules`) — 글자로 규칙을 가르면 `@media` 안의 규칙 · 여러 셀렉터를 손으로
 * 쓴 파서가 읽게 된다. jsdom 은 레이아웃 · `var()` 계산을 안 하므로 **값과 셀렉터만** 잰다 — 화면에서 가운데 오는지 · 넘치지 않는지는
 * `wb-theme shots`(실 Chromium)의 몫이다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents, validatePage, type PageDocument, type WbNode } from '@wirebound/schema'
import { focusElement, renderDocument } from '@wirebound/renderer'
import { expandPattern, type ThemePattern } from '@wirebound/themes'
import { COMMERCE_THEME, COMMERCE_THEME_CSS } from '@wirebound/system-theme-commerce'

beforeAll(() => installCatalog())
afterEach(() => cleanup())

const manifest = COMMERCE_THEME.manifest

function page(children: WbNode[]): PageDocument {
  return { version: 1, root: { id: 'root', type: 'Page', props: {}, children } } as PageDocument
}

function draw(children: WbNode[]): HTMLElement {
  return render(<>{renderDocument(page(children), { theme: COMMERCE_THEME })}</>).container
}

function node(container: HTMLElement, id: string): Element {
  const found = container.querySelector(`[data-wb-id="${id}"]`)
  if (found === null) throw new Error(`노드 ${id} 가 그려지지 않았다`)
  return found
}

/** 테마 시트의 스타일 규칙 전부(`@media` 안 포함) — `where` 는 어느 `@media` 안인지. */
function styleRules(): { selector: string; style: CSSStyleDeclaration; where: string }[] {
  const style = document.createElement('style')
  style.textContent = COMMERCE_THEME_CSS
  document.head.append(style)
  const out: { selector: string; style: CSSStyleDeclaration; where: string }[] = []
  const walk = (rules: CSSRuleList, where: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) out.push({ selector: rule.selectorText, style: rule.style, where })
      else if (rule instanceof CSSMediaRule) walk(rule.cssRules, `@media ${rule.conditionText ?? rule.media.mediaText}`)
    }
  }
  walk(style.sheet!.cssRules, '')
  style.remove()
  return out
}

function declarations(style: CSSStyleDeclaration): [string, string][] {
  return Array.from({ length: style.length }, (_, i) => {
    // jsdom 의 CSSOM(rrweb-cssom)은 `item()` 이 없고 색인으로 이름을 준다.
    const name = (style as unknown as Record<number, string>)[i]!
    return [name, style.getPropertyValue(name)]
  })
}

describe('system-commerce 선언', () => {
  it('id · 판 · sdk 범위 · 옛 meta 의 이름', () => {
    expect(manifest.id).toBe('system-commerce')
    expect(manifest.version).toBe('1.1.0')
    expect(manifest.sdk).toBe('^1.1.0')
    expect(manifest.name).toBe('커머스')
  })

  it('components 선언은 카탈로그의 이름만 쓴다 · variantFrom 컴포넌트는 선언하지 않는다', () => {
    const catalog = new Map(listComponents().map((d) => [d.type, d]))
    for (const type of Object.keys(manifest.components ?? {})) {
      expect(catalog.has(type), type).toBe(true)
      expect(catalog.get(type)!.variantFrom, type).toBeUndefined()
    }
  })

  /** D4 — 옛 테마가 컴포넌트마다 고른 구조가 `defaultVariant` 다. variant 없는 노드가 옛 모습으로 그려진다. */
  it('옛 구조 선택이 defaultVariant 다', () => {
    const defaults = Object.fromEntries(Object.entries(manifest.components ?? {}).map(([type, decl]) => [type, decl.defaultVariant]))
    expect(defaults).toMatchObject({
      Card: 'mediaTop',
      Tabs: 'pill',
      List: 'mediaList',
      Tree: 'accordion',
      KeyValue: 'cardGrid',
      SearchForm: 'collapsible',
    })
  })

  it('토큰은 12 ~ 30 개 · 무리와 한국어 label 을 갖는다', () => {
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
      expect(COMMERCE_THEME_CSS).toContain(`--wb-${key.replaceAll('.', '-')}: ${decl.default};`)
    }
  })
})

/** 옛 `system-section-centered` — 가둔 칼럼을 가운데 둔다. 폭이 유한(1200px)한 테마라 빠뜨리면 넓은 화면에서 칼럼이 왼쪽에 붙는다. */
describe('옛 성질 — Section 의 가둔 칼럼', () => {
  it('inner 에 max-width 를 거는 규칙마다 margin 좌우가 auto 고, inner 의 margin 좌우를 다른 값으로 덮는 규칙이 없다', () => {
    const inner = styleRules().filter((r) => r.selector.includes('"Section"') && r.selector.includes('[data-wb-part="inner"]'))
    const bounded = inner.filter((r) => r.style.getPropertyValue('max-width') !== '')
    // 양성 대조 — 없으면 아래 단언이 빈 배열에서 초록이다.
    expect(bounded.length).toBeGreaterThan(0)
    for (const r of bounded) expect([r.style.getPropertyValue('margin-left'), r.style.getPropertyValue('margin-right')], r.selector).toEqual(['auto', 'auto'])
    const margins = inner.flatMap((r) =>
      ['margin-left', 'margin-right', 'margin'].map((p) => r.style.getPropertyValue(p)).filter((v) => v !== '' && v !== 'auto').map((v) => `${r.where} ${r.selector}: ${v}`),
    )
    expect(margins).toEqual([])
  })
})

/**
 * 옛 `system-unresolved-literals` — 값이 참조로 안 풀린 점 찍힌 이름(`container.maxWidth`)을 실으면 브라우저가 그 선언을 통째로 버린다.
 * 이제 참조는 `var(--wb-…)` 라 같은 부류가 **정의 안 된 변수**로 온다 — 둘 다 잰다.
 */
describe('옛 성질 — 미해석 리터럴', () => {
  const BARE_DOTTED = /(?<![-\w.(])([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)(?![-\w.])/g
  const bareDotted = (value: string) => [...value.replace(/url\([^)]*\)/gi, 'URL').matchAll(BARE_DOTTED)].map((m) => m[1])

  it('검사기가 미해석 꼴을 잡고 해석된 것은 안 잡는다', () => {
    expect(bareDotted('container.maxWidth')).toEqual(['container.maxWidth'])
    expect(bareDotted('var(--wb-space-6)')).toEqual([])
    expect(bareDotted('0.5')).toEqual([])
    expect(bareDotted('1 / 1')).toEqual([])
  })

  it('선언 값에 점 찍힌 맨 이름이 없다', () => {
    const rules = styleRules()
    expect(rules.length).toBeGreaterThan(50)
    const hits = rules.flatMap((r) => declarations(r.style).flatMap(([p, v]) => bareDotted(v).map((h) => `${r.selector} ${p}: ${h}`)))
    expect(hits).toEqual([])
  })

  /** 노드 변수(`--wb-node-*`)는 뷰가 인라인으로 싣고 규칙이 기본값을 함께 적는다 — `:root` 가 정의할 것이 아니다. */
  it('규칙이 읽는 --wb- 변수는 :root 가 정의한다', () => {
    const rules = styleRules()
    const root = rules.find((r) => r.selector === ':root')!
    const defined = new Set(declarations(root.style).map(([p]) => p))
    expect(defined.size).toBeGreaterThan(20)
    const read = rules.flatMap((r) => declarations(r.style).flatMap(([, v]) => [...v.matchAll(/var\(\s*(--wb-[\w-]+)/g)].map((m) => m[1]!)))
    expect(read.length).toBeGreaterThan(100)
    expect([...new Set(read)].filter((name) => !name.startsWith('--wb-node-') && !defined.has(name))).toEqual([])
  })
})

/** 옛 `pattern-expand` 의 commerce 몫 — 패턴을 전개하면 검증을 지나는 문서가 되고 슬롯이 전부 매핑된다. */
describe('옛 성질 — content.product 패턴', () => {
  it('전개하면 validatePage 를 지나고 슬롯이 트리 순서로 매핑된다', () => {
    const pattern = manifest.patterns!['content.product'] as ThemePattern
    const { expanded, issues } = expandPattern(pattern)
    expect(issues).toEqual([])
    expect([...expanded!.slots.keys()]).toEqual(['image', 'title', 'price', 'cart'])
    expect(validatePage(page(expanded!.nodes as WbNode[]))).toEqual([])
  })
})

/** variant 마다 그 뷰의 DOM 표지 — 뷰가 고른 구조(`data-wb-structure`)와 그 구조만 갖는 조각. */
describe('뷰 — variant 마다 DOM', () => {
  it('Card: mediaTop · featured 는 이미지 자리를 머리에 · plain 은 기본 뷰', () => {
    const c = draw([
      { id: 'a', type: 'Card', props: { title: '상품', subtitle: '₩9,900' } },
      { id: 'b', type: 'Card', variant: 'featured', props: { title: '상품' } },
      { id: 'c', type: 'Card', variant: 'plain', props: { title: '공지' } },
    ])
    for (const id of ['a', 'b']) {
      expect(node(c, id).getAttribute('data-wb-structure')).toBe('mediaTop')
      expect(node(c, id).firstElementChild!.getAttribute('data-wb-part')).toBe('media')
    }
    expect(node(c, 'a').getAttribute('data-wb-variant')).toBe('mediaTop')
    expect(node(c, 'c').getAttribute('data-wb-structure')).toBe('plain')
    expect(node(c, 'c').querySelector('[data-wb-part="media"]')).toBeNull()
  })

  it('List: 미디어 줄 셋은 썸네일 옆 body(이름 · 가격) · cardGrid 는 칸마다 이미지 자리', () => {
    const c = draw([
      { id: 'a', type: 'List', props: { items: 2 } },
      { id: 'b', type: 'List', variant: 'compact', props: { items: 2 } },
      { id: 'd', type: 'List', variant: 'featured', props: { items: 2 } },
      { id: 'g', type: 'List', variant: 'cardGrid', props: { items: 3, pagination: false } },
    ])
    for (const id of ['a', 'b', 'd']) {
      const list = node(c, id)
      expect(list.tagName).toBe('UL')
      expect(list.getAttribute('data-wb-structure')).toBe('mediaList')
      const item = list.querySelector('[data-wb-part="item"]')!
      expect(Array.from(item.children).map((e) => e.getAttribute('data-wb-part'))).toEqual(['media', 'body'])
      expect(Array.from(item.children[1]!.children).map((e) => e.getAttribute('data-wb-part'))).toEqual(['title', 'meta'])
    }
    const grid = node(c, 'g')
    expect(grid.getAttribute('data-wb-structure')).toBe('cardGrid')
    expect(grid.querySelectorAll('[data-wb-part="item"] > [data-wb-part="media"]')).toHaveLength(3)
    expect(grid.querySelector('[data-wb-part="pagination"]')).toBeNull()
  })

  it('Tree: accordion 은 첫 마디만 펴 panel 로 중첩 · indent 는 기본 뷰', () => {
    const c = draw([
      { id: 'a', type: 'Tree', props: { items: ['의류', '신발'], depth: 3 } },
      { id: 'b', type: 'Tree', variant: 'indent', props: { items: ['의류', '신발'], depth: 3 } },
    ])
    const accordion = node(c, 'a')
    expect(accordion.getAttribute('data-wb-structure')).toBe('accordion')
    expect(accordion.querySelectorAll('[data-wb-part="panel"]')).toHaveLength(2)
    expect(accordion.children[0]!.querySelector('[data-wb-part="panel"]')).not.toBeNull()
    expect(accordion.children[1]!.querySelector('[data-wb-part="panel"]')).toBeNull()
    expect(node(c, 'b').getAttribute('data-wb-structure')).toBe('indent')
    expect(node(c, 'b').querySelector('[data-wb-part="panel"]')).toBeNull()
  })

  it('KeyValue: cardGrid 는 쌍마다 상자 · 열 수를 노드 변수로 싣는다 · table 은 기본 뷰', () => {
    const pairs = [{ key: '소재', value: '면' }, { key: '원산지', value: '한국' }]
    const c = draw([
      { id: 'a', type: 'KeyValue', props: { pairs, columns: 3 } },
      { id: 'b', type: 'KeyValue', variant: 'table', props: { pairs } },
    ])
    const grid = node(c, 'a') as HTMLElement
    expect(grid.getAttribute('data-wb-structure')).toBe('cardGrid')
    expect(grid.style.getPropertyValue('--wb-node-keyvalue-columns')).toBe('3')
    expect(grid.querySelectorAll(':scope > [data-wb-part="row"]')).toHaveLength(2)
    expect(node(c, 'b').tagName).toBe('TABLE')
  })

  it('SearchForm: collapsible 은 toggle 을 내고 접히면 자식이 DOM 에서 빠진다 · inline 은 기본 뷰(접히면 같은 꼴)', () => {
    const field: WbNode = { id: 'f', type: 'Field', props: { label: '검색어' } }
    const c = draw([
      { id: 'a', type: 'SearchForm', props: {}, children: [field] },
      { id: 'b', type: 'SearchForm', props: { collapsed: true }, children: [{ ...field, id: 'f2' }] },
      { id: 'c', type: 'SearchForm', variant: 'inline', props: { collapsed: true }, children: [{ ...field, id: 'f3' }] },
    ])
    expect(Array.from(node(c, 'a').children).map((e) => e.getAttribute('data-wb-part'))).toEqual(['toggle', 'fields', 'actions'])
    expect(node(c, 'a').querySelector('[data-wb-id="f"]')).not.toBeNull()
    expect(Array.from(node(c, 'b').children).map((e) => e.getAttribute('data-wb-part'))).toEqual(['toggle'])
    expect(c.querySelector('[data-wb-id="f2"]')).toBeNull()
    expect(node(c, 'c').getAttribute('data-wb-structure')).toBe('inline')
    expect(Array.from(node(c, 'c').children).map((e) => e.getAttribute('data-wb-part'))).toEqual(['toggle'])
    expect(c.querySelector('[data-wb-id="f3"]')).toBeNull()
  })
})

/**
 * **마커 · 초점 자리.** 이 테마의 뷰는 `Focus` 를 쓰지 않는다 — 루트가 곧 노드의 상자다(감싸는 틀 · 머리 장식이 없다). 그래서 선택
 * 외곽선은 루트, 마커는 루트의 `top-start` 다. 자식 노드를 담는 뷰에서 **자식의 초점이 부모의 것으로 읽히지 않는지**도 본다.
 */
describe('뷰 — 마커 · 초점', () => {
  const VIEW_TYPES = ['Card', 'List', 'Tree', 'KeyValue', 'SearchForm']

  it.each(VIEW_TYPES)('%s: 선언한 variant 마다 초점은 루트 · 마커 자리 속성이 없다(top-start)', (type) => {
    const variants = manifest.components![type]!.variants.map((v) => v.id)
    const c = draw(variants.map((variant, i) => ({ id: `n${i}`, type, variant, props: {}, children: type === 'Card' || type === 'SearchForm' ? [] : undefined }) as WbNode))
    for (let i = 0; i < variants.length; i++) {
      const root = node(c, `n${i}`)
      expect(focusElement(root), `${type}/${variants[i]}`).toBe(root)
      expect(root.hasAttribute('data-wb-marker')).toBe(false)
    }
  })

  it('카드 안 자식의 초점은 카드의 것이 아니다', () => {
    const c = draw([{ id: 'card', type: 'Card', props: { title: '상품' }, children: [{ id: 'kv', type: 'KeyValue', props: {} }] }])
    const card = node(c, 'card')
    node(c, 'kv').setAttribute('data-wb-focus', '')
    expect(focusElement(card)).toBe(card)
  })
})

/**
 * **자식을 담는 컴포넌트의 조각 규칙은 안에 넣은 노드의 같은 이름 조각을 칠하지 않는다**(`theme.css` 머리말 «셀렉터 두 규칙»). 옛 테마는
 * 자손 결합자라 카드의 `title` · `media` 규칙이 카드 안 목록의 조각까지 받았고, 시트 순서가 그것을 가렸다.
 */
describe('CSS — 컨테이너 조각이 중첩 노드로 새지 않는다', () => {
  function matching(el: Element): string[] {
    return styleRules().flatMap((r) => r.selector.split(',').map((s) => s.trim()).filter((s) => el.matches(s)))
  }

  it('Card 안 List 의 title · media · body 는 Card 의 규칙을 받지 않는다', () => {
    const c = draw([{ id: 'card', type: 'Card', props: { title: '묶음' }, children: [{ id: 'list', type: 'List', props: { items: 1 } }] }])
    const list = node(c, 'list')
    const parts = ['title', 'media', 'body'].map((p) => list.querySelector(`[data-wb-part="${p}"]`)!)
    for (const part of parts) {
      const hits = matching(part)
      // 양성 대조 — List 의 규칙은 받는다.
      expect(hits.some((s) => s.includes('"List"'))).toBe(true)
      expect(hits.filter((s) => s.includes('"Card"'))).toEqual([])
    }
    // 카드 제 조각은 받는다 — 자식 결합자가 제 조각까지 막지 않았다.
    expect(matching(node(c, 'card').querySelector('[data-wb-part="title"]')!).some((s) => s.includes('"Card"'))).toBe(true)
  })

  it('EntryForm 안 Field 의 label 은 EntryForm 의 label 규칙을 받지 않는다', () => {
    const c = draw([{ id: 'ef', type: 'EntryForm', props: { title: '주문서' }, children: [{ id: 'f', type: 'Field', props: { label: '받는 분' } }] }])
    const hits = matching(node(c, 'f').querySelector('[data-wb-part="label"]')!)
    expect(hits.some((s) => s.includes('"Field"'))).toBe(true)
    expect(hits.filter((s) => s.includes('"EntryForm"'))).toEqual([])
    expect(matching(node(c, 'ef').querySelector(':scope > [data-wb-part="label"]')!).some((s) => s.includes('"EntryForm"'))).toBe(true)
  })

  it('variant 없는 노드를 겨냥한 [data-wb-variant="default"] 규칙이 없다', () => {
    expect(COMMERCE_THEME_CSS).not.toContain('data-wb-variant="default"')
  })
})
