import type { ThemeManifest, TokenDecl, TokenType } from '@wirebound/theme-sdk'
import type { ManifestIssue } from './schema'

/** `{color.primary}` — 같은 타입 토큰의 참조. 기본값에만 쓴다(spec 「manifest」의 `tokens.items`). */
const REF = /^\{([^{}]+)\}$/

export function tokenRef(value: string | number): string | null {
  if (typeof value !== 'string') return null
  return REF.exec(value)?.[1] ?? null
}

/**
 * CSS 색 이름(CSS Color 4 의 named colors) · `transparent` · `currentcolor`. 목록을 닫는 까닭은 아래
 * `checkTokenValue` 의 머리말이다.
 */
const COLOR_NAMES = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen transparent currentcolor'
  ).split(' '),
)

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla)\(\s*[-+0-9.%\s,/a-z]+\)$/i
const LENGTH = /^(?:0|-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw))$/
/** CSS 선언을 끝내거나 블록을 열고 닫거나 `</style>` 을 여는 글자. 값 하나가 규칙 밖으로 새는 길이다. */
const CSS_BREAKERS = /[;{}<]/

/**
 * 토큰 값 하나가 그 타입에 맞는지. 맞으면 `null`, 아니면 이유 한 문장.
 *
 * **값은 `:root { --wb-…: <값>; }` 에 그대로 실린다**(`tokensCss`) — 그래서 여기서 받는 것이 곧 CSS 에 들어가는
 * 것이다. `color` · `length` 를 꼴로 닫는 까닭은 편집 GUI 가 그 꼴의 컨트롤을 쓰고(spec 「토큰 편집」), 열린 글자를
 * 받으면 `;` 없이도 `red) , url(…` 같은 값이 다른 속성처럼 읽히기 때문이다. `font` · `shadow` 는 꼴이 넓어 닫지
 * 않고 규칙 밖으로 새는 글자만 막는다.
 */
export function checkTokenValue(decl: Pick<TokenDecl, 'type' | 'options'>, value: unknown): string | null {
  const type: TokenType = decl.type
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? null : '유한한 수가 아닙니다'
  }
  if (typeof value !== 'string') return '문자열이 아닙니다'
  switch (type) {
    case 'color':
      return HEX.test(value) || COLOR_FN.test(value) || COLOR_NAMES.has(value.toLowerCase())
        ? null
        : '색(#rgb · #rrggbb · #rrggbbaa · rgb() · rgba() · hsl() · 색 이름)이 아닙니다'
    case 'length':
      return LENGTH.test(value) ? null : '길이(0 또는 수 + px · rem · em · % · vh · vw)가 아닙니다'
    case 'font':
    case 'shadow':
      if (value.trim() === '') return '비어 있습니다'
      return CSS_BREAKERS.test(value) ? '; { } < 를 담을 수 없습니다' : null
    case 'select':
      return decl.options?.includes(value) ? null : `선택지(${(decl.options ?? []).join(' · ')}) 밖의 값입니다`
  }
}

/**
 * 선언된 토큰 전부를 본다 — 기본값의 참조(없는 키 · 타입이 다른 키 · 순환)와 리터럴의 타입.
 * 이슈를 모아서 돌려준다(첫 이슈에서 멈추지 않는다).
 */
export function checkTokens(items: Readonly<Record<string, TokenDecl>>): ManifestIssue[] {
  const issues: ManifestIssue[] = []
  const refOf = new Map<string, string>()

  for (const [key, decl] of Object.entries(items)) {
    const path = `tokens.items.${key}.default`
    const ref = tokenRef(decl.default)
    if (ref !== null) {
      const target = items[ref]
      if (!target) {
        issues.push({ code: 'unknown-token-ref', path, message: `토큰 ${key} 가 없는 토큰 ${ref} 를 가리킵니다` })
      } else if (target.type !== decl.type) {
        issues.push({
          code: 'token-ref-type',
          path,
          message: `토큰 ${key}(${decl.type}) 가 타입이 다른 토큰 ${ref}(${target.type}) 를 가리킵니다`,
        })
      } else {
        refOf.set(key, ref)
      }
      continue
    }
    const reason = checkTokenValue(decl, decl.default)
    if (reason !== null) {
      issues.push({
        code: decl.type === 'select' ? 'token-select-default' : 'token-default-type',
        path,
        message: `토큰 ${key} 의 기본값 ${JSON.stringify(decl.default)} — ${reason}`,
      })
    }
  }

  // 참조는 토큰마다 하나(기본값)라 사슬을 따라가면 된다. 한 고리를 고리의 토큰 수만큼 말하지 않게 한 번만 낸다.
  const reported = new Set<string>()
  for (const start of refOf.keys()) {
    const chain: string[] = []
    let at: string | undefined = start
    while (at !== undefined && !chain.includes(at)) {
      chain.push(at)
      at = refOf.get(at)
    }
    if (at === undefined) continue
    const cycle = chain.slice(chain.indexOf(at))
    const id = [...cycle].sort().join(' ')
    if (reported.has(id)) continue
    reported.add(id)
    issues.push({
      code: 'token-ref-cycle',
      path: `tokens.items.${cycle[0]}.default`,
      message: `토큰 참조가 돕니다: ${[...cycle, cycle[0]].join(' → ')}`,
    })
  }

  return issues
}

