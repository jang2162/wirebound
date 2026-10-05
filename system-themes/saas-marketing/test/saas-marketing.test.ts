// @vitest-environment jsdom
/**
 * system-saas-marketing — manifest · 뷰의 DOM · `theme.css` 의 성질.
 *
 * **jsdom 값이다.** jsdom 은 `var()` 를 치환하지 않고(계산값이 선언 글자 그대로다) 레이아웃을 하지 않는다 — 그래서 스타일은 «어느
 * 변수를 가리키는가» 로 재고, 폭 · 가운데 · 넘침은 실 Chromium 의 `wb-theme shots`(`report.json` 의 넘침 · 폴백 · 콘솔 오류)가 잰다.
 * 시트의 겹침도 jsdom 은 문서 순서로만 본다(특이도를 안 본다) — 셀렉터가 이기는지는 여기서 못 잰다.
 */
import { cleanup, render } from '@testing-library/react'
import { installCatalog, listComponents, type PageDocument, type WbNode } from '@wirebound/schema'
import { DEFAULT_VIEWS, defaultViewsCss } from '@wirebound/theme-sdk'
import { focusElement, renderDocument } from '@wirebound/renderer'
import { SAAS_MARKETING_THEME, SAAS_MARKETING_THEME_CSS } from '@wirebound/system-theme-saas-marketing'
import { createElement, Fragment } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => installCatalog())
afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

const MANIFEST = SAAS_MARKETING_THEME.manifest
const page = (children: WbNode[]): PageDocument => ({ root: { id: 'root', type: 'Page', props: {}, children } }) as never

/** 기본 CSS → 테마 CSS 차례로 시트를 싣고 문서를 그린다(캔버스 머리의 `base` → `theme` 차례). */
function draw(children: WbNode[]): HTMLElement {
  for (const text of [defaultViewsCss(), SAAS_MARKETING_THEME_CSS]) {
    const style = document.createElement('style')
    style.textContent = text
    document.head.append(style)
  }
  const { container } = render(createElement(Fragment, null, renderDocument(page(children), { theme: SAAS_MARKETING_THEME })))
  return container
}

