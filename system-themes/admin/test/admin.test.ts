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

/** `:root` 의 글 크기 변수 하나를 본문 크기의 기본값으로 풀어 px 로 — 본문 변수 그대로거나 `calc(본문 ± Npx)` 다. */
function typePx(name: string): number {
  const vars = ROOT_VARS()
  const body = Number.parseFloat(vars.get('--wb-typography-body-fontSize') ?? '')
  const value = (vars.get(name) ?? '').replace(/\s+/g, ' ')
  if (value === 'var(--wb-typography-body-fontSize)') return body
  const shifted = /^calc\(var\(--wb-typography-body-fontSize\) ([+-]) (\d+)px\)$/.exec(value)
  return shifted ? body + (shifted[1] === '+' ? 1 : -1) * Number(shifted[2]) : Number.parseFloat(value)
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

/** `1.8.0` 이 선언한 토큰 키 — 그 판에 고정된 프로젝트가 덮은 값을 이 키로 저장해 두었다. */
const V1_8_0_KEYS = [
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

/** 기본값이 참조(`{semantic.text}`)면 그 키, 아니면 `null`. */
const refOf = (value: string | number): string | null => /^\{([^{}]+)\}$/.exec(String(value))?.[1] ?? null

describe('system-admin manifest', () => {
  it('id · 판 · sdk · 이름 · 설명', () => {
    expect(ADMIN_V0.manifest.id).toBe('system-admin')
    expect(ADMIN_V0.manifest.version).toBe('2.2.0')
    expect(ADMIN_V0.manifest.sdk).toBe('^1.10.0')
    expect(ADMIN_V0.manifest.name).toBe('기본테마')
    expect(ADMIN_V0.manifest.description).toBe('관리자 화면 기본 테마. 회색 선의 표 격자와 파란 주색을 쓴다.')
  })

  /**
   * 프로젝트가 덮은 토큰은 키로 저장된다 — `1.8.0` 에 고정된 프로젝트가 판을 올릴 때 그 판의 키가 전부 있어야 덮은 값이 이어진다. 키를 걷거나
   * 이름을 바꾸면 그 프로젝트의 덮은 값이 말없이 사라진다.
   */
  it('1.8.0 의 토큰 키를 전부 선언한다', () => {
    const declared = new Set(Object.keys(ADMIN_V0.manifest.tokens.items))
    expect(V1_8_0_KEYS.filter((key) => !declared.has(key))).toEqual([])
  })

  /**
   * 설정 화면의 색 칸은 소문자 `#rrggbb` 로 보낸다 — 기본값이 다른 꼴이면 «기본값과 같은가» 가 글자로 안 맞아 안 덮은 칸이 덮은 칸으로 읽힌다. 참조
   * 기본값(`{semantic.text}`)은 색 글자가 아니라 세지 않는다.
   */
  it('색 토큰 기본값은 소문자 #rrggbb', () => {
    const colors = Object.entries(ADMIN_V0.manifest.tokens.items).filter(
      ([, decl]) => decl.type === 'color' && refOf(decl.default) === null,
    )
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

  /** 참조 기본값(`{semantic.text}`)은 토큰 시트가 내는 꼴(`var(--wb-semantic-text)`)과 같아야 한다 — 번들 · 캔버스는 그 시트를 이 시트 뒤에 싣는다. */
  it('토큰마다 CSS 의 :root 에 같은 이름 · 같은 기본값의 변수가 있다', () => {
    const vars = ROOT_VARS()
    const cssOf = (value: string | number) => {
      const ref = refOf(value)
      return ref === null ? String(value) : `var(--wb-${ref.replaceAll('.', '-')})`
    }
    for (const [key, decl] of Object.entries(ADMIN_V0.manifest.tokens.items)) {
      expect(vars.get(`--wb-${key.replaceAll('.', '-')}`), key).toBe(cssOf(decl.default))
    }
  })

  /**
   * **판을 올리며 더한 토큰 가운데 글 · 바탕을 칠하는 것은 옛 키의 참조다** — 1.8.0 에서 글 · 바탕을 덮은 프로젝트가 판을 올리면 덮은 값은 옛 키에만
   * 옮겨지고 새 키는 기본값으로 선다(`migrateTokens`). 리터럴 기본값이면 제목 · 라벨 · 표 머리만 덮은 팔레트를 벗어난다(어두운 바탕에 짙은 글 —
   * `docs/superpowers/plans/2026-11-13-rv-sk-report.md` F1). 옅은 세로선(`borderFaint`)은 글이 묻히지 않아 리터럴로 둔다(`src/manifest.ts` 머리말).
   */
  it('2.0.0 이 더한 토큰 가운데 글 · 바탕에 쓰이는 것은 옛 키의 참조다', () => {
    const items = ADMIN_V0.manifest.tokens.items
    const added = Object.keys(items).filter((key) => !V1_8_0_KEYS.includes(key) && items[key]!.type === 'color')
    /** 그 토큰의 변수를 글 · 바탕 속성에 쓰는 선언 수. */
    const paintsTextOrGround = (key: string) =>
      declarations().filter(
        (d) =>
          d.selector !== ':root' &&
          /^(color|background(-color)?)$/.test(d.property) &&
          d.value.includes(`var(--wb-${key.replaceAll('.', '-')})`),
      ).length
    const used = added.filter((key) => paintsTextOrGround(key) > 0)
    // 카나리아 — 더한 색 토큰 가운데 글 · 바탕을 칠하는 것이 둘(짙은 글 · 머리 바탕)이고, 세로선만 긋는 것은 세지 않는다.
    expect(used.length).toBeGreaterThanOrEqual(2)
    expect(added.filter((key) => !used.includes(key))).toEqual(['semantic.borderFaint'])
    expect(
      Object.fromEntries(
        used.map((key) => [key, V1_8_0_KEYS.includes(refOf(items[key]!.default) ?? '') ? '옛 키의 참조' : String(items[key]!.default)]),
      ),
    ).toEqual(Object.fromEntries(used.map((key) => [key, '옛 키의 참조'])))
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
   * variant 없는 노드는 `defaultVariant`(`default`)로 그려진다 — 그 값을 겨냥한 규칙이 있으면 variant 없는 노드의 모습이 바뀐다. 바탕 규칙이 곧
   * `default` 의 모양이다(단추의 바탕은 흰 단추라 폼의 단추 구역에서 따로 바꿀 것이 없다).
   */
  it('[data-wb-variant="default"] 를 겨냥한 규칙이 없다', () => {
    const selectors = rules().flatMap((rule) => rule.selector.split(',').map((part) => part.trim()))
    expect(selectors.length).toBeGreaterThan(100)
    expect(selectors.filter((part) => part.includes('data-wb-variant="default"'))).toEqual([])
  })

  /** 선언한 variant 는 속성 패널에 칸으로 선다 — 규칙이 없으면 골라도 아무것도 안 바뀌는 칸이다. */
  it('default 밖의 선언한 variant 마다 그 variant 를 겨냥한 규칙이 있다', () => {
    const selectors = rules().map((rule) => rule.selector)
    const missing: string[] = []
    let checked = 0
    for (const [type, decl] of Object.entries(ADMIN_V0.manifest.components ?? {})) {
      for (const { id } of decl.variants) {
        if (id === 'default') continue
        checked += 1
        const target = `[data-wb-component="${type}"][data-wb-variant="${id}"]`
        if (!selectors.some((selector) => selector.includes(target))) missing.push(`${type}/${id}`)
      }
    }
    expect(checked).toBeGreaterThan(10)
    expect(missing).toEqual([])
  })

  /**
   * 단추의 바탕은 흰 단추(면 바탕 · 테두리 · 본문 색 글)이고 주 단추(`primary`)만 주색으로 채운다 — 한 화면의 채운 단추가 주 단추 하나라야 눈이 그리로
   * 간다. 위험 단추는 채우지 않는다(위험 색 테두리 · 글).
   */
  it('단추 바탕은 흰 단추 · 최소 높이 30px · primary 만 주색으로 채운다', () => {
    const base = ruleOf('[data-wb-component="Button"][data-wb-structure="solid"]')
    expect(base.getPropertyValue('background').trim()).toBe('var(--wb-semantic-surface)')
    expect(base.getPropertyValue('border-color').trim()).toBe('var(--wb-semantic-border)')
    expect(base.getPropertyValue('color').trim()).toBe('var(--wb-semantic-text)')
    expect(base.getPropertyValue('min-height').trim()).toBe('var(--wb-control-minHeight)')
    const filled = rules()
      .filter(
        (rule) =>
          rule.selector.includes('[data-wb-component="Button"]') &&
          /--wb-semantic-(primary|danger)\b/.test(rule.style.getPropertyValue('background')),
      )
      .map((rule) => rule.selector)
    expect(filled).toEqual(['[data-wb-component="Button"][data-wb-variant="primary"]'])
    expect(ruleOf('[data-wb-component="Button"][data-wb-variant="primary"]').getPropertyValue('background').trim()).toBe(
      'var(--wb-semantic-primary)',
    )
    expect(ruleOf('[data-wb-component="Button"][data-wb-variant="danger"]').getPropertyValue('border-color').trim()).toBe(
      'var(--wb-semantic-danger)',
    )
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
   * 콘텐츠»). 이 테마는 폭을 안 가둬 `auto` 가 0 이지만, `:root` 의 폭 하나만 바꾸는 사람이 가운데 정렬을 그대로 얻는다. 글자 `none` 은 가두는
   * 것이 아니라 SDK 가 건 한도를 푸는 것이라 세지 않는다(카드에 붙은 그리드).
   */
  it('max-width 를 거는 규칙마다 margin-left · margin-right 가 auto', () => {
    const bounded = rules().filter((rule) => !['', 'none'].includes(rule.style.getPropertyValue('max-width').trim()))
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
   * 제목 단계 · 캡션의 글 크기는 본문 크기 토큰에 더한 값이다 — 고정 px 면 본문을 키운 프로젝트에서 카드 제목(h5) · 라벨(h6)이 본문보다 작다
   * (`docs/superpowers/plans/2026-11-13-rv-sk-report.md` F8). 본문 기본값(13px)에서 풀면 원본 사이트의 단계와 같다.
   */
  it('제목 단계 · 캡션의 글 크기는 본문 크기에서 셈한다 — 기본 13px 에서 28 · 22 · 18 · 16 · 15 · 14 · 13 · 12', () => {
    const vars = ROOT_VARS()
    const scale = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'caption']
    const FROM_BODY = /^(?:var\(--wb-typography-body-fontSize\)|calc\(var\(--wb-typography-body-fontSize\) ([+-]) (\d+)px\))$/
    expect(
      Object.fromEntries(
        scale.map((role) => [role, FROM_BODY.test((vars.get(`--wb-typography-${role}-fontSize`) ?? '').replace(/\s+/g, ' '))]),
      ),
    ).toEqual(Object.fromEntries(scale.map((role) => [role, true])))
    expect(Object.fromEntries(scale.map((role) => [role, typePx(`--wb-typography-${role}-fontSize`)]))).toEqual({
      display: 28,
      h1: 22,
      h2: 18,
      h3: 16,
      h4: 15,
      h5: 14,
      h6: 13,
      caption: 12,
    })
  })

  /** 제목 단계(`display` · `h1` – `h6`)는 짙은 글 색이고 본문은 바탕 규칙의 글 색 그대로다. 페이지 제목(`h1`)은 22px 다. */
  it('Text 의 제목 단계는 짙은 글 색 · h1 은 22px', () => {
    const color = (role: string) => ruleOf(`[data-wb-component="Text"][data-wb-variant="${role}"]`).getPropertyValue('color').trim()
    const headings = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
    expect(Object.fromEntries(headings.map((role) => [role, color(role)]))).toEqual(
      Object.fromEntries(headings.map((role) => [role, 'var(--wb-semantic-textStrong)'])),
    )
    expect(color('body')).toBe('')
    expect(typePx('--wb-typography-h1-fontSize')).toBe(22)
  })

  /** 팝업 — 제목줄은 머리 바탕(표 머리와 같은 토큰), 바닥은 옅은 바탕이고 테두리는 테두리 색이다. */
  it('팝업 제목줄은 머리 바탕 · 바닥은 옅은 바탕', () => {
    expect(ruleOf('[data-wb-component="Popup"] > [data-wb-part="titlebar"]').getPropertyValue('background').trim()).toBe(
      'var(--wb-semantic-header)',
    )
    expect(ruleOf('[data-wb-component="Popup"] > [data-wb-part="footer"]').getPropertyValue('background').trim()).toBe(
      'var(--wb-semantic-canvas)',
    )
    expect(ruleOf('[data-wb-component="Popup"][data-wb-structure="default"]').getPropertyValue('border')).toContain(
      'var(--wb-semantic-border)',
    )
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
   * 테두리 있는 카드의 몸통은 여백 0 이고 곧바로 든 노드가 제 여백(12px)을 갖는다 — 폼 표 · 그리드 · 조회 폼만 여백 0 으로 카드에 붙는다. **형제가 있어도
   * 같다**(«홀로 든 것만» 이면 끄는 동안 숨긴 미리보기가 그 판을 바꾼다 — 아래 «형제 구조로 안 가른다»). 테두리 없는 카드는 둘 다 안 받는다.
   */
  it('카드 몸통에 든 폼 표 · 그리드 · 조회 폼은 붙고(여백 0) 그 밖은 여백 12px — 형제가 있어도 같다', () => {
    const marginOf = (el: Element) =>
      rules()
        .filter((rule) => rule.media === null && rule.selector.includes('[data-wb-part="body"] >') && matching(el).includes(rule.selector))
        .map((rule) => rule.style.getPropertyValue('margin').trim())
        .filter((margin) => margin !== '' && margin !== '0px 0px 8px' && !margin.startsWith('0px 0px'))
    const card = (variant: string, body: string) =>
      `<div data-wb-component="Card" data-wb-structure="plain" data-wb-variant="${variant}"><div data-wb-part="body">${body}</div></div>`
    const node = (type: string) => `<div data-wb-component="${type}" data-test="x"></div>`
    const TYPES = ['FormTable', 'DataGrid', 'SearchForm', 'KeyValue', 'Flex']
    const got = tree(
      TYPES.map(
        (type) => card('default', node(type)) + card('default', `<p></p>${node(type)}<p></p>`) + card('borderless', node(type)),
      ).join(''),
      (root) =>
        Array.from(root.querySelectorAll('[data-test="x"]')).map((el) => {
          const variant = el.closest('[data-wb-component="Card"]')!.getAttribute('data-wb-variant')
          const alone = el.parentElement!.children.length === 1 ? '홀로' : '형제'
          return `${el.getAttribute('data-wb-component')} ${variant} ${alone}: ${marginOf(el).join(' · ') || '없음'}`
        }),
    )
    expect(got).toEqual(
      TYPES.flatMap((type) => {
        const flush = type === 'FormTable' || type === 'DataGrid' || type === 'SearchForm'
        const bordered = flush ? 'var(--wb-space-3) · 0' : 'var(--wb-space-3)'
        return [`${type} default 홀로: ${bordered}`, `${type} default 형제: ${bordered}`, `${type} borderless 홀로: 없음`]
      }),
    )
    expect(Number.parseFloat(ruleOf('[data-wb-component="Card"] > [data-wb-part="body"]').getPropertyValue('padding'))).toBe(0)
  })

  /**
   * 페이지 뿌리에 곧바로 든 노드(조회 폼 · 그리드 · 등록 폼을 카드 없이 쌓은 화면)도 구역 안처럼 자기 아래 8px 이다 — 끝 노드도 같다(형제 구조로
   * 안 가른다). 뿌리의 구역 · 글은 안 받는다 — 바탕을 칠하는 띠 사이에 흰 틈이 서고, 글은 제 문단 여백으로 쌓인다.
   */
  it('페이지 뿌리에 곧바로 든 노드는 자기 아래 8px · 위 0 — 끝 노드도 같고 구역 · 글은 안 받는다', () => {
    const bottomOf = (el: Element) =>
      rules()
        .filter(
          (rule) => rule.media === null && rule.style.getPropertyValue('margin-bottom') !== '' && matching(el).includes(rule.selector),
        )
        .map((rule) => `${rule.style.getPropertyValue('margin-top').trim()} / ${rule.style.getPropertyValue('margin-bottom').trim()}`)
    const got = tree(
      `<div data-wb-component="Page" data-wb-structure="default">
         <form data-wb-component="SearchForm" data-test="x"></form><div data-wb-component="DataGrid" data-test="x"></div>
         <div data-wb-component="Section" data-test="x"></div><p data-wb-component="Text" data-test="x"></p><form data-wb-component="EntryForm" data-test="x"></form></div>`,
      (root) =>
        Array.from(root.querySelectorAll('[data-test="x"]')).map(
          (el) => `${el.getAttribute('data-wb-component')}: ${bottomOf(el).join(' · ') || '없음'}`,
        ),
    )
    expect(got).toEqual([
      'SearchForm: 0 / var(--wb-space-2)',
      'DataGrid: 0 / var(--wb-space-2)',
      'Section: 없음',
      'Text: 없음',
      'EntryForm: 0 / var(--wb-space-2)',
    ])
  })

  /**
   * **배치를 바꾸는 규칙은 형제 구조로 안 가른다** — 에디터는 끄는 동안 미리보기를 `display: none` 으로 숨긴 배치로 놓을 자리를 재는데
   * (`apps/web/src/canvas/canvas-preview.ts` 의 `withoutPreview`), 형제 셀렉터(`+` · `~` · `:first-child` · `:last-child` · `:only-child` · `:nth-*`)는
   * 숨긴 요소도 형제로 센다. 그 규칙이 여백 · 크기를 바꾸면 미리보기가 선 자리에 따라 숨긴 배치가 달라져 같은 포인터에서 답이 뒤집히고, 캔버스가 다시
   * 잴 때마다 다시 물어 `Maximum update depth` 로 죽는다(`apps/web/build-test/zone-editor.test.ts` «빈 구역 칸은 …»). 형제 셀렉터가 든 규칙은 그림만
   * 바꾸는 속성(색 · 모서리 · 그림자)만 갖는다. 예외는 노드가 아닌 조각의 차례(세그먼트 칸 · 파일첨부 줄 · 조회 폼 조각)와 1px 선 둘이다.
   */
  it('배치를 바꾸는 규칙은 형제 구조로 안 가른다 — 형제 셀렉터 규칙은 그림만 바꾼다', () => {
    // 결합자 양옆의 공백을 가정하지 않는다(`*+*`) — 속성 값(`[data-wb-state~="…"]`)을 걷은 뒤 센다. 자식 · 형제 유무로 가르는 `:has()` · `:empty` 도
    // 숨긴 미리보기를 센다.
    const STRUCTURAL = /:(first|last|only)-child|:nth-|-of-type|:empty|:has\(|[+~]/
    const structuralOf = (selector: string) => STRUCTURAL.test(selector.replace(/\[[^\]]*\]/g, '[]'))
    const PAINT = /^(color|background(-color)?|border-(top|bottom)-(left|right)-radius|box-shadow|opacity|outline.*)$/
    /**
     * 노드가 아닌 조각의 차례 — 끄는 동안의 미리보기가 그 사이에 안 선다. 1px 선 — 칸 · 줄의 선 하나를 걷는다(숨긴 미리보기 칸 · 줄이 끝에 서면 1px 이
     * 달라진다 · `docs/superpowers/plans/2026-11-13-sk-report.md` «남은 것»). `:has()` — 자식 유무로 가르는 규칙 가운데 선 하나 · 칸 안 정렬만 바꾸는 것.
     */
    const EXEMPT = [
      '[data-wb-component="RadioGroup"][data-wb-variant="segment"] > [data-wb-part="option"]:first-child',
      '[data-wb-component="RadioGroup"][data-wb-variant="segment"] > [data-wb-part="option"]:last-child',
      '[data-wb-component="FileAttach"] > [data-wb-part="list"] > tbody > tr:last-child > *',
      '[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns]:last-child',
      '[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns] + [data-wb-part="actions"]',
      '[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > [data-wb-part]:last-child',
      '[data-wb-component="DataGrid"] [data-wb-part="table"] > tbody:last-child > tr:last-child > [data-wb-part]',
      // 칸이 하나도 없는 폼 표의 칸 선 1px — 빈 표에 숨긴 미리보기가 서면 선이 선다(`docs/superpowers/plans/2026-11-13-rv-sk-report.md` «촘촘한 판» 이
      // 그 자리를 0.5px 걸음으로 훑어 뒤집힘 0).
      '[data-wb-component="FormTable"] > [data-wb-part="cells"]:not(:has(> *))',
      // 여러 줄 입력이 든 필드의 라벨 정렬 — 칸 안의 라벨(노드가 아닌 조각) 자리만 바뀌고 칸 높이는 여러 줄 입력이 정한다.
      '[data-wb-component="FormTable"] > [data-wb-part="cells"] > [data-wb-component="Field"]:has(> [data-wb-part="value"] > [data-wb-component="TextArea"]) > [data-wb-part="label"]',
      '[data-wb-component="EntryForm"] > [data-wb-part="row"] > [data-wb-component="Field"]:has(> [data-wb-part="value"] > [data-wb-component="TextArea"])',
      '[data-wb-component="EntryForm"] > [data-wb-part="row"] > [data-wb-component="Field"]:has(> [data-wb-part="value"] > [data-wb-component="TextArea"]) > [data-wb-part="label"]',
    ]
    const structural = rules().filter((rule) => structuralOf(rule.selector))
    expect(structural.length).toBeGreaterThan(EXEMPT.length)
    expect(EXEMPT.filter((selector) => !structural.some((rule) => rule.selector === selector))).toEqual([])
    const layout = structural
      .filter((rule) => !EXEMPT.includes(rule.selector))
      .flatMap((rule) =>
        names(rule.style)
          .filter((name) => !PAINT.test(name))
          .map((name) => `${rule.selector} { ${name} }`),
      )
    expect(layout).toEqual([])
  })

  /**
   * 그리드 — 머리는 머리 바탕(`semantic.header`) · 가운데, 가로선은 테두리 색 · 세로선은 옅은 테두리 색이다. 세로선은 줄의 끝 칸에서 걷는다 — 합친
   * 테두리에서는 칸의 선이 표의 선을 이겨, 안 걷으면 표의 오른쪽 바깥 선이 옅은 색이 된다.
   */
  it('그리드 머리는 머리 바탕 · 가운데 · 세로선은 옅은 테두리이고 끝 칸에서 걷는다', () => {
    const head = ruleOf('[data-wb-component="DataGrid"] [data-wb-part="header"] > tr > *')
    expect(head.getPropertyValue('background').trim()).toBe('var(--wb-semantic-header)')
    expect(head.getPropertyValue('text-align').trim()).toBe('center')
    const cell = ruleOf('[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > [data-wb-part]')
    expect(cell.getPropertyValue('border-bottom')).toContain('var(--wb-semantic-border)')
    expect(cell.getPropertyValue('border-right')).toContain('var(--wb-semantic-borderFaint)')
    const last = ruleOf('[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > [data-wb-part]:last-child')
    expect(Number.parseFloat(last.getPropertyValue('border-right-width') || last.getPropertyValue('border-right'))).toBe(0)
  })

  /** 줄무늬가 없다 — 몸 줄의 바탕은 올려 둔 줄(`:hover`)과 행 꼴(`tone` · 합계)만 칠한다. 짝수 줄 바탕은 행 꼴(음영 · 흐림)과 같은 색이라 둘이 안 갈린다. */
  it('그리드 몸 줄에 줄무늬(nth-child) 규칙이 없다 · 올려 둔 줄은 옅은 바탕', () => {
    const body = rules().filter((rule) => rule.selector.includes('[data-wb-component="DataGrid"] [data-wb-part="body"]'))
    expect(body.length).toBeGreaterThan(5)
    expect(body.filter((rule) => /nth-(child|of-type)/.test(rule.selector)).map((rule) => rule.selector)).toEqual([])
    expect(ruleOf('[data-wb-component="DataGrid"] [data-wb-part="body"] > tr:hover').getPropertyValue('background').trim()).toBe(
      'var(--wb-semantic-canvas)',
    )
  })

  /**
   * 그리드의 바깥 선은 하나다 — 표는 제 선을 안 긋고(머리줄 밑선 · 바닥 윗선과 겹쳐 두 줄이 된다) 그리드 뿌리가 긋는다. 카드에 붙은 그리드는 뿌리 선도
   * 걷는다(카드 테두리와 겹친다 — 형제가 있어도). 카드 밖 그리드는 뿌리가 선을 지킨다.
   */
  it('그리드의 바깥 선은 뿌리 하나 — 표는 선을 안 긋고 카드에 붙으면 뿌리 선도 걷는다', () => {
    const grid =
      '<div data-wb-component="DataGrid" data-wb-structure="default"><div data-wb-part="scroll"><table data-wb-part="table"></table></div></div>'
    /** 요소에 맞는 규칙(`@media` 밖)이 거는 바깥 선 굵기들 — `border` 의 굵기(첫 낱말) · `border-width`. */
    const widths = (el: Element) =>
      rules()
        .filter((rule) => rule.media === null && matching(el).includes(rule.selector))
        .map((rule) => rule.style.getPropertyValue('border-width').trim() || rule.style.getPropertyValue('border').trim().split(' ')[0]!)
        .filter((value) => value !== '')
    const got = tree(
      `<div data-wb-component="Card" data-wb-structure="plain" data-wb-variant="default"><div data-wb-part="body">${grid}</div></div>
       <div data-wb-component="Card" data-wb-structure="plain" data-wb-variant="default"><div data-wb-part="body">${grid}<p></p></div></div>
       <div data-wb-component="Section"><div data-wb-part="inner">${grid}</div></div>`,
      (root) =>
        Array.from(root.querySelectorAll('[data-wb-component="DataGrid"]')).map(
          (el) => `${widths(el).join(' → ')} · 표 ${widths(el.querySelector('table')!).join(' → ')}`,
        ),
    )
    // 카드에 붙은 판은 카드 규칙(뒤 · 더 구체적)이 뿌리 선을 0 으로 덮는다.
    expect(got).toEqual(['1px → 0 · 표 0', '1px → 0 · 표 0', '1px · 표 0'])
  })

  /** 잠금 사다리의 두 단을 규칙이 실제로 칠한다 — 변수만 있고 칠하는 규칙이 없으면 읽기 전용 · 비활성 칸이 편집 칸과 같은 흰 면이다. */
  it('읽기 전용 · 비활성 칸은 제 바탕 변수로 칠한다', () => {
    const paints = (state: string, name: string) =>
      rules()
        .filter(
          (rule) =>
            rule.selector.includes(`[data-wb-state~="${state}"]`) && rule.style.getPropertyValue('background').trim() === `var(${name})`,
        )
        .map((rule) => rule.selector)
    expect(paints('readonly', '--wb-input-readonly')).toEqual(['[data-wb-state~="readonly"]'])
    const disabled = paints('disabled', '--wb-input-disabled').join(', ')
    for (const type of ['Input', 'TextArea', 'Select', 'DateInput', 'TimeInput'])
      expect(disabled, type).toContain(`[data-wb-component="${type}"][data-wb-state~="disabled"]`)
  })

  /** 고른 세그먼트 칸은 채운 주색 흰 글이다 — 글 색(`semantic.text`)으로 채우면 주색을 바꿔도 고른 칸이 안 따라온다. */
  it('고른 세그먼트 칸은 채운 주색 · 면 색 글', () => {
    const on = ruleOf('[data-wb-component="RadioGroup"][data-wb-variant="segment"] > [aria-checked="true"]')
    expect(on.getPropertyValue('background').trim()).toBe('var(--wb-semantic-primary)')
    expect(on.getPropertyValue('border-color').trim()).toBe('var(--wb-semantic-primary)')
    expect(on.getPropertyValue('color').trim()).toBe('var(--wb-semantic-surface)')
  })

  /**
   * 쌍 격자(폼 표 · 열을 정한 조회 폼)의 라벨 칸 — 폭 140px · 옅은 바탕 · 칸 최소 높이 42px. 두 격자가 같은 규칙을 나눠 써 조회 폼과 폼 표의 라벨
   * 칸이 한 꼴이다.
   */
  it('쌍 격자의 라벨 칸은 폭 140px · 옅은 바탕 · 최소 높이 42px — 폼 표와 열을 정한 조회 폼이 같은 규칙', () => {
    expect(ROOT_VARS().get('--wb-form-labelWidth')).toBe('140px')
    const FORM =
      '[data-wb-component="FormTable"] > [data-wb-part="cells"] > :is([data-wb-component="Field"], [data-wb-part="filler"]) > [data-wb-part="label"]'
    const SEARCH =
      '[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns] > [data-wb-component="Field"] > [data-wb-part="label"]'
    const label = rules().filter((rule) => rule.media === null && rule.selector.includes(FORM))
    expect(label.map((rule) => rule.selector.includes(SEARCH))).toEqual([true])
    expect(label[0]!.style.getPropertyValue('background').trim()).toBe('var(--wb-semantic-canvas)')
    expect(label[0]!.style.getPropertyValue('min-height').trim()).toBe('var(--wb-cell-minHeight)')
    const tracks = rules().filter((rule) => rule.style.getPropertyValue('grid-template-columns').includes('--wb-form-labelWidth'))
    expect(tracks.length).toBeGreaterThanOrEqual(4)
  })

  /** 글을 받는 조각의 최소 높이는 30px 이다(`space.unit` × 7.5 — 밀도를 따른다). */
  it('입력 조각의 최소 높이는 30px', () => {
    const boxed = rules().filter(
      (rule) => rule.media === null && rule.selector.split(',').some((part) => part.trim() === '[data-wb-component="Input"]'),
    )
    expect(boxed.map((rule) => rule.style.getPropertyValue('min-height').trim())).toEqual(['var(--wb-control-minHeight)'])
    expect(rootPx('--wb-control-minHeight')).toBe(30)
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
