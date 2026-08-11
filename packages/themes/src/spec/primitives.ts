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
 *
 * ---
 *
 * **이 층의 `suspicious-literal`을 `error`로 올리지 않는다 — 판정과 근거**
 * (P4c-1 수정 웨이브 F1).
 *
 * 물음은 정당하다: **폭발 반경이 스타일 층과 다르다.** 스타일에서는 선언 **하나**가
 * 브라우저에서 버려지지만, primitives는 `:root` 변수 하나가 무효해지면 **그것을 가리키는
 * 모든 스타일이 함께 죽는다**(`var()`가 계산 시점에 무효가 된다). 그리고 이 층의 값은
 * 길이·수뿐이라(§6.4) *"참조처럼 생긴 멀쩡한 CSS 리터럴"*이 사실상 없다 — 즉 여기서는
 * 판정이 휴리스틱이 아니다.
 *
 * **그럼에도 `warning`으로 둔다. 근거 셋:**
 *
 * 1. **한 코드는 한 severity다.** `issue()`가 `THEME_ISSUE_SEVERITY` 하나에서 파생시키는
 *    것이 이 패키지의 불변식이고(`makeIssue`의 머리말과 같은 이유), 층마다 severity를
 *    갈면 **그 표가 진실이 아니게 된다.** 갈라 내려면 전용 코드가 필요하고 그것은
 *    평행 유니온을 만드는 일이다 — P4a-2가 `bad-pattern-node`에서 같은 이유로 거부했고
 *    `issue.ts`의 재라 #3이 그 판정을 그대로 들고 있다.
 * 2. **`error`면 거짓 양성 하나가 테마를 통째로 못 쓰게 만든다.** 그것이 D3가 이 코드를
 *    `warning`으로 정한 이유이고, **그 판정을 뒤집을 실측을 이 웨이브가 갖고 있지 않다** —
 *    내가 잰 거짓 양성 0건은 **스타일 층** 기준이다. *"이 층에서는 리터럴이 없다"*는
 *    논증이지 측정이 아니다.
 * 3. **시스템 테마에는 둘째 그물이 이미 있다.** `test/system-unresolved-literals.test.ts`의
 *    0-가드가 `:root` 변수 줄까지 훑는다 — `--wb-container-maxWidth: spce.4;`가 그
 *    검사기에 걸리는 것을 확인했다(내가 쟀다). 즉 **여섯째 테마가 이 함정에 빠지면
 *    경고가 아니라 죽는 케이스가 먼저 말한다.**
 *
 * **무엇이 이 판정을 뒤집는가:** 이 층의 값 전수를 모아 거짓 양성 0건을 **측정**하면
 * 전용 `error` 코드가 정당해진다. 그때 P4c-2의 저작 UI가 값 편집기에서 이 자리를
 * 어떻게 다루는지가 함께 입력이 된다.
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
    // **이슈를 값과 무관하게 전부 싣는다**(P4c-1 수정 웨이브 F1).
    //
    // 앞서는 `resolved.value === null`일 때만 실었다. 그러면 **경고가 통째로 버려진다** —
    // `suspicious-literal`은 값을 안 버리므로(그것이 `warning`인 이유다) 이 갈래를 지나지
    // 않았고, `maxWidth: 'spce.4'`가 **이슈 0건으로** `:root`에 실렸다(내가 쟀다).
    //
    // **P4c-1이 만든 결함이다.** 기준(`45771e9`)에서는 `--wb-container-*`를 **읽는 코드가
    // 0건**이라 그 값이 쓰레기여도 무해했는데, T1이 그 변수를 읽는 첫 코드를 만든 순간
    // 해로워졌다 — `max-width: var(--wb-container-maxWidth)`가 계산 시점에 무효가 되어
    // **그것을 가리키는 모든 선언이 함께 죽는다.** 이 파일의 아래 주석이 그 부류를
    // *"한 층 아래에 같은 구멍을 다시 파는 것"*이라고 이미 규탄하고 있었다.
    issues.push(...resolved.issues)
    if (resolved.value === null) return
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
