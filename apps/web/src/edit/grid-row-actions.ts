/**
 * **그리드 행 줄 `…` 의 두 행동** — «한 행 떼어 내기» · «열 틀로 칸 짓기»(설계 spec `docs/superpowers/specs/2026-10-25-grid-design.md` «8» 의 «첫 행 강조 ·
 * 둘째 행 딤드» · «행마다 다른 표본 값»). 둘 다 **묶음 하나**(편집 하나 · 되돌리기 한 번)이고 부모를 안 바꾼다(같은 «행» 구역 안 · 그 행의 몸통) — 받는
 * 규칙(`fitRefusal`)을 지나지 않는다. 잠금은 부르는 쪽(`panels/structure-toolbar.tsx`)이 서버와 같은 물음(`editBlockedBy`)으로 묻는다.
 *
 * ## 한 행 떼어 내기 — 앞 행이 원본이다
 *
 * `repeat` n(≥ 2)인 행을 `repeat` 1 인 그 행 + 바로 뒤 `repeat` n − 1 인 새 행으로 가른다. **앞 행이 원본 id 를 지킨다** — 화면의 첫 줄이 원래 그 노드였고
 * (나머지 줄은 사본 — `data-wb-copy-of`), 그 줄에 선 코멘트 번호 · 고른 것 · 상호작용 문장이 가리키던 노드가 그대로 그 줄에 남는다. 뒤 행은 복제(Cmd+D)와
 * 같은 사본이다(`./paste-ops.ts` 의 `sameDocumentCopies` — 새 id · 코멘트 번호 걷음 · 별칭 · 상호작용 · 상태 보임은 그대로). 행 **자신과 그 안**의 상호작용은
 * 사본을 따라가 사본 줄들이 원본과 같은 상호작용으로 돌던 것(설계 «1» «사본»)이 떼어 낸 뒤에도 같다. 행이 제 칸을 가졌으면 칸째 사본이 된다.
 *
 * **바깥 노드의 상호작용이 그 행(이나 그 안)을 가리키면 못 뗀다** — 뒤 행은 새 id 라 바깥의 대상이 안 따라가, 떼기 전에는 모든 줄에 닿던 동작(숨기기 ·
 * 행 꼴 바꾸기)이 떼어 낸 뒤 첫 줄에만 닿는다(리뷰 `docs/superpowers/plans/2026-10-26-rv-grb-report.md` M5). 대상을 함께 옮기는 길(동작을 뒤 행 몫으로
 * 하나 더 짓기)은 그 동작이 바깥 노드의 것이라 행 하나를 떼는 묶음이 남의 노드를 고치게 된다 — 고르지 않았다. «화면 상태 바꾸기» 의 대상은 노드가 아니라
 * 상태라 안 센다(상태 id 가 행 안 노드 id 와 같은 글자여도 — 붙이기 · 모듈 · id 재발급과 같은 가름).
 *
 * ## 열 틀로 칸 짓기 — 지금 그린 꼴을 칸으로 옮긴다
 *
 * 칸 없는 행에 잎 열마다 `GridCell` 을 짓는다 — **그 행의 첫 줄이 지금 그린 꼴 그대로**다. 셈은 렌더러와 같은 함수(`@wirebound/theme-sdk` 의 `gridLayout`)를
 * 문서 노드로 돌려 얻는다(두 벌이면 위 행의 세로 칸이 덮은 열 · 번호 열 · 합계 행의 빈 칸에서 갈린다):
 *
 * | 그 줄의 칸 | 짓는 칸 |
 * |---|---|
 * | 셀 틀 | 그 열의 셀 틀 조각 사본 |
 * | 번호 열 | 그 줄의 번호 글(`Text`) — 제 칸 행은 번호를 안 세므로 수가 굳는다(되풀이 줄도 같은 수) |
 * | 빈 칸(합계 행 · 빈 열 묶음) | 빈 칸 |
 * | 위 행의 세로 칸이 덮은 열 | 짓지 않는다 — 제 칸도 그 열을 건너뛰고 덮는다 |
 *
 * **문서의 열 전부를 센다** — 지금 화면 상태에서 숨은 열도 칸을 받는다(칸 폭 합이 잎 열 수와 같아야 lint `grid-row-cells` 가 안 선다). 생략 띠(`gap`)는 칸을 안
 * 읽어 두 행동 다 못 한다.
 *
 * **위 행의 세로 칸이 줄마다 다르게 덮으면 못 짓는다** — 제 칸은 되풀이 줄마다 같은 칸이라, 첫 줄(덮임)에서 읽은 칸 수로 지으면 덮이지 않은 둘째 줄부터
 * 칸이 왼쪽으로 밀리고 끝 열이 빈다(리뷰 M1). 덮이지 않은 줄 기준으로 지으면 첫 줄에서 칸이 넘쳐 표가 넓어진다 — 어느 칸 수도 그 행의 모든 줄을 지금 꼴로
 * 못 그린다. 줄마다 덮임이 같으면(되풀이 1 · 덮임 없음 · 모든 줄이 덮임) 짓는다.
 *
 * ## 전제 — 묶음이 읽어 베끼는 것 전부
 *
 * 두 묶음은 누른 때의 문서에서 베낀다. 남의 편집이 내 화면에 닿기 전에 누르면 묶음은 낡은 판 위에서 지어지고, 리베이스가 그대로 얹으면 남의 고침이 말없이
 * 걷힌다(`build-test/grid-row-actions.test.ts` «닿기 전»). 그래서 묶음 앞에 `test` 를 둔다 — 전제가 바뀌었으면 리베이스가 묶음째 버리고 알린다.
 *
 * | 묶음 | 전제(`test`) | 까닭 |
 * |---|---|---|
 * | 떼어 내기 | **행 노드 통째**(별칭 · props · 상태 보임 · 상호작용 · 제 칸과 그 안) | 뒤 행은 그 행 전부의 사본이다 — 칸 하나(되풀이)만 묶으면 남이 바꾼 다른 칸이 둘째 줄부터 걷힌다(리뷰 H1) |
 * | 칸 짓기 | **그 그리드의 열 트리 통째**(몸통 `children`) · 칸 배열이 있으면 그것이 비었다 | 칸 수는 잎 열 수이고 칸 안은 셀 틀의 사본이다(리뷰 M3) |
 *
 * **칸 하나씩 묶지 않는다** — 남이 **없던 칸을 더한** 판(행에 보임 · 별칭을 처음 닮 · 그리드에 열을 더함)은 칸마다의 `test` 로 못 가른다(없는 경로는 `test`
 * 할 수 없다). 노드 값 하나의 `test` 는 리베이스가 그 노드의 id 로 경로를 다시 지어(`store/anchored-ops.ts` «자리의 셋») 남이 행을 옮겨도 그대로 맞는다.
 * **열 트리는 잎 열 id 차례보다 넓다** — JSON Patch 의 `test` 는 값을 통째로 견주고 리베이스는 열 경로를 열 id 로 다시 지어, «id 차례만» 을 견주는
 * `test` 는 짓지 못한다. 그래서 남이 그 사이 머리 이름 · 열 폭을 고쳤어도 칸 짓기가 버려진다(알림이 서고 다시 누르면 된다). 셀 틀 고침도 버린다 — 칸 짓기가
 * 그 셀 틀을 베끼므로 낡은 글을 베끼지 않는다.
 *
 * **전제로 못 묶은 것** — 칸 짓기가 읽는 위 행들(세로 칸이 덮는 열 · 번호 칸의 수를 정하는 되풀이)은 묶지 않는다. 묶으면 남이 위 행 어디를 고쳐도 버려지고,
 * 세로 칸을 **새로 단** 판은 위와 같은 까닭으로 칸마다 못 묶는다. 떼어 내기는 행의 자리(부모 · 차례)를 안 묶는다 — 남이 행을 다른 그리드로 옮긴 것이
 * 닿기 전에 떼어 내면 뒤 행은 옛 그리드의 옛 자리에 선다(리뷰 M4 — 복제(Cmd+D)의 «바로 뒤에» 넣기와 같은 붙잡기다).
 *
 * **순수하고 던지지 않는다** — 못 하면 `{ reason }`(`./paste-ops.ts` 의 `NodeEdit` 와 같은 꼴).
 */
