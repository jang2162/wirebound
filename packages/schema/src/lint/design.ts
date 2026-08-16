/**
 * **§12.4의 설계서 규칙**. 프로젝트 하나를 값으로 받아 결함 목록을 낸다.
 *
 * ## 이미 있는 것은 부른다 (D1)
 *
 * T1에서 §12.4의 열셋을 재 보니 설계서 규칙 일곱 중 **셋만** 오늘의 판정기가 이미 본다
 * (③ 온전히 · ④ 절반 · 나머지 넷은 이슈 0건이었다). 그래서 이 파일이 하는 일은 둘이다:
 *
 * 1. **이미 있는 판정을 부르고 나른다** — `validatePage`(③과 §12.4 밖) ·
 *    `checkPageAction`(④의 *"아직 안 고름"*).
 * 2. **없는 것만 새로 판정한다** — ① ② ④의 존재 검사 ⑤ ⑥ ⑦.
 *
 * 다시 짜면 두 벌이 되고, 갈리는 날 *"웹은 통과시키는데 lint는 막는다"*가 된다.
 *
 * ## 카탈로그를 여기서 설치하지 않는다
 *
 * `validatePage`가 `getComponent`를 그냥 부르는 것과 같은 자리다(`checkThemeComponents`의
 * 머리말도 같은 판단을 적었다). 설치하지 않은 채 부르면 모든 타입이 `unknown-type`이 되어
 * 나가고, 그것은 이슈로 보인다 — 조용히 통과하지 않는다.
 *
 * ## `partitionIssues`를 부르지 않는다 (D4)
 *
 * 그 함수가 긋는 선의 뜻은 *"저장을 막는가"*이고 lint는 저장 게이트가 아니다. 이 목록을
 * 무엇으로 가를지(예: `wireb lint`의 종료 코드)는 소비자가 정한다.
 */
import { checkPageAction, isPageTargetAction } from '../interaction/check'
import type { WbNode } from '../node'
import { walkNodes } from '../tree'
import type { ValidationCode, ValidationIssue } from '../validate'
import { validatePage } from '../validate'
import { lintIssue, relayLintIssue, type LintIssue } from './issue'
import type { LintConfig, LintPage, LintProject } from './input'
import type { RelayRuleId } from './rules'

/**
 * §12.4가 이름으로 든 **주요 컴포넌트** 셋. 그 줄이 목록을 괄호로 못박았으므로 여기서
 * 늘리거나 줄이지 않는다 — `test/lint-rules.test.ts`가 그 줄을 글자 그대로 대조한다.
 */
const MAJOR_COMPONENTS: readonly string[] = ['List', 'EntryForm', 'SearchForm']

/**
 * ⑥ *"`EntryForm` 안에 `Field`가 하나도 없는 **등**"*의 표.
 *
 * **`등`을 여기서 지어내지 않는다.** 오늘 든 둘은 §12.4가 이름으로 든 `EntryForm`과, 같은
 * 근거가 그대로 서는 `SearchForm`이다 — 둘 다 카탈로그가 `children: 'many'`라 자식 0을
 * 허용하는데, **입력 칸이 하나도 없는 폼은 그 노드가 화면에서 하는 일이 없다.** 셋째를
 * 더하려면 같은 종류의 근거가 있어야 한다(*"그 컴포넌트가 무엇 없이는 빈 상자다"*).
 */
const STRUCTURAL_GAPS: readonly { container: string; requires: string }[] = [
  { container: 'EntryForm', requires: 'Field' },
  { container: 'SearchForm', requires: 'Field' },
]

/**
 * `validatePage`의 코드를 lint 규칙으로 옮기는 표.
 *
 * **`Record<ValidationCode, …>`인 것이 요점이다** — `ValidationCode`에 코드가 늘면 이 표에
 * 항목이 없어 **타입체크가 먼저 죽는다**(`ISSUE_SEVERITY`와 같은 장치). 새 코드가 조용히
 * `document-invalid`로 떨어지는 경로가 없다.
 *
 * 상호작용 셋이 ③으로 가는 것은 §12.4의 줄(*"대상 노드가 삭제된 상호작용 규칙"*)이 그
 * 부류를 가리키기 때문이다. 셋을 갈라 세 규칙으로 두면 §12.4에 없는 줄이 둘 생긴다.
 */
const VALIDATION_RULE: Record<ValidationCode, RelayRuleId> = {
  'missing-interaction-target': 'interaction-target',
  'invalid-interaction-target': 'interaction-target',
  'invalid-interaction-prop': 'interaction-target',
  'unknown-type': 'document-invalid',
  'invalid-props': 'document-invalid',
  'children-not-allowed': 'document-invalid',
  'unknown-variant': 'document-invalid',
  'ignored-variant': 'document-invalid',
  'duplicate-id': 'document-invalid',
  'bad-root': 'document-invalid',
  'slot-count': 'document-invalid',
  'bad-document': 'document-invalid',
}

