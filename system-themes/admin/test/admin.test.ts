// @vitest-environment jsdom
/**
 * system-admin 의 manifest · CSS 성질. CSS 는 글자로 찾지 않고 jsdom 의 CSSOM 으로 읽어 규칙 · 선언 단위로 잰다 — 주석 · 줄바꿈 · 셀렉터 목록이
 * 글자 찾기를 조용히 비게 한다. jsdom 은 레이아웃을 안 하므로 «화면에서 그렇게 서는가» 는 여기서 못 잰다 — 그것은 `wb-theme shots`
 * 스크린숏으로 본다(`docs/superpowers/plans/2026-09-30-a6-admin-report.md`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'

beforeAll(() => installCatalog())

interface Rule {
  selector: string
  media: string | null
  style: CSSStyleDeclaration
}

/** `theme.css` 의 스타일 규칙 전부(`@media` 안의 것은 그 조건과 함께). */
function rules(): Rule[] {
  const el = document.createElement('style')
  el.textContent = ADMIN_V0_CSS
  document.head.appendChild(el)
  const out: Rule[] = []
  const walk = (list: CSSRuleList, media: string | null) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText ?? rule.media.mediaText)
      else if (rule instanceof CSSStyleRule) out.push({ selector: rule.selectorText, media, style: rule.style })
      else throw new Error(`모르는 규칙: ${rule.cssText.slice(0, 60)}`)
    }
  }
  walk(el.sheet!.cssRules, null)
  el.remove()
  return out
}

/** 규칙의 선언 이름들. jsdom(cssom)의 규칙 스타일은 `item()` 없이 색인으로만 이름을 준다. */
function names(style: CSSStyleDeclaration): string[] {
  return Array.from({ length: style.length }, (_, index) => (style as unknown as Record<number, string>)[index]!)
}

function declarations(): { selector: string; property: string; value: string; priority: string }[] {
  return rules().flatMap((rule) =>
    names(rule.style).map((property) => {
      return {
        selector: rule.selector,
        property,
        value: rule.style.getPropertyValue(property),
        priority: rule.style.getPropertyPriority(property),
      }
    }),
  )
}

const ROOT_VARS = (): Map<string, string> => {
  const root = rules().filter((rule) => rule.selector === ':root' && rule.media === null)
  expect(root).toHaveLength(1)
  const style = root[0]!.style
  return new Map(names(style).map((name) => [name, style.getPropertyValue(name).trim()]))
}

