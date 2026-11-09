/** **데이터 그룹 기본 뷰.** `DataGrid` 와 그 부품(열 묶음 · 열 · 행 · 칸) · `Pagination` · `Tree` · `KeyValue`. 옮긴 규칙은 `./index.ts` 머리말. */
import { Fragment, useLayoutEffect, useRef, type CSSProperties, type ReactElement, type RefObject } from 'react'
import { nodeVar, partRule, TREE_INDENT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { GridProvider, useGridCell, useGridHead, useGridLayout, useGridRow } from '../grid-context'
import { gridLayout } from '../grid-layout'
import { Root } from '../root'
import { Zone } from '../zone'

// 배치의 타입 — 값에서 이끌어 쓴다(스타터 템플릿은 이 파일을 옮기며 SDK 의 값 이름만 import 한다 — `@wirebound/theme-kit` 의 `templateView`).
type GridLayout = ReturnType<typeof gridLayout>
type GridLeaf = GridLayout['leaves'][number]
type GridFixed = GridLayout['head'][number][number]['fixed']
type GridSelect = GridLayout['select']

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

/**
 * 열의 칸(셀 틀 · 번호)이 어느 열 노드의 것인지 — 칸의 빈 자리를 누르면 에디터가 그 열을 고른다(`apps/web/src/canvas/canvas.tsx` 의 `nodeIdAt`).
 * `data-wb-copy-of` 가 아닌 까닭: 칸은 열의 사본이 아니라 열의 몸 칸이다 — 사본으로 읽으면 한 줄을 덮는 범위 선택이 열을 고른다.
 */
function columnOf(leaf: GridLeaf): { 'data-wb-column-of': string } {
  return { 'data-wb-column-of': leaf.item.nodeId }
}

/** 몸 칸이 그 열에서 물려받는 표지 — 칸 정렬 · 음영(열 머리의 같은 이름 표지와 같은 값). 열이 없는 칸(선택 칸)은 없다. */
function columnMarks(leaf: GridLeaf | null): Record<string, string> {
  if (leaf === null || leaf.group) return {}
  return { 'data-wb-align': String(leaf.item.props.align ?? 'start'), 'data-wb-tone': String(leaf.item.props.tone ?? 'default') }
}

/** 고정 구역이 스크롤 상자 폭의 이 몫을 넘으면 고정을 푼다 — 굴러가는 열이 상자의 1/4 에는 보인다. */
const FIXED_ROOM = 0.75

/** 고정을 푼 표에 이펙트가 다는 표지 — SDK 기본 CSS 가 그 표의 고정 칸을 붙이지 않는다(테마도 이 표지로 고정 꾸밈을 걷는다). */
const DATAGRID_FIXED_OFF_ATTR = 'data-wb-fixed-off'

/**
 * **고정 열의 왼쪽 자리를 잰다** — 고정 열이 둘 이상이면 앞 칸 폭의 합을 CSS 만으로 모른다. 그리기 뒤(레이아웃 이펙트 — 칠하기 전)마다, 표 · 스크롤
 * 상자 크기가 바뀔 때 · 글꼴이 실린 뒤 칸 자리(`data-wb-col`)마다 폭을 재어 고정 칸에 `--wb-node-datagrid-left` 를 싣는다. 폭은 상자 폭이라 붙어
 * 있는(`sticky`) 칸이 밀려 있어도 같다. 이 표의 줄만 본다 — 칸 안의 다른 그리드는 제 이펙트가 잰다.
 *
 * **고정 구역이 상자보다 넓으면 푼다** — 고정 열 폭의 합이 스크롤 상자 폭의 `FIXED_ROOM` 을 넘으면 표에 `data-wb-fixed-off` 를 단다. 안 풀면 굴릴
 * 때 고정 칸이 상자 끝 한 자리에 겹쳐 쌓이고 고정 아닌 열은 고정 칸 밑으로만 지나가 끝까지 굴려도 안 보였다(`docs/superpowers/plans/2026-10-25-rv-gr-report.md`
 * M1). 풀어도 칸 폭은 그대로라 다시 재도 같은 답이다(오가며 깜빡이지 않는다).
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
      let room = 0
      for (let col = 0; col < fixed; col++) room += widths[col] ?? 0
      const box = element.parentElement?.clientWidth ?? 0
      element.toggleAttribute(DATAGRID_FIXED_OFF_ATTR, box > 0 && room > box * FIXED_ROOM)
    }
    measure()
    const view = element.ownerDocument.defaultView
    const Observer = view?.ResizeObserver
    const observer = Observer === undefined ? null : new Observer(() => measure())
    observer?.observe(element)
    if (element.parentElement !== null) observer?.observe(element.parentElement)
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
                    {...columnOf(cell.leaf)}
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
                    {...columnOf(cell.leaf)}
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

/** 쪽 번호의 자리 수 — 번호와 «…» 를 함께 센다(설계 «5» 의 `« ‹ 1 2 … 9 › »`). */
const PAGE_SLOTS = 9

/**
 * 페이지네이션 바의 수(설계 Q3) — 쪽 수 = `max(1, ⌈총 건수 / 쪽 크기⌉)`, 지금 쪽은 쪽 수로 자른다(총 건수를 줄여 지금 쪽이 쪽 수를 넘으면 마지막
 * 쪽). 범위 글은 «처음 - 끝 (총 N 항목 중)» — 0 건이면 «0 - 0».
 *
 * **쪽 번호는 자리 아홉이다** — 쪽 수가 아홉 이하면 다 서고, 넘으면 첫 쪽 · 끝 쪽이 늘 서고 지금 쪽 둘레(앞뒤 둘)와의 사이가 «…» 다(앞 다섯 쪽 ·
 * 끝 다섯 쪽 안이면 그쪽 일곱을 잇는다 — 자리 수가 늘 같다). `pages` 는 보이는 번호만 차례로 싣는다 — 이웃 번호가 1 보다 벌어진 자리가 «…» 다.
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
  const run = (start: number, end: number): number[] => Array.from({ length: end - start + 1 }, (_, index) => start + index)
  const edge = PAGE_SLOTS - 2
  let pages: number[]
  if (pageCount <= PAGE_SLOTS) pages = run(1, pageCount)
  else if (page <= edge - 2) pages = [...run(1, edge), pageCount]
  else if (page >= pageCount - (edge - 3)) pages = [1, ...run(pageCount - edge + 1, pageCount)]
  else pages = [1, ...run(page - 2, page + 2), pageCount]
  return { pages, page, pageCount, from, to, total }
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
        {pages.map((number, index) => (
          <Fragment key={number}>
            {index > 0 && number - pages[index - 1]! > 1 ? <span data-wb-part="ellipsis">…</span> : null}
            <span data-wb-part="page" aria-current={number === page ? 'page' : undefined}>
              {number}
            </span>
          </Fragment>
        ))}
        <span data-wb-part="next">›</span>
        <span data-wb-part="last">»</span>
      </div>
      {props.range === true ? <div data-wb-part="range">{`${from} - ${to} (총 ${total} 항목 중)`}</div> : null}
    </Root>
  )
})

/** 트리 항목 — 카탈로그의 `TreeItemSchema` 꼴(`@wirebound/schema`). 뷰는 검증을 지난 props 를 받는다 — 스타터 템플릿이 이 파일을 옮겨 SDK 밖 이름을 못 읽어 꼴을 여기 둔다. */
interface TreeEntry {
  label: string
  open?: boolean
  children?: TreeEntry[]
}

/**
 * 항목 목록 한 단 — 항목마다 줄(`row` — 펼침 표지 · 이름)과, 펼친 항목이면 그 밑에 자식 목록(`children` 조각 — 같은 꼴의 `ul`). 자식이 있는 항목만
 * 표지(▾ 펼침 · ▸ 접힘)와 `data-wb-open` 을 갖고, 자식이 없는 항목의 표지 자리는 빈 칸이다(이름이 단마다 같은 눈금에 선다). 접힌 항목의 자식은 안
 * 그린다.
 */
function TreeEntries({ items, path }: { items: readonly TreeEntry[]; path: string }): ReactElement {
  return (
    <>
      {items.map((item, index) => {
        const key = `${path}${index}`
        const children = item.children ?? []
        const parent = children.length > 0
        const open = parent && item.open === true
        return (
          <li key={key} data-wb-part="node" {...(parent ? { 'data-wb-open': String(open) } : {})}>
            <div data-wb-part="row">
              <span data-wb-part="toggle" aria-hidden="true">
                {parent ? (open ? '▾' : '▸') : null}
              </span>
              <span data-wb-part="label">{item.label}</span>
            </div>
            {open ? (
              <ul data-wb-part="children">
                <TreeEntries items={children} path={`${key}.`} />
              </ul>
            ) : null}
          </li>
        )
      })}
    </>
  )
}

// 기본 구조 `indent`. 단은 목록의 중첩이고 들여쓰기 폭은 CSS 가 자식 목록(`children` 조각)에 `TREE_INDENT_VAR` 로 건다.
export const TreeView = view(({ props }) => (
  <Root as="ul" data-wb-structure="indent">
    <TreeEntries items={props.items as TreeEntry[]} path="" />
  </Root>
))

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
    // 자식 목록이 한 단(`--wb-tree-indent`) 들여 선다 — 중첩 `ul` 의 UA 기본(원 표지 · 40px 여백)을 걷는다. 안 걷으면 단 폭이 테마 토큰이 아니라 40px 다.
    partRule('Tree', 'children', ['list-style: none;', 'margin: 0;', `padding: 0 0 0 var(${TREE_INDENT_VAR}, 16px);`], ['indent']),
    // 펼침 표지 칸은 자식이 없는 항목에서도 같은 폭이다 — 이름이 단마다 같은 눈금에 선다.
    zeroRule('[data-wb-component="Tree"] [data-wb-part="toggle"]', ['display: inline-block;', 'min-width: 1em;']),
    // ── 그리드 ──────────────────────────────────────────────────────────────
    // 뿌리는 줄어들 수 있어야 한다(가로 배치 안에서도 표 칸만 굴러간다) — 결과 머리줄 · 바닥은 스크롤 밖이라 창 폭을 따른다.
    zeroRule('[data-wb-component="DataGrid"]', ['min-width: 0;', 'max-width: 100%;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="head"]', ['display: flex;', 'align-items: center;', 'gap: 8px;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="head"] > *', ['display: flex;', 'align-items: center;', 'gap: 6px;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="head"] > [data-wb-part="headEnd"]', ['margin-inline-start: auto;']),
    zeroRule('[data-wb-component="DataGrid"] > [data-wb-part="scroll"]', ['overflow-x: auto;', 'max-width: 100%;']),
    // 표는 칸 글 폭이다(줄을 안 바꾼 폭 · 상자보다 좁으면 상자 폭) — 열이 글 폭을 지키고 넘치면 표 칸이 굴러간다. `width: 100%` 면 열이 칸의 최소
    // 폭까지 눌려 «2026-07-04» 가 붙임표 뒤에서 꺾였다(Chrome 은 `-` 뒤를 끊을 자리로 본다). 열 폭(`size`)을 정한 열은 그 폭에서 낱말 단위로 꺾인다.
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"]', [
      'width: max-content;',
      'min-width: 100%;',
      'border-collapse: collapse;',
    ]),
    // 칸 글은 낱말 가운데서 안 꺾는다 — 한글도 낱말(공백) 단위다. 그리드 뿌리의 `overflow-wrap: anywhere`(머리줄의 긴 낱말)가 물려 내려오면 칸의
    // 최소 폭이 한 글자라 열 폭을 정한 열 · 상자보다 넓은 표에서 «2026-07-04» 가 열 줄로 섰다. 찍는 판은 표 폭 그대로 펼쳐 찍는다(`CAPTURE_CSS`).
    // 끊을 자리 없는 아주 긴 낱말은 그 열을 넓힌다(칸 밖으로 안 나간다).
    zeroRule('[data-wb-component="DataGrid"] [data-wb-part="table"] > * > tr > *', [
      'padding: 4px 8px;',
      'text-align: start;',
      'vertical-align: middle;',
      'overflow-wrap: normal;',
      'word-break: keep-all;',
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
    // 한 줄 조각(입력 · 셀렉트 · 날짜 · 시간 · 단추)은 칸 안에서 글을 안 꺾는다 — 표의 열 폭은 칸의 최소 폭으로 줄어드는데, 그리드 뿌리의 `overflow-wrap:
    // anywhere`(긴 낱말)가 물려 내려와 그 최소 폭이 한 글자가 되어 «선택» 이 두 줄로 섰다(390 폭 · `wb-theme shots` 의 `wrapped`). 그 열이 넓어지고 표가
    // 스크롤 상자 안에서 굴러간다.
    zeroRule(
      '[data-wb-component="DataGrid"] [data-wb-part="pieces"] > :is([data-wb-component="Input"], [data-wb-component="Select"], [data-wb-component="DateInput"], [data-wb-component="TimeInput"], [data-wb-component="Button"])',
      ['white-space: nowrap;', 'overflow-wrap: normal;'],
    ),
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
    // 고정 구역이 스크롤 상자보다 넓은 표는 고정을 푼다(`useFixedColumns` 의 `data-wb-fixed-off`) — 칸은 표와 함께 굴러간다.
    zeroRule(`[data-wb-component="DataGrid"] [data-wb-part="table"][${DATAGRID_FIXED_OFF_ATTR}] [data-wb-fixed]`, ['position: static;']),
    // ── 페이지네이션 ─────────────────────────────────────────────────────────
    // 바는 창이 아니라 제 폭에 맞춰 접힌다 — 세 조각이 한 줄에 안 들면 줄을 바꾸고, 쪽 번호 조각도 제 안에서 줄을 바꾼다. 좁은 칸(격자 배치 2열 ·
    // 폼 표 값 칸 · 카드) 안의 바가 칸 · 문서 밖으로 나갔다(창 media 는 칸 폭을 모른다 — `docs/superpowers/plans/2026-10-25-rv-gr-report.md` M3).
    zeroRule('[data-wb-component="Pagination"]', [
      'display: flex;',
      'flex-wrap: wrap;',
      'align-items: center;',
      'justify-content: space-between;',
      'gap: 8px;',
    ]),
    zeroRule('[data-wb-component="Pagination"] > [data-wb-part="pages"]', [
      'display: flex;',
      'flex-wrap: wrap;',
      'justify-content: center;',
      'align-items: center;',
      'gap: 4px;',
      'min-width: 0;',
      'margin-inline: auto;',
    ]),
    zeroRule('[data-wb-component="Pagination"] [aria-current="page"]', ['text-decoration: underline;', 'font-weight: bold;']),
  ]
}