/**
 * 설계서 규칙을 전부 돌린다. **순서는 규칙 순이 아니라 자리 순이다** — 페이지 하나를 두고
 * 난 이슈가 흩어지면 읽는 사람이 페이지를 오간다.
 */
export function lintDesign(project: LintProject, config: LintConfig = {}): LintIssue[] {
  const issues: LintIssue[] = []

  issues.push(...unlinkedPages(project))
  issues.push(...namingIssues(project, config))

  const targets = new Set(project.pages.map((page) => page.target))
  const commented = commentedNodes(project)

  for (const page of project.pages) {
    issues.push(...lintPage(page, targets, commented.get(page.id) ?? new Set()))
  }

  return issues
}

function lintPage(page: LintPage, targets: ReadonlySet<string>, commented: ReadonlySet<string>): LintIssue[] {
  const issues: LintIssue[] = []
  const where = { pageId: page.id }

  // ③ · §12.4 밖 — 이미 있는 판정을 그대로 나른다.
  for (const issue of validatePage(page.document)) {
    issues.push(relayValidation(page.id, issue))
  }

  const markers = new Set<number>()

  for (const { node, path } of walkNodes(page.document.root)) {
    // ① 코멘트가 없는 주요 컴포넌트
    if (MAJOR_COMPONENTS.includes(node.type) && !commented.has(node.id)) {
      issues.push(
        lintIssue(
          'comment-missing',
          { ...where, nodeId: node.id },
          path,
          `${node.type}에 코멘트가 없습니다 — 주요 컴포넌트는 설명이 필요합니다`,
        ),
      )
    }

    // ⑤ 중복된 코멘트 번호
    const marker = node.marker
    if (typeof marker === 'number' && Number.isInteger(marker)) {
      if (markers.has(marker)) {
        issues.push(
          lintIssue(
            'duplicate-marker',
            { ...where, nodeId: node.id },
            `${path}/marker`,
            `코멘트 번호가 중복됩니다: ${marker}`,
          ),
        )
      }
      markers.add(marker)
    }

    // ⑥ 구조적 공백
    for (const gap of STRUCTURAL_GAPS) {
      if (node.type !== gap.container) continue
      if (hasDescendant(node, gap.requires)) continue
      issues.push(
        lintIssue(
          'structural-gap',
          { ...where, nodeId: node.id },
          path,
          `${gap.container} 안에 ${gap.requires}가 하나도 없습니다`,
        ),
      )
    }

    // ④ navigate·openModal 대상 페이지
    issues.push(...pageTargetIssues(node, path, where, targets))
  }

  return issues
}

/**
 * ④ — 페이지 경로를 받는 액션 둘을 본다.
 *
 * **`checkPageAction`을 부르는 것이 `validatePage`와 다른 점이다.** 그 함수는 그것을 일부러
 * 부르지 않는데(*"부르면 재라 #1의 판정이 뒤집힌다 — 빈 페이지 타겟이 **저장 경로에서**
 * 경고가 되기 시작한다"*) **lint는 저장 경로가 아니다.** 그래서 그 판정이 여기서는 뒤집을
 * 것이 없고, *"아직 안 골랐다"*는 문장을 여기서 다시 쓰지 않아도 된다.
 *
 * **존재 검사는 새로 한다.** 그 함수가 못 하는 것이 그것이고(문서 하나만 보므로), 프로젝트
 * 전체를 받는 자리가 여기다.
 */
function pageTargetIssues(
  node: WbNode,
  path: string,
  where: { pageId: string },
  targets: ReadonlySet<string>,
): LintIssue[] {
  const issues: LintIssue[] = []

  for (const [index, interaction] of (node.interactions ?? []).entries()) {
    for (const [actionIndex, action] of (interaction.actions ?? []).entries()) {
      if (!isPageTargetAction(action)) continue

      const at = `${path}/interactions/${index}/actions/${actionIndex}`
      const empty = checkPageAction(action)
      if (empty !== null) {
        issues.push(lintIssue('page-target-missing', { ...where, nodeId: node.id }, at, empty.message))
        continue
      }
      if (targets.has(action.target)) continue

      issues.push(
        lintIssue(
          'page-target-missing',
          { ...where, nodeId: node.id },
          at,
          `${action.type}의 대상 페이지가 프로젝트에 없습니다: ${action.target}`,
        ),
      )
    }
  }

  return issues
}

/**
 * ② — 메뉴 뿌리에서 닿지 않는 페이지.
 *
 * **닿음을 뿌리에서부터 내려가며 센다.** 부모를 거슬러 올라가면 순환에서 무한 루프가 되고,
 * 그 상태는 값으로 만들 수 있다 — `buildMenuTree`가 같은 이유로 *"재귀로 부모 사슬을 타지
 * 않는다"*고 적어 두었고, 그 함수는 닿지 않는 노드를 **조용히 버린다.** lint가 하는 일이
 * 바로 그 침묵을 값으로 만드는 것이다.
 */
