/**
 * **붙이기 · 복제 · 여럿 지우기의 편집** — 클립보드(`./use-clipboard.ts`)와 복제 단축키(`shell/editor-keys.tsx`)가 쓴다.
 *
 * **편집은 새 종류를 만들지 않는다** — 넣기는 `insertNodeOps`, 지우기는 `removeNodeOps`(`./ops.ts`)다. 여럿은 그 연산을 **차례로 적용한
 * 문서 위에서** 이어 짓는다 — RFC 6902 의 포인터는 앞 연산을 적용한 뒤 문서의 좌표라, 편집 전 문서에서 한꺼번에 지으면 앞 연산이 민 좌표가
 * 어긋난다(`CLAUDE.md` 「편집의 포인터를 판정에 넣을 때」). 묶음 하나가 편집 하나 · 되돌리기 하나다.
 *
 * **붙이는 · 복제한 노드는 `marker`(코멘트 번호)를 안 든다** — 코멘트는 따라가지 않는다(설계서 「설계서 화면 구조」의 클립보드). 번호를 든 채
 * 넣으면 한 페이지에 같은 번호가 둘이 되거나 다른 페이지의 번호가 코멘트 없이 선다. 걷는 것은 `stripMarkers`(`@wirebound/schema`) 하나다.
 *
 * **순수하고 던지지 않는다** — `{ reason }` 으로 왜 못 하는지 말한다(`./pattern-insert.ts` · `palette/palette-add.ts` 와 같은 층).
 */
import {
  MAX_OPS_PER_EDIT,
  applyOps,
  isPageTargetAction,
  partitionIssues,
  prepareNodesForPaste,
  stripMarkers,
  targetedPages,
  validatePage,
  type DroppedCases,
  type PageDocument,
  type PatchOp,
  type TargetMenuNode,
  type TargetPage,
  type TargetedPage,
  type ViewState,
  type WbNode,
} from '@wirebound/schema'
import type { TreeMenuNode } from '../api/types'
import { STRUCTURE_WHY_DISABLED } from '../panels/tree-row-actions'
import { insertNodeOps, removeNodeOps } from './ops'
import { findNodeSafely, walkSafely } from './safe-walk'
import { acceptsChildren, nodeSpot, regionRulesAt } from './structure-actions'

export type NodeEdit = { ops: PatchOp[]; insertedIds: string[] } | { reason: string }

/** 묶음이 서버 상한(`MAX_OPS_PER_EDIT`)을 넘는다 — 보내기 전에 막는다(넘으면 서버가 400 으로 묶음째 거절한다). */
export function tooManyOpsNotice(count: number): string {
  return `한 번에 넣을 수 있는 노드는 ${MAX_OPS_PER_EDIT}개까지입니다(이번에 ${count}개).`
}

/** 자리를 못 찾았다 — 고른 노드의 부모가 깨진 문서. */
export const NO_PASTE_SPOT = '붙일 자리를 찾지 못했습니다. 다른 노드를 고르세요.'

/** 결과 문서가 저장될 수 없다 — 이유를 잇는다(`edit/preset-apply.ts` 의 `withReasons` 와 같은 꼴). */
function invalidNotice(messages: readonly string[]): string {
  return messages.length === 0 ? '붙이지 못했습니다.' : `붙이지 못했습니다: ${messages.join(' / ')}`
}

/**
 * 노드들을 `parentId` 의 `index` 부터 차례로 넣는 묶음. 넣은 뒤 문서가 검증(`error`)을 못 지나면 `reason`.
 *
 * **판정은 결과 문서로 한다** — 붙이는 노드가 이미 저장될 수 있는 것인지(봉투 검증은 읽을 때 지났다)보다 «이 자리에 넣고 나서도 문서가 저장될
 * 수 있는가»가 물음이다. 다만 넣기 전 문서가 이미 `error` 를 내면 그것은 붙이기 탓이 아니므로 넣기 전에 없던 이슈만 센다.
 */
