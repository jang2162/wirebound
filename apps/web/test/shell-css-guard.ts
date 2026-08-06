/**
 * `shell.css`가 설계 D7을 지키는지 보는 검사. 규칙의 뜻과 근거는 `shell.css` 머리말에 있고,
 * 여기 있는 것은 **그 규칙을 기계가 보는 형태**다.
 *
 * **왜 rg 명령이 아니라 파서인가.** 앞 라운드까지 이 검사는 `shell.css` 주석에 적힌 `rg`
 * 명령 셋이었다. 리뷰가 표로 적은 위반 열넷을 심어 재보니 **열넷 다 빠져나갔다** — 정규식이
 * 속성 이름 목록을 훑는 형태라 목록에 없는 상속 속성(`font-weight`·`list-style`·
 * `pointer-events`…)을 못 보고, `{` 앞의 공백 하나에 매여 있어 `.a{ color: red }`도
 * 못 봤다. 그래서 두 가지를 바꿨다.
 *
 * 1. **포맷을 보지 않는다.** 주석을 걷고 중괄호를 세어 규칙으로 가르므로 줄바꿈·공백·
 *    콤마 나열이 결과를 바꾸지 않는다.
 * 2. **허용 목록으로 뒤집었다.** 문서를 감싸는 상자에는 *열거한 것만* 걸 수 있다. 금지
 *    목록이면 내가 열거하지 못한 상속 속성이 그대로 새지만, 허용 목록이면 열거하지 않은
 *    속성은 상속되든 아니든 일단 걸린다.
 *
 * **이 검사가 보지 못하는 것**(고의로 열어 둔 것이 아니라, 못 보는 것):
 *
 * - `shell.css` **밖의** 스타일. `.tsx`의 인라인 `style`, `<style>` 태그, 다른 CSS 파일은
 *   읽지 않는다. 라운드 2에서 다시 센 값: `apps/web/src`의 CSS 파일은 `shell.css` 하나,
 *   `<style>` 태그는 없고, 인라인 `style`은 **둘**이다 — 캔버스 프레임의 폭·줌
 *   (`routes/editor.tsx`)과 선택 아웃라인의 자리(`canvas/canvas.tsx`). 둘 다 상속되지
 *   않는 속성이라 지금은 문서로 새지 않지만, **검사가 보고 있어서 안전한 것이 아니다.**
 * - `WRAPPERS`에 없는 상자. 문서를 감싸는 상자가 새로 생기면 **사람이 여기 더해야** 한다.
 *   그 목록은 `canvas/canvas.tsx`·`routes/editor.tsx`가 무엇을 감싸는지에 매여 있고,
 *   검사가 스스로 알아낼 방법이 없다.
 * - 주석 걷기를 속이는 형태. 주석 여는 기호가 CSS 문자열 안에 들어 있으면 파서가 거기서
 *   부터 잘못 읽는다. **지금 파일의 CSS 문자열에는 중괄호도 주석 기호도 없다** — 문자열
 *   자체는 10줄에 있다(`grid-template-areas`의 두 줄, `'Segoe UI'` 다섯 줄, 속성 선택자
 *   세 줄). 즉 오늘 파서를 속이는 것이 없을 뿐, 문자열을 다루지 않아도 되는 것은 아니다.
 *   흔한 형태(`content: "{"`)에서는 `unreadable`을 내고 **거기서 스캔을 멈춘다** — 조용히
 *   지나가지는 않지만 그 뒤의 위반은 보고되지 않는다.
 * - **CSS 중첩. 실질적인 사각이다.** 비-wrapper 규칙 안의 중첩은 완전히 보이지 않는다
 *   (실측: `.wb-shell-header { .planted { color: blue } }`·`{ & div { … } }`·
 *   `{ @media (…) { … } }` 전부 **0건**). 감싸는 상자 넷 안의 중첩은 `checkWrapperBody`가
 *   선언 파서로 훑다가 우연히 걸리지만 메시지가 틀린 말을 한다. 그리고
 *   `.wb-shell-header { & ~ .wb-shell-canvas * { font-family: serif } }`처럼 중첩 안에서
 *   결합자로 문서까지 뻗으면 **진짜 D7 위반이 검사를 통과한다**(실측 0건). CSS 중첩은
 *   오늘 브라우저에 다 있으므로 P4a·P4b가 쓰기 전에 닫아야 한다.
 * - **`@import`.** 조용히 0건이다(실측: `@import url('other.css');`). `shell.css`가 다른
 *   파일을 import하면 그 안의 규칙 전부가 검사 밖에 놓인다. `@font-face`를 fail-loud로
 *   막은 것과 같은 이유로 막는 편이 일관된다.
 * - **`@keyframes`의 이름과 그 안의 선언.** 통째로 건너뛴다(`scanRules`의 주석 — 거짓
 *   양성을 없애려고 그렇게 뒀다). 애니메이션 이름에 `wb-shell-` 접두어가 있는지 보지
 *   않는다.
 *
 * **거짓 양성으로 남겨 둔 것 둘**(잰 값이다):
 *
 * - 선언만 갖는 at-rule(`@font-face` 등)은 `unreadable`을 낸다. **설계된 fail-loud다** —
 *   조용히 지나가면 그 안이 검사 밖에 놓이므로, 메시지가 "검사를 확장하고 나서 써라"라고
 *   말한다.
 * - 규칙이 하나도 없는 `@media (…) { }`도 같은 이유로 `unreadable`이 된다. 규칙 없는
 *   미디어 쿼리는 죽은 코드라 실질적으로 무해하다.
 */

