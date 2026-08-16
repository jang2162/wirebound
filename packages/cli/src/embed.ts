/**
 * **붙는 자리.** `@wirebound/cli/embed`로 나가고 `packages/mcp`가 이것만 쓴다(P9-4 D3).
 *
 * ---
 *
 * # 왜 `packages/cli`가 내주나 — 자격 저장소를 두 벌로 만들지 않는다
 *
 * 넷이 이미 순수하게 갈라져 있다: 바인딩(`.wirebound.json`) · 자격 · `callApi` · `io`
 * (P9-2 D9가 *"부수효과를 인자로 받는다"*로 갈라 뒀다). MCP가 그것을 다시 짜면 **토큰을
 * 읽고 쓰는 자리가 두 벌**이 되고, 한쪽만 고쳐지는 날 **토큰이 안 읽히거나 엉뚱한 자리에
 * 쓰인다.**
 *
 * # 왜 공유 패키지로 올리지 않나
 *
 * 오늘 소비자가 **둘**이고 셋째가 안 보인다. 올리는 것은 셋째가 생기는 날이다.
 * **이름이 `cli`인 것이 어색하다는 이유만으로 옮기지 않는다** — 옮기는 일과 도구를 만드는
 * 일을 한 슬라이스에 두면 리뷰가 못 따라온다.
 *
 * # `bin`은 안 내준다
 *
 * `run` · `COMMANDS` · `usage` · argv 파싱은 여기 없다. **`wireb`의 명령 표는 `wireb`의
 * 것이고** MCP가 그것을 부르면 도구가 *"CLI를 흉내 내는 것"*이 된다 — 종료 코드를 도구
 * 결과로 옮기는 층이 하나 더 생기고, 그 층이 §12.2의 표와 §12.3의 표를 묶어 버린다.
 * 내주는 것은 **붙는 자리와 읽기 조립**뿐이다.
 *
 * # 왜 `.`이 아니라 subpath인가
 *
 * `.`은 `wireb`의 공개 면이다(`run`을 부르는 자리). 여기 붙는 자리를 섞으면 **두 표면이
 * 한 이름으로 나가** 무엇이 누구를 위한 것인지 안 보인다. 선례는
 * `@wirebound/exporter/test-support`이고 같은 근거다.
 */
export { createNodeIo } from './node-io'
export type { FileIo, HttpFetch, HttpRequestInit, HttpResponse, Io } from './io'

export { CliError, EXIT, configError, serverError, unreachableError, usageError, type ExitCode } from './exit'

export { BINDING_FILE, findBinding, readLintConfig, requireBinding, type Binding, type LoadedBinding } from './binding'
export { findToken, type CredentialEntry } from './credentials'
export { callApi, parseJson, type ApiRequest, type ApiResponse } from './client'
export { fetchSnapshot, requireProject, type ProjectAccess } from './project'

export {
  listProject,
  lookupPage,
  orderedPages,
  projectPaths,
  type MenuSummary,
  type PageLookup,
  type PageSummary,
  type ProjectListing,
} from './read/page'
export {
  countErrors,
  lintReport,
  type LintNoSuchPath,
  type LintOutcome,
  type LintReport,
} from './read/lint'
export { prepareCatalog } from './read/catalog'

/**
 * 위 함수들이 **돌려주는** 순수 타입을 함께 내준다.
 *
 * **소비자의 의존 목록을 좁히려는 것이다** — `packages/mcp`가 `@wirebound/schema`·
 * `@wirebound/themes`를 직접 의존하면 그 패키지에서 `pageView`나 `lintProject`를 부르는
 * 길이 열린다. 오늘 `@wirebound/cli` 하나만 의존하므로 **조립을 두 벌로 만드는 길이
 * 구조적으로 막혀 있고**, `packages/mcp/test/assembly-census.test.ts`가 그것을 지킨다.
 */
export type {
  InteractionSentence,
  LintConfig,
  LintIssue,
  PageDocument,
  PageView,
  PageViewComment,
  PageViewNode,
  TargetedPage,
} from '@wirebound/schema'
export type { SnapshotLintNote, SnapshotPayload } from '@wirebound/themes'
