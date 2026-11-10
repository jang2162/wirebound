/**
 * **설계서 「lint 규칙」의 설계서 규칙**. 프로젝트 하나를 값으로 받아 결함 목록을 낸다.
 * 번호 ①~⑦은 그 절의 설계서 규칙 순서다(`LINT_RULES`의 `group: 'document'` 순서와 같다).
 *
 * ## 이미 있는 것은 부른다
 *
 * 하는 일이 둘이다:
 *
 * 1. **이미 있는 판정을 부르고 나른다** — `validatePage`(③과 「lint 규칙」 밖) ·
 *    `checkPageAction`(④의 *"아직 안 고름"*).
 * 2. **없는 것만 새로 판정한다** — ① ② ④의 **존재 검사** ⑤ ⑥ ⑦.
 *
 * 다시 짜면 두 벌이 되고, 갈리는 날 *"웹은 통과시키는데 lint는 막는다"*가 된다.
 *
 * **어느 쪽이 몇인지는 여기 적지 않는다.** 나르는 규칙은 `LINT_RULES`에서 `severity: null`이고
 * 새 판정은 값을 든다 — 표가 그것을 들므로 산문이 다시 세면 갈린다(여기 산술을 적으면 표가
 * 바뀔 때 같은 파일 안에서 어긋난다).
 *
 * ## 카탈로그를 여기서 설치하지 않는다
 *
 * `validatePage`가 `getComponent`를 그냥 부르는 것과 같은 자리다(`checkThemeComponents`의
 * 머리말도 같은 판단을 적었다). 설치하지 않은 채 부르면 모든 타입이 `unknown-type`이 되어
 * 나가고, 그것은 이슈로 보인다 — 조용히 통과하지 않는다.
 *
 * ## `partitionIssues`를 부르지 않는다
 *
 * 그 함수가 긋는 선의 뜻은 *"저장을 막는가"*이고 lint는 저장 게이트가 아니다. 이 목록을
 * 무엇으로 가를지(예: `wireb lint`의 종료 코드)는 소비자가 정한다.
 */
import { checkPageAction, isPageTargetAction } from '../interaction/check'
import { nodeDisplayName } from '../interaction/describe'
import type { PageDocument, WbNode } from '../node'
import { BODY_ZONE } from '../component/define'
import { pageKindOf, type PageKind } from '../new-page'
import { pageTargetKey } from '../page-target'
import { walkNodes } from '../tree'
import { zoneList } from '../zones'
import type { ValidationCode, ValidationIssue } from '../validate'
import { unknownVisibilityStates, validatePage } from '../validate'
import { stateDescendants } from '../visibility'
import { lintIssue, relayLintIssue, type LintIssue } from './issue'
import type { LintConfig, LintPage, LintProject } from './input'
import type { RelayRuleId } from './rules'

/**
 * 「lint 규칙」이 이름으로 든 **주요 컴포넌트** 셋. 그 줄이 목록을 괄호로 못박았으므로 여기서
 * 늘리거나 줄이지 않는다 — `test/lint-rules.test.ts`가 그 줄을 글자 그대로 대조한다.
 */
const MAJOR_COMPONENTS: readonly string[] = ['DataGrid', 'EntryForm', 'SearchForm']

/**
 * ⑥ *"`EntryForm` 안에 `Field`가 하나도 없는 **등**"*의 표.
 *
 * **`등`을 여기서 지어내지 않는다.** 든 셋은 「lint 규칙」이 이름으로 든 `EntryForm`과, 같은
 * 근거가 그대로 서는 `SearchForm` · `FormTable` · `DataGrid` 다 — 넷 다 카탈로그가 몸통을 선언해 자식 0을
 * 허용하는데, **입력 칸이 하나도 없는 폼은 그 노드가 화면에서 하는 일이 없다**(폼 표는 라벨 칸이
 * 하나도 없는 표, 열이 없는 그리드는 머리도 칸도 없는 표다). 다섯째를 더하려면 같은 종류의 근거가 있어야 한다
 * (*"그 컴포넌트가 무엇 없이는 빈 상자다"*).
 */
const STRUCTURAL_GAPS: readonly { container: string; requires: string }[] = [
  { container: 'EntryForm', requires: 'Field' },
  { container: 'SearchForm', requires: 'Field' },
  { container: 'FormTable', requires: 'Field' },
  { container: 'DataGrid', requires: 'GridColumn' },
]

