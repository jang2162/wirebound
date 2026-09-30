import { nodeVar, Root, view } from '@wirebound/theme-sdk'
import type { CSSProperties } from 'react'
import { defaultView } from './fallback'

const TableKeyValue = defaultView('KeyValue')

/**
 * **지표 타일(옛 구조 `cardGrid`)** — 랜딩 페이지의 키-값은 스펙 표가 아니라 `99.9%` / `가동률` 같은 큰 수라 격자에 놓는다. 열 수는
 * 문서의 것이다 — 노드의 `columns` 를 변수로 나르고 `theme.css` 가 그 변수로 트랙을 짠다(테마가 열 수를 적으면 노드 값이 무시된다).
 * `style` 에는 커스텀 프로퍼티만 둔다 — inline 일반 선언은 테마 CSS 를 이긴다.
 */
export const KeyValueView = view((viewProps) => {
  if (viewProps.variant === 'table') return <TableKeyValue {...viewProps} />
  const pairs = viewProps.props.pairs as { key: string; value: string }[]
  return (
    <Root
      as="div"
      data-wb-structure="cardGrid"
      style={{ [nodeVar('keyvalue', 'columns')]: String(viewProps.props.columns) } as CSSProperties}
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
