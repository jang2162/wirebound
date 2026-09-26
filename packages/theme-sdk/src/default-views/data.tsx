/** **데이터 그룹 기본 뷰.** `List`·`Tree`·`KeyValue`. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties } from 'react'
import { nodeVar, partRule, TREE_INDENT_VAR } from '../css-tools'
import { view } from '../define'
import { Root } from '../root'

// 기본 구조 `table`.
export const ListView = view(({ props }) => {
  const columns = props.columns as string[]
  const items = props.items as number
  return (
    <Root as="table" data-wb-structure="table">
      <thead data-wb-part="header">
        <tr>
          {columns.map((column, index) => (
            <th key={`${column}-${index}`} data-wb-part="cell">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: items }, (_, rowIndex) => (
          <tr key={rowIndex} data-wb-part={rowIndex % 2 === 1 ? 'rowAlt' : 'row'}>
            {columns.map((column, columnIndex) => (
              <td key={`${column}-${columnIndex}`} data-wb-part="cell">
                —
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {props.pagination === true ? (
        <tfoot>
          <tr>
            <td data-wb-part="pagination" colSpan={columns.length}>
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
        <li
          key={`${label}-${index}`}
          data-wb-part="node"
          style={{ [nodeVar('tree', 'level')]: String(index % depth) } as CSSProperties}
        >
          <span data-wb-part="toggle">▸</span>
          <span data-wb-part="label">{label}</span>
        </li>
      ))}
    </Root>
  )
})

// 기본 구조 `table`.
export const KeyValueView = view(({ props }) => {
  const pairs = props.pairs as { key: string; value: string }[]
  return (
    <Root as="table" data-wb-structure="table">
      <tbody>
        {pairs.map((pair, index) => (
          <tr key={`${pair.key}-${index}`} data-wb-part="row">
            <th data-wb-part="key">{pair.key}</th>
            <td data-wb-part="value">{pair.value}</td>
          </tr>
        ))}
      </tbody>
    </Root>
  )
})

export function dataCssBlocks(): string[] {
  return [
    partRule(
      'Tree',
      'node',
      [`padding-left: calc(var(${nodeVar('tree', 'level')}, 0) * var(${TREE_INDENT_VAR}, 16px));`],
      ['indent'],
    ),
  ]
}
