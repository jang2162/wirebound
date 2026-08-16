/**
 * **lint 규칙의 표 하나**(설계 §12.4). 규칙이 무엇이고 누가 구현하며 어떤 severity를 내는지가
 * 여기 한 곳에 있다.
 *
 * ## 표가 자기 자신을 세게 한다 (D6)
 *
 * 규칙 수를 산문에 적지 않는다. `spec` 필드가 **§12.4의 줄을 글자 그대로** 들고,
 * `test/lint-rules.test.ts`가 설계 문서를 읽어 이 표와 대조한다. 설계서에 줄이 늘거나
 * 문구가 바뀌면 그 케이스가 죽는다 — *"설계서에 있는데 구현에 없는 것"*을 사람이 세지 않는다.
 *
 * §12.4 밖의 규칙도 둘 수 있다. 그때는 `spec: null`이고 `beyondSpec`이 **왜 §12.4 밖인데도
 * 내는지**를 든다.
 *
 * ## severity를 표가 든다 — 다만 날라 오는 것은 그대로 둔다 (D4)
 *
 * `severity: null`은 *"정하지 않았다"*가 아니라 ***"날라 온 이슈의 것을 그대로 쓴다"***이다.
 * §12.4의 규칙 여럿은 이 저장소에 이미 있는 판정(`validatePage` · `resolveTheme`)을 **부르는
 * 것**이고, 그 이슈의 severity를 lint가 다시 고르면 **같은 문서를 두 화면이 다르게 말한다** —
 * 저장 화면은 통과라는데 lint는 error라고 하는 식이다. 그래서 relay 규칙은 severity를 고를
 * 자리 자체가 없다: `lintIssue`가 받는 id 집합에서 타입으로 빠진다.
 *
 * **`partitionIssues`는 여기서 부르지 않는다.** 그 함수가 긋는 선의 뜻은 *"저장을 막는가"*이고
 * **lint는 저장 게이트가 아니다**(D4). lint가 낸 목록을 무엇으로 가를지는 소비자(웹·CLI·MCP)가
 * 정한다.
 *
 * ## severity 축은 새로 만들지 않았다
 *
 * lint가 쓰는 값은 `IssueSeverity`(`error`·`warning`) 그대로이고 축도 같다 — ***"이 결함이
 * 문서·테마를 무효로 만드는가."*** relay 규칙이 그 축의 값을 그대로 나르므로 lint가 다른 축을
 * 쓰면 한 목록 안에서 같은 필드가 두 뜻을 갖게 된다. **이 슬라이스가 새로 더한 규칙은 전부
 * `warning`이다** — 그중 어느 것도 문서를 무효로 만들지 않는다(코멘트가 없어도, 번호가 겹쳐도,
 * 메뉴에 안 붙어도 문서는 그대로 선다).
 */
import type { IssueSeverity } from '../validate'

/** 규칙 하나의 식별자. `wireb lint`의 출력과 MCP `validate`의 응답이 이 문자열을 싣는다. */
export type LintRuleId = (typeof LINT_RULES)[number]['id']

/** §12.4의 두 소제목. */
export type LintRuleGroup = 'document' | 'theme'

/** 이 규칙을 **구현**하는 패키지 (D2). */
export type LintRuleOwner = 'schema' | 'themes'

export interface LintRule {
  id: string
  /** §12.4가 이 규칙을 적은 줄 **그대로**. `null`이면 §12.4 밖이고 `beyondSpec`이 이유를 든다. */
  spec: string | null
  /** §12.4 밖인데도 내는 이유. `spec`이 `null`일 때만 있다. */
  beyondSpec?: string
  group: LintRuleGroup
  owner: LintRuleOwner
  /** `null`이면 **날라 온 이슈의 severity를 그대로 쓴다**(위 머리말 · D4). */
  severity: IssueSeverity | null
  /** 설정이 있어야만 도는 규칙인가 (D5). 안 주면 그 규칙이 **안 도는 것이 옳다.** */
  requiresConfig?: true
}