function unlinkedPages(project: LintProject): LintIssue[] {
  const children = new Map<string | null, string[]>()
  for (const menu of project.menu) {
    const siblings = children.get(menu.parentId)
    if (siblings === undefined) children.set(menu.parentId, [menu.id])
    else siblings.push(menu.id)
  }

  const reachable = new Set<string>()
  const queue = [...(children.get(null) ?? [])]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    queue.push(...(children.get(id) ?? []))
  }

  const known = new Set(project.menu.map((menu) => menu.id))

  return project.pages
    .filter((page) => !reachable.has(page.menuNodeId))
    .map((page) =>
      lintIssue(
        'page-unlinked',
        { pageId: page.id },
        '/',
        known.has(page.menuNodeId)
          ? `메뉴 트리의 뿌리에서 닿지 않는 메뉴에 달려 있습니다: ${page.menuNodeId}`
          : `가리키는 메뉴가 프로젝트에 없습니다: ${page.menuNodeId}`,
      ),
    )
}

/**
 * ⑦ — 설정이 있을 때만 돈다 (D5).
 *
 * **정규식을 못 읽으면 그것을 이슈로 낸다.** 조용히 넘기면 설정을 잘못 적은 사람이
 * *"위반 0건"*을 보고 규칙이 도는 줄 안다 — 이 저장소가 반복해서 닫아 온 침묵이다.
 */
function namingIssues(project: LintProject, config: LintConfig): LintIssue[] {
  const naming = config.naming
  if (naming === undefined) return []

  const issues: LintIssue[] = []

  const check = (
    source: string | undefined,
    label: string,
    entries: readonly { where: { pageId?: string }; title: string; kind: string }[],
  ): void => {
    if (source === undefined) return
    let pattern: RegExp
    try {
      pattern = new RegExp(source)
    } catch {
      issues.push(lintIssue('naming', {}, '/', `${label} 명명 규칙이 정규식이 아닙니다: ${source}`))
      return
    }
    for (const entry of entries) {
      if (pattern.test(entry.title)) continue
      issues.push(
        lintIssue('naming', entry.where, '/', `${entry.kind} 이름이 명명 규칙(${source})에 어긋납니다: ${entry.title}`),
      )
    }
  }

  check(
    naming.page,
    '페이지',
    project.pages.map((page) => ({ where: { pageId: page.id }, title: page.title, kind: '페이지' })),
  )
  check(
    naming.menu,
    '메뉴',
    project.menu.map((menu) => ({ where: {}, title: menu.title, kind: '메뉴' })),
  )

  return issues
}

/**
 * 페이지마다 **코멘트가 붙은 노드 id**. 다른 페이지의 코멘트가 덮지 않게 페이지로 가른다.
 *
 * **`node.marker`가 아니라 코멘트 목록을 진실로 삼는다.** 번호는 코멘트가 생길 때 파이프라인이
 * 노드에 심고 마지막 코멘트가 지워질 때 지운다(`apps/api`의 `routes/comments.ts`). 그런데
 * **번호만 남는 경로가 셋 있다** — undo, §11.2 JSON 가져오기, 사람이 손으로 넣은 `marker`
 * (그 파일이 셋을 적어 두었다). 번호로 재면 그 셋이 *"코멘트가 있다"*로 읽혀 ①이 조용해진다.
 */
function commentedNodes(project: LintProject): Map<string, Set<string>> {
  const byPage = new Map<string, Set<string>>()
  for (const comment of project.comments) {
    const nodes = byPage.get(comment.pageId)
    if (nodes === undefined) byPage.set(comment.pageId, new Set([comment.nodeId]))
    else nodes.add(comment.nodeId)
  }
  return byPage
}

/**
 * `validatePage`의 이슈 하나를 나른다. **표가 `RelayRuleId`만 담으므로 캐스팅이 없다** —
 * 누가 이 표의 오른쪽을 severity를 스스로 든 규칙으로 바꾸면 그 줄이 컴파일되지 않는다.
 */
function relayValidation(pageId: string, issue: ValidationIssue): LintIssue {
  return relayLintIssue(
    VALIDATION_RULE[issue.code],
    { pageId, ...(issue.nodeId === null ? {} : { nodeId: issue.nodeId }) },
    issue,
  )
}

/** 자손 어딘가에 그 타입이 있는가. 자기 자신은 세지 않는다. */
function hasDescendant(node: WbNode, type: string): boolean {
  for (const visit of walkNodes(node)) {
    if (visit.node !== node && visit.node.type === type) return true
  }
  return false
}
