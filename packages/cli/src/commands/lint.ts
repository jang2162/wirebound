/**
 * `wireb lint [경로] [--fail-on <severity>]` — 설계서 「CLI」의 *"규칙 검증"*.
 *
 * ---
 *
 * # 서버를 직접 부른다 — `pull`의 출력 파일을 읽지 않는다
 *
 * `wirebound-snapshot.json`은 사람이 커밋할 수도 있는 산출물이라 **낡을 수 있고**, 낡은
 * 파일로 lint를 돌리면 **없는 결함을 말하거나 있는 결함을 놓친다.** 파일을 읽는 길을
 * 열려면 *"언제 뜬 것인가"*(`capturedAt`)를 출력이 말해야 하는데, 이 명령의 출력은 그것을
 * 말하지 않는다.
 *
 * # 조립은 여기 없다 — `read/lint.ts` 하나다
 *
 * `snapshotToLintInput`→`lintProject`→`filterLintIssues`와 *"경로 밖 `error`를 센다"*는
 * 설계서 「MCP 도구」의 `validate`가 같은 것을 해야 하므로 `read/lint.ts`에 있다. **이 파일에는
 * 글자와 종료 코드만 있다.** `test/assembly-census.test.ts`가 그것을 지킨다.
 *
 * # `[경로]`는 **출력 거르개**다
 *
 * 설계서 「lint 규칙」의 규칙 여럿이 프로젝트 단위다. 입력을 좁히면 *"어느 메뉴에도 연결되지 않은 페이지"*나
 * *"`navigate` 대상 페이지가 존재하지 않음"*이 **거짓을 말한다.** 그래서 lint는 언제나
 * 프로젝트 전체를 받고 무엇을 보일지만 고른다.
 *
 * **설계서 「CLI」는 `[경로]`가 무엇인지 적지 않는다.** 여기서는 **「상호작용」의 「모델」이 말하는
 * 페이지 경로**(`관리자/회원/목록`)다 — `wireb page get`이 받는 것과 같은 말이어야 사람이 둘을 잇는다.
 *
 * # 무엇이 종료 코드를 만드는가
 *
 * `error`가 하나라도 있으면 `EXIT.findings`(10)다. `warning`만 있으면 0이다 — 근거와
 * 실측은 `exit.ts`의 표 아래에 있다. `--fail-on warning`이 그 선을 올린다.
 *
 * # 검사에서 빠진 것을 **말한다**
 *
 * `snapshotToLintInput`이 낸 `notes`를 그대로 낸다. 못 올린 문서 버전 · 메뉴를 잃은 페이지 — 전부
 * *"결함 0건"*으로 위장하면 안 되는 것들이다.
 */
import type { LintIssue } from '@wirebound/schema'
import type { SnapshotLintNote } from '@wirebound/themes'
import { readLintConfig } from '../binding'
import { EXIT } from '../exit'
import type { Io } from '../io'
import { fetchLintTheme, fetchSnapshot, requireProject } from '../project'
import { lintReport } from '../read/lint'

/** `--fail-on`이 받는 값. **`error`가 기본이고 그것을 바꾸지 않는다.** */
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
  // 테마 규칙은 프로젝트가 고정한 manifest 로 돈다 — 못 받아도 나머지는 돌고 «검사에서 빠진 것» 이 말한다.
  const theme = await fetchLintTheme(io, access)

  const outcome = lintReport(payload, config, path, theme)
  if (outcome.kind === 'no-such-path') {
    io.err(`그 경로의 페이지가 없습니다: ${outcome.path}`)
    return EXIT.usage
  }
  const report = outcome.report

  if (report.filtered) {
    io.out(`경로 필터: ${path} — 전체 ${report.totalIssues}건 중 ${report.issues.length}건`)
  }

  for (const line of renderNotes(report.notes)) io.out(line)
  for (const issue of report.issues) io.out(renderIssue(issue, report.pathOf))

  // `info` 는 알림이라 «결함 N건» 에 안 든다 — 실패 선(아래)과 같은 셈이다. 따로 센다.
  const defects = report.errors + report.warnings
  const infoNote = report.infos > 0 ? ` · info ${report.infos}건` : ''
  const summary =
    defects === 0
      ? `결함 없음${report.infos > 0 ? ` (info ${report.infos}건)` : ''}`
      : `결함 ${defects}건 (error ${report.errors} · warning ${report.warnings})${infoNote}`
  // **범위를 요약 줄에 단다.** 앞 줄이 *"전체 2건"*이라고 했는데 뒤 줄이
  // *"결함 없음"*이면 **사람은 뒤 줄을 읽는다** — 두 줄이 서로 부딪히지 않게 한다.
  io.out(report.filtered ? `${summary} — 경로 필터 안에서다 (전체 ${report.totalIssues}건)` : summary)

  /**
   * **경로 밖의 `error`를 말한다.**
   *
   * 종료 코드는 걸러진 것에서 나오므로(아래) `wireb lint <경로>`가 **0으로 끝나면서
   * 프로젝트에 `error`가 남아 있을 수 있다.** 그것을 아무 데서도 말하지 않으면 CI에 이
   * 명령을 건 팀이 *"설계서가 깨져도 초록"*을 본다. **코드는 안 바꾸고 말만 한다** —
   * 무엇을 물었는지는 사람이 정한 것이다.
   *
   * **개수를 세는 것은 `read/lint.ts`다** — `validate`가 같은 값을 필드로 낸다.
   */
  if (report.outsideErrors > 0) {
    io.err(`경로 밖에 error ${report.outsideErrors}건이 더 있습니다 — 전체를 보려면 경로 없이 실행하세요`)
  }

  /**
   * **종료 코드는 걸러진 것에서 낸다.**
   *
   * **근거: 출력과 종료 코드가 같은 것을 말해야 한다.** *"결함 없음"*을 찍고 10으로 끝나면
   * 스크립트가 듣는 말과 사람이 읽는 말이 갈린다. **경로를 준 사람은 그 범위를 물은 것이다** —
   * `grep`이 파일을 좁혀 주면 그 파일에서만 답하는 것과 같다.
   *
   * 반대 판정(전체에서 센다)을 고르면 `wireb lint <경로>`가 **자기 출력과 어긋난 코드**로
   * 끝나고, 그때 경로 인자는 *"무엇을 보여 줄지"*만 정하는 장식이 된다.
   *
   * **케이스가 이 판정을 든다** — `test/lint.test.ts`의 *"다른 페이지에 error 가 있어도
   * 경로를 주면 0이다"*. 아래를 전체에서 세게 바꾸면 그 케이스가 죽는다.
   */
  // `info` 는 어떤 선에도 안 든다 — 알림이지 결함이 아니다(설계서 「lint 규칙」).
  const failing = failOn === 'warning' ? report.errors + report.warnings : report.errors
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
 */
function renderIssue(issue: LintIssue, pathOf: ReadonlyMap<string, string>): string {
  const where = issue.pageId !== null ? (pathOf.get(issue.pageId) ?? `페이지 ${issue.pageId}`) : '프로젝트'
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
