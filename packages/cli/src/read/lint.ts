/**
 * **스냅샷 하나에 lint 규칙을 돌리는 조립.** `wireb lint`와 설계서 「MCP 도구」의 `validate`가 **이 파일
 * 하나**를 부른다.
 *
 * ---
 *
 * # `[경로]`는 **출력 거르개**다
 *
 * 설계서 「lint 규칙」의 규칙 여럿이 프로젝트 단위다. 입력을 좁히면 *"어느 메뉴에도 연결되지 않은 페이지"*나
 * *"`navigate` 대상 페이지가 존재하지 않음"*이 **거짓을 말한다.** 그래서 언제나 프로젝트
 * 전체를 검사하고 무엇을 보일지만 고른다.
 *
 * # 걸러진 것으로 답하되 **빠진 것을 값으로 말한다**
 *
 * `wireb lint <경로>`는 걸러진 것으로 종료 코드를 낸다(`commands/lint.ts`의 *"종료 코드는
 * 걸러진 것에서 낸다"*). MCP도 **같게 답한다** —
 * 다르게 정하면 같은 프로젝트를 두 도구가 다르게 말한다.
 *
 * **그러나 사람과 에이전트는 다르다.** CLI는 *"경로 밖에 error N건이 더 있습니다"*를 stderr
 * 한 줄로 말하는데 에이전트는 그 줄을 놓치기 쉽다. 그래서 **산문이 아니라 필드로 낸다**:
 *
 * | 필드 | 무엇 |
 * |---|---|
 * | `outsideErrors` | 경로 밖에 남은 `error` 개수 |
 * | `droppedProjectIssues` | **`pageId`가 `null`이라 경로 필터에서 통째로 빠진** 이슈 개수 |
 *
 * 둘째가 경로 필터의 구멍이다 — **메뉴 이름 이슈는 페이지에 안 매달려
 * 있어** 경로를 주는 순간 사라진다. 개수를 안 말하면 *"이 페이지는 깨끗하다"*가
 * *"프로젝트가 깨끗하다"*로 읽힌다.
 *
 * # `notes`를 버리지 않는다
 *
 * `snapshotToLintInput`이 낸 것이 *"검사에서 빠진 것"*이다 — 못 올린 문서 버전 · 메뉴를 잃은 페이지.
 * **버리면 그 전부가 *"결함 0건"*으로 위장된다.**
 *
 * # `LintConfig`는 리포의 파일에서만 온다
 *
 * 이 함수는 `LintConfig`를 **인자로 받는다.** 그것을 채우는 자리는 `readLintConfig`
 * 하나이고 그 함수는 `.wirebound.json`만 읽는다 — **세션이 정규식을 주는 길이 없다.**
 * 근거는 `packages/mcp/src/tools.ts`의 머리말에 있다.
 */
import {
  filterLintIssues,
  matchPageTargets,
  pageTargetPath,
  type LintConfig,
  type LintIssue,
} from '@wirebound/schema'
import { lintProject, snapshotToLintInput, type SnapshotLintNote, type SnapshotPayload } from '@wirebound/themes'
import type { LintTheme } from '../project'
import { prepareCatalog } from './catalog'
import { orderedPages } from './page'

export interface LintReport {
  /** 보일 것. 경로를 안 줬으면 전체와 같다. */
  issues: LintIssue[]
  /** 프로젝트 전체의 결함 수. **분모다** — 잘린 것을 숨기지 않는다. */
  totalIssues: number
  /** 경로 필터가 걸렸나. */
  filtered: boolean
  /** 걸러진 것 안의 `error` 수. **종료 코드를 만드는 것이 이 값이다.** */
  errors: number
  /** 걸러진 것 안의 `warning` 수. */
  warnings: number
  /** 걸러진 것 안의 `info` 수 — 결함이 아니라 알림이다(설계서 「lint 규칙」). 어떤 실패 선에도 안 든다. */
  infos: number
  /** 경로 **밖에** 남은 `error` 수(위 머리말). 필터가 없으면 0. */
  outsideErrors: number
  /** `pageId`가 `null`이라 경로 필터에서 빠진 이슈 수(위 머리말). 필터가 없으면 0. */
  droppedProjectIssues: number
  /** 검사에서 빠진 것. **버리지 않는다.** */
  notes: SnapshotLintNote[]
  /** 페이지 id → 설계서 「상호작용」의 「모델」이 말하는 경로. 이슈를 사람이 읽는 자리로 옮기는 지도다. */
  pathOf: Map<string, string>
}

