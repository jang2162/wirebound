/** **데이터 그룹 기본 뷰.** `List`·`Tree`·`KeyValue`. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties } from 'react'
import { nodeVar, partRule, TREE_INDENT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { Root } from '../root'
import { Zone } from '../zone'

// 기본 구조 `table`. 상태 · 표지가 DOM 을 바꾸는 셋:
// - `selectable` — 머리와 행마다 맨 앞에 체크 칸(`data-wb-cell="check"` 칸 안의 `checkbox` 조각).
// - `empty` — 행 대신 «데이터가 없습니다» 한 줄(`empty` 조각)이 모든 칸을 덮는다.
// - `loading` — 칸마다 `—` 대신 막대(`skeleton` 조각).
export const ListView = view(({ props, zones }) => {
  const columns = props.columns as string[]
  const items = props.items as number
  const selectable = props.selectable === true
  const span = columns.length + (selectable ? 1 : 0)
  const check = selectable ? (
    <td data-wb-part="cell" data-wb-cell="check">
      <span data-wb-part="checkbox" />
    </td>
  ) : null
  // 결과 머리줄(«총 N건» · 엑셀 다운로드)은 표에 붙는 `caption` 이다 — 뿌리가 `table` 이라 표 밖에 둘 수 없다. 두 구역이 다 비면 줄째 없다.
  const head = zones.headStart != null || zones.headEnd != null
  return (
    <Root as="table" data-wb-structure="table">
      {head ? (
        <caption data-wb-part="head">
          <div data-wb-part="headRow">
            <Zone name="headStart" data-wb-part="headStart" />
            <Zone name="headEnd" data-wb-part="headEnd" />
          </div>
        </caption>
      ) : null}
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
        {props.empty === true ? (
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
                  {props.loading === true ? <span data-wb-part="skeleton" /> : '—'}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {props.pagination === true ? (
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
    // 체크 칸 · 막대 · 빈 줄의 최소 모양 — 빈 `span` 은 크기가 없어 테마가 없으면 안 보인다.
    zeroRule('[data-wb-component="List"] [data-wb-part="checkbox"]', [
      'display: inline-block;',
      'width: 12px;',
      'height: 12px;',
      'border: 1px solid currentColor;',
      'vertical-align: middle;',
    ]),
    zeroRule('[data-wb-component="List"] [data-wb-part="skeleton"]', [
      'display: inline-block;',
      'width: 60%;',
      'height: 0.6em;',
      'background: currentColor;',
      'opacity: 0.2;',
    ]),
    zeroRule('[data-wb-component="List"] [data-wb-part="empty"]', ['text-align: center;']),
    // 결과 머리줄 — 머리 왼쪽은 왼쪽, 머리 오른쪽은 오른끝.
    // `caption` 은 표 상자 그대로 두고 안쪽 줄을 flex 로 편다(`caption` 에 `display` 를 걸면 표 머리 상자가 아니게 된다).
    zeroRule('[data-wb-component="List"] > [data-wb-part="head"]', ['caption-side: top;', 'text-align: start;']),
    zeroRule('[data-wb-component="List"] [data-wb-part="headRow"]', ['display: flex;', 'align-items: center;', 'gap: 8px;']),
    zeroRule('[data-wb-component="List"] [data-wb-part="headRow"] > *', ['display: flex;', 'align-items: center;', 'gap: 6px;']),
    zeroRule('[data-wb-component="List"] [data-wb-part="headRow"] > [data-wb-part="headEnd"]', ['margin-inline-start: auto;']),
  ]
}
