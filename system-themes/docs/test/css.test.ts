// @vitest-environment jsdom
/**
 * system-docs 의 `theme.css` 가 지키는 성질 — 옛 JSON 테마의 케이스(`git show b2766e8c^:packages/themes/test/<이름>.test.ts`)가 재던
 * 것과 옛 머리말이 이 테마의 성격으로 적은 값(읽기 폭 · 서체 셋 · 선으로 가르는 면)을 CSS 에서 잰다.
 *
 * **CSS 는 글자가 아니라 규칙으로 읽는다** — jsdom 의 `<style>` 파서(`sheet.cssRules`)로 셀렉터 · 선언을 나눈다. 줄 머리 정규식으로
 * 읽으면 `@media` 안의 규칙과 여러 줄 선언을 놓친다.
 *
 * **값을 잰다 — 레이아웃이 아니다.** jsdom 은 레이아웃을 하지 않으므로 칼럼이 실제로 가운데 오는지 · 선언이 무효가 되는지는 여기서
 * 못 잰다. 화면은 `wb-theme shots`(실 Chromium) 이 찍는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { NODE_VAR_PREFIX, TREE_INDENT_VAR } from '@wirebound/theme-sdk'
import { DOCS_THEME_CSS } from '@wirebound/system-theme-docs'

interface Rule {
  selector: string
  /** 규칙이 든 `@media` 조건. 최상위면 빈 글자. */
  media: string
  decls: Map<string, string>
}

function parse(css: string): Rule[] {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const out: Rule[] = []
  const walk = (list: CSSRuleList, media: string) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText)
      else if (rule instanceof CSSStyleRule) {
        const decls = new Map<string, string>()
        for (const name of Array.from(rule.style)) decls.set(name, rule.style.getPropertyValue(name).trim())
        out.push({ selector: rule.selectorText, media, decls })
      } else throw new Error(`읽지 않는 규칙: ${rule.cssText.slice(0, 60)}`)
    }
  }
  walk(style.sheet!.cssRules, '')
  style.remove()
  return out
}

let rules: Rule[]
beforeAll(() => {
  rules = parse(DOCS_THEME_CSS)
})

const rootVars = () => rules.find((r) => r.selector === ':root')!.decls
const component = (type: string) => (r: Rule) => r.selector.includes(`[data-wb-component="${type}"]`)
const part = (name: string) => (r: Rule) => r.selector.includes(`[data-wb-part="${name}"]`)

