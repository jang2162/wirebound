import { Root, view } from '@wirebound/theme-sdk'
import { defaultView } from './default-view'

const TableList = defaultView('List')

/**
 * **문서 목록 · 색인(`default` · `compact`).** 줄마다 제목과 부가 정보 한 줄 — `<ul>/<li>` 가 «목록» 을 읽는 도구에 그대로 나른다.
 * 열을 읽지 않는다(`columns` 는 manifest 의 `hideProps` 로 패널에서 감춘다). `table` 은 기본 뷰의 표다.
 */
export const ListView = view((p) => {
  if (p.variant === 'table') return <TableList {...p} />
  const items = p.props.items as number
  return (
    <Root as="ul">
      {Array.from({ length: items }, (_, index) => (
        <li key={index} data-wb-part="item">
          <div data-wb-part="title">{`항목 ${index + 1}`}</div>
          <div data-wb-part="meta">—</div>
        </li>
      ))}
      {p.props.pagination === true ? <li data-wb-part="pagination">1 2 3</li> : null}
    </Root>
  )
})