/** 토큰 키의 CSS 변수 이름. `color.primary` → `--wb-color-primary`(spec 「토큰이 화면에 닿는 길」). */
export function tokenVar(key: string): string {
  return `--wb-${key.replace(/\./g, '-')}`
}

type TokenValues = Readonly<Record<string, string | number>>

/**
 * 토큰마다 쓸 값 — 받은 값이 그 타입의 검증을 지나면 그것, 아니면 선언의 기본값. 버린 값은 이슈로 돌려준다.
 * 기본값이 참조면 참조 그대로 둔다(`tokensCss` 는 `var()` 로, `tokenValues` 는 따라가서 푼다).
 */
function effectiveValues(
  manifest: ThemeManifest,
  values: TokenValues,
): { chosen: Map<string, string | number>; issues: ManifestIssue[] } {
  const items = manifest.tokens.items
  const issues: ManifestIssue[] = []
  const chosen = new Map<string, string | number>()

  for (const key of Object.keys(values)) {
    if (!(key in items)) issues.push({ code: 'unknown-token', path: `values.${key}`, message: `선언에 없는 토큰 ${key} 의 값을 버립니다` })
  }
  for (const [key, decl] of Object.entries(items)) {
    if (key in values) {
      const value = values[key]!
      const reason = checkTokenValue(decl, value)
      if (reason === null) {
        chosen.set(key, value)
        continue
      }
      issues.push({
        code: decl.type === 'select' ? 'token-select-default' : 'token-default-type',
        path: `values.${key}`,
        message: `토큰 ${key} 의 값 ${JSON.stringify(value)} 을 버리고 기본값을 씁니다 — ${reason}`,
      })
    }
    // 기본값도 한 번 더 본다 — 검증을 안 거친 manifest 의 값이 `:root` 블록 밖으로 새지 않게.
    if (tokenRef(decl.default) !== null || checkTokenValue(decl, decl.default) === null) chosen.set(key, decl.default)
  }
  return { chosen, issues }
}

/**
 * 토큰을 CSS 변수 선언 한 블록으로(spec 「토큰이 화면에 닿는 길」). `values` 는 기본값과 다른 값만 받는다(프로젝트의
 * `theme_tokens`). 참조 기본값은 `var(--wb-…)` 라 대상의 값을 덮으면 따라온다.
 */
export function tokensCss(manifest: ThemeManifest, values: TokenValues = {}): { css: string; issues: ManifestIssue[] } {
  const { chosen, issues } = effectiveValues(manifest, values)
  let css = ':root {\n'
  for (const [key, value] of chosen) {
    const ref = tokenRef(value)
    css += `  ${tokenVar(key)}: ${ref === null ? String(value) : `var(${tokenVar(ref)})`};\n`
  }
  return { css: `${css}}\n`, issues }
}

/** `useToken` 에 넘길 값 — 참조를 따라가 푼 값. 풀 수 없는 참조(없는 키 · 순환)는 싣지 않는다. */
export function tokenValues(manifest: ThemeManifest, values: TokenValues = {}): Record<string, string | number> {
  const { chosen } = effectiveValues(manifest, values)
  const resolved: Record<string, string | number> = {}
  for (const key of chosen.keys()) {
    const seen = new Set<string>()
    let value = chosen.get(key)
    let ref = value === undefined ? null : tokenRef(value)
    while (ref !== null && !seen.has(ref)) {
      seen.add(ref)
      value = chosen.get(ref)
      ref = value === undefined ? null : tokenRef(value)
    }
    if (value !== undefined && ref === null) resolved[key] = value
  }
  return resolved
}