/**
 * `validatePage`의 코드를 lint 규칙으로 옮기는 표.
 *
 * **`Record<ValidationCode, …>`인 것이 요점이다** — `ValidationCode`에 코드가 늘면 이 표에
 * 항목이 없어 **타입체크가 먼저 죽는다**(`ISSUE_SEVERITY`와 같은 장치). 새 코드가 조용히
 * `document-invalid`로 떨어지는 경로가 없다.
 *
 * 상호작용 셋이 ③으로 가는 것은 「lint 규칙」의 줄(*"대상 노드가 삭제된 상호작용 규칙"*)이 그
 * 부류를 가리키기 때문이다. 셋을 갈라 세 규칙으로 두면 그 절에 없는 줄이 둘 생긴다.
 *
 * **테스트가 이 표를 통째로 못박는다**(`test/lint-mapping.test.ts`). 타입은 *"항목이 있는가"*만
 * 보므로 **오른쪽 값을 조용히 다른 줄로 옮기는 경로**가 타입만으로는 남는다 — 그 변이는
 * 아무 타입 오류도 안 낸다. 어느 코드가 「lint 규칙」의 어느 줄로 가는지는 **판단**이므로
 * 밖에서 볼 수 있어야 한다.
 */
export const VALIDATION_RULE: Record<ValidationCode, RelayRuleId> = {
  'missing-interaction-target': 'interaction-target',
  'invalid-interaction-target': 'interaction-target',
  'invalid-interaction-prop': 'interaction-target',
  'unknown-type': 'document-invalid',
  'invalid-props': 'document-invalid',
  'children-not-allowed': 'document-invalid',
  'zone-not-allowed': 'document-invalid',
  'zone-type-not-allowed': 'document-invalid',
  'misplaced-component': 'document-invalid',
  'ignored-variant': 'document-invalid',
  'duplicate-id': 'document-invalid',
  'bad-root': 'document-invalid',
  'nested-page': 'document-invalid',
  'slot-count': 'document-invalid',
  'bad-document': 'document-invalid',
  // 저장 경계만 낸다(`checkViewStateRemoval` — 편집 전후를 본다). lint 는 저장된 문서 하나를 보므로 이 코드를 받지 않는다 — 표의 칸은
  // `Record`가 요구해 둔다.
  'state-cases-left': 'document-invalid',
  'invalid-code-ref': 'document-invalid',
}

/**
 * 설계서 규칙을 전부 돌린다. **순서는 규칙 순이 아니라 자리 순이다** — 페이지 하나를 두고
 * 난 이슈가 흩어지면 읽는 사람이 페이지를 오간다.
 */
export function lintDesign(project: LintProject, config: LintConfig = {}): LintIssue[] {
  const issues: LintIssue[] = []

  issues.push(...unlinkedPages(project))
  issues.push(...namingIssues(project, config))

  const targets = new Set(project.pages.map((page) => pageTargetKey(page.target)))
  const kinds = targetKinds(project)
  const commented = commentedNodes(project)

  for (const page of project.pages) {
    issues.push(...lintPage(page, targets, kinds, commented.get(page.id) ?? new Set()))
  }

  return issues
}

/**
 * 타겟의 열쇠(`pageTargetKey`) → 그 타겟을 든 페이지들의 종류(`page` · `popup`). 둘 이상이 같은 타겟을 들면 종류가 갈릴 수 있다 — 아래 판정은 «하나도 팝업이 아니다» ·
 * «모두 팝업이다» 로 본다(둘 이상인 타겟은 링크가 안 이어지는 판이라 종류로 말하지 않는다).
 */
function targetKinds(project: LintProject): ReadonlyMap<string, ReadonlySet<PageKind>> {
  const kinds = new Map<string, Set<PageKind>>()
  for (const page of project.pages) {
    const key = pageTargetKey(page.target)
    const set = kinds.get(key) ?? new Set<PageKind>()
    set.add(pageKindOf(page.document))
    kinds.set(key, set)
  }
  return kinds
}

