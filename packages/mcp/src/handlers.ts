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
import { listProject, type Io } from '@wirebound/cli/embed'
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

/** T4·T5가 채운다. */
export const HANDLERS: Record<string, ToolHandler> = {
  list_pages: listPages,
}