/** 선언 값에서 `var(--wb-…)` 가 부르는 이름들. 노드 변수 · 트리 들여쓰기는 테마가 아니라 뷰가 싣는 것이라 뺀다. */
function referencedVars(value: string): string[] {
  return Array.from(value.matchAll(/var\(\s*(--wb-[A-Za-z0-9_-]+)/g), (m) => m[1]!).filter(
    (name) => !name.startsWith(NODE_VAR_PREFIX) && name !== TREE_INDENT_VAR,
  )
}

describe('옛 성질 — system-section-centered', () => {
  /**
   * 가둔 칼럼을 가운데 둔다. 기본 뷰 CSS 가 `contained` 에 `margin-inline: auto` 를 이미 걸지만, 테마 층이 가로 여백을 다른 값으로
   * 덮으면(반응형 층의 `margin: 0` 한 줄) 그 폭에서 칼럼이 왼쪽에 붙고 아무것도 실패하지 않는다. 그래서 `max-width` 를 거는 규칙과
   * 가로 여백을 덮는 규칙 전부에 `auto` 를 요구한다.
   */
  it('Section inner 에 폭을 걸거나 가로 여백을 덮는 규칙은 전부 auto 다', () => {
    const inner = rules.filter((r) => component('Section')(r) && part('inner')(r))
    const bounded = inner.filter((r) => r.decls.has('max-width'))
    // 양성 대조: 폭을 거는 규칙이 실제로 있다. 없으면 아래 단언은 빈 배열에서 초록이다.
    expect(bounded.length).toBeGreaterThan(0)
    const touching = inner.filter((r) => ['max-width', 'margin-left', 'margin-right'].some((p) => r.decls.has(p)))
    expect(touching.map((r) => [r.media, r.decls.get('margin-left'), r.decls.get('margin-right')])).toEqual(
      touching.map((r) => [r.media, 'auto', 'auto']),
    )
  })
})

describe('옛 성질 — system-unresolved-literals', () => {
  /**
   * 부르는 변수는 전부 `:root` 에 있다. 없는 이름을 부른 선언은 계산 때 무효가 되어 그 속성이 조용히 초기값으로 돌아간다(옛 케이스의
   * «미해석 리터럴» 과 같은 부류 — 브라우저가 말없이 선언을 버린다). 토큰의 이름을 바꾸거나 상수 하나를 지울 때 이 자가 잡는다.
   */
  it('theme.css 가 부르는 --wb-* 변수는 전부 :root 가 정의한다', () => {
    const defined = new Set(rootVars().keys())
    const called = new Set(rules.flatMap((r) => Array.from(r.decls.values()).flatMap(referencedVars)))
    // 양성 대조: 부르는 이름이 실제로 있다.
    expect(called.size).toBeGreaterThan(20)
    expect([...called].filter((name) => !defined.has(name))).toEqual([])
  })

  it('검사기가 부르는 이름을 실제로 뽑고, 노드 변수 · 트리 들여쓰기는 뺀다', () => {
    expect(referencedVars('var(--wb-semantic-text)')).toEqual(['--wb-semantic-text'])
    expect(referencedVars('calc(var(--wb-space-4) * 2) var( --wb-radius-md)')).toEqual(['--wb-space-4', '--wb-radius-md'])
    expect(referencedVars(`var(${NODE_VAR_PREFIX}placeholder-height, 120px)`)).toEqual([])
    expect(referencedVars(`var(${TREE_INDENT_VAR}, 16px)`)).toEqual([])
  })
})

describe('노드 손잡이를 덮지 않는다', () => {
  /**
   * 노드가 정한 값을 나르는 자리 — 코드 블록의 줄 수(`Placeholder` 높이), 스크린숏의 비율(`Media` 틀), 들여쓰기 단계(`Tree` 기본 뷰의
   * 마디). 테마가 같은 속성을 적으면 같은 특이도로 뒤에 와서 노드의 값이 조용히 사라진다.
   */
  it('Placeholder 의 height · Media 틀의 aspect-ratio 를 적지 않는다', () => {
    expect(rules.filter((r) => component('Placeholder')(r) && (r.decls.has('height') || r.decls.has('min-height')))).toEqual([])
    expect(rules.filter((r) => component('Media')(r) && r.decls.has('aspect-ratio'))).toEqual([])
  })

  it('Tree 마디의 왼쪽 여백은 아코디언에만 건다 — 기본 뷰(indent)의 들여쓰기를 안 덮는다', () => {
    const nodePadding = rules.filter(
      (r) => component('Tree')(r) && part('node')(r) && ['padding', 'padding-left', 'padding-inline-start'].some((p) => r.decls.has(p)),
    )
    expect(nodePadding.length).toBeGreaterThan(0)
    for (const r of nodePadding) expect(r.selector).toContain('[data-wb-variant="accordion"]')
  })
})

describe('이 테마의 성격 — 옛 머리말의 «admin 과 갈리는 네 자리»', () => {
  /** 칼럼은 픽셀(720px)로 자르고, 본문의 행 길이는 글자 수(68ch)로 다시 자른다 — 서체를 바꾸면 픽셀 폭이 따라 바뀐다. */
  it('읽기 폭 — 칼럼은 토큰, 본문 행은 글자 수', () => {
    expect(rootVars().get('--wb-container-maxWidth')).toBe('720px')
    const inner = rules.find((r) => r.media === '' && component('Section')(r) && part('inner')(r))!
    expect(inner.decls.get('max-width')).toBe('var(--wb-container-maxWidth)')
    const body = rules.find((r) => r.selector === '[data-wb-component="Text"][data-wb-variant="body"]')!
    expect(body.decls.get('max-width')).toBe('68ch')
  })

  /** 본문은 세리프(오래 읽는 글), 제목 · UI 는 산세리프(훑는 글), 키 · 코드는 모노(열을 맞추는 글). */
  it('서체 셋 — 본문 세리프 · 제목 산세리프 · 코드 모노', () => {
    const family = (selector: string) => rules.find((r) => r.selector === selector)?.decls.get('font-family')
    expect(family('[data-wb-component="Page"]')).toBe('var(--wb-typography-family-sans)')
    expect(family('[data-wb-component="Text"]')).toBe('var(--wb-typography-family-serif)')
    expect(family('[data-wb-component="Text"][data-wb-variant="h2"]')).toBe('var(--wb-typography-family-sans)')
    expect(family('[data-wb-component="KeyValue"] [data-wb-part="key"]')).toBe('var(--wb-typography-family-mono)')
    expect(family('[data-wb-component="Placeholder"][data-wb-variant="code"]')).toBe('var(--wb-typography-family-mono)')
  })

  /** 본문 17px / 1.75 — 관리자 화면(14px / 1.6)보다 크고 성기다. 읽는 화면과 다루는 화면이 갈리는 한 줄이다. */
  it('본문은 크고 행간이 넓다', () => {
    expect(rootVars().get('--wb-typography-body-fontSize')).toBe('17px')
    expect(rootVars().get('--wb-typography-body-lineHeight')).toBe('1.75')
  })

  /** 면을 가르는 것은 그림자가 아니라 선 하나다 — 필드 · 목록 줄 · 정의 목록 줄 · h2 가 아래 선 하나로 선다. */
  it('선 하나로 가른다 — 아래 선만 1px', () => {
    const bottomOnly = (selector: string) => rules.find((r) => r.selector === selector)?.decls.get('border-width')
    expect(bottomOnly('[data-wb-component="Field"] [data-wb-part="control"]')).toBe('0 0 1px')
    expect(bottomOnly('[data-wb-component="List"] [data-wb-part="item"]')).toBe('0 0 1px')
    expect(bottomOnly('[data-wb-component="KeyValue"] [data-wb-part="row"]')).toBe('0 0 1px')
    expect(bottomOnly('[data-wb-component="Text"][data-wb-variant="h2"]')).toBe('0 0 1px')
    expect(rules.filter((r) => r.decls.has('box-shadow'))).toEqual([])
  })
})