function lintPage(
  page: LintPage,
  targets: ReadonlySet<string>,
  kinds: ReadonlyMap<string, ReadonlySet<PageKind>>,
  commented: ReadonlySet<string>,
): LintIssue[] {
  const where = { pageId: page.id }

  // ③ · 「lint 규칙」 밖 — 이미 있는 판정을 그대로 나른다.
  const validation = validatePage(page.document)
  const issues: LintIssue[] = validation.map((issue) => relayValidation(page.id, issue))

  /**
   * **봉투가 깨졌으면 여기서 끝난다.** `validate.ts`의 `validateEnvelope`가 그 계약을 이미
   * 적어 뒀다 — *"트리 순회(`walkNodes`)보다 먼저 돌아야 한다. root가 null이거나 형태가
   * 깨져 있으면 walkNodes가 그대로 터지기 때문이다."* `validatePage`는 그 계약을 지키고,
   * 이 함수도 지켜야 **이슈 대신 예외가 나가지 않는다.**
   *
   * **lint는 남이 준 것을 읽는 도구다.** `wireb pull`이 받은 JSON도 MCP가 받은 본문도
   * `JSON.parse`의 결과라 타입이 막아 주지 않는다 — 깨진 입력이 정상 입력이다. 던지면
   * 소비자 셋이 그 예외를 각자 다루게 되고 그것이 두 벌이 되는 자리다. 그리고 이 파일은
   * 그 입력이 온다는 것을 **스스로 전제한다** — 아래 `VALIDATION_RULE` 표에
   * `bad-document` 줄이 있다.
   *
   * **`bad-document`가 곧 봉투 실패다.** 그 코드를 만드는 자리는 `validateEnvelope` 하나이고
   * 그 함수가 이슈를 내면 `validatePage`가 즉시 반환하므로, 이 코드가 목록에 있다는 것과
   * 트리를 안 돌았다는 것이 같은 사실이다.
   */
  if (validation.some((issue) => issue.code === 'bad-document')) return issues

  const markers = new Set<number>()
  issues.push(...viewStateIssues(page.document, where))

  for (const { node, path } of walkNodes(page.document.root)) {
    // ① 코멘트가 없는 주요 컴포넌트
    if (MAJOR_COMPONENTS.includes(node.type) && !commented.has(node.id)) {
      issues.push(
        lintIssue(
          'comment-missing',
          { ...where, nodeId: node.id },
          path,
          `${nodeDisplayName(node)}(${node.type})에 코멘트가 없습니다 — 주요 컴포넌트는 설명이 필요합니다`,
        ),
      )
    }

    // ⑤ 중복된 코멘트 번호
    const marker = node.marker
    if (typeof marker === 'number' && Number.isInteger(marker)) {
      if (markers.has(marker)) {
        issues.push(lintIssue('duplicate-marker', { ...where, nodeId: node.id }, `${path}/marker`, `코멘트 번호가 중복됩니다: ${marker}`))
      }
      markers.add(marker)
    }

    // ⑥ 구조적 공백
    for (const gap of STRUCTURAL_GAPS) {
      if (node.type !== gap.container) continue
      if (hasDescendant(node, gap.requires)) continue
      issues.push(
        lintIssue('structural-gap', { ...where, nodeId: node.id }, path, `${gap.container} 안에 ${gap.requires}가 하나도 없습니다`),
      )
    }

    // 그리드 — 그려지지 않는 내용 · 칸 폭이 어긋난 행
    if (node.type === 'GridColumn' && isNumbered(node) && zoneList(node, BODY_ZONE).length > 0) {
      issues.push(
        lintIssue('ignored-template', { ...where, nodeId: node.id }, path, `번호 열의 셀 틀은 그려지지 않습니다: ${nodeDisplayName(node)}`),
      )
    }
    if (node.type === 'GridRow' && readProp(node, 'kind') === 'gap' && zoneList(node, BODY_ZONE).length > 0) {
      issues.push(lintIssue('ignored-template', { ...where, nodeId: node.id }, path, '생략 띠 행은 칸을 그리지 않습니다'))
    }
    if (node.type === 'DataGrid') issues.push(...gridRowIssues(node, path, where))

    // ④ navigate·openModal 대상 페이지 — 있는가 · 종류가 맞는가
    issues.push(...pageTargetIssues(node, path, where, targets, kinds))
    // 화면 페이지의 팝업 닫기
    if (pageKindOf(page.document) !== 'popup') issues.push(...closeOutsidePopup(node, path, where))
  }

  return issues
}

