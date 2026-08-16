/**
 * **§12.4의 lint를 한 번에 도는 자리 하나.** 웹·CLI·MCP가 부르는 이름이 이것이다.
 *
 * ## 왜 합치는 자리가 여기인가 (T5)
 *
 * 규칙 **구현**은 소유자를 따라 갈라져 있다 — 설계서 규칙은 `schema`, 테마 규칙은 `themes`
 * (D2). 그러면 *"둘을 이어 붙이는 코드"*가 어디 있어야 하는가. 후보 셋을 재고 골랐다.
 *
 * | 후보 | 왜 아닌가 / 왜인가 |
 * |---|---|
 * | **호출자가 각자 잇는다** | 소비자가 셋인데 이어 붙이는 코드가 셋이 된다. 순서·중복 제거·설정 전달이 조금씩 갈리고, **그것이 이 계획서가 첫 문장에서 막으려던 상태다**(*"②의 `wireb lint`와 ③의 `validate`가 같은 것을 부른다"*) |
 * | **새 패키지(`@wirebound/lint`)** | 오늘 소비자가 0이다. `snapshot-payload.ts`가 같은 자리에서 *"지금 올리면 소비자가 하나인 패키지가 생긴다"*로 미뤘고, 이 슬라이스는 `schema`·`themes`만 건드린다(브리프) |
 * | **`themes`** | **골랐다.** `themes → schema`가 이미 의존 방향이라(§3.3) **순수 스택에서 둘 다 볼 수 있는 자리가 여기뿐**이고, 새 패키지 없이 소비자가 부를 이름이 하나가 된다 |
 *
 * **§12.4의 뜻은 그대로 지켜진다.** 그 줄이 요구한 것은 *"웹·CLI·MCP가 공유한다"*이고,
 * 셋 다 `@wirebound/themes`를 볼 수 있다. 어긋나는 것은 *"규칙은 `schema` 패키지에 두어"*의
 * **위치**뿐이고, 그 위치를 지키면 `schema`가 `themes`를 알아야 해서 의존 방향이 뒤집힌다.
 * **설계서는 고치지 않았다** — 판정과 근거는 보고서에 있다.
 *
 * **새 패키지가 필요해지는 조건**은 이월에 적었다: `renderer`를 봐야 하는 규칙이 생기는 날.
 * 그날 `themes`는 후보에서 빠진다(§3.3 — `themes`는 `renderer`를 볼 수 없다).
 *
 * ## 테마와 페이지를 짝짓는 것은 호출자다
 *
 * ⑪은 *"이 테마로 그려지는 페이지"*를 알아야 하는데 **모델에 그 연결이 없다.** 페이지는
 * 레이아웃을 가리키지 않고(§4.3) 테마를 드는 것은 레이아웃이다(§4.4). 스냅샷 payload도
 * 같은 모양이라 거기서도 못 푼다. **오늘 프로젝트에 레이아웃이 하나뿐이라는 사실에 기대지
 * 않는다** — 그 가정은 이미 거짓으로 판명됐다(P6-1 재라 #2: `layouts`에 `project_id`
 * 유니크가 없고 두 번째 레이아웃이 실제로 들어간다). 그래서 짝은 **입력이 들고 온다.**
 */
import { lintDesign, type LintConfig, type LintIssue, type LintProject } from '@wirebound/schema'
import type { LintThemeEntry } from './input'
import { lintThemes } from './index'

export interface ProjectLintInput {
  /** 설계서 규칙이 보는 것. */
  project: LintProject
  /** 테마 규칙이 보는 것. 페이지와의 짝은 여기 실려 온다(위 머리말). */
  themes: readonly LintThemeEntry[]
  /** 설정으로 켜지는 규칙의 값. 안 주면 그 규칙들이 안 돈다 (D5). */
  config?: LintConfig
}

/**
 * 프로젝트 하나를 §12.4의 규칙 전부로 훑는다.
 *
 * **설계서 이슈가 앞이고 테마 이슈가 뒤다.** 두 판정의 자리 축이 다르므로(페이지 · 테마)
 * 섞어 내면 읽는 사람이 매 줄마다 어느 문서를 여는지 다시 본다.
 *
 * **`partitionIssues`를 부르지 않는다** (D4). 그 함수가 긋는 선의 뜻은 *"저장을 막는가"*이고
 * lint는 저장 게이트가 아니다 — 이 목록을 무엇으로 가를지(예: `wireb lint`의 종료 코드)는
 * 소비자가 정한다.
 */
export function lintProject(input: ProjectLintInput): LintIssue[] {
  return [...lintDesign(input.project, input.config), ...lintThemes({ themes: input.themes })]
}
