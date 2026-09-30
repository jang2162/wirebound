import { Root, view } from '@wirebound/theme-sdk'

interface KeyValueProps extends Record<string, unknown> {
  pairs: { key: string; value: string }[]
  columns: number
}

/**
 * 관리자 화면의 상세는 **키 칸에 옅은 바탕을 깐 격자 표**이고 쌍을 `columns` 개씩 한 행에 놓는다(`이름 | 홍 | 나이 | 3`). SDK 기본 뷰는
 * 쌍마다 한 행이라 `columns` 를 안 읽는다 — CSS 는 열 수를 모르므로(기본 뷰가 값을 노드 변수로 나르지 않는다) 뷰로 행을 가른다.
 *
 * 조각 이름(`row` · `key` · `value`)과 태그(`th` · `td`)는 기본 뷰와 같다. 마지막 행이 모자라면 빈 칸 하나(`filler` 조각)가 나머지 폭을 채운다
 * — 칸 수가 행마다 같아야 격자선이 끊기지 않는다. 좁은 폭에서 쌍을 한 줄씩 쌓는 것은 `theme.css` 가 한다. 루트가 표 전체라 `Focus` ·
 * `marker` 를 두지 않는다.
 */
export const KeyValueView = view<KeyValueProps>(({ props }) => {
  const { pairs, columns } = props
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
