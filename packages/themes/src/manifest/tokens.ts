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
/** 괄호 안은 수 · `%` · `,` · 공백 · `/` 뿐 — 글자를 받으면 `var(` · `url(` 같은 다른 함수가 들어온다. */
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla)\([-+0-9.%\s,/]+\)$/i
const LENGTH = /^(?:0|-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw))$/

/**
 * 글꼴 이름 하나 — 짝이 맞는 따옴표 문자열(안에 따옴표 · `\` · 줄바꿈 · `<` 가 없다), 또는 글자 · 숫자 · `_` · `-` 로 된 낱말들.
 * `<` 를 따옴표 안에서도 막는 것은 `</style>` 이 CSS 문자열과 무관하게 HTML 의 `<style>` 을 닫기 때문이다.
 */
const FONT_FAMILY = String.raw`(?:"[^"\\\r\n<]+"|'[^'\\\r\n<]+'|[\p{L}\p{N}_-]+(?:[ \t]+[\p{L}\p{N}_-]+)*)`
const FONT_LIST = new RegExp(String.raw`^\s*${FONT_FAMILY}(?:\s*,\s*${FONT_FAMILY})*\s*$`, 'u')
/** 그림자 한 개를 이루는 낱말 — 색 함수(괄호 안에 공백이 든다)이거나 공백 없는 낱말. */
const SHADOW_WORD = /(?:rgba?|hsla?)\([^()]*\)|[^\s,()]+/gi

function isColor(value: string): boolean {
  return HEX.test(value) || COLOR_FN.test(value) || COLOR_NAMES.has(value.toLowerCase())
}

/** `inset`? · 길이 2 ~ 4 개(이어서) · 색 한 개까지. 차례는 CSS 와 같게 자유롭되 길이는 붙어 있어야 한다. */
function isOneShadow(text: string): boolean {
  const words = text.match(SHADOW_WORD) ?? []
  // 낱말로 다시 이은 것이 원문(공백 차이 말고)과 같아야 한다 — 짝 없는 괄호 · 쉼표처럼 낱말이 못 된 글자가 없다.
  if (words.join('').replace(/\s+/g, '') !== text.replace(/\s+/g, '')) return false
  let inset = 0
  let colors = 0
  const lengthRuns: number[] = []
  let previousWasLength = false
  for (const word of words) {
    if (LENGTH.test(word)) {
      if (previousWasLength) lengthRuns[lengthRuns.length - 1]! += 1
      else lengthRuns.push(1)
      previousWasLength = true
      continue
    }
    previousWasLength = false
    if (word.toLowerCase() === 'inset') inset += 1
    else if (isColor(word)) colors += 1
    else return false
  }
  return inset <= 1 && colors <= 1 && lengthRuns.length === 1 && lengthRuns[0]! >= 2 && lengthRuns[0]! <= 4
}

function isShadow(value: string): boolean {
  if (value.trim().toLowerCase() === 'none') return true
  // 쉼표는 색 함수 안에도 있다 — 괄호 밖의 쉼표로만 가른다.
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(from, i))
      from = i + 1
    }
    if (depth < 0) return false
  }
  if (depth !== 0) return false
  parts.push(value.slice(from))
  return parts.every((part) => part.trim() !== '' && isOneShadow(part.trim()))
}

/**
 * 토큰 값 하나가 그 타입에 맞는지. 맞으면 `null`, 아니면 이유 한 문장. manifest 의 기본값(`checkTokens`)과 받은 값
 * (`tokensCss` · `tokenValues`)이 이 함수 하나를 쓴다.
 *
 * **값은 `:root { --wb-…: <값>; }` 에 그대로 실린다**(`tokensCss`) — 그래서 여기서 받는 것이 곧 CSS 에 들어가는 것이다.
 * **여섯 타입 모두 허용하는 꼴로 닫는다(거부 목록이 아니다).** 거부 목록은 «선언을 끝내는 글자» 만 보고 «뒤를 삼키는 구문»
 * (주석 `/*` · 짝 없는 괄호 · 따옴표 · 끝의 `\`)을 놓쳐, 값 하나가 뒤 토큰 · 같은 시트의 뒤 규칙까지 무너뜨린다(실 Chrome 으로
 * 잰 표 — `docs/superpowers/plans/2026-09-27-a2-review.md` 「2. 토큰 값 → tokensCss」). 꼴 밖의 함수(`url(` · `image-set(` ·
 * `var(`)도 이 꼴에 없어 저절로 거절된다 — 테마가 그 변수를 이미지 속성에 쓰면 보는 사람의 브라우저가 요청을 낸다.
 */
export function checkTokenValue(decl: Pick<TokenDecl, 'type' | 'options'>, value: unknown): string | null {
  const type: TokenType = decl.type
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? null : '유한한 수가 아닙니다'
  }
  if (typeof value !== 'string') return '문자열이 아닙니다'
  switch (type) {
    case 'color':
      return isColor(value) ? null : '색(#rgb · #rrggbb · #rrggbbaa · rgb() · rgba() · hsl() · 색 이름)이 아닙니다'
    case 'length':
      return LENGTH.test(value) ? null : '길이(0 또는 수 + px · rem · em · % · vh · vw)가 아닙니다'
    case 'font':
      return FONT_LIST.test(value) ? null : '글꼴 이름 목록(쉼표로 가른 낱말 또는 따옴표 문자열)이 아닙니다'
    case 'shadow':
      return isShadow(value) ? null : '그림자(none, 또는 inset? · 길이 2 ~ 4 개 · 색 하나를 쉼표로 가른 목록)가 아닙니다'
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
      // 자기 속성만 본다 — `{toString}` 이 프로토타입의 함수를 집어 «타입이 다르다» 로 읽히지 않게.
      const target = Object.hasOwn(items, ref) ? items[ref] : undefined
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

  // 키 규칙이 `.` 과 `-` 를 함께 받는데 CSS 변수 이름은 `.` 을 `-` 로 바꾼다 — `a.b` 와 `a-b` 가 한 변수가 되면 뒤 선언이 앞을
  // 덮어, 앞 토큰을 고쳐도 화면이 안 바뀌고 `tokenValues`(`useToken`)와 CSS 가 갈린다.
  const byVar = new Map<string, string>()
  for (const key of Object.keys(items)) {
    const name = tokenVar(key)
    const first = byVar.get(name)
    if (first === undefined) byVar.set(name, key)
    else issues.push({ code: 'token-var-collision', path: `tokens.items.${key}`, message: `토큰 ${first} 와 ${key} 가 같은 CSS 변수 ${name} 이 됩니다` })
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
    if (!Object.hasOwn(items, key)) issues.push({ code: 'unknown-token', path: `values.${key}`, message: `선언에 없는 토큰 ${key} 의 값을 버립니다` })
  }
  for (const [key, decl] of Object.entries(items)) {
    // `in` 은 프로토타입을 본다 — 선언한 `toString` 에 값을 안 줘도 «받은 값» 이 되어 거짓 이슈가 났다.
    if (Object.hasOwn(values, key)) {
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
