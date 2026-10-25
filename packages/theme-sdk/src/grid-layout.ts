/**
 * **그리드(`DataGrid`)의 배치** — 머리 줄(열 묶음의 `colspan` · 묶음 아닌 열의 `rowspan`)과 몸 줄(행마다 · 되풀이마다 칸 차례 · 셀 틀의 원본 자리 ·
 * 번호 · 위 줄의 `rowSpan` 이 덮은 열)을 한 셈으로(설계 spec `docs/superpowers/specs/2026-10-25-grid-design.md` «1» · «4» · «7»).
 *
 * **그리드 뷰가 셈하고 행 · 열 뷰가 읽는다** — 행의 `tr` 은 그 행 노드의 뿌리라 그리드 뷰가 칸을 끼울 수 없고(남의 뷰 속을 못 연다), 머리 칸의
 * `colspan` 도 열 노드의 뿌리에 선다. 그래서 그리드 뷰가 이 값을 `GridProvider` 로 내리고 행 뷰(`useGridRow`) · 열 뷰(`useGridHead`) · 칸 뷰
 * (`useGridCell`)가 제 노드 몫을 읽는다. 폼 표의 `pairRows` 와 같은 자세 — 순수 함수다.
 *
 * | 칸 | 언제 |
 * |---|---|
 * | 선택(`select`) | 그리드 `select` 가 `check` · `radio` 면 데이터 줄 맨 앞(합계 줄은 빈 칸) |
 * | 번호(`number`) | 셀 틀 줄의 번호 열(`numbering`) — 데이터 줄을 위에서부터 센 수(`desc` 는 거꾸로) |
 * | 셀 틀(`template`) | 칸을 안 가진 데이터 줄의 그 열. 열마다 첫 셀 틀 줄이 원본(`origin`), 나머지는 사본이다 |
 * | 제 칸(`own`) | 칸을 가진 행의 줄 — 칸이 위에서 덮인 열을 건너뛰며 앞에서부터 덮는다(HTML 표와 같은 규칙). 첫 줄이 원본, 되풀이 줄은 사본 |
 * | 빈 칸(`blank`) | 제 칸 · 합계 줄이 덮지 않은 열 |
 * | 생략 띠(`gap`) | `kind: gap` 행 — 칸 · 되풀이를 안 읽는 전폭 한 줄 |
 *
 * `rowSpan` 은 표 끝과 생략 띠 앞에서 끊긴다. 칸 폭 합이 잎 열 수와 다르면(lint `grid-row-cells`) 모자란 열은 빈 칸, 넘친 칸은 표를 넓힌다.
 */
import type { ViewItem } from './types'

export type GridSelect = 'none' | 'check' | 'radio'

/** 잎 열 하나 — 머리 줄의 맨 아래에 서는 열(빈 열 묶음도 한 칸을 차지한다). */
export interface GridLeaf {
  item: ViewItem
  /** 잎 열 차례(0 부터 — 선택 칸을 안 센다). */
  index: number
  /** 표의 칸 자리(0 부터 — 선택 칸을 센다). */
  col: number
  numbering: 'off' | 'asc' | 'desc'
  /** 열 묶음이면 참 — 셀 틀이 없다. */
  group: boolean
}

/** 머리 칸 하나. */
export type GridHeadCell =
  | { kind: 'select'; col: 0; colSpan: 1; rowSpan: number; fixed: GridFixed }
  | { kind: 'column'; item: ViewItem; col: number; colSpan: number; rowSpan: number; fixed: GridFixed }

/** 몸 칸 하나. `col` 은 표의 칸 자리(선택 칸을 센다). */
export type GridBodyCell =
  | { kind: 'select'; col: 0; fixed: GridFixed }
  | { kind: 'number'; leaf: GridLeaf; value: number; col: number; fixed: GridFixed }
  | { kind: 'template'; leaf: GridLeaf; origin: boolean; col: number; fixed: GridFixed }
  | { kind: 'own'; item: ViewItem; copy: boolean; col: number; colSpan: number; rowSpan: number; leaf: GridLeaf | null; fixed: GridFixed }
  | { kind: 'blank'; leaf: GridLeaf | null; col: number; fixed: GridFixed }
  | { kind: 'gap'; col: 0; colSpan: number }

/** 고정 열 안인가 — `last` 는 고정 구역의 끝 칸(테마가 그림자 · 선을 거는 자리). */
export type GridFixed = false | 'inside' | 'last'

