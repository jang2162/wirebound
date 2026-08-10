import type { IssueSeverity } from '@wirebound/schema'

/**
 * 테마 검증이 내는 이슈의 종류.
 *
 * `schema`의 `ValidationCode`와 같은 형식이다 — **던지지 않고 모아서 낸다.**
 * 테마 저작 UI(§6.10)는 JSON 에디터이고 여러 오류를 한 번에 보여야 하므로,
 * 첫 오류에서 멈추면 작성자가 한 번에 하나씩만 고치게 된다.
 */
export type ThemeIssueCode =
  /** 그 층이 받을 수 없는 값 (palette·scale에 참조가 있거나, space.unit이 길이가 아니다) */
  | 'bad-token-value'
  /** 가리키는 토큰이 없다 */
  | 'unknown-token'
  /** 참조가 자기에게 돌아온다 */
  | 'circular-token'
  /**
   * 자기 값은 멀쩡한데 **기대는 사슬이 풀리지 않아** 쓸 수 없다.
   *
   * 근원 하나만 보고하면 P4c의 저작 UI가 *"이것도 못 쓴다"*를 그리지 못한다. 그리고 이
   * 코드가 없을 때는 순환에 **들어가기만 한** 키까지 `circular-token`으로 불러 문장이
   * 거짓이었다(`a → b → c → b`에서 `a`는 순환에 속하지 않는다).
   */
  | 'unresolved-token'
  /**
   * 서로 다른 선언이 **같은 토큰 표 키**로 접힌다.
   *
   * `duplicate-variable`보다 한 단계 앞이다. 표 키가 하나로 합쳐지면 변수 이름 단계에서는
   * 볼 것이 남지 않으므로 그 검사가 원리적으로 잡지 못한다.
   */
  | 'duplicate-token'
  /**
   * 서로 다른 토큰·primitives 경로가 같은 CSS 변수 이름으로 접힌다.
   *
   * 변수 이름은 경로의 `.`을 `-`로 바꿔 만드는데(D6) 토큰 이름 자체가 `.`과 `-`를 모두
   * 쓸 수 있어 `blue.500`과 `blue-500`이 같은 이름이 된다. 조용히 두면 `:root`에 같은
   * 이름이 두 번 나가고 나중 것이 이긴다.
   */
  | 'duplicate-variable'
  /** zod 규격을 지키지 않는다 (병합 결과·해석 입력의 모양 검사) */
  | 'bad-spec'
  /** 상속 관계가 성립하지 않는다 (깊이 2·상속 미선언·대상 불일치) */
  | 'bad-extends'
  /** §6.8 화이트리스트 밖의 스타일 프로퍼티 이름 */
  | 'unknown-style-prop'
  /** 화이트리스트 안이지만 값이 받아들여지지 않는다 (임의 함수·타입 불일치) */
  | 'bad-style-value'
  /** 카탈로그에 없는 컴포넌트 이름 */
  | 'unknown-component'
  /** 그 컴포넌트가 선언하지 않은 구조 */
  | 'unknown-structure'
  /** 그 컴포넌트가 선언하지 않은 조각 */
  | 'unknown-part'
  /** 그 컴포넌트가 선언하지 않은 변형 */
  | 'unknown-variant'
  /** 그 컴포넌트가 선언하지 않은 상태 */
  | 'unknown-state'
  /** 선언되지 않은 브레이크포인트를 responsive가 가리킨다 */
  | 'unknown-breakpoint'
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
 * ---
 *
 * **재라 #3 — 오늘 `themes`에 경고가 될 이슈는 없다. 전부 `error`다.**
 *
 * 관찰: 위 유니온 21종을 훑어 `ignored-variant`와 같은 부류(*"적은 값이 버려질 뿐 문서는
 * 그대로 선다"*)를 찾으면 **후보가 둘**이다.
 *
 * 1. `unused-slot` — `slots`에 선언됐는데 `schema` 조각이 쓰지 않는다. 테마 자체는 선다.
 *    **그래도 `error`로 둔다:** 슬롯 선언은 저작 UI가 *"우측 속성 패널에서 채운다"*(§6.6)의
 *    입력이므로, 쓰이지 않는 슬롯은 **사용자에게 채울 칸을 보여 주고 그 값을 버린다** —
 *    `ignored-variant`와 같은 침묵이 아니라 그 침묵을 **UI에 새기는** 쪽이다.
 * 2. `bad-pattern-node` — **이 코드가 `ignoredVariantMessage`를 그대로 쓴다**(`spec/patterns.ts`).
 *    즉 페이지 문서에서 `warning`인 바로 그 조건이 테마 패턴에서는 `error`다.
 *    **원인은 코드 유니온을 일부러 갈라 둔 것이다**(P4a-2의 결정: 평행 유니온을 만들면
 *    따로 썩는다). `bad-pattern-node`는 catch-all이라 **타입 오타·props 위반·`Slot` 금지**를
 *    함께 담으므로 통째로 내리면 진짜 오류가 저장을 통과한다. 갈라 내려면 전용 코드가
 *    필요하고 그것이 곧 평행 유니온이다 — **이 슬라이스에서 바꾸지 않고 어긋난 사실만 남긴다.**
 *
 * **그래서 `resolveTheme`의 "이슈가 하나라도 있으면 `theme`은 `null`" 규칙을 그대로 둔다**
 * (P4a-1의 D2). 경고가 하나도 없으므로 그 규칙과 "경고는 막지 않는다"가 오늘 충돌하지 않는다.
 * `themes`에 첫 `warning`이 생기는 날 그 규칙을 `partitionIssues` 기준으로 고쳐야 한다.
 */
export const THEME_ISSUE_SEVERITY: Record<ThemeIssueCode, IssueSeverity> = {
  'bad-token-value': 'error',
  'unknown-token': 'error',
  'circular-token': 'error',
  'unresolved-token': 'error',
  'duplicate-token': 'error',
  'duplicate-variable': 'error',
  'bad-spec': 'error',
  'bad-extends': 'error',
  'unknown-style-prop': 'error',
  'bad-style-value': 'error',
  'unknown-component': 'error',
  'unknown-structure': 'error',
  'unknown-part': 'error',
  'unknown-variant': 'error',
  'unknown-state': 'error',
  'unknown-breakpoint': 'error',
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
   * 없다 — 테마 이슈와 문서 이슈가 같은 API 봉투(`{ error: { issues } }`)에 실려 같은
   * 클라이언트가 읽으므로, 값 집합이 갈리면 읽는 쪽이 두 어휘를 알아야 한다.
   */
  severity: IssueSeverity
  /** 테마 문서 안의 자리. `tokens.semantic.primary`처럼 점으로 잇는다. */
  path: string
  message: string
}

export function issue(code: ThemeIssueCode, path: string, message: string): ThemeIssue {
  return { code, severity: THEME_ISSUE_SEVERITY[code], path, message }
}
