import type { CSSProperties } from 'react'
import { DEFAULT_VIEWS, nodeVar, Root, view } from '@wirebound/theme-sdk'

const TableKeyValue = DEFAULT_VIEWS['KeyValue']!

/**
 * **스펙을 속성 상자 격자로.** 소재 · 원산지 · 배송이 표의 행이 아니라 각자 상자를 갖는 것이 커머스의 상세 화면이다. 기본 뷰는
 * `<table>` 이라 행을 상자로 세울 수 없다.
 *
 * **열 수는 노드가 정한다** — `KeyValue.columns`(1 ~ 4)를 `--wb-node-keyvalue-columns` 로 싣고 `theme.css` 가 읽는다. 테마 CSS 는
 * 열 수를 상수로 적지 않는다(적으면 패널의 «열 수» 가 조용히 안 닿는다). `table` 은 기본 뷰 그대로다.
 */
export const KeyValueView = view((p) => {
  if (p.variant === 'table') return <TableKeyValue {...p} />
  const pairs = p.props.pairs as { key: string; value: string }[]
  return (
    <Root
      as="div"
      data-wb-structure="cardGrid"
      style={{ [nodeVar('keyvalue', 'columns')]: String(p.props.columns) } as CSSProperties}
    >
      {pairs.map((pair, index) => (
        <div key={`${pair.key}-${index}`} data-wb-part="row">
          <div data-wb-part="key">{pair.key}</div>
          <div data-wb-part="value">{pair.value}</div>
        </div>
      ))}
    </Root>
  )
})
