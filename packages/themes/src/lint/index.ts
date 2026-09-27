/**
 * **설계서 「lint 규칙」의 lint를 한 번에 도는 자리 하나.** CLI(`wireb lint`)·MCP(`validate`)가 부르는 이름이 이것이다.
 *
 * 규칙은 전부 `schema`의 `lintDesign`이 구현한다 — 이 함수는 그것을 부를 뿐이다. **이름을 이 패키지에 두는 까닭은
 * 입력이다:** 소비자는 스냅샷 payload 를 `snapshotToLintInput`(`snapshot/lint-input.ts`)으로 옮겨 그 결과를 그대로 넘기고,
 * 그 변환과 입력의 모양(`ProjectLintInput`)이 같은 패키지에 있어야 CLI와 MCP가 같은 것을 부른다.
 *
 * **`partitionIssues`를 부르지 않는다**. 그 함수가 긋는 선의 뜻은 *"저장을 막는가"*이고
 * lint는 저장 게이트가 아니다 — 이 목록을 무엇으로 가를지(예: `wireb lint`의 종료 코드)는
 * 소비자가 정한다.
 */
import { lintDesign, type LintConfig, type LintIssue, type LintProject } from '@wirebound/schema'

export interface ProjectLintInput {
  /** 설계서 규칙이 보는 것. */
  project: LintProject
  /** 설정으로 켜지는 규칙의 값. 안 주면 그 규칙들이 안 돈다. */
  config?: LintConfig
}

/** 프로젝트 하나를 「lint 규칙」의 규칙 전부로 훑는다. */
export function lintProject(input: ProjectLintInput): LintIssue[] {
  return lintDesign(input.project, input.config)
}
