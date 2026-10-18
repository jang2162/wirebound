/**
 * system-portal 의 선언(manifest)과 시트(`theme.css`)가 옛 JSON 테마 `portal` 의 성질을 지키는지 잰다. 옛 원천은
 * `git show b2766e8c^:packages/themes/src/system/portal.ts`(머리말의 «무엇이 다른가» 셋)와 그 테스트
 * `git show b2766e8c^:packages/themes/test/system-{portal,section-centered,unresolved-literals}.test.ts` 다 — 옛 케이스가
 * 잰 것을 코드 테마의 꼴(manifest 토큰 · 시트의 글자)로 다시 잰다.
 *
 * **시트는 글자로 잰다 — 계산값이 아니다.** 규칙이 실제로 이기는지 · 글꼴이 실리는지는 jsdom 이 못 본다. 실 Chromium 의 모습은
 * `wb-theme shots` 로 본다(`pnpm --filter @wirebound/system-theme-portal shots`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { PORTAL_THEME, PORTAL_THEME_CSS } from '@wirebound/system-theme-portal'

beforeAll(() => installCatalog())

const manifest = PORTAL_THEME.manifest
const css = PORTAL_THEME_CSS
const tokenVar = (key: string) => `--wb-${key.replaceAll('.', '-')}`

/** 셀렉터가 글자 그대로 같은 규칙의 본문. 없으면 던진다 — 빈 본문으로 초록이 되지 않게. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {\n`)
  if (start < 0) throw new Error(`규칙이 없다: ${selector}`)
  return css.slice(start, css.indexOf('\n}', start + 1))
}

/** `:root { … }` 의 변수 정의. */
function rootVars(): Map<string, string> {
  const body = rule(':root')
  return new Map([...body.matchAll(/^\s*(--wb-[\w-]+):\s*(.+);$/gm)].map((m) => [m[1]!, m[2]!]))
}

describe('system-portal manifest', () => {
  it('id · 판 · sdk 범위 · 이름은 옛 meta 그대로', () => {
    expect(manifest.id).toBe('system-portal')
    expect(manifest.version).toBe('1.2.0')
    expect(manifest.sdk).toBe('^1.2.0')
    expect(manifest.name).toBe('포털')
    expect(manifest.description).toBe('기관·사내 포털 테마. 선으로 구역을 나누고, 목록은 제목과 날짜 줄로, 분류는 접었다 편다.')
  })

  /** 토큰 폼이 수십 칸이 되지 않게(계획 D4 — 테마당 12 ~ 30) · 폼의 무리와 한국어 이름을 갖는다. */
  it('선언 토큰은 12 ~ 30 개이고 모두 선언된 무리 · 한국어 label 을 갖는다', () => {
    const items = Object.entries(manifest.tokens.items)
    expect(items.length).toBeGreaterThanOrEqual(12)
    expect(items.length).toBeLessThanOrEqual(30)
    const groups = new Set((manifest.tokens.groups ?? []).map((g) => g.id))
    for (const [key, decl] of items) {
      expect(groups.has(decl.group ?? ''), key).toBe(true)
      expect(decl.label, key).toMatch(/[가-힣]/)
    }
    // 쓰지 않는 무리를 폼에 내놓지 않는다.
    for (const group of groups)
      expect(
        items.some(([, d]) => d.group === group),
        group,
      ).toBe(true)
  })

  it('토큰마다 CSS 의 :root 에 같은 이름 · 같은 기본값의 변수가 있다', () => {
    const vars = rootVars()
    for (const [key, decl] of Object.entries(manifest.tokens.items)) expect(vars.get(tokenVar(key)), key).toBe(String(decl.default))
  })

  it('components 선언은 카탈로그의 이름만 쓰고 · variant 를 prop 에서 얻는 셋은 선언하지 않는다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(manifest.components ?? {})) expect(catalog.has(type), type).toBe(true)
    for (const type of ['Text', 'Field', 'Divider']) expect(manifest.components?.[type], type).toBeUndefined()
  })

  /**
   * 옛 테마가 `admin` 과 달리 고른 구조 일곱(옛 머리말 «`admin`이 안 고르는 구조 일곱») — 그것이 `defaultVariant` 이고,
   * `admin` 이 고르는 구조가 곁의 variant 다. 한 문서에 둘 다 둘 수 있다(계획 D4).
   */
  it.each([
    ['Card', 'bordered', 'plain'],
    ['Tabs', 'enclosed', 'underline'],
    ['List', 'stackedList', 'table'],
    ['Tree', 'accordion', 'indent'],
    ['KeyValue', 'definitionList', 'table'],
    ['SearchForm', 'collapsible', 'inline'],
    ['EntryForm', 'sectioned', 'labelLeft'],
  ])('%s: 옛 구조 %s 가 defaultVariant · admin 의 %s 가 곁에 선다', (type, chosen, adminStructure) => {
    const decl = manifest.components?.[type]
    expect(decl?.defaultVariant).toBe(chosen)
    expect(decl?.variants.map((v) => v.id)).toEqual(expect.arrayContaining([chosen, adminStructure]))
  })

  /** 옛 스킨 variant 는 같은 id 로 남는다 — `system-admin` 에서 옮겨 온 노드의 variant 가 그대로 산다. */
  it.each([
    ['Section', ['default', 'hero', 'muted']],
    ['Card', ['featured']],
    ['List', ['featured', 'compact']],
    ['Button', ['default', 'primary', 'secondary', 'danger', 'ghost']],
    ['Link', ['default', 'muted']],
  ])('%s: 옛 스킨 variant %j 를 선언한다', (type, ids) => {
    expect(manifest.components?.[type]?.variants.map((v) => v.id)).toEqual(expect.arrayContaining(ids))
  })

  /** 옛 `patterns` 의 `content.noticeBoard` — 포털에서 가장 되풀이되는 «검색 + 목록». */
  it('패턴 content.noticeBoard 를 옮긴다', () => {
    const board = manifest.patterns?.['content.noticeBoard'] as { name: string; schema: { children: { type: string }[] } }
    expect(board.name).toBe('공지 목록')
    expect(board.schema.children.map((c) => c.type)).toEqual(['Text', 'SearchForm', 'List'])
  })
})

