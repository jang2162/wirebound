/**
 * **§12.4의 테마 규칙**. 테마 문서들을 값으로 받아 결함 목록을 낸다.
 *
 * ## 왜 `themes`에 사는가 — 설계서와 어긋나는 판정이다 (D2)
 *
 * §12.4는 *"규칙은 `schema` 패키지에 두어 웹·CLI·MCP가 공유한다"*고 적었다. **그런데 테마
 * 규칙은 `themes`를 봐야 하고 `schema`가 `themes`를 알면 의존 방향이 뒤집힌다**(§3.3 ·
 * CLAUDE.md). 실제로 쟀다 — `schema`의 소스 스물일곱 중 `@wirebound/themes`를 import하는
 * 파일은 0이고 `dependencies`는 `zod` 하나다.
 *
 * **판정: 설계서 규칙은 `schema`, 테마 규칙은 여기.** §12.4의 뜻(*"셋이 공유한다"*)은 그대로
 * 지켜진다 — 웹·CLI·MCP 셋 다 두 패키지를 볼 수 있다. 설계서는 고치지 않았고 근거는
 * 보고서에 있다.
 *
 * ## 이미 있는 것은 부른다 (D1)
 *
 * T1에서 재 보니 테마 규칙 여섯 중 **다섯이 이미 있다**(⑧⑨⑩⑫⑬). 그래서 이 파일이 하는
 * 일은 `resolveTheme`을 부르고 그 이슈를 규칙으로 옮기는 것이고, **새로 판정하는 것은 ⑪
 * 하나**다. 그 다섯을 다시 짜면 두 벌이 되고, 갈리는 날 테마 저작 화면과 lint가 같은 테마를
 * 다르게 말한다.
 */
import { relayLintIssue, type LintIssue, type RelayRuleId } from '@wirebound/schema'
import type { ThemeIssue, ThemeIssueCode } from '../issue'
import { resolveTheme } from '../resolve/index'
import type { LintThemeEntry, ThemeLintInput } from './input'
import { nodeVariantIssues } from './node-variant'

/**
 * `resolveTheme`의 코드를 §12.4의 줄로 옮기는 표.
 *
 * **`Record<ThemeIssueCode, …>`인 것이 요점이다** — 코드가 늘면 항목이 없어 **타입체크가
 * 먼저 죽는다**(`THEME_ISSUE_SEVERITY`와 같은 장치). 새 코드가 조용히 아무 데로나 떨어지는
 * 경로가 없다.
 *
 * **§12.4의 여섯 줄이 이 코드 전부를 덮지 않는다.** 덮지 못한 것은 `theme-other`로 간다 —
 * 버리면 **테마가 서지 않는 이유를 lint가 말하지 못한다.** 어느 줄에 넣을지 모호한 것은
 * 그쪽으로 보냈고, 사용자가 읽는 문장은 어느 쪽이든 원본 그대로다.
 */
const THEME_RULE: Record<ThemeIssueCode, RelayRuleId> = {
  // ⑧ *"컴포넌트 정의에 없는 `structure` · `part` · `state` 참조"* — 카탈로그와 대조해
  // 어휘가 없다고 말하는 것들이다. `unknown-component`·`unknown-variant`는 §12.4가 이름으로
  // 들지 않았지만 **같은 대조의 결과**라 같은 줄에 둔다.
  'unknown-component': 'theme-vocabulary',
  'unknown-structure': 'theme-vocabulary',
  'unknown-part': 'theme-vocabulary',
  'unknown-variant': 'theme-vocabulary',
  'unknown-state': 'theme-vocabulary',
  // ⑨ *"존재하지 않는 토큰 참조"* — 참조가 풀리지 않는 것들이다.
  'unknown-token': 'theme-token',
  'unknown-primitive': 'theme-token',
  'circular-token': 'theme-token',
  'unresolved-token': 'theme-token',
  'suspicious-literal': 'theme-token',
  // ⑩ *"화이트리스트에 없는 스타일 프로퍼티"*
  'unknown-style-prop': 'theme-style-prop',
  // ⑫ *"패턴 `slots` 계약과 `schema` 불일치"*
  'bad-pattern-node': 'theme-pattern',
  'unknown-slot': 'theme-pattern',
  'unused-slot': 'theme-pattern',
  // ⑬ *"`extends` 대상이 없거나 상속 깊이 위반"*
  'bad-extends': 'theme-extends',
  // ── 여기부터 §12.4의 여섯 줄 밖이다. ──────────────────────────────────────
  // 값이 그 층의 규격을 어긴 것이지 **참조가 안 풀린 것이 아니다** — ⑨에 넣으면 문장과
  // 규칙 이름이 어긋난다.
  'bad-token-value': 'theme-other',
  'bad-style-value': 'theme-other',
  // 이름이 접히는 것이지 없는 것을 가리키는 것이 아니다.
  'duplicate-token': 'theme-other',
  'duplicate-variable': 'theme-other',
  // 규격(zod)·이름 형식·브레이크포인트 선언 — §12.4의 어느 줄도 이것을 적지 않았다.
  'bad-spec': 'theme-other',
  'bad-pattern-name': 'theme-other',
  'unknown-breakpoint': 'theme-other',
  // 테마가 노드 손잡이를 덮어쓴다는 알림. 결함의 종류가 위 여섯과 다르다.
  'node-handle-overwrite': 'theme-other',
}

/**
 * 테마 규칙을 전부 돌린다. **테마 하나를 두고 난 것이 붙어 나온다** — 여러 테마의 이슈가
 * 섞이면 읽는 사람이 어느 테마를 고쳐야 하는지 매 줄마다 다시 본다.
 */
export function lintThemes(input: ThemeLintInput): LintIssue[] {
  const issues: LintIssue[] = []
  for (const entry of input.themes) {
    issues.push(...lintOne(entry))
  }
  return issues
}

function lintOne(entry: LintThemeEntry): LintIssue[] {
  const { theme, issues } = resolveTheme(entry.document, entry.base)
  const relayed = issues.map((issue) => relayTheme(entry.id, issue))

  // **테마가 서지 않으면 ⑪이 돌지 않는다** — 읽을 변형 표가 없다. `resolveTheme`이
  // `error` 하나로 `theme`을 `null`로 내는 자리와 같은 선이고, 그 선을 긋는 코드는
  // `partitionIssues` 하나다(그 함수의 머리말).
  if (theme === null) return relayed

  return [...relayed, ...nodeVariantIssues(entry, theme)]
}

function relayTheme(themeId: string, issue: ThemeIssue): LintIssue {
  return relayLintIssue(THEME_RULE[issue.code], { themeId }, issue)
}
