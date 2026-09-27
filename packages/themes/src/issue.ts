import type { IssueSeverity } from '@wirebound/schema'

/**
 * 패턴 검증(`checkPatterns`)과 전개(`expandPattern`)가 내는 이슈의 종류.
 *
 * `schema`의 `ValidationCode`와 같은 형식이다 — **던지지 않고 모아서 낸다.** 패턴 하나에 결함이 여럿이면
 * 한 번에 다 보여야 작성자가 하나씩 고치지 않는다.
 */
export type ThemeIssueCode =
  /** 패턴 이름이 `<범주>.<변형>`이 아니거나 범주가 고정 목록 밖이다 */
  | 'bad-pattern-name'
  /** 패턴 schema 조각의 노드가 카탈로그와 어긋난다 */
  | 'bad-pattern-node'
  /** schema 조각이 slots에 없는 슬롯을 쓴다 */
  | 'unknown-slot'
  /** slots에 선언됐는데 schema 조각이 쓰지 않는다 */
  | 'unused-slot'

/**
 * 코드마다 severity를 정하는 **표 하나**. `schema`의 `ISSUE_SEVERITY`와 같은 형식이다 —
 * `Record<ThemeIssueCode, IssueSeverity>`이므로 코드가 늘면 **타입체크가 먼저 죽는다.**
 *
 * **넷 다 `error`다 — 패턴 자체는 서는 것도 있다:**
 *
 * 1. `unused-slot` — `slots`에 선언됐는데 `schema` 조각이 쓰지 않는다. 패턴은 선다.
 *    **그래도 `error`로 둔다:** 슬롯 선언은 저작 UI가 *"우측 속성 패널에서 채운다"*
 *    (설계서 「patterns — 테마가 소유한 구성 레시피」)의
 *    입력이므로, 쓰이지 않는 슬롯은 **사용자에게 채울 칸을 보여 주고 그 값을 버린다** —
 *    `ignored-variant`와 같은 침묵이 아니라 그 침묵을 **UI에 새기는** 쪽이다.
 * 2. `bad-pattern-node` — **이 코드가 `ignoredVariantMessage`를 그대로 쓴다**(`spec/patterns.ts`).
 *    즉 페이지 문서에서 `warning`인 바로 그 조건이 패턴에서는 `error`다.
 *    **원인은 코드 유니온을 일부러 갈라 둔 것이다**(평행 유니온을 만들면 따로 썩는다).
 *    `bad-pattern-node`는 catch-all이라 **타입 오타·props 위반·`Slot` 금지**를 함께 담으므로 통째로 내리면 진짜 오류가 통과한다.
 *    갈라 내려면 전용 코드가 필요하고 그것이 곧 평행 유니온이다 — **여기서 바꾸지 않고 어긋난 사실만 남긴다.**
 */
export const THEME_ISSUE_SEVERITY: Record<ThemeIssueCode, IssueSeverity> = {
  'bad-pattern-name': 'error',
  'bad-pattern-node': 'error',
  'unknown-slot': 'error',
  'unused-slot': 'error',
}

export interface ThemeIssue {
  code: ThemeIssueCode
  /**
   * `THEME_ISSUE_SEVERITY[code]`와 항상 같다 — `issue()`가 표에서 파생시킨다.
   *
   * **타입을 `schema`에서 가져온다.** 코드 유니온은 갈라 두었지만 severity는 갈라 둘 이유가
   * 없다 — 패턴 이슈와 문서 이슈를 같은 클라이언트가 읽으므로, 값 집합이 갈리면 읽는 쪽이 두 어휘를 알아야 한다.
   */
  severity: IssueSeverity
  /** 패턴 안의 자리. `patterns.hero.split.schema.children.0`처럼 점으로 잇는다. */
  path: string
  message: string
}

export function issue(code: ThemeIssueCode, path: string, message: string): ThemeIssue {
  return { code, severity: THEME_ISSUE_SEVERITY[code], path, message }
}
