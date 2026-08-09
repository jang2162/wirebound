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

export interface ThemeIssue {
  code: ThemeIssueCode
  /** 테마 문서 안의 자리. `tokens.semantic.primary`처럼 점으로 잇는다. */
  path: string
  message: string
}

export function issue(code: ThemeIssueCode, path: string, message: string): ThemeIssue {
  return { code, path, message }
}