/** 검사 이름. 어느 규칙이 물었는지가 실패 메시지와 양성 대조 표에 그대로 나온다. */
export type CheckName =
  | 'selector-prefix'
  | 'selector-combinator'
  | 'selector-class'
  | 'selector-function'
  | 'wrapper-property'
  | 'wrapper-variable'
  | 'unreadable'

export interface Violation {
  check: CheckName
  /** 문제가 된 선택자(공백을 한 칸으로 고른 형태). 읽을 수 없는 조각이면 그 조각이다. */
  selector: string
  message: string
}

/**
 * 문서를 **감싸는** 상자들. 여기 걸린 상속 속성은 선택자가 문서 노드를 겨냥하지 않아도
 * 자식으로 물려 내려간다 — 선택자 검사가 못 보는 누수라 속성으로 따로 본다.
 *
 * 넷인 이유는 `shell.css` 머리말 4번에 있다(`.wb-shell` → `.wb-shell-canvas` →
 * `.wb-shell-canvas-frame` → `.wb-shell-canvas-surface` 안에 문서가 들어온다).
 */
const WRAPPERS = new Set([
  'wb-shell',
  'wb-shell-canvas',
  'wb-shell-canvas-frame',
  'wb-shell-canvas-surface',
])

/**
 * 감싸는 상자에 걸 수 있는 속성. **여기 없는 것은 전부 위반이다.**
 *
 * 지금 목록은 그 넷이 실제로 쓰는 속성 그대로이고, 전부 상속되지 않는 속성이다. 새 속성이
 * 필요하면 **상속되지 않는지 확인한 뒤** 여기 더해라 — 그 확인을 사람이 한 번 하라는 것이
 * 이 목록의 목적이다. 상속되는 속성은 셸이 실제로 그리는 조각(머리·좌측·우측·안내 화면)에
 * 걸면 되고, 그 조각들은 이 검사의 대상이 아니다.
 */
const WRAPPER_PROPERTIES = new Set([
  'position',
  'inset',
  'display',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-area',
  'gap',
  'background',
  'min-width',
  'min-height',
  'overflow',
  'padding',
  'margin',
  'transform-origin',
  'box-shadow',
])

/** 셸의 클래스·변수 접두어. 테마가 쓰는 이름과 겹칠 수 없다는 것이 D7의 1번이다. */
const PREFIX = 'wb-shell'

interface Rule {
  prelude: string
  body: string
}

/** `shell.css` 전문에서 D7 위반을 찾는다. 빈 배열이면 위반이 없다. */
export function findViolations(css: string): Violation[] {
  const violations: Violation[] = []
  const rules: Rule[] = []

  scanRules(stripComments(css), rules, violations)

  for (const rule of rules) {
    const selectors = splitTop(rule.prelude, ',')
    for (const selector of selectors) checkSelector(selector, violations)

    // 선택자 목록 중 **하나라도** 감싸는 상자면 그 블록의 선언 전부가 그 상자에 걸린다.
    // 첫 클래스만 보지 않는 것은 `.wb-shell-title.wb-shell-canvas-frame`처럼 감싸는 상자가
    // 뒤에 오는 형태를 놓치지 않기 위해서다. 결합자가 있는 선택자는 여기서 빼는데, 그 선언이
    // 걸리는 것은 상자가 아니라 그 **안쪽**이기 때문이다 — 그런 선택자는 이미 위에서 걸렸고,
    // 여기까지 세면 메시지가 "상자에 건 속성"이라고 잘못 말한다.
    const wrappers = selectors.filter(
      (selector) =>
        !hasCombinator(selector) &&
        classNames(skeleton(selector)).some((name) => WRAPPERS.has(name)),
    )
    if (wrappers.length > 0) checkWrapperBody(rule.body, wrappers.join(', '), violations)
  }

  return violations
}