/**
 * ④ — 페이지 경로를 받는 액션 둘을 본다.
 *
 * **`checkPageAction`을 부르는 것이 `validatePage`와 다른 점이다.** 그 함수는 그것을 일부러
 * 부르지 않는데(*"빈 페이지 타겟이 **저장 경로에서** 경고가 되기 시작한다"* — `validate.ts`의
 * `checkInteractions` 머리말) **lint는 저장 경로가 아니다.** 그래서 그 판정이 여기서는 뒤집을
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
  kinds: ReadonlyMap<string, ReadonlySet<PageKind>>,
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
      // 에디터 뷰 모드 · 번들과 같은 풀이(`matchPageTargets` 의 열쇠) — 글자 그대로 견주면 둘이 여는 글자를 «없다» 고 한다.
      const key = pageTargetKey(action.target)
      if (targets.has(key)) {
        const kind = kinds.get(key)
        if (kind?.size !== 1) continue
        if (action.type === 'openModal' && kind.has('page')) {
          issues.push(
            lintIssue(
              'modal-target-not-popup',
              { ...where, nodeId: node.id },
              at,
              `팝업 열기의 대상이 팝업 페이지가 아닙니다 — 뷰 모드 · 번들이 덮개 위에 띄우지 않습니다: ${action.target}`,
            ),
          )
        }
        if (action.type === 'navigate' && kind.has('popup')) {
          issues.push(
            lintIssue(
              'navigate-to-popup',
              { ...where, nodeId: node.id },
              at,
              `페이지 이동의 대상이 팝업 페이지입니다 — 덮개 위에 띄우려면 팝업 열기를 씁니다: ${action.target}`,
            ),
          )
        }
        continue
      }

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

/** 화면 페이지의 «팝업 닫기» — 덮개 위 팝업은 뒤 화면의 누름을 막아, 이 페이지의 단추로는 닫을 팝업이 없다. */
function closeOutsidePopup(node: WbNode, path: string, where: { pageId: string }): LintIssue[] {
  const issues: LintIssue[] = []
  for (const [index, interaction] of (node.interactions ?? []).entries()) {
    for (const [actionIndex, action] of (interaction.actions ?? []).entries()) {
      if (action?.type !== 'closeModal') continue
      issues.push(
        lintIssue(
          'close-outside-popup',
          { ...where, nodeId: node.id },
          `${path}/interactions/${index}/actions/${actionIndex}`,
          '화면 페이지의 팝업 닫기입니다 — 닫을 팝업이 없습니다(덮개 위 팝업은 뒤 화면을 막습니다)',
        ),
      )
    }
  }
  return issues
}

/**
 * 화면 상태 둘(설계서 「lint 규칙」의 상태 줄). 상태 id 는 문서의 목록(`viewStates`)이 정한다 — 목록이 없으면 기본만 있다.
 *
 * - `view-state-unknown` — 노드 보임이 목록에 없는 상태를 가리킨다(`unknownVisibilityStates`). 그 상태는 고를 수 없어 보임이 설계한 화면이
 *   아무 상태에서도 안 선다. 자리는 그 노드의 `visibility`. 저장 경계는 편집이 새로 만든 것을 막으므로 가져온 문서에서 선다.
 * - `view-state-unused` — 그 상태도 그 하위 상태도 어느 보임도 안 가리킨다(상태를 골라도 화면이 부모 상태 · 기본과 같다). 자리는 목록의 그
 *   항목(`/viewStates/<i>`) — 노드가 없다.
 */
