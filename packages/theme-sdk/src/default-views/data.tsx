/** **데이터 그룹 기본 뷰.** `DataGrid` 와 그 부품(열 묶음 · 열 · 행 · 칸) · `Pagination` · `Tree` · `KeyValue`. 옮긴 규칙은 `./index.ts` 머리말. */
import { Fragment, useLayoutEffect, useRef, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { nodeVar, partRule, TREE_INDENT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { GridProvider, useGridCell, useGridHead, useGridLayout, useGridRow } from '../grid-context'
import { gridLayout, type GridFixed, type GridLayout, type GridLeaf, type GridSelect } from '../grid-layout'
import { Root } from '../root'
import { Zone } from '../zone'

/** 고정 열 칸의 왼쪽 자리(px)를 나르는 변수 — 그리드 뷰의 레이아웃 이펙트가 앞 칸 폭의 합을 재어 싣는다(`useFixedColumns`). */
export const DATAGRID_LEFT_VAR = nodeVar('datagrid', 'left')
/** 고정 열 수를 나르는 변수 — 표 조각에 싣는다(`dataGridTableAttrs`). */
export const DATAGRID_FIXED_VAR = nodeVar('datagrid', 'fixed')

/**
 * **그리드 표(`table` 조각)에 펼 속성** — `data-wb-fixed-columns="<수>"` 와 `--wb-node-datagrid-fixed`. 고정 열 수는 수라 표지가 아니다(표지는
 * 불리언 · enum 만 — `packages/renderer/test/prop-marks.test.tsx`). 기본 뷰와 스타터 템플릿이 같은 이름을 싣게 함수로 둔다.
 */
export function dataGridTableAttrs(layout: GridLayout): { 'data-wb-fixed-columns': string; style: CSSProperties } {
  const value = String(layout.fixed)
  return { 'data-wb-fixed-columns': value, style: { [DATAGRID_FIXED_VAR]: value } as CSSProperties }
}

/** 고정 열 칸에 펼 속성 — 고정 구역 안이면 `data-wb-fixed`(끝 칸은 `last`), 칸 자리는 늘 `data-wb-col`(이펙트가 앞 칸 폭을 센다). */
function cellPlace(col: number, fixed: GridFixed): Record<string, string> {
  return fixed === false ? { 'data-wb-col': String(col) } : { 'data-wb-col': String(col), 'data-wb-fixed': fixed }
}

/** 몸 칸이 그 열에서 물려받는 표지 — 칸 정렬 · 음영(열 머리의 같은 이름 표지와 같은 값). 열이 없는 칸(선택 칸)은 없다. */
function columnMarks(leaf: GridLeaf | null): Record<string, string> {
  if (leaf === null || leaf.group) return {}
  return { 'data-wb-align': String(leaf.item.props.align ?? 'start'), 'data-wb-tone': String(leaf.item.props.tone ?? 'default') }
}

/**
 * **고정 열의 왼쪽 자리를 잰다** — 고정 열이 둘 이상이면 앞 칸 폭의 합을 CSS 만으로 모른다. 그리기 뒤(레이아웃 이펙트 — 칠하기 전)마다, 표 크기가 바뀔
 * 때 · 글꼴이 실린 뒤 칸 자리(`data-wb-col`)마다 폭을 재어 고정 칸에 `--wb-node-datagrid-left` 를 싣는다. 폭은 상자 폭이라 붙어 있는(`sticky`)
 * 칸이 밀려 있어도 같다. 이 표의 줄만 본다 — 칸 안의 다른 그리드는 제 이펙트가 잰다.
 */
function useFixedColumns(table: RefObject<HTMLTableElement | null>, fixed: number): void {
  useLayoutEffect(() => {
    const element = table.current
    if (element === null || fixed === 0) return
    const measure = (): void => {
      const widths: number[] = []
      const cells: HTMLTableCellElement[] = []
      for (const row of Array.from(element.rows)) {
        for (const cell of Array.from(row.cells)) {
          const col = Number(cell.getAttribute('data-wb-col'))
          if (!Number.isInteger(col)) continue
          if (cell.colSpan === 1 && widths[col] === undefined) widths[col] = cell.getBoundingClientRect().width
          if (cell.hasAttribute('data-wb-fixed')) cells.push(cell)
        }
      }
      for (const cell of cells) {
        let left = 0
        for (let col = 0; col < Number(cell.getAttribute('data-wb-col')); col++) left += widths[col] ?? 0
        cell.style.setProperty(DATAGRID_LEFT_VAR, `${left}px`)
      }
    }
    measure()
    const view = element.ownerDocument.defaultView
    const Observer = view?.ResizeObserver
    const observer = Observer === undefined ? null : new Observer(() => measure())
    observer?.observe(element)
    let alive = true
    void element.ownerDocument.fonts?.ready.then(() => {
      if (alive) measure()
    })
    return () => {
      alive = false
      observer?.disconnect()
    }
  })
}

/** 선택 칸 안의 모양 — 체크면 상자, 라디오면 동그라미(행 꼴 «강조» 가 켜고 «흐림» 이 끈 모양이다 — CSS 가 행 표지로 고른다). */
function SelectMark(props: { select: GridSelect }): ReactElement {
  return <span data-wb-part={props.select === 'radio' ? 'radio' : 'checkbox'} />
}

// 기본 구조 `default`. 결과 머리줄 · 스크롤 상자(표) · 바닥 구역. 표는 `gridLayout` 의 머리 줄 · 몸 줄을 그리고 행 · 열 뷰가 읽을 배치를
// `GridProvider` 로 내린다. 빈 상태면 행 노드를 안 그리고 전폭 한 줄(`empty` 조각)이다.
export const DataGridView = view(({ props, items, zoneItems, zones }) => {
  const layout = gridLayout(items, zoneItems.rows ?? [], props)
  const table = useRef<HTMLTableElement | null>(null)
  useFixedColumns(table, layout.fixed)
  const head = zones.headStart != null || zones.headEnd != null
  return (
    <Root as="div" data-wb-structure="default">
      {head ? (
        <div data-wb-part="head">
          <Zone name="headStart" data-wb-part="headStart" />
          <Zone name="headEnd" data-wb-part="headEnd" />
        </div>
      ) : null}
      <div data-wb-part="scroll">
        <GridProvider value={layout}>
          <table ref={table} data-wb-part="table" {...dataGridTableAttrs(layout)}>
            <thead data-wb-part="header">
              {layout.head.map((row, level) => (
                <tr key={level}>
                  {row.map((cell) =>
                    cell.kind === 'select' ? (
                      <th
                        key="wb-select"
                        data-wb-part="cell"
                        data-wb-cell="select"
                        rowSpan={cell.rowSpan}
                        {...cellPlace(cell.col, cell.fixed)}
                      >
                        {layout.select === 'check' ? <SelectMark select="check" /> : '선택'}
                      </th>
                    ) : (
                      <Fragment key={cell.item.nodeId}>{cell.item.element}</Fragment>
                    ),
                  )}
                </tr>
              ))}
            </thead>
            {props.empty === true ? (
              <tbody data-wb-part="body">
                <tr>
                  <td data-wb-part="empty" colSpan={Math.max(1, layout.width)}>
                    {String(props.emptyText)}
                  </td>
                </tr>
              </tbody>
            ) : (
              <Zone name="rows" as="tbody" data-wb-part="body" />
            )}
          </table>
        </GridProvider>
      </div>
      <Zone name="footer" data-wb-part="footer" />
    </Root>
  )
})

const ARIA_SORT: Readonly<Record<string, 'ascending' | 'descending' | undefined>> = { asc: 'ascending', desc: 'descending' }

// 머리 칸 — 그리드 뷰가 내린 배치에서 제 칸(`colSpan` · `rowSpan`)을 읽는다. 필수 `*` · 정렬 표시는 조각이다.
export const GridColumnView = view(({ nodeId, props }) => {
  const cell = useGridHead(nodeId)
  const sort = String(props.sort)
  return (
    <Root
      as="th"
      scope="col"
      data-wb-part="cell"
      colSpan={cell?.colSpan}
      rowSpan={cell?.rowSpan}
      aria-sort={ARIA_SORT[sort]}
      {...(cell === null ? {} : cellPlace(cell.col, cell.fixed))}
    >
      {props.required === true ? <span data-wb-part="required">*</span> : null}
      {String(props.label)}
      {sort === 'none' ? null : <span data-wb-part="sort">{sort === 'asc' ? '▲' : '▼'}</span>}
    </Root>
  )
})

// 병합 머리 칸 — 아래 열 수만큼 가로로 걸친다(`colgroup`).
export const GridColumnGroupView = view(({ nodeId, props }) => {
  const cell = useGridHead(nodeId)
  return (
    <Root
      as="th"
      scope="colgroup"
      data-wb-part="cell"
      colSpan={cell?.colSpan}
      rowSpan={cell?.rowSpan}
      {...(cell === null ? {} : cellPlace(cell.col, cell.fixed))}
    >
      {String(props.label)}
    </Root>
  )
})

/** 막대 — 불러오는 중인 칸의 내용. */
const SKELETON = <span data-wb-part="skeleton" />

// 행 — 되풀이 수만큼 줄을 그린다. 첫 줄이 행 노드의 뿌리, 나머지는 사본(`Root copy`). 칸은 배치(`useGridRow`)의 차례대로 — 셀 틀은 열의 몸통
// (원본 · 사본), 제 칸은 이 행의 몸통(원본 · 사본)이다.
export const GridRowView = view(({ nodeId, items }) => {
  const lines = useGridRow(nodeId)
  const layout = useGridLayout()
  if (lines === null || layout === null) {
    return (
      <Root as="tr" data-wb-part="row">
        {items.map((item) => (
          <Fragment key={item.nodeId}>{item.element}</Fragment>
        ))}
      </Root>
    )
  }
  const own = new Map(items.map((item) => [item.nodeId, item]))
  return (
    <>
      {lines.map((line) => (
        <Root key={line.number} as="tr" data-wb-part="row" copy={line.line > 0}>
          {line.cells.map((cell) => {
            switch (cell.kind) {
              case 'gap':
                return (
                  <td key="wb-gap" data-wb-part="gap" colSpan={cell.colSpan}>
                    ⋯
                  </td>
                )
              case 'select':
                return (
                  <td key="wb-select" data-wb-part="cell" data-wb-cell="select" {...cellPlace(cell.col, cell.fixed)}>
                    <SelectMark select={layout.select} />
                  </td>
                )
              case 'number':
                return (
                  <td
                    key={cell.leaf.item.nodeId}
                    data-wb-part="cell"
                    data-wb-cell="number"
                    {...columnMarks(cell.leaf)}
                    {...cellPlace(cell.col, cell.fixed)}
                  >
                    {layout.loading ? SKELETON : cell.value}
                  </td>
                )
              case 'template':
                return (
                  <td
                    key={cell.leaf.item.nodeId}
                    data-wb-part="cell"
                    data-wb-cell="template"
                    {...columnMarks(cell.leaf)}
                    {...cellPlace(cell.col, cell.fixed)}
                  >
                    {layout.loading ? (
                      SKELETON
                    ) : (
                      <div data-wb-part="pieces">{cell.origin ? cell.leaf.item.content : cell.leaf.item.copy(line.number).content}</div>
                    )}
                  </td>
                )
              case 'own': {
                const item = own.get(cell.item.nodeId) ?? cell.item
                return <Fragment key={cell.item.nodeId}>{cell.copy ? item.copy(line.number).element : item.element}</Fragment>
              }
              case 'blank':
                return (
                  <td
                    key={`wb-blank-${cell.col}`}
                    data-wb-part="cell"
                    data-wb-cell="blank"
                    {...columnMarks(cell.leaf)}
                    {...cellPlace(cell.col, cell.fixed)}
                  />
                )
            }
          })}
        </Root>
      ))}
    </>
  )
})

// 제 칸 — 덮는 열 수 · 줄 수는 배치에서(세로 칸은 표 끝 · 생략 띠 앞에서 끊긴 값), 그리드 밖이면 props 그대로.
export const GridCellView = view(({ nodeId, props, children }) => {
  const cell = useGridCell(nodeId)
  const layout = useGridLayout()
  return (
    <Root
      as="td"
      data-wb-part="cell"
      data-wb-cell="own"
      colSpan={cell?.colSpan ?? (props.span as number)}
      rowSpan={cell?.rowSpan ?? (props.rowSpan as number)}
      {...columnMarks(cell?.leaf ?? null)}
      {...(cell === null ? {} : cellPlace(cell.col, cell.fixed))}
    >
      {layout?.loading === true ? SKELETON : <div data-wb-part="pieces">{children}</div>}
    </Root>
  )
})

/**
 * 페이지네이션 바의 수(설계 Q3) — 쪽 수 = `max(1, ⌈총 건수 / 쪽 크기⌉)`, 지금 쪽은 쪽 수로 자른다(총 건수를 줄여 지금 쪽이 쪽 수를 넘으면 마지막
 * 쪽). 범위 글은 «처음 - 끝 (총 N 항목 중)» — 0 건이면 «0 - 0». 쪽 번호는 지금 쪽 둘레 아홉까지.
 */
export function paginationRange(props: Readonly<Record<string, unknown>>): {
  pages: number[]
  page: number
  pageCount: number
  from: number
  to: number
  total: number
} {
  const total = typeof props.total === 'number' && Number.isInteger(props.total) && props.total >= 0 ? props.total : 0
  const size = typeof props.pageSize === 'number' && Number.isInteger(props.pageSize) && props.pageSize >= 1 ? props.pageSize : 10
  const pageCount = Math.max(1, Math.ceil(total / size))
  const asked = typeof props.page === 'number' && Number.isInteger(props.page) && props.page >= 1 ? props.page : 1
  const page = Math.min(asked, pageCount)
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total)
  const first = Math.max(1, Math.min(page - 4, pageCount - 8))
  const last = Math.min(pageCount, first + 8)
  return { pages: Array.from({ length: last - first + 1 }, (_, index) => first + index), page, pageCount, from, to, total }
}

// 기본 구조 `default` — 행 수 셀렉트 · 쪽 번호 · 범위 글. 세 조각은 노드가 아니다.
export const PaginationView = view(({ props }) => {
  const { pages, page, from, to, total } = paginationRange(props)
  return (
    <Root as="nav" data-wb-structure="default" aria-label="쪽 넘김">
      {props.sizeSelect === true ? (
        <div data-wb-part="size">
          <span data-wb-part="sizeSelect">{String(props.pageSize)} ▼</span>
        </div>
      ) : null}
      <div data-wb-part="pages">
        <span data-wb-part="first">«</span>
        <span data-wb-part="prev">‹</span>
        {pages.map((number) => (
          <span key={number} data-wb-part="page" aria-current={number === page ? 'page' : undefined}>
            {number}
          </span>
        ))}
        <span data-wb-part="next">›</span>
        <span data-wb-part="last">»</span>
      </div>
      {props.range === true ? <div data-wb-part="range">{`${from} - ${to} (총 ${total} 항목 중)`}</div> : null}
    </Root>
  )
})

// 기본 구조 `indent`. 들여쓰기 **단계**만 나르고 폭은 CSS 가 `TREE_INDENT_VAR` 와 곱한다.
export const TreeView = view(({ props }) => {
  const items = props.items as string[]
  const depth = props.depth as number
  return (
    <Root as="ul" data-wb-structure="indent">
      {items.map((label, index) => (
        <li key={`${label}-${index}`} data-wb-part="node" style={{ [nodeVar('tree', 'level')]: String(index % depth) } as CSSProperties}>
          <span data-wb-part="toggle">▸</span>
          <span data-wb-part="label">{label}</span>
        </li>
      ))}
    </Root>
  )
})

// 기본 구조 `table`. 쌍을 `columns` 개씩 한 행에 놓는다(`이름 | 홍 | 나이 | 3`). 마지막 행이 모자라면 빈 칸 하나(`filler` 조각)가 나머지 폭을
// 채운다 — 칸 수가 행마다 같아야 격자선이 끊기지 않는다. `columns` 1 이면 쌍마다 한 행이다.
export const KeyValueView = view(({ props }) => {
  const pairs = props.pairs as { key: string; value: string }[]
  const columns = props.columns as number
  const rows: { key: string; value: string }[][] = []
  for (let start = 0; start < pairs.length; start += columns) rows.push(pairs.slice(start, start + columns))
  return (
    <Root as="table" data-wb-structure="table">
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} data-wb-part="row">
            {row.map((pair, index) => [
              <th key={`k-${pair.key}-${index}`} data-wb-part="key">
                {pair.key}
              </th>,
              <td key={`v-${pair.key}-${index}`} data-wb-part="value">
                {pair.value}
              </td>,
            ])}
            {row.length < columns ? <td data-wb-part="filler" colSpan={(columns - row.length) * 2} /> : null}
          </tr>
        ))}
      </tbody>
    </Root>
  )
})