/** 주석을 걷는다. 주석 안의 선택자·속성이 검사에 걸리면 안 된다(머리말이 그 예를 든다). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * 중괄호를 세어 규칙으로 가른다. **선택자와 `{` 사이의 공백을 보지 않는다** — 앞 라운드의
 * `rg` 검사가 정확히 그 공백 하나에 매여 있었다.
 *
 * `@media`처럼 안에 규칙을 품는 at-rule은 안으로 들어가고, 선언만 갖는 at-rule
 * (`@font-face` 등)은 **읽을 수 없다고 신고한다** — 조용히 지나가면 그 안의 규칙이
 * 검사 밖에 놓인다.
 */
function scanRules(css: string, rules: Rule[], violations: Violation[]): void {
  let index = 0
  let start = 0

  while (index < css.length) {
    const char = css[index]

    if (char === '{') {
      const prelude = css.slice(start, index).trim()
      const end = matchBrace(css, index)

      if (end === -1) {
        violations.push({
          check: 'unreadable',
          selector: normalize(prelude),
          message: '닫히지 않은 블록이라 검사가 이 아래를 읽지 못한다',
        })
        return
      }

      const body = css.slice(index + 1, end)

      if (prelude.startsWith('@')) {
        // **`@keyframes`는 통째로 건너뛴다.** 안의 `from`·`to`·`50%`는 선택자가 아니라
        // 키프레임 선택자인데, 그것을 규칙으로 세면 `` `.wb-shell…` 클래스로 시작하지
        // 않는다 ``는 엉뚱한 말로 **정당한 CSS를 막는다**(실측: `@keyframes wb-shell-spin
        // { from{…} to{…} }` 하나가 `selector-prefix` 2건을 냈다).
        //
        // 안의 선언이 문서로 새지 않는 것은 **애니메이션을 감싸는 상자에 걸 수 없기**
        // 때문이다 — `animation`도 `animation-name`도 `WRAPPER_PROPERTIES`에 없어 그
        // 자리에서 먼저 걸린다. 대신 **애니메이션 이름의 접두어는 보지 않는다**(아래
        // 머리말의 못 보는 것 목록).
        if (!isKeyframes(prelude)) {
          if (body.includes('{')) scanRules(body, rules, violations)
          else
            violations.push({
              check: 'unreadable',
              selector: normalize(prelude),
              message: '이 at-rule은 검사가 다루지 않는다 — 검사를 확장하고 나서 써라',
            })
        }
      } else if (prelude !== '') {
        rules.push({ prelude, body })
      }

      index = end + 1
      start = index
      continue
    }

    if (char === '}') {
      // 짝 없는 닫는 괄호. 여기서 멈추면 뒤가 통째로 안 보이므로 다음 규칙부터 다시 읽는다.
      index += 1
      start = index
      continue
    }

    index += 1
  }
}

/**
 * `@keyframes`인가. 뒤에 애니메이션 이름이 붙으므로 전체가 아니라 앞부분으로 본다.
 * 벤더 접두어(`@-webkit-keyframes`)도 같이 잡는다.
 */
function isKeyframes(prelude: string): boolean {
  return /^@(-[a-z]+-)?keyframes\b/i.test(prelude)
}

