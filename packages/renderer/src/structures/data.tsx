/**
 * **데이터 그룹.** `List`·`Tree`·`KeyValue`.
 *
 * 카탈로그의 `component/catalog/data.ts`와 같은 경계다(P4b-2 D2). 등록(`DATA_ENTRIES`)과
 * 기본 CSS(`dataCssBlocks`)를 이 파일이 소유한다. 공용 도구는 `../structure-css-tools`에
 * 있다 — 복사해 오지 마라.
 */
import type { CSSProperties } from 'react'
import { TREE_INDENT_VAR, nodeVar, partRule } from '../structure-css-tools'
import type { StructureEntry, StructureRenderer } from './registry'

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

/**
 * 이 그룹의 구조가 서기 위한 최소 CSS. 규칙을 더하면 여기에 `blocks.push(…)`를 더한다.
 * 셀렉터를 손으로 쓰지 마라 — `componentRule`·`partRule`만 쓴다.
 */
export function dataCssBlocks(): string[] {
  const blocks: string[] = []

  // ── Tree ──────────────────────────────────────────────────────────────────
  //
  // 노드가 아니라 **조각**에 붙는 유일한 자리다. `(index % depth)` 단계를 `<li>`가 나르고
  // 폭을 여기서 곱한다. 곱셈이 CSS에 있는 것은 §6.8이 금지한 `calc()`와 무관하다 —
  // 그 금지는 **테마 문서의 값**에 걸리고, 이 파일은 렌더러가 소유한 CSS다.
  blocks.push(
    partRule('Tree', 'node', [
      `padding-left: calc(var(${nodeVar('tree', 'level')}, 0) * var(${TREE_INDENT_VAR}, 16px));`,
    ]),
  )

  return blocks
}

/**
 * 이 그룹이 등록하는 구조. 구조를 더하면 여기에 한 줄을 더한다.
 *
 * **파일 끝에 둔다** — 배열 리터럴이 위의 `const`들을 모듈 평가 시점에 읽으므로,
 * 앞에 두면 TDZ에 걸려 `ReferenceError`가 난다.
 */
export const DATA_ENTRIES: StructureEntry[] = [
  ['List', 'table', ListTable],
  ['Tree', 'indent', TreeIndent],
  ['KeyValue', 'table', KeyValueTable],
]