export function dataCssBlocks(): string[] {
  return [
    partRule('Tree', 'node', [`padding-left: calc(var(${nodeVar('tree', 'level')}, 0) * var(${TREE_INDENT_VAR}, 16px));`], ['indent']),
    // ── 그리드 ──────────────────────────────────────────────────────────────
    // 뿌리는 줄어들 수 있어야 한다(가로 배치 안에서도 표 칸만 굴러간다) — 결과 머리줄 · 바닥은 스크롤 밖이라 창 폭을 따른다.
    zeroRule('[data-wb-component="DataGrid"]', ['min-width: 0;', 'max-width: 100%;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="head"]', ['display: flex;', 'align-items: center;', 'gap: 8px;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="head"] > *', ['display: flex;', 'align-items: center;', 'gap: 6px;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="head"] > [data-wb-part="headEnd"]', ['margin-inline-start: auto;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="scroll"]', ['overflow-x: auto;', 'max-width: 100%;']),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"]', ['width: 100%;', 'border-collapse: collapse;']),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > *', [
      'padding: 4px 8px;',
      'text-align: start;',
      'vertical-align: middle;',
    ]),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > [data-wb-align="center"]', ['text-align: center;']),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > [data-wb-align="end"]', ['text-align: end;']),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"] > thead > tr > *', ['vertical-align: bottom;']),
    // 칸 안 조각 — `Field` 값 칸처럼 가로로 줄 선다(`[OFF][홍길동]` · `[2][설정]`). 칸(`td`)에 `display` 를 걸면 표 칸이 아니게 되어 안쪽 조각에 건다.
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="pieces"]', [
      'display: flex;',
      'flex-wrap: wrap;',
      'align-items: center;',
      'gap: 6px;',
    ]),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-align="center"] > [data-wb-part="pieces"]', ['justify-content: center;']),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-align="end"] > [data-wb-part="pieces"]', ['justify-content: flex-end;']),
    // 선택 칸은 내용 폭(1px — 표가 남는 폭을 다른 열에 준다) · 체크 상자 · 라디오. 강조 행은 켠 모양, 흐린 행은 끈 모양이다.
    zeroRule('[data-wb-component="DataGrid"] [data-wb-cell="select"]', ['width: 1px;', 'text-align: center;']),
    zeroRule('[data-wb-component="DataGrid"] :is([data-wb-part="checkbox"], [data-wb-part="radio"])', [
      'display: inline-block;',
      'width: 12px;',
      'height: 12px;',
      'border: 1px solid currentColor;',
      'vertical-align: middle;',
    ]),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="radio"]', ['border-radius: 50%;']),
    zeroRule('[data-wb-component="GridRow"][data-wb-tone="selected"] :is([data-wb-part="checkbox"], [data-wb-part="radio"])', [
      'background: currentColor;',
    ]),
    zeroRule('[data-wb-component="GridRow"][data-wb-tone="dimmed"]', ['opacity: 0.5;']),
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="skeleton"]', [
      'display: inline-block;',
      'width: 60%;',
      'height: 0.6em;',
      'background: currentColor;',
      'opacity: 0.2;',
    ]),
    zeroRule('[data-wb-component="DataGrid"] :is([data-wb-part="empty"], [data-wb-part="gap"])', ['text-align: center;']),
    // 고정 열 — 스크롤 상자 기준으로 붙는다. 왼쪽 자리는 그리드 뷰의 이펙트가 앞 칸 폭의 합으로 싣고(`--wb-node-datagrid-left`), 바탕이 없으면
    // 뒤 칸 글이 비쳐 보여 캔버스 색을 깐다(테마가 제 바탕으로 덮는다).
    zeroRule('[data-wb-component="DataGrid"] [data-wb-fixed]', [
      'position: sticky;',
      `left: var(${DATAGRID_LEFT_VAR}, 0);`,
      'z-index: 1;',
      'background-color: Canvas;',
    ]),
    // ── 페이지네이션 ─────────────────────────────────────────────────────────
    zeroRule('[data-wb-component="Pagination"]', [
      'display: flex;',
      'align-items: center;',
      'justify-content: space-between;',
      'gap: 8px;',
    ]),
    zeroRule('[data-wb-component="Pagination"] > [data-wb-part="pages"]', [
      'display: flex;',
      'align-items: center;',
      'gap: 4px;',
      'margin-inline: auto;',
    ]),
    zeroRule('[data-wb-component="Pagination"] [aria-current="page"]', ['text-decoration: underline;', 'font-weight: bold;']),
    // 찍는 판(PPTX 의 화면 그림 — `<html data-wb-capture>`)은 스크롤 상자를 풀어 표 전체 폭으로 문서를 넓힌다(설계 Q2). 층 안의 `!important` 라
    // 테마가 층 밖에서 `!important` 로 덮어도 이 판이 이긴다(층 안 중요 선언이 층 밖 중요 선언을 이긴다).
    `@layer wb-capture {
${zeroRule('html[data-wb-capture] [data-wb-component="DataGrid"] > [data-wb-part="scroll"]', ['overflow: visible !important;', 'max-width: none !important;'])}
${zeroRule('html[data-wb-capture] [data-wb-component="DataGrid"]', ['max-width: none !important;'])}
${zeroRule('html[data-wb-capture] [data-wb-component="DataGrid"] [data-wb-fixed]', ['position: static !important;'])}
}`,
  ]
}
