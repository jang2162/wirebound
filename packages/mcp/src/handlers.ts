/**
 * 도구 이름 → 구현. **`TOOLS`의 이름을 키로 쓴다** — 표와 구현이 갈리는 경로가 없게
 * `test/tools.test.ts`가 양쪽에서 분모를 만들어 맞댄다.
 *
 * ---
 *
 * # 여기 조립이 없다 (D1)
 *
 * `targetedPages` · `matchPageTargets` · `pageView` · `snapshotToLintInput` · `lintProject` ·
 * `filterLintIssues` · `installCatalog`을 **이 패키지가 부르지 않는다.** 부르는 것은
 * `packages/cli/src/read/`이고 `wireb page get`·`wireb lint`도 같은 자리를 부른다.
 *
 * **구조가 그것을 먼저 막는다:** 이 패키지의 런타임 의존은 `@wirebound/cli`와 MCP SDK
 * 둘뿐이라 `@wirebound/schema`를 import하는 줄이 애초에 해석되지 않는다.
 * `test/assembly-census.test.ts`가 그 위에 자를 하나 더 세운다 — 의존을 더하는 것은 한 줄이고,
 * 그 한 줄 뒤에 조용히 두 벌이 생긴다.
 *
 * # 이 파일이 하는 일은 **모양 짓기**다
 *
 * 값은 전부 읽기 층이 만들고, 여기서는 그것을 에이전트가 읽을 봉투에 담는다. 무엇을 담을지가
 * 판정인 자리는 각 함수의 머리말에 있다.
 */
import { lintReport, listProject, lookupPage, readLintConfig, type Io } from '@wirebound/cli/embed'
import { toolResult, type ToolOutcome } from './outcome'
import { openProject, projectHead } from './session'

export type ToolHandler = (io: Io, args: Record<string, string>) => Promise<ToolOutcome>

/**
 * §12.2 *"프로젝트 메뉴/페이지 트리 조회"*.
 *
 * **경로를 앞에 싣는다.** 그것이 `get_page`·`validate`가 받는 인자이고, 에이전트가 이 응답을
 * 읽고 바로 다음 도구를 부를 수 있어야 한다 — `wireb lint`가 이슈 줄에 `페이지 <uuid>`가
 * 아니라 §8.1 경로를 쓰는 것과 같은 근거다.
 *
 * **겹치는 경로를 말한다.** 같은 메뉴 아래 같은 제목이거나 제목에 `/`가 들면 두 페이지가
 * 같은 타겟을 든다(P9-1 이월 §9). 그 경로로는 `get_page`가 하나를 고를 수 없으므로
 * **부르기 전에 알아야 한다** — `wireb lint`는 이 상태를 아직 규칙으로 안 본다.
 */
const listPages: ToolHandler = async (io) => {
  const open = await openProject(io)
  const listing = listProject(open.payload)
  return toolResult({ ...projectHead(open), ...listing })
}

/**
 * §12.2 *"페이지 스키마 + 코멘트 + 상호작용 문장 조회"*.
 *
 * # 못 찾은 것과 둘 이상을 **결과로 낸다** — 오류가 아니다
 *
 * `wireb page get`은 둘 다 코드 1(*"명령을 잘못 썼다"*)로 끝낸다. **여기서는 다르다:**
 * 경로가 틀린 것은 **에이전트가 고칠 수 있는 상태**이고, 고치려면 후보 목록을 읽어야 한다.
 * JSON-RPC 오류로 내면 그 목록이 *"도구가 고장났다"*와 함께 실려 나간다.
 *
 * **그래서 `isError`도 안 세운다** — `found: false`가 값이고, 그 옆에 무엇을 대신 부를지가
 * 함께 있다. `wireb`의 코드 1과 어긋나 보이지만 **어긋나는 것이 아니라 받는 쪽이 다르다**:
 * 셸은 코드를 읽고 에이전트는 값을 읽는다.
 *
 * # 무엇을 싣나
 *
 * `pageView`가 정한 것 전부다 — 노드 개요·문서 전문·코멘트·상호작용 문장. **문서 전문을
 * 뺄 이유가 없다:** §12.5의 흐름이 *"`get_page`로 스키마·코멘트·상호작용을 읽는다"*이고
 * 그것을 읽는 것이 에이전트의 일이다. 사람에게 쏟지 않으려고 개요를 따로 두는 것은 CLI의
 * 사정이다.
 *
 * # `notes`를 버리지 않는다
 *
 * 오늘 그 자리에 오는 것은 *"문서 버전을 못 올렸다"* 하나다(`read/page.ts`). 버리면
 * **저장된 그대로 읽은 것**이 최신으로 읽은 것과 같아 보인다.
 */
