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

/** 셀렉터가 글자 그대로 `selector` 인 규칙 하나(`@media` 밖). 없거나 둘이면 죽는다 — 같은 셀렉터의 규칙이 갈리면 어느 쪽을 재는지 모른다. */
function ruleOf(selector: string): CSSStyleDeclaration {
  const found = rules().filter((rule) => rule.media === null && rule.selector === selector)
  expect(
    found.map((rule) => rule.selector),
    selector,
  ).toHaveLength(1)
  return found[0]!.style
}

/** `:root` 의 변수 하나를 px 로 푼다 — `space.unit` 의 배수(`calc(var(--wb-space-unit) * N)`)거나 길이 글자다. */
function rootPx(name: string): number {
  const vars = ROOT_VARS()
  const value = vars.get(name) ?? ''
  const unit = Number.parseFloat(vars.get('--wb-space-unit') ?? '')
  const scaled = /^calc\(var\(--wb-space-unit\) \* ([0-9.]+)\)$/.exec(value.replace(/\s+/g, ' '))
  return scaled ? unit * Number(scaled[1]) : Number.parseFloat(value)
}

/**
 * 요소에 맞는 규칙(`@media` 밖)의 셀렉터들. jsdom 의 셀렉터 엔진이 못 읽는 셀렉터(가상 요소 등)는 건너뛴다 — 건너뛴 수가 전체의 절반을 넘으면
 * 아무것도 안 잰 것이라 죽는다.
 */
function matching(el: Element): string[] {
  const all = rules().filter((rule) => rule.media === null)
  let skipped = 0
  const hit = all.filter((rule) => {
    try {
      return el.matches(rule.selector)
    } catch {
      skipped += 1
      return false
    }
  })
  expect(skipped).toBeLessThan(all.length / 2)
  return hit.map((rule) => rule.selector)
}

/** 테스트용 DOM 한 그루 — 뿌리를 문서에 붙였다 뗀다(`:only-child` · `:first-child` 가 부모를 본다). */
function tree<T>(html: string, read: (root: HTMLElement) => T): T {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  try {
    return read(root)
  } finally {
    root.remove()
  }
}

