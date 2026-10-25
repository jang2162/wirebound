/**
 * **그리드 행 줄 `…` 의 두 행동** — «한 행 떼어 내기» · «열 틀로 칸 짓기»(설계 spec `docs/superpowers/specs/2026-10-25-grid-design.md` «8» 의 «첫 행 강조 ·
 * 둘째 행 딤드» · «행마다 다른 표본 값»). 둘 다 **묶음 하나**(편집 하나 · 되돌리기 한 번)이고 부모를 안 바꾼다(같은 «행» 구역 안 · 그 행의 몸통) — 받는
 * 규칙(`fitRefusal`)을 지나지 않는다. 잠금은 부르는 쪽(`panels/structure-toolbar.tsx`)이 서버와 같은 물음(`editBlockedBy`)으로 묻는다.
 *
 * ## 한 행 떼어 내기 — 앞 행이 원본이다
 *
 * `repeat` n(≥ 2)인 행을 `repeat` 1 인 그 행 + 바로 뒤 `repeat` n − 1 인 새 행으로 가른다. **앞 행이 원본 id 를 지킨다** — 화면의 첫 줄이 원래 그 노드였고
 * (나머지 줄은 사본 — `data-wb-copy-of`), 그 줄에 선 코멘트 번호 · 고른 것 · 상호작용 문장이 가리키던 노드가 그대로 그 줄에 남는다. 뒤 행은 복제(Cmd+D)와
 * 같은 사본이다(`./paste-ops.ts` 의 `sameDocumentCopies` — 새 id · 코멘트 번호 걷음 · 별칭 · 상호작용 · 상태 보임은 그대로). 사본 줄들이 원본과 같은 상호작용으로
 * 돌던 것(설계 «1» «사본»)이 떼어 낸 뒤에도 같다. 행이 제 칸을 가졌으면 칸째 사본이 된다.
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
 * **순수하고 던지지 않는다** — 못 하면 `{ reason }`(`./paste-ops.ts` 의 `NodeEdit` 와 같은 꼴).
 */
