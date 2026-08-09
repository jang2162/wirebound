import type { CSSProperties } from 'react'
import { nodeVar } from '../structure-css'
import type { StructureRenderer } from './registry'

export const ListTable: StructureRenderer = ({ attrs, props, part }) => {
  const columns = props.columns as string[]
  const items = props.items as number
  return (
    <table {...attrs}>
      <thead {...part('header')}>
        <tr>
          {columns.map((column, index) => (
            <th key={`${column}-${index}`} {...part('cell')}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: items }, (_, rowIndex) => (
          <tr key={rowIndex} {...part(rowIndex % 2 === 1 ? 'rowAlt' : 'row')}>
            {columns.map((column, columnIndex) => (
              <td key={`${column}-${columnIndex}`} {...part('cell')}>
                —
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {props.pagination === true ? (
        <tfoot>
          <tr>
            <td {...part('pagination')} colSpan={columns.length}>
              1 2 3
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}

export const TreeIndent: StructureRenderer = ({ attrs, props, part }) => {
  const items = props.items as string[]
  const depth = props.depth as number
  return (
    <ul {...attrs}>
      {items.map((label, index) => (
        // 들여쓰기 **단계**만 나른다. 픽셀을 곱하는 것은 `structure-css.ts`이고, 그 곱셈의
        // 다른 인자(`--wb-tree-indent`)가 테마의 손잡이가 될 자리다 — 오늘 그 손잡이에
        // 값을 넣는 경로가 없다는 것은 `structure-css.ts`의 주석에 적었다.
        <li
          key={`${label}-${index}`}
          {...part('node')}
          style={{ [nodeVar('tree', 'level')]: String(index % depth) } as CSSProperties}
        >
          <span {...part('toggle')}>▸</span>
          <span {...part('label')}>{label}</span>
        </li>
      ))}
    </ul>
  )
}

export const KeyValueTable: StructureRenderer = ({ attrs, props, part }) => {
  const pairs = props.pairs as { key: string; value: string }[]
  return (
    <table {...attrs}>
      <tbody>
        {pairs.map((pair, index) => (
          <tr key={`${pair.key}-${index}`} {...part('row')}>
            <th {...part('key')}>{pair.key}</th>
            <td {...part('value')}>{pair.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