/** `open`의 `{`와 짝이 되는 `}`의 위치. 없으면 `-1`이다. */
function matchBrace(css: string, open: number): number {
  let depth = 0

  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/**
 * 괄호·대괄호·따옴표 안을 건너뛰며 `separator`로 가른다. 선택자 목록의 콤마와 선언의
 * 세미콜론이 같은 함수를 쓴다.
 */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let buffer = ''

  for (const char of text) {
    if (quote !== null) {
      buffer += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      buffer += char
      continue
    }
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1

    if (char === separator && depth === 0) {
      parts.push(buffer)
      buffer = ''
      continue
    }
    buffer += char
  }

  parts.push(buffer)
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * 선택자 하나를 본다. 허용하는 형태는 **`wb-shell` 클래스 하나로 시작하는 복합 선택자
 * 하나**뿐이다 — 결합자도, 함수형 의사 클래스도 없다.
 *
 * 이 한 문장이 D7의 2·3번을 함께 막는다. 요소 선택자(`div`)·전체 선택자(`*`)·속성 선택자
 * (`[data-wb-id]`)·id 선택자는 전부 "`wb-shell` 클래스로 시작하지 않는다"에 걸리고,
 * 자손·자식·형제는 "결합자가 있다"에 걸린다.
 */
function checkSelector(selector: string, violations: Violation[]): void {
  const shown = normalize(selector)
  const bare = skeleton(selector)

  // 함수형 의사 클래스는 안에 **선택자 목록**을 품는다(`:is(div)`). 그 안을 따로 보는 대신
  // 통째로 막는다 — 셸에는 필요한 자리가 없고, 열어 두면 여기로 요소 선택자가 들어온다.
  const functional = /:[a-zA-Z-]+\(/.exec(bare)
  if (functional !== null) {
    violations.push({
      check: 'selector-function',
      selector: shown,
      message: `함수형 의사 클래스(${functional[0]})는 안에 선택자를 품는다 — 쓰지 않는다`,
    })
  }

  const outside = stripParens(bare)
  if (hasCombinator(selector)) {
    violations.push({
      check: 'selector-combinator',
      selector: shown,
      message:
        '결합자(자손·자식·형제·전체)는 셸의 상자 안에 들어올 내용까지 겨냥한다 — 클래스를 직접 붙여라',
    })
  }

  const base = baseClass(selector)
  if (base === null || !isShellName(base)) {
    violations.push({
      check: 'selector-prefix',
      selector: shown,
      message: `\`.${PREFIX}…\` 클래스로 시작하지 않는다 — 요소·전체·속성·id 선택자는 문서 노드에 그대로 닿는다`,
    })
  }

  for (const name of classNames(outside)) {
    if (!isShellName(name)) {
      violations.push({
        check: 'selector-class',
        selector: shown,
        message: `\`.${name}\`에 \`${PREFIX}-\` 접두어가 없다 — 테마가 쓰는 이름과 겹칠 수 있다`,
      })
    }
  }
}

/**
 * 감싸는 상자의 선언을 본다. **허용 목록 밖은 전부 위반이다**(위 `WRAPPER_PROPERTIES`).
 *
 * 커스텀 프로퍼티는 따로 본다. `--wb-shell-*`는 두기로 한 예외이고(머리말 4번), 접두어 없는
 * 변수는 테마의 변수 이름과 겹칠 수 있어 막는다 — 앞 라운드의 `rg` 검사는 속성 이름 목록을
 * 훑는 형태라 `--*`를 아예 보지 못했다.
 */
function checkWrapperBody(body: string, selector: string, violations: Violation[]): void {
  for (const declaration of splitTop(body, ';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue

    const property = declaration.slice(0, colon).trim().toLowerCase()
    if (property === '') continue

    if (property.startsWith('--')) {
      if (!property.startsWith(`--${PREFIX}-`)) {
        violations.push({
          check: 'wrapper-variable',
          selector,
          message: `\`${property}\`는 문서 안까지 물려 내려간다 — 셸의 변수에는 \`--${PREFIX}-\` 접두어를 붙여라`,
        })
      }
      continue
    }

    if (!WRAPPER_PROPERTIES.has(property)) {
      violations.push({
        check: 'wrapper-property',
        selector,
        message: `\`${property}\`는 문서를 감싸는 상자의 허용 목록에 없다 — 상속되지 않는 속성임을 확인했다면 \`WRAPPER_PROPERTIES\`에 더해라`,
      })
    }
  }
}

/**
 * 결합자(자손·자식·형제)가 있는가. 대괄호·따옴표·괄호 안은 빼고 본다 — `[href^='a b']`의
 * 공백이나 `:not(a > b)`의 `>`를 결합자로 세면 안 된다.
 */
function hasCombinator(selector: string): boolean {
  return /[>+~]|\s/.test(stripParens(skeleton(selector)).trim())
}

/** 선택자의 첫 클래스 이름. 클래스로 시작하지 않으면 `null`이다. */
function baseClass(selector: string): string | null {
  const match = /^\.([A-Za-z0-9_-]+)/.exec(skeleton(selector).trim())
  return match?.[1] ?? null
}

/** 선택자에 나오는 클래스 이름 전부. */
function classNames(selector: string): string[] {
  return [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1] ?? '')
}

function isShellName(name: string): boolean {
  return name === PREFIX || name.startsWith(`${PREFIX}-`)
}

/**
 * 대괄호와 따옴표 안을 지운 형태. 그 안의 문자는 결합자도 클래스도 아니다 —
 * `[data-x="a.b"]`의 `.b`를 클래스로 세면 안 된다.
 */
function skeleton(selector: string): string {
  let out = ''
  let quote: string | null = null
  let bracket = 0

  for (const char of selector) {
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[') {
      bracket += 1
      out += '['
      continue
    }
    if (char === ']') {
      bracket -= 1
      out += ']'
      continue
    }
    if (bracket > 0) continue
    out += char
  }

  return out
}

/** 괄호 안을 지운다. 결합자 검사가 `:not(a > b)` 안의 `>`를 세지 않게 한다. */
function stripParens(selector: string): string {
  let out = ''
  let depth = 0

  for (const char of selector) {
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      continue
    }
    if (depth > 0) continue
    out += char
  }

  return out
}

/** 여러 줄에 걸친 선택자를 한 줄로 — 실패 메시지에 그대로 나오는 값이다. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