describe('system-admin manifest', () => {
  it('id · 판 · sdk · 이름과 설명은 옛 admin 의 meta 그대로', () => {
    expect(ADMIN_V0.manifest.id).toBe('system-admin')
    expect(ADMIN_V0.manifest.version).toBe('1.2.0')
    expect(ADMIN_V0.manifest.sdk).toBe('^1.2.0')
    expect(ADMIN_V0.manifest.name).toBe('관리자')
    expect(ADMIN_V0.manifest.description).toBe('관리자 화면 기본 테마. 좁은 여백과 표 중심의 밀도를 갖는다.')
  })

  /** 토큰 폼이 수십 칸이 되지 않게 12 ~ 30 — 사람이 고칠 만한 것만. 칸마다 무리와 한국어 이름이 있어야 폼이 묶어 보인다. */
  it('토큰은 12 ~ 30 개 · 칸마다 선언한 무리와 한국어 이름', () => {
    const items = Object.entries(ADMIN_V0.manifest.tokens.items)
    expect(items.length).toBeGreaterThanOrEqual(12)
    expect(items.length).toBeLessThanOrEqual(30)
    const groups = new Set((ADMIN_V0.manifest.tokens.groups ?? []).map((group) => group.id))
    for (const [key, decl] of items) {
      expect(groups.has(decl.group ?? ''), key).toBe(true)
      expect(decl.label, key).toMatch(/[가-힣]/)
    }
  })

  it('토큰마다 CSS 의 :root 에 같은 이름 · 같은 기본값의 변수가 있다', () => {
    const vars = ROOT_VARS()
    for (const [key, decl] of Object.entries(ADMIN_V0.manifest.tokens.items)) {
      expect(vars.get(`--wb-${key.replaceAll('.', '-')}`), key).toBe(String(decl.default))
    }
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(ADMIN_V0.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })

  /** `0.1.0` 에 고정된 프로젝트가 판을 올릴 때 없어지는 variant 가 없다 — 그 판이 선언한 id 들이다. */
  it('0.1.0 이 선언한 variant 를 전부 그대로 선언한다', () => {
    const declared = Object.fromEntries(
      Object.entries(ADMIN_V0.manifest.components ?? {}).map(([type, decl]) => [type, decl.variants.map((v) => v.id)]),
    )
    expect(declared).toEqual({
      Section: ['default', 'hero', 'muted'],
      Card: ['default', 'featured'],
      List: ['default', 'featured', 'compact'],
      Button: ['default', 'primary', 'secondary', 'danger', 'ghost'],
      Link: ['default', 'muted'],
    })
    for (const decl of Object.values(ADMIN_V0.manifest.components ?? {})) expect(decl.defaultVariant).toBe('default')
  })
})

describe('system-admin CSS', () => {
  /** variant 없는 노드는 `defaultVariant`(`default`)로 그려진다 — 그 값을 겨냥한 규칙이 있으면 variant 없는 노드의 모습이 바뀐다. */
  it('[data-wb-variant="default"] 규칙이 없다', () => {
    expect(rules().filter((rule) => rule.selector.includes('data-wb-variant="default"'))).toEqual([])
  })

  /** 선언한 variant 는 속성 패널에 칸으로 선다 — 규칙이 없으면 골라도 아무것도 안 바뀌는 칸이다. `Button` 의 `primary` 는 바탕 그대로가 뜻이다. */
  it('default · Button primary 밖의 선언한 variant 마다 그 variant 를 겨냥한 규칙이 있다', () => {
    const selectors = rules().map((rule) => rule.selector)
    const missing: string[] = []
    for (const [type, decl] of Object.entries(ADMIN_V0.manifest.components ?? {})) {
      for (const { id } of decl.variants) {
        if (id === 'default' || (type === 'Button' && id === 'primary')) continue
        const target = `[data-wb-component="${type}"][data-wb-variant="${id}"]`
        if (!selectors.some((selector) => selector.includes(target))) missing.push(`${type}/${id}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('!important 가 없다', () => {
    expect(declarations().filter((d) => d.priority !== '')).toEqual([])
  })

  /**
   * 참조한 변수는 전부 `:root` 에 있다. 없는 변수를 가리킨 선언은 브라우저에서 조용히 무효가 된다(오류 없이 상속값 · 초기값으로 떨어진다).
   * SDK 가 노드마다 나르는 변수(`--wb-node-*`)는 테마가 정의하지 않는다.
   */
  it('var() 가 가리키는 --wb-* 는 전부 :root 에 정의돼 있다', () => {
    const vars = ROOT_VARS()
    const referenced = new Set<string>()
    for (const d of declarations()) for (const match of d.value.matchAll(/var\(\s*(--wb-[A-Za-z0-9_-]+)/g)) referenced.add(match[1]!)
    expect(referenced.size).toBeGreaterThan(10)
    expect([...referenced].filter((name) => !name.startsWith('--wb-node-') && !vars.has(name))).toEqual([])
  })

  /** 점 찍힌 맨 이름(`semantic.primary`)이 값에 남으면 브라우저가 그 선언을 버린다 — 토큰은 `var(--wb-…)` 로만 가리킨다. */
  it('선언 값에 var() 밖의 점 찍힌 맨 이름이 없다', () => {
    const bare = /(?<![-\w.(])([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)(?![-\w.])/g
    const hits = declarations().flatMap((d) =>
      [...d.value.replace(/"[^"]*"/g, '').matchAll(bare)].map((m) => `${d.selector} { ${d.property}: ${d.value} }`),
    )
    expect(hits).toEqual([])
  })

  /** 관리자 화면은 칼럼 폭을 가두지 않는다(fluid) — 표 · 폼이 화면 폭을 다 쓴다. */
  it('칼럼 폭은 가두지 않는다 — --wb-container-maxWidth 가 none', () => {
    expect(ROOT_VARS().get('--wb-container-maxWidth')).toBe('none')
  })

  /**
   * `max-width` 를 거는 규칙은 가로 여백을 `auto` 로 둔다 — 칼럼을 가두는 값으로 바꾸면 가운데 선다(`Section` 의 «화면 전체 폭 배경 + 가운데 정렬된
   * 콘텐츠»). 이 테마는 폭을 안 가둬 `auto` 가 0 이지만, `:root` 의 폭 하나만 바꾸는 사람이 가운데 정렬을 그대로 얻는다.
   */
  it('max-width 를 거는 규칙마다 margin-left · margin-right 가 auto', () => {
    const bounded = rules().filter((rule) => rule.style.getPropertyValue('max-width') !== '')
    expect(bounded.length).toBeGreaterThan(0)
    expect(
      bounded.map((rule) => [rule.selector, rule.style.getPropertyValue('margin-left'), rule.style.getPropertyValue('margin-right')]),
    ).toEqual(bounded.map((rule) => [rule.selector, 'auto', 'auto']))
  })

  /** 간격은 전부 `space.unit` 의 배수다 — 토큰 하나(«간격 단위»)로 밀도가 바뀐다. 상수로 적은 칸이 하나라도 있으면 그 칸만 안 따라온다. */
  it('--wb-space-N 은 전부 --wb-space-unit × N', () => {
    const spaces = [...ROOT_VARS()].filter(([name]) => /^--wb-space-\d+$/.test(name))
    expect(spaces.length).toBeGreaterThan(4)
    for (const [name, value] of spaces)
      expect(value.replace(/\s+/g, ' '), name).toBe(`calc(var(--wb-space-unit) * ${name.slice('--wb-space-'.length)})`)
  })

  /** 세로 구분선은 높이가 정해지지 않은 부모 안에서도 보인다 — `min-height` 를 백분율로 두면 그 부모에서 0 이 된다. */
  it('세로 Divider 의 최소 높이는 백분율이 아니다', () => {
    const vertical = rules().filter((rule) => rule.selector === '[data-wb-component="Divider"][data-wb-variant="vertical"]')
    expect(vertical).toHaveLength(1)
    const minHeight = vertical[0]!.style.getPropertyValue('min-height').trim()
    expect(minHeight).not.toBe('')
    expect(minHeight).not.toMatch(/%/)
  })

  /** `Text` 의 variant 는 `role` prop 에서 온다(카탈로그의 `variantFrom`) — 역할마다 타이포 스케일의 제 칸을 건다. */
  it('Text 의 역할마다 제 타이포 스케일을 건다', () => {
    const roles = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption']
    const byRole = Object.fromEntries(
      roles.map((role) => {
        const rule = rules().find((r) => r.selector === `[data-wb-component="Text"][data-wb-variant="${role}"]`)
        return [role, rule?.style.getPropertyValue('font-size').trim()]
      }),
    )
    expect(byRole).toEqual(Object.fromEntries(roles.map((role) => [role, `var(--wb-typography-${role}-fontSize)`])))
  })

  /**
   * 밑줄 탭 — 고른 탭(`aria-selected`)만 주색 밑줄을 받는다. 폼의 조각 규칙은 직계로 잡는다 — 자손으로 잡으면 안의 `Field` 의 `label` 조각까지
   * 받아 필드 라벨마다 제목의 밑줄이 선다.
   */
  it('고른 탭만 주색 밑줄 · 등록 폼 제목 규칙은 필드 라벨에 안 닿는다', () => {
    const selected = rules().find((rule) => rule.selector === '[data-wb-component="Tabs"] [data-wb-part="tab"][aria-selected="true"]')
    expect(selected?.style.getPropertyValue('border-bottom-color').trim()).toBe('var(--wb-semantic-primary)')

    const form = document.createElement('form')
    form.setAttribute('data-wb-component', 'EntryForm')
    form.innerHTML =
      '<div data-wb-part="label">가입</div><div data-wb-part="row"><div data-wb-component="Field"><label data-wb-part="label">이름</label></div></div>'
    const titleRules = rules().filter(
      (rule) => rule.style.getPropertyValue('border-bottom') !== '' || rule.style.getPropertyValue('border-bottom-style') !== '',
    )
    const fieldLabel = form.querySelector('label')!
    const title = form.firstElementChild!
    expect(titleRules.filter((rule) => rule.media === null && title.matches(rule.selector)).length).toBeGreaterThan(0)
    expect(titleRules.filter((rule) => fieldLabel.matches(rule.selector)).map((rule) => rule.selector)).toEqual([])
  })
})
