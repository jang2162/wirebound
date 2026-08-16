/**
 * `wireb page get <경로> [--json]` — §12.3의 *"페이지 조회"*.
 *
 * ---
 *
 * # 경로는 §8.1의 타겟 경로다
 *
 * 사람이 치는 것은 `관리자/회원/목록`이고 `page:` 접두를 붙여도 된다. 그 경로를 푸는 자리는
 * **`packages/schema`의 `matchPageTargets` 하나**다 — 저작 화면이 상호작용 타겟으로 적는
 * 문자열과 같은 규칙이어야 *"화면에서 링크가 가리키는 것"*과 *"CLI가 여는 것"*이 같아진다.
 *
 * # 못 찾은 것과 둘 이상을 **갈라 말한다**
 *
 * | 무엇 | 코드 | 왜 |
 * |---|---|---|
 * | 그런 경로가 없다 | 1 | 사람이 인자를 고쳐야 한다. **가까운 후보를 함께 낸다** |
 * | 둘 이상이 그 경로다 | 1 | 겹치는 타겟은 실재한다(같은 메뉴 아래 같은 제목 · 제목에 든 `/`). **하나를 골라 주면 어느 쪽인지 아무도 모른다** |
 *
 * 겹치는 타겟이 있다는 것은 P9-1 이월 §9가 이미 적었고 `duplicateTargets`가 그 판정을
 * 갖고 있다.
 *
 * # 무엇을 실을지는 `pageView`가 정한다 (D4)
 *
 * 이 파일에는 **글자만** 있다. §12.2의 MCP `get_page`가 같은 것을 내야 하므로 조립을 여기
 * 두면 P9-4가 두 벌을 만든다. `--json`은 그 값을 **그대로** 낸다 — 사람이 읽는 판과
 * 기계가 읽는 판이 같은 값에서 나와야 갈리지 않는다.
 *
 * # `installCatalog()`를 먼저 부른다
 *
 * 문장의 prop 라벨이 카탈로그에서 온다. 안 부르면 *"목록이 로딩 상태로 바뀝니다"*가
 * *"목록이 loading로 바뀝니다"*가 된다(실측). 던지지 않으므로 **조용히 나빠지는** 자리다.
 */
import { installCatalog, matchPageTargets, pageView, targetedPages, type PageView } from '@wirebound/schema'
import { EXIT, usageError } from '../exit'
import type { Io } from '../io'
import { fetchSnapshot, requireProject } from '../project'

export interface PageGetOptions {
  json: boolean
}

/** 후보를 몇 개까지 보일지. 프로젝트 전체를 터미널에 쏟지 않는다. */
const CANDIDATE_LIMIT = 10

export async function runPageGet(io: Io, path: string | undefined, options: PageGetOptions): Promise<number> {
  if (path === undefined || path.trim().length === 0) {
    throw usageError('페이지 경로를 주세요: wireb page get <경로> (예: 관리자/회원/목록)')
  }

  const access = await requireProject(io)
  const payload = await fetchSnapshot(io, access)

  installCatalog()

  const ordered = targetedPages({ menu: payload.menu, pages: payload.pages })
  const matched = matchPageTargets(ordered, path)

  // **여러 줄은 `io.err`로 낸다** — `CliError`의 문장에 줄바꿈을 넣으면 `run`이 그것을 한
  // 줄로 다루고(`err`가 줄바꿈을 붙이는 자리이므로) 케이스가 줄 단위로 읽지 못한다.
  if (matched.length === 0) {
    io.err(`그 경로의 페이지가 없습니다: ${path}`)
    for (const line of candidates(ordered.map((page) => page.target))) io.err(line)
    return EXIT.usage
  }
  if (matched.length > 1) {
    // **겹치는 타겟이다.** 하나를 고르면 그 판정이 조용히 묻힌다 — 설계서 쪽을 고쳐야 한다.
    io.err(`그 경로의 페이지가 ${matched.length}개입니다: ${path}`)
    io.err('  같은 타겟을 든 페이지가 둘 이상이면 설계서의 링크도 그 페이지들을 가리키지 못합니다')
    for (const page of matched) io.err(`  - ${page.title} (${page.id})`)
    return EXIT.usage
  }

  const found = matched[0]!
  const record = payload.pages.find((page) => page.id === found.id)!
  const view = pageView({
    id: record.id,
    title: record.title,
    description: record.description,
    target: found.target,
    menuPath: found.menuPath,
    document: record.schema,
    comments: payload.comments
      .filter((comment) => comment.pageId === record.id)
      .map((comment) => ({
        nodeId: comment.nodeId,
        body: comment.body,
        authorName: comment.authorName,
        createdAt: comment.createdAt,
      })),
  })

  if (options.json) {
    io.out(JSON.stringify(view, null, 2))
    return EXIT.ok
  }
  for (const line of renderPageView(view)) io.out(line)
  return EXIT.ok
}

/**
 * `PageView` 하나를 사람이 읽는 줄들로. **여기가 이 명령의 전부다** — 무엇을 실을지는
 * 이미 정해져 있고 이 함수는 그것을 들여쓸 뿐이다.
 */
export function renderPageView(view: PageView): string[] {
  const lines = [view.path, `  ${view.title} · ${view.id} · 노드 ${view.nodeCount}개`]
  if (view.description !== null && view.description.length > 0) {
    lines.push(`  ${view.description}`)
  }

  lines.push('', '구조')
  for (const node of view.nodes) {
    lines.push(`  ${'  '.repeat(node.depth)}${node.name}`)
  }

  lines.push('', `상호작용 ${view.interactions.length}개`)
  // **0건을 빈 화면으로 두지 않는다** — 없는 것과 못 읽은 것이 같아 보이면 안 된다.
  if (view.interactions.length === 0) lines.push('  (없음)')
  for (const sentence of view.interactions) lines.push(`  ${sentence.text}`)

  lines.push('', `코멘트 ${view.comments.length}개`)
  if (view.comments.length === 0) lines.push('  (없음)')
  for (const comment of view.comments) {
    lines.push(`  ${comment.nodeName} · ${comment.authorName} · ${comment.createdAt}`)
    for (const line of comment.body.split('\n')) lines.push(`    ${line}`)
  }
  return lines
}

/** 못 찾았을 때 보일 후보. **분모를 말한다** — 잘린 것을 숨기지 않는다. */
function candidates(targets: readonly string[]): string[] {
  if (targets.length === 0) return ['  이 프로젝트에는 페이지가 없습니다']
  const shown = targets.slice(0, CANDIDATE_LIMIT)
  const lines = ['  있는 경로:', ...shown.map((target) => `  - ${target}`)]
  if (targets.length > shown.length) lines.push(`  … 그리고 ${targets.length - shown.length}개 더`)
  return lines
}
