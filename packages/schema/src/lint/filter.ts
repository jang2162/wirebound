/**
 * **lint 결과를 거르는 자리 하나**.
 *
 * `wireb lint [경로]`의 `[경로]`는 **출력 거르개이지 입력 좁히개가 아니다.** 설계서 「lint 규칙」의 규칙
 * 여럿이 프로젝트 단위이므로(*"어느 메뉴에도 연결되지 않은 페이지"* · *"`navigate` 대상
 * 페이지가 존재하지 않음"*) **입력을 좁히면 그 규칙들이 거짓을 말한다** — 한 페이지만
 * 넣으면 다른 페이지를 가리키는 멀쩡한 링크가 전부 *"대상이 없다"*가 된다.
 *
 * **그래서 lint는 언제나 프로젝트 전체를 받고, 무엇을 보일지만 여기서 고른다.**
 *
 * ## 왜 CLI가 아니라 여기인가
 *
 * 설계서 「MCP 도구」의 `validate`가 같은 거르개를
 * 원한다. CLI에 두면 두 벌이 되고, 두 벌이 갈리면 같은 프로젝트에 두 도구가 다른
 * 결함 목록을 낸다.
 *
 * ## 무엇과 대조하는가 — **`pageId`다**
 *
 * 사람이 치는 것은 설계서 「모델」(상호작용)의 경로(`관리자/회원/목록`)이지만 그것을 **id로 푸는 것은 부르는
 * 쪽**이다(`matchPageTargets`). 이 함수가 경로를 알면 타겟 조립 규칙이 두 자리가 되고,
 * 무엇보다 *"경로가 겹쳐 페이지가 둘"*이라는 상태를 여기서 다룰 수 없다 — 그것은 거르기
 * 전에 사람에게 말해야 하는 것이다.
 *
 * ## 자리가 없는 이슈는 **남지 않는다**
 *
 * 페이지를 골랐으면 테마 이슈와 메뉴 이름 이슈(`pageId`가 `null`이다)는 그 페이지의 것이
 * 아니다. 그래서 빠진다. **빠진 개수를 부르는 쪽이 말해야 한다** — `wireb lint`가
 * *"전체 N건 중 M건"*을 내는 것이 그 자리다.
 */
import type { LintIssue } from './issue'

export interface LintIssueFilter {
  /**
   * 이 페이지들의 이슈만 남긴다. **`undefined`면 안 거른다** — 빈 배열과 다르다.
   * 빈 배열은 *"어느 페이지도 고르지 않았다"*이고 결과가 비는 것이 맞다.
   */
  pageIds?: readonly string[]
}

/** 거르개를 통과한 이슈들. **순서를 바꾸지 않는다** — 설계서 이슈가 앞이고 테마가 뒤다. */
export function filterLintIssues(
  issues: readonly LintIssue[],
  filter: LintIssueFilter = {},
): LintIssue[] {
  if (filter.pageIds === undefined) return [...issues]
  const wanted = new Set(filter.pageIds)
  return issues.filter((issue) => issue.pageId !== null && wanted.has(issue.pageId))
}