/**
 * 옛 `system-portal.test.ts` «서체의 두 층이 같은 이름을 가리킨다». `@font-face` 가 선언한 이름과 글꼴 토큰의 첫 항목을 잇는 것은
 * 글자 하나뿐이라, 한쪽만 고치면 글꼴이 조용히 폴백으로 그려진다.
 */
describe('서체의 두 층이 같은 이름을 가리킨다', () => {
  const FONT = 'typography.family.sans'
  const faces = () => [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]!)

  it('글꼴 토큰의 첫 항목이 @font-face 가 선언한 이름이다', () => {
    const stack = String(manifest.tokens.items[FONT]?.default)
    const first = stack.split(',')[0]!.trim()
    expect(faces().length).toBeGreaterThan(0)
    for (const face of faces()) expect(face).toContain(`font-family: ${first};`)
  })

  /** 네트워크를 안 쓴다 — 내보낸 설계서는 오프라인에서 열린다. 로컬 글꼴이 없으면 토큰의 뒤쪽 폴백이 그린다. */
  it('@font-face 의 src 는 local() 뿐이다', () => {
    for (const face of faces()) {
      const src = /src:\s*([^;]+);/.exec(face)![1]!
      expect(
        src.split(/,\s*(?=local\()/).every((s) => /^local\("[^"]+"\)$/.test(s.trim())),
        src,
      ).toBe(true)
    }
  })

  /** 문서 뿌리가 상속의 뿌리이고, `<button>` 은 UA 시트가 제 글꼴을 박아 상속을 안 받는다 — 두 자리에 건다. */
  it('Page 뿌리와 Button 이 그 토큰을 font-family 로 건다', () => {
    const declaration = `font-family: var(${tokenVar(FONT)});`
    expect(rule('[data-wb-component="Page"]')).toContain(declaration)
    expect(rule('[data-wb-component="Button"]')).toContain(declaration)
  })
})

/**
 * 옛 `system-section-centered.test.ts` — 가둔 칼럼을 가운데 둔다. 포털은 `admin` 과 달리 폭을 가둔다(옛 머리말 답 1 — 1280px).
 * 레이아웃이 아니라 시트의 값을 잰다. 화면에서 가운데 오는지는 `wb-theme shots` 1280 폭 그림으로 본다.
 */
describe('Section 은 가둔 칼럼을 가운데 둔다', () => {
  it('inner 가 본문 폭 토큰으로 가둬지고 좌우 여백이 auto 다', () => {
    const inner = rule('[data-wb-component="Section"] > [data-wb-part="inner"]')
    expect(inner).toContain('max-width: var(--wb-container-maxWidth);')
    expect(inner).toContain('margin-left: auto;')
    expect(inner).toContain('margin-right: auto;')
    expect(manifest.tokens.items['container.maxWidth']?.default).toBe('1280px')
  })

  it('inner 의 margin 을 다른 값으로 덮는 규칙이 없다', () => {
    const overrides = [...css.matchAll(/([^{}]*\[data-wb-part="inner"\][^{}]*)\{([^}]*)\}/g)].filter((m) =>
      [...m[2]!.matchAll(/margin(?:-left|-right|-inline)?:\s*([^;]+);/g)].some((d) => d[1]!.trim() !== 'auto'),
    )
    expect(overrides.map((m) => m[1]!.trim())).toEqual([])
  })
})