function node(container: HTMLElement, id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wb-id="${id}"]`)
  if (found === null) throw new Error(`노드 ${id} 가 안 그려졌다`)
  return found
}

/** `theme.css` 를 jsdom 의 CSSOM 으로 읽은 규칙들 — `@media` 안의 것까지 펼친다. */
function styleRules(): CSSStyleRule[] {
  const style = document.createElement('style')
  style.textContent = SAAS_MARKETING_THEME_CSS
  document.head.append(style)
  const out: CSSStyleRule[] = []
  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if ('selectorText' in rule) out.push(rule as CSSStyleRule)
      else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
    }
  }
  walk(style.sheet!.cssRules)
  // 카나리아 — 파서가 아무것도 못 읽으면 아래 성질들이 빈 목록을 재서 초록이다.
  expect(out.length).toBeGreaterThan(50)
  return out
}

/** 옛 테마가 컴포넌트마다 하나 고르던 구조 → 그 구조를 그리는 variant(= `defaultVariant`)와 뷰가 루트에 다는 구조 표지. */
const OLD_STRUCTURE = {
  List: { variant: 'cards', structure: 'cardGrid' },
  Tabs: { variant: 'pill', structure: null },
  Tree: { variant: 'accordion', structure: 'accordion' },
  KeyValue: { variant: 'tiles', structure: 'cardGrid' },
  Media: { variant: 'illustration', structure: 'illustration' },
} as const

describe('system-saas-marketing manifest', () => {
  it('id · 판 · sdk 범위', () => {
    expect(MANIFEST.id).toBe('system-saas-marketing')
    expect(MANIFEST.version).toBe('1.1.0')
    expect(MANIFEST.sdk).toBe('^1.1.0')
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(MANIFEST.components ?? {})) expect(catalog.has(type)).toBe(true)
  })

  it('토큰은 12 ~ 30 개 · 무리와 한국어 label 을 갖는다', () => {
    const items = Object.entries(MANIFEST.tokens.items)
    expect(items.length).toBeGreaterThanOrEqual(12)
    expect(items.length).toBeLessThanOrEqual(30)
    const groups = new Set((MANIFEST.tokens.groups ?? []).map((g) => g.id))
    for (const [key, decl] of items) {
      expect(groups.has(decl.group ?? ''), key).toBe(true)
      expect(decl.label, key).toMatch(/[가-힣]/)
    }
  })

  it('토큰마다 CSS 의 :root 에 같은 이름 · 같은 기본값의 변수가 있다', () => {
    const items = Object.entries(MANIFEST.tokens.items)
    // 카나리아 — 토큰이 없으면 대조할 것이 없어 늘 초록이다.
    expect(items.length).toBeGreaterThan(0)
    for (const [key, decl] of items) {
      expect(SAAS_MARKETING_THEME_CSS).toContain(`--wb-${key.replaceAll('.', '-')}: ${decl.default};`)
    }
  })

  it('옛 구조 선택이 defaultVariant 다', () => {
    for (const [type, old] of Object.entries(OLD_STRUCTURE)) expect(MANIFEST.components?.[type]?.defaultVariant, type).toBe(old.variant)
  })

  /** variant 없는 노드는 `defaultVariant` 로 그려진다 — `default` 를 겨냥한 규칙이 있으면 바탕 규칙과 두 벌이 된다. */
  it('CSS 에 [data-wb-variant="default"] 규칙이 없다', () => {
    expect(SAAS_MARKETING_THEME_CSS).not.toContain('data-wb-variant="default"')
  })
})

describe('system-saas-marketing 뷰', () => {
  it('뷰를 바꾼 컴포넌트는 다섯이고 나머지는 기본 뷰다', () => {
    const replaced = Object.keys(SAAS_MARKETING_THEME.views).filter((type) => SAAS_MARKETING_THEME.views[type] !== DEFAULT_VIEWS[type])
    expect(replaced.sort()).toEqual(['KeyValue', 'List', 'Media', 'Section', 'Tree'])
    expect(Object.keys(DEFAULT_VIEWS).filter((type) => SAAS_MARKETING_THEME.views[type] === undefined)).toEqual([])
  })

  it('Section 은 워시(band) 뒤에 가둔 칼럼(inner)을 두고 · compact 는 data-wb-compact 로 선다', () => {
    const c = draw([
      { id: 's1', type: 'Section', props: {}, children: [{ id: 't', type: 'Text', props: { content: '안' } }] },
      { id: 's2', type: 'Section', props: { compact: true }, variant: 'hero', children: [] },
    ])
    const s1 = node(c, 's1')
    expect(s1.getAttribute('data-wb-structure')).toBe('splitBg')
    expect(Array.from(s1.children).map((el) => el.getAttribute('data-wb-part'))).toEqual(['band', 'inner'])
    expect(s1.querySelector('[data-wb-part="inner"] > [data-wb-id="t"]')).not.toBeNull()
    expect(s1.hasAttribute('data-wb-compact')).toBe(false)
    expect(node(c, 's2').getAttribute('data-wb-compact')).toBe('')
    expect(node(c, 's2').getAttribute('data-wb-variant')).toBe('hero')
  })

  it('List — 카드 셋은 카드 그리드, table 은 기본 뷰의 표다', () => {
    const c = draw(
      ['cards', 'featured', 'compact', 'table'].map((variant) => ({ id: variant, type: 'List', variant, props: { items: 4, pagination: true } })),
    )
    for (const variant of ['cards', 'featured', 'compact']) {
      const el = node(c, variant)
      expect(el.tagName, variant).toBe('DIV')
      expect(el.getAttribute('data-wb-structure')).toBe('cardGrid')
      expect(el.querySelectorAll(':scope > [data-wb-part="item"] > [data-wb-part="media"]').length).toBe(4)
      expect(el.querySelector(':scope > [data-wb-part="pagination"]')).not.toBeNull()
    }
    expect(node(c, 'table').tagName).toBe('TABLE')
    expect(node(c, 'table').getAttribute('data-wb-structure')).toBe('table')
  })

  it('variant 없는 List 는 카드 그리드로 그려진다(옛 선택)', () => {
    const c = draw([{ id: 'l', type: 'List', props: { items: 2 } }])
    expect(node(c, 'l').getAttribute('data-wb-variant')).toBe('cards')
    expect(node(c, 'l').getAttribute('data-wb-structure')).toBe('cardGrid')
  })

  it('Tree — accordion 은 첫 항목만 depth 단계까지 펼치고, indent 는 기본 뷰다', () => {
    const c = draw([
      { id: 'a', type: 'Tree', variant: 'accordion', props: { items: ['가', '나'], depth: 3 } },
      { id: 'i', type: 'Tree', variant: 'indent', props: { items: ['가', '나'], depth: 3 } },
    ])
    const a = node(c, 'a')
    expect(a.getAttribute('data-wb-structure')).toBe('accordion')
    expect(a.querySelectorAll(':scope > [data-wb-part="node"]').length).toBe(2)
    expect(a.querySelectorAll('[data-wb-part="panel"]').length).toBe(2)
    expect(a.querySelector(':scope > [data-wb-part="node"]:nth-child(2) [data-wb-part="panel"]')).toBeNull()
    expect(node(c, 'i').getAttribute('data-wb-structure')).toBe('indent')
    expect(node(c, 'i').querySelector('[data-wb-part="panel"]')).toBeNull()
  })

  it('KeyValue — tiles 는 노드의 열 수를 변수로 나르고, table 은 기본 뷰다', () => {
    const pairs = [{ key: '가동률', value: '99.9%' }, { key: '고객', value: '1,200' }]
    const c = draw([
      { id: 't', type: 'KeyValue', variant: 'tiles', props: { pairs, columns: 3 } },
      { id: 'b', type: 'KeyValue', variant: 'table', props: { pairs, columns: 3 } },
    ])
    const t = node(c, 't')
    expect(t.getAttribute('data-wb-structure')).toBe('cardGrid')
    expect(t.style.getPropertyValue('--wb-node-keyvalue-columns')).toBe('3')
    expect(t.querySelectorAll(':scope > [data-wb-part="row"] > [data-wb-part="value"]').length).toBe(2)
    expect(node(c, 'b').tagName).toBe('TABLE')
  })

  it('Media — illustration 은 틀 가운데 표지를 두고(video 는 재생 표지), image 는 빈 틀이다', () => {
    const c = draw([
      { id: 'i', type: 'Media', variant: 'illustration', props: { ratio: '4/3', caption: '설명' } },
      { id: 'v', type: 'Media', variant: 'illustration', props: { kind: 'video' } },
      { id: 'p', type: 'Media', variant: 'image', props: {} },
    ])
    const i = node(c, 'i')
    expect(i.getAttribute('data-wb-structure')).toBe('illustration')
    expect(i.querySelector<HTMLElement>('[data-wb-part="frame"]')!.style.getPropertyValue('--wb-node-media-ratio')).toBe('4/3')
    expect(i.querySelector('[data-wb-part="frame"] > [data-wb-part="glyph"]')!.textContent).toBe('✎')
    expect(i.querySelector('[data-wb-part="caption"]')!.textContent).toBe('설명')
    expect(node(c, 'v').querySelector('[data-wb-part="glyph"]')!.textContent).toBe('▶')
    expect(node(c, 'p').getAttribute('data-wb-structure')).toBe('image')
    expect(node(c, 'p').querySelector('[data-wb-part="glyph"]')).toBeNull()
  })

  /**
   * 이 테마의 뷰는 `Focus` · `marker` 를 쓰지 않는다 — 노드의 상자가 곧 루트다(섹션은 워시까지가 노드의 폭이다). 뷰가 제 DOM 안에
   * `data-wb-focus` 를 흘리면 외곽선 · 번호가 그 요소로 옮겨 간다.
   */
  it('뷰를 바꾼 다섯의 variant 마다 외곽선 · 마커의 기준 상자는 루트다', () => {
    const children: WbNode[] = []
    for (const type of ['Section', 'List', 'Tree', 'KeyValue', 'Media']) {
      const variants = MANIFEST.components?.[type]?.variants.map((v) => v.id) ?? []
      for (const variant of variants) children.push({ id: `${type}-${variant}`, type, variant, props: {} } as WbNode)
    }
    expect(children.length).toBe(13)
    const c = draw(children)
    for (const child of children) {
      const root = node(c, child.id)
      expect(focusElement(root), child.id).toBe(root)
      expect(root.hasAttribute('data-wb-marker'), child.id).toBe(false)
    }
  })
})

describe('system-saas-marketing theme.css', () => {
  /**
   * **조각 스킨이 중첩 컴포넌트로 새지 않는다.** `EntryForm` 의 제목은 `label` 조각이고 안의 `Field` 라벨도 `label` 조각이다 — 자손
   * 결합자로 쓰면 필드 라벨이 제목 크기(h2)를 받는다. jsdom 은 특이도를 안 보고 문서 순서로 겹치므로 «어느 변수를 받았나» 로 잰다.
   */
  it('조각 스킨이 중첩 컴포넌트로 새지 않는다 — EntryForm 제목 · 동작', () => {
    const c = draw([
      {
        id: 'ef',
        type: 'EntryForm',
        props: { title: '문의하기' },
        children: [
          { id: 'f', type: 'Field', props: { label: '이메일' } },
          { id: 'b', type: 'Button', props: { label: '보내기' } },
        ],
      },
    ])
    const size = (el: Element) => getComputedStyle(el).getPropertyValue('font-size')
    expect(size(node(c, 'ef').querySelector(':scope > [data-wb-part="label"]')!)).toBe('var(--wb-typography-h2-fontSize)')
    expect(size(node(c, 'f').querySelector('[data-wb-part="label"]')!)).toBe('var(--wb-typography-h6-fontSize)')
    // 버튼의 라벨(`label` 조각)은 제 글자 크기를 버튼에서 물려받는다 — 폼 제목의 것을 받지 않는다.
    expect(size(node(c, 'b').querySelector('[data-wb-part="label"]')!)).not.toBe('var(--wb-typography-h2-fontSize)')
    // 폼의 첫 동작만 채운다 — 안에 든 필드의 컨트롤(첫째 아닌 자식)은 제 바탕을 받는다.
    const bg = (el: Element) => getComputedStyle(el).getPropertyValue('background')
    expect(bg(node(c, 'ef').querySelector(':scope > [data-wb-part="actions"] > :first-child')!)).toBe('var(--wb-semantic-primary)')
    expect(bg(node(c, 'f').querySelector('[data-wb-part="control"]')!)).toBe('var(--wb-semantic-canvas)')
  })

  /**
   * **`Section` 의 가둔 칼럼은 가운데 둔다**(옛 `system-section-centered` 의 성질). `inner` 에 `max-width` 를 건 규칙마다 좌우 여백이
   * `auto` 이고, `inner` 의 좌우 여백을 `auto` 밖의 값으로 적는 규칙이 없다 — `@media` 안의 규칙까지. SDK 기본 CSS 의
   * `margin-inline: auto` 는 `contained` 에만 걸려 이 테마의 `splitBg` 에는 안 닿는다. 폭에서 실제로 가운데 오는지는 jsdom 이 못 잰다.
   */
  it('Section 의 inner 는 가둔 칼럼을 가운데 둔다', () => {
    const inner = styleRules().filter((r) => r.selectorText.includes('"Section"') && r.selectorText.includes('[data-wb-part="inner"]'))
    expect(inner.some((r) => r.style.getPropertyValue('max-width') !== '')).toBe(true)
    for (const rule of inner) {
      for (const side of ['margin-left', 'margin-right']) {
        const value = rule.style.getPropertyValue(side)
        if (rule.style.getPropertyValue('max-width') !== '') expect(value, `${rule.selectorText} ${side}`).toBe('auto')
        else expect(['', 'auto'], `${rule.selectorText} ${side}`).toContain(value)
      }
    }
  })

  /**
   * **가리킨 변수는 전부 `:root` 에 있다**(옛 `system-unresolved-literals` 의 성질 — 해석 안 된 이름이 CSS 에 실리면 브라우저가 그
   * 선언을 통째로 버리고 아무 검증도 안 죽는다). 노드 변수(`--wb-node-*`)는 뷰가 나르고 규칙이 기본값을 함께 적는다.
   */
  it('var() 로 가리킨 테마 변수는 전부 :root 에 선언돼 있다', () => {
    const rules = styleRules()
    const root = rules.find((r) => r.selectorText === ':root')!
    const declared = new Set(Array.from(root.style).filter((name) => name.startsWith('--')))
    const missing: string[] = []
    let refs = 0
    for (const rule of rules) {
      for (const name of Array.from(rule.style)) {
        for (const match of rule.style.getPropertyValue(name).matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
          refs += 1
          const [, ref, fallback] = match
          if (ref!.startsWith('--wb-node-')) {
            if (fallback === undefined) missing.push(`${rule.selectorText} ${name}: ${ref} 에 기본값이 없다`)
          } else if (!declared.has(ref!)) missing.push(`${rule.selectorText} ${name}: ${ref}`)
        }
      }
    }
    expect(refs).toBeGreaterThan(100)
    expect(missing).toEqual([])
  })
})