export const LINT_RULES = [
  // ── 설계서 규칙 (§12.4) ───────────────────────────────────────────────────
  {
    id: 'comment-missing',
    spec: '코멘트가 없는 주요 컴포넌트 (`List`, `EntryForm`, `SearchForm`)',
    group: 'document',
    owner: 'schema',
    severity: 'warning',
  },
  {
    id: 'page-unlinked',
    spec: '어느 메뉴에도 연결되지 않은 페이지',
    group: 'document',
    owner: 'schema',
    severity: 'warning',
  },
  {
    id: 'interaction-target',
    spec: '대상 노드가 삭제된 상호작용 규칙',
    group: 'document',
    owner: 'schema',
    // `checkNodeAction`이 이미 판정한다(T1에서 쟀다). 그 severity를 그대로 나른다.
    severity: null,
  },
  {
    id: 'page-target-missing',
    spec: '`navigate`/`openModal` 대상 페이지가 존재하지 않음',
    group: 'document',
    owner: 'schema',
    severity: 'warning',
  },
  {
    id: 'duplicate-marker',
    spec: '중복된 코멘트 번호',
    group: 'document',
    owner: 'schema',
    severity: 'warning',
  },
  {
    id: 'structural-gap',
    spec: '`EntryForm` 안에 `Field`가 하나도 없는 등 구조적 공백',
    group: 'document',
    owner: 'schema',
    severity: 'warning',
  },
  {
    id: 'naming',
    spec: '프로젝트 명명 규칙 위반 (설정 가능)',
    group: 'document',
    owner: 'schema',
    severity: 'warning',
    requiresConfig: true,
  },
  {
    id: 'document-invalid',
    spec: null,
    beyondSpec:
      '`validatePage`가 내는 나머지 이슈(`unknown-type`·`invalid-props`·`duplicate-id`…). ' +
      '§12.4에 줄이 없지만 §12.5가 lint를 *"설계서 자체의 결함을 보고한다"*로 적었고, ' +
      '그것들은 결함의 정의 그 자체다. 삼키면 lint가 통과시킨 문서를 저장이 거부한다.',
    group: 'document',
    owner: 'schema',
    severity: null,
  },
  // ── 테마 규칙 (§12.4) ─────────────────────────────────────────────────────
  {
    id: 'theme-vocabulary',
    spec: '컴포넌트 정의에 없는 `structure` · `part` · `state` 참조',
    group: 'theme',
    owner: 'themes',
    severity: null,
  },
  {
    id: 'theme-token',
    spec: '존재하지 않는 토큰 참조 (`semantic.brand` 오타 등)',
    group: 'theme',
    owner: 'themes',
    severity: null,
  },
  {
    id: 'theme-style-prop',
    spec: '화이트리스트에 없는 스타일 프로퍼티',
    group: 'theme',
    owner: 'themes',
    severity: null,
  },
  {
    id: 'theme-node-variant',
    spec: '노드가 쓰는 `variant`를 테마가 정의하지 않음',
    group: 'theme',
    owner: 'themes',
    // T1에서 쟀다 — `resolveTheme`도 `validatePage`도 이것을 보지 않는다. 새로 짜는 판정이다.
    severity: 'warning',
  },
  {
    id: 'theme-pattern',
    spec: '패턴 `slots` 계약과 `schema` 불일치',
    group: 'theme',
    owner: 'themes',
    severity: null,
  },
  {
    id: 'theme-extends',
    spec: '`extends` 대상이 없거나 상속 깊이 위반',
    group: 'theme',
    owner: 'themes',
    severity: null,
  },
  {
    id: 'theme-other',
    spec: null,
    beyondSpec:
      '`resolveTheme`이 내는 나머지 §6 판정(`bad-spec`·`duplicate-variable`·`node-handle-overwrite`…). ' +
      '위 여섯 줄이 그 함수의 코드 전부를 덮지 않는데, 덮지 못한 것을 버리면 ' +
      '**테마가 서지 않는 이유를 lint가 말하지 못한다.**',
    group: 'theme',
    owner: 'themes',
    severity: null,
  },
] as const satisfies readonly LintRule[]

/**
 * severity를 **스스로 고르는** 규칙의 id. relay 규칙(`severity: null`)은 여기 없다 —
 * `lintIssue`가 이 집합만 받으므로 **relay 규칙에 severity를 지어 넣는 코드가 컴파일되지
 * 않는다**(D4를 타입으로 지키는 자리).
 */
export type OwnSeverityRuleId = Extract<(typeof LINT_RULES)[number], { severity: IssueSeverity }>['id']

/** 날라 온 이슈의 severity를 그대로 쓰는 규칙의 id. */
export type RelayRuleId = Exclude<LintRuleId, OwnSeverityRuleId>

const BY_ID = new Map<string, LintRule>(LINT_RULES.map((rule) => [rule.id, rule]))

/** id로 표를 찾는다. 표에 없는 id는 `undefined`. */
export function lintRule(id: string): LintRule | undefined {
  return BY_ID.get(id)
}
