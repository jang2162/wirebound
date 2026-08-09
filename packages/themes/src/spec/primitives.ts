import { z } from 'zod'
import type { ThemeIssue } from '../issue'
import { resolveStyleValue } from '../resolve/style'
import type { TokenTable } from '../resolve/tokens'

/**
 * 브레이크포인트 이름. **고정 목록이 아니다.**
 *
 * §6.4의 예시가 `sm`·`md`·`lg`·`xl`이지만 그것을 계약으로 읽지 않는다. 근거 셋:
 * 1. §6.0이 요구하는 범위(관리자·마케팅·포털·커머스·문서)에서 브레이크포인트 세트가
 *    같아야 할 이유가 없고, §6.4는 개수도 이름도 계약으로 적지 않았다.
 * 2. 오타 방어는 고정 목록 없이도 얻는다 — `components.*.responsive`의 키를 **여기 선언된
 *    이름과 대조**하므로(`checkThemeComponents`), 선언하지 않은 이름은 이슈가 된다.
 * 3. 방출(§6.11)이 필요로 하는 것은 이름이 아니라 **값의 순서**다.
 *
 * 화면의 뷰포트 프리셋(§9)과도 묶지 않았다. **둘이 다른 축이기 때문**이고, §6.4가 그렇게
 * 적었다 — *"뷰포트 프리셋을 바꾸면 테마가 정의한 브레이크포인트 스타일이 적용되어 확인만
 * 가능하다."* 프리셋은 브레이크포인트를 **통과시키는 입력**이지 나란한 목록이 아니다.
 * 그래서 값이 겹치는 것이 오히려 자연스럽다(재보니 §6.4 예시의 `768`·`1024`·`1280`이 §9의
 * 프리셋에 그대로 있다). **앞 커밋이 여기에 *"값이 겹치는 것도 개수도 달라"*라고 적었는데
 * 거짓이었다** — 손으로 센 수를 지우면서 새 거짓을 넣은 자리다.
 */
const BREAKPOINT_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

export interface ThemePrimitives {
  container?: { maxWidth?: string; gutter?: string }
  grid?: { columns?: number; gap?: string }
  section?: { paddingY?: string; paddingYCompact?: string }
  breakpoints?: Record<string, number>
}

export const PrimitivesSchema: z.ZodType<ThemePrimitives> = z.strictObject({
  container: z
    .strictObject({ maxWidth: z.string().optional(), gutter: z.string().optional() })
    .optional(),
  grid: z
    .strictObject({ columns: z.int().positive().optional(), gap: z.string().optional() })
    .optional(),
  section: z
    .strictObject({ paddingY: z.string().optional(), paddingYCompact: z.string().optional() })
    .optional(),
  breakpoints: z.record(z.string().regex(BREAKPOINT_NAME), z.int().positive()).optional(),
})

/**
 * `primitives`의 값을 푼다. **CSS 프로퍼티 이름이 없는 자리**이므로 선언이 아니라 값만 낸다 —
 * §6.11이 이것들을 `:root` 변수로 내보내기 때문이다(`--wb-container-max` 등).
 *
 * 키는 `container.gutter`처럼 문서 안의 경로 그대로다. **그 경로에서 변수 이름을 어떻게
 * 만들지는 여기서 정하지 않는다** — §6.11의 예시(`--wb-container-max`)와 D6의 규칙
 * (경로의 `.`이 `-`가 된다 → `--wb-container-maxWidth`)이 어긋나므로 방출이 정할 일이다.
 *
 * **브레이크포인트는 `values`에 넣지 않고 수로 따로 낸다.** §6.11의 `:root` 예시에 그것이
 * 없고, 같은 절이 그 값을 `@media` 조건에 직접 쓴다 — 변수가 아니라 수로 필요한 자리다.
 */
export function checkPrimitives(
  primitives: ThemePrimitives,
  tokens: TokenTable,
): { values: Map<string, string>; breakpoints: Map<string, number>; issues: ThemeIssue[] } {
  const values = new Map<string, string>()
  const issues: ThemeIssue[] = []

  const put = (group: string, key: string, value: string | number | undefined): void => {
    if (value === undefined) return
    const path = `primitives.${group}.${key}`
    const resolved = resolveStyleValue(value, tokens, path)
    if (resolved.value === null) {
      issues.push(...resolved.issues)
      return
    }
    values.set(`${group}.${key}`, resolved.value)
  }

  put('container', 'maxWidth', primitives.container?.maxWidth)
  put('container', 'gutter', primitives.container?.gutter)
  put('grid', 'columns', primitives.grid?.columns)
  put('grid', 'gap', primitives.grid?.gap)
  put('section', 'paddingY', primitives.section?.paddingY)
  put('section', 'paddingYCompact', primitives.section?.paddingYCompact)

  const breakpoints = new Map<string, number>()
  for (const [name, width] of Object.entries(primitives.breakpoints ?? {})) {
    breakpoints.set(name, width)
  }

  return { values, breakpoints, issues }
}