function insertMany(document: PageDocument, parentId: string, index: number, nodes: readonly WbNode[]): NodeEdit {
  if (!acceptsChildren(findNodeSafely(document.root, parentId))) return { reason: STRUCTURE_WHY_DISABLED.addInside }
  if (nodes.length > MAX_OPS_PER_EDIT) return { reason: tooManyOpsNotice(nodes.length) }

  const ops: PatchOp[] = []
  let running = document
  for (const [offset, node] of nodes.entries()) {
    const step = insertNodeOps(running, parentId, index + offset, node)
    if (step === null) return { reason: NO_PASTE_SPOT }
    ops.push(...step)
    running = applyOps(running, step)
  }

  const before = new Set(partitionIssues(validatePage(document)).errors.map((issue) => `${issue.code}|${issue.path}`))
  const added = partitionIssues(validatePage(running)).errors.filter((issue) => !before.has(`${issue.code}|${issue.path}`))
  if (added.length > 0) return { reason: invalidNotice(added.map((issue) => issue.message)) }

  return { ops, insertedIds: nodes.map((node) => node.id) }
}

/**
 * 붙이기(설계서 「설계서 화면 구조」의 클립보드 «붙이기»). 노드는 이미 id 를 새로 받은 것이다(`prepareNodesForPaste`).
 *
 * | 기준 노드 | 자리 |
 * |---|---|
 * | 있고 루트가 아니다 | 그 노드 바로 뒤 형제로 차례대로 |
 * | 없다 · 루트다 · 문서에 없다 | 루트 끝 |
 */
export function pasteOps(document: PageDocument, anchorId: string | null, nodes: readonly WbNode[]): NodeEdit {
  const placed = stripMarkers(nodes)
  const rootId: unknown = document.root?.id
  // 가지 곁에는 못 붙인다 — 상태 영역의 자리 규칙의 까닭을 싣는다(일반 검증 문장은 사람이 «가지 곁»으로 못 읽는다 · K2 리뷰 L3).
  const caseSide = anchorId === null ? undefined : regionRulesAt(document, anchorId).addAfter
  if (caseSide !== undefined) return { reason: caseSide }
  const spot = anchorId === null || anchorId === rootId ? null : nodeSpot(document, anchorId)
  if (spot !== null) return insertMany(document, spot.parentId, spot.index + 1, placed)
  if (typeof rootId !== 'string') return { reason: NO_PASTE_SPOT }
  const children = document.root.children
  return insertMany(document, rootId, Array.isArray(children) ? children.length : 0, placed)
}

/**
 * 복제(Cmd+D) — 노드마다 제 바로 뒤에 사본. **클립보드를 거치지 않는다.**
 *
 * 사본의 id 재발급은 붙이기와 같은 함수(`prepareNodesForPaste`)이고 keep 은 늘 참이다 — 같은 문서 안이라 사본 밖을 가리키던 대상(같은 페이지의
 * 대화 상자를 여는 단추)은 그대로 맞다. 사본 안을 가리키던 대상은 사본을 따라간다.
 *
 * 루트 · 문서에 없는 노드는 `reason`(`+` 의 «아래 추가» 가 꺼졌을 때의 설명 — 루트 뒤에는 형제가 설 수 없다). 상태 가지는 그 줄의 «아래 추가»를
 * 끈 까닭(`regionRules`)이다.
 */
export function duplicateOps(document: PageDocument, nodeIds: readonly string[], generate?: () => string): NodeEdit {
  if (nodeIds.length > MAX_OPS_PER_EDIT) return { reason: tooManyOpsNotice(nodeIds.length) }
  const ops: PatchOp[] = []
  const insertedIds: string[] = []
  let running = document
  for (const nodeId of nodeIds) {
    const node = findNodeSafely(running.root, nodeId)
    const spot = nodeSpot(running, nodeId)
    if (node === undefined || spot === null) return { reason: STRUCTURE_WHY_DISABLED.addAfter }
    // 가지는 제 곁에 사본을 못 둔다(상태 영역의 자리 규칙 — 영역 안에는 가지만 서고 상태마다 하나다). 막지 않으면 홀로 선 가지를 풀어 그 내용을
    // 영역 안에 넣어 서버가 거절했다(K2 리뷰 L1).
    const caseSide = regionRulesAt(running, nodeId).addAfter
    if (caseSide !== undefined) return { reason: caseSide }
    const copy = stripMarkers(prepareNodesForPaste([node], KEEP_EVERY_TARGET, generate).nodes)[0]!
    const step = insertNodeOps(running, spot.parentId, spot.index + 1, copy)
    if (step === null) return { reason: NO_PASTE_SPOT }
    ops.push(...step)
    insertedIds.push(copy.id)
    running = applyOps(running, step)
  }
  return { ops, insertedIds }
}

const KEEP_EVERY_TARGET = { node: () => true, page: () => true }