/** 몸 줄 하나 — 행 노드 하나가 되풀이 수만큼 줄을 낸다. */
export interface GridLine {
  row: ViewItem
  /** 그 행 안의 줄 차례(0 부터) — 0 이면 행 노드 자신, 그 밖은 사본. */
  line: number
  /** 몸 전체의 줄 차례(1 부터) — 사본의 열쇠 · 입력 조각의 « (n행)» 이 이 수다. */
  number: number
  kind: 'data' | 'total' | 'gap'
  cells: GridBodyCell[]
}

export interface GridLayout {
  select: GridSelect
  leaves: GridLeaf[]
  /** 표의 칸 수 — 잎 열 수 + 선택 칸. */
  width: number
  /** 머리 줄 수 — 열 묶음의 깊이. */
  depth: number
  head: GridHeadCell[][]
  lines: GridLine[]
  /** 고정 열 수(선택 칸 · 번호 열을 센 왼쪽부터의 칸 수 — 표 칸 수로 자른 값). */
  fixed: number
  /** 불러오는 중 — 칸마다 내용 대신 막대다. */
  loading: boolean
  /** 노드 id → 머리 칸(열 · 열 묶음). */
  headOf: ReadonlyMap<string, Extract<GridHeadCell, { kind: 'column' }>>
  /** 행 id → 그 행의 줄. */
  linesOf: ReadonlyMap<string, readonly GridLine[]>
  /** 칸 id → 그 칸의 첫 줄 자리(되풀이 줄의 사본은 `<칸 id>~<줄>`). */
  cellOf: ReadonlyMap<string, Extract<GridBodyCell, { kind: 'own' }>>
}

/** 정수 prop — 하한 이상 정수가 아니면 `fallback`. 뷰는 검증을 지난 props 를 받지만 테마 뷰가 무엇을 넘길지 모른다. */
function intOf(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : fallback
}

function selectOf(value: unknown): GridSelect {
  return value === 'check' || value === 'radio' ? value : 'none'
}

function numberingOf(value: unknown): GridLeaf['numbering'] {
  return value === 'asc' || value === 'desc' ? value : 'off'
}

function kindOf(value: unknown): GridLine['kind'] {
  return value === 'total' || value === 'gap' ? value : 'data'
}

/** 열 트리의 깊이(열 · 빈 열 묶음은 1). */
function depthOf(items: readonly ViewItem[]): number {
  let depth = 0
  for (const item of items) depth = Math.max(depth, item.type === 'GridColumnGroup' && item.items.length > 0 ? 1 + depthOf(item.items) : 1)
  return depth
}

/**
 * 배치를 셈한다. `columns` 는 그리드 몸통의 자식(`ViewProps.items` — 열 · 열 묶음), `rows` 는 «행» 구역의 자식(`zoneItems.rows`), `props` 는 그리드의
 * props(`select` · `fixedColumns` · `loading`). 상태로 숨은 열 · 행 · 칸은 목록에 없으므로 병합 머리의 `colspan` 이 다시 센 값이 된다.
 */
