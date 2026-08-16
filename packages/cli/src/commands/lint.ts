/**
 * `wireb lint [경로] [--fail-on <severity>]` — §12.3의 *"규칙 검증"*.
 *
 * ---
 *
 * # 서버를 직접 부른다 — `pull`의 출력 파일을 읽지 않는다 (D7)
 *
 * `wirebound-snapshot.json`은 사람이 커밋할 수도 있는 산출물이라 **낡을 수 있고**, 낡은
 * 파일로 lint를 돌리면 **없는 결함을 말하거나 있는 결함을 놓친다.** 파일을 읽는 길을
 * 열려면 *"언제 뜬 것인가"*(`capturedAt`)를 출력이 말해야 하고, 그것은 이 슬라이스가
 * 열지 않는다.
 *
 * # `[경로]`는 **출력 거르개**다 (D5)
 *
 * §12.4의 규칙 여럿이 프로젝트 단위다. 입력을 좁히면 *"어느 메뉴에도 연결되지 않은 페이지"*나
 * *"`navigate` 대상 페이지가 존재하지 않음"*이 **거짓을 말한다.** 그래서 lint는 언제나
 * 프로젝트 전체를 받고 무엇을 보일지만 고른다 — 거르는 코드는 `packages/schema`의
 * `filterLintIssues`이고 §12.2의 MCP `validate`가 같은 것을 부른다.
 *
 * **§12.3이 `[경로]`가 무엇인지 안 적었다.** 판정: **§8.1의 페이지 경로**(`관리자/회원/목록`)다 —
 * `wireb page get`이 받는 것과 같은 말이어야 사람이 둘을 잇는다. 그 어긋남은 보고서에 적었다.
 *
 * # `installCatalog()`를 먼저 부른다 (D7)
 *
 * 안 부르면 **모든 노드가 `document-invalid:error`가 되어 나간다**(실측 — *"알 수 없는
 * 컴포넌트 타입: Page"*). 조용히 통과하지는 않지만 **결과가 통째로 거짓**이고, 게다가
 * 그것이 전부 `error`라 종료 코드까지 뒤집힌다.
 *
 * # 무엇이 종료 코드를 만드는가 (D6)
 *
 * `error`가 하나라도 있으면 `EXIT.findings`(10)다. `warning`만 있으면 0이다 — 근거와
 * 실측은 `exit.ts`의 표 아래에 있다. `--fail-on warning`이 그 선을 올린다.
 *
 * # 검사에서 빠진 것을 **말한다**
 *
 * `snapshotToLintInput`이 낸 `notes`를 그대로 낸다. 테마를 안 고른 레이아웃 · 상속이 끊긴
 * 파생 테마 · 레이아웃이 둘이라 안 돈 ⑪ — 전부 *"결함 0건"*으로 위장하면 안 되는 것들이다.
 */
import {
  filterLintIssues,
  installCatalog,
  matchPageTargets,
  pageTargetPath,
  targetedPages,
  type LintIssue,
} from '@wirebound/schema'
import { lintProject, snapshotToLintInput, type SnapshotLintNote } from '@wirebound/themes'
import { readLintConfig } from '../binding'
import { EXIT } from '../exit'
import type { Io } from '../io'
import { fetchSnapshot, requireProject } from '../project'

/** `--fail-on`이 받는 값. **`error`가 기본이고 그것을 바꾸지 않는다**(D6). */
export const FAIL_ON = ['error', 'warning'] as const
export type FailOn = (typeof FAIL_ON)[number]

export interface LintOptions {
  failOn: string | undefined
}

export async function runLint(io: Io, path: string | undefined, options: LintOptions): Promise<number> {
  const failOn = readFailOn(io, options.failOn)
  if (failOn === null) return EXIT.usage

  const access = await requireProject(io)
  const config = readLintConfig(access.binding)
  const payload = await fetchSnapshot(io, access)

  // **결과가 통째로 거짓이 되는 자리다** — 위 머리말.
  installCatalog()

  const plan = snapshotToLintInput(payload, config)
  const all = lintProject(plan.input)

  const ordered = targetedPages({ menu: payload.menu, pages: payload.pages })
  // **접두를 벗겨 낸다** — 사람이 이 줄을 읽고 그대로 `wireb page get <경로>`에 칠 수
  // 있어야 한다. 자리를 말하는 것으로 끝나면 그 다음 걸음이 손으로 옮겨진다.
  const pathOf = new Map(ordered.map((page) => [page.id, pageTargetPath(page.target)]))

  let issues = all
  if (path !== undefined && path.trim().length > 0) {
    const matched = matchPageTargets(ordered, path)
    if (matched.length === 0) {
      io.err(`그 경로의 페이지가 없습니다: ${path}`)
      return EXIT.usage
    }
    issues = filterLintIssues(all, { pageIds: matched.map((page) => page.id) })
    io.out(`경로 필터: ${path} — 전체 ${all.length}건 중 ${issues.length}건`)
  }

  for (const line of renderNotes(plan.notes)) io.out(line)
  for (const issue of issues) io.out(renderIssue(issue, pathOf))

  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.length - errors
  io.out(issues.length === 0 ? '결함 없음' : `결함 ${issues.length}건 (error ${errors} · warning ${warnings})`)

  const failing = failOn === 'warning' ? issues.length : errors
  if (failing === 0) return EXIT.ok
  io.err(
    failOn === 'warning'
      ? `결함 ${failing}건이 있습니다 (--fail-on warning)`
      : `error ${failing}건이 있습니다`,
  )
  return EXIT.findings
}

/**
 * 이슈 한 줄. **자리를 먼저 말한다** — 사람이 어느 문서를 열지부터 알아야 한다.
 *
 * `themeId`에 담기는 것은 **레이아웃의 id다**(`snapshotToLintInput`의 판정 ⓑ). 그래서
 * `테마 <uuid>`가 아니라 `레이아웃 <uuid>`라고 쓴다 — 필드 이름을 그대로 옮기면 사람이
 * 테마 행을 찾으러 간다.
 */
function renderIssue(issue: LintIssue, pathOf: ReadonlyMap<string, string>): string {
  const where =
    issue.pageId !== null
      ? (pathOf.get(issue.pageId) ?? `페이지 ${issue.pageId}`)
      : issue.themeId !== null
        ? `레이아웃 ${issue.themeId}`
        : '프로젝트'
  const node = issue.nodeId === null ? '' : ` (${issue.nodeId})`
  return `${issue.severity}\t${where}${node}\t${issue.rule}\t${issue.message}`
}

/** 빠진 것들. **0건이면 아무 줄도 안 낸다** — 없는 것을 말할 이유가 없다. */
function renderNotes(notes: readonly SnapshotLintNote[]): string[] {
  if (notes.length === 0) return []
  return ['검사에서 빠진 것:', ...notes.map((note) => `  - ${note.message}`), '']
}

/** `--fail-on`의 값. 모르는 값이면 **말하고 멈춘다** — 조용히 기본값으로 떨어지지 않는다. */
function readFailOn(io: Io, value: string | undefined): FailOn | null {
  if (value === undefined) return 'error'
  if ((FAIL_ON as readonly string[]).includes(value)) return value as FailOn
  io.err(`--fail-on 은 ${FAIL_ON.join(' 또는 ')} 입니다: ${value}`)
  return null
}
