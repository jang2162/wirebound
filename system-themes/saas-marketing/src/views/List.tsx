import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './fallback'

const TableList = defaultView('List')

/**
 * **카드 그리드(옛 구조 `cardGrid`)** — «같은 `List` 노드가 관리자 테마에서는 테이블로, 마케팅 테마에서는 카드 그리드로» 의 오른쪽
 * 절반. `table` variant 만 기본 뷰(표)로 그린다. 카드는 `columns` 를 안 그린다(manifest 의 `hideProps`).
 */
export const ListView = view((viewProps) => {
  if (viewProps.variant === 'table') return <TableList {...viewProps} />
  const items = viewProps.props.items as number
  return (
    <Root as="div" data-wb-structure="cardGrid">
      {Array.from({ length: items }, (_, index) => (
        <div key={index} data-wb-part="item">
          <div data-wb-part="media" />
          <div data-wb-part="title">{`항목 ${index + 1}`}</div>
          <div data-wb-part="meta">—</div>
        </div>
      ))}
      {viewProps.props.pagination === true ? <div data-wb-part="pagination">1 2 3</div> : null}
    </Root>
  )
})