function viewStateIssues(document: PageDocument, where: { pageId: string }): LintIssue[] {
  const issues: LintIssue[] = []
  const list = Array.isArray(document.viewStates) ? document.viewStates : []
  for (const { nodeId, path, states } of unknownVisibilityStates(document)) {
    issues.push(
      lintIssue(
        'view-state-unknown',
        { ...where, nodeId },
        path,
        `상태 보임이 페이지의 상태 목록에 없는 상태를 가리킵니다: ${states.join(', ')}`,
      ),
    )
  }
  const used = new Set<string>()
  for (const { node } of walkNodes(document.root)) for (const state of node.visibility?.states ?? []) used.add(state)
  for (const [index, state] of list.entries()) {
    if (typeof state?.id !== 'string') continue
    if (used.has(state.id) || stateDescendants(list, state.id).some((id) => used.has(id))) continue
    issues.push(lintIssue('view-state-unused', where, `/viewStates/${index}`, `상태 "${state.name}" 을 가리키는 보임이 없습니다`))
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
 * ⑦ — 설정이 있을 때만 돈다.
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
      issues.push(lintIssue('naming', entry.where, '/', `${entry.kind} 이름이 명명 규칙(${source})에 어긋납니다: ${entry.title}`))
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
 * **번호만 남는 경로가 셋 있다** — undo, 페이지 JSON 가져오기(설계서 「페이지 JSON」), 사람이 손으로 넣은 `marker`
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
  return relayLintIssue(VALIDATION_RULE[issue.code], { pageId, ...(issue.nodeId === null ? {} : { nodeId: issue.nodeId }) }, issue)
}

/** props 의 값 하나 — 검증 전 문서에서 던지지 않는다. */
function readProp(node: WbNode, prop: string): unknown {
  const props: unknown = node.props
  return props !== null && typeof props === 'object' ? (props as Record<string, unknown>)[prop] : undefined
}

/** 정수 prop — 1 이상 정수가 아니면 1(카탈로그의 기본값). */
function countProp(node: WbNode, prop: string): number {
  const value = readProp(node, prop)
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1
}

function isNumbered(node: WbNode): boolean {
  const value = readProp(node, 'numbering')
  return value === 'asc' || value === 'desc'
}

/** 열 트리의 잎 열 수 — 빈 열 묶음은 한 칸을 차지한다(그리드 뷰가 그렇게 그린다 — SDK `gridLayout`). */
function leafColumns(list: readonly unknown[]): number {
  let count = 0
  for (const child of list) {
    if (child === null || typeof child !== 'object') continue
    const node = child as WbNode
    if (node.type === 'GridColumn') count += 1
    else if (node.type === 'GridColumnGroup') count += Math.max(1, leafColumns(zoneList(node, BODY_ZONE)))
  }
  return count
}

/**
 * 제 칸을 가진 행마다 칸 폭 합이 잎 열 수와 맞는가 — 줄(`repeat`)마다 위 줄의 `rowSpan` 이 덮어 내려온 열을 더한다(HTML 표와 같은 셈 —
 * SDK `gridLayout` 이 화면에서 하는 것). `rowSpan` 은 표 끝 · 생략 띠 앞에서 끊긴다. 어긋난 행마다 하나를 낸다.
 */
function gridRowIssues(grid: WbNode, path: string, where: { pageId: string }): LintIssue[] {
  const leaves = leafColumns(zoneList(grid, BODY_ZONE))
  const rows = zoneList(grid, 'rows').filter((row): row is WbNode => row !== null && typeof row === 'object')
  // 줄마다 위에서 덮인 열 수 — 줄 차례는 행 차례 × 되풀이.
  const lines: { row: WbNode; index: number; gap: boolean }[] = []
  rows.forEach((row, index) => {
    const gap = readProp(row, 'kind') === 'gap'
    for (let line = 0; line < (gap ? 1 : countProp(row, 'repeat')); line++) lines.push({ row, index, gap })
  })
  const covered = Array.from({ length: lines.length }, () => 0)
  const issues: LintIssue[] = []
  const flagged = new Set<WbNode>()
  lines.forEach(({ row, index, gap }, at) => {
    if (gap) return
    const cells = zoneList(row, BODY_ZONE).filter((cell): cell is WbNode => cell !== null && typeof cell === 'object')
    if (cells.length === 0) return
    const width = covered[at]! + cells.reduce((sum, cell) => sum + countProp(cell, 'span'), 0)
    for (const cell of cells) {
      const down = countProp(cell, 'rowSpan')
      for (let below = at + 1; below < Math.min(lines.length, at + down); below++) {
        if (lines[below]!.gap) break
        covered[below] = covered[below]! + countProp(cell, 'span')
      }
    }
    if (width === leaves || flagged.has(row)) return
    flagged.add(row)
    issues.push(
      lintIssue(
        'grid-row-cells',
        { ...where, nodeId: row.id },
        `${path}/zones/rows/${index}`,
        `그리드 행의 칸 폭 합(${width})이 열 수(${leaves})와 다릅니다`,
      ),
    )
  })
  return issues
}

/** 자손 어딘가에 그 타입이 있는가. 자기 자신은 세지 않는다. */
function hasDescendant(node: WbNode, type: string): boolean {
  for (const visit of walkNodes(node)) {
    if (visit.node !== node && visit.node.type === type) return true
  }
  return false
}