/** 옛 머리말 답 2 «면이 아니라 선으로 나눈다» — 그림자를 한 번도 쓰지 않고 모서리는 2 ~ 4px 이다. */
describe('면이 아니라 선으로 나눈다', () => {
  it('시트에 box-shadow 가 없다', () => {
    expect(css).not.toMatch(/box-shadow/)
  })

  it('모서리 토큰은 4px 이하다', () => {
    const radii = Object.entries(manifest.tokens.items).filter(([key]) => key.startsWith('radius.'))
    expect(radii.length).toBeGreaterThan(0)
    for (const [key, decl] of radii) expect(parseFloat(String(decl.default)), key).toBeLessThanOrEqual(4)
  })
})

/**
 * 옛 `system-unresolved-literals.test.ts` — 참조가 안 풀린 값은 오류 없이 CSS 에 실리고 브라우저가 그 선언을 버린다. 코드 테마에서
 * 그 꼴은 둘이다: 점 찍힌 맨 이름(`container.maxWidth`)이 값에 남는 것, `:root` 에 없는 변수를 `var()` 로 읽는 것(대체값 없이는
 * 선언이 무효가 된다).
 */
describe('시트의 미해석 값', () => {
  /** 선언 값에서 `var()` 밖에 남은 점 찍힌 맨 식별자. 소수(`1.5`)는 첫 글자가 알파벳이 아니라 안 걸린다. */
  const BARE_DOTTED = /(?<![-\w.(])([A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+)(?![-\w.])/g

  function declarations(source: string): { property: string; value: string }[] {
    return [...source.matchAll(/^\s*([-a-zA-Z]+):\s*(.+);$/gm)].map((m) => ({ property: m[1]!, value: m[2]! }))
  }

  function unresolved(source: string): string[] {
    return declarations(source).flatMap(({ property, value }) =>
      [...value.replace(/url\([^)]*\)/gi, 'URL').matchAll(BARE_DOTTED)].map((m) => `${property}: ${m[1]}`),
    )
  }

  /** `var(--wb-…)` 가운데 `:root` 에 정의가 없는 것. 노드 변수(`--wb-node-*`)는 뷰가 싣고 대체값을 함께 적는다. */
  function undefinedVars(source: string, defined: ReadonlySet<string>): string[] {
    return [...source.matchAll(/var\(\s*(--wb-[\w-]+)\s*([,)])/g)]
      .filter((m) => !defined.has(m[1]!) && !(m[1]!.startsWith('--wb-node-') && m[2] === ','))
      .map((m) => m[1]!)
  }

  it('점 찍힌 맨 이름이 값에 남지 않는다', () => {
    expect(unresolved(css)).toEqual([])
  })

  it('읽는 변수는 전부 :root 에 있다', () => {
    const defined = new Set(rootVars().keys())
    // 양성 대조: 읽는 변수가 실제로 있다. 없으면 아래 단언은 빈 배열에서 초록이다.
    expect([...css.matchAll(/var\(--wb-/g)].length).toBeGreaterThan(50)
    expect(undefinedVars(css, defined)).toEqual([])
  })

  it('검사기가 미해석 꼴을 실제로 잡고, 해석된 것은 안 잡는다', () => {
    expect(unresolved('  max-width: container.maxWidth;')).toEqual(['max-width: container.maxWidth'])
    expect(unresolved('  gap: var(--wb-space-6);')).toEqual([])
    expect(unresolved('  line-height: 1.7;')).toEqual([])
    expect(unresolved('  font-family: "Portal Sans", system-ui;')).toEqual([])
    const defined = new Set(['--wb-a'])
    expect(undefinedVars('  color: var(--wb-a); gap: var(--wb-b);', defined)).toEqual(['--wb-b'])
    expect(undefinedVars('  aspect-ratio: var(--wb-node-media-ratio, 16/9);', defined)).toEqual([])
    expect(undefinedVars('  aspect-ratio: var(--wb-node-media-ratio);', defined)).toEqual(['--wb-node-media-ratio'])
  })
})
