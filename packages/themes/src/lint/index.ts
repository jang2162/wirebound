/**
 * **설계서 「lint 규칙」의 lint를 한 번에 도는 자리 하나.** CLI(`wireb lint`)·MCP(`validate`)가 부르는 이름이 이것이다.
 *
 * 설계서 규칙은 `schema`의 `lintDesign`이 구현하고 이 함수는 그것을 부른다. 테마 규칙(`theme-variant`)은 여기서 판정한다 — manifest
 * 규격이 이 패키지에 있고 `schema` 는 테마를 모른다. **이름을 이 패키지에 두는 까닭은 입력이다:** 소비자는 스냅샷 payload 를 `snapshotToLintInput`(`snapshot/lint-input.ts`)으로 옮겨 그 결과를 그대로 넘기고,
 * 그 변환과 입력의 모양(`ProjectLintInput`)이 같은 패키지에 있어야 CLI와 MCP가 같은 것을 부른다.
 *
 * **`partitionIssues`를 부르지 않는다**. 그 함수가 긋는 선의 뜻은 *"저장을 막는가"*이고
 * lint는 저장 게이트가 아니다 — 이 목록을 무엇으로 가를지(예: `wireb lint`의 종료 코드)는
 * 소비자가 정한다.
 */
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { getComponent, lintDesign, lintIssue, type LintConfig, type LintIssue, type LintProject, type WbNode } from '@wirebound/schema'

export interface ProjectLintInput {
  /** 설계서 규칙이 보는 것. */
  project: LintProject
  /** 설정으로 켜지는 규칙의 값. 안 주면 그 규칙들이 안 돈다. */
  config?: LintConfig
  /**
   * 프로젝트가 고정한 테마의 manifest(`GET /api/projects/:projectId/theme`). **안 주면 테마 규칙이 안 돈다** — 못 받은 것을
   * «결함 0건» 으로 위장하지 않도록 소비자가 그 사실을 따로 말한다(`packages/cli`의 `read/lint.ts` — `theme-unavailable`).
   */
  themeManifest?: ThemeManifest
}

/** 프로젝트 하나를 「lint 규칙」의 규칙 전부로 훑는다. */
export function lintProject(input: ProjectLintInput): LintIssue[] {
  const issues = lintDesign(input.project, input.config)
  if (input.themeManifest === undefined) return issues
  return [...issues, ...themeVariantIssues(input.project, input.themeManifest)]
}

/**
 * **«현재 테마에 없는 variant»**(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「manifest」의 «variant 가 테마에 없을
 * 때»). `components` 가 선언한 컴포넌트의 노드가 `variant` 를 들고 있는데 그 값이 선언 밖이면 경고한다. 선언이 없는 컴포넌트는 모든
 * 값이 통과한다. **`variantFrom` 컴포넌트는 보지 않는다** — 렌더러가 노드의 `variant` 를 버리고 prop 에서 짓는다. manifest 검증이 그
 * 선언을 막지만 여기서도 카탈로그로 거른다 — 검증을 안 지난 manifest(옛 서버 · 손으로 고친 행)에서 없는 결함을 말하지 않게.
 *
 * **문서를 믿지 않는다** — 입력은 `JSON.parse` 의 결과라 봉투가 깨진 페이지가 온다. 노드 · 자식이 모양이 아니면 건너뛴다(그 결함은
 * `document-invalid` 가 말한다).
 */
function themeVariantIssues(project: LintProject, manifest: ThemeManifest): LintIssue[] {
  const components = manifest.components ?? {}
  const issues: LintIssue[] = []
  const visit = (node: unknown, path: string, pageId: string): void => {
    if (typeof node !== 'object' || node === null) return
    const { id, type, variant, children } = node as Partial<WbNode>
    const declared =
      typeof type === 'string' && Object.hasOwn(components, type) && getComponent(type)?.variantFrom === undefined
        ? components[type]
        : undefined
    if (declared !== undefined && typeof variant === 'string' && !declared.variants.some((v) => v.id === variant)) {
      issues.push(
        lintIssue(
          'theme-variant',
          { pageId, ...(typeof id === 'string' ? { nodeId: id } : {}) },
          `${path}/variant`,
          `${type} 의 variant "${variant}" 는 테마 ${manifest.id}@${manifest.version} 에 없습니다 — ${declared.defaultVariant}(기본)으로 그려집니다`,
        ),
      )
    }
    if (Array.isArray(children)) children.forEach((child, index) => visit(child, `${path}/children/${index}`, pageId))
  }
  for (const page of project.pages) {
    const root = (page.document as { root?: unknown } | undefined)?.root
    visit(root, '/root', page.id)
  }
  return issues
}
