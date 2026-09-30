import { Root, view } from '@wirebound/theme-sdk'

interface ListProps extends Record<string, unknown> {
  items: number
  columns: string[]
  pagination: boolean
  selectable: boolean
  loading: boolean
  empty: boolean
}

/**
 * 관리자 화면의 목록은 **표**다. SDK 기본 뷰(`table` 구조)의 DOM 에 기본 뷰가 안 읽는 props 셋을 그린다 — 기본 뷰로는 CSS 를 어떻게 입혀도
 * 이 셋이 화면에 안 선다:
 *
 * - `selectable` — 맨 앞에 체크 칸(`data-wb-cell="check"` 칸 안의 `checkbox` 조각).
 * - `empty` — 행 대신 «데이터가 없습니다» 한 줄(`empty` 조각).
 * - `loading` — 칸마다 `—` 대신 막대(`skeleton` 조각).
 *
 * 나머지 조각 이름 · 태그(`header` · `row` · `rowAlt` · `cell` · `pagination`)는 기본 뷰와 같다 — `theme.css` 의 규칙이 기본 뷰 판과 같은 자리에
 * 닿는다. 루트가 표 전체라 `Focus` · `marker` 를 두지 않는다(외곽선 · 번호 마커가 기본 뷰와 같은 자리 — 표의 왼쪽 위).
 */
export const ListView = view<ListProps>(({ props }) => {
  const { columns, items, selectable, loading, empty, pagination } = props
  const span = columns.length + (selectable ? 1 : 0)
  const check = selectable ? (
    <td data-wb-part="cell" data-wb-cell="check">
      <span data-wb-part="checkbox" />
    </td>
  ) : null
  return (
    <Root as="table" data-wb-structure="table">
      <thead data-wb-part="header">
        <tr>
          {selectable ? (
            <th data-wb-part="cell" data-wb-cell="check">
              <span data-wb-part="checkbox" />
            </th>
          ) : null}
          {columns.map((column, index) => (
            <th key={`${column}-${index}`} data-wb-part="cell">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empty ? (
          <tr data-wb-part="row">
            <td data-wb-part="empty" colSpan={span}>
              데이터가 없습니다
            </td>
          </tr>
        ) : (
          Array.from({ length: items }, (_, rowIndex) => (
            <tr key={rowIndex} data-wb-part={rowIndex % 2 === 1 ? 'rowAlt' : 'row'}>
              {check}
              {columns.map((column, columnIndex) => (
                <td key={`${column}-${columnIndex}`} data-wb-part="cell">
                  {loading ? <span data-wb-part="skeleton" /> : '—'}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {pagination ? (
        <tfoot>
          <tr>
            <td data-wb-part="pagination" colSpan={span}>
              1 2 3
            </td>
          </tr>
        </tfoot>
      ) : null}
    </Root>
  )
})