/**
 * 노드 여럿을 지우는 묶음 — 잘라내기 · 여럿 고른 판의 삭제가 쓴다. 루트 · 문서에 없는 노드가 있으면 `null`(`removeNodeOps` 와 같은 답).
 *
 * **조상이 함께 든 노드는 따로 지우지 않는다** — 조상을 지우면 함께 간다. 따로 지으면 조상을 지운 뒤 문서에 그 노드가 없어 묶음이 깨진다.
 */
export function removeManyOps(document: PageDocument, nodeIds: readonly string[]): PatchOp[] | null {
  const listed = new Set(nodeIds)
  const covered = new Set<string>()
  for (const visit of walkSafely(document.root)) {
    if (visit.parent !== null && (listed.has(visit.parent.id) || covered.has(visit.parent.id))) covered.add(visit.node.id)
  }
  const ops: PatchOp[] = []
  let running = document
  for (const nodeId of new Set(nodeIds)) {
    if (covered.has(nodeId)) continue
    const step = removeNodeOps(running, nodeId)
    if (step === null) return null
    ops.push(...step)
    running = applyOps(running, step)
  }
  return ops
}

/** 붙이며 뺀 동작의 수(`prepareNodesForPaste` 의 `droppedActions`). */
export function droppedActionsNotice(count: number): string {
  return `상호작용 동작 ${count}개는 대상이 없어 빼고 붙였습니다.`
}

/**
 * 붙이며 뺀 상태 가지(`prepareNodesForPaste` 의 `droppedCases` — 붙이는 페이지의 목록에 없는 상태). 상태마다 한 문장이고 이름은 출처
 * 페이지의 목록(봉투의 `viewStates`)에서 읽는다 — 상태 id 는 페이지 안의 이름이라 붙이는 페이지에서는 못 읽는다. 출처 목록이 없는 봉투면
 * id 를 그대로 쓴다.
 */
export function droppedCasesNotice(dropped: readonly DroppedCases[], sourceStates: readonly ViewState[] | undefined): string {
  return dropped
    .map(({ state, count }) => `상태 "${sourceStates?.find((entry) => entry.id === state)?.name ?? state}" 가지 ${count}개를 뺐습니다.`)
    .join(' ')
}

/** 페이지 대상을 가늠하려고 읽은 페이지 목록이 실패했다 — 붙이지 않는다(대상을 모른 채 빼면 남길 동작까지 잃는다). */
export const PASTE_PAGES_FAILURE = '페이지 목록을 읽지 못해 붙이지 못했습니다. 다시 붙여 넣으세요.'

/** 페이지 목록을 읽는 사이 페이지를 떠났다(떠나 머묾 · 떠났다 돌아옴) — 누른 판의 기준 노드가 아니라 붙이지 않는다. 같은 페이지를 다시 실은 판은 붙는다. */
export const PASTE_LEFT_NOTICE = '붙이는 사이 페이지를 옮겨 붙이지 않았습니다. 다시 붙여 넣으세요.'

/** 노드들에 빈 대상이 아닌 페이지 대상 동작(`navigate` · `openModal`)이 있는가 — 있을 때만 페이지 목록을 읽는다. */
export function hasPageTargets(nodes: readonly WbNode[]): boolean {
  return nodes.some((root) =>
    [...walkSafely(root)].some((visit) =>
      (visit.node.interactions ?? []).some((interaction) =>
        interaction.actions.some((action) => isPageTargetAction(action) && action.target.trim() !== ''),
      ),
    ),
  )
}

/**
 * 프로젝트 트리(`getTree`)를 페이지 대상 목록으로 — `keep.page` 가 `matchPageTargets` 로 견준다(`@wirebound/schema` 의 `targetedPages` —
 * 설계서 「모델」(상호작용)의 타겟 조립. 화면 · CLI · MCP 가 같은 글자를 짓는다).
 */
export function pageTargetsOf(menu: readonly TreeMenuNode[]): TargetedPage[] {
  const menus: TargetMenuNode[] = []
  const pages: TargetPage[] = []
  const walk = (nodes: readonly TreeMenuNode[], parentId: string | null): void => {
    for (const node of nodes) {
      menus.push({ id: node.id, parentId, title: node.title, sortOrder: node.sortOrder })
      for (const page of node.pages) pages.push({ id: page.id, menuNodeId: node.id, title: page.title, sortOrder: page.sortOrder })
      walk(node.children, node.id)
    }
  }
  walk(menu, null)
  return targetedPages({ menu: menus, pages })
}
