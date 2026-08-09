import type { ThemeIssue } from '../issue'
import { issue } from '../issue'

export interface FunctionScan {
  /**
   * 값에 나온 함수 이름. **소문자로 정규화한다** — CSS는 함수 이름의 대소문자를 가리지
   * 않으므로 `URL(/a.png)`와 `url(/a.png)`가 같은 것으로 읽혀야 한다. 정규화하기 전에는
   * `bgImage`가 `URL(/a.png)`를 거부했다(심어서 봤다).
   */
  names: string[]
  /**
   * 여는 괄호 앞에 함수 이름이 없다 — `(1px)`·`calc (1px)`·`calc\t(1px)`.
   *
   * 이 갈래를 따로 두는 이유는 **이름을 못 찾으면 `names`가 비어 함수 검사 자체를
   * 건너뛰기 때문**이다. 그러면 §6.8이 금지한 모양이 괄호 균형만으로 통과했다(심어서 봤다).
   * CSS 값에서 괄호는 함수 호출로만 나오므로, 이름 없는 괄호는 유효한 값이 아니다.
   */
  bare: boolean
  nested: boolean
  balanced: boolean
}

/**
 * 값 문자열의 함수 호출을 훑는다. CSS 파서를 들이지 않는다 — **문자열을 만드는 것이지
 * 파싱하는 것이 아니다**(계획 Tech Stack). 여는 괄호 앞의 식별자를 함수 이름으로 보고,
 * 깊이가 0이 아닌 자리의 여는 괄호를 중첩으로 본다.
 */
export function scanFunctions(value: string): FunctionScan {
  const names: string[] = []
  let depth = 0
  let nested = false
  let bare = false
  let balanced = true

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '(') {
      if (depth > 0) nested = true
      const name = /([A-Za-z][A-Za-z0-9-]*)$/.exec(value.slice(0, index))?.[1]
      if (name === undefined) bare = true
      else names.push(name.toLowerCase())
      depth += 1
    } else if (char === ')') {
      depth -= 1
      if (depth < 0) {
        balanced = false
        break
      }
    }
  }

  return { names, bare, nested, balanced: balanced && depth === 0 }
}

/**
 * 값이 CSS 문법을 깨고 나가는 문자를 담고 있는지 본다.
 *
 * 방출은 값을 **그대로 CSS 문자열에 붙인다**(파서를 들이지 않는 것이 이 패키지의 결정이다).
 * 그래서 값이 선언이나 블록을 끝낼 수 있으면 **화이트리스트가 승인하지 않은 규칙이 나간다.**
 * 심어서 확인했다 — `bg: "red; } body{display:none"`·`"#fff }"`·`"a{b}"`·`"red;color:blue"`가
 * 이슈 없이 선언에 실렸다.
 *
 * 막는 것과 이유:
 * - `{` `}` `;` — 선언과 블록의 끝. 새 규칙을 쓸 수 있다.
 * - `<` `>` — §6.11이 컴파일된 CSS를 `<style>`로 주입한다고 적었다. **jsdom에 실제로 넣어
 *   봤다**: 값에 `</style>`이 들어가면 스타일 블록이 그 자리에서 끝나 뒤쪽 CSS가 문서 본문
 *   텍스트로 새고 규칙 수가 줄었다(대문자·공백 변형 `</STYLE >`도 같다). `<b>`는 아무 일도
 *   하지 않으므로 꺾쇠를 통째로 막은 것은 `</style>` 하나보다 넓다 — 변형이 많아 넓게 막았다.
 * - `\` — CSS 이스케이프로 위의 어느 것이든 다시 쓸 수 있다(`\7d`이 `}`다).
 * - `/*` `*\/` — 주석이 뒤따르는 규칙을 삼킨다.
 * - 개행(`\n`·`\r`·`\f`) — 방출은 **선언마다 한 줄**을 쓴다. 값에 개행이 들어가면 세미콜론
 *   없이 끝나는 줄이 생긴다(`test/emit-parse.test.ts`가 그것을 관측한다).
 *
 * **`;`만 `url(…)` 안쪽에서 예외**다. `data:image/svg+xml;base64,…`가 그것을 쓰고, `url()`의
 * 대상은 검증하지 않는다고 이미 적어 둔 자리다. 나머지는 `url()` 안쪽에서도 막는다 —
 * 거기 `</style>`이 들어오면 같은 사고이기 때문이다.
 *
 * **따옴표는 막지 않고 짝을 본다.** 폰트 이름처럼 따옴표가 필요한 값이 있다
 * (`"Noto Serif KR", serif`). 짝이 맞지 않으면 이슈다 — jsdom으로 재보니 값 한 자리의
 * 홀수 따옴표가 **선언 하나가 아니라 스타일시트 전체**를 못 만들게 했다(`style.sheet`가
 * `null`이다). 이것은 밖으로 새는 부류가 아니라 **자기를 무효화하는 부류**라 탈출 검사에
 * 걸리지 않았고, 얕은 유효성 검사가 중괄호와 세미콜론만 보아 함께 놓쳤다.
 *
 * 짝 세기가 성립하는 근거는 **`\`를 이미 막는다는 것**이다 — 이스케이프된 따옴표가 들어올
 * 수 없으므로 여는 따옴표는 반드시 같은 따옴표로 닫힌다(`a\"b`가 이미 이슈인 것을 쟀다).
 *
 * **대괄호는 막지 않는다.** `red[`·`red]`를 넣어도 jsdom의 규칙 수가 줄지 않았다 — 깨지는
 * 것을 관측하지 못한 것을 근거 없이 막지 않는다. 널 문자와 `@`도 같다(`@`는 선언 하나를
 * 잃었지만 그것은 값이 무효인 것이지 밖으로 나가는 것이 아니고, 널 문자는 저장 경계의
 * `apps/api/src/db/nul-guard.ts`가 막는다).
 */
