/**
 * `wireb page get <경로> [--json]` — 설계서 「CLI」의 *"페이지 조회"*.
 *
 * ---
 *
 * # 경로는 설계서 「상호작용」의 「모델」이 말하는 타겟 경로다
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
 * 겹치는 타겟은 `packages/schema`의 `duplicateTargets`가 판정한다.
 *
 * # 조립은 여기 없다 — `read/page.ts` 하나다
 *
 * `targetedPages`→`matchPageTargets`→0·1·다 갈래→`pageView`의 조립은 `read/page.ts`에 있고,
 * 설계서 「MCP 도구」의 `get_page`가 같은 함수를 부른다. 조립을 여기 두면 두 벌이 되어 같은
 * 경로에 CLI와 MCP가 다른 답을 낼 수 있다. `test/assembly-census.test.ts`가 그것을 지킨다.
 *
 * **이 파일에는 글자만 있다.** `--json`은 `lookupPage`가 낸 값을 **그대로** 낸다 — 사람이
 * 읽는 판과 기계가 읽는 판이 같은 값에서 나와야 갈리지 않는다.
 */
import { stateLineage, viewStateOrder, type PageView, type PageViewNode } from '@wirebound/schema'
import { EXIT, usageError } from '../exit'
import type { Io } from '../io'
import { fetchSnapshot, requireProject } from '../project'
import { lookupPage } from '../read/page'

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
  const found = lookupPage(payload, path)

  // **여러 줄은 `io.err`로 낸다** — `CliError`의 문장에 줄바꿈을 넣으면 `run`이 그것을 한
  // 줄로 다루고(`err`가 줄바꿈을 붙이는 자리이므로) 케이스가 줄 단위로 읽지 못한다.
  if (found.kind === 'none') {
    io.err(`그 경로의 페이지가 없습니다: ${path}`)
    for (const line of candidates(found.candidates)) io.err(line)
    return EXIT.usage
  }
  if (found.kind === 'ambiguous') {
    // **겹치는 타겟이다.** 하나를 고르면 그 판정이 조용히 묻힌다 — 설계서 쪽을 고쳐야 한다.
    io.err(`그 경로의 페이지가 ${found.matches.length}개입니다: ${path}`)
    io.err('  같은 타겟을 든 페이지가 둘 이상이면 설계서의 링크도 그 페이지들을 가리키지 못합니다')
    for (const page of found.matches) io.err(`  - ${page.title} (${page.id})`)
    return EXIT.usage
  }

  // **읽은 문서에 대해 말할 것이 있으면 먼저 말한다**(못 올린 문서 버전 — `read/page.ts`).
  // `out`이 아니라 `err`다: `--json`을 파이프로 받는 쪽에 섞이면 그 출력이 JSON이 아니게 된다.
  for (const note of found.notes) io.err(note)

  if (options.json) {
    io.out(JSON.stringify(found.view, null, 2))
    return EXIT.ok
  }
  for (const line of renderPageView(found.view)) io.out(line)
  return EXIT.ok
}

/**
 * `PageView` 하나를 사람이 읽는 줄들로. **여기가 이 명령의 전부다** — 무엇을 실을지는
 * 이미 정해져 있고 이 함수는 그것을 들여쓸 뿐이다.
 */
export function renderPageView(view: PageView): string[] {
  // 팝업 페이지는 이름 뒤에 종류를 말한다 — 화면 페이지는 옛 출력 그대로.
  const lines = [view.path, `  ${view.title}${view.kind === 'popup' ? ' · 팝업' : ''} · ${view.id} · 노드 ${view.nodeCount}개`]
  if (view.description !== null && view.description.length > 0) {
    lines.push(`  ${view.description}`)
  }

  // 화면 상태가 있으면 목록을 먼저 말한다 — 구조의 «(관리자 상태)» 가 무엇의 이름인지. 없으면 줄을 안 낸다(옛 출력 그대로). 트리 차례이고 하위 상태는
  // 조상부터 잇는다(«로그인 > 관리자» — 한 줄이라 들여쓰기 대신).
  if (view.viewStates.length > 0) {
    const named = (id: string): string => view.viewStates.find((state) => state.id === id)?.name ?? id
    const paths = viewStateOrder(view.viewStates).map(({ state }) =>
      stateLineage(view.viewStates, state.id).reverse().map(named).join(' > '),
    )
    lines.push(`  화면 상태: 기본 · ${paths.join(' · ')}`)
  }

  lines.push('', '구조')
  for (const node of view.nodes) {
    // 이름 붙은 구역에 선 노드는 구역 화면 이름을 앞에 붙인다(«[머리 오른쪽] 수정 버튼»).
    lines.push(`  ${'  '.repeat(node.depth)}${node.zoneLabel === undefined ? '' : `[${node.zoneLabel}] `}${node.name}${codeNote(node)}`)
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

/**
 * 공통코드에 묶인 노드의 꼬리 — 무엇을 가리키는지(그룹 키 › 코드값). 표에 없으면 «끊긴 공통코드» 다. 표를 못 받은 판(`resolved` 가 `null`)은
 * 끊김을 말하지 않는다(모르는 것과 끊긴 것은 다르다). 묶이지 않은 노드는 빈 글 — 옛 출력 그대로.
 */
function codeNote(node: PageViewNode): string {
  const code = node.code
  if (code === undefined) return ''
  const target = code.item === undefined ? code.group : `${code.group} › ${code.item}`
  return code.resolved?.broken === true ? ` · 끊긴 공통코드 ${target}` : ` · 공통코드 ${target}`
}

/**
 * 못 찾았을 때 보일 후보. **분모를 말한다** — 잘린 것을 숨기지 않는다.
 *
 * **접두를 벗겨 낸다** — 사람이 이 줄을 그대로 다시 쳐야 하고, `wireb lint`의 출력도 벗긴
 * 모양이다. 스모크에서 두 자리가 다르게 나오는 것을 보고 맞췄다. (벗기는 것은
 * `read/page.ts`가 이미 했다 — 여기는 자르기만 한다.)
 */
function candidates(targets: readonly string[]): string[] {
  if (targets.length === 0) return ['  이 프로젝트에는 페이지가 없습니다']
  const shown = targets.slice(0, CANDIDATE_LIMIT)
  const lines = ['  있는 경로:', ...shown.map((target) => `  - ${target}`)]
  if (targets.length > shown.length) lines.push(`  … 그리고 ${targets.length - shown.length}개 더`)
  return lines
}
