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
 * 값이 담은 함수를 허용 목록과 대조한다. 통과하면 빈 배열이다.
 *
 * `allowed`는 **소문자**로 준다 — `scanFunctions`가 이름을 소문자로 정규화한다.
 */
export function rejectFunctions(
  value: string,
  allowed: readonly string[],
  path: string,
  label: string,
): ThemeIssue[] {
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