describe('system-admin manifest', () => {
  it('id · 판 · sdk · 이름 · 설명', () => {
    expect(ADMIN_V0.manifest.id).toBe('system-admin')
    expect(ADMIN_V0.manifest.version).toBe('2.0.0')
    expect(ADMIN_V0.manifest.sdk).toBe('^1.8.0')
    expect(ADMIN_V0.manifest.name).toBe('기본테마')
    expect(ADMIN_V0.manifest.description).toBe('관리자 화면 기본 테마. 회색 선의 표 격자와 파란 주색을 쓴다.')
  })

  /**
   * 프로젝트가 덮은 토큰은 키로 저장된다 — `1.8.0` 에 고정된 프로젝트가 판을 올릴 때 그 판의 키가 전부 있어야 덮은 값이 이어진다. 키를 걷거나
   * 이름을 바꾸면 그 프로젝트의 덮은 값이 말없이 사라진다.
   */
  it('1.8.0 의 토큰 키를 전부 선언한다', () => {
    const V1_8_0 = [
      'semantic.primary',
      'semantic.primarySoft',
      'semantic.surface',
      'semantic.canvas',
      'semantic.border',
      'semantic.borderStrong',
      'semantic.text',
      'semantic.textMuted',
      'semantic.danger',
      'radius.sm',
      'radius.md',
      'radius.lg',
      'shadow.md',
      'font.body',
      'typography.body.fontSize',
      'space.unit',
    ]
    const declared = new Set(Object.keys(ADMIN_V0.manifest.tokens.items))
    expect(V1_8_0.filter((key) => !declared.has(key))).toEqual([])
  })

  /** 설정 화면의 색 칸은 소문자 `#rrggbb` 로 보낸다 — 기본값이 다른 꼴이면 «기본값과 같은가» 가 글자로 안 맞아 안 덮은 칸이 덮은 칸으로 읽힌다. */
  it('색 토큰 기본값은 소문자 #rrggbb', () => {
    const colors = Object.entries(ADMIN_V0.manifest.tokens.items).filter(([, decl]) => decl.type === 'color')
    expect(colors.length).toBeGreaterThan(8)
    expect(colors.filter(([, decl]) => !/^#[0-9a-f]{6}$/.test(String(decl.default))).map(([key]) => key)).toEqual([])
  })

  /** 글꼴 파일은 싣지 않는다 — Pretendard 가 없는 기기는 뒤의 시스템 한글 서체로 그린다. 총칭 서체로 끝나지 않으면 그 뒤가 브라우저 기본(명조)이다. */
  it('서체는 Pretendard 로 시작하고 sans-serif 로 끝난다 · 시스템 한글 서체를 품는다', () => {
    const families = String(ADMIN_V0.manifest.tokens.items['font.body']!.default)
      .split(',')
      .map((family) => family.trim())
    expect(families[0]).toBe('"Pretendard"')
    expect(families.at(-1)).toBe('sans-serif')
    expect(families).toContain('"Malgun Gothic"')
    expect(families).toContain('"Apple SD Gothic Neo"')
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

  /**
   * `0.1.0` 에 고정된 프로젝트가 판을 올릴 때 없어지는 variant 가 없다 — 그 판이 선언한 id 들에 `1.3.0` 의 카드 `borderless` 와 `1.4.0` 의 선택지
   * 묶음 둘(세그먼트 · 체크 칩)을 더한 것이다. 옛 `List` 의 셋은 `1.7.0` 부터 `DataGrid` 가 든다(`0032` 가 `List` 를 같은 변형의 그리드로 옮긴다).
   */
  it('0.1.0 이 선언한 variant 를 전부 그대로 선언한다 · 카드의 테두리 없는 변형 · 선택지 묶음의 변형을 더한다', () => {
    const declared = Object.fromEntries(
      Object.entries(ADMIN_V0.manifest.components ?? {}).map(([type, decl]) => [type, decl.variants.map((v) => v.id)]),
    )
    expect(declared).toEqual({
      Section: ['default', 'hero', 'muted'],
      Card: ['default', 'featured', 'borderless'],
      DataGrid: ['default', 'featured', 'compact'],
      Button: ['default', 'primary', 'secondary', 'danger', 'ghost'],
      Link: ['default', 'muted'],
      RadioGroup: ['segment', 'radio'],
      CheckboxGroup: ['checkbox', 'chip'],
    })
    const defaults = Object.fromEntries(
      Object.entries(ADMIN_V0.manifest.components ?? {}).map(([type, decl]) => [type, decl.defaultVariant]),
    )
    expect(defaults).toEqual({
      Section: 'default',
      Card: 'default',
      DataGrid: 'default',
      Button: 'default',
      Link: 'default',
      RadioGroup: 'segment',
      CheckboxGroup: 'checkbox',
    })
  })
})

describe('system-admin CSS', () => {
  /**
   * 토큰 색은 `:root` 의 변수로만 든다 — 규칙이 그 색을 글자로 박으면 설정에서 그 토큰을 바꿔도 그 자리만 안 따라온다. `:root` 안의 상수(읽기 전용
   * 바탕처럼 토큰과 값이 같아도 뜻이 다른 것)는 세지 않는다.
   */
  it('토큰 색을 글자로 박지 않는다 — :root 밖 선언 값에 색 토큰 기본값이 없다', () => {
    const colors = Object.values(ADMIN_V0.manifest.tokens.items)
      .filter((decl) => decl.type === 'color')
      .map((decl) => String(decl.default).toLowerCase())
    expect(colors.length).toBeGreaterThan(8)
    const outside = declarations().filter((d) => d.selector !== ':root')
    expect(outside.length).toBeGreaterThan(100)
    expect(
      outside
        .filter((d) => colors.some((color) => d.value.toLowerCase().includes(color)))
        .map((d) => `${d.selector} { ${d.property}: ${d.value} }`),
    ).toEqual([])
  })

  /**
   * 읽기 전용(값이 서버로 간다)과 비활성(안 간다)은 바탕으로 갈린다 — 같은 색이면 화면이 «이 값이 저장되는가» 를 못 가른다. 둘 다 흰 면과도 달라야
   * 편집 칸과 갈린다.
   */
  it('읽기 전용과 비활성의 바탕은 다른 색이다 · 둘 다 면과 다르다', () => {
    const vars = ROOT_VARS()
    const readonly = vars.get('--wb-input-readonly')
    const disabled = vars.get('--wb-input-disabled')
    expect(readonly).toMatch(/^#[0-9a-f]{6}$/)
    expect(disabled).toMatch(/^#[0-9a-f]{6}$/)
    expect(readonly).not.toBe(disabled)
    expect([readonly, disabled]).not.toContain(vars.get('--wb-semantic-surface'))
  })

  /**
   * variant 없는 노드는 `defaultVariant`(`default`)로 그려진다 — 그 값을 겨냥한 규칙이 있으면 variant 없는 노드의 모습이 바뀐다. 예외는 폼 · 파일첨부
   * 단추 구역의 기본 단추 셋뿐이다 — 이 테마의 기본 단추가 주색이라 주 단추(`primary`)와 나란히 서거나 작은 단추 줄로 서면 주색이 넘쳐, 그 자리에서만 보조
   * 꼴로 바꾼다(`theme.css` 의 «폼 · 파일첨부의 단추 구역»). 그 밖의 자리에 `default` 를 겨냥한 셀렉터는 여전히 죽는다.
   */
  it('[data-wb-variant="default"] 규칙은 폼 · 파일첨부 단추 구역의 기본 단추 셋뿐이다', () => {
    const FORM_ACTIONS = ['SearchForm', 'EntryForm', 'FileAttach'].map(
      (form) => `[data-wb-component="${form}"] > [data-wb-part="actions"] > [data-wb-component="Button"][data-wb-variant="default"]`,
    )
    const targeting = rules()
      .flatMap((rule) => rule.selector.split(',').map((part) => part.trim()))
      .filter((part) => part.includes('data-wb-variant="default"'))
    expect(targeting).toEqual(FORM_ACTIONS)
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
   * 카드 상자에는 여백이 없다 — 머리줄 밑선 · 바닥 윗선 · 몸통에 붙은 표가 상자 테두리까지 닿는다. 머리줄은 격자 칸과 같은 높이(42px)다.
   */
  it('카드는 여백 없는 상자다 — 뿌리 padding 0 · 머리줄 최소 높이 42px · 머리줄 밑선은 테두리 색', () => {
    expect(Number.parseFloat(ruleOf('[data-wb-component="Card"][data-wb-structure="plain"]').getPropertyValue('padding'))).toBe(0)
    const header = ruleOf('[data-wb-component="Card"] > [data-wb-part="header"]')
    expect(header.getPropertyValue('min-height').trim()).toBe('var(--wb-cell-minHeight)')
    expect(rootPx('--wb-cell-minHeight')).toBe(42)
    expect(header.getPropertyValue('border-bottom')).toContain('var(--wb-semantic-border)')
  })

  /**
   * 카드 · 탭의 조각 규칙은 직계로 잡는다 — 그 안에 든 노드도 같은 이름의 조각(`header` · `title` · `body` · `footer` · `list`)을 가져 자손으로
   * 잡으면 카드 · 탭의 꾸밈이 그 안에 선다(패널에 든 파일첨부의 목록 표가 `flex` 가 된다 · 카드에 든 폼 표의 머리줄이 카드 머리줄 꼴이 된다).
   */
  it('카드 · 탭의 조각 규칙은 그 안에 든 노드의 같은 이름 조각에 안 닿는다', () => {
    const outer = (selectors: string[]) => selectors.filter((selector) => /^\[data-wb-component="(Card|Tabs)"\]/.test(selector))
    const got = tree(
      `<div data-wb-component="Card" data-wb-structure="plain"><div data-wb-part="header"><div data-wb-part="heading"><div data-wb-part="title">카드</div></div></div>
         <div data-wb-part="body"><i></i>
           <div data-wb-component="Tabs" data-wb-structure="underline"><div data-wb-part="list"><span data-wb-part="tab">탭</span></div>
             <div data-wb-part="panel"><i></i>
               <div data-wb-component="FileAttach" data-wb-structure="default"><table data-wb-part="list"><tbody><tr><td>파일</td></tr></tbody></table></div>
               <div data-wb-component="FormTable" data-wb-structure="table"><div data-wb-part="header"><div data-wb-part="title">표</div></div><div data-wb-part="cells"></div></div>
               <div data-wb-component="DataGrid" data-wb-structure="default"><div data-wb-part="head"></div><div data-wb-part="footer"></div></div>
             </div></div>
         </div></div>`,
      (root) => ({
        // 카나리아 — 카드 · 탭 제 조각에는 닿는다.
        cardTitle:
          outer(matching(root.querySelector('[data-wb-component="Card"] > [data-wb-part="header"] [data-wb-part="title"]')!)).length > 0,
        tabList: outer(matching(root.querySelector('[data-wb-component="Tabs"] > [data-wb-part="list"]')!)).length > 0,
        fileList: outer(matching(root.querySelector('table[data-wb-part="list"]')!)),
        tableHeader: outer(matching(root.querySelector('[data-wb-component="FormTable"] > [data-wb-part="header"]')!)),
        tableTitle: outer(matching(root.querySelector('[data-wb-component="FormTable"] [data-wb-part="title"]')!)),
        gridFooter: outer(matching(root.querySelector('[data-wb-component="DataGrid"] > [data-wb-part="footer"]')!)),
      }),
    )
    expect(got).toEqual({ cardTitle: true, tabList: true, fileList: [], tableHeader: [], tableTitle: [], gridFooter: [] })
  })

  /**
   * 카드 몸통에 홀로 든 폼 표 · 그리드 · 조회 폼은 몸통 여백을 음수 여백으로 되돌려 카드에 붙는다. 형제가 있거나 테두리 없는 카드(몸통 여백이 없다)면
   * 안 붙는다 — 거기서 음수 여백이 서면 노드가 카드 밖으로 나간다.
   */
  it('카드 몸통에 홀로 든 폼 표 · 그리드 · 조회 폼만 음수 여백으로 붙는다', () => {
    const pulls = (el: Element) =>
      rules().some(
        (rule) => rule.media === null && rule.style.getPropertyValue('margin').includes('* -1') && matching(el).includes(rule.selector),
      )
    const card = (variant: string, body: string) =>
      `<div data-wb-component="Card" data-wb-structure="plain" data-wb-variant="${variant}"><div data-wb-part="body">${body}</div></div>`
    const node = (type: string) => `<div data-wb-component="${type}" data-test="x"></div>`
    const got = tree(
      ['FormTable', 'DataGrid', 'SearchForm', 'KeyValue', 'Flex']
        .map((type) => card('default', node(type)) + card('default', `${node(type)}<p></p>`) + card('borderless', node(type)))
        .join(''),
      (root) =>
        Array.from(root.querySelectorAll('[data-test="x"]')).map((el) => {
          const variant = el.closest('[data-wb-component="Card"]')!.getAttribute('data-wb-variant')
          return `${el.getAttribute('data-wb-component')} ${variant} ${el.parentElement!.children.length === 1 ? '홀로' : '형제'}: ${pulls(el)}`
        }),
    )
    expect(got).toEqual(
      ['FormTable', 'DataGrid', 'SearchForm', 'KeyValue', 'Flex'].flatMap((type) => {
        const flush = type === 'FormTable' || type === 'DataGrid' || type === 'SearchForm'
        return [`${type} default 홀로: ${flush}`, `${type} default 형제: false`, `${type} borderless 홀로: false`]
      }),
    )
  })

  /**
   * 밑줄 탭 — 고른 탭(`aria-selected`)만 주색 밑줄을 받는다. 폼의 조각 규칙은 직계로 잡는다 — 자손으로 잡으면 안의 `Field` 의 `label` 조각까지
   * 받아 필드 라벨마다 제목의 밑줄이 선다.
   */
  it('고른 탭만 주색 밑줄 · 등록 폼 제목 규칙은 필드 라벨에 안 닿는다', () => {
    const selected = ruleOf('[data-wb-component="Tabs"] > [data-wb-part="list"] > [data-wb-part="tab"][aria-selected="true"]')
    expect(selected.getPropertyValue('border-bottom-color').trim()).toBe('var(--wb-semantic-primary)')
    const tabRules = rules().filter((rule) => rule.selector.includes('[data-wb-part="tab"]') && !rule.selector.includes('aria-selected'))
    expect(tabRules.length).toBeGreaterThan(0)
    expect(tabRules.filter((rule) => rule.style.cssText.includes('--wb-semantic-primary')).map((rule) => rule.selector)).toEqual([])

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