import {
  BODY_ZONE,
  MAX_OPS_PER_EDIT,
  applyOps,
  getByPointer,
  isViewStateAction,
  zoneList,
  type InteractionAction,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { gridLayout, type GridLine, type ViewItem } from '@wirebound/theme-sdk'
import { insertNodeOps, propOps } from './ops'
import { sameDocumentCopies, tooManyOpsNotice, type NodeEdit } from './paste-ops'
import { findNodePathSafely, findNodeSafely, walkSafely } from './safe-walk'
import { nodeSpot } from './structure-actions'

export const SPLIT_ROW_LABEL = '한 행 떼어 내기'
export const BUILD_CELLS_LABEL = '열 틀로 칸 짓기'

/** 꺼진 까닭 — 항목은 행 줄에만 서므로(`panels/tree-row-actions.tsx`) 그 행의 모양이 못 하게 하는 것만 말한다. */
export const SPLIT_ROW_WHY = '되풀이가 2 이상인 행만 뗄 수 있습니다'
export const BUILD_CELLS_WHY = '칸이 없는 행만 열 틀로 칸을 지을 수 있습니다'
export const GAP_ROW_WHY = '생략 띠는 칸 · 되풀이를 쓰지 않습니다'
export const COVERED_ROW_WHY = '위 행의 세로 칸이 이 행의 첫 줄을 덮고 있어 칸을 지을 수 없습니다'
export const TARGETED_ROW_WHY = '이 행을 가리키는 상호작용이 있어 뗄 수 없습니다 — 떼면 첫 줄에만 닿습니다'
/** 첫 행은 늘 셀 틀을 그린다(머리말 «첫 행은 늘 기본이다»). */
export const FIRST_ROW_WHY = '첫 행은 늘 기본입니다 — 기본 행은 첫 행과 같은 꼴로 그려집니다'
/** 행이 그리드의 «행» 구역에 있지 않다 — 검증을 못 지난 문서. */
const NOT_IN_GRID = '그리드 안의 행이 아닙니다'

function propsOf(node: WbNode | undefined): Record<string, unknown> {
  const props = node?.props
  return props !== null && typeof props === 'object' && !Array.isArray(props) ? (props as Record<string, unknown>) : {}
}

/** 그 구역의 노드들 — 검증 전 문서의 노드 아닌 원소는 뺀다(`zoneList` 는 원소를 안 거른다). */
function nodesIn(node: unknown, zone: string): WbNode[] {
  return zoneList(node, zone).filter((child): child is WbNode => child !== null && typeof child === 'object' && !Array.isArray(child))
}

function isRow(node: WbNode | undefined): node is WbNode {
  return node?.type === 'GridRow'
}

function repeatOf(node: WbNode): number {
  const repeat = propsOf(node).repeat
  return typeof repeat === 'number' && Number.isInteger(repeat) && repeat >= 1 ? repeat : 1
}

/** 그 행에서 «한 행 떼어 내기» 를 못 하는 까닭 — 할 수 있으면 `null`. */
export function splitRowRefusal(document: PageDocument, rowId: string): string | null {
  const row = findNodeSafely(document.root, rowId)
  if (!isRow(row)) return NOT_IN_GRID
  if (propsOf(row).kind === 'gap') return GAP_ROW_WHY
  if (repeatOf(row) < 2) return SPLIT_ROW_WHY
  return targetedFromOutside(document, row) ? TARGETED_ROW_WHY : null
}

/** 그 행 바깥 노드의 상호작용 동작이 그 행이나 그 안을 가리키는가(머리말 «바깥 노드의 상호작용»). 검증 전 문서의 동작 아닌 값은 건너뛴다. */
function targetedFromOutside(document: PageDocument, row: WbNode): boolean {
  const inside = new Set<string>()
  for (const visit of walkSafely(row)) inside.add(visit.node.id)
  for (const visit of walkSafely(document.root)) {
    if (inside.has(visit.node.id) || !Array.isArray(visit.node.interactions)) continue
    for (const interaction of visit.node.interactions as unknown[]) {
      const actions = (interaction as { actions?: unknown } | null)?.actions
      if (!Array.isArray(actions)) continue
      for (const action of actions as unknown[]) {
        if (action === null || typeof action !== 'object' || isViewStateAction(action as InteractionAction)) continue
        const target = (action as { target?: unknown }).target
        if (typeof target === 'string' && inside.has(target)) return true
      }
    }
  }
  return false
}

/** 그 행에서 «열 틀로 칸 짓기» 를 못 하는 까닭 — 할 수 있으면 `null`. */
export function buildCellsRefusal(document: PageDocument, rowId: string): string | null {
  const plan = cellPlan(document, rowId)
  if ('reason' in plan) return plan.reason
  return isFirstRow(document, plan.gridId, rowId) ? FIRST_ROW_WHY : null
}

/** 그 행이 그리드 «행» 구역의 첫 노드인가. */
function isFirstRow(document: PageDocument, gridId: string, rowId: string): boolean {
  return nodesIn(findNodeSafely(document.root, gridId), 'rows')[0]?.id === rowId
}

/**
 * 그 행의 칸이 지금 열 틀로 지을 칸과 같은 꼴인가 — id · 코멘트 번호를 빼고, 칸 안을 가리키는 상호작용 대상은 칸 안의 차례로 견준다(칸 짓기가 id 를 새로
 * 짓고 대상을 사본으로 옮긴다). 칸을 걷어도 잃을 것이 없는지 묻는 자리(`./row-content.ts`)가 부른다. 칸이 없거나 칸을 걷은 판에서 지을 수 없으면 거짓.
 */
export function cellsMatchTemplate(document: PageDocument, rowId: string): boolean {
  const row = findNodeSafely(document.root, rowId) as WbNode | undefined
  const path = findNodePathSafely(document.root, rowId)
  if (!isRow(row) || path === undefined) return false
  const cells = nodesIn(row, BODY_ZONE)
  if (cells.length === 0) return false
  const bare = applyOps(document, [{ op: 'remove', path: `${path}/children` }])
  const plan = cellPlan(bare, rowId)
  return !('reason' in plan) && canonicalCells(cells) === canonicalCells(plan.cells)
}

/** 견줄 꼴 — 키 차례 · 빈 배열 · id · 번호를 걷고, 칸 안 노드를 가리키는 글은 그 노드의 차례(`#n`)로 바꾼다. */
function canonicalCells(cells: readonly WbNode[]): string {
  const order = new Map<string, number>()
  for (const cell of cells) for (const visit of walkSafely(cell)) if (!order.has(visit.node.id)) order.set(visit.node.id, order.size)
  const canonical = (value: unknown): unknown => {
    if (typeof value === 'string') return order.has(value) ? `#${order.get(value)}` : value
    if (Array.isArray(value)) return value.map(canonical)
    if (value === null || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const inner = (value as Record<string, unknown>)[key]
      if (key === 'id' || key === 'marker' || (Array.isArray(inner) && inner.length === 0)) continue
      out[key] = canonical(inner)
    }
    return out
  }
  return JSON.stringify(cells.map(canonical))
}

/** «한 행 떼어 내기» 의 묶음 — 그 행의 `repeat` 을 걷고(기본 1) 바로 뒤에 `repeat` n − 1 사본(머리말 «앞 행이 원본이다»). */
export function splitRowOps(document: PageDocument, rowId: string, generate?: () => string): NodeEdit {
  const row = findNodeSafely(document.root, rowId) as WbNode | undefined
  const refusal = splitRowRefusal(document, rowId)
  if (refusal !== null) return { reason: refusal }
  const spot = nodeSpot(document, rowId)
  if (row === undefined || spot === null) return { reason: NOT_IN_GRID }
  const rest = repeatOf(row) - 1

  const copy = sameDocumentCopies([row], generate)[0]!
  const copyProps = { ...propsOf(copy) }
  if (rest === 1) delete copyProps.repeat
  else copyProps.repeat = rest
  const tail: WbNode = { ...copy, props: copyProps }
  if (Object.keys(copyProps).length === 0) delete tail.props

  const path = findNodePathSafely(document.root, rowId)
  const first = propOps(document, rowId, 'repeat', undefined)
  if (first === null || path === undefined) return { reason: NOT_IN_GRID }
  const second = insertNodeOps(applyOps(document, first), spot.parentId, spot.index + 1, tail, spot.zone)
  if (second === null) return { reason: NOT_IN_GRID }
  // 전제 — 지은 판의 행 통째. 남이 그 사이 그 행의 무엇이든 고쳤으면 리베이스가 묶음째 버린다(머리말 «전제»).
  const premise: PatchOp = { op: 'test', path, value: structuredClone(row) }
  return { ops: [premise, ...first, ...second], insertedIds: [tail.id] }
}

/** 문서 노드를 셈 함수가 읽는 꼴로 — 그리는 것(`element` · `content` · `copy`)은 셈이 안 읽는다. */
function itemOf(node: WbNode, index: number): ViewItem {
  return {
    nodeId: node.id,
    type: node.type,
    index,
    props: propsOf(node),
    element: null,
    content: null,
    get items() {
      return nodesIn(node, BODY_ZONE).map(itemOf)
    },
    copy: () => ({ element: null, content: null }),
  }
}

/** «열 틀로 칸 짓기» 가 셀 틀을 읽는 열 — 부르는 쪽이 그 열의 남의 잠금을 본다(남이 고치는 셀 틀을 베끼지 않는다). */
export function buildCellsReads(document: PageDocument, rowId: string): string[] {
  const plan = cellPlan(document, rowId)
  return 'reason' in plan ? [] : plan.reads
}

type CellPlan = { cells: WbNode[]; reads: string[]; gridId: string } | { reason: string }

/** 그 줄에서 칸을 받는 잎 열 — 위 행의 세로 칸이 덮은 열은 빠진다. */
function freeLeaves(line: GridLine): string {
  return line.cells.flatMap((cell) => ('leaf' in cell && cell.leaf !== null ? [cell.leaf.index] : [])).join(',')
}

function cellPlan(document: PageDocument, rowId: string): CellPlan {
  const row = findNodeSafely(document.root, rowId) as WbNode | undefined
  if (!isRow(row)) return { reason: NOT_IN_GRID }
  if (propsOf(row).kind === 'gap') return { reason: GAP_ROW_WHY }
  if (nodesIn(row, BODY_ZONE).length > 0) return { reason: BUILD_CELLS_WHY }
  const spot = nodeSpot(document, rowId)
  const grid = spot === null ? undefined : (findNodeSafely(document.root, spot.parentId) as WbNode | undefined)
  if (spot === null || spot.zone !== 'rows' || grid?.type !== 'DataGrid') return { reason: NOT_IN_GRID }

  const columns = nodesIn(grid, BODY_ZONE).map(itemOf)
  const rows = nodesIn(grid, 'rows').map(itemOf)
  const lines = gridLayout(columns, rows, propsOf(grid)).linesOf.get(rowId) ?? []
  const line = lines[0]
  if (line === undefined) return { reason: NOT_IN_GRID }
  // 줄마다 덮임이 다르면 어느 칸 수도 모든 줄을 지금 꼴로 못 그린다(머리말 «위 행의 세로 칸»).
  if (lines.some((other) => freeLeaves(other) !== freeLeaves(line))) return { reason: COVERED_ROW_WHY }

  // 자리 id 는 칸마다 달라야 한다 — id 를 새로 짓는 함수(`sameDocumentCopies`)가 옛 id 로 짝짓는다.
  const cells: WbNode[] = []
  const reads: string[] = []
  const slot = (): string => `__cell-${cells.length}`
  for (const cell of line.cells) {
    if (cell.kind === 'template') {
      const column = findNodeSafely(document.root, cell.leaf.item.nodeId) as WbNode | undefined
      reads.push(cell.leaf.item.nodeId)
      cells.push({ id: slot(), type: 'GridCell', children: nodesIn(column, BODY_ZONE) })
    } else if (cell.kind === 'number') {
      cells.push({
        id: slot(),
        type: 'GridCell',
        children: [{ id: `${slot()}-number`, type: 'Text', props: { content: String(cell.value) } }],
      })
    } else if (cell.kind === 'blank' && cell.leaf !== null) {
      cells.push({ id: slot(), type: 'GridCell' })
    }
  }
  return { cells, reads, gridId: grid.id }
}

/** «열 틀로 칸 짓기» 의 묶음 — 칸마다 `add` 하나(머리말의 표). 칸 · 칸 안 조각의 id 는 한 번에 새로 짓는다(셀 틀 안을 가리키던 대상이 사본을 따라간다). */
export function buildCellsOps(document: PageDocument, rowId: string, generate?: () => string): NodeEdit {
  const plan = cellPlan(document, rowId)
  if ('reason' in plan) return plan
  if (isFirstRow(document, plan.gridId, rowId)) return { reason: FIRST_ROW_WHY }
  if (plan.cells.length > MAX_OPS_PER_EDIT) return { reason: tooManyOpsNotice(plan.cells.length) }
  const cells = sameDocumentCopies(plan.cells, generate)
  const ops: PatchOp[] = []
  // 전제 — 그 그리드의 열 트리 통째(머리말 «전제»). 열이 하나도 없는 그리드(배열 없음)는 지을 칸이 셀 틀 없이 비어 묶을 것이 없다.
  const gridPath = findNodePathSafely(document.root, plan.gridId)
  const columns = gridPath === undefined ? undefined : getByPointer(document, `${gridPath}/children`)
  if (gridPath !== undefined && Array.isArray(columns))
    ops.push({ op: 'test', path: `${gridPath}/children`, value: structuredClone(columns) })
  // 칸 배열이 이미 있으면(빈 배열) 그 배열이 비었다. 배열이 없을 때는 첫 `add` 가 배열째 지어 리베이스의 전제(`store/anchored-ops.ts` 의
  // `premiseOf`)가 지킨다. 배열이 있는지는 포인터로 읽는다 — 몸통의 읽기는 `zoneList` 가 «없음» 과 «빈 배열» 을 같은 `[]` 로 낸다.
  const path = findNodePathSafely(document.root, rowId)
  if (path !== undefined && Array.isArray(getByPointer(document, `${path}/children`)))
    ops.push({ op: 'test', path: `${path}/children`, value: [] })
  let running = document
  for (const [index, cell] of cells.entries()) {
    const step = insertNodeOps(running, rowId, index, cell, BODY_ZONE)
    if (step === null) return { reason: NOT_IN_GRID }
    ops.push(...step)
    running = applyOps(running, step)
  }
  return { ops, insertedIds: cells.map((cell) => cell.id) }
}