export function gridLayout(columns: readonly ViewItem[], rows: readonly ViewItem[], props: Readonly<Record<string, unknown>>): GridLayout {
  const select = selectOf(props.select)
  const offset = select === 'none' ? 0 : 1
  const depth = Math.max(1, depthOf(columns))
  const leaves: GridLeaf[] = []
  const head: GridHeadCell[][] = Array.from({ length: depth }, () => [])
  const headOf = new Map<string, Extract<GridHeadCell, { kind: 'column' }>>()
  const columnCells: Extract<GridHeadCell, { kind: 'column' }>[] = []

  const walk = (items: readonly ViewItem[], level: number): void => {
    for (const item of items) {
      const nested = item.type === 'GridColumnGroup' ? item.items : []
      const start = leaves.length
      if (nested.length > 0) walk(nested, level + 1)
      else
        leaves.push({
          item,
          index: start,
          col: start + offset,
          numbering: numberingOf(item.props.numbering),
          group: item.type === 'GridColumnGroup',
        })
      const colSpan = Math.max(1, leaves.length - start)
      const cell = {
        kind: 'column' as const,
        item,
        col: start + offset,
        colSpan,
        rowSpan: nested.length > 0 ? 1 : depth - level,
        fixed: false as GridFixed,
      }
      head[level]!.push(cell)
      headOf.set(item.nodeId, cell)
      columnCells.push(cell)
    }
  }
  walk(columns, 0)

  const width = leaves.length + offset
  const fixed = Math.min(intOf(props.fixedColumns, 0, 0), width)
  const fixedOf = (col: number, colSpan: number): GridFixed => (col + colSpan > fixed ? false : col + colSpan === fixed ? 'last' : 'inside')
  for (const cell of columnCells) cell.fixed = fixedOf(cell.col, cell.colSpan)
  if (offset === 1) head[0]!.unshift({ kind: 'select', col: 0, colSpan: 1, rowSpan: depth, fixed: fixedOf(0, 1) })

  // 줄 — 행 차례 × 되풀이. 생략 띠는 한 줄이다.
  const plan: { row: ViewItem; line: number; kind: GridLine['kind'] }[] = []
  for (const row of rows) {
    const kind = kindOf(row.props.kind)
    const repeat = kind === 'gap' ? 1 : intOf(row.props.repeat, 1, 1)
    for (let line = 0; line < repeat; line++) plan.push({ row, line, kind })
  }
  const dataTotal = plan.filter((entry) => entry.kind === 'data').length
  /** 줄마다 위 줄의 세로 칸이 덮은 잎 열. */
  const covered = plan.map(() => new Set<number>())
  const origins = new Set<number>()
  const lines: GridLine[] = []
  const linesOf = new Map<string, GridLine[]>()
  const cellOf = new Map<string, Extract<GridBodyCell, { kind: 'own' }>>()
  let dataSeen = 0

  plan.forEach((entry, at) => {
    const cells: GridBodyCell[] = []
    const number = at + 1
    if (entry.kind === 'gap') {
      cells.push({ kind: 'gap', col: 0, colSpan: Math.max(1, width) })
    } else {
      if (offset === 1)
        cells.push(
          entry.kind === 'data'
            ? { kind: 'select', col: 0, fixed: fixedOf(0, 1) }
            : { kind: 'blank', leaf: null, col: 0, fixed: fixedOf(0, 1) },
        )
      const own = entry.row.items
      const free = (leaf: number) => !covered[at]!.has(leaf)
      if (own.length > 0) {
        // 제 칸 — 위에서 덮인 열을 건너뛰며 앞에서부터 덮는다. 세로 칸은 아래 줄(생략 띠 앞까지)의 그 열을 덮는다.
        let cursor = 0
        for (const item of own) {
          while (cursor < leaves.length && !free(cursor)) cursor++
          const colSpan = intOf(item.props.span, 1, 1)
          let rowSpan = 1
          while (rowSpan < intOf(item.props.rowSpan, 1, 1) && at + rowSpan < plan.length && plan[at + rowSpan]!.kind !== 'gap') rowSpan++
          for (let below = 1; below < rowSpan; below++)
            for (let leaf = cursor; leaf < cursor + colSpan; leaf++) covered[at + below]!.add(leaf)
          const cell: Extract<GridBodyCell, { kind: 'own' }> = {
            kind: 'own',
            item,
            copy: entry.line > 0,
            col: cursor + offset,
            colSpan,
            rowSpan,
            leaf: leaves[cursor] ?? null,
            fixed: fixedOf(cursor + offset, colSpan),
          }
          cells.push(cell)
          // 첫 줄은 원본 id 로, 되풀이 줄은 사본의 뷰 id(`<원본 id>~<줄>` — `ViewItem.copy(줄)`)로 — 끝 줄 가까이의 사본은 세로 칸이 더 일찍 끊긴다.
          cellOf.set(entry.line === 0 ? item.nodeId : `${item.nodeId}~${number}`, cell)
          cursor += colSpan
        }
        // 덮이지 않고 남은 열 — 빈 칸.
        for (let leaf = cursor; leaf < leaves.length; leaf++)
          if (free(leaf)) cells.push({ kind: 'blank', leaf: leaves[leaf]!, col: leaf + offset, fixed: fixedOf(leaf + offset, 1) })
      } else {
        for (const leaf of leaves) {
          if (!free(leaf.index)) continue
          const at0 = { col: leaf.col, fixed: fixedOf(leaf.col, 1) }
          if (entry.kind === 'total' || leaf.group) cells.push({ kind: 'blank', leaf, ...at0 })
          else if (leaf.numbering !== 'off')
            cells.push({ kind: 'number', leaf, value: leaf.numbering === 'asc' ? dataSeen + 1 : dataTotal - dataSeen, ...at0 })
          else {
            const origin = !origins.has(leaf.index)
            origins.add(leaf.index)
            cells.push({ kind: 'template', leaf, origin, ...at0 })
          }
        }
      }
      if (entry.kind === 'data') dataSeen++
    }
    const line: GridLine = { row: entry.row, line: entry.line, number, kind: entry.kind, cells }
    lines.push(line)
    const own = linesOf.get(entry.row.nodeId)
    if (own === undefined) linesOf.set(entry.row.nodeId, [line])
    else own.push(line)
  })

  return { select, leaves, width, depth, head, lines, fixed, loading: props.loading === true, headOf, linesOf, cellOf }
}