import { BODY_ZONE, MAX_OPS_PER_EDIT, applyOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { gridLayout, type ViewItem } from '@wirebound/theme-sdk'
import { insertNodeOps, propOps } from './ops'
import { sameDocumentCopies, tooManyOpsNotice, type NodeEdit } from './paste-ops'
import { findNodeSafely } from './safe-walk'
import { nodeSpot } from './structure-actions'

export const SPLIT_ROW_LABEL = '한 행 떼어 내기'
export const BUILD_CELLS_LABEL = '열 틀로 칸 짓기'

/** 꺼진 까닭 — 항목은 행 줄에만 서므로(`panels/tree-row-actions.tsx`) 그 행의 모양이 못 하게 하는 것만 말한다. */
export const SPLIT_ROW_WHY = '되풀이가 2 이상인 행만 뗄 수 있습니다'
export const BUILD_CELLS_WHY = '칸이 없는 행만 열 틀로 칸을 지을 수 있습니다'
export const GAP_ROW_WHY = '생략 띠는 칸 · 되풀이를 쓰지 않습니다'
/** 행이 그리드의 «행» 구역에 있지 않다 — 검증을 못 지난 문서. */
const NOT_IN_GRID = '그리드 안의 행이 아닙니다'

function propsOf(node: WbNode | undefined): Record<string, unknown> {
  const props = node?.props
  return props !== null && typeof props === 'object' && !Array.isArray(props) ? (props as Record<string, unknown>) : {}
}

function isRow(node: WbNode | undefined): node is WbNode {
  return node?.type === 'GridRow'
}

function repeatOf(node: WbNode): number {
  const repeat = propsOf(node).repeat
  return typeof repeat === 'number' && Number.isInteger(repeat) && repeat >= 1 ? repeat : 1
}

/** 그 행에서 «한 행 떼어 내기» 를 못 하는 까닭 — 할 수 있으면 `null`. */
export function splitRowRefusal(node: WbNode | undefined): string | null {
  if (!isRow(node)) return NOT_IN_GRID
  if (propsOf(node).kind === 'gap') return GAP_ROW_WHY
  return repeatOf(node) >= 2 ? null : SPLIT_ROW_WHY
}

/** 그 행에서 «열 틀로 칸 짓기» 를 못 하는 까닭. */
export function buildCellsRefusal(node: WbNode | undefined): string | null {
  if (!isRow(node)) return NOT_IN_GRID
  if (propsOf(node).kind === 'gap') return GAP_ROW_WHY
  return Array.isArray(node.children) && node.children.length > 0 ? BUILD_CELLS_WHY : null
}

/** «한 행 떼어 내기» 의 묶음 — 그 행의 `repeat` 을 걷고(기본 1) 바로 뒤에 `repeat` n − 1 사본(머리말 «앞 행이 원본이다»). */
export function splitRowOps(document: PageDocument, rowId: string, generate?: () => string): NodeEdit {
  const row = findNodeSafely(document.root, rowId) as WbNode | undefined
  const refusal = splitRowRefusal(row)
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

  const first = propOps(document, rowId, 'repeat', undefined)
  if (first === null) return { reason: NOT_IN_GRID }
  const second = insertNodeOps(applyOps(document, first), spot.parentId, spot.index + 1, tail, spot.zone)
  if (second === null) return { reason: NOT_IN_GRID }
  return { ops: [...first, ...second], insertedIds: [tail.id] }
}

/** 문서 노드를 셈 함수가 읽는 꼴로 — 그리는 것(`element` · `content` · `copy`)은 셈이 안 읽는다. */
function itemOf(node: WbNode, index: number): ViewItem {
  const children = Array.isArray(node.children) ? node.children : []
  return {
    nodeId: node.id,
    type: node.type,
    index,
    props: propsOf(node),
    element: null,
    content: null,
    get items() {
      return children.map(itemOf)
    },
    copy: () => ({ element: null, content: null }),
  }
}

/** «열 틀로 칸 짓기» 가 셀 틀을 읽는 열 — 부르는 쪽이 그 열의 남의 잠금을 본다(남이 고치는 셀 틀을 베끼지 않는다). */
export function buildCellsReads(document: PageDocument, rowId: string): string[] {
  const plan = cellPlan(document, rowId)
  return 'reason' in plan ? [] : plan.reads
}

type CellPlan = { cells: WbNode[]; reads: string[] } | { reason: string }

function cellPlan(document: PageDocument, rowId: string): CellPlan {
  const row = findNodeSafely(document.root, rowId) as WbNode | undefined
  const refusal = buildCellsRefusal(row)
  if (refusal !== null) return { reason: refusal }
  const spot = nodeSpot(document, rowId)
  const grid = spot === null ? undefined : (findNodeSafely(document.root, spot.parentId) as WbNode | undefined)
  if (spot === null || spot.zone !== 'rows' || grid?.type !== 'DataGrid') return { reason: NOT_IN_GRID }

  const columns = (Array.isArray(grid.children) ? grid.children : []).map(itemOf)
  const rows = (grid.zones?.rows ?? []).map(itemOf)
  const line = gridLayout(columns, rows, propsOf(grid)).linesOf.get(rowId)?.[0]
  if (line === undefined) return { reason: NOT_IN_GRID }

  // 자리 id 는 칸마다 달라야 한다 — id 를 새로 짓는 함수(`sameDocumentCopies`)가 옛 id 로 짝짓는다.
  const cells: WbNode[] = []
  const reads: string[] = []
  const slot = (): string => `__cell-${cells.length}`
  for (const cell of line.cells) {
    if (cell.kind === 'template') {
      const column = findNodeSafely(document.root, cell.leaf.item.nodeId) as WbNode | undefined
      reads.push(cell.leaf.item.nodeId)
      cells.push({ id: slot(), type: 'GridCell', children: Array.isArray(column?.children) ? column.children : [] })
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
  return { cells, reads }
}

/** «열 틀로 칸 짓기» 의 묶음 — 칸마다 `add` 하나(머리말의 표). 칸 · 칸 안 조각의 id 는 한 번에 새로 짓는다(셀 틀 안을 가리키던 대상이 사본을 따라간다). */
export function buildCellsOps(document: PageDocument, rowId: string, generate?: () => string): NodeEdit {
  const plan = cellPlan(document, rowId)
  if ('reason' in plan) return plan
  if (plan.cells.length > MAX_OPS_PER_EDIT) return { reason: tooManyOpsNotice(plan.cells.length) }
  const cells = sameDocumentCopies(plan.cells, generate)
  const ops: PatchOp[] = []
  let running = document
  for (const [index, cell] of cells.entries()) {
    const step = insertNodeOps(running, rowId, index, cell, BODY_ZONE)
    if (step === null) return { reason: NOT_IN_GRID }
    ops.push(...step)
    running = applyOps(running, step)
  }
  return { ops, insertedIds: cells.map((cell) => cell.id) }
}