const getPage: ToolHandler = async (io, args) => {
  const open = await openProject(io)
  const found = lookupPage(open.payload, args.path!)
  const head = projectHead(open)

  if (found.kind === 'none') {
    return toolResult({
      ...head,
      found: false,
      reason: 'no-such-path',
      message: `그 경로의 페이지가 없습니다: ${args.path}`,
      candidates: found.candidates,
    })
  }
  if (found.kind === 'ambiguous') {
    return toolResult({
      ...head,
      found: false,
      reason: 'ambiguous',
      // **하나를 고르면 그 판정이 조용히 묻힌다** — 설계서 쪽을 고쳐야 하는 상태다.
      message: `그 경로의 페이지가 ${found.matches.length}개입니다: ${args.path} — 같은 타겟을 든 페이지가 둘 이상이면 설계서의 링크도 그 페이지들을 가리키지 못합니다`,
      matches: found.matches,
    })
  }
  return toolResult({ ...head, found: true, notes: found.notes, page: found.view })
}

/**
 * §12.2 *"lint 규칙 실행"*.
 *
 * # 결함을 찾은 것은 **오류가 아니다** (D8)
 *
 * `wireb lint`는 그것을 코드 10으로 말하는데 그 번호가 1~4와 **멀리 떨어져 있는 것이
 * 판정이다**(`exit.ts`): *"명령이 서지 못했다"*와 *"제대로 서서 결함을 찾았다"*를 스크립트가
 * 갈라야 한다. 여기서도 같다 — `isError`를 세우면 에이전트가 *"도구가 고장났다"*로 읽고
 * 재시도한다. 대신 **`failing`을 값으로 낸다.**
 *
 * # 걸러진 것으로 답하되 **빠진 것을 필드로 말한다** (D6)
 *
 * `wireb lint <경로>`가 걸러진 것으로 종료 코드를 내는 판정(P9-3 §9)을 그대로 쓴다 —
 * 다르게 정하면 같은 프로젝트를 두 도구가 다르게 말한다. **그러나 CLI가 stderr 한 줄로
 * 말하는 것을 에이전트는 놓친다.** 그래서 `outsideErrors`·`droppedProjectIssues`가 산문이
 * 아니라 필드다.
 *
 * # `LintConfig`는 리포의 파일에서만 온다 (D5)
 *
 * `readLintConfig(binding)` 하나가 그 값을 만든다. **도구 인자에 그 자리가 없다** —
 * 근거는 `tools.ts`의 머리말이고 `test/tools.test.ts`가 그 부재를 든다.
 *
 * # `notes`를 버리지 않는다 (D7)
 *
 * *"검사에서 빠진 것"*이다. 버리면 테마를 안 고른 레이아웃·상속이 끊긴 파생 테마·안 돈 ⑪·
 * 못 올린 문서 버전·메뉴를 잃은 페이지가 전부 **"결함 0건"으로 위장된다.**
 */
const validate: ToolHandler = async (io, args) => {
  const open = await openProject(io)
  const outcome = lintReport(open.payload, readLintConfig(open.access.binding), args.path)
  const head = projectHead(open)

  if (outcome.kind === 'no-such-path') {
    // `get_page`와 같은 모양이다 — 경로가 틀린 것은 에이전트가 고칠 수 있는 상태다.
    return toolResult({
      ...head,
      ran: false,
      reason: 'no-such-path',
      message: `그 경로의 페이지가 없습니다: ${outcome.path}`,
      candidates: listProject(open.payload).pages.map((page) => page.path),
    })
  }

  const report = outcome.report
  return toolResult({
    ...head,
    ran: true,
    path: report.filtered ? args.path : null,
    /** `wireb lint`가 코드 10을 내는 조건과 **같은 값**이다. */
    failing: report.errors > 0,
    errors: report.errors,
    warnings: report.warnings,
    totalIssues: report.totalIssues,
    /** 경로 밖에 남은 `error`. **0이 아니면 이 응답만 보고 *"괜찮다"*로 읽으면 안 된다.** */
    outsideErrors: report.outsideErrors,
    /** `pageId`가 `null`이라 경로 필터에서 통째로 빠진 이슈 수(테마·메뉴 이름 규칙). */
    droppedProjectIssues: report.droppedProjectIssues,
    /** **검사에서 빠진 것.** 비어 있지 않으면 결함 0건이 *"깨끗하다"*가 아니다. */
    notes: report.notes,
    issues: report.issues.map((issue) => ({
      ...issue,
      // **`pageId`를 사람이 읽는 자리로도 옮긴다** — 에이전트가 이 값을 그대로
      // `get_page`에 넣을 수 있어야 한다. uuid로만 말하면 다음 걸음이 손으로 옮겨진다.
      pagePath: issue.pageId === null ? null : (report.pathOf.get(issue.pageId) ?? null),
    })),
  })
}

export const HANDLERS: Record<string, ToolHandler> = {
  list_pages: listPages,
  get_page: getPage,
  validate,
}
