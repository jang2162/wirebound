/**
 * **데이터 그룹.** `List`·`Tree`·`KeyValue`.
 *
 * 카탈로그의 `component/catalog/data.ts`와 같은 경계다(P4b-2 D2). 등록(`DATA_ENTRIES`)과
 * 기본 CSS(`dataCssBlocks`)를 이 파일이 소유한다. 공용 도구는 `../structure-css-tools`에
 * 있다 — 복사해 오지 마라.
 */
import type { CSSProperties } from 'react'
import { TREE_INDENT_VAR, componentRule, nodeVar, partRule } from '../structure-css-tools'
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

/**
 * 카드 그리드. **`table`과 갈리는 지점은 조각의 어휘다** — 행·셀이 아니라 카드 하나
 * (`item`)가 단위이고 그 안이 `media`·`title`·`meta`로 나뉜다. §6.5의 `List:cardGrid`
 * 예시가 스타일을 거는 조각이 정확히 그 셋이다.
 *
 * **열 수는 이 구현체가 정하지 않는다** — 노드에 담을 자리가 없다. `List.columns`는
 * `visibleWhen:{structure:'table'}`인 **컬럼 이름 목록**이라 뜻도 다르고 패널에 보이지도
 * 않는다. 그래서 노드 변수를 만들지 않고, 트랙은 아래 `dataCssBlocks`의 기본값과
 * 테마의 `gridColumns`가 정한다(그 판정의 전문은 거기 있다).
 *
 * `pagination`은 `table`과 같은 조건으로 그린다. **구조마다 다른 prop을 무시하면 그것이
 * 곧 "조용히 틀린다"**이고(P4b-1이 `Media.kind`에서 겪은 부류), 이 prop에는 구조 조건이
 * 붙어 있지 않다.
 */
export const ListCardGrid: StructureRenderer = ({ attrs, props, part }) => {
  const items = props.items as number
  return (
    <div {...attrs}>
      {Array.from({ length: items }, (_, index) => (
        <div key={index} {...part('item')}>
          <div {...part('media')} />
          <div {...part('title')}>{`항목 ${index + 1}`}</div>
          <div {...part('meta')}>—</div>
        </div>
      ))}
      {props.pagination === true ? <div {...part('pagination')}>1 2 3</div> : null}
    </div>
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

  // ── List:cardGrid ─────────────────────────────────────────────────────────
  //
  // **재라 — 열 수를 무엇이 정하는가. 답: 테마다.**
  //
  // 셋 다 재 봤다.
  //
  // | 후보 | 왜 아닌가 |
  // |---|---|
  // | 노드 | 담을 자리가 없다. `List.columns`는 `string[]`(컬럼 **이름** 목록)이고 `visibleWhen:{structure:'table'}`이라 카드 그리드에서는 패널에 보이지도 않는다. 길이를 열 수로 쓰면 뜻이 다른 두 값을 한 prop에 겹치는 것이다 |
  // | 구조 기본 CSS | **트랙이 서 있게만 한다.** 안 주면 grid가 1열이 되어 `stackedList`와 구별되지 않는다 |
  // | 테마 | **정한다.** `gridColumns` 어휘가 `repeat(N, 1fr)`을 같은 특이도로 내고, 시트 순서가 뒤라서 이긴다 |
  //
  // 그래서 여기 값은 **2**다 — 그리드가 목록이 아니게 되는 최소값이고, 그보다 큰 수는
  // 취향이라 테마의 몫이다. **`var()`를 쓰지 않는 것이 요점이다**: 읽을 노드 변수를
  // 만들어 두고 아무도 값을 안 실으면 죽은 손잡이가 하나 더 생긴다(`Media.kind` 부류).
  blocks.push(
    componentRule('List', 'cardGrid', ['display: grid;', 'grid-template-columns: repeat(2, 1fr);']),
  )

  // 페이지네이션은 카드가 아니다. 이 줄이 없으면 마지막 카드 옆 칸에 들어앉아 카드처럼
  // 읽힌다. **조각 규칙에는 구조를 넣을 수 없으므로**(넣으면 특이도 0,3,0이 되어 테마가
  // 진다 — `structure-css-tools`의 `partRule` 주석) `table`·`stackedList`·`mediaList`의
  // `pagination`도 이 선언을 받는다. 그쪽은 grid 컨테이너의 자식이 아니라 **무효로
  // 무시된다** — 값이 달라지는 것이 아니라 적용될 자리가 없다.
  blocks.push(partRule('List', 'pagination', ['grid-column: 1 / -1;']))

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
  ['List', 'cardGrid', ListCardGrid],
  ['Tree', 'indent', TreeIndent],
  ['KeyValue', 'table', KeyValueTable],
]