export function rejectDangerousCharacters(value: string, path: string, label: string): ThemeIssue[] {
  const spans = urlSpans(value)
  const inUrl = (index: number) => spans.some(([start, end]) => index > start && index < end)

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!
    const isComment = (char === '/' || char === '*') && value[index + 1] === (char === '/' ? '*' : '/')
    if (char === ';' && inUrl(index)) continue
    if ('{}<>\\;\n\r\f'.includes(char) || isComment) {
      return [
        issue(
          'bad-style-value',
          path,
          `${label}에 CSS 문법을 끊는 문자가 있습니다: ${JSON.stringify(char)}`,
        ),
      ]
    }
  }

  const unclosed = unclosedQuote(value)
  if (unclosed !== null) {
    return [
      issue(
        'bad-style-value',
        path,
        `${label}의 따옴표 짝이 맞지 않습니다: ${JSON.stringify(unclosed)}`,
      ),
    ]
  }
  return []
}

/**
 * 닫히지 않은 따옴표가 있으면 그 문자를, 없으면 `null`.
 *
 * 여는 따옴표는 **같은** 따옴표로만 닫힌다 — CSS 문자열 안의 다른 따옴표는 그냥 글자다.
 * 그래서 `a"b'c"d`는 짝이 맞는다.
 */
function unclosedQuote(value: string): string | null {
  let open: string | null = null
  for (const char of value) {
    if (open === null) {
      if (char === '"' || char === "'") open = char
    } else if (char === open) {
      open = null
    }
  }
  return open
}

/** `url(…)`의 안쪽 범위. `resolve/style.ts`의 참조 치환과 같은 규칙을 쓴다. */
function urlSpans(value: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = []
  const opener = /url\(/gi
  let match: RegExpExecArray | null = opener.exec(value)
  while (match !== null) {
    const close = value.indexOf(')', match.index + match[0].length)
    spans.push([match.index, close === -1 ? value.length : close] as const)
    match = opener.exec(value)
  }
  return spans
}

/**
 * 값이 담은 함수를 허용 목록과 대조하고, CSS 문법을 끊는 문자를 막는다. 통과하면 빈 배열이다.
 *
 * `allowed`는 **소문자**로 준다 — `scanFunctions`가 이름을 소문자로 정규화한다.
 */
export function rejectFunctions(
  value: string,
  allowed: readonly string[],
  path: string,
  label: string,
): ThemeIssue[] {
  const dangerous = rejectDangerousCharacters(value, path, label)
  if (dangerous.length > 0) return dangerous

  const scan = scanFunctions(value)

  if (!scan.balanced) return [issue('bad-style-value', path, `괄호가 맞지 않습니다: ${value}`)]
  if (scan.bare) {
    return [issue('bad-style-value', path, `괄호 앞에 함수 이름이 없습니다: ${value}`)]
  }
  if (scan.names.length === 0) return []
  if (scan.nested) {
    return [issue('bad-style-value', path, `중첩된 함수는 받지 않습니다: ${value}`)]
  }

  const rejected = scan.names.filter((name) => !allowed.includes(name))
  if (rejected.length === 0) return []
  return [
    issue(
      'bad-style-value',
      path,
      `${label}이 받지 않는 함수입니다: ${rejected.join(', ')}`,
    ),
  ]
}