/** 경로를 줬는데 그런 페이지가 없다. **결함 0건과 갈라야 한다.** */
export interface LintNoSuchPath {
  kind: 'no-such-path'
  path: string
}

export type LintOutcome = { kind: 'report'; report: LintReport } | LintNoSuchPath

/**
 * lint를 돌리고 무엇을 보일지 고른다.
 *
 * **카탈로그를 여기서 세운다** — 안 부르면 모든 노드가 `document-invalid:error`가 되어
 * 결과가 통째로 거짓이 된다(실측 5건 → 0건. `read/catalog.ts`의 표).
 */
export function lintReport(
  payload: SnapshotPayload,
  config: LintConfig | undefined,
  path: string | undefined,
  /** 프로젝트가 고정한 테마(`project.ts`의 `fetchLintTheme`). 못 받았으면 테마 규칙이 안 돌고 `notes` 가 그렇다고 말한다. */
  theme: LintTheme,
): LintOutcome {
  prepareCatalog()

  const plan = snapshotToLintInput(payload, config)
  const notes: SnapshotLintNote[] = [...plan.notes]
  if (theme.kind === 'unavailable') {
    notes.push({
      kind: 'theme-unavailable',
      pageId: null,
      message: `프로젝트의 테마를 못 받아 «현재 테마에 없는 variant» 를 검사하지 않았습니다 — ${theme.reason}`,
    })
  }
  const all = lintProject({ ...plan.input, ...(theme.kind === 'bound' ? { themeManifest: theme.manifest } : {}) })

  const ordered = orderedPages(payload)
  // **접두를 벗겨 낸다** — 읽는 쪽이 이 문자열을 그대로 `get_page`·`wireb page get`에
  // 다시 넣을 수 있어야 한다. 자리를 말하는 것으로 끝나면 다음 걸음이 손으로 옮겨진다.
  const pathOf = new Map(ordered.map((page) => [page.id, pageTargetPath(page.target)]))

  const wanted = path !== undefined && path.trim().length > 0 ? path : undefined
  if (wanted === undefined) {
    return {
      kind: 'report',
      report: {
        issues: all,
        totalIssues: all.length,
        filtered: false,
        errors: countErrors(all),
        warnings: countSeverity(all, 'warning'),
        infos: countSeverity(all, 'info'),
        outsideErrors: 0,
        droppedProjectIssues: 0,
        notes,
        pathOf,
      },
    }
  }

  const matched = matchPageTargets(ordered, wanted)
  if (matched.length === 0) return { kind: 'no-such-path', path: wanted }

  const issues = filterLintIssues(all, { pageIds: matched.map((page) => page.id) })
  const errors = countErrors(issues)
  return {
    kind: 'report',
    report: {
      issues,
      totalIssues: all.length,
      filtered: true,
      errors,
      warnings: countSeverity(issues, 'warning'),
      infos: countSeverity(issues, 'info'),
      outsideErrors: countErrors(all) - errors,
      // **`filterLintIssues`가 `pageId`로만 거른다** — 메뉴 이름 이슈는
      // `pageId`가 `null`이라 어느 경로를 줘도 빠진다.
      droppedProjectIssues: all.filter((issue) => issue.pageId === null).length,
      notes,
      pathOf,
    },
  }
}

export function countErrors(issues: readonly LintIssue[]): number {
  return countSeverity(issues, 'error')
}

function countSeverity(issues: readonly LintIssue[], severity: LintIssue['severity']): number {
  return issues.filter((issue) => issue.severity === severity).length
}
